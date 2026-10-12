// Lecture et enrichissement des données Grist. Rien ici ne touche le DOM ; seule
// loadDirectory() lit Grist, via le `docApi` qu'on lui passe (voir tests/).

import { CATEGORIES, CONSENT_COLUMN, LIST_CATEGORIES, MAIN_TABLE, REFERENCE_SOURCES, REFERENCE_TABLES } from './constants.js';

export function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

// Adresse e-mail comparée sans casse ni espaces autour : « Ana.Martin@CHU.fr » et
// « ana.martin@chu.fr » désignent la même personne.
export function normalizeEmail(value) {
  return text(value).toLowerCase();
}

// Comparaison insensible à la casse et aux accents : une compétence saisie à la
// main (« oncologie ») doit retrouver l'option « Oncologie » du menu.
export function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR');
}

// Tri alphabétique français (« chu » avant « UBM ») ; .sort() seul trie par code
// UTF-16, majuscules d'abord.
export function compareLabels(a, b) {
  return text(a).localeCompare(text(b), 'fr-FR');
}

// Remonte les valeurs cochées en tête. `sortedValues` doit déjà être trié :
// chaque groupe garde cet ordre.
export function sortWithCheckedFirst(sortedValues, selected) {
  const checked = sortedValues.filter(value => selected.has(value));
  const unchecked = sortedValues.filter(value => !selected.has(value));
  return [...checked, ...unchecked];
}

// Cellule Grist non renseignée : vide, ou 0 (valeur d'une Référence sans cible
// et d'un Numeric vide).
function isBlank(value) {
  return value === null || value === undefined || value === '' || value === 0;
}

// numero_de_telephone est Numeric dans Grist, qui perd le 0 initial (556789012).
// On le rétablit ; un format inattendu est renvoyé tel quel plutôt que déformé.
export function formatPhone(value) {
  if (isBlank(value)) return '';
  const raw = text(value);
  const digits = raw.replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `0${digits}`.match(/.{1,2}/g).join(' ');
  if (/^0\d{9}$/.test(digits)) return digits.match(/.{1,2}/g).join(' ');
  return raw;
}

// Grist encode une liste ['L', item1, item2, ...] : une liste vide vaut ['L']
// (longueur 1). Il faut retirer le marqueur pour savoir si elle contient quelque chose.
export function safeValues(value) {
  if (Array.isArray(value)) return value.filter(item => item !== 'L' && !isBlank(item));
  return isBlank(value) ? [] : [value];
}

// Table Grist en colonnes ({ id: [...], nom: [...] }) → tableau de lignes.
export function tableToRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table;

  const ids = Array.isArray(table.id) ? table.id : [];
  return ids.map((id, index) => {
    const row = { id };
    Object.keys(table).forEach(key => {
      if (key !== 'id' && Array.isArray(table[key])) {
        row[key] = table[key][index] ?? null;
      }
    });
    return row;
  });
}

// Première valeur non vide parmi plusieurs colonnes candidates, dans l'ordre.
export function pickLabel(row, fields) {
  return fields.map(field => text(row[field])).find(Boolean) || '';
}

// Une Référence simple arrive sous 3 formes selon la « visible column » de la
// table liée : texte déjà résolu (« UBM », cas constaté sur Etablissements),
// ['R', table, id], ou id nu. refId() ne renvoie un id que pour les deux
// dernières : une chaîne est du texte déjà résolu (voir refLabel()).
export function refId(value) {
  if (Array.isArray(value)) {
    return value[0] === 'R' && value.length >= 3 ? value[2] : null;
  }
  if (typeof value === 'string') return null;
  return value || null;
}

// Libellé d'une Référence simple, quelle que soit sa forme.
export function refLabel(value, referenceMap) {
  if (typeof value === 'string') return text(value);
  const id = refId(value);
  return (id && referenceMap?.[String(id)]) || '';
}

// Vrai si la Référence ne pointe sur rien : ni id, ni texte déjà résolu.
export function isEmptyReference(value) {
  return !refId(value) && !(typeof value === 'string' && text(value));
}

