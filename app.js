/* ============ CONFIG ============ */
const CATEGORY_ORDER = ['competence', 'instance', 'gt', 'action', 'tache', 'communaute', 'etablissement', 'role'];
const CATEGORY_META = {
  competence:    { label: 'Compétences',     color: '#8b5cf6' },
  instance:      { label: 'Instances',       color: '#06b6d4' },
  gt:            { label: 'GT',              color: '#ec4899' },
  action:        { label: 'Actions',         color: '#f59e0b' },
  tache:         { label: 'Tâches',          color: '#10b981' },
  communaute:    { label: 'Communautés',     color: '#6366f1' },
  etablissement: { label: 'Établissement',   color: '#14b8a6' },
  role:          { label: 'Rôle',            color: '#f97316' },
};

/* ============ STATE ============ */
let rawRecords = [];
let contacts = [];
let activeFilters = {};
CATEGORY_ORDER.forEach(k => activeFilters[k] = new Set());
let searchTerm = '';
let openDropdown = null;

/* ============ GRIST INIT ============ */
console.log('[INIT] App starting...');

if (typeof grist === 'undefined') {
  console.error('[GRIST] grist is NOT defined! Waiting...');
  let attempts = 0;
  const waitForGrist = setInterval(() => {
    attempts++;
    if (typeof grist !== 'undefined') {
      console.log('[GRIST] grist object is NOW available');
      clearInterval(waitForGrist);
      initGrist();
    }
    if (attempts > 50) {
      console.error('[GRIST] Timeout waiting for grist');
      clearInterval(waitForGrist);
    }
  }, 100);
} else {
  console.log('[GRIST] grist object is available');
  initGrist();
}

function initGrist() {
  console.log('[GRIST] grist.ready() called');
  grist.ready({
    requiredAccess: 'read table',
  });

  console.log('[GRIST] grist.onRecords() registered');
  grist.onRecords((records) => {
    console.log('[GRIST] onRecords() called with ' + records.length + ' records');
    rawRecords = records;
    const filtered = rawRecords.filter(r => {
      const perimetres = safeArray(r.perimetre_all);
      return perimetres.length > 0;
    });
    console.log('[FILTER] After backend filter: ' + filtered.length + ' records remain');
    contacts = filtered.map(normalizeRecord);
    console.log('[NORMALIZE] After normalization: ' + contacts.length + ' contacts');
    loadRefTables();
  });
}

/* ============ NORMALIZATION ============ */
function safeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== 0);
  }
  return [];
}

function normalizeRecord(r) {
  const competences = [];
  for (let i = 1; i <= 15; i++) {
    const v = r['competence_' + i] || r['competences_' + i];
    if (v && String(v).trim()) competences.push(String(v).trim());
  }

  return {
    id: r.id,
    nom: r.Nom || '',
    prenom: r.Prenom || '',
    fonction: r.fonction || '',
    email: r.Email || '',
    tel: r.numero_de_telephone || '',
    genre: r.Genre || '',
    structure: r.Etablissement2 || '',
    competences: competences,
    perimetreIds: safeArray(r.perimetre_all),
    instanceIds: safeArray(r.Instances),
    gtIds: safeArray(r.GT),
    actionIds: safeArray(r.Actions),
    tacheIds: safeArray(r.Taches),
    communauteIds: safeArray(r.Communautee_s),
    etablissementId: r.Etablissement || null,
    roleId: r.Role_dans_le_PUI || null,
  };
}

/* ============ RESOLUTION DES REFERENCES ============ */
let refTables = {
  Perimetres: {}, Instances: {}, GT: {}, Actions: {},
  Taches: {}, Communautees: {}, Etablissements: {}, Role_Dans_le_PUI: {}
};

