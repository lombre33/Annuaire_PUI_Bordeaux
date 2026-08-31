/* Annuaire PUI — version fusionnée stable pour Grist
 * - tableToRows() convertit les réponses column-oriented de docApi.fetchTable().
 * - onRecords reçoit les lignes de la table Annuaire et ne clone jamais les objets Grist.
 * - Les cartes utilisent uniquement le template HTML (cloneNode sur le template, pas sur les records).
 */

const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' },
  { key: 'role', label: 'Rôle PUI', table: 'Role_Dans_le_PUI', field: 'Role', color: '#8b5fc4' }
];

const TAG_GROUPS = [
  ...FILTERS.filter(f => f.key !== 'role'),
  { key: 'etablissement', label: 'Établissement', color: '#147c72' },
  { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }
];

const activeFilters = Object.fromEntries(FILTERS.map(f => [f.key, new Set()]));
// L'établissement est affiché et filtrable depuis une carte, sans ajouter un 6e menu.
activeFilters.etablissement = new Set();

const refMaps = Object.create(null);
let contacts = [];
let searchTerm = '';
let referencesLoaded = false;

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '');
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

function hasPerimetre(record) {
  return safeValues(record && record.perimetre_all).length > 0;
}

// Grist docApi renvoie normalement {id: [...], Colonne: [...]}.
// La fonction accepte aussi une réponse déjà orientée lignes.
function tableToRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table;
  const ids = Array.isArray(table.id) ? table.id : [];
  return ids.map((id, index) => {
    const row = { id };
    Object.keys(table).forEach(key => {
      if (key !== 'id' && Array.isArray(table[key])) row[key] = table[key][index] ?? null;
    });
    return row;
  });
}

async function loadReferenceTable(tableName, labelField) {
  try {
    const rows = tableToRows(await window.grist.docApi.fetchTable(tableName));
    const map = Object.create(null);
    rows.forEach(row => {
      const label = text(row[labelField]);
      if (row.id !== null && row.id !== undefined && label) map[String(row.id)] = label;
    });
    refMaps[tableName] = map;
    console.info(`[REFS] ${tableName}: ${Object.keys(map).length} entrées`);
  } catch (error) {
    // Une table secondaire indisponible ne doit pas empêcher les cartes de s'afficher.
    refMaps[tableName] = Object.create(null);
    console.warn(`[REFS] Impossible de charger ${tableName}`, error);
  }
}

async function loadReferenceTables() {
  if (referencesLoaded) return;
  await Promise.all(FILTERS.map(f => loadReferenceTable(f.table, f.field)));
  await loadReferenceTable('Etablissements', 'nom_complet');
  referencesLoaded = true;
}

function lookup(tableName, id) {
  if (id === null || id === undefined || id === '') return '';
  return refMaps[tableName]?.[String(id)] || '';
}

function normalizeRecord(record) {
  const competences = [];
  for (let i = 1; i <= 15; i += 1) {
    const value = text(record[`competences_${i}`]);
    if (value) competences.push(value);
  }
  return {
    id: record.id,
    nom: text(record.Nom),
    prenom: text(record.Prenom),
    fonction: text(record.fonction),
    email: text(record.Email),
    telephone: text(record.numero_de_telephone),
    etablissementId: record.Etablissement,
    etablissementFallback: text(record.Etablissement2),
    instanceIds: safeValues(record.Instances),
    actionIds: safeValues(record.Actions),
    gtIds: safeValues(record.GT),
    communauteIds: safeValues(record.Communautee_s_),
    roleId: record.Role_dans_le_PUI,
    competences
  };
}

function enrich(contact) {
  return {
    ...contact,
    instances: contact.instanceIds.map(id => lookup('Instances', id) || text(id)).filter(Boolean),
    actions: contact.actionIds.map(id => lookup('Actions', id) || text(id)).filter(Boolean),
    gt: contact.gtIds.map(id => lookup('GT', id) || text(id)).filter(Boolean),
    communautes: contact.communauteIds.map(id => lookup('Communautees', id) || text(id)).filter(Boolean),
    etablissement: lookup('Etablissements', contact.etablissementId) || contact.etablissementFallback,
    role: lookup('Role_Dans_le_PUI', contact.roleId) || text(contact.roleId)
  };
}

function valuesFor(contact, key) {
  if (key === 'etablissement' || key === 'role') return contact[key] ? [contact[key]] : [];
  return contact[key] || [];
}

function collectFacets(list) {
  const facets = Object.fromEntries(FILTERS.map(f => [f.key, new Map()]));
  FILTERS.forEach(f => Object.values(refMaps[f.table] || {}).forEach(label => label && facets[f.key].set(label, 0)));
  list.forEach(contact => FILTERS.forEach(f => valuesFor(contact, f.key).forEach(value => {
    if (!facets[f.key].has(value)) facets[f.key].set(value, 0);
    facets[f.key].set(value, facets[f.key].get(value) + 1);
  })));
  return facets;
}

function matches(contact) {
  const term = searchTerm.toLocaleLowerCase('fr-FR');
  if (term && ![contact.nom, contact.prenom].some(v => v.toLocaleLowerCase('fr-FR').includes(term))) return false;
  return [...FILTERS, { key: 'etablissement' }].every(f => {
    const selected = activeFilters[f.key];
    return !selected || selected.size === 0 || valuesFor(contact, f.key).some(value => selected.has(value));
  });
}

