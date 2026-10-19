// Ce que les deux fenêtres de modification ont en commun (index.html : #profileDialog et #etabDialog) : le titre, le sous-titre,
// le corps et le pied de la fenêtre, le pied « résumé, avertissement Échap, boutons », la règle d'Échap et ce que main.js tient
// d'une fenêtre (isOpen, open, close). DOM seulement ; ce que chaque fenêtre montre à chaque étape, et quand elle enregistre,
// vient de profile-ui.js et de etablissement-ui.js.

import { el } from './dom.js';

// Échap ne doit pas faire perdre un travail par mégarde : le premier appui prévient, le second ferme. Pendant l'enregistrement,
// la fenêtre ne se ferme pas (ni Échap, ni la croix). Renvoie { arm, disarm } : `arm(hint)` pose l'avertissement du pied qu'on
// vient d'écrire, `disarm()` le cache et rend au prochain Échap son premier appui.
function escapeGuard(dialog, closeButton, { isSaving, hasUnsaved }) {
  let armed = false;
  let hint = null;

  dialog.addEventListener('cancel', event => {
    if (isSaving()) {
      event.preventDefault();
      return;
    }
    if (hasUnsaved() && !armed) {
      event.preventDefault();
      armed = true;
      hint.hidden = false;
    }
  });

  // Le navigateur ne laisse pas annuler « cancel » deux fois de suite sans geste de la personne (il ferme alors la fenêtre) :
  // pendant l'enregistrement on arrête donc la touche elle-même.
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isSaving()) event.preventDefault();
  });

  closeButton.addEventListener('click', () => {
    if (!isSaving()) dialog.close();
  });

  return {
    arm(newHint) {
      armed = false;
      hint = newHint;
    },

    disarm() {
      armed = false;
      if (hint) hint.hidden = true;
    }
  };
}

// `dialog` : le <dialog> de index.html. Deux rappels disent où en est la fenêtre :
//   isSaving()    vrai pendant l'enregistrement : ni Échap ni la croix ne ferment alors la fenêtre
//   hasUnsaved()  vrai quand fermer ferait perdre un travail non enregistré : le premier Échap prévient, le second ferme
// Renvoie { body, close, setHeading, announceStep, renderFoot, showActions, disarm, lockClose, reset }.
export function createDialogShell(dialog, rules) {
  const title = dialog.querySelector('.dlg-head h2');
  const subtitle = dialog.querySelector('.dlg-sub');
  const body = dialog.querySelector('.dlg-body');
  const foot = dialog.querySelector('.dlg-foot');
  const closeButton = dialog.querySelector('[data-close]');
  const guard = escapeGuard(dialog, closeButton, rules);

  return {
    body,

    close: () => dialog.close(),

    setHeading(heading, detail) {
      title.textContent = heading;
      subtitle.textContent = detail;
    },

    // Place le curseur de lecture sur le titre de l'étape : un lecteur d'écran l'annonce, et le clavier ne reste pas sur un
    // bouton qui vient de disparaître.
    announceStep() {
      title.focus({ preventScroll: true });
      body.scrollTop = 0;
    },

    // Le pied d'un écran à modifier : un résumé (annoncé), l'avertissement « Échap » et les boutons. Renvoie le résumé, que
    // l'appelant met à jour.
    renderFoot(summary, ...buttons) {
      const text = el('p', 'dlg-summary', summary);
      text.setAttribute('aria-live', 'polite');
      const hint = el('p', 'dlg-hint', 'Des modifications ne sont pas enregistrées. Appuyez encore sur Échap pour les abandonner.');
      hint.setAttribute('role', 'status');
      hint.hidden = true;
      guard.arm(hint);
      const actions = el('div', 'dlg-actions');
      actions.append(...buttons);
      const left = el('div', 'dlg-status');
      left.append(text, hint);
      foot.replaceChildren(left, actions);
      return text;
    },

    // Le pied d'un écran sans rien à modifier : des boutons seuls.
    showActions(...buttons) {
      const actions = el('div', 'dlg-actions');
      actions.append(...buttons);
      foot.replaceChildren(actions);
    },

    // Une modification annule l'avertissement « Échap » : il ne vaut que pour l'état présent.
    disarm: guard.disarm,

    // La croix de la fenêtre est grisée pendant l'enregistrement.
    lockClose(locked) {
      closeButton.disabled = locked;
    },

    // La fenêtre fermée n'a plus rien à montrer.
    reset() {
      closeButton.disabled = false;
      body.replaceChildren();
      foot.replaceChildren();
    }
  };
}

// Ce que main.js tient d'une fenêtre de modification : isOpen(), open(session) et close(). `ctx` est l'état de la fenêtre
// (`ctx.session` : la session ouverte, null sinon) ; `open(ctx, session)` l'ouvre ; `reset(ctx)` la vide à sa fermeture, après
// quoi la session rend le focus à l'endroit d'où la fenêtre a été ouverte (`session.onClose`).
export function dialogApi(dialog, ctx, { open, reset }) {
  dialog.addEventListener('close', () => {
    const closed = ctx.session;
    reset(ctx);
    closed?.onClose?.();
  });

  return {
    isOpen: () => dialog.open,

    open: session => open(ctx, session),

    close() {
      if (dialog.open) dialog.close();
    }
  };
}
