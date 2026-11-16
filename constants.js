// Table principale du document Grist : une ligne par personne.
export const MAIN_TABLE = 'BDD';

// Case à cocher de BDD par laquelle une personne accepte d'apparaître. Un seul nom
// pour la lecture (grist-data.js) et l'écriture (presence.js) : les deux ne
// peuvent pas diverger.
export const CONSENT_COLUMN = 'Accepte_apparaitre';
// Le nom de ce choix pour la personne : la case de la fenêtre de création et la ligne « pas gardé » d'une relecture.
export const CONSENT_LABEL = 'Apparaître dans l’annuaire';
// Le même choix vu par un administrateur qui modifie la fiche d'une autre personne (1.38.0) : la case en tête de sa fenêtre, et sa ligne
// de la relecture (« Accepte d’apparaître dans l’annuaire : Non → Oui »).
export const CONSENT_ADMIN_LABEL = 'Accepte d’apparaître dans l’annuaire';

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

// Le numéro de la version, dit dans la console avec les logos ([LOGOS], main.js) : GitHub Pages fait garder chaque fichier dix
// minutes, un navigateur peut donc exécuter une version plus ancienne que celle qui vient d'être mise en ligne. Il suit le titre du
// CHANGELOG (tests/docs.test.mjs le contrôle).
export const VERSION = '1.43.0';

// Taille des logos du bandeau des fondateurs (unités : millièmes de la largeur du bloc de
// logos, 1 014 pour la largeur du bandeau fourni par le PUI) : surface visée et bornes en
// largeur et en hauteur, voir logoSize() dans branding.js. Ces valeurs reproduisent, à une
// dizaine de pour cent près, les tailles du bandeau fourni.
export const BAND_LOGO = { area: 4150, maxWidth: 118, maxHeight: 58 };

// Logos des cartes : la surface visée et les bornes d'un logo dont les marges ont été retirées par lecture de ses pixels
// (branding-ui.js, fitCardLogo). Cette lecture ne conditionne jamais l'affichage du logo (1.27.2) : un logo dont les pixels ne
// se lisent pas tient dans une case fixe de 104 x 42 px (style.css).
export const CARD_LOGO = { area: 3200, maxWidth: 104, maxHeight: 42 };

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

// La page de la documentation sur GitHub (le README du dépôt, qui renvoie au guide utilisateur, à la documentation développeur, à la
// sécurité et à la maintenance). Depuis la 1.43.0, le bouton « Documentation » de l'en-tête (index.html, `docLink`) ouvre une fenêtre du
// widget qui lit ces documents sur le site qui sert le widget (docs-source.js) ; cette adresse n'est plus que celle que la fenêtre propose
// en bas (« Ouvrir sur GitHub », dans un autre onglet, comme le lien du bandeau du bas) et quand un document n'a pas pu être lu. C'est
// l'adresse à changer quand le dépôt change d'adresse (une migration : elle ne se déduit pas de celle du widget, qui peut être servi par un
// autre site que le dépôt). Une chaîne vide retire le bouton « Documentation » : à employer si la page n'est pas lisible sans compte.
// Toujours en https, et son serveur est nommé dans docs/securite.md (tests/docs.test.mjs).
export const DOCS_URL = 'https://github.com/lombre33/Annuaire_PUI_Bordeaux#documentation';

