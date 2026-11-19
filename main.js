// Point d'entrée : relie l'API Grist et les événements du DOM aux modules
// grist-data.js (lecture, enrichissement), filters.js (filtrage), filter-menus.js
// (les menus de filtre), render.js (les cartes), scroll-tools.js (la barre d'outils
// fixe et la pastille « Haut de page »), identity.js et presence.js (la
// personne connectée et son choix d'apparaître), account-ui.js (son bandeau), pour la
// modification d'une fiche, profile.js / profile-save.js / preview.js (la logique) avec
// profile-ui.js (la fenêtre), pour celle d'un établissement etablissement.js /
// etablissement-save.js (la logique), upload.js et image-prep.js (le logo, la photo)
// avec etablissement-ui.js (la fenêtre), branding.js, attachments.js, branding-ui.js
// et logos-report.js (les logos : cartes, fondateurs, bilan de la console) et
// avatar-ui.js (les photos de profil), status-ui.js (le bandeau d'état et l'écran « Aucun contact »), login.js et
// login-ui.js (la fenêtre de connexion d'un visiteur sans compte), gate.js et gate-ui.js (qui voit l'annuaire : seulement qui y figure, 1.45.0),
// requests.js et requests-ui.js (les fiches créées par les personnes elles-mêmes, que les administrateurs valident ou refusent).

import { CATEGORIES, CONSENT_COLUMN, DOCS_URL, ETABLISSEMENT_NAMES, IDENTITY_WAIT_MS, LOGIN_AUTO_OPEN, RESPONSIBLE_COLUMN, SEARCH_DELAY_MS, VERSION } from './constants.js';
import { loadDirectory, describeLoadFailure, debounce, filterableRoles, filterVisibleEstablishments, createRequestSequencer, contactCountText, normalizeEmail, referenceMapsEqual, refId, text } from './grist-data.js';
import { createEmptyFilterState, describeEmptyResults, filterContacts, countInScope, pruneStaleFilters, computeFilterCounts, toggleGroup } from './filters.js';
import { closeFilterMenus, createFilterUI, updateFilterUI, updateFilterCounts } from './filter-menus.js';
import { attachTagNavigation, attachTagNotes, focusFirstResult, keepFocus, renderCards, renderPreviewCard, initials } from './render.js';
import { createScrollTools } from './scroll-tools.js';
import { readIdentity, isReadOnlyAddress, isAccessRefused } from './identity.js';
import { findLoginUrl } from './login.js';
import { createLoginPrompt } from './login-ui.js';
import { createDeactivatedColumn, createPendingColumn, createResponsibleColumn } from './schema.js';
import { describeCreated, describeDeactivated, describeHiddenFiche, describePending, describePresence, describeUnknownAccount, setPresence, PresenceError } from './presence.js';
import { describeGate } from './gate.js';
import { createGatePanel } from './gate-ui.js';
import { RequestError, approveRequest, describeRequests, refuseRequest } from './requests.js';
import { createRequestsDialog } from './requests-ui.js';
import { createAccountBar } from './account-ui.js';
import { createEmptyState, createStatusBanner } from './status-ui.js';
import { rightsFor, profileFormModel, draftOf, diffProfile, describeChanges, blankFiche } from './profile.js';
import { PHOTO_UPLOAD_HINT, ProfileSaveError, createProfile, prepareCreation, prepareReview, saveProfile, unsavedLabels } from './profile-save.js';
import { createProfileDialog } from './profile-ui.js';
import { diffEtablissement, etablissementOf, etablissementRightsFor, peopleOfEtablissement, responsablesOf } from './etablissement.js';
import { EtablissementSaveError, readEtablissement, saveEtablissement, savePlanOf } from './etablissement-save.js';
import { createEtablissementDialog } from './etablissement-ui.js';
import { colleaguesOf, departedOf } from './departure.js';
import { DepartureError, applyDeparture, prepareDeparture, reactivateFiche } from './departure-save.js';
import { createDepartureDialog } from './departure-ui.js';
import { uploadAttachment } from './upload.js';
import { brandingSummary, buildBranding, logoForContact } from './branding.js';
import { avatarIdOf, createAttachments } from './attachments.js';
import { createBrandingUI, createLogoImage } from './branding-ui.js';
import { createLogoReport } from './logos-report.js';
import { createAvatar, createPhotoViewer, createThumb } from './avatar-ui.js';
import { createDocViewer } from './docs-ui.js';
import { setDocOpener } from './dom.js';

// Le numéro de la version qui s'exécute, en bas de page (voir VERSION et index.html). Le cache de GitHub Pages garde chaque fichier dix
// minutes : un index.html ancien sans cette ligne ne doit pas empêcher le code neuf de démarrer.
const versionNote = document.getElementById('versionNote');
if (versionNote) versionNote.textContent = `Version ${VERSION}`;

// Le bouton « Documentation » de l'en-tête (DOCS_URL, constants.js) : caché dans index.html, il n'apparaît qu'avec son adresse, et ouvre la
// fenêtre qui lit les documents du dépôt (docs-ui.js) ; DOCS_URL est la page de GitHub qu'elle propose à un administrateur quand un document
// ne se lit pas. Sans adresse il n'y a pas de bouton ; avec un index.html ancien (cache de GitHub Pages) qui n'a pas la fenêtre, c'est le
// lien d'avant, vers DOCS_URL. Les messages du widget qui citent la documentation (doc-refs.js) en font un lien qui ouvre la même fenêtre
// à la bonne section (dom.js, setDocOpener), pour un document que la personne peut lire. Un administrateur lit tous les documents, toute
// autre personne le guide utilisateur seulement (1.45.3) : `isAdmin` est lu à chaque ouverture, l'identité arrivant après le widget.
const docLink = document.getElementById('docLink');
const docDialog = document.getElementById('docDialog');
if (docLink && DOCS_URL) {
  docLink.hidden = false;
  if (docDialog) {
    const docs = createDocViewer(docDialog, { externalUrl: DOCS_URL, isAdmin: () => isAdmin() });
    docLink.addEventListener('click', () => docs.open());
    setDocOpener(target => docs.open(target), page => docs.canOpen(page));
  } else {
    docLink.href = DOCS_URL;
  }
}

// La fenêtre de connexion d'un visiteur sans compte (1.44.0, refaite à l'identique de celle de l'agenda partagé en 1.45.1, login-ui.js) : le lien
// de l'en-tête, son repli et la fenêtre sont cachés tant que l'identité n'a pas dit que la personne est sans compte (applyIdentity). Avec un
// index.html ancien (cache de GitHub Pages) qui n'a pas la fenêtre, rien n'est proposé : l'annuaire se lit comme avant.
const loginDialog = document.getElementById('acces');
const loginLink = document.getElementById('loginLink');
const loginOpen = document.getElementById('loginOpen');
const loginPrompt = loginDialog && loginLink && loginOpen ? createLoginPrompt(loginDialog, { link: loginLink, openButton: loginOpen }) : null;

async function offerLogin() {
  if (!loginPrompt) return;
  const url = await findLoginUrl(window.grist.docApi, { search: window.location.search });
  loginPrompt.show(url, { autoOpen: LOGIN_AUTO_OPEN });
}

