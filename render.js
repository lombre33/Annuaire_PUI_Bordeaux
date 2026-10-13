// Construction du DOM (menus de filtres, cartes), sans logique métier.

import { CATEGORIES, TAG_GROUPS, FILTERS } from './constants.js';
import { compareLabels, displayName, formatPhone, labelsOf, mailtoHref, refId, shownEmail, sortWithCheckedFirst, normalize, uniqueLabels } from './grist-data.js';
import { el } from './dom.js';
import { groupState, menuGroups, selectionCount } from './filters.js';
import { createLogoImage, fitCardLogo } from './branding-ui.js';
import { createAvatar } from './avatar-ui.js';
import { avatarIdOf } from './attachments.js';

// Catégories qui ont un menu : seules leurs bulles de carte sont cliquables.
const FILTERABLE_KEYS = new Set(FILTERS.map(filter => filter.key));

// Le rôle dans le PUI n'est pas une section du bas de la carte : c'est une petite pastille à côté de la fonction
// et de l'e-mail (ou sous l'e-mail sur une carte étroite), hors de la colonne du logo.
const ROLE_GROUP = TAG_GROUPS.find(group => group.key === 'role');

// ===== Menus de filtres =====

// Les menus rangés par groupe (les compétences par domaine) gardent leurs groupes ici,
// pour que le badge et les cases des groupes se recalculent sans les relire dans le DOM.
const groupsByMenu = new WeakMap();

