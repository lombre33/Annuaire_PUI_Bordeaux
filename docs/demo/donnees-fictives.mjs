// Jeu de données 100 % fictif, servi au widget à la place de Grist pour les
// captures d'écran de la documentation (voir capturer.mjs) et pour essayer le
// widget sans document Grist (voir serveur-demo.mjs).
//
// Rien ici ne provient du vrai annuaire :
//   - personnes et établissements inventés ;
//   - adresses en « .example », domaine réservé à la documentation (RFC 2606) ;
//   - numéros du plan de numérotation réservé à la fiction (ARCEP, décision
//     n° 2018-0881) : 05 36 49 xx xx et 06 39 98 xx xx.
//
// La structure est celle de grist_structure.txt (table BDD). Les contacts sont
// écrits sous une forme lisible, puis convertis par tablesFictives() vers les
// tables « en colonnes » que renvoie grist.docApi.fetchTable(), avec les
// encodages réels de Grist : références en identifiant de ligne (0 = vide),
// listes ['L', id, ...], téléphone Numeric sans son 0 initial, pièces jointes
// ['L', numéro du fichier].
//
// Les logos des établissements et des financeurs sont des dessins inventés
// (logos-fictifs.mjs), jamais ceux de vraies structures.

import { BRANDING } from '../../constants.js';
import { IDS_LOGOS } from './logos-fictifs.mjs';

// `ordreBandeau` : la place de l'établissement fondateur dans le bandeau des logos du bas
// (colonne ordre_bandeau, GRIST_SETUP.md). Le logo d'un établissement est le dessin de même
// acronyme dans logos-fictifs.mjs ; Réseau Santé Démo n'en a pas : ses cartes gardent le nom
// de l'établissement écrit, comme le fait le widget quand le logo manque.
const ETABLISSEMENTS = [
  { acronyme: 'CHD', nomComplet: 'Centre Hospitalier de Démonstration', statut: 'fondateur', valide: true, ordreBandeau: 2 },
  { acronyme: 'UDD', nomComplet: 'Université de Démonstration', statut: 'fondateur', valide: true, ordreBandeau: 1 },
  { acronyme: 'ISD', nomComplet: 'Institut Santé Démo', statut: 'fondateur', valide: true, ordreBandeau: 4 },
  { acronyme: 'EDD', nomComplet: 'École de Démonstration', statut: 'fondateur', valide: true, ordreBandeau: 5 },
  { acronyme: 'CLEX', nomComplet: 'Clinique Exemple', statut: 'partenaire', valide: true },
  { acronyme: 'RSD', nomComplet: 'Réseau Santé Démo', statut: 'partenaire', valide: true },
  // Jamais affichés : établissement « autres », et fondateur n'ayant pas validé (son logo
  // n'apparaît donc pas non plus dans le bandeau).
  { acronyme: 'LABT', nomComplet: 'Laboratoire Témoin', statut: 'autres', valide: true },
  { acronyme: 'FDX', nomComplet: 'Fondation Exemple', statut: 'fondateur', valide: false, ordreBandeau: 9 },
  // Fondateurs sans personne dans l'annuaire : ils n'ont pas de carte, mais leur logo figure
  // dans le bandeau du bas.
  { acronyme: 'IND', nomComplet: 'Institut National de Démonstration', statut: 'fondateur', valide: true, ordreBandeau: 3 },
  { acronyme: 'ASD', nomComplet: 'AgroSciences Démo', statut: 'fondateur', valide: true, ordreBandeau: 6 },
  { acronyme: 'PTD', nomComplet: 'Polytechnique de Démonstration', statut: 'fondateur', valide: true, ordreBandeau: 7 },
  { acronyme: 'MND', nomComplet: 'Métropole de Démonstration', statut: 'fondateur', valide: true, ordreBandeau: 8 }
];

