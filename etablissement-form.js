// Le formulaire de la fenêtre « Fiche de l'établissement » : le logo, le sigle et le statut en lecture seule, le nom, la visibilité
// dans l'annuaire, la liste des responsables, et ce qui se remet à jour à chaque saisie (erreurs, avertissements, résumé du pied,
// bouton « Enregistrer »). Textes et mise en page suivent la maquette v5.
// DOM seulement : ce qui change (etablissement.js) et l'image (image-prep.js) viennent de la session que main.js donne à open() ;
// etablissement-ui.js tient l'état de la fenêtre et enchaîne les étapes.
//
// `ctx` est l'état de la fenêtre ouverte, que etablissement-ui.js tient :
//   session, fiche, draft, evaluation   ce que open() a reçu, la fiche telle qu'elle est dans Grist, le brouillon et ce qu'il change
//   phase, generation                   l'étape ; le numéro de l'ouverture, qui fait ignorer la réponse tardive d'une fenêtre refermée
//   previewUrl                          l'adresse locale de l'image choisie, à libérer
//   ui                                  les éléments à remettre à jour
//   acronym                             le sigle de l'établissement ouvert
//   shell                               le cadre commun des fenêtres (dialog-shell.js)

import { IMAGE_RULES } from './constants.js';
import { button, el, matchesTerm, notice, searchField } from './dom.js';
import { KEEP_ONE, diffEtablissement, nominate, summaryOf, toggleResponsable, visibilityWarning } from './etablissement.js';
import { imageFaultMessage, megabytes, prepareImage } from './image-prep.js';

const LOGO_HELP = {
  with: `Il apparaît sur les cartes de l’établissement et dans le bandeau du bas. PNG, JPG, WebP ou SVG, ${megabytes(IMAGE_RULES.logo.maxBytes)} au maximum, ramené à ${IMAGE_RULES.logo.maxSide} px de large.`,
  without: `Sans logo, les cartes affichent le sigle de l’établissement et le bandeau du bas son nom. PNG, JPG, WebP ou SVG, ${megabytes(IMAGE_RULES.logo.maxBytes)} au maximum.`,
  noColumn: 'Le logo ne peut pas être modifié d’ici : la colonne « logo » n’existe pas dans la table Etablissements (GRIST_SETUP.md, étape 5).'
};
const NO_LIST = 'La liste des responsables n’a pas pu être lue : elle n’est ni affichée ni modifiable d’ici. '
  + 'Les règles d’accès de Grist doivent laisser un responsable lire la table ACL pour son établissement (GRIST_SETUP.md).';
const SELF_REMOVAL = 'Vous retirez votre propre accès : une fois enregistré, vous ne pourrez plus modifier cette fiche.';

// ===== Le logo =====

export function forgetPreview(ctx) {
  if (ctx.previewUrl) URL.revokeObjectURL(ctx.previewUrl);
  ctx.previewUrl = null;
}

const showsLogo = ctx => (ctx.draft.logo.action === 'replace' ? true
  : ctx.draft.logo.action === 'remove' ? false : ctx.fiche.etablissement.logo.length > 0);

export function paintLogo(ctx) {
  const { fiche, draft, ui } = ctx;
  const { etablissement } = fiche;
  let shown;
  if (draft.logo.action === 'replace' && ctx.previewUrl) {
    shown = el('img', 'es-tile-img');
    shown.alt = `Nouveau logo de ${etablissement.name || ctx.acronym}`;
    shown.src = ctx.previewUrl;
  } else if (showsLogo(ctx)) {
    shown = ctx.session.renderLogo?.(fiche) ?? null;
  }
  ui.tile.replaceChildren(shown ?? el('span', 'et-pill', ctx.acronym));
  if (!etablissement.logoColumn) return;
  ui.replace.textContent = showsLogo(ctx) ? 'Remplacer le logo' : 'Ajouter un logo';
  ui.remove.hidden = !showsLogo(ctx);
  ui.logoHelp.textContent = showsLogo(ctx) ? LOGO_HELP.with : LOGO_HELP.without;
}

