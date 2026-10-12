// Construction du DOM (menus de filtres, cartes), sans logique métier.

import { TAG_GROUPS, FILTERS } from './constants.js';
import { compareLabels, formatPhone, labelsOf, mailtoHref, sortWithCheckedFirst, normalize } from './grist-data.js';

// Catégories qui ont un menu : seules leurs bulles de carte sont cliquables.
const FILTERABLE_KEYS = new Set(FILTERS.map(filter => filter.key));

// ===== Menus de filtres =====

// Le badge d'un menu compte les valeurs cochées et disparaît à zéro.
function setBadge(badge, count) {
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

// La valeur d'une option est posée à la création : le texte affiché n'est pas la source.
function optionValue(option) {
  return option.dataset.value;
}

// Nombre de cartes que donnerait l'option `value` de la catégorie `filterKey`.
function countFor(counts, filterKey, value) {
  return counts?.[filterKey]?.[normalize(value)] ?? 0;
}

// Cochées d'abord ; chaque groupe reste trié alphabétiquement.
function orderedValues(values, selected) {
  return sortWithCheckedFirst([...new Set(values)].sort(compareLabels), selected);
}

function buildFilterButton(filter, selectedCount) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-button';
  if (filter.hint) button.title = filter.hint;

  const dot = document.createElement('span');
  dot.className = 'filter-dot';
  dot.style.backgroundColor = filter.color;
  const name = document.createElement('span');
  name.textContent = filter.label;
  const badge = document.createElement('span');
  badge.className = 'filter-count';
  setBadge(badge, selectedCount);
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '▾';

  button.append(dot, name, badge, chevron);
  return button;
}

function buildMenuSearch(filter, menu) {
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'filter-search-input';
  search.placeholder = `Rechercher dans ${filter.label}…`;
  search.autocomplete = 'off';
  search.addEventListener('input', () => {
    // Même normalisation que la recherche principale : « competence » trouve « Compétence ».
    const term = normalize(search.value);
    menu.querySelectorAll('.filter-option').forEach(option => {
      option.hidden = term !== '' && !normalize(optionValue(option)).includes(term);
    });
  });
  return search;
}

function buildOption(filter, value, checked, count, onToggle) {
  const option = document.createElement('label');
  option.className = checked ? 'filter-option checked' : 'filter-option';
  option.dataset.value = value;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onToggle(filter.key, value));
  const label = document.createElement('span');
  label.className = 'option-label';
  label.textContent = value;
  const countElement = document.createElement('span');
  countElement.className = 'option-count';
  countElement.textContent = String(count);

  option.append(checkbox, label, countElement);
  return option;
}

function buildFilterMenu(filter, referenceMaps, selected, counts, onToggle) {
  const menu = document.createElement('div');
  menu.className = 'filter-menu';
  menu.style.borderTopColor = filter.color;
  menu.appendChild(buildMenuSearch(filter, menu));

  const values = orderedValues(Object.values(referenceMaps[filter.key] || {}), selected);
  values.forEach(value => {
    menu.appendChild(buildOption(filter, value, selected.has(value), countFor(counts, filter.key, value), onToggle));
  });
  return menu;
}

// Marge laissée entre un menu ouvert et le bord du cadre du widget.
const MENU_EDGE_GAP = 8;

// Le cadre du widget peut être très étroit (panneau Grist, téléphone) : un menu
// ouvert près du bord droit déborderait. On le décale vers la gauche, une fois
// ouvert, juste assez pour qu'il tienne ; dans un cadre large il ne bouge pas.
// Le CSS borne sa largeur à celle du cadre : il ne sort donc jamais à gauche.
function keepMenuInView(menu) {
  menu.style.left = '';
  const overflow = menu.getBoundingClientRect().right - (document.documentElement.clientWidth - MENU_EDGE_GAP);
  if (overflow > 0) menu.style.left = `${-overflow}px`;
}

function buildFilter(filter, referenceMaps, selected, counts, onToggle) {
  const wrapper = document.createElement('div');
  wrapper.className = 'filter';
  // Permet à updateFilterUI() de retrouver ce menu sans reconstruire les autres
  // (ce qui fermerait ceux qui sont ouverts).
  wrapper.dataset.filterKey = filter.key;

  const button = buildFilterButton(filter, selected.size);
  const menu = buildFilterMenu(filter, referenceMaps, selected, counts, onToggle);

  button.addEventListener('click', event => {
    event.stopPropagation();
    document.querySelectorAll('.filter.open').forEach(other => {
      if (other !== wrapper) other.classList.remove('open');
    });
    wrapper.classList.toggle('open');
    if (wrapper.classList.contains('open')) keepMenuInView(menu);
  });
  // Un clic dans le menu ne doit pas atteindre le document, qui referme les menus.
  menu.addEventListener('click', event => event.stopPropagation());

  wrapper.append(button, menu);
  return wrapper;
}

export function createFilterUI(container, referenceMaps, activeFilters, onToggle, counts) {
  if (!container) return;
  container.innerHTML = '';
  FILTERS.forEach(filter => {
    container.appendChild(buildFilter(filter, referenceMaps, activeFilters[filter.key], counts, onToggle));
  });
}

