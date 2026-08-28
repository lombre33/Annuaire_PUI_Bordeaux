/* ============ CONFIG ============ */
const CATEGORY_META = {
  competence: { label: 'Compétences', color: 'blue' },
  instance: { label: 'Instances', color: 'green' },
  gt: { label: 'GT', color: 'purple' },
  action: { label: 'Actions', color: 'orange' },
  tache: { label: 'Tâches', color: 'red' },
  communaute: { label: 'Communautés', color: 'pink' },
  etablissement: { label: 'Établissements', color: 'cyan' },
  role: { label: 'Rôle PUI', color: 'yellow' },
};

const CATEGORY_ORDER = [
  'competence', 'instance', 'gt', 'action', 'tache', 'communaute', 'etablissement', 'role'
];

/* ============ STATE ============ */
let rawRecords = [];
let contacts = [];
let activeFilters = {};
let searchTerm = '';
let refTables = {};

console.log('[INIT] App starting...');

CATEGORY_ORDER.forEach(k => activeFilters[k] = new Set());

/* ============ GRIST INIT ============ */
console.log('[GRIST] Waiting for grist object...');

if (typeof grist !== 'undefined') {
  console.log('[GRIST] ✅ grist object is available');
} else {
  console.error('[GRIST] ❌ grist object NOT found!');
}

grist.ready({
  requiredAccess: 'read table',
});

console.log('[GRIST] grist.ready() called');

grist.onRecords((records) => {
  console.log('[GRIST] 📥 onRecords() called with', records.length, 'records');
  
  rawRecords = records.filter(function(r) {
    const perimetres = safeArray(r.perimetre_all);
    return perimetres.length > 0;
  });
  
  console.log('[FILTER] After backend filter:', rawRecords.length, 'records remain');
  console.log('[DATA] First record sample:', rawRecords[0]);
  
  contacts = rawRecords.map(normalizeRecord);
  console.log('[NORMALIZE] After normalization:', contacts.length, 'contacts');
  console.log('[NORMALIZE] First contact sample:', contacts[0]);
  
  render();
});

console.log('[GRIST] grist.onRecords() registered');

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
    const v = r[`competences_${i}`];
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
    avatar: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%234a90e2" width="100" height="100"/%3E%3C/svg%3E',
    competences,
    perimetreIds: safeArray(r.perimetre_all),
    instanceIds: safeArray(r.Instances),
    gtIds: safeArray(r.GT),
    actionIds: safeArray(r.Action_3),
    tacheIds: safeArray(r.Tache_1),
    communauteIds: safeArray(r.Communaute_1),
    etablissementId: r.Etablissement,
    roleId: r.Role_dans_le_PUI,
  };
}

/* ============ REFERENCE RESOLUTION ============ */

function label(table, id) {
  if (!id || !refTables[table]) return '';
  const map = refTables[table];
  return map.get(id) || '';
}

async function loadRefTables() {
  console.log('[REFS] Loading reference tables...');
  
  const tables = [
    'Perimetres', 'Instances', 'GT', 'Actions', 'Taches',
    'Communautees', 'Etablissements', 'Role_Dans_le_PUI'
  ];

  await Promise.all(tables.map(async (table) => {
    try {
      console.log('[REFS] Fetching', table, '...');
      const data = await grist.docApi.fetchTable(table);
      console.log('[REFS]   → Got', data.records.length, 'records from', table);
      
      const map = new Map();
      data.records.forEach(rec => {
        map.set(rec.id, rec.Name || rec.name || rec.nom || rec.Nom || String(rec.id));
      });
      refTables[table] = map;
    } catch (e) {
      console.warn('[REFS] ❌ Failed to load', table, e);
    }
  }));

  console.log('[REFS] ✅ All reference tables loaded');
  contacts = rawRecords.map(normalizeRecord);
  render();
}

/* ============ ENRICHMENT ============ */

function enrich(c) {
  return {
    ...c,
    perimetres: c.perimetreIds.map(id => label('Perimetres', id)).filter(Boolean),
    instances: c.instanceIds.map(id => label('Instances', id)).filter(Boolean),
    gts: c.gtIds.map(id => label('GT', id)).filter(Boolean),
    actions: c.actionIds.map(id => label('Actions', id)).filter(Boolean),
    taches: c.tacheIds.map(id => label('Taches', id)).filter(Boolean),
    communautes: c.communauteIds.map(id => label('Communautees', id)).filter(Boolean),
    etablissement: label('Etablissements', c.etablissementId),
    role: label('Role_Dans_le_PUI', c.roleId),
  };
}

