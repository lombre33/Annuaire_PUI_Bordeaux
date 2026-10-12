// Construction du DOM (menus de filtres, cartes), sans logique métier.

import { TAG_GROUPS, FILTERS } from './constants.js';
import { compareLabels, displayName, formatPhone, labelsOf, mailtoHref, sortWithCheckedFirst, normalize } from './grist-data.js';
import { el } from './dom.js';

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

// ----- Repères de la carte « Après » d'une relecture (maquette v5) -----
// Ce qui est modifié se voit (un contour, une couleur, un trait) mais se dit aussi : une
// pastille écrite pour une ligne de texte, un mot réservé aux lecteurs d'écran pour un tag.

// La pastille écrite d'une ligne ou d'un badge (« modifié », « ajouté », « supprimé »).
function pill(word, gone = false) {
  return el('span', gone ? 'mk-pill mk-pill-del' : 'mk-pill', word);
}

function spoken(element, word) {
  element.append(el('span', 'sr-only', ` (${word})`));
}

// Une ligne de texte de la carte de relecture qui a changé (marque `{ before, after }`
// de preview.js) : la nouvelle valeur en relief (« ajouté » si la ligne était vide, sinon
// « modifié »), ou l'ancienne barrée si la ligne a été vidée (« supprimé »).
function showTextChange(element, mark, format = value => value) {
  element.classList.add('visible');
  if (mark.after) element.replaceChildren(el('span', 'mk', format(mark.after)), ' ', pill(mark.before ? 'modifié' : 'ajouté'));
  else element.replaceChildren(el('span', 'mk-gone', format(mark.before)), ' ', pill('supprimé', true));
}

// Le badge de l'établissement d'une carte « Après » dont l'établissement a changé : un
// anneau le repère et la pastille se lit dessous, dans la colonne de droite de la carte.
function markEtablissement(badge, mark) {
  badge.classList.add('rv-ring');
  let column = badge.closest('.etab-col');
  if (!column) {
    column = el('div', 'etab-col');
    badge.replaceWith(column);
    column.append(badge);
  }
  column.append(pill(mark.before ? 'modifié' : 'ajouté'));
}

function fillEtablissement(badge, label, onToggle) {
  if (!label) return;
  reveal(badge, label);
  if (onToggle) badge.addEventListener('click', () => onToggle('etablissement', label));
  else badge.disabled = true;
}

// Sans `onToggle` (carte de relecture), l'adresse est du texte : un clic ne doit pas
// ouvrir un message depuis une fenêtre de relecture.
function fillEmail(link, email, linked) {
  if (!email) return;
  reveal(link, email);
  const href = linked ? mailtoHref(email) : '';
  if (href) link.href = href;
}

// Un groupe sans filtre (« Rôle PUI », specs.md) est fait de <span> non cliquables :
// un bouton qui ne filtre rien induirait en erreur. Il en va de même sans `onToggle`.
function buildTag(group, value, onToggle, isNew) {
  const filterable = Boolean(onToggle) && FILTERABLE_KEYS.has(group.key);
  const tag = document.createElement(filterable ? 'button' : 'span');
  if (filterable) tag.type = 'button';
  tag.className = filterable ? `tag tag-${group.key}` : `tag tag-${group.key} tag-static`;
  tag.style.backgroundColor = group.color;
  tag.textContent = value;
  if (filterable) tag.addEventListener('click', () => onToggle(group.key, value));
  if (isNew) {
    tag.classList.add('tag-add');
    spoken(tag, 'ajouté');
  }
  return tag;
}

// Un tag retiré, montré barré dans la carte « Après » : ce qui a disparu se voit aussi. Il
// perd la couleur de sa catégorie, le rouge pâle de « retiré » la remplace.
function buildRemovedTag(group, value) {
  const tag = buildTag(group, value, null, false);
  tag.style.backgroundColor = '';
  tag.classList.add('tag-del');
  spoken(tag, 'retiré');
  return tag;
}