function render() {
  const enriched = contacts.map(enrich);
  renderFilters(collectFacets(enriched));
  const visible = enriched.filter(matches).sort((a, b) => a.nom.localeCompare(b.nom, 'fr-FR') || a.prenom.localeCompare(b.prenom, 'fr-FR'));
  renderActiveFilters();
  renderCards(visible);
  document.getElementById('resultCount').textContent = `${visible.length} contact${visible.length > 1 ? 's' : ''}`;
  document.getElementById('emptyState').hidden = visible.length !== 0;
}

function renderFilters(facets) {
  const container = document.getElementById('filtersContainer');
  container.replaceChildren();
  FILTERS.forEach(f => {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-button';
    button.textContent = f.label;
    const menu = document.createElement('div');
    menu.className = 'filter-menu';
    menu.style.borderTopColor = f.color;
    facets[f.key].forEach((count, label) => {
      const option = document.createElement('label');
      option.className = 'filter-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = activeFilters[f.key].has(label);
      checkbox.addEventListener('change', () => toggleFilter(f.key, label));
      const name = document.createElement('span');
      name.className = 'option-label';
      name.textContent = label;
      const countEl = document.createElement('span');
      countEl.className = 'option-count';
      countEl.textContent = count;
      option.append(checkbox, name, countEl);
      menu.appendChild(option);
    });
    button.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.filter.open').forEach(el => { if (el !== wrapper) el.classList.remove('open'); });
      wrapper.classList.toggle('open');
    });
    wrapper.append(button, menu);
    container.appendChild(wrapper);
  });
}

function toggleFilter(key, value) {
  const set = activeFilters[key];
  if (set.has(value)) set.delete(value); else set.add(value);
  render();
}

function renderActiveFilters() {
  const target = document.getElementById('activeFilters');
  target.replaceChildren();
  FILTERS.concat({ key: 'etablissement', label: 'Établissement' }).forEach(f => {
    activeFilters[f.key].forEach(value => {
      const chip = document.createElement('span');
      chip.className = 'active-chip';
      chip.textContent = `${f.label} : ${value}`;
      target.appendChild(chip);
    });
  });
}

function renderCards(list) {
  const grid = document.getElementById('cardsGrid');
  grid.replaceChildren();
  const template = document.getElementById('cardTemplate');
  list.forEach(contact => {
    // Seul le <template> DOM est cloné. Les enregistrements Grist restent des données.
    const fragment = template.content.cloneNode(true);
    fragment.querySelector('.avatar').textContent = `${contact.prenom.charAt(0)}${contact.nom.charAt(0)}`.toUpperCase() || '?';
    fragment.querySelector('.name').textContent = `${contact.prenom} ${contact.nom}`.trim() || 'Sans nom';
    setText(fragment.querySelector('.fonction'), contact.fonction);
    setText(fragment.querySelector('.structure'), contact.etablissement);
    setText(fragment.querySelector('.tel'), contact.telephone ? `☎ ${contact.telephone}` : '');
    const email = fragment.querySelector('.email');
    if (contact.email) {
      email.textContent = contact.email;
      email.href = `mailto:${contact.email}`;
      email.classList.add('visible');
    }
    const tags = fragment.querySelector('.card-tags');
    TAG_GROUPS.forEach(group => appendTagGroup(tags, group, valuesFor(contact, group.key)));
    grid.appendChild(fragment);
  });
}

function appendTagGroup(container, group, list) {
  const unique = [...new Set(list.filter(Boolean))];
  if (!unique.length) return;
  const section = document.createElement('section');
  section.className = 'tag-group';
  const title = document.createElement('h3');
  title.className = 'tag-group-title';
  title.textContent = group.label;
  title.style.color = group.color;
  const values = document.createElement('div');
  values.className = 'tag-group-values';
  unique.forEach(value => {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = `tag tag-${group.key}`;
    tag.style.backgroundColor = group.color;
    tag.textContent = value;
    tag.addEventListener('click', () => toggleFilter(group.key, value));
    values.appendChild(tag);
  });
  section.append(title, values);
  container.appendChild(section);
}

function setText(element, value) {
  if (value) {
    element.textContent = value;
    element.classList.add('visible');
  }
}

document.getElementById('searchInput').addEventListener('input', event => {
  searchTerm = event.target.value.trim();
  render();
});

document.getElementById('resetFilters').addEventListener('click', () => {
  Object.values(activeFilters).forEach(set => set.clear());
  searchTerm = '';
  document.getElementById('searchInput').value = '';
  render();
});

document.addEventListener('click', () => document.querySelectorAll('.filter.open').forEach(f => f.classList.remove('open')));

window.grist.ready({ requiredAccess: 'read table' });
window.grist.onRecords(async records => {
  const rows = Array.isArray(records) ? records : (records?.records || []);
  console.info('[GRIST] Records reçus:', rows.length);
  const scopedRecords = rows.filter(record => {
    const perimeter = record && record.$perimetre_all;
    return Array.isArray(perimeter)
      ? perimeter.some(value => value !== null && value !== undefined && String(value).trim() !== '')
      : perimeter !== null && perimeter !== undefined && String(perimeter).trim() !== '';
  });
  contacts = scopedRecords.map(normalizeRecord);
  await loadReferenceTables();
  render();
});
