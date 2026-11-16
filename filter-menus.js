// Construction du DOM des menus de filtres (boutons, cases, groupes de compétences), sans logique métier.

import { CATEGORIES, FILTERS } from './constants.js';
import { compareLabels, normalize, ownValue, sortWithCheckedFirst, uniqueLabels } from './grist-data.js';
import { isFocusVisible } from './dom.js';
import { groupState, menuViews, selectionCount } from './filters.js';

// ===== Menus de filtres =====

// Les menus rangés par groupe (les compétences par domaine, ou par groupe C.U.R.I.E) gardent ici leurs rangements et celui qu'ils
// montrent, pour que le badge et les cases des groupes se recalculent sans les relire dans le DOM : { views: [{ grouping, groups }],
// active } (la clé du rangement montré).
const viewsByMenu = new WeakMap();

// Les groupes que le menu montre, ceux de son rangement actif ; `undefined` pour un menu à plat.
function activeGroups(menu) {
  const state = viewsByMenu.get(menu);
  return state?.views.find(({ grouping }) => grouping === state.active).groups;
}

// Le rangement qu'une personne a choisi dans le menu d'un filtre (clé du filtre → clé du regroupement) : un menu reconstruit (« Réinitialiser »,
// un libellé qui change dans Grist) rouvre sur le même onglet plutôt que de revenir au premier.
const chosenViews = new Map();

// Le rangement par lequel un menu s'ouvre : celui que la personne a choisi s'il existe encore, sinon le premier.
function startingView(filter, views) {
  const wanted = chosenViews.get(filter.key);
  return views.some(({ grouping }) => grouping === wanted) ? wanted : views[0].grouping;
}

// Le badge d'un menu compte les valeurs cochées et disparaît à zéro. Un nombre nu ne dit rien à un lecteur d'écran : le nom
// du bouton le dit en toutes lettres (« Compétences (2 sélectionnés) »), en commençant par le libellé qu'on lit à l'écran.
function setBadge(button, count) {
  const badge = button.querySelector('.filter-count');
  badge.textContent = String(count);
  badge.hidden = count === 0;
  const label = button.querySelector('.filter-name').textContent;
  button.setAttribute('aria-label', count === 0 ? label : `${label} (${count} sélectionné${count > 1 ? 's' : ''})`);
}

// La valeur d'une option est posée à la création : le texte affiché n'est pas la source.
function optionValue(option) {
  return option.dataset.value;
}

// Nombre de cartes que donnerait l'option `value` de la catégorie `countKey`.
function countFor(counts, countKey, value) {
  return ownValue(counts?.[countKey], normalize(value)) ?? 0;
}

// Cochées d'abord ; chaque groupe reste trié alphabétiquement. Une valeur écrite deux fois (à la casse
// ou aux accents près) n'a qu'une option : le filtre les couvre toutes les deux.
function orderedValues(values, selected) {
  return sortWithCheckedFirst(uniqueLabels(values).sort(compareLabels), selected);
}

// Un menu rangé par groupe dit ce qu'il offre (infobulle du bouton, champ de recherche) avec
// les mots de son regroupement : « domaine », « groupe C.U.R.I.E » ou « action ». Resté à plat (colonne absente de
// Grist, aucune ligne classée), il garde les textes par défaut, qui ne parlent d'aucun groupe : `grouping` est alors absent.
function groupingWording(grouping) {
  return grouping ? CATEGORIES[grouping] : {};
}

// `grouping` : le rangement par lequel le menu s'ouvre (rien pour un menu à plat). `menuId` : le menu que le bouton ouvre
// (aria-controls) ; il part fermé (aria-expanded), setFilterOpen() le tient à jour.
function buildFilterButton(filter, selectedCount, grouping, menuId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', menuId);
  const { hint } = groupingWording(grouping);
  if (hint) button.title = hint;

  const dot = document.createElement('span');
  dot.className = 'filter-dot';
  dot.style.backgroundColor = filter.color;
  const name = document.createElement('span');
  name.className = 'filter-name';
  name.textContent = filter.label;
  const badge = document.createElement('span');
  badge.className = 'filter-count';
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '▾';
  chevron.setAttribute('aria-hidden', 'true');

  button.append(dot, name, badge, chevron);
  setBadge(button, selectedCount);
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
  search.placeholder = groupingWording(viewsByMenu.get(menu)?.active).placeholder || `Rechercher dans ${filter.label}…`;
  search.setAttribute('aria-label', `Rechercher dans ${filter.label}`);
  search.autocomplete = 'off';
  search.addEventListener('input', () => {
    // Même normalisation que la recherche principale : « competence » trouve « Compétence ».
    const term = normalize(search.value);
    if (viewsByMenu.has(menu)) {
      searchGroups(menu, term);
      return;
    }
    menu.querySelectorAll('.filter-option').forEach(option => {
      option.hidden = term !== '' && !normalize(optionValue(option)).includes(term);
    });
  });
  return search;
}

