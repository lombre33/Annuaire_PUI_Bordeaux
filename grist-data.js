// Fonctions de conversion/enrichissement des données Grist. Aucune ne touche
// le DOM : elles sont testables telles quelles (voir tests/data.test.mjs). Seule
// loadDirectory() lit Grist, via le `docApi` qu'on lui passe.

import { FILTERS, ROLE_REFERENCE } from './constants.js';

export function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

// Compare/recherche insensible à la casse ET aux accents (contrairement à
// .toLocaleLowerCase('fr-FR') seul) — utilisé pour matcher un tag libre
// (ex: colonnes competences_1..15, texte tapé à la main) contre une valeur de
// filtre issue d'une table de référence, qui peut différer par la casse ou les
// accents sans que ce soit une vraie différence pour l'utilisateur.
export function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR');
}

// Tri alphabétique français (ex: "chu" doit se classer avant "UBM", ce que
// .sort() par défaut ne fait pas — il compare par code UTF-16, majuscules
// d'abord).
export function compareLabels(a, b) {
  return text(a).localeCompare(text(b), 'fr-FR');
}

// Remonte les valeurs cochées en tête de liste (chaque groupe restant trié
// alphabétiquement) — utilisé pour la construction initiale d'un menu de
// filtre. `sortedValues` doit déjà être trié (ex: via compareLabels) : un
// filtre stable sur un tableau trié préserve l'ordre à l'intérieur de
// chaque groupe, pas besoin de retrier.
export function sortWithCheckedFirst(sortedValues, selected) {
  const checked = sortedValues.filter(value => selected.has(value));
  const unchecked = sortedValues.filter(value => !selected.has(value));
  return [...checked, ...unchecked];
}

// La colonne numero_de_telephone est typée Numeric côté Grist : un numéro
// français saisi avec son 0 initial (ex: 0556789012) perd ce 0 en passant par
// un type numérique (556789012). On le rétablit pour l'affichage. Formats
// inattendus (longueur différente, texte libre) : renvoyés tels quels plutôt
// que déformés.
export function formatPhone(value) {
  if (value === null || value === undefined || value === '' || value === 0) return '';
  const raw = text(value);
  const digits = raw.replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `0${digits}`.match(/.{1,2}/g).join(' ');
  if (/^0\d{9}$/.test(digits)) return digits.match(/.{1,2}/g).join(' ');
  return raw;
}

// Grist encode les colonnes Liste/RéférenceListe sous la forme ['L', item1, item2, ...].
// Une liste réellement vide est donc ['L'] (longueur 1, pas 0) : il faut retirer ce
// marqueur avant de savoir si la liste contient de vraies valeurs.
export function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '');
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

// ===== CONVERSION GRIST: Column-oriented → Row-oriented =====
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

// Une colonne Référence UNIQUE (pas ReferenceList) peut arriver sous 3 formes
// différentes depuis l'API Grist, selon que la table liée a une "visible
// column" configurée ou non :
//   - déjà résolue en texte d'affichage (ex: "UBM") si une visible column
//     est configurée sur la table liée — cas réel constaté sur Etablissements ;
//   - encodée ['R', tableId, rowId] ;
//   - un id numérique déjà nu.
// refId() n'extrait un id que dans les 2 derniers cas (une chaîne n'est PAS
// un id, c'est du texte déjà résolu — refLabel() la traite séparément).
export function refId(value) {
  if (Array.isArray(value)) {
    return value[0] === 'R' && value.length >= 3 ? value[2] : null;
  }
  if (typeof value === 'string') return null;
  return value || null;
}

// Résout une colonne Référence unique vers son libellé affichable, quelle
// que soit la forme sous laquelle Grist l'a envoyée (voir refId() ci-dessus).
export function refLabel(value, referenceMap) {
  if (typeof value === 'string') return text(value);
  const id = refId(value);
  return (id && referenceMap?.[String(id)]) || '';
}

// ===== TABLE DE RÉFÉRENCE (id -> libellé) =====
// labelFields accepte un nom de colonne unique, ou un tableau de colonnes
// essayées dans l'ordre (la première non vide gagne) — utile quand la colonne
// "principale" (ex: acronyme) n'est pas systématiquement renseignée. Les
// lignes sans libellé sont ignorées : elles ne peuvent pas être affichées.
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