const state = {
  // Faux jusqu'à la première lecture réussie de Grist : d'ici là le compteur dit « Chargement… » et rien d'autre ne s'affiche
  // (ni « 0 contact », ni « Aucun contact trouvé » si l'on tape pendant l'attente).
  loaded: false,
  allContacts: [],
  referenceMaps: {},
  // referenceMaps (libellés par clé de catégorie) dont celui des établissements
  // est restreint à ceux dont une fiche peut s'afficher (filterVisibleEstablishments) :
  // réservé aux menus de filtres, jamais utilisé pour résoudre le libellé d'un contact.
  filterReferenceMaps: {},
  activeFilters: createEmptyFilterState(),
  searchTerm: '',
  // Interrupteurs Fondateurs/Partenaires (specs.md), hors de activeFilters :
  // ce ne sont pas des valeurs de menu. « Réinitialiser » n'y touche pas. Ils règlent
  // aussi la liste du menu Établissement (refreshFilterMenus).
  scope: { fondateur: true, partenaire: false },
  // La personne connectée (identity.js ; null tant qu'elle n'est pas lue) et
  // l'index des lignes de BDD par e-mail et par identifiant (grist-data.js), pour
  // retrouver sa fiche.
  identity: null,
  people: null,
  // Logos des établissements (branding.js), vides tant que Grist n'a pas répondu.
  branding: buildBranding(),
  // Ce que la personne connectée peut faire de chaque fiche (profile.js) : rien tant
  // qu'elle n'est pas identifiée. Un administrateur n'a le droit de modifier les fiches
  // des autres que lorsqu'il a allumé le « mode admin » (adminMode).
  rightsOf: () => null,
  adminMode: false,
  // Les établissements dont la personne connectée est responsable (etablissement.js) : aucun tant
  // qu'elle n'est pas identifiée. Leur fiche est la seule que le mode admin ne touche pas.
  etabRights: () => false,
  // Indicateurs des établissements, pour montrer la fiche « après » telle que
  // l'annuaire la présentera.
  etabFlags: null,
  // Les lignes d'Etablissements (avec la colonne des domaines quand elle existe) : de quoi vérifier l'adresse d'une personne qui crée sa fiche et
  // dire à un administrateur si l'adresse d'une demande est celle de l'établissement choisi.
  etablissementRows: [],
  // Qui voit l'annuaire (gate.js) : { open: true }, ou l'écran qui le remplace pour une personne qui n'y figure pas encore.
  gate: { open: true },
  // La dernière lecture de l'annuaire a échoué (1.45.2), et `directoryRefused` : une règle d'accès l'a refusée : l'écran le dit plutôt que d'attendre une lecture qui ne vient pas.
  directoryFailed: false,
  directoryRefused: false
};

// Le bandeau d'état (rouge) et l'écran « Aucun contact » (status-ui.js).
const statusBanner = createStatusBanner(document.getElementById('statusBanner'));
const emptyState = createEmptyState(document.getElementById('emptyState'));

const elements = {
  grid: document.getElementById('cardsGrid'),
  template: document.getElementById('cardTemplate'),
  filtersContainer: document.getElementById('filtersContainer'),
  resultCount: document.getElementById('resultCount'),
  skipLink: document.querySelector('.skip-link'),
  searchInput: document.getElementById('searchInput'),
  resetFilters: document.getElementById('resetFilters'),
  adminStrip: document.getElementById('adminStrip'),
  toast: document.getElementById('toast'),
  toastLive: document.getElementById('toastLive'),
  scopeButtons: [...document.querySelectorAll('.scope-btn')]
};

// Le script de l'API de Grist vient de docs.getgrist.com (index.html) : bloqué (réseau, pare-feu, extension) ou en panne, `window.grist`
// n'existe pas et rien de ce qui suit ne peut démarrer. La page le dit, au lieu de rester sur un compteur vide.
if (!window.grist) {
  statusBanner.show(['Impossible de joindre Grist : le script de son API (docs.getgrist.com) ne s\'est pas chargé. Vérifiez la connexion, '
    + 'puis rechargez la page ; si le problème persiste, le détail est dans la console du navigateur.'], { label: 'Recharger la page', run: () => window.location.reload() });
  elements.resultCount.textContent = 'Chargement impossible';
  elements.grid.removeAttribute('aria-busy');
  throw new Error('[GRIST] window.grist est absent : le script de l\'API de Grist (docs.getgrist.com) ne s\'est pas chargé.');
}

// Les logos et les photos de profil sont des pièces jointes de Grist : leurs adresses demandent
// un jeton, réclamé à Grist seulement quand une image est à afficher.
const attachments = createAttachments(window.grist.docApi);

// Bandeau « Ma présence » (voir « Ma présence » plus bas) : masqué tant que la
// personne connectée n'est pas identifiée et retrouvée dans BDD.
const accountBar = createAccountBar(document.getElementById('accountBar'), {
  onToggle: togglePresence,
  onEdit: openOwnProfile,
  onCreate: openCreation,
  onEtab: openMyEtablissement,
  onAdminMode: toggleAdminMode,
  onRequests: openRequests,
  attachments
});

// Grist ouvre le widget d'un compte Lecteur avec `readonly=true` (identity.js) : ce compte n'aura jamais de bandeau. Les autres le
// verront apparaître, qui sait quand : sa place est réservée dès le départ pour qu'il ne repousse pas les cartes (audit UI/UX, U50).
const READ_ONLY = isReadOnlyAddress(window.location.search);
if (!READ_ONLY) accountBar.pending();

const profileDialog = createProfileDialog(document.getElementById('profileDialog'));
const etablissementDialog = createEtablissementDialog(document.getElementById('etabDialog'));

// L'écran des personnes qui ne figurent pas encore dans l'annuaire et la fenêtre des demandes à valider (1.45.0). Avec un index.html ancien
// (cache de GitHub Pages) qui ne les a pas, rien n'est fermé ni proposé : l'annuaire se lit comme avant.
const gatePanelRoot = document.getElementById('gatePanel');
const gatePanel = gatePanelRoot ? createGatePanel(gatePanelRoot, { onCreate: openCreation }) : null;
const requestsDialogRoot = document.getElementById('requestsDialog');
const requestsDialog = requestsDialogRoot ? createRequestsDialog(requestsDialogRoot, { list: currentRequests, decide: decideRequest }) : null;
// La fenêtre du départ d'un·e collègue (1.46.0), ouverte depuis la fiche de l'établissement. Sans elle (index.html ancien), la fiche n'a pas la section.
const departureDialogRoot = document.getElementById('departDialog');
const departureDialog = departureDialogRoot ? createDepartureDialog(departureDialogRoot) : null;

const photoViewer = createPhotoViewer(document.getElementById('photoDialog'), attachments);
const brandingUI = createBrandingUI({
  band: document.getElementById('foundersBand'),
  bandLogos: document.getElementById('bandLogos'),
  bandLink: document.getElementById('bandLink')
}, attachments);

// Ce qu'il faut à une carte pour montrer le logo de son établissement : la carte de
// l'annuaire comme la carte « avant / après » de la relecture.
const cardLogos = () => ({ attachments, logoFor: contact => logoForContact(state.branding, contact) });

// Le bilan des logos dans la console (logos-report.js), après chaque dessin des cartes.
const reportLogosLater = createLogoReport(attachments);

