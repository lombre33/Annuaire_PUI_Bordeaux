// Filtrage et comptage des contacts, sans DOM ni effet de bord.

import { CATEGORIES, FILTERS, TAGS_SHOWN_PER_GROUP } from './constants.js';
import { normalize, normalizeForSearch, labelsOf, compareLabels, text } from './grist-data.js';

export function createEmptyFilterState() {
  const state = {};
  FILTERS.forEach(f => {
    state[f.key] = new Set();
  });
  return state;
}

// Sélections actives (hors `excludeKey`), normalisées une seule fois plutôt qu'à
// chaque contact.
function activeSelections(activeFilters, excludeKey) {
  return FILTERS
    .filter(filter => filter.key !== excludeKey && activeFilters[filter.key]?.size > 0)
    .map(filter => ({ key: filter.key, values: new Set([...activeFilters[filter.key]].map(normalize)) }));
}

// Les valeurs que les filtres actifs désignent, normalisées, par catégorie : { clé: Set } (les catégories sans sélection n'y sont pas).
export function selectedValues(activeFilters) {
  return Object.fromEntries(activeSelections(activeFilters).map(({ key, values }) => [key, values]));
}

// Les pastilles d'un groupe que « +N » cache sur une carte (TAGS_SHOWN_PER_GROUP) : celles au-delà du plafond, sauf un groupe qui le dépasse d'une
// seule (le bouton n'y gagnerait rien) et sauf les valeurs que les filtres actifs désignent (`selected` : les valeurs normalisées de la
// catégorie, voir selectedValues) : sans elles on ne verrait pas pourquoi la carte est là.
export function hiddenLabels(labels, selected) {
  const hidden = labels.slice(TAGS_SHOWN_PER_GROUP).filter(label => !selected?.has(normalize(label)));
  return hidden.length > 1 ? hidden : [];
}

// Les mots de la recherche, normalisés (voir normalizeForSearch) : « Karim  Benali » donne
// ['karim', 'benali'].
function searchWords(term) {
  return normalizeForSearch(term).split(' ').filter(Boolean);
}

// Ce que la recherche lit d'un contact : « prénom nom » normalisé, calculé une fois par contact
// (une frappe parcourt tout l'annuaire : refaire la normalisation à chaque frappe coûterait
// cher sur un grand annuaire). Les contacts sont reconstruits à chaque lecture de Grist, donc
// la mémoire ne garde jamais un nom périmé.
const SEARCH_KEYS = new WeakMap();
function searchKey(contact) {
  let key = SEARCH_KEYS.get(contact);
  if (key === undefined) {
    key = normalizeForSearch(`${text(contact.prenom)} ${text(contact.nom)}`);
    SEARCH_KEYS.set(contact, key);
  }
  return key;
}

// Chaque mot doit se trouver dans « prénom nom », dans n'importe quel ordre : « karim benali »,
// « benali karim » et « kar ben » trouvent Karim Benali. Un seul mot cherche toujours dans le
// nom comme dans le prénom.
function matchesSearch(contact, words) {
  return words.length === 0 || words.every(word => searchKey(contact).includes(word));
}

function matchesScope(contact, scope) {
  if (!scope) return true;
  return Boolean(
    (scope.fondateur && contact.etablissement_fondateur) ||
    (scope.partenaire && contact.etablissement_partenaire)
  );
}

// OU dans une catégorie, ET entre catégories.
function matchesSelections(contact, selections) {
  return selections.every(({ key, values }) => labelsOf(contact, key).some(label => values.has(normalize(label))));
}

// Contacts qui correspondent à la recherche (« prénom nom »), aux interrupteurs
// Fondateurs/Partenaires et aux filtres actifs. `scope` est optionnel (sans lui,
// aucune restriction). `excludeKey` ignore une catégorie, pour compter ses
// options sans que sa propre sélection fausse le résultat (voir computeFilterCounts).
// L'ordre des contacts est conservé.
export function filterContacts(contacts, activeFilters, searchTerm, scope, excludeKey) {
  const words = searchWords(searchTerm);
  const selections = activeSelections(activeFilters, excludeKey);
  return contacts.filter(contact =>
    matchesSearch(contact, words) && matchesScope(contact, scope) && matchesSelections(contact, selections));
}

// Renvoie les filtres actifs privés des valeurs qui ne sont plus une option du
// menu (libellé renommé ou supprimé dans Grist) : invisibles, elles bloqueraient
// les résultats à 0. Une valeur valide sans contact pour l'instant reste cochée.
// `activeFilters` n'est pas modifié.
export function pruneStaleFilters(activeFilters, referenceMaps) {
  const pruned = {};
  FILTERS.forEach(filter => {
    const available = new Set(Object.values(referenceMaps[filter.key] || {}));
    pruned[filter.key] = new Set([...(activeFilters[filter.key] || [])].filter(value => available.has(value)));
  });
  return pruned;
}

