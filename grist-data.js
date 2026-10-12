// Lecture et enrichissement des données Grist. Rien ici ne touche le DOM ; seule
// loadDirectory() lit Grist, via le `docApi` qu'on lui passe (voir tests/).

import { CATEGORIES, LIST_CATEGORIES, MAIN_TABLE, REFERENCE_TABLES } from './constants.js';

export function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
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

// Libellés des catégories dont BDD porte une ReferenceList. Un id sans
// libellé est ignoré plutôt qu'affiché brut (« 47 » n'aide personne).
function listLabels(contact, referenceMaps) {
  return Object.fromEntries(LIST_CATEGORIES.map(({ key, column, table }) => [
    key,
    safeValues(contact[column])
      .map(item => resolveListItem(item, referenceMaps[table]))
      .filter(Boolean)
  ]));
}

// Ajoute à un contact `labels` (pour chaque catégorie, la liste de ses libellés) et
// les indicateurs de son établissement. `etabFlags` est optionnel : sans lui,
// aucun indicateur n'est vrai et le contact n'est pas éligible.
export function enrich(contact, referenceMaps, etabFlags) {
  // BDD.Etablissement est une Référence directe vers la ligne d'Etablissements
  // (jamais le nom de domaine de l'e-mail). refLabel() en gère les formes
  // possibles : identifiant de ligne, ['R', table, id] ou texte déjà résolu.
  const etablissement = refLabel(contact.Etablissement, referenceMaps[CATEGORIES.etablissement.table]);
  const role = refLabel(contact.Role_dans_le_PUI, referenceMaps[CATEGORIES.role.table]);
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
// erreur explicite qu'un annuaire vide. Les autres colonnes de BDD (Fonction,
// email, numero_de_telephone, Role_dans_le_PUI…) sont facultatives : absentes,
// elles ne s'affichent simplement pas.
const REQUIRED_COLUMNS = ['nom', 'prenom', 'Etablissement', 'perimetre'];

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

// `scopedRows` : lignes de BDD déjà filtrées par isInScope().
export function buildContacts(scopedRows, referenceMaps, etabFlags) {
  return scopedRows
    .map(row => enrich(row, referenceMaps, etabFlags))
    .filter(contact => contact.nom || contact.prenom)
    .filter(isEtablissementEligible);
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
  return `Aucun contact affichable alors que la table ${MAIN_TABLE} contient des lignes : vérifiez les noms, Etablissement `
    + '(établissement validé, fondateur ou partenaire) et perimetre.';
}

// Lit toutes les tables en parallèle : { nom de table → résultat de Promise.allSettled }.
async function readAllTables(docApi) {
  const names = [MAIN_TABLE, ...REFERENCE_TABLES.map(([table]) => table)];
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

// Lit la table de référence d'une catégorie : { map: id → libellé, labelColumnsMissing }
// (aucune colonne de libellé n'existe : le menu et les tags seraient vides en
// silence), ou null si sa lecture a échoué.
function readReferenceMap(table, fields, result, log) {
  if (result.status === 'rejected') {
    log.warn(`[REFS] Impossible de charger ${table}`, result.reason);
    return null;
  }
  const rows = tableToRows(result.value);
  const labelFields = [].concat(fields);
  const map = labelMapFromRows(rows, labelFields);
  const withoutLabel = rows.length - Object.keys(map).length;
  log.info(`[REFS] ${table}: ${Object.keys(map).length} entrées`
    + (withoutLabel ? ` (${withoutLabel} ligne(s) sans ${labelFields.join('/')})` : ''));
  const absent = missingColumns(rows, labelFields);
  if (absent.length) log.warn(`[REFS] ${table}: colonne(s) de libellé introuvable(s) : ${absent.join(', ')}`);
  return { map, labelColumnsMissing: absent.length === labelFields.length };
}

// Une table illisible garde ses libellés précédents ; `unreadable` la signale,
// `unlabeled` celles dont aucune colonne de libellé n'existe.
function readReferenceMaps(results, previousMaps, log) {
  const referenceMaps = {};
  const unreadable = [];
  const unlabeled = [];
  REFERENCE_TABLES.forEach(([table, fields]) => {
    const read = readReferenceMap(table, fields, results[table], log);
    if (!read) unreadable.push(table);
    else if (read.labelColumnsMissing) unlabeled.push({ table, fields: [].concat(fields) });
    referenceMaps[table] = read?.map ?? previousMaps[table] ?? {};
  });
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
// renvoie { contacts, referenceMaps, etabFlags, issues }.
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

  const emptyReason = describeEmptyDirectory(rows.length, scopedRows, contacts);
  return {
    contacts,
    referenceMaps,
    etabFlags,
    issues: directoryIssues({ unreadable, unlabeled, etabFlags, scopedRows, emptyReason })
  };
}
