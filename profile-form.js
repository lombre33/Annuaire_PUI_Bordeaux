// Le formulaire de la fenêtre de modification d'une fiche, première étape : le bloc d'identité, la photo de profil, les champs,
// les listes de pastilles, la case « Apparaître dans l'annuaire » d'une fiche qu'on crée, et ce qui se remet à jour à chaque
// saisie (erreurs, « Ce qui va changer », résumé du pied, bouton « Relire »). Textes et mise en page suivent la maquette v5.
// DOM seulement ; profile-ui.js tient l'état de la fenêtre et enchaîne les étapes.
//
// `ctx` est l'état de la fenêtre ouverte, que profile-ui.js tient :
//   session, draft, evaluation   ce que open() a reçu, le brouillon et ce qu'il change (session.evaluate)
//   phase, generation            l'étape ; le numéro de l'ouverture, qui fait ignorer la réponse tardive d'une fenêtre refermée
//   preparingPhoto               vrai pendant que l'image choisie se prépare
//   ui                           les éléments à remettre à jour
//   creating, admin, publishes   la fenêtre crée une fiche ; elle modifie celle d'une autre personne ; la case « apparaître »
//                                d'une fiche qu'on crée est cochée
//   shell                        le cadre commun des fenêtres (dialog-shell.js)

import { CATEGORIES, CONSENT_COLUMN, CONSENT_LABEL, IMAGE_RULES } from './constants.js';
import { formatPhone, normalize } from './grist-data.js';
import { button, dropdown, el, foundText, searchField } from './dom.js';
import { imageFaultMessage, megabytes, prepareImage } from './image-prep.js';
import { frenchPhoneDigits, ETABLISSEMENT_REQUIRED, NAME_REQUIRED } from './profile.js';
import { renderChangeList } from './changes-ui.js';

const PHOTO_HELP = 'Elle remplace les initiales sur la carte et s’agrandit au clic. '
  + `JPG, PNG ou WebP, ${megabytes(IMAGE_RULES.avatar.maxBytes)} au maximum, recadrée en carré.`;

// La case de la fiche qu'on crée (CONSENT_LABEL) : elle décide de publier la fiche tout de suite (cochée d'avance) ou
// de la créer masquée, et elle écrit Accepte_apparaitre avec la fiche.
const PUBLISH_HELP = 'Décochée, votre fiche est créée mais reste masquée jusqu’à ce que vous activiez l’interrupteur en haut de page.';

const fieldsChanged = count => `${count} champ${count > 1 ? 's' : ''} modifié${count > 1 ? 's' : ''}`;
const fieldsFilled = count => `${count} champ${count > 1 ? 's' : ''} rempli${count > 1 ? 's' : ''}`;

// « 2 champs modifiés », ou « 2 champs remplis » pour une fiche qu'on crée.
export const countLabel = (ctx, count) => (ctx.creating ? fieldsFilled(count) : fieldsChanged(count));

const recapTitle = ctx => (ctx.creating ? 'Ce qui sera enregistré' : 'Ce qui va changer');

export function editingHeading(ctx) {
  if (ctx.creating) {
    return ['Créer ma fiche', 'Vous relisez votre fiche avant de la publier : elle est ajoutée tout de suite, sans validation.'];
  }
  return [
    ctx.admin ? `Modifier la fiche de ${ctx.session.person.name}` : 'Modifier mon profil',
    ctx.admin
      ? 'Mode admin : vous modifiez la fiche d’une autre personne. Vous relisez les modifications avant de les valider, elles s’appliquent ensuite tout de suite.'
      : 'Vous relisez vos modifications avant de les valider : elles s’appliquent ensuite tout de suite à votre fiche.'
  ];
}