// Pour chaque catégorie, le nombre de cartes par valeur compte tenu de tous les
// AUTRES filtres actifs : ce que donnerait le fait de cocher cette option.
// Clés normalisées (casse, accents) comme le filtrage, sinon « oncologie »
// (texte libre) ne compterait jamais dans l'option « Oncologie ».
//
// Le regroupement d'un filtre (les domaines des compétences) se compte avec lui, sur
// les mêmes cartes : son menu est un seul filtre, dont les domaines ne sont pas
// un critère de plus. Cocher une compétence ne change donc pas le nombre de cartes
// de son domaine, comme cocher une valeur ne change pas son propre compte.
export function computeFilterCounts(contacts, activeFilters, searchTerm, scope) {
  const counts = {};
  FILTERS.forEach(filter => {
    const keys = filter.grouping ? [filter.key, filter.grouping] : [filter.key];
    const tallies = new Map(keys.map(key => [key, new Map()])); // des Map : un libellé peut être « constructor »
    filterContacts(contacts, activeFilters, searchTerm, scope, filter.key).forEach(contact => {
      keys.forEach(key => labelsOf(contact, key).forEach(label => {
        const tally = tallies.get(key);
        const normalized = normalize(label);
        tally.set(normalized, (tally.get(normalized) ?? 0) + 1);
      }));
    });
    tallies.forEach((tally, key) => { counts[key] = Object.fromEntries(tally); });
  });
  return counts;
}

// ===== Menus par groupe =====
// Le menu d'un filtre dont la catégorie a un regroupement (les compétences par
// domaine) range ses valeurs par groupe. Rien n'y est un second critère : cocher un
// groupe coche toutes ses valeurs, et le filtre ne connaît toujours que des valeurs.

// Les valeurs du menu rangées par groupe : [{ label, values }], les groupes triés, le
// groupe de repli (« Autres ») en dernier, chaque groupe avec ses valeurs triées. Une
// valeur figure dans le groupe de sa ligne de Grist ; écrite sur deux lignes de groupes
// différents, elle figure dans les deux. Un groupe se reconnaît à son libellé normalisé
// (casse, accents), comme son compteur, et garde la première écriture. `null` quand le
// menu reste plat : la catégorie n'a pas de regroupement, ou Grist n'en donne aucun
// (colonne de regroupement absente, libellés d'une table illisible).
export function menuGroups(filter, referenceMaps) {
  const grouping = filter.grouping && CATEGORIES[filter.grouping];
  const groupOf = grouping && referenceMaps[filter.grouping];
  if (!groupOf || Object.keys(groupOf).length === 0) return null;

  const byGroup = new Map();
  Object.entries(referenceMaps[filter.key] || {}).forEach(([id, value]) => {
    const label = groupOf[id] || grouping.fallback;
    const key = normalize(label);
    if (!byGroup.has(key)) byGroup.set(key, { label, values: new Map() });
    const values = byGroup.get(key).values;
    if (!values.has(normalize(value))) values.set(normalize(value), value); // une écriture par valeur, à la casse près
  });
  const fallbackKey = normalize(grouping.fallback);
  const rank = key => (key === fallbackKey ? 1 : 0);
  return [...byGroup]
    .sort(([keyA, a], [keyB, b]) => rank(keyA) - rank(keyB) || compareLabels(a.label, b.label))
    .map(([, { label, values }]) => ({ label, values: [...values.values()].sort(compareLabels) }));
}

// Où en est un groupe : 'none', 'some' ou 'all' de ses valeurs sont cochées.
export function groupState(selected, values) {
  const checked = values.filter(value => selected.has(value)).length;
  if (checked === 0) return 'none';
  return checked === values.length ? 'all' : 'some';
}

// Coche d'un coup toutes les valeurs d'un groupe, ou les décoche si elles le sont déjà
// toutes : un groupe coché en partie se complète. Modifie `selected`.
export function toggleGroup(selected, values) {
  const complete = groupState(selected, values) === 'all';
  values.forEach(value => (complete ? selected.delete(value) : selected.add(value)));
}

// Ce que le badge du bouton compte : un groupe entièrement coché pour un, et chaque
// autre valeur cochée pour une. Cocher un domaine de douze compétences affiche « 1 »,
// pas « 12 ». Sans groupes (menu plat), les valeurs cochées.
export function selectionCount(selected, groups) {
  if (!groups) return selected.size;
  const complete = groups.filter(({ values }) => groupState(selected, values) === 'all');
  const covered = new Set(complete.flatMap(({ values }) => values));
  return complete.length + [...selected].filter(value => !covered.has(value)).length;
}