// La table facultative Financeurs (GRIST_SETUP.md), dans l'ordre de la colonne `ordre`. Celui
// dont le nom est BRANDING.roundelFunder ferme aussi le bandeau du bas : son dessin est un
// rond inventé, pas le logo du programme du même nom.
const FINANCEURS = [
  { nom: 'République Démo', logo: 'REPUBLIQUE', ordre: 1 },
  { nom: 'Agence Démo de la Recherche', logo: 'ADR', ordre: 2 },
  { nom: 'Banque Démo de l\'Innovation', logo: 'BDI', ordre: 3 },
  { nom: BRANDING.roundelFunder, logo: 'ROND', ordre: 4 }
];

// Une entrée par table de référence dont BDD porte une colonne ReferenceList.
// Comme dans le document réel, chaque table a un libellé brut (celui de
// l'import) et un libellé corrigé, que le widget affiche en priorité.
//   table, corrigee, brute   noms suivant grist_structure.txt
//   colonneBDD               la colonne de BDD qui y renvoie
const REFERENCES = {
  instances: {
    table: 'INSTANCES', corrigee: 'Instances_Corrigees', brute: 'Instances', colonneBDD: 'Instances',
    libelles: ['Comité de pilotage', 'Comité stratégique', 'Conseil scientifique', 'Comité d\'éthique', 'Cellule de coordination']
  },
  actions: {
    table: 'Actions', corrigee: 'Actions_corrigees', brute: 'Actions', colonneBDD: 'Actions',
    libelles: ['Valorisation de la recherche', 'Maturation de projets', 'Formation à l\'innovation',
      'Veille et propriété intellectuelle', 'Accompagnement des start-up', 'Recherche de financements']
  },
  gt: {
    table: 'GT', corrigee: 'GT_corrige', brute: 'GT', colonneBDD: 'GT',
    libelles: ['GT Financement', 'GT Propriété intellectuelle', 'GT Formation', 'GT Événements', 'GT Données de santé']
  },
  communautes: {
    table: 'Communautes', corrigee: 'communautes_corrigees', brute: 'communautes', colonneBDD: 'Communautes',
    libelles: ['Santé numérique', 'Deeptech', 'Transfert de technologie', 'Entrepreneuriat étudiant', 'Innovation pédagogique']
  },
  taches: {
    table: 'Taches', corrigee: 'Taches_corrige', brute: 'Taches', colonneBDD: 'Taches',
    libelles: ['Animation de réseau', 'Suivi de projets', 'Relecture de dossiers', 'Organisation d\'événements', 'Veille stratégique']
  }
};

// Le rôle est une Référence simple (une seule valeur par personne), dans une
// table à une seule colonne de libellé.
const ROLES = {
  table: 'Role_Dans_le_PUI', colonne: 'Role',
  libelles: ['Référent établissement', 'Coordinateur', 'Membre du comité', 'Animation de communauté']
};

// Les compétences alimentent un seul menu, « Compétences » (le libellé), que
// Macro_competences (le regroupement par domaine) range en domaines. Une
// compétence sans domaine est classée sous « Autres » par le widget.
const COMPETENCES = [
  { libelle: 'Propriété intellectuelle', domaine: 'Valorisation et partenariats' },
  { libelle: 'Droit des contrats', domaine: 'Valorisation et partenariats' },
  { libelle: 'Partenariats industriels', domaine: 'Valorisation et partenariats' },
  { libelle: 'Financement de l\'innovation', domaine: 'Financement et pilotage' },
  { libelle: 'Gestion de projet', domaine: 'Financement et pilotage' },
  { libelle: 'Création d\'entreprise', domaine: 'Entrepreneuriat' },
  { libelle: 'Santé numérique', domaine: 'Santé numérique et données' },
  { libelle: 'Intelligence artificielle', domaine: 'Santé numérique et données' },
  { libelle: 'Open science', domaine: 'Santé numérique et données' },
  { libelle: 'Essais cliniques', domaine: 'Recherche clinique' },
  { libelle: 'Dispositifs médicaux', domaine: 'Recherche clinique' },
  { libelle: 'Communication scientifique', domaine: '' }
];

