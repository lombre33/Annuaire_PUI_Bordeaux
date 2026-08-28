/* ============ CONFIG ============ */

const CATEGORY_META = {
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
CATEGORY_ORDER.forEach(function(k) {
  activeFilters[k] = new Set();
});
let searchTerm = '';

let refTables = {
  Perimetres: {}, Instances: {}, GT: {}, Actions: {},
  Taches: {}, Communautees: {}, Etablissements: {}, Role_Dans_le_PUI: {}
};

/* ============ GRIST INIT ============ */

grist.ready({
  requiredAccess: 'read table',
});

grist.onRecords(function(records) {
  rawRecords = records.filter(function(r) {
    var perimetres = safeArray(r.perimetre_all);
    return perimetres.length > 0;
  });
  contacts = rawRecords.map(normalizeRecord);
  render();
});

/* ============ NORMALIZATION ============ */

function safeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.filter(function(x) {
      return x !== 'L' && x !== null && x !== undefined && x !== 0;
    });
  }
  return [];
}

function normalizeRecord(r) {
  var competences = [];
  for (var i = 1; i <= 15; i++) {
    var v = r['competences_' + i];
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
    avatar: r.Lien_avatar || '',
    competences: competences,
    instanceIds: safeArray(r.Instances),
    gtIds: safeArray(r.GT),
    actionIds: safeArray(r.Actions),
    tacheIds: safeArray(r.Taches),
    communauteIds: safeArray(r.Communautee_s_),
    etablissementId: r.Etablissement || null,
    roleId: r.Role_dans_le_PUI || null,
  };
}

function label(table, id) {
  if (!id) return null;
  var map = refTables[table] || {};
  return map[id] || null;
}

function enrich(c) {
  return Object.assign({}, c, {
    instances: c.instanceIds.map(function(id) { return label('Instances', id); }).filter(Boolean),
    gts: c.gtIds.map(function(id) { return label('GT', id); }).filter(Boolean),
    actions: c.actionIds.map(function(id) { return label('Actions', id); }).filter(Boolean),
    taches: c.tacheIds.map(function(id) { return label('Taches', id); }).filter(Boolean),
    communautes: c.communauteIds.map(function(id) { return label('Communautees', id); }).filter(Boolean),
    etablissement: label('Etablissements', c.etablissementId),
    role: label('Role_Dans_le_PUI', c.roleId),
  });
}

/* ============ FILTER COUNTING ============ */

