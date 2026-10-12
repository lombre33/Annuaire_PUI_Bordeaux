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
//   actions des tâches → aucune : ses tâches et ses actions n'ont pas de numéro (voir
//                        withTaskActions pour les tâches rangées par action)
//   jamais affichés    → Carla (établissement « autres »), Dan (non validé),
//                        Eve (sans établissement), Fred (hors périmètre),
//                        le contact sans nom, Iris (a refusé d'apparaître) et
//                        Jules (n'a pas répondu : Accepte_apparaitre vide).
//   Tous les autres ont accepté d'apparaître : chaque règle de visibilité se
//   teste ainsi seule.

export const HOSTILE_FIRST_NAME = '<img src=x onerror="window.__xss=1">';

export function sampleTables() {
  return {
    BDD: {
      id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      prenom: ['Ana', 'Bob', 'Carla', 'Dan', 'Eve', HOSTILE_FIRST_NAME, 'Fred', '', 'Gina', 'Hugo', 'Iris', 'Jules'],
      nom: ['Martin', 'Durand', 'Lopez', 'Petit', 'Sans', 'Hostile', 'Horsperimetre', '', 'Bergonié', 'Bernard', 'Refus', 'Sansreponse'],
      email: ['ana.martin@chu-bordeaux.fr', 'bob@u-bordeaux-montaigne.fr', 'carla@clinique.fr', 'dan@inserm.fr',
        'eve@example.fr', 'hostile@chu-bordeaux.fr', 'fred@chu-bordeaux.fr', 'x@chu-bordeaux.fr',
        'gina@bergonie.fr?cc=intrus@example.fr', '', 'iris@chu-bordeaux.fr', 'jules@chu-bordeaux.fr'],
      Fonction: ['Pharmacienne', 'Chargé de mission', '', '', '', '', '', '', 'Directrice', '', '', ''],
      // Référence vers Etablissements : identifiant de ligne, 0 quand elle est vide.
      Etablissement: [1, 2, 3, 4, 0, 1, 1, 1, 5, 1, 1, 1],
      Instances: [['L', 1], ['L', 1, 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 999], ['L'], ['L']],
      // Une liste arrive en identifiants, parfois déjà résolue en texte.
      Actions: [['L', 'Vaccination'], ['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      GT: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Communautes: [['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Taches: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      // Ana : deux compétences du même domaine ; Bob : un autre domaine ; Gina :
      // une compétence que Macro_competences ne classe pas.
      Competences: [['L', 1, 2], ['L', 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 4], ['L'], ['L'], ['L']],
      perimetre: [['L', 1], ['L', 2], ['L', 1], ['L', 1], ['L', 1], ['L', 1], ['L'], ['L', 1], ['L', 3], ['L', 1], ['L', 1], ['L', 1]],
      // Colonnes facultatives, rajoutées dans BDD sous ces noms : Numeric (le 0
      // initial est perdu) et Référence vers Role_Dans_le_PUI (0 = vide).
      numero_de_telephone: [556789012, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      Role_dans_le_PUI: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      // Case à cocher : seul `true` vaut accord. Iris a refusé, Jules n'a pas
      // répondu (cellule vide).
      Accepte_apparaitre: [true, true, true, true, true, true, true, true, true, true, false, null]
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

// Les tâches rangées par action : le numéro avant le point du libellé d'une tâche est celui
// de son action, que la table Actions porte dans son libellé. Les deux actions de la base de
// départ sont numérotées, et quatre tâches sont portées par BDD.Taches. Avec ces données
// (périmètre par défaut ; Bob est partenaire) :
//   Action 1 : Vaccination  → 1.1 Relecture (Ana), 1.2 Rappel vaccinal (Gina ; libellé corrigé)
//   Action 2 : Audit        → 2.1 Inspection (Ana, Bob)
//   Sans action             → Veille (Hugo), une tâche sans numéro
export function withTaskActions(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.Actions.Actions = ['Action 1 : Vaccination', 'Action 2 : Audit'];
  copy.BDD.Actions[0] = ['L', 1]; // Ana : la ligne numérotée, plus le texte « Vaccination »
  copy.Taches = {
    id: [1, 2, 3, 4],
    Taches: ['1.1 Relecture', '1.2 rappel vaccinal', '2.1 Inspection', 'Veille'],
    Taches_corrige: ['', '1.2 Rappel vaccinal', '', ''],
    Taches_role: ['', '', '', '']
  };
  const tasksOf = { 1: ['L', 1, 3], 2: ['L', 3], 9: ['L', 2], 10: ['L', 4] };
  copy.BDD.Taches = copy.BDD.id.map(id => tasksOf[id] || ['L']);
  return copy;
}

// Adresses de personnes de l'exemple. Ana figure dans BDD et dans ACL (administratrice,
// écrite avec des majuscules dans ACL) ; ADMIN_EMAIL est administrateur sans ligne
// dans BDD ; Iris a refusé d'apparaître ; Bob est partenaire (UBM).
export const ANA_EMAIL = 'ana.martin@chu-bordeaux.fr';
export const BOB_EMAIL = 'bob@u-bordeaux-montaigne.fr';
export const IRIS_EMAIL = 'iris@chu-bordeaux.fr';
export const ADMIN_EMAIL = 'admin@chu-bordeaux.fr';

// Le document complété des deux tables que le widget lit pour identifier la
// personne connectée (GRIST_SETUP.md) : ACL, et la table-sonde, vide au repos.
export function withIdentity(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.ACL = {
    id: [1, 2, 3],
    email: ['Ana.Martin@CHU-Bordeaux.fr', ADMIN_EMAIL, BOB_EMAIL],
    Responsable_de_l_Etablissement: [1, 0, 2],
    admin: [true, true, false]
  };
  copy.Annuaire_Sonde = { id: [], Email: [], Admin: [] };
  return copy;
}

// Les métadonnées que Grist expose par fetchTable('_grist_Tables') et
// fetchTable('_grist_Tables_column') : le type des colonnes de BDD qui comptent pour
// écrire (le téléphone est Numeric, comme dans le document d'origine).
export function withSchema(tables = sampleTables(), { phoneType = 'Numeric' } = {}) {
  const copy = structuredClone(tables);
  copy._grist_Tables = { id: [1, 2], tableId: ['BDD', 'Etablissements'] };
  const bdd = [
    ['prenom', 'Text'], ['nom', 'Text'], ['email', 'Text'], ['Fonction', 'Text'], ['numero_de_telephone', phoneType],
    ['Etablissement', 'Ref:Etablissements'], ['Role_dans_le_PUI', 'Ref:Role_Dans_le_PUI'],
    ['Instances', 'RefList:INSTANCES'], ['Actions', 'RefList:Actions'], ['GT', 'RefList:GT'],
    ['Communautes', 'RefList:Communautes'], ['Taches', 'RefList:Taches'], ['Competences', 'RefList:Competences'],
    ['perimetre', 'RefList:REMMAPING_PERIMETRES_COMPETENCES'], ['Accepte_apparaitre', 'Bool']
  ];
  copy._grist_Tables_column = {
    id: bdd.map((_, index) => index + 1),
    parentId: bdd.map(() => 1),
    colId: bdd.map(([colId]) => colId),
    type: bdd.map(([, type]) => type)
  };
  return copy;
}

// Noms affichés (« Prénom Nom ») dans l'ordre des cartes, périmètre par défaut.
export const DEFAULT_CARD_NAMES = [
  'Ana Martin',
  `${HOSTILE_FIRST_NAME} Hostile`,
  'Gina Bergonié',
  'Hugo Bernard'
];
