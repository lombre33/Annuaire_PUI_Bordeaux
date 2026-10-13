// La fiche d'un établissement : une fenêtre où un responsable change le logo, le nom complet, la
// visibilité dans l'annuaire et la liste des responsables. L'enregistrement est direct, sans
// relecture avant/après (la maquette v5 validée le veut ainsi). Textes et mise en page suivent la
// maquette.
// DOM seulement : ce qui change (etablissement.js), ce qui s'écrit (etablissement-save.js) et
// l'image (image-prep.js) viennent de ce que main.js donne à open().

import { IMAGE_RULES } from './constants.js';
import { button, el, notice } from './dom.js';
import {
  diffEtablissement, draftOfEtablissement, KEEP_ONE, nominate, NAME_REQUIRED, rebaseDraft, summaryOf,
  toggleResponsable, visibilityWarning
} from './etablissement.js';
import { megabytes, prepareImage } from './image-prep.js';

const LOGO_HELP = {
  with: `Il apparaît sur les cartes de l’établissement et dans le bandeau du bas. PNG, JPG, WebP ou SVG, ${megabytes(IMAGE_RULES.logo.maxBytes)} au maximum, ramené à ${IMAGE_RULES.logo.maxSide} px de large.`,
  without: `Sans logo, les cartes affichent le sigle de l’établissement et le bandeau du bas son nom. PNG, JPG, WebP ou SVG, ${megabytes(IMAGE_RULES.logo.maxBytes)} au maximum.`,
  noColumn: 'Le logo ne peut pas être modifié d’ici : la colonne « logo » n’existe pas dans la table Etablissements (GRIST_SETUP.md, étape 5).'
};
const NO_LIST = 'La liste des responsables n’a pas pu être lue : elle n’est ni affichée ni modifiable d’ici. '
  + 'Les règles d’accès de Grist doivent laisser un responsable lire la table ACL pour son établissement (GRIST_SETUP.md).';
const SELF_REMOVAL = 'Vous retirez votre propre accès : une fois enregistré, vous ne pourrez plus modifier cette fiche.';

