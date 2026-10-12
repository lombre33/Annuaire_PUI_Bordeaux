// Bandeau « Ma présence » : la personne connectée voit sa situation dans
// l'annuaire et la change d'un clic ; elle ouvre de là la modification de sa fiche.
// Un responsable d'établissement y trouve le raccourci « Mon établissement », un administrateur
// le « mode admin ». DOM seulement ; presence.js décrit la situation et décide du message.

import { PRESENCE_ANNOUNCE_MS } from './constants.js';

const noop = () => {};

// `root` : l'élément #accountBar de index.html. `onToggle` : appelé quand la
// personne clique sur l'interrupteur (jamais pendant une écriture). `onEdit` : appelé
// par le bouton « Modifier mon profil ». `onEtab` : appelé par le bouton « Mon établissement ».
// `onAdminMode` : appelé par le bouton « Mode admin ».
export function createAccountBar(root, { onToggle, onEdit = noop, onEtab = noop, onAdminMode = noop }) {
  const part = selector => root.querySelector(selector);
  const avatar = part('.account-avatar');
  const name = part('.account-name');
  const detail = part('.account-detail');
  const switchButton = part('.presence-switch');
  const editButton = part('.account-edit');
  const etabButton = part('.account-etab');
  const adminButton = part('.account-admin');
  const status = part('.account-status');

  // Dans l'en-tête compact, l'interrupteur et « Modifier mon profil » occupent la deuxième
  // rangée ; « Mode admin », sinon « Mon établissement », prend le coin de la première, à droite du
  // nom. Le second de ces deux boutons, s'ils sont là tous deux, passe sur une troisième rangée.
  // Sans interrupteur (un compte qui n'a pas de fiche), les boutons se rangent sur la deuxième
  // rangée. La feuille de style lit `data-corner` et `no-switch` pour placer le nom et les boutons.
  const placeButtons = () => {
    const withSwitch = !switchButton.hidden;
    const corner = !withSwitch ? '' : !adminButton.hidden ? 'admin' : !etabButton.hidden ? 'etab' : '';
    if (corner) root.dataset.corner = corner;
    else delete root.dataset.corner;
    root.classList.toggle('no-switch', !withSwitch);
  };

  // Message passager sous le bandeau ('' l'efface) ; `tone` : 'info', 'error' pour un échec, ou
  // 'done' (invisible, voir announce). Un nouveau message remplace le précédent et son délai.
  let announceTimer = 0;
  function setStatus(message, tone = 'info') {
    clearTimeout(announceTimer);
    status.textContent = message;
    status.dataset.tone = tone;
    status.classList.toggle('sr-only', tone === 'done');
  }

  // Pendant une écriture le bouton est « hors service » (`aria-disabled`) sans être désactivé :
  // un bouton désactivé perd le focus, et le clavier repartirait du haut de la page.
  switchButton.addEventListener('click', () => {
    if (switchButton.getAttribute('aria-disabled') !== 'true') onToggle();
  });
  editButton.addEventListener('click', () => onEdit());
  etabButton.addEventListener('click', () => onEtab());
  adminButton.addEventListener('click', () => onAdminMode());

  return {
    // `view` : { name, initials, accepted, tone, message } (voir describePresence) et,
    // pour un compte qui n'a pas de fiche, `switchable: false` (pas d'interrupteur à montrer).
    show(view) {
      avatar.textContent = view.initials;
      name.textContent = view.name;
      detail.textContent = view.message;
      detail.dataset.tone = view.tone;
      switchButton.setAttribute('aria-checked', String(view.accepted));
      switchButton.hidden = view.switchable === false;
      placeButtons();
      root.hidden = false;
    },

    hide() {
      root.hidden = true;
    },

    // Les boutons du bandeau. « Modifier mon profil » : montré seulement quand la fiche de
    // la personne est identifiée sans ambiguïté. « Mon établissement » : montré aux responsables
    // d'au moins un établissement, que sa carte soit affichée ou non. « Mode admin » : montré aux
    // seuls administrateurs ; `adminMode` dit s'il est allumé.
    setActions({ edit = false, etab = false, admin = false, adminMode = false } = {}) {
      editButton.hidden = !edit;
      etabButton.hidden = !etab;
      adminButton.hidden = !admin;
      placeButtons();
      adminButton.setAttribute('aria-pressed', String(admin && adminMode));
      adminButton.title = adminMode
        ? 'Quitter le mode admin'
        : 'Mode admin : modifier la fiche de n\'importe quelle personne';
    },

    // Rend le focus au bouton « Modifier mon profil » quand la fenêtre qu'il a ouverte se ferme.
    focusEdit() {
      if (!editButton.hidden) editButton.focus();
    },

    // Rend le focus au bouton « Mon établissement » quand la fenêtre qu'il a ouverte se ferme ;
    // faux quand le bouton n'est pas là.
    focusEtab() {
      if (etabButton.hidden) return false;
      etabButton.focus();
      return true;
    },

    // Pendant une écriture l'interrupteur est gelé : un deuxième clic ne doit pas
    // partir avant que le premier ait abouti. Il garde le focus (voir plus haut).
    setBusy(busy) {
      if (busy) switchButton.setAttribute('aria-disabled', 'true');
      else switchButton.removeAttribute('aria-disabled');
      switchButton.setAttribute('aria-busy', String(busy));
    },

    setStatus,

    // Le résultat d'une écriture réussie, pour les lecteurs d'écran : la région d'état le
    // lit, mais il reste invisible, car l'écran dit déjà la même chose (le texte du bandeau
    // change et l'interrupteur bascule). Il s'efface seul, ou dès le message suivant.
    announce(message) {
      setStatus(message, 'done');
      announceTimer = setTimeout(() => setStatus(''), PRESENCE_ANNOUNCE_MS);
    }
  };
}
