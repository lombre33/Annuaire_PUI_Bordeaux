// Point d'entrée — câblage Grist + DOM. Toute la logique métier vit dans
// grist-data.js / filters.js / render.js et est testée séparément.

import { fetchTable, fetchEtablissementsFlags, enrich, isInScope, isEtablissementEligible, filterVisibleEstablishments, text, createRequestSequencer, referenceMapsEqual } from './grist-data.js';
import { createEmptyFilterState, filterContacts, pruneStaleFilters, computeFilterCounts } from './filters.js';
import { createFilterUI, renderCards, updateFilterUI, updateFilterCounts } from './render.js';
import { FILTERS, ROLE_REFERENCE } from './constants.js';

// Dérivé de FILTERS (constants.js) plutôt que dupliqué à la main : les deux
// listes avaient divergé (cf. audit) avant ce refactor. Role_Dans_le_PUI n'a
// pas de filtre dédié (voir ROLE_REFERENCE) donc pas d'entrée dans FILTERS —
// ajouté à part.
const REFERENCE_TABLES = [...FILTERS.map(f => [f.table, f.field]), [ROLE_REFERENCE.table, ROLE_REFERENCE.field]];

const state = {
  allContacts: [],
  referenceMaps: {},
  // Comme referenceMaps, mais la table Etablissements y est restreinte aux
  // lignes ok_pour_apparaitre (filterVisibleEstablishments()) — sert
  // uniquement à construire/purger le menu du filtre Établissement, pas à
  // résoudre le libellé d'un contact (enrich() continue d'utiliser
  // referenceMaps, non filtré, pour ça).
  filterReferenceMaps: {},
  activeFilters: createEmptyFilterState(),
  searchTerm: '',
  // Affichage des contacts par statut d'établissement (cf. specs.md) —
  // Fondateurs coché par défaut, Partenaires décoché. Indépendant de
  // FILTERS/activeFilters (pas un menu de valeurs, voir filterContacts() dans
  // filters.js). Volontairement PAS remis à ce défaut par "Réinitialiser"
  // (cf. bouton reset ci-dessous) : une fois touché par l'utilisateur pendant
  // la session, son choix est conservé.
  scope: { fondateur: true, partenaire: false }
};

const elements = {
  grid: document.getElementById('cardsGrid'),
  template: document.getElementById('cardTemplate'),
  filtersContainer: document.getElementById('filtersContainer'),
  resultCount: document.getElementById('resultCount'),
  emptyState: document.getElementById('emptyState'),
  searchInput: document.getElementById('searchInput'),
  resetFilters: document.getElementById('resetFilters'),
  scopeButtons: [...document.querySelectorAll('.scope-btn')]
};

function toggleFilter(filterKey, value) {
  if (!state.activeFilters[filterKey]) state.activeFilters[filterKey] = new Set();
  const set = state.activeFilters[filterKey];
  if (set.has(value)) set.delete(value);
  else set.add(value);
  // Que le clic vienne d'une case du menu ou d'une bulle de carte (même
  // onToggle des deux côtés), le menu du filtre concerné doit refléter la
  // nouvelle sélection (coché en tête + badge de comptage).
  updateFilterUI(elements.filtersContainer, filterKey, state.activeFilters);
  refreshCards();
}

