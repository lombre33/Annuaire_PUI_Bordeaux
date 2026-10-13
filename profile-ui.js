// La fenêtre de modification d'une fiche, en deux temps : le formulaire, puis la relecture
// (la carte avant et la carte après, avec ce qui change repéré). Valider ferme la fenêtre
// et main.js confirme par un message ; un écran de confirmation ne reste que si Grist n'a
// pas tout gardé. Textes et mise en page suivent la maquette v5 validée.
// DOM seulement : ce qui change (profile.js), ce qui s'écrit (profile-save.js) et les
// cartes (render.js) viennent de la session que main.js donne à open().

import { CATEGORIES, CONSENT_COLUMN, CONSENT_LABEL, IMAGE_RULES } from './constants.js';
import { formatPhone, normalize } from './grist-data.js';
import { button, el, foundText, matchesTerm, notice, searchField } from './dom.js';
import { megabytes, prepareImage } from './image-prep.js';
import { frenchPhoneDigits, ETABLISSEMENT_REQUIRED, NAME_REQUIRED } from './profile.js';
import { renderChangeList } from './changes-ui.js';

const PHOTO_HELP = 'Elle remplace les initiales sur la carte et s’agrandit au clic. '
  + `JPG, PNG ou WebP, ${megabytes(IMAGE_RULES.avatar.maxBytes)} au maximum, recadrée en carré.`;

const fieldsChanged = count => `${count} champ${count > 1 ? 's' : ''} modifié${count > 1 ? 's' : ''}`;
const fieldsFilled = count => `${count} champ${count > 1 ? 's' : ''} rempli${count > 1 ? 's' : ''}`;

// Ce que la personne voit une fois sa fiche créée : la fenêtre se ferme et ce message le dit. main.js le
// compose d'après ce que Grist a gardé (`result.notice`) ; celui-ci sert à défaut.
const CREATED_NOTICE = 'Votre fiche est créée. Pour apparaître dans l’annuaire, activez l’interrupteur « Apparaître dans l\'annuaire ».';
const createdNotice = result => result?.notice || CREATED_NOTICE;

// La case de la fiche qu'on crée (CONSENT_LABEL) : elle décide de publier la fiche tout de suite (cochée d'avance) ou
// de la créer masquée, et elle écrit Accepte_apparaitre avec la fiche. Le périmètre reste l'affaire d'un administrateur.
const PUBLISH_HELP = 'Décochée, votre fiche est créée mais reste masquée jusqu’à ce que vous activiez l’interrupteur en haut de page. '
  + 'Dans tous les cas, elle n’apparaît qu’une fois rattachée à un périmètre par un administrateur.';

