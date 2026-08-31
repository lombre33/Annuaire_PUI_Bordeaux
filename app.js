/* ============ CONFIG ============ */
const CATEGORY_ORDER = ['competence', 'instance', 'gt', 'action', 'tache', 'communaute', 'etablissement', 'role'];

const CATEGORY_META = {
  competence: { label: 'Compétences', color: '#f59e0b' },
  instance: { label: 'Instances', color: '#3b82f6' },
  gt: { label: 'GT', color: '#10b981' },
  action: { label: 'Actions', color: '#ef4444' },
  tache: { label: 'Tâches', color: '#8b5cf6' },
  communaute: { label: 'Communautés', color: '#f97316' },
  etablissement: { label: 'Établissement', color: '#8b5cf6' },
  role: { label: 'Rôle', color: '#06b6d4' },
};

const refTables = {};
const refRows = {};
const facetOptions = {};

function normalizeId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

// Grist ReferenceList values are commonly encoded as ['L', id1, id2, ...].
function referenceIds(value) {
  if (!Array.isArray(value)) return value == null || value === '' ? [] : [normalizeId(value)];
  const values = value.flat(Infinity);
  return (values[0] === 'L' ? values.slice(1) : values)
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(normalizeId);
}

/* ============ STATE ============ */
let rawRecords = [];
let contacts = [];
let activeFilters = {};
let searchTerm = '';

CATEGORY_ORDER.forEach(k => activeFilters[k] = new Set());

/* ============ GRIST INIT ============ */
console.log('[INIT] Initialisation du widget Annuaire');

if (typeof grist === 'undefined') {
  console.error('[GRIST] ❌ grist object NOT available');
} else {
  console.log('[GRIST] ✅ grist object available');
  
  grist.ready({
    requiredAccess: 'read table',
  });
  console.log('[GRIST] grist.ready() called');

  grist.onRecords((records) => {
    console.log('[GRIST] Reçu', records.length, 'enregistrements bruts');
    rawRecords = records;
    contacts = rawRecords
      .map(normalizeRecord)
      .filter(c => c.perimetreIds && c.perimetreIds.length > 0);
    console.log('[GRIST] Après normalisation et filtrage:', contacts.length, 'contacts');
    loadRefTables();
  });
  console.log('[GRIST] grist.onRecords() registered');
}

/* ============ NORMALIZATION ============ */
function safeArray(val) {
  if (Array.isArray(val)) return val.flat();
  if (val) return [val];
  return [];
}

function normalizeRecord(r) {
  const competences = [
    r.competence_4, r.competence_5, r.competence_6, r.competence_7,
    r.competence_8, r.competence_9, r.competence_10, r.competence_11,
    r.competence_12, r.competence_13, r.competence_14, r.competence_15
  ].filter(Boolean);

  return {
    id: r.id,
    prenom: r.Prenom || '',
    nom: r.Nom || '',
    email: r.Email || '',
    fonction: r.fonction || '',
    tel: r.numero_de_telephone || '',
    structure: r.Etablissement2 || r.Etablissement_nom || '',
    competences,
    perimetreIds: referenceIds(r.perimetre_all),
    instanceIds: referenceIds(r.Instances),
    gtIds: referenceIds(r.GT),
    actionIds: referenceIds(r.Actions),
    tacheIds: referenceIds(r.Taches),
    communauteIds: referenceIds(r.Communautee_s_),
    etablissementId: r.Etablissement || null,
    roleId: r.Role_dans_le_PUI || null,
  };
}

function defaultAvatar() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="70" height="70"><rect width="70" height="70" rx="35" fill="#4f46e5" opacity="0.1"/><text x="50%" y="55%" text-anchor="middle" font-size="28" fill="#4f46e5" font-family="sans-serif" font-weight="bold">?</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/* ============ LOAD REFERENCE TABLES ============ */
function chooseLabelField(data, preferred) {
  const keys = Object.keys(data || {}).filter(k => k !== 'id');
  return [preferred, 'nom', 'Nom', 'label', 'name', 'communaute', 'Action', 'taches']
    .find(k => k && Array.isArray(data[k])) || keys[0];
}

