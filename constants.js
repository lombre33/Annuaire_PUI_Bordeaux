// Table principale du document Grist : une ligne par personne.
export const MAIN_TABLE = 'BDD';

// Case à cocher de BDD par laquelle une personne accepte d'apparaître. Un seul nom
// pour la lecture (grist-data.js) et l'écriture (presence.js) : les deux ne
// peuvent pas diverger.
export const CONSENT_COLUMN = 'Accepte_apparaitre';

// Table-sonde qui dit au widget qui est connecté (voir identity.js). Elle appartient
// au document et se crée à la main : GRIST_SETUP.md donne ses colonnes.
export const PROBE_TABLE = 'Annuaire_Sonde';

// Taxonomie : une entrée par catégorie de filtre ou de tag de carte. Source
// unique des menus, des tags et des tables de référence à lire.
//   label, color  affichage
//   table, field  table de référence et colonne de libellé (`field` peut lister
//                 plusieurs colonnes, essayées dans l'ordre : le libellé
//                 corrigé d'abord, le libellé brut de l'import en repli)
//   column        colonne ReferenceList de BDD qui y renvoie ; absente pour les
//                 Références simples Établissement et Rôle
//   hint          infobulle du bouton de filtre, quand son nom ne suffit pas
//   groups        catégorie dont celle-ci est un regroupement : elle lit une
//                 autre colonne de la même table (les compétences macro sont
//                 une colonne de la table Competences) ; `fallback` est alors le
//                 libellé des lignes que ce regroupement ne couvre pas
//
// Les libellés lus de Grist sont rangés par clé de catégorie (referenceMaps),
// pas par table : deux catégories peuvent lire la même table.
export const CATEGORIES = {
  actions: { label: 'Actions', color: '#f28a54', table: 'Actions', field: ['Actions_corrigees', 'Actions'], column: 'Actions' },
  taches: { label: 'Tâches', color: '#ff9800', table: 'Taches', field: ['Taches_corrige', 'Taches'], column: 'Taches' },
  communautes: { label: 'Communautés', color: '#d85b9d', table: 'Communautes', field: ['communautes_corrigees', 'communautes'], column: 'Communautes' },
  gt: { label: 'GT', color: '#1ba99a', table: 'GT', field: ['GT_corrige', 'GT'], column: 'GT' },
  competences: { label: 'Compétences', color: '#9c27b0', table: 'Competences', field: ['Competences_corrigees', 'Competences'], column: 'Competences' },
  macro: {
    label: 'Domaines', color: '#6a1b9a', table: 'Competences', field: ['Macro_competences'], column: 'Competences',
    hint: 'Compétences macro : les compétences regroupées par domaine', groups: 'competences', fallback: 'Autres'
  },
  instances: { label: 'Instances', color: '#4f8ee8', table: 'INSTANCES', field: ['Instances_Corrigees', 'Instances'], column: 'Instances' },
  etablissement: { label: 'Établissement', color: '#147c72', table: 'Etablissements', field: ['acronyme', 'nom_complet'] },
  role: { label: 'Rôle PUI', color: '#8b5fc4', table: 'Role_Dans_le_PUI', field: 'Role' }
};

// Ordre des boutons de filtre. Rôle PUI n'a pas de filtre (specs.md).
const FILTER_KEYS = ['actions', 'taches', 'communautes', 'gt', 'macro', 'competences', 'instances', 'etablissement'];

// Ordre des sections de tags d'une carte. Établissement a son badge dédié ; les
// compétences macro n'y figurent pas : la carte garde le détail des compétences.
const TAG_KEYS = ['instances', 'actions', 'gt', 'competences', 'communautes', 'taches', 'role'];

const withKey = key => ({ key, ...CATEGORIES[key] });

export const FILTERS = FILTER_KEYS.map(withKey);
export const TAG_GROUPS = TAG_KEYS.map(withKey);

// Tables de référence à lire, chacune une seule fois même si plusieurs
// catégories s'y appuient.
export const REFERENCE_TABLES = [...new Set(Object.values(CATEGORIES).map(({ table }) => table))];

// Un libellé à lire par catégorie : { key, table, field } et, pour un
// regroupement, { groups, fallback }.
export const REFERENCE_SOURCES = Object.entries(CATEGORIES)
  .map(([key, { table, field, groups, fallback }]) => ({ key, table, field, ...(groups && { groups, fallback }) }));

// Catégories dont BDD porte une colonne ReferenceList ; `groups` pour un
// regroupement.
export const LIST_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([, category]) => category.column)
  .map(([key, { column, table, groups }]) => ({ key, column, table, ...(groups && { groups }) }));