// La pastille « N contacts · Haut de page » et la place que prend la barre d'outils fixe (scroll-tools.js).
const scrollTools = createScrollTools({
  sentinel: document.getElementById('toolbarSentinel'),
  toolbar: document.getElementById('toolbar'),
  tools: document.getElementById('scrollTools'),
  count: document.getElementById('scrollCount'),
  toTop: document.getElementById('toTop'),
  home: elements.resultCount
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

// La case d'un groupe de menu (un domaine de compétences) coche ou décoche toutes ses
// valeurs d'un coup : une seule mise à jour des cartes, pas une par valeur.
function toggleFilterGroup(filterKey, values) {
  toggleGroup(state.activeFilters[filterKey], values);
  updateFilterUI(elements.filtersContainer, filterKey, state.activeFilters);
  refreshCards();
}

// Chaque option de menu affiche le nombre de cartes qu'elle donnerait si on la
// cochait, compte tenu des autres filtres actifs : recalculé à chaque changement.
function currentCounts() {
  return computeFilterCounts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
}

function rebuildFilterUI() {
  // `selection` et `counts` : ce que le menu Compétences relit quand on change d'onglet (« Classique », « C.U.R.I.E »), au moment du clic.
  createFilterUI(elements.filtersContainer, state.filterReferenceMaps, state.activeFilters,
    { onToggle: toggleFilter, onToggleGroup: toggleFilterGroup, selection: key => state.activeFilters[key], counts: currentCounts }, currentCounts());
}

// Met les menus d'accord avec ce que Grist a donné et avec les interrupteurs Fondateurs/Partenaires :
// la liste des établissements est restreinte à ceux dont une fiche peut s'afficher, donc elle change
// quand un interrupteur change. Une sélection dont l'option a disparu (libellé supprimé dans Grist,
// établissement que les interrupteurs ne laissent plus voir) est purgée : invisible, elle bloquerait
// les résultats à 0. Reconstruire les menus ferme ceux qui sont ouverts : seulement si leurs libellés
// ont changé. Les cartes se redessinent à part (refreshCards).
function refreshFilterMenus() {
  if (!state.etabFlags) return; // l'annuaire n'est pas encore lu : pas de menu à tenir à jour
  const filterReferenceMaps = {
    ...state.referenceMaps,
    etablissement: filterVisibleEstablishments(state.referenceMaps.etablissement, state.etabFlags, state.scope),
    role: filterableRoles(state.referenceMaps.role, { responsible: state.people?.columns.includes(RESPONSIBLE_COLUMN) === true })
  };
  const menusChanged = !referenceMapsEqual(state.filterReferenceMaps, filterReferenceMaps);
  state.filterReferenceMaps = filterReferenceMaps;
  state.activeFilters = pruneStaleFilters(state.activeFilters, filterReferenceMaps);
  if (menusChanged) rebuildFilterUI();
}

// « Réinitialiser » n'a rien à faire tant qu'aucun filtre n'est coché et que la recherche est vide (les interrupteurs Fondateurs/
// Partenaires n'en dépendent pas) : il se grise (audit UI/UX, U36). `aria-disabled` et non `disabled` : un bouton désactivé perd le
// focus, et le clavier repartirait du haut de la page (comme l'interrupteur de présence, account-ui.js). La frappe compte dès la
// première lettre, avant que la recherche soit appliquée.
function syncResetButton() {
  const idle = elements.searchInput.value.trim() === '' && Object.values(state.activeFilters).every(set => set.size === 0);
  if (idle) elements.resetFilters.setAttribute('aria-disabled', 'true');
  else elements.resetFilters.removeAttribute('aria-disabled');
}

function refreshCards() {
  if (!state.loaded) return; // la frappe est gardée (state.searchTerm) : elle s'applique à l'arrivée de l'annuaire
  if (!state.gate.open) return; // l'écran de la personne remplace l'annuaire (refreshGate) : aucune carte n'est dessinée
  const filtered = filterContacts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
  keepFocus(elements.grid, elements.resultCount, () =>
    renderCards(elements.grid, elements.template, filtered, toggleFilter, state.rightsOf, cardLogos(), state.etabRights));
  elements.grid.removeAttribute('aria-busy');
  const count = contactCountText(filtered.length, countInScope(state.allContacts, state.scope));
  elements.resultCount.textContent = count;
  scrollTools.setCount(count);
  if (filtered.length === 0) emptyState.show(describeEmptyResults(state.allContacts, state.activeFilters, state.searchTerm, state.scope));
  else emptyState.hide();
  updateFilterCounts(elements.filtersContainer, currentCounts());
  syncResetButton();
  reportLogosLater();
}

// La bulle du rôle dans une tâche, un seul écouteur lui aussi (render.js), et les flèches qui parcourent les pastilles d'une carte.
attachTagNotes(elements.grid);
attachTagNavigation(elements.grid);

// Le lien d'évitement (index.html) amène le focus à la première carte ; sans ce code, l'ancre `#cardsGrid` y amène déjà la page.
elements.skipLink.addEventListener('click', event => {
  event.preventDefault();
  focusFirstResult(elements.grid, elements.resultCount);
});

// Un seul écouteur pour tous les boutons « Modifier » et les photos à agrandir : les cartes sont
// reconstruites à chaque filtre. Les cartes étant redessinées après un enregistrement, le focus revient
// au bouton de la même fiche et non à celui, disparu, qui a ouvert la fenêtre ; quand la fiche n'est plus
// dans l'annuaire (un administrateur vient de la masquer), au nombre de résultats, d'où l'on retrouve les cartes.
elements.grid.addEventListener('click', event => {
  const zoom = event.target.closest('.avatar-zoom');
  if (zoom) {
    photoViewer.open({ photo: Number(zoom.dataset.photo), name: zoom.dataset.name, detail: zoom.dataset.detail });
    return;
  }
  const edit = event.target.closest('.card-edit');
  if (edit) {
    const rowId = Number(edit.dataset.rowId);
    openProfile(rowId, () => (elements.grid.querySelector(`.card-edit[data-row-id="${rowId}"]`) ?? elements.resultCount).focus());
    return;
  }
  const etabEdit = event.target.closest('.etab-edit');
  if (etabEdit) {
    const etabId = Number(etabEdit.dataset.etabId);
    openEtablissement([etabId], returnToEtablissementButton(etabId, Number(etabEdit.dataset.rowId)));
  }
});

// La frappe n'est appliquée qu'après SEARCH_DELAY_MS sans nouvelle lettre : un mot de six
// lettres ne redessine la liste qu'une fois. Un champ vidé (Échap, croix du champ) l'est tout de
// suite : il n'y a rien à attendre. « Réinitialiser » annule l'attente en cours.
let searchTimer = null;

function applySearch() {
  clearTimeout(searchTimer);
  state.searchTerm = elements.searchInput.value.trim();
  refreshCards();
}

elements.searchInput.addEventListener('input', () => {
  syncResetButton();
  clearTimeout(searchTimer);
  if (elements.searchInput.value.trim() === '') applySearch();
  else searchTimer = setTimeout(applySearch, SEARCH_DELAY_MS);
});

elements.scopeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const key = button.dataset.scope;
    state.scope[key] = !state.scope[key];
    button.classList.toggle('active', state.scope[key]);
    button.setAttribute('aria-pressed', String(state.scope[key]));
    refreshFilterMenus();
    refreshCards();
  });
});

elements.resetFilters.addEventListener('click', () => {
  if (elements.resetFilters.getAttribute('aria-disabled') === 'true') return;
  Object.values(state.activeFilters).forEach(set => set.clear());
  clearTimeout(searchTimer);
  state.searchTerm = '';
  elements.searchInput.value = '';
  // Fondateurs/Partenaires ne sont volontairement pas remis à zéro. Les menus
  // sont reconstruits pour vider aussi leur champ de recherche interne.
  rebuildFilterUI();
  refreshCards();
});

document.addEventListener('click', () => closeFilterMenus());

// Les cartes déjà affichées (chargement précédent réussi) restent en place. Le bandeau offre « Réessayer » : après une panne passagère, c'est
// le geste qui répare, et rien d'autre ne l'offrait (audit UI/UX, U30).
let retried = false;