// `dialog` : le <dialog> de index.html.
//
// open(session) :
//   mode          'own' (sa propre fiche), 'admin' (celle d'une autre personne) ou 'create'
//                 (la personne n'a pas de fiche : elle remplit la sienne, et choisit son établissement)
//   viewerAdmin   la personne connectée est administratrice, même sur sa propre fiche
//   person        { name, email, initials, photo } de la fiche (`photo` : l'identifiant de sa photo
//                 de profil dans Grist, 0 sans photo)
//   etablissement libellé de son établissement
//   renderEtablissement  (facultatif) libellé → l'élément qui montre l'établissement dans le bloc
//                 d'identité (son logo quand Grist en a un) ; sans lui, une pastille avec le nom
//   model         profileFormModel(row, referenceMaps)
//   draft         le brouillon de départ (draftOf). Pour une fiche qu'on crée, il porte aussi la case
//                 Accepte_apparaitre (un booléen, cochée d'avance) : la fenêtre la propose alors, et le
//                 bouton de la dernière étape devient « Publier ma fiche » quand elle est cochée
//   evaluate      draft → { errors, fieldErrors, lines } : ce que le brouillon change et
//                 pourquoi il serait refusé
//   review        draft → promesse de { before, after, marks, lines, visibility, notice } :
//                 relit la fiche dans Grist et prépare les deux cartes ; un échec porte
//                 dans `message` la phrase à montrer
//   hiddenNotice  review → ce que la relecture dit d'une fiche absente de l'annuaire
//                 ('' si elle y figure)
//   fieldWarning  (facultatif) (colonne, valeur) → une mise en garde à lire sous le champ
//                 ('' s'il n'y en a pas)
//   save          (review, draft) → promesse de { status: 'saved', lines, leftovers,
//                 reloaded } ou { status: 'changed', review, notice } (la fiche a changé
//                 pendant la relecture : rien n'est écrit) ; un échec porte `message`.
//                 Une fiche créée porte aussi `notice` : la phrase de fin, d'après ce que Grist a gardé
//   renderCard    (contact, marks) → la carte à montrer (render.js)
//   renderAvatar  { initials, photo } → l'avatar rond (identifiant de pièce jointe, 0 ou { url } : voir
//                 avatar-ui.js ; les initiales sans photo)
//   renderThumb   (photo, légende) → la miniature d'une photo, qui l'agrandit au clic (ou null)
//   notify        (facultatif) message → la confirmation d'un enregistrement sans réserve,
//                 donnée une fois la fenêtre fermée
//   onClose       (facultatif) appelé quand la fenêtre est fermée : rend le focus à
//                 l'endroit d'où elle a été ouverte
export function createProfileDialog(dialog) {
  const title = dialog.querySelector('.dlg-head h2');
  const subtitle = dialog.querySelector('.dlg-sub');
  const body = dialog.querySelector('.dlg-body');
  const foot = dialog.querySelector('.dlg-foot');
  const closeButton = dialog.querySelector('[data-close]');

  let session = null;
  let generation = 0; // change à chaque ouverture : une réponse tardive d'une session fermée est ignorée
  let draft = {};
  let phase = 'editing'; // 'editing' | 'preparing' | 'reviewing' | 'saving' | 'saved'
  let evaluation = { errors: [], fieldErrors: {}, lines: [] };
  let review = null;
  let escapeArmed = false;
  let preparingPhoto = false;
  let ui = {};

  const isAdmin = () => session.mode === 'admin';
  const isCreating = () => session.mode === 'create';
  const reviewLabel = () => (isCreating() ? 'Relire ma fiche' : isAdmin() ? 'Relire les modifications' : 'Relire mes modifications');
  const publishes = () => isCreating() && draft[CONSENT_COLUMN] === true;
  const validateLabel = () => (isCreating() ? (publishes() ? 'Publier ma fiche' : 'Créer ma fiche') : 'Valider');
  const recapTitle = () => (isCreating() ? 'Ce qui sera enregistré' : 'Ce qui va changer');

  // ----- La photo du brouillon -----
  // `draft.Avatar` vaut l'identifiant de la photo actuelle (rien ne change), 0 (la retirer) ou
  // l'image que le formulaire vient de préparer (image-prep.js) avec `url`, son adresse locale. Cette
  // adresse est libérée dès que la photo n'est plus dans le brouillon, et à la fermeture.
  const isChosenPhoto = value => Boolean(value) && typeof value === 'object';

  function forgetPhoto() {
    if (isChosenPhoto(draft.Avatar)) URL.revokeObjectURL(draft.Avatar.url);
  }

  function setHeading(heading, detail) {
    title.textContent = heading;
    subtitle.textContent = detail;
  }

  // Place le curseur de lecture sur le titre de l'étape : un lecteur d'écran l'annonce,
  // et le clavier ne reste pas sur un bouton qui vient de disparaître.
  function announceStep() {
    title.focus({ preventScroll: true });
    body.scrollTop = 0;
  }

  // ===== Le formulaire =====

  // Qui est cette fiche. Pour la sienne, l'e-mail et l'établissement ne changent pas par ce
  // formulaire, et le bloc le dit (un administrateur n'a personne à contacter : il le sait).
  // Un administrateur qui modifie la fiche d'une autre personne les change dans les champs
  // qui suivent.
  function identityBlock() {
    const { person, etablissement } = session;
    const box = el('div', 'ident');
    box.append(session.renderAvatar({ initials: person.initials, photo: person.photo }));
    const main = el('div', 'ident-main');
    main.append(el('p', 'ident-name', person.name), el('p', 'ident-mail', person.email));
    if (isCreating()) {
      main.append(el('p', 'ident-lock', 'L’adresse e-mail est celle de votre compte. Une fois la fiche créée, seul un administrateur peut changer l’établissement.'));
    } else if (!isAdmin()) {
      main.append(el('p', 'ident-lock', session.viewerAdmin
        ? 'Verrouillé sur votre propre fiche : l’e-mail et l’établissement sont liés à votre compte.'
        : 'Verrouillé : l’e-mail et l’établissement sont liés à votre compte. Pour les corriger, contactez un administrateur.'));
    }
    box.append(main);
    if (etablissement) box.append(session.renderEtablissement?.(etablissement) ?? el('span', 'et-pill', etablissement));
    return box;
  }

  // ===== La photo de profil =====

  function paintPhoto() {
    const has = Boolean(draft.Avatar);
    ui.photoPreview.replaceChildren(session.renderAvatar({ initials: session.person.initials, photo: draft.Avatar }));
    ui.photoAdd.textContent = has ? 'Changer la photo' : 'Ajouter une photo';
    ui.photoRemove.hidden = !has;
  }

  function photoError(message) {
    ui.photoErr.textContent = message;
    ui.photoErr.hidden = message === '';
  }

  // Pendant que l'image se prépare, les deux boutons et « Relire » attendent (refresh() lit le drapeau).
  // Les boutons sont marqués `aria-disabled` et non `disabled` : un bouton désactivé perd le focus du
  // clavier, qui ne reviendrait pas une fois l'image prête.
  function setPhotoBusy(busy) {
    preparingPhoto = busy;
    for (const control of [ui.photoAdd, ui.photoRemove]) {
      if (busy) control.setAttribute('aria-disabled', 'true');
      else control.removeAttribute('aria-disabled');
    }
    ui.photoStatus.textContent = busy ? 'Préparation de l’image…' : '';
    refresh();
  }

  // « Retirer la photo » : le brouillon n'a plus de photo, qu'elle soit celle de Grist ou celle qu'on vient de
  // choisir. Sans photo au départ, choisir puis retirer revient à ne rien changer. Le bouton disparaît :
  // le focus passe à « Ajouter une photo » plutôt que de se perdre.
  function dropPhoto() {
    if (preparingPhoto) return;
    forgetPhoto();
    draft.Avatar = 0;
    photoError('');
    paintPhoto();
    ui.photoAdd.focus();
    refresh();
  }

  async function choosePhoto(file) {
    const mine = generation;
    photoError('');
    setPhotoBusy(true);
    let prepared;
    try {
      prepared = await prepareImage(file, IMAGE_RULES.avatar);
    } catch (error) {
      if (mine !== generation) return;
      setPhotoBusy(false);
      if (error?.name === 'ImageError') photoError(error.message);
      else {
        console.error('[IMAGE] Préparation de l\'image impossible :', error);
        photoError('Cette image n’a pas pu être lue : choisissez un autre fichier.');
      }
      return;
    }
    if (mine !== generation || phase !== 'editing') return;
    forgetPhoto();
    prepared.url = URL.createObjectURL(prepared.blob);
    draft.Avatar = prepared;
    paintPhoto();
    setPhotoBusy(false);
  }

  // Le cadre « Photo de profil » du formulaire : la photo du brouillon, les deux boutons et l'aide.
  function photoSection() {
    const box = el('section', 'photo-field');
    ui.photoPreview = el('div', 'photo-preview');
    const help = el('p', 'photo-help', PHOTO_HELP);
    help.id = 'profilePhotoHelp';
    ui.photoErr = el('p', 'fld-err');
    ui.photoErr.id = 'profilePhotoError';
    ui.photoErr.hidden = true;
    ui.photoStatus = el('p', 'photo-status');
    ui.photoStatus.setAttribute('role', 'status');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = IMAGE_RULES.avatar.types.join(',');
    file.hidden = true;
    file.id = 'profilePhotoFile';
    file.setAttribute('aria-label', 'Choisir une photo de profil');
    file.setAttribute('aria-describedby', `${help.id} ${ui.photoErr.id}`);
    file.addEventListener('change', () => {
      const chosen = file.files[0];
      file.value = '';
      if (chosen) choosePhoto(chosen);
    });
    ui.photoAdd = button('', 'btn', () => { if (!preparingPhoto) file.click(); });
    ui.photoRemove = button('Retirer la photo', 'btn btn-danger', dropPhoto);
    const actions = el('div', 'photo-actions');
    actions.append(ui.photoAdd, ui.photoRemove);
    const info = el('div', 'photo-info');
    info.append(el('h3', 'photo-title', 'Photo de profil'), help, actions, ui.photoStatus, ui.photoErr, file);
    box.append(ui.photoPreview, info);
    paintPhoto();
    return box;
  }

  // Les miniatures de la ligne « Photo de profil » d'une liste de changements : la photo actuelle,
  // puis la nouvelle (celle du brouillon). Rien pour une photo qui n'existe pas.
  function photoThumb(side, line) {
    const photo = side === 'before' ? line.before : (line.after === 'replace' ? draft.Avatar : 0);
    return photo ? session.renderThumb(photo, side === 'before' ? 'Photo actuelle' : 'Nouvelle photo') : null;
  }

  function textField(field) {
    const id = `profile-${field.key}`;
    const wrap = el('div', field.key === 'Fonction' ? 'fld fld-wide' : 'fld');
    const label = el('label', 'fld-label', field.label);
    label.htmlFor = id;
    const input = document.createElement('input');
    input.id = id;
    input.type = field.kind === 'phone' ? 'tel' : field.kind === 'email' ? 'email' : 'text';
    input.autocomplete = 'off';
    if (field.kind === 'email') input.spellcheck = false;
    input.value = draft[field.key];
    const error = el('p', 'fld-err');
    error.id = `${id}-error`;
    error.hidden = true;
    // Une adresse facultative dit ce qu'elle remplace.
    const hint = field.optional ? el('p', 'fld-hint', 'Facultatif : l’adresse montrée sur la carte. Laissée vide, la carte montre l’adresse du compte.') : null;
    if (hint) hint.id = `${id}-hint`;
    input.setAttribute('aria-describedby', hint ? `${error.id} ${hint.id}` : error.id);
    input.addEventListener('input', () => {
      draft[field.key] = input.value;
      refresh();
    });
    if (field.kind === 'phone') {
      // Un numéro valide se remet en forme à la sortie du champ : « 0556789012 » devient « 05 56 78 90 12 ».
      input.addEventListener('blur', () => {
        const digits = frenchPhoneDigits(input.value);
        if (!digits) return;
        input.value = formatPhone(digits);
        draft[field.key] = input.value;
        refresh();
      });
    }
    wrap.append(label, input, error);
    if (hint) wrap.append(hint);
    ui.fields[field.key] = { input, error };
    return wrap;
  }

  // Un choix parmi une liste : la liste déroulante et, à côté, une recherche qui n'y garde que les valeurs qui lui
  // répondent. L'option vide (« Choisir… », « Non renseigné ») et la valeur choisie y restent toujours : la liste
  // montre ce que contient le brouillon, et chercher ne change rien au choix.
  function referenceField(field) {
    const id = `profile-${field.key}`;
    const wrap = el('div', 'fld fld-wide');
    const label = el('label', 'fld-label', field.label);
    label.htmlFor = id;
    const select = document.createElement('select');
    select.id = id;
    // Une valeur requise (l'établissement) ne se vide pas : l'option vide n'existe que si la
    // fiche n'en a pas encore.
    const empty = field.required
      ? (field.value === 0 ? [{ id: 0, label: 'Choisir…' }] : [])
      : [{ id: 0, label: 'Non renseigné' }];
    const choices = [...empty, ...field.options];
    const found = el('p', 'fld-found');
    found.setAttribute('role', 'status');
    const paint = term => {
      const chosen = draft[field.key];
      const shown = choices.filter(choice => choice.id === 0 || choice.id === chosen || matchesTerm(choice.label, term));
      select.replaceChildren(...shown.map(choice => {
        const node = document.createElement('option');
        node.value = String(choice.id);
        node.textContent = choice.label;
        return node;
      }));
      select.value = String(chosen);
      found.textContent = foundText(term, choices.filter(choice => choice.id !== 0 && matchesTerm(choice.label, term)).length);
    };
    paint('');
    const search = searchField({ label: `Rechercher dans ${field.label}`, placeholder: `Rechercher dans ${field.label}…`, onTerm: paint });
    search.setAttribute('aria-controls', id);
    const pair = el('div', 'fld-pair');
    pair.append(search, select);
    const error = el('p', 'fld-err');
    error.id = `${id}-error`;
    error.hidden = true;
    const warning = session.fieldWarning ? el('p', 'fld-hint warn') : null;
    if (warning) {
      warning.id = `${id}-warning`;
      warning.hidden = true;
    }
    select.setAttribute('aria-describedby', warning ? `${error.id} ${warning.id}` : error.id);
    select.addEventListener('change', () => {
      draft[field.key] = Number(select.value);
      refresh();
    });
    wrap.append(label, pair, found, error);
    if (warning) wrap.append(warning);
    ui.fields[field.key] = { input: select, error, warning };
    return wrap;
  }

  // Toutes les valeurs proposées en pastilles à cocher, groupées par domaine quand
  // les valeurs portent un `group`, avec une recherche.
  function picker(field) {
    const section = el('section', 'grp');
    section.style.setProperty('--c', CATEGORIES[field.category].color);
    const count = el('span', 'grp-count');
    const head = el('div', 'grp-head');
    head.append(el('h3', 'grp-title', field.label), count);
    section.append(head);
    const syncCount = () => {
      const n = draft[field.key].length;
      count.textContent = `${n} sélectionné${n > 1 ? 's' : ''}`;
    };

    if (field.options.length === 0) {
      section.append(el('p', 'fld-hint', 'Aucune valeur proposée dans Grist.'));
      syncCount();
      return section;
    }

    const chips = [];
    const makeChip = option => {
      const chip = button(option.label, 'pick');
      const sync = () => {
        const on = draft[field.key].includes(option.id);
        chip.classList.toggle('on', on);
        chip.setAttribute('aria-pressed', String(on));
      };
      chip.addEventListener('click', () => {
        const list = draft[field.key];
        const at = list.indexOf(option.id);
        if (at >= 0) list.splice(at, 1);
        else list.push(option.id);
        sync();
        syncCount();
        refresh();
      });
      sync();
      chips.push({ chip, text: normalize(option.label) });
      return chip;
    };

    const subgroups = [];
    if (field.options.some(option => option.group)) {
      const byGroup = new Map();
      field.options.forEach(option => {
        const name = option.group || '';
        if (!byGroup.has(name)) {
          const sub = el('div', 'subgrp');
          sub.append(el('p', 'subgrp-title', name));
          const picks = el('div', 'picks');
          sub.append(picks);
          byGroup.set(name, picks);
          subgroups.push(sub);
        }
        byGroup.get(name).append(makeChip(option));
      });
    } else {
      const picks = el('div', 'picks');
      field.options.forEach(option => picks.append(makeChip(option)));
      subgroups.push(picks);
    }

    const found = el('p', 'fld-found');
    found.setAttribute('role', 'status');
    section.append(searchField({
      label: `Rechercher dans ${field.label}`,
      placeholder: `Rechercher dans ${field.label}…`,
      onTerm: term => {
        chips.forEach(({ chip, text }) => {
          chip.hidden = term !== '' && !text.includes(term);
        });
        subgroups.forEach(sub => {
          sub.hidden = !sub.querySelector('.pick:not([hidden])');
        });
        found.textContent = foundText(term, chips.filter(({ chip }) => !chip.hidden).length);
      }
    }), found, ...subgroups);
    syncCount();
    return section;
  }

  // La case de la fiche qu'on crée, cochée d'avance (voir CONSENT_LABEL). Même présentation que la case de la fiche
  // d'établissement : son nom en gras, ce qu'elle change en dessous.
  function publishField() {
    const id = `profile-${CONSENT_COLUMN}`;
    const box = el('label', 'es-chk');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = draft[CONSENT_COLUMN] === true;
    const name = el('span', 'es-chk-label', CONSENT_LABEL);
    name.id = `${id}-label`;
    const help = el('span', 'es-chk-sub', PUBLISH_HELP);
    help.id = `${id}-help`;
    input.setAttribute('aria-labelledby', name.id);
    input.setAttribute('aria-describedby', help.id);
    input.addEventListener('change', () => {
      draft[CONSENT_COLUMN] = input.checked;
      refresh();
    });
    const text = el('span');
    text.append(name, help);
    box.append(input, text);
    return box;
  }

  // ===== Pied de fenêtre =====

  // Une modification annule l'avertissement « Échap » : il ne vaut que pour l'état présent.
  function armReset() {
    escapeArmed = false;
    if (ui.hint) ui.hint.hidden = true;
  }

  const hasUnsaved = () => evaluation.lines.length > 0;

  // Le pied commun au formulaire et à la relecture : un résumé, l'avertissement « Échap »
  // et les boutons.
  function renderFoot(summary, ...buttons) {
    escapeArmed = false;
    ui.summary = el('p', 'dlg-summary', summary);
    ui.summary.setAttribute('aria-live', 'polite');
    ui.hint = el('p', 'dlg-hint', 'Des modifications ne sont pas enregistrées. Appuyez encore sur Échap pour les abandonner.');
    ui.hint.setAttribute('role', 'status');
    ui.hint.hidden = true;
    const actions = el('div', 'dlg-actions');
    actions.append(...buttons);
    const left = el('div', 'dlg-status');
    left.append(ui.summary, ui.hint);
    foot.replaceChildren(left, actions);
  }

  // ===== Étape 1 : le formulaire =====

  // Le résumé du pied de fenêtre quand le brouillon est refusé : le premier problème, dans
  // l'ordre du formulaire.
  function faultSummary({ prenom, nom, email, email_affiche: shown, numero_de_telephone: phone, Etablissement: etablissement }) {
    if (prenom === NAME_REQUIRED || nom === NAME_REQUIRED) return 'Indiquez au moins un prénom ou un nom';
    if (email || shown) return 'Corrigez l’adresse e-mail';
    if (phone) return 'Corrigez le numéro de téléphone';
    if (etablissement === ETABLISSEMENT_REQUIRED) return 'Choisissez votre établissement';
    return 'Corrigez les champs signalés';
  }

  // Remet à jour tout ce qui dépend du brouillon, sans reconstruire les champs (ils
  // garderaient leur curseur).
  function refresh() {
    armReset();
    evaluation = session.evaluate(draft);
    const { lines, errors, fieldErrors } = evaluation;

    Object.entries(ui.fields).forEach(([key, { input, error, warning }]) => {
      const fault = fieldErrors[key] || '';
      error.textContent = fault;
      error.hidden = !fault;
      input.setAttribute('aria-invalid', String(Boolean(fault)));
      if (warning) {
        const text = session.fieldWarning(key, draft[key]) || '';
        warning.textContent = text;
        warning.hidden = !text;
      }
    });

    // « Ce qui va changer » se lit sous le formulaire pendant qu'on le remplit.
    ui.recap.hidden = lines.length === 0;
    ui.recap.replaceChildren(...(lines.length === 0 ? [] : [el('h4', 'recap-title', recapTitle()), renderChangeList(lines, photoThumb)]));

    ui.summary.textContent = errors.length > 0 ? faultSummary(fieldErrors)
      : lines.length === 0 ? (isCreating() ? 'Aucun champ rempli' : 'Aucune modification')
        : (isCreating() ? fieldsFilled : fieldsChanged)(lines.length);
    ui.review.disabled = errors.length > 0 || lines.length === 0 || preparingPhoto;
  }

  function renderEditing() {
    phase = 'editing';
    dialog.classList.remove('dlg-review');
    const { person } = session;
    if (isCreating()) {
      setHeading('Créer ma fiche', 'Vous relisez votre fiche avant de la publier : elle est ajoutée tout de suite, sans validation.');
    } else {
      setHeading(
        isAdmin() ? `Modifier la fiche de ${person.name}` : 'Modifier mon profil',
        isAdmin()
          ? 'Mode admin : vous modifiez la fiche d’une autre personne. Vous relisez les modifications avant de les valider, elles s’appliquent ensuite tout de suite.'
          : 'Vous relisez vos modifications avant de les valider : elles s’appliquent ensuite tout de suite à votre fiche.'
      );
    }
    ui = { fields: {} };
    ui.alert = el('div', 'dlg-alert');
    ui.recap = el('section', 'recap');
    ui.recap.setAttribute('aria-label', recapTitle());
    ui.recap.hidden = true;

    const grid = el('div', 'fld-grid');
    const pickers = [];
    let photo = null;
    session.model.forEach(field => {
      if (field.kind === 'image') photo = photoSection();
      else if (field.kind === 'text' || field.kind === 'phone' || field.kind === 'email') grid.append(textField(field));
      else if (field.kind === 'reference') grid.append(referenceField(field));
      else pickers.push(picker(field));
    });
    const publish = isCreating() && typeof draft[CONSENT_COLUMN] === 'boolean' ? [publishField()] : [];
    body.replaceChildren(ui.alert, identityBlock(), ...(photo ? [photo] : []), grid, ...pickers, ...publish, ui.recap);

    ui.review = button(reviewLabel(), 'btn btn-primary', startReview);
    renderFoot('', button('Annuler', 'btn', () => dialog.close()), ui.review);
    refresh();
    announceStep();
  }

  // ===== Étape 2 : la relecture =====

  function setPreparing(preparing) {
    ui.review.disabled = preparing || ui.review.disabled;
    ui.review.textContent = preparing ? 'Préparation…' : reviewLabel();
    ui.review.setAttribute('aria-busy', String(preparing));
  }

  async function startReview() {
    if (phase !== 'editing' || ui.review.disabled) return;
    const mine = generation;
    phase = 'preparing';
    setPreparing(true);
    ui.alert.replaceChildren();
    let next;
    try {
      next = await session.review(draft);
    } catch (error) {
      if (mine !== generation) return;
      phase = 'editing';
      setPreparing(false);
      refresh();
      ui.alert.replaceChildren(notice('ko', error?.message || 'La relecture n\'a pas pu être préparée.', 'alert'));
      body.scrollTop = 0;
      return;
    }
    if (mine !== generation) return;
    renderReview(next, next.notice);
  }

  // Une colonne de la relecture : « Avant » ou « Après », sa légende et la carte.
  function previewColumn(tone, label, note, card) {
    const column = el('section', `rv-col rv-col-${tone}`);
    const heading = el('h3', '', label);
    heading.id = `review-${tone}-title`;
    heading.append(el('small', '', note));
    column.setAttribute('aria-labelledby', heading.id);
    column.append(heading, card);
    return column;
  }

  // Ce que veulent dire les repères de la carte « Après » : un exemple de chacun.
  function legend() {
    const box = el('p', 'rv-legend');
    const added = el('span');
    const sampleAdded = el('b', 'lg lg-add', '+ Exemple');
    sampleAdded.setAttribute('aria-hidden', 'true');
    added.append(sampleAdded, ' ajouté ou modifié : contour vert et pastille');
    const gone = el('span');
    const sampleGone = el('b', 'lg lg-del', 'Exemple');
    sampleGone.setAttribute('aria-hidden', 'true');
    gone.append(sampleGone, ' retiré : barré en rouge');
    box.append(added, gone);
    return box;
  }

  // Ce que l'administrateur doit savoir quand il change l'adresse e-mail d'une fiche :
  // les droits de la personne (table ACL) ne suivent pas.
  const EMAIL_NOTICE = 'L’adresse change dans BDD, pas dans la table ACL : si cette personne est administratrice ou '
    + 'responsable d’un établissement, ses droits restent attachés à son ancienne adresse.';

  function renderReview(next, message = '') {
    review = next;
    phase = 'reviewing';
    // Une fiche qu'on crée n'a pas de carte « avant » : une seule carte, sans repères ni légende, dans une
    // fenêtre de largeur ordinaire.
    dialog.classList.toggle('dlg-review', !isCreating());
    setHeading(
      isCreating() ? (publishes() ? 'Relire avant de publier' : 'Relire avant de créer') : 'Relire avant de valider',
      isCreating()
        ? 'Voici votre carte telle qu’elle apparaîtra dans l’annuaire. La fiche est créée tout de suite, sans validation.'
        : `Voici ${isAdmin() ? `la carte de ${session.person.name}` : 'votre carte'} telle qu’elle est aujourd’hui et telle qu’elle apparaîtra. `
          + 'Les changements sont repérés sur la carte « Après ».'
    );
    ui = { fields: {} };
    ui.alert = el('div', 'dlg-alert');

    const parts = [ui.alert];
    if (!isCreating()) parts.push(legend());
    if (message) parts.push(notice('pending', message, 'status'));
    const hidden = session.hiddenNotice?.(review) || '';
    if (hidden) parts.push(notice('pending', hidden, 'status'));
    if (isAdmin() && review.lines.some(line => line.key === 'email')) parts.push(notice('pending', EMAIL_NOTICE, 'status'));
    const cards = el('div', isCreating() ? 'rv-cols rv-cols-one' : 'rv-cols');
    if (isCreating()) {
      cards.append(previewColumn('after', 'Ma fiche', 'telle qu’elle apparaîtra', session.renderCard(review.after, null)));
    } else {
      cards.append(
        previewColumn('before', 'Avant', 'telle qu’elle est aujourd’hui', session.renderCard(review.before, null)),
        previewColumn('after', 'Après', 'telle qu’elle apparaîtra', session.renderCard(review.after, review.marks))
      );
    }
    const detailTitle = isCreating() ? 'Ce qui sera enregistré' : 'Détail des changements';
    const detail = el('section', 'recap');
    detail.setAttribute('aria-label', detailTitle);
    detail.append(el('h4', 'recap-title', detailTitle), renderChangeList(review.lines, photoThumb));
    parts.push(cards, detail);
    body.replaceChildren(...parts);

    ui.back = button('Retour', 'btn', backToEditing);
    ui.validate = button(validateLabel(), 'btn btn-ok', validate);
    renderFoot((isCreating() ? fieldsFilled : fieldsChanged)(review.lines.length), ui.back, ui.validate);
    announceStep();
  }

  function backToEditing() {
    if (phase !== 'reviewing') return;
    renderEditing();
  }

  // ===== Étape 3 : l'enregistrement =====

  function setSaving(saving) {
    ui.validate.textContent = saving ? 'Enregistrement…' : validateLabel();
    ui.validate.setAttribute('aria-busy', String(saving));
    ui.validate.disabled = saving;
    ui.back.disabled = saving;
    closeButton.disabled = saving;
  }

  async function validate() {
    if (phase !== 'reviewing') return;
    const mine = generation;
    phase = 'saving';
    setSaving(true);
    ui.alert.replaceChildren();
    let result;
    try {
      result = await session.save(review, draft);
    } catch (error) {
      if (mine !== generation) return;
      phase = 'reviewing';
      setSaving(false);
      ui.alert.replaceChildren(notice('ko', error?.message || 'La modification n\'a pas pu être enregistrée.', 'alert'));
      body.scrollTop = 0;
      return;
    }
    if (mine !== generation) return;
    closeButton.disabled = false;
    if (result.status === 'changed') renderReview(result.review, result.notice);
    else if (result.leftovers.length > 0 || !result.reloaded) renderSaved(result);
    else finish(result);
  }

  // Tout est enregistré : la fenêtre se ferme et un message le confirme. Rien ne reste à lire.
  function finish(result) {
    const { person, notify } = session;
    phase = 'saved';
    dialog.close();
    notify?.(isCreating() ? createdNotice(result) : isAdmin() ? `La fiche de ${person.name} est enregistrée.` : 'Vos modifications sont enregistrées.');
  }

  // Enregistré, mais avec une réserve à lire : Grist n'a pas tout gardé, ou l'annuaire n'a
  // pas pu être rechargé. La fenêtre reste ouverte pour la dire.
  function renderSaved(result) {
    phase = 'saved';
    dialog.classList.remove('dlg-review');
    const { person } = session;
    setHeading(isCreating() ? 'Fiche créée' : 'Fiche enregistrée',
      isCreating() ? 'Votre fiche est dans l’annuaire Grist.' : isAdmin() ? `La fiche de ${person.name} est à jour.` : 'Votre fiche est à jour.');
    const done = el('div', 'sent');
    done.append(
      el('div', 'sent-mark', '✓'),
      el('h3', '', isCreating() ? 'Votre fiche est créée' : isAdmin() ? `La fiche de ${person.name} est enregistrée` : 'Vos modifications sont enregistrées'),
      el('p', '', isCreating()
        ? (publishes() ? createdNotice(result) : 'Pour apparaître dans l’annuaire, activez l’interrupteur « Apparaître dans l\'annuaire » en haut de page.')
        : 'Elles s\'appliquent tout de suite dans Grist, sans validation.')
    );
    const recap = el('div', 'recap');
    recap.append(el('h4', 'recap-title', isCreating() ? 'Ce qui a été enregistré' : 'Ce qui a changé'), renderChangeList(result.lines, photoThumb));
    done.append(recap);
    const parts = [done];
    if (result.leftovers.length > 0) {
      parts.unshift(notice('ko', `Grist n'a pas gardé tout ce qui était demandé (${result.leftovers.join(', ')}). `
        + 'Vérifiez la fiche dans Grist ou contactez un administrateur.', 'alert'));
    }
    if (!result.reloaded) {
      parts.unshift(notice('pending', 'Les modifications sont enregistrées, mais l\'annuaire n\'a pas pu être rechargé. Rechargez la page pour les voir.', 'status'));
    }
    body.replaceChildren(...parts);
    const close = button('Fermer', 'btn btn-primary', () => dialog.close());
    const actions = el('div', 'dlg-actions');
    actions.append(close);
    foot.replaceChildren(actions);
    announceStep();
  }

  // ===== Ouverture et fermeture =====

  // Échap ne doit pas faire perdre un travail par mégarde : le premier appui prévient, le
  // second ferme. Pendant l'enregistrement, la fenêtre ne se ferme pas.
  dialog.addEventListener('cancel', event => {
    if (phase === 'saving') {
      event.preventDefault();
      return;
    }
    if (session && phase !== 'saved' && hasUnsaved() && !escapeArmed) {
      event.preventDefault();
      escapeArmed = true;
      ui.hint.hidden = false;
    }
  });

  // Pendant l'enregistrement, Échap ne ferme rien. Le navigateur ne laisse pas annuler
  // « cancel » deux fois de suite sans geste de la personne (il ferme alors la fenêtre) :
  // on arrête donc la touche elle-même.
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && phase === 'saving') event.preventDefault();
  });

  dialog.addEventListener('close', () => {
    const closed = session;
    generation += 1;
    forgetPhoto();
    draft = {};
    preparingPhoto = false;
    session = null;
    review = null;
    phase = 'editing';
    dialog.classList.remove('dlg-review');
    evaluation = { errors: [], fieldErrors: {}, lines: [] };
    closeButton.disabled = false;
    body.replaceChildren();
    foot.replaceChildren();
    ui = {};
    closed?.onClose?.();
  });

  closeButton.addEventListener('click', () => {
    if (phase !== 'saving') dialog.close();
  });

  return {
    isOpen: () => dialog.open,

    open(next) {
      generation += 1;
      forgetPhoto();
      preparingPhoto = false;
      session = next;
      draft = Object.fromEntries(Object.entries(next.draft).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
      escapeArmed = false;
      renderEditing();
      if (!dialog.open) dialog.showModal();
      announceStep();
    },

    close() {
      if (dialog.open) dialog.close();
    }
  };
}