// Ordre d'affichage = ordre de la table (le widget ne trie pas les cartes).
// `visible: false` : contact hors périmètre (perimetre vide).
// `accepte: false` : la personne n'a pas donné son accord (Accepte_apparaitre).
// `admin: true` : administrateur, déclaré dans la table ACL.
// `responsable: true` : responsable de son établissement (1.17.0), déclaré dans la table ACL : elle
// ou il modifie la fiche de l'établissement, et d'abord nomme les autres responsables.
const CONTACTS = [
  {
    prenom: 'Camille', nom: 'Rousseau', fonction: 'Cheffe de projet innovation', etab: 'CHD', tel: '0536490112',
    role: 'Référent établissement',
    instances: ['Comité de pilotage', 'Comité stratégique'], actions: ['Maturation de projets', 'Recherche de financements'],
    gt: ['GT Financement'], communautes: ['Santé numérique'], taches: ['Suivi de projets'],
    competences: ['Gestion de projet', 'Financement de l\'innovation', 'Santé numérique']
  },
  {
    prenom: 'Mehdi', nom: 'Bensaïd', fonction: 'Responsable valorisation', etab: 'UDD', tel: '0536490234',
    role: 'Coordinateur', admin: true,
    instances: ['Comité de pilotage'], actions: ['Valorisation de la recherche', 'Veille et propriété intellectuelle'],
    gt: ['GT Propriété intellectuelle'], communautes: ['Transfert de technologie', 'Deeptech'],
    taches: ['Animation de réseau', 'Relecture de dossiers'],
    competences: ['Propriété intellectuelle', 'Droit des contrats', 'Partenariats industriels']
  },
  {
    prenom: 'Élise', nom: 'Marchetti', fonction: 'Juriste en propriété intellectuelle', etab: 'ISD', tel: '0536490356',
    instances: ['Conseil scientifique'], actions: ['Veille et propriété intellectuelle'],
    gt: ['GT Propriété intellectuelle'], communautes: ['Transfert de technologie'], taches: ['Relecture de dossiers'],
    competences: ['Propriété intellectuelle', 'Droit des contrats']
  },
  {
    prenom: 'Julien', nom: 'Garnier', fonction: 'Chargé de transfert de technologie', etab: 'UDD', tel: '0639980478',
    role: 'Membre du comité',
    instances: ['Comité stratégique'], actions: ['Valorisation de la recherche', 'Maturation de projets'],
    communautes: ['Transfert de technologie', 'Deeptech'], taches: ['Suivi de projets'],
    competences: ['Partenariats industriels', 'Création d\'entreprise']
  },
  {
    prenom: 'Sofia', nom: 'Almeida', fonction: 'Directrice de la recherche clinique', etab: 'CHD', tel: '0536490590',
    role: 'Membre du comité', responsable: true,
    instances: ['Comité d\'éthique', 'Conseil scientifique'], actions: ['Maturation de projets'],
    gt: ['GT Données de santé'], communautes: ['Santé numérique'], taches: ['Relecture de dossiers'],
    competences: ['Essais cliniques', 'Dispositifs médicaux', 'Open science']
  },
  {
    prenom: 'Hugo', nom: 'Lefèvre', fonction: 'Ingénieur en santé numérique', etab: 'EDD',
    actions: ['Accompagnement des start-up'], gt: ['GT Données de santé'],
    communautes: ['Santé numérique', 'Deeptech'], taches: ['Veille stratégique'],
    competences: ['Intelligence artificielle', 'Santé numérique']
  },
  {
    prenom: 'Nadia', nom: 'Kowalski', fonction: 'Chargée de mission entrepreneuriat', etab: 'UDD', tel: '0536490712',
    role: 'Animation de communauté',
    actions: ['Accompagnement des start-up', 'Formation à l\'innovation'], gt: ['GT Formation'],
    communautes: ['Entrepreneuriat étudiant'], taches: ['Organisation d\'événements', 'Animation de réseau'],
    competences: ['Création d\'entreprise', 'Gestion de projet']
  },
  {
    prenom: 'Thomas', nom: 'Vidal', fonction: 'Responsable partenariats industriels', etab: 'ISD', tel: '0639980834',
    role: 'Référent établissement',
    instances: ['Comité de pilotage'], actions: ['Valorisation de la recherche', 'Recherche de financements'],
    gt: ['GT Financement'], communautes: ['Transfert de technologie'], taches: ['Animation de réseau'],
    competences: ['Partenariats industriels', 'Droit des contrats', 'Financement de l\'innovation']
  },
  {
    prenom: 'Léa', nom: 'Fontaine', fonction: 'Gestionnaire de projets européens', etab: 'CHD', tel: '0536490956',
    responsable: true,
    actions: ['Recherche de financements'], gt: ['GT Financement'], taches: ['Suivi de projets', 'Relecture de dossiers'],
    competences: ['Financement de l\'innovation', 'Gestion de projet']
  },
  {
    prenom: 'Karim', nom: 'Haddad', fonction: 'Directeur de l\'innovation', etab: 'EDD', tel: '0536491078',
    role: 'Coordinateur',
    instances: ['Comité de pilotage', 'Comité stratégique', 'Cellule de coordination'],
    actions: ['Maturation de projets', 'Accompagnement des start-up'], gt: ['GT Formation'],
    communautes: ['Innovation pédagogique', 'Deeptech'], taches: ['Animation de réseau'],
    competences: ['Gestion de projet', 'Création d\'entreprise']
  },
  {
    prenom: 'Inès', nom: 'Moreau', fonction: 'Chargée de communication', etab: 'UDD', tel: '0536491190',
    actions: ['Valorisation de la recherche'], gt: ['GT Événements'],
    communautes: ['Entrepreneuriat étudiant', 'Innovation pédagogique'], taches: ['Organisation d\'événements'],
    competences: ['Communication scientifique']
  },
  {
    prenom: 'Paul', nom: 'Girard', fonction: 'Pharmacien référent innovation', etab: 'CHD', tel: '0639981212',
    role: 'Membre du comité',
    instances: ['Comité d\'éthique'], actions: ['Maturation de projets'], gt: ['GT Données de santé'],
    communautes: ['Santé numérique'], taches: ['Veille stratégique'],
    competences: ['Dispositifs médicaux', 'Essais cliniques']
  },
  {
    prenom: 'Anaïs', nom: 'Perrot', fonction: 'Responsable de la formation continue', etab: 'ISD', tel: '0536491334',
    actions: ['Formation à l\'innovation'], gt: ['GT Formation'], communautes: ['Innovation pédagogique'],
    taches: ['Organisation d\'événements'],
    competences: ['Communication scientifique', 'Gestion de projet']
  },
  {
    prenom: 'Romain', nom: 'Delmas', fonction: 'Data manager', etab: 'EDD', tel: '0639981456',
    gt: ['GT Données de santé'], communautes: ['Santé numérique'],
    competences: ['Intelligence artificielle', 'Open science']
  },
  // Établissements partenaires : visibles seulement avec l'interrupteur « Partenaires ».
  {
    prenom: 'Clara', nom: 'Dubois', fonction: 'Chargée d\'affaires', etab: 'CLEX', tel: '0536491578',
    actions: ['Recherche de financements'], communautes: ['Transfert de technologie'],
    competences: ['Partenariats industriels', 'Droit des contrats']
  },
  {
    prenom: 'Mathieu', nom: 'Perrin', fonction: 'Responsable qualité', etab: 'RSD', tel: '0536491690',
    instances: ['Comité d\'éthique'], gt: ['GT Données de santé'],
    competences: ['Dispositifs médicaux', 'Gestion de projet']
  },
  {
    prenom: 'Manon', nom: 'Leroy', fonction: 'Data scientist', etab: 'CLEX', tel: '0639981712',
    communautes: ['Santé numérique'], competences: ['Intelligence artificielle', 'Santé numérique']
  },
  {
    prenom: 'Yanis', nom: 'Morel', fonction: 'Directeur des opérations', etab: 'RSD', tel: '0536491834',
    role: 'Membre du comité', instances: ['Conseil scientifique'], taches: ['Veille stratégique'],
    competences: ['Gestion de projet']
  },
  // Jamais affichés (voir docs/utilisateurs.md, « Pourquoi une personne n'apparaît-elle pas ? »).
  { prenom: 'Sarah', nom: 'Colin', fonction: 'Chargée de mission', etab: 'FDX', competences: ['Gestion de projet'] },
  { prenom: 'Gabriel', nom: 'Noël', fonction: 'Ingénieur de recherche', etab: 'LABT', competences: ['Open science'] },
  { prenom: 'Alice', nom: 'Bertin', fonction: 'Chargée de mission', etab: '', competences: ['Gestion de projet'] },
  { prenom: 'Victor', nom: 'Lambert', fonction: 'Chef de projet', etab: 'CHD', visible: false, competences: ['Gestion de projet'] },
  { prenom: 'Lucas', nom: 'Mercier', fonction: 'Chargé de mission innovation', etab: 'UDD', accepte: false, competences: ['Création d\'entreprise'] }
];

