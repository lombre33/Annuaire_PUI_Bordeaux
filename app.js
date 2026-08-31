let grist;
let filteredContacts = [];
let activeFilters = {
  Actions: null,
  Taches: null,
  Communautes: null,
  GT: null,
  Competences: null,
  Instances: null,
  Etablissement: null
};

async function enrich() {
  try {
    const contacts = await grist.getTable('Annuaire').records;
    const actions = await tableToRows(await grist.getTable('Actions').records);
    const taches = await tableToRows(await grist.getTable('Taches').records);
    const communautes = await tableToRows(await grist.getTable('Communautees').records);
    const gt = await tableToRows(await grist.getTable('GT').records);
    const competences = await tableToRows(await grist.getTable('Competences').records);
    const instances = await tableToRows(await grist.getTable('Instances').records);
    const etablissements = await tableToRows(await grist.getTable('Etablissements').records);

    filteredContacts = tableToRows(contacts);

    createFilterUI(actions, 'Actions', 'Action');
    createFilterUI(taches, 'Taches', 'Tache');
    createFilterUI(communautes, 'Communautes', 'communaute');
    createFilterUI(gt, 'GT', 'nom');
    createFilterUI(competences, 'Competences', 'Competence');
    createFilterUI(instances, 'Instances', 'nom_instance');
    createFilterUI(etablissements, 'Etablissement', 'acronyme');

    displayCards();
  } catch (error) {
    console.error('Erreur dans le traitement des contacts:', error);
  }
}

function tableToRows(table) {
  if (!table || typeof table !== 'object') {
    return [];
  }

  if (Array.isArray(table)) {
    return table;
  }

  const keys = Object.keys(table);
  if (keys.length === 0) {
    return [];
  }

  const firstColumn = table[keys[0]];
  if (!Array.isArray(firstColumn)) {
    return [];
  }

  const rows = [];
  for (let i = 0; i < firstColumn.length; i++) {
    const row = {};
    for (const key of keys) {
      row[key] = table[key][i];
    }
    rows.push(row);
  }

  return rows;
}

function createFilterUI(data, filterName, columnName) {
  const container = document.getElementById('filters');
  if (!container) {
    console.error(`Container not found for filter ${filterName}`);
    return;
  }

  const filterBubble = document.createElement('div');
  filterBubble.className = 'filter-bubble';
  filterBubble.textContent = filterName;

  const filterOptions = document.createElement('div');
  filterOptions.className = 'filter-options';

  const uniqueValues = [...new Set(data.map(item => item[columnName]).filter(v => v))];

  uniqueValues.forEach(value => {
    const option = document.createElement('div');
    option.className = 'filter-option';
    option.textContent = value;
    option.addEventListener('click', () => toggleFilter(filterName, value, option));
    filterOptions.appendChild(option);
  });

  filterBubble.addEventListener('click', () => {
    filterOptions.style.display = filterOptions.style.display === 'none' ? 'flex' : 'none';
  });

  const filterContainer = document.createElement('div');
  filterContainer.className = 'filter-container';
  filterContainer.appendChild(filterBubble);
  filterContainer.appendChild(filterOptions);

  container.appendChild(filterContainer);
}

function toggleFilter(filterName, value, optionElement) {
  optionElement.classList.toggle('selected');

  const selectedOptions = document.querySelectorAll(`.filter-option.selected`);
  const filters = {};

  selectedOptions.forEach(option => {
    const parent = option.closest('.filter-container');
    const bubble = parent.querySelector('.filter-bubble');
    const filterType = bubble.textContent;

    if (!filters[filterType]) {
      filters[filterType] = [];
    }
    filters[filterType].push(option.textContent);
  });

  activeFilters = {
    Actions: filters['Actions'] || null,
    Taches: filters['Taches'] || null,
    Communautes: filters['Communautes'] || null,
    GT: filters['GT'] || null,
    Competences: filters['Competences'] || null,
    Instances: filters['Instances'] || null,
    Etablissement: filters['Etablissement'] || null
  };

  displayCards();
}

function displayCards() {
  const container = document.getElementById('contacts');
  container.innerHTML = '';

  filteredContacts.forEach(contact => {
    if (matchesFilters(contact)) {
      const card = createContactCard(contact);
      container.appendChild(card);
    }
  });
}

function matchesFilters(contact) {
  if (activeFilters.Actions && activeFilters.Actions.length > 0) {
    const contactActions = extractValues(contact.Actions);
    if (!activeFilters.Actions.some(f => contactActions.includes(f))) return false;
  }

  if (activeFilters.Taches && activeFilters.Taches.length > 0) {
    const contactTaches = extractValues(contact.Taches);
    if (!activeFilters.Taches.some(f => contactTaches.includes(f))) return false;
  }

  if (activeFilters.Communautes && activeFilters.Communautes.length > 0) {
    const contactCommunautes = extractValues(contact.Communautes);
    if (!activeFilters.Communautes.some(f => contactCommunautes.includes(f))) return false;
  }

  if (activeFilters.GT && activeFilters.GT.length > 0) {
    const contactGT = extractValues(contact.GT);
    if (!activeFilters.GT.some(f => contactGT.includes(f))) return false;
  }

  if (activeFilters.Competences && activeFilters.Competences.length > 0) {
    const contactCompetences = extractValues(contact.Competences);
    if (!activeFilters.Competences.some(f => contactCompetences.includes(f))) return false;
  }

  if (activeFilters.Instances && activeFilters.Instances.length > 0) {
    const contactInstances = extractValues(contact.Instances);
    if (!activeFilters.Instances.some(f => contactInstances.includes(f))) return false;
  }

  if (activeFilters.Etablissement && activeFilters.Etablissement.length > 0) {
    const contactEtablissement = extractValues(contact.Etablissement);
    if (!activeFilters.Etablissement.some(f => contactEtablissement.includes(f))) return false;
  }

  return true;
}