// Qui est cette fiche. Pour la sienne, l'e-mail et l'établissement ne changent pas par ce
// formulaire, et le bloc le dit (un administrateur n'a personne à contacter : il le sait).
// Un administrateur qui modifie la fiche d'une autre personne les change dans les champs
// qui suivent.
function identityBlock(ctx) {
  const { session } = ctx;
  const { person, etablissement } = session;
  const box = el('div', 'ident');
  box.append(session.renderAvatar({ initials: person.initials, photo: person.photo }));
  const main = el('div', 'ident-main');
  main.append(el('p', 'ident-name', person.name), el('p', 'ident-mail', person.email));
  if (ctx.creating) {
    main.append(el('p', 'ident-lock', 'L’adresse e-mail est celle de votre compte. Une fois la fiche créée, seul un administrateur peut changer l’établissement.'));
  } else if (!ctx.admin) {
    main.append(el('p', 'ident-lock', session.viewerAdmin
      ? 'Verrouillé sur votre propre fiche : l’e-mail et l’établissement sont liés à votre compte.'
      : 'Verrouillé : l’e-mail et l’établissement sont liés à votre compte. Pour les corriger, contactez un administrateur.'));
  }
  box.append(main);
  if (etablissement) box.append(session.renderEtablissement?.(etablissement) ?? el('span', 'et-pill', etablissement));
  return box;
}

// ===== La photo de profil =====

// `draft.Avatar` vaut l'identifiant de la photo actuelle (rien ne change), 0 (la retirer) ou
// l'image que le formulaire vient de préparer (image-prep.js) avec `url`, son adresse locale. Cette
// adresse est libérée dès que la photo n'est plus dans le brouillon, et à la fermeture.
const isChosenPhoto = value => Boolean(value) && typeof value === 'object';

export function forgetPhoto(ctx) {
  if (isChosenPhoto(ctx.draft.Avatar)) URL.revokeObjectURL(ctx.draft.Avatar.url);
}

function paintPhoto(ctx) {
  const { session, draft, ui } = ctx;
  const has = Boolean(draft.Avatar);
  ui.photoPreview.replaceChildren(session.renderAvatar({ initials: session.person.initials, photo: draft.Avatar }));
  ui.photoAdd.textContent = has ? 'Changer la photo' : 'Ajouter une photo';
  ui.photoRemove.hidden = !has;
}

function photoError(ctx, message) {
  ctx.ui.photoErr.textContent = message;
  ctx.ui.photoErr.hidden = message === '';
}

// Pendant que l'image se prépare, les deux boutons et « Relire » attendent (refreshForm() lit le drapeau).
// Les boutons sont marqués `aria-disabled` et non `disabled` : un bouton désactivé perd le focus du
// clavier, qui ne reviendrait pas une fois l'image prête.
function setPhotoBusy(ctx, busy) {
  const { ui } = ctx;
  ctx.preparingPhoto = busy;
  for (const control of [ui.photoAdd, ui.photoRemove]) {
    if (busy) control.setAttribute('aria-disabled', 'true');
    else control.removeAttribute('aria-disabled');
  }
  ui.photoStatus.textContent = busy ? 'Préparation de l’image…' : '';
  refreshForm(ctx);
}

// « Retirer la photo » : le brouillon n'a plus de photo, qu'elle soit celle de Grist ou celle qu'on vient de
// choisir. Sans photo au départ, choisir puis retirer revient à ne rien changer. Le bouton disparaît :
// le focus passe à « Ajouter une photo » plutôt que de se perdre.
function dropPhoto(ctx) {
  if (ctx.preparingPhoto) return;
  forgetPhoto(ctx);
  ctx.draft.Avatar = 0;
  photoError(ctx, '');
  paintPhoto(ctx);
  ctx.ui.photoAdd.focus();
  refreshForm(ctx);
}

async function choosePhoto(ctx, file) {
  const mine = ctx.generation;
  photoError(ctx, '');
  setPhotoBusy(ctx, true);
  let prepared;
  try {
    prepared = await prepareImage(file, IMAGE_RULES.avatar);
  } catch (error) {
    if (mine !== ctx.generation) return;
    setPhotoBusy(ctx, false);
    photoError(ctx, imageFaultMessage(error));
    return;
  }
  if (mine !== ctx.generation || ctx.phase !== 'editing') return;
  forgetPhoto(ctx);
  prepared.url = URL.createObjectURL(prepared.blob);
  ctx.draft.Avatar = prepared;
  paintPhoto(ctx);
  setPhotoBusy(ctx, false);
}

// Le sélecteur de fichier caché que « Ajouter une photo » ouvre.
function photoFileInput(ctx, help) {
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = IMAGE_RULES.avatar.types.join(',');
  file.hidden = true;
  file.id = 'profilePhotoFile';
  file.setAttribute('aria-label', 'Choisir une photo de profil');
  file.setAttribute('aria-describedby', `${help.id} ${ctx.ui.photoErr.id}`);
  file.addEventListener('change', () => {
    const chosen = file.files[0];
    file.value = '';
    if (chosen) choosePhoto(ctx, chosen);
  });
  return file;
}