// Les onglets d'un menu qui se range de plusieurs façons (« Classique » et « C.U.R.I.E » pour les compétences) : un onglet par rangement,
// au-dessus de la recherche. Ils suivent le schéma des onglets (WAI-ARIA) : un seul est dans l'ordre de tabulation, les flèches gauche et
// droite (Début, Fin) passent de l'un à l'autre et le montrent aussitôt ; la liste des groupes en dessous est leur panneau.
// `show(rangement)` : ce que le menu fait de ce choix (showView).
function buildViewTabs(filter, menu, show) {
  const bar = document.createElement('div');
  bar.className = 'view-tabs';
  bar.setAttribute('role', 'tablist');
  bar.setAttribute('aria-label', filter.viewsLabel);
  const tabs = viewsByMenu.get(menu).views.map(({ grouping }) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'view-tab';
    tab.id = `filter-tab-${filter.key}-${grouping}`;
    tab.dataset.grouping = grouping;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `filter-groups-${filter.key}`);
    tab.textContent = CATEGORIES[grouping].tab;
    tab.addEventListener('click', () => show(grouping));
    return tab;
  });
  bar.addEventListener('keydown', event => {
    const at = tabs.indexOf(document.activeElement);
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (at < 0 || next === undefined) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    show(target.dataset.grouping);
    target.focus();
  });
  bar.append(...tabs);
  return bar;
}

// Le haut d'un menu : les onglets s'il y en a, puis la recherche, qui reste là quand la liste défile (style.css, .filter-menu-head). Avec
// trente options le menu fait mille pixels pour trois cents visibles, et la recherche sortait de la vue au premier défilement (audit UI/UX,
// U37). `show` : voir buildViewTabs.
function buildMenuHead(filter, menu, show) {
  const head = document.createElement('div');
  head.className = 'filter-menu-head';
  if (viewsByMenu.get(menu)?.views.length > 1) head.appendChild(buildViewTabs(filter, menu, show));
  head.appendChild(buildMenuSearch(filter, menu));
  return head;
}

// L'aide d'un menu rangé par groupe (« Cochez un domaine pour toutes ses compétences… »), écrite dans le menu et lue avec lui : elle
// n'était que l'infobulle du bouton, qu'on ne voit ni au toucher ni au clavier (audit UI/UX, U27). Son texte suit le rangement (paintView).
function buildMenuHelp(filter, menu) {
  const help = document.createElement('p');
  help.className = 'filter-help';
  help.id = `filter-help-${filter.key}`;
  menu.setAttribute('aria-describedby', help.id);
  return help;
}

// Le nom d'une case est son libellé (« Oncologie »), pas le libellé suivi du nombre de fiches (« Oncologie 3 ») : le nombre est sa
// description, que le lecteur d'écran lit après le nom. Le texte du nombre reste celui que updateFilterCounts() met à jour.
let countSequence = 0;
function describeByCount(checkbox, countElement) {
  countSequence += 1;
  countElement.id = `option-count-${countSequence}`;
  countElement.setAttribute('aria-hidden', 'true');
  checkbox.setAttribute('aria-describedby', countElement.id);
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
  describeByCount(checkbox, countElement);

  option.append(checkbox, label, countElement);
  return option;
}

