// ===== CONFIGURATION DES FILTRES =====
const filterConfig = {
  instance: {
    containerId: 'filter-instance-container',
    tableName: 'Instance',
    columnName: 'nom_instance'
  },
  actions: {
    containerId: 'filter-actions-container',
    tableName: 'Actions',
    columnName: 'Action'
  },
  gt: {
    containerId: 'filter-gt-container',
    tableName: 'GT',
    columnName: 'nom'
  },
  communautes: {
    containerId: 'filter-communautes-container',
    tableName: 'Communautes',
    columnName: 'communaute'
  },
  role: {
    containerId: 'filter-role-container',
    tableName: 'Role_Dans_le_PUI',
    columnName: 'role'
  }
};

// ===== ÉTAT GLOBAL =====
let allContacts = [];
let filterState = {
  instance: [],
  actions: [],
  gt: [],
  communautes: [],
  role: []
};

// ===== CRÉER L'INTERFACE DES FILTRES =====
const filterUiRetryTimers = {};
const FILTER_UI_RETRY_DELAY = 100;
const FILTER_UI_MAX_RETRIES = 50;

function createFilterUI(filterKey, values, retryCount = 0) {
  const config = filterConfig[filterKey];

  // Ne jamais tenter de manipuler le DOM si la configuration est invalide.
  if (!config || !config.containerId) {
    console.error(`Configuration de filtre invalide: ${filterKey}`);
    return;
  }

  const container = document.getElementById(config.containerId);

  // Le widget Grist peut recevoir les données avant que le HTML soit monté.
  // On réessaie brièvement, sans bloquer le thread et sans multiplier les timers.
  if (!container) {
    if (retryCount < FILTER_UI_MAX_RETRIES) {
      if (retryCount === 0) {
        console.warn(`Conteneur non trouvé: ${config.containerId}. Nouvelle tentative...`);
      }
      filterUiRetryTimers[filterKey] = setTimeout(() => {
        delete filterUiRetryTimers[filterKey];
        createFilterUI(filterKey, values, retryCount + 1);
      }, FILTER_UI_RETRY_DELAY);
    } else {
      console.error(`Conteneur non trouvé après attente: ${config.containerId}`);
    }
    return;
  }

  if (filterUiRetryTimers[filterKey]) {
    clearTimeout(filterUiRetryTimers[filterKey]);
    delete filterUiRetryTimers[filterKey];
  }

  container.innerHTML = '';
  
  values.forEach(value => {
    const bubble = document.createElement('div');
    bubble.className = 'filter-bubble';
    bubble.textContent = value;
    bubble.addEventListener('click', () => toggleFilter(filterKey, value, bubble));
    container.appendChild(bubble);
  });
}

// ===== BASCULER UN FILTRE =====
function toggleFilter(filterKey, value, bubble) {
  if (filterState[filterKey].includes(value)) {
    filterState[filterKey] = filterState[filterKey].filter(v => v !== value);
    bubble.classList.remove('active');
  } else {
    filterState[filterKey].push(value);
    bubble.classList.add('active');
  }
  displayContacts();
}

// ===== EXTRAIRE LES CHAMPS DES RÉFÉRENCES =====
function extractFieldFromReferences(references, fieldName) {
  if (!references) return [];
  
  // Si c'est un tableau d'objets (références multiples)
  if (Array.isArray(references)) {
    return references
      .filter(ref => ref && typeof ref === 'object' && ref[fieldName])
      .map(ref => ref[fieldName]);
  }
  
  // Si c'est un objet unique
  if (typeof references === 'object' && references[fieldName]) {
    return [references[fieldName]];
  }
  
  return [];
}

// ===== AFFICHER LES CONTACTS =====
function displayContacts() {
  const contactsContainer = document.getElementById('contacts-grid');
  if (!contactsContainer) return;

  contactsContainer.innerHTML = '';

  const filtered = allContacts.filter(contact => {
    // Vérifier chaque filtre actif
    if (filterState.instance.length > 0) {
      const contactInstances = extractFieldFromReferences(contact.Instances, 'nom_instance');
      if (!filterState.instance.some(f => contactInstances.includes(f))) return false;
    }

    if (filterState.actions.length > 0) {
      const contactActions = extractFieldFromReferences(contact.Actions, 'Action');
      if (!filterState.actions.some(f => contactActions.includes(f))) return false;
    }

    if (filterState.gt.length > 0) {
      const contactGT = extractFieldFromReferences(contact.GT, 'nom');
      if (!filterState.gt.some(f => contactGT.includes(f))) return false;
    }

    if (filterState.communautes.length > 0) {
      const contactCommunautes = extractFieldFromReferences(contact.Communautes, 'communaute');
      if (!filterState.communautes.some(f => contactCommunautes.includes(f))) return false;
    }

    if (filterState.role.length > 0) {
      const contactRoles = extractFieldFromReferences(contact.Role_Dans_le_PUI, 'role');
      if (!filterState.role.some(f => contactRoles.includes(f))) return false;
    }

    return true;
  });

  filtered.forEach(contact => {
    const card = createContactCard(contact);
    contactsContainer.appendChild(card);
  });

  console.log(`Affichage de ${filtered.length} contacts`);
}

