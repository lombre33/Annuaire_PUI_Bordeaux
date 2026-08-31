'use strict';

const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' }
];
const activeFilters = Object.fromEntries(FILTERS.map(function(filter) { return [filter.key, new Set()]; }));
const refMaps = { Instances: {}, Actions: {}, GT: {}, Communautees: {}, Etablissements: {}, Role_Dans_le_PUI: {} };
let contacts = [];
let searchTerm = '';

console.log('[INIT] Démarrage du widget Annuaire PUI');

grist.ready({ requiredAccess: 'read table' });
console.log('[GRIST] Accès lecture demandé');
grist.onRecords(function(records) {
  console.log('[GRIST] Records reçus:', records.length);
  contacts = records.map(normalizeRecord);
  render();
});

function values(value) {
  if (Array.isArray(value)) return value.filter(function(item) { return item !== 'L' && item !== null && item !== undefined && item !== 0; });
  return value === null || value === undefined || value === '' ? [] : [value];
}

function normalizeRecord(record) {
  return {
    id: record.id,
    nom: String(record.Nom || '').trim(),
    prenom: String(record.Prenom || '').trim(),
    fonction: String(record.fonction || '').trim(),
    email: String(record.Email || '').trim(),
    telephone: record.numero_de_telephone === null || record.numero_de_telephone === undefined ? '' : String(record.numero_de_telephone).trim(),
    etablissementId: record.Etablissement,
    etablissementFallback: String(record.Etablissement2 || '').trim(),
    instanceIds: values(record.Instances),
    actionIds: values(record.Actions),
    gtIds: values(record.GT),
    communauteIds: values(record.Communautee_s_),
    roleId: record.Role_dans_le_PUI
  };
}

function lookup(table, id) {
  if (id === null || id === undefined || id === '') return '';
  return refMaps[table][String(id)] || '';
}

function enrich(contact) {
  return Object.assign({}, contact, {
    instances: contact.instanceIds.map(function(id) { return lookup('Instances', id); }).filter(Boolean),
    actions: contact.actionIds.map(function(id) { return lookup('Actions', id); }).filter(Boolean),
    gts: contact.gtIds.map(function(id) { return lookup('GT', id); }).filter(Boolean),
    communautes: contact.communauteIds.map(function(id) { return lookup('Communautees', id); }).filter(Boolean),
    etablissement: lookup('Etablissements', contact.etablissementId) || contact.etablissementFallback,
    role: lookup('Role_Dans_le_PUI', contact.roleId)
  });
}

function facetValues(contact, key) { return contact[key] || []; }
function collectFacets(list) {
  const facets = Object.fromEntries(FILTERS.map(function(filter) { return [filter.key, new Map()]; }));
  list.forEach(function(contact) {
    FILTERS.forEach(function(filter) {
      facetValues(contact, filter.key).forEach(function(value) { facets[filter.key].set(value, (facets[filter.key].get(value) || 0) + 1); });
    });
  });
  return facets;
}

function matches(contact) {
  const term = searchTerm.toLocaleLowerCase('fr-FR');
  const nameMatches = !term || [contact.nom, contact.prenom].some(function(value) { return value.toLocaleLowerCase('fr-FR').includes(term); });
  if (!nameMatches) return false;
  return FILTERS.every(function(filter) {
    const selected = activeFilters[filter.key];
    return selected.size === 0 || facetValues(contact, filter.key).some(function(value) { return selected.has(value); });
  });
}

function render() {
  console.log('[RENDER] Mise à jour des filtres et des cartes');
  const enriched = contacts.map(enrich);
  renderFilters(collectFacets(enriched));
  const visible = enriched.filter(matches).sort(function(a, b) { return a.nom.localeCompare(b.nom, 'fr-FR') || a.prenom.localeCompare(b.prenom, 'fr-FR'); });
  renderActiveFilters();
  renderCards(visible);
  document.getElementById('resultCount').textContent = visible.length + ' contact' + (visible.length > 1 ? 's' : '');
  document.getElementById('emptyState').hidden = visible.length !== 0;
  console.log('[CARDS] Cartes affichées:', visible.length);
}

