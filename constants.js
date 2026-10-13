// Table principale du document Grist : une ligne par personne.
export const MAIN_TABLE = 'BDD';

// Case à cocher de BDD par laquelle une personne accepte d'apparaître. Un seul nom
// pour la lecture (grist-data.js) et l'écriture (presence.js) : les deux ne
// peuvent pas diverger.
export const CONSENT_COLUMN = 'Accepte_apparaitre';

// Table-sonde qui dit au widget qui est connecté (voir identity.js). Elle appartient
// au document et se crée à la main : GRIST_SETUP.md donne ses colonnes.
export const PROBE_TABLE = 'Annuaire_Sonde';
// Sa colonne facultative `Responsable_de` : les identifiants des établissements dont la personne
// connectée est responsable (formule de déclenchement, comme `Admin`, d'après la table ACL).
export const PROBE_RESPONSABLE_COLUMN = 'Responsable_de';

// Habillage : logos des établissements (cartes et bandeau des fondateurs), lus dans Grist.
// Tout est facultatif (GRIST_SETUP.md) : sans ces colonnes, le widget affiche les noms à la
// place des logos.
//   Etablissements   `logo` (Pièces jointes) et `ordre_bandeau` (Numérique)
// Les financeurs (le visuel du haut de page, le rond France 2030 du bandeau du bas) ne
// viennent pas de Grist : deux images fixes du dépôt (assets/, index.html).
export const BRANDING = {
  logoColumn: 'logo',
  bandOrderColumn: 'ordre_bandeau'
};

// Fiche d'un établissement, modifiée par ses responsables (1.17.0). Le widget y écrit trois
// colonnes d'Etablissements (le nom complet, la visibilité et le logo) et des lignes d'ACL (une
// par responsable et par établissement) ; il n'écrit jamais `admin`, ni le sigle, ni le statut.
export const ETABLISSEMENT_TABLE = 'Etablissements';
export const ETABLISSEMENT_COLUMNS = { name: 'nom_complet', visible: 'ok_pour_apparaitre', logo: BRANDING.logoColumn };
export const ACL_TABLE = 'ACL';
export const ACL_COLUMNS = { email: 'email', etablissement: 'Responsable_de_l_Etablissement', admin: 'admin' };

// Les images que le widget envoie à Grist (le logo d'un établissement depuis 1.17.0, la photo de
// profil d'une personne depuis 1.19.0). Le fichier choisi n'est jamais envoyé tel quel : le navigateur
// le décode puis le redessine (image-prep.js), ce qui écarte tout contenu actif (un SVG qui porte un
// script) et les métadonnées de l'image (position GPS d'une photo comprise).
//   types      les formats acceptés
//   maxBytes   la taille du fichier choisi, avant qu'il soit redessiné
//   maxSide    le plus grand côté de l'image envoyée, en pixels (une image plus petite n'est pas
//              agrandie, sauf un SVG, qui se dessine à cette taille)
//   square     recadrer au centre en carré (la photo d'une personne), sinon garder les proportions
//   output     le format de l'image envoyée, et `name` le nom du fichier
//   quality    la qualité du JPEG (0 à 1), seulement pour 'image/jpeg'
export const IMAGE_RULES = {
  logo: { types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], maxBytes: 1024 * 1024, maxSide: 480, output: 'image/png', name: 'logo.png' },
  avatar: { types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 2 * 1024 * 1024, maxSide: 256, square: true, output: 'image/jpeg', quality: 0.85, name: 'photo-de-profil.jpg' }
};

// Taille des logos du bandeau des fondateurs (unités : millièmes de la largeur du bloc de
// logos, 1 014 pour la largeur du bandeau fourni par le PUI) : surface visée et bornes en
// largeur et en hauteur, voir logoSize() dans branding.js. Ces valeurs reproduisent, à une
// dizaine de pour cent près, les tailles du bandeau fourni.
export const BAND_LOGO = { area: 4150, maxWidth: 118, maxHeight: 58 };

// Recherche principale : les cartes ne se redessinent qu'une fois la frappe arrêtée depuis ce
// nombre de millisecondes. Chaque lettre tapée redessinerait sinon toute la liste (0,15 s
// à 400 contacts d'après l'audit) : un mot de six lettres n'en provoque plus qu'un seul.
export const SEARCH_DELAY_MS = 200;

// « Ma présence » : le résultat d'une bascule réussie reste dans la région d'état du bandeau,
// lue par les lecteurs d'écran et invisible à l'écran, ce nombre de millisecondes (comme le message
// d'enregistrement d'une fiche, qui reste six secondes à l'écran).
export const PRESENCE_ANNOUNCE_MS = 6000;

// Page du projet, vers laquelle renvoie la phrase du bandeau du bas.
export const PUI_URL = 'https://www.u-bordeaux.fr/universite/notre-strategie/nos-leviers/pui-reveler-le-potentiel-du-territoire';