function logoError(ctx, message) {
  ctx.ui.logoErr.textContent = message;
  ctx.ui.logoErr.hidden = message === '';
}

// Pendant que l'image se prépare, les deux boutons et le message d'attente.
function setLogoBusy(ctx, busy) {
  ctx.ui.replace.disabled = busy;
  ctx.ui.remove.disabled = busy;
  ctx.ui.logoStatus.textContent = busy ? 'Préparation de l’image…' : '';
}

// « Retirer le logo » : un logo qui n'existe pas dans Grist n'est pas à retirer, le choix revient
// alors à « ne rien changer ».
function dropLogo(ctx) {
  forgetPreview(ctx);
  ctx.draft.logo = ctx.fiche.etablissement.logo.length > 0 ? { action: 'remove' } : { action: 'keep' };
  logoError(ctx, '');
  paintLogo(ctx);
  refreshForm(ctx);
}

async function chooseFile(ctx, file) {
  const mine = ctx.generation;
  logoError(ctx, '');
  setLogoBusy(ctx, true);
  let prepared;
  try {
    prepared = await prepareImage(file);
  } catch (error) {
    if (mine !== ctx.generation) return;
    setLogoBusy(ctx, false);
    logoError(ctx, imageFaultMessage(error));
    return;
  }
  if (mine !== ctx.generation) return;
  forgetPreview(ctx);
  ctx.previewUrl = URL.createObjectURL(prepared.blob);
  ctx.draft.logo = { action: 'replace', file: prepared };
  setLogoBusy(ctx, false);
  paintLogo(ctx);
  refreshForm(ctx);
}

// Le sélecteur de fichier caché que « Remplacer le logo » ouvre, avec les deux boutons qui le pilotent.
function logoControls(ctx) {
  const { ui } = ctx;
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = IMAGE_RULES.logo.types.join(',');
  file.hidden = true;
  file.id = 'etabLogoFile';
  file.setAttribute('aria-describedby', `${ui.logoHelp.id} ${ui.logoErr.id}`);
  ui.replace.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files[0];
    file.value = '';
    if (chosen) chooseFile(ctx, chosen);
  });
  const actions = el('div', 'es-logo-actions');
  actions.append(ui.replace, ui.remove);
  return [actions, ui.logoStatus, ui.logoErr, file];
}

function logoSection(ctx) {
  const { ui } = ctx;
  const { etablissement } = ctx.fiche;
  const box = el('section', 'es-logo');
  ui.tile = el('div', 'es-tile');
  const info = el('div', 'es-logo-info');
  ui.logoHelp = el('p', 'es-logo-help', etablissement.logoColumn ? '' : LOGO_HELP.noColumn);
  ui.logoHelp.id = 'etabLogoHelp';
  info.append(el('h3', 'es-logo-title', 'Logo'), ui.logoHelp);

  ui.logoErr = el('p', 'fld-err');
  ui.logoErr.id = 'etabLogoError';
  ui.logoErr.hidden = true;
  ui.logoStatus = el('p', 'es-logo-status');
  ui.logoStatus.setAttribute('role', 'status');
  ui.replace = button('', 'btn');
  ui.remove = button('Retirer le logo', 'btn btn-danger', () => dropLogo(ctx));
  if (etablissement.logoColumn) info.append(...logoControls(ctx));
  box.append(ui.tile, info);
  return box;
}

// ===== Nom, sigle, statut, visibilité =====

