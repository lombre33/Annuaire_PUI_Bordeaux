# Changelog

## 1.12.0 — Modifier sa fiche, directement, avec une relecture avant/après

Une personne connectée peut modifier sa propre fiche, et un administrateur celle de
n'importe qui. Les modifications s'appliquent tout de suite : **aucune validation par
un administrateur, aucun historique tenu par le widget, aucune table créée**. Avant
d'enregistrer, une fenêtre de relecture montre la carte avant et la carte après, avec
ce qui change repéré dans la carte « après ».

- **Où cliquer.** Un bouton « ✎ Modifier » apparaît sur les cartes que la personne
  peut modifier : la sienne (marquée « Votre fiche ») et, pour un administrateur,
  toutes. Le bandeau « Ma présence » ajoute « Modifier mon profil », y compris pour
  une personne qui n'apparaît pas dans l'annuaire. Quand plusieurs lignes portent la
  même adresse, le bandeau ne le propose pas (chaque carte garde le sien).
- **Qui peut quoi.** « Sa fiche » est la ligne de `BDD` dont `email` est l'adresse de
  la personne connectée (identité de la 1.11.0, sans tenir compte de la casse ni des
  espaces). Un administrateur (case `admin` d'`ACL`) peut modifier toutes les fiches
  affichées. Sans identité fiable (pas de table-sonde, compte Lecteur…), aucun bouton.
  C'est un verrou d'interface : seules les règles d'accès de Grist protègent les
  données (`GRIST_SETUP.md`, étape 4, réécrite pour ce cas).
- **Ce qui se modifie** : prénom, nom, fonction, téléphone, rôle dans le PUI, et les
  listes Instances, Actions, GT, Compétences, Communautés et Tâches (pastilles à
  cocher, rangées par domaine pour les compétences, avec une recherche au-delà de
  douze valeurs). **Jamais** l'adresse e-mail, l'établissement ni le périmètre (ils
  décident de qui apparaît : affaire des administrateurs, dans Grist), ni le choix de
  présence (le bandeau « Ma présence »). Un texte est nettoyé, refusé s'il commence par
  `=`, `+`, `-` ou `@` (une formule pour un tableur) ou dépasse 200 caractères ; un
  numéro doit être un numéro français à 10 chiffres, remis en forme en quittant le
  champ.
- **La relecture.** « Relire mes modifications » affiche la carte « Avant » (la fiche
  telle qu'elle est maintenant dans Grist) à côté de la carte « Après » (exactement
  ce qui sera écrit, enrichi comme le fait l'annuaire), chacune avec sa légende
  (« telle qu'elle est aujourd'hui », « telle qu'elle sera »). Dans « Après », une ligne
  de texte modifiée est mise en relief avec une pastille écrite (« modifié », « ajouté »
  ou « supprimé » : la couleur n'est jamais le seul repère), un tag ajouté porte un
  « + », un tag retiré reste visible, barré ; chaque repère est aussi dit en texte aux
  lecteurs d'écran. Dessous, la liste « Ce qui change ». Quand la fiche ne figure pas
  dans l'annuaire (la personne n'a pas accepté d'apparaître, ou son établissement n'est
  pas validé), la relecture le dit, avec la raison. Rien n'est écrit avant « Valider » ;
  « Retour » ramène au formulaire avec le brouillon intact.
- **Une écriture sûre.** Une seule action Grist (`UpdateRecord`) sur la seule fiche
  concernée : tout ou rien. Les valeurs sont calculées sur la fiche telle qu'elle est
  **au moment d'écrire** : une liste s'obtient en retirant puis en ajoutant, si bien
  qu'un tag ajouté entre-temps par un autre, ou une valeur que le formulaire ne montre
  pas (une ligne sans libellé), n'est jamais perdu. Si les champs touchés ont changé
  dans Grist depuis la relecture, **rien n'est écrit** : la fenêtre revient à la
  relecture avec ce que Grist contient et un avis ; ce que les autres ont changé dans
  d'autres champs est conservé. Le bouton est gelé pendant l'écriture (un double clic
  n'écrit qu'une fois) et Échap ne ferme pas la fenêtre. Ensuite l'annuaire est relu
  et le widget vérifie que Grist a gardé ce qu'on lui a demandé.
- **Les échecs sont dits, jamais muets** : écriture refusée par une règle d'accès,
  colonne à formule, fiche supprimée entre-temps, lecture impossible, liste qui
  contient autre chose que des identifiants de ligne, fiche qui n'aurait plus ni
  prénom ni nom : un message en français, rien ne change, le brouillon reste.
- **Le téléphone s'écrit dans la forme de sa colonne** : un nombre pour une colonne
  numérique (le 0 initial est rétabli à l'affichage), un texte sinon. Le widget lit
  pour cela le type des colonnes dans les métadonnées de Grist (`_grist_Tables_column`) ;
  s'il ne peut pas, il suit la forme de la cellule actuelle.
- **Accessibilité.** Vraie boîte de dialogue modale (`<dialog>`) : le reste de la page
  est inerte et le focus ne s'y échappe pas ; le titre de chaque étape est annoncé ;
  Échap prévient avant d'abandonner des modifications, un second appui ferme ; à la
  fermeture, le focus revient au bouton d'origine, même quand les cartes ont été
  redessinées. Sur un téléphone la fenêtre occupe l'écran et les deux cartes sont
  l'une sous l'autre.
- **Aucune table créée, aucun historique.** Le widget ne crée ni table ni colonne. La
  table-sonde `Annuaire_Sonde` de la 1.11.0 reste la seule table dont il dépende : elle
  se crée à la main, car c'est la seule façon de connaître l'adresse de la personne
  connectée. Le travail de validation par un administrateur (file de demandes), écarté
  par décision d'Antoine, est conservé sur la branche `archive/demandes-validation-administrateur`.
- **À faire dans Grist** : voir `GRIST_SETUP.md` : toutes les colonnes que le widget
  écrit doivent être des colonnes de données, et les règles d'accès (étape 4) doivent
  empêcher quiconque de modifier la fiche d'un autre, ou `email`, `Etablissement` et
  `perimetre`.
- **Pour les développeurs** : `profile.js` (droits par fiche `rightsFor`, modèle du
  formulaire, calcul des changements et leur description), `profile-save.js` (relecture
  `prepareReview`, écriture `saveProfile`, détection d'un changement concurrent),
  `preview.js` (carte « avant », carte « après », ce qui les distingue), `schema.js`
  (types des colonnes), `profile-ui.js`, `changes-ui.js` et `dom.js` (la fenêtre) et
  `dialogs.css` sont nouveaux ; `render.js` sait dessiner une carte de relecture
  (`renderPreviewCard`) et le bouton « Modifier » ; `grist-data.js` ajoute `displayName()`
  et `findById()` à l'index des personnes ; `presence.js` exporte `classifyWriteError()`.
  `tests/support/browser.mjs` regroupe l'outillage des tests navigateur (`e2e.test.mjs`
  l'utilise désormais) et le faux document Grist sait refuser une ligne précise
  (`denyRows`) et cacher les tables `_grist_*` de `listTables()`.
- **Tests** : NN_TESTS tests (NN_E2E dans un vrai navigateur, optionnels sans Playwright), dont
  NN_NEW pour ce lot : construction des écritures (listes calculées sur la fiche
  actuelle, téléphone numérique ou texte), relecture, conflit concurrent, refus, cartes
  avant/après, et le parcours complet dans Chromium. Contrôle négatif : 47 modifications
  du code (signature de conflit non comparée, liste écrite sans les valeurs actuelles,
  retrait ignoré, colonne en trop écrite, carte « après » identique à « avant », bouton
  sur toutes les cartes, Échap sans avertissement…) font chacune échouer au moins un test.

## 1.11.0 — « Ma présence » : la personne connectée choisit d'apparaître ou non

Une personne connectée à Grist voit, au-dessus des filtres, un bandeau qui lui dit
si elle apparaît dans l'annuaire et lui laisse l'activer ou la retirer d'un clic.
L'interrupteur écrit `Accepte_apparaitre` sur sa ligne de `BDD`, et seulement cette
case.

- **Qui est connecté.** L'API des widgets Grist ne donne pas l'adresse e-mail de la
  personne : le widget emploie la technique de `publipostage+`, une table-sonde
  `Annuaire_Sonde` dont la formule de déclenchement `user.Email` est calculée par
  Grist à la création d'une ligne. À chaque chargement, le widget ajoute une ligne,
  la relit par son identifiant (jamais « la dernière ») puis la supprime. La même
  ligne dit si la personne est administrateur, d'après `ACL` : la valeur est
  calculée par Grist, jamais déclarée par le navigateur.
- **Dans le doute, personne n'est identifié.** Sans table-sonde, sans adresse
  renvoyée par la formule, si Grist refuse l'écriture, ou pour un compte Lecteur
  (cadre `?readonly=true` : le widget n'essaie même pas d'écrire), il n'y a pas de
  bandeau et rien d'autre ne change. L'identité ne retarde ni ne casse jamais
  l'annuaire. La console dit pourquoi (`[IDENTITE] …`) sans jamais écrire d'adresse.
- **Retrouver sa fiche** : par `BDD.email`, sans tenir compte de la casse ni des
  espaces. Aucune ligne ne porte l'adresse (ou `BDD` n'a pas de colonne `email`) :
  pas de bandeau, la console l'explique. Une adresse portée par plusieurs lignes : le
  choix s'applique à toutes (un retrait vaut partout), la console le signale.
- **Ce qu'on dit à la personne**, dans ses mots : elle apparaît (avec, pour un
  partenaire, la mention de l'interrupteur « Partenaires ») ; elle n'apparaît pas ;
  ou elle a accepté mais reste masquée, avec la ou les raisons (pas de périmètre,
  pas d'établissement, établissement inconnu, non validé, ni fondateur ni
  partenaire, ni nom ni prénom). Ce verdict suit les mêmes critères que
  l'annuaire : un test le vérifie ligne par ligne.
- **Un interrupteur fiable.** Gelé pendant l'écriture (un double clic n'écrit
  qu'une fois) ; une seule action atomique, même pour plusieurs lignes ; puis
  l'annuaire est relu, si bien que l'interrupteur et les cartes montrent ce que
  Grist a vraiment enregistré, pas ce qu'on espérait. Écriture refusée par une
  règle d'accès, ou colonne à formule : message clair en français, rien ne change.
- **Un verrou d'interface, pas une sécurité.** N'importe qui peut contourner
  l'interface depuis la console du navigateur ; seules les règles d'accès de Grist
  protègent les données (`GRIST_SETUP.md`, étape 4).
- **À faire dans Grist** : voir `GRIST_SETUP.md` : `Accepte_apparaitre` en colonne de
  données, la table `Annuaire_Sonde`, la case `admin` d'`ACL`.
- **Pour les développeurs** : `loadDirectory` renvoie aussi `people`, l'index de
  toutes les lignes de `BDD` par adresse (`findByEmail`) ; `main.js` isole
  `reloadDirectory()` ; `identity.js`, `presence.js` et `account-ui.js` sont
  nouveaux ; `tests/support/fake-grist.js` est un faux document Grist qui sert aux
  tests Node et au test navigateur (lectures, écritures atomiques, formules
  déclenchées de la sonde, pannes, écritures refusées).
- **Tests** : 188 tests (136 unitaires, 1 règle du projet, 51 dans un vrai
  navigateur dont 17 pour ce lot). Contrôle négatif : huit modifications du code
  (accord compté sur une seule fiche, `true` écrit à tout coup, Lecteur qui tente
  d'écrire, `admin` accepté pour toute valeur vraie, ligne de sonde non retirée,
  adresse non vérifiée, adresses comparées avec la casse, verdict sans l'accord
  de la personne) font chacune échouer de 1 à 3 tests.

## 1.10.0 — Consentement individuel : seules les personnes qui l'ont accepté apparaissent

Un contact ne s'affiche plus que si la personne a accepté d'apparaître
(`BDD.Accepte_apparaitre`, une case à cocher), en plus des règles existantes :
périmètre renseigné, établissement validé (`ok_pour_apparaitre`) et fondateur
ou partenaire. Les deux accords sont indépendants : l'établissement ne remplace
pas celui de la personne, et celui de la personne ne contourne pas
l'établissement.

- **Seul `true` vaut accord.** Une case décochée, vide, `0` ou un texte ne
  suffisent pas : dans le doute, la personne n'apparaît pas.
- **Colonne obligatoire.** Si `Accepte_apparaitre` n'existe pas dans `BDD`, le
  widget affiche une erreur explicite (« colonne « Accepte_apparaitre » absente
  de la table BDD ») et aucune carte : jamais l'annuaire de tout le monde faute
  de pouvoir vérifier l'accord.
- **Annuaire vide expliqué.** Si personne n'a accepté, le bandeau le dit
  (« Personne n'a accepté d'apparaître : Accepte_apparaitre n'est coché pour
  aucun contact… ») au lieu de laisser un « 0 contact » muet. Des refus
  individuels, eux, ne sont pas une anomalie : pas de bandeau.
- **Console.** `[CONSENTEMENT] n/m contact(s) du périmètre masqué(s)` donne le
  nombre de personnes masquées, jamais leurs noms ni leurs adresses.
- **À faire dans Grist avant de fusionner** : `Accepte_apparaitre` doit être une
  colonne de données (type Bascule), pas une formule, et cochée pour les
  personnes qui doivent figurer dans l'annuaire. Tant qu'elle ne l'est pour
  personne, l'annuaire est vide (avec son bandeau).
- **Tests** : 133 tests (98 unitaires, 1 règle du projet, 34 dans un vrai
  navigateur). Le jeu de données a deux personnes de plus (l'une a refusé, l'autre
  n'a pas répondu) ; toutes les autres ont accepté, pour que chaque règle de
  visibilité se teste seule. Contrôle négatif : retirer le filtre, ou accepter
  toute valeur « vraie », fait échouer 9 et 2 tests.

## 1.9.1 — Le widget s'adapte à la largeur de son cadre (responsive)

Le widget exigeait 980px de large (`body { min-width: 980px }`, « Pas de responsive »
dans `specs.md`). Or sa largeur est celle de la section Grist qui le porte : dans un
panneau étroit, sur une tablette ou un téléphone, la page défilait horizontalement
(660px de trop à 320px de large), les trois colonnes de cartes ne bougeaient pas, 7
menus de filtres sur 8 sortaient du cadre à 320px et le badge de l'établissement
recouvrait la fin du nom (jusqu'à 92px, et encore 52px à 1920px pour les noms les plus longs).
Mesuré de 320 à 1920px sur 30 contacts aux noms, adresses et tags très longs
(`tests/fixtures-responsive.mjs`).

À partir de 1400px, la mise en page est celle de la 1.9.0 : sur les 22 contacts
fictifs de `docs/demo`, 25 captures pleine page (1400, 1440, 1480, 1600 et 1920px ;
liste, recherche, interrupteur Partenaires, menu ouvert, état vide) et les 10
captures de la documentation sont identiques au pixel près, tout comme celles du jeu
chargé de `tests/fixtures-responsive.mjs` une fois ses noms raccourcis. Seuls
changent les noms qui passaient sous le badge et les textes sans point de coupure.

- **Cartes** : trois colonnes dès 840px, deux de 600 à 839px, une sous 600px (avant :
  trois colonnes de 240px au moins). Marges de 12px sous 600px, au lieu de 34px.
- **Barre d'outils** : sous 1400px, la recherche, les interrupteurs
  Fondateurs/Partenaires et « Réinitialiser » passent sur une première rangée et les
  filtres prennent toute la largeur dessous (à 1024px : 2 rangées de filtres au lieu
  de 4). Sous 600px, tout s'empile et s'étire d'un bord à l'autre : la recherche, les
  filtres, puis les interrupteurs.
- **Nom et badge de l'établissement** : ils partagent la même rangée de la carte, le
  nom ne passe plus dessous. Il peut tenir sur deux lignes au lieu d'être coupé par
  une ellipse ; la fonction garde, dessous, toute la largeur de la carte. Un nom, une
  fonction, un tag ou une adresse e-mail sans point de coupure revient à la ligne
  dans sa carte au lieu de la dépasser.
- **Menus de filtres** : un menu plus large que le cadre (270px) est réduit à sa
  largeur, et `keepMenuInView()` (`render.js`) décale un menu ouvert vers la gauche
  juste assez pour qu'il reste dans le cadre. Dans un cadre large, il ne bouge pas :
  il s'ouvre sous son bouton, comme avant.
- **Petit écran, écran tactile** : sous 600px ou avec un écran tactile (`pointer:
  coarse`), le texte des cartes passe de 8,5-10,5px à 10-12px (nom à 15px au lieu de
  14). Sous 600px, le titre passe de 34 à 28px et le compteur de résultats passe
  sous lui. Au tactile : tags et badges d'au moins 28px de haut, lien e-mail d'au
  moins 24px, options de menu de 44px, champs de saisie à 16px (en dessous, iOS zoome
  sur la page à la saisie) ; le survol ne reste pas « collé » après un appui
  (`hover: none`).
- **Tests** : `tests/responsive.test.mjs`, 15 scénarios dans un vrai navigateur, de
  280 à 1920px, de part et d'autre de chaque seuil et avec des barres de défilement
  visibles (15px de moins), plus un contrôle du jeu de données (coordonnées
  fictives). 13 des 15 scénarios échouent sur la 1.9.0 ; les deux autres vérifient
  la mise en page de bureau, qui ne change pas. Des variantes cassées à la main (une
  règle de `style.css` ou de `render.js` retirée ou modifiée à la fois) font échouer
  au moins un scénario, sauf celles sans effet visible ou qui ne changent qu'un
  espacement ; ce contrôle a fait retirer quatre règles sans effet ou non vérifiables.
- **Documentation** : `specs.md` (« Pas de responsive » remplacé par l'exigence),
  `TESTING.md` (section 12 du protocole manuel), README et pages de `docs/` qui
  disaient « pas de version mobile ».
- **Limites** : vérifié dans Chromium (écran tactile émulé compris), pas dans Safari,
  Firefox ni un vrai Grist sur téléphone : voir `TESTING.md`, section 12. Entre 600
  et 675px de large environ, « Réinitialiser » se retrouve seul sur sa ligne, sous la
  recherche. Les espacements (marges, hauteurs de boutons, arrondis) ne sont pas
  contrôlés par les tests.

## 1.9.0 — Filtre « Domaines » : la recherche par compétences macro

Le document Grist regroupe désormais les compétences par domaine
(`Competences.Macro_competences`). Le widget propose ce regroupement comme un
filtre de plus, sans rien retirer au détail : le menu « Compétences » et les
tags des cartes restent ceux de la 1.8.0.

- **Nouveau filtre « Domaines »**, placé avant « Compétences ». Cocher un ou
  plusieurs domaines garde les contacts qui ont au moins une compétence dans
  l'un d'eux (OU entre domaines, ET avec les autres filtres, comme partout).
  Le détail reste filtrable en plus : cocher « Cancérologie » puis
  « Hématologie » donne les contacts de ce domaine qui ont cette compétence, et
  le menu « Compétences » affiche alors le nombre de contacts de ce domaine.
  Une infobulle fait le lien avec le nom « compétences macro ».
- **Aucun contact introuvable** : une compétence sans domaine renseigné est
  classée sous « Autres », et la console liste ses identifiants de ligne pour
  la classer dans Grist. Un contact qui a deux compétences du même domaine
  compte une seule fois dans ce domaine.
- **Un seul domaine par écriture** : « Cancérologie » et « cancerologie » (casse,
  accents) ne forment qu'une option, écrite comme la plus petite ligne de la
  table. Si la colonne `Macro_competences` n'existe pas, le bandeau le dit et le
  filtre reste vide (il ne classe pas tout le monde sous « Autres »).
- **Le domaine d'un contact se déduit de `BDD.Competences`** (même colonne que
  les compétences) : la colonne `BDD.Comptetences_macr` n'est pas lue.
- **Libellés rangés par catégorie** : `referenceMaps` est indexé par clé de
  catégorie (`competences`, `macro`…) et non plus par table, parce que deux
  catégories lisent la même table `Competences`. Elle n'est toujours lue
  qu'une fois par chargement (`REFERENCE_TABLES` liste les tables,
  `REFERENCE_SOURCES` les libellés par catégorie). Un même libellé écrit deux
  fois pour un contact (casse, accents) n'apparaît plus qu'une fois dans
  une catégorie, et ne compte donc qu'une fois dans les compteurs des menus.
- **Tests** : 122 tests (91 unitaires, 1 règle du projet, 30 dans un vrai
  navigateur). Les données de test ont maintenant quatre compétences, dont une
  sans domaine et un domaine écrit autrement.

## 1.8.0 — Nouvelle structure Grist : le widget lit la table BDD

Le document Grist a été restructuré : la table principale est désormais `BDD`
(l'ancienne `Annuaire` n'est plus lue) et plusieurs tables de référence ont
changé de nom ou de colonnes. Le widget est remappé en conséquence, sans changer
aucune règle d'affichage : à données équivalentes, ce sont les mêmes contacts
(vérifié par le test navigateur, voir ci-dessous).

- **Table principale** : `BDD` (constante `MAIN_TABLE` de `constants.js`). Les
  noms de colonnes de Grist sont repris tels quels dans le code : `prenom`,
  `nom`, `email`, `Fonction` (au lieu de `Prenom`, `Nom`, `Email`, `fonction`).
- **Établissement** : référence directe `BDD.Etablissement`, résolue par
  identifiant de ligne. `Etablissement2` n'existe plus, et la colonne
  `nom_de_domaine` n'est jamais utilisée (un test le garantit). Deux lignes
  d'Etablissements de même acronyme ne se mélangent plus : chaque contact garde
  le statut de sa propre ligne. L'ancien bandeau « acronymes en double » ne
  s'affiche plus que si Grist envoie la référence en texte.
- **Périmètre** : `perimetre` remplace `perimetre_all` pour la règle « au moins
  une valeur ».
- **Compétences** : `BDD.Competences`, liste de références vers la table
  `Competences`, remplace les colonnes de texte libre `competences_1` à
  `competences_15`. Le menu et les cartes affichent les mêmes libellés.
- **Tables de référence** : `Communautees` → `Communautes`, `Competances` →
  `Competences`, `Instances` → `INSTANCES` (majuscules). Chaque table a un
  libellé brut et un libellé corrigé : le corrigé est affiché quand il est
  rempli, le brut sinon (`field` de chaque entrée de `CATEGORIES`).
- **Colonnes obligatoires** de BDD : `nom`, `prenom`, `Etablissement`,
  `perimetre` ; une colonne absente affiche un bandeau explicite au lieu d'un
  « 0 contact ». `email`, `Fonction`, `numero_de_telephone` et
  `Role_dans_le_PUI` sont facultatives : absentes, la carte ne les affiche
  simplement pas. Le téléphone et le rôle PUI, d'abord retirés de BDD, ont été
  rajoutés sous les mêmes noms : la carte les affiche de nouveau (téléphone, tag
  « Rôle PUI »).
- **Colonnes introuvables signalées** : une colonne de visibilité d'Etablissements
  (`fondateur`, `partenaire`, `ok_pour_apparaitre`) absente provoque une erreur
  explicite, comme pour BDD, au lieu d'un annuaire vide. Si aucune colonne de
  libellé d'une table de référence n'existe (ex. `Actions_corrigees` et
  `Actions`), le bandeau le dit et le filtre correspondant reste vide ; si seule
  la colonne corrigée manque, le libellé brut est utilisé et la console avertit.
- **Pas encore utilisée** : `Accepte_apparaitre` (aujourd'hui une formule qui
  renvoie toujours faux) n'influence pas l'affichage.
- **Tests** : 99 tests (74 unitaires, 1 règle du projet, 24 dans un vrai
  navigateur). Le jeu de données `tests/fixtures.mjs` reproduit la structure BDD.
  Nouveaux : lecture des seules tables de la nouvelle structure, libellé
  corrigé prioritaire, colonnes obligatoires, facultatives ou introuvables,
  doublons d'acronymes, interdiction de la colonne du nom de domaine
  (`tests/rules.test.mjs`).

## 1.7.2 — Refactor sans changement de comportement

Relecture « dev senior » de l'audit : le code est réorganisé pour se lire et se
modifier plus facilement. Aucune règle d'affichage ne change. Vérifié en
rejouant 25 étapes d'un même scénario (recherche, filtres, interrupteurs,
pannes de lecture...) sur la 1.7.1 et sur cette version : DOM et captures
d'écran identiques, hors l'attribut `data-value` ajouté aux options de filtre.

- **Taxonomie unique** : `constants.js` déclare chaque catégorie une seule fois
  (`CATEGORIES` : libellé, couleur, table et colonne Grist). `FILTERS`,
  `TAG_GROUPS`, `REFERENCE_TABLES` et `LIST_CATEGORIES` en sont dérivés. Ajouter
  une catégorie = une entrée (avant : trois listes à garder cohérentes).
- **Libellés regroupés** : un contact enrichi porte `labels: { clé: [...] }`,
  lu par `labelsOf(contact, clé)`, au lieu de clés `instances_labels`,
  `role_labels`... reconstruites par concaténation de chaînes dans trois
  fichiers (une faute de frappe y faisait disparaître des tags sans erreur).
- **Fonctions courtes** : `createFilterUI` (80 lignes), `renderCards` (65) et
  `loadDirectory` (57) sont découpées en étapes nommées ; `filterContacts` en
  trois prédicats. `setBadge`, `orderedValues`, `isBlank` et `currentCounts`
  remplacent du code écrit deux ou trois fois.
- **`pruneStaleFilters()`** renvoie un nouvel état au lieu de modifier son
  argument : `filters.js` n'a plus d'effet de bord.
- **Valeur d'une option de filtre** posée dans `data-value` à la création, au
  lieu d'être relue depuis le texte affiché.
- **Commentaires** réécrits : ils disent pourquoi le code est ainsi ; l'histoire
  des bugs est ici et dans les messages de commit.
- **CSS et HTML** reformatés (une règle ou un élément par ligne). Code mort
  retiré : six règles `[data-category]`, `.active-chip` et la zone vide
  `#activeFilters` (son espacement est repris par `.cards-grid`).
- **Tests** : 82 tests, dont un nouveau pour `labelsOf`. Les tests unitaires
  sont répartis par module (`tests/grist-data.test.mjs`, `enrich`,
  `etablissements`, `filters`, `load-directory`, `constants`) au lieu d'un seul
  fichier de 600 lignes ; leur contenu est inchangé.

## 1.7.1 — Pannes de lecture Grist visibles, chargement unique, test navigateur

Correctifs issus de l'audit qualité/sécurité. Aucun changement de règle
d'affichage : les contacts affichés avec des données saines sont les mêmes
qu'en 1.7.0 (vérifié par le test navigateur, voir ci-dessous).

- **Plus de « 0 contact » trompeur** : une lecture Grist qui échoue
  (Annuaire ou Etablissements illisibles, colonne `Etablissement2` ou
  `perimetre_all` absente d'Annuaire) affiche un bandeau d'erreur explicite
  (`#statusBanner`) au lieu d'un annuaire vide. Si des cartes sont déjà
  affichées, elles restent en place ; le bandeau disparaît au chargement réussi
  suivant.
- **Annuaire vide expliqué** : quand la table contient des lignes mais
  qu'aucun contact n'est affichable, le bandeau dit pourquoi (`perimetre_all`
  vide partout, `Etablissement2` vide partout, ou aucun établissement validé).
- **Table de référence illisible** (Actions, GT, Instances...) : on réutilise
  ses libellés du chargement précédent et le bandeau le signale. Avant, la
  table devenait vide en silence : les tags disparaissaient et les filtres
  cochés étaient effacés par `pruneStaleFilters()`.
- **Acronymes d'établissement en double** : deux lignes d'Etablissements de
  même acronyme et de statuts différents ne se départagent plus par leur ordre
  dans la table. On garde le plus strict (contacts masqués dans le doute) et le
  bandeau le signale.
- **Table Etablissements lue une seule fois** par chargement (elle l'était
  deux fois, pour les libellés puis pour les indicateurs). Nouvelle fonction
  `loadDirectory()` (grist-data.js) : lit toutes les tables, construit les
  contacts et renvoie les problèmes à signaler. `fetchTable()` et
  `fetchEtablissementsFlags()` sont remplacées par `labelMapFromRows()` et
  `etablissementFlagsFromRows()` (pures, sans lecture).
- **Lien mailto** : créé seulement pour une adresse simple. Une adresse saisie
  avec `?cc=...`, plusieurs destinataires ou des espaces reste affichée en
  texte, sans lien (`mailtoHref()`).
- **Console** : le diagnostic des contacts sans `Etablissement2` liste les
  identifiants de ligne Grist (plus les adresses email).
- **Recherche interne des menus de filtre** insensible aux accents, comme la
  recherche principale (`normalize()`).
- **Tests** : 56 tests unitaires (la 1.7.0 en annonçait 45 pour 44 réels) et
  20 scénarios dans un vrai navigateur (`tests/e2e.test.mjs`, Playwright
  optionnel, API Grist simulée, données de `tests/fixtures.mjs`). Workflow
  GitHub Actions `tests.yml` qui les exécute sur chaque PR.

Mesure (pas de correctif) : taper dans la recherche coûte 10 à 17 ms à
500 lignes d'Annuaire et 45 à 65 ms à 2 000 lignes ; pas de debounce
nécessaire à l'échelle actuelle.

## 1.7.0 — Défaut Partenaires désactivé, en-tête PUI Bordeaux, compteurs par option

- **Scope Fondateurs/Partenaires** : "Partenaires" est désormais décoché par
  défaut au chargement (Fondateurs reste coché). Le bouton "Réinitialiser" ne
  touche plus du tout ces 2 interrupteurs — un choix fait par l'utilisateur
  pendant la session (ex: activer Partenaires) survit à un clic sur
  "Réinitialiser", qui ne remet à zéro que les autres filtres/la recherche.
- **En-tête** : remplace le bloc eyebrow/titre/sous-titre ("Annuaire PUI
  Bordeaux" / "Annuaire des membres" / "Retrouvez les contacts...") par
  "PUI Bordeaux" (titre) / "Annuaire des accompagnateurs de l'innovation"
  (sous-titre) / "Pas de mauvaise porte, toujours le bon interlocuteur"
  (accroche, nouvelle classe `.tagline`). Classe `.eyebrow` (devenue inutile)
  retirée du CSS.
- **Compteurs par option de filtre** : chaque option d'un menu de filtre
  affiche désormais à droite le nombre de cartes qui correspondraient si on
  la cochait, compte tenu de tous les AUTRES filtres déjà actifs (recherche,
  scope, autres catégories) — pas seulement un total brut. Réutilise la
  classe `.option-count`, présente dans le CSS mais inutilisée jusqu'ici.
  - `filterContacts()` (filters.js) prend un 5e paramètre optionnel
    `excludeKey` : saute la vérification d'une catégorie, pour calculer son
    propre compte sans que sa propre sélection ne le fausse.
  - Nouvelle fonction pure `computeFilterCounts()` (filters.js), qui tallie
    par catégorie et par libellé normalisé (cohérent avec le matching
    insensible casse/accents déjà en place).
  - `createFilterUI()` affiche le compte initial ; nouvelle fonction
    `updateFilterCounts()` (render.js) rafraîchit TOUS les menus après
    chaque `refreshCards()` (recherche, scope, filtre, reset) sans perturber
    un menu ouvert (même principe que `updateFilterUI()`).
- **Tests** : couverture de `excludeKey` et `computeFilterCounts()` (45/45
  tests passent).

## 1.6.0 — Filtrage par statut d'établissement (fondateur/partenaire/ok_pour_apparaitre)

**Feature** : les cartes ne sont désormais visibles que si l'établissement du
contact est fondateur OU partenaire (jamais "autres"), ET a validé son
apparition (colonne `ok_pour_apparaitre`). Ces 4 colonnes booléennes vivent
dans la table Etablissements (cf. `grist_structure.txt`).

- Nouvelles fonctions pures (`grist-data.js`) : `fetchEtablissementsFlags()`
  (charge la table Etablissements et indexe fondateur/partenaire/
  ok_pour_apparaitre par id de ligne ET par libellé résolu — même ambiguïté
  d'encodage Grist que pour le reste de la table, voir refId()/refLabel()),
  `etablissementFlags()` (résout les indicateurs d'un contact) et
  `isEtablissementEligible()` (la règle d'éligibilité : ok_pour_apparaitre ET
  (fondateur OU partenaire) ; un contact sans établissement identifiable dans
  la table — repli Etablissement2, référence orpheline — est exclu par
  défaut, faute de validation à faire valoir).
- `enrich()` attache `etablissement_fondateur` / `etablissement_partenaire` /
  `etablissement_ok_pour_apparaitre` à chaque contact (3e paramètre optionnel
  `etabFlags`, rétrocompatible).
- `main.js` applique `isEtablissementEligible()` en filtre fixe (non
  désactivable) avant tout affichage.
- **UI** : 2 interrupteurs sobres "Fondateurs" / "Partenaires" dans la barre
  d'outils (cochés par défaut), pour affiner l'affichage parmi les contacts
  déjà éligibles ci-dessus — pilotés par `filterContacts(..., scope)`
  (`filters.js`), un 4e paramètre optionnel distinct des menus `FILTERS`
  existants (2 interrupteurs fixes, pas une liste de valeurs Grist).
- **Tests** : couverture complète des nouvelles fonctions pures et du
  paramètre `scope` de `filterContacts()`.

## 1.5.1 — Correctif urgent : tags Instances/Actions/GT/Communautés/Tâches disparus en prod

Régression introduite par le correctif "#7" de la 1.4.0 (qui retirait
l'affichage d'un id numérique brut quand une référence ne résolvait à aucun
libellé). Constatée en production le jour même du déploiement de 1.4.0/1.5.0 :
plus aucun tag Instances/Actions/GT/Communautés/Tâches sur aucune carte,
filtres correspondants inopérants (Établissement et recherche libre non
affectés).

**Cause réelle** : les tables liées à ces 5 colonnes ReferenceList ont, en
production, une "visible column" configurée — Grist envoie donc les items de
la liste déjà résolus en texte (ex. `['L', 'CME']`), pas en id numérique brut
(`['L', 7]`) comme supposé. `enrich()` cherchait
`referenceMaps['Instances'][String('CME')]`, qui échoue nécessairement (la
table est indexée par id numérique, pas par texte) — l'item était alors jeté
par le correctif 1.4.0 au lieu d'être affiché. Avant 1.4.0, un fallback
`|| text(id)` masquait ce cas par coïncidence (`text('CME') === 'CME'`) ; ce
même fallback affichait aussi, à tort, l'id numérique brut ("47") quand une
référence était réellement introuvable — les deux cas partageaient le même
code et ne pouvaient pas être distingués sans le corriger correctement.

C'est exactement le risque identifié — mais classé comme non confirmé,
donc non traité — lors de l'audit archi/sécurité (angle "invariants",
voir historique de la revue) : la même ambiguïté texte-déjà-résolu/id-brut
qui avait cassé Établissement (CHANGELOG 1.1.0-1.1.2) pouvait aussi affecter
les colonnes ReferenceList. Elle s'est avérée réelle.

- **Correctif** : nouvelle fonction `resolveListItem(item, referenceMap)`
  (grist-data.js), utilisée par `enrich()` pour chaque item d'une
  ReferenceList — gère le texte déjà résolu (retourné tel quel) ET l'id
  numérique brut (résolu via la table de référence, `''` si introuvable,
  toujours filtré ensuite). Signature volontairement proche de
  `refLabel()`/`refId()`, qui géraient déjà ce même risque pour les
  Références uniques (Établissement, Rôle PUI).
- **Tests** : régression figée explicitement — `resolveListItem` testé sur
  les 2 formes, et un test `enrich()` dédié reproduit le scénario exact
  constaté en prod (items ReferenceList pré-résolus en texte).

## 1.5.0 — Valeurs cochées en tête de menu + badge de comptage

- **Feature** : dans chaque menu de filtre, la ou les valeurs cochées
  remontent en tête de liste (le reste des options reste trié
  alphabétiquement en dessous) — nouvelle fonction pure
  `sortWithCheckedFirst()` (grist-data.js), utilisée à la construction du
  menu. Le bouton du filtre affiche en plus un badge avec le nombre de
  valeurs cochées (`.filter-count` — CSS déjà présente dans le projet mais
  inutilisée depuis le retrait de cette fonctionnalité en v0.98 ; simplement
  reconnectée).
- Une case cochée/décochée met à jour uniquement le menu concerné
  (`updateFilterUI()`, render.js) sans reconstruire tout le DOM des filtres —
  un autre menu resté ouvert, ou une recherche tapée dedans, n'est pas
  perturbé (même principe que le correctif 1.4.0 sur `createFilterUI`).
  Attention lors de la mise à jour de cette fonction : l'ordre au sein de
  chaque groupe (coché / non coché) est recalculé par tri explicite à chaque
  appel, pas déduit de l'ordre DOM existant — une valeur qui passe de cochée
  à non cochée doit reprendre sa place alphabétique, pas rester figée là où
  elle se trouvait juste avant (piège identifié et corrigé pendant le
  développement de cette version, voir le test associé dans
  `tests/data.test.mjs`).
- **Même comportement quelle que soit l'origine du clic** : cocher une case
  dans un menu, cliquer le badge établissement d'une carte, ou cliquer un tag
  de carte (Instances/Actions/GT/Compétences/Communautés/Tâches) déclenchent
  tous la même fonction `toggleFilter()` dans `main.js` — `updateFilterUI()`
  y est appelée une seule fois pour couvrir les trois cas. Point d'attention
  spécifique aux clics venus d'une carte : ils ne passent jamais par la case
  à cocher du menu (qui peut même ne pas être montée si le menu n'a jamais
  été ouvert) — `updateFilterUI()` resynchronise donc explicitement l'état
  `checked` de la case, pas seulement l'habillage visuel, sans quoi rouvrir
  le menu après un clic sur une carte aurait montré une case décochée pour un
  filtre pourtant actif.

## 1.4.0 — Audit & stabilisation (2) : 9 correctifs + refonte enrich()/constants.js

Suite à une revue d'architecture/sécurité complète (agents indépendants sur
8 angles : correction, invariants, traçage inter-fichiers, réutilisation,
simplification, efficacité, altitude, conventions — chaque candidat
re-vérifié indépendamment avant retenue). Aucun changement de périmètre
fonctionnel : les correctifs alignent le comportement sur `specs.md`, rien
n'est ajouté ni retiré côté fonctionnalités utilisateur.

**Correctifs (bugs) :**

- **Tag "Rôle PUI" invisible sur toutes les cartes, quelles que soient les
  données.** `enrich()` ne posait que `role_label` (singulier), jamais lu
  nulle part — `TAG_GROUPS`/`render.js` attendent `role_labels` (pluriel,
  convention commune à tous les groupes de tags). `enrich()` pose désormais
  `role_labels` comme un tableau (0 ou 1 élément), au même titre que les
  autres catégories.
- **Numéros de téléphone affichés sans leur 0 initial.** `numero_de_telephone`
  est une colonne Grist **Numeric** : un numéro saisi `0556789012` est stocké/
  renvoyé comme `556789012` (un type numérique ne peut pas porter de zéro
  initial). Nouvelle fonction `formatPhone()` (grist-data.js) qui rétablit le
  0 pour tout numéro à 9 chiffres et formate par paires ("05 56 78 90 12") ;
  tout format inattendu est renvoyé tel quel plutôt que déformé.
- **Filtre "Compétences" silencieusement inefficace en cas de casse/accents
  différents.** Le menu "Compétences" liste les libellés de la table
  `Competances`, mais chaque contact a ses tags dans 15 colonnes de texte
  libre (`competences_1`..`15`) — deux sources jamais recoupées. Nouvelle
  fonction `normalize()` (casse + accents, via `NFD` + `\p{Diacritic}`)
  utilisée pour le matching de tous les filtres catégorie ainsi que pour la
  recherche libre nom/prénom (strictement plus permissive que l'ancien
  `toLocaleLowerCase('fr-FR')` seul : aucune recherche qui fonctionnait avant
  ne peut cesser de fonctionner).
- **Sélection de filtre bloquée silencieusement à 0 résultat après un
  renommage côté Grist.** `activeFilters` est indexé par libellé (pas par
  id) ; renommer un établissement/une instance/etc. dans Grist laissait
  l'ancien libellé coché dans un Set sans case à cocher correspondante pour
  le décocher — seul "Réinitialiser" (qui vide tout) permettait de s'en
  sortir. Nouvelle fonction `pruneStaleFilters()` (filters.js), appelée à
  chaque rafraîchissement des tables de référence : retire une sélection
  qui n'est plus une option valide du menu, sans toucher à une sélection
  simplement sans contact correspondant pour l'instant (ce n'est pas la même
  chose).
- **Rendu périmé possible en cas d'éditions rapprochées dans Grist.**
  `window.grist.onRecords` peut se redéclencher avant la fin d'un appel
  précédent (8 `fetchTable()` en vol) ; sans garde, l'invocation la plus
  lente pouvait résoudre en dernier et écraser un affichage plus récent avec
  des données périmées. Nouveau `createRequestSequencer()` (grist-data.js) :
  seule l'invocation la plus récente est autorisée à appliquer son résultat.
- **Menus de filtres fermés/vidés à chaque édition, même sans rapport avec
  les filtres.** `createFilterUI()` (destructive : ferme tout menu ouvert,
  vide les recherches internes) et le rafraîchissement des 8 tables de
  référence s'exécutaient à chaque déclenchement de `onRecords`, y compris
  pour l'édition d'un seul champ d'un seul contact. Nouvelle fonction
  `referenceMapsEqual()` : la reconstruction des menus n'a lieu que si le
  contenu des tables de référence a réellement changé. `onRecords` est en
  plus désormais *debounced* (250 ms) pour absorber les rafales d'éditions.
- **Libellé de référence vide affichait l'id numérique brut comme tag.** Pour
  Instances/Actions/GT/Communautés/Tâches, un id sans libellé résolu
  retombait sur `text(id)` (ex: la carte affichait "47"). `enrich()` ignore
  désormais un id non résolu plutôt que d'afficher sa valeur numérique brute
  — cohérent avec le reste du widget, où un champ non renseigné est
  simplement absent plutôt qu'affiché avec une valeur factice.
- **Tri des menus de filtres non francophone.** `[...].sort()` par défaut
  classe par code UTF-16 (majuscules avant minuscules, ex: "UBM" avant
  "chu"), contrairement au reste du fichier qui utilise déjà
  `toLocaleLowerCase('fr-FR')`. Nouvelle fonction `compareLabels()`
  (`localeCompare(..., 'fr-FR')`), réutilisée pour ce tri.
- **Élément de template mort.** `<p class="structure detail-row">` dans le
  template de carte (`index.html`) n'était sélectionné nulle part dans
  `render.js` — retiré (aucun impact visuel, il était déjà invisible).

**Refactor (base saine, sans impact fonctionnel) :**

- `constants.js` est maintenant la seule source de la liste des tables à
  charger : `main.js` dérive `REFERENCE_TABLES` de `FILTERS` (+ nouveau
  `ROLE_REFERENCE` pour `Role_Dans_le_PUI`, qui n'a pas de filtre dédié) au
  lieu de dupliquer table/champ à la main — les deux listes avaient déjà
  divergé (`FILTERS.etablissement.field` valait encore `'acronyme'` seul).
- `TAG_GROUPS` ne contient plus `etablissement` (son entrée y était morte :
  l'établissement a son propre badge dédié sur la carte, pas une section de
  tags générique) — supprime un faux signal lors de la lecture du code.
- `enrich()` : les 5 blocs quasi identiques pour Instances/Actions/GT/
  Communautés/Tâches sont remplacés par une seule boucle pilotée par une
  table de correspondance (`LIST_REFERENCE_FIELDS`) — un futur ajout de
  catégorie est une ligne, pas un bloc copié-collé à 3 tokens à modifier
  (source du risque documenté lors de l'audit).
- `filters.js` : suppression du cas particulier `etablissement` dans
  `filterContacts()` — `enrich()` produit maintenant `etablissement_labels`
  au même format que toutes les autres catégories.
- Diagnostic console `[ETABLISSEMENT]` (main.js) : retrait de l'échantillon
  de valeur brute (question tranchée depuis la 1.1.2, devenu bruit à chaque
  chargement) ; conservation du signalement des références orphelines,
  toujours utile.

**Tests :** voir [`tests/data.test.mjs`](tests/data.test.mjs) — nouveaux tests
pour `normalize()`, `compareLabels()`, `formatPhone()`, `createRequestSequencer()`,
`referenceMapsEqual()`, `pruneStaleFilters()`, `fetchTable()` (succès, repli
multi-colonnes, erreur réseau — chemins jamais testés jusqu'ici), le
comportement révisé d'`enrich()` (dont un test qui verrouille explicitement
le mapping colonne→table→sortie pour les 5 catégories liste, contre une
future erreur de copier-coller sur `LIST_REFERENCE_FIELDS`). Voir aussi
[`TESTING.md`](TESTING.md), nouveau protocole de test manuel exhaustif à
exécuter avant chaque déploiement (complète les tests automatisés, qui ne
couvrent que les fonctions pures — pas `main.js`/`render.js`, DOM et
`window.grist` réels non simulables sans dépendance supplémentaire).

## 1.3.1 — Retour à 3 colonnes

La grille à 4 colonnes (1.3.0) ne convainc pas à l'usage. Retour à 3 colonnes
en gardant la carte compacte : `repeat(4,minmax(210px,1fr))` ->
`repeat(3,minmax(240px,1fr))`, gap inchangé (14px). Le style de carte
(avatar/police/tags resserrés) n'est pas concerné.

## 1.3.0 — Carte contact compacte, grille à 4 colonnes

Suite à trois maquettes comparées (dense/tags résumés+N/ligne condensée), la
direction "dense, même structure" a été retenue et implémentée (CSS uniquement,
structure HTML/JS inchangée) :

- Avatar 54px -> 38px, nom 18px -> 14px, badges/tags/titres de groupe resserrés
  d'environ 30%, espacements entre sections réduits.
- Grille de cartes : 3 colonnes (min 280px) -> 4 colonnes (min 210px), gap
  16px -> 14px. Le minimum de 210px reste sous la largeur réellement
  disponible à la largeur plancher du widget (`body{min-width:980px}`) pour
  éviter un débordement horizontal du dernier au premier chargement.
- Nom et badge établissement tronqués en ellipse (`text-overflow:ellipsis`)
  au-delà d'une largeur donnée — la carte compacte laisse moins de place aux
  cas rares de nom ou d'acronyme d'établissement très long.

## 1.2.0 — Recherche libre dans chaque dropdown de filtre

- **Feature** : un champ de texte apparaît en haut de chaque menu de filtre
  (Actions, Établissement, Instances...) pour rechercher parmi les options par
  nom, sans avoir à faire défiler la liste. Filtrage purement visuel côté DOM
  (`option.hidden`), n'affecte pas les cases cochées ni les contacts affichés.
  Le bouton "Réinitialiser" vide aussi ces champs (l'UI des filtres est
  reconstruite, comme pour les cases à cocher).

## 1.1.2 — Établissement : encodage réel confirmé (texte déjà résolu)

Le correctif 1.1.1 (hypothèse `['R', tableId, rowId]`) n'avait toujours aucun
effet visible. Le diagnostic console ajouté dans ce même correctif a permis de
trancher sans deviner : `contact.Etablissement` arrive en réalité comme une
**chaîne déjà résolue** (ex: `"UBM"`), pas un id ni un tableau encodé. La table
`Etablissements` a une "visible column" configurée côté Grist (probablement
`acronyme`), donc l'API renvoie directement le texte d'affichage — alors que
d'autres tables liées (Instances, Actions...) n'ont pas cette config et
renvoient un id brut à résoudre nous-mêmes. Le code faisait
`referenceMaps['Etablissements'][String(contact.Etablissement)]`, soit
`referenceMaps['Etablissements']["UBM"]` — une map indexée par id numérique,
donc échec systématique et silencieux, pour 100% des contacts (319/319 dans
les logs), indépendamment de l'état d'`acronyme`/`nom_complet` en base.

- **Correctif** : nouvelle fonction `refLabel(value, referenceMap)` qui gère
  les 3 formes possibles d'une Référence unique (texte déjà résolu / id nu /
  `['R', ...]`) plutôt que d'en supposer une seule. Appliquée à `Etablissement`
  et `Role_dans_le_PUI`. `refId()` est conservé comme brique interne mais ne
  traite plus une chaîne comme un id.
- **Tests** : cas `refLabel('UBM', ...)` ajouté — c'est la forme réellement
  observée en production, désormais couverte explicitement.

## 1.1.1 — Établissement toujours invisible : mauvais encodage de la Référence

Le correctif 1.1.0 n'avait aucun effet visible (confirmé par test en conditions
réelles) : il traitait le mauvais problème. La vraie cause :

- **Correctif** : `contact.Etablissement` est une colonne Référence **unique**
  (pas une liste). L'API Grist encode ce type `['R', tableId, rowId]`, pas un
  simple nombre — contrairement à une ReferenceList, dont les éléments internes
  restent des nombres nus une fois le marqueur `['L', ...]` retiré (c'est pour
  ça que les filtres Instances/Actions/GT etc. fonctionnaient déjà). Le code
  faisait `String(contact.Etablissement)` en supposant un nombre brut, ce qui
  donnait une clé du type `"R,Etablissements,42"` ne correspondant à rien dans
  la table de référence — échec silencieux, quel que soit l'état d'`acronyme`/
  `nom_complet`. Nouvelle fonction `refId()` qui normalise `['R', ...]` (ou un
  id déjà nu) vers l'id numérique. Appliquée à `Etablissement` et
  `Role_dans_le_PUI` (même type de colonne, même bug potentiel).
- **Outillage** : le diagnostic console `[ETABLISSEMENT] ...` affiche
  maintenant un exemple de valeur brute (avec son type JS) en plus des
  comptages, pour confirmer l'encodage réel sans avoir à deviner.

## 1.1.0 — Établissement invisible sur les cartes / filtre non fonctionnel

- **Correctif** : la référence `Etablissement` était bien renseignée côté
  Grist pour la plupart des contacts, mais son libellé ne se résolvait pas
  systématiquement — certaines lignes de la table `Etablissements` n'ont que
  `nom_complet` de rempli, pas `acronyme` (seule colonne utilisée jusqu'ici
  pour construire le libellé). `fetchTable()` accepte désormais une liste de
  colonnes de repli (`['acronyme', 'nom_complet']`) ; la première non vide
  gagne. Comme le filtre "Établissement" (dropdown + correspondance carte)
  est construit sur les mêmes libellés que les cartes, ce correctif répare
  aussi le filtre, sans logique supplémentaire côté filtre.
- **Outillage** : ajout d'un diagnostic console (`[ETABLISSEMENT] ...`) au
  chargement du widget, qui distingue "pas de référence Etablissement du
  tout" de "référence présente mais id introuvable dans la table
  Etablissements" (référence orpheline) — les deux donnent le même symptôme
  (rien ne s'affiche) mais pas la même cause côté données. Si un contact reste
  sans établissement après ce correctif, la console navigateur (F12) indique
  lequel des deux cas s'applique.
- **Tests** : `pickLabel()` (choix de la colonne de repli) et `enrich()`
  (résolution du libellé établissement, y compris le cas d'une référence
  orpheline) sont couverts par de nouveaux tests unitaires.

## 1.0.0 — Audit & stabilisation

- **Sécurité** : purge complète de l'historique git (`git filter-repo`) — l'ancien schéma complet du document Grist (fichiers `grist_structure.txt` et `grist_structure`) n'est plus reachable dans aucun commit, sur aucune branche. Historique réécrit, tous les hash de commit ont changé.
- **Sécurité** : `manifest.yml` et `window.grist.ready(...)` déclarent désormais `accessLevel: full`, confirmé comme l'accès réellement accordé au widget côté Grist (l'ancienne déclaration `read table` ne reflétait pas la réalité — le widget lit plusieurs tables tierces via `fetchTable`).
- **Sécurité** : `grist_structure.txt` ne contient plus que les tables/colonnes
  effectivement utilisées par le widget. La version précédente exposait, sur un
  dépôt public, le schéma complet du document Grist source (dont une table
  d'identifiants/session et une réplique d'un système d'authentification tiers
  avec des noms de colonnes évoquant des secrets — aucune valeur réelle n'était
  présente, seulement le schéma).
- **Correctif** : le filtre backend `perimetre_all` ("n'afficher que les
  contacts ayant au moins une valeur dans perimetre_all") ne filtrait en
  réalité rien. Grist encode les colonnes liste sous la forme `['L', ...]` ;
  une liste vide est `['L']` (longueur 1), donc le test `p.length > 0` était
  toujours vrai. Le filtre réutilise désormais `safeValues()`, qui retire déjà
  ce marqueur ailleurs dans le code (`isInScope()` dans `grist-data.js`).
  Test de non-régression ajouté dans `tests/data.test.mjs`.
- **Refactor** : `app.js` (345 lignes, monolithique) est réparti en modules ES
  natifs (`constants.js`, `grist-data.js`, `filters.js`, `render.js`,
  `main.js`), sans ajout de dépendance ni de build. La logique
  métier (filtrage, enrichissement des contacts) est désormais testable
  indépendamment du DOM.
- **Doc** : `manifest.yml` pointait vers une URL placeholder
  (`VOTRE-USER.github.io/grist-annuaire-widget`) ; corrigé vers l'URL GitHub
  Pages réelle. Ajout d'un `README.md` (architecture, tests, déploiement,
  accès Grist à vérifier) et de ce changelog.
- **Tests** : premiers tests unitaires (`node --test`), zéro dépendance.

## Historique antérieur

Voir `git log` — développement initial jusqu'à la v0.98 (voir `VERSION.md`
pour la dernière note de version avant cet audit).