// window.grist.onRecords peut se redéclencher avant qu'un appel précédent
// n'ait fini de résoudre ses lectures (plusieurs éditions rapprochées dans
// Grist) ; sans garde, l'appel le plus lent peut résoudre en dernier et écraser
// un affichage plus récent avec des données périmées. Chaque appel prend un
// numéro ; seul le numéro le plus récent est autorisé à appliquer son résultat.
export function createRequestSequencer() {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: id => id === latest
  };
}

// Compare deux jeux de tables de référence (id -> libellé) par contenu, pas
// par référence — sert à ne reconstruire l'UI des filtres (destructive : elle
// ferme tout menu ouvert et vide les champs de recherche internes) que quand
// les libellés ont réellement changé, pas à chaque édition d'un contact.
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

// Un élément d'une ReferenceList peut lui aussi arriver déjà résolu en texte
// d'affichage (ex: "CME") plutôt qu'en id numérique brut — même ambiguïté que
// pour une Référence unique (voir refId()/refLabel() plus haut), selon que la
// table liée a une "visible column" configurée. RÉGRESSION CONSTATÉE EN PROD
// (14/09, voir CHANGELOG 1.5.1) : la version précédente supposait toujours un
// id numérique nu et cherchait `referenceMap[String("CME")]`, qui échoue
// puisque la table est indexée par id numérique — l'item était alors
// silencieusement jeté au lieu d'être affiché. Tags Instances/Actions/GT/
// Communautés/Tâches disparus de toutes les cartes tant que ce cas ne gérait
// pas le texte déjà résolu.
export function resolveListItem(item, referenceMap) {
  if (typeof item === 'string') return text(item);
  return referenceMap?.[String(item)] || '';
}

// Colonnes ReferenceList (Grist encode ['L', id1, id2, ...]) résolues via une
// table de référence : [colonne sur Annuaire, table de référence, clé de sortie].
// Piloté par données plutôt que 5 blocs copiés-collés — un futur ajout est une
// ligne ici, pas un bloc dupliqué avec 3 tokens à changer à la main (source de
// bug si un token est oublié/mal collé).
const LIST_REFERENCE_FIELDS = [
  ['Instances', 'Instances', 'instances_labels'],
  ['Actions', 'Actions', 'actions_labels'],
  ['GT', 'GT', 'gt_labels'],
  ['Communautee_s_', 'Communautees', 'communautes_labels'],
  ['Taches', 'Taches', 'taches_labels']
];

// ===== ENRICHIR UN CONTACT =====
// etabFlags (voir etablissementFlagsFromRows() ci-dessus) est optionnel — les
// appels existants (tests, ancien code) qui ne le passent pas obtiennent
// simplement des indicateurs à false, ce qui exclut le contact via
// isEtablissementEligible() plutôt que de planter.
export function enrich(contact, referenceMaps, etabFlags) {
  const enriched = { ...contact };

  LIST_REFERENCE_FIELDS.forEach(([contactField, table, outputKey]) => {
    // resolveListItem() gère texte déjà résolu ET id numérique brut (voir sa
    // doc ci-dessus). Un id numérique qui ne résout à aucun libellé (ligne de
    // la table de référence sans libellé renseigné, cf. [REFS] ... sans
    // <champ> dans la console) reste ignoré plutôt que d'afficher l'id brut :
    // "47" comme tag sur une carte n'apporte rien à l'utilisateur.
    enriched[outputKey] = safeValues(contact[contactField])
      .map(id => resolveListItem(id, referenceMaps[table]))
      .filter(Boolean);
  });

  const competences = [];
  for (let i = 1; i <= 15; i++) {
    const value = text(contact[`competences_${i}`]);
    if (value) competences.push(value);
  }
  enriched.competences_labels = competences;

  // Etablissement2 (Text, formule = rec.nom_de_domaine.acronyme côté Grist)
  // est la source unique de vérité pour l'établissement d'un contact — pas la
  // colonne nom_de_domaine elle-même (Reference), dont l'encodage sur une
  // colonne FORMULE s'est avéré peu fiable en prod (cf. CHANGELOG). Toujours
  // une chaîne simple, jamais l'ambiguïté texte/id/['R',...] des Références.
  enriched.etablissement_label = text(contact.Etablissement2) || '';
  // Miroir en tableau (convention _labels commune à tous les groupes) pour que
  // filters.js n'ait pas besoin d'un cas particulier pour l'établissement — le
  // badge dédié sur la carte (render.js) continue lui d'utiliser la forme
  // singulière ci-dessus.
  enriched.etablissement_labels = enriched.etablissement_label ? [enriched.etablissement_label] : [];

  const flags = etablissementFlags(contact, etabFlags);
  enriched.etablissement_fondateur = flags?.fondateur === true;
  enriched.etablissement_partenaire = flags?.partenaire === true;
  enriched.etablissement_ok_pour_apparaitre = flags?.ok_pour_apparaitre === true;

  const roleLabel = refLabel(contact.Role_dans_le_PUI, referenceMaps['Role_Dans_le_PUI']);
  // Tableau, pas chaîne : TAG_GROUPS (constants.js) et le rendu générique des
  // tags de carte (render.js) attendent `${key}_labels` pour tous les groupes,
  // "role" inclus — une valeur singulière role_label ici ne serait lue nulle
  // part et le tag "Rôle PUI" resterait invisible sur toutes les cartes.
  enriched.role_labels = roleLabel ? [roleLabel] : [];

  return enriched;
}

