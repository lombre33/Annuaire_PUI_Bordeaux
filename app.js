/* ============ CONFIG ============ */
const FILTERS = [
  { key: 'instances', label: 'Instances', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', color: '#f28a54' },
  { key: 'gts', label: 'GT', color: '#1ba99a' },
  { key: 'taches', label: 'Tâches', color: '#d79a25' },
  { key: 'competences', label: 'Compétences', color: '#6257d9' },
  { key: 'communautes', label: 'Communautés', color: '#d85b9d' }
];

// Les deux derniers groupes sont affichés sur les cartes mais ne sont pas
// des filtres dans l'interface (comme prévu par le cahier des charges).
const TAG_GROUPS = FILTERS.concat([
  { key: 'etablissement', label: 'Établissement', color: '#147c72' },
  { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }
]);

const activeFilters = Object.fromEntries(
  FILTERS.map(function (filter) { return [filter.key, new Set()]; })
);
let contacts = [];
let searchTerm = '';

console.log('[INIT] Démarrage du widget Annuaire PUI');
grist.ready({ requiredAccess: 'read table' });
console.log('[GRIST] Accès lecture demandé');

grist.onRecords(function (records) {
  console.log('[GRIST] Records reçus:', records.length);
  contacts = records.filter(hasPerimetre).map(normalizeRecord);
  console.log('[FILTERS] Records conservés avec perimetre_all:', contacts.length);
  render();
});

function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(function (item) {
      return item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '';
    });
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

function hasPerimetre(record) {
  return safeValues(record.perimetre_all).length > 0;
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/*
 * Les colonnes Reference/ReferenceList sont reçues comme objets Grist.
 * Ces helpers lisent uniquement les champs affichables des objets : aucun ID
 * de référence n'est utilisé comme libellé dans l'application.
 */
function referenceLabel(reference, field) {
  if (!reference || typeof reference !== 'object') return '';
  return text(reference[field]);
}

function referenceLabels(references, field) {
  return safeValues(references)
    .map(function (reference) { return referenceLabel(reference, field); })
    .filter(Boolean);
}

function normalizeRecord(record) {
  const competences = [];
  for (let i = 1; i <= 15; i += 1) {
    const value = text(record['competences_' + i]);
    if (value) competences.push(value);
  }

  return {
    id: record.id,
    nom: text(record.Nom),
    prenom: text(record.Prenom),
    fonction: text(record.fonction),
    email: text(record.Email),
    telephone: text(record.numero_de_telephone),
    perimetre: record.perimetre_all,
    // On conserve les objets de référence jusqu'à enrich(), sans IDs.
    instanceRefs: record.Instances,
    actionRefs: record.Actions,
    gtRefs: record.GT,
    tacheRefs: record.Taches,
    communauteRefs: record.Communautee_s_,
    etablissementRef: record.Etablissement,
    roleRef: record.Role_dans_le_PUI,
    competences: competences,
    etablissementFallback: text(record.Etablissement2)
  };
}

/*
 * Extrait les noms affichables directement depuis les objets de référence :
 * Instances[i].nom_instance, Actions[i].Action, GT[i].nom,
 * Taches[i].taches, Communautee_s_[i].communaute,
 * Etablissement.nom_complet et Role_dans_le_PUI.Role.
 */
function enrich(record) {
  return Object.assign({}, record, {
    instances: referenceLabels(record.instanceRefs, 'nom_instance'),
    actions: referenceLabels(record.actionRefs, 'Action'),
    gts: referenceLabels(record.gtRefs, 'nom'),
    taches: referenceLabels(record.tacheRefs, 'taches'),
    communautes: referenceLabels(record.communauteRefs, 'communaute'),
    etablissement: referenceLabel(record.etablissementRef, 'nom_complet') || record.etablissementFallback,
    role: referenceLabel(record.roleRef, 'Role')
  });
}

function facetValues(contact, key) {
  return contact[key] || [];
}

function collectFacets(list) {
  const facets = Object.fromEntries(
    FILTERS.map(function (filter) { return [filter.key, new Map()]; })
  );
  list.forEach(function (contact) {
    FILTERS.forEach(function (filter) {
      facetValues(contact, filter.key).forEach(function (value) {
        if (value) facets[filter.key].set(value, (facets[filter.key].get(value) || 0) + 1);
      });
    });
  });
  return facets;
}

function matches(contact) {
  const term = searchTerm.toLocaleLowerCase('fr-FR');
  if (term && ![contact.nom, contact.prenom].some(function (value) {
    return value.toLocaleLowerCase('fr-FR').includes(term);
  })) return false;

  // Les sélections sont des noms et sont comparées aux noms enrichis.
  return FILTERS.every(function (filter) {
    const selected = activeFilters[filter.key];
    return selected.size === 0 || facetValues(contact, filter.key).some(function (name) {
      return selected.has(name);
    });
  });
}

function render() {
  console.log('[RENDER] Mise à jour des filtres et des cartes');
  const enriched = contacts.map(enrich);
  renderFilters(collectFacets(enriched));
  const visible = enriched
    .filter(matches)
    .sort(function (a, b) {
      return a.nom.localeCompare(b.nom, 'fr-FR') || a.prenom.localeCompare(b.prenom, 'fr-FR');
    });
  renderActiveFilters();
  renderCards(visible);
  document.getElementById('resultCount').textContent = visible.length + ' contact' + (visible.length > 1 ? 's' : '');
  document.getElementById('emptyState').hidden = visible.length !== 0;
  console.log('[CARDS] Cartes affichées:', visible.length);
}

function renderFilters(facets) {
  console.log('[FILTERS] Rendu des 6 catégories');
  const container = document.getElementById('filtersContainer');
  container.innerHTML = '';
  FILTERS.forEach(function (filter) {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.dataset.category = filter.key;
    button.innerHTML = '<span class="filter-dot"></span><span>' + filter.label + '</span><span class="filter-count">' + activeFilters[filter.key].size + '</span><span class="chevron">▾</span>';
    button.querySelector('.filter-dot').style.backgroundColor = filter.color;

    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    menu.style.borderTopColor = filter.color;
    Array.from(facets[filter.key].entries())
      .sort(function (a, b) { return a[0].localeCompare(b[0], 'fr-FR'); })
      .forEach(function (entry) {
        const option = document.createElement('label');
        option.className = 'filter-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = activeFilters[filter.key].has(entry[0]);
        checkbox.addEventListener('change', function () { toggleFilter(filter.key, entry[0]); });
        const label = document.createElement('span');
        label.className = 'option-label';
        label.textContent = entry[0];
        const count = document.createElement('span');
        count.className = 'option-count';
        count.textContent = entry[1];
        option.append(checkbox, label, count);
        menu.appendChild(option);
      });

    button.addEventListener('click', function (event) {
      event.stopPropagation();
      document.querySelectorAll('.filter.open').forEach(function (item) {
        if (item !== wrapper) item.classList.remove('open');
      });
      wrapper.classList.toggle('open');
    });
    menu.addEventListener('click', function (event) { event.stopPropagation(); });
    wrapper.append(button, menu);
    container.appendChild(wrapper);
  });
}

function toggleFilter(key, value) {
  if (activeFilters[key].has(value)) activeFilters[key].delete(value);
  else activeFilters[key].add(value);
  render();
}

function renderActiveFilters() {
  const target = document.getElementById('activeFilters');
  target.innerHTML = '';
  FILTERS.forEach(function (filter) {
    activeFilters[filter.key].forEach(function (value) {
      const chip = document.createElement('span');
      chip.className = 'active-chip';
      chip.textContent = filter.label + ' : ' + value;
      target.appendChild(chip);
    });
  });
}

/* Affiche les 8 groupes de tags avec les noms harmonisés par enrich(). */
function renderCards(list) {
  const grid = document.getElementById('cardsGrid');
  grid.innerHTML = '';
  const template = document.getElementById('cardTemplate');

  list.forEach(function (contact) {
    const node = template.content.cloneNode(true);
    node.querySelector('.avatar').textContent = ((contact.prenom.charAt(0) || '') + (contact.nom.charAt(0) || '')).toUpperCase() || '?';
    node.querySelector('.name').textContent = (contact.prenom + ' ' + contact.nom).trim() || 'Sans nom';
    setText(node.querySelector('.fonction'), contact.fonction);
    setText(node.querySelector('.structure'), contact.etablissement);
    setText(node.querySelector('.tel'), contact.telephone ? '☎ ' + contact.telephone : '');

    const email = node.querySelector('.email');
    if (contact.email) {
      email.textContent = contact.email;
      email.href = 'mailto:' + contact.email;
      email.classList.add('visible');
    }

    const tags = node.querySelector('.card-tags');
    TAG_GROUPS.forEach(function (group) {
      const values = group.key === 'etablissement'
        ? (contact.etablissement ? [contact.etablissement] : [])
        : group.key === 'role'
          ? (contact.role ? [contact.role] : [])
          : contact[group.key];
      appendTagGroup(tags, group, values || []);
    });
    grid.appendChild(node);
  });
}

function appendTagGroup(container, group, list) {
  if (!list.length) return;
  const section = document.createElement('section');
  section.className = 'tag-group';
  const title = document.createElement('h3');
  title.className = 'tag-group-title';
  title.textContent = group.label;
  title.style.color = group.color;
  section.appendChild(title);
  const values = document.createElement('div');
  values.className = 'tag-group-values';
  list.forEach(function (value) {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = 'tag tag-' + group.key;
    tag.style.backgroundColor = group.color;
    tag.textContent = value;
    if (activeFilters[group.key]) tag.addEventListener('click', function () { toggleFilter(group.key, value); });
    values.appendChild(tag);
  });
  section.appendChild(values);
  container.appendChild(section);
}

function setText(element, value) {
  if (value) {
    element.textContent = value;
    element.classList.add('visible');
  }
}

document.getElementById('searchInput').addEventListener('input', function (event) {
  searchTerm = event.target.value.trim();
  render();
});
document.getElementById('resetFilters').addEventListener('click', function () {
  FILTERS.forEach(function (filter) { activeFilters[filter.key].clear(); });
  searchTerm = '';
  document.getElementById('searchInput').value = '';
  render();
});
document.addEventListener('click', function () {
  document.querySelectorAll('.filter.open').forEach(function (filter) { filter.classList.remove('open'); });
});
console.log('[INIT] ✅ App initialisé, en attente des données Grist');