// La fenêtre « Demandes à valider » (index.html : #requestsDialog, 1.45.0) : un administrateur y relit les fiches que des personnes ont créées
// elles-mêmes et les valide ou les refuse. Une demande refusée est SUPPRIMÉE de BDD (la personne peut redemander) ; le bouton « Refuser » demande
// une confirmation, car rien ne la ramène. DOM seulement : requests.js lit et écrit, main.js relit l'annuaire après chaque décision.

import { button, el, notice } from './dom.js';
import { createDialogShell } from './dialog-shell.js';

const COUNT_TEXT = count => (count === 0 ? 'Aucune demande en attente' : `${count} demande${count > 1 ? 's' : ''} en attente`);

// Ce que le domaine de l'adresse dit de la demande (requests.js, describeRequests) : une alerte à lire avant de valider, ou rien.
const DOMAIN_NOTES = {
  ok: { tone: 'ok', text: 'Le domaine de l’adresse est celui de l’établissement choisi.' },
  other: { tone: 'warn', text: 'Attention : le domaine de l’adresse n’est pas celui de l’établissement choisi. Vérifiez avant de valider.' }
};

function identityOf(request) {
  const box = el('div', 'rq-main');
  box.append(el('p', 'rq-name', request.name), el('p', 'rq-mail', request.email));
  const meta = [request.etablissement, request.fonction].filter(Boolean).join(' · ');
  if (meta) box.append(el('p', 'rq-meta', meta));
  const note = DOMAIN_NOTES[request.domain];
  if (note) {
    const line = el('p', 'rq-domain', note.text);
    line.dataset.tone = note.tone;
    box.append(line);
  }
  return box;
}

// `dialog` : le <dialog> de index.html. `list()` : les demandes en attente (describeRequests) ; `decide(kind, request)` : 'approve' ou 'refuse', rend
// { status } (requests.js) et lève une erreur dont le message est lisible ; main.js relit l'annuaire ensuite. Renvoie { open, refresh }.
export function createRequestsDialog(dialog, { list, decide }) {
  let busy = false;
  let returnFocus = null;
  let announcement = '';
  const shell = createDialogShell(dialog, { isSaving: () => busy, hasUnsaved: () => false });
  dialog.addEventListener('close', () => {
    shell.reset();
    announcement = '';
    const target = returnFocus;
    returnFocus = null;
    target?.();
  });

  // La demande `request`, avec ses boutons. « Refuser » passe par une confirmation sur place.
  function item(request, { confirming, error }) {
    const li = el('li', 'rq-item');
    const actions = el('div', 'rq-actions');
    const act = kind => () => run(kind, request);
    if (confirming === request.id) {
      actions.append(
        button('Confirmer le refus', 'btn btn-danger', act('refuse')),
        button('Annuler', 'btn', () => render({ confirming: null }))
      );
    } else {
      actions.append(
        button('Valider', 'btn btn-ok', act('approve')),
        button('Refuser', 'btn btn-danger', () => render({ confirming: request.id }))
      );
    }
    li.append(identityOf(request), actions);
    if (confirming === request.id) {
      li.append(el('p', 'rq-confirm', 'Refuser supprime la demande de BDD. La personne pourra en refaire une.'));
    }
    if (error?.id === request.id) li.append(notice('ko', error.message, 'alert'));
    return li;
  }

  function render({ confirming = null, error = null } = {}) {
    const requests = list();
    shell.setHeading('Demandes à valider', COUNT_TEXT(requests.length));
    const parts = [];
    if (announcement) {
      const done = el('p', 'rq-done', announcement);
      done.setAttribute('role', 'status');
      parts.push(done);
    }
    if (requests.length === 0) {
      parts.push(el('p', 'rq-empty', 'Il n’y a aucune demande à valider pour le moment.'));
    } else {
      parts.push(el('p', 'rq-lead', 'Ces personnes ont créé leur fiche. Elle n’apparaît dans l’annuaire, et la personne n’y accède, qu’une fois validée.'));
      const ul = el('ul', 'rq-list');
      ul.append(...requests.map(request => item(request, { confirming, error })));
      parts.push(ul);
    }
    shell.body.replaceChildren(...parts);
    shell.showActions(button('Fermer', 'btn', shell.close));
  }

  // Une décision : tous les boutons attendent la fin (jamais deux écritures à la fois), puis la liste est relue.
  async function run(kind, request) {
    if (busy) return;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('.rq-actions .btn').forEach(node => node.setAttribute('aria-disabled', 'true'));
    try {
      const result = await decide(kind, request);
      announcement = result.message;
      busy = false;
      render();
    } catch (error) {
      busy = false;
      announcement = '';
      render({ error: { id: request.id, message: error?.message || 'La demande n’a pas pu être traitée.' } });
    } finally {
      busy = false;
      dialog.removeAttribute('aria-busy');
    }
  }

  return {
    // `onClose` : où rendre le focus à la fermeture.
    open(onClose) {
      returnFocus = onClose ?? null;
      announcement = '';
      render();
      if (!dialog.open) dialog.showModal();
      shell.announceStep();
    },

    // Redessine la liste quand l'annuaire vient d'être relu (une autre personne a pu envoyer une demande).
    refresh() {
      if (dialog.open && !busy) render();
    }
  };
}