// Le cadre « Photo de profil » du formulaire : la photo du brouillon, les deux boutons et l'aide.
function photoSection(ctx) {
  const { ui } = ctx;
  const box = el('section', 'photo-field');
  ui.photoPreview = el('div', 'photo-preview');
  const help = el('p', 'photo-help', PHOTO_HELP);
  help.id = 'profilePhotoHelp';
  ui.photoErr = el('p', 'fld-err');
  ui.photoErr.id = 'profilePhotoError';
  ui.photoErr.hidden = true;
  ui.photoStatus = el('p', 'photo-status');
  ui.photoStatus.setAttribute('role', 'status');
  const file = photoFileInput(ctx, help);
  ui.photoAdd = button('', 'btn', () => { if (!ctx.preparingPhoto) file.click(); });
  ui.photoRemove = button('Retirer la photo', 'btn btn-danger', () => dropPhoto(ctx));
  const actions = el('div', 'photo-actions');
  actions.append(ui.photoAdd, ui.photoRemove);
  const info = el('div', 'photo-info');
  info.append(el('h3', 'photo-title', 'Photo de profil'), help, actions, ui.photoStatus, ui.photoErr, file);
  box.append(ui.photoPreview, info);
  paintPhoto(ctx);
  return box;
}

// Les miniatures de la ligne « Photo de profil » d'une liste de changements : la photo actuelle,
// puis la nouvelle (celle du brouillon). Rien pour une photo qui n'existe pas.
export function changeList(ctx, lines) {
  return renderChangeList(lines, (side, line) => {
    const photo = side === 'before' ? line.before : (line.after === 'replace' ? ctx.draft.Avatar : 0);
    return photo ? ctx.session.renderThumb(photo, side === 'before' ? 'Photo actuelle' : 'Nouvelle photo') : null;
  });
}

// ===== Les champs =====

function textField(ctx, field) {
  const id = `profile-${field.key}`;
  const wrap = el('div', field.key === 'Fonction' ? 'fld fld-wide' : 'fld');
  const label = el('label', 'fld-label', field.label);
  label.htmlFor = id;
  const input = document.createElement('input');
  input.id = id;
  input.type = field.kind === 'phone' ? 'tel' : field.kind === 'email' ? 'email' : 'text';
  input.autocomplete = 'off';
  if (field.kind === 'email') input.spellcheck = false;
  input.value = ctx.draft[field.key];
  const error = el('p', 'fld-err');
  error.id = `${id}-error`;
  error.hidden = true;
  // Une adresse facultative dit ce qu'elle remplace.
  const hint = field.optional ? el('p', 'fld-hint', 'Facultatif : l’adresse montrée sur la carte. Laissée vide, la carte montre l’adresse du compte.') : null;
  if (hint) hint.id = `${id}-hint`;
  input.setAttribute('aria-describedby', hint ? `${error.id} ${hint.id}` : error.id);
  input.addEventListener('input', () => {
    ctx.draft[field.key] = input.value;
    refreshForm(ctx);
  });
  if (field.kind === 'phone') {
    // Un numéro valide se remet en forme à la sortie du champ : « 0536499012 » devient « 05 36 49 90 12 ».
    input.addEventListener('blur', () => {
      const digits = frenchPhoneDigits(input.value);
      if (!digits) return;
      input.value = formatPhone(digits);
      ctx.draft[field.key] = input.value;
      refreshForm(ctx);
    });
  }
  wrap.append(label, input, error);
  if (hint) wrap.append(hint);
  ctx.ui.fields[field.key] = { input, error };
  return wrap;
}