function showLoadError(error) {
  statusBanner.show([describeLoadFailure(error, { retried })], { label: 'Réessayer', run: retryLoad });
  if (state.allContacts.length === 0) elements.resultCount.textContent = 'Chargement impossible';
  elements.grid.removeAttribute('aria-busy');
  if (!state.people) accountBar.hide(); // sans annuaire, pas de bandeau : sa place réservée n'a plus de raison d'être
}

// « Réessayer » : relit l'annuaire. Le bouton dit qu'il travaille ; une nouvelle panne le rend avec un message qui le dit ; une
// réussite retire le bandeau, donc le bouton : le focus passe au compteur au lieu de se perdre.
async function retryLoad() {
  statusBanner.busy('Nouvelle tentative…');
  retried = true;
  const outcome = await reloadDirectory();
  if (outcome !== 'failed') retried = false;
  if (outcome === 'applied') elements.resultCount.focus();
}

// onRecords se redéclenche à chaque édition dans Grist. Le debounce absorbe les
// rafales (sauf le premier appel, celui du chargement, qui part tout de suite) ; le
// sequencer écarte le résultat d'une lecture lente quand une plus récente a déjà démarré.
const recordsSequencer = createRequestSequencer();

window.grist.ready({ requiredAccess: 'full' });

// Les logos sont un habillage : une erreur ici ne doit jamais empêcher les cartes
// de s'afficher.
let brandingNote = '';
function applyBranding({ etablissementRows }) {
  try {
    state.branding = buildBranding({ etablissementRows });
    brandingUI.render(state.branding);
    // Une ligne dans la console, relue seulement quand elle change : la version qui s'exécute (le cache de GitHub Pages
    // peut en garder une ancienne dix minutes) et ce que Grist donne des logos.
    const note = `[LOGOS] Version ${VERSION} : ${brandingSummary(state.branding)}.`;
    if (note !== brandingNote) console.info(brandingNote = note);
  } catch (error) {
    console.error('[LOGOS] Impossible d\'afficher les logos :', error);
  }
}

function applyDirectory({ contacts, referenceMaps, etabFlags, people, etablissementRows }) {
  state.loaded = true;
  state.referenceMaps = referenceMaps;
  state.etabFlags = etabFlags;
  state.allContacts = contacts;
  state.people = people;
  state.etablissementRows = etablissementRows ?? [];
  applyBranding({ etablissementRows });
  refreshGate();
  refreshFilterMenus();
  refreshCards();
  refreshAccount();
  requestsDialog?.refresh();
  departureDialog?.refresh();
  accountBar.clearStale();
  ensureColumns();
}

