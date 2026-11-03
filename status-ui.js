// Le bandeau d'état et l'écran « Aucun contact » (1.35.0, audit UI/UX U30). DOM seulement : ce qu'ils disent vient de grist-data.js
// (pourquoi l'annuaire est vide ou illisible) et de filters.js (pourquoi une recherche ne donne rien).

// Le bandeau rouge sous la barre d'outils (#statusBanner). `show(messages, action)` : les phrases à dire (aucune : il se masque) et,
// quand un clic peut réparer la panne, le bouton qui s'en charge, `{ label, run }`. C'est toujours le même bouton : il garde le focus
// quand une nouvelle tentative échoue. `busy(label)` : il dit qu'il travaille et ne répond plus (`aria-disabled` plutôt que `disabled`,
// qui lui ferait perdre le focus). Seul le texte est une alerte (`role="alert"`) : un bouton qui change d'étiquette ne la relit pas.
export function createStatusBanner(root) {
  const text = root.querySelector('.status-text');
  const button = root.querySelector('.status-action');
  let run = null;
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') !== 'true') run?.();
  });
  return {
    show(messages, action = null) {
      text.textContent = messages.join(' ');
      run = action ? action.run : null;
      button.textContent = action ? action.label : '';
      button.hidden = !action;
      button.removeAttribute('aria-disabled');
      root.hidden = messages.length === 0;
    },

    busy(label) {
      button.textContent = label;
      button.setAttribute('aria-disabled', 'true');
    }
  };
}

// L'écran « Aucun contact » (#emptyState) : `show({ title, text })` le montre avec ce qu'il y a à dire (voir describeEmptyResults).
export function createEmptyState(root) {
  const title = root.querySelector('.empty-title');
  const text = root.querySelector('.empty-text');
  return {
    show(view) {
      title.textContent = view.title;
      text.textContent = view.text;
      root.hidden = false;
    },

    hide() {
      root.hidden = true;
    }
  };
}
