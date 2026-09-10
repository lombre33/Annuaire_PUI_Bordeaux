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

// Première valeur non vide parmi plusieurs colonnes candidates, dans l'ordre.
export function pickLabel(row, fields) {
  return fields.map(field => text(row[field])).find(Boolean) || '';
}

// Une colonne Référence UNIQUE (pas ReferenceList) peut arriver sous 3 formes
// différentes depuis l'API Grist, selon que la table liée a une "visible
// column" configurée ou non :
//   - déjà résolue en texte d'affichage (ex: "UBM") si une visible column
//     est configurée sur la table liée — cas réel constaté sur Etablissements ;
//   - encodée ['R', tableId, rowId] ;
//   - un id numérique déjà nu.
// refId() n'extrait un id que dans les 2 derniers cas (une chaîne n'est PAS
// un id, c'est du texte déjà résolu — refLabel() la traite séparément).
export function refId(value) {
  if (Array.isArray(value)) {
    return value[0] === 'R' && value.length >= 3 ? value[2] : null;
  }
  if (typeof value === 'string') return null;
  return value || null;
}

// Résout une colonne Référence unique vers son libellé affichable, quelle
// que soit la forme sous laquelle Grist l'a envoyée (voir refId() ci-dessus).
export function refLabel(value, referenceMap) {
  if (typeof value === 'string') return text(value);
  const id = refId(value);
  return (id && referenceMap?.[String(id)]) || '';
}

// ===== CHARGER UNE TABLE DE RÉFÉRENCE (id -> libellé) =====
// labelFields accepte un nom de colonne unique, ou un tableau de colonnes
// essayées dans l'ordre (la première non vide gagne) — utile quand la colonne
// "principale" (ex: acronyme) n'est pas systématiquement renseignée.
export async function fetchTable(tableName, labelFields) {
  const fields = Array.isArray(labelFields) ? labelFields : [labelFields];
  try {
    const table = await window.grist.docApi.fetchTable(tableName);
    const rows = tableToRows(table);
    const map = {};
    let rowsWithoutLabel = 0;
    rows.forEach(row => {
      const label = pickLabel(row, fields);
      if (row.id === null || row.id === undefined) return;
      if (label) {
        map[String(row.id)] = label;
      } else {
        rowsWithoutLabel += 1;
      }
    });
    console.info(`[REFS] ${tableName}: ${Object.keys(map).length} entrées`
      + (rowsWithoutLabel ? ` (${rowsWithoutLabel} ligne(s) sans ${fields.join('/')})` : ''));
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

  enriched.etablissement_label =
    refLabel(contact.Etablissement, referenceMaps['Etablissements']) ||
    text(contact.Etablissement2) || '';

  enriched.role_label = refLabel(contact.Role_dans_le_PUI, referenceMaps['Role_Dans_le_PUI']);

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
