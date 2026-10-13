// Petits outils partagés par les fenêtres (profile-ui.js, etablissement-ui.js, changes-ui.js). Rien
// ne s'exécute à l'import : les fonctions qui touchent au DOM ne sont appelées que par les écrans.

import { normalize } from './grist-data.js';

// Un élément avec sa classe et son texte. Le texte passe toujours par textContent :
// ce qui vient de Grist (un nom, une fonction) n'est jamais lu comme du HTML.
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Un bouton (type « button » : jamais un envoi de formulaire) avec son texte et, s'il y en a un, son
// action au clic.
export function button(label, className, onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// Un encadré de message : `kind` 'pending' (à lire), 'ko' (échec) ; `role` 'status' ou 'alert' pour
// que les lecteurs d'écran l'annoncent.
export function notice(kind, text, role) {
  const box = el('div', `notice notice-${kind}`);
  if (role) box.setAttribute('role', role);
  box.append(el('p', '', text));
  return box;
}

// Le champ de recherche d'une liste de choix des fenêtres. Il fait comme celui des menus de filtre
// (render.js) : la saisie est normalisée comme partout dans le widget (casse et accents ignorés, « ecole »
// trouve « École ») et `onTerm(terme)` la reçoit à chaque frappe, '' quand le champ est vide. C'est à
// l'appelant de masquer ce qui ne correspond pas (matchesTerm).
export function searchField({ label, placeholder, onTerm }) {
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'pick-search';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  input.addEventListener('input', () => onTerm(normalize(input.value)));
  return input;
}

// Vrai si `label` répond à la recherche `term` (celle que searchField() donne, déjà normalisée) : toute valeur
// répond à une recherche vide.
export const matchesTerm = (label, term) => term === '' || normalize(label).includes(term);

// Ce que dit une recherche de liste, lu par les lecteurs d'écran : rien tant que rien n'est tapé, puis combien de
// valeurs répondent.
export const foundText = (term, count) => (term === '' ? '' : count === 0 ? 'Aucun résultat' : `${count} résultat${count > 1 ? 's' : ''}`);
