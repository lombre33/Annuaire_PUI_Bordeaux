/* ============ CONFIG ============ */
const FILTERS = [
  { key: 'instances', label: 'Instances', table: 'Instance', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#52c41a' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#faad14' },
  { key: 'communautes', label: 'Communautés', table: 'Communautes', field: 'communaute', color: '#f5222d' },
  { key: 'roles', label: 'Rôles dans le PUI', table: 'Role_Dans_le_PUI', field: 'role', color: '#722ed1' }
];

/* ============ DOM HELPERS ============ */
function createFilterUI(filterConfig) {
  const container = document.getElementById('filters');
  container.innerHTML = '';
  
  filterConfig.forEach(filter => {
    const filterDiv = document.createElement('div');
    filterDiv.className = 'filter';
    
    const label = document.createElement('label');
    label.textContent = filter.label;
    
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'bubble-container';
    bubbleContainer.id = `bubbles-${filter.key}`;
    
    filterDiv.appendChild(label);
    filterDiv.appendChild(bubbleContainer);
    container.appendChild(filterDiv);
  });
}

function addBubble(filterId, value, isActive = false) {
  const container = document.getElementById(`bubbles-${filterId}`);
  if (!container) return;
  
  const bubble = document.createElement('button');
  bubble.className = `bubble ${isActive ? 'active' : ''}`;
  bubble.textContent = value;
  bubble.onclick = () => toggleBubble(bubble, filterId, value);
  
  container.appendChild(bubble);
}

function toggleBubble(element, filterId, value) {
  element.classList.toggle('active');
  filterContacts();
}

function displayContacts(contacts) {
  const container = document.getElementById('contacts');
  container.innerHTML = '';
  
  contacts.forEach(contact => {
    const card = createContactCard(contact);
    container.appendChild(card);
  });
}

function createContactCard(contact) {
  const card = document.createElement('div');
  card.className = 'contact-card';
  
  // Avatar avec initiales
  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'avatar';
  const initials = getInitials(contact.Nom_Prenom || '');
  avatarDiv.textContent = initials;
  
  // Nom/Prénom
  const nameDiv = document.createElement('div');
  nameDiv.className = 'name';
  nameDiv.textContent = contact.Nom_Prenom || '';
  
  // Fonction
  const funcDiv = document.createElement('div');
  funcDiv.className = 'fonction';
  funcDiv.textContent = contact.Fonction || '';
  
  // Établissement (clickable)
  const etabDiv = document.createElement('div');
  etabDiv.className = 'etablissement';
  if (contact.Etablissement) {
    const etabLink = document.createElement('span');
    etabLink.className = 'clickable';
    etabLink.textContent = contact.Etablissement;
    etabLink.onclick = () => filterByValue('etablissement', contact.Etablissement);
    etabDiv.appendChild(etabLink);
  }
  
  // Email
  const emailDiv = document.createElement('div');
  emailDiv.className = 'email';
  if (contact.Email) {
    const emailLink = document.createElement('a');
    emailLink.href = `mailto:${contact.Email}`;
    emailLink.textContent = contact.Email;
    emailDiv.appendChild(emailLink);
  }
  
  // Téléphone
  const telDiv = document.createElement('div');
  telDiv.className = 'tel';
  if (contact.Tel) {
    telDiv.textContent = contact.Tel;
  }
  
  // Catégories (Instances, Actions, GT, Communautés, Rôles)
  const categoriesDiv = document.createElement('div');
  categoriesDiv.className = 'categories';
  
  const categories = [
    { name: 'Instances', values: contact.Instances || [], filterKey: 'instances' },
    { name: 'Actions', values: contact.Actions || [], filterKey: 'actions' },
    { name: 'GT', values: contact.GT || [], filterKey: 'gt' },
    { name: 'Communautés', values: contact.Communautes || [], filterKey: 'communautes' },
    { name: 'Rôles', values: contact.Roles || [], filterKey: 'roles' }
  ];
  
  let isFirstCategory = true;
  categories.forEach(cat => {
    if (cat.values.length > 0) {
      if (!isFirstCategory) {
        const separator = document.createElement('div');
        separator.className = 'category-separator';
        categoriesDiv.appendChild(separator);
      }
      isFirstCategory = false;
      
      const catTitle = document.createElement('div');
      catTitle.className = 'category-title';
      catTitle.textContent = cat.name + ':';
      categoriesDiv.appendChild(catTitle);
      
      const valuesList = document.createElement('div');
      valuesList.className = 'category-values';
      cat.values.forEach(val => {
        const tag = document.createElement('span');
        tag.className = 'category-tag';
        tag.textContent = val;
        tag.onclick = () => filterByValue(cat.filterKey, val);
        valuesList.appendChild(tag);
      });
      categoriesDiv.appendChild(valuesList);
    }
  });
  
  // Assembler la carte
  card.appendChild(avatarDiv);
  card.appendChild(nameDiv);
  card.appendChild(funcDiv);
  card.appendChild(etabDiv);
  card.appendChild(emailDiv);
  card.appendChild(telDiv);
  card.appendChild(categoriesDiv);
  
  return card;
}

function getInitials(name) {
  return name
    .split(' ')
    .map(n => n.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
}

function filterByValue(filterKey, value) {
  const bubblesContainer = document.getElementById(`bubbles-${filterKey}`);
  if (bubblesContainer) {
    const bubble = Array.from(bubblesContainer.querySelectorAll('.bubble'))
      .find(b => b.textContent === value);
    if (bubble) {
      bubble.click();
    }
  }
}

function filterContacts() {
  const activeFilters = getActiveFilters();
  const allContacts = window.allContacts || [];
  
  const filtered = allContacts.filter(contact => {
    for (const [filterKey, values] of Object.entries(activeFilters)) {
      if (values.length === 0) continue;
      
      let contactValues = [];
      if (filterKey === 'instances') contactValues = contact.Instances || [];
      else if (filterKey === 'actions') contactValues = contact.Actions || [];
      else if (filterKey === 'gt') contactValues = contact.GT || [];
      else if (filterKey === 'communautes') contactValues = contact.Communautes || [];
      else if (filterKey === 'roles') contactValues = contact.Roles || [];
      
      if (!values.some(v => contactValues.includes(v))) {
        return false;
      }
    }
    return true;
  });
  
  displayContacts(filtered);
}

function getActiveFilters() {
  const activeFilters = {};
  
  FILTERS.forEach(filter => {
    const bubblesContainer = document.getElementById(`bubbles-${filter.key}`);
    if (bubblesContainer) {
      const activeBubbles = Array.from(bubblesContainer.querySelectorAll('.bubble.active'))
        .map(b => b.textContent);
      activeFilters[filter.key] = activeBubbles;
    }
  });
  
  return activeFilters;
}

/* ============ MAIN GRIST INTEGRATION ============ */
grist.ready({ requiredAccess: 'read table' });

grist.onRecords(async function(records) {
  try {
    // Initialiser l'UI des filtres
    createFilterUI(FILTERS);
    
    // Récupérer les données de toutes les tables de filtre
    const filterData = {};
    
    for (const filter of FILTERS) {
      try {
        const table = await window.grist.docApi.fetchTable(filter.table);
        filterData[filter.key] = table.map(row => row[filter.field]).filter(Boolean);
      } catch (err) {
        console.warn(`Erreur lors de la récupération de ${filter.table}:`, err);
        filterData[filter.key] = [];
      }
    }
    
    // Afficher les bulles des filtres
    Object.entries(filterData).forEach(([key, values]) => {
      values.forEach(value => {
        addBubble(key, value);
      });
    });
    
    // Traiter les contacts (records de la table principale Agenda)
    const contacts = records.map(record => {
      return {
        id: record.id,
        Nom_Prenom: record.Nom_Prenom || '',
        Fonction: record.Fonction || '',
        Etablissement: record.Etablissement || '',
        Email: record.Email || '',
        Tel: record.Tel || '',
        // Références multiples - extraire les noms/libellés
        Instances: extractFieldFromReferences(record.Instances, 'nom_instance'),
        Actions: extractFieldFromReferences(record.Actions, 'Action'),
        GT: extractFieldFromReferences(record.GT, 'nom'),
        Communautes: extractFieldFromReferences(record.Communautes, 'communaute'),
        Roles: extractFieldFromReferences(record.Roles, 'role')
      };
    });
    
    window.allContacts = contacts;
    displayContacts(contacts);
    
  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
});

function extractFieldFromReferences(references, fieldName) {
  if (!references) return [];
  if (!Array.isArray(references)) references = [references];
  
  return references
    .map(ref => {
      if (typeof ref === 'object' && ref !== null && fieldName in ref) {
        return ref[fieldName];
      }
      return null;
    })
    .filter(Boolean);
}