// Taxonomie : une entrée par catégorie de filtre ou de tag de carte. Source
// unique des menus, des tags et des tables de référence à lire.
//   label, color  affichage. La couleur sert de fond à du texte blanc (les pastilles) et de
//                 couleur de texte sur blanc (les titres de groupe) : elle garde 4,5:1 au moins
//                 avec le blanc (WCAG 1.4.3). Pour en changer une, la foncer à teinte constante
//                 plutôt que d'en choisir une plus claire ; tests/accessibility.test.mjs le vérifie
//   table, field  table de référence et colonne de libellé (`field` peut lister
//                 plusieurs colonnes, essayées dans l'ordre : le libellé
//                 corrigé d'abord, le libellé brut de l'import en repli)
//   corrected     la première colonne de `field` est le libellé corrigé et la seconde
//                 le libellé brut de l'import. Dès que la table remplit au moins un
//                 libellé corrigé, seul celui-là compte : une ligne qui n'en a pas est
//                 laissée de côté (ni menu, ni tag, ni choix de la fenêtre de
//                 modification) au lieu de montrer son libellé brut. Une table qui n'en
//                 a encore aucun garde ses libellés bruts, pour que ses filtres ne
//                 soient pas vides (voir readReferenceMap dans grist-data.js)
//   column        colonne ReferenceList de BDD qui y renvoie ; absente pour les
//                 Références simples Établissement et Rôle
//   groups        catégorie dont celle-ci est un regroupement : elle lit une
//                 autre colonne de la même table (les compétences macro sont
//                 une colonne de la table Competences) ou la déduit (voir
//                 `numberedIn`) ; `fallback` est alors le libellé des lignes que
//                 ce regroupement ne couvre pas. Sans `fallback`, une ligne que le
//                 regroupement ne couvre pas n'a pas de groupe : le menu ne la
//                 montre pas sous ce rangement (il la montre sous les autres)
//   groupings     l'inverse de `groups` : les catégories qui rangent celle-ci en
//                 groupes. Le menu de cette catégorie présente ses valeurs par
//                 groupe (les compétences par domaine, les tâches par action) ;
//                 le regroupement n'a pas de menu à lui, il ne sert qu'à ranger
//                 et à compter. Le premier est le rangement de départ ; quand
//                 il y en a plusieurs que Grist remplit (les compétences par
//                 domaine, ou par groupe C.U.R.I.E), le haut du menu a un onglet
//                 pour chacun (`tab`) : la sélection est la même, seul le
//                 rangement change
//   viewsLabel    sur une catégorie à plusieurs regroupements : le nom de la
//                 barre d'onglets, pour les lecteurs d'écran
//   hint,         sur un regroupement : l'infobulle du bouton et le texte du
//   placeholder   champ de recherche du menu qu'il range, tant que ce menu est
//                 rangé par groupe (à plat, le menu garde les textes par défaut)
//   tab           sur un regroupement : le texte de son onglet
//   optional      sur un regroupement : sa colonne est facultative. Absente ou
//                 vide dans Grist, le menu n'a pas cet onglet, sans bandeau
//                 d'erreur ni avertissement (la console le dit)
//   referential   sur un regroupement : sa colonne porte les codes d'un référentiel
//                 (des numéros, « — aucune correspondance — »), pas des noms de
//                 groupe. Une valeur qui dit « rien » (vide, 0, « aucune
//                 correspondance », « n/a »…) n'est pas un groupe : la ligne reste
//                 hors de ce rangement. Un numéro se lit « N° 13 », jamais « 13 »
//                 seul (voir referentialLabel dans grist-data.js)
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
  // Depuis la 1.39.0, la table `Actions` nomme les groupes du menu « Actions » (voir `taches` et `macroTaches`) : elle n'a ni filtre, ni liste dans la
  // fenêtre de profil. Depuis la 1.41.0 la carte montre encore l'action de la personne quand la colonne `BDD.Actions` la lui donne et qu'aucune de ses
  // tâches n'en est (ACTIONS_COLUMN) : sans cela, les personnes qui n'ont une action que là n'avaient plus rien sur leur carte.
  actions: { label: 'Intitulés des actions', color: '#c84e0f', table: 'Actions', field: ['Actions_corrigees', 'Actions'], corrected: true },
  // Les « actions » de la personne : ses tâches, que le widget appelait « Tâches » jusqu'à la 1.36.0 (demande d'Antoine du 16 novembre 2026). Le nom
  // de la clé (`taches`), de la table (`Taches`) et de la colonne de BDD (`Taches`) ne change pas : seul ce que la personne lit change de nom.
  taches: {
    label: 'Actions', color: '#a96500', table: 'Taches', field: ['Taches_corrige', 'Taches'], corrected: true, column: 'Taches',
    groupings: ['macroTaches']
  },
  communautes: { label: 'Communautés', color: '#cf3788', table: 'Communautes', field: ['communautes_corrigees', 'communautes'], corrected: true, column: 'Communautes' },
  gt: { label: 'GT', color: '#158378', table: 'GT', field: ['GT_corrige', 'GT'], corrected: true, column: 'GT' },
  competences: {
    label: 'Compétences', color: '#9c27b0', table: 'Competences', field: ['Competences_corrigees', 'Competences'], corrected: true, column: 'Competences',
    groupings: ['macro', 'curie'], viewsLabel: 'Rangement des compétences'
  },
  macro: {
    label: 'Domaines', color: '#6a1b9a', table: 'Competences', field: ['Macro_competences'], column: 'Competences',
    groups: 'competences', fallback: 'Autres', tab: 'Classique',
    hint: 'Cochez un domaine pour toutes ses compétences, ou dépliez-le pour choisir parmi elles',
    placeholder: 'Domaine ou compétence…'
  },
  // Le rangement des compétences par le référentiel C.U.R.I.E (colonne facultative `referenciel_C_U_R_I_E` de la table Competences, 1.38.0) :
  // le second onglet du menu Compétences. Même table, même colonne de BDD et mêmes valeurs que le rangement par domaine, seul le groupe change.
  // Un groupe par valeur de la colonne, sans rien inventer : dans le document d'Antoine (capture du 16 novembre 2026) elle porte des numéros
  // (0, 3, 13…) et « — aucune correspondance — », d'où `referential` ; sans `fallback`, une compétence que le référentiel ne classe pas
  // n'est pas montrée sous cet onglet (1.41.1), elle l'est sous « Classique ».
  curie: {
    label: 'C.U.R.I.E', color: '#00697f', table: 'Competences', field: ['referenciel_C_U_R_I_E'], column: 'Competences',
    groups: 'competences', tab: 'C.U.R.I.E', optional: true, referential: true,
    hint: 'Cochez un groupe C.U.R.I.E pour toutes ses compétences, ou dépliez-le pour choisir parmi elles',
    placeholder: 'Groupe ou compétence…'
  },
  macroTaches: {
    label: 'Groupes d’actions', color: '#9a3412', table: 'Taches', field: ['Taches_corrige', 'Taches'], column: 'Taches',
    groups: 'taches', fallback: 'Sans action', numberedIn: 'actions',
    hint: 'Cochez une action pour toutes ses tâches, ou dépliez-la pour choisir parmi elles',
    placeholder: 'Action ou tâche…'
  },
  instances: { label: 'Instances', color: '#2271e2', table: 'INSTANCES', field: ['Instances_Corrigees', 'Instances'], corrected: true, column: 'Instances' },
  etablissement: { label: 'Établissement', color: '#147c72', table: 'Etablissements', field: ['acronyme', 'nom_complet'] },
  role: { label: 'Rôle dans le PUI', color: '#8b5fc4', table: 'Role_Dans_le_PUI', field: 'Role' }
};

