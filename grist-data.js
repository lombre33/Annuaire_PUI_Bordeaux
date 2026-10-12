// Lecture et enrichissement des données Grist. Rien ici ne touche le DOM ; seule
// loadDirectory() lit Grist, via le `docApi` qu'on lui passe (voir tests/).

import { CATEGORIES, LIST_CATEGORIES, REFERENCE_TABLES } from './constants.js';

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

// numero_de_telephone est Numeric dans Grist, qui perd le 0 initial (556789012).
// On le rétablit ; un format inattendu est renvoyé tel quel plutôt que déformé.
export function formatPhone(value) {
  if (value === null || value === undefined || value === '' || value === 0) return '';
  const raw = text(value);
  const digits = raw.replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `0${digits}`.match(/.{1,2}/g).join(' ');
  if (/^0\d{9}$/.test(digits)) return digits.match(/.{1,2}/g).join(' ');
  return raw;
}

// Grist encode une liste ['L', item1, item2, ...] : une liste vide vaut ['L']
// (longueur 1). Il faut retirer le marqueur pour savoir si elle contient quelque chose.
export function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '');
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

// Table Grist en colonnes ({ id: [...], Nom: [...] }) → tableau de lignes.
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

// Ajoute à un contact les libellés de ses catégories et les indicateurs de son
// établissement. `etabFlags` est optionnel : sans lui, aucun indicateur n'est
// vrai et le contact n'est pas éligible.
export function enrich(contact, referenceMaps, etabFlags) {
  const enriched = { ...contact };

  LIST_CATEGORIES.forEach(({ key, column, table }) => {
    // Un id sans libellé est ignoré plutôt qu'affiché brut (« 47 » n'aide personne).
    enriched[`${key}_labels`] = safeValues(contact[column])
      .map(id => resolveListItem(id, referenceMaps[table]))
      .filter(Boolean);
  });

  const competences = [];
  for (let i = 1; i <= 15; i++) {
    const value = text(contact[`competences_${i}`]);
    if (value) competences.push(value);
  }
  enriched.competences_labels = competences;

  // Etablissement2 (Text, formule Grist) est la seule source de l'établissement
  // d'un contact : une chaîne simple, sans l'ambiguïté des Références. Ne pas lui
  // substituer une colonne Référence, dont l'encodage varie.
  enriched.etablissement_label = text(contact.Etablissement2) || '';
  // Même forme tableau que les autres catégories, pour que filters.js n'ait pas
  // de cas particulier ; le badge de la carte utilise la forme singulière.
  enriched.etablissement_labels = enriched.etablissement_label ? [enriched.etablissement_label] : [];

  const flags = etablissementFlags(contact, etabFlags);
  enriched.etablissement_fondateur = flags?.fondateur === true;
  enriched.etablissement_partenaire = flags?.partenaire === true;
  enriched.etablissement_ok_pour_apparaitre = flags?.ok_pour_apparaitre === true;

  const roleLabel = refLabel(contact.Role_dans_le_PUI, referenceMaps[CATEGORIES.role.table]);
  // Tableau comme les autres groupes de tags : le rendu des cartes ne lit que
  // `${clé}_labels`, une valeur singulière ne serait lue nulle part.
  enriched.role_labels = roleLabel ? [roleLabel] : [];

  return enriched;
}

// Un contact n'est affiché que s'il a au moins une valeur dans perimetre_all
// (specs.md). Ne pas tester la longueur brute : une liste vide vaut ['L'].
export function isInScope(record) {
  return safeValues(record.perimetre_all).length > 0;
}

// ===== INDICATEURS D'UN ÉTABLISSEMENT =====
// Colonnes booléennes de la table Etablissements (specs.md) : fondateur,
// partenaire, autres (jamais affiché) et ok_pour_apparaitre (validation, verrou
// global). Indexées par id (menu du filtre) et par libellé acronyme-sinon-nom-
// complet, celui que porte Etablissement2 d'un contact.
//
// Deux lignes de même libellé et de statuts différents ne se départagent pas par
// leur ordre : on garde le plus strict (vrai seulement s'il l'est partout, donc
// contacts masqués dans le doute) et le libellé est listé dans `conflicts`.
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

// Indicateurs de l'établissement d'un contact, d'après Etablissement2 ; null si
// elle est vide ou ne correspond à aucune ligne d'Etablissements.
export function etablissementFlags(contact, etabFlags) {
  const label = text(contact?.Etablissement2);
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

// Sans l'une de ces colonnes aucun contact n'est éligible : mieux vaut une
// erreur explicite qu'un annuaire vide.
const REQUIRED_ANNUAIRE_COLUMNS = ['Etablissement2', 'perimetre_all'];

// Lecture impossible d'une donnée indispensable. `message` est une phrase
// française destinée au bandeau d'état.
export class DirectoryLoadError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'DirectoryLoadError';
  }
}

