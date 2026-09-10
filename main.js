// Point d'entrée — câblage Grist + DOM. Toute la logique métier vit dans
// grist-data.js / filters.js / render.js et est testée séparément.

import { fetchTable, enrich, isInScope, refLabel } from './grist-data.js';
import { createEmptyFilterState, filterContacts } from './filters.js';
import { createFilterUI, renderCards } from './render.js';

const REFERENCE_TABLES = [
  ['Actions', 'Action'],
  ['Taches', 'taches'],
  ['Communautees', 'communaute'],
  ['GT', 'nom'],
  ['Competances', 'Competences'],
  ['Instances', 'nom_instance'],
  // acronyme d'abord, nom_complet en repli si l'acronyme n'est pas renseigné
  // pour cette ligne (cf. CHANGELOG — cause du bug "établissement invisible").
  ['Etablissements', ['acronyme', 'nom_complet']],
  ['Role_Dans_le_PUI', 'Role']
];

const state = {
  allContacts: [],
  referenceMaps: {},
  activeFilters: createEmptyFilterState(),
  searchTerm: ''
};

const elements = {
  grid: document.getElementById('cardsGrid'),
  template: document.getElementById('cardTemplate'),
  filtersContainer: document.getElementById('filtersContainer'),
  resultCount: document.getElementById('resultCount'),
  emptyState: document.getElementById('emptyState'),
  searchInput: document.getElementById('searchInput'),
  resetFilters: document.getElementById('resetFilters')
};

function toggleFilter(filterKey, value) {
  if (!state.activeFilters[filterKey]) state.activeFilters[filterKey] = new Set();
  const set = state.activeFilters[filterKey];
  if (set.has(value)) set.delete(value);
  else set.add(value);
  refreshCards();
}

function refreshCards() {
  const filtered = filterContacts(state.allContacts, state.activeFilters, state.searchTerm);
  renderCards(elements.grid, elements.template, filtered, toggleFilter);
  elements.resultCount.textContent = `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
  elements.emptyState.hidden = filtered.length !== 0;
}

elements.searchInput.addEventListener('input', event => {
  state.searchTerm = event.target.value.trim();
  refreshCards();
});

elements.resetFilters.addEventListener('click', () => {
  Object.values(state.activeFilters).forEach(set => set.clear());
  state.searchTerm = '';
  elements.searchInput.value = '';
  // Reconstruit l'UI des filtres pour vider aussi les champs de recherche
  // internes à chaque dropdown (pas seulement les cases cochées).
  createFilterUI(elements.filtersContainer, state.referenceMaps, state.activeFilters, toggleFilter);
  refreshCards();
});

document.addEventListener('click', () => {
  document.querySelectorAll('.filter.open').forEach(f => f.classList.remove('open'));
});

// Aide au diagnostic (console navigateur) : montre la valeur brute telle
// qu'envoyée par Grist (utile car son encodage dépend de la config de la
// table liée — texte déjà résolu, id nu, ou ['R', table, id], voir refLabel()
// dans grist-data.js), puis liste les contacts qui restent sans libellé.
function logEtablissementDiagnostics(records, referenceMaps) {
  const withRaw = records.filter(r => r.Etablissement !== null && r.Etablissement !== undefined && r.Etablissement !== '' && r.Etablissement !== 0);
  const sample = withRaw[0];
  if (sample) {
    console.info('[ETABLISSEMENT] Exemple de valeur brute (contact.Etablissement):', sample.Etablissement,
      `— type JS: ${Array.isArray(sample.Etablissement) ? 'array' : typeof sample.Etablissement}`);
  }
  const unresolved = withRaw.filter(r => !refLabel(r.Etablissement, referenceMaps['Etablissements']) && !r.Etablissement2);
  console.info(
    `[ETABLISSEMENT] ${withRaw.length}/${records.length} contact(s) ont une valeur Etablissement`
    + (unresolved.length ? ` — ${unresolved.length} ne résolvent aucun libellé (ni Etablissement, ni Etablissement2).` : '.')
  );
  if (unresolved.length) {
    console.warn('[ETABLISSEMENT] non résolus (contact.id -> valeur brute Etablissement):',
      unresolved.slice(0, 20).map(r => ({ contactId: r.id, raw: r.Etablissement })));
  }
}

window.grist.ready({ requiredAccess: 'full' });

window.grist.onRecords(async records => {
  try {
    const rows = Array.isArray(records) ? records : (records?.records || []);
    console.log('[GRIST] Enregistrements reçus:', rows.length);

    const scopedRecords = rows.filter(isInScope);

    const maps = await Promise.all(REFERENCE_TABLES.map(([table, field]) => fetchTable(table, field)));
    REFERENCE_TABLES.forEach(([table], index) => {
      state.referenceMaps[table] = maps[index];
    });

    state.allContacts = scopedRecords
      .map(record => enrich(record, state.referenceMaps))
      .filter(c => c.Nom || c.Prenom);

    logEtablissementDiagnostics(scopedRecords, state.referenceMaps);

    createFilterUI(elements.filtersContainer, state.referenceMaps, state.activeFilters, toggleFilter);
    refreshCards();
  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
});
