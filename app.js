/* Grist widget for contact directory filtering */

const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'gts', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#d79a25' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'Competences', color: '#6257d9' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' },
  { key: 'etablissement', label: 'Établissement', table: 'Etablissements', field: 'nom_complet', color: '#9b59b6' },
  { key: 'role', label: 'Rôle PUI', table: 'Role_Dans_le_PUI', field: 'Role', color: '#e74c3c' }
];

const TAG_GROUPS = [
  { key: 'instances', label: 'Instances', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', color: '#f28a54' },
  { key: 'gts', label: 'GT', color: '#1ba99a' },
  { key: 'taches', label: 'Tâches', color: '#d79a25' },
  { key: 'competences', label: 'Compétences', color: '#6257d9' },
  { key: 'communautes', label: 'Communautés', color: '#d85b9d' },
  { key: 'etablissement', label: 'Établissement', color: '#9b59b6' },
  { key: 'role', label: 'Rôle PUI', color: '#e74c3c' }
];

let grist;
let refMaps = {};
let activeFilters = {};
let contacts = [];

async function init() {
  grist = window.grist;
  
  FILTERS.forEach(f => {
    activeFilters[f.key] = new Set();
  });

  try {
    // Load all reference tables
    for (const filter of FILTERS) {
      const table = await grist.docApi.fetchTable(filter.table);
      refMaps[filter.key] = {};
      table.forEach(row => {
        const id = row.id;
        const label = row[filter.field] || '';
        refMaps[filter.key][id] = label;
      });
    }

    // Load Annuaire data and enrich it
    const annuaireTable = await grist.docApi.fetchTable('Annuaire');
    contacts = annuaireTable.map(enrich);

    // Initial render
    render();
  } catch (error) {
    console.error('Init error:', error);
  }
}

function enrich(record) {
  const lookup = (key, id) => refMaps[key] && refMaps[key][id] ? refMaps[key][id] : '';

  const c = {
    id: record.id,
    nom: record.Nom || '',
    prenom: record.Prénom || '',
    fonction: record.Fonction || '',
    email: record.Email || '',
    tel: record.Tel || '',
    etablissementId: record.Etablissement || null,
    roleId: record.Role_dans_le_PUI || null,
    perimetre: record.perimetre_all || 'Hors PUI',
    
    instanceIds: safeValues(record.Instances),
    actionIds: safeValues(record.Actions),
    gtIds: safeValues(record.GT),
    tacheId: safeValues(record.Taches),
    competenceValues: safeValues(record.competences_1)
      .concat(safeValues(record.competences_2))
      .concat(safeValues(record.competences_3))
      .concat(safeValues(record.competences_4))
      .concat(safeValues(record.competences_5))
      .concat(safeValues(record.competences_6))
      .concat(safeValues(record.competences_7))
      .concat(safeValues(record.competences_8))
      .concat(safeValues(record.competences_9))
      .concat(safeValues(record.competences_10))
      .concat(safeValues(record.competences_11))
      .concat(safeValues(record.competences_12))
      .concat(safeValues(record.competences_13))
      .concat(safeValues(record.competences_14))
      .concat(safeValues(record.competences_15))
      .filter(Boolean),
    communauteIds: safeValues(record.Communautee_s_)
  };

  // Resolve lazy properties
  c.instances = c.instanceIds.map(id => lookup('instances', id)).filter(Boolean);
  c.actions = c.actionIds.map(id => lookup('actions', id)).filter(Boolean);
  c.gts = c.gtIds.map(id => lookup('gts', id)).filter(Boolean);
  c.taches = c.tacheId.map(id => lookup('taches', id)).filter(Boolean);
  c.competences = c.competenceValues;
  c.communautes = c.communauteIds.map(id => lookup('communautes', id)).filter(Boolean);
  c.etablissement = c.etablissementId ? lookup('etablissement', c.etablissementId) : '';
  c.role = c.roleId ? lookup('role', c.roleId) : '';

  return c;
}

function safeValues(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

function render() {
  updateFacets();
  renderCards();
  updateActiveFiltersDisplay();
}

function updateFacets() {
  const container = document.getElementById('facets');
  container.innerHTML = '';

  FILTERS.forEach(filter => {
    const facetValues = new Set();
    contacts.forEach(c => {
      const values = c[filter.key];
      if (Array.isArray(values)) {
        values.forEach(v => facetValues.add(v));
      } else if (values) {
        facetValues.add(values);
      }
    });

    const facetDiv = document.createElement('div');
    facetDiv.className = 'facet';
    facetDiv.innerHTML = `<strong>${filter.label}</strong>`;

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'facet-buttons';

    Array.from(facetValues).sort().forEach(value => {
      const btn = document.createElement('button');
      btn.textContent = value;
      btn.className = 'facet-button';
      if (activeFilters[filter.key].has(value)) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => {
        toggleFilter(filter.key, value);
      });
      buttonsDiv.appendChild(btn);
    });

    facetDiv.appendChild(buttonsDiv);
    container.appendChild(facetDiv);
  });
}

function toggleFilter(key, value) {
  if (activeFilters[key].has(value)) {
    activeFilters[key].delete(value);
  } else {
    activeFilters[key].add(value);
  }
  render();
}

function renderCards() {
  const container = document.getElementById('cards');
  container.innerHTML = '';

  const filtered = contacts.filter(matches);

  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card';

    const avatar = document.createElement('div');
    avatar.className = 'card-avatar';
    const initials = (c.prenom.charAt(0) + c.nom.charAt(0)).toUpperCase();
    avatar.textContent = initials;
    card.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'card-info';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = `${c.prenom} ${c.nom}`;
    info.appendChild(name);

    const fonction = document.createElement('div');
    fonction.className = 'card-fonction';
    fonction.textContent = c.fonction || '';
    info.appendChild(fonction);

    const contact = document.createElement('div');
    contact.className = 'card-contact';
    contact.textContent = `📧 ${c.email}`;
    if (c.tel) contact.textContent += ` | 📱 ${c.tel}`;
    info.appendChild(contact);

    card.appendChild(info);

    const tags = document.createElement('div');
    tags.className = 'card-tags';
    TAG_GROUPS.forEach(group => {
      const values = group.key === 'etablissement' ? 
        (c.etablissement ? [c.etablissement] : []) :
        group.key === 'role' ? 
        (c.role ? [c.role] : []) :
        c[group.key] || [];
      
      appendTagGroup(tags, group, values);
    });
    card.appendChild(tags);

    container.appendChild(card);
  });
}

