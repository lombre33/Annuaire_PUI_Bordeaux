/* ============ CONFIG ============ */

const CATEGORY_ORDER = ['competence', 'instance', 'gt', 'action', 'tache', 'communaute', 'etablissement', 'role'];

const CATEGORY_META = {
  competence:    { label: 'Compétences',     color: '#8B5CF6', weight: 2 },
  instance:      { label: 'Instances',       color: '#3B82F6', weight: 3 },
  gt:            { label: 'Groupes de travail', color: '#06B6D4', weight: 2 },
  action:        { label: 'Actions',         color: '#10B981', weight: 2 },
  tache:         { label: 'Tâches',          color: '#F59E0B', weight: 2 },
  communaute:    { label: 'Communautés',     color: '#EF4444', weight: 2 },
  etablissement: { label: 'Établissement',   color: '#6366F1', weight: 1 },
  role:          { label: 'Rôle PUI',        color: '#EC4899', weight: 1 },
};

/* ============ STATE ============ */

let rawRecords = [];
let contacts = [];
let activeFilters = {};
CATEGORY_ORDER.forEach(k => activeFilters[k] = new Set());
let searchTerm = '';
let refTables = {
  Perimetres: {}, Instances: {}, GT: {}, Actions: {},
  Taches: {}, Communautees: {}, Etablissements: {}, Role_Dans_le_PUI: {}
};

/* ============ GRIST INIT ============ */

console.log('[INIT] App starting...');

if (typeof grist === 'undefined') {
  console.error('[GRIST] ❌ grist object is NOT available!');
} else {
  console.log('[GRIST] ✅ grist object is available');
  grist.ready({ requiredAccess: 'read table' });
  console.log('[GRIST] grist.ready() called');

  grist.onRecords((records) => {
    console.log(`[GRIST] 📥 onRecords() called with ${records.length} records`);
    rawRecords = records.filter(r => r.perimetre_all && r.perimetre_all.length > 0);
    console.log(`[FILTER] After backend filter: ${rawRecords.length} records remain`);
    contacts = rawRecords.map(normalizeRecord);
    console.log(`[NORMALIZE] After normalization: ${contacts.length} contacts`);
    loadRefTables();
  });
  console.log('[GRIST] grist.onRecords() registered');
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
  for (let i = 4; i <= 15; i++) {
    const v = r[`competence_${i}`];
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
    competences,
    perimetreIds: safeArray(r.perimetre_all),
    instanceIds: safeArray(r.Instances),
    gtIds: safeArray(r.GT),
    actionIds: safeArray(r.Actions),
    tacheIds: safeArray(r.Taches),
    communauteIds: safeArray(r.Communautees),
    etablissementId: r.Etablissement || null,
    roleId: r.Role_dans_le_PUI || null,
  };
}

/* ============ LOAD REFERENCE TABLES ============ */

async function loadRefTables() {
  console.log('[REFS] Loading reference tables...');
  const specs = [
    ['Perimetres', 'Perimetre'],
    ['Instances', 'nom_instance'],
    ['GT', 'nom'],
    ['Actions', 'Action'],
    ['Taches', 'taches'],
    ['Communautees', 'communaute'],
    ['Etablissements', 'nom_complet'],
    ['Role_Dans_le_PUI', 'Role'],
  ];

  await Promise.all(specs.map(async ([table, field]) => {
    try {
      console.log(`[REFS] Fetching ${table}...`);
      const data = await grist.docApi.fetchTable(table);
      const map = {};
      data.id.forEach((id, idx) => {
        map[id] = data[field] ? data[field][idx] : `#${id}`;
      });
      refTables[table] = map;
      console.log(`[REFS]   ✅ ${table}: ${Object.keys(map).length} entries`);
    } catch (e) {
      console.warn(`[REFS] ❌ Impossible de charger ${table}:`, e);
    }
  }));

  console.log('[RENDER] Starting render with', contacts.length, 'contacts');
  render();
}