// `scopedRows` : lignes d'Annuaire déjà filtrées par isInScope().
export function buildContacts(scopedRows, referenceMaps, etabFlags) {
  return scopedRows
    .map(row => enrich(row, referenceMaps, etabFlags))
    .filter(contact => contact.Nom || contact.Prenom)
    .filter(isEtablissementEligible);
}

// Quand la table contient des lignes mais qu'aucun contact n'est affichable,
// dit pourquoi (colonne vide, établissements non validés...) au lieu de laisser
// un « 0 contact » inexpliqué.
function describeEmptyDirectory(rowCount, scopedRows, contacts) {
  if (contacts.length > 0 || rowCount === 0) return null;
  if (scopedRows.length === 0) {
    return 'perimetre_all est vide pour tous les contacts : aucun ne peut s\'afficher. Vérifiez cette colonne dans Grist.';
  }
  if (scopedRows.every(row => !text(row.Etablissement2))) {
    return 'Etablissement2 est vide pour tous les contacts : aucun ne peut s\'afficher. Vérifiez cette colonne formule dans Grist.';
  }
  return 'Aucun contact affichable alors que la table Annuaire contient des lignes : vérifiez les noms, Etablissement2 '
    + '(établissement validé, fondateur ou partenaire) et perimetre_all.';
}

function readTables(docApi, names) {
  // async : une erreur levée de façon synchrone par docApi devient un rejet.
  return Promise.allSettled(names.map(async name => docApi.fetchTable(name)));
}

// Lit Annuaire et toutes les tables de référence (chacune une seule fois) et
// renvoie { contacts, referenceMaps, etabFlags, issues }.
//
// Annuaire et Etablissements sont indispensables : leur lecture ratée lève une
// DirectoryLoadError (l'appelant garde l'affichage précédent). Une autre table
// illisible n'empêche pas l'affichage : on réutilise ses libellés précédents
// (`previousMaps`) et on le signale dans `issues`, messages français destinés
// au bandeau d'état.
export async function loadDirectory(docApi, { previousMaps = {}, log = console } = {}) {
  const referenceNames = REFERENCE_TABLES.map(([table]) => table);
  const names = ['Annuaire', ...referenceNames];
  const settled = await readTables(docApi, names);
  const results = Object.fromEntries(names.map((name, index) => [name, settled[index]]));

  ['Annuaire', 'Etablissements'].forEach(name => {
    if (results[name].status === 'fulfilled') return;
    log.warn(`[REFS] Impossible de charger ${name}`, results[name].reason);
    throw new DirectoryLoadError(`table « ${name} » illisible`, results[name].reason);
  });

  const rows = tableToRows(results.Annuaire.value);
  const missingColumns = rows.length ? REQUIRED_ANNUAIRE_COLUMNS.filter(column => !(column in rows[0])) : [];
  if (missingColumns.length) {
    throw new DirectoryLoadError(`colonne « ${missingColumns.join(' », « ')} » absente de la table Annuaire`);
  }

  const unreadable = [];
  const referenceMaps = {};
  REFERENCE_TABLES.forEach(([table, fields]) => {
    if (results[table].status === 'rejected') {
      log.warn(`[REFS] Impossible de charger ${table}`, results[table].reason);
      unreadable.push(table);
      referenceMaps[table] = previousMaps[table] ?? {};
      return;
    }
    const tableRows = tableToRows(results[table].value);
    referenceMaps[table] = labelMapFromRows(tableRows, fields);
    const withoutLabel = tableRows.length - Object.keys(referenceMaps[table]).length;
    log.info(`[REFS] ${table}: ${Object.keys(referenceMaps[table]).length} entrées`
      + (withoutLabel ? ` (${withoutLabel} ligne(s) sans ${[].concat(fields).join('/')})` : ''));
  });

  const etabFlags = etablissementFlagsFromRows(tableToRows(results.Etablissements.value));
  const scopedRows = rows.filter(isInScope);
  const contacts = buildContacts(scopedRows, referenceMaps, etabFlags);
  log.info(`[GRIST] Enregistrements reçus: ${rows.length} (contacts affichables : ${contacts.length})`);

  const withoutEtablissement = scopedRows.filter(row => !text(row.Etablissement2)).map(row => row.id);
  if (withoutEtablissement.length) {
    log.warn(`[ETABLISSEMENT] ${withoutEtablissement.length}/${scopedRows.length} contact(s) sans Etablissement2 `
      + 'renseigné (identifiants de ligne Grist) :', withoutEtablissement.slice(0, 20));
  }

  const issues = [];
  if (unreadable.length) {
    issues.push(`Tables illisibles (${unreadable.join(', ')}) : des libellés ou des tags peuvent manquer.`);
  }
  if (etabFlags.conflicts.length) {
    issues.push(`Acronymes en double dans Etablissements (${etabFlags.conflicts.join(', ')}) avec des statuts `
      + 'différents : leurs contacts sont masqués.');
  }
  const emptyReason = describeEmptyDirectory(rows.length, scopedRows, contacts);
  if (emptyReason) issues.push(emptyReason);

  return { contacts, referenceMaps, etabFlags, issues };
}