function refreshCards() {
  const filtered = filterContacts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
  renderCards(elements.grid, elements.template, filtered, toggleFilter);
  elements.resultCount.textContent = `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
  elements.emptyState.hidden = filtered.length !== 0;
  // Recalculé à chaque changement (recherche, scope, filtre, reset) : le
  // nombre affiché à côté de chaque option d'un menu reflète le nombre de
  // cartes qui matcheraient SI cette option était cochée, compte tenu de tous
  // les autres filtres actifs déjà — pas seulement de celui-ci isolé.
  const counts = computeFilterCounts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
  updateFilterCounts(elements.filtersContainer, counts);
}

elements.searchInput.addEventListener('input', event => {
  state.searchTerm = event.target.value.trim();
  refreshCards();
});

elements.scopeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.scope;
    state.scope[key] = !state.scope[key];
    button.classList.toggle('active', state.scope[key]);
    button.setAttribute('aria-pressed', String(state.scope[key]));
    refreshCards();
  });
});

elements.resetFilters.addEventListener('click', () => {
  Object.values(state.activeFilters).forEach(set => set.clear());
  state.searchTerm = '';
  elements.searchInput.value = '';
  // Ne touche volontairement PAS à state.scope/elements.scopeButtons : les
  // interrupteurs Fondateurs/Partenaires ne font pas partie de ce que
  // "Réinitialiser" remet à zéro (cf. demande) — un choix fait pendant la
  // session (ex: activer Partenaires) survit au clic sur ce bouton.
  // Reconstruit l'UI des filtres pour vider aussi les champs de recherche
  // internes à chaque dropdown (pas seulement les cases cochées).
  createFilterUI(elements.filtersContainer, state.filterReferenceMaps, state.activeFilters, toggleFilter,
    computeFilterCounts(state.allContacts, state.activeFilters, state.searchTerm, state.scope));
  refreshCards();
});

document.addEventListener('click', () => {
  document.querySelectorAll('.filter.open').forEach(f => f.classList.remove('open'));
});

// Aide au diagnostic (console navigateur) : signale les contacts sans
// Etablissement2 renseigné (colonne Text, formule côté Grist = acronyme de
// l'établissement déduit de l'email — cf. etablissementFlags()/enrich() dans
// grist-data.js) — ces contacts n'ont aucun indicateur fondateur/partenaire/
// ok_pour_apparaitre à faire valoir et sont donc exclus par
// isEtablissementEligible().
function logEtablissementDiagnostics(records) {
  const unresolved = records.filter(r => !text(r.Etablissement2));
  if (unresolved.length) {
    console.warn(`[ETABLISSEMENT] ${unresolved.length}/${records.length} contact(s) sans Etablissement2 renseigné :`,
      unresolved.slice(0, 20).map(r => ({ contactId: r.id, email: r.Email })));
  }
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Grist peut redéclencher onRecords très souvent (toute édition validée sur
// n'importe quel champ, par n'importe qui, pendant que le widget est ouvert).
// Le debounce absorbe les rafales d'éditions rapprochées ; le sequencer (voir
// grist-data.js) protège en plus contre le cas où deux invocations non
// absorbées par le debounce se chevauchent quand même et résolvent dans le
// désordre.
const recordsSequencer = createRequestSequencer();

window.grist.ready({ requiredAccess: 'full' });

window.grist.onRecords(debounce(async records => {
  const requestId = recordsSequencer.next();
  try {
    const rows = Array.isArray(records) ? records : (records?.records || []);
    console.log('[GRIST] Enregistrements reçus:', rows.length);

    const scopedRecords = rows.filter(isInScope);

    const [maps, etabFlags] = await Promise.all([
      Promise.all(REFERENCE_TABLES.map(([table, field]) => fetchTable(table, field))),
      fetchEtablissementsFlags()
    ]);
    if (!recordsSequencer.isLatest(requestId)) return; // une invocation plus récente a déjà démarré, on jette ce résultat périmé

    const newReferenceMaps = {};
    REFERENCE_TABLES.forEach(([table], index) => {
      newReferenceMaps[table] = maps[index];
    });
    // Menu du filtre Établissement restreint aux établissements ok_pour_apparaitre
    // (cf. demande) — referenceMaps complet (ci-dessus) reste utilisé pour
    // résoudre le libellé affiché sur une carte (enrich()), qui ne dépend pas
    // de cette validation.
    const newFilterReferenceMaps = {
      ...newReferenceMaps,
      Etablissements: filterVisibleEstablishments(newReferenceMaps['Etablissements'], etabFlags)
    };
    // Ne reconstruit l'UI des filtres (destructive : ferme les menus ouverts,
    // vide leur champ de recherche interne) que si les libellés ont vraiment
    // changé — pas à chaque édition d'un contact sans rapport avec les filtres.
    const referenceMapsChanged = !referenceMapsEqual(state.filterReferenceMaps, newFilterReferenceMaps);
    state.referenceMaps = newReferenceMaps;
    state.filterReferenceMaps = newFilterReferenceMaps;

    // Une sélection de filtre dont le libellé a été renommé/supprimé côté
    // Grist (ou, pour Établissement, dont ok_pour_apparaitre est passé à
    // false) doit être purgée avec les nouvelles tables de référence, avant
    // de filtrer les cartes.
    pruneStaleFilters(state.activeFilters, state.filterReferenceMaps);

    state.allContacts = scopedRecords
      .map(record => enrich(record, state.referenceMaps, etabFlags))
      .filter(c => c.Nom || c.Prenom)
      // Établissement ni fondateur ni partenaire, ou non validé par lui
      // (ok_pour_apparaitre) : jamais affiché, quels que soient les
      // interrupteurs Fondateurs/Partenaires de l'UI (cf. specs.md).
      .filter(isEtablissementEligible);

    logEtablissementDiagnostics(scopedRecords);

    if (referenceMapsChanged) {
      createFilterUI(elements.filtersContainer, state.filterReferenceMaps, state.activeFilters, toggleFilter,
        computeFilterCounts(state.allContacts, state.activeFilters, state.searchTerm, state.scope));
    }
    refreshCards();
  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
}, 250));