const sansAccent = texte => texte.normalize('NFD').replace(/\p{Diacritic}/gu, '');

function adresse({ prenom, nom, etab }) {
  return `${sansAccent(prenom).toLowerCase()}.${sansAccent(nom).toLowerCase()}@${(etab || 'sans-etablissement').toLowerCase()}.example`;
}

// Les personnes que la démonstration peut « connecter » (?connecte=adresse) et les
// captures de « Ma présence » : une qui apparaît, une d'un établissement partenaire,
// une qui a refusé, une qui a accepté mais reste masquée, un administrateur, une responsable
// d'établissement.
const adresseDe = (prenom, nom) => {
  const contact = CONTACTS.find(candidat => candidat.prenom === prenom && candidat.nom === nom);
  if (!contact) throw new Error(`Personne inconnue dans les données fictives : ${prenom} ${nom}`);
  return adresse(contact);
};
export const PERSONNES_DEMO = {
  visible: adresseDe('Camille', 'Rousseau'),
  partenaire: adresseDe('Clara', 'Dubois'),
  refus: adresseDe('Lucas', 'Mercier'),
  masquee: adresseDe('Sarah', 'Colin'),
  administrateur: adresseDe('Mehdi', 'Bensaïd'),
  responsable: adresseDe('Léa', 'Fontaine')
};

