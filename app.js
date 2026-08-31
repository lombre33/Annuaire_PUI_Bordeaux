// Initialisation Grist
grist.ready({
  columns: ['nom', 'prenom', 'fonction', 'etablissement', 'email', 'tel', 'instances', 'actions', 'gt', 'taches', 'competences', 'communautes', 'role_dans_le_pui'],
  requiredColumns: ['nom', 'prenom'],
  onRecords: (records, mappings, state) => {
    enrich(records, mappings, state);
  }
});

// Enrichissement des données
async function enrich(records, mappings, state) {
  try {
    const enrichedRecords = [];
    
    // Récupérer les données des tables référencées
    const instancesData = await fetchTable('Instances', 'nom_instance');
    const actionsData = await fetchTable('Actions', 'libelle');
    const gtData = await fetchTable('GT', 'intitule');
    const tachesData = await fetchTable('Taches', 'libelle');
    const competencesData = await fetchTable('Competences', 'libelle');
    const communautesData = await fetchTable('Communautes', 'communaute');
    const roleData = await fetchTable('Role_Dans_le_PUI', 'Role');
    const etablissementsData = await fetchTable('Etablissements', 'nom_complet');

    // Traiter chaque enregistrement
    for (const record of records) {
      const enriched = {
        ...record,
        instances: resolveReferences(record['$Instances'], instancesData, 'nom_instance'),
        actions: resolveReferences(record['$Actions'], actionsData, 'libelle'),
        gt: resolveReferences(record['$GT'], gtData, 'intitule'),
        taches: resolveReferences(record['$Taches'], tachesData, 'libelle'),
        competences: resolveReferences(record['$Competences'], competencesData, 'libelle'),
        communautes: resolveReferences(record['$Communautes'], communautesData, 'communaute'),
        role_dans_le_pui: resolveReferences(record['$Role_Dans_le_PUI'], roleData, 'Role'),
        etablissement: resolveReferences(record['$Etablissements'], etablissementsData, 'nom_complet')[0]
      };
      enrichedRecords.push(enriched);
    }

    // Afficher les cartes
    displayCards(enrichedRecords, { instancesData, actionsData, gtData, tachesData, competencesData, communautesData, roleData, etablissementsData });

  } catch (error) {
    console.error('Erreur dans enrich:', error);
  }
}

