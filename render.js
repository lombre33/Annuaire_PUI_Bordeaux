// Rendu DOM — pas de logique métier ici, uniquement de la construction d'éléments.

import { TAG_GROUPS, FILTERS } from './constants.js';

export function createFilterUI(container, referenceMaps, activeFilters, onToggle) {
  if (!container) return;
  container.innerHTML = '';

  FILTERS.forEach(filter => {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.innerHTML = `
      <span class="filter-dot"></span>
      <span>${filter.label}</span>
      <span class="chevron">▾</span>
    `;
    button.querySelector('.filter-dot').style.backgroundColor = filter.color;

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
    const values = [...new Set(Object.values(refMap))].sort();

    values.forEach(value => {
      const option = document.createElement('label');
      option.className = 'filter-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = activeFilters[filter.key].has(value);
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
    if (contact.numero_de_telephone) {
      tel.textContent = `☎ ${contact.numero_de_telephone}`;
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
      labels.forEach(value => {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = `tag tag-${group.key}`;
        tag.style.backgroundColor = group.color;
        tag.textContent = value;
        tag.addEventListener('click', () => onToggle(group.key, value));
        values.appendChild(tag);
      });
      section.appendChild(values);
      tags.appendChild(section);
    });
    grid.appendChild(clone);
  });
}
