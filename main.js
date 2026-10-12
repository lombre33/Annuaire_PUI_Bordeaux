// Point d'entrée : relie l'API Grist et les événements du DOM aux modules
// grist-data.js (lecture, enrichissement), filters.js (filtrage) et render.js
// (construction du DOM).

import { loadDirectory, DirectoryLoadError, filterVisibleEstablishments, createRequestSequencer, referenceMapsEqual } from './grist-data.js';
import { createEmptyFilterState, filterContacts, pruneStaleFilters, computeFilterCounts } from './filters.js';
import { createFilterUI, renderCards, updateFilterUI, updateFilterCounts } from './render.js';

const state = {
  allContacts: [],
  referenceMaps: {},
  // referenceMaps dont la table Etablissements est restreinte aux lignes
  // ok_pour_apparaitre : réservé aux menus de filtres, jamais utilisé pour
  // résoudre le libellé d'un contact.
  filterReferenceMaps: {},
  activeFilters: createEmptyFilterState(),
  searchTerm: '',
  // Interrupteurs Fondateurs/Partenaires (specs.md), hors de activeFilters :
  // ce ne sont pas des valeurs de menu. « Réinitialiser » n'y touche pas.
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
  // Une case de menu et une bulle de carte appellent ce même toggle : le menu
  // concerné doit refléter la sélection dans les deux cas.
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
  // Chaque option de menu affiche le nombre de cartes qu'elle donnerait si on la
  // cochait, compte tenu des autres filtres actifs : recalculé à chaque changement.
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
  // Fondateurs/Partenaires ne sont volontairement pas remis à zéro. Les menus
  // sont reconstruits pour vider aussi leur champ de recherche interne.
  rebuildFilterUI();
  refreshCards();
});

document.addEventListener('click', () => {
  document.querySelectorAll('.filter.open').forEach(f => f.classList.remove('open'));
});

// Bandeau d'état (masqué si `messages` est vide) : un annuaire incomplet ne doit
// jamais passer pour un annuaire vide.
function showStatus(messages) {
  elements.statusBanner.textContent = messages.join(' ');
  elements.statusBanner.hidden = messages.length === 0;
}

// Les cartes déjà affichées (chargement précédent réussi) restent en place.
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

// onRecords se redéclenche à chaque édition dans Grist. Le debounce absorbe les
// rafales ; le sequencer écarte le résultat d'une lecture lente quand une plus
// récente a déjà démarré.
const recordsSequencer = createRequestSequencer();

window.grist.ready({ requiredAccess: 'full' });

function applyDirectory({ contacts, referenceMaps, etabFlags }) {
  const filterReferenceMaps = {
    ...referenceMaps,
    Etablissements: filterVisibleEstablishments(referenceMaps.Etablissements, etabFlags)
  };
  // Reconstruire les menus ferme ceux qui sont ouverts : seulement si les
  // libellés ont changé.
  const referenceMapsChanged = !referenceMapsEqual(state.filterReferenceMaps, filterReferenceMaps);
  state.referenceMaps = referenceMaps;
  state.filterReferenceMaps = filterReferenceMaps;

  // Une sélection dont le libellé a disparu côté Grist est purgée avant de filtrer.
  pruneStaleFilters(state.activeFilters, filterReferenceMaps);

  state.allContacts = contacts;
  if (referenceMapsChanged) rebuildFilterUI();
  refreshCards();
}

// onRecords() ne sert qu'à savoir quand rafraîchir : son contenu ne porte pas
// forcément toutes les colonnes d'Annuaire (Etablissement2 est une formule),
// alors que fetchTable() renvoie la table complète.
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