function extractValues(field) {
  if (!field) return [];
  if (typeof field === 'string') return [field];
  if (Array.isArray(field)) {
    return field.map(item => {
      if (typeof item === 'object' && item !== null) {
        return item.nom_instance || item.Action || item.Tache || item.communaute || item.nom || item.Competence || item.acronyme || '';
      }
      return item;
    }).filter(v => v);
  }
  if (typeof field === 'object' && field !== null) {
    return [field.nom_instance || field.Action || field.Tache || field.communaute || field.nom || field.Competence || field.acronyme || ''];
  }
  return [];
}

function createContactCard(contact) {
  const template = document.querySelector('#contact-card-template');
  const card = template.cloneNode(true);
  card.id = '';

  const initials = getInitials(contact.Nom, contact.Prenom);
  card.querySelector('.avatar').textContent = initials;

  card.querySelector('.nom-prenom').textContent = `${contact.Nom} ${contact.Prenom}`;
  card.querySelector('.fonction').textContent = contact.Fonction || '';

  const contactInfo = card.querySelector('.contact-info');
  contactInfo.innerHTML = '';

  if (contact.Email) {
    const emailDiv = document.createElement('div');
    emailDiv.className = 'contact-item';
    emailDiv.innerHTML = `<strong>Email:</strong> <a href="mailto:${contact.Email}">${contact.Email}</a>`;
    contactInfo.appendChild(emailDiv);
  }

  if (contact.Etablissement) {
    const etablissementDiv = document.createElement('div');
    etablissementDiv.className = 'contact-item';
    const etablissementValues = extractValues(contact.Etablissement);
    etablissementDiv.innerHTML = `<strong>Établissement:</strong> ${etablissementValues.join(', ')}`;
    contactInfo.appendChild(etablissementDiv);
  }

  if (contact.Telephone) {
    const telDiv = document.createElement('div');
    telDiv.className = 'contact-item';
    telDiv.innerHTML = `<strong>Tél:</strong> ${contact.Telephone}`;
    contactInfo.appendChild(telDiv);
  }

  const categoriesDiv = card.querySelector('.categories');
  categoriesDiv.innerHTML = '';

  const categories = [
    { name: 'Instances', data: contact.Instances },
    { name: 'Actions', data: contact.Actions },
    { name: 'Taches', data: contact.Taches },
    { name: 'GT', data: contact.GT },
    { name: 'Communautés', data: contact.Communautes },
    { name: 'Rôle PUI', data: contact.Role_Dans_le_PUI },
    { name: 'Compétences', data: contact.Competences }
  ];

  categories.forEach((category, index) => {
    const values = extractValues(category.data);
    if (values.length > 0) {
      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'category';

      const categoryTitle = document.createElement('div');
      categoryTitle.className = 'category-title';
      categoryTitle.textContent = category.name;
      categoryDiv.appendChild(categoryTitle);

      const categoryBubbles = document.createElement('div');
      categoryBubbles.className = 'category-bubbles';

      values.forEach(value => {
        const bubble = document.createElement('div');
        bubble.className = 'category-bubble';
        bubble.textContent = value;
        bubble.addEventListener('click', () => filterByCategory(category.name, value));
        categoryBubbles.appendChild(bubble);
      });

      categoryDiv.appendChild(categoryBubbles);
      categoriesDiv.appendChild(categoryDiv);

      if (index < categories.length - 1) {
        const separator = document.createElement('div');
        separator.className = 'category-separator';
        categoriesDiv.appendChild(separator);
      }
    }
  });

  return card;
}

function filterByCategory(categoryName, value) {
  const options = document.querySelectorAll('.filter-option');
  let found = false;

  options.forEach(option => {
    if (option.textContent === value) {
      const parent = option.closest('.filter-container');
      const bubble = parent.querySelector('.filter-bubble');

      if (bubble.textContent === categoryName || (categoryName === 'Établissement' && bubble.textContent === 'Etablissement')) {
        option.classList.add('selected');
        found = true;
      }
    }
  });

  if (found) {
    const selectedOptions = document.querySelectorAll(`.filter-option.selected`);
    const filters = {};

    selectedOptions.forEach(option => {
      const parent = option.closest('.filter-container');
      const bubble = parent.querySelector('.filter-bubble');
      const filterType = bubble.textContent;

      if (!filters[filterType]) {
        filters[filterType] = [];
      }
      filters[filterType].push(option.textContent);
    });

    activeFilters = {
      Actions: filters['Actions'] || null,
      Taches: filters['Taches'] || null,
      Communautes: filters['Communautes'] || null,
      GT: filters['GT'] || null,
      Competences: filters['Competences'] || null,
      Instances: filters['Instances'] || null,
      Etablissement: filters['Etablissement'] || null
    };

    displayCards();
  }
}

function getInitials(nom, prenom) {
  const n = nom ? nom.charAt(0).toUpperCase() : '';
  const p = prenom ? prenom.charAt(0).toUpperCase() : '';
  return (n + p) || '?';
}

grist = window.grist;
grist.ready();
grist.onRecords(enrich);