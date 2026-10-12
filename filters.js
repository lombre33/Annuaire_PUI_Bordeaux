// Filtrage et comptage des contacts, sans DOM. Seule pruneStaleFilters() modifie son argument.

import { FILTERS } from './constants.js';
import { normalize } from './grist-data.js';

export function createEmptyFilterState() {
  const state = {};
  FILTERS.forEach(f => {
    state[f.key] = new Set();
  });
  return state;
}

// Contacts qui correspondent à la recherche (nom, prénom), aux interrupteurs
// Fondateurs/Partenaires et aux filtres actifs : OU dans une catégorie, ET entre
// catégories. `scope` est optionnel (sans lui, aucune restriction). `excludeKey`
// ignore une catégorie, pour compter ses options sans que sa propre sélection
// fausse le résultat (voir computeFilterCounts).
export function filterContacts(contacts, activeFilters, searchTerm, scope, excludeKey) {
  const term = normalize(searchTerm);

  // Sélections normalisées une seule fois, pas à chaque contact.
  const normalizedSelections = FILTERS.map(filter => {
    const selected = activeFilters[filter.key];
    return selected && selected.size > 0 ? new Set([...selected].map(normalize)) : null;
  });

  return contacts.filter(contact => {
    if (term && ![contact.Nom, contact.Prenom].some(value => normalize(value).includes(term))) return false;

    if (scope && !(
      (scope.fondateur && contact.etablissement_fondateur) ||
      (scope.partenaire && contact.etablissement_partenaire)
    )) return false;

    for (let i = 0; i < FILTERS.length; i++) {
      if (FILTERS[i].key === excludeKey) continue;
      const normalizedSelected = normalizedSelections[i];
      if (!normalizedSelected) continue;
      const labels = contact[`${FILTERS[i].key}_labels`] || [];
      if (!labels.some(label => normalizedSelected.has(normalize(label)))) return false;
    }
    return true;
  });
}

// Retire des filtres actifs les valeurs qui ne sont plus une option du menu
// (libellé renommé ou supprimé dans Grist) : invisibles, elles bloqueraient les
// résultats à 0. Une valeur valide sans contact pour l'instant reste cochée.
// Modifie `activeFilters` en place.
export function pruneStaleFilters(activeFilters, referenceMaps) {
  FILTERS.forEach(filter => {
    const selected = activeFilters[filter.key];
    if (!selected || selected.size === 0) return;
    const available = new Set(Object.values(referenceMaps[filter.table] || {}));
    [...selected].forEach(value => {
      if (!available.has(value)) selected.delete(value);
    });
  });
}

// Pour chaque catégorie, le nombre de cartes par valeur compte tenu de tous les
// AUTRES filtres actifs : ce que donnerait le fait de cocher cette option.
// Clés normalisées (casse, accents) comme le filtrage, sinon « oncologie »
// (texte libre) ne compterait jamais dans l'option « Oncologie ».
export function computeFilterCounts(contacts, activeFilters, searchTerm, scope) {
  const counts = {};
  FILTERS.forEach(filter => {
    const facetContacts = filterContacts(contacts, activeFilters, searchTerm, scope, filter.key);
    const tally = {};
    facetContacts.forEach(contact => {
      const labels = contact[`${filter.key}_labels`] || [];
      labels.forEach(label => {
        const key = normalize(label);
        tally[key] = (tally[key] || 0) + 1;
      });
    });
    counts[filter.key] = tally;
  });
  return counts;
}
