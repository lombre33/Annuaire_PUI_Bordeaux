// Bandeau « Ma présence » : la personne connectée voit sa situation dans
// l'annuaire et la change d'un clic ; elle ouvre de là la modification de sa fiche
// et, si elle est administratrice, les demandes à valider. DOM seulement ;
// presence.js décrit la situation et décide du message.

const noop = () => {};

// `root` : l'élément #accountBar de index.html. `onToggle` : appelé quand la
// personne clique sur l'interrupteur (jamais pendant une écriture). `onEdit` et
// `onAdmin` : appelés par les deux boutons d'action.
export function createAccountBar(root, { onToggle, onEdit = noop, onAdmin = noop }) {
  const part = selector => root.querySelector(selector);
  const avatar = part('.account-avatar');
  const name = part('.account-name');
  const detail = part('.account-detail');
  const switchButton = part('.presence-switch');
  const editButton = part('.account-edit');
  const editDot = part('.account-dot');
  const adminButton = part('.account-admin');
  const status = part('.account-status');

  switchButton.addEventListener('click', () => {
    if (!switchButton.disabled) onToggle();
  });
  editButton.addEventListener('click', () => onEdit());
  adminButton.addEventListener('click', () => onAdmin());

  return {
    // `view` : { name, initials, accepted, tone, message } (voir describePresence).
    // `presence: false` : une administratrice sans fiche dans BDD, qui n'a ni initiales
    // ni interrupteur à montrer.
    show(view) {
      const withPresence = view.presence !== false;
      avatar.textContent = view.initials || '';
      avatar.hidden = !withPresence;
      switchButton.hidden = !withPresence;
      name.textContent = view.name;
      detail.textContent = view.message;
      detail.dataset.tone = view.tone;
      switchButton.setAttribute('aria-checked', String(Boolean(view.accepted)));
      root.hidden = false;
    },

    hide() {
      root.hidden = true;
    },

    // Les deux boutons d'action, chacun masqué quand son option est null.
    //   edit   { pending } : « Modifier mon profil », avec un point quand une demande attend
    //   admin  { count }   : les demandes à valider
    setActions({ edit = null, admin = null } = {}) {
      editButton.hidden = !edit;
      editDot.hidden = !edit?.pending;
      editButton.title = edit?.pending ? 'Une demande est en attente de validation' : '';
      adminButton.hidden = !admin;
      if (admin) {
        adminButton.textContent = admin.count > 0
          ? `${admin.count} demande${admin.count > 1 ? 's' : ''} à valider`
          : 'Demandes de modification';
        adminButton.dataset.zero = admin.count > 0 ? 'false' : 'true';
      }
    },

    // Pendant une écriture l'interrupteur est gelé : un deuxième clic ne doit pas
    // partir avant que le premier ait abouti.
    setBusy(busy) {
      switchButton.disabled = busy;
      switchButton.setAttribute('aria-busy', String(busy));
    },

    // Message passager sous le bandeau ('' l'efface) ; `tone` 'error' pour un échec.
    setStatus(message, tone = 'info') {
      status.textContent = message;
      status.dataset.tone = tone;
    }
  };
}