// Relit Grist et met l'affichage à jour. Renvoie 'applied', 'stale' (une lecture
// plus récente a pris le relais) ou 'failed' (le bandeau d'état le dit).
//
// onRecords() ne sert qu'à savoir quand rafraîchir : son contenu ne porte pas
// forcément toutes les colonnes de BDD (selon la vue branchée) et résout les
// Références en texte, alors que fetchTable() renvoie la table complète, les
// Références en identifiants.
async function reloadDirectory() {
  // Un visiteur sans compte ne verra pas l'annuaire (gate.js) et Grist le lui refuse d'ordinaire : le lire ne ferait qu'ajouter un bandeau d'erreur
  // derrière la fenêtre de connexion (1.45.2).
  if (state.identity?.status === 'anonymous') return 'stale';
  const requestId = recordsSequencer.next();
  try {
    const directory = await loadDirectory(window.grist.docApi, { previousMaps: state.referenceMaps });
    if (!recordsSequencer.isLatest(requestId)) return 'stale'; // une invocation plus récente a démarré : résultat périmé
    state.directoryFailed = false;
    state.directoryRefused = false;
    applyDirectory(directory);
    statusBanner.show(directory.issues);
    return 'applied';
  } catch (error) {
    if (!recordsSequencer.isLatest(requestId)) return 'stale';
    console.error('Erreur dans le traitement des contacts:', error);
    showLoadError(error);
    // Sans annuaire lu, un compte qui n'est ni administrateur ni responsable lit « Annuaire illisible » au lieu d'un écran qui attend (gate.js, 1.45.2).
    state.directoryFailed = true;
    state.directoryRefused = isAccessRefused(error);
    refreshGate();
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

const isAdmin = () => state.identity?.status === 'ready' && state.identity.admin === true;

// La colonne `Taches_responsable` de BDD (1.40.0) : la case « Responsable de » de la fenêtre de profil n'existe que si elle est là. Quand
// elle manque, le widget la crée, une seule fois par chargement et seulement quand un administrateur a ouvert l'annuaire (c'est lui qui a le
// droit de changer la structure du document, voir GRIST_SETUP.md étape 1) et que BDD et Taches ont de quoi la remplir. Grist la refuse-t-il,
// la console le dit et la case n'est pas proposée ; l'annuaire, lui, ne change pas. L'annuaire est relu une fois la colonne créée.
let responsibleColumnTried = false;
async function ensureResponsibleColumn() {
  if (responsibleColumnTried || !isAdmin() || !state.people) return;
  const columns = state.people.columns;
  if (columns.includes(RESPONSIBLE_COLUMN) || !columns.includes(CATEGORIES.taches.column)) return;
  if (Object.keys(state.referenceMaps?.taches ?? {}).length === 0) return;
  responsibleColumnTried = true;
  const failure = await createResponsibleColumn(window.grist.docApi);
  if (failure) console.info(`[SCHEMA] ${failure}`);
  else await reloadDirectory();
}

// La colonne `En_attente_validation` de BDD (1.45.0) : sans elle, personne ne peut demander de fiche (profile-save.js refuse plutôt que de
// publier sans validation). Créée comme `Taches_responsable`, par un administrateur qui ouvre l'annuaire, une fois par chargement.
let pendingColumnTried = false;
async function ensurePendingColumn() {
  if (pendingColumnTried || !isAdmin() || !state.people) return;
  if (state.people.hasPendingColumn || !state.people.hasEmailColumn) return;
  pendingColumnTried = true;
  const failure = await createPendingColumn(window.grist.docApi);
  if (failure) console.info(`[SCHEMA] ${failure}`);
  else await reloadDirectory();
}

// La colonne `Fiche_desactivee` de BDD (1.46.0) : sans elle, le départ d'un·e collègue n'est pas proposé (departure-ui.js). Créée comme les deux autres,
// par un administrateur qui ouvre l'annuaire, une fois par chargement.
let deactivatedColumnTried = false;
async function ensureDeactivatedColumn() {
  if (deactivatedColumnTried || !isAdmin() || !state.people) return;
  if (state.people.hasDeactivatedColumn || !state.people.hasEmailColumn) return;
  deactivatedColumnTried = true;
  const failure = await createDeactivatedColumn(window.grist.docApi);
  if (failure) console.info(`[SCHEMA] ${failure}`);
  else await reloadDirectory();
}

function ensureColumns() {
  ensureResponsibleColumn();
  ensurePendingColumn();
  ensureDeactivatedColumn();
}

// Qui voit l'annuaire (gate.js). Fermé, l'écran de la personne prend la place de la recherche, des filtres et des cartes (gate-ui.js) et le
// compteur du titre dit où elle en est. Ce n'est qu'un contrôle d'interface : ce que Grist donne au widget, ce sont ses règles d'accès qui le
// décident (GRIST_SETUP.md).
function refreshGate() {
  const gate = gatePanel
    ? describeGate({ identity: state.identity, people: state.people, etablissementRows: state.etablissementRows, directoryFailed: state.directoryFailed, directoryRefused: state.directoryRefused })
    : { open: true };
  state.gate = gate;
  if (gate.open) {
    gatePanel?.hide();
    return;
  }
  // « checking » n'est qu'une attente : la console ne dit rien. Les autres écrans disent pourquoi l'annuaire est fermé (fermé par défaut, 1.45.2).
  if (gate.kind !== 'checking') {
    warnOnce(`gate-${gate.kind}`, `[IDENTITE] L'annuaire n'est pas montré à cette personne (${gate.kind}${identityReason()}) : voir GRIST_SETUP.md, règles d'accès.`);
  }
  gatePanel.show(gate);
  accountBar.hide(); // ni bandeau ni place réservée sous un écran fermé : l'écran dit déjà où en est la personne
  if (gate.kind === 'anonymous') statusBanner.show([]); // une lecture ratée avant que l'identité soit connue : le bandeau d'erreur n'a plus de raison d'être
  elements.grid.replaceChildren();
  elements.grid.removeAttribute('aria-busy');
  emptyState.hide();
  elements.resultCount.textContent = gate.count;
}
refreshGate(); // dès l'ouverture : l'annuaire est fermé tant que l'identité n'est pas lue

// Pourquoi l'identité n'a pas pu être lue, pour la ligne de console de refreshGate (jamais l'adresse : elle ne va pas dans la console).
function identityReason() {
  const reason = state.identity?.reason;
  return reason && state.identity.status !== 'ready' ? ` ; identité : ${reason}` : '';
}

// Les établissements dont la personne connectée est responsable (identifiants de ligne).
const myEtablissements = () => (state.identity?.status === 'ready' ? state.identity.etablissements : []);

// Le bandeau de la personne connectée. Sans identité (pas de table-sonde, compte Lecteur…) il
// reste masqué ; tant que l'identité ou l'annuaire manque encore, sa place reste réservée
// (accountBar.pending). Une adresse qui ne figure pas dans BDD le dit, au lieu de disparaître
// sans explication : un administrateur y trouve quand même son « mode admin ».
function refreshAccount() {
  if (state.identity && state.identity.status !== 'ready') {
    accountBar.hide();
    return;
  }
  if (!state.identity || !state.people) return;
  if (!state.gate.open) {
    accountBar.hide(); // l'écran de la personne dit où elle en est (refreshGate)
    return;
  }
  const persons = myPersons();
  const admin = isAdmin();
  // Un administrateur voit le nombre de demandes en pastille sur « Mode admin », éteint ou non, et « Demandes à valider » une fois le mode allumé.
  const adminActions = { admin, adminMode: state.adminMode, pending: admin ? state.people.pendingRequests().length : 0, requests: state.adminMode };
  if (persons.length === 0) {
    warnOnce('no-row', state.people.hasEmailColumn
      ? '[IDENTITE] Aucune ligne de BDD ne porte l\'adresse de la personne connectée : pas de bouton « Modifier mon profil ».'
      : '[IDENTITE] BDD n\'a pas de colonne « email » : impossible de relier la personne connectée à sa fiche.');
    accountBar.show(describeUnknownAccount({ email: state.identity.email, admin, emailColumn: state.people.hasEmailColumn }));
    // Sans colonne « email », la fiche créée ne pourrait pas être reliée à la personne : rien à proposer.
    accountBar.setActions({ create: state.people.hasEmailColumn, etab: myEtablissements().length > 0, ...adminActions });
    return;
  }
  // La seule fiche de la personne est une demande en attente : ni interrupteur ni fiche à modifier tant qu'un administrateur ne l'a pas validée
  // (seul un administrateur arrive jusqu'ici : les autres personnes ont l'écran de refreshGate).
  // Une fiche désactivée (1.46.0) ne se modifie pas non plus : le bandeau le dit, sans interrupteur.
  if (persons.every(person => person.status.pending || person.status.deactivated)) {
    const describe = persons[0].status.deactivated ? describeDeactivated : describePending;
    accountBar.show(describe({ name: persons[0].name, initials: initials(persons[0].row), photo: avatarIdOf(persons[0].row.Avatar) }));
    accountBar.setActions({ etab: myEtablissements().length > 0, ...adminActions });
    return;
  }
  if (persons.length > 1) {
    warnOnce('duplicates', `[IDENTITE] ${persons.length} lignes de BDD portent la même adresse (identifiants de ligne : `
      + `${persons.map(person => person.row.id).join(', ')}) : le choix de présence s'applique à toutes, `
      + 'le bouton « Modifier mon profil » n\'est pas proposé (chaque carte garde le sien).');
  }
  accountBar.show({
    name: persons[0].name || 'Ma fiche',
    initials: initials(persons[0].row),
    photo: avatarIdOf(persons[0].row.Avatar),
    ...describePresence(persons)
  });
  // Plusieurs fiches pour la même adresse : on ne sait pas laquelle ouvrir depuis le bandeau.
  accountBar.setActions({ edit: persons.length === 1, etab: myEtablissements().length > 0, ...adminActions });
}

// Allume ou éteint le « mode admin » : les boutons « Modifier la fiche » des autres cartes
// n'existent que pendant qu'il est allumé. Réservé aux administrateurs.
function toggleAdminMode() {
  if (!isAdmin()) return;
  state.adminMode = !state.adminMode;
  state.rightsOf = rightsFor(state.identity, { adminMode: state.adminMode });
  elements.adminStrip.hidden = !state.adminMode;
  refreshAccount();
  refreshCards();
}

// Les demandes de fiche en attente, lues dans l'annuaire, avec ce qui aide à décider (requests.js).
function currentRequests() {
  return describeRequests(state.people?.pendingRequests() ?? [], state.etablissementRows);
}

// La phrase qui confirme une décision (requests-ui.js la lit sous le titre de la fenêtre), d'après ce que requests.js a fait.
function requestMessage(result, request) {
  const who = request.name;
  if (result.status === 'validated') return `La fiche de ${who} est validée.`;
  if (result.status === 'refused') return `La demande de ${who} est refusée et supprimée.`;
  return `La demande de ${who} n'était plus à traiter : un autre administrateur s'en est occupé.`;
}

// Valide ou refuse une demande, puis relit l'annuaire. Fermé par défaut : seulement un administrateur qui a allumé le mode admin ; Grist, lui,
// n'écrit que si ses règles d'accès le permettent. Les erreurs attendues (RequestError) portent une phrase française, les autres sont consignées.
async function decideRequest(kind, request) {
  if (!isAdmin() || !state.adminMode) throw new Error('Seul un administrateur en mode admin peut traiter une demande.');
  let result;
  try {
    result = kind === 'approve'
      ? await approveRequest(window.grist.docApi, request)
      : await refuseRequest(window.grist.docApi, request);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    console.error('[PROFIL] Erreur inattendue :', error);
    throw new Error('La demande n\'a pas pu être traitée. Le détail est dans la console du navigateur.');
  }
  const outcome = await reloadDirectory();
  const stale = outcome === 'failed' ? ' L\'annuaire n\'a pas pu être rechargé : la liste n\'est peut-être plus à jour.' : '';
  return { message: requestMessage(result, request) + stale };
}

// Le bouton « Demandes à valider » (mode admin).
function openRequests() {
  if (!isAdmin() || !state.adminMode || !requestsDialog) return;
  requestsDialog.open(() => { if (!accountBar.focusRequests()) elements.searchInput.focus(); });
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
    const accepted = !persons.every(person => person.status.accepted);
    await setPresence(window.grist.docApi, persons, accepted);
    // Grist a enregistré le choix : l'interrupteur le montre même si la relecture échoue, et un deuxième clic écrit le contraire.
    state.people.rememberConsent(persons.map(({ row }) => row.id), accepted);
    const outcome = await reloadDirectory();
    if (outcome === 'failed') {
      refreshAccount();
      accountBar.setStatus('Modification enregistrée ; l\'annuaire n\'a pas pu être rechargé.', 'stale');
    } else accountBar.announce(accepted
      ? 'Modification enregistrée. Vous avez accepté d\'apparaître dans l\'annuaire.'
      : 'Modification enregistrée. Vous n\'apparaissez plus dans l\'annuaire.');
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
function applyIdentity(identity) {
  state.identity = identity;
  state.rightsOf = rightsFor(identity, { adminMode: state.adminMode });
  state.etabRights = etablissementRightsFor(identity);
  refreshGate();
  refreshAccount();
  refreshCards(); // les boutons « Modifier » apparaissent sur les cartes concernées
  ensureColumns();
  if (identity.status === 'anonymous') offerLogin(); // un visiteur sans compte : la fenêtre qui mène à la connexion de Grist
}

// Fermé par défaut (1.45.2) : tant que l'identité n'est pas lue, l'annuaire reste derrière l'écran « Vérification de votre accès ». Une réponse de Grist
// qui ne vient jamais ne doit pas le laisser là pour toujours : passé IDENTITY_WAIT_MS, la personne est « non reconnue » (écran qui le dit) ; si
// l'identité arrive ensuite, elle prend la place.
const identityTimer = setTimeout(() => {
  if (!state.identity) applyIdentity({ status: 'unavailable', email: '', admin: false, etablissements: [], reason: 'Grist n\'a pas répondu à temps' });
}, IDENTITY_WAIT_MS);
readIdentity(window.grist.docApi, { readOnly: READ_ONLY }).then(identity => {
  clearTimeout(identityTimer);
  applyIdentity(identity);
});

// ===== Modifier une fiche =====

// Ce que la personne lit d'une erreur d'une fenêtre : une erreur attendue (`Expected`, ProfileSaveError ou EtablissementSaveError) porte une
// phrase française ; toute autre est consignée dans la console (`[tag]`) et remplacée par une phrase générale. Un fichier envoyé à Grist
// pour rien (`leftover`) est dit, à la suite de la phrase.
const PHOTO_LEFTOVER = 'Le fichier de la nouvelle photo, déjà envoyé à Grist, reste dans les pièces jointes du document sans servir.';
const LOGO_LEFTOVER = 'Le fichier du nouveau logo, déjà envoyé à Grist, reste dans les pièces jointes du document sans servir.';
const userFacingError = (Expected, tag, leftover) => error => {
  if (error instanceof Expected) return error.leftover ? new Error(`${error.message} ${leftover}`) : error;
  console.error(`[${tag}] Erreur inattendue :`, error);
  return new Error('L\'opération n\'a pas pu aboutir. Le détail est dans la console du navigateur.');
};
const userFacing = userFacingError(ProfileSaveError, 'PROFIL', PHOTO_LEFTOVER);
const userFacingEtab = userFacingError(EtablissementSaveError, 'FICHE-ETAB', LOGO_LEFTOVER);

// Lance une opération d'une fenêtre (`run`) ; ses erreurs deviennent des phrases pour la personne (`toSentence` : userFacing, userFacingEtab).
async function speaking(toSentence, run) {
  try {
    return await run();
  } catch (error) {
    throw toSentence(error);
  }
}

// Une adresse e-mail qu'une AUTRE fiche que `rowId` porte déjà (d'après l'annuaire lu) :
// le nom de la personne quand sa fiche figure dans l'annuaire (on le voit déjà), sinon
// simplement vrai : le nom d'une fiche masquée ne se dévoile pas.
const emailTakenElsewhere = rowId => email => {
  const other = state.people?.findByEmail(email).find(person => person.row.id !== rowId);
  if (!other) return false;
  return other.status.visible && other.name ? other.name : true;
};

// La confirmation d'un enregistrement, en bas de l'écran. Le message visible est masqué aux
// lecteurs d'écran : une zone `status` toujours présente le leur annonce, ce qu'un élément
// qui apparaît d'un coup ne garantit pas.
const TOAST_DURATION = 6000;
let toastTimer = 0;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  elements.toastLive.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
    elements.toastLive.textContent = '';
  }, TOAST_DURATION);
}

