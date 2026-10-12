// Point d'entrée : relie l'API Grist et les événements du DOM aux modules
// grist-data.js (lecture, enrichissement), filters.js (filtrage), render.js
// (construction du DOM), identity.js et presence.js (la personne connectée et
// son choix d'apparaître), account-ui.js (son bandeau), et pour les demandes de
// modification de fiche profile.js / requests.js (la logique) avec profile-ui.js
// et admin-ui.js (les deux fenêtres).

import { loadDirectory, DirectoryLoadError, filterVisibleEstablishments, createRequestSequencer, referenceMapsEqual, normalize } from './grist-data.js';
import { createEmptyFilterState, filterContacts, pruneStaleFilters, computeFilterCounts } from './filters.js';
import { createFilterUI, renderCards, updateFilterUI, updateFilterCounts, initials } from './render.js';
import { readIdentity, isReadOnlyAddress } from './identity.js';
import { describePresence, setPresence, PresenceError } from './presence.js';
import { createAccountBar } from './account-ui.js';
import { REQUESTS_TABLE } from './constants.js';
import { profileFormModel, draftOf, draftFromChanges, diffProfile } from './profile.js';
import {
  RequestError, hasRequestsTable, loadRequests, classifyRequests, ownRequestState, parseChanges, describeChanges,
  describeRequest, submitRequest, validateRequest, validateRequests, refuseRequest
} from './requests.js';
import { readColumnTypes } from './schema.js';
import { createProfileDialog } from './profile-ui.js';
import { createAdminDialog } from './admin-ui.js';