// ===== CRÉER UNE CARTE DE CONTACT =====
function createContactCard(contact) {
  const card = document.createElement('div');
  card.className = 'contact-card';

  // Avatar avec initiales
  const initials = `${(contact.Prenom || '').charAt(0)}${(contact.Nom || '').charAt(0)}`.toUpperCase();
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = initials;

  // Nom et prénom
  const nameDiv = document.createElement('div');
  nameDiv.className = 'contact-name';
  nameDiv.textContent = `${contact.Prenom || ''} ${contact.Nom || ''}`.trim();

  // Fonction
  const functionDiv = document.createElement('div');
  functionDiv.className = 'contact-function';
  functionDiv.textContent = contact.Fonction || '';

  // Établissement (clickable)
  const etablissementDiv = document.createElement('div');
  etablissementDiv.className = 'contact-etablissement';
  if (contact.Etablissement) {
    const etablissementName = typeof contact.Etablissement === 'object' 
      ? contact.Etablissement.nom_etablissement 
      : contact.Etablissement;
    etablissementDiv.textContent = etablissementName;
    etablissementDiv.style.cursor = 'pointer';
    etablissementDiv.addEventListener('click', () => {
      console.log(`Filtre sur établissement: ${etablissementName}`);
    });
  }

  // Email
  const emailDiv = document.createElement('div');
  emailDiv.className = 'contact-email';
  emailDiv.textContent = contact.Email || '';

  // Téléphone
  const telDiv = document.createElement('div');
  telDiv.className = 'contact-tel';
  telDiv.textContent = contact.Telephone || '';

  // Catégories
  const categoriesDiv = document.createElement('div');
  categoriesDiv.className = 'contact-categories';

  const categories = [
    { label: 'Instances', data: contact.Instances, field: 'nom_instance' },
    { label: 'Actions', data: contact.Actions, field: 'Action' },
    { label: 'GT', data: contact.GT, field: 'nom' },
    { label: 'Communautés', data: contact.Communautes, field: 'communaute' },
    { label: 'Rôles', data: contact.Role_Dans_le_PUI, field: 'role' }
  ];

  categories.forEach(cat => {
    const values = extractFieldFromReferences(cat.data, cat.field);
    if (values.length > 0) {
      const catSection = document.createElement('div');
      catSection.className = 'category-section';
      
      const catLabel = document.createElement('div');
      catLabel.className = 'category-label';
      catLabel.textContent = cat.label;
      catSection.appendChild(catLabel);

      values.forEach(value => {
        const valueBubble = document.createElement('span');
        valueBubble.className = 'category-value';
        valueBubble.textContent = value;
        valueBubble.style.cursor = 'pointer';
        valueBubble.addEventListener('click', () => {
          console.log(`Filtre sur ${cat.label}: ${value}`);
        });
        catSection.appendChild(valueBubble);
      });

      categoriesDiv.appendChild(catSection);
    }
  });

  card.appendChild(avatar);
  card.appendChild(nameDiv);
  card.appendChild(functionDiv);
  card.appendChild(etablissementDiv);
  card.appendChild(emailDiv);
  card.appendChild(telDiv);
  card.appendChild(categoriesDiv);

  return card;
}

// ===== INITIALISATION AVEC GRIST =====
grist.ready();

grist.onRecords((records) => {
  try {
    console.log('Enregistrements reçus:', records);

    if (!records || !records.records || records.records.length === 0) {
      console.warn('Aucun enregistrement');
      return;
    }

    allContacts = records.records;

    // Récupérer les valeurs uniques pour chaque filtre
    const filterValues = {
      instance: [],
      actions: [],
      gt: [],
      communautes: [],
      role: []
    };

    allContacts.forEach(contact => {
      // Instances
      const instances = extractFieldFromReferences(contact.Instances, 'nom_instance');
      filterValues.instance.push(...instances);

      // Actions
      const actions = extractFieldFromReferences(contact.Actions, 'Action');
      filterValues.actions.push(...actions);

      // GT
      const gts = extractFieldFromReferences(contact.GT, 'nom');
      filterValues.gt.push(...gts);

      // Communautés
      const communautes = extractFieldFromReferences(contact.Communautes, 'communaute');
      filterValues.communautes.push(...communautes);

      // Rôles
      const roles = extractFieldFromReferences(contact.Role_Dans_le_PUI, 'role');
      filterValues.role.push(...roles);
    });

    // Déduplications et tri
    Object.keys(filterValues).forEach(key => {
      filterValues[key] = [...new Set(filterValues[key])].sort();
      createFilterUI(key, filterValues[key]);
    });

    // Afficher tous les contacts initialement
    displayContacts();

  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
});
