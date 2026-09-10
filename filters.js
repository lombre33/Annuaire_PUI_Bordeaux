// État et logique de filtrage — pur, sans DOM, testable.

import { FILTERS } from './constants.js';
import { text } from './grist-data.js';

export function createEmptyFilterState() {
  const state = {};
  FILTERS.forEach(f => {
    state[f.key] = new Set();
  });
  return state;
}

export function filterContacts(contacts, activeFilters, searchTerm) {
  const term = text(searchTerm).toLocaleLowerCase('fr-FR');

  return contacts.filter(contact => {
    if (term && ![contact.Nom, contact.Prenom].some(value =>
      text(value).toLocaleLowerCase('fr-FR').includes(term)
    )) return false;

    for (const filter of FILTERS) {
      const selected = activeFilters[filter.key];
      if (!selected || selected.size === 0) continue;
      const labels = filter.key === 'etablissement'
        ? (contact.etablissement_label ? [contact.etablissement_label] : [])
        : (contact[`${filter.key}_labels`] || []);
      if (!labels.some(label => selected.has(label))) return false;
    }
    return true;
  });
}