function renderFilters(facets) {
  const container = document.getElementById('filtersContainer');
  container.innerHTML = '';
  FILTERS.forEach(function(filter) {
    const wrapper = document.createElement('div'); wrapper.className = 'filter';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'filter-button';
    button.innerHTML = '<span class="filter-dot"></span><span>' + filter.label + '</span><span class="filter-count">' + activeFilters[filter.key].size + '</span><span class="chevron">▾</span>';
    button.querySelector('.filter-dot').style.backgroundColor = filter.color;
    const menu = document.createElement('div'); menu.className = 'filter-menu';
    const entries = Array.from(facets[filter.key].entries()).sort(function(a, b) { return a[0].localeCompare(b[0], 'fr-FR'); });
    entries.forEach(function(entry) {
      const label = document.createElement('label'); label.className = 'filter-option';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = activeFilters[filter.key].has(entry[0]);
      checkbox.addEventListener('change', function() { toggleFilter(filter.key, entry[0]); });
      const text = document.createElement('span'); text.className = 'option-label'; text.textContent = entry[0];
      const count = document.createElement('span'); count.className = 'option-count'; count.textContent = entry[1];
      label.append(checkbox, text, count); menu.appendChild(label);
    });
    button.addEventListener('click', function(event) { event.stopPropagation(); document.querySelectorAll('.filter.open').forEach(function(item) { if (item !== wrapper) item.classList.remove('open'); }); wrapper.classList.toggle('open'); });
    wrapper.append(button, menu); container.appendChild(wrapper);
  });
  console.log('[FILTERS] 4 catégories rendues');
}

function toggleFilter(key, value) { if (activeFilters[key].has(value)) activeFilters[key].delete(value); else activeFilters[key].add(value); render(); }
function renderActiveFilters() {
  const target = document.getElementById('activeFilters'); target.innerHTML = '';
  FILTERS.forEach(function(filter) { activeFilters[filter.key].forEach(function(value) { const chip = document.createElement('span'); chip.className = 'active-chip'; chip.textContent = filter.label + ' : ' + value; target.appendChild(chip); }); });
}

function renderCards(list) {
  const grid = document.getElementById('cardsGrid'); grid.innerHTML = '';
  const template = document.getElementById('cardTemplate');
  list.forEach(function(contact) {
    const node = template.content.cloneNode(true);
    const initials = ((contact.prenom.charAt(0) || '') + (contact.nom.charAt(0) || '')).toUpperCase() || '?';
    node.querySelector('.avatar').textContent = initials;
    node.querySelector('.name').textContent = (contact.prenom + ' ' + contact.nom).trim() || 'Sans nom';
    setText(node.querySelector('.fonction'), contact.fonction);
    setText(node.querySelector('.structure'), contact.etablissement);
    setText(node.querySelector('.tel'), contact.telephone ? '☎ ' + contact.telephone : '');
    const email = node.querySelector('.email');
    if (contact.email) { email.textContent = contact.email; email.href = 'mailto:' + contact.email; email.classList.add('visible'); }
    appendTags(node.querySelector('.card-tags'), contact.instances, 'instances', 'instance');
    appendTags(node.querySelector('.card-tags'), contact.actions, 'actions', 'action');
    appendTags(node.querySelector('.card-tags'), contact.gts, 'gt', 'gt');
    appendTags(node.querySelector('.card-tags'), contact.communautes, 'communautes', 'communaute');
    appendTags(node.querySelector('.card-tags'), contact.role ? [contact.role] : [], null, 'role');
    grid.appendChild(node);
  });
}
function setText(element, value) { if (value) { element.textContent = value; element.classList.add('visible'); } }
function appendTags(container, list, filterKey, cssName) {
  list.forEach(function(value) { const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'tag tag-' + cssName + (filterKey ? ' tag-clickable' : ''); tag.textContent = value; if (filterKey) tag.addEventListener('click', function() { toggleFilter(filterKey, value); }); container.appendChild(tag); });
}

document.getElementById('searchInput').addEventListener('input', function(event) { searchTerm = event.target.value.trim(); render(); });
document.getElementById('resetFilters').addEventListener('click', function() { FILTERS.forEach(function(filter) { activeFilters[filter.key].clear(); }); searchTerm = ''; document.getElementById('searchInput').value = ''; render(); });
document.addEventListener('click', function() { document.querySelectorAll('.filter.open').forEach(function(filter) { filter.classList.remove('open'); }); });

async function loadReferenceTables() {
  console.log('[REFS] Chargement des 6 tables de référence');
  const specs = FILTERS.concat([
    { table: 'Etablissements', field: 'nom_complet' },
    { table: 'Role_Dans_le_PUI', field: 'Role' }
  ]);
  await Promise.all(specs.map(async function(spec) {
    try {
      const data = await grist.docApi.fetchTable(spec.table);
      refMaps[spec.table] = {};
      (data.id || []).forEach(function(id, index) { refMaps[spec.table][String(id)] = String((data[spec.field] || [])[index] || '').trim(); });
    } catch (error) { console.warn('[REFS] Échec pour ' + spec.table, error); }
  }));
  console.log('[REFS] Tables de référence chargées');
  render();
}
loadReferenceTables();