// Clé, parmi les libellés lus de Grist (referenceMaps), des noms complets des établissements
// (nom_complet, à défaut l'acronyme). Les cartes, les filtres, les tags et la liste d'établissements
// des fenêtres de profil parlent par acronyme ; seules les phrases des fenêtres (« Université de
// Bordeaux n'a pas validé sa présence ») et le choix de l'établissement à modifier disent le nom
// complet. Ce n'est pas une catégorie : aucun filtre ni tag n'en vient.
export const ETABLISSEMENT_NAMES = 'etablissementNom';

// Le rôle de la personne dans une tâche : colonne facultative `Taches_role` de la table `Taches`. Une même
// tâche corrigée recouvre plusieurs lignes brutes (une par rôle, par exemple) : le rôle d'une personne se lit
// sur les lignes brutes que BDD.Taches lui désigne, jamais sur le libellé corrigé, qui les confond. Comme
// ETABLISSEMENT_NAMES, TASK_ROLES est une clé de referenceMaps (identifiant de ligne → rôle, les lignes sans
// rôle absentes) et non une catégorie : aucun filtre ni tag n'en vient. La carte le dit au survol de la tâche.
export const TASK_ROLE_COLUMN = 'Taches_role';
export const TASK_ROLES = 'tachesRole';

// La colonne de BDD où Grist garde les actions de la personne telles que la 1.38.0 les montrait (« [ PUI ] Action 2 : Processus métiers »), une liste
// de références vers la table `Actions`. Depuis la 1.39.0 les actions de la carte sont les tâches (BDD.Taches), rangées par action ; cette colonne ne
// filtre plus et ne s'écrit pas, mais elle se lit encore, pour une seule chose : la carte d'une personne qui a une action dans cette colonne et aucune
// tâche de ce numéro montre l'action elle-même (grist-data.js, heldActionsOf). La 1.39.0 l'avait cessé de la lire : les personnes qui n'ont une action
// que là n'avaient plus rien sur leur carte (retour d'Antoine du 16 novembre 2026, la 1.39.0 a été retirée le jour même).
export const ACTIONS_COLUMN = 'Actions';