// Un champ qu'on lit sans pouvoir le changer : son étiquette le nomme, son explication le décrit.
function readOnlyField(id, label, value, hint, placeholder = '') {
  const wrap = el('div', 'fld');
  const name = el('label', 'fld-label', label);
  name.htmlFor = id;
  const input = document.createElement('input');
  input.id = id;
  input.value = value;
  input.readOnly = true;
  if (placeholder) input.placeholder = placeholder;
  const help = el('p', 'fld-hint', hint);
  help.id = `${id}-hint`;
  input.setAttribute('aria-describedby', help.id);
  wrap.append(name, input, help);
  return wrap;
}

function nameField(ctx) {
  const { ui } = ctx;
  const wrap = el('div', 'fld fld-wide');
  const label = el('label', 'fld-label', 'Nom complet');
  label.htmlFor = 'etabName';
  ui.name = document.createElement('input');
  ui.name.id = 'etabName';
  ui.name.type = 'text';
  ui.name.autocomplete = 'off';
  ui.name.value = ctx.draft.name;
  ui.nameErr = el('p', 'fld-err');
  ui.nameErr.id = 'etabName-error';
  ui.nameErr.hidden = true;
  ui.name.setAttribute('aria-describedby', ui.nameErr.id);
  ui.name.addEventListener('input', () => {
    ctx.draft.name = ui.name.value;
    refreshForm(ctx);
  });
  wrap.append(label, ui.name, ui.nameErr);
  return wrap;
}

function visibilityField(ctx) {
  const { ui } = ctx;
  const box = el('label', 'es-chk');
  ui.visible = document.createElement('input');
  ui.visible.type = 'checkbox';
  ui.visible.id = 'etabVisible';
  ui.visible.checked = ctx.draft.visible;
  ui.visible.addEventListener('change', () => {
    ctx.draft.visible = ui.visible.checked;
    refreshForm(ctx);
  });
  // Le nom de la case est sa première ligne ; l'explication qui suit la décrit.
  const text = el('span');
  const label = el('span', 'es-chk-label', 'Établissement visible dans l’annuaire');
  label.id = 'etabVisibleLabel';
  const sub = el('span', 'es-chk-sub', 'Décoché, aucune fiche de cet établissement n’apparaît, même celles des personnes qui ont accepté d’apparaître.');
  sub.id = 'etabVisibleSub';
  ui.visible.setAttribute('aria-labelledby', label.id);
  ui.visible.setAttribute('aria-describedby', sub.id);
  text.append(label, sub);
  box.append(ui.visible, text);
  ui.visibleNote = notice('pending', '', 'status');
  ui.visibleNote.classList.add('es-note');
  ui.visibleNote.id = 'etabVisibleNote';
  ui.visibleNoteText = ui.visibleNote.querySelector('p');
  return [box, ui.visibleNote];
}

// ===== Les responsables =====

const isMe = (ctx, email) => email === ctx.fiche.meEmail;

// Le nom de la personne pour cette adresse, quand sa fiche figure dans l'annuaire ; sinon ce qu'on
// peut en dire sans la dévoiler.
function whoIs(ctx, email) {
  const found = ctx.session.lookup?.(email) ?? null;
  if (found?.name) return { name: found.name, initials: found.initials, photo: found.photo ?? 0, named: true };
  return { name: found?.hidden ? 'Fiche masquée de l’annuaire' : 'Adresse sans fiche dans l’annuaire', initials: '@', photo: 0, named: false };
}

function responsableRow(ctx, item) {
  const person = whoIs(ctx, item.email);
  const name = person.name;
  const row = el('li', 'es-resp');
  row.dataset.state = item.state;
  row.dataset.mail = item.email;
  const avatar = ctx.session.renderAvatar({ initials: person.initials, photo: person.photo });
  const main = el('div', 'es-resp-main');
  const label = el('p', 'es-resp-name', name);
  if (isMe(ctx, item.email)) label.append(el('span', 'es-tag es-tag-you', 'vous'));
  if (item.state === 'added') label.append(el('span', 'es-tag es-tag-new', 'ajouté'));
  if (item.state === 'removed') label.append(el('span', 'es-tag es-tag-gone', 'retiré'));
  main.append(label, el('p', 'es-resp-mail', item.email));
  const action = item.state === 'removed' ? 'Rétablir' : 'Retirer';
  const toggle = button(action, 'btn', () => {
    toggleResponsable(ctx.draft, item.email);
    paintResponsables(ctx);
    refreshForm(ctx);
  });
  toggle.setAttribute('aria-label', `${action} ${person.named ? name : item.email}`);
  row.append(avatar, main, toggle);
  return row;
}

