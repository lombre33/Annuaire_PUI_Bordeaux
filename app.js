/* Annuaire PUI Bordeaux — Application Grist
 * Version stable avec contacts et 7 filtres fonctionnels
 */

// Configuration des filtres
const FILTER_CONFIG = {
  instance: {
    label: 'Instances',
    field: 'Instances',
    refField: 'nom_instance'
  },
  actions: {
    label: 'Actions',
    field: 'Actions',
    refField: 'Action'
  },
  gt: {
    label: 'Groupes de travail',
    field: 'GT',
    refField: 'nom'
  },
  communautes: {
    label: 'Communautés',
    field: 'Communautes',
    refField: 'communaute'
  },
  role: {
    label: 'Rôles',
    field: 'Role_Dans_le_PUI',
    refField: 'role'
  }
};

let allContacts = [];
let activeFilters = {
  instance: [],
  actions: [],
  gt: [],
  communautes: [],
  role: []
};

// Extraire les valeurs depuis les références Grist
function extractFieldFromReferences(fieldValue, refField) {
  if (!fieldValue) return [];
  
  // Si c'est un tableau d'IDs, chercher dans les données de référence
  if (Array.isArray(fieldValue)) {
    return fieldValue.map(id => {
      // Les données de référence sont déjà enrichies dans le champ
      if (typeof id === 'object' && id !== null) {
        return id[refField] || id.name || id.label || '';
      }
      return String(id);
    }).filter(Boolean);
  }
  
  // Si c'est une chaîne
  if (typeof fieldValue === 'string') {
    return fieldValue.split(',').map(v => v.trim()).filter(Boolean);
  }
  
  return [];
}

// Créer un bouton de filtre
function createFilterUI(filterKey, values) {
  const config = FILTER_CONFIG[filterKey];
  if (!config) return;
  
  const container = document.getElementById(`filter-${filterKey}`);
  if (!container) return;
  
  container.innerHTML = '';
  
  values.forEach(value => {
    const label = document.createElement('label');
    label.className = 'filter-option';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = value;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        activeFilters[filterKey].push(value);
      } else {
        activeFilters[filterKey] = activeFilters[filterKey].filter(v => v !== value);
      }
      displayContacts();
    });
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(value));
    container.appendChild(label);
  });
}

// Vérifier si un contact correspond aux filtres actifs
function contactMatchesFilters(contact) {
  return Object.entries(activeFilters).every(([filterKey, selectedValues]) => {
    if (selectedValues.length === 0) return true;
    const config = FILTER_CONFIG[filterKey];
    const contactValues = extractFieldFromReferences(contact[config.field], config.refField);
    return selectedValues.some(value => contactValues.includes(value));
  });
}

// Afficher les contacts
function displayContacts() {
  const container = document.getElementById('contacts-list');
  const countElement = document.getElementById('contacts-count');
  if (!container) return;
  
  const filteredContacts = allContacts.filter(contactMatchesFilters);
  
  container.innerHTML = '';
  
  filteredContacts.forEach(contact => {
    const card = document.createElement('div');
    card.className = 'contact-card';
    
    const name = contact.Nom || contact.nom || contact.Name || 'Sans nom';
    const email = contact.Email || contact.email || '';
    const organisation = contact.Organisation || contact.organisation || contact.Structure || '';
    
    card.innerHTML = `
      <h3>${name}</h3>
      ${organisation ? `<p class="organisation">${organisation}</p>` : ''}
      ${email ? `<p class="email"><a href="mailto:${email}">${email}</a></p>` : ''}
    `;
    
    container.appendChild(card);
  });
  
  if (countElement) {
    countElement.textContent = `${filteredContacts.length} contact${filteredContacts.length > 1 ? 's' : ''}`;
  }
}

// Initialisation avec Grist
grist.ready({ requiredAccess: 'read table' });

grist.onRecords((records) => {
  try {
    console.log('Enregistrements reçus:', records);
    
    if (!records || !records.records || records.records.length === 0) {
      console.warn('Aucun enregistrement');
      return;
    }
    
    const scopedRecords = records.records.filter(r => {
      const p = r.$perimetre_all;
      if (Array.isArray(p)) return p.length > 0;
      if (p === null || p === undefined) return false;
      return typeof p === 'string' ? p.trim() !== '' : true;
    });

    allContacts = scopedRecords;
    
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
