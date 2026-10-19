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
//                        Eve (sans établissement), Fred (établissement absent d'Etablissements),
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
      nom: ['Martin', 'Durand', 'Lopez', 'Petit', 'Sans', 'Hostile', 'Inconnu', '', 'Bergonié', 'Bernard', 'Refus', 'Sansreponse'],
      email: ['ana.martin@chu-bordeaux.example', 'bob@u-bordeaux-montaigne.example', 'carla@clinique.example', 'dan@inserm.example',
        'eve@example.example', 'hostile@chu-bordeaux.example', 'fred@chu-bordeaux.example', 'x@chu-bordeaux.example',
        'gina@bergonie.example?cc=intrus@example.example', '', 'iris@chu-bordeaux.example', 'jules@chu-bordeaux.example'],
      Fonction: ['Pharmacienne', 'Chargé de mission', '', '', '', '', '', '', 'Directrice', '', '', ''],
      // Référence vers Etablissements : identifiant de ligne, 0 quand elle est vide.
      Etablissement: [1, 2, 3, 4, 0, 1, 99, 1, 5, 1, 1, 1],
      Instances: [['L', 1], ['L', 1, 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 999], ['L'], ['L']],
      // Une liste arrive en identifiants, parfois déjà résolue en texte.
      Actions: [['L', 'Vaccination'], ['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      GT: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Communautes: [['L', 2], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      Taches: [['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L']],
      // Ana : deux compétences du même domaine ; Bob : un autre domaine ; Gina :
      // une compétence que Macro_competences ne classe pas.
      Competences: [['L', 1, 2], ['L', 3], ['L'], ['L'], ['L'], ['L'], ['L'], ['L'], ['L', 4], ['L'], ['L'], ['L']],
      // Hugo n'a aucun périmètre (['L'] : une liste vide) et apparaît quand même : le périmètre ne décide de rien.
      perimetre: [['L', 1], ['L', 2], ['L', 1], ['L', 1], ['L', 1], ['L', 1], ['L', 1], ['L', 1], ['L', 3], ['L'], ['L', 1], ['L', 1]],
      // Colonnes facultatives, rajoutées dans BDD sous ces noms : Numeric (le 0
      // initial est perdu) et Référence vers Role_Dans_le_PUI (0 = vide).
      numero_de_telephone: [536499012, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
    // Chaque table de référence : libellé brut + libellé « corrigé ». Dès qu'une table remplit un
    // libellé corrigé, seul celui-là compte (ses lignes sans libellé corrigé sont ignorées) ; une
    // table qui n'en remplit aucun garde ses libellés bruts. Ici INSTANCES et Competences ont leur
    // colonne corrigée remplie, les autres tables lisent leurs libellés bruts.
    INSTANCES: {
      id: [1, 2, 3],
      Instances: ['CME', '', 'Coviris (ancien nom)'],
      Instances_Corrigees: ['CME', '', 'COVIRIS']
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
      Competences_corrigees: ['Oncologie', 'Hématologie', 'Pharmacovigilance', 'Divers'],
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

// Le document avec une ligne de plus dans Etablissements : `row` donne sa valeur à chaque colonne (id, acronyme, …).
export function withEtablissement(tables, row) {
  const copy = structuredClone(tables);
  Object.entries(row).forEach(([column, value]) => copy.Etablissements[column].push(value));
  return copy;
}

// Le document avec `extra` fiches de plus dans BDD, de quoi remplir plus d'un écran de cartes. Chacune copie l'une des quatre premières
// (Ana, Bob, Carla, Dan : des cartes de formes différentes, avec ou sans compétences, tâches, fonction), sous le nom « Copie n »
// (n = 1, 2, … dans l'ordre) et une adresse à elle ; toutes sont au CHU, établissement fondateur validé, et ont accepté d'apparaître :
// elles s'ajoutent aux 4 cartes de départ (Ana, Hostile, Gina, Hugo).
export function withClones(tables, extra) {
  const copy = structuredClone(tables);
  const { BDD } = copy;
  const first = BDD.id.length;
  for (let n = 1; n <= extra; n += 1) {
    const model = (n - 1) % 4;
    Object.entries(BDD).forEach(([column, values]) => {
      if (column === 'id') values.push(first + n);
      else if (column === 'prenom') values.push('Copie');
      else if (column === 'nom') values.push(String(n));
      else if (column === 'email') values.push(`copie${n}@annuaire.example`);
      else if (column === 'Etablissement') values.push(1);
      else if (column === 'Accepte_apparaitre') values.push(true);
      else values.push(structuredClone(values[model]));
    });
  }
  return copy;
}

// Le document avec, dans Etablissements, une 2e ligne « CHU » non validée (la première l'est) : deux établissements portent le
// même acronyme, et aucune personne n'est rattachée à la seconde.
export const withDuplicateCHU = tables => withEtablissement(tables, {
  id: 6, acronyme: 'CHU', nom_complet: 'CHU (doublon)', fondateur: true, partenaire: false, autres: false, ok_pour_apparaitre: false
});

// Les tâches rangées par action : le numéro avant le point du libellé d'une tâche est celui
// de son action, que la table Actions porte dans son libellé. Les deux actions de la base de
// départ sont numérotées, et quatre tâches sont portées par BDD.Taches. Avec ces données
// (périmètre par défaut ; Bob est partenaire) :
//   Action 1 : Vaccination  → 1.1 Relecture (Ana), 1.2 Rappel vaccinal (Gina ; libellé corrigé : le brut
//                             s'écrit « 1.2 rappel vaccinal »)
//   Action 2 : Audit        → 2.1 Inspection (Ana, Bob)
//   Sans action             → Veille (Hugo), une tâche sans numéro
export function withTaskActions(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.Actions.Actions = ['Action 1 : Vaccination', 'Action 2 : Audit'];
  copy.BDD.Actions[0] = ['L', 1]; // Ana : la ligne numérotée, plus le texte « Vaccination »
  copy.Taches = {
    id: [1, 2, 3, 4],
    Taches: ['1.1 Relecture', '1.2 rappel vaccinal', '2.1 Inspection', 'Veille'],
    Taches_corrige: ['1.1 Relecture', '1.2 Rappel vaccinal', '2.1 Inspection', 'Veille'],
    Taches_role: ['', '', '', '']
  };
  const tasksOf = { 1: ['L', 1, 3], 2: ['L', 3], 9: ['L', 2], 10: ['L', 4] };
  copy.BDD.Taches = copy.BDD.id.map(id => tasksOf[id] || ['L']);
  return copy;
}

// Les trois façons de ne rien pouvoir ranger par action : aucune action numérotée, aucune tâche numérotée, aucun numéro en commun
// entre les tâches et les actions. Le menu des tâches reste alors à plat.
export function unrankableTaskTables() {
  const noNumberedAction = withTaskActions();
  noNumberedAction.Actions.Actions = ['Vaccination', 'Audit'];
  const noNumberedTask = withTaskActions();
  noNumberedTask.Taches.Taches = ['Relecture', 'Rappel vaccinal', 'Inspection', 'Veille'];
  noNumberedTask.Taches.Taches_corrige = ['', '', '', ''];
  const noCommonNumber = withTaskActions();
  noCommonNumber.Taches.Taches = ['7.1 Relecture', '7.2 Rappel vaccinal', '8.1 Inspection', '8.2 Veille'];
  noCommonNumber.Taches.Taches_corrige = ['', '', '', ''];
  return { 'aucune action numérotée': noNumberedAction, 'aucune tâche numérotée': noNumberedTask, 'aucun numéro en commun': noCommonNumber };
}

// Adresses de personnes de l'exemple. Ana figure dans BDD et dans ACL (administratrice et
// responsable du CHU, écrite avec des majuscules dans ACL) ; ADMIN_EMAIL est administrateur sans
// ligne dans BDD ; Iris a refusé d'apparaître ; Bob est partenaire (UBM) et responsable de son
// établissement.
export const ANA_EMAIL = 'ana.martin@chu-bordeaux.example';
export const BOB_EMAIL = 'bob@u-bordeaux-montaigne.example';
export const IRIS_EMAIL = 'iris@chu-bordeaux.example';
export const ADMIN_EMAIL = 'admin@chu-bordeaux.example';

// Le document complété de la colonne facultative `email_affiche` de BDD : l'adresse que la carte montre
// à la place de `email` quand elle n'est pas vide. Bob en a une (une boîte de service), les autres non.
// NEW_EMAIL est une personne connectée qui n'a ni fiche dans BDD ni ligne dans ACL.
export const BOB_SHOWN_EMAIL = 'contact@u-bordeaux-montaigne.example';
export const NEW_EMAIL = 'zoe.nouvelle@chu-bordeaux.example';
export function withShownEmail(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.BDD.email_affiche = copy.BDD.id.map(id => (id === 2 ? BOB_SHOWN_EMAIL : ''));
  return copy;
}

// Le document complété des deux tables que le widget lit pour identifier la
// personne connectée (GRIST_SETUP.md) : ACL, et la table-sonde, vide au repos.
export function withIdentity(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.ACL = {
    id: [1, 2, 3],
    email: ['Ana.Martin@CHU-Bordeaux.example', ADMIN_EMAIL, BOB_EMAIL],
    Responsable_de_l_Etablissement: [1, 0, 2],
    admin: [true, true, false]
  };
  copy.Annuaire_Sonde = { id: [], Email: [], Admin: [], Responsable_de: [] };
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
    ['perimetre', 'RefList:REMMAPING_PERIMETRES_COMPETENCES'], ['Accepte_apparaitre', 'Bool'],
    ...('Avatar' in tables.BDD ? [['Avatar', 'Attachments']] : [])
  ];
  copy._grist_Tables_column = {
    id: bdd.map((_, index) => index + 1),
    parentId: bdd.map(() => 1),
    colId: bdd.map(([colId]) => colId),
    type: bdd.map(([, type]) => type)
  };
  return copy;
}

// Les photos de profil : la colonne Avatar de BDD (pièces jointes). Les fichiers 500 à 599 sont des
// portraits que tests/support/fake-attachments.mjs dessine. Ana a le 501, Bob le 502, Hostile un
// fichier qui n'est pas une image (998 : les initiales restent), Hugo une cellule vide (null, comme
// Grist en donne pour une pièce jointe jamais remplie) et les autres une liste vide.
export const AVATAR_FILES = { 1: 501, 2: 502, 6: 998 };
export function withAvatars(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.BDD.Avatar = copy.BDD.id.map(id => (id === 10 ? null : AVATAR_FILES[id] ? ['L', AVATAR_FILES[id]] : ['L']));
  return copy;
}

// Noms affichés (« Prénom Nom ») dans l'ordre des cartes, périmètre par défaut : les cartes
// sont triées par nom de famille (Bergonié, Bernard, Hostile, Martin), pas dans l'ordre des
// lignes de la table.
export const DEFAULT_CARD_NAMES = [
  'Gina Bergonié',
  'Hugo Bernard',
  `${HOSTILE_FIRST_NAME} Hostile`,
  'Ana Martin'
];

// Le document complété pour l'habillage (GRIST_SETUP.md) : logos et ordre du bandeau
// dans Etablissements. Les nombres sont des identifiants de pièces jointes (['L', 11] :
// le fichier 11).
//   fondateurs du bandeau : Institut Bergonié (ordre 1), puis CHU (ordre 2) ; INSERM
//   n'y figure pas (n'a pas validé sa présence) ;
//   logos des cartes : CHU 11, UBM 12, INSERM 14 ; Clinique et Bergonié n'en ont pas.
export function withBranding(tables = sampleTables()) {
  const copy = structuredClone(tables);
  copy.Etablissements.logo = [['L', 11], ['L', 12], ['L'], ['L', 14], null];
  copy.Etablissements.ordre_bandeau = [2, 0, 0, 0, 1];
  return copy;
}
