// Rendu DOM — pas de logique métier ici, uniquement de la construction d'éléments.

import { TAG_GROUPS, FILTERS } from './constants.js';
import { compareLabels, formatPhone, sortWithCheckedFirst } from './grist-data.js';

export function createFilterUI(container, referenceMaps, activeFilters, onToggle) {
  if (!container) return;
  container.innerHTML = '';

  FILTERS.forEach(filter => {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter';
    // Sert à retrouver ce menu depuis updateFilterUI() après un clic, sans
    // reconstruire tous les menus (ce qui fermerait ceux déjà ouverts).
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
      const term = search.value.trim().toLocaleLowerCase('fr-FR');
      menu.querySelectorAll('.filter-option').forEach(option => {
        const label = option.querySelector('.option-label').textContent.toLocaleLowerCase('fr-FR');
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
      option.append(checkbox, label);
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

// Après un clic qui coche/décoche un filtre (case du menu, badge
// établissement ou bulle de tag sur une carte — les trois passent par le
// même onToggle), remet à jour UNIQUEMENT le menu concerné : options cochées
// remontées en tête (chaque groupe re-trié alphabétiquement — ne pas se fier
// à l'ordre DOM existant, une valeur qui passe de cochée à décochée doit
// reprendre sa place alphabétique, pas rester "gelée" là où elle était) et
// badge de comptage sur le bouton. Ne reconstruit pas le DOM du menu : un
// autre menu ouvert, ou une recherche tapée dedans, ne doit pas être perturbé
// par le clic (cf. correctif 1.4.0 sur la reconstruction destructive).
export function updateFilterUI(container, filterKey, activeFilters) {
  const wrapper = container.querySelector(`[data-filter-key="${filterKey}"]`);
  if (!wrapper) return; // ex: tag "Rôle PUI", qui n'a pas de menu (non filtrable)

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
    // La case elle-même doit aussi être resynchronisée : un clic venu d'une
    // bulle de carte ne passe jamais par cette case, qui resterait sinon
    // décochée alors que le filtre est actif.
    option.querySelector('input[type="checkbox"]').checked = isSelected;
  });
  const checked = options.filter(option => option.classList.contains('checked')).sort(byLabel);
  const unchecked = options.filter(option => !option.classList.contains('checked')).sort(byLabel);
  // menu.appendChild() sur un nœud déjà enfant le déplace en dernière
  // position sans le recréer : les écouteurs (change sur la case) survivent.
  [...checked, ...unchecked].forEach(option => menu.appendChild(option));

  const badge = wrapper.querySelector('.filter-count');
  badge.textContent = String(selected.size);
  badge.hidden = selected.size === 0;
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
      email.href = `mailto:${contact.Email}`;
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
      const labels = contact[`${group.key}_labels`] || [];
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
      // Un groupe de tags sans filtre correspondant (ex: "role" — Rôle PUI
      // n'est volontairement pas un filtre, cf. specs.md) doit rendre un tag
      // non interactif : un <button> avec un clic qui ne fait rien (parce que
      // filterContacts() n'itère que sur FILTERS) induirait l'utilisateur en
      // erreur en ayant l'air cliquable sans jamais rien filtrer.
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
