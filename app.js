/* Annuaire PUI — version 0.9 stable avec corrections noms de colonnes
 * Révisions:
 * - Conserve tableToRows() et fetchTable() qui fonctionnent
 * - Conserve la structure onRecords qui marche
 * - Ajoute les corrections de noms de colonnes du commit 57de74d0
 * - Ajoute filtres Tâches et Établissement
 * - Réorganise 7 filtres: Actions / Tâches / Communautés / GT / Compétences / Instances / Établissement
 */

const FILTERS = [
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#ff9800' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'Competences', color: '#9c27b0' },
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'etablissement', label: 'Établissement', table: 'Etablissements', field: 'acronyme', color: '#147c72' }
];

const TAG_GROUPS = [
  { key: 'instances', label: 'Instances', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', color: '#f28a54' },
  { key: 'gt', label: 'GT', color: '#1ba99a' },
  { key: 'competences', label: 'Compétences', color: '#9c27b0' },
  { key: 'communautes', label: 'Communautés', color: '#d85b9d' },
  { key: 'taches', label: 'Tâches', color: '#ff9800' },
  { key: 'etablissement', label: 'Établissement', color: '#147c72' },
  { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }
];

let allContacts = [];
let referenceMaps = {};
let activeFilters = {};
let searchTerm = '';

FILTERS.forEach(f => {
  activeFilters[f.key] = new Set();
});

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '');
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

// ===== CONVERSION GRIST: Column-oriented → Row-oriented =====
function tableToRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table;
  
  const ids = Array.isArray(table.id) ? table.id : [];
  return ids.map((id, index) => {
    const row = { id };
    Object.keys(table).forEach(key => {
      if (key !== 'id' && Array.isArray(table[key])) {
        row[key] = table[key][index] ?? null;
      }
    });
    return row;
  });
}

// ===== CHARGER LES TABLES DE RÉFÉRENCE =====
async function fetchTable(tableName, labelField) {
  try {
    const table = await window.grist.docApi.fetchTable(tableName);
    const rows = tableToRows(table);
    const map = {};
    rows.forEach(row => {
      const label = text(row[labelField]);
      if (row.id !== null && row.id !== undefined && label) {
        map[String(row.id)] = label;
      }
    });
    referenceMaps[tableName] = map;
    console.info(`[REFS] ${tableName}: ${Object.keys(map).length} entrées`);
  } catch (error) {
    referenceMaps[tableName] = {};
    console.warn(`[REFS] Impossible de charger ${tableName}`, error);
  }
}

// ===== ENRICHIR LES CONTACTS =====
function enrich(contact) {
  const enriched = {
    ...contact,
    instances_labels: [],
    actions_labels: [],
    gt_labels: [],
    communautes_labels: [],
    taches_labels: [],
    competences_labels: [],
    etablissement_label: '',
    role_label: ''
  };

  const instanceIds = safeValues(contact.Instances);
  enriched.instances_labels = instanceIds
    .map(id => referenceMaps['Instances']?.[String(id)] || text(id))
    .filter(Boolean);

  const actionIds = safeValues(contact.Actions);
  enriched.actions_labels = actionIds
    .map(id => referenceMaps['Actions']?.[String(id)] || text(id))
    .filter(Boolean);

  const gtIds = safeValues(contact.GT);
  enriched.gt_labels = gtIds
    .map(id => referenceMaps['GT']?.[String(id)] || text(id))
    .filter(Boolean);

  const communauteIds = safeValues(contact.Communautee_s_);
  enriched.communautes_labels = communauteIds
    .map(id => referenceMaps['Communautees']?.[String(id)] || text(id))
    .filter(Boolean);

  const tachesIds = safeValues(contact.Taches);
  enriched.taches_labels = tachesIds
    .map(id => referenceMaps['Taches']?.[String(id)] || text(id))
    .filter(Boolean);

  const competences = [];
  for (let i = 1; i <= 15; i++) {
    const value = text(contact[`competences_${i}`]);
    if (value) competences.push(value);
  }
  enriched.competences_labels = competences;

  const etablissementId = contact.Etablissement;
  enriched.etablissement_label =
    (etablissementId && referenceMaps['Etablissements']?.[String(etablissementId)]) ||
    text(contact.Etablissement2) || '';

  const roleId = contact.Role_dans_le_PUI;
  enriched.role_label =
    (roleId && referenceMaps['Role_Dans_le_PUI']?.[String(roleId)]) ||
    text(roleId) || '';

  return enriched;
}