// Le nom complet de l'établissement d'une carte (l'acronyme à défaut), pour les phrases des fenêtres.
function etablissementName(contact) {
  const names = state.referenceMaps[ETABLISSEMENT_NAMES] || {};
  return names[String(refId(contact.Etablissement))] || contact.etablissement_label;
}

// La mise en garde sous le champ « Établissement » du formulaire : un établissement qui n'a
// pas validé sa présence (Etablissements.ok_pour_apparaitre) ne laisse voir aucune de ses fiches.
function etablissementWarning(id) {
  const flags = state.etabFlags?.byId?.[String(id)];
  return flags && flags.ok_pour_apparaitre !== true
    ? 'Cet établissement n’a pas validé sa présence : la fiche ne sera pas visible dans l’annuaire.'
    : '';
}

// Ce que le brouillon change (de quoi activer le bouton) et pourquoi il serait refusé.
// `admin` : un administrateur modifie la fiche d'une autre personne (e-mail et établissement compris).
// `creating` : la personne remplit sa propre fiche, qui n'existe pas encore (établissement compris).
function evaluateDraft(row, draft, admin, creating = false) {
  const { champs, errors, fieldErrors } = diffProfile(row, draft, state.referenceMaps, { admin, creating, emailTaken: emailTakenElsewhere(row.id) });
  return { errors, fieldErrors, lines: describeChanges(champs) };
}

// Prépare la relecture (profile-save.js) : rien n'est écrit. `row` est la fiche telle que
// le formulaire l'a montrée.
function reviewProfile(row, draft, admin) {
  return speaking(userFacing, () =>
    prepareReview(window.grist.docApi, row, draft, { referenceMaps: state.referenceMaps, etabFlags: state.etabFlags, admin }));
}

// Écrit ce que la personne a relu. Si la fiche a changé dans Grist depuis la relecture,
// rien n'est écrit : la personne relit d'abord ce qui s'y trouve. Sinon l'annuaire est
// relu, et on vérifie que Grist a gardé ce qu'on lui a demandé.
async function saveReviewed(row, review, draft, admin) {
  const result = await speaking(userFacing, () => saveProfile(window.grist.docApi, review, {
    upload: file => uploadAttachment(window.grist.docApi, file, { hint: PHOTO_UPLOAD_HINT })
  }));
  if (result.status === 'changed') {
    return {
      status: 'changed',
      review: await reviewProfile(row, draft, admin),
      notice: 'La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau.'
        + (result.leftover ? ` ${PHOTO_LEFTOVER}` : '')
    };
  }
  const outcome = await reloadDirectory();
  const saved = outcome === 'applied' ? state.people?.findById(review.rowId)?.row : null;
  const leftovers = saved ? unsavedLabels(review, saved, state.referenceMaps, { attachmentId: result.attachmentId }) : [];
  return { status: 'saved', lines: review.lines, leftovers, reloaded: outcome !== 'failed' };
}

// L'établissement d'une fiche dans le bloc d'identité de la fenêtre de modification : son logo
// quand Grist en a un, sinon (ou si le fichier ne se charge pas) son nom en pastille.
function etablissementBadge(row, label) {
  const pill = () => {
    const node = document.createElement('span');
    node.className = 'et-pill';
    node.textContent = label;
    return node;
  };
  const brand = attachments && state.branding ? logoForContact(state.branding, row) : null;
  if (!brand?.logo) return pill();
  const holder = document.createElement('span');
  holder.className = 'et-logo';
  holder.title = brand.name;
  holder.append(createLogoImage(attachments, brand.logo, label, () => holder.replaceWith(pill()), { eager: true, preload: true }));
  return holder;
}