// Un contact n'est affiché que s'il a au moins une vraie valeur dans perimetre_all
// (cahier des charges, specs.md). Réutilise safeValues() pour rester cohérent avec
// le reste du code sur l'encodage des listes Grist.
//
// Correction régression: l'ancien contrôle testait `Array.isArray(p) && p.length > 0`,
// ce qui était toujours vrai (le marqueur 'L' compte dans la longueur), même pour un
// perimetre_all vide. Voir tests/data.test.mjs pour le test de non-régression.
export function isInScope(record) {
  return safeValues(record.perimetre_all).length > 0;
}

// ===== INDICATEURS DE VISIBILITÉ D'UN ÉTABLISSEMENT =====
// La table Etablissements porte 4 colonnes booléennes pilotant l'affichage des
// contacts qui y sont rattachés (cf. specs.md) : fondateur, partenaire, autres
// (jamais affiché) et ok_pour_apparaitre (validation par l'établissement,
// verrou global indépendant du statut).
//
// Indexées par libellé résolu (acronyme, repli nom_complet) — c'est ce
// libellé (via Etablissement2, cf. etablissementFlags() ci-dessous) qui sert
// à identifier l'établissement d'un contact. byId reste utilisé par
// filterVisibleEstablishments() (menu du filtre, indexé par referenceMaps).
//
// Deux lignes de même libellé ne doivent pas se départager par leur ordre :
// si leurs statuts divergent, on garde le plus strict (un indicateur n'est
// vrai que s'il l'est sur toutes les lignes, donc les contacts restent masqués
// dans le doute) et le libellé est listé dans `conflicts` pour être signalé.
const ETABLISSEMENT_LABEL_FIELDS = ['acronyme', 'nom_complet'];

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

// Résout les indicateurs de l'établissement d'un contact à partir
// d'Etablissement2 (Text — cf. enrich() ci-dessus pour le choix de cette
// colonne plutôt que nom_de_domaine). null si vide ou si le libellé ne
// correspond à aucune ligne de la table Etablissements.
export function etablissementFlags(contact, etabFlags) {
  const label = text(contact?.Etablissement2);
  return (label && etabFlags?.byLabel?.[label]) || null;
}

// Un contact n'est éligible à l'affichage que si son établissement a validé
// (ok_pour_apparaitre) ET a le statut fondateur ou partenaire — jamais "autres"
// (cf. demande). Un contact dont l'établissement n'est pas identifiable dans la
// table Etablissements (repli Etablissement2, référence orpheline) n'a aucun
// indicateur à faire valoir : exclu par défaut plutôt qu'affiché sans validation.
export function isEtablissementEligible(contact) {
  return contact.etablissement_ok_pour_apparaitre === true &&
    (contact.etablissement_fondateur === true || contact.etablissement_partenaire === true);
}

// Restreint un id->libellé d'Etablissements (issu de referenceMaps, voir
// labelMapFromRows() ci-dessus) aux seules lignes ok_pour_apparaitre — sert
// uniquement à construire les OPTIONS du menu du filtre Établissement
// (render.js), pas à résoudre le libellé d'un contact : referenceMaps complet
// (non filtré) doit rester utilisé pour ça (enrich()/refLabel()), un
// établissement non validé pouvant quand même être le libellé affiché d'un
// contact déjà exclu par isEtablissementEligible() en amont.
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

// Tables de référence à lire, dérivées de la taxonomie (constants.js) plutôt
// que recopiées à la main. Role_Dans_le_PUI n'a pas de filtre : déclarée à part.
const REFERENCE_TABLES = [
  ...FILTERS.map(filter => [filter.table, filter.field]),
  [ROLE_REFERENCE.table, ROLE_REFERENCE.field]
];

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