// Un choix parmi une liste : une liste déroulante dont le panneau porte la recherche (dropdown(), dom.js), comme les
// menus de filtre. Une valeur requise (l'établissement) ne se vide pas : « Choisir… » n'est qu'une invite tant que
// rien n'est choisi ; une valeur facultative a son choix « Non renseigné ».
function referenceField(ctx, field) {
  const id = `profile-${field.key}`;
  const wrap = el('div', 'fld');
  const label = el('label', 'fld-label', field.label);
  label.htmlFor = id;
  label.id = `${id}-label`;
  const choice = dropdown({
    id,
    labelId: label.id,
    options: field.required ? field.options : [{ id: 0, label: 'Non renseigné' }, ...field.options],
    value: ctx.draft[field.key],
    placeholder: 'Choisir…',
    searchLabel: `Rechercher dans ${field.label}`,
    color: CATEGORIES[field.category].color,
    onChange: next => {
      ctx.draft[field.key] = next;
      refreshForm(ctx);
    }
  });
  const error = el('p', 'fld-err');
  error.id = `${id}-error`;
  error.hidden = true;
  const warning = ctx.session.fieldWarning ? el('p', 'fld-hint warn') : null;
  if (warning) {
    warning.id = `${id}-warning`;
    warning.hidden = true;
  }
  choice.trigger.setAttribute('aria-describedby', warning ? `${error.id} ${warning.id}` : error.id);
  wrap.append(label, choice.element, error);
  if (warning) wrap.append(warning);
  ctx.ui.fields[field.key] = { input: choice.trigger, error, warning };
  return wrap;
}

// ===== Les listes de pastilles =====

// La pastille d'une valeur : cochée ou non d'après le brouillon, elle se coche et se décoche au clic.
function makeChip(ctx, field, option, syncCount) {
  const chip = button(option.label, 'pick');
  const sync = () => {
    const on = ctx.draft[field.key].includes(option.id);
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', String(on));
  };
  chip.addEventListener('click', () => {
    const list = ctx.draft[field.key];
    const at = list.indexOf(option.id);
    if (at >= 0) list.splice(at, 1);
    else list.push(option.id);
    sync();
    syncCount();
    refreshForm(ctx);
  });
  sync();
  return chip;
}

// Les pastilles rangées sous le titre de leur domaine quand les valeurs portent un `group`, sinon sur une seule rangée.
// `chips` : { chip, text } dans l'ordre de `options`.
function chipGroups(options, chips) {
  if (!options.some(option => option.group)) {
    const picks = el('div', 'picks');
    picks.append(...chips.map(({ chip }) => chip));
    return [picks];
  }
  const byGroup = new Map();
  const groups = [];
  options.forEach((option, index) => {
    const name = option.group || '';
    if (!byGroup.has(name)) {
      const sub = el('div', 'subgrp');
      sub.append(el('p', 'subgrp-title', name));
      const picks = el('div', 'picks');
      sub.append(picks);
      byGroup.set(name, picks);
      groups.push(sub);
    }
    byGroup.get(name).append(chips[index].chip);
  });
  return groups;
}

// La recherche d'une liste de pastilles : elle cache celles qui ne répondent pas, puis les groupes devenus vides.
function pickerSearch(field, chips, groups) {
  const found = el('p', 'fld-found');
  found.setAttribute('role', 'status');
  const search = searchField({
    label: `Rechercher dans ${field.label}`,
    placeholder: `Rechercher dans ${field.label}…`,
    onTerm: term => {
      chips.forEach(({ chip, text }) => {
        chip.hidden = term !== '' && !text.includes(term);
      });
      groups.forEach(sub => {
        sub.hidden = !sub.querySelector('.pick:not([hidden])');
      });
      found.textContent = foundText(term, chips.filter(({ chip }) => !chip.hidden).length);
    }
  });
  return [search, found];
}

// Toutes les valeurs proposées en pastilles à cocher, groupées par domaine quand
// les valeurs portent un `group`, avec une recherche.
function picker(ctx, field) {
  const section = el('section', 'grp');
  section.style.setProperty('--c', CATEGORIES[field.category].color);
  const count = el('span', 'grp-count');
  const head = el('div', 'grp-head');
  head.append(el('h3', 'grp-title', field.label), count);
  section.append(head);
  const syncCount = () => {
    const n = ctx.draft[field.key].length;
    count.textContent = `${n} sélectionné${n > 1 ? 's' : ''}`;
  };

  if (field.options.length === 0) {
    section.append(el('p', 'fld-hint', 'Aucune valeur proposée dans Grist.'));
    syncCount();
    return section;
  }

  const chips = field.options.map(option => ({ chip: makeChip(ctx, field, option, syncCount), text: normalize(option.label) }));
  const groups = chipGroups(field.options, chips);
  section.append(...pickerSearch(field, chips, groups), ...groups);
  syncCount();
  return section;
}