function label(table, id) {
  if (!id) return null;
  return refTables[table] ? (refTables[table][id] || null) : null;
}

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

  enrichedContacts.forEach(c => {
    if (c.competences) c.competences.forEach(v => bump(facets.competence, v));
    if (c.instances) c.instances.forEach(v => bump(facets.instance, v));
    if (c.gts) c.gts.forEach(v => bump(facets.gt, v));
    if (c.actions) c.actions.forEach(v => bump(facets.action, v));
    if (c.taches) c.taches.forEach(v => bump(facets.tache, v));
    if (c.communautes) c.communautes.forEach(v => bump(facets.communaute, v));
    if (c.etablissement) bump(facets.etablissement, c.etablissement);
    if (c.role) bump(facets.role, c.role);
  });

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

    let values = [];
    if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
    else if (cat === 'role') values = c.role ? [c.role] : [];
    else {
      const fieldMap = {
        competence: 'competences', instance: 'instances', gt: 'gts',
        action: 'actions', tache: 'taches', communaute: 'communautes',
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

      let values = [];
      if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') values = c.role ? [c.role] : [];
      else {
        const fieldMap = {
          competence: 'competences', instance: 'instances', gt: 'gts',
          action: 'actions', tache: 'taches', communaute: 'communautes',
        };
        values = c[fieldMap[cat]] || [];
      }

      const matchCount = values.filter(v => selected.has(v)).length;
      score += matchCount * (CATEGORY_META[cat].weight || 1);
    });
  } else {
    score += (c.competences.length + c.instances.length + c.gts.length +
              c.actions.length + c.taches.length + c.communautes.length) * 0.1;
  }
  return score;
}

/* ============ RENDER ============ */

function render() {
  console.log('[RENDER] Starting render with', contacts.length, 'contacts');
  const enriched = contacts.map(enrich);
  console.log('[RENDER] After enrichment:', enriched.length, 'contacts');
  const facets = collectFacetValues(enriched);
  console.log('[FACETS] Collected facets:', Object.keys(facets));

  renderFilterBubbles(facets);
  renderActiveFilters();

  const filtered = enriched
    .filter(matchesSearch)
    .filter(matchesFilters);

  console.log('[FILTER] After filtering:', filtered.length, 'contacts match');

  const sorted = filtered.sort((a, b) => {
    const s = relevanceScore(b) - relevanceScore(a);
    if (s !== 0) return s;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });

  renderCards(sorted);

  const resultEl = document.getElementById('resultCount');
  if (resultEl) {
    resultEl.textContent = `${sorted.length} contact${sorted.length > 1 ? 's' : ''}`;
  }
  const emptyEl = document.getElementById('emptyState');
  if (emptyEl) {
    emptyEl.hidden = sorted.length > 0;
  }

  console.log('[RENDER] ✅ Render complete');
}

/* ============ RENDER FILTER BUBBLES ============ */

function renderFilterBubbles(facets) {
  console.log('[FILTERS] Rendering filter bubbles...');
  const container = document.getElementById('filterBubbles');
  if (!container) {
    console.log('[FILTERS] ❌ filterBubbles not found in DOM!');
    return;
  }

  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const values = [...facets[cat].entries()].sort((a, b) => b[1] - a[1]);
    if (values.length === 0) return;

    const activeCount = activeFilters[cat].size;

    // Créer la bulle
    const bubble = document.createElement('div');
    bubble.className = 'filter-bubble';
    bubble.style.borderColor = meta.color;
    bubble.style.color = meta.color;
    bubble.innerHTML = `
      ${meta.label}
      ${activeCount > 0 ? ` <span class="badge">${activeCount}</span>` : ''}
      <span class="chevron">▼</span>
    `;

    // Créer le dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    dropdown.style.borderTopColor = meta.color;

    values.forEach(([val, count]) => {
      const isChecked = activeFilters[cat].has(val);
      const option = document.createElement('label');
      option.className = 'filter-option';
      option.innerHTML = `
        <input type="checkbox" ${isChecked ? 'checked' : ''} data-cat="${cat}" data-val="${val}">
        <span>${val}</span>
        <span class="count">${count}</span>
      `;
      dropdown.appendChild(option);
    });

    // Event listener pour les checkboxes
    dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const cat = e.target.getAttribute('data-cat');
        const val = e.target.getAttribute('data-val');
        console.log('[FILTERS] toggleFilter called:', cat, val, e.target.checked);
        toggleFilter(cat, val);
      });
    });

    // Wrapper pour bulle + dropdown
    const wrapper = document.createElement('div');
    wrapper.className = 'filter-bubble-wrapper';
    wrapper.appendChild(bubble);
    wrapper.appendChild(dropdown);

    // Event listener pour la bulle
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[FILTERS] Bubble clicked:', cat);
      dropdown.classList.toggle('open');
    });

    container.appendChild(wrapper);
    console.log(`[FILTERS]   ✅ ${meta.label}: ${values.length} options`);
  });
}

function toggleFilter(cat, val) {
  const set = activeFilters[cat];
  if (set.has(val)) set.delete(val);
  else set.add(val);
  console.log('[FILTERS] After toggle, activeFilters:', cat, set.size);
  render();
}