async function loadRefTables() {
  console.log('[REFS] Loading reference tables...');
  const specs = [
    ['Instances', 'nom_instance'],
    ['GT', 'nom'],
    ['Actions', 'Action'],
    ['Taches', 'taches'],
    ['Communautees', 'communaute'],
    ['Etablissements', 'nom_complet'],
    ['Role_Dans_le_PUI', 'Role'],
  ];
  
  await Promise.all(specs.map(async ([table, field]) => {
    console.log('[REFS] Fetching ' + table + '...');
    try {
      const data = await grist.docApi.fetchTable(table);
      const map = {};
      data.id.forEach((id, idx) => { map[id] = data[field] ? data[field][idx] : '#' + id; });
      refTables[table] = map;
    } catch (e) {
      console.warn('[REFS] Could not load ' + table, e);
    }
  }));
  console.log('[REFS] Reference tables loaded');
  render();
}

function label(table, id) {
  if (!id) return null;
  return refTables[table] && refTables[table][id] ? refTables[table][id] : null;
}

function enrich(c) {
  return {
    id: c.id,
    nom: c.nom,
    prenom: c.prenom,
    fonction: c.fonction,
    email: c.email,
    tel: c.tel,
    genre: c.genre,
    structure: c.structure,
    competences: c.competences,
    perimetreIds: c.perimetreIds,
    instanceIds: c.instanceIds,
    gtIds: c.gtIds,
    actionIds: c.actionIds,
    tacheIds: c.tacheIds,
    communauteIds: c.communauteIds,
    etablissementId: c.etablissementId,
    roleId: c.roleId,
    instances: c.instanceIds.map(id => label('Instances', id)).filter(Boolean),
    gts: c.gtIds.map(id => label('GT', id)).filter(Boolean),
    actions: c.actionIds.map(id => label('Actions', id)).filter(Boolean),
    taches: c.tacheIds.map(id => label('Taches', id)).filter(Boolean),
    communautes: c.communauteIds.map(id => label('Communautees', id)).filter(Boolean),
    etablissement: label('Etablissements', c.etablissementId),
    role: label('Role_Dans_le_PUI', c.roleId),
  };
}

/* ============ FILTER PANEL CONSTRUCTION ============ */
function collectFacetValues(enrichedContacts) {
  const facets = {};
  CATEGORY_ORDER.forEach(cat => facets[cat] = new Map());

  enrichedContacts.forEach(c => {
    CATEGORY_ORDER.forEach(cat => {
      let values = [];
      if (cat === 'competence') values = c.competences || [];
      else if (cat === 'instance') values = c.instances || [];
      else if (cat === 'gt') values = c.gts || [];
      else if (cat === 'action') values = c.actions || [];
      else if (cat === 'tache') values = c.taches || [];
      else if (cat === 'communaute') values = c.communautes || [];
      else if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') values = c.role ? [c.role] : [];
      
      values.forEach(v => {
        facets[cat].set(v, (facets[cat].get(v) || 0) + 1);
      });
    });
  });
  return facets;
}

/* ============ FILTERING LOGIC ============ */
function matchesSearch(c) {
  if (!searchTerm) return true;
  const t = searchTerm.toLowerCase();
  return [c.nom, c.prenom, c.fonction, c.structure, c.etablissement]
    .filter(Boolean)
    .some(v => String(v).toLowerCase().includes(t));
}

function matchesFilters(c) {
  for (const cat of CATEGORY_ORDER) {
    const selected = activeFilters[cat];
    if (selected.size === 0) continue;

    let values = [];
    if (cat === 'competence') values = c.competences || [];
    else if (cat === 'instance') values = c.instances || [];
    else if (cat === 'gt') values = c.gts || [];
    else if (cat === 'action') values = c.actions || [];
    else if (cat === 'tache') values = c.taches || [];
    else if (cat === 'communaute') values = c.communautes || [];
    else if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
    else if (cat === 'role') values = c.role ? [c.role] : [];

    const hasAny = [...selected].some(v => values.includes(v));
    if (!hasAny) return false;
  }
  return true;
}