const state = {
  allContacts: [],
  referenceMaps: {},
  // referenceMaps (libellés par clé de catégorie) dont celui des établissements
  // est restreint aux lignes ok_pour_apparaitre : réservé aux menus de filtres,
  // jamais utilisé pour résoudre le libellé d'un contact.
  filterReferenceMaps: {},
  activeFilters: createEmptyFilterState(),
  searchTerm: '',
  // Interrupteurs Fondateurs/Partenaires (specs.md), hors de activeFilters :
  // ce ne sont pas des valeurs de menu. « Réinitialiser » n'y touche pas.
  scope: { fondateur: true, partenaire: false },
  // La personne connectée (identity.js ; null tant qu'elle n'est pas lue) et
  // l'index des lignes de BDD par e-mail (grist-data.js), pour retrouver sa fiche.
  identity: null,
  people: null,
  // Les demandes de modification (requests.js) : `available` dit si la table existe ;
  // `active` les demandes à traiter, `history` les autres.
  requests: { available: false, all: [], active: [], history: [] },
  // Type des colonnes de BDD (schema.js), pour écrire un téléphone dans la forme de sa colonne.
  columnTypes: {}
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

// Bandeau « Ma présence » (voir « Ma présence » plus bas) : masqué tant que la
// personne connectée n'est pas identifiée et retrouvée dans BDD.
const accountBar = createAccountBar(document.getElementById('accountBar'), {
  onToggle: togglePresence,
  onEdit: openProfile,
  onAdmin: openAdmin
});

const profileDialog = createProfileDialog(document.getElementById('profileDialog'));
const adminDialog = createAdminDialog(document.getElementById('adminDialog'), {
  onRefresh: () => loadAdminData({ strict: true }),
  onValidate: id => decide(async () => validateRequest(window.grist.docApi, id, await adminOptions())),
  onRefuse: (id, reason) => decide(async () => refuseRequest(window.grist.docApi, id, reason, await adminOptions())),
  onValidateAll: validateMany
});

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

// Chaque option de menu affiche le nombre de cartes qu'elle donnerait si on la
// cochait, compte tenu des autres filtres actifs : recalculé à chaque changement.
function currentCounts() {
  return computeFilterCounts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
}

function rebuildFilterUI() {
  createFilterUI(elements.filtersContainer, state.filterReferenceMaps, state.activeFilters, toggleFilter, currentCounts());
}

function refreshCards() {
  const filtered = filterContacts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
  renderCards(elements.grid, elements.template, filtered, toggleFilter);
  elements.resultCount.textContent = `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
  elements.emptyState.hidden = filtered.length !== 0;
  updateFilterCounts(elements.filtersContainer, currentCounts());
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

function applyDirectory({ contacts, referenceMaps, etabFlags, people }) {
  const filterReferenceMaps = {
    ...referenceMaps,
    etablissement: filterVisibleEstablishments(referenceMaps.etablissement, etabFlags)
  };
  // Reconstruire les menus ferme ceux qui sont ouverts : seulement si les
  // libellés ont changé.
  const referenceMapsChanged = !referenceMapsEqual(state.filterReferenceMaps, filterReferenceMaps);
  state.referenceMaps = referenceMaps;
  state.filterReferenceMaps = filterReferenceMaps;

  // Une sélection dont le libellé a disparu côté Grist est purgée avant de filtrer.
  state.activeFilters = pruneStaleFilters(state.activeFilters, filterReferenceMaps);

  state.allContacts = contacts;
  state.people = people;
  personCache.clear();
  descriptions.clear();
  if (referenceMapsChanged) rebuildFilterUI();
  refreshCards();
  refreshAccount();
}

// Relit Grist et met l'affichage à jour. Renvoie 'applied', 'stale' (une lecture
// plus récente a pris le relais) ou 'failed' (le bandeau d'état le dit).
//
// onRecords() ne sert qu'à savoir quand rafraîchir : son contenu ne porte pas
// forcément toutes les colonnes de BDD (selon la vue branchée) et résout les
// Références en texte, alors que fetchTable() renvoie la table complète, les
// Références en identifiants.
async function reloadDirectory() {
  const requestId = recordsSequencer.next();
  try {
    const directory = await loadDirectory(window.grist.docApi, { previousMaps: state.referenceMaps });
    if (!recordsSequencer.isLatest(requestId)) return 'stale'; // une invocation plus récente a démarré : résultat périmé
    applyDirectory(directory);
    showStatus(directory.issues);
    return 'applied';
  } catch (error) {
    if (!recordsSequencer.isLatest(requestId)) return 'stale';
    console.error('Erreur dans le traitement des contacts:', error);
    showLoadError(error);
    return 'failed';
  }
}

window.grist.onRecords(debounce(reloadDirectory, 250));

// ===== Ma présence =====

// Les lignes de BDD de la personne connectée : aucune tant qu'elle n'est pas
// identifiée, ou si aucune ligne ne porte son adresse.
function myPersons() {
  if (state.identity?.status !== 'ready' || !state.people) return [];
  return state.people.findByEmail(state.identity.email);
}

const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

function refreshAccount() {
  const persons = myPersons();
  const admin = isAdmin() ? { count: state.requests.active.length } : null;
  // Une seule fiche pour cette adresse : sinon on ne sait pas laquelle modifier.
  const edit = persons.length === 1 && state.requests.available
    ? { pending: Boolean(ownRequestState(state.requests.all, state.identity.email).pending) }
    : null;

  if (persons.length === 0) {
    if (state.identity?.status === 'ready' && state.people) {
      warnOnce('no-row', state.people.hasEmailColumn
        ? '[IDENTITE] Aucune ligne de BDD ne porte l\'adresse de la personne connectée : pas de bandeau « Ma présence ».'
        : '[IDENTITE] BDD n\'a pas de colonne « email » : impossible de relier la personne connectée à sa fiche.');
    }
    if (!admin) {
      accountBar.hide();
      return;
    }
    // Une administratrice sans fiche dans BDD : rien à dire sur sa présence, mais les demandes à valider.
    accountBar.show({ name: 'Administration', presence: false, tone: 'info', message: 'Vous pouvez valider les demandes de modification des fiches.' });
    accountBar.setActions({ admin });
    return;
  }
  if (persons.length > 1) {
    warnOnce('duplicates', `[IDENTITE] ${persons.length} lignes de BDD portent la même adresse (identifiants de ligne : `
      + `${persons.map(person => person.row.id).join(', ')}) : le choix de présence s'applique à toutes, la modification de fiche n'est pas proposée.`);
  }
  accountBar.show({ name: persons[0].name || 'Ma fiche', initials: initials(persons[0].row), ...describePresence(persons) });
  accountBar.setActions({ edit, admin });
}

let togglePending = false;

// Écrit le choix dans Grist, puis relit l'annuaire : l'interrupteur et les cartes
// montrent ce que Grist a vraiment enregistré, jamais ce qu'on espérait.
async function togglePresence() {
  const persons = myPersons();
  if (togglePending || persons.length === 0) return;
  togglePending = true;
  accountBar.setBusy(true);
  accountBar.setStatus('Enregistrement…');
  try {
    await setPresence(window.grist.docApi, persons, !persons.every(person => person.status.accepted));
    const outcome = await reloadDirectory();
    accountBar.setStatus(outcome === 'failed' ? 'Modification enregistrée ; l\'annuaire n\'a pas pu être rechargé.' : '');
  } catch (error) {
    if (!(error instanceof PresenceError)) console.error('Erreur inattendue pendant le changement de présence:', error);
    accountBar.setStatus(error instanceof PresenceError ? error.message : 'La modification n\'a pas pu être enregistrée.', 'error');
  } finally {
    togglePending = false;
    accountBar.setBusy(false);
  }
}

// L'identité ne retarde jamais l'annuaire : lue à part, elle ajoute le bandeau
// quand elle arrive. Sans elle (pas de table-sonde, compte Lecteur…), personne
// n'est identifié et aucune modification n'est proposée.
readIdentity(window.grist.docApi, { readOnly: isReadOnlyAddress(window.location.search) }).then(async identity => {
  state.identity = identity;
  if (identity.status === 'ready') await detectRequests();
  refreshAccount();
});

// ===== Demandes de modification de fiche =====

// Aucune modification n'est proposée sans la table des demandes (GRIST_SETUP.md, étape 4).
async function detectRequests() {
  state.requests.available = await hasRequestsTable(window.grist.docApi);
  if (!state.requests.available) {
    warnOnce('no-requests-table', `[DEMANDES] La table « ${REQUESTS_TABLE} » est introuvable : aucune modification de fiche n'est proposée (voir GRIST_SETUP.md).`);
    return;
  }
  await refreshRequests();
}