/* ============ FILTER COUNTING ============ */

function collectFacetValues(enrichedContacts) {
  const facets = {};
  CATEGORY_ORDER.forEach(cat => facets[cat] = new Map());

  const fieldFor = {
    competence: 'competences', instance: 'instances',
    gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
    etablissement: null, role: null,
  };

  enrichedContacts.forEach(c => {
    CATEGORY_ORDER.forEach(cat => {
      if (cat === 'etablissement') {
        if (c.etablissement) bump(facets.etablissement, c.etablissement);
        return;
      }
      if (cat === 'role') {
        if (c.role) bump(facets.role, c.role);
        return;
      }
      const arr = c[fieldFor[cat]] || [];
      arr.forEach(v => bump(facets[cat], v));
    });
  });

  console.log('[FACETS] Collected facets:', facets);
  return facets;
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
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

    let values;
    if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
    else if (cat === 'role') values = c.role ? [c.role] : [];
    else {
      const fieldMap = {
        competence: 'competences', instance: 'instances',
        gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
      };
      values = c[fieldMap[cat]] || [];
    }

    if (!values.some(v => selected.has(v))) return false;
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
      let values;
      if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') values = c.role ? [c.role] : [];
      else {
        const fieldMap = {
          competence: 'competences', instance: 'instances',
          gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
        };
        values = c[fieldMap[cat]] || [];
      }
      const matches = values.filter(v => selected.has(v)).length;
      score += matches * 10;
    });
  }

  const dataScore = Object.keys(c).filter(k => {
    const v = c[k];
    return v && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '');
  }).length;
  score += dataScore;

  return score;
}

/* ============ RENDER ============ */

function render() {
  console.log('[RENDER] Starting render with', contacts.length, 'contacts');
  
  const enriched = contacts.map(enrich);
  console.log('[RENDER] After enrichment:', enriched.length, 'contacts');
  console.log('[RENDER] First enriched contact:', enriched[0]);
  
  const facets = collectFacetValues(enriched);

  renderFilterPanel(facets);

  const filtered = enriched
    .filter(matchesSearch)
    .filter(matchesFilters);

  console.log('[FILTER] After filtering:', filtered.length, 'contacts match');

  const sorted = filtered.sort((a, b) => {
    const s = relevanceScore(b) - relevanceScore(a);
    if (s !== 0) return s;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });

  console.log('[SORT] After sorting:', sorted.length, 'contacts');
  
  renderCards(sorted);
  
  document.getElementById('resultCount').textContent =
    `${sorted.length} contact${sorted.length > 1 ? 's' : ''}`;
  document.getElementById('emptyState').hidden = sorted.length > 0;
  
  console.log('[RENDER] ✅ Render complete');
}

function renderFilterPanel(facets) {
  console.log('[FILTERS] Rendering filter panel...');
  const container = document.getElementById('filtersContainer');
  
  if (!container) {
    console.error('[FILTERS] ❌ filtersContainer not found in DOM!');
    return;
  }
  
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const values = [...facets[cat].entries()].sort((a, b) => b[1] - a[1]);
    
    console.log('[FILTERS]  -', cat, ':', values.length, 'options');
    
    if (values.length === 0) return;

    const group = document.createElement('div');
    group.className = 'filter-group';

    const title = document.createElement('div');
    title.className = 'filter-group-title';
    title.innerHTML = `<span class="dot" style="background:var(--accent-${meta.color})"></span>${meta.label}<span class="arrow">▾</span>`;
    title.onclick = () => {
      console.log('[FILTERS] Toggling', cat);
      group.classList.toggle('collapsed');
    };
    group.appendChild(title);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'filter-options';

    values.forEach(([val, count]) => {
      const label = document.createElement('label');
      label.className = 'filter-option';
      label.innerHTML = `
        <input type="checkbox" data-cat="${cat}" data-val="${val}">
        <span>${val} <small>(${count})</small></span>
      `;
      label.querySelector('input').addEventListener('change', (e) => {
        console.log('[FILTERS] Toggle', cat, val, 'checked=', e.target.checked);
        toggleFilter(cat, val);
      });
      optionsWrap.appendChild(label);
    });

    group.appendChild(optionsWrap);
    container.appendChild(group);
  });
  
  console.log('[FILTERS] ✅ Filter panel rendered');
}