// Les personnes qu'on peut encore nommer : celles de l'établissement qui ne sont pas déjà responsables, réduites
// par la recherche. La personne choisie dans la liste y reste, quoi qu'on cherche ensuite.
function paintCandidates(ctx) {
  const { ui } = ctx;
  const taken = new Set(ctx.draft.responsables.filter(item => item.state !== 'removed').map(item => item.email));
  const candidates = ctx.fiche.candidates.filter(candidate => !taken.has(candidate.email));
  const picked = ui.pick.value;
  const shown = candidates.filter(candidate => candidate.email === picked || matchesTerm(candidate.name, ui.term));
  const none = candidates.length === 0 ? 'Aucune autre personne' : shown.length === 0 ? 'Aucun résultat' : 'Choisir une personne';
  ui.pick.replaceChildren(...[{ email: '', name: none }, ...shown].map(candidate => {
    const option = document.createElement('option');
    option.value = candidate.email;
    option.textContent = candidate.name;
    return option;
  }));
  ui.pick.value = shown.some(candidate => candidate.email === picked) ? picked : '';
  ui.pick.disabled = candidates.length === 0 || ui.mail.value.trim() !== '';
  ui.search.disabled = ui.pick.disabled;
}

export function paintResponsables(ctx) {
  ctx.ui.list.replaceChildren(...ctx.draft.responsables.map(item => responsableRow(ctx, item)));
  paintCandidates(ctx);
}

function nominateTyped(ctx) {
  const { ui } = ctx;
  const problem = nominate(ctx.draft, ui.pick.value || ui.mail.value);
  ui.addErr.textContent = problem;
  ui.addErr.hidden = problem === '';
  if (problem) return;
  ui.pick.value = '';
  ui.mail.value = '';
  ui.mail.disabled = false;
  ui.search.value = '';
  ui.term = '';
  paintResponsables(ctx);
  refreshForm(ctx);
}

// La recherche d'une personne de l'établissement à nommer.
function candidateSearch(ctx) {
  const { ui } = ctx;
  const find = el('div', 'es-find');
  ui.term = '';
  ui.search = searchField({
    label: 'Rechercher une personne de l’établissement',
    placeholder: 'Rechercher une personne de l’établissement…',
    onTerm: term => {
      ui.term = term;
      paintCandidates(ctx);
    }
  });
  find.append(ui.search);
  return find;
}

// Nommer un responsable : une personne de l'établissement, ou une adresse e-mail saisie.
function nominateControls(ctx) {
  const { ui } = ctx;
  const add = el('div', 'es-add');
  ui.pick = document.createElement('select');
  ui.pick.setAttribute('aria-label', 'Nommer une personne de l’établissement');
  ui.mail = document.createElement('input');
  ui.mail.type = 'email';
  ui.mail.autocomplete = 'off';
  ui.mail.spellcheck = false;
  ui.mail.placeholder = 'ou une autre adresse e-mail';
  ui.mail.setAttribute('aria-label', 'Adresse e-mail du nouveau responsable');
  ui.addErr = el('p', 'fld-err es-err');
  ui.addErr.setAttribute('role', 'alert');
  ui.addErr.hidden = true;
  ui.pick.addEventListener('change', () => { ui.mail.disabled = ui.pick.value !== ''; });
  ui.mail.addEventListener('input', () => paintCandidates(ctx));
  ui.mail.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      nominateTyped(ctx);
    }
  });
  add.append(ui.pick, ui.mail, button('Nommer', 'btn', () => nominateTyped(ctx)));
  return add;
}