function buildFilterMenu(filter, referenceMaps, selected, counts, onToggle) {
  const menu = document.createElement('div');
  menu.className = 'filter-menu';
  menu.style.borderTopColor = filter.color;
  menu.appendChild(buildMenuHead(filter, menu));

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

// Un groupe du rangement `grouping` : sa case, son nom, le nombre de cartes qui ont l'une de ses valeurs, et un
// bouton qui déplie le détail. Replié au départ. `index` est sa place d'origine.
function buildGroup(filter, grouping, group, index, selected, counts, { onToggle, onToggleGroup }) {
  const section = document.createElement('div');
  section.className = 'filter-group';
  section.dataset.value = group.label;
  section.dataset.grouping = grouping;
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
  countElement.textContent = String(countFor(counts, grouping, group.label));
  describeByCount(checkbox, countElement);
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

// Met le menu d'accord avec son rangement actif : sa couleur de groupe, son aide, le texte de sa recherche, ses groupes et l'onglet allumé.
// Les groupes d'un autre rangement n'existent pas dans le DOM tant qu'on ne l'a pas choisi : un onglet de plus ne double pas les cases.
function paintView(menu, filter, selected, counts, handlers) {
  const { views, active } = viewsByMenu.get(menu);
  const { groups } = views.find(({ grouping }) => grouping === active);
  const wording = CATEGORIES[active];
  menu.dataset.grouping = active;
  menu.style.setProperty('--group-color', wording.color);
  menu.querySelector('.filter-help').textContent = wording.hint;
  menu.querySelector('.filter-search-input').placeholder = wording.placeholder;
  const panel = menu.querySelector('.filter-groups');
  panel.replaceChildren(...groups.map((group, index) => buildGroup(filter, active, group, index, selected, counts, handlers)));
  menu.querySelectorAll('.view-tab').forEach(tab => {
    const shown = tab.dataset.grouping === active;
    tab.setAttribute('aria-selected', String(shown));
    tab.tabIndex = shown ? 0 : -1; // un seul onglet dans l'ordre de tabulation ; les flèches passent de l'un à l'autre
    if (shown) panel.setAttribute('aria-labelledby', tab.id);
  });
}

// Un clic (ou une flèche) sur un onglet : le menu range ses valeurs autrement. La sélection ne change pas, seuls les groupes : la recherche
// déjà tapée s'applique au nouveau rangement, qui s'ouvre comme le menu à l'ouverture (ce qui est coché devant, un groupe à moitié coché
// déplié) et en haut de la liste. Le badge compte comme le rangement le fait (un groupe entier pour un), l'infobulle du bouton le dit.
function showView(menu, filter, grouping, handlers) {
  const state = viewsByMenu.get(menu);
  if (state.active === grouping) return;
  state.active = grouping;
  chosenViews.set(filter.key, grouping);
  const selected = handlers.selection(filter.key);
  paintView(menu, filter, selected, handlers.counts(), handlers);
  searchGroups(menu, normalize(menu.querySelector('.filter-search-input').value));
  settleGroupedMenu(menu);
  menu.scrollTop = 0;
  const button = menu.closest('.filter').querySelector('.filter-button');
  button.title = CATEGORIES[grouping].hint;
  setBadge(button, selectionCount(selected, activeGroups(menu)));
}

// `views` : menuViews() de ce menu, au moins un rangement ; `active` : celui par lequel il s'ouvre (startingView).
function buildGroupedMenu(filter, views, active, selected, counts, handlers) {
  const menu = document.createElement('div');
  menu.className = 'filter-menu filter-menu-groups';
  menu.style.borderTopColor = filter.color;
  viewsByMenu.set(menu, { views, active });
  menu.classList.toggle('has-tabs', views.length > 1); // l'en-tête collant est plus haut (style.css, --menu-head)
  // La liste des groupes : le panneau des onglets quand il y en a (WAI-ARIA).
  const panel = document.createElement('div');
  panel.className = 'filter-groups';
  panel.id = `filter-groups-${filter.key}`;
  if (views.length > 1) panel.setAttribute('role', 'tabpanel');
  menu.append(buildMenuHead(filter, menu, grouping => showView(menu, filter, grouping, handlers)), buildMenuHelp(filter, menu), panel);
  paintView(menu, filter, selected, counts, handlers);
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
  arrange(menu.querySelector('.filter-groups'), sections, section => section.dataset.state !== 'none');
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

// Ouvre ou ferme le menu d'un filtre : la classe qui l'affiche, et l'état que le lecteur d'écran lit sur le bouton.
function setFilterOpen(wrapper, open) {
  wrapper.classList.toggle('open', open);
  wrapper.querySelector('.filter-button').setAttribute('aria-expanded', String(open));
}

// Ferme les menus ouverts, sauf `except` : un clic ailleurs dans la page (main.js), l'ouverture d'un autre menu.
export function closeFilterMenus(except = null) {
  document.querySelectorAll('.filter.open').forEach(wrapper => {
    if (wrapper !== except) setFilterOpen(wrapper, false);
  });
}

// Au clavier, Échap referme le menu et rend le focus à son bouton ; le focus qui passe à un autre contrôle (Tab, Maj+Tab) le
// referme aussi : resté ouvert, il recouvrirait les boutons suivants. Un focus qui part sans destination (un clic dans une marge,
// une autre fenêtre) ne le referme pas : le clic ailleurs s'en charge (closeFilterMenus), et la souris ne perd pas son menu.
function closeOnLeave(wrapper, button) {
  wrapper.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !wrapper.classList.contains('open')) return;
    event.preventDefault();
    setFilterOpen(wrapper, false);
    button.focus();
  });
  wrapper.addEventListener('focusout', event => {
    if (event.relatedTarget && !wrapper.contains(event.relatedTarget)) setFilterOpen(wrapper, false);
  });
}

