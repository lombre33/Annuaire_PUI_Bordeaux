// Construction du DOM (menus de filtres, cartes), sans logique métier.

import { TAG_GROUPS, FILTERS } from './constants.js';
import { compareLabels, formatPhone, labelsOf, mailtoHref, sortWithCheckedFirst, normalize } from './grist-data.js';

export function createFilterUI(container, referenceMaps, activeFilters, onToggle, counts) {
  if (!container) return;
  container.innerHTML = '';

  FILTERS.forEach(filter => {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter';
    // Permet à updateFilterUI() de retrouver ce menu sans reconstruire les autres
    // (ce qui fermerait ceux qui sont ouverts).
    wrapper.dataset.filterKey = filter.key;

    const selected = activeFilters[filter.key];

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.innerHTML = `
      <span class="filter-dot"></span>
      <span>${filter.label}</span>
      <span class="filter-count" hidden></span>
      <span class="chevron">▾</span>
    `;
    button.querySelector('.filter-dot').style.backgroundColor = filter.color;
    const badge = button.querySelector('.filter-count');
    badge.textContent = String(selected.size);
    badge.hidden = selected.size === 0;

    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    menu.style.borderTopColor = filter.color;

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'filter-search-input';
    search.placeholder = `Rechercher dans ${filter.label}…`;
    search.autocomplete = 'off';
    search.addEventListener('input', () => {
      // Même normalisation que la recherche principale : « competence » trouve « Compétence ».
      const term = normalize(search.value);
      menu.querySelectorAll('.filter-option').forEach(option => {
        const label = normalize(option.querySelector('.option-label').textContent);
        option.hidden = term !== '' && !label.includes(term);
      });
    });
    menu.appendChild(search);

    const refMap = referenceMaps[filter.table] || {};
    const sortedValues = [...new Set(Object.values(refMap))].sort(compareLabels);
    const values = sortWithCheckedFirst(sortedValues, selected);

    values.forEach(value => {
      const option = document.createElement('label');
      const checked = selected.has(value);
      option.className = checked ? 'filter-option checked' : 'filter-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = checked;
      checkbox.addEventListener('change', () => onToggle(filter.key, value));
      const label = document.createElement('span');
      label.className = 'option-label';
      label.textContent = value;
      const count = document.createElement('span');
      count.className = 'option-count';
      count.textContent = String(counts?.[filter.key]?.[normalize(value)] ?? 0);
      option.append(checkbox, label, count);
      menu.appendChild(option);
    });

    button.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.filter.open').forEach(f => {
        if (f !== wrapper) f.classList.remove('open');
      });
      wrapper.classList.toggle('open');
    });

    menu.addEventListener('click', event => event.stopPropagation());
    wrapper.append(button, menu);
    container.appendChild(wrapper);
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
  const options = [...menu.querySelectorAll('.filter-option')];
  const byLabel = (a, b) => compareLabels(
    a.querySelector('.option-label').textContent,
    b.querySelector('.option-label').textContent
  );

  options.forEach(option => {
    const value = option.querySelector('.option-label').textContent;
    const isSelected = selected.has(value);
    option.classList.toggle('checked', isSelected);
    // Un clic venu d'une carte ne passe pas par la case : la resynchroniser.
    option.querySelector('input[type="checkbox"]').checked = isSelected;
  });
  const checked = options.filter(option => option.classList.contains('checked')).sort(byLabel);
  const unchecked = options.filter(option => !option.classList.contains('checked')).sort(byLabel);
  // Chaque groupe est retrié alphabétiquement : une valeur décochée reprend sa
  // place. appendChild() déplace un nœud existant sans le recréer, les écouteurs survivent.
  [...checked, ...unchecked].forEach(option => menu.appendChild(option));

  const badge = wrapper.querySelector('.filter-count');
  badge.textContent = String(selected.size);
  badge.hidden = selected.size === 0;
}

// Rafraîchit le nombre de chaque option de tous les menus (changer un filtre
// modifie les comptes des autres), sans toucher à l'ordre ni aux menus ouverts.
export function updateFilterCounts(container, counts) {
  if (!container) return;
  container.querySelectorAll('.filter').forEach(wrapper => {
    const filterKey = wrapper.dataset.filterKey;
    wrapper.querySelectorAll('.filter-option').forEach(option => {
      const value = option.querySelector('.option-label').textContent;
      const countEl = option.querySelector('.option-count');
      if (countEl) countEl.textContent = String(counts?.[filterKey]?.[normalize(value)] ?? 0);
    });
  });
}

export function renderCards(grid, template, contacts, onToggle) {
  grid.innerHTML = '';

  contacts.forEach(contact => {
    const clone = template.content.cloneNode(true);
    clone.querySelector('.avatar').textContent =
      `${(contact.Prenom || '').charAt(0)}${(contact.Nom || '').charAt(0)}`.toUpperCase() || '?';
    clone.querySelector('.name').textContent =
      `${contact.Prenom || ''} ${contact.Nom || ''}`.trim() || 'Sans nom';
    const fonction = clone.querySelector('.fonction');
    if (contact.fonction) {
      fonction.textContent = contact.fonction;
      fonction.classList.add('visible');
    }
    const etablissement = clone.querySelector('.etablissement-tag');
    if (contact.etablissement_label) {
      etablissement.textContent = contact.etablissement_label;
      etablissement.classList.add('visible');
      etablissement.addEventListener('click', () => onToggle('etablissement', contact.etablissement_label));
    }
    const email = clone.querySelector('.email');
    if (contact.Email) {
      email.textContent = contact.Email;
      const href = mailtoHref(contact.Email);
      if (href) email.href = href;
      email.classList.add('visible');
    }
    const tel = clone.querySelector('.tel');
    const phone = formatPhone(contact.numero_de_telephone);
    if (phone) {
      tel.textContent = `☎ ${phone}`;
      tel.classList.add('visible');
    }
    const tags = clone.querySelector('.card-tags');
    TAG_GROUPS.forEach(group => {
      const labels = labelsOf(contact, group.key);
      if (labels.length === 0) return;
      const section = document.createElement('section');
      section.className = 'tag-group';
      const title = document.createElement('h3');
      title.className = 'tag-group-title';
      title.textContent = group.label;
      title.style.color = group.color;
      section.appendChild(title);
      const values = document.createElement('div');
      values.className = 'tag-group-values';
      // Un groupe sans filtre (« Rôle PUI », specs.md) est un <span> non cliquable :
      // un bouton qui ne filtre rien induirait en erreur.
      const filterable = FILTERS.some(f => f.key === group.key);
      labels.forEach(value => {
        const tag = document.createElement(filterable ? 'button' : 'span');
        if (filterable) tag.type = 'button';
        tag.className = filterable ? `tag tag-${group.key}` : `tag tag-${group.key} tag-static`;
        tag.style.backgroundColor = group.color;
        tag.textContent = value;
        if (filterable) tag.addEventListener('click', () => onToggle(group.key, value));
        values.appendChild(tag);
      });
      section.appendChild(values);
      tags.appendChild(section);
    });
    grid.appendChild(clone);
  });
}