// Le libellé brut d'un import : sans accents ni majuscules. Seul le libellé
// corrigé est affiché, tant qu'il est rempli.
const brut = libelle => sansAccent(libelle).toLowerCase();

// { libellé -> id } d'une table de référence : l'id est la position + 1, comme
// les lignes d'une table Grist créées dans l'ordre.
function ids(libelles) {
  return Object.fromEntries(libelles.map((libelle, index) => [libelle, index + 1]));
}

// Une faute de frappe dans un libellé ferait disparaître un tag sans erreur :
// on préfère échouer ici.
function idDe(libelle, idsParLibelle) {
  if (!Object.hasOwn(idsParLibelle, libelle)) throw new Error(`Libellé inconnu dans les données fictives : « ${libelle} »`);
  return idsParLibelle[libelle];
}

// Colonne ReferenceList : ['L', id1, id2, ...], et ['L'] quand elle est vide.
function liste(libelles = [], idsParLibelle) {
  return ['L', ...libelles.map(libelle => idDe(libelle, idsParLibelle))];
}

// Table de référence : une ligne par libellé, libellé brut puis libellé corrigé.
function tableDeReference({ corrigee, brute }, libelles) {
  return { id: libelles.map((_, index) => index + 1), [brute]: libelles.map(brut), [corrigee]: [...libelles] };
}

