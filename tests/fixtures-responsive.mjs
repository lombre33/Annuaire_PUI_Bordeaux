// Jeu de données « chargé » pour les tests de mise en page (responsive.test.mjs) :
// ce qui fait déborder une carte ou une barre d'outils étroite. Même structure
// que tests/fixtures.mjs (table BDD), sans les contacts exclus : tous apparaissent.
// Personnes inventées, adresses en .example et numéros dans les plages réservées à
// la fiction (docs/securite.md) : responsive.test.mjs le vérifie.
//
// Ce qu'il faut y trouver :
//   noms           très longs, dont un sans aucun point de coupure
//   e-mails        un sans aucun point de coupure
//   établissements 17 dont « Sciences Po Bordeaux » (acronyme long, tronqué dans son badge)
//   fonctions      de la plus courte (aucune) à une phrase de deux lignes, une sans coupure
//   tags           de 0 à 6 compétences, dont une sans coupure, et les 7 catégories de tags

const PRENOMS = ['Marie-Christine', 'Jean-Baptiste', 'Anne-Sophie', 'Élodie', 'Mohamed', 'Léa', 'Pierre', 'Camille'];
const NOMS = [
  'Dupont-Lefebvre', 'Martin', 'Rodriguez-Fernandez-de-la-Tour-d-Auvergne', 'Petit', 'Durand',
  'Wolfeschlegelsteinhausenbergerdorffwelchevor', 'Moreau', 'Garcia-Hernandez'
];
const FONCTIONS = [
  '', 'Chargée de mission innovation', 'Directrice de la valorisation et du transfert de technologies',
  'Ingénieur', 'Responsable du service des partenariats et des contrats de recherche', 'x'.repeat(70)
];
const ETABLISSEMENTS = [
  ['UB', 'Université de Bordeaux'], ['Bordeaux INP', 'Bordeaux INP'], ['BSA', 'Bordeaux Sciences Agro'],
  ['Sciences Po Bordeaux', 'Sciences Po Bordeaux'], ['IOGS', "Institut d'Optique"], ['ESTIA', 'ESTIA'],
  ['CNRS', 'CNRS'], ['Inserm', 'Inserm'], ['Inria', 'Inria'], ['INRAE', 'INRAE'], ['CHU', 'CHU de Bordeaux'],
  ['UBM', 'Université Bordeaux Montaigne'], ['ENSAP', 'ENSAP'], ['Arts et Métiers', 'Arts et Métiers'],
  ['AST', 'AST'], ['ADERA', 'ADERA'], ['Institut Bergonié', 'Institut Bergonié']
];
const INSTANCES = ['CME', 'COVIRIS', 'Comité de pilotage stratégique', 'Comité scientifique', 'Bureau'];
const ACTIONS = ['Vaccination', 'Audit', 'Veille réglementaire', 'Formation des équipes', 'Accompagnement de projets', 'Valorisation'];
const COMMUNAUTES = ['Soins palliatifs', 'Réseau douleur', 'Santé numérique', 'Entrepreneuriat étudiant'];
const TACHES = ['Relecture', 'Veille', 'Animation', 'Suivi budgétaire'];
const GT = ['GT qualité', 'GT numérique', 'GT juridique'];
const COMPETENCES = [
  ['Oncologie', 'Cancérologie'], ['Hématologie', 'Cancérologie'], ['Pharmacovigilance', 'Pharmacie'],
  ['Essais cliniques de phase précoce', 'Recherche clinique'], ['Intelligence artificielle appliquée à la santé', 'Numérique'],
  ['Cybersécurité', 'Numérique'], ['Droit des brevets', 'Juridique'], ['Contrats de collaboration', 'Juridique'],
  ['Levée de fonds', 'Financement'], ['Études de marché', 'Entrepreneuriat'], ['Dispositifs médicaux', 'Ingénierie'],
  ['Biostatistiques', 'Recherche clinique'], ['y'.repeat(50), 'Autres']
];

const EMAIL_SANS_COUPURE = `${'a'.repeat(60)}@${'b'.repeat(20)}.example`;

// Une liste Grist d'identifiants : `count` valeurs prises en tournant dans une table de `size` lignes.
const list = (index, size, count) => ['L', ...Array.from({ length: count }, (_, k) => ((index * 5 + k * 3) % size) + 1)];
const ids = values => values.map((_, i) => i + 1);

export const CROWDED_CONTACT_COUNT = 30;