// Le badge d'un menu compte les valeurs cochées et disparaît à zéro.
function setBadge(badge, count) {
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

// La valeur d'une option est posée à la création : le texte affiché n'est pas la source.
function optionValue(option) {
  return option.dataset.value;
}

// Nombre de cartes que donnerait l'option `value` de la catégorie `countKey`.
function countFor(counts, countKey, value) {
  return counts?.[countKey]?.[normalize(value)] ?? 0;
}

// Cochées d'abord ; chaque groupe reste trié alphabétiquement. Une valeur écrite deux fois (à la casse
// ou aux accents près) n'a qu'une option : le filtre les couvre toutes les deux.
function orderedValues(values, selected) {
  return sortWithCheckedFirst(uniqueLabels(values).sort(compareLabels), selected);
}

// Un menu rangé par groupe dit ce qu'il offre (infobulle du bouton, champ de recherche) avec
// les mots de son regroupement : « domaine » ou « action ». Resté à plat (colonne absente de
// Grist, aucune ligne classée), il garde les textes par défaut, qui ne parlent d'aucun groupe.
function groupingWording(filter, grouped) {
  return grouped ? CATEGORIES[filter.grouping] : {};
}

function buildFilterButton(filter, selectedCount, grouped) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-button';
  const { hint } = groupingWording(filter, grouped);
  if (hint) button.title = hint;

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

// Ce que la recherche d'un menu par groupe laisse voir : un groupe dont le nom
// correspond garde toutes ses valeurs, un autre seulement celles qui correspondent (avec
// son nom, qui les situe). Tant qu'on cherche, tous les groupes sont dépliés (`searching`,
// style.css) ; en effaçant la recherche, chacun retrouve son état.
function searchGroups(menu, term) {
  menu.classList.toggle('searching', term !== '');
  menu.querySelectorAll('.filter-group').forEach(section => {
    const wholeGroup = term === '' || normalize(section.dataset.value).includes(term);
    let shown = 0;
    section.querySelectorAll('.filter-option').forEach(option => {
      option.hidden = !wholeGroup && !normalize(optionValue(option)).includes(term);
      if (!option.hidden) shown += 1;
    });
    section.hidden = !wholeGroup && shown === 0;
  });
}

function buildMenuSearch(filter, menu) {
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'filter-search-input';
  search.placeholder = groupingWording(filter, groupsByMenu.has(menu)).placeholder || `Rechercher dans ${filter.label}…`;
  search.setAttribute('aria-label', `Rechercher dans ${filter.label}`);
  search.autocomplete = 'off';
  search.addEventListener('input', () => {
    // Même normalisation que la recherche principale : « competence » trouve « Compétence ».
    const term = normalize(search.value);
    if (groupsByMenu.has(menu)) {
      searchGroups(menu, term);
      return;
    }
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

// ----- Menu par groupe (les compétences rangées par domaine) -----

let groupSequence = 0;

function setGroupOpen(section, open) {
  section.classList.toggle('open', open);
  section.querySelector('.group-toggle').setAttribute('aria-expanded', String(open));
}

// La case d'un groupe est cochée quand toutes ses valeurs le sont, partielle quand
// certaines seulement le sont.
function paintGroup(section, state) {
  const head = section.querySelector('.group-head');
  const checkbox = head.querySelector('input[type="checkbox"]');
  checkbox.checked = state === 'all';
  checkbox.indeterminate = state === 'some';
  head.classList.toggle('checked', state === 'all');
  head.classList.toggle('partial', state === 'some');
  section.dataset.state = state;
}

// Un groupe : sa case, son nom, le nombre de cartes qui ont l'une de ses valeurs, et un
// bouton qui déplie le détail. Replié au départ. `index` est sa place d'origine.
function buildGroup(filter, group, index, selected, counts, { onToggle, onToggleGroup }) {
  const section = document.createElement('div');
  section.className = 'filter-group';
  section.dataset.value = group.label;
  section.dataset.grouping = filter.grouping;
  section.dataset.index = String(index);

  const head = document.createElement('div');
  head.className = 'group-head';
  const option = document.createElement('label');
  option.className = 'group-option';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.addEventListener('change', () => onToggleGroup(filter.key, group.values));
  const label = document.createElement('span');
  label.className = 'option-label';
  label.textContent = group.label;
  const countElement = document.createElement('span');
  countElement.className = 'option-count';
  countElement.textContent = String(countFor(counts, filter.grouping, group.label));
  option.append(checkbox, label, countElement);

  groupSequence += 1;
  const list = document.createElement('div');
  list.className = 'group-options';
  list.id = `group-options-${groupSequence}`;
  group.values.forEach((value, position) => {
    const entry = buildOption(filter, value, selected.has(value), countFor(counts, filter.key, value), onToggle);
    entry.dataset.index = String(position);
    list.appendChild(entry);
  });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'group-toggle';
  toggle.textContent = '▾';
  toggle.title = 'Afficher ou masquer le détail';
  toggle.setAttribute('aria-label', `Détail de ${group.label}`);
  toggle.setAttribute('aria-controls', list.id);
  toggle.addEventListener('click', () => setGroupOpen(section, !section.classList.contains('open')));

  head.append(option, toggle);
  section.append(head, list);
  setGroupOpen(section, false);
  paintGroup(section, groupState(selected, group.values));
  return section;
}

function buildGroupedMenu(filter, groups, selected, counts, handlers) {
  const menu = document.createElement('div');
  menu.className = 'filter-menu filter-menu-groups';
  menu.style.borderTopColor = filter.color;
  menu.style.setProperty('--group-color', CATEGORIES[filter.grouping].color);
  groupsByMenu.set(menu, groups);
  menu.appendChild(buildMenuSearch(filter, menu));
  groups.forEach((group, index) => menu.appendChild(buildGroup(filter, group, index, selected, counts, handlers)));
  return menu;
}

// Remet `nodes` dans l'ordre d'origine (leur `data-index`), ceux qui `isChecked` d'abord.
// appendChild() déplace un nœud existant sans le recréer : les écouteurs survivent.
function arrange(parent, nodes, isChecked) {
  nodes
    .sort((a, b) => isChecked(b) - isChecked(a) || Number(a.dataset.index) - Number(b.dataset.index))
    .forEach(node => parent.appendChild(node));
}

// À l'ouverture d'un menu par groupe, ce qui est coché passe devant : les groupes qui
// contiennent des valeurs cochées d'abord, et dans chacun ces valeurs ; un groupe coché
// en partie est déplié, pour montrer lesquelles. Rien ne bouge pendant qu'on coche (la
// ligne qu'on vient de cocher resterait sous les yeux), seulement à l'ouverture suivante.
function settleGroupedMenu(menu) {
  const sections = [...menu.querySelectorAll('.filter-group')];
  sections.forEach(section => {
    arrange(section.querySelector('.group-options'), [...section.querySelectorAll('.filter-option')],
      option => option.classList.contains('checked'));
    if (section.dataset.state === 'some') setGroupOpen(section, true);
  });
  arrange(menu, sections, section => section.dataset.state !== 'none');
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

function buildFilter(filter, referenceMaps, selected, counts, handlers) {
  const wrapper = document.createElement('div');
  wrapper.className = 'filter';
  // Permet à updateFilterUI() de retrouver ce menu sans reconstruire les autres
  // (ce qui fermerait ceux qui sont ouverts).
  wrapper.dataset.filterKey = filter.key;

  const groups = menuGroups(filter, referenceMaps);
  const button = buildFilterButton(filter, selectionCount(selected, groups), Boolean(groups));
  const menu = groups
    ? buildGroupedMenu(filter, groups, selected, counts, handlers)
    : buildFilterMenu(filter, referenceMaps, selected, counts, handlers.onToggle);

  button.addEventListener('click', event => {
    event.stopPropagation();
    document.querySelectorAll('.filter.open').forEach(other => {
      if (other !== wrapper) other.classList.remove('open');
    });
    wrapper.classList.toggle('open');
    if (wrapper.classList.contains('open')) {
      if (groups) settleGroupedMenu(menu);
      keepMenuInView(menu);
    }
  });
  // Un clic dans le menu ne doit pas atteindre le document, qui referme les menus.
  menu.addEventListener('click', event => event.stopPropagation());

  wrapper.append(button, menu);
  return wrapper;
}

// `handlers` : { onToggle(filterKey, value), onToggleGroup(filterKey, values) } ; le
// second sert aux menus par groupe, qui cochent un groupe entier d'un clic.
export function createFilterUI(container, referenceMaps, activeFilters, handlers, counts) {
  if (!container) return;
  container.innerHTML = '';
  FILTERS.forEach(filter => {
    container.appendChild(buildFilter(filter, referenceMaps, activeFilters[filter.key], counts, handlers));
  });
}

// Menu plat : les cases, l'ordre (cochées d'abord) et le badge.
function syncFlatMenu(menu, selected) {
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
}

// Menu par groupe : les cases des valeurs et celles des groupes, sans rien déplacer
// (voir settleGroupedMenu). Une valeur figure dans chaque groupe de ses lignes.
function syncGroupedMenu(menu, selected) {
  menu.querySelectorAll('.filter-group').forEach(section => {
    const options = [...section.querySelectorAll('.filter-option')];
    options.forEach(option => {
      const isSelected = selected.has(optionValue(option));
      option.classList.toggle('checked', isSelected);
      option.querySelector('input[type="checkbox"]').checked = isSelected;
    });
    paintGroup(section, groupState(selected, options.map(optionValue)));
  });
}

// Après un clic sur une case, un badge d'établissement ou un tag de carte :
// met à jour le seul menu concerné (cases, ordre, badge) sans le reconstruire,
// pour ne pas fermer un autre menu ni effacer une recherche en cours.
export function updateFilterUI(container, filterKey, activeFilters) {
  const wrapper = container.querySelector(`[data-filter-key="${filterKey}"]`);
  if (!wrapper) return; // une catégorie sans menu : rien à resynchroniser

  const selected = activeFilters[filterKey];
  const menu = wrapper.querySelector('.filter-menu');
  const groups = groupsByMenu.get(menu);
  if (groups) syncGroupedMenu(menu, selected);
  else syncFlatMenu(menu, selected);
  setBadge(wrapper.querySelector('.filter-count'), selectionCount(selected, groups));
}

// Rafraîchit le nombre de chaque option de tous les menus (changer un filtre
// modifie les comptes des autres), sans toucher à l'ordre ni aux menus ouverts.
// Le nombre d'un groupe est celui des cartes qui ont l'une de ses valeurs.
export function updateFilterCounts(container, counts) {
  if (!container) return;
  container.querySelectorAll('.filter').forEach(wrapper => {
    const filterKey = wrapper.dataset.filterKey;
    wrapper.querySelectorAll('.filter-option').forEach(option => {
      const countElement = option.querySelector('.option-count');
      if (countElement) countElement.textContent = String(countFor(counts, filterKey, optionValue(option)));
    });
    wrapper.querySelectorAll('.filter-group').forEach(section => {
      const countElement = section.querySelector('.group-head .option-count');
      countElement.textContent = String(countFor(counts, section.dataset.grouping, section.dataset.value));
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

// L'établissement d'une carte : son logo seul quand Grist en a un, sinon son nom dans
// une pastille. `logo` : { attachment, name, attachments } (voir buildCard), ou null.
// Si le logo ne se charge pas, le nom reprend sa place.
function fillEtablissement(badge, label, onToggle, logo) {
  if (!label) return;
  if (onToggle) badge.addEventListener('click', () => onToggle('etablissement', label));
  else badge.disabled = true;
  if (!logo) {
    reveal(badge, label);
    return;
  }
  // `with-logo` donne au logo, plus haut que la pastille, la place des deux rangées du nom
  // et de la fonction (style.css) : sa hauteur ne décentre pas le nom par rapport à l'avatar.
  const body = badge.closest('.card-body');
  const showName = () => {
    badge.classList.remove('has-logo');
    body?.classList.remove('with-logo');
    badge.replaceChildren();
    reveal(badge, label);
  };
  badge.classList.add('visible', 'has-logo');
  body?.classList.add('with-logo');
  badge.title = logo.name;
  const onLoad = (image, show) => fitCardLogo(image, logo.attachment, show);
  badge.append(createLogoImage(logo.attachments, logo.attachment, label, showName, { onLoad }));
}

// Sans `onToggle` (carte de relecture), l'adresse est du texte : un clic ne doit pas
// ouvrir un message depuis une fenêtre de relecture.
function fillEmail(link, email, linked) {
  if (!email) return;
  reveal(link, email);
  const href = linked ? mailtoHref(email) : '';
  if (href) link.href = href;
}

// Le rôle de la personne dans une tâche (taskRolesOf dans grist-data.js), écrit dans l'étiquette de la tâche : les
// lecteurs d'écran le lisent avec elle, la bulle d'attachTagNotes le montre au survol et au clavier, et sur un écran
// qui ne survole pas (téléphone) style.css l'affiche sous le nom de la tâche. Masqué à l'écran sinon.
const roleNote = roles => `${roles.length > 1 ? 'Rôles' : 'Rôle'} : ${roles.join(', ')}`;

// Un tag d'une catégorie sans filtre serait fait de <span> non cliquables : un bouton qui ne
// filtre rien induirait en erreur. Il en va de même sans `onToggle` (carte de relecture).
function buildTag(group, value, onToggle, isNew, roles) {
  const filterable = Boolean(onToggle) && FILTERABLE_KEYS.has(group.key);
  const tag = document.createElement(filterable ? 'button' : 'span');
  if (filterable) tag.type = 'button';
  tag.className = filterable ? `tag tag-${group.key}` : `tag tag-${group.key} tag-static`;
  tag.style.backgroundColor = group.color;
  tag.textContent = value;
  if (roles?.length) {
    tag.classList.add('has-note');
    tag.append(' ', el('span', 'tag-note', roleNote(roles)));
  }
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

function buildTagGroup(group, labels, onToggle, change, roles) {
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
    ...labels.map(value => {
      const key = normalize(value);
      return buildTag(group, value, onToggle, added.has(key), roles?.[key]);
    }),
    ...(change?.removed ?? []).map(value => buildRemovedTag(group, value))
  );

  section.append(title, values);
  return section;
}

// Le rôle dans le PUI : une petite pastille qui filtre comme les autres tags. Elle n'est pas dans la
// colonne du logo (sa hauteur écarterait le nom de l'avatar) mais dans sa propre boîte, qui prend sa
// place en CSS : à droite de la fonction et de l'e-mail sur une carte large, sous l'e-mail sur une carte
// étroite. Sur la carte « Après » d'une relecture, un rôle ajouté porte son contour, un rôle retiré reste
// barré (`change` : { added, removed }).
function fillRole(body, contact, onToggle, change) {
  const added = new Set((change?.added ?? []).map(normalize));
  const tags = [
    ...labelsOf(contact, ROLE_GROUP.key).map(value => buildTag(ROLE_GROUP, value, onToggle, added.has(normalize(value)))),
    ...(change?.removed ?? []).map(value => buildRemovedTag(ROLE_GROUP, value))
  ];
  if (tags.length === 0) return;
  const column = el('div', 'role-col');
  tags.forEach(tag => {
    tag.classList.add('role-tag');
    column.append(tag);
  });
  body.insertBefore(column, body.querySelector('.card-tags'));
  body.classList.add('has-role');
}

function fillTags(container, contact, onToggle, changes) {
  TAG_GROUPS.filter(group => group !== ROLE_GROUP).forEach(group => {
    const labels = labelsOf(contact, group.key);
    const change = changes?.[group.key];
    if (labels.length > 0 || change?.removed.length > 0) {
      // Le rôle dans une tâche ne se lit que dans l'annuaire, pas sur une carte de relecture (sans `onToggle`).
      const roles = onToggle && group.key === 'taches' ? contact.taskRoles : null;
      container.appendChild(buildTagGroup(group, labels, onToggle, change, roles));
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

// Le bouton « Modifier » d'un responsable, sous le logo (ou le sigle) de son établissement : il ouvre la
// fiche de l'établissement. Le clic est écouté une seule fois par main.js, sur la grille.
function fillEtablissementEdit(box, etablissementId, contactId, label) {
  const edit = el('button', 'etab-edit', '✎ Modifier');
  edit.type = 'button';
  edit.dataset.etabId = String(etablissementId);
  edit.dataset.rowId = String(contactId);
  edit.title = `Modifier la fiche de l’établissement : ${label}`;
  edit.setAttribute('aria-label', `Modifier l’établissement ${label}`);
  edit.setAttribute('aria-haspopup', 'dialog');
  box.append(edit);
}

// La photo que montre la carte : celle que la personne vient de choisir (la carte « après » d'une
// relecture, `avatarUrl`, voir withAvatarChange dans preview.js), sinon celle que Grist garde.
const photoOf = contact => (contact.avatarUrl ? { url: contact.avatarUrl } : avatarIdOf(contact.Avatar));

// Le repère de la photo sur la carte « Après » : un anneau vert, ou rouge pour une photo retirée, et
// la pastille écrite sous la fonction (`marks.avatar` : { before, after }, voir withAvatarChange).
function markAvatar(avatar, identity, { before, after }) {
  const gone = after === 'remove';
  avatar.classList.add(gone ? 'rv-ring-del' : 'rv-ring');
  const note = el('p', 'rv-note');
  note.append(pill(gone ? 'photo retirée' : before > 0 ? 'photo modifiée' : 'photo ajoutée', gone));
  identity.append(note);
}

// `view` : { rights } pour la grille ('own', 'admin' ou rien), { marks } pour une
// carte de relecture (voir renderPreviewCard), { logos } de quoi montrer le logo de
// l'établissement : { attachments, logoFor(contact) } (attachments.js, branding.js) ;
// sans eux la carte garde la pastille texte et les initiales (une photo de Grist demande aussi
// `attachments`).
function buildCard(template, contact, onToggle, view = {}) {
  const { rights = null, marks = null, logos = null, etabRights = null } = view;
  const card = template.content.cloneNode(true);
  const etablissement = logos?.attachments && logos.logoFor?.(contact);

  // Sans photo, les initiales du gabarit ; avec elle, un avatar neuf (photo sous les initiales jusqu'à
  // son chargement). Dans la grille la photo s'agrandit au clic ; sur une carte de relecture (sans
  // `onToggle`) rien n'est cliquable.
  let avatar = card.querySelector('.avatar');
  const photo = photoOf(contact);
  if (photo) {
    const zoom = onToggle
      ? { name: displayName(contact), detail: [contact.Fonction, etablissement?.name || contact.etablissement_label].filter(Boolean).join(' · ') }
      : null;
    const withPhoto = createAvatar({ initials: initials(contact), photo, attachments: logos?.attachments, zoom });
    avatar.replaceWith(withPhoto);
    avatar = withPhoto;
  } else {
    avatar.textContent = initials(contact);
  }
  if (marks?.avatar) markAvatar(avatar, card.querySelector('.identity'), marks.avatar);

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
  fillEtablissement(badge, contact.etablissement_label, onToggle,
    etablissement?.logo ? { attachment: etablissement.logo, name: etablissement.name, attachments: logos.attachments } : null);
  if (marks?.texts.etab?.after) markEtablissement(badge, marks.texts.etab);
  const email = card.querySelector('.email');
  if (marks?.texts.email) showTextChange(email, marks.texts.email);
  else fillEmail(email, shownEmail(contact), Boolean(onToggle));

  const tel = card.querySelector('.tel');
  const phone = formatPhone(contact.numero_de_telephone);
  if (marks?.texts.tel) showTextChange(tel, marks.texts.tel, value => `☎ ${value}`);
  else if (phone) reveal(tel, `☎ ${phone}`);

  fillRole(card.querySelector('.card-body'), contact, onToggle, marks?.tags.role);
  fillTags(card.querySelector('.card-tags'), contact, onToggle, marks?.tags);
  if (rights) fillActions(card.querySelector('.card-actions'), contact, rights);
  // Fermé par défaut : seul un établissement dont la personne est responsable (et dont la carte
  // porte la référence) montre le bouton.
  const etablissementId = refId(contact.Etablissement);
  if (etabRights && etablissementId && contact.etablissement_label && etabRights(etablissementId)) {
    fillEtablissementEdit(card.querySelector('.etab-actions'), etablissementId, contact.id, contact.etablissement_label);
  }
  return card;
}

// `rightsOf(contact)` (facultatif) dit ce que la personne connectée peut faire de la
// fiche : 'own', 'admin' ou rien. `logos` (facultatif) : de quoi montrer le logo de
// l'établissement, voir buildCard. `etabRights(identifiant)` (facultatif) : vrai pour un
// établissement dont la personne est responsable (etablissementRightsFor).
export function renderCards(grid, template, contacts, onToggle, rightsOf = () => null, logos = null, etabRights = null) {
  grid.innerHTML = '';
  contacts.forEach(contact => grid.appendChild(buildCard(template, contact, onToggle, { rights: rightsOf(contact), logos, etabRights })));
}

// Une carte pour la relecture d'une modification : même gabarit et mêmes classes que
// dans l'annuaire, mais rien n'y est cliquable. `marks` (preview.js) repère dans la
// carte « après » ce qui a changé ; sans lui, c'est la carte « avant ».
export function renderPreviewCard(template, contact, marks = null, logos = null) {
  const card = buildCard(template, contact, null, { marks, logos });
  card.querySelector('.contact-card').classList.add('rv-card');
  return card;
}

// ===== Bulle du rôle dans une tâche =====

// Au survol d'une étiquette de tâche, ou quand le clavier s'y pose, une bulle dit le rôle de la personne dans la tâche
// (le texte de `.tag-note`, voir buildTag). Une seule bulle pour toute la grille, posée sur <body> : une carte coupe
// ce qui la dépasse. Sur un écran qui ne survole pas (téléphone) elle ne sert pas : style.css écrit le rôle sous le
// nom de la tâche. Échap la ferme et elle reste tant que la souris est sur l'étiquette ou sur elle (WCAG 1.4.13).
const TIP_GAP = 6;
const TIP_MARGIN = 8;
const TIP_HIDE_DELAY_MS = 150;

export function attachTagNotes(grid) {
  const tip = el('div', 'tag-tip');
  tip.hidden = true;
  // Le rôle fait déjà partie du nom de l'étiquette pour un lecteur d'écran : la bulle ne le répète pas.
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);
  let timer = 0;
  let anchor = null; // l'étiquette de la bulle ouverte et l'endroit où elle était

  const hide = () => {
    clearTimeout(timer);
    anchor = null;
    tip.hidden = true;
  };
  const hideSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, TIP_HIDE_DELAY_MS);
  };
  const show = tag => {
    clearTimeout(timer);
    const note = tag.querySelector('.tag-note')?.textContent;
    if (!note || window.matchMedia('(hover: none)').matches) return;
    tip.textContent = note;
    // Mesurée au coin du cadre, où rien ne la serre : sa largeur ne dépend pas de l'endroit où on la pose.
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.hidden = false;
    const { left: tagLeft, top: tagTop, width, bottom } = tag.getBoundingClientRect();
    const left = Math.min(Math.max(TIP_MARGIN, tagLeft + (width - tip.offsetWidth) / 2), window.innerWidth - tip.offsetWidth - TIP_MARGIN);
    const above = tagTop - tip.offsetHeight - TIP_GAP;
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= TIP_MARGIN ? above : bottom + TIP_GAP}px`;
    anchor = { tag, left: tagLeft, top: tagTop };
  };
  const tagOf = event => event.target.closest?.('.tag.has-note');
  // Le défilement ou le redimensionnement du cadre déplace l'étiquette : la bulle, fixe, ne la suivrait pas.
  const followOrHide = () => {
    if (!anchor) return;
    const { left, top } = anchor.tag.getBoundingClientRect();
    if (left !== anchor.left || top !== anchor.top) hide();
  };

  grid.addEventListener('mouseover', event => {
    const tag = tagOf(event);
    if (tag) show(tag);
  });
  grid.addEventListener('mouseout', event => {
    if (tagOf(event)) hideSoon();
  });
  grid.addEventListener('focusin', event => {
    const tag = tagOf(event);
    if (tag?.matches(':focus-visible')) show(tag);
  });
  grid.addEventListener('focusout', event => {
    if (tagOf(event)) hide();
  });
  tip.addEventListener('mouseenter', () => clearTimeout(timer));
  tip.addEventListener('mouseleave', hideSoon);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  window.addEventListener('scroll', followOrHide, true);
  window.addEventListener('resize', followOrHide);
  // Les cartes redessinées (un filtre, une recherche) emportent l'étiquette sans qu'aucun événement de souris
  // ne le dise : la bulle s'efface.
  new MutationObserver(hide).observe(grid, { childList: true });
}