// id → libellé d'une table de référence. `labelFields` : une colonne, ou
// plusieurs essayées dans l'ordre (acronyme, sinon nom complet). Les lignes sans
// libellé sont ignorées.
export function labelMapFromRows(rows, labelFields) {
  const fields = [].concat(labelFields);
  const map = {};
  rows.forEach(row => {
    if (row.id === null || row.id === undefined) return;
    const label = pickLabel(row, fields);
    if (label) map[String(row.id)] = label;
  });
  return map;
}

// Chaque lecture prend un numéro ; seule la plus récente peut appliquer son
// résultat, pour qu'une lecture lente n'écrase pas un affichage plus récent.
export function createRequestSequencer() {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: id => id === latest
  };
}

// Compare deux jeux de tables id → libellé par contenu : reconstruire les menus
// de filtres ferme ceux qui sont ouverts, donc seulement si un libellé a changé.
export function referenceMapsEqual(a, b) {
  const tablesA = Object.keys(a);
  const tablesB = Object.keys(b);
  if (tablesA.length !== tablesB.length) return false;
  return tablesA.every(table => {
    const mapA = a[table] || {};
    const mapB = b[table] || {};
    const idsA = Object.keys(mapA);
    const idsB = Object.keys(mapB);
    if (idsA.length !== idsB.length) return false;
    return idsA.every(id => mapA[id] === mapB[id]);
  });
}

// Un élément de ReferenceList arrive en id numérique ou déjà résolu en texte
// (« CME »), comme une Référence simple. Ne traiter que l'id fait disparaître
// les tags des cartes (CHANGELOG 1.5.1).
export function resolveListItem(item, referenceMap) {
  if (typeof item === 'string') return text(item);
  return referenceMap?.[String(item)] || '';
}

