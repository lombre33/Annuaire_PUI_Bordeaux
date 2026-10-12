// Taxonomie : une entrée par catégorie de filtre ou de tag de carte. Source
// unique des menus, des tags et des tables de référence à lire.
//   label, color  affichage
//   table, field  table de référence et colonne de libellé (`field` peut lister
//                 plusieurs colonnes, essayées dans l'ordre)
//   column        colonne ReferenceList d'Annuaire qui y renvoie ; absente pour
//                 Compétences (texte libre) et pour les Références simples
//                 Établissement et Rôle
export const CATEGORIES = {
  actions: { label: 'Actions', color: '#f28a54', table: 'Actions', field: 'Action', column: 'Actions' },
  taches: { label: 'Tâches', color: '#ff9800', table: 'Taches', field: 'taches', column: 'Taches' },
  communautes: { label: 'Communautés', color: '#d85b9d', table: 'Communautees', field: 'communaute', column: 'Communautee_s_' },
  gt: { label: 'GT', color: '#1ba99a', table: 'GT', field: 'nom', column: 'GT' },
  competences: { label: 'Compétences', color: '#9c27b0', table: 'Competances', field: 'Competences' },
  instances: { label: 'Instances', color: '#4f8ee8', table: 'Instances', field: 'nom_instance', column: 'Instances' },
  etablissement: { label: 'Établissement', color: '#147c72', table: 'Etablissements', field: ['acronyme', 'nom_complet'] },
  role: { label: 'Rôle PUI', color: '#8b5fc4', table: 'Role_Dans_le_PUI', field: 'Role' }
};

// Ordre des boutons de filtre. Rôle PUI n'a pas de filtre (specs.md).
const FILTER_KEYS = ['actions', 'taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement'];

// Ordre des sections de tags d'une carte. Établissement a son badge dédié.
const TAG_KEYS = ['instances', 'actions', 'gt', 'competences', 'communautes', 'taches', 'role'];

const withKey = key => ({ key, ...CATEGORIES[key] });

export const FILTERS = FILTER_KEYS.map(withKey);
export const TAG_GROUPS = TAG_KEYS.map(withKey);

// [table, colonne de libellé] de chaque table de référence à lire.
export const REFERENCE_TABLES = Object.values(CATEGORIES).map(({ table, field }) => [table, field]);

// Catégories dont Annuaire porte une colonne ReferenceList.
export const LIST_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([, category]) => category.column)
  .map(([key, { column, table }]) => ({ key, column, table }));