// Taxonomie : une entrée par catégorie de filtre ou de tag de carte. Source
// unique des menus, des tags et des tables de référence à lire.
//   label, color  affichage. La couleur sert de fond à du texte blanc (les pastilles) et de
//                 couleur de texte sur blanc (les titres de groupe) : elle garde 4,5:1 au moins
//                 avec le blanc (WCAG 1.4.3). Pour en changer une, la foncer à teinte constante
//                 plutôt que d'en choisir une plus claire ; tests/accessibility.test.mjs le vérifie
//   table, field  table de référence et colonne de libellé (`field` peut lister
//                 plusieurs colonnes, essayées dans l'ordre : le libellé
//                 corrigé d'abord, le libellé brut de l'import en repli)
//   column        colonne ReferenceList de BDD qui y renvoie ; absente pour les
//                 Références simples Établissement et Rôle
//   groups        catégorie dont celle-ci est un regroupement : elle lit une
//                 autre colonne de la même table (les compétences macro sont
//                 une colonne de la table Competences) ou la déduit (voir
//                 `numberedIn`) ; `fallback` est alors le libellé des lignes que
//                 ce regroupement ne couvre pas
//   grouping      l'inverse de `groups` : la catégorie qui range celle-ci en
//                 groupes. Le menu de cette catégorie présente ses valeurs par
//                 groupe (les compétences par domaine, les tâches par action) ;
//                 le regroupement n'a pas de menu à lui, il ne sert qu'à ranger
//                 et à compter
//   hint,         sur un regroupement : l'infobulle du bouton et le texte du
//   placeholder   champ de recherche du menu qu'il range, tant que ce menu est
//                 rangé par groupe (à plat, le menu garde les textes par défaut)
//   numberedIn    sur un regroupement sans colonne à lire (ses `field` sont ceux
//                 des lignes qu'il range, qu'on ne relit pas) : le numéro avant
//                 le point du libellé d'une ligne (« 1.3 Animer le réseau ») est
//                 celui de sa ligne de cette catégorie (« Action 1 : … »), dont
//                 le libellé nomme le groupe. Tant qu'aucune ligne n'a son
//                 groupe, le menu reste à plat
//
// Les libellés lus de Grist sont rangés par clé de catégorie (referenceMaps),
// pas par table : deux catégories peuvent lire la même table.
export const CATEGORIES = {
  actions: { label: 'Actions', color: '#c84e0f', table: 'Actions', field: ['Actions_corrigees', 'Actions'], column: 'Actions' },
  taches: {
    label: 'Tâches', color: '#a96500', table: 'Taches', field: ['Taches_corrige', 'Taches'], column: 'Taches',
    grouping: 'macroTaches'
  },
  communautes: { label: 'Communautés', color: '#cf3788', table: 'Communautes', field: ['communautes_corrigees', 'communautes'], column: 'Communautes' },
  gt: { label: 'GT', color: '#158378', table: 'GT', field: ['GT_corrige', 'GT'], column: 'GT' },
  competences: {
    label: 'Compétences', color: '#9c27b0', table: 'Competences', field: ['Competences_corrigees', 'Competences'], column: 'Competences',
    grouping: 'macro'
  },
  macro: {
    label: 'Domaines', color: '#6a1b9a', table: 'Competences', field: ['Macro_competences'], column: 'Competences',
    groups: 'competences', fallback: 'Autres',
    hint: 'Cochez un domaine pour toutes ses compétences, ou dépliez-le pour choisir parmi elles',
    placeholder: 'Domaine ou compétence…'
  },
  macroTaches: {
    label: 'Actions des tâches', color: '#9a3412', table: 'Taches', field: ['Taches_corrige', 'Taches'], column: 'Taches',
    groups: 'taches', fallback: 'Sans action', numberedIn: 'actions',
    hint: 'Cochez une action pour toutes ses tâches, ou dépliez-la pour choisir parmi elles',
    placeholder: 'Action ou tâche…'
  },
  instances: { label: 'Instances', color: '#2271e2', table: 'INSTANCES', field: ['Instances_Corrigees', 'Instances'], column: 'Instances' },
  etablissement: { label: 'Établissement', color: '#147c72', table: 'Etablissements', field: ['acronyme', 'nom_complet'] },
  role: { label: 'Rôle PUI', color: '#8b5fc4', table: 'Role_Dans_le_PUI', field: 'Role' }
};

// Clé, parmi les libellés lus de Grist (referenceMaps), des noms complets des établissements
// (nom_complet, à défaut l'acronyme). Les cartes, les filtres et les tags parlent par acronyme ;
// les fenêtres (la liste d'un administrateur, le détail des changements) disent « Université de
// Bordeaux ». Ce n'est pas une catégorie : aucun filtre ni tag n'en vient.
export const ETABLISSEMENT_NAMES = 'etablissementNom';

// Ordre des boutons de filtre. Rôle PUI n'a pas de filtre (specs.md), ni les
// regroupements : les domaines sont les groupes du menu Compétences, les actions
// celles du menu Tâches.
const FILTER_KEYS = ['actions', 'taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement'];