function buildFilter(filter, referenceMaps, selected, counts, handlers) {
  const wrapper = document.createElement('div');
  wrapper.className = 'filter';
  // Permet à updateFilterUI() de retrouver ce menu sans reconstruire les autres
  // (ce qui fermerait ceux qui sont ouverts).
  wrapper.dataset.filterKey = filter.key;

  // Un menu à plat (aucun rangement que Grist remplisse), ou rangé par groupe, avec des onglets quand il se range de plusieurs façons.
  const views = menuViews(filter, referenceMaps);
  const active = views.length > 0 ? startingView(filter, views) : null;
  const groups = active && views.find(({ grouping }) => grouping === active).groups;
  const menuId = `filter-menu-${filter.key}`;
  const button = buildFilterButton(filter, selectionCount(selected, groups), active, menuId);
  const menu = active
    ? buildGroupedMenu(filter, views, active, selected, counts, handlers)
    : buildFilterMenu(filter, referenceMaps, selected, counts, handlers.onToggle);
  // Un groupe de cases nommé comme son bouton, que celui-ci désigne (aria-controls).
  menu.id = menuId;
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', filter.label);

  button.addEventListener('click', event => {
    event.stopPropagation();
    closeFilterMenus(wrapper);
    const open = !wrapper.classList.contains('open');
    setFilterOpen(wrapper, open);
    if (open) {
      if (active) settleGroupedMenu(menu);
      keepMenuInView(menu);
    }
  });
  // Un clic dans le menu ne doit pas atteindre le document, qui referme les menus.
  menu.addEventListener('click', event => event.stopPropagation());
  closeOnLeave(wrapper, button);

  wrapper.append(button, menu);
  return wrapper;
}

// `handlers` : { onToggle(filterKey, value), onToggleGroup(filterKey, values), selection(filterKey), counts() } ; le
// second sert aux menus par groupe, qui cochent un groupe entier d'un clic ; les deux derniers donnent à un menu qui change de
// rangement (onglet) la sélection et les nombres du moment, pas ceux de sa construction.
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
  // La case qu'on vient de cocher passe en tête : la déplacer lui retire le focus (la page le reprend) ; le clavier reste sur elle.
  // Le menu ne défile jusqu'à elle que si le focus était celui du clavier : à la souris, la liste ne bouge pas.
  const focused = menu.contains(document.activeElement) ? document.activeElement : null;
  const byKeyboard = focused !== null && isFocusVisible(focused);
  // appendChild() déplace un nœud existant sans le recréer : les écouteurs survivent.
  orderedValues([...optionsByValue.keys()], selected).forEach(value => {
    menu.appendChild(optionsByValue.get(value));
  });
  if (focused && document.activeElement !== focused) focused.focus({ preventScroll: !byKeyboard });
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
  const groups = activeGroups(menu);
  if (groups) syncGroupedMenu(menu, selected);
  else syncFlatMenu(menu, selected);
  setBadge(wrapper.querySelector('.filter-button'), selectionCount(selected, groups));
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
