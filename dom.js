// Petits outils partagés par les fenêtres (profile-form.js, profile-review.js, etablissement-ui.js,
// etablissement-form.js, changes-ui.js...). Rien ne s'exécute à l'import : les fonctions qui touchent au DOM ne sont appelées que par les écrans.

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

// Le focus est celui du clavier (l'anneau se voit), pas celui d'un clic. Un navigateur sans `:focus-visible` compte pour clavier.
export function isFocusVisible(element) {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

// Une entrée par option, { option, item } : `item` est la ligne de la liste.
function dropdownEntries(id, options) {
  return options.map(option => {
    const item = el('li', 'dd-option', option.label);
    item.id = `${id}-option-${option.id}`;
    item.setAttribute('role', 'option');
    return { option, item };
  });
}

// Les éléments d'une liste déroulante, sans leur comportement : le bloc (`root`), le bouton, le texte du choix, le panneau
// (recherche, liste, « aucun résultat » et sa version pour les lecteurs d'écran) et les entrées, un tableau que update() remplace
// en place.
function dropdownParts({ id, labelId, options, searchLabel, color, onTerm }) {
  const listId = `${id}-list`;
  const root = el('div', 'dd');
  const trigger = button('', 'dd-trigger');
  trigger.id = id;
  trigger.setAttribute('role', 'combobox'); // pour que aria-invalid soit permis : le bouton garde ses touches
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', listId);
  trigger.setAttribute('aria-labelledby', `${labelId} ${id}`);
  const shown = el('span', 'dd-value');
  trigger.append(shown, el('span', 'dd-caret'));

  const panel = el('div', 'dd-panel');
  panel.hidden = true;
  if (color) panel.style.borderTopColor = color;
  const list = el('ul', 'dd-list');
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-labelledby', labelId);
  const none = el('p', 'dd-none', 'Aucun résultat');
  none.hidden = true;
  none.setAttribute('aria-hidden', 'true'); // le lecteur d'écran l'entend par `status`
  const status = el('p', 'sr-only');
  status.setAttribute('role', 'status');
  const search = searchField({ label: searchLabel, placeholder: `${searchLabel}…`, onTerm });
  search.classList.add('dd-search');
  search.setAttribute('aria-controls', listId);
  panel.append(search, list, none, status);
  root.append(trigger, panel);
  // Un appui dans le panneau (sur une valeur, sur un vide) ne déplace pas le focus : sinon la fenêtre le prendrait, le panneau
  // se refermerait avant le clic et le clic tomberait sur le champ d'en dessous.
  panel.addEventListener('mousedown', event => {
    if (event.target !== search) event.preventDefault();
  });

  const entries = dropdownEntries(id, options);
  list.append(...entries.map(entry => entry.item));
  return { id, root, trigger, shown, panel, list, none, status, search, entries };
}

// Les valeurs de la liste : le choix que montre le bouton, l'option désignée (celle qu'Entrée choisit), la recherche.
// `state` : { chosen, active, placeholder }. Renvoie { showChoice, setActive, move, paint, replace }.
function optionList({ id, trigger, shown, list, none, status, search, entries }, state) {
  const visibleEntries = () => entries.filter(entry => !entry.item.hidden);

  function showChoice() {
    const current = entries.find(entry => entry.option.id === state.chosen);
    shown.textContent = current ? current.option.label : state.placeholder;
    trigger.classList.toggle('empty', !current || state.chosen === 0);
    entries.forEach(entry => entry.item.setAttribute('aria-selected', String(entry === current)));
  }

  function setActive(entry) {
    state.active?.item.classList.remove('active');
    state.active = entry;
    if (entry) {
      entry.item.classList.add('active');
      search.setAttribute('aria-activedescendant', entry.item.id);
    } else {
      search.removeAttribute('aria-activedescendant');
    }
  }

  // Fait défiler la liste (elle seule, pas la fenêtre) juste assez pour montrer l'option.
  function reveal(entry) {
    const { offsetTop, offsetHeight } = entry.item;
    if (offsetTop < list.scrollTop) list.scrollTop = offsetTop;
    else if (offsetTop + offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = offsetTop + offsetHeight - list.clientHeight;
  }

  function move(step) {
    const visible = visibleEntries();
    if (visible.length === 0) return;
    const next = visible[Math.min(Math.max(visible.indexOf(state.active) + step, 0), visible.length - 1)];
    setActive(next);
    reveal(next);
  }

  // Ne garde que les valeurs qui répondent à `term` (« aucune valeur », l'identifiant 0, n'est pas un résultat : elle ne se montre que
  // sans recherche) ; l'option désignée est le choix actuel tant qu'on ne cherche rien, puis la première qui répond, pour
  // qu'Entrée la choisisse.
  function paint(term) {
    entries.forEach(entry => {
      entry.item.hidden = term !== '' && (entry.option.id === 0 || !matchesTerm(entry.option.label, term));
    });
    const visible = visibleEntries();
    none.hidden = visible.length > 0;
    status.textContent = foundText(term, visible.length);
    const target = (term === '' && visible.find(entry => entry.option.id === state.chosen)) || visible[0] || null;
    setActive(target);
    list.scrollTop = 0;
    if (target) reveal(target);
  }

  // Remplace les valeurs quand l'appelant en a de nouvelles à proposer, avec le choix et l'invite qui vont avec. Panneau ouvert, la
  // recherche en cours s'applique aux nouvelles valeurs.
  function replace({ options, value, placeholder }) {
    setActive(null);
    state.chosen = value;
    state.placeholder = placeholder;
    entries.splice(0, entries.length, ...dropdownEntries(id, options));
    list.replaceChildren(...entries.map(entry => entry.item));
    showChoice();
    if (state.open) paint(normalize(search.value));
  }

  return { showChoice, setActive, move, paint, replace };
}

// Le panneau : ouvert, la recherche y prend le focus (sauf sur un écran tactile) et un clic ailleurs le referme.
// `state` : { open }. Renvoie { openPanel, close }.
function panelControl({ root, trigger, panel, search }, state, choices) {
  function outsidePointer(event) {
    if (!root.isConnected) { // la fenêtre s'est fermée panneau ouvert : plus rien à refermer
      state.open = false;
      document.removeEventListener('pointerdown', outsidePointer, true);
    } else if (!root.contains(event.target)) {
      close(false);
    }
  }

  function openPanel() {
    if (state.open) return;
    state.open = true;
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    search.value = '';
    choices.paint('');
    panel.scrollIntoView({ block: 'nearest' });
    if (!window.matchMedia('(pointer: coarse)').matches) search.focus({ preventScroll: true });
    document.addEventListener('pointerdown', outsidePointer, true);
  }

  // `refocus` : rend le focus au bouton, quand il était dans le panneau qui disparaît.
  function close(refocus) {
    if (!state.open) return;
    state.open = false;
    root.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
    document.removeEventListener('pointerdown', outsidePointer, true);
    if (refocus) trigger.focus({ preventScroll: true });
  }

  return { openPanel, close };
}

// Les gestes : un clic sur une valeur la choisit ; au clavier, les flèches parcourent, Entrée choisit, Échap referme le panneau.
function wireDropdown(parts, state, choices, panelOf, onChange) {
  const { root, trigger, list, search, entries } = parts;

  function choose(next) {
    const changed = next !== state.chosen;
    state.chosen = next;
    choices.showChoice();
    panelOf.close(true);
    if (changed) onChange(next);
  }

  // Les gestes se lisent sur la liste, pas sur chaque ligne : update() change les lignes.
  const entryOf = event => entries.find(entry => entry.item === event.target.closest('.dd-option'));
  list.addEventListener('click', event => {
    const entry = entryOf(event);
    if (entry) choose(entry.option.id);
  });
  // La souris désigne l'option sous elle, sauf quand c'est le défilement au clavier qui la fait passer là.
  list.addEventListener('pointermove', event => {
    const entry = entryOf(event);
    if (!entry || (event.clientX === state.pointer[0] && event.clientY === state.pointer[1])) return;
    state.pointer = [event.clientX, event.clientY];
    choices.setActive(entry);
  });
  trigger.addEventListener('click', () => (state.open ? panelOf.close(true) : panelOf.openPanel()));
  trigger.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (state.open) choices.move(event.key === 'ArrowDown' ? 1 : -1);
    else panelOf.openPanel();
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      choices.move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (state.active) choose(state.active.option.id);
    }
  });
  // Échap referme le panneau et s'arrête là : la touche ne doit pas atteindre la fenêtre, qu'elle fermerait.
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !state.open) return;
    event.preventDefault();
    event.stopPropagation();
    panelOf.close(true);
  });
  // Tabulation vers un autre champ : le panneau se referme (un clic ailleurs est traité par outsidePointer).
  root.addEventListener('focusout', event => {
    if (state.open && event.relatedTarget && !root.contains(event.relatedTarget)) panelOf.close(false);
  });
}

