// Point d'entrée — câblage Grist + DOM. Toute la logique métier vit dans
// grist-data.js / filters.js / render.js et est testée séparément.

import { loadDirectory, DirectoryLoadError, filterVisibleEstablishments, createRequestSequencer, referenceMapsEqual } from './grist-data.js';
import { createEmptyFilterState, filterContacts, pruneStaleFilters, computeFilterCounts } from './filters.js';
import { createFilterUI, renderCards, updateFilterUI, updateFilterCounts } from './render.js';

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
  statusBanner: document.getElementById('statusBanner'),
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

function rebuildFilterUI() {
  createFilterUI(elements.filtersContainer, state.filterReferenceMaps, state.activeFilters, toggleFilter,
    computeFilterCounts(state.allContacts, state.activeFilters, state.searchTerm, state.scope));
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
  rebuildFilterUI();
  refreshCards();
});

document.addEventListener('click', () => {
  document.querySelectorAll('.filter.open').forEach(f => f.classList.remove('open'));
});

// Bandeau d'état : vide = masqué. Sert aux pannes de lecture et aux données à
// corriger dans Grist, pour qu'un annuaire incomplet ne passe jamais pour un
// annuaire vide.
function showStatus(messages) {
  elements.statusBanner.textContent = messages.join(' ');
  elements.statusBanner.hidden = messages.length === 0;
}

// Un échec de lecture Grist ne doit pas se présenter comme « 0 contact » : on
// l'affiche explicitement. Les cartes déjà affichées (chargement précédent
// réussi) restent en place.
function showLoadError(error) {
  const reason = error instanceof DirectoryLoadError ? ` (${error.message})` : '';
  showStatus([`Impossible de charger l'annuaire depuis Grist${reason}. Rechargez la page ; `
    + 'si le problème persiste, le détail est dans la console du navigateur.']);
  if (state.allContacts.length === 0) elements.resultCount.textContent = 'Chargement impossible';
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

// Applique un annuaire chargé : état, menus de filtres (reconstruits seulement
// si les libellés ont changé) puis cartes.
function applyDirectory({ contacts, referenceMaps, etabFlags }) {
  // Le menu du filtre Établissement ne propose que les établissements
  // ok_pour_apparaitre ; referenceMaps complet reste utilisé pour résoudre le
  // libellé affiché sur une carte (enrich()).
  const filterReferenceMaps = {
    ...referenceMaps,
    Etablissements: filterVisibleEstablishments(referenceMaps.Etablissements, etabFlags)
  };
  // Reconstruire l'UI des filtres est destructif (ferme les menus ouverts, vide
  // leur champ de recherche) : on ne le fait que si les libellés ont changé.
  const referenceMapsChanged = !referenceMapsEqual(state.filterReferenceMaps, filterReferenceMaps);
  state.referenceMaps = referenceMaps;
  state.filterReferenceMaps = filterReferenceMaps;

  // Une sélection dont le libellé a été renommé/supprimé côté Grist (ou, pour
  // Établissement, dont ok_pour_apparaitre est passé à false) est purgée
  // avant de filtrer les cartes.
  pruneStaleFilters(state.activeFilters, filterReferenceMaps);

  state.allContacts = contacts;
  if (referenceMapsChanged) rebuildFilterUI();
  refreshCards();
}

// onRecords() ne sert qu'à SAVOIR QUAND rafraîchir : son payload par ligne ne
// contient pas forcément toutes les colonnes d'Annuaire (ex. Etablissement2,
// colonne formule), alors que fetchTable() renvoie toujours la table complète.
window.grist.onRecords(debounce(async () => {
  const requestId = recordsSequencer.next();
  try {
    const directory = await loadDirectory(window.grist.docApi, { previousMaps: state.referenceMaps });
    if (!recordsSequencer.isLatest(requestId)) return; // une invocation plus récente a démarré : résultat périmé
    applyDirectory(directory);
    showStatus(directory.issues);
  } catch (error) {
    if (!recordsSequencer.isLatest(requestId)) return;
    console.error('Erreur dans le traitement des contacts:', error);
    showLoadError(error);
  }
}, 250));