function relevanceScore(c) {
  let score = 0;
  const totalSelected = CATEGORY_ORDER.reduce((s, cat) => s + activeFilters[cat].size, 0);

  if (totalSelected > 0) {
    CATEGORY_ORDER.forEach(cat => {
      const selected = activeFilters[cat];
      if (selected.size === 0) return;
      
      let values = [];
      if (cat === 'competence') values = c.competences || [];
      else if (cat === 'instance') values = c.instances || [];
      else if (cat === 'gt') values = c.gts || [];
      else if (cat === 'action') values = c.actions || [];
      else if (cat === 'tache') values = c.taches || [];
      else if (cat === 'communaute') values = c.communautes || [];
      else if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') values = c.role ? [c.role] : [];

      const matches = [...selected].filter(v => values.includes(v)).length;
      score += matches * 10;
    });
    score += (Object.keys(c).length / 100);
  }
  return score;
}

/* ============ RENDER ============ */
function render() {
  console.log('[RENDER] Starting render with ' + contacts.length + ' contacts');
  const enriched = contacts.map(enrich);
  console.log('[RENDER] After enrichment: ' + enriched.length + ' contacts');
  
  const facets = collectFacetValues(enriched);
  console.log('[FACETS] Collected facets');

  renderFilterBubbles(facets);
  renderActiveFilters();

  const filtered = enriched
    .filter(matchesSearch)
    .filter(matchesFilters);

  const sorted = filtered.sort((a, b) => {
    const s = relevanceScore(b) - relevanceScore(a);
    if (s !== 0) return s;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });

  renderCards(sorted);
  
  const resultEl = document.getElementById('resultCount');
  if (resultEl) {
    resultEl.textContent = sorted.length + ' contact' + (sorted.length > 1 ? 's' : '');
  }
  
  const emptyEl = document.getElementById('emptyState');
  if (emptyEl) {
    emptyEl.hidden = sorted.length > 0;
  }
  console.log('[RENDER] Render complete - ' + sorted.length + ' contacts displayed');
}

/* ============ RENDER FILTER BUBBLES ============ */
function renderFilterBubbles(facets) {
  console.log('[FILTERS] Rendering filter bubbles...');
  const container = document.getElementById('filterCategories');
  if (!container) {
    console.error('[FILTERS] filterCategories not found in DOM');
    return;
  }
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const values = [...facets[cat].entries()].sort((a, b) => b[1] - a[1]);
    if (values.length === 0) return;

    const bubble = document.createElement('div');
    bubble.className = 'filter-category-bubble';

    const toggle = document.createElement('button');
    toggle.className = 'filter-category-toggle';
    toggle.setAttribute('data-category', cat);
    toggle.style.borderColor = meta.color;
    toggle.style.color = meta.color;

    const selectedCount = activeFilters[cat].size;
    toggle.innerHTML = meta.label + (selectedCount > 0 ? ' <span class="count">' + selectedCount + '</span>' : '') + ' <span style="font-size: 0.75rem; margin-left: 0.25rem;">▼</span>';

    toggle.addEventListener('click', () => toggleDropdown(cat, values, bubble, meta));
    bubble.appendChild(toggle);

    container.appendChild(bubble);
  });
}

/* ============ TOGGLE DROPDOWN ============ */
function toggleDropdown(cat, values, bubble, meta) {
  if (openDropdown === cat) {
    closeDropdown();
    return;
  }
  
  closeDropdown();
  openDropdown = cat;

  const dropdown = document.createElement('div');
  dropdown.className = 'filter-dropdown open';

  values.forEach(pair => {
    const value = pair[0];
    const count = pair[1];
    
    const option = document.createElement('div');
    option.className = 'filter-option';
    if (activeFilters[cat].has(value)) option.classList.add('selected');
    option.style.color = meta.color;

    const isSelected = activeFilters[cat].has(value);
    option.innerHTML = '<div class="filter-option-label"><div class="filter-option-checkbox" style="' + (isSelected ? 'background: ' + meta.color + '; border-color: ' + meta.color + ';' : '') + '"></div><span>' + value + '</span></div><div class="filter-option-count">' + count + '</div>';

    option.addEventListener('click', () => {
      toggleFilter(cat, value);
      renderFilterBubbles(collectFacetValues(contacts.map(enrich)));
      render();
    });

    dropdown.appendChild(option);
  });

  bubble.appendChild(dropdown);
}

