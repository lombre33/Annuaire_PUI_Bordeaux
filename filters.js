// État et logique de filtrage — pur, sans DOM, testable.

import { FILTERS } from './constants.js';
import { normalize } from './grist-data.js';

export function createEmptyFilterState() {
  const state = {};
  FILTERS.forEach(f => {
    state[f.key] = new Set();
  });
  return state;
}

export function filterContacts(contacts, activeFilters, searchTerm) {
  const term = normalize(searchTerm);

  // Un Set normalisé par filtre actif, calculé une seule fois pour tous les
  // contacts (pas à chaque itération de contacts.filter) : évite de refaire
  // normalize() sur chaque valeur sélectionnée pour chaque contact.
  const normalizedSelections = FILTERS.map(filter => {
    const selected = activeFilters[filter.key];
    return selected && selected.size > 0 ? new Set([...selected].map(normalize)) : null;
  });

  return contacts.filter(contact => {
    if (term && ![contact.Nom, contact.Prenom].some(value => normalize(value).includes(term))) return false;

    for (let i = 0; i < FILTERS.length; i++) {
      const normalizedSelected = normalizedSelections[i];
      if (!normalizedSelected) continue;
      // etablissement_labels (comme tout autre groupe) : voir enrich() dans
      // grist-data.js — plus de cas particulier ici.
      const labels = contact[`${FILTERS[i].key}_labels`] || [];
      if (!labels.some(label => normalizedSelected.has(normalize(label)))) return false;
    }
    return true;
  });
}

// Une valeur cochée dans un filtre (ex: "CHU") peut devenir orpheline si le
// libellé correspondant est renommé ou supprimé côté Grist — la case à cocher
// disparaît du menu (reconstruit depuis referenceMaps), mais sans ce nettoyage
// la sélection resterait invisible et bloquerait silencieusement les
// résultats à 0, récupérable seulement via "Réinitialiser". Ne retire que ce
// qui n'est plus une option valide du menu — pas ce qui n'a simplement plus
// aucun contact correspondant en ce moment (ça, c'est un résultat normal, pas
// une sélection périmée).
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
