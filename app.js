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
  { key: 'communautes', label: 'Communautés', table: 'Communautes', field: 'communaute', color: '#4caf50' },
  { key: 'gt', label: 'Groupes de travail', table: 'GT', field: 'nom', color: '#2196f3' },
  { key: 'competences', label: 'Compétences', table: 'Competences', field: 'competence', color: '#9c27b0' },
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#607d8b' },
  { key: 'etablissement', label: 'Établissement', table: 'Etablissement', field: 'nom_etablissement', color: '#795548' }
];

let allContacts = [];
let referenceData = {};
let activeFilters = {};

// ===== OUTILS GRIST =====
function tableToRows(tableData) {
  if (!tableData || !tableData.id) return [];
  const cols = Object.keys(tableData).filter(k => k !== 'id');
  return tableData.id.map((id, i) => {
    const row = { id };
    cols.forEach(col => { row[col] = tableData[col]?.[i]; });
    return row;
  });
}

async function fetchTable(tableName, labelField) {
  try {
    const data = await grist.docApi.fetchTable(tableName);
    referenceData[tableName] = tableToRows(data);
    return referenceData[tableName];
  } catch (e) {
    console.warn(`Table ${tableName} non disponible:`, e);
    referenceData[tableName] = [];
    return [];
  }
}

function extractFieldFromReferences(value, fieldName) {
  if (value === null || value === undefined || value === '') return [];
  const ids = Array.isArray(value) ? value : [value];
  return ids.flatMap(id => {
    if (typeof id === 'object') return [id[fieldName] || id.name || id.label || ''];
    const found = Object.values(referenceData).flat().find(r => String(r.id) === String(id));
    return found ? [found[fieldName] || found.name || found.label || ''] : [String(id)];
  }).filter(Boolean);
}

function enrich(contact) {
  const c = { ...contact };
  c._filters = {};
  FILTERS.forEach(f => {
    c._filters[f.key] = extractFieldFromReferences(c[f.field], f.field);
  });
  return c;
}

// ===== INTERFACE =====
function createFilterUI(filter, values) {
  const container = document.getElementById(`filter-${filter.key}`);
  if (!container) return;
  container.innerHTML = '';
  values.sort((a, b) => a.localeCompare(b, 'fr')).forEach(value => {
    const label = document.createElement('label');
    label.className = 'filter-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.addEventListener('change', () => {
      if (!activeFilters[filter.key]) activeFilters[filter.key] = [];
      if (checkbox.checked) activeFilters[filter.key].push(value);
      else activeFilters[filter.key] = activeFilters[filter.key].filter(v => v !== value);
      displayContacts();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(value));
    container.appendChild(label);
  });
}

function displayContacts() {
  const container = document.getElementById('contacts');
  if (!container) return;
  const filtered = allContacts.filter(c => FILTERS.every(f => {
    const selected = activeFilters[f.key] || [];
    return selected.length === 0 || selected.some(v => c._filters[f.key].includes(v));
  }));
  container.innerHTML = '';
  filtered.forEach(c => {
    const card = document.createElement('article');
    card.className = 'contact-card';
    const name = c.Nom || c.nom || 'Sans nom';
    const fonction = c.Fonction || c.fonction || '';
    const email = c.Email || c.email || '';
    const telephone = c.Telephone || c.telephone || c.Tel || '';
    const organisation = c.Etablissement || c.etablissement || '';
    const tags = FILTERS.flatMap(f => c._filters[f.key] || []).filter(Boolean);
    card.innerHTML = `<h3>${name}</h3>${fonction ? `<p class="fonction">${fonction}</p>` : ''}${organisation ? `<p class="organisation">${organisation}</p>` : ''}${email ? `<p class="email"><a href="mailto:${email}">${email}</a></p>` : ''}${telephone ? `<p class="telephone">${telephone}</p>` : ''}<div class="tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>`;
    container.appendChild(card);
  });
  document.getElementById('resultCount').textContent = `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
  document.getElementById('emptyState').hidden = filtered.length !== 0;
}

// ===== INITIALISATION =====
window.grist.ready({ requiredAccess: 'read table' });

grist.onRecords((records) => {
  try {
    console.log('Enregistrements reçus:', records);

    if (!records || !records.records || records.records.length === 0) {
      console.warn('Aucun enregistrement');
      return;
    }

    const scopedRecords = records.records.filter(r => {
      const p = r.$perimetre_all;
      if (Array.isArray(p)) return p.length > 0;
      if (p === null || p === undefined) return false;
      return typeof p === 'string' ? p.trim() !== '' : true;
    });

    allContacts = scopedRecords.map(enrich);

    // Charger les tables de référence
    await Promise.all([
      fetchTable('Actions', 'Action'),
      fetchTable('Taches', 'taches'),
      fetchTable('Communautes', 'communaute'),
      fetchTable('GT', 'nom'),
      fetchTable('Competences', 'competence'),
      fetchTable('Instances', 'nom_instance'),
      fetchTable('Etablissement', 'nom_etablissement')
    ]);

    // Enrichir après chargement des références
    allContacts = allContacts.map(enrich);

    FILTERS.forEach(f => {
      const values = [...new Set(allContacts.flatMap(c => c._filters[f.key] || []))];
      createFilterUI(f, values);
    });

    displayContacts();
  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
});
