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
CATEGORY_ORDER.forEach(k => activeFilters[k] = new Set());
let searchTerm = '';

/* ============ GRIST INIT ============ */

grist.ready({
  requiredAccess: 'read table',
});

grist.onRecords((records) => {
  rawRecords = records;
  var filteredRecords = rawRecords.filter(function(r) {
    return safeArray(r.perimetre_all).length > 0;
  });
  contacts = filteredRecords.map(normalizeRecord);
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

function buildAvatarPlaceholder(prenom, nom) {
  var initials = (prenom || '').charAt(0) + (nom || '').charAt(0);
  initials = initials.toUpperCase() || '?';
  var colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
  var colorIndex = (initials.charCodeAt(0) || 0) % colors.length;
  var bgColor = colors[colorIndex];
  var svgStr = '<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><rect width="52" height="52" rx="26" fill="' + bgColor + '"/><text x="26" y="32" text-anchor="middle" font-size="18" fill="white" font-family="sans-serif">' + initials + '</text></svg>';
  return 'data:image/svg+xml;base64,' + btoa(svgStr);
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
    avatar: buildAvatarPlaceholder(r.Prenom, r.Nom),
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

/* ============ RESOLUTION DES REFERENCES ============ */

let refTables = {
  Instances: {}, GT: {}, Actions: {},
  Taches: {}, Communautees: {}, Etablissements: {}, Role_Dans_le_PUI: {}
};

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
  await Promise.all(specs.map(async function(spec) {
    var table = spec[0];
    var field = spec[1];
    try {
      var data = await grist.docApi.fetchTable(table);
      var map = {};
      data.id.forEach(function(id, idx) {
        map[id] = data[field] ? data[field][idx] : '#' + id;
      });
      refTables[table] = map;
    } catch (e) {
      console.warn('Impossible de charger', table, e);
    }
  }));
  contacts = rawRecords.filter(function(r) {
    return safeArray(r.perimetre_all).length > 0;
  }).map(normalizeRecord);
  render();
}

function label(table, id) {
  if (!id || !refTables[table]) return null;
  return refTables[table][id] || null;
}

/* Enrichit un contact avec les libellés résolus */
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
    avatar: c.avatar,
    competences: c.competences,
    instances: c.instanceIds.map(function(id) { return label('Instances', id); }).filter(Boolean),
    gts: c.gtIds.map(function(id) { return label('GT', id); }).filter(Boolean),
    actions: c.actionIds.map(function(id) { return label('Actions', id); }).filter(Boolean),
    taches: c.tacheIds.map(function(id) { return label('Taches', id); }).filter(Boolean),
    communautes: c.communauteIds.map(function(id) { return label('Communautees', id); }).filter(Boolean),
    etablissement: label('Etablissements', c.etablissementId),
    role: label('Role_Dans_le_PUI', c.roleId),
  };
}

/* ============ FILTER COUNTING ============ */

