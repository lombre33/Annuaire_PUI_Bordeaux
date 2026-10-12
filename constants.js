// Table principale du document Grist : une ligne par personne.
export const MAIN_TABLE = 'BDD';

// Taxonomie : une entrée par catégorie de filtre ou de tag de carte. Source
// unique des menus, des tags et des tables de référence à lire.
//   label, color  affichage
//   table, field  table de référence et colonne de libellé (`field` peut lister
//                 plusieurs colonnes, essayées dans l'ordre : le libellé
//                 corrigé d'abord, le libellé brut de l'import en repli)
//   column        colonne ReferenceList de BDD qui y renvoie ; absente pour les
//                 Références simples Établissement et Rôle
export const CATEGORIES = {
  actions: { label: 'Actions', color: '#f28a54', table: 'Actions', field: ['Actions_corrigees', 'Actions'], column: 'Actions' },
  taches: { label: 'Tâches', color: '#ff9800', table: 'Taches', field: ['Taches_corrige', 'Taches'], column: 'Taches' },
  communautes: { label: 'Communautés', color: '#d85b9d', table: 'Communautes', field: ['communautes_corrigees', 'communautes'], column: 'Communautes' },
  gt: { label: 'GT', color: '#1ba99a', table: 'GT', field: ['GT_corrige', 'GT'], column: 'GT' },
  competences: { label: 'Compétences', color: '#9c27b0', table: 'Competences', field: ['Competences_corrigees', 'Competences'], column: 'Competences' },
  instances: { label: 'Instances', color: '#4f8ee8', table: 'INSTANCES', field: ['Instances_Corrigees', 'Instances'], column: 'Instances' },
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

// [table, colonnes de libellé] de chaque table de référence à lire.
export const REFERENCE_TABLES = Object.values(CATEGORIES).map(({ table, field }) => [table, field]);

// Catégories dont BDD porte une colonne ReferenceList.
export const LIST_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([, category]) => category.column)
  .map(([key, { column, table }]) => ({ key, column, table }));
