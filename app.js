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
    if (v && String(v).trim()) {
      competences.push(String(v).trim());
    }
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

var refTables = {
  Perimetres: {}, Instances: {}, GT: {}, Actions: {},
  Taches: {}, Communautees: {}, Etablissements: {}, Role_Dans_le_PUI: {}
};

async function loadRefTables() {
  var specs = [
    ['Perimetres', 'Perimetre'],
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
      for (var idx = 0; idx < data.id.length; idx++) {
        var id = data.id[idx];
        var val = data[field] ? data[field][idx] : '#' + id;
        map[id] = val;
      }
      refTables[table] = map;
    } catch (e) {
      console.warn('Impossible de charger ' + table, e);
    }
  }));
  
  contacts = rawRecords.map(normalizeRecord);
  render();
}

function label(table, id) {
  if (!id) return null;
  return refTables[table][id] || '#' + id;
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
    avatar: c.avatar,
    competences: c.competences,
    perimetreIds: c.perimetreIds,
    instanceIds: c.instanceIds,
    gtIds: c.gtIds,
    actionIds: c.actionIds,
    tacheIds: c.tacheIds,
    communauteIds: c.communauteIds,
    etablissementId: c.etablissementId,
    roleId: c.roleId,
    perimetres: c.perimetreIds.map(function(id) { return label('Perimetres', id); }).filter(Boolean),
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
  CATEGORY_ORDER.forEach(function(cat) {
    facets[cat] = new Map();
  });

  enrichedContacts.forEach(function(c) {
    CATEGORY_ORDER.forEach(function(cat) {
      var arr = [];
      if (cat === 'etablissement') arr = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') arr = c.role ? [c.role] : [];
      else if (cat === 'perimetre') arr = c.perimetres;
      else if (cat === 'competence') arr = c.competences;
      else if (cat === 'instance') arr = c.instances;
      else if (cat === 'gt') arr = c.gts;
      else if (cat === 'action') arr = c.actions;
      else if (cat === 'tache') arr = c.taches;
      else if (cat === 'communaute') arr = c.communautes;

      arr.forEach(function(v) {
        if (v) facets[cat].set(v, (facets[cat].get(v) || 0) + 1);
      });
    });
  });
  return facets;
}

/* ============ FILTERING LOGIC ============ */

function matchesSearch(c) {
  if (!searchTerm) return true;
  var t = searchTerm.toLowerCase();
  var fields = [c.nom, c.prenom, c.fonction, c.structure, c.etablissement];
  return fields.filter(Boolean).some(function(v) {
    return String(v).toLowerCase().indexOf(t) !== -1;
  });
}

function matchesFilters(c) {
  for (var i = 0; i < CATEGORY_ORDER.length; i++) {
    var cat = CATEGORY_ORDER[i];
    var selected = activeFilters[cat];
    if (selected.size === 0) continue;

    var values = [];
    if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
    else if (cat === 'role') values = c.role ? [c.role] : [];
    else if (cat === 'perimetre') values = c.perimetres;
    else if (cat === 'competence') values = c.competences;
    else if (cat === 'instance') values = c.instances;
    else if (cat === 'gt') values = c.gts;
    else if (cat === 'action') values = c.actions;
    else if (cat === 'tache') values = c.taches;
    else if (cat === 'communaute') values = c.communautes;

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
  CATEGORY_ORDER.forEach(function(cat) {
    totalSelected += activeFilters[cat].size;
  });

  if (totalSelected > 0) {
    CATEGORY_ORDER.forEach(function(cat) {
      var selected = activeFilters[cat];
      if (selected.size === 0) return;
      var values = [];
      if (cat === 'etablissement') values = c.etablissement ? [c.etablissement] : [];
      else if (cat === 'role') values = c.role ? [c.role] : [];
      else if (cat === 'perimetre') values = c.perimetres;
      else if (cat === 'competence') values = c.competences;
      else if (cat === 'instance') values = c.instances;
      else if (cat === 'gt') values = c.gts;
      else if (cat === 'action') values = c.actions;
      else if (cat === 'tache') values = c.taches;
      else if (cat === 'communaute') values = c.communautes;

      var matchCount = 0;
      for (var k = 0; k < values.length; k++) {
        if (selected.has(values[k])) matchCount++;
      }
      score += matchCount * (CATEGORY_META[cat].weight || 1);
    });
  } else {
    var totalLinks = c.perimetres.length + c.instances.length + c.gts.length +
                     c.actions.length + c.taches.length + c.communautes.length +
                     c.competences.length;
    score += totalLinks * 0.1;
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
    var sA = relevanceScore(a);
    var sB = relevanceScore(b);
    if (sB !== sA) return sB - sA;
    var nameA = (a.nom || '').toLowerCase();
    var nameB = (b.nom || '').toLowerCase();
    return nameA.localeCompare(nameB, 'fr');
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
    var values = Array.from(facets[cat].entries()).sort(function(a, b) { return b[1] - a[1]; });
    if (values.length === 0) return;

    var group = document.createElement('div');
    group.className = 'filter-group';

    var title = document.createElement('div');
    title.className = 'filter-group-title';
    var colorVar = 'var(--accent-' + meta.color + ')';
    title.innerHTML = '<span class="dot" style="background:' + colorVar + '"></span>' + meta.label + '<span class="arrow">▾</span>';
    title.onclick = function() {
      group.classList.toggle('collapsed');
    };
    group.appendChild(title);

    var optionsWrap = document.createElement('div');
    optionsWrap.className = 'filter-options';

    values.forEach(function(entry) {
      var val = entry[0];
      var count = entry[1];
      var opt = document.createElement('div');
      var activeClass = activeFilters[cat].has(val) ? ' active' : '';
      opt.className = 'filter-option' + activeClass;
      opt.innerHTML = '<span>' + escapeHtml(val) + '</span><span class="opt-count">' + count + '</span>';
      opt.onclick = function() {
        toggleFilter(cat, val);
      };
      optionsWrap.appendChild(opt);
    });

    group.appendChild(optionsWrap);
    container.appendChild(group);
  });
}

function toggleFilter(cat, val) {
  var set = activeFilters[cat];
  if (set.has(val)) {
    set.delete(val);
  } else {
    set.add(val);
  }
  render();
}

function renderCards(list) {
  var grid = document.getElementById('cardsGrid');
  var tmpl = document.getElementById('cardTemplate');
  if (!grid || !tmpl) return;
  grid.innerHTML = '';

  list.forEach(function(c) {
    var node = tmpl.content.cloneNode(true);

    var avatarEl = node.querySelector('.avatar');
    if (avatarEl) {
      avatarEl.src = c.avatar;
      avatarEl.alt = c.prenom + ' ' + c.nom;
    }

    var nameEl = node.querySelector('.name');
    if (nameEl) {
      nameEl.textContent = (c.prenom + ' ' + c.nom).trim();
    }

    var fonctionEl = node.querySelector('.fonction');
    if (fonctionEl) {
      fonctionEl.textContent = c.fonction || '';
    }

    var structureEl = node.querySelector('.structure');
    if (structureEl) {
      structureEl.textContent = c.structure || '';
    }

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
      appendTags(tagsWrap, c.perimetres, 'perimetre');
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