function closeDropdown() {
  if (openDropdown) {
    const dropdown = document.querySelector('.filter-dropdown.open');
    if (dropdown) dropdown.remove();
    openDropdown = null;
  }
}

/* ============ RENDER ACTIVE FILTERS ============ */
function renderActiveFilters() {
  const container = document.getElementById('activeFiltersDisplay');
  if (!container) return;
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const values = [...activeFilters[cat]];
    values.forEach(value => {
      const chip = document.createElement('div');
      chip.className = 'active-filter-chip';
      chip.style.background = meta.color;
      chip.innerHTML = value + ' <button type="button">x</button>';
      chip.querySelector('button').addEventListener('click', () => {
        toggleFilter(cat, value);
        render();
      });
      container.appendChild(chip);
    });
  });
}

function toggleFilter(cat, val) {
  const set = activeFilters[cat];
  if (set.has(val)) set.delete(val);
  else set.add(val);
}

/* ============ RENDER CARDS ============ */
function renderCards(list) {
  const grid = document.getElementById('cardsGrid');
  const tmpl = document.getElementById('cardTemplate');
  
  if (!grid) {
    console.error('[CARDS] cardsGrid not found in DOM');
    return;
  }
  if (!tmpl) {
    console.error('[CARDS] cardTemplate not found in DOM');
    return;
  }
  
  console.log('[CARDS] Rendering ' + list.length + ' cards');
  grid.innerHTML = '';

  list.forEach(c => {
    const node = tmpl.content.cloneNode(true);
    const card = node.querySelector('.card');

    node.querySelector('.card-name').textContent = (c.prenom + ' ' + c.nom).trim();
    node.querySelector('.card-fonction').textContent = c.fonction || '';
    node.querySelector('.card-structure').textContent = c.structure || '';

    const emailEl = node.querySelector('.card-email');
    if (c.email) {
      emailEl.textContent = c.email;
      emailEl.href = 'mailto:' + c.email;
    } else {
      emailEl.style.display = 'none';
    }

    const telEl = node.querySelector('.card-tel');
    if (c.tel) {
      telEl.textContent = '☎ ' + c.tel;
    } else {
      telEl.style.display = 'none';
    }

    const tagsWrap = node.querySelector('.card-tags');
    appendTags(tagsWrap, c.competences, 'competence');
    appendTags(tagsWrap, c.instances, 'instance');
    appendTags(tagsWrap, c.gts, 'gt');
    appendTags(tagsWrap, c.actions, 'action');
    appendTags(tagsWrap, c.taches, 'tache');
    appendTags(tagsWrap, c.communautes, 'communaute');
    if (c.etablissement) appendTags(tagsWrap, [c.etablissement], 'etablissement');
    if (c.role) appendTags(tagsWrap, [c.role], 'role');

    grid.appendChild(node);
  });
}

function appendTags(wrap, values, category) {
  if (!values || values.length === 0) return;
  values.forEach(v => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.setAttribute('data-category', category);
    tag.textContent = v;
    tag.addEventListener('click', () => {
      toggleFilter(category, v);
      render();
    });
    wrap.appendChild(tag);
  });
}

/* ============ EVENTS ============ */
const searchEl = document.getElementById('searchInput');
if (searchEl) {
  searchEl.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    render();
  });
}

const resetEl = document.getElementById('resetFilters');
if (resetEl) {
  resetEl.addEventListener('click', () => {
    CATEGORY_ORDER.forEach(k => activeFilters[k].clear());
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    searchTerm = '';
    render();
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.filter-category-bubble')) {
    closeDropdown();
  }
});

console.log('[INIT] App initialization complete');