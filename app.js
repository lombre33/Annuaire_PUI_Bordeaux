/* ============ CONFIG ============ */
const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#d79a25' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'Competences', color: '#6257d9' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' }
];

// Inclure établissement et rôle pour les filtres cliquables sur les cartes
const TAG_GROUPS = [
  { key: 'instances', label: 'Instances', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', color: '#f28a54' },
  { key: 'gt', label: 'GT', color: '#1ba99a' },
  { key: 'taches', label: 'Tâches', color: '#d79a25' },
  { key: 'competences', label: 'Compétences', color: '#6257d9' },
  { key: 'communautes', label: 'Communautés', color: '#d85b9d' },
  { key: 'etablissement', label: 'Établissement', color: '#147c72' },
  { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }
];

const activeFilters = Object.fromEntries(FILTERS.map(function(f) { return [f.key, new Set()]; }));
// Ajouter établissement et rôle aux filtres actifs pour pouvoir les filtrer depuis les cartes
activeFilters['etablissement'] = new Set();
activeFilters['role'] = new Set();

const refMaps = {}; let contacts = []; let searchTerm = ''; let referencesLoaded = false;
console.log('[INIT] Démarrage du widget Annuaire PUI');
grist.ready({ requiredAccess: 'read table' }); 
console.log('[GRIST] Accès lecture demandé');

grist.onRecords(async function(records) { 
  console.log('[GRIST] Records reçus:', records.length); 
  contacts = records.filter(hasPerimetre).map(normalizeRecord); 
  console.log('[FILTERS] Records conservés avec perimetre_all:', contacts.length); 
  await loadReferenceTables(); 
  render(); 
});

function safeValues(value) { 
  if (Array.isArray(value)) return value.filter(function(item) { return item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== ''; }); 
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value]; 
}

function hasPerimetre(record) { 
  return safeValues(record.perimetre_all).length > 0; 
}

function text(value) { 
  return value === null || value === undefined ? '' : String(value).trim(); 
}

function normalizeRecord(record) { 
  const competences = []; 
  for (let i = 1; i <= 15; i += 1) { 
    const value = text(record['competences_' + i]); 
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
    tacheIds: safeValues(record.Taches), 
    communauteIds: safeValues(record.Communautee_s_), 
    competences: competences, 
    roleId: record.Role_dans_le_PUI 
  }; 
}

async function loadReferenceTables() { 
  if (referencesLoaded) return; 
  console.log('[REFS] Chargement des tables de référence'); 
  await Promise.all(FILTERS.map(async function(f) { 
    try { 
      const data = await grist.docApi.fetchTable(f.table); 
      refMaps[f.table] = {}; 
      (data.id || []).forEach(function(id, i) { 
        refMaps[f.table][String(id)] = text((data[f.field] || [])[i]); 
      }); 
      console.log('[REFS] ✅ ' + f.table + ': ' + Object.keys(refMaps[f.table]).length + ' entrées'); 
    } catch (e) { 
      console.warn('[REFS] Échec pour ' + f.table, e); 
    } 
  })); 
  
  await Promise.all([['Etablissements', 'nom_complet'], ['Role_Dans_le_PUI', 'Role']].map(async function(s) { 
    try { 
      const data = await grist.docApi.fetchTable(s[0]); 
      refMaps[s[0]] = {}; 
      (data.id || []).forEach(function(id, i) { 
        refMaps[s[0]][String(id)] = text((data[s[1]] || [])[i]); 
      }); 
      console.log('[REFS] ✅ ' + s[0] + ': ' + Object.keys(refMaps[s[0]]).length + ' entrées');
    } catch (e) { 
      console.warn('[REFS] Échec pour ' + s[0], e); 
    } 
  })); 
  referencesLoaded = true; 
}

function lookup(table, id) { 
  return id === null || id === undefined || id === '' ? '' : (refMaps[table] || {})[String(id)] || ''; 
}

function enrich(c) { 
  return Object.assign({}, c, { 
    instances: c.instanceIds.map(function(id) { return lookup('Instances', id); }).filter(Boolean), 
    actions: c.actionIds.map(function(id) { return lookup('Actions', id); }).filter(Boolean), 
    gts: c.gtIds.map(function(id) { return lookup('GT', id); }).filter(Boolean), 
    taches: c.tacheIds.map(function(id) { return lookup('Taches', id); }).filter(Boolean), 
    communautes: c.communauteIds.map(function(id) { return lookup('Communautees', id); }).filter(Boolean), 
    etablissement: lookup('Etablissements', c.etablissementId) || c.etablissementFallback, 
    role: lookup('Role_Dans_le_PUI', c.roleId) 
  }); 
}