function toggleFilter(cat, val) {
  console.log('[FILTERS] toggleFilter called:', cat, val);
  const set = activeFilters[cat];
  if (set.has(val)) {
    set.delete(val);
    console.log('[FILTERS]   → Removed from', cat);
  } else {
    set.add(val);
    console.log('[FILTERS]   → Added to', cat);
  }
  console.log('[FILTERS] Active filters now:', activeFilters);
  render();
}

function appendTags(container, values, cat) {
  if (!values || values.length === 0) return;
  const meta = CATEGORY_META[cat];
  values.forEach(v => {
    const tag = document.createElement('span');
    tag.className = 'card-tag';
    tag.style.borderColor = `var(--accent-${meta.color})`;
    tag.style.color = `var(--accent-${meta.color})`;
    tag.textContent = v;
    tag.onclick = () => {
      console.log('[TAG] Clicked tag:', cat, v);
      toggleFilter(cat, v);
    };
    container.appendChild(tag);
  });
}

function renderCards(list) {
  console.log('[CARDS] Rendering', list.length, 'cards');
  const grid = document.getElementById('cardsGrid');
  
  if (!grid) {
    console.error('[CARDS] ❌ cardsGrid not found in DOM!');
    return;
  }
  
  const tmpl = document.getElementById('cardTemplate');
  
  if (!tmpl) {
    console.error('[CARDS] ❌ cardTemplate not found in DOM!');
    return;
  }
  
  grid.innerHTML = '';

  list.forEach((c, idx) => {
    console.log('[CARDS] Creating card', idx + 1, ':', c.nom, c.prenom);
    
    const node = tmpl.content.cloneNode(true);
    const card = node.querySelector('.card');

    node.querySelector('.avatar').src = c.avatar;
    node.querySelector('.avatar').alt = `${c.prenom} ${c.nom}`;
    node.querySelector('.name').textContent = `${c.prenom} ${c.nom}`.trim();
    node.querySelector('.fonction').textContent = c.fonction || '';
    node.querySelector('.structure').textContent = c.structure || '';

    const emailEl = node.querySelector('.email');
    if (c.email) { emailEl.textContent = c.email; emailEl.href = `mailto:${c.email}`; }
    const telEl = node.querySelector('.tel');
    if (c.tel) telEl.textContent = `☎ ${c.tel}`;

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
  
  console.log('[CARDS] ✅ Cards rendered');
}

/* ============ EVENTS ============ */

console.log('[EVENTS] Setting up event listeners...');

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    console.log('[EVENTS] Search input changed:', e.target.value);
    searchTerm = e.target.value.trim();
    render();
  });
  console.log('[EVENTS] ✅ Search listener attached');
} else {
  console.error('[EVENTS] ❌ searchInput not found!');
}

const resetBtn = document.getElementById('resetFilters');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    console.log('[EVENTS] Reset filters clicked');
    CATEGORY_ORDER.forEach(k => activeFilters[k].clear());
    document.getElementById('searchInput').value = '';
    searchTerm = '';
    render();
  });
  console.log('[EVENTS] ✅ Reset listener attached');
} else {
  console.error('[EVENTS] ❌ resetFilters not found!');
}

const toggleBtn = document.getElementById('toggleFilters');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    console.log('[EVENTS] Toggle filters clicked');
    const panel = document.getElementById('filtersPanel');
    if (panel) {
      panel.classList.toggle('open');
      console.log('[EVENTS] Filters panel toggled. Open =', panel.classList.contains('open'));
    } else {
      console.error('[EVENTS] ❌ filtersPanel not found!');
    }
  });
  console.log('[EVENTS] ✅ Toggle listener attached');
} else {
  console.error('[EVENTS] ❌ toggleFilters not found!');
}

console.log('[EVENTS] ✅ All event listeners set up');

/* ============ BOOT ============ */

console.log('[BOOT] App initialization complete. Waiting for records...');
loadRefTables();
console.log('[BOOT] loadRefTables() called');