// Récupérer les données d'une table
async function fetchTable(tableName, displayColumn) {
  try {
    const table = await window.grist.docApi.fetchTable(tableName);
    const data = {};
    
    if (Array.isArray(table)) {
      table.forEach(row => {
        if (row[displayColumn]) {
          data[row.id] = row[displayColumn];
        }
      });
    } else if (table && typeof table === 'object') {
      // Si c'est un objet avec des lignes
      for (const key in table) {
        if (table[key] && table[key][displayColumn]) {
          data[table[key].id] = table[key][displayColumn];
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error(`Erreur lors de la récupération de ${tableName}:`, error);
    return {};
  }
}

// Résoudre les références
function resolveReferences(references, dataMap, displayColumn) {
  if (!references) return [];
  
  // Gérer si c'est un tableau
  const refArray = Array.isArray(references) ? references : [references];
  
  return refArray.map(ref => {
    if (typeof ref === 'object' && ref.id) {
      return dataMap[ref.id] || ref[displayColumn] || `Unknown`;
    } else if (typeof ref === 'number') {
      return dataMap[ref] || `Unknown`;
    } else {
      return ref;
    }
  }).filter(v => v !== null && v !== undefined);
}

// Afficher les cartes
function displayCards(records, lookupData) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  const filters = {
    instances: new Set(),
    actions: new Set(),
    gt: new Set(),
    taches: new Set(),
    competences: new Set(),
    communautes: new Set(),
    role: new Set(),
    etablissement: new Set()
  };

  // Collecter les valeurs uniques pour les filtres
  records.forEach(record => {
    if (record.instances) record.instances.forEach(v => filters.instances.add(v));
    if (record.actions) record.actions.forEach(v => filters.actions.add(v));
    if (record.gt) record.gt.forEach(v => filters.gt.add(v));
    if (record.taches) record.taches.forEach(v => filters.taches.add(v));
    if (record.competences) record.competences.forEach(v => filters.competences.add(v));
    if (record.communautes) record.communautes.forEach(v => filters.communautes.add(v));
    if (record.role_dans_le_pui) record.role_dans_le_pui.forEach(v => filters.role.add(v));
    if (record.etablissement) filters.etablissement.add(record.etablissement);
  });

  // Afficher les filtres
  displayFilters(filters);

  // Afficher les cartes
  records.forEach(record => {
    const card = createCard(record);
    container.appendChild(card);
  });
}

// Créer une carte contact
function createCard(record) {
  const card = document.createElement('div');
  card.className = 'contact-card';
  
  const initials = `${record.prenom?.[0] || ''}${record.nom?.[0] || ''}`.toUpperCase();
  
  card.innerHTML = `
    <div class="card-avatar">${initials}</div>
    <div class="card-content">
      <h3>${record.prenom} ${record.nom}</h3>
      ${record.fonction ? `<p class="card-fonction">${record.fonction}</p>` : ''}
      ${record.etablissement ? `<p class="card-etablissement clickable" data-filter="etablissement" data-value="${record.etablissement}">${record.etablissement}</p>` : ''}
      <p class="card-email">${record.email || ''}</p>
      ${record.tel ? `<p class="card-tel">${record.tel}</p>` : ''}
      
      ${record.instances?.length > 0 ? `<div class="card-section"><strong>Instances:</strong><div class="card-tags">${record.instances.map(v => `<span class="tag clickable" data-filter="instances" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
      ${record.actions?.length > 0 ? `<div class="card-section"><strong>Actions:</strong><div class="card-tags">${record.actions.map(v => `<span class="tag clickable" data-filter="actions" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
      ${record.gt?.length > 0 ? `<div class="card-section"><strong>GT:</strong><div class="card-tags">${record.gt.map(v => `<span class="tag clickable" data-filter="gt" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
      ${record.taches?.length > 0 ? `<div class="card-section"><strong>Tâches:</strong><div class="card-tags">${record.taches.map(v => `<span class="tag clickable" data-filter="taches" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
      ${record.competences?.length > 0 ? `<div class="card-section"><strong>Compétences:</strong><div class="card-tags">${record.competences.map(v => `<span class="tag clickable" data-filter="competences" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
      ${record.communautes?.length > 0 ? `<div class="card-section"><strong>Communautés:</strong><div class="card-tags">${record.communautes.map(v => `<span class="tag clickable" data-filter="communautes" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
      ${record.role_dans_le_pui?.length > 0 ? `<div class="card-section"><strong>Rôle:</strong><div class="card-tags">${record.role_dans_le_pui.map(v => `<span class="tag clickable" data-filter="role" data-value="${v}">${v}</span>`).join('')}</div></div>` : ''}
    </div>
  `;
  
  return card;
}

// Afficher les filtres
function displayFilters(filters) {
  const filtersContainer = document.getElementById('filters-container');
  filtersContainer.innerHTML = '';

  const filterGroups = [
    { name: 'Instances', key: 'instances', data: Array.from(filters.instances) },
    { name: 'Actions', key: 'actions', data: Array.from(filters.actions) },
    { name: 'GT', key: 'gt', data: Array.from(filters.gt) },
    { name: 'Tâches', key: 'taches', data: Array.from(filters.taches) },
    { name: 'Compétences', key: 'competences', data: Array.from(filters.competences) },
    { name: 'Communautés', key: 'communautes', data: Array.from(filters.communautes) },
    { name: 'Rôle', key: 'role', data: Array.from(filters.role) },
    { name: 'Établissement', key: 'etablissement', data: Array.from(filters.etablissement) }
  ];

  filterGroups.forEach(group => {
    if (group.data.length > 0) {
      const filterGroup = document.createElement('div');
      filterGroup.className = 'filter-group';
      filterGroup.innerHTML = `<h4>${group.name}</h4>`;
      
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'filter-tags';
      
      group.data.forEach(value => {
        const tag = document.createElement('span');
        tag.className = 'filter-tag';
        tag.textContent = value;
        tag.onclick = () => filterCards(group.key, value);
        tagsContainer.appendChild(tag);
      });
      
      filterGroup.appendChild(tagsContainer);
      filtersContainer.appendChild(filterGroup);
    }
  });
}

// Filtrer les cartes
function filterCards(filterType, filterValue) {
  const cards = document.querySelectorAll('.contact-card');
  cards.forEach(card => {
    let show = false;
    
    const tagElements = card.querySelectorAll('.tag, .card-etablissement');
    tagElements.forEach(tag => {
      if (tag.dataset.filter === filterType && tag.dataset.value === filterValue) {
        show = true;
      }
    });
    
    card.style.display = show ? 'block' : 'none';
  });
}