function facetValues(c, key) { 
  return c[key] || []; 
}

function collectFacets(list) { 
  const facets = Object.fromEntries(FILTERS.map(function(f) { return [f.key, new Map()]; })); 
  FILTERS.forEach(function(f) { 
    Object.values(refMaps[f.table] || {}).forEach(function(label) { 
      if (label) facets[f.key].set(label, 0); 
    }); 
  }); 
  list.forEach(function(c) { 
    FILTERS.forEach(function(f) { 
      facetValues(c, f.key).forEach(function(v) { 
        if (facets[f.key].has(v)) facets[f.key].set(v, facets[f.key].get(v) + 1); 
      }); 
    }); 
  }); 
  return facets; 
}

function matches(c) { 
  const term = searchTerm.toLocaleLowerCase('fr-FR'); 
  if (term && ![c.nom, c.prenom].some(function(v) { return v.toLocaleLowerCase('fr-FR').includes(term); })) return false; 
  
  // Vérifier tous les filtres (FILTERS + établissement + rôle)
  return FILTERS.every(function(f) { 
    const selected = activeFilters[f.key]; 
    return selected.size === 0 || facetValues(c, f.key).some(function(v) { return selected.has(v); }); 
  }) && 
  (activeFilters['etablissement'].size === 0 || (c.etablissement && activeFilters['etablissement'].has(c.etablissement))) &&
  (activeFilters['role'].size === 0 || (c.role && activeFilters['role'].has(c.role)));
}

function render() { 
  console.log('[RENDER] Mise à jour des filtres et des cartes'); 
  const enriched = contacts.map(enrich); 
  renderFilters(collectFacets(enriched)); 
  const visible = enriched.filter(matches).sort(function(a, b) { 
    return a.nom.localeCompare(b.nom, 'fr-FR') || a.prenom.localeCompare(b.prenom, 'fr-FR'); 
  }); 
  renderActiveFilters(); 
  renderCards(visible); 
  document.getElementById('resultCount').textContent = visible.length + ' contact' + (visible.length > 1 ? 's' : ''); 
  document.getElementById('emptyState').hidden = visible.length !== 0; 
  console.log('[CARDS] Cartes affichées:', visible.length); 
}

function renderFilters(facets) { 
  console.log('[FILTERS] Rendu des 6 catégories'); 
  const container = document.getElementById('filtersContainer'); 
  container.innerHTML = ''; 
  FILTERS.forEach(function(f) { 
    const wrapper = document.createElement('div'); 
    wrapper.className = 'filter'; 
    const button = document.createElement('button'); 
    button.type = 'button'; 
    button.className = 'filter-button'; 
    button.dataset.category = f.key; 
    button.innerHTML = '<span class="filter-dot"></span><span>' + f.label + '</span><span class="filter-count">' + activeFilters[f.key].size + '</span><span class="chevron">▾</span>'; 
    button.querySelector('.filter-dot').style.backgroundColor = f.color; 
    const menu = document.createElement('div'); 
    menu.className = 'filter-menu'; 
    menu.style.borderTopColor = f.color; 
    Array.from(facets[f.key].entries()).sort(function(a, b) { return a[0].localeCompare(b[0], 'fr-FR'); }).forEach(function(entry) { 
      const option = document.createElement('label'); 
      option.className = 'filter-option'; 
      const checkbox = document.createElement('input'); 
      checkbox.type = 'checkbox'; 
      checkbox.checked = activeFilters[f.key].has(entry[0]); 
      checkbox.addEventListener('change', function() { toggleFilter(f.key, entry[0]); }); 
      const labelEl = document.createElement('span'); 
      labelEl.className = 'option-label'; 
      labelEl.textContent = entry[0]; 
      const count = document.createElement('span'); 
      count.className = 'option-count'; 
      count.textContent = entry[1]; 
      option.append(checkbox, labelEl, count); 
      menu.appendChild(option); 
    }); 
    button.addEventListener('click', function(event) { 
      event.stopPropagation(); 
      document.querySelectorAll('.filter.open').forEach(function(item) { 
        if (item !== wrapper) item.classList.remove('open'); 
      }); 
      wrapper.classList.toggle('open'); 
    }); 
    menu.addEventListener('click', function(event) { event.stopPropagation(); }); 
    wrapper.append(button, menu); 
    container.appendChild(wrapper); 
  }); 
}

