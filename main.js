// Point d'entrée : relie l'API Grist et les événements du DOM aux modules
// grist-data.js (lecture, enrichissement), filters.js (filtrage), render.js
// (construction du DOM), identity.js et presence.js (la personne connectée et
// son choix d'apparaître), account-ui.js (son bandeau), pour la modification d'une
// fiche, profile.js / profile-save.js / preview.js (la logique) avec profile-ui.js (la
// fenêtre), et branding.js, attachments.js et branding-ui.js (les logos : cartes,
// financeurs, fondateurs).

import { CARD_LOGO, ETABLISSEMENT_NAMES, SEARCH_DELAY_MS } from './constants.js';
import { loadDirectory, DirectoryLoadError, filterVisibleEstablishments, createRequestSequencer, referenceMapsEqual, refId, text } from './grist-data.js';
import { createEmptyFilterState, filterContacts, pruneStaleFilters, computeFilterCounts, toggleGroup } from './filters.js';
import { createFilterUI, renderCards, renderPreviewCard, updateFilterUI, updateFilterCounts, initials } from './render.js';
import { readIdentity, isReadOnlyAddress } from './identity.js';
import { describeHiddenFiche, describePresence, describeUnknownAccount, setPresence, PresenceError } from './presence.js';
import { createAccountBar } from './account-ui.js';
import { rightsFor, profileFormModel, draftOf, diffProfile, describeChanges } from './profile.js';
import { ProfileSaveError, prepareReview, saveProfile, unsavedLabels } from './profile-save.js';
import { createProfileDialog } from './profile-ui.js';
import { buildBranding, logoForContact } from './branding.js';
import { createAttachments } from './attachments.js';
import { createBrandingUI, createLogoImage, sizeLogo } from './branding-ui.js';

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
  // l'index des lignes de BDD par e-mail et par identifiant (grist-data.js), pour
  // retrouver sa fiche.
  identity: null,
  people: null,
  // Logos et financeurs (branding.js), vides tant que Grist n'a pas répondu.
  branding: buildBranding(),
  // Ce que la personne connectée peut faire de chaque fiche (profile.js) : rien tant
  // qu'elle n'est pas identifiée. Un administrateur n'a le droit de modifier les fiches
  // des autres que lorsqu'il a allumé le « mode admin » (adminMode).
  rightsOf: () => null,
  adminMode: false,
  // Indicateurs des établissements, pour montrer la fiche « après » telle que
  // l'annuaire la présentera.
  etabFlags: null
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
  adminStrip: document.getElementById('adminStrip'),
  toast: document.getElementById('toast'),
  toastLive: document.getElementById('toastLive'),
  scopeButtons: [...document.querySelectorAll('.scope-btn')]
};

// Bandeau « Ma présence » (voir « Ma présence » plus bas) : masqué tant que la
// personne connectée n'est pas identifiée et retrouvée dans BDD.
const accountBar = createAccountBar(document.getElementById('accountBar'), {
  onToggle: togglePresence,
  onEdit: openOwnProfile,
  onAdminMode: toggleAdminMode
});

const profileDialog = createProfileDialog(document.getElementById('profileDialog'));

// Les logos sont des pièces jointes de Grist : leurs adresses demandent un jeton,
// réclamé à Grist seulement quand un logo est à afficher.
const attachments = createAttachments(window.grist.docApi);
const brandingUI = createBrandingUI({
  funders: document.getElementById('funders'),
  fundersLogos: document.getElementById('fundersLogos'),
  band: document.getElementById('foundersBand'),
  bandLogos: document.getElementById('bandLogos'),
  bandRoundel: document.getElementById('bandRoundel'),
  bandLink: document.getElementById('bandLink')
}, attachments);