// Une liste déroulante avec la recherche dedans, pour choisir une valeur parmi beaucoup (l'établissement, le rôle, la personne à
// nommer responsable).
// Fermée, c'est un bouton qui montre le choix, de la forme d'un champ ; ouverte, un panneau où la recherche est en haut
// et les valeurs dessous, réduites en direct à ce qui répond, comme un menu de filtre (render.js). Au clavier : Entrée,
// Espace ou une flèche l'ouvre, les flèches parcourent, Entrée choisit et Échap referme le panneau sans fermer la fenêtre.
// Sur un écran tactile le panneau s'ouvre sans prendre le focus : le clavier du téléphone ne cache pas les valeurs.
//   id           identifiant du bouton (celui du champ)
//   labelId      identifiant du libellé du champ : il nomme le bouton et la liste
//   options      [{ id, label }] ; un identifiant 0 est « aucune valeur » (« Non renseigné ») : on la choisit pour vider le champ, et
//                une recherche ne la propose pas
//   value        identifiant du choix actuel ; 0, ou absent de la liste, le bouton montre `placeholder`
//   placeholder  ce que le bouton montre tant que rien n'est choisi
//   searchLabel  nom de la recherche, qui sert aussi de texte d'invite
//   color        (facultatif) la couleur du filet du panneau, celle de la catégorie comme sur les menus de filtre
//   onChange     identifiant choisi → appelé à chaque changement de choix que fait la personne
// Renvoie { element, trigger, update, setDisabled } : le bloc à poser dans le formulaire, son bouton (aria-invalid,
// aria-describedby), de quoi remplacer les valeurs quand elles changent (update({ options, value, placeholder }), qui n'appelle pas
// onChange) et de quoi griser la liste (setDisabled(vrai ou faux) : un panneau ouvert se referme).
export function dropdown({ id, labelId, options, value, placeholder, searchLabel, color, onChange }) {
  const state = { chosen: value, open: false, active: null, pointer: [0, 0], placeholder };
  let choices;
  const parts = dropdownParts({ id, labelId, options, searchLabel, color, onTerm: term => choices.paint(term) });
  choices = optionList(parts, state);
  const panelOf = panelControl(parts, state, choices);
  wireDropdown(parts, state, choices, panelOf, onChange);
  choices.showChoice();
  return {
    element: parts.root,
    trigger: parts.trigger,
    update: choices.replace,
    setDisabled: disabled => {
      parts.trigger.disabled = disabled;
      if (disabled) panelOf.close(false);
    }
  };
}