function toggleFilter(key, value) { 
  if (activeFilters[key].has(value)) activeFilters[key].delete(value); 
  else activeFilters[key].add(value); 
  render(); 
}

function renderActiveFilters() { 
  const target = document.getElementById('activeFilters'); 
  target.innerHTML = ''; 
  
  // Afficher les filtres des 6 catégories
  FILTERS.forEach(function(f) { 
    activeFilters[f.key].forEach(function(v) { 
      const chip = document.createElement('span'); 
      chip.className = 'active-chip'; 
      chip.textContent = f.label + ' : ' + v; 
      target.appendChild(chip); 
    }); 
  }); 
  
  // Afficher les filtres établissement et rôle
  activeFilters['etablissement'].forEach(function(v) {
    const chip = document.createElement('span'); 
    chip.className = 'active-chip'; 
    chip.textContent = 'Établissement : ' + v; 
    target.appendChild(chip); 
  });
  
  activeFilters['role'].forEach(function(v) {
    const chip = document.createElement('span'); 
    chip.className = 'active-chip'; 
    chip.textContent = 'Rôle PUI : ' + v; 
    target.appendChild(chip); 
  });
}

function renderCards(list) { 
  const grid = document.getElementById('cardsGrid'); 
  grid.innerHTML = ''; 
  const template = document.getElementById('cardTemplate'); 
  list.forEach(function(c) { 
    const node = template.content.cloneNode(true); 
    node.querySelector('.avatar').textContent = ((c.prenom.charAt(0) || '') + (c.nom.charAt(0) || '')).toUpperCase() || '?'; 
    node.querySelector('.name').textContent = (c.prenom + ' ' + c.nom).trim() || 'Sans nom'; 
    setText(node.querySelector('.fonction'), c.fonction); 
    setText(node.querySelector('.structure'), c.etablissement); 
    setText(node.querySelector('.tel'), c.telephone ? '☎ ' + c.telephone : ''); 
    const email = node.querySelector('.email'); 
    if (c.email) { 
      email.textContent = c.email; 
      email.href = 'mailto:' + c.email; 
      email.classList.add('visible'); 
    } 
    const tags = node.querySelector('.card-tags'); 
    
    // Afficher les 6 catégories en tant que groupes de tags cliquables
    TAG_GROUPS.forEach(function(g) { 
      let values = [];
      
      // Récupérer les valeurs selon le type
      if (g.key === 'etablissement') {
        values = c.etablissement ? [c.etablissement] : [];
      } else if (g.key === 'role') {
        values = c.role ? [c.role] : [];
      } else {
        values = facetValues(c, g.key) || [];
      }
      
      // Ajouter le groupe de tags s'il y a des valeurs
      if (values.length > 0) {
        appendTagGroup(tags, g, values);
      }
    }); 
    grid.appendChild(node); 
  }); 
}

function appendTagGroup(container, group, list) { 
  if (!list.length) return; 
  const section = document.createElement('section'); 
  section.className = 'tag-group'; 
  const title = document.createElement('h3'); 
  title.className = 'tag-group-title'; 
  title.textContent = group.label; 
  title.style.color = group.color; 
  section.appendChild(title); 
  const values = document.createElement('div'); 
  values.className = 'tag-group-values'; 
  list.forEach(function(value) { 
    const tag = document.createElement('button'); 
    tag.type = 'button'; 
    tag.className = 'tag tag-' + group.key; 
    tag.style.backgroundColor = group.color; 
    tag.textContent = value; 
    // Rendre tous les tags cliquables pour filtrer (y compris établissement et rôle)
    tag.addEventListener('click', function() { 
      toggleFilter(group.key, value); 
    }); 
    values.appendChild(tag); 
  }); 
  section.appendChild(values); 
  container.appendChild(section); 
}

function setText(element, value) { 
  if (value) { 
    element.textContent = value; 
    element.classList.add('visible'); 
  } 
}

document.getElementById('searchInput').addEventListener('input', function(e) { 
  searchTerm = e.target.value.trim(); 
  render(); 
}); 

document.getElementById('resetFilters').addEventListener('click', function() { 
  FILTERS.forEach(function(f) { 
    activeFilters[f.key].clear(); 
  }); 
  activeFilters['etablissement'].clear();
  activeFilters['role'].clear();
  searchTerm = ''; 
  document.getElementById('searchInput').value = ''; 
  render(); 
}); 

document.addEventListener('click', function() { 
  document.querySelectorAll('.filter.open').forEach(function(f) { 
    f.classList.remove('open'); 
  }); 
}); 

console.log('[INIT] ✅ App initialisé, en attente des données Grist');