// Après un clic sur une case, un badge d'établissement ou un tag de carte :
// met à jour le seul menu concerné (cases, ordre, badge) sans le reconstruire,
// pour ne pas fermer un autre menu ni effacer une recherche en cours.
export function updateFilterUI(container, filterKey, activeFilters) {
  const wrapper = container.querySelector(`[data-filter-key="${filterKey}"]`);
  if (!wrapper) return; // « Rôle PUI » n'a pas de menu

  const selected = activeFilters[filterKey];
  const menu = wrapper.querySelector('.filter-menu');
  const optionsByValue = new Map(
    [...menu.querySelectorAll('.filter-option')].map(option => [optionValue(option), option])
  );

  optionsByValue.forEach((option, value) => {
    const isSelected = selected.has(value);
    option.classList.toggle('checked', isSelected);
    // Un clic venu d'une carte ne passe pas par la case : la resynchroniser.
    option.querySelector('input[type="checkbox"]').checked = isSelected;
  });
  // appendChild() déplace un nœud existant sans le recréer : les écouteurs survivent.
  orderedValues([...optionsByValue.keys()], selected).forEach(value => {
    menu.appendChild(optionsByValue.get(value));
  });
  setBadge(wrapper.querySelector('.filter-count'), selected.size);
}

// Rafraîchit le nombre de chaque option de tous les menus (changer un filtre
// modifie les comptes des autres), sans toucher à l'ordre ni aux menus ouverts.
export function updateFilterCounts(container, counts) {
  if (!container) return;
  container.querySelectorAll('.filter').forEach(wrapper => {
    const filterKey = wrapper.dataset.filterKey;
    wrapper.querySelectorAll('.filter-option').forEach(option => {
      const countElement = option.querySelector('.option-count');
      if (countElement) countElement.textContent = String(countFor(counts, filterKey, optionValue(option)));
    });
  });
}

// ===== Cartes de contact =====

// Affiche une ligne facultative de la carte, masquée par le CSS sans la classe `visible`.
function reveal(element, text) {
  element.textContent = text;
  element.classList.add('visible');
}

export function initials(contact) {
  return `${(contact.prenom || '').charAt(0)}${(contact.nom || '').charAt(0)}`.toUpperCase() || '?';
}

function fullName(contact) {
  return `${contact.prenom || ''} ${contact.nom || ''}`.trim() || 'Sans nom';
}

function fillEtablissement(badge, label, onToggle) {
  if (!label) return;
  reveal(badge, label);
  badge.addEventListener('click', () => onToggle('etablissement', label));
}

function fillEmail(link, email) {
  if (!email) return;
  reveal(link, email);
  const href = mailtoHref(email);
  if (href) link.href = href;
}

// Un groupe sans filtre (« Rôle PUI », specs.md) est fait de <span> non cliquables :
// un bouton qui ne filtre rien induirait en erreur.
function buildTag(group, value, onToggle) {
  const filterable = FILTERABLE_KEYS.has(group.key);
  const tag = document.createElement(filterable ? 'button' : 'span');
  if (filterable) tag.type = 'button';
  tag.className = filterable ? `tag tag-${group.key}` : `tag tag-${group.key} tag-static`;
  tag.style.backgroundColor = group.color;
  tag.textContent = value;
  if (filterable) tag.addEventListener('click', () => onToggle(group.key, value));
  return tag;
}

function buildTagGroup(group, labels, onToggle) {
  const section = document.createElement('section');
  section.className = 'tag-group';

  const title = document.createElement('h3');
  title.className = 'tag-group-title';
  title.textContent = group.label;
  title.style.color = group.color;

  const values = document.createElement('div');
  values.className = 'tag-group-values';
  values.append(...labels.map(value => buildTag(group, value, onToggle)));

  section.append(title, values);
  return section;
}

function fillTags(container, contact, onToggle) {
  TAG_GROUPS.forEach(group => {
    const labels = labelsOf(contact, group.key);
    if (labels.length > 0) container.appendChild(buildTagGroup(group, labels, onToggle));
  });
}

function buildCard(template, contact, onToggle) {
  const card = template.content.cloneNode(true);
  card.querySelector('.avatar').textContent = initials(contact);
  card.querySelector('.name').textContent = fullName(contact);
  if (contact.Fonction) reveal(card.querySelector('.fonction'), contact.Fonction);
  fillEtablissement(card.querySelector('.etablissement-tag'), contact.etablissement_label, onToggle);
  fillEmail(card.querySelector('.email'), contact.email);
  const phone = formatPhone(contact.numero_de_telephone);
  if (phone) reveal(card.querySelector('.tel'), `☎ ${phone}`);
  fillTags(card.querySelector('.card-tags'), contact, onToggle);
  return card;
}

export function renderCards(grid, template, contacts, onToggle) {
  grid.innerHTML = '';
  contacts.forEach(contact => grid.appendChild(buildCard(template, contact, onToggle)));
}
