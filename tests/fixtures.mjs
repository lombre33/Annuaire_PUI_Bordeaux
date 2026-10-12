// Jeu de données de test partagé par les tests de pipeline (Node) et le test
// navigateur. Reproduit les encodages Grist constatés en production :
// colonnes en vecteurs, listes ['L', ...], références déjà résolues en texte
// (visible column) ou en id, téléphone Numeric sans le 0 initial.
//
// Résultat attendu avec ces données (voir les tests) :
//   Fondateurs seuls   → Ana, Hostile, Gina, Hugo (4)
//   + Partenaires      → + Bob (5)
//   jamais affichés    → Carla (établissement « autres »), Dan (non validé),
//                        Eve (sans Etablissement2), Fred (hors périmètre),
//                        le contact sans nom.

export const HOSTILE_FIRST_NAME = '<img src=x onerror="window.__xss=1">';

export function sampleTables() {
  return {
    Annuaire: {
      id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      Prenom: ['Ana', 'Bob', 'Carla', 'Dan', 'Eve', HOSTILE_FIRST_NAME, 'Fred', '', 'Gina', 'Hugo'],
      Nom: ['Martin', 'Durand', 'Lopez', 'Petit', 'Sans', 'Hostile', 'Horsperimetre', '', 'Bergonié', 'Bernard'],
      Email: ['ana.martin@chu-bordeaux.fr', 'bob@u-bordeaux-montaigne.fr', 'carla@clinique.fr', 'dan@inserm.fr',
        'eve@example.fr', 'hostile@chu-bordeaux.fr', 'fred@chu-bordeaux.fr', 'x@chu-bordeaux.fr',
        'gina@bergonie.fr?cc=intrus@example.fr', ''],
      fonction: ['Pharmacienne', 'Chargé de mission', '', '', '', '', '', '', 'Directrice', ''],
      numero_de_telephone: [556789012, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      Etablissement2: ['CHU', 'UBM', 'Clinique', 'INSERM', '', 'CHU', 'CHU', 'CHU', 'Institut Bergonié', 'CHU'],
      // Une référence arrive soit en id, soit déjà résolue en texte.
      Role_dans_le_PUI: ['Référent qualité', 0, 0, 0, 0, 0, 0, 0, 0, 0],
      Instances: [['L', 1], ['L', 1, 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 999]],
      Actions: [['L', 'Vaccination'], ['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      GT: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Communautee_s_: [['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Taches: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      competences_1: ['oncologie', '', '', '', '', '', '', '', '', ''],
      perimetre_all: [['L', 1], ['L', 2], ['L', 1], ['L', 1], ['L', 1], ['L', 1], ['L'], ['L', 1], ['L', 3], ['L', 1]]
    },
    Etablissements: {
      id: [1, 2, 3, 4, 5],
      acronyme: ['CHU', 'UBM', 'Clinique', 'INSERM', ''],
      nom_complet: ['CHU de Bordeaux', 'Université Bordeaux Montaigne', 'Clinique du Parc', 'INSERM', 'Institut Bergonié'],
      fondateur: [true, false, false, true, true],
      partenaire: [false, true, false, false, false],
      autres: [false, false, true, false, false],
      ok_pour_apparaitre: [true, true, true, false, true]
    },
    Instances: { id: [1, 2, 3], nom_instance: ['CME', '', 'COVIRIS'] },
    Actions: { id: [1, 2], Action: ['Vaccination', 'Audit'] },
    Communautees: { id: [1, 2], communaute: ['Soins palliatifs', 'Réseau douleur'] },
    Taches: { id: [1], taches: ['Relecture'] },
    GT: { id: [1], nom: ['GT qualité'] },
    Competances: { id: [1], Competences: ['Oncologie'] },
    Role_Dans_le_PUI: { id: [1], Role: ['Référent qualité'] }
  };
}

// Noms affichés (« Prénom Nom ») dans l'ordre des cartes, périmètre par défaut.
export const DEFAULT_CARD_NAMES = [
  'Ana Martin',
  `${HOSTILE_FIRST_NAME} Hostile`,
  'Gina Bergonié',
  'Hugo Bernard'
];
