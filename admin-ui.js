// La fenêtre des administrateurs : les demandes de modification à valider ou à
// refuser, et l'historique de celles qui sont traitées. DOM seulement : ce que
// contient une demande (requests.js), ce qu'on en montre (admin-view.js) et ce
// qu'on écrit dans Grist (main.js) arrivent par `context` et par les actions.

import { REQUEST_STATUS } from './constants.js';
import { normalizeEmail } from './grist-data.js';
import { el, formatDate } from './dom.js';
import { MAX_MESSAGE_LENGTH } from './requests.js';
import { renderChangeList } from './changes-ui.js';
import { PAGE_SIZE, bulkTargets, etablissementsOf, filterRequests, pageOf } from './admin-view.js';

const plural = (count, singular, pluralForm = `${singular}s`) => (count > 1 ? pluralForm : singular);
const fieldsCount = count => `${count} ${plural(count, 'champ')}`;
const GENERIC_FAILURE = 'L\'opération n\'a pas pu aboutir. Le détail est dans la console du navigateur.';

function button(label, className, onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

const DONE_BADGES = {
  [REQUEST_STATUS.accepted]: { label: 'Validée', className: 'badge-ok' },
  [REQUEST_STATUS.refused]: { label: 'Refusée', className: 'badge-ko' },
  [REQUEST_STATUS.superseded]: { label: 'Remplacée', className: 'badge-part' }
};

// `dialog` : le <dialog> d'administration de index.html.
// `actions` (chacune renvoie une promesse ; un échec porte une phrase dans `message`) :
//   onRefresh()            relit les demandes
//   onValidate(id)         valide une demande
//   onRefuse(id, reason)   la refuse, avec le motif dit à la personne
//   onValidateAll(ids)     valide plusieurs demandes ; renvoie [{ id, ok, error? }]
// Après chaque action, main.js rappelle update(context) avec l'état relu.
//
// context :
//   adminEmail           l'adresse de l'administrateur connecté
//   active, history      les demandes à traiter (plus anciennes d'abord) et les autres
//                        (plus récentes d'abord, `effectiveStatus` dit leur état réel)
//   person(id)           { name, initials, etablissement, search } ou null
//   describe(request)    describeRequest(...) mémorisé
export function createAdminDialog(dialog, actions) {
  const part = selector => dialog.querySelector(selector);
  const main = part('.admin-main');
  const tabs = [...dialog.querySelectorAll('.tab')];
  const search = part('[data-admin-search]');
  const etablissementSelect = part('[data-admin-etab]');
  const refreshButton = part('[data-admin-refresh]');
  const bulkButton = part('[data-admin-bulk]');
  const bulkCancel = part('[data-admin-bulk-cancel]');
  const statusLine = part('[data-admin-status]');
  const closeButton = part('[data-close]');

  let context = null;
  let loadFailure = '';
  const view = { tab: 'pending', query: '', etablissement: '', shown: PAGE_SIZE, rejecting: null, bulk: false };
  const reasons = new Map(); // id → motif en cours de saisie
  const failures = new Map(); // id → ce qui a échoué sur cette demande
  const busy = new Set(); // demandes en cours de traitement
  let bulkRunning = false;
  let refreshing = false;

  const setStatus = (message, tone = 'info') => {
    statusLine.textContent = message;
    statusLine.dataset.tone = tone;
    statusLine.hidden = message === '';
  };

  // ===== Les cartes =====

  function problemNotices(description) {
    const boxes = [];
    if (description.problems.length > 0) {
      const box = el('div', 'notice notice-ko');
      const text = el('p', '', `Cette demande ne peut pas être validée : ${description.problems.join(' ; ')}. Elle peut être refusée.`);
      box.append(text);
      boxes.push(box);
    }
    description.warnings.forEach(warning => {
      const box = el('div', 'notice notice-pending');
      box.append(el('p', '', warning));
      boxes.push(box);
    });
    return boxes;
  }

  function reasonBox(request) {
    const box = el('div', 'reason');
    const id = `admin-reason-${request.id}`;
    const label = el('label', '', 'Motif du refus (facultatif, visible par la personne)');
    label.htmlFor = id;
    const area = document.createElement('textarea');
    area.id = id;
    area.maxLength = MAX_MESSAGE_LENGTH;
    area.value = reasons.get(request.id) || '';
    area.addEventListener('input', () => reasons.set(request.id, area.value));
    const confirm = button('Confirmer le refus', 'btn btn-danger', () => decide(request.id, 'Demande refusée.',
      () => actions.onRefuse(request.id, area.value)));
    const back = button('Annuler', 'btn', () => {
      view.rejecting = null;
      render();
    });
    const buttons = el('div', 'reason-actions');
    buttons.append(confirm, back);
    box.append(label, area, buttons);
    return box;
  }

  function requestCard(request) {
    const description = context.describe(request);
    const who = context.person(request.personId);
    const state = request.effectiveStatus ?? request.status;
    const pending = state === REQUEST_STATUS.pending;
    const working = busy.has(request.id);
    const card = el('article', 'req');
    card.dataset.requestId = String(request.id);

    const head = el('header', 'req-head');
    const avatar = el('div', 'avatar', who?.initials || '?');
    avatar.setAttribute('aria-hidden', 'true');
    const whoBox = el('div', 'req-who');
    const name = el('p', 'req-name', who?.name || 'Fiche introuvable');
    if (normalizeEmail(request.authorEmail) && normalizeEmail(request.authorEmail) === normalizeEmail(context.adminEmail)) {
      name.append(' ', el('span', 'badge badge-self', 'Votre demande'));
    }
    whoBox.append(name, el('p', 'req-sub', who?.etablissement || 'Établissement inconnu'));
    head.append(avatar, whoBox);

    const body = el('div', 'req-body');
    if (failures.has(request.id)) {
      const box = el('div', 'notice notice-ko');
      box.setAttribute('role', 'alert');
      box.append(el('p', '', failures.get(request.id)));
      body.append(box);
    }
    if (request.message) {
      const note = el('blockquote', 'req-msg');
      note.append(el('span', 'req-msg-label', 'Message de la personne'), request.message);
      body.append(note);
    }
    if (pending) body.append(...problemNotices(description));
    body.append(description.lines.length > 0
      ? renderChangeList(description.lines)
      : el('p', 'none', 'Le détail de cette demande est illisible.'));

    const foot = el('footer', 'req-foot');
    if (pending) {
      const by = request.authorEmail ? ` · par ${request.authorEmail}` : '';
      const when = formatDate(request.date);
      foot.append(el('span', 'req-meta', `Demande${when ? ` du ${when}` : ''} · ${fieldsCount(description.lines.length)}${by}`));
      if (view.rejecting === request.id) {
        foot.append(reasonBox(request));
      } else {
        const refuse = button('Refuser', 'btn btn-danger', () => {
          view.rejecting = request.id;
          render();
          part(`#admin-reason-${request.id}`)?.focus();
        });
        const validate = button(working ? 'Validation…' : 'Valider', 'btn btn-ok',
          () => decide(request.id, 'Demande validée.', () => actions.onValidate(request.id)));
        validate.disabled = working || !description.canValidate;
        if (!description.canValidate) validate.title = 'Cette demande ne peut pas être validée (voir ci-dessus).';
        refuse.disabled = working;
        const buttons = el('div', 'req-actions');
        buttons.append(refuse, validate);
        foot.append(buttons);
      }
    } else {
      const badge = DONE_BADGES[state] || { label: state, className: 'badge-part' };
      const when = formatDate(request.decidedAt);
      const meta = state === REQUEST_STATUS.superseded && !request.decidedBy
        ? 'Remplacée par une demande plus récente de la même personne.'
        : `${request.decidedBy ? `par ${request.decidedBy}` : 'traitée'}${when ? `, le ${when}` : ''}${request.reason ? ` : « ${request.reason} »` : ''}`;
      foot.append(el('span', `badge ${badge.className}`, badge.label), el('span', 'req-meta', meta));
    }
    card.append(head, body, foot);
    return card;
  }

  // ===== L'écran =====

  function render() {
    refreshButton.disabled = refreshing || bulkRunning;
    refreshButton.textContent = refreshing ? 'Actualisation…' : 'Actualiser';
    const top = main.scrollTop;

    if (!context) {
      main.replaceChildren(el('p', 'empty-admin', loadFailure || 'Chargement des demandes…'));
      bulkButton.hidden = true;
      bulkCancel.hidden = true;
      return;
    }

    tabs[0].textContent = `À valider (${context.active.length})`;
    tabs[1].textContent = `Traitées (${context.history.length})`;
    tabs.forEach(tab => {
      const selected = tab.dataset.tab === view.tab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    main.setAttribute('aria-labelledby', tabs.find(tab => tab.dataset.tab === view.tab).id);

    const source = view.tab === 'pending' ? context.active : context.history;
    const labels = etablissementsOf(source, context.person);
    if (view.etablissement && !labels.includes(view.etablissement)) view.etablissement = '';
    etablissementSelect.replaceChildren(...[['', 'Tous les établissements'], ...labels.map(label => [label, label])].map(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      return option;
    }));
    etablissementSelect.value = view.etablissement;

    const filtered = filterRequests(source, view, context.person);
    const targets = view.tab === 'pending' ? bulkTargets(filtered, context.describe) : [];
    if (targets.length < 2) view.bulk = false;
    bulkButton.hidden = targets.length < 2;
    bulkCancel.hidden = bulkButton.hidden || !view.bulk;
    bulkButton.textContent = view.bulk ? `Confirmer : valider ${targets.length} demandes` : `Tout valider (${targets.length})`;
    bulkButton.disabled = bulkRunning;
    bulkCancel.disabled = bulkRunning;
    bulkButton.title = filtered.length > targets.length
      ? `${filtered.length - targets.length} demande(s) à examiner une par une ne sont pas comprises.` : '';

    if (filtered.length === 0) {
      const none = view.tab === 'pending' ? 'Aucune demande à valider.' : 'Aucune demande traitée.';
      main.replaceChildren(el('p', 'empty-admin', source.length > 0 ? 'Aucune demande ne correspond à cette recherche.' : none));
      return;
    }
    const { items, rest } = pageOf(filtered, view.shown);
    const list = el('div', 'req-list');
    list.append(...items.map(requestCard));
    if (rest > 0) {
      list.append(button(`Afficher les ${Math.min(rest, PAGE_SIZE)} suivantes (${rest} restantes)`, 'btn', () => {
        view.shown += PAGE_SIZE;
        render();
      }));
    }
    main.replaceChildren(list);
    main.scrollTop = top;
  }

  // Une décision : la carte se fige pendant l'écriture, puis main.js rappelle update() avec
  // l'état relu. Un échec reste affiché sur la carte, rien n'est caché.
  async function decide(id, success, run) {
    if (busy.has(id) || bulkRunning) return;
    busy.add(id);
    failures.delete(id);
    setStatus('');
    render();
    try {
      await run();
      view.rejecting = null;
      reasons.delete(id);
      setStatus(success);
      main.focus();
    } catch (error) {
      failures.set(id, error?.message || GENERIC_FAILURE);
    } finally {
      busy.delete(id);
    }
    render();
  }

  async function validateAll() {
    if (!view.bulk) {
      view.bulk = true;
      render();
      return;
    }
    const source = view.tab === 'pending' ? context.active : [];
    const ids = bulkTargets(filterRequests(source, view, context.person), context.describe);
    bulkRunning = true;
    failures.clear();
    setStatus('Validation en cours…');
    render();
    try {
      const outcomes = await actions.onValidateAll(ids);
      const ok = outcomes.filter(outcome => outcome.ok).length;
      const failed = outcomes.filter(outcome => !outcome.ok);
      failed.forEach(outcome => failures.set(outcome.id, outcome.error || GENERIC_FAILURE));
      setStatus(failed.length === 0
        ? `${ok} ${plural(ok, 'demande validée', 'demandes validées')}.`
        : `${ok} ${plural(ok, 'demande validée', 'demandes validées')}, ${failed.length} à revoir.`, failed.length > 0 ? 'error' : 'info');
    } catch (error) {
      setStatus(error?.message || GENERIC_FAILURE, 'error');
    } finally {
      bulkRunning = false;
      view.bulk = false;
    }
    render();
    main.focus();
  }

  async function refresh() {
    if (refreshing || bulkRunning) return;
    refreshing = true;
    setStatus('');
    render();
    try {
      await actions.onRefresh();
    } catch (error) {
      setStatus(error?.message || GENERIC_FAILURE, 'error');
    } finally {
      refreshing = false;
    }
    render();
  }

  // ===== Évènements =====

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      view.tab = tab.dataset.tab;
      Object.assign(view, { shown: PAGE_SIZE, rejecting: null, bulk: false });
      render();
    });
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.click();
      next.focus();
    });
  });
  search.addEventListener('input', () => {
    Object.assign(view, { query: search.value, shown: PAGE_SIZE, bulk: false });
    render();
  });
  etablissementSelect.addEventListener('change', () => {
    Object.assign(view, { etablissement: etablissementSelect.value, shown: PAGE_SIZE, bulk: false });
    render();
  });
  refreshButton.addEventListener('click', refresh);
  bulkButton.addEventListener('click', validateAll);
  bulkCancel.addEventListener('click', () => {
    view.bulk = false;
    render();
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    if (bulkRunning || busy.size > 0) event.preventDefault(); // pas de fermeture au milieu d'une écriture
  });

  return {
    isOpen: () => dialog.open,

    // Ouvre la fenêtre sur ses réglages de départ ; update() apporte les demandes.
    open() {
      Object.assign(view, { tab: 'pending', query: '', etablissement: '', shown: PAGE_SIZE, rejecting: null, bulk: false });
      reasons.clear();
      failures.clear();
      search.value = '';
      setStatus('');
      render();
      if (!dialog.open) dialog.showModal();
    },

    update(next) {
      context = next;
      loadFailure = '';
      render();
    },

    // La lecture des demandes a échoué : on le dit au lieu de laisser « Chargement… ».
    showFailure(message) {
      loadFailure = message;
      if (!context) render();
      else setStatus(message, 'error');
    },

    close() {
      if (dialog.open) dialog.close();
    }
  };
}