function collectFacetValues(enrichedContacts) {
  var facets = {};
  CATEGORY_ORDER.forEach(function(cat) { facets[cat] = new Map(); });

  enrichedContacts.forEach(function(c) {
    CATEGORY_ORDER.forEach(function(cat) {
      var values;
      if (cat === 'etablissement') {
        if (c.etablissement) bump(facets.etablissement, c.etablissement);
        return;
      }
      if (cat === 'role') {
        if (c.role) bump(facets.role, c.role);
        return;
      }
      var fieldMap = {
        competence: 'competences', instance: 'instances',
        gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
      };
      values = c[fieldMap[cat]] || [];
      values.forEach(function(v) { bump(facets[cat], v); });
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

    var values;
    if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
    else if (cat === 'role') values = c.role ? [c.role] : [];
    else {
      var fieldMap = {
        competence: 'competences', instance: 'instances',
        gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
      };
      values = c[fieldMap[cat]] || [];
    }
    var hasMatch = false;
    for (var j = 0; j < values.length; j++) {
      if (selected.has(values[j])) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) return false;
  }
  return true;
}

function relevanceScore(c) {
  var score = 0;
  var totalSelected = 0;
  for (var i = 0; i < CATEGORY_ORDER.length; i++) {
    totalSelected += activeFilters[CATEGORY_ORDER[i]].size;
  }

  if (totalSelected > 0) {
    for (var i = 0; i < CATEGORY_ORDER.length; i++) {
      var cat = CATEGORY_ORDER[i];
      var selected = activeFilters[cat];
      if (selected.size === 0) continue;
      var values;
      if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') values = c.role ? [c.role] : [];
      else {
        var fieldMap = {
          competence: 'competences', instance: 'instances',
          gt: 'gts', action: 'actions', tache: 'taches', communaute: 'communautes',
        };
        values = c[fieldMap[cat]] || [];
      }
      var matchCount = 0;
      for (var j = 0; j < values.length; j++) {
        if (selected.has(values[j])) matchCount++;
      }
      score += matchCount * (CATEGORY_META[cat].weight || 1);
    }
  } else {
    score += (c.instances.length + c.gts.length +
              c.actions.length + c.taches.length + c.communautes.length +
              c.competences.length) * 0.1;
  }
  return score;
}

/* ============ RENDER ============ */

function render() {
  var enriched = contacts.map(enrich);
  var facets = collectFacetValues(enriched);

  renderFilterPanel(facets);

  var filtered = enriched
    .filter(matchesSearch)
    .filter(matchesFilters);

  var sorted = filtered.sort(function(a, b) {
    var s = relevanceScore(b) - relevanceScore(a);
    if (s !== 0) return s;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });

  renderCards(sorted);
  var resultEl = document.getElementById('resultCount');
  if (resultEl) {
    resultEl.textContent = sorted.length + ' contact' + (sorted.length > 1 ? 's' : '');
  }
  var emptyEl = document.getElementById('emptyState');
  if (emptyEl) {
    emptyEl.hidden = sorted.length > 0;
  }
}

function renderFilterPanel(facets) {
  var container = document.getElementById('filtersContainer');
  if (!container) return;
  container.innerHTML = '';

  CATEGORY_ORDER.forEach(function(cat) {
    var meta = CATEGORY_META[cat];
    var entries = [];
    facets[cat].forEach(function(count, val) {
      entries.push([val, count]);
    });
    entries.sort(function(a, b) { return b[1] - a[1]; });

    if (entries.length === 0) return;

    var section = document.createElement('div');
    section.className = 'filter-section';

    var header = document.createElement('div');
    header.className = 'filter-header';
    header.textContent = meta.label;
    section.appendChild(header);

    var list = document.createElement('div');
    list.className = 'filter-values';

    entries.forEach(function(entry) {
      var val = entry[0];
      var count = entry[1];
      var btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeFilters[cat].has(val) ? ' active' : '');
      btn.textContent = val + ' (' + count + ')';
      btn.onclick = function() {
        toggleFilter(cat, val);
      };
      list.appendChild(btn);
    });

    section.appendChild(list);
    container.appendChild(section);
  });
}

function toggleFilter(cat, val) {
  if (activeFilters[cat].has(val)) {
    activeFilters[cat].delete(val);
  } else {
    activeFilters[cat].add(val);
  }
  render();
}

function renderCards(contacts) {
  var grid = document.getElementById('contactsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  contacts.forEach(function(c) {
    var template = document.getElementById('cardTemplate');
    if (!template) return;
    var node = template.cloneNode(true);
    node.id = '';
    node.style.display = 'block';

    var avatarEl = node.querySelector('.avatar');
    if (avatarEl) {
      avatarEl.src = c.avatar;
      avatarEl.alt = (c.prenom + ' ' + c.nom).trim();
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
    if (telEl && c.tel) {
      telEl.textContent = 'Tel: ' + c.tel;
    }

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
    if (!val) return;
    var tag = document.createElement('span');
    var activeClass = activeFilters[cat].has(val) ? ' selected' : '';
    tag.className = 'tag tag-' + cat + activeClass;
    tag.textContent = val;
    tag.onclick = function() {
      toggleFilter(cat, val);
    };
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
    CATEGORY_ORDER.forEach(function(k) {
      activeFilters[k].clear();
    });
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

loadRefTables();