// Taxonomie des filtres/tags — source unique partagée par le rendu des filtres,
// le rendu des cartes et la logique de filtrage.

export const FILTERS = [
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#ff9800' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'Competences', color: '#9c27b0' },
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  // acronyme d'abord, nom_complet en repli si l'acronyme n'est pas renseigné
  // pour cette ligne (cf. CHANGELOG — cause du bug "établissement invisible").
  { key: 'etablissement', label: 'Établissement', table: 'Etablissements', field: ['acronyme', 'nom_complet'], color: '#147c72' }
];

// Source unique : main.js dérive sa liste de tables à charger de FILTERS (plus
// ROLE_REFERENCE ci-dessous) au lieu de dupliquer table/field à la main — évite
// le risque de désynchronisation entre les deux (constaté lors de l'audit :
// FILTERS.etablissement et la liste dupliquée de main.js avaient divergé).
//
// Établissement n'apparaît pas dans TAG_GROUPS : il a son propre badge dédié
// sur la carte (voir render.js), pas une section de tags générique.
export const TAG_GROUPS = [
  { key: 'instances', label: 'Instances', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', color: '#f28a54' },
  { key: 'gt', label: 'GT', color: '#1ba99a' },
  { key: 'competences', label: 'Compétences', color: '#9c27b0' },
  { key: 'communautes', label: 'Communautés', color: '#d85b9d' },
  { key: 'taches', label: 'Tâches', color: '#ff9800' },
  { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }
];

// Role_dans_le_PUI n'a pas de filtre dédié (seulement un tag de carte, cf.
// TAG_GROUPS), donc pas d'entrée dans FILTERS — sa table de référence est
// déclarée ici pour que main.js puisse quand même la charger.
export const ROLE_REFERENCE = { table: 'Role_Dans_le_PUI', field: 'Role' };
