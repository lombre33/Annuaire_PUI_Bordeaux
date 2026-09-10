// Fonctions pures de conversion/enrichissement des données Grist.
// Aucune de ces fonctions ne touche le DOM : elles sont testables telles quelles
// (voir tests/data.test.mjs).

export function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

// Grist encode les colonnes Liste/RéférenceListe sous la forme ['L', item1, item2, ...].
// Une liste réellement vide est donc ['L'] (longueur 1, pas 0) : il faut retirer ce
// marqueur avant de savoir si la liste contient de vraies valeurs.
export function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '');
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

// ===== CONVERSION GRIST: Column-oriented → Row-oriented =====
export function tableToRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table;

  const ids = Array.isArray(table.id) ? table.id : [];
  return ids.map((id, index) => {
    const row = { id };
    Object.keys(table).forEach(key => {
      if (key !== 'id' && Array.isArray(table[key])) {
        row[key] = table[key][index] ?? null;
      }
    });
    return row;
  });
}

// ===== CHARGER UNE TABLE DE RÉFÉRENCE (id -> libellé) =====
export async function fetchTable(tableName, labelField) {
  try {
    const table = await window.grist.docApi.fetchTable(tableName);
    const rows = tableToRows(table);
    const map = {};
    rows.forEach(row => {
      const label = text(row[labelField]);
      if (row.id !== null && row.id !== undefined && label) {
        map[String(row.id)] = label;
      }
    });
    console.info(`[REFS] ${tableName}: ${Object.keys(map).length} entrées`);
    return map;
  } catch (error) {
    console.warn(`[REFS] Impossible de charger ${tableName}`, error);
    return {};
  }
}

// ===== ENRICHIR UN CONTACT =====
export function enrich(contact, referenceMaps) {
  const enriched = {
    ...contact,
    instances_labels: [],
    actions_labels: [],
    gt_labels: [],
    communautes_labels: [],
    taches_labels: [],
    competences_labels: [],
    etablissement_label: '',
    role_label: ''
  };

  const instanceIds = safeValues(contact.Instances);
  enriched.instances_labels = instanceIds
    .map(id => referenceMaps['Instances']?.[String(id)] || text(id))
    .filter(Boolean);

  const actionIds = safeValues(contact.Actions);
  enriched.actions_labels = actionIds
    .map(id => referenceMaps['Actions']?.[String(id)] || text(id))
    .filter(Boolean);

  const gtIds = safeValues(contact.GT);
  enriched.gt_labels = gtIds
    .map(id => referenceMaps['GT']?.[String(id)] || text(id))
    .filter(Boolean);

  const communauteIds = safeValues(contact.Communautee_s_);
  enriched.communautes_labels = communauteIds
    .map(id => referenceMaps['Communautees']?.[String(id)] || text(id))
    .filter(Boolean);

  const tachesIds = safeValues(contact.Taches);
  enriched.taches_labels = tachesIds
    .map(id => referenceMaps['Taches']?.[String(id)] || text(id))
    .filter(Boolean);

  const competences = [];
  for (let i = 1; i <= 15; i++) {
    const value = text(contact[`competences_${i}`]);
    if (value) competences.push(value);
  }
  enriched.competences_labels = competences;

  const etablissementId = contact.Etablissement;
  enriched.etablissement_label =
    (etablissementId && referenceMaps['Etablissements']?.[String(etablissementId)]) ||
    text(contact.Etablissement2) || '';

  const roleId = contact.Role_dans_le_PUI;
  enriched.role_label =
    (roleId && referenceMaps['Role_Dans_le_PUI']?.[String(roleId)]) ||
    text(roleId) || '';

  return enriched;
}

// Un contact n'est affiché que s'il a au moins une vraie valeur dans perimetre_all
// (cahier des charges, specs.md). Réutilise safeValues() pour rester cohérent avec
// le reste du code sur l'encodage des listes Grist.
//
// Correction régression: l'ancien contrôle testait `Array.isArray(p) && p.length > 0`,
// ce qui était toujours vrai (le marqueur 'L' compte dans la longueur), même pour un
// perimetre_all vide. Voir tests/data.test.mjs pour le test de non-régression.
export function isInScope(record) {
  return safeValues(record.perimetre_all).length > 0;
}
