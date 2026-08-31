/* ============ CONFIG ============ */
const CATEGORY_META = {
  competence: { label: 'Compétences', color: 'competence', weight: 2 },
  instance: { label: 'Instances', color: 'instance', weight: 3 },
  gt: { label: 'Groupes de travail', color: 'gt', weight: 2 },
  action: { label: 'Actions', color: 'action', weight: 2 },
  tache: { label: 'Tâches', color: 'tache', weight: 2 },
  communaute: { label: 'Communautés', color: 'communaute', weight: 2 },
  etablissement: { label: 'Établissement', color: 'etablissement', weight: 1 },
  role: { label: 'Rôle PUI', color: 'role', weight: 1 },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META);
const FIELD_FOR = {
  competence: 'competences', instance: 'instances', gt: 'gts',
  action: 'actions', tache: 'taches', communaute: 'communautes',
};

let rawRecords = [];
let contacts = [];
let searchTerm = '';
let referencesPromise = null;
const activeFilters = {};
CATEGORY_ORDER.forEach((category) => { activeFilters[category] = new Set(); });
const refTables = {};

grist.ready({ requiredAccess: 'read table' });
grist.onRecords(async (records) => {
  rawRecords = records.filter((record) => safeArray(record.perimetre_all).length > 0);
  console.log('[GRIST] Records reçus:', records.length, '| conservés via perimetre_all:', rawRecords.length);
  try { await loadRefTables(); } catch (error) { console.error('[REFS] Chargement global interrompu:', error); }
  contacts = rawRecords.map(normalizeRecord);
  render();
});