// Les métadonnées que Grist expose par fetchTable('_grist_Tables') et
// fetchTable('_grist_Tables_column') : pour modifier une fiche, le widget y lit le type
// des colonnes de BDD (schema.js) afin d'écrire le téléphone dans la forme de sa
// colonne. Ici Numeric, comme dans le document d'origine (grist_structure.txt) : sans
// ces tables, la démonstration marcherait aussi mais la console signalerait des types
// illisibles.
function metadonneesFictives() {
  const colonnesBDD = [
    ['prenom', 'Text'], ['nom', 'Text'], ['email', 'Text'], ['Fonction', 'Text'],
    ['numero_de_telephone', 'Numeric'],
    ['Etablissement', 'Ref:Etablissements'], ['Role_dans_le_PUI', `Ref:${ROLES.table}`],
    ...Object.values(REFERENCES).map(ref => [ref.colonneBDD, `RefList:${ref.table}`]),
    ['Competences', 'RefList:Competences'],
    ['perimetre', 'RefList:REMMAPING_PERIMETRES_COMPETENCES'],
    ['Accepte_apparaitre', 'Bool']
  ];
  return {
    _grist_Tables: { id: [1, 2], tableId: ['BDD', 'Etablissements'] },
    _grist_Tables_column: {
      id: colonnesBDD.map((_, index) => index + 1),
      parentId: colonnesBDD.map(() => 1),
      colId: colonnesBDD.map(([colId]) => colId),
      type: colonnesBDD.map(([, type]) => type)
    }
  };
}

export function tablesFictives() {
  const idsEtablissements = ids(ETABLISSEMENTS.map(etablissement => etablissement.acronyme));
  const idsReferences = Object.fromEntries(Object.entries(REFERENCES).map(([cle, ref]) => [cle, ids(ref.libelles)]));
  const idsRoles = ids(ROLES.libelles);
  const idsCompetences = ids(COMPETENCES.map(competence => competence.libelle));
  const acl = [
    ...CONTACTS.filter(contact => contact.admin).map(contact => ({ contact, etablissement: 0, admin: true })),
    ...CONTACTS.filter(contact => contact.responsable).map(contact => ({ contact, etablissement: idsEtablissements[contact.etab], admin: false }))
  ];
  CONTACTS.forEach(contact => {
    if (contact.etab && !Object.hasOwn(idsEtablissements, contact.etab)) {
      throw new Error(`Établissement inconnu dans les données fictives : « ${contact.etab} »`);
    }
  });

  const bdd = {
    id: CONTACTS.map((_, index) => index + 1),
    prenom: CONTACTS.map(contact => contact.prenom),
    nom: CONTACTS.map(contact => contact.nom),
    email: CONTACTS.map(adresse),
    Fonction: CONTACTS.map(contact => contact.fonction ?? ''),
    // Référence vers Etablissements : identifiant de ligne, 0 quand elle est vide.
    Etablissement: CONTACTS.map(contact => (contact.etab ? idsEtablissements[contact.etab] : 0)),
    perimetre: CONTACTS.map(contact => (contact.visible === false ? ['L'] : ['L', 1])),
    // Numeric : le 0 initial est perdu (0536490112 → 536490112), le widget le rétablit.
    numero_de_telephone: CONTACTS.map(contact => (contact.tel ? Number(contact.tel) : 0)),
    Role_dans_le_PUI: CONTACTS.map(contact => (contact.role ? idDe(contact.role, idsRoles) : 0)),
    Competences: CONTACTS.map(contact => liste(contact.competences, idsCompetences)),
    // Consentement (1.10.0) : une personne n'apparaît que si sa case est cochée.
    // Ici tout le monde a donné son accord sauf `accepte: false` : pour les autres,
    // seuls les établissements et le périmètre décident.
    Accepte_apparaitre: CONTACTS.map(contact => contact.accepte !== false)
  };
  Object.entries(REFERENCES).forEach(([cle, ref]) => {
    bdd[ref.colonneBDD] = CONTACTS.map(contact => liste(contact[cle], idsReferences[cle]));
  });

  const tables = {
    BDD: bdd,
    Etablissements: {
      id: ETABLISSEMENTS.map((_, index) => index + 1),
      acronyme: ETABLISSEMENTS.map(etablissement => etablissement.acronyme),
      nom_complet: ETABLISSEMENTS.map(etablissement => etablissement.nomComplet),
      fondateur: ETABLISSEMENTS.map(etablissement => etablissement.statut === 'fondateur'),
      partenaire: ETABLISSEMENTS.map(etablissement => etablissement.statut === 'partenaire'),
      autres: ETABLISSEMENTS.map(etablissement => etablissement.statut === 'autres'),
      ok_pour_apparaitre: ETABLISSEMENTS.map(etablissement => etablissement.valide),
      // Habillage (GRIST_SETUP.md) : Pièces jointes (null quand la cellule est vide) et Numérique (0 : sans ordre).
      logo: ETABLISSEMENTS.map(etablissement => (IDS_LOGOS[etablissement.acronyme] ? ['L', IDS_LOGOS[etablissement.acronyme]] : null)),
      ordre_bandeau: ETABLISSEMENTS.map(etablissement => etablissement.ordreBandeau ?? 0)
    },
    Financeurs: {
      id: FINANCEURS.map((_, index) => index + 1),
      nom: FINANCEURS.map(financeur => financeur.nom),
      logo: FINANCEURS.map(financeur => ['L', IDS_LOGOS[financeur.logo]]),
      ordre: FINANCEURS.map(financeur => financeur.ordre)
    },
    Competences: {
      ...tableDeReference({ corrigee: 'Competences_corrigees', brute: 'Competences' }, COMPETENCES.map(competence => competence.libelle)),
      Macro_competences: COMPETENCES.map(competence => competence.domaine)
    },
    [ROLES.table]: { id: ROLES.libelles.map((_, index) => index + 1), [ROLES.colonne]: [...ROLES.libelles] },
    // Table-sonde (GRIST_SETUP.md, étape 2) : vide au repos, le widget y ajoute puis y
    // retire une ligne pour savoir qui est connecté.
    Annuaire_Sonde: { id: [], Email: [], Admin: [], Responsable_de: [] },
    // Administrateurs et responsables d'établissement (étape 3) : les formules de la sonde la
    // lisent ; le widget la lit et y écrit la liste des responsables d'un établissement.
    ACL: {
      id: acl.map((_, index) => index + 1),
      email: acl.map(ligne => adresse(ligne.contact)),
      Responsable_de_l_Etablissement: acl.map(ligne => ligne.etablissement),
      admin: acl.map(ligne => ligne.admin)
    },
    ...metadonneesFictives()
  };
  Object.values(REFERENCES).forEach(ref => {
    tables[ref.table] = tableDeReference(ref, ref.libelles);
  });
  return tables;
}