function collectFacetValues(enrichedContacts) {
  var facets = {};
  CATEGORY_ORDER.forEach(function(cat) { facets[cat] = new Map(); });

  enrichedContacts.forEach(function(c) {
    CATEGORY_ORDER.forEach(function(cat) {
      var arr = [];
      if (cat === 'etablissement') arr = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') arr = c.role ? [c.role] : [];
      else if (cat === 'competence') arr = c.competences;
      else if (cat === 'instance') arr = c.instances;
      else if (cat === 'gt') arr = c.gts;
      else if (cat === 'action') arr = c.actions;
      else if (cat === 'tache') arr = c.taches;
      else if (cat === 'communaute') arr = c.communautes;
      arr.forEach(function(v) { bump(facets[cat], v); });
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
  var t = searchTerm.toLowerCase();
  return [c.nom, c.prenom, c.fonction, c.structure, c.etablissement]
    .filter(Boolean)
    .some(function(v) { return String(v).toLowerCase().includes(t); });
}

function matchesFilters(c) {
  for (var i = 0; i < CATEGORY_ORDER.length; i++) {
    var cat = CATEGORY_ORDER[i];
    var selected = activeFilters[cat];
    if (selected.size === 0) continue;
    var arr = [];
    if (cat === 'etablissement') arr = c.etablissement ? [c.etablissement] : [];
    else if (cat === 'role') arr = c.role ? [c.role] : [];
    else if (cat === 'competence') arr = c.competences;
    else if (cat === 'instance') arr = c.instances;
    else if (cat === 'gt') arr = c.gts;
    else if (cat === 'action') arr = c.actions;
    else if (cat === 'tache') arr = c.taches;
    else if (cat === 'communaute') arr = c.communautes;
    var hasMatch = arr.some(function(v) { return selected.has(v); });
    if (!hasMatch) return false;
  }
  return true;
}

function relevanceScore(c) {
  var score = 0;
  var totalSelected = CATEGORY_ORDER.reduce(function(s, cat) { return s + activeFilters[cat].size; }, 0);
  if (totalSelected > 0) {
    CATEGORY_ORDER.forEach(function(cat) {
      var selected = activeFilters[cat];
      if (selected.size === 0) return;
      var arr = [];
      if (cat === 'etablissement') arr = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') arr = c.role ? [c.role] : [];
      else if (cat === 'competence') arr = c.competences;
      else if (cat === 'instance') arr = c.instances;
      else if (cat === 'gt') arr = c.gts;
      else if (cat === 'action') arr = c.actions;
      else if (cat === 'tache') arr = c.taches;
      else if (cat === 'communaute') arr = c.communautes;
      var matchCount = arr.filter(function(v) { return selected.has(v); }).length;
      score += matchCount * (CATEGORY_META[cat].weight || 1);
    });
  } else {
    score += (c.instances.length + c.gts.length + c.actions.length + c.taches.length + c.communautes.length + c.competences.length) * 0.1;
  }
  return score;
}

/* ============ RENDER ============ */

function render() {
  var enriched = contacts.map(enrich);
  var facets = collectFacetValues(enriched);
  renderFilterPanel(facets);
  var filtered = enriched.filter(matchesSearch).filter(matchesFilters);
  var sorted = filtered.sort(function(a, b) {
    var s = relevanceScore(b) - relevanceScore(a);
    if (s !== 0) return s;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });
  renderCards(sorted);
  var countEl = document.getElementById('resultCount');
  if (countEl) countEl.textContent = sorted.length + ' contact' + (sorted.length > 1 ? 's' : '');
  var emptyEl = document.getElementById('emptyState');
  if (emptyEl) emptyEl.hidden = sorted.length > 0;
}

function renderFilterPanel(facets) {
  var container = document.getElementById('filtersContainer');
  if (!container) return;
  container.innerHTML = '';
  CATEGORY_ORDER.forEach(function(cat) {
    var meta = CATEGORY_META[cat];
    var entries = [];
    facets[cat].forEach(function(count, val) { entries.push([val, count]); });
    entries.sort(function(a, b) { return b[1] - a[1]; });
    if (entries.length === 0) return;
    var group = document.createElement('div');
    group.className = 'filter-group collapsed';
    var title = document.createElement('div');
    title.className = 'filter-group-title';
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = 'var(--accent-' + meta.color + ')';
    title.appendChild(dot);
    var label = document.createTextNode(meta.label);
    title.appendChild(label);
    var arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '▾';
    title.appendChild(arrow);
    title.addEventListener('click', function() { group.classList.toggle('collapsed'); });
    group.appendChild(title);
    var opts = document.createElement('div');
    opts.className = 'filter-options';
    entries.forEach(function(entry) {
      var val = entry[0];
      var count = entry[1];
      var opt = document.createElement('div');
      opt.className = 'filter-option';
      if (activeFilters[cat].has(val)) opt.classList.add('active');
      var txt = document.createElement('span');
      txt.textContent = escapeHtml(val);
      opt.appendChild(txt);
      var cnt = document.createElement('span');
      cnt.className = 'opt-count';
      cnt.textContent = count;
      opt.appendChild(cnt);
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        if (activeFilters[cat].has(val)) activeFilters[cat].delete(val);
        else activeFilters[cat].add(val);
        render();
      });
      opts.appendChild(opt);
    });
    group.appendChild(opts);
    container.appendChild(group);
  });
}

function renderCards(sortedContacts) {
  var grid = document.getElementById('cardsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  var tmpl = document.getElementById('cardTemplate');
  if (!tmpl) return;
  sortedContacts.forEach(function(c) {
    var node = tmpl.content.cloneNode(true);
    var avatarEl = node.querySelector('.avatar');
    if (avatarEl) {
      if (c.avatar) avatarEl.src = c.avatar;
      else avatarEl.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNlMGU3ZmYiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjE0IiByPSI1IiBmaWxsPSIjNjM2NmYxIi8+PHBhdGggZD0iTSA4IDMwIFEgOCAyMiAyMCAyMiBRIDMyIDIyIDMyIDMwIiBmaWxsPSIjNjM2NmYxIi8+PC9zdmc+';
    }
    var nameEl = node.querySelector('.name');
    if (nameEl) nameEl.textContent = (c.prenom + ' ' + c.nom).trim();
    var fonctionEl = node.querySelector('.fonction');
    if (fonctionEl) fonctionEl.textContent = c.fonction || '';
    var structureEl = node.querySelector('.structure');
    if (structureEl) structureEl.textContent = c.structure || '';
    var emailEl = node.querySelector('.email');
    if (emailEl && c.email) {
      emailEl.textContent = c.email;
      emailEl.href = 'mailto:' + c.email;
    }
    var telEl = node.querySelector('.tel');
    if (telEl && c.tel) telEl.textContent = '☎ ' + c.tel;
    var tagsWrap = node.querySelector('.card-tags');
    if (tagsWrap) {
      appendTags(tagsWrap, c.competences, 'competence');
      appendTags(tagsWrap, c.instances, 'instance');
      appendTags(tagsWrap, c.gts, 'gt');
      appendTags(tagsWrap, c.actions, 'action');
      appendTags(tagsWrap, c.taches, 'tache');
      appendTags(tagsWrap, c.communautes, 'communaute');
      if (c.etablissement) appendTags(tagsWrap, [c.etablissement], 'etablissement');
      if (c.role) appendTags(tagsWrap, [c.role], 'role');
    }
    grid.appendChild(node);
  });
}

function appendTags(container, values, cat) {
  values.forEach(function(val) {
    var tag = document.createElement('span');
    tag.className = 'tag tag-' + cat;
    tag.textContent = escapeHtml(val);
    tag.addEventListener('click', function(e) {
      e.stopPropagation();
      if (activeFilters[cat].has(val)) activeFilters[cat].delete(val);
      else activeFilters[cat].add(val);
      render();
    });
    container.appendChild(tag);
  });
}

function escapeHtml(s) {
  var div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

/* ============ EVENTS ============ */

var searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    searchTerm = e.target.value.trim();
    render();
  });
}

var resetBtn = document.getElementById('resetFilters');
if (resetBtn) {
  resetBtn.addEventListener('click', function() {
    CATEGORY_ORDER.forEach(function(k) { activeFilters[k].clear(); });
    if (searchInput) searchInput.value = '';
    searchTerm = '';
    render();
  });
}

var toggleBtn = document.getElementById('toggleFilters');
if (toggleBtn) {
  toggleBtn.addEventListener('click', function() {
    var panel = document.getElementById('filtersPanel');
    if (panel) panel.classList.toggle('open');
  });
}

/* ============ BOOT ============ */

async function loadRefTables() {
  var specs = [
    ['Instances', 'nom_instance'],
    ['GT', 'nom'],
    ['Actions', 'Action'],
    ['Taches', 'taches'],
    ['Communautees', 'communaute'],
    ['Etablissements', 'nom_complet'],
    ['Role_Dans_le_PUI', 'Role'],
  ];
  await Promise.all(specs.map(function(spec) {
    var table = spec[0];
    var field = spec[1];
    return grist.docApi.fetchTable(table).then(function(data) {
      var map = {};
      data.id.forEach(function(id, idx) {
        map[id] = (data[field] && data[field][idx]) ? data[field][idx] : '#' + id;
      });
      refTables[table] = map;
    }).catch(function(e) {
      console.warn('Impossible de charger ' + table, e);
    });
  }));
  contacts = rawRecords.map(normalizeRecord);
  render();
}

loadRefTables();