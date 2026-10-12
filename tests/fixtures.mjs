// Jeu de données de test partagé par les tests de pipeline (Node) et le test
// navigateur. Reproduit la structure Grist actuelle (table BDD) et les
// encodages constatés en production : colonnes en vecteurs, références en
// identifiant de ligne (0 = vide), listes ['L', ...], parfois déjà résolues en
// texte.
//
// Résultat attendu avec ces données (voir les tests) :
//   Fondateurs seuls   → Ana, Hostile, Gina, Hugo (4)
//   + Partenaires      → + Bob (5)
//   domaines           → Cancérologie : Ana ; Pharmacie : Bob ; Autres : Gina
//   jamais affichés    → Carla (établissement « autres »), Dan (non validé),
//                        Eve (sans établissement), Fred (hors périmètre),
//                        le contact sans nom.

export const HOSTILE_FIRST_NAME = '<img src=x onerror="window.__xss=1">';

export function sampleTables() {
  return {
    BDD: {
      id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      prenom: ['Ana', 'Bob', 'Carla', 'Dan', 'Eve', HOSTILE_FIRST_NAME, 'Fred', '', 'Gina', 'Hugo'],
      nom: ['Martin', 'Durand', 'Lopez', 'Petit', 'Sans', 'Hostile', 'Horsperimetre', '', 'Bergonié', 'Bernard'],
      email: ['ana.martin@chu-bordeaux.fr', 'bob@u-bordeaux-montaigne.fr', 'carla@clinique.fr', 'dan@inserm.fr',
        'eve@example.fr', 'hostile@chu-bordeaux.fr', 'fred@chu-bordeaux.fr', 'x@chu-bordeaux.fr',
        'gina@bergonie.fr?cc=intrus@example.fr', ''],
      Fonction: ['Pharmacienne', 'Chargé de mission', '', '', '', '', '', '', 'Directrice', ''],
      // Référence vers Etablissements : identifiant de ligne, 0 quand elle est vide.
      Etablissement: [1, 2, 3, 4, 0, 1, 1, 1, 5, 1],
      Instances: [['L', 1], ['L', 1, 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 999]],
      // Une liste arrive en identifiants, parfois déjà résolue en texte.
      Actions: [['L', 'Vaccination'], ['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      GT: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Communautes: [['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Taches: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      // Ana : deux compétences du même domaine ; Bob : un autre domaine ; Gina :
      // une compétence que Macro_competences ne classe pas.
      Competences: [['L', 1, 2], ['L', 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 4], ['L']],
      perimetre: [['L', 1], ['L', 2], ['L', 1], ['L', 1], ['L', 1], ['L', 1], ['L'], ['L', 1], ['L', 3], ['L', 1]],
      // Colonnes facultatives, rajoutées dans BDD sous ces noms : Numeric (le 0
      // initial est perdu) et Référence vers Role_Dans_le_PUI (0 = vide).
      numero_de_telephone: [556789012, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      Role_dans_le_PUI: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // Colonne de données à créer côté Grist ; aujourd'hui une formule « =False »
      // : elle ne doit donc pas (encore) influencer l'affichage.
      Accepte_apparaitre: [false, false, false, false, false, false, false, false, false, false]
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
    // Chaque table de référence : libellé brut + libellé « corrigé » (prioritaire
    // quand il est rempli).
    INSTANCES: {
      id: [1, 2, 3],
      Instances: ['CME', '', 'Coviris (ancien nom)'],
      Instances_Corrigees: ['', '', 'COVIRIS']
    },
    Actions: { id: [1, 2], Actions: ['Vaccination', 'Audit'], Actions_corrigees: ['', ''] },
    Communautes: {
      id: [1, 2],
      communautes: ['Soins palliatifs', 'Réseau douleur'],
      communautes_corrigees: ['', '']
    },
    Taches: { id: [1], Taches: ['Relecture'], Taches_corrige: [''], Taches_role: [''] },
    GT: { id: [1], GT: ['GT qualité'], GT_corrige: [''] },
    // Macro_competences : texte libre, parfois écrit autrement (id 2 : casse
    // différente du domaine de l'id 1) ou laissé vide (id 4).
    Competences: {
      id: [1, 2, 3, 4],
      Competences: ['oncologie', 'hematologie', 'Pharmacovigilance', 'Divers'],
      Competences_corrigees: ['Oncologie', 'Hématologie', '', ''],
      Macro_competences: ['Cancérologie', 'cancérologie', 'Pharmacie', '']
    },
    Role_Dans_le_PUI: { id: [1], Role: ['Référent qualité'] }
  };
}

// Un document où les colonnes facultatives de BDD (téléphone, rôle PUI) n'existent
// pas : le widget doit s'afficher sans elles, sans erreur ni ligne vide.
export function withoutOptionalColumns(tables) {
  const copy = structuredClone(tables);
  delete copy.BDD.numero_de_telephone;
  delete copy.BDD.Role_dans_le_PUI;
  return copy;
}

// Noms affichés (« Prénom Nom ») dans l'ordre des cartes, périmètre par défaut.
export const DEFAULT_CARD_NAMES = [
  'Ana Martin',
  `${HOSTILE_FIRST_NAME} Hostile`,
  'Gina Bergonié',
  'Hugo Bernard'
];