function buildTagGroup(group, labels, onToggle, change) {
  const section = document.createElement('section');
  section.className = 'tag-group';

  const title = document.createElement('h3');
  title.className = 'tag-group-title';
  title.textContent = group.label;
  title.style.color = group.color;

  const added = new Set((change?.added ?? []).map(normalize));
  const values = document.createElement('div');
  values.className = 'tag-group-values';
  values.append(
    ...labels.map(value => buildTag(group, value, onToggle, added.has(normalize(value)))),
    ...(change?.removed ?? []).map(value => buildRemovedTag(group, value))
  );

  section.append(title, values);
  return section;
}

function fillTags(container, contact, onToggle, changes) {
  TAG_GROUPS.forEach(group => {
    const labels = labelsOf(contact, group.key);
    const change = changes?.[group.key];
    if (labels.length > 0 || change?.removed.length > 0) {
      container.appendChild(buildTagGroup(group, labels, onToggle, change));
    }
  });
}

// La ligne d'actions d'une carte que la personne connectée peut modifier (voir
// rightsFor() dans profile.js) : « Votre fiche » sur la sienne, et le bouton. Le clic
// est écouté une seule fois par main.js, sur la grille.
function fillActions(box, contact, rights) {
  box.hidden = false;
  box.querySelector('.own-flag').hidden = rights !== 'own';
  const edit = box.querySelector('.card-edit');
  edit.dataset.rowId = String(contact.id);
  edit.textContent = rights === 'admin' ? '✎ Modifier la fiche' : '✎ Modifier';
  edit.title = rights === 'admin' ? `Modifier la fiche de ${displayName(contact)} (mode admin)` : 'Modifier ma fiche';
  edit.setAttribute('aria-label', `Modifier la fiche de ${displayName(contact)}`);
}

// `view` : { rights } pour la grille ('own', 'admin' ou rien), { marks } pour une
// carte de relecture (voir renderPreviewCard).
function buildCard(template, contact, onToggle, view = {}) {
  const { rights = null, marks = null } = view;
  const card = template.content.cloneNode(true);
  card.querySelector('.avatar').textContent = initials(contact);

  const name = card.querySelector('.name');
  if (marks?.texts.name) {
    // Dans un seul <span> : le nom est une boîte à plusieurs lignes (style.css) qui rangerait
    // sinon le repère, le blanc et la pastille les uns sous les autres.
    const line = el('span');
    line.append(el('span', 'mk', displayName(contact)), ' ', pill('modifié'));
    name.replaceChildren(line);
  } else {
    name.textContent = displayName(contact);
  }

  const fonction = card.querySelector('.fonction');
  if (marks?.texts.fonction) showTextChange(fonction, marks.texts.fonction);
  else if (contact.Fonction) reveal(fonction, contact.Fonction);

  const badge = card.querySelector('.etablissement-tag');
  fillEtablissement(badge, contact.etablissement_label, onToggle);
  if (marks?.texts.etab?.after) markEtablissement(badge, marks.texts.etab);
  const email = card.querySelector('.email');
  if (marks?.texts.email) showTextChange(email, marks.texts.email);
  else fillEmail(email, contact.email, Boolean(onToggle));

  const tel = card.querySelector('.tel');
  const phone = formatPhone(contact.numero_de_telephone);
  if (marks?.texts.tel) showTextChange(tel, marks.texts.tel, value => `☎ ${value}`);
  else if (phone) reveal(tel, `☎ ${phone}`);

  fillTags(card.querySelector('.card-tags'), contact, onToggle, marks?.tags);
  if (rights) fillActions(card.querySelector('.card-actions'), contact, rights);
  return card;
}

// `rightsOf(contact)` (facultatif) dit ce que la personne connectée peut faire de la
// fiche : 'own', 'admin' ou rien.
export function renderCards(grid, template, contacts, onToggle, rightsOf = () => null) {
  grid.innerHTML = '';
  contacts.forEach(contact => grid.appendChild(buildCard(template, contact, onToggle, { rights: rightsOf(contact) })));
}

// Une carte pour la relecture d'une modification : même gabarit et mêmes classes que
// dans l'annuaire, mais rien n'y est cliquable. `marks` (preview.js) repère dans la
// carte « après » ce qui a changé ; sans lui, c'est la carte « avant ».
export function renderPreviewCard(template, contact, marks = null) {
  const card = buildCard(template, contact, null, { marks });
  card.querySelector('.contact-card').classList.add('rv-card');
  return card;
}
