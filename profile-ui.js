// La fenêtre « Modifier mon profil » : la personne corrige sa fiche, voit en direct
// ce qui sera envoyé, puis l'envoie à un administrateur. Rien n'est écrit dans BDD
// ici ni ailleurs que par la validation de l'administrateur. DOM seulement : ce qui
// change (profile.js), ce qui s'envoie (main.js) et les libellés viennent de la
// session que main.js donne à open().

import { CATEGORIES, REQUEST_STATUS } from './constants.js';
import { formatPhone, normalize } from './grist-data.js';
import { el, formatDate } from './dom.js';
import { frenchPhoneDigits } from './profile.js';
import { MAX_MESSAGE_LENGTH } from './requests.js';
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
//   person        { name, email, initials }
//   etablissement libellé de son établissement
//   model         profileFormModel(row, referenceMaps)
//   draft         le brouillon de départ (draftOf, ou draftFromChanges pour une demande en attente)
//   message       le mot de départ pour l'administrateur
//   pending       { date } si une demande attend déjà
//   last          { status, date, reason } : la dernière demande traitée
//   evaluate      draft → { champs, errors, fieldErrors, summary, lines }
//   submit        ({ champs, summary, message }) → promesse : envoie la demande ; un échec
//                 porte dans `message` la phrase à montrer à la personne
export function createProfileDialog(dialog) {
  const body = dialog.querySelector('.dlg-body');
  const foot = dialog.querySelector('.dlg-foot');
  const closeButton = dialog.querySelector('[data-close]');

  let session = null;
  let draft = {};
  let message = '';
  let phase = 'editing'; // 'editing' | 'sending' | 'sent'
  let evaluation = null;
  let startKey = '';
  let startMessage = '';
  let escapeArmed = false;
  let ui = {};

  // ===== Ce que la personne a déjà fait =====

  function statusNotice() {
    const { pending, last } = session;
    if (pending) {
      const when = formatDate(pending.date);
      return notice('pending', `Une demande${when ? ` du ${when}` : ''} est en attente de validation. Vous la modifiez ici : l'envoyer de nouveau la remplace.`);
    }
    if (!last) return null;
    const when = formatDate(last.date);
    const label = `Votre dernière demande${when ? ` (${when})` : ''}`;
    if (last.status === REQUEST_STATUS.accepted) return notice('ok', `${label} a été validée.`);
    return notice('ko', `${label} a été refusée${last.reason ? ` : « ${last.reason} »` : '.'}`);
  }

  // Ce qui ne change pas par ce formulaire, dit en clair.
  function identityBlock() {
    const { person, etablissement } = session;
    const box = el('div', 'ident');
    box.append(el('div', 'avatar', person.initials));
    const main = el('div', 'ident-main');
    main.append(
      el('p', 'ident-name', person.name),
      el('p', 'ident-mail', person.email),
      el('p', 'ident-lock', 'Verrouillé : l\'e-mail et l\'établissement sont liés à votre compte. Pour les corriger, contactez un administrateur.')
    );
    box.append(main);
    if (etablissement) box.append(el('span', 'req-pill', etablissement));
    return box;
  }

  // ===== Les champs =====

  function textField(field) {
    const id = `profile-${field.key}`;
    const wrap = el('div', field.key === 'Fonction' ? 'fld fld-wide' : 'fld');
    const label = el('label', 'fld-label', field.label);
    label.htmlFor = id;
    const input = document.createElement('input');
    input.id = id;
    input.type = field.kind === 'phone' ? 'tel' : 'text';
    input.autocomplete = 'off';
    input.value = draft[field.key];
    const error = el('p', 'fld-err');
    error.id = `${id}-error`;
    error.hidden = true;
    input.setAttribute('aria-describedby', error.id);
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
    [{ id: 0, label: 'Non renseigné' }, ...field.options].forEach(option => {
      const node = document.createElement('option');
      node.value = String(option.id);
      node.textContent = option.label;
      select.append(node);
    });
    select.value = String(draft[field.key]);
    select.addEventListener('change', () => {
      draft[field.key] = Number(select.value);
      refresh();
    });
    wrap.append(label, select);
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

  // Le mot facultatif joint à la demande, que l'administrateur lit au-dessus des changements.
  function messageField() {
    const box = el('div', 'msg');
    const label = el('label', 'fld-label', 'Un mot pour l\'administrateur (facultatif)');
    const area = document.createElement('textarea');
    area.id = 'profile-message';
    area.maxLength = MAX_MESSAGE_LENGTH;
    area.placeholder = 'Par exemple : changement de poste depuis septembre.';
    area.value = message;
    label.htmlFor = area.id;
    const count = el('span', 'msg-count');
    const sync = () => {
      count.textContent = `${area.value.length} / ${MAX_MESSAGE_LENGTH}`;
    };
    area.addEventListener('input', () => {
      message = area.value;
      sync();
      armReset();
    });
    sync();
    box.append(label, area, count);
    return box;
  }

  // ===== Affichage =====

  // Une modification annule l'avertissement « Échap » : il ne vaut que pour l'état présent.
  function armReset() {
    escapeArmed = false;
    ui.hint.hidden = true;
  }

  function hasUnsent() {
    return JSON.stringify(evaluation.champs) !== startKey || message !== startMessage;
  }

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

    ui.recap.replaceChildren();
    ui.recap.hidden = lines.length === 0;
    if (lines.length > 0) ui.recap.append(el('h4', 'recap-title', 'Ce qui sera envoyé'), renderChangeList(lines));

    ui.summary.textContent = errors.length > 0 ? 'Corrigez les champs signalés'
      : lines.length === 0 ? 'Aucune modification' : fieldsChanged(lines.length);
    ui.send.disabled = errors.length > 0 || lines.length === 0;
  }

  function renderEditing() {
    ui = { fields: {} };
    ui.alert = el('div', 'dlg-alert');
    const parts = [ui.alert];
    const status = statusNotice();
    if (status) parts.push(status);
    parts.push(identityBlock());

    const grid = el('div', 'fld-grid');
    const pickers = [];
    session.model.forEach(field => {
      if (field.kind === 'text' || field.kind === 'phone') grid.append(textField(field));
      else if (field.kind === 'reference') grid.append(referenceField(field));
      else pickers.push(picker(field));
    });
    parts.push(grid, ...pickers, messageField());

    ui.recap = el('section', 'recap');
    ui.recap.setAttribute('aria-label', 'Ce qui sera envoyé');
    parts.push(ui.recap);
    body.replaceChildren(...parts);

    ui.summary = el('p', 'dlg-summary');
    ui.summary.setAttribute('aria-live', 'polite');
    ui.hint = el('p', 'dlg-hint', 'Des changements ne sont pas envoyés. Appuyez encore sur Échap pour les abandonner.');
    ui.hint.setAttribute('role', 'status');
    ui.hint.hidden = true;
    ui.cancel = button('Annuler', 'btn', () => dialog.close());
    ui.send = button('Envoyer pour validation', 'btn btn-primary', send);
    const actions = el('div', 'dlg-actions');
    actions.append(ui.cancel, ui.send);
    const left = el('div', 'dlg-status');
    left.append(ui.summary, ui.hint);
    foot.replaceChildren(left, actions);

    evaluation = session.evaluate(draft);
    startKey = JSON.stringify(evaluation.champs);
    startMessage = message;
    refresh();
  }

  function renderSent(sent) {
    const done = el('div', 'sent');
    done.append(
      el('div', 'sent-mark', '✓'),
      el('h3', '', 'Demande envoyée'),
      el('p', '', 'Un administrateur la validera. Votre fiche reste inchangée dans l\'annuaire d\'ici là. Vous retrouverez l\'état de la demande dans « Modifier mon profil ».')
    );
    if (sent.message) done.append(el('p', 'sent-msg', `Votre mot à l'administrateur : « ${sent.message} »`));
    const recap = el('div', 'recap');
    recap.append(el('h4', 'recap-title', 'Ce qui a été envoyé'), renderChangeList(sent.lines));
    done.append(recap);
    body.replaceChildren(done);
    const close = button('Fermer', 'btn btn-primary', () => dialog.close());
    const actions = el('div', 'dlg-actions');
    actions.append(close);
    foot.replaceChildren(actions);
    close.focus();
  }

  function setSending(sending) {
    ui.send.disabled = sending || ui.send.disabled;
    ui.send.textContent = sending ? 'Envoi en cours…' : 'Envoyer pour validation';
    ui.send.setAttribute('aria-busy', String(sending));
    ui.cancel.disabled = sending;
    closeButton.disabled = sending;
    body.querySelectorAll('input, select, textarea, .pick').forEach(node => { node.disabled = sending; });
  }

  async function send() {
    if (phase !== 'editing' || ui.send.disabled) return;
    const { champs, summary, lines } = evaluation;
    const sentMessage = message.trim();
    phase = 'sending';
    setSending(true);
    ui.alert.replaceChildren();
    try {
      await session.submit({ champs, summary, message: sentMessage });
    } catch (error) {
      phase = 'editing';
      setSending(false);
      refresh();
      ui.alert.replaceChildren(notice('ko', error?.message || 'L\'envoi de la demande n\'a pas pu aboutir.', 'alert'));
      body.scrollTop = 0;
      return;
    }
    phase = 'sent';
    closeButton.disabled = false;
    renderSent({ lines, message: sentMessage });
  }

  // ===== Ouverture et fermeture =====

  // Échap ne doit pas faire perdre un travail par mégarde : le premier appui prévient, le
  // second ferme. Pendant l'envoi, la fenêtre ne se ferme pas.
  dialog.addEventListener('cancel', event => {
    if (phase === 'sending') {
      event.preventDefault();
      return;
    }
    if (phase === 'editing' && session && hasUnsent() && !escapeArmed) {
      event.preventDefault();
      escapeArmed = true;
      ui.hint.hidden = false;
    }
  });

  dialog.addEventListener('close', () => {
    session = null;
    phase = 'editing';
    closeButton.disabled = false;
    body.replaceChildren();
    foot.replaceChildren();
    ui = {};
  });

  closeButton.addEventListener('click', () => {
    if (phase !== 'sending') dialog.close();
  });

  return {
    isOpen: () => dialog.open,

    open(next) {
      session = next;
      draft = Object.fromEntries(Object.entries(next.draft).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
      message = next.message || '';
      phase = 'editing';
      escapeArmed = false;
      renderEditing();
      if (!dialog.open) dialog.showModal();
    },

    close() {
      if (dialog.open) dialog.close();
    }
  };
}