async function fetchReference(table, preferred, aliases = []) {
  for (const tableName of [table, ...aliases]) {
    try {
      const data = await grist.docApi.fetchTable(tableName);
      const field = chooseLabelField(data, preferred);
      const rows = (data.id || []).map((id, idx) => ({
        id: normalizeId(id),
        label: String(data[field]?.[idx] ?? '').trim(),
      })).filter(row => row.label);
      refRows[tableName] = rows;
      refTables[tableName] = Object.fromEntries(rows.map(row => [row.id, row.label]));
      console.log('[REFS] Chargé', tableName, 'colonne', field, ':', rows.length, 'entrées');
      return { table: tableName, field, rows };
    } catch (e) {
      console.warn('[REFS] Impossible de charger', tableName, e);
    }
  }
  return null;
}

async function loadRefTables() {
  const specs = [
    ['Perimetres', 'Perimetre'],
    ['Instances', 'nom_instance'],
    ['GT', 'nom', ['Groupes_de_travail']],
    ['Actions', 'Action'],
    ['Taches', 'taches'],
    ['Communautees', 'communaute', ['Communautes', 'Communaute_s_']],
    ['Etablissements', 'nom_complet'],
    ['Role_Dans_le_PUI', 'Role'],
  ];
  await Promise.all(specs.map(([table, field, aliases]) => fetchReference(table, field, aliases || [])));

  // Competances is the exact table name in this document (not "Competences").
  // It is used as the competence source of truth when available; otherwise the
  // free-text competence_* columns in Annuaire are aggregated below.
  const competenceRef = await fetchReference('Competences', 'Competences', ['Competances']);
  refRows.Competences = competenceRef?.rows || [];
  refTables.Competences = Object.fromEntries(refRows.Competences.map(row => [row.id, row.label]));
  console.log('[REFS] Source compétences:', competenceRef ? `table ${competenceRef.table}` : 'colonnes Annuaire');
  render();
}

function label(table, id) {
  if (!refTables[table]) return null;
  return refTables[table][id] || null;
}

function enrich(c) {
  return {
    ...c,
    avatar: defaultAvatar(),
    competences: c.competences.map(v => String(v).trim()).filter(Boolean),
    instances: c.instanceIds.map(id => label('Instances', id)).filter(Boolean),
    gts: c.gtIds.map(id => label('GT', id)).filter(Boolean),
    actions: c.actionIds.map(id => label('Actions', id)).filter(Boolean),
    taches: c.tacheIds.map(id => label('Taches', id)).filter(Boolean),
    communautes: c.communauteIds.map(id => label('Communautees', id)).filter(Boolean),
    etablissement: label('Etablissements', c.etablissementId) || c.structure || '',
    role: label('Role_Dans_le_PUI', c.roleId),
  };
}

/* ============ FILTER COUNTING ============ */
function contactValues(c, cat) {
  const fieldMap = {
    instance: 'instanceIds', gt: 'gtIds', action: 'actionIds',
    tache: 'tacheIds', communaute: 'communauteIds', competence: 'competences',
  };
  if (cat === 'etablissement') return c.etablissementId ? [normalizeId(c.etablissementId)] : [];
  if (cat === 'role') return c.roleId ? [normalizeId(c.roleId)] : [];
  return (c[fieldMap[cat]] || []).map(v => cat === 'competence' ? String(v).trim() : normalizeId(v)).filter(Boolean);
}

function collectFacetValues(enrichedContacts) {
  const facets = {};
  CATEGORY_ORDER.forEach(cat => facets[cat] = new Map());
  const refConfig = {
    instance: 'Instances', gt: 'GT', action: 'Actions', tache: 'Taches',
    communaute: 'Communautees', etablissement: 'Etablissements', role: 'Role_Dans_le_PUI',
  };

  CATEGORY_ORDER.forEach(cat => {
    if (cat === 'competence') {
      const competenceRows = refRows.Competences || [];
      if (competenceRows.length) {
        competenceRows.forEach(row => facets[cat].set(row.id, { label: row.label, count: 0 }));
        enrichedContacts.forEach(c => contactValues(c, cat).forEach(value => {
          const row = competenceRows.find(r => r.label === value);
          if (row) facets[cat].get(row.id).count++;
        }));
        facetOptions[cat] = facets[cat];
        console.log('[FACETS]', cat, competenceRows.length, 'options depuis table Competances');
      } else {
        enrichedContacts.forEach(c => contactValues(c, cat).forEach(value => {
          const entry = facets[cat].get(value) || { label: value, count: 0 };
          entry.count++;
          facets[cat].set(value, entry);
        }));
        facetOptions[cat] = facets[cat];
        console.log('[FACETS]', cat, facets[cat].size, 'options depuis colonnes Annuaire competence_*');
      }
      return;
    }
    const table = refConfig[cat];
    const rows = refRows[table] || [];
    rows.forEach(row => facets[cat].set(row.id, { label: row.label, count: 0 }));
    enrichedContacts.forEach(c => contactValues(c, cat).forEach(id => {
      if (facets[cat].has(id)) facets[cat].get(id).count++;
    }));
    facetOptions[cat] = facets[cat];
    console.log('[FACETS]', cat, facets[cat].size, 'options depuis table', table);
  });
  return facets;
}

/* ============ FILTERING LOGIC ============ */
function matchesSearch(c) {
  if (!searchTerm) return true;
  const t = searchTerm.toLowerCase();
  return [c.nom, c.prenom, c.fonction, c.structure]
    .filter(Boolean)
    .some(v => String(v).toLowerCase().includes(t));
}

function matchesFilters(c) {
  for (const cat of CATEGORY_ORDER) {
    const selected = activeFilters[cat];
    if (selected.size === 0) continue;

    const values = contactValues(c, cat);
    const options = facetOptions[cat] || new Map();
    const labelsToIds = new Map([...options].map(([id, option]) => [option.label, id]));
    const normalizedValues = values.map(value => labelsToIds.get(value) ?? value);
    if (!normalizedValues.some(v => selected.has(v))) return false;
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
          competence: 'competences', instance: 'instances', gt: 'gts',
          action: 'actions', tache: 'taches', communaute: 'communautes',
        };
        values = c[fieldMap[cat]] || [];
      }

      const matches = values.filter(v => selected.has(v)).length;
      score += matches * 10;
    });
  }

  const dataRichness = [
    c.instances?.length || 0,
    c.gts?.length || 0,
    c.actions?.length || 0,
    c.taches?.length || 0,
    c.communautes?.length || 0,
  ].reduce((a, b) => a + b, 0);
  score += dataRichness;

  return score;
}

/* ============ RENDER ============ */
function render() {
  console.log('[RENDER] Début du rendu');
  const enriched = contacts.map(enrich);
  const facets = collectFacetValues(enriched);

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
  updateResultCount(sorted.length);
  console.log('[RENDER] Fin - affichage de', sorted.length, 'contacts');
}