// La case de la fiche qu'on crée, cochée d'avance (voir CONSENT_LABEL). Même présentation que la case de la fiche
// d'établissement : son nom en gras, ce qu'elle change en dessous.
function publishField(ctx) {
  const id = `profile-${CONSENT_COLUMN}`;
  const box = el('label', 'es-chk');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = ctx.draft[CONSENT_COLUMN] === true;
  const name = el('span', 'es-chk-label', CONSENT_LABEL);
  name.id = `${id}-label`;
  const help = el('span', 'es-chk-sub', PUBLISH_HELP);
  help.id = `${id}-help`;
  input.setAttribute('aria-labelledby', name.id);
  input.setAttribute('aria-describedby', help.id);
  input.addEventListener('change', () => {
    ctx.draft[CONSENT_COLUMN] = input.checked;
    refreshForm(ctx);
  });
  const text = el('span');
  text.append(name, help);
  box.append(input, text);
  return box;
}

// ===== Le formulaire =====

// Les éléments du corps de la fenêtre à cette étape, dans leur ordre. Repart d'un `ctx.ui` neuf, où ils se rangent.
export function buildForm(ctx) {
  ctx.ui = { fields: {} };
  const { ui, draft } = ctx;
  ui.alert = el('div', 'dlg-alert');
  ui.recap = el('section', 'recap');
  ui.recap.setAttribute('aria-label', recapTitle(ctx));
  ui.recap.hidden = true;

  const grid = el('div', 'fld-grid');
  const pickers = [];
  let photo = null;
  ctx.session.model.forEach(field => {
    if (field.kind === 'image') photo = photoSection(ctx);
    else if (field.kind === 'text' || field.kind === 'phone' || field.kind === 'email') grid.append(textField(ctx, field));
    else if (field.kind === 'reference') grid.append(referenceField(ctx, field));
    else pickers.push(picker(ctx, field));
  });
  const publish = ctx.creating && typeof draft[CONSENT_COLUMN] === 'boolean' ? [publishField(ctx)] : [];
  return [ui.alert, identityBlock(ctx), ...(photo ? [photo] : []), grid, ...pickers, ...publish, ui.recap];
}

// Le résumé du pied de fenêtre quand le brouillon est refusé : le premier problème, dans
// l'ordre du formulaire.
function faultSummary({ prenom, nom, email, email_affiche: shown, numero_de_telephone: phone, Etablissement: etablissement }) {
  if (prenom === NAME_REQUIRED || nom === NAME_REQUIRED) return 'Indiquez au moins un prénom ou un nom';
  if (email || shown) return 'Corrigez l’adresse e-mail';
  if (phone) return 'Corrigez le numéro de téléphone';
  if (etablissement === ETABLISSEMENT_REQUIRED) return 'Choisissez votre établissement';
  return 'Corrigez les champs signalés';
}

// L'erreur et la mise en garde de chaque champ, d'après ce que le brouillon change.
function paintFieldFaults(ctx, fieldErrors) {
  Object.entries(ctx.ui.fields).forEach(([key, { input, error, warning }]) => {
    const fault = fieldErrors[key] || '';
    error.textContent = fault;
    error.hidden = !fault;
    input.setAttribute('aria-invalid', String(Boolean(fault)));
    if (warning) {
      const text = ctx.session.fieldWarning(key, ctx.draft[key]) || '';
      warning.textContent = text;
      warning.hidden = !text;
    }
  });
}

// Remet à jour tout ce qui dépend du brouillon, sans reconstruire les champs (ils
// garderaient leur curseur).
export function refreshForm(ctx) {
  const { ui } = ctx;
  ctx.shell.disarm();
  ctx.evaluation = ctx.session.evaluate(ctx.draft);
  const { lines, errors, fieldErrors } = ctx.evaluation;

  paintFieldFaults(ctx, fieldErrors);

  // « Ce qui va changer » se lit sous le formulaire pendant qu'on le remplit.
  ui.recap.hidden = lines.length === 0;
  ui.recap.replaceChildren(...(lines.length === 0 ? [] : [el('h4', 'recap-title', recapTitle(ctx)), changeList(ctx, lines)]));

  ui.summary.textContent = errors.length > 0 ? faultSummary(fieldErrors)
    : lines.length === 0 ? (ctx.creating ? 'Aucun champ rempli' : 'Aucune modification')
      : countLabel(ctx, lines.length);
  ui.reviewButton.disabled = errors.length > 0 || lines.length === 0 || ctx.preparingPhoto;
}
