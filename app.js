/* Grist widget for contact directory filtering */

const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#48f' },
  { key: 'gts', label: 'GT', table: 'GT', field: 'nom', color: '#84f' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#f84' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'competance', color: '#8f4' },
  { key: 'communautes', label: 'Communautés', table: 'Communautes', field: 'communaute', color: '#f48' },
];

const TAG_GROUPS = [
  { key: 'instances', label: 'Instances' },
  { key: 'actions', label: 'Actions' },
  { key: 'gts', label: 'GT' },
  { key: 'taches', label: 'Tâches' },
  { key: 'competences', label: 'Compétences' },
  { key: 'communautes', label: 'Communautés' },
  { key: 'etablissement', label: 'Établissement' },
  { key: 'role', label: 'Rôle PUI' },
];

// Convert Grist column-oriented format {id: [...], col: [...]} to row-oriented [{id, col}, ...]
function tableToRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table; // Already row-oriented
  
  const id = table.id || [];
  const rows = [];
  for (let i = 0; i < id.length; i++) {
    const row = { id: id[i] };
    for (const [key, values] of Object.entries(table)) {
      if (key !== 'id' && Array.isArray(values)) {
        row[key] = values[i] || null;
      }
    }
    rows.push(row);
  }
  return rows;
}

// Fetch a reference table and create a lookup map
async function fetchTable(tableName, keyField, labelField) {
  const table = await window.grist.docApi.fetchTable(tableName);
  const rows = tableToRows(table);
  const map = {};
  rows.forEach(row => {
    if (row[keyField] && row[labelField]) {
      map[row[keyField]] = row[labelField];
    }
  });
  return map;
}

// Enrich records with label lookups
async function enrich(records) {
  const refMaps = {};
  
  for (const filter of FILTERS) {
    refMaps[filter.key] = await fetchTable(filter.table, 'id', filter.field);
  }
  
  // Additional single-value lookups
  refMaps.etablissement = await fetchTable('Etablissements', 'id', 'nom_complet');
  refMaps.role = await fetchTable('Role_Dans_le_PUI', 'id', 'Role');
  
  return records.map(record => {
    const enriched = { ...record };
    
    // Map array references (lists)
    ['instances', 'actions', 'gts', 'taches', 'competences', 'communautes'].forEach(key => {
      const refIds = record[key] || [];
      enriched[`${key}Labels`] = Array.isArray(refIds)
        ? refIds.map(id => refMaps[key][id] || id).filter(Boolean)
        : [];
    });
    
    // Map single references
    enriched.etablissementLabel = refMaps.etablissement[record.Etablissement] || record.Etablissement;
    enriched.roleLabel = refMaps.role[record.Role_dans_le_PUI] || record.Role_dans_le_PUI;
    
    return enriched;
  });
}

// Initialize filters and render
let allRecords = [];
let activeFilters = {};

window.grist.onRecords(async (records) => {
  allRecords = await enrich(records);
  initializeFilters();
  filterAndRender();
});

async function initializeFilters() {
  const filterContainer = document.getElementById('filters');
  filterContainer.innerHTML = '';
  
  for (const filter of FILTERS) {
    const uniqueValues = new Set();
    allRecords.forEach(record => {
      const labels = record[`${filter.key}Labels`] || [];
      labels.forEach(label => uniqueValues.add(label));
    });
    
    const filterDiv = document.createElement('div');
    filterDiv.className = 'filter-group';
    filterDiv.innerHTML = `<h3>${filter.label}</h3><div class="bubbles"></div>`;
    
    const bubblesDiv = filterDiv.querySelector('.bubbles');
    uniqueValues.forEach(value => {
      const bubble = document.createElement('button');
      bubble.className = 'bubble';
      bubble.style.backgroundColor = filter.color;
      bubble.textContent = value;
      bubble.onclick = () => toggleFilter(filter.key, value, bubble);
      bubblesDiv.appendChild(bubble);
    });
    
    filterContainer.appendChild(filterDiv);
  }
}

function toggleFilter(filterKey, value, element) {
  if (!activeFilters[filterKey]) {
    activeFilters[filterKey] = new Set();
  }
  
  if (activeFilters[filterKey].has(value)) {
    activeFilters[filterKey].delete(value);
    element.classList.remove('active');
  } else {
    activeFilters[filterKey].add(value);
    element.classList.add('active');
  }
  
  filterAndRender();
}

function filterAndRender() {
  const filtered = allRecords.filter(record => {
    for (const [key, values] of Object.entries(activeFilters)) {
      if (values.size === 0) continue; // No filter for this key
      
      const recordValues = record[`${key}Labels`] || [];
      const match = Array.from(values).some(v => recordValues.includes(v));
      if (!match) return false;
    }
    return true;
  });
  
  renderCards(filtered);
}

function renderCards(records) {
  const cardsContainer = document.getElementById('cards');
  cardsContainer.innerHTML = '';
  
  records.forEach(record => {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Avatar with initials
    const initials = (record.Nom || 'X')[0] + (record.Prenom || 'X')[0];
    const avatarColor = generateColor(record.Nom + record.Prenom);
    
    let tagsHtml = '';
    TAG_GROUPS.forEach(group => {
      const labels = record[`${group.key}Labels`] || [record[`${group.key}Label`]] || [];
      const validLabels = labels.filter(Boolean);
      if (validLabels.length > 0) {
        tagsHtml += `
          <div class="tag-category">
            <strong>${group.label}:</strong>
            ${validLabels.map(label => `
              <span class="tag clickable" onclick="applyFilter('${group.key}', '${label.replace(/'/g, "\\'")}')"
                    title="Filtrer par ${label}">${label}</span>
            `).join('')}
          </div>
        `;
      }
    });
    
    card.innerHTML = `
      <div class="card-header">
        <div class="avatar" style="background-color: ${avatarColor}">${initials}</div>
        <div class="header-info">
          <h3>${record.Nom} ${record.Prenom}</h3>
          <p class="fonction">${record.Fonction || ''}</p>
        </div>
      </div>
      <div class="card-contact">
        <p><strong>Email:</strong> ${record.Email || 'N/A'}</p>
        ${record.Tel ? `<p><strong>Tél:</strong> ${record.Tel}</p>` : ''}
      </div>
      <div class="card-tags">
        ${tagsHtml}
      </div>
    `;
    
    cardsContainer.appendChild(card);
  });
}

function applyFilter(filterKey, value) {
  if (!activeFilters[filterKey]) {
    activeFilters[filterKey] = new Set();
  }
  activeFilters[filterKey].add(value);
  filterAndRender();
  initializeFilters(); // Update bubble states
}

function generateColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

window.grist.ready();