// ===== CRÉER L'UI DES FILTRES =====
function createFilterUI() {
  const container = document.getElementById('filtersContainer');
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

    const refMap = referenceMaps[filter.table] || {};
    const values = [...new Set(Object.values(refMap))].sort();

    values.forEach(value => {
      const option = document.createElement('label');
      option.className = 'filter-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = activeFilters[filter.key].has(value);
      checkbox.addEventListener('change', () => toggleFilter(filter.key, value));
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

function toggleFilter(filterKey, value) {
  if (!activeFilters[filterKey]) activeFilters[filterKey] = new Set();
  if (activeFilters[filterKey].has(value)) activeFilters[filterKey].delete(value);
  else activeFilters[filterKey].add(value);
  displayContacts();
}

function displayContacts() {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const term = searchTerm.toLocaleLowerCase('fr-FR');
  const filtered = allContacts.filter(contact => {
    if (term && ![contact.Nom, contact.Prenom].some(value => text(value).toLocaleLowerCase('fr-FR').includes(term))) return false;
    for (const filter of FILTERS) {
      const selected = activeFilters[filter.key];
      if (selected.size === 0) continue;
      const labels = filter.key === 'etablissement'
        ? (contact.etablissement_label ? [contact.etablissement_label] : [])
        : (contact[`${filter.key}_labels`] || []);
      if (!labels.some(label => selected.has(label))) return false;
    }
    return true;
  });

  const template = document.getElementById('cardTemplate');
  filtered.forEach(contact => {
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
      etablissement.addEventListener('click', () => toggleFilter('etablissement', contact.etablissement_label));
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
        tag.addEventListener('click', () => toggleFilter(group.key, value));
        values.appendChild(tag);
      });
      section.appendChild(values);
      tags.appendChild(section);
    });
    grid.appendChild(clone);
  });

  document.getElementById('resultCount').textContent =
    `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
  document.getElementById('emptyState').hidden = filtered.length !== 0;
}

document.getElementById('searchInput').addEventListener('input', event => {
  searchTerm = event.target.value.trim();
  displayContacts();
});

document.getElementById('resetFilters').addEventListener('click', () => {
  Object.values(activeFilters).forEach(set => set.clear());
  searchTerm = '';
  document.getElementById('searchInput').value = '';
  displayContacts();
});

window.grist.ready({ requiredAccess: 'read table' });

window.grist.onRecords(async records => {
  try {
    const rows = Array.isArray(records) ? records : (records?.records || []);
    console.log('[GRIST] Enregistrements reçus:', rows.length);

    const scopedRecords = rows.filter(r => {
      const p = r.perimetre_all;
      if (Array.isArray(p)) return p.length > 0;
      if (p === null || p === undefined) return false;
      return typeof p === 'string' ? p.trim() !== '' : true;
    });

    await Promise.all([
      fetchTable('Actions', 'Action'),
      fetchTable('Taches', 'taches'),
      fetchTable('Communautees', 'communaute'),
      fetchTable('GT', 'nom'),
      fetchTable('Competances', 'Competences'),
      fetchTable('Instances', 'nom_instance'),
      fetchTable('Etablissements', 'acronyme'),
      fetchTable('Role_Dans_le_PUI', 'Role')
    ]);

    allContacts = scopedRecords
      .map(enrich)
      .filter(c => c.Nom || c.Prenom);

    createFilterUI();
    displayContacts();
  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
});

document.addEventListener('click', () => {
  document.querySelectorAll('.filter.open').forEach(f => f.classList.remove('open'));
});