function normalizeId(value) {
  if (value === null || value === undefined || value === '' || value === 'Blank') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Grist serializes a ReferenceList as ['L', id1, id2, ...].
function safeArray(value) {
  if (value === null || value === undefined || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  const flattened = values.reduce((result, item) => result.concat(Array.isArray(item) ? item : [item]), []);
  return flattened.slice(0, 1)[0] === 'L' ? flattened.slice(1) : flattened;
}

function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }

function normalizeRecord(record) {
  const competences = [];
  for (let index = 1; index <= 15; index += 1) {
    const value = text(record['competences_' + index]);
    if (value) competences.push(value);
  }
  return {
    id: record.id, nom: text(record.Nom), prenom: text(record.Prenom), fonction: text(record.fonction), email: text(record.Email),
    tel: text(record.numero_de_telephone), structure: text(record.Etablissement2), avatar: text(record.Lien_avatar), competences,
    instanceIds: safeArray(record.Instances).map(normalizeId).filter((id) => id !== null),
    gtIds: safeArray(record.GT).map(normalizeId).filter((id) => id !== null),
    actionIds: safeArray(record.Actions).map(normalizeId).filter((id) => id !== null),
    tacheIds: safeArray(record.Taches).map(normalizeId).filter((id) => id !== null),
    communauteIds: safeArray(record.Communautee_s_).map(normalizeId).filter((id) => id !== null),
    etablissementId: normalizeId(record.Etablissement), roleId: normalizeId(record.Role_dans_le_PUI),
  };
}

function label(table, id) {
  const normalized = normalizeId(id);
  return normalized === null || !refTables[table] ? null : refTables[table].get(normalized) || null;
}

function enrich(contact) {
  return Object.assign({}, contact, {
    instances: contact.instanceIds.map((id) => label('Instances', id)).filter(Boolean),
    gts: contact.gtIds.map((id) => label('GT', id)).filter(Boolean), actions: contact.actionIds.map((id) => label('Actions', id)).filter(Boolean),
    taches: contact.tacheIds.map((id) => label('Taches', id)).filter(Boolean), communautes: contact.communauteIds.map((id) => label('Communautees', id)).filter(Boolean),
    etablissement: label('Etablissements', contact.etablissementId) || contact.structure, role: label('Role_Dans_le_PUI', contact.roleId),
  });
}

function valuesFor(contact, category) {
  if (category === 'etablissement') return contact.etablissement ? [contact.etablissement] : [];
  if (category === 'role') return contact.role ? [contact.role] : [];
  return contact[FIELD_FOR[category]] || [];
}

function collectFacetValues(enrichedContacts) {
  const facets = {}; CATEGORY_ORDER.forEach((category) => { facets[category] = new Map(); });
  enrichedContacts.forEach((contact) => CATEGORY_ORDER.forEach((category) => valuesFor(contact, category).forEach((value) => {
    const clean = text(value); if (clean) facets[category].set(clean, (facets[category].get(clean) || 0) + 1);
  })));
  console.log('[FACETS]', CATEGORY_ORDER.map((category) => category + '=' + facets[category].size).join(', '));
  return facets;
}

function matchesSearch(contact) {
  if (!searchTerm) return true; const term = searchTerm.toLowerCase();
  return [contact.nom, contact.prenom, contact.fonction, contact.structure, contact.etablissement].filter(Boolean).some((value) => String(value).toLowerCase().includes(term));
}
function matchesFilters(contact) {
  return CATEGORY_ORDER.every((category) => { const selected = activeFilters[category]; return selected.size === 0 || valuesFor(contact, category).some((value) => selected.has(value)); });
}
function relevanceScore(contact) {
  return CATEGORY_ORDER.reduce((score, category) => score + valuesFor(contact, category).filter((value) => activeFilters[category].has(value)).length * (CATEGORY_META[category].weight || 1), 0);
}

function render() {
  const enriched = contacts.map(enrich); const facets = collectFacetValues(enriched); renderFilterPanel(facets);
  const visible = enriched.filter(matchesSearch).filter(matchesFilters).sort((a, b) => relevanceScore(b) - relevanceScore(a) || a.nom.localeCompare(b.nom, 'fr'));
  renderCards(visible); const count = document.getElementById('resultCount'); if (count) count.textContent = visible.length + ' contact' + (visible.length > 1 ? 's' : '');
  const empty = document.getElementById('emptyState'); if (empty) empty.hidden = visible.length > 0;
}
function renderFilterPanel(facets) {
  const container = document.getElementById('filtersContainer'); if (!container) return; container.innerHTML = '';
  CATEGORY_ORDER.forEach((category) => {
    const entries = Array.from(facets[category].entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')); if (!entries.length) return;
    const group = document.createElement('div'); group.className = 'filter-group collapsed'; const title = document.createElement('div'); title.className = 'filter-group-title';
    title.textContent = CATEGORY_META[category].label + ' (' + entries.length + ') ▾'; title.addEventListener('click', () => group.classList.toggle('collapsed')); group.appendChild(title);
    const options = document.createElement('div'); options.className = 'filter-options';
    entries.forEach(([value, count]) => { const option = document.createElement('button'); option.type = 'button'; option.className = 'filter-option'; if (activeFilters[category].has(value)) option.classList.add('active');
      const labelEl = document.createElement('span'); labelEl.textContent = value; const countEl = document.createElement('span'); countEl.className = 'opt-count'; countEl.textContent = count; option.append(labelEl, countEl);
      option.addEventListener('click', () => { if (activeFilters[category].has(value)) activeFilters[category].delete(value); else activeFilters[category].add(value); render(); }); options.appendChild(option);
    }); group.appendChild(options); container.appendChild(group);
  });
}
function renderCards(list) {
  const grid = document.getElementById('cardsGrid'); const template = document.getElementById('cardTemplate'); if (!grid || !template) return; grid.innerHTML = '';
  list.forEach((contact) => { const node = template.content.cloneNode(true); const avatar = node.querySelector('.avatar');
    if (avatar) { if (contact.avatar) avatar.src = contact.avatar; else { const fallback = document.createElement('div'); fallback.className = 'avatar'; fallback.textContent = ((contact.prenom[0] || '') + (contact.nom[0] || '?')).toUpperCase(); avatar.replaceWith(fallback); } }
    node.querySelector('.name').textContent = (contact.prenom + ' ' + contact.nom).trim(); node.querySelector('.fonction').textContent = contact.fonction; node.querySelector('.structure').textContent = contact.etablissement || contact.structure;
    const email = node.querySelector('.email'); if (contact.email) { email.textContent = contact.email; email.href = 'mailto:' + contact.email; } else email.hidden = true;
    const tel = node.querySelector('.tel'); if (contact.tel) tel.textContent = '☎ ' + contact.tel; else tel.hidden = true;
    const tags = node.querySelector('.card-tags'); appendTags(tags, contact.competences, 'competence'); appendTags(tags, contact.instances, 'instance'); appendTags(tags, contact.gts, 'gt'); appendTags(tags, contact.actions, 'action'); appendTags(tags, contact.taches, 'tache'); appendTags(tags, contact.communautes, 'communaute'); appendTags(tags, contact.etablissement ? [contact.etablissement] : [], 'etablissement'); appendTags(tags, contact.role ? [contact.role] : [], 'role'); grid.appendChild(node);
  });
}
function appendTags(container, values, category) { if (!container) return; values.forEach((value) => { const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'tag tag-' + category; tag.textContent = value; tag.addEventListener('click', () => { activeFilters[category].add(value); render(); }); container.appendChild(tag); }); }

function loadRefTables() {
  if (referencesPromise) return referencesPromise;
  const specs = [['Instances', 'nom_instance'], ['GT', 'nom'], ['Actions', 'Action'], ['Taches', 'taches'], ['Communautees', 'communaute'], ['Etablissements', 'nom_complet'], ['Role_Dans_le_PUI', 'Role']];
  referencesPromise = Promise.all(specs.map(async ([table, field]) => { try { const data = await grist.docApi.fetchTable(table); const map = new Map(); (data.id || []).forEach((id, index) => { const key = normalizeId(id); const value = text((data[field] || [])[index]); if (key !== null && value) map.set(key, value); }); refTables[table] = map; console.log('[REFS] ' + table + ': ' + map.size + ' entrées'); } catch (error) { refTables[table] = new Map(); console.warn('[REFS] Échec ' + table, error); } }));
  return referencesPromise;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput')?.addEventListener('input', (event) => { searchTerm = event.target.value.trim(); render(); });
  document.getElementById('resetFilters')?.addEventListener('click', () => { CATEGORY_ORDER.forEach((category) => activeFilters[category].clear()); searchTerm = ''; const input = document.getElementById('searchInput'); if (input) input.value = ''; render(); });
  document.getElementById('toggleFilters')?.addEventListener('click', () => document.getElementById('filtersPanel')?.classList.toggle('open'));
});