// `dialog` : le <dialog> de index.html.
//
// open(session) :
//   choices     [{ id, acronym, name }] les établissements dont la personne est responsable : un
//               seul s'ouvre tout de suite, plusieurs se choisissent d'abord
//   load        (identifiant) → promesse de la fiche telle qu'elle est dans Grist (main.js la relit) :
//                 etablissement   etablissementOf()
//                 responsables    [{ email }] ou null si la liste n'a pas pu être lue
//                 candidates      [{ email, name, initials }] les personnes de l'établissement qu'on
//                                 peut nommer
//                 warning         { hidden, includesMe } : combien de fiches l'annuaire montre pour
//                                 cet établissement, et si la mienne en fait partie
//                 meEmail         l'adresse de la personne connectée
//               un échec porte dans `message` la phrase à montrer
//   lookup      adresse → { name, initials, photo } si la personne a une fiche visible dans l'annuaire
//               (`photo` : l'identifiant de sa photo de profil, 0 sans photo), { hidden: true } si elle
//               en a une qui n'y figure pas (son nom ne se dévoile pas), null si aucune fiche ne porte
//               cette adresse
//   renderAvatar  { initials, photo } → l'avatar rond d'une personne (avatar-ui.js)
//   renderLogo  (fiche) → l'élément qui montre le logo actuel (null : le sigle en pastille)
//   save        (draft, fiche) → promesse de { status: 'saved', unsaved, reloaded } ou
//               { status: 'changed', fiche, notice } (la fiche a changé dans Grist pendant que la
//               fenêtre était ouverte : rien n'est écrit) ; un échec porte `message`
//   notify      (facultatif) message → la confirmation d'un enregistrement sans réserve, donnée une
//               fois la fenêtre fermée
//   onClose     (facultatif) appelé quand la fenêtre est fermée : rend le focus à l'endroit d'où elle
//               a été ouverte
export function createEtablissementDialog(dialog) {
  const title = dialog.querySelector('.dlg-head h2');
  const subtitle = dialog.querySelector('.dlg-sub');
  const body = dialog.querySelector('.dlg-body');
  const foot = dialog.querySelector('.dlg-foot');
  const closeButton = dialog.querySelector('[data-close]');

  let session = null;
  let generation = 0; // change à chaque ouverture : une réponse tardive d'une fenêtre fermée est ignorée
  let chosen = null; // l'établissement choisi : { id, acronym, name }
  let fiche = null;
  let draft = null;
  let phase = 'closed'; // 'choosing' | 'loading' | 'editing' | 'saving' | 'saved' | 'failed'
  let evaluation = { champs: {}, labels: [], errors: [], fieldErrors: {} };
  let escapeArmed = false;
  let previewUrl = null; // l'adresse locale de l'image choisie, à libérer
  let ui = {};

  const acronym = () => fiche?.etablissement.acronym ?? chosen?.acronym ?? '';

  function setHeading(heading, detail) {
    title.textContent = heading;
    subtitle.textContent = detail;
  }

  // Place le curseur de lecture sur le titre : un lecteur d'écran l'annonce, et le clavier ne reste
  // pas sur un bouton qui vient de disparaître.
  function announceStep() {
    title.focus({ preventScroll: true });
    body.scrollTop = 0;
  }

  function forgetPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  const hasUnsaved = () => evaluation.labels.length > 0;

  // Le pied : un résumé (annoncé), l'avertissement « Échap » et les boutons.
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

  // ===== Choix de l'établissement =====

  // Un responsable de plusieurs établissements choisit celui dont il ouvre la fiche.
  function renderChooser() {
    phase = 'choosing';
    setHeading('Mon établissement', 'Vous êtes responsable de plusieurs établissements : choisissez celui dont vous voulez modifier la fiche.');
    ui = {};
    const list = el('ul', 'es-choices');
    session.choices.forEach(choice => {
      const item = el('li');
      const pick = button('', 'es-choice', () => start(choice));
      pick.dataset.etabId = String(choice.id);
      pick.append(el('span', 'es-choice-name', choice.acronym));
      if (choice.name && choice.name !== choice.acronym) pick.append(el('span', 'es-choice-full', choice.name));
      item.append(pick);
      list.append(item);
    });
    body.replaceChildren(list);
    const actions = el('div', 'dlg-actions');
    actions.append(button('Annuler', 'btn', () => dialog.close()));
    foot.replaceChildren(actions);
    announceStep();
  }

  function start(choice) {
    chosen = choice;
    load();
  }

  // ===== Lecture de la fiche =====

  function renderLoading() {
    phase = 'loading';
    setHeading(`Fiche de l’établissement : ${acronym()}`, 'Lecture de la fiche dans Grist…');
    ui = {};
    const wait = el('p', 'es-wait', 'Lecture de la fiche dans Grist…');
    wait.setAttribute('role', 'status');
    body.replaceChildren(wait);
    const actions = el('div', 'dlg-actions');
    actions.append(button('Annuler', 'btn', () => dialog.close()));
    foot.replaceChildren(actions);
    announceStep();
  }

  function renderFailed(message) {
    phase = 'failed';
    setHeading(`Fiche de l’établissement : ${acronym()}`, 'La fiche n’a pas pu être ouverte.');
    body.replaceChildren(notice('ko', message || 'La fiche n’a pas pu être lue dans Grist.', 'alert'));
    const actions = el('div', 'dlg-actions');
    actions.append(button('Fermer', 'btn btn-primary', () => dialog.close()));
    foot.replaceChildren(actions);
    announceStep();
  }

  async function load() {
    const mine = generation;
    renderLoading();
    let loaded;
    try {
      loaded = await session.load(chosen.id);
    } catch (error) {
      if (mine !== generation) return;
      renderFailed(error?.message);
      return;
    }
    if (mine !== generation) return;
    fiche = loaded;
    draft = draftOfEtablissement(fiche.etablissement, fiche.responsables ?? []);
    renderForm();
  }

  // ===== Le logo =====

  const showsLogo = () => (draft.logo.action === 'replace' ? true
    : draft.logo.action === 'remove' ? false : fiche.etablissement.logo.length > 0);

  function paintLogo() {
    const { etablissement } = fiche;
    let shown;
    if (draft.logo.action === 'replace' && previewUrl) {
      shown = el('img', 'es-tile-img');
      shown.alt = `Nouveau logo de ${etablissement.name || acronym()}`;
      shown.src = previewUrl;
    } else if (showsLogo()) {
      shown = session.renderLogo?.(fiche) ?? null;
    }
    ui.tile.replaceChildren(shown ?? el('span', 'et-pill', acronym()));
    if (!etablissement.logoColumn) return;
    ui.replace.textContent = showsLogo() ? 'Remplacer le logo' : 'Ajouter un logo';
    ui.remove.hidden = !showsLogo();
    ui.logoHelp.textContent = showsLogo() ? LOGO_HELP.with : LOGO_HELP.without;
  }

  function logoError(message) {
    ui.logoErr.textContent = message;
    ui.logoErr.hidden = message === '';
  }

  // « Retirer le logo » : un logo qui n'existe pas dans Grist n'est pas à retirer, le choix revient
  // alors à « ne rien changer ».
  function dropLogo() {
    forgetPreview();
    draft.logo = fiche.etablissement.logo.length > 0 ? { action: 'remove' } : { action: 'keep' };
    logoError('');
    paintLogo();
    refresh();
  }

  async function chooseFile(file) {
    const mine = generation;
    logoError('');
    ui.replace.disabled = true;
    ui.remove.disabled = true;
    ui.logoStatus.textContent = 'Préparation de l’image…';
    let prepared;
    try {
      prepared = await prepareImage(file);
    } catch (error) {
      if (mine !== generation) return;
      ui.replace.disabled = false;
      ui.remove.disabled = false;
      ui.logoStatus.textContent = '';
      if (error?.name === 'ImageError') logoError(error.message);
      else {
        console.error('[IMAGE] Préparation de l\'image impossible :', error);
        logoError('Cette image n’a pas pu être lue : choisissez un autre fichier.');
      }
      return;
    }
    if (mine !== generation) return;
    forgetPreview();
    previewUrl = URL.createObjectURL(prepared.blob);
    draft.logo = { action: 'replace', file: prepared };
    ui.replace.disabled = false;
    ui.remove.disabled = false;
    ui.logoStatus.textContent = '';
    paintLogo();
    refresh();
  }

  function logoSection() {
    const { etablissement } = fiche;
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
    ui.remove = button('Retirer le logo', 'btn btn-danger', dropLogo);
    if (etablissement.logoColumn) {
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
        if (chosen) chooseFile(chosen);
      });
      const actions = el('div', 'es-logo-actions');
      actions.append(ui.replace, ui.remove);
      info.append(actions, ui.logoStatus, ui.logoErr, file);
    }
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

  function nameField() {
    const wrap = el('div', 'fld fld-wide');
    const label = el('label', 'fld-label', 'Nom complet');
    label.htmlFor = 'etabName';
    ui.name = document.createElement('input');
    ui.name.id = 'etabName';
    ui.name.type = 'text';
    ui.name.autocomplete = 'off';
    ui.name.value = draft.name;
    ui.nameErr = el('p', 'fld-err');
    ui.nameErr.id = 'etabName-error';
    ui.nameErr.hidden = true;
    ui.name.setAttribute('aria-describedby', ui.nameErr.id);
    ui.name.addEventListener('input', () => {
      draft.name = ui.name.value;
      refresh();
    });
    wrap.append(label, ui.name, ui.nameErr);
    return wrap;
  }

  function visibilityField() {
    const box = el('label', 'es-chk');
    ui.visible = document.createElement('input');
    ui.visible.type = 'checkbox';
    ui.visible.id = 'etabVisible';
    ui.visible.checked = draft.visible;
    ui.visible.addEventListener('change', () => {
      draft.visible = ui.visible.checked;
      refresh();
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

  const isMe = email => email === fiche.meEmail;

  // Le nom de la personne pour cette adresse, quand sa fiche figure dans l'annuaire ; sinon ce qu'on
  // peut en dire sans la dévoiler.
  function whoIs(email) {
    const found = session.lookup?.(email) ?? null;
    if (found?.name) return { name: found.name, initials: found.initials, photo: found.photo ?? 0, named: true };
    return { name: found?.hidden ? 'Fiche masquée de l’annuaire' : 'Adresse sans fiche dans l’annuaire', initials: '@', photo: 0, named: false };
  }

  function responsableRow(item) {
    const person = whoIs(item.email);
    const name = person.name;
    const row = el('li', 'es-resp');
    row.dataset.state = item.state;
    row.dataset.mail = item.email;
    const avatar = session.renderAvatar({ initials: person.initials, photo: person.photo });
    const main = el('div', 'es-resp-main');
    const label = el('p', 'es-resp-name', name);
    if (isMe(item.email)) label.append(el('span', 'es-tag es-tag-you', 'vous'));
    if (item.state === 'added') label.append(el('span', 'es-tag es-tag-new', 'ajouté'));
    if (item.state === 'removed') label.append(el('span', 'es-tag es-tag-gone', 'retiré'));
    main.append(label, el('p', 'es-resp-mail', item.email));
    const action = item.state === 'removed' ? 'Rétablir' : 'Retirer';
    const toggle = button(action, 'btn', () => {
      toggleResponsable(draft, item.email);
      paintResponsables();
      refresh();
    });
    toggle.setAttribute('aria-label', `${action} ${person.named ? name : item.email}`);
    row.append(avatar, main, toggle);
    return row;
  }

  function paintResponsables() {
    ui.list.replaceChildren(...draft.responsables.map(responsableRow));
    const taken = new Set(draft.responsables.filter(item => item.state !== 'removed').map(item => item.email));
    const candidates = fiche.candidates.filter(candidate => !taken.has(candidate.email));
    ui.pick.replaceChildren(...[{ email: '', name: candidates.length > 0 ? 'Choisir une personne' : 'Aucune autre personne' }, ...candidates].map(candidate => {
      const option = document.createElement('option');
      option.value = candidate.email;
      option.textContent = candidate.name;
      return option;
    }));
    ui.pick.disabled = candidates.length === 0 || ui.mail.value.trim() !== '';
  }

  function nominateTyped() {
    const problem = nominate(draft, ui.pick.value || ui.mail.value);
    ui.addErr.textContent = problem;
    ui.addErr.hidden = problem === '';
    if (problem) return;
    ui.pick.value = '';
    ui.mail.value = '';
    ui.mail.disabled = false;
    paintResponsables();
    refresh();
  }

  function responsablesSection() {
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
    ui.mail.addEventListener('input', () => { ui.pick.disabled = ui.mail.value.trim() !== ''; });
    ui.mail.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        nominateTyped();
      }
    });
    add.append(ui.pick, ui.mail, button('Nommer', 'btn', nominateTyped));
    box.append(ui.list, ui.selfNote, ui.minErr, add, ui.addErr);
    return box;
  }

  // ===== Mise à jour de ce qui dépend du brouillon =====

  function armReset() {
    escapeArmed = false;
    if (ui.hint) ui.hint.hidden = true;
  }

  // Sans reconstruire les champs (ils garderaient leur curseur).
  function refresh() {
    armReset();
    evaluation = diffEtablissement(fiche.etablissement, draft, { readable: fiche.responsables !== null });
    const { fieldErrors, errors, labels } = evaluation;

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
      ui.selfNote.hidden = !draft.responsables.some(item => item.state === 'removed' && isMe(item.email));
      ui.minErr.hidden = !fieldErrors.responsables;
    }

    ui.summary.textContent = summaryOf(evaluation);
    ui.save.disabled = labels.length === 0 || errors.length > 0;
  }

  // ===== Le formulaire =====

  function renderForm(message = '') {
    phase = 'editing';
    const { etablissement } = fiche;
    setHeading(`Fiche de l’établissement : ${etablissement.acronym}`, 'Vos modifications s’enregistrent tout de suite, sans validation ni relecture.');
    ui = {};
    ui.alert = el('div', 'dlg-alert');
    if (message) ui.alert.append(notice('pending', message, 'status'));

    const fields = el('div', 'fld-grid');
    fields.append(
      readOnlyField('etabAcronym', 'Sigle', etablissement.sigle, 'Il sert de filtre sur les cartes : il ne se change pas ici.', 'Aucun sigle'),
      readOnlyField('etabStatus', 'Statut', etablissement.status, 'Géré par l’équipe du PUI.'),
      nameField()
    );
    const [visible, visibleNote] = visibilityField();
    body.replaceChildren(ui.alert, logoSection(), fields, visible, visibleNote, responsablesSection());

    ui.save = button('Enregistrer', 'btn btn-primary', save);
    ui.cancel = button('Annuler', 'btn', () => dialog.close());
    renderFoot('', ui.cancel, ui.save);
    paintLogo();
    if (fiche.responsables !== null) paintResponsables();
    refresh();
    announceStep();
  }

  // ===== L'enregistrement =====

  function setSaving(saving) {
    ui.save.textContent = saving ? 'Enregistrement…' : 'Enregistrer';
    ui.save.setAttribute('aria-busy', String(saving));
    ui.save.disabled = saving;
    ui.cancel.disabled = saving;
    closeButton.disabled = saving;
  }

  async function save() {
    if (phase !== 'editing' || ui.save.disabled) return;
    const mine = generation;
    phase = 'saving';
    setSaving(true);
    ui.alert.replaceChildren();
    let result;
    try {
      result = await session.save(draft, fiche);
    } catch (error) {
      if (mine !== generation) return;
      phase = 'editing';
      setSaving(false);
      refresh();
      ui.alert.replaceChildren(notice('ko', error?.message || 'La modification n’a pas pu être enregistrée.', 'alert'));
      body.scrollTop = 0;
      return;
    }
    if (mine !== generation) return;
    closeButton.disabled = false;
    if (result.status === 'changed') {
      // La fiche telle qu'elle est maintenant dans Grist ; ce que la personne a saisi est conservé.
      fiche = result.fiche;
      draft = fiche.responsables === null ? { ...draft, responsables: [] } : rebaseDraft(draft, fiche.responsables);
      renderForm(result.notice);
      return;
    }
    if (result.unsaved?.length > 0 || result.reloaded === false) renderSaved(result);
    else finish();
  }

  // Tout est enregistré : la fenêtre se ferme et un message le confirme. Rien ne reste à lire.
  function finish() {
    const { notify } = session;
    const label = acronym();
    phase = 'saved';
    dialog.close();
    notify?.(`La fiche de ${label} est enregistrée.`);
  }

  // Enregistré, mais avec une réserve à lire : Grist n'a pas tout gardé, ou l'annuaire n'a pas pu
  // être rechargé. La fenêtre reste ouverte pour le dire.
  function renderSaved(result) {
    phase = 'saved';
    setHeading('Fiche enregistrée', `La fiche de ${acronym()} est à jour.`);
    const done = el('div', 'sent');
    done.append(
      el('div', 'sent-mark', '✓'),
      el('h3', '', `La fiche de ${acronym()} est enregistrée`),
      el('p', '', 'Les modifications s’appliquent tout de suite dans Grist, sans validation.')
    );
    const parts = [done];
    if (result.unsaved?.length > 0) {
      parts.unshift(notice('ko', `Grist n’a pas gardé tout ce qui était demandé (${result.unsaved.join(', ')}). `
        + 'Vérifiez la fiche dans Grist ou contactez un administrateur.', 'alert'));
    }
    if (result.reloaded === false) {
      parts.unshift(notice('pending', 'Les modifications sont enregistrées, mais l’annuaire n’a pas pu être rechargé. Rechargez la page pour les voir.', 'status'));
    }
    body.replaceChildren(...parts);
    const actions = el('div', 'dlg-actions');
    actions.append(button('Fermer', 'btn btn-primary', () => dialog.close()));
    foot.replaceChildren(actions);
    announceStep();
  }

  // ===== Ouverture et fermeture =====

  // Échap ne doit pas faire perdre un travail par mégarde : le premier appui prévient, le second
  // ferme. Pendant l'enregistrement, la fenêtre ne se ferme pas.
  dialog.addEventListener('cancel', event => {
    if (phase === 'saving') {
      event.preventDefault();
      return;
    }
    if (session && phase === 'editing' && hasUnsaved() && !escapeArmed) {
      event.preventDefault();
      escapeArmed = true;
      ui.hint.hidden = false;
    }
  });

  // Le navigateur ne laisse pas annuler « cancel » deux fois de suite sans geste de la personne :
  // pendant l'enregistrement on arrête donc la touche elle-même.
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && phase === 'saving') event.preventDefault();
  });

  dialog.addEventListener('close', () => {
    const closed = session;
    generation += 1;
    session = null;
    chosen = null;
    fiche = null;
    draft = null;
    phase = 'closed';
    forgetPreview();
    evaluation = { champs: {}, labels: [], errors: [], fieldErrors: {} };
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
      forgetPreview();
      session = next;
      chosen = null;
      fiche = null;
      draft = null;
      escapeArmed = false;
      evaluation = { champs: {}, labels: [], errors: [], fieldErrors: {} };
      if (!dialog.open) dialog.showModal();
      if (next.choices.length === 1) start(next.choices[0]);
      else renderChooser();
    },

    close() {
      if (dialog.open) dialog.close();
    }
  };
}