// La colonne de BDD où la personne dit de quelles actions elle est responsable (1.40.0, demande d'Antoine du 16 novembre 2026 : « sur le profil,
// sur chaque tâche, pouvoir cocher si on est responsable »). Une liste de références vers les lignes de `Taches`, comme `BDD.Taches` : le widget
// la crée quand elle manque (schema.js, createResponsibleColumn) et la personne n'écrit que sa propre ligne, comme pour le reste de sa fiche. Elle
// ne compte que pour les actions que la personne a aussi : le rôle « Responsable de l'action 1.2 » se calcule à chaque lecture (grist-data.js,
// responsibleActions), comme « Membre d'une action », et n'est écrit nulle part. `RESPONSIBLE_LABEL` : le titre du bloc de la fenêtre de profil.
export const RESPONSIBLE_COLUMN = 'Taches_responsable';
export const RESPONSIBLE_LABEL = 'Responsable de';

// Ordre des boutons de filtre. Les regroupements n'ont pas de bouton : les domaines sont les
// groupes du menu Compétences, les actions (les intitulés de la table `Actions`) ceux du menu Actions. Rôle dans
// le PUI en a un depuis la 1.24.0 (demande d'Antoine du 13 octobre 2026). Il n'y a plus de bouton « Actions » à part
// depuis la 1.39.0 : le menu des tâches porte ce nom, et cocher le nom d'une action coche toutes ses tâches.
const FILTER_KEYS = ['taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement', 'role'];

// Les sections de tags d'une carte, dans l'ordre. Établissement a son badge dédié ; les
// regroupements n'y figurent pas : la carte garde le détail des compétences et des actions. Le rôle dans le PUI
// est une section comme les autres depuis la 1.39.0 (il était écrit en texte à droite de la ligne de l'e-mail
// de la 1.27.1 à la 1.36.0), en tête : une personne en a plusieurs (voir roleEntries dans grist-data.js).
const TAG_KEYS = ['role', 'instances', 'taches', 'gt', 'competences', 'communautes'];

const withKey = key => ({ key, ...CATEGORIES[key] });

export const FILTERS = FILTER_KEYS.map(withKey);
export const TAG_GROUPS = TAG_KEYS.map(withKey);

// Tables de référence à lire, chacune une seule fois même si plusieurs
// catégories s'y appuient.
export const REFERENCE_TABLES = [...new Set(Object.values(CATEGORIES).map(({ table }) => table))];

// Un libellé à lire par catégorie : { key, table, field } avec `corrected` si sa première colonne est
// le libellé corrigé et, pour un regroupement, { groups, fallback } avec, s'il se déduit des numéros,
// numberedIn, si sa colonne est facultative, optional, et si elle porte des codes de référentiel, referential.
export const REFERENCE_SOURCES = Object.entries(CATEGORIES)
  .map(([key, { table, field, corrected, groups, fallback, numberedIn, optional, referential }]) => ({
    key, table, field, ...(corrected && { corrected }),
    ...(groups && { groups, fallback, ...(numberedIn && { numberedIn }), ...(optional && { optional }), ...(referential && { referential }) })
  }));

// Catégories dont BDD porte une colonne ReferenceList ; `groups` pour un
// regroupement.
export const LIST_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([, category]) => category.column)
  .map(([key, { column, table, groups }]) => ({ key, column, table, ...(groups && { groups }) }));

