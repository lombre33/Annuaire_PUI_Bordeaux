// La fenêtre de modification d'une fiche, en trois temps : le formulaire, la relecture
// (la carte avant et la carte après, avec ce qui change repéré) puis la confirmation.
// DOM seulement : ce qui change (profile.js), ce qui s'écrit (profile-save.js) et les
// cartes (render.js) viennent de la session que main.js donne à open().

import { CATEGORIES } from './constants.js';
import { formatPhone, normalize } from './grist-data.js';
import { el } from './dom.js';
import { frenchPhoneDigits } from './profile.js';
import { renderChangeList } from './changes-ui.js';

// Au-delà de ce nombre de valeurs, un sélecteur propose une recherche.
const SEARCH_FROM = 12;

const fieldsChanged = count => `${count} champ${count > 1 ? 's' : ''} modifié${count > 1 ? 's' : ''}`;

function button(label, className, onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function notice(kind, text, role) {
  const box = el('div', `notice notice-${kind}`);
  if (role) box.setAttribute('role', role);
  box.append(el('p', '', text));
  return box;
}

// `dialog` : le <dialog> de index.html.
//
// open(session) :
//   mode          'own' (sa propre fiche) ou 'admin' (celle d'une autre personne)
//   person        { name, email, initials } de la fiche
//   etablissement libellé de son établissement
//   model         profileFormModel(row, referenceMaps)
//   draft         le brouillon de départ (draftOf)
//   evaluate      draft → { errors, fieldErrors, lines } : ce que le brouillon change et
//                 pourquoi il serait refusé
//   review        draft → promesse de { before, after, marks, lines, visibility, notice } :
//                 relit la fiche dans Grist et prépare les deux cartes ; un échec porte
//                 dans `message` la phrase à montrer
//   hiddenNotice  visibility → ce que la relecture dit d'une fiche absente de l'annuaire
//                 ('' si elle y figure)
//   save          (review, draft) → promesse de { status: 'saved', lines, leftovers,
//                 reloaded } ou { status: 'changed', review, notice } (la fiche a changé
//                 pendant la relecture : rien n'est écrit) ; un échec porte `message`
//   renderCard    (contact, marks) → la carte à montrer (render.js)
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
  let ui = {};

  const isAdmin = () => session.mode === 'admin';

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
  // formulaire, et le bloc le dit. Un administrateur qui modifie la fiche d'une autre
  // personne les change dans les champs qui suivent.
  function identityBlock() {
    const { person, etablissement } = session;
    const box = el('div', 'ident');
    box.append(el('div', 'avatar', person.initials));
    const main = el('div', 'ident-main');
    main.append(el('p', 'ident-name', person.name), el('p', 'ident-mail', person.email));
    if (!isAdmin()) {
      main.append(el('p', 'ident-lock', 'Verrouillé : l\'e-mail et l\'établissement sont liés à votre compte. Pour les corriger, contactez un administrateur.'));
    }
    box.append(main);
    if (etablissement) box.append(el('span', 'pill', etablissement));
    return box;
  }

  // Ce que dit le champ sous lui, pour le champ qui a besoin d'une explication.
  const HINTS = {
    email: 'Sert à retrouver la personne dans l\'annuaire. Ses droits d\'administrateur ou de responsable, déclarés dans la table ACL avec son adresse, ne changent pas.'
  };

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
    const described = [error.id];
    const hint = HINTS[field.key] ? el('p', 'fld-hint', HINTS[field.key]) : null;
    if (hint) {
      hint.id = `${id}-hint`;
      described.push(hint.id);
    }
    input.setAttribute('aria-describedby', described.join(' '));
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

  function referenceField(field) {
    const id = `profile-${field.key}`;
    const wrap = el('div', 'fld');
    const label = el('label', 'fld-label', field.label);
    label.htmlFor = id;
    const select = document.createElement('select');
    select.id = id;
    // Une valeur requise (l'établissement) ne se vide pas : l'option vide n'existe que si la
    // fiche n'en a pas encore.
    const empty = field.required
      ? (field.value === 0 ? [{ id: 0, label: 'Choisir…' }] : [])
      : [{ id: 0, label: 'Non renseigné' }];
    [...empty, ...field.options].forEach(option => {
      const node = document.createElement('option');
      node.value = String(option.id);
      node.textContent = option.label;
      select.append(node);
    });
    select.value = String(draft[field.key]);
    const error = el('p', 'fld-err');
    error.id = `${id}-error`;
    error.hidden = true;
    select.setAttribute('aria-describedby', error.id);
    select.addEventListener('change', () => {
      draft[field.key] = Number(select.value);
      refresh();
    });
    wrap.append(label, select, error);
    ui.fields[field.key] = { input: select, error };
    return wrap;
  }

  // Toutes les valeurs proposées en pastilles à cocher, groupées par domaine quand
  // les valeurs portent un `group`, avec une recherche quand la liste est longue.
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

    if (field.options.length > SEARCH_FROM) {
      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'pick-search';
      search.placeholder = `Rechercher dans ${field.label.toLowerCase()}…`;
      search.autocomplete = 'off';
      search.setAttribute('aria-label', `Rechercher dans ${field.label}`);
      search.addEventListener('input', () => {
        const term = normalize(search.value);
        chips.forEach(({ chip, text }) => {
          chip.hidden = term !== '' && !text.includes(term);
        });
        subgroups.forEach(sub => {
          sub.hidden = !sub.querySelector('.pick:not([hidden])');
        });
      });
      section.append(search);
    }
    section.append(...subgroups);
    syncCount();
    return section;
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

  // Remet à jour tout ce qui dépend du brouillon, sans reconstruire les champs (ils
  // garderaient leur curseur).
  function refresh() {
    armReset();
    evaluation = session.evaluate(draft);
    const { lines, errors, fieldErrors } = evaluation;

    Object.entries(ui.fields).forEach(([key, { input, error }]) => {
      const fault = fieldErrors[key] || '';
      error.textContent = fault;
      error.hidden = !fault;
      input.setAttribute('aria-invalid', String(Boolean(fault)));
    });

    ui.summary.textContent = errors.length > 0 ? 'Corrigez les champs signalés'
      : lines.length === 0 ? 'Aucune modification' : fieldsChanged(lines.length);
    ui.review.disabled = errors.length > 0 || lines.length === 0;
  }

  function renderEditing() {
    phase = 'editing';
    const { person } = session;
    setHeading(
      isAdmin() ? `Modifier la fiche de ${person.name}` : 'Modifier mon profil',
      isAdmin()
        ? 'Vous modifiez cette fiche en tant qu\'administrateur. Avant d\'enregistrer, vous relirez la carte avant et après.'
        : 'Avant d\'enregistrer, vous relirez votre carte avant et après.'
    );
    ui = { fields: {} };
    ui.alert = el('div', 'dlg-alert');

    const grid = el('div', 'fld-grid');
    const pickers = [];
    session.model.forEach(field => {
      if (field.kind === 'text' || field.kind === 'phone' || field.kind === 'email') grid.append(textField(field));
      else if (field.kind === 'reference') grid.append(referenceField(field));
      else pickers.push(picker(field));
    });
    body.replaceChildren(ui.alert, identityBlock(), grid, ...pickers);

    ui.review = button(isAdmin() ? 'Relire les modifications' : 'Relire mes modifications', 'btn btn-primary', startReview);
    renderFoot('', button('Annuler', 'btn', () => dialog.close()), ui.review);
    refresh();
    announceStep();
  }

  // ===== Étape 2 : la relecture =====

  function setPreparing(preparing) {
    ui.review.disabled = preparing || ui.review.disabled;
    ui.review.textContent = preparing
      ? 'Préparation…'
      : (isAdmin() ? 'Relire les modifications' : 'Relire mes modifications');
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

  function previewColumn(label, note, tone, card) {
    const column = el('figure', `preview-col preview-${tone}`);
    const caption = el('figcaption', 'preview-caption');
    caption.append(el('span', 'preview-label', label), el('span', 'preview-note', note));
    column.append(caption, card);
    return column;
  }

  function legend() {
    const box = el('p', 'legend');
    box.append(
      el('span', 'legend-key legend-new', 'Ajouté ou modifié : en vert, avec une pastille ou un «\u00a0+\u00a0»'),
      el('span', 'legend-key legend-gone', 'Retiré : barré en rouge')
    );
    return box;
  }

  function renderReview(next, message = '') {
    review = next;
    phase = 'reviewing';
    setHeading(
      isAdmin() ? `Relire les modifications de ${session.person.name}` : 'Relire vos modifications',
      'Rien n\'est enregistré avant « Valider ». Ce qui change est repéré dans la carte « Après ».'
    );
    ui = { fields: {} };
    ui.alert = el('div', 'dlg-alert');

    const parts = [ui.alert];
    if (message) parts.push(notice('pending', message, 'status'));
    const hidden = session.hiddenNotice?.(review.visibility) || '';
    if (hidden) parts.push(notice('pending', hidden, 'status'));
    const cards = el('div', 'preview');
    cards.append(
      previewColumn('Avant', 'telle qu\'elle est aujourd\'hui', 'before', session.renderCard(review.before, null)),
      previewColumn('Après', 'telle qu\'elle sera', 'after', session.renderCard(review.after, review.marks))
    );
    const detail = el('section', 'recap');
    detail.setAttribute('aria-label', 'Détail des changements');
    detail.append(el('h4', 'recap-title', 'Ce qui change'), renderChangeList(review.lines));
    parts.push(legend(), cards, detail);
    body.replaceChildren(...parts);

    ui.back = button('Retour', 'btn', backToEditing);
    ui.validate = button('Valider', 'btn btn-primary', validate);
    renderFoot(fieldsChanged(review.lines.length), ui.back, ui.validate);
    announceStep();
  }

  function backToEditing() {
    if (phase !== 'reviewing') return;
    renderEditing();
  }

  // ===== Étape 3 : l'enregistrement =====

  function setSaving(saving) {
    ui.validate.textContent = saving ? 'Enregistrement…' : 'Valider';
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
    else renderSaved(result);
  }

  function renderSaved(result) {
    phase = 'saved';
    const { person } = session;
    setHeading('Fiche enregistrée', isAdmin() ? `La fiche de ${person.name} est à jour.` : 'Votre fiche est à jour.');
    const done = el('div', 'sent');
    done.append(
      el('div', 'sent-mark', '✓'),
      el('h3', '', isAdmin() ? `La fiche de ${person.name} est enregistrée` : 'Vos modifications sont enregistrées'),
      el('p', '', 'Elles s\'appliquent tout de suite dans Grist, sans validation.')
    );
    const recap = el('div', 'recap');
    recap.append(el('h4', 'recap-title', 'Ce qui a changé'), renderChangeList(result.lines));
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
    session = null;
    review = null;
    phase = 'editing';
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
