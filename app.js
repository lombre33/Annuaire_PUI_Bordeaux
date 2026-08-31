/* ============ CONFIG ============ */
(function() {
const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#d79a25' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'Competences', color: '#6257d9' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' }
];
const TAG_GROUPS = FILTERS.concat([{ key: 'etablissement', label: 'Établissement', color: '#147c72' }, { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }]);

/* ============ INITIALIZATION ============ */
window.grist.ready({ requiredAccess: 'read table' });
window.grist.onRecords(async function(records) {
  const enrichedRecords = await Promise.all(records.map(enrich));
  renderUI(enrichedRecords);
});

async function enrich(record) {
  const refMaps = {};
  for (const f of FILTERS) {
    refMaps[f.key] = await fetchTable(f.table, f.field);
  }
  refMaps['etablissement'] = await fetchTable('Etablissements', 'nom_complet');
  refMaps['role'] = await fetchTable('Role_Dans_le_PUI', 'Role');
  return {
    ...record,
    instances: safeValues(record.Instances).map(id => refMaps['instances'].get(id) || ''),
    actions: safeValues(record.Actions).map(id => refMaps['actions'].get(id) || ''),
    gt: safeValues(record.GT).map(id => refMaps['gt'].get(id) || ''),
    taches: safeValues(record.Taches).map(id => refMaps['taches'].get(id) || ''),
    competences: Array.from({length: 15}, (_, i) => record[`competences_${i+1}`] || '').filter(Boolean),
    communautes: safeValues(record.Communautee_s_).map(id => refMaps['communautes'].get(id) || ''),
    etablissement: refMaps['etablissement'].get(record.Etablissement) || '',
    role: refMaps['role'].get(record.Role_dans_le_PUI) || ''
  };
}

async function fetchTable(tableName, fieldName) {
  const table = await window.grist.docApi.fetchTable(tableName);
  const map = new Map();
  table.forEach(row => map.set(row.id, row[fieldName]));
  return map;
}

function safeValues(val) {
  return Array.isArray(val) ? val : (val ? [val] : []);
}

/* ============ UI RENDERING ============ */
function renderUI(records) {
  const facets = collectFacets(records);
  const container = document.getElementById('container');
  container.innerHTML = '';
  const filterBar = document.createElement('div');
  filterBar.id = 'filter-bar';
  FILTERS.forEach(f => {
    const values = Array.from(facets[f.key].keys()).sort();
    const div = createFilterBubbles(f, values, records);
    filterBar.appendChild(div);
  });
  container.appendChild(filterBar);
  renderCards(records, {});
}

function collectFacets(list) {
  const facets = Object.fromEntries(FILTERS.map(f => [f.key, new Map()]));
  list.forEach(record => {
    FILTERS.forEach(f => {
      safeValues(record[f.key.charAt(0).toUpperCase() + f.key.slice(1)]).forEach(v => {
        facets[f.key].set(v, (facets[f.key].get(v) || 0) + 1);
      });
    });
  });
  return facets;
}

function createFilterBubbles(filter, values, records) {
  const div = document.createElement('div');
  div.className = 'filter-group';
  const label = document.createElement('strong');
  label.textContent = filter.label + ':';
  div.appendChild(label);
  values.forEach(v => {
    if (!v) return;
    const bubble = document.createElement('button');
    bubble.className = 'bubble';
    bubble.style.backgroundColor = filter.color;
    bubble.textContent = v;
    bubble.onclick = () => filterCards(records, filter.key, v);
    div.appendChild(bubble);
  });
  return div;
}

function filterCards(records, filterKey, value) {
  const filtered = records.filter(r => safeValues(r[filterKey]).includes(value));
  renderCards(filtered, {});
}

function renderCards(records, filters) {
  const container = document.getElementById('container');
  const cardsContainer = document.getElementById('cards') || document.createElement('div');
  cardsContainer.id = 'cards';
  cardsContainer.innerHTML = '';
  records.forEach(record => {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="avatar">${getInitials(record['Nom Prénom'] || '')}</div>
        <div class="basic-info">
          <h3>${record['Nom Prénom'] || 'N/A'}</h3>
          <p class="fonction">${record.Fonction || ''}</p>
        </div>
      </div>
      <div class="card-body">
        <p><strong>Email:</strong> ${record.Email || 'N/A'}</p>
        ${record.Tel ? `<p><strong>Tel:</strong> ${record.Tel}</p>` : ''}
        <div class="tags-section">
          ${TAG_GROUPS.map(g => {
            const values = safeValues(record[g.key]).filter(Boolean);
            return values.length ? `<div class="tag-group"><strong>${g.label}:</strong> ${values.map(v => `<span class="tag" style="background-color:${g.color}">${v}</span>`).join('')}</div>` : '';
          }).join('')}
        </div>
      </div>
    `;
    cardsContainer.appendChild(card);
  });
  if (!document.getElementById('cards')) container.appendChild(cardsContainer);
  else document.getElementById('cards').replaceWith(cardsContainer);
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
})();