function renderFilterBubbles(facets) {
  console.log('[FILTERS] Rendu des bulles de filtres');
  const container = document.getElementById('filterBubbles');
  if (!container) {
    console.error('[FILTERS] ❌ filterBubbles not found in DOM!');
    return;
  }
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const values = [...facets[cat].entries()].sort((a, b) => b[1].count - a[1].count);
    if (values.length === 0) return;

    const bubble = document.createElement('div');
    bubble.className = 'filter-bubble';

    const activeCount = activeFilters[cat].size;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.category = cat;
    btn.className = 'filter-bubble-btn' + (activeCount > 0 ? ' active' : '');
    btn.innerHTML = `
      <span>${meta.label}</span>
      ${activeCount > 0 ? `<span class="filter-badge">${activeCount}</span>` : ''}
    `;

    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    if (activeCount > 0) dropdown.classList.add('open');

    values.forEach(([val, data]) => {
      const option = document.createElement('label');
      option.className = 'filter-option';
      option.innerHTML = `
        <input type="checkbox" ${activeFilters[cat].has(val) ? 'checked' : ''}>
        <span class="filter-option-label">${data.label}</span>
        <span class="filter-option-count">${data.count}</span>
      `;
      option.querySelector('input').addEventListener('change', () => {
        toggleFilter(cat, val);
      });
      dropdown.appendChild(option);
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
      btn.classList.toggle('active');
    });

    bubble.appendChild(btn);
    bubble.appendChild(dropdown);
    container.appendChild(bubble);
  });
}

function toggleFilter(cat, val) {
  console.log('[FILTERS] Toggle:', cat, val);
  const set = activeFilters[cat];
  if (set.has(val)) {
    set.delete(val);
  } else {
    set.add(val);
  }
  render();
}

function renderActiveFilters() {
  const container = document.getElementById('activeFilters');
  if (!container) return;
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    activeFilters[cat].forEach(val => {
      const chip = document.createElement('div');
      chip.className = 'filter-chip';
      chip.innerHTML = `
        <span>${val}</span>
        <span class="filter-chip-remove">✕</span>
      `;
      chip.querySelector('.filter-chip-remove').addEventListener('click', () => {
        activeFilters[cat].delete(val);
        render();
      });
      container.appendChild(chip);
    });
  });
}

/* ============ RENDER CARDS ============ */
function renderCards(list) {
  console.log('[CARDS] Rendu de', list.length, 'cartes');
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

  list.forEach(c => {
    const node = tmpl.content.cloneNode(true);

    const avatar = node.querySelector('.avatar-placeholder');
    if (avatar) avatar.textContent = (c.prenom || c.nom || '?').trim().charAt(0).toUpperCase() || '?';
    node.querySelector('.card-name').textContent = `${c.prenom} ${c.nom}`.trim() || 'Sans nom';
    node.querySelector('.card-fonction').textContent = c.fonction || '';
    node.querySelector('.card-structure').textContent = c.etablissement || c.structure || '';

    const emailEl = node.querySelector('.card-email');
    if (c.email) {
      emailEl.textContent = c.email;
      emailEl.href = `mailto:${c.email}`;
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

function appendTags(container, values, category) {
  if (!Array.isArray(values)) values = [values];
  values.filter(Boolean).forEach(val => {
    const tag = document.createElement('div');
    tag.className = 'tag ' + category;
    tag.textContent = val;
    tag.addEventListener('click', () => {
      activeFilters[category].add(val);
      render();
    });
    container.appendChild(tag);
  });
}

function updateResultCount(count) {
  const el = document.getElementById('resultCount');
  if (!el) return;
  el.textContent = `${count} contact${count !== 1 ? 's' : ''}`;
  const emptyState = document.getElementById('emptyState');
  if (emptyState) {
    if (count === 0) {
      emptyState.hidden = false;
      emptyState.classList.add('show');
    } else {
      emptyState.hidden = true;
      emptyState.classList.remove('show');
    }
  }
}

/* ============ EVENTS ============ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[EVENTS] Attachement des event listeners');

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim();
      render();
    });
  }

  const resetBtn = document.getElementById('resetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      CATEGORY_ORDER.forEach(k => activeFilters[k].clear());
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      searchTerm = '';
      render();
    });
  }

  document.addEventListener('click', () => {
    document.querySelectorAll('.filter-dropdown.open').forEach(dd => {
      dd.classList.remove('open');
    });
  });
});

console.log('[BOOT] Widget Annuaire prêt!');
