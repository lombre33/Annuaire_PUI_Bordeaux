// Bandeau « Ma présence » : la personne connectée voit sa situation dans
// l'annuaire et la change d'un clic. DOM seulement ; presence.js décrit la
// situation et décide du message.

// `root` : l'élément #accountBar de index.html. `onToggle` : appelé quand la
// personne clique sur l'interrupteur (jamais pendant une écriture).
export function createAccountBar(root, { onToggle }) {
  const part = selector => root.querySelector(selector);
  const avatar = part('.account-avatar');
  const name = part('.account-name');
  const detail = part('.account-detail');
  const switchButton = part('.presence-switch');
  const status = part('.account-status');

  switchButton.addEventListener('click', () => {
    if (!switchButton.disabled) onToggle();
  });

  return {
    // `view` : { name, initials, accepted, tone, message } (voir describePresence).
    show(view) {
      avatar.textContent = view.initials;
      name.textContent = view.name;
      detail.textContent = view.message;
      detail.dataset.tone = view.tone;
      switchButton.setAttribute('aria-checked', String(view.accepted));
      root.hidden = false;
    },

    hide() {
      root.hidden = true;
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
