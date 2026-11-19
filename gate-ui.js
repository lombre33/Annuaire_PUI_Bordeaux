// L'écran qui remplace l'annuaire pour une personne qui n'y figure pas encore (index.html : #gatePanel, gate.js). DOM seulement : gate.js décide
// de ce qui s'y lit, main.js de quand il paraît. Pendant qu'il est là, la page porte la classe `gated` (style.css) : la recherche, les filtres et
// les cartes sont cachés.

// `root` : l'élément #gatePanel ; `onCreate` : appelé par « Créer ma fiche ». Renvoie { show, hide, focusAction }.
export function createGatePanel(root, { onCreate }) {
  const title = root.querySelector('.gate-title');
  const text = root.querySelector('.gate-text');
  const action = root.querySelector('.gate-action');
  action.addEventListener('click', () => onCreate());

  return {
    // `gate` : un écran fermé de describeGate ({ kind, title, text }). Le bouton n'existe que pour `create`.
    show(gate) {
      title.textContent = gate.title;
      text.textContent = gate.text;
      action.hidden = gate.kind !== 'create';
      root.dataset.kind = gate.kind;
      root.hidden = false;
      document.body.classList.add('gated');
    },

    hide() {
      root.hidden = true;
      delete root.dataset.kind;
      document.body.classList.remove('gated');
    },

    // Rend le focus au bouton quand la fenêtre qu'il a ouverte se ferme ; faux quand il n'est pas là.
    focusAction() {
      if (root.hidden || action.hidden) return false;
      action.focus();
      return true;
    }
  };
}