export function crowdedTables(count = CROWDED_CONTACT_COUNT) {
  const rows = Array.from({ length: count }, (_, i) => i);
  return {
    BDD: {
      id: rows.map(i => i + 1),
      prenom: rows.map(i => PRENOMS[i % PRENOMS.length]),
      nom: rows.map(i => NOMS[(i * 3) % NOMS.length]),
      email: rows.map(i => (i % 5 === 0 ? EMAIL_SANS_COUPURE : `contact${i}@bordeaux.example`)),
      Fonction: rows.map(i => FONCTIONS[i % FONCTIONS.length]),
      Etablissement: rows.map(i => (i % ETABLISSEMENTS.length) + 1),
      Instances: rows.map(i => list(i, INSTANCES.length, i % 3)),
      Actions: rows.map(i => list(i, ACTIONS.length, i % 4)),
      GT: rows.map(i => list(i, GT.length, i % 2)),
      Communautes: rows.map(i => list(i, COMMUNAUTES.length, i % 3)),
      Taches: rows.map(i => list(i, TACHES.length, i % 2)),
      Competences: rows.map(i => list(i, COMPETENCES.length, i % 7)),
      perimetre: rows.map(() => ['L', 1]),
      numero_de_telephone: rows.map(i => (i % 3 === 0 ? 536490000 + i : 0)),
      Role_dans_le_PUI: rows.map(i => (i % 4 === 0 ? 1 : 0)),
      Accepte_apparaitre: rows.map(() => true)
    },
    Etablissements: {
      id: ids(ETABLISSEMENTS),
      acronyme: ETABLISSEMENTS.map(([acronyme]) => acronyme),
      nom_complet: ETABLISSEMENTS.map(([, nom]) => nom),
      fondateur: ETABLISSEMENTS.map(() => true),
      partenaire: ETABLISSEMENTS.map(() => false),
      autres: ETABLISSEMENTS.map(() => false),
      ok_pour_apparaitre: ETABLISSEMENTS.map(() => true)
    },
    INSTANCES: { id: ids(INSTANCES), Instances: INSTANCES, Instances_Corrigees: INSTANCES.map(() => '') },
    Actions: { id: ids(ACTIONS), Actions: ACTIONS, Actions_corrigees: ACTIONS.map(() => '') },
    Communautes: { id: ids(COMMUNAUTES), communautes: COMMUNAUTES, communautes_corrigees: COMMUNAUTES.map(() => '') },
    Taches: { id: ids(TACHES), Taches: TACHES, Taches_corrige: TACHES.map(() => ''), Taches_role: TACHES.map(() => '') },
    GT: { id: ids(GT), GT, GT_corrige: GT.map(() => '') },
    Competences: {
      id: ids(COMPETENCES),
      Competences: COMPETENCES.map(([competence]) => competence),
      Competences_corrigees: COMPETENCES.map(() => ''),
      Macro_competences: COMPETENCES.map(([, domaine]) => domaine)
    },
    Role_Dans_le_PUI: { id: [1], Role: ['Référent innovation et valorisation'] }
  };
}

// La même foule avec des tâches rangées par action : le numéro avant le point d'une tâche
// (« 2.1 ») est celui de son action (« Action 2 : … »). Six actions aux libellés longs, dont un
// sans point de coupure, douze tâches (dont une sans point de coupure) et une sans numéro,
// rangée sous « Sans action » : sept groupes dans le menu Tâches.
const ACTIONS_NUMEROTEES = [
  'Action 1 : Vaccination', 'Action 2 : Audit des pratiques', 'Action 3 : Veille réglementaire et normative',
  'Action 4 : Formation des équipes soignantes, administratives et techniques', `Action 5 : ${'v'.repeat(48)}`, 'Action 6 : Valorisation'
];
const TACHES_NUMEROTEES = [
  '1.1 Relecture', '1.2 Rédaction du protocole de vaccination', '2.1 Audit', '3.1 Veille', '3.2 Veille réglementaire européenne',
  '4.1 Animation', `4.2 ${'w'.repeat(48)}`, '5.1 Suivi budgétaire', '5.2 Accompagnement des équipes', '6.1 Valorisation',
  '6.2 Dépôt de brevet', 'Coordination'
];

export function crowdedTablesByAction(count = CROWDED_CONTACT_COUNT) {
  const tables = crowdedTables(count);
  tables.Actions.Actions = ACTIONS_NUMEROTEES;
  tables.Taches = {
    id: ids(TACHES_NUMEROTEES),
    Taches: TACHES_NUMEROTEES,
    Taches_corrige: TACHES_NUMEROTEES.map(() => ''),
    Taches_role: TACHES_NUMEROTEES.map(() => '')
  };
  tables.BDD.Taches = Array.from({ length: count }, (_, i) => list(i, TACHES_NUMEROTEES.length, i % 5));
  return tables;
}

// L'habillage par-dessus le jeu chargé (GRIST_SETUP.md) : un logo par établissement (les
// fichiers 101, 102… de tests/support/fake-attachments.mjs, de proportions variées) et
// l'ordre du bandeau. Les 17 établissements sont fondateurs : le bandeau montre 17 logos, un
// compte impair qui laisse une dernière rangée incomplète.
export function crowdedBranding(tables = crowdedTables()) {
  const copy = structuredClone(tables);
  copy.Etablissements.logo = copy.Etablissements.id.map(id => ['L', 100 + id]);
  copy.Etablissements.ordre_bandeau = [...copy.Etablissements.id];
  return copy;
}

// Le jeu chargé complété de ce qu'il faut pour identifier une personne connectée (ACL et
// la table-sonde, GRIST_SETUP.md) : `email` doit être celui d'une ligne de BDD.
export function crowdedIdentity(tables, email, { admin = false } = {}) {
  const copy = structuredClone(tables);
  copy.ACL = { id: [1], email: [email], Responsable_de_l_Etablissement: [0], admin: [admin] };
  copy.Annuaire_Sonde = { id: [], Email: [], Admin: [] };
  return copy;
}