// Ce qu'il faut à une carte pour montrer le logo de son établissement : la carte de
// l'annuaire comme la carte « avant / après » de la relecture.
const cardLogos = () => ({ attachments, logoFor: contact => logoForContact(state.branding, contact) });

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
  createFilterUI(elements.filtersContainer, state.filterReferenceMaps, state.activeFilters,
    { onToggle: toggleFilter, onToggleGroup: toggleFilterGroup }, currentCounts());
}

function refreshCards() {
  const filtered = filterContacts(state.allContacts, state.activeFilters, state.searchTerm, state.scope);
  renderCards(elements.grid, elements.template, filtered, toggleFilter, state.rightsOf, cardLogos());
  elements.resultCount.textContent = `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
  elements.emptyState.hidden = filtered.length !== 0;
  updateFilterCounts(elements.filtersContainer, currentCounts());
}

// Un seul écouteur pour tous les boutons « Modifier » : les cartes sont reconstruites à
// chaque filtre. Les cartes étant redessinées après un enregistrement, le focus revient
// au bouton de la même fiche et non à celui, disparu, qui a ouvert la fenêtre.
elements.grid.addEventListener('click', event => {
  const edit = event.target.closest('.card-edit');
  if (!edit) return;
  const rowId = Number(edit.dataset.rowId);
  openProfile(rowId, () => elements.grid.querySelector(`.card-edit[data-row-id="${rowId}"]`)?.focus());
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
    refreshCards();
  });
});

elements.resetFilters.addEventListener('click', () => {
  Object.values(state.activeFilters).forEach(set => set.clear());
  clearTimeout(searchTimer);
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

// Les logos sont un habillage : une erreur ici ne doit jamais empêcher les cartes
// de s'afficher.
function applyBranding({ etablissementRows, financeurRows }) {
  try {
    state.branding = buildBranding({ etablissementRows, financeurRows });
    brandingUI.render(state.branding);
  } catch (error) {
    console.error('[LOGOS] Impossible d\'afficher les logos :', error);
  }
}

function applyDirectory({ contacts, referenceMaps, etabFlags, people, etablissementRows, financeurRows }) {
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
  state.etabFlags = etabFlags;
  applyBranding({ etablissementRows, financeurRows });
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

const isAdmin = () => state.identity?.status === 'ready' && state.identity.admin === true;

// Le bandeau de la personne connectée. Sans identité (pas de table-sonde, compte Lecteur…)
// ou tant que l'annuaire n'est pas lu, il reste masqué. Une adresse qui ne figure pas dans
// BDD le dit, au lieu de disparaître sans explication : un administrateur y trouve quand
// même son « mode admin ».
function refreshAccount() {
  if (state.identity?.status !== 'ready' || !state.people) {
    accountBar.hide();
    return;
  }
  const persons = myPersons();
  const admin = isAdmin();
  if (persons.length === 0) {
    warnOnce('no-row', state.people.hasEmailColumn
      ? '[IDENTITE] Aucune ligne de BDD ne porte l\'adresse de la personne connectée : pas de bouton « Modifier mon profil ».'
      : '[IDENTITE] BDD n\'a pas de colonne « email » : impossible de relier la personne connectée à sa fiche.');
    accountBar.show(describeUnknownAccount({ email: state.identity.email, admin, emailColumn: state.people.hasEmailColumn }));
    accountBar.setActions({ admin, adminMode: state.adminMode });
    return;
  }
  if (persons.length > 1) {
    warnOnce('duplicates', `[IDENTITE] ${persons.length} lignes de BDD portent la même adresse (identifiants de ligne : `
      + `${persons.map(person => person.row.id).join(', ')}) : le choix de présence s'applique à toutes, `
      + 'le bouton « Modifier mon profil » n\'est pas proposé (chaque carte garde le sien).');
  }
  accountBar.show({ name: persons[0].name || 'Ma fiche', initials: initials(persons[0].row), ...describePresence(persons) });
  // Plusieurs fiches pour la même adresse : on ne sait pas laquelle ouvrir depuis le bandeau.
  accountBar.setActions({ edit: persons.length === 1, admin, adminMode: state.adminMode });
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
    const outcome = await reloadDirectory();
    if (outcome === 'failed') accountBar.setStatus('Modification enregistrée ; l\'annuaire n\'a pas pu être rechargé.');
    else accountBar.announce(accepted
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
readIdentity(window.grist.docApi, { readOnly: isReadOnlyAddress(window.location.search) }).then(identity => {
  state.identity = identity;
  state.rightsOf = rightsFor(identity, { adminMode: state.adminMode });
  refreshAccount();
  refreshCards(); // les boutons « Modifier » apparaissent sur les cartes concernées
});

// ===== Modifier une fiche =====

// Une erreur attendue (ProfileSaveError) porte une phrase française ; toute autre est
// consignée dans la console et remplacée par une phrase générale.
function userFacing(error) {
  if (error instanceof ProfileSaveError) return error;
  console.error('[PROFIL] Erreur inattendue :', error);
  return new Error('L\'opération n\'a pas pu aboutir. Le détail est dans la console du navigateur.');
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
    ? 'Cet établissement n’a pas validé sa présence : la fiche ne sera pas visible dans l’annuaire.'
    : '';
}

// Ce que le brouillon change (de quoi activer le bouton) et pourquoi il serait refusé.
// `admin` : un administrateur modifie la fiche d'une autre personne (e-mail et établissement compris).
function evaluateDraft(row, draft, admin) {
  const { champs, errors, fieldErrors } = diffProfile(row, draft, state.referenceMaps, { admin, emailTaken: emailTakenElsewhere(row.id) });
  return { errors, fieldErrors, lines: describeChanges(champs) };
}

// Prépare la relecture (profile-save.js) : rien n'est écrit. `row` est la fiche telle que
// le formulaire l'a montrée.
async function reviewProfile(row, draft, admin) {
  try {
    return await prepareReview(window.grist.docApi, row, draft, { referenceMaps: state.referenceMaps, etabFlags: state.etabFlags, admin });
  } catch (error) {
    throw userFacing(error);
  }
}

// Écrit ce que la personne a relu. Si la fiche a changé dans Grist depuis la relecture,
// rien n'est écrit : la personne relit d'abord ce qui s'y trouve. Sinon l'annuaire est
// relu, et on vérifie que Grist a gardé ce qu'on lui a demandé.
async function saveReviewed(row, review, draft, admin) {
  let result;
  try {
    result = await saveProfile(window.grist.docApi, review);
  } catch (error) {
    throw userFacing(error);
  }
  if (result.status === 'changed') {
    return {
      status: 'changed',
      review: await reviewProfile(row, draft, admin),
      notice: 'La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau.'
    };
  }
  const outcome = await reloadDirectory();
  const saved = outcome === 'applied' ? state.people?.findById(review.rowId)?.row : null;
  const leftovers = saved ? unsavedLabels(review, saved, state.referenceMaps) : [];
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
  holder.append(createLogoImage(attachments, brand.logo, label, () => holder.replaceWith(pill()),
    { eager: true, onLoad: image => sizeLogo(image, CARD_LOGO) }));
  return holder;
}

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
  const model = profileFormModel(row, state.referenceMaps, { admin });
  profileDialog.open({
    mode: rights,
    viewerAdmin: isAdmin(),
    person: { name: person.name || 'Sans nom', email: text(row.email), initials: initials(row) },
    etablissement: person.etablissement,
    model,
    draft: draftOf(model),
    evaluate: draft => evaluateDraft(row, draft, admin),
    review: draft => reviewProfile(row, draft, admin),
    hiddenNotice: review => describeHiddenFiche(review.visibility, { own: rights === 'own', etablissement: etablissementName(review.after) }),
    fieldWarning: (key, value) => (key === 'Etablissement' ? etablissementWarning(value) : ''),
    save: (review, draft) => saveReviewed(row, review, draft, admin),
    renderCard: (contact, marks) => renderPreviewCard(elements.template, contact, marks, cardLogos()),
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
