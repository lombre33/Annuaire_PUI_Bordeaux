// La fenêtre « Se connecter à Grist » (index.html : #loginDialog) d'un visiteur sans compte (1.44.0) : l'annuaire a un lien public ; pour
// modifier une fiche, il faut un compte. La fenêtre explique la connexion et mène à la page de connexion de
// Grist (login.js), dont la personne revient sur la page de l'annuaire. Elle s'ouvre d'elle-même une fois (LOGIN_AUTO_OPEN,
// constants.js) ; le bouton « Se connecter » de l'en-tête (#loginLink), caché tant qu'on ne sait pas que la personne est sans compte, la
// rouvre. DOM seulement ; qui est sans compte, et l'adresse de connexion, viennent de main.js (identity.js, login.js).

import { el, button } from './dom.js';
import { createDialogShell } from './dialog-shell.js';

// Le lien qui mène à la connexion. `target="_top"` : le widget est dans un cadre, c'est la page entière de Grist qui doit changer, dans le
// même onglet (la personne revient ensuite sur l'annuaire, pas sur un onglet resté ouvert). Une navigation du cadre vers la page qui le
// porte demande un geste de la personne : le clic en est un.
function loginLink(url) {
  const link = el('a', 'btn btn-primary', 'Se connecter');
  link.href = url;
  link.target = '_top';
  link.rel = 'noopener';
  return link;
}

// `dialog` : le <dialog> de index.html ; `openButton` : le bouton de l'en-tête. Renvoie { show }.
export function createLoginPrompt(dialog, openButton) {
  const shell = createDialogShell(dialog, { isSaving: () => false, hasUnsaved: () => false });

  function open() {
    if (dialog.open) return;
    dialog.showModal();
    shell.announceStep(); // le titre est lu d'abord ; le bouton « Se connecter » est à un Tab de là
  }

  function render(url) {
    shell.setHeading('Se connecter à Grist', 'Un compte Grist est nécessaire pour modifier une fiche.');
    const lead = el('p', 'login-lead', 'Pour modifier votre fiche, apparaître dans l\'annuaire ou créer la vôtre, connectez-vous à Grist avec votre compte. '
      + (url
        ? 'Le bouton « Se connecter » ouvre la page de connexion de Grist dans cet onglet ; une fois connecté(e), vous revenez ici.'
        : 'Le widget ne trouve pas l\'adresse de la page de connexion : ouvrez le document depuis Grist et utilisez son bouton « Se connecter ».'));
    const note = el('p', 'login-note', 'Cette fenêtre s\'affiche aussi quand Grist refuse à votre compte l\'accès en modification : '
      + 'si vous êtes déjà connecté(e), prévenez un administrateur de l\'annuaire.');
    shell.body.replaceChildren(lead, note);
    const stay = button(url ? 'Continuer sans me connecter' : 'Fermer', 'btn', () => shell.close());
    shell.showActions(...(url ? [stay, loginLink(url)] : [stay]));
  }

  openButton.addEventListener('click', open);

  return {
    // `url` : la page de connexion de Grist (login.js), '' si le widget n'a pas pu la construire ; `autoOpen` : ouvrir la fenêtre tout de
    // suite. main.js ne l'appelle qu'une fois par chargement (quand l'identité dit « sans compte ») : fermée, la fenêtre ne revient que par
    // le bouton de l'en-tête, qui apparaît dans tous les cas.
    show(url, { autoOpen = true } = {}) {
      render(url);
      openButton.hidden = false;
      if (autoOpen) open();
    }
  };
}