/* ============ RENDER ACTIVE FILTERS ============ */

function renderActiveFilters() {
  const container = document.getElementById('activeFilters');
  if (!container) return;

  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const selected = activeFilters[cat];
    selected.forEach(val => {
      const chip = document.createElement('div');
      chip.className = 'active-filter-chip';
      chip.style.backgroundColor = meta.color;
      chip.innerHTML = `
        ${val}
        <button class="chip-close" data-cat="${cat}" data-val="${val}">✕</button>
      `;
      chip.querySelector('.chip-close').addEventListener('click', () => {
        toggleFilter(cat, val);
      });
      container.appendChild(chip);
    });
  });
}

/* ============ RENDER CARDS ============ */

function renderCards(list) {
  console.log('[CARDS] Rendering', list.length, 'cards');
  const grid = document.getElementById('cardsGrid');
  if (!grid) {
    console.log('[CARDS] ❌ cardsGrid not found in DOM!');
    return;
  }

  const tmpl = document.getElementById('cardTemplate');
  if (!tmpl) {
    console.log('[CARDS] ❌ cardTemplate not found in DOM!');
    return;
  }

  grid.innerHTML = '';

  list.forEach((c, idx) => {
    const node = tmpl.content.cloneNode(true);
    const card = node.querySelector('.contact-card');

    // Avatar placeholder
    const avatar = node.querySelector('.card-avatar');
    if (avatar) {
      const initials = `${(c.prenom || '').charAt(0)}${(c.nom || '').charAt(0)}`.toUpperCase();
      avatar.textContent = initials;
      avatar.style.backgroundColor = `hsl(${(idx * 60) % 360}, 70%, 60%)`;
    }

    // Infos basiques
    const nameEl = node.querySelector('.card-name');
    if (nameEl) nameEl.textContent = `${c.prenom} ${c.nom}`.trim();

    const fonctionEl = node.querySelector('.card-fonction');
    if (fonctionEl) fonctionEl.textContent = c.fonction || '';

    const structureEl = node.querySelector('.card-structure');
    if (structureEl) structureEl.textContent = c.structure || '';

    // Email
    const emailEl = node.querySelector('.card-email');
    if (emailEl) {
      if (c.email) {
        emailEl.textContent = c.email;
        emailEl.href = `mailto:${c.email}`;
      } else {
        emailEl.style.display = 'none';
      }
    }

    // Téléphone
    const telEl = node.querySelector('.card-tel');
    if (telEl) {
      if (c.tel) {
        telEl.textContent = `☎ ${c.tel}`;
      } else {
        telEl.style.display = 'none';
      }
    }

    // Tags
    const tagsWrap = node.querySelector('.card-tags');
    if (tagsWrap) {
      tagsWrap.innerHTML = '';

      const allTags = [
        ...c.competences.map(v => ({ val: v, cat: 'competence' })),
        ...c.instances.map(v => ({ val: v, cat: 'instance' })),
        ...c.gts.map(v => ({ val: v, cat: 'gt' })),
        ...c.actions.map(v => ({ val: v, cat: 'action' })),
        ...c.taches.map(v => ({ val: v, cat: 'tache' })),
        ...c.communautes.map(v => ({ val: v, cat: 'communaute' })),
      ];
      if (c.etablissement) allTags.push({ val: c.etablissement, cat: 'etablissement' });
      if (c.role) allTags.push({ val: c.role, cat: 'role' });

      allTags.forEach(({ val, cat }) => {
        const tag = document.createElement('button');
        tag.className = 'card-tag';
        tag.style.backgroundColor = CATEGORY_META[cat].color;
        tag.textContent = val;
        tag.addEventListener('click', () => {
          toggleFilter(cat, val);
        });
        tagsWrap.appendChild(tag);
      });
    }

    grid.appendChild(node);
  });

  console.log('[CARDS] ✅ Rendered', list.length, 'cards');
}

/* ============ EVENTS ============ */

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    console.log('[SEARCH] searchTerm changed to:', searchTerm);
    render();
  });
}

const resetBtn = document.getElementById('resetFilters');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    console.log('[FILTERS] Reset clicked');
    CATEGORY_ORDER.forEach(k => activeFilters[k].clear());
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    searchTerm = '';
    render();
  });
}

// Fermer dropdowns quand on clique ailleurs
document.addEventListener('click', () => {
  document.querySelectorAll('.filter-dropdown.open').forEach(dd => {
    dd.classList.remove('open');
  });
});

console.log('[INIT] ✅ App initialized, waiting for grist data...');
