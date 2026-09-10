// Taxonomie des filtres/tags — source unique partagée par le rendu des filtres,
// le rendu des cartes et la logique de filtrage.

export const FILTERS = [
  { key: 'actions', label: 'Actions', table: 'Actions', field: 'Action', color: '#f28a54' },
  { key: 'taches', label: 'Tâches', table: 'Taches', field: 'taches', color: '#ff9800' },
  { key: 'communautes', label: 'Communautés', table: 'Communautees', field: 'communaute', color: '#d85b9d' },
  { key: 'gt', label: 'GT', table: 'GT', field: 'nom', color: '#1ba99a' },
  { key: 'competences', label: 'Compétences', table: 'Competances', field: 'Competences', color: '#9c27b0' },
  { key: 'instances', label: 'Instances', table: 'Instances', field: 'nom_instance', color: '#4f8ee8' },
  { key: 'etablissement', label: 'Établissement', table: 'Etablissements', field: 'acronyme', color: '#147c72' }
];

export const TAG_GROUPS = [
  { key: 'instances', label: 'Instances', color: '#4f8ee8' },
  { key: 'actions', label: 'Actions', color: '#f28a54' },
  { key: 'gt', label: 'GT', color: '#1ba99a' },
  { key: 'competences', label: 'Compétences', color: '#9c27b0' },
  { key: 'communautes', label: 'Communautés', color: '#d85b9d' },
  { key: 'taches', label: 'Tâches', color: '#ff9800' },
  { key: 'etablissement', label: 'Établissement', color: '#147c72' },
  { key: 'role', label: 'Rôle PUI', color: '#8b5fc4' }
];
