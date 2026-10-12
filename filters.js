// Filtrage et comptage des contacts, sans DOM ni effet de bord.

import { FILTERS } from './constants.js';
import { normalize, labelsOf } from './grist-data.js';

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

function matchesSearch(contact, term) {
  return !term || [contact.nom, contact.prenom].some(value => normalize(value).includes(term));
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

// Contacts qui correspondent à la recherche (nom, prénom), aux interrupteurs
// Fondateurs/Partenaires et aux filtres actifs. `scope` est optionnel (sans lui,
// aucune restriction). `excludeKey` ignore une catégorie, pour compter ses
// options sans que sa propre sélection fausse le résultat (voir computeFilterCounts).
export function filterContacts(contacts, activeFilters, searchTerm, scope, excludeKey) {
  const term = normalize(searchTerm);
  const selections = activeSelections(activeFilters, excludeKey);
  return contacts.filter(contact =>
    matchesSearch(contact, term) && matchesScope(contact, scope) && matchesSelections(contact, selections));
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
export function computeFilterCounts(contacts, activeFilters, searchTerm, scope) {
  const counts = {};
  FILTERS.forEach(filter => {
    const tally = {};
    filterContacts(contacts, activeFilters, searchTerm, scope, filter.key).forEach(contact => {
      labelsOf(contact, filter.key).forEach(label => {
        const key = normalize(label);
        tally[key] = (tally[key] || 0) + 1;
      });
    });
    counts[filter.key] = tally;
  });
  return counts;
}