const isAdmin = () => state.identity?.status === 'ready' && state.identity.admin === true && state.requests.available;

// Ce que l'écran des administrateurs calcule une fois par relecture : la personne d'une
// demande et la description d'une demande (mémorisées, vidées quand les données changent).
const personCache = new Map();
const descriptions = new Map();

function personInfo(id) {
  if (!personCache.has(id)) {
    const entry = state.people?.findById(id) ?? null;
    personCache.set(id, entry && {
      name: entry.name || 'Sans nom',
      initials: initials(entry.row),
      etablissement: entry.etablissement,
      search: normalize(entry.name)
    });
  }
  return personCache.get(id);
}

function describeFor(request) {
  if (!descriptions.has(request.id)) {
    descriptions.set(request.id, describeRequest(request, {
      findPerson: id => state.people?.findById(id) ?? null,
      referenceMaps: state.referenceMaps,
      columnTypes: state.columnTypes
    }));
  }
  return descriptions.get(request.id);
}

// Les lectures se font l'une après l'autre : la dernière demandée est la dernière appliquée.
// Renvoie vrai si les demandes ont pu être lues ; sinon l'état précédent reste affiché.
let requestsQueue = Promise.resolve();
function refreshRequests() {
  const run = async () => {
    if (!state.requests.available) return false;
    try {
      const all = await loadRequests(window.grist.docApi);
      const { active, history } = classifyRequests(all);
      state.requests = { available: true, all, active, history };
      descriptions.clear();
      return true;
    } catch (error) {
      console.error('[DEMANDES] Lecture impossible :', error);
      return false;
    } finally {
      refreshAccount();
    }
  };
  requestsQueue = requestsQueue.then(run);
  return requestsQueue;
}