function responsablesSection(ctx) {
  const { ui, fiche } = ctx;
  const box = el('section', 'es-sec');
  box.setAttribute('aria-labelledby', 'etabRespTitle');
  const heading = el('h3', 'es-sec-title', 'Responsables de l’établissement');
  heading.id = 'etabRespTitle';
  box.append(heading, el('p', 'es-sec-help', 'Ils peuvent modifier cette fiche et en nommer d’autres, sans passer par un administrateur.'));
  if (fiche.responsables === null) {
    box.append(notice('pending', NO_LIST, 'status'));
    return box;
  }
  ui.list = el('ul', 'es-resp-list');
  ui.selfNote = notice('pending', SELF_REMOVAL, 'status');
  ui.selfNote.classList.add('es-note');
  ui.selfNote.id = 'etabSelfNote';
  ui.minErr = el('p', 'fld-err es-err', KEEP_ONE);
  ui.minErr.setAttribute('role', 'alert');
  const find = candidateSearch(ctx);
  const add = nominateControls(ctx);
  box.append(ui.list, ui.selfNote, ui.minErr, find, add, ui.addErr);
  return box;
}

// ===== Le formulaire =====

// Les éléments du corps de la fenêtre à cette étape, dans leur ordre. Repart d'un `ctx.ui` neuf, où ils se rangent.
// `message` : ce que la personne doit lire en tête (la fiche a changé dans Grist pendant que la fenêtre était ouverte).
export function buildForm(ctx, message = '') {
  ctx.ui = {};
  const { ui } = ctx;
  const { etablissement } = ctx.fiche;
  ui.alert = el('div', 'dlg-alert');
  if (message) ui.alert.append(notice('pending', message, 'status'));

  const fields = el('div', 'fld-grid');
  fields.append(
    readOnlyField('etabAcronym', 'Sigle', etablissement.sigle, 'Il sert de filtre sur les cartes : il ne se change pas ici.', 'Aucun sigle'),
    readOnlyField('etabStatus', 'Statut', etablissement.status, 'Géré par l’équipe du PUI.'),
    nameField(ctx)
  );
  const [visible, visibleNote] = visibilityField(ctx);
  return [ui.alert, logoSection(ctx), fields, visible, visibleNote, responsablesSection(ctx)];
}

// Remet à jour tout ce qui dépend du brouillon, sans reconstruire les champs (ils garderaient leur curseur).
export function refreshForm(ctx) {
  const { ui, fiche, draft } = ctx;
  ctx.shell.disarm();
  ctx.evaluation = diffEtablissement(fiche.etablissement, draft, { readable: fiche.responsables !== null });
  const { fieldErrors, errors, labels } = ctx.evaluation;

  ui.nameErr.textContent = fieldErrors.name || '';
  ui.nameErr.hidden = !fieldErrors.name;
  ui.name.setAttribute('aria-invalid', String(Boolean(fieldErrors.name)));

  ui.visibleNote.hidden = draft.visible;
  ui.visible.setAttribute('aria-describedby', draft.visible ? 'etabVisibleSub' : 'etabVisibleSub etabVisibleNote');
  ui.visibleNoteText.textContent = visibilityWarning({
    wasVisible: fiche.etablissement.visible,
    hidden: fiche.warning.hidden,
    includesMe: fiche.warning.includesMe
  });

  if (fiche.responsables !== null) {
    ui.selfNote.hidden = !draft.responsables.some(item => item.state === 'removed' && isMe(ctx, item.email));
    ui.minErr.hidden = !fieldErrors.responsables;
  }

  ui.summary.textContent = summaryOf(ctx.evaluation);
  ui.save.disabled = labels.length === 0 || errors.length > 0;
}
