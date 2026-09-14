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

// `scope` (optionnel — les appels qui ne le passent pas, ex. tests existants,
// gardent l'ancien comportement) bascule l'affichage des contacts entre
// établissements fondateurs et/ou partenaires (cf. specs.md). Séparé des
// FILTERS ci-dessus : ce n'est pas un filtre par valeur (menu à cocher), mais
// 2 interrupteurs indépendants (voir index.html/main.js).
// `excludeKey` (optionnel) saute la vérification d'UNE catégorie de FILTERS —
// utilisé par computeFilterCounts() ci-dessous pour calculer, pour chaque
// option d'un menu, le nombre de cartes qui correspondraient compte tenu de
// TOUS LES AUTRES filtres déjà actifs (recherche/scope/autres catégories),
// sans que la propre sélection de cette catégorie ne fausse son propre compte.
export function filterContacts(contacts, activeFilters, searchTerm, scope, excludeKey) {
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

    if (scope && !(
      (scope.fondateur && contact.etablissement_fondateur) ||
      (scope.partenaire && contact.etablissement_partenaire)
    )) return false;

    for (let i = 0; i < FILTERS.length; i++) {
      if (FILTERS[i].key === excludeKey) continue;
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

// Pour chaque catégorie de FILTERS, compte — parmi les cartes qui
// correspondraient déjà à tous les AUTRES filtres actifs (recherche, scope,
// autres catégories, via l'excludeKey de filterContacts() ci-dessus) —
// combien portent chaque valeur possible de cette catégorie. Sert à afficher,
// à côté de chaque option d'un menu de filtre, le nombre de cartes que
// cocher cette option précise donnerait (render.js).
//
// Clé de comptage normalisée (normalize(), pas la chaîne brute) pour rester
// cohérent avec le matching insensible à la casse/aux accents de
// filterContacts() ci-dessus (cf. compétences en texte libre) — sinon un
// contact "oncologie" (texte libre) ne compterait jamais dans l'option
// "Oncologie" (libellé de la table de référence) alors qu'il y matche bien.
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