// Une erreur attendue (RequestError) porte une phrase française ; toute autre est
// consignée dans la console et remplacée par une phrase générale.
function userFacing(error) {
  if (error instanceof RequestError) return error;
  console.error('[DEMANDES] Erreur inattendue :', error);
  return new Error('L\'opération n\'a pas pu aboutir. Le détail est dans la console du navigateur.');
}

// ----- Modifier sa fiche -----

async function openProfile() {
  const persons = myPersons();
  if (persons.length !== 1 || !state.requests.available) return;
  accountBar.setStatus('');
  // L'état des demandes est relu à l'ouverture : la personne voit si une demande attend déjà.
  if (!(await refreshRequests())) {
    accountBar.setStatus('Vos demandes n\'ont pas pu être lues. Réessayez dans un instant.', 'error');
    return;
  }
  const [person] = myPersons();
  if (!person || myPersons().length !== 1) return;
  const { row } = person;
  const model = profileFormModel(row, state.referenceMaps);
  const own = ownRequestState(state.requests.all, state.identity.email);

  // Une demande en attente se reprend là où elle en était : l'envoyer de nouveau la remplace.
  let draft = draftOf(model);
  if (own.pending) {
    const parsed = parseChanges(own.pending.changes, state.referenceMaps);
    if (parsed.champs) draft = draftFromChanges(model, parsed.champs);
  }
  profileDialog.open({
    person: { name: person.name || 'Ma fiche', email: String(row.email ?? '').trim(), initials: initials(row) },
    etablissement: person.etablissement,
    model,
    draft,
    message: own.pending ? own.pending.message : '',
    pending: own.pending ? { date: own.pending.date } : null,
    last: !own.pending && own.last ? { status: own.last.status, date: own.last.decidedAt || own.last.date, reason: own.last.reason } : null,
    evaluate(values) {
      const result = diffProfile(row, values, state.referenceMaps);
      return { ...result, lines: describeChanges(result.champs) };
    },
    async submit({ champs, summary, message }) {
      try {
        await submitRequest(window.grist.docApi, row, { champs, summary }, message);
      } catch (error) {
        throw userFacing(error);
      }
      await refreshRequests();
    }
  });
}

// ----- Valider ou refuser -----

const adminContext = () => ({
  adminEmail: state.identity.email,
  active: state.requests.active,
  history: state.requests.history,
  person: personInfo,
  describe: describeFor
});

async function loadAdminData({ strict = false } = {}) {
  state.columnTypes = await readColumnTypes(window.grist.docApi);
  descriptions.clear();
  if (!(await refreshRequests())) {
    const message = 'Les demandes n\'ont pas pu être lues. Réessayez avec « Actualiser ».';
    if (strict) throw new Error(message);
    adminDialog.showFailure(message);
    return;
  }
  adminDialog.update(adminContext());
}

async function openAdmin() {
  if (!isAdmin()) return;
  adminDialog.open();
  await loadAdminData();
}

// Les types de colonnes sont relus avant d'écrire : le téléphone s'écrit dans la forme de sa colonne.
async function adminOptions() {
  state.columnTypes = await readColumnTypes(window.grist.docApi);
  descriptions.clear();
  return { adminEmail: state.identity.email, referenceMaps: state.referenceMaps, columnTypes: state.columnTypes };
}

// Après une décision, réussie ou non, l'annuaire et les demandes sont relus : l'écran montre ce
// que Grist contient vraiment, pas ce qu'on espérait.
async function settle() {
  await Promise.all([reloadDirectory(), refreshRequests()]);
  adminDialog.update(adminContext());
}

async function decide(run) {
  if (!isAdmin()) throw new RequestError('Cette action est réservée aux administrateurs.');
  try {
    await run();
  } catch (error) {
    await settle();
    throw userFacing(error);
  }
  await settle();
}

async function validateMany(ids) {
  if (!isAdmin()) throw new RequestError('Cette action est réservée aux administrateurs.');
  const outcomes = await validateRequests(window.grist.docApi, ids, await adminOptions());
  await settle();
  return outcomes;
}