function appendTagGroup(container, group, values) {
  if (!values || values.length === 0) return;

  const groupDiv = document.createElement('div');
  groupDiv.className = 'tag-group';

  const label = document.createElement('span');
  label.className = 'tag-group-label';
  label.textContent = group.label + ':';
  label.style.color = group.color;
  groupDiv.appendChild(label);

  values.forEach(value => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = value;
    tag.style.borderColor = group.color;
    tag.style.color = group.color;
    tag.addEventListener('click', () => {
      toggleFilter(group.key, value);
    });
    groupDiv.appendChild(tag);
  });

  const separator = document.createElement('div');
  separator.className = 'tag-separator';
  groupDiv.appendChild(separator);

  container.appendChild(groupDiv);
}

function matches(contact) {
  for (const filter of FILTERS) {
    if (activeFilters[filter.key].size === 0) continue;

    const values = contact[filter.key];
    const matchesFilter = Array.isArray(values) ?
      values.some(v => activeFilters[filter.key].has(v)) :
      values && activeFilters[filter.key].has(values);

    if (!matchesFilter) return false;
  }
  return true;
}

function updateActiveFiltersDisplay() {
  const display = document.getElementById('active-filters');
  display.innerHTML = '';

  let hasFilters = false;
  FILTERS.forEach(filter => {
    if (activeFilters[filter.key].size > 0) {
      hasFilters = true;
      const values = Array.from(activeFilters[filter.key]);
      const text = `${filter.label}: ${values.join(', ')}`;
      const span = document.createElement('span');
      span.textContent = text;
      display.appendChild(span);
    }
  });

  if (hasFilters) {
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Réinitialiser';
    resetBtn.addEventListener('click', () => {
      FILTERS.forEach(f => activeFilters[f.key].clear());
      render();
    });
    display.appendChild(resetBtn);
  } else {
    display.textContent = 'Aucun filtre actif';
  }
}

window.addEventListener('load', init);