// L'avatar rond d'une personne dans les fenêtres : sa photo de Grist, celle qu'elle vient de choisir
// ({ url }) ou ses initiales.
const renderAvatar = ({ initials: letters, photo }) => createAvatar({ initials: letters, photo, attachments });

// Ouvre la fenêtre de modification de la fiche `rowId`, si la personne connectée en a le
// droit : la sienne, ou n'importe laquelle pour une administratrice. Fermé par défaut.
// `returnFocus` redonne le focus à l'endroit d'où la fenêtre a été ouverte, à sa fermeture.
function openProfile(rowId, returnFocus) {
  const person = state.people?.findById(rowId);
  const rights = person ? state.rightsOf(person.row) : null;
  if (!rights) return;
  const { row } = person;
  // L'e-mail et l'établissement ne se changent que depuis la fiche d'une autre personne.
  const admin = rights === 'admin';
  const model = profileFormModel(row, state.referenceMaps, { admin, etabFlags: state.etabFlags });
  profileDialog.open({
    mode: rights,
    viewerAdmin: isAdmin(),
    person: { name: person.name || 'Sans nom', email: text(row.email), initials: initials(row), photo: avatarIdOf(row.Avatar) },
    etablissement: person.etablissement,
    model,
    draft: draftOf(model),
    evaluate: draft => evaluateDraft(row, draft, admin),
    review: draft => reviewProfile(row, draft, admin),
    hiddenNotice: review => describeHiddenFiche(review.visibility, {
      own: rights === 'own', etablissement: etablissementName(review.after), withdrawn: review.champs?.Accepte_apparaitre?.apres === false
    }),
    fieldWarning: (key, value) => (key === 'Etablissement' ? etablissementWarning(value) : ''),
    save: (review, draft) => saveReviewed(row, review, draft, admin),
    renderCard: (contact, marks) => renderPreviewCard(elements.template, contact, marks, cardLogos()),
    renderAvatar,
    renderThumb: (photo, label) => createThumb({
      photo,
      attachments,
      label,
      onOpen: () => photoViewer.open({ photo, name: person.name || 'Sans nom', detail: label })
    }),
    renderEtablissement: label => etablissementBadge(row, label),
    notify: showToast,
    onClose: returnFocus
  });
}

// Le bouton « Modifier mon profil » du bandeau : la fiche de la personne connectée.
function openOwnProfile() {
  const persons = myPersons();
  if (persons.length === 1) openProfile(persons[0].row.id, () => accountBar.focusEdit());
}

// ===== Créer sa fiche =====

// Prépare la relecture de la fiche à créer (profile-save.js) : rien n'est écrit. `blank` : la fiche vide
// que le formulaire a montrée.
function reviewCreation(blank, draft) {
  return speaking(userFacing, () => prepareCreation(window.grist.docApi, blank, draft, {
    email: state.identity.email, referenceMaps: state.referenceMaps, etabFlags: state.etabFlags, admin: isAdmin()
  }));
}

// Ajoute la fiche à BDD, puis relit l'annuaire : le bandeau montre alors l'interrupteur et « Modifier mon
// profil », on vérifie que Grist a gardé ce qu'on lui a demandé, et le message de fin dit si la fiche apparaît
// (publier n'est pas afficher : voir describeCreated).
async function saveCreation(review) {
  const result = await speaking(userFacing, () => createProfile(window.grist.docApi, review));
  const outcome = await reloadDirectory();
  const saved = outcome === 'applied' && result.rowId !== null ? state.people?.findById(result.rowId) : null;
  const leftovers = saved ? unsavedLabels(review, saved.row, state.referenceMaps) : [];
  return {
    status: 'saved',
    lines: review.lines,
    leftovers,
    reloaded: outcome !== 'failed',
    notice: describeCreated(saved?.status ?? null, review.accepted, { pending: review.pending !== false })
  };
}

// Le bouton « Créer ma fiche » du bandeau : la personne connectée n'a aucune ligne dans BDD. Elle remplit la
// même fenêtre que pour modifier sa fiche, et choisit en plus son établissement ; son e-mail est celui de son
// compte. La fiche est une ligne ajoutée à BDD, jamais une table. Fermé par défaut : seulement sans fiche. Depuis la 1.45.0 la fiche est une
// demande qu'un administrateur valide, et la personne n'en choisit que parmi les établissements dont un domaine est celui de son adresse
// (gate.js : l'écran « create » les donne) ; un administrateur crée la sienne sans l'un ni l'autre.
function openCreation() {
  if (state.identity?.status !== 'ready' || !state.people?.hasEmailColumn || myPersons().length > 0) return;
  const admin = isAdmin();
  if (!admin && state.gate.kind !== 'create') return;
  const email = state.identity.email;
  const blank = blankFiche(state.people.columns, text(email));
  const model = profileFormModel(blank, state.referenceMaps, {
    creating: true, etabFlags: state.etabFlags, allowedEtablissements: admin ? null : state.gate.allowed
  });
  profileDialog.open({
    mode: 'create',
    validation: !admin,
    viewerAdmin: admin,
    person: { name: 'Nouvelle fiche', email, initials: '+' },
    etablissement: '',
    model,
    // « Apparaître dans l'annuaire » est cochée d'avance : « Publier ma fiche ».
    draft: { ...draftOf(model), [CONSENT_COLUMN]: true },
    evaluate: draft => evaluateDraft(blank, draft, false, true),
    review: draft => reviewCreation(blank, draft),
    hiddenNotice: review => describeHiddenFiche(review.visibility, { own: true, creating: true }),
    fieldWarning: (key, value) => (key === 'Etablissement' ? etablissementWarning(value) : ''),
    save: review => saveCreation(review),
    renderCard: (contact, marks) => renderPreviewCard(elements.template, contact, marks, cardLogos()),
    renderAvatar,
    notify: showToast,
    // La fiche créée, c'est « Modifier mon profil » qui reprend le focus ; sinon le bouton qui a ouvert la fenêtre.
    onClose: () => { if (!accountBar.focusEdit() && !accountBar.focusCreate() && !gatePanel?.focusAction()) elements.resultCount.focus(); }
  });
}

// ===== Modifier un établissement =====

// La personne qui porte cette adresse, pour la liste des responsables : son nom seulement si sa fiche
// figure dans l'annuaire (un nom qu'on voit déjà ne dévoile rien), sinon on dit juste qu'elle existe.
function lookupPerson(email) {
  const found = state.people?.findByEmail(email) ?? [];
  if (found.length === 0) return null;
  const shown = found.find(person => person.status.visible && person.name);
  return shown ? { name: shown.name, initials: initials(shown.row), photo: avatarIdOf(shown.row.Avatar) } : { hidden: true };
}

// Ce que la fenêtre montre de l'établissement : la fiche lue dans Grist (readEtablissement) et, de
// l'annuaire, les personnes qu'on peut nommer et ce que cacherait un établissement décoché.
function ficheOf({ row, etablissement, responsables }) {
  const { candidates, warning, departure, meEmail } = peopleInfo(etablissement.id);
  return {
    row,
    etablissement,
    responsables: responsables === null ? null : responsables.map(({ email }) => ({ email })),
    candidates,
    warning,
    departure,
    meEmail
  };
}

// L'adresse de la personne connectée (vide tant qu'elle n'est pas identifiée).
const myEmail = () => (state.identity?.status === 'ready' ? normalizeEmail(state.identity.email) : '');