// Ce qu'on peut changer sur une fiche, dans l'ordre du formulaire. Une personne ne change
// jamais : email (c'est lui qui désigne la personne), Etablissement (il décide de ce qui
// s'affiche) ni Accepte_apparaitre (l'interrupteur « Ma présence » l'écrit). Un administrateur
// qui modifie la fiche d'UNE AUTRE personne change aussi l'e-mail et l'établissement
// (`admin: true`) ; le périmètre reste l'affaire de Grist, et ne décide plus de rien.
// Une personne qui crée sa fiche choisit en plus son établissement (`atCreation: true`) :
// elle n'en a pas encore, et sans lui la fiche ne pourrait jamais s'afficher.
//   key       colonne de BDD
//   kind      'text', 'email' (une adresse), 'phone' (numéro français), 'reference'
//             (une valeur d'une table de référence), 'list' (plusieurs), 'image' (la photo de
//             profil : une pièce jointe, envoyée à Grist par upload.js) ou 'consent' (une case à
//             cocher, vraie ou fausse : « accepte d'apparaître », réservée à un administrateur)
//   category  catégorie de CATEGORIES dont viennent les valeurs proposées
//   admin     réservé à un administrateur sur la fiche d'une autre personne
//   atCreation  proposé aussi à la personne qui crée sa fiche
//   afterCreation  proposé seulement une fois la fiche créée (la photo : on l'ajoute ensuite, depuis
//             « Modifier mon profil »)
//   optional  une adresse facultative (`email_affiche`) : on peut la vider, et plusieurs fiches
//             peuvent la porter, contrairement à `email`
//   labelsFrom  la table de libellés à proposer, quand ce n'est pas celle de la catégorie
//   required  une référence qu'on ne peut pas vider
//   companionOf  une liste qui complète celle de la colonne nommée : le formulaire la montre sous elle (« Responsable de », sous les actions),
//             à cocher parmi les valeurs que la personne a choisies, et la retire d'elle-même d'une valeur qu'on décoche
const LIST_FIELD_KEYS = ['instances', 'gt', 'competences', 'communautes', 'taches'];

export const PROFILE_FIELDS = [
  // Au début de la fenêtre d'un administrateur sur la fiche d'une autre personne (1.38.0). Pas à la création : la personne y a sa propre case
  // (CONSENT_LABEL, hors de ces champs), cochée d'avance. Sur sa fiche, c'est l'interrupteur du bandeau « Ma présence » qui la règle.
  { key: CONSENT_COLUMN, label: CONSENT_ADMIN_LABEL, kind: 'consent', admin: true, afterCreation: true },
  { key: 'Avatar', label: 'Photo de profil', kind: 'image', afterCreation: true },
  { key: 'prenom', label: 'Prénom', kind: 'text' },
  { key: 'nom', label: 'Nom', kind: 'text' },
  { key: 'email', label: 'E-mail', kind: 'email', admin: true },
  { key: 'Etablissement', label: CATEGORIES.etablissement.label, kind: 'reference', category: 'etablissement', admin: true, atCreation: true, required: true },
  { key: 'Fonction', label: 'Fonction', kind: 'text' },
  // L'adresse que la carte montre à la place de `email` quand elle n'est pas vide (colonne facultative).
  { key: 'email_affiche', label: 'E-mail affiché', kind: 'email', optional: true },
  { key: 'numero_de_telephone', label: 'Téléphone', kind: 'phone' },
  { key: 'Role_dans_le_PUI', label: 'Rôle dans le PUI', kind: 'reference', category: 'role' },
  ...LIST_FIELD_KEYS.flatMap(category => {
    const field = { key: CATEGORIES[category].column, label: CATEGORIES[category].label, kind: 'list', category };
    // Sous les actions, de quelles actions la personne est responsable (colonne facultative : absente de BDD, le formulaire ne la propose pas).
    return category === 'taches' ? [field, { key: RESPONSIBLE_COLUMN, label: RESPONSIBLE_LABEL, kind: 'list', category, companionOf: field.key }] : [field];
  })
];

// Les champs que le formulaire propose : ceux de tout le monde, plus ceux de l'administrateur
// quand c'en est un qui modifie la fiche d'une autre personne (`admin` vaut exactement true :
// fermé par défaut), ou seulement l'établissement quand la personne crée sa propre fiche
// (`creating` vaut exactement true ; son e-mail est celui de son compte, il ne se saisit pas).
export const fieldsFor = (admin, creating = false) =>
  PROFILE_FIELDS.filter(field => (admin === true || !field.admin || (creating === true && field.atCreation === true))
    && !(creating === true && field.afterCreation === true));