// Un libellé par valeur distincte, à la casse et aux accents près : le compte
// d'une option de menu compte les contacts, pas leurs lignes de table liées.
function uniqueLabels(labels) {
  const seen = new Set();
  return labels.filter(label => {
    const key = normalize(label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// libellé normalisé → identifiant de ligne (la plus petite en cas de doublon),
// calculé une fois par table de libellés plutôt qu'à chaque contact.
const rowIdsByLabel = new WeakMap();
function rowIdByLabel(detailMap, label) {
  if (!rowIdsByLabel.has(detailMap)) {
    const index = new Map();
    Object.entries(detailMap).forEach(([id, known]) => {
      const key = normalize(known);
      if (!index.has(key)) index.set(key, id);
    });
    rowIdsByLabel.set(detailMap, index);
  }
  return rowIdsByLabel.get(detailMap).get(normalize(label));
}

// Regroupement d'un élément de ReferenceList (par exemple le domaine d'une
// compétence). Un identifiant désigne une ligne ; un texte déjà résolu désigne
// la ligne par son libellé de détail, à retrouver dans `detailMap`.
function resolveGroupItem(item, groupMap, detailMap) {
  const id = typeof item === 'string' ? rowIdByLabel(detailMap || {}, item) : item;
  return (id && groupMap?.[String(id)]) || '';
}

// Libellés des catégories dont BDD porte une ReferenceList. Un id sans
// libellé est ignoré plutôt qu'affiché brut (« 47 » n'aide personne).
function listLabels(contact, referenceMaps) {
  return Object.fromEntries(LIST_CATEGORIES.map(({ key, column, groups }) => {
    const resolve = groups
      ? item => resolveGroupItem(item, referenceMaps[key], referenceMaps[groups])
      : item => resolveListItem(item, referenceMaps[key]);
    return [key, uniqueLabels(safeValues(contact[column]).map(resolve).filter(Boolean))];
  }));
}

// Ajoute à un contact `labels` (pour chaque catégorie, la liste de ses libellés) et
// les indicateurs de son établissement. `etabFlags` est optionnel : sans lui,
// aucun indicateur n'est vrai et le contact n'est pas éligible.
export function enrich(contact, referenceMaps, etabFlags) {
  // BDD.Etablissement est une Référence directe vers la ligne d'Etablissements
  // (jamais le nom de domaine de l'e-mail). refLabel() en gère les formes
  // possibles : identifiant de ligne, ['R', table, id] ou texte déjà résolu.
  const etablissement = refLabel(contact.Etablissement, referenceMaps.etablissement);
  const role = refLabel(contact.Role_dans_le_PUI, referenceMaps.role);
  const flags = etablissementFlags(contact, etabFlags);

  return {
    ...contact,
    // Établissement et Rôle n'ont qu'une valeur mais prennent la même forme de
    // liste que les autres catégories : filters.js et render.js n'ont ainsi pas
    // de cas particulier (le badge de la carte utilise `etablissement_label`).
    labels: {
      ...listLabels(contact, referenceMaps),
      etablissement: etablissement ? [etablissement] : [],
      role: role ? [role] : []
    },
    etablissement_label: etablissement,
    etablissement_fondateur: flags?.fondateur === true,
    etablissement_partenaire: flags?.partenaire === true,
    etablissement_ok_pour_apparaitre: flags?.ok_pour_apparaitre === true
  };
}

// Libellés d'un contact enrichi pour une catégorie (liste vide si aucun).
export function labelsOf(contact, key) {
  return contact.labels?.[key] ?? [];
}

// « Prénom Nom » tel que la carte l'affiche ; « Sans nom » quand les deux manquent.
export function displayName(contact) {
  return `${text(contact.prenom)} ${text(contact.nom)}`.trim() || 'Sans nom';
}

// Un contact n'est affiché que s'il a au moins une valeur dans perimetre
// (specs.md). Ne pas tester la longueur brute : une liste vide vaut ['L'].
export function isInScope(record) {
  return safeValues(record.perimetre).length > 0;
}

// ===== INDICATEURS D'UN ÉTABLISSEMENT =====
// Colonnes booléennes de la table Etablissements (specs.md) : fondateur,
// partenaire, autres (jamais affiché) et ok_pour_apparaitre (validation, verrou
// global). Indexées par id de ligne (byId) : c'est ainsi qu'un contact retrouve
// son établissement via BDD.Etablissement, et que le menu du filtre se restreint.
// byLabel (acronyme-sinon-nom-complet) ne sert que si Grist envoie la Référence
// déjà résolue en texte.
//
// Dans ce cas, deux lignes de même libellé et de statuts différents ne se
// départagent pas par leur ordre : on garde le plus strict (vrai seulement s'il
// l'est partout, donc contacts masqués dans le doute) et le libellé est listé
// dans `conflicts`.
const ETABLISSEMENT_LABEL_FIELDS = CATEGORIES.etablissement.field;

const FLAG_NAMES = ['fondateur', 'partenaire', 'ok_pour_apparaitre'];

function strictestFlags(a, b) {
  return Object.fromEntries(FLAG_NAMES.map(name => [name, a[name] && b[name]]));
}

export function etablissementFlagsFromRows(rows) {
  const byId = {};
  const byLabel = {};
  const conflicts = new Set();
  rows.forEach(row => {
    if (row.id === null || row.id === undefined) return;
    const flags = Object.fromEntries(FLAG_NAMES.map(name => [name, row[name] === true]));
    byId[String(row.id)] = flags;
    const label = pickLabel(row, ETABLISSEMENT_LABEL_FIELDS);
    if (!label) return;
    if (!Object.hasOwn(byLabel, label)) {
      byLabel[label] = flags;
      return;
    }
    if (FLAG_NAMES.some(name => byLabel[label][name] !== flags[name])) conflicts.add(label);
    byLabel[label] = strictestFlags(byLabel[label], flags);
  });
  return { byId, byLabel, conflicts: [...conflicts] };
}

// Indicateurs de l'établissement d'un contact, d'après BDD.Etablissement : par
// identifiant de ligne quand la Référence en donne un (cas normal avec
// fetchTable), par libellé quand Grist l'a déjà résolue en texte. null si elle
// est vide ou ne correspond à aucune ligne d'Etablissements.
export function etablissementFlags(contact, etabFlags) {
  const cell = contact?.Etablissement;
  const id = refId(cell);
  if (id) return etabFlags?.byId?.[String(id)] || null;
  const label = typeof cell === 'string' ? text(cell) : '';
  return (label && etabFlags?.byLabel?.[label]) || null;
}

// Éligible = établissement validé (ok_pour_apparaitre) ET fondateur ou
// partenaire, jamais « autres ». Un établissement inconnu n'a aucun indicateur :
// exclu plutôt qu'affiché sans validation.
export function isEtablissementEligible(contact) {
  return contact.etablissement_ok_pour_apparaitre === true &&
    (contact.etablissement_fondateur === true || contact.etablissement_partenaire === true);
}

// Options du menu Établissement : seulement les lignes ok_pour_apparaitre. Les
// libellés affichés sur les cartes viennent de referenceMaps, non restreint.
export function filterVisibleEstablishments(labelMap, etabFlags) {
  const result = {};
  Object.entries(labelMap || {}).forEach(([id, label]) => {
    if (etabFlags?.byId?.[id]?.ok_pour_apparaitre === true) result[id] = label;
  });
  return result;
}

// ===== LIEN MAILTO =====
// Une adresse saisie à la main peut contenir des paramètres (`?cc=...`) ou
// plusieurs destinataires : on ne fabrique le lien que pour une adresse simple,
// sinon le texte reste affiché sans lien.
const SAFE_EMAIL = /^[^\s@,;?#&%<>"]+@[^\s@,;?#&%<>"]+$/;

export function mailtoHref(email) {
  const address = text(email);
  return SAFE_EMAIL.test(address) ? `mailto:${address}` : '';
}

// ===== CHARGEMENT COMPLET DE L'ANNUAIRE =====

// Sans l'une de ces colonnes aucun contact n'est affichable : mieux vaut une
// erreur explicite qu'un annuaire vide. Accepte_apparaitre en fait partie : sans
// elle on ne sait pas qui a accepté d'apparaître, et afficher tout le monde dans
// le doute serait pire qu'afficher personne. Les autres colonnes de BDD
// (Fonction, email, numero_de_telephone, Role_dans_le_PUI…) sont facultatives :
// absentes, elles ne s'affichent simplement pas.
const REQUIRED_COLUMNS = ['nom', 'prenom', 'Etablissement', 'perimetre', CONSENT_COLUMN];

// Colonnes d'Etablissements dont dépend l'éligibilité des contacts (specs.md) :
// l'une d'elles renommée, et plus aucun contact ne s'affiche.
const REQUIRED_ETABLISSEMENT_COLUMNS = ['fondateur', 'partenaire', 'ok_pour_apparaitre'];

// Lecture impossible d'une donnée indispensable. `message` est une phrase
// française destinée au bandeau d'état.
export class DirectoryLoadError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'DirectoryLoadError';
  }
}

// Une personne n'apparaît que si elle l'a accepté (BDD.Accepte_apparaitre, une
// case à cocher) : seul `true` vaut accord. Vide, faux, 0 ou texte : pas d'accord.
export function hasAccepted(record) {
  return record[CONSENT_COLUMN] === true;
}

// `scopedRows` : lignes de BDD déjà filtrées par isInScope().
export function buildContacts(scopedRows, referenceMaps, etabFlags) {
  return scopedRows
    .filter(hasAccepted)
    .map(row => enrich(row, referenceMaps, etabFlags))
    .filter(contact => contact.nom || contact.prenom)
    .filter(isEtablissementEligible);
}

// Pourquoi une ligne de BDD apparaît dans l'annuaire, ou non : reprend, critère
// par critère, ceux de buildContacts() (un test vérifie que les deux concordent).
//   accepted, inScope, named   accord de la personne, périmètre, nom ou prénom
//   etablissement              'ok', ou ce qui l'empêche : 'missing' (aucun),
//                              'unknown' (absent d'Etablissements), 'not_validated'
//                              (ok_pour_apparaitre) ou 'not_eligible' (ni fondateur
//                              ni partenaire)
//   partnerOnly                affichée seulement avec l'interrupteur Partenaires
//   visible                    tous les critères sont réunis
export function describeVisibility(row, referenceMaps, etabFlags) {
  const contact = enrich(row, referenceMaps, etabFlags);
  const flags = etablissementFlags(row, etabFlags);
  const eligible = isEtablissementEligible(contact);
  let etablissement = 'ok';
  if (!eligible) {
    if (isEmptyReference(row.Etablissement)) etablissement = 'missing';
    else if (!flags) etablissement = 'unknown';
    else if (!flags.ok_pour_apparaitre) etablissement = 'not_validated';
    else etablissement = 'not_eligible';
  }
  const accepted = hasAccepted(row);
  const inScope = isInScope(row);
  const named = Boolean(contact.nom || contact.prenom);
  return {
    accepted,
    inScope,
    named,
    etablissement,
    partnerOnly: eligible && !contact.etablissement_fondateur,
    visible: accepted && inScope && named && eligible
  };
}

// Toutes les lignes de BDD, affichées ou non, retrouvables par adresse e-mail (la
// personne connectée) ou par identifiant de ligne (la fiche qu'on veut modifier) :
// c'est ce qui permet de dire à une personne pourquoi elle n'apparaît pas. Une
// adresse peut figurer sur plusieurs lignes ; findByEmail() les renvoie toutes.
// Deux index construits d'un seul passage : jamais de recherche linéaire par appel.
export function createPeopleIndex(rows, referenceMaps, etabFlags) {
  const byEmail = new Map();
  const byId = new Map();
  rows.forEach(row => {
    byId.set(row.id, row);
    const key = normalizeEmail(row.email);
    if (!key) return;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(row);
  });
  const entry = row => ({
    row,
    name: `${text(row.prenom)} ${text(row.nom)}`.trim(),
    etablissement: refLabel(row.Etablissement, referenceMaps.etablissement),
    status: describeVisibility(row, referenceMaps, etabFlags)
  });
  return {
    hasEmailColumn: rows.length === 0 || 'email' in rows[0],
    findByEmail(email) {
      const key = normalizeEmail(email);
      return (key ? byEmail.get(key) || [] : []).map(entry);
    },
    findById(id) {
      return byId.has(id) ? entry(byId.get(id)) : null;
    }
  };
}

// Quand la table contient des lignes mais qu'aucun contact n'est affichable,
// dit pourquoi (colonne vide, établissements non validés...) au lieu de laisser
// un « 0 contact » inexpliqué.
function describeEmptyDirectory(rowCount, scopedRows, contacts) {
  if (contacts.length > 0 || rowCount === 0) return null;
  if (scopedRows.length === 0) {
    return 'perimetre est vide pour tous les contacts : aucun ne peut s\'afficher. Vérifiez cette colonne dans Grist.';
  }
  if (scopedRows.every(row => isEmptyReference(row.Etablissement))) {
    return 'Etablissement est vide pour tous les contacts : aucun ne peut s\'afficher. Vérifiez cette colonne dans Grist.';
  }
  if (!scopedRows.some(hasAccepted)) {
    return 'Personne n\'a accepté d\'apparaître : Accepte_apparaitre n\'est coché pour aucun contact. '
      + 'Cochez cette colonne dans Grist pour les personnes qui doivent figurer dans l\'annuaire.';
  }
  return `Aucun contact affichable alors que la table ${MAIN_TABLE} contient des lignes : vérifiez les noms, Etablissement `
    + '(établissement validé, fondateur ou partenaire) et perimetre.';
}

// Lit toutes les tables en parallèle : { nom de table → résultat de Promise.allSettled }.
async function readAllTables(docApi) {
  const names = [MAIN_TABLE, ...REFERENCE_TABLES];
  // async : une erreur levée de façon synchrone par docApi devient un rejet.
  const settled = await Promise.allSettled(names.map(async name => docApi.fetchTable(name)));
  return Object.fromEntries(names.map((name, index) => [name, settled[index]]));
}

// Sans ces tables rien ne peut s'afficher : leur lecture ratée est une erreur.
function requireReadable(results, log) {
  [MAIN_TABLE, 'Etablissements'].forEach(name => {
    if (results[name].status === 'fulfilled') return;
    log.warn(`[REFS] Impossible de charger ${name}`, results[name].reason);
    throw new DirectoryLoadError(`table « ${name} » illisible`, results[name].reason);
  });
}

// Colonnes de `columns` qui manquent à la table (lue en lignes). Une table vide
// ne permet pas de les vérifier : rien n'est signalé.
function missingColumns(rows, columns) {
  return rows.length ? columns.filter(column => !(column in rows[0])) : [];
}

function requireColumns(table, columns, rows) {
  const missing = missingColumns(rows, columns);
  if (missing.length) {
    throw new DirectoryLoadError(`colonne « ${missing.join(' », « ')} » absente de la table ${table}`);
  }
}

// Libellés d'un regroupement (les compétences macro) pour chaque ligne de la
// catégorie qu'il regroupe, `detailMap` : une ligne que le regroupement ne couvre
// pas prend le libellé `fallback`, pour qu'aucun de ses contacts ne devienne
// introuvable. Deux écritures d'un même regroupement (casse, accents) n'en font
// qu'un, celle de la plus petite ligne.
export function groupLabelMap(groupMap, detailMap, fallback) {
  const spellings = new Map();
  const result = {};
  Object.keys(detailMap).forEach(id => {
    const label = text(groupMap[id]) || fallback;
    if (!label) return;
    const key = normalize(label);
    if (!spellings.has(key)) spellings.set(key, label);
    result[id] = spellings.get(key);
  });
  return result;
}

// Lit la colonne de libellé d'une catégorie : { map: id → libellé,
// labelColumnsMissing } (aucune colonne de libellé n'existe : le menu et les tags
// seraient vides en silence).
function readReferenceMap({ key, table, field }, result, log) {
  const rows = tableToRows(result.value);
  const labelFields = [].concat(field);
  const map = labelMapFromRows(rows, labelFields);
  const withoutLabel = rows.length - Object.keys(map).length;
  log.info(`[REFS] ${key} (${table}): ${Object.keys(map).length} entrées`
    + (withoutLabel ? ` (${withoutLabel} ligne(s) sans ${labelFields.join('/')})` : ''));
  const absent = missingColumns(rows, labelFields);
  if (absent.length) log.warn(`[REFS] ${table}: colonne(s) de libellé introuvable(s) : ${absent.join(', ')}`);
  return { map, labelColumnsMissing: absent.length === labelFields.length };
}

// Complète un regroupement avec le libellé de repli des lignes non classées ; la
// console dit lesquelles, pour les classer dans Grist.
function completeGroupMap({ key, table, groups, fallback }, referenceMaps, log) {
  const detailMap = referenceMaps[groups] || {};
  const groupMap = referenceMaps[key] || {};
  const unclassified = Object.keys(detailMap).filter(id => !text(groupMap[id]));
  if (unclassified.length) {
    log.info(`[REFS] ${table}: ${unclassified.length} ligne(s) sans regroupement pour ${key}, `
      + `classées sous « ${fallback} » (identifiants de ligne) :`, unclassified.slice(0, 20));
  }
  return groupLabelMap(groupMap, detailMap, fallback);
}

// Les libellés de chaque catégorie. Une table illisible garde les libellés
// précédents de ses catégories ; `unreadable` la signale, `unlabeled` les
// catégories dont aucune colonne de libellé n'existe.
function readReferenceMaps(results, previousMaps, log) {
  const unreadable = REFERENCE_TABLES.filter(table => results[table].status === 'rejected');
  unreadable.forEach(table => log.warn(`[REFS] Impossible de charger ${table}`, results[table].reason));

  const referenceMaps = {};
  const unlabeled = [];
  const withoutLabelColumn = new Set();
  REFERENCE_SOURCES.forEach(source => {
    const result = results[source.table];
    if (result.status === 'rejected') {
      referenceMaps[source.key] = previousMaps[source.key] ?? {};
      return;
    }
    const read = readReferenceMap(source, result, log);
    referenceMaps[source.key] = read.map;
    if (read.labelColumnsMissing) {
      unlabeled.push({ table: source.table, fields: [].concat(source.field) });
      withoutLabelColumn.add(source.key);
    }
  });
  // Les regroupements se complètent une fois toutes les maps lues. Sans colonne
  // de regroupement, rien n'est classé : un filtre vide vaut mieux qu'un filtre
  // où tout le monde est « Autres ».
  REFERENCE_SOURCES
    .filter(source => source.groups && !withoutLabelColumn.has(source.key))
    .forEach(source => { referenceMaps[source.key] = completeGroupMap(source, referenceMaps, log); });
  return { referenceMaps, unreadable, unlabeled };
}

// Les contacts sans Etablissement ne s'affichent pas. Seuls leurs identifiants
// de ligne sont journalisés : la console peut être partagée pendant une démo.
function warnAboutMissingEtablissement(scopedRows, log) {
  const ids = scopedRows.filter(row => isEmptyReference(row.Etablissement)).map(row => row.id);
  if (!ids.length) return;
  log.warn(`[ETABLISSEMENT] ${ids.length}/${scopedRows.length} contact(s) sans Etablissement `
    + 'renseigné (identifiants de ligne Grist) :', ids.slice(0, 20));
}

// Les personnes du périmètre qui n'ont pas accepté d'apparaître sont normales,
// pas une anomalie : la console en donne seulement le nombre (jamais leurs noms).
function logWithoutConsent(scopedRows, log) {
  const count = scopedRows.filter(row => !hasAccepted(row)).length;
  if (count) log.info(`[CONSENTEMENT] ${count}/${scopedRows.length} contact(s) du périmètre masqué(s) : Accepte_apparaitre n'est pas coché.`);
}

// Des acronymes en double ne masquent des contacts que lorsque Grist envoie
// l'établissement en texte : avec un identifiant de ligne, chaque contact garde
// le statut de sa propre ligne d'Etablissements.
function resolvedByLabel(scopedRows) {
  return scopedRows.some(row => typeof row.Etablissement === 'string' && text(row.Etablissement));
}

// Messages du bandeau d'état pour tout ce qui rend l'annuaire incomplet.
function directoryIssues({ unreadable, unlabeled, etabFlags, scopedRows, emptyReason }) {
  const issues = [];
  if (unreadable.length) {
    issues.push(`Tables illisibles (${unreadable.join(', ')}) : des libellés ou des tags peuvent manquer.`);
  }
  if (unlabeled.length) {
    const expected = unlabeled.map(({ table, fields }) => `${table} (${fields.join(' ou ')})`).join(', ');
    issues.push(`Colonne de libellé introuvable : ${expected}. Les tags et le filtre correspondants restent vides.`);
  }
  if (etabFlags.conflicts.length && resolvedByLabel(scopedRows)) {
    issues.push(`Acronymes en double dans Etablissements (${etabFlags.conflicts.join(', ')}) avec des statuts `
      + 'différents : leurs contacts sont masqués.');
  }
  if (emptyReason) issues.push(emptyReason);
  return issues;
}

// Lit BDD et toutes les tables de référence (chacune une seule fois) et
// renvoie { contacts, referenceMaps, etabFlags, people, issues } ; `people` est
// l'index des lignes de BDD par adresse e-mail (createPeopleIndex).
//
// BDD et Etablissements sont indispensables : leur lecture ratée lève une
// DirectoryLoadError (l'appelant garde l'affichage précédent). Une autre table
// illisible n'empêche pas l'affichage : on réutilise ses libellés précédents
// (`previousMaps`) et on le signale dans `issues`, messages français destinés
// au bandeau d'état.
export async function loadDirectory(docApi, { previousMaps = {}, log = console } = {}) {
  const results = await readAllTables(docApi);
  requireReadable(results, log);

  const rows = tableToRows(results[MAIN_TABLE].value);
  requireColumns(MAIN_TABLE, REQUIRED_COLUMNS, rows);
  const etablissementRows = tableToRows(results.Etablissements.value);
  requireColumns('Etablissements', REQUIRED_ETABLISSEMENT_COLUMNS, etablissementRows);

  const { referenceMaps, unreadable, unlabeled } = readReferenceMaps(results, previousMaps, log);
  const etabFlags = etablissementFlagsFromRows(etablissementRows);
  const scopedRows = rows.filter(isInScope);
  const contacts = buildContacts(scopedRows, referenceMaps, etabFlags);
  log.info(`[GRIST] Enregistrements reçus: ${rows.length} (contacts affichables : ${contacts.length})`);
  warnAboutMissingEtablissement(scopedRows, log);
  logWithoutConsent(scopedRows, log);

  const emptyReason = describeEmptyDirectory(rows.length, scopedRows, contacts);
  return {
    contacts,
    referenceMaps,
    etabFlags,
    people: createPeopleIndex(rows, referenceMaps, etabFlags),
    issues: directoryIssues({ unreadable, unlabeled, etabFlags, scopedRows, emptyReason })
  };
}