// Ce que l'annuaire dit des personnes de l'établissement `etablissementId` : celles qu'on peut nommer, ce que cacherait un établissement décoché et,
// depuis la 1.46.0, combien de fiches y sont désactivées. Relu à chaque appel : la fenêtre du départ le redemande après chaque écriture.
function peopleInfo(etablissementId) {
  const meEmail = myEmail();
  const { candidates, hidden, includesMe } = peopleOfEtablissement(state.allContacts, etablissementId, meEmail, initials);
  return {
    candidates,
    warning: { hidden, includesMe },
    departure: { departed: state.people?.deactivatedOf(etablissementId).length ?? 0 },
    meEmail
  };
}

const loadFiche = id => speaking(userFacingEtab, async () => ficheOf(await readEtablissement(window.grist.docApi, id)));

// Le logo actuel de l'établissement, comme sur ses cartes ; le sigle en pastille quand le fichier ne
// se charge pas.
function etablissementLogo({ etablissement }) {
  const id = etablissement.logo[0];
  if (!id) return null;
  const pill = document.createElement('span');
  pill.className = 'et-pill';
  pill.textContent = etablissement.acronym;
  const image = createLogoImage(attachments, id, `Logo de ${etablissement.name || etablissement.acronym}`, () => image.replaceWith(pill), { eager: true, preload: true });
  return image;
}

// Relit l'identité après un changement de responsables : les droits en dépendent. Une relecture qui
// échoue laisse l'identité d'avant, que Grist a bien reconnue.
async function refreshIdentity() {
  const identity = await readIdentity(window.grist.docApi, { readOnly: READ_ONLY });
  if (identity.status === 'ready') applyIdentity(identity);
}

// Écrit ce que la personne a changé (etablissement-save.js). Si la fiche a changé dans Grist depuis
// l'ouverture de la fenêtre, rien n'est écrit : la fenêtre reprend l'état actuel en gardant la saisie.
async function saveFiche(draft, fiche) {
  const { id } = fiche.etablissement;
  const diff = diffEtablissement(fiche.etablissement, draft, { readable: fiche.responsables !== null });
  if (diff.errors.length > 0 || diff.labels.length === 0) {
    throw new Error('Il n\'y a rien à enregistrer : corrigez les champs signalés ou modifiez la fiche.');
  }
  const file = draft.logo.action === 'replace' ? draft.logo.file : null;
  const plan = savePlanOf(fiche.row, diff.champs, { file, responsable: state.etabRights(id) });
  const result = await speaking(userFacingEtab, () =>
    saveEtablissement(window.grist.docApi, plan, { upload: sent => uploadAttachment(window.grist.docApi, sent) }));
  if (result.status === 'changed') {
    const { row, acl } = result.state;
    return {
      status: 'changed',
      fiche: ficheOf({ row, etablissement: etablissementOf(row), responsables: acl === null ? null : responsablesOf(acl, id) }),
      notice: `La fiche a changé dans Grist pendant que la fenêtre était ouverte (${result.moved.join(', ')}). `
        + 'Ce que vous avez saisi est conservé : relisez-le, puis enregistrez à nouveau.'
        + (result.leftover ? ` ${LOGO_LEFTOVER}` : '')
    };
  }
  if (diff.champs.responsables) await refreshIdentity();
  const outcome = await reloadDirectory();
  return { status: 'saved', unsaved: result.unsaved ?? [], reloaded: outcome !== 'failed' };
}

// Où rendre le focus quand la fenêtre se ferme : le bouton de la même carte (les cartes sont
// redessinées après un enregistrement), sinon un autre bouton du même établissement, le raccourci du
// bandeau ou, à défaut, la recherche (un responsable qui s'est retiré n'a plus de bouton).
const returnToEtablissementButton = (etabId, rowId) => () => {
  const buttons = elements.grid.querySelectorAll(`.etab-edit[data-etab-id="${etabId}"]`);
  const target = [...buttons].find(node => node.dataset.rowId === String(rowId)) ?? buttons[0];
  if (target) target.focus();
  else if (!accountBar.focusEtab()) elements.searchInput.focus();
};

// Ouvre la fiche d'un établissement, ou la liste de ceux qu'il faut départager. Fermé par défaut :
// seuls les établissements dont la personne est responsable.
function openEtablissement(ids, onClose) {
  const names = state.referenceMaps[ETABLISSEMENT_NAMES] || {};
  const labels = state.referenceMaps.etablissement || {};
  const choices = ids.filter(id => state.etabRights(id)).map(id => ({
    id,
    acronym: labels[String(id)] || names[String(id)] || `Établissement ${id}`,
    name: names[String(id)] || ''
  }));
  if (choices.length === 0) return;
  etablissementDialog.open({
    choices,
    load: loadFiche,
    people: id => {
      const { candidates, warning, departure } = peopleInfo(id);
      return { candidates, warning, departure };
    },
    openDeparture: departureDialog ? openDeparture : undefined,
    lookup: lookupPerson,
    renderAvatar,
    renderLogo: etablissementLogo,
    save: saveFiche,
    notify: showToast,
    onClose
  });
}

// ===== Le départ d'un·e collègue =====

const userFacingDeparture = userFacingError(DepartureError, 'DEPART', '');
const photoOf = row => avatarIdOf(row.Avatar);

// Les personnes que la fenêtre du départ montre pour l'établissement `etablissementId` (departure.js).
const departureLists = etablissementId => ({
  colleagues: colleaguesOf(state.allContacts, etablissementId, myEmail(), { initialsOf: initials, photoOf }),
  departed: departedOf(state.people?.deactivatedOf(etablissementId) ?? [], { initialsOf: initials, photoOf })
});

// Ouvre la fenêtre du départ d'un·e collègue pour `etablissement` ({ id, acronym }). Fermé par défaut : seulement pour un établissement dont la personne
// est responsable ; chaque écriture le revérifie (departure-save.js). Les écritures relisent l'annuaire, puis `onChanged` prévient la fiche de l'établissement.
function openDeparture(etablissement, { isResponsable, onChanged, onClose }) {
  const { id } = etablissement;
  if (!departureDialog || !state.etabRights(id)) return;
  const responsable = () => state.etabRights(id);
  departureDialog.open({
    etablissement,
    colleagues: () => departureLists(id).colleagues,
    departed: () => departureLists(id).departed,
    get canWrite() { return state.people?.hasDeactivatedColumn === true; },
    isResponsable,
    prepare: request => speaking(userFacingDeparture, () => prepareDeparture(window.grist.docApi,
      { ...request, etablissementId: id, responsable: responsable(), meEmail: myEmail() }, { referenceMaps: state.referenceMaps })),
    apply: async review => {
      const result = await speaking(userFacingDeparture, () => applyDeparture(window.grist.docApi, review));
      if (result.status === 'saved') await reloadDirectory();
      return result;
    },
    reactivate: async person => {
      const result = await speaking(userFacingDeparture, () => reactivateFiche(window.grist.docApi, { id: person.id, etablissementId: id, responsable: responsable() }));
      if (result.status !== 'gone') await reloadDirectory();
      return result;
    },
    renderAvatar,
    onChanged,
    onClose
  });
}

// Le bouton « Mon établissement » du bandeau : la fiche de l'établissement dont la personne est
// responsable (elle choisit quand ils sont plusieurs), que sa carte soit affichée ou non.
function openMyEtablissement() {
  openEtablissement(myEtablissements(), () => {
    if (!accountBar.focusEtab()) elements.searchInput.focus();
  });
}
