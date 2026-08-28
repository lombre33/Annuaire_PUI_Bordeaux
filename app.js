/* ============ CONFIG ============ */

const CATEGORY_META = {
  perimetre:     { label: 'Périmètres',      color: 'perimetre',     weight: 3 },
  competence:    { label: 'Compétences',     color: 'competence',    weight: 2 },
  instance:      { label: 'Instances',       color: 'instance',      weight: 3 },
  gt:            { label: 'Groupes de travail', color: 'gt',         weight: 2 },
  action:        { label: 'Actions',         color: 'action',        weight: 2 },
  tache:         { label: 'Tâches',          color: 'tache',         weight: 2 },
  communaute:    { label: 'Communautés',     color: 'communaute',    weight: 2 },
  etablissement: { label: 'Établissement',   color: 'etablissement', weight: 1 },
  role:          { label: 'Rôle PUI',        color: 'role',          weight: 1 },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META);

/* ============ STATE ============ */

let rawRecords = [];
let contacts = [];
let activeFilters = {};
CATEGORY_ORDER.forEach(k => activeFilters[k] = new Set());
let searchTerm = '';

/* ============ GRIST INIT ============ */

grist.ready({
  requiredAccess: 'read table',
});

grist.onRecords((records) => {
  rawRecords = records;
  contacts = rawRecords.map(normalizeRecord);
  render();
});

/* ============ NORMALIZATION ============ */

function safeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.filter(x => x !== 'L' && x !== null && x !== undefined && x !== 0);
  }
  return [];
}

// Avatar simplifié : on n'essaie plus de construire une URL distante,
// on utilise directement un placeholder généré localement (SVG initiales).
function buildAvatarPlaceholder(prenom, nom) {
  const initials = `${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase() || '?';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52">' +
    '<rect width="52" height="52" rx="26" fill="#eef2ff"/>' +
    '<text x="50%" y="55%" text-anchor="middle" font-size="18" fill="#4f46e5" font-family="sans-serif">' +
    initials +
    '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
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
    avatar: buildAvatarPlaceholder(r.Prenom, r.Nom),
    competences,
    perimetreIds: safeArray(r.perimetre_all),
    instanceIds: safeArray(r.Instances),
    gtIds: safeArray(r.GT),
    actionIds: safeArray(r.Actions),
    tacheIds: safeArray(r.Taches),
    communauteIds: safeArray(r.Communautee_s_),
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
      const data = await grist.docApi.fetchTable(table);
      const map = {};
      data.id.forEach((id, idx) => { map[id] = data[field] ? data[field][idx] : `#${id}`; });
      refTables[table] = map;
    } catch (e) {
      console.warn('Impossible de charger', table, e);
    }
  }));
  contacts = rawRecords.map(normalizeRecord);
  render();
}

function label(table, id) {
  if (!id) return null;
  return refTables[table][id] || `#${id}`;
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

  const fieldFor = {
    perimetre: 'perimetres', competence: 'competences', instance: 'instances',
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
        perimetre: 'perimetres', competence: 'competences', instance: 'instances',
        gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
      };
      values = c[fieldMap[cat]] || [];
    }
    const hasMatch = values.some(v => selected.has(v));
    if (!hasMatch) return false;
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
          perimetre: 'perimetres', competence: 'competences', instance: 'instances',
          gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
        };
        values = c[fieldMap[cat]] || [];
      }
      const matchCount = values.filter(v => selected.has(v)).length;
      score += matchCount * (CATEGORY_META[cat].weight || 1);
    });
  } else {
    score += (c.perimetres.length + c.instances.length + c.gts.length +
              c.actions.length + c.taches.length + c.communautes.length +
              c.competences.length) * 0.1;
  }
  return score;
}

/* ============ RENDER ============ */

function render() {
  const enriched = contacts.map(enrich);
  const facets = collectFacetValues(enriched);

  renderFilterPanel(facets);

  const filtered = enriched
    .filter(matchesSearch)
    .filter(matchesFilters);

  const sorted = filtered.sort((a, b) => {
    const s = relevanceScore(b) - relevanceScore(a);
    if (s !== 0) return s;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });

  renderCards(sorted);
  document.getElementById('resultCount').textContent =
    `${sorted.length} contact${sorted.length > 1 ? 's' : ''}`;
  document.getElementById('emptyState').hidden = sorted.length > 0;
}

function renderFilterPanel(facets) {
  const container = document.getElementById('filtersContainer');
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(cat => {
    const meta = CATEGORY_META[cat];
    const values = [...facets[cat].entries()].sort((a, b) => b[1] - a[1]);
    if (values.length === 0) return;

    const group = document.createElement('div');
    group.className = 'filter-group';

    const title = document.createElement('div');
    title.className = 'filter-group-title';
    title.innerHTML = `<span class="dot" style="background:var(--accent-${meta.color})"></span>${meta.label}<span class="arrow">▾</span>`;
    title.onclick = () => group.classList.toggle('collapsed');
    group.appendChild(title);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'filter-options';

    values.forEach(([val, count]) => {
      const opt = document.createElement('div');
      opt.className = 'filter-option' + (activeFilters[cat].has(val) ? ' active' : '');
      opt.innerHTML = `<span>${escapeHtml(val)}</span><span class="opt-count">${count}</span>`;
      opt.onclick = () => {
        toggleFilter(cat, val);
      };
      optionsWrap.appendChild(opt);
    });

    group.appendChild(optionsWrap);
    container.appendChild(group);
  });
}

function toggleFilter(cat, val) {
  const set = activeFilters[cat];
  if (set.has(val)) set.delete(val);
  else set.add(val);
  render();
}

function renderCards(list) {
  const grid = document.getElementById('cardsGrid');
  const tmpl = document.getElementById('cardTemplate');
  grid.innerHTML = '';

  list.forEach(c => {
    const node = tmpl.content.cloneNode(true);

    node.querySelector('.avatar').src = c.avatar;
    node.querySelector('.avatar').alt = `${c.prenom} ${c.nom}`;
    node.querySelector('.name').textContent = `${c.prenom} ${c.nom}`.trim();
    node.querySelector('.fonction').textContent = c.fonction || '';
    node.querySelector('.structure').textContent = c.structure || '';

    const emailEl = node.querySelector('.email');
    if (c.email) { emailEl.textContent = c.email; emailEl.href = `mailto:${c.email}`; }
    const telEl = node.querySelector('.tel');
    if (c.tel) telEl.textContent = 'Tel: ' + c.tel;

    const tagsWrap = node.querySelector('.card-tags');
    appendTags(tagsWrap, c.perimetres, 'perimetre');
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

function appendTags(container, values, cat) {
  values.forEach(val => {
    const tag = document.createElement('span');
    tag.className = `tag tag-${cat}` + (activeFilters[cat].has(val) ? ' selected' : '');
    tag.textContent = val;
    tag.onclick = () => toggleFilter(cat, val);
    container.appendChild(tag);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (m) {
    const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": ''' };
    return map[m];
  });
}

/* ============ EVENTS ============ */

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  render();
});

document.getElementById('resetFilters').addEventListener('click', () => {
  CATEGORY_ORDER.forEach(k => activeFilters[k].clear());
  document.getElementById('searchInput').value = '';
  searchTerm = '';
  render();
});

document.getElementById('toggleFilters').addEventListener('click', () => {
  document.getElementById('filtersPanel').classList.toggle('open');
});

/* ============ BOOT ============ */

loadRefTables();