// Nombre de cartes attendues avec ce jeu de données (les captures vérifient
// qu'elles les affichent bien avant de photographier l'écran).
export const CARTES_ATTENDUES = { fondateurs: 14, fondateursEtPartenaires: 18 };

// Ce que l'habillage montre avec ce jeu de données (les captures le vérifient de même) :
//   financeurs                 les logos du haut, dans l'ordre de la colonne `ordre`
//   bandeau                    les fondateurs du bandeau du bas, dans l'ordre d'ordre_bandeau :
//                              les noms complets, qui sont l'infobulle de chaque logo
//   cartesPartenairesSansLogo  les cartes de partenaires qui gardent le nom de l'établissement
export const HABILLAGE_ATTENDU = {
  financeurs: [...FINANCEURS].sort((a, b) => a.ordre - b.ordre).map(financeur => financeur.nom),
  bandeau: ETABLISSEMENTS.filter(etablissement => etablissement.statut === 'fondateur' && etablissement.valide)
    .sort((a, b) => a.ordreBandeau - b.ordreBandeau).map(etablissement => etablissement.nomComplet),
  cartesPartenairesSansLogo: CONTACTS.filter(contact => {
    const etablissement = ETABLISSEMENTS.find(candidat => candidat.acronyme === contact.etab);
    return etablissement?.statut === 'partenaire' && !IDS_LOGOS[etablissement.acronyme];
  }).length
};