// Ordre des sections de tags d'une carte. Établissement a son badge dédié ; les
// regroupements n'y figurent pas : la carte garde le détail des compétences et
// des tâches.
const TAG_KEYS = ['instances', 'actions', 'gt', 'competences', 'communautes', 'taches', 'role'];

const withKey = key => ({ key, ...CATEGORIES[key] });

export const FILTERS = FILTER_KEYS.map(withKey);
export const TAG_GROUPS = TAG_KEYS.map(withKey);

// Tables de référence à lire, chacune une seule fois même si plusieurs
// catégories s'y appuient.
export const REFERENCE_TABLES = [...new Set(Object.values(CATEGORIES).map(({ table }) => table))];

// Un libellé à lire par catégorie : { key, table, field } et, pour un
// regroupement, { groups, fallback } avec, s'il se déduit des numéros, numberedIn.
export const REFERENCE_SOURCES = Object.entries(CATEGORIES)
  .map(([key, { table, field, groups, fallback, numberedIn }]) => ({
    key, table, field, ...(groups && { groups, fallback, ...(numberedIn && { numberedIn }) })
  }));

// Catégories dont BDD porte une colonne ReferenceList ; `groups` pour un
// regroupement.
export const LIST_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([, category]) => category.column)
  .map(([key, { column, table, groups }]) => ({ key, column, table, ...(groups && { groups }) }));

// Ce qu'on peut changer sur une fiche, dans l'ordre du formulaire. Une personne ne change
// jamais : email (c'est lui qui désigne la personne), Etablissement et perimetre (ils
// décident de ce qui s'affiche) ni Accepte_apparaitre (l'interrupteur « Ma présence »
// l'écrit). Un administrateur qui modifie la fiche d'UNE AUTRE personne change aussi
// l'e-mail et l'établissement (`admin: true`) ; le périmètre reste l'affaire de Grist.
// Une personne qui crée sa fiche choisit en plus son établissement (`atCreation: true`) :
// elle n'en a pas encore, et sans lui la fiche ne pourrait jamais s'afficher.
//   key       colonne de BDD
//   kind      'text', 'email' (une adresse), 'phone' (numéro français), 'reference'
//             (une valeur d'une table de référence), 'list' (plusieurs) ou 'image' (la photo de
//             profil : une pièce jointe, envoyée à Grist par upload.js)
//   category  catégorie de CATEGORIES dont viennent les valeurs proposées
//   admin     réservé à un administrateur sur la fiche d'une autre personne
//   atCreation  proposé aussi à la personne qui crée sa fiche
//   afterCreation  proposé seulement une fois la fiche créée (la photo : on l'ajoute ensuite, depuis
//             « Modifier mon profil »)
//   optional  une adresse facultative (`email_affiche`) : on peut la vider, et plusieurs fiches
//             peuvent la porter, contrairement à `email`
//   labelsFrom  la table de libellés à proposer, quand ce n'est pas celle de la catégorie
//   required  une référence qu'on ne peut pas vider
const LIST_FIELD_KEYS = ['instances', 'actions', 'gt', 'competences', 'communautes', 'taches'];

export const PROFILE_FIELDS = [
  { key: 'Avatar', label: 'Photo de profil', kind: 'image', afterCreation: true },
  { key: 'prenom', label: 'Prénom', kind: 'text' },
  { key: 'nom', label: 'Nom', kind: 'text' },
  { key: 'email', label: 'E-mail', kind: 'email', admin: true },
  { key: 'Etablissement', label: CATEGORIES.etablissement.label, kind: 'reference', category: 'etablissement', labelsFrom: ETABLISSEMENT_NAMES, admin: true, atCreation: true, required: true },
  { key: 'Fonction', label: 'Fonction', kind: 'text' },
  // L'adresse que la carte montre à la place de `email` quand elle n'est pas vide (colonne facultative).
  { key: 'email_affiche', label: 'E-mail affiché', kind: 'email', optional: true },
  { key: 'numero_de_telephone', label: 'Téléphone', kind: 'phone' },
  { key: 'Role_dans_le_PUI', label: 'Rôle dans le PUI', kind: 'reference', category: 'role' },
  ...LIST_FIELD_KEYS.map(category => ({ key: CATEGORIES[category].column, label: CATEGORIES[category].label, kind: 'list', category }))
];

// Les champs que le formulaire propose : ceux de tout le monde, plus ceux de l'administrateur
// quand c'en est un qui modifie la fiche d'une autre personne (`admin` vaut exactement true :
// fermé par défaut), ou seulement l'établissement quand la personne crée sa propre fiche
// (`creating` vaut exactement true ; son e-mail est celui de son compte, il ne se saisit pas).
export const fieldsFor = (admin, creating = false) =>
  PROFILE_FIELDS.filter(field => (admin === true || !field.admin || (creating === true && field.atCreation === true))
    && !(creating === true && field.afterCreation === true));
