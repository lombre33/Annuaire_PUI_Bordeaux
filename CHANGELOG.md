# Changelog

## 1.21.5 — Envoi d'une photo depuis l'ordinateur : l'en-tête que Grist exige

Signalé par Antoine le 13 octobre 2026, après sa démo : dans « Modifier mon profil », envoyer une photo depuis l'ordinateur
échouait avec « L'envoi du fichier à Grist a échoué : le navigateur n'a pas pu joindre le serveur, ou l'a refusé ». Antoine
soupçonnait un problème de CORS entre la page du widget (GitHub Pages) et Grist : le navigateur le dit bien ainsi, mais la cause
est une règle de Grist. Dans son code actuel (`grist-core`, `Authorizer.ts`, `addRequestUser`), une requête qui écrit dans le
document et que seul un jeton d'accès authentifie doit porter l'en-tête `X-Requested-With: XMLHttpRequest`, sinon Grist répond 401 ;
cette réponse part avant ses en-têtes CORS, donc le navigateur la cache au widget, dont `fetch` échoue comme sur une panne de réseau.
Le widget n'envoyait pas cet en-tête : les photos (1.19.0) et les logos d'établissement (1.17.0) étaient touchés.

- `upload.js` envoie maintenant `X-Requested-With: XMLHttpRequest`, comme l'exemple d'envoi d'une pièce jointe depuis un widget publié
  sur le forum de la communauté Grist. Le navigateur fait alors précéder l'envoi d'une requête de vérification (OPTIONS), que Grist
  accepte de toute origine tant qu'aucun cookie ne l'accompagne (`trustOriginHandler`) ; le widget n'envoie toujours ni cookie ni
  adresse de page.
- Aucune clé, ni d'API ni de formulaire, dans le code : le jeton reste celui que Grist donne au widget pour cet envoi et qui est jeté
  ensuite. Rien à changer dans le document Grist, aucune table.
- Un test de non-régression dans un vrai navigateur (`tests/e2e-upload-cors.test.mjs`) envoie le fichier depuis la page du widget à un
  vrai serveur HTTP d'une autre origine, qui reprend l'ordre des intergiciels de Grist (Chromium applique CORS) : sur la 1.21.4 il
  échoue avec la phrase d'Antoine, il passe maintenant. Un second test montre que la requête sans l'en-tête est refusée comme chez
  Antoine, et `tests/upload.test.mjs` vérifie l'en-tête.
- **Non essayé dans le vrai Grist d'Antoine** (hors de portée de l'environnement de développement), ni avec un compte qui n'est pas
  propriétaire du document. Si l'envoi échoue encore, la console du navigateur (F12) en donne la raison. Revenir en arrière : `git revert`.

## 1.21.4 — Logos des cartes : même taille visuelle, quelles que soient leurs marges

Demande d'Antoine du 13 octobre 2026 (capture à l'appui) : malgré la hauteur commune de 1.21.0, les logos paraissaient de
tailles très différentes (Inserm et l'ENSAP énormes, Bordeaux Sciences Agro et Bordeaux Montaigne minuscules). La cause
est dans les fichiers : certains logos sont coupés au ras, d'autres posés au milieu d'un grand carré transparent. Repères
d'Antoine : environ 1,5 fois Bordeaux Sciences Agro et 0,85 fois Bordeaux INP, tels qu'ils s'affichaient. Le widget lit
maintenant chaque logo de carte (une fois par fichier) : il en retire les marges transparentes ou blanches (`inkBounds`
dans `branding.js`, une copie recadrée de 320 px au plus), puis lui donne une surface de 3 200 px² répartie selon ses
proportions, bornée à 104 x 42 px (`CARD_LOGO` dans `constants.js`, la même règle que le bandeau du bas) ; un logo large est donc plus
large et moins haut qu'un logo carré, et tous ont le même poids. Sur une carte de 330 à 380 px de large la taille est
réduite à 85 %, en dessous à 70 %, pour que le nom garde sa place. Un fond coloré fait partie du logo et n'est pas retiré.
Le widget demande les logos des cartes en CORS (`crossorigin`) pour lire leurs pixels : **non essayé dans un vrai Grist**.
Si Grist refuse, le logo se charge comme avant, sans recadrage, dans une case de 104 x 42 px (`object-fit: contain`).
Seuls les logos des cartes changent. Revenir en arrière : `git revert` de la fusion de cette version.

## 1.21.3 — Recherche : le texte tapé reste lisible sur Firefox mobile

Signalé par Antoine le 13 octobre 2026 (06 h 32) : sur Firefox mobile, « quand on tape dans la barre de recherche, le filtre marche mais on
ne voit pas les caractères tapés ». Même famille que les cases noires de la 1.21.2 : le widget ne fixait pas la couleur du texte des champs, que
le navigateur choisissait, et Firefox sur téléphone en thème sombre y mettait du blanc, sur le fond clair du champ. Le thème clair imposé par la
1.21.2 n'y suffisait pas à coup sûr (non essayé sur Firefox) ; la couleur est maintenant écrite par le widget.

- Les boutons et les champs prennent la couleur du texte de la page (`color: inherit`, sans effet sur ceux qui fixent la leur) : le texte tapé dans la
  recherche, dans la recherche d'un menu de filtre et dans les champs des fenêtres est celui du widget, 15:1 sur le fond du champ.
- Le texte d'invite (« Rechercher par nom ou prénom… ») est gris foncé et plein (5,9:1) au lieu de la couleur que choisissait chaque navigateur.
- Un test de non-régression (`tests/accessibility.test.mjs`) rejoue le cas dans Chromium en lui imposant un schéma sombre sur la page : il échoue sur la
  1.21.2 (texte blanc sur fond clair) et passe maintenant. Non essayé sur un vrai Firefox mobile : à confirmer à l'œil. Revenir en arrière : `git revert`.

## 1.21.2 — Cases à cocher des filtres : plus de carré noir sur Firefox Android

Signalé par Antoine le 13 octobre 2026 : sur Firefox pour Android, les cases à cocher vides des menus de filtre
s'affichaient comme un carré noir. Les cases étaient celles du navigateur, qui reprenait les couleurs du thème du
téléphone. Elles sont désormais dessinées par la feuille de style (`style.css`) : fond blanc, bordure à 3:1 au moins sur
blanc, coche blanche sur le violet (le vert foncé dans la fiche d'un établissement), et le widget impose son thème clair
(`color-scheme: light`) ; en contraste forcé, le navigateur reprend la main. Non essayé sur un vrai Firefox Android : les
tests vérifient les couleurs rendues dans Chromium, thème sombre émulé compris. Revenir en arrière : `git revert`.

## 1.21.1 — Logos des cartes deux fois plus grands

Demande d'Antoine du 13 octobre 2026 (« faire un ×2 sur la taille »), la veille d'une démo : sur une carte assez large, le
logo de l'établissement fait 64 px de haut au lieu de 32, avec une largeur maximale doublée (240 px, la moitié de la carte).
Pour que le nom garde sa place, la hauteur suit la largeur de la carte (requêtes de conteneur dans `style.css`) : 64 px dès
380 px de large, 48 px dès 330 px, 32 px en dessous ; sur une carte étroite le logo garde donc sa taille d'avant. Quand un logo
agrandit la carte, l'avatar se centre sur le nom et la fonction. Seuls les logos des cartes changent (le bandeau du bas, non),
et le test de leur hauteur suit les trois paliers. Revenir en arrière : `git revert` de la fusion de cette version.

## 1.21.0 — Financeurs en éléments fixes, logos des cartes à la même hauteur, règles de la sonde

Demandes d'Antoine du 13 octobre 2026 (05 h 20 à 05 h 27), captures à l'appui.

- **Les financeurs sont des éléments fixes (écart à la maquette corrigé).** Le bandeau des financeurs
  manquait : il dépendait d'une table facultative `Financeurs` absente du document d'Antoine, et cette absence ne
  se voyait nulle part, alors que c'était un écart à la maquette v5 qui aurait dû être signalé. Décision
  d'Antoine : « des éléments fixes qui ne bougent pas, pas de table ». Le visuel des financeurs (République
  française, ANR, Bpifrance, France 2030) avec sa phrase de financement, en tête de page, et le rond France 2030 du
  bandeau du bas sont désormais deux images du dépôt (`assets/financeurs.png`, `assets/france-2030.png`), reprises
  telles quelles de la maquette v5 et affichées dans tous les documents, sans jeton ni lecture de Grist. Le widget
  ne lit plus de table `Financeurs` (neuf lectures par chargement au lieu de dix ; une table restée dans le
  document est ignorée) : `BRANDING` ne garde que les deux colonnes d'`Etablissements`, et `FUNDER_LOGO` comme le repli
  « nom en texte » des financeurs disparaissent. Ces deux images sont les seules exceptions à la règle « aucun logo dans le dépôt » ; les logos des
  établissements restent des pièces jointes lues dans Grist.
- **Logos des cartes à la même hauteur.** Un logo d'établissement fait 32 px de haut (la hauteur de la maquette),
  quelle que soit sa forme, avec la largeur de ses proportions, bornée à 120 px et à 38 % de la largeur de la carte
  pour qu'une bannière très large ne déborde pas sur le nom de la personne. C'est du CSS seul : la taille des logos
  des cartes n'est plus calculée en JavaScript (`CARD_LOGO` disparaît ; `logoSize()` ne sert plus qu'au bandeau du
  bas, inchangé). La fenêtre de la fiche d'un établissement garde son cadre de 92 px.
- **Sonde : les règles exactes (`GRIST_SETUP.md`, étape 4).** Deux règles sur `Annuaire_Sonde` empêchent de s'y
  faire passer pour quelqu'un d'autre : chacun peut ajouter une ligne, lire et supprimer **la sienne**
  (`rec.Email == user.Email`), personne ne peut rien modifier. Un test montre que le widget fonctionne avec ces
  droits (ajout, relecture de sa seule ligne, suppression). L'étape 2 précise qu'il n'y a **rien à saisir** dans la
  sonde et que `Admin` et `Responsable_de` ne doublent pas `ACL` : ce sont des formules de déclenchement qui la
  lisent à la création de la ligne ; `ACL` reste le seul endroit où l'on nomme administrateurs et responsables.
- **« Voir en tant que ».** Quand Grist ouvre le widget en lecture seule (`readonly=true`), le widget n'écrit pas la
  ligne de la sonde : personne n'est identifié, donc ni bandeau en haut à droite ni bouton « Modifier ma fiche ».
  Ce cas était silencieux ; la console dit désormais `[IDENTITE] Grist a ouvert le widget en lecture seule…`. Si
  Grist ouvre au contraire le widget en écriture et refuse la ligne, la console dit
  `[IDENTITE] lecture impossible : …` (déjà le cas). **Non vérifié dans un vrai Grist** : lequel des deux se produit
  en « Voir en tant que » ne se lit que dans la console.
- **Tests.** 896 tests (321 dans un vrai navigateur, optionnels sans Playwright), 8 de moins qu'à la 1.20.1 :
  les tests de la table `Financeurs` (ordre, rond, repli, nom en HTML, rechargement) laissent la place à ceux des deux
  images fixes (présentes dans tous les documents, hauteur et légende à chaque largeur, table `Financeurs` ignorée,
  bandeau des fondateurs sans financeurs) ; nouveaux aussi : la hauteur identique des logos des cartes (navigateur),
  le widget qui fonctionne avec les règles strictes de la sonde et le journal du mode lecture seule.
- **Pour la passe de documentation** (pas relues ici, elles parlent encore de la table `Financeurs`, de
  `FUNDER_LOGO` ou de `CARD_LOGO`) : `README.md`, `specs.md`, `docs/utilisateurs.md`, `docs/maintenance.md`,
  `docs/securite.md` (nombre de lectures, « Minimisation »), `docs/developpeurs.md` (`constants.js`, `branding.js`,
  `branding-ui.js`, `grist-data.js`, section Habillage). `GRIST_SETUP.md`, `grist_structure.txt` et `TESTING.md`
  (sections 11 et 14) sont à jour.
- **Revenir en arrière** : `git revert` de la fusion de cette version (la table `Financeurs` ne serait relue que si
  elle existe encore dans le document).

## 1.20.1 — Menu « Tâches » : les actions préfixées « [ PUI ] » rangent de nouveau les tâches

Signalé par Antoine le 13 octobre 2026 (captures à l'appui) : depuis qu'il a ajouté « [ PUI ] » devant le libellé
de ses actions (« [ PUI ] Action 1: Instances de pilotage »), le menu « Tâches » était à plat, sans groupes par
action, alors que les tâches (« Tâche 1.1 : Pilotage/Suivi ») sont écrites comme avant.

- **La cause.** Le numéro de l'action est lu au début de son libellé (règle de la 1.16.0 : `numberedIn`, dans
  `constants.js`, et `completeGroupMap()`, dans `grist-data.js`). Le crochet ouvrant du préfixe n'est pas un
  numéro : aucune action n'était trouvée, aucune tâche n'était rattachée, et le menu retombait à plat (la console
  le disait : « aucune ligne n'est rattachée à une action »).
- **Le correctif.** `numberIn()` (`grist-data.js`) ignore, avant de chercher le numéro, un ou plusieurs préfixes
  entre crochets **au tout début** du libellé (« [ PUI ] », « [X][Y] »). Le libellé n'est pas modifié : le groupe
  du menu « Tâches » garde le libellé complet de l'action, préfixe compris, comme le menu « Actions ». Les
  libellés sans préfixe se lisent comme avant, et un crochet ailleurs que tout au début n'est pas ignoré.
- **Ce qui ne change pas.** Aucune colonne ni aucune table dans Grist, aucune écriture ; rien d'autre que la
  lecture du numéro d'une action ou d'une tâche.
- **Tests.** 904 tests (323 dans un vrai navigateur, optionnels sans Playwright), 2 de plus qu'à la 1.20.0 :
  la lecture du numéro avec et sans préfixe, et le menu « Tâches » rangé par action avec les libellés exacts des
  captures.
- **Revenir en arrière** : `git revert` de la fusion de cette version.

## 1.20.0 — Le widget crée lui-même la table `Annuaire_Sonde` quand elle manque

Demande d'Antoine du 13 octobre 2026 (04 h 29) : la table n'existait pas dans son document, donc le widget ne
savait pas qui était connecté (ni « Modifier », ni « Créer ma fiche », ni mode admin). Il la crée désormais au
chargement, puis continue normalement.

- **Ce qui change.** Si `listTables` ne contient pas `Annuaire_Sonde`, le widget l'ajoute par une seule action
  Grist (`AddTable`) avec les trois colonnes de `GRIST_SETUP.md` (étape 2) : `Email` (Texte, formule de
  déclenchement `user.Email`), `Admin` (Case à cocher : l'adresse figure dans `ACL` avec `admin` coché) et
  `Responsable_de` (Texte : les établissements dont la personne est responsable d'après `ACL`). Ce sont des
  colonnes de **données** dont la formule se calcule à la création d'une ligne et à rien d'autre (ni `recalcWhen`
  ni `recalcDeps`). Il ajoute ensuite sa ligne de sonde, la relit et la supprime, comme avant.
- **Ce qui ne change pas.** Rien n'est créé si la table existe, et ses colonnes ou formules ne sont jamais
  modifiées. Un compte Lecteur (`readonly=true`) n'essaie rien. C'est la **seule table** que le widget crée
  (règle d'Antoine : aucune autre).
- **Si Grist refuse** (compte sans droit sur la structure du document, règle d'accès) : personne n'est identifié,
  comme avant, et la console dit `table « Annuaire_Sonde » introuvable, et Grist n'a pas permis de la créer : …`.
  Il suffit alors qu'un propriétaire ouvre le widget, ou de créer la table à la main (étape 2).
- **Deux personnes au même instant.** Si l'autre a créé la table entre-temps, Grist numérote la nôtre
  (`Annuaire_Sonde2`) : le widget la retire (`RemoveTable`) et utilise la première.
- **Non essayé dans un vrai Grist**, à voir sur une copie du document : ouvrir le widget avec un compte
  propriétaire doit faire apparaître `Annuaire_Sonde` dans les données brutes, vide, et le bandeau « Ma présence ».
  La table créée ne s'efface pas toute seule en cas de retour en arrière (`git revert` de la fusion) : elle est
  vide, supprimez-la si vous n'en voulez plus.
- **Pour la passe de documentation** : `docs/securite.md` (« Ce que le widget lit, écrit et envoie » : le nombre
  d'emplois d'`applyUserActions`, « ne crée … jamais de table »), `docs/developpeurs.md` (lignes sur la structure
  du document et sur le widget qui « ne crée aucune table »), `docs/utilisateurs.md` (« aucune table dans le
  document Grist »), `grist_structure.txt`, `README.md`, `TESTING.md`.
- **Tests.** 902 tests (323 dans un vrai navigateur, optionnels sans Playwright), 3 de plus qu'à la 1.19.0 :
  la création avec les colonnes et formules documentées, le refus de Grist, la table numérotée retirée, et
  deux scénarios dans Chromium (création de bout en bout, refus).

## 1.19.0 — Photo de profil : ajoutée, changée ou retirée depuis la fiche, relue avant d'être enregistrée

Demande d'Antoine du 12 octobre 2026 : la colonne `Avatar` de `BDD` (type « Pièces jointes ») porte la photo
de la personne ; elle remplace les initiales sur la carte, s'agrandit au clic, et la personne l'ajoute depuis la
modification de son profil. La maquette v5 (validée le 12 octobre 2026) montre le parcours ; le widget a été
comparé à elle côte à côte, aux mêmes tailles d'écran (1 280 et 390 px), écart par écart (voir « Écarts avec la
maquette »). **Sans colonne `Avatar`, rien ne change** : les cartes gardent leurs initiales et le formulaire
n'a pas la carte « Photo de profil ». Aucune table n'est créée.

### Ce que fait la photo

- **Sur les cartes.** La photo remplace les initiales. Un clic (ou Entrée, ou Espace) l'agrandit dans une
  fenêtre qui porte le nom de la personne et « fonction · établissement » ; un clic sur la photo ou à côté,
  la croix ou Échap la referme. Sans photo, avec une cellule vide, un fichier supprimé ou illisible, ou sans
  jeton de lecture, la carte garde ses initiales : ni cadre cassé, ni bouton, ni erreur dans la console.
- **Ailleurs.** Dans le bandeau « Ma présence », dans le bloc d'identité des fenêtres de modification et dans
  la liste des responsables de la fiche d'un établissement (pour les personnes dont la fiche est visible dans
  l'annuaire). L'écart noté à la 1.17.0 (« les responsables ont leurs initiales, pas une photo ») est fermé.
- **Dans le formulaire.** Une carte « Photo de profil » sous le bloc d'identité : la photo actuelle, **Ajouter
  une photo** (**Changer la photo** quand la personne en a une), **Retirer la photo** (seulement s'il y en a
  une), l'aide (« JPG, PNG ou WebP, 2 Mo au maximum, recadrée en carré ») et, pendant que l'image se
  prépare, « Préparation de l’image… » : les deux boutons et « Relire » attendent, sans que le focus du
  clavier se perde. Choisir une photo puis la retirer, quand on n'en avait pas, ne change rien. Une
  administratrice en mode admin change ou retire la photo de n'importe qui, comme le reste de la fiche.
  Le formulaire de « Créer ma fiche » (1.18.0) n'a pas cette carte : la photo s'ajoute ensuite, depuis
  « Modifier mon profil » (`afterCreation` dans `PROFILE_FIELDS`).
- **À la relecture.** Sur la carte « Après », la photo a un anneau vert et la pastille « photo ajoutée » (ou
  « photo modifiée ») ; un retrait a un anneau rouge et la pastille « photo retirée ». La ligne « Photo de
  profil » du détail montre la photo actuelle, une flèche, puis la nouvelle : deux miniatures qu'un clic
  agrandit.

### L'envoi de la photo

- **Rien n'est envoyé avant « Valider ».** L'image choisie s'affiche aussitôt en aperçu, sans quitter le
  navigateur ; l'adresse locale de l'aperçu est libérée dès qu'il n'est plus utile, et à la fermeture.
- **Le fichier n'est jamais envoyé tel quel.** Le navigateur le décode, en découpe un **carré au centre**, le
  ramène à 256 pixels de côté au plus (une petite photo n'est pas agrandie) et l'encode en **JPEG** (qualité
  0,85) : plus de métadonnées (la position GPS d'une photo de téléphone ne part pas), plus de script, une taille
  bornée. Une photo de téléphone est remise à l'endroit ; un PNG ou un WebP transparent est posé sur du blanc.
  Formats acceptés : JPG, PNG, WebP (pas de SVG : il peut porter du code) ; 2 Mo au plus avant le redessin ; une
  image de plus de 40 millions de pixels est refusée avant d'être décodée.
- **Le même envoi que le logo de la 1.17.0** (`upload.js`) : un jeton d'écriture demandé pour chaque envoi et
  jamais gardé, une seule requête en `https`, sans cookie ni adresse de la page, qui s'arrête au bout de 30
  secondes. Seul le conseil change : pour une photo, « Contactez un administrateur si le problème persiste. »
  (pour un logo, déposer le fichier dans Grist).
- **L'ordre.** « Valider » vérifie d'abord les droits, que la fiche est comme à la relecture et que l'adresse
  n'est pas prise ; puis envoie la photo ; relit la fiche (l'envoi prend du temps) ; et écrit la fiche, photo
  comprise (`['L', identifiant]` ; `['L']` pour la retirer), en **une seule action**. Retirer la photo
  n'envoie rien.
- **Si l'envoi échoue,** rien n'est écrit : la relecture reste ouverte avec le brouillon et dit quoi faire. Si
  la fiche a changé pendant l'envoi, ou si Grist refuse ensuite l'écriture, rien n'est écrit non plus et la
  phrase dit que le fichier de la nouvelle photo reste dans les pièces jointes du document sans servir : le
  widget ne sait pas supprimer une pièce jointe. Retirer ou remplacer une photo laisse de même l'ancien fichier
  (une photo est une donnée personnelle, visible de tous ceux qui voient la fiche et téléchargeable par toute
  personne qui a accès au document : `docs/securite.md` et `docs/maintenance.md` disent quoi faire quand une
  personne demande l'effacement de la sienne).

### Ce qui n'a pas pu être essayé

Les tests simulent la réponse de Grist ; trois points ne se constatent que dans un vrai document : que Grist
**accepte l'envoi** de la photo avec ce jeton (c'est le même mécanisme que le logo de la 1.17.0, qui n'a pas non
plus été essayé), que le navigateur **laisse le widget lire la réponse** de l'envoi, et que les **règles d'accès**
laissent toute personne qui modifie sa fiche écrire sa colonne `Avatar` et ajouter une pièce jointe. Seul
Chromium a servi aux essais : le redessin de l'image (orientation, fond blanc, JPEG) repose sur ce que les
navigateurs font tous depuis 2020, sans avoir été vérifié dans Firefox ni Safari. Si l'un manque, rien n'est
cassé : la fenêtre le dit et la photo se pose dans la cellule `Avatar` de Grist. Le protocole d'essai est la
section 18 de `TESTING.md`.

### Écarts avec la maquette

Antoine a demandé que l'implémentation finale soit comme la maquette. Les cartes avec photo, le formulaire
(photo actuelle, photo choisie, récapitulatif), la relecture d'un ajout et d'un retrait, la fiche d'une autre
personne en mode admin et la fenêtre d'agrandissement ont été comparés à elle à 1 280 et 390 px : dispositions,
textes et états sont conformes. Restent les écarts suivants, et leur raison :

- **« Maquette, essayer avec : »** (six portraits à choisir sans fichier) : la maquette s'en sert pour essayer ;
  le vrai widget choisit un fichier, ces portraits ne sont pas reproduits. Les mêmes visages inventés servent aux
  captures de la documentation (`?photos` dans la démonstration).
- **Les refus sont plus précis.** La maquette a deux phrases (« Format ou taille refusés : JPG, PNG ou WebP, 2 Mo
  au maximum. » et « Image illisible, essayez un autre fichier. ») ; le widget dit lequel des quatre cas
  (format, poids avec celui du fichier choisi, fichier vide, image illisible).
- **« Préparation de l’image… ».** La maquette ne décode rien et n'a pas besoin d'attendre ; le widget le dit
  pendant que le navigateur redessine l'image, et fait attendre les deux boutons de la carte et « Relire ».
- **Un PNG ou un WebP transparent** est posé sur du blanc avant d'être encodé en JPEG ; la maquette le dessine sur
  un fond transparent que le JPEG rend noir.
- **Sur téléphone, la fenêtre d'agrandissement reste une boîte centrée** qui épouse la photo et sa légende, avec
  16 px de marge ; à 390 px, la maquette la colle au bord gauche et l'étire sur toute la hauteur, avec un grand blanc
  sous la légende. La comparaison a aussi montré ce même blanc dans la première version du widget (une fenêtre
  modale dont la hauteur est « auto » s'étire jusqu'à sa hauteur maximale ; la règle dit maintenant
  « fit-content ») : corrigé, et un test mesure que la fenêtre n'a pas de blanc dessous de 280 à 390 px.
- **Les polices** : inchangé depuis la 1.15.0 (le widget ne charge aucune police).

### Réglages dans Grist

À faire une fois, à la main, et facultatif (`GRIST_SETUP.md`, étape 6) : ajouter à `BDD` une colonne nommée
exactement `Avatar`, de type **Pièces jointes** ; l'ajouter aux colonnes que la personne dont `email` est la sienne
peut modifier (étape 4) ; laisser toute personne qui modifie sa fiche ajouter une pièce jointe au document
(jusqu'ici, seuls les responsables et les administrateurs le faisaient, pour un logo). Sans la colonne, le
widget n'offre pas la photo.

### Pour les développeurs

Un module nouveau, sans dépendance : `avatar-ui.js` (`photoSource()`, `fillAvatar()`, `createAvatar()`,
`createThumb()`, `createPhotoViewer()` : le DOM de la photo, rien d'autre). `image-prep.js` : `squareCrop()` et
`prepareImage()` suivent les règles passées (`IMAGE_RULES.avatar` : carré, JPEG, 256 px). `constants.js` :
`IMAGE_RULES.avatar` et le champ `Avatar` de `PROFILE_FIELDS` (`kind: 'image'`). `attachments.js` : `avatarIdOf()`.
`profile.js` : le brouillon d'une photo (l'identifiant actuel, 0 pour la retirer, ou l'image préparée) passe par
`diffProfile()`, `rebaseChanges()` et `describeChanges()`. `profile-save.js` : `saveProfile()` reçoit `upload` et
fait l'envoi entre deux relectures (`leftover` : le fichier envoyé pour rien), `unsavedLabels()` vérifie la
photo, `PHOTO_UPLOAD_HINT`. `preview.js` : `withAvatarChange()` et `marks.avatar`. `upload.js` : le conseil
(`hint`) vient de l'appelant. `render.js` : l'avatar de la carte (`photoOf()`, `markAvatar()`). `main.js` : un
seul écouteur pour tous les `.avatar-zoom` de la grille, `renderAvatar()`, la fenêtre `#photoDialog`
(`index.html`). Aucune table créée, aucun nouveau préfixe de console.

### Documentation et captures

Le guide utilisateur (« Ma photo de profil », la question sur la photo, la liste des messages), `GRIST_SETUP.md`
(étape 6), `specs.md`, `grist_structure.txt`, le guide développeur (« La photo de profil »), la sécurité (l'envoi
d'un fichier, les données personnelles), la maintenance (les pièces jointes qui s'accumulent), `TESTING.md`
(section 18) et le README suivent. Quatre captures s'ajoutent (`photo-profil-cartes.png`,
`photo-profil-agrandie.png`, `photo-profil-formulaire.png`, `photo-profil-relecture.png`) ; les deux du
formulaire (`modifier-fiche-formulaire.png`, `modifier-fiche-admin.png`) sont refaites avec la carte « Photo de
profil ». La démonstration a une option `?photos` (six visages inventés, partagés avec les tests).

### Tests

**899 tests** (dont 322 dans un vrai navigateur, optionnels sans Playwright) contre 808 (dont 285) à
la sortie de la 1.18.0.

- *Le brouillon* (`tests/profile.test.mjs`, 17 de plus) : la photo en tête du formulaire avec l'identifiant de la
  pièce jointe actuelle (0 sans photo, quelle que soit la forme d'une cellule vide), seulement quand `BDD` a la
  colonne ; une photo laissée telle quelle n'est pas un changement ; une nouvelle photo remplace, 0 retire (rien à
  retirer : rien) ; le brouillon ne peut jamais viser une autre pièce jointe du document ; la relecture suit une
  photo changée dans Grist, un retrait déjà fait par un autre, un remplacement après un retrait ; une fiche qu'on
  crée n'a pas la photo, même quand `BDD` a la colonne.
- *L'écriture* (`tests/profile-save.test.mjs`, 19 de plus) : l'envoi seulement après les vérifications et pour un
  remplacement, la fiche relue après l'envoi, le fichier laissé quand la fiche a changé ou que l'écriture est
  refusée, une seule action atomique (`['L', identifiant]` ou `['L']`), un envoi refusé qui n'écrit rien, une
  colonne qui n'est pas de pièces jointes, l'ajout et le retrait par une administratrice, la vérification de la
  photo après l'écriture.
- *L'image et l'envoi* (`tests/image-prep.test.mjs` 4, `tests/upload.test.mjs` 2, `tests/attachments.test.mjs` 1,
  `tests/constants.test.mjs` 2) : les règles de la photo, le carré au centre, la petite photo qui n'est pas
  agrandie, le SVG refusé, le conseil de l'appelant dans les phrases d'échec (celui du logo inchangé), la première
  pièce jointe d'une cellule.
- *La relecture et la source d'une photo* (`tests/preview.test.mjs` 4, `tests/avatar-ui.test.mjs` 3, nouveau) : la
  carte « Après » montre la nouvelle photo ou les initiales ; une photo ne vient que d'une pièce jointe de Grist ou
  d'une adresse `blob:` fabriquée par le navigateur.
- *Dans un navigateur* (`tests/e2e-avatar.test.mjs`, nouveau : 37 tests) : la photo sur les cartes et ses
  replis, l'agrandissement (souris, clavier, légende, échec de chargement), le bandeau (qui n'est pas repeint quand
  Grist renvoie les mêmes données), le formulaire, une photo choisie (carré, JPEG de 256 px, avant / après, une
  seule action), l'orientation et les métadonnées, JPG et WebP, le PNG transparent sur blanc, les refus avant
  envoi, la préparation ralentie (un second choix, le retrait et « Relire » ne font rien ; fermer la fenêtre
  abandonne la photo sans erreur), la relecture et ses miniatures (sans jeton, ou sans miniature, en mots), le
  retrait, l'administratrice, les échecs d'envoi (refus de Grist, en-têtes CORS absents, jeton refusé, écriture
  refusée, fiche changée) avec la phrase du fichier resté, la mise en page de 280 à 390 px (dont la fenêtre de la
  photo, sans blanc dessous), les noms accessibles, le focus dans la fenêtre modale et « Créer ma fiche » sans carte
  photo (puis la carte dans « Modifier mon profil »).
- *Documentation* (`tests/docs.test.mjs`, 2 de plus) : les phrases citées par le guide sont celles du code (refus
  de l'image, conseil de l'envoi) ; la démonstration `?photos` ajoute la colonne `Avatar` et six photos sans
  changer les cartes, et ne les sert qu'avec le jeton.

Deux tests de navigateur au clavier se sont révélés instables dans la suite complète (l'un une fois sur trois,
l'autre une fois sur huit à quarante) et ont été corrigés : le sélecteur de fichier est branché avant l'appui sur
la touche (sans cela, Playwright pouvait ne pas voir la boîte s'ouvrir), et le focus n'est donné qu'une fois les
cartes redessinées par l'arrivée de l'identité, puis vérifié avant l'appui. Depuis, **78 exécutions des 36 tests
n'ont montré aucun échec** : 16 du fichier lui-même (deux à la fois), 60 d'une copie du fichier instrumentée
pour décrire la page en cas d'échec (30 seule, 24 à trois à la fois pour charger la machine, 6 dans la suite
complète) et 2 de la suite complète, dont une avec d'autres polices (DejaVu). Le second échec n'a jamais été
reproduit isolément : un redessin des cartes qui fait perdre le focus entre l'appui et sa cible est la cause la
plus probable, pas une certitude ; ces exécutions sont la seule preuve que l'instabilité a disparu.

Contrôle négatif : 67 modifications du code de la photo de profil ont été essayées une à une (le brouillon et sa
relecture, l'envoi et l'écriture, l'image et ses limites, l'interface et la mise en page). Les tests en ont
détecté 57 d'emblée. Parmi les dix autres, une (un texte ambigu) a été refaite avec plus de contexte ; deux (une
image aux dimensions démesurées, une image trop lourde une fois redessinée) sont gardées par les tests du logo de
la 1.17.0, qui partagent ce code ; une (une photo qui viendrait d'une adresse extérieure) n'avait aucun test :
`tests/avatar-ui.test.mjs` ; et six montraient des tests absents ou trop faibles, corrigés depuis : un bandeau
repeint à chaque relecture de Grist, la photo d'une carte de relecture qui devient un bouton, la ligne du
récapitulatif sans miniature qui ne se lit plus en mots, « Relire » qui reste actif et un second choix de fichier
qui s'ouvre pendant que l'image se prépare, une photo qui arrive après la fermeture de la fenêtre. Les 67 sont
maintenant détectées.

## 1.18.0 — « Créer ma fiche » et l'e-mail affiché

Deux petites fonctions demandées par Antoine le 12 octobre 2026 (12 h 52), construites sur la fenêtre
« Modifier mon profil » : son aspect (maquette v5) ne change pas. Une seule version, une seule PR.

- **« Créer ma fiche ».** Un compte que Grist reconnaît mais dont l'adresse ne figure dans aucune ligne de
  `BDD` (le bandeau disait « Compte absent de l'annuaire », ou « Administrateur ») a un bouton « Créer ma
  fiche » ; une personne qui a une fiche ne le voit jamais, et il n'y en a pas quand `BDD` n'a pas de
  colonne `email` (la fiche ne pourrait pas être reliée à la personne). Il ouvre la fenêtre de « Modifier mon
  profil », avec trois différences : la personne **choisit son établissement** (obligatoire : sans lui la fiche
  ne pourrait jamais s'afficher, et un établissement ne se change ensuite que par un administrateur) ;
  l'adresse e-mail est **celle de son compte** et ne se saisit pas ; la relecture montre **une seule carte**,
  sans repères (il n'y a pas de carte « avant »). « Créer ma fiche » ajoute **une ligne** à `BDD` en une seule
  action Grist (`AddRecord`) : jamais une table. Elle porte l'adresse du compte (en minuscules) et ce que la
  personne a rempli, rien d'autre : **ni `Accepte_apparaitre`** (la personne apparaît quand elle active
  l'interrupteur du bandeau, qui s'affiche dès la création) **ni `perimetre`** (l'affaire de Grist : un
  administrateur le renseigne). Une fiche créée n'apparaît donc dans l'annuaire qu'une fois ces deux choses
  faites ; le bandeau et la relecture le disent, comme pour toute fiche masquée, et le nombre de contacts
  affichés ne change pas à la création. Juste avant d'écrire, le widget relit `BDD` : si une fiche porte déjà
  l'adresse (créée entre-temps, dans un autre onglet ou par un administrateur), rien n'est écrit.
- **E-mail affiché.** La colonne facultative `BDD.email_affiche` (texte, déjà ajoutée par Antoine) : quand elle
  n'est pas vide, la carte, son lien `mailto:` et la carte « Après » de la relecture montrent cette adresse **à
  la place de** `email`. La fenêtre de modification propose le champ « E-mail affiché » à tout le monde (et à
  l'administrateur qui modifie la fiche d'un autre) : facultatif, on peut le vider pour revenir à l'adresse du
  compte, plusieurs fiches peuvent porter la même (une boîte de service), seule sa forme est vérifiée. Sans la
  colonne, le champ n'est pas proposé. **L'adresse du compte reste la seule identité** : qui est connecté, les
  droits, la recherche de la fiche d'une personne et l'unicité des adresses lisent `email`, jamais
  `email_affiche`.
- **Ce que ça demande à Grist.** (1) Une règle d'accès qui laisse une personne **ajouter une ligne à `BDD` dont
  `email` est le sien** : la règle de `GRIST_SETUP.md` § 4 (« ajouter ou supprimer une ligne : les
  administrateurs ») refuse la création, et le widget le dit (« Grist a refusé la création : vos droits ne
  permettent pas d'ajouter une fiche… ») sans rien écrire. (2) Un périmètre pour toute fiche créée (un
  administrateur, ou une formule de déclenchement sur `perimetre` pour les nouvelles lignes). (3) Les droits
  d'écriture sur `email_affiche` comme sur les autres colonnes de la fiche. Non essayé dans un vrai Grist :
  à tester sur une copie du document.
- **Pour la passe de documentation** : `docs/utilisateurs.md` (« Pourquoi n'ai-je pas de bouton Modifier ? »,
  bandeau d'un compte sans fiche, fenêtre de modification), `GRIST_SETUP.md` (colonne, règles d'accès :
  « le widget ne crée ni ne supprime jamais de fiche » devient faux), `docs/securite.md` et
  `docs/maintenance.md` (écritures dans `BDD`), `TESTING.md` (essai dans un vrai Grist).
- **Ce qui ne change pas.** La relecture avant écriture, l'écriture en une seule action Grist, l'identité par
  la table-sonde, la règle de visibilité (établissement validé et accord de la personne), la colonne
  `nom_de_domaine` (jamais lue), aucune table créée.
- **Tests.** 808 tests (285 dans un vrai navigateur, optionnels sans Playwright), 8 de plus qu'à la 1.17.2. Ciblés : `email_affiche` (lecture, saisie, carte, adresse du compte intacte), la fiche vide et le
  formulaire de création, `createProfile` (une seule ligne, refus d'une fiche déjà là ou d'une écriture
  refusée) et deux scénarios dans Chromium (création de bout en bout, e-mail affiché saisi puis vidé). Le
  bandeau « Ma présence » de 320 à 840 px est mesuré avec le nouveau bouton, et sans lui quand `BDD` n'a pas
  de colonne `email` (le bloc des boutons vide ne prend toujours aucune place).
- **Revenir en arrière** : `git revert` de la fusion de cette version.

## 1.17.2 — Bandeau « Ma présence » : le texte garde 200 px, l'interrupteur passe dessous

Sixième et dernier des « gains rapides » de l'audit UI/UX (Antoine a lancé le lot le 12 octobre 2026, un gain
par version), pour le constat **U46** (bandeau « Ma présence » écrasé). **Seul le bandeau replié change** (un
cadre de moins de 860 px : téléphone, panneau étroit, tablette en portrait) : à partir de 860 px, où l'en-tête
est une grille, rien ne bouge, à 6 px près pour un compte sans fiche (voir plus bas). Le changement tient en
trois règles de `style.css` et une ligne d'`account-ui.js` ; revenir en arrière, c'est `git revert` de la
fusion de cette version. Ce bandeau replié n'est pas dessiné sur la maquette v5 (elle montre l'en-tête large) :
le gain n'ajoute aucun écart avec elle.

- **Où en était U46.** L'audit mesurait le bandeau de la 1.11.0 : de 380 à 510 px de large, le texte était
  écrasé (3 à 119 px) par l'interrupteur de 250 px. La 1.14.0 avait déjà corrigé ce défaut-là (une base de
  150 px sur `.account-identity`, quand l'en-tête a été remanié) : de 320 à 520 px, l'interrupteur passe sous le
  texte. Restaient trois défauts, que cette version corrige.
- **Le texte serré à côté de l'interrupteur.** Avec une base de 150 px, l'interrupteur se plaçait à côté du texte
  dès qu'il restait 150 px : de 530 à 570 px et de 600 à 620 px (et à 760 et 780 px pour le plus long des
  messages), le texte tenait dans une colonne de 153 à 199 px, et le message de la fiche masquée pour trois
  raisons (« Vous avez accepté d'apparaître, mais votre fiche reste masquée : … ») prenait neuf lignes, un
  bandeau de 249 px. La base passe à 200 px, le seuil que se fixait l'audit : l'interrupteur passe sous le
  texte dès que celui-ci n'aurait plus 200 px.
- **Le bloc des boutons vide.** Pour un compte qui n'a ni fiche, ni droit d'administrateur, ni établissement,
  les trois boutons sont cachés mais leur conteneur (`.account-actions`) restait un élément de la ligne, qui
  coûtait un écart de 14 px au texte (et, dans l'en-tête large, une rangée de grille de 6 px). `placeButtons()`
  (`account-ui.js`) cache maintenant le conteneur quand aucun de ses boutons n'est montré.
- **Un mot sans coupure.** Un prénom de 35 lettres sans trait d'union, ou une adresse sans coupure possible,
  dépassait de son bloc : de 42 px hors du bandeau à 320 px, et sous l'interrupteur de 530 à 620 px.
  `overflow-wrap: anywhere` sur le nom et le message.
- **Écart avec l'audit.** L'audit recommandait `flex: 1 1 15rem` (240 px). Cette valeur laisse l'avatar seul
  sur sa ligne à 320 px, où il ne reste que 207 px à côté de lui : 46 px de plus pour rien. 200 px tient le
  même critère (le texte garde 200 px au moins) sans ce défaut ; un test le garde.

  | Règle | Avant | Après |
  |---|---|---|
  | Base du texte (`.account-identity`) | `flex: 1 1 150px` | `flex: 1 1 200px` |
  | Nom et message (`.account-name`, `.account-detail`) | un mot trop long déborde | `overflow-wrap: anywhere` |
  | Bloc des boutons (`.account-actions`) | toujours dans la ligne, même vide | caché quand aucun bouton n'est montré |

- **Ce que ça donne.** Mesuré de 320 à 620 px (pas de 10 px) pour quatre comptes, avant et après :

  | Cas (cadre) | Largeur du texte | Hauteur du bandeau |
  |---|---|---|
  | Fiche masquée pour trois raisons, 530 px | 153 → 417 px (9 → 3 lignes) | 249 → 144 px |
  | Fiche masquée pour trois raisons, 620 px | 199 → 463 px (6 → 3 lignes) | 204 → 144 px |
  | Nom de 47 caractères, 530 px | 153 → 417 px (3 → 1 ligne) | 163 → 172 px |
  | Administratrice et responsable (trois boutons), de 530 à 570 px et de 600 à 620 px | 153 à 199 → 417 à 463 px | 126 ou 129 → 172 px (+43 à +46 px) |
  | Compte absent de l'annuaire, 320 px | 193 → 207 px | 137 → 120 px |
  | Compte absent de l'annuaire, à partir de 860 px | | 70 → 64 px |

  Le texte du bandeau ne descend plus sous 203 px (153 px avant). Ce que ça coûte : à ces largeurs, une
  personne qui cumule l'interrupteur et trois boutons a un bandeau de 172 px au lieu de 126 ou 129 ; elle y
  gagne un texte sur une ligne. Pour les trois premiers comptes, rien d'autre ne change : ni de 320 à 520 px, ni
  à 580 et 590 px (le texte y fait 203 et 213 px, à côté de l'interrupteur), ni à partir de 630 px.
- **Reste ouvert.** La hauteur du bandeau d'une personne qui cumule l'interrupteur et trois boutons (jusqu'à
  280 px à 320 px, les boutons les uns sous les autres) ; la largeur réelle des sections de Grist (panneau
  latéral, tablette en portrait) : elle n'est pas mesurable d'ici, `TESTING.md` (section 12) a un contrôle à
  l'œil pour un vrai Grist.
- **Pour les développeurs** : `placeButtons()` (`account-ui.js`) cache aussi `.account-actions` ; la section
  « Mise en page de l'en-tête » de `docs/developpeurs.md` décrit la règle et son test.
- **Tests** : 800 tests (283 dans un vrai navigateur, optionnels sans Playwright), 1 de plus qu'à la 1.17.1,
  dans `tests/e2e-profile.test.mjs` : de 320 à 840 px (onze largeurs, dont celles où la 1.17.1 serrait le
  texte), pour sept comptes (l'administratrice et responsable aux trois boutons, un nom de 47 caractères, un nom
  sans coupure possible, la fiche masquée pour trois raisons, un compte sans fiche à l'adresse sans coupure,
  un administrateur sans fiche et un responsable sans fiche), le texte du bandeau garde 200 px au moins, l'avatar
  reste à côté du texte, rien n'est coupé ni ne dépasse du bandeau, l'interrupteur ne recouvre rien, il n'y a
  pas de défilement horizontal, chaque compte a le bon nombre de boutons et le bloc des boutons est caché
  quand il est vide. Il échoue sur le code de la 1.17.1 (« … à 530 px : le texte du bandeau garde 200 px au
  moins (153 px) »). Neuf variantes fautives (la base de 150 px, la base de 15rem, le nom ou le message sans
  `overflow-wrap`, le bloc jamais ou toujours caché, caché sans regarder l'un des trois boutons) ont été
  essayées une à une, les fichiers étant remis en état après chacune : toutes font échouer ce test.
- **Documentation** : aucune capture à refaire (celles du bandeau sont prises à plus de 860 px, où rien ne
  change) ; `TESTING.md` (63 scénarios pour `tests/e2e-profile.test.mjs`, un contrôle à l'œil en section 12),
  `docs/developpeurs.md` (la section « Mise en page de l'en-tête »), `docs/utilisateurs.md` (la question sur le
  téléphone), `specs.md` (la ligne sur les cadres étroits) et `VERSION.md`.

## 1.17.1 — Texte de 12 px au moins, pastilles de 24 px de haut

Cinquième des six « gains rapides » de l'audit UI/UX (Antoine a lancé le lot le 12 octobre 2026, un gain
par version), pour les constats **U20** (texte trop petit) et **U08** (cibles trop petites à la souris).
**C'est le gain du lot qui change le plus l'aspect des cartes, et il s'écarte de la maquette v5 validée**,
qui dessinait un texte de 8,5 à 10,5 px : tout le texte des cartes fait maintenant 12 px au moins et les
pastilles 24 px de haut. Les cartes sont donc plus hautes (d'un tiers environ) et il en tient moins par
écran. Un seul fichier de code porte le changement, `style.css` : revenir à la maquette, c'est
`git revert` de la fusion de cette version.

- **Pourquoi.** L'audit comptait 91 % des caractères des cartes sous 12 px (dont 71 % à 8,5 px) et 202
  pastilles sur 202 sous les 24 px de haut qu'exige WCAG 2.5.8 (niveau AA) pour une cible à la souris :
  elles en faisaient 16, et selon la largeur de 72 à 100 d'entre elles échouaient même à l'exception
  d'espacement. Depuis la 1.9.1, un écran tactile ou un cadre de moins de 600 px avait déjà un texte un peu
  plus grand (10 à 12 px) et des cibles de 28 px ; cette version donne le même plancher à tout le monde,
  sans condition de largeur ni de pointeur.
- **Ce qui change.** Sous 600 px ou au doigt, la taille d'avant est celle de la parenthèse :

  | Élément | Avant | Après |
  |---|---|---|
  | Pastille (`.tag`) | 8,5 px (11 px), 16 px de haut | 12 px, 24 px de haut au moins, marges de 9 px, 4 px entre deux pastilles |
  | Titre de groupe (`.tag-group-title`) | 8,5 px (10 px) | 12 px |
  | Badge de l'établissement en texte, sans logo (`.etablissement-tag`) | 8,5 px (10 px), 16 px de haut, 96 px de large au plus | 12 px, 24 px de haut au moins, 136 px de large au plus (la même place pour les lettres qu'avant) |
  | Fonction (`.fonction`) | 10,5 px (12 px) | 12 px |
  | E-mail et téléphone (`.detail-row`) | 10,5 px (12 px) | 12 px |
  | « Votre fiche » (`.own-flag`) | 9,5 px (11 px) | 12 px |
  | « Modifier » (`.card-edit`) | 10,5 px (12 px) | 12 px, 24 px de haut au moins |
  | « Modifier » de l'établissement, sous le logo (`.etab-edit`, ajouté par la 1.17.0) | 10,5 px | 12 px, 24 px de haut au moins |
  | Nombre d'un bouton de filtre et d'une option de menu (`.filter-count`, `.option-count`) | 11 px | 12 px |

  Le nom (14 px, 15 px sous 600 px), le titre de la page et les cibles tactiles de 28 px ne changent pas.
  Le bloc « Petit écran ou écran tactile » de `style.css` ne garde que le nom à 15 px et l'écart de 5 px
  entre les pastilles : le reste est dans la feuille de base. **La fenêtre de relecture** (cartes « Avant »
  et « Après » de « Modifier ma fiche ») utilise les mêmes cartes : elle suit, et passe d'environ 860 px de
  haut à 960 px, donc au-dessus du plafond de 900 px de la fenêtre (`dialogs.css`) : son corps défile de
  60 px, y compris sur un grand écran, où il tenait en entier.
- **Ce que ça donne.** Mesuré sur la démonstration de 14 contacts (`docs/demo/serveur-demo.mjs`), avant et
  après :

  | Largeur | Hauteur moyenne d'une carte | Hauteur de la page |
  |---|---|---|
  | 1 440 px | 362 → 486 px (+34 %) | 2 463 → 3 093 px (+26 %) |
  | 768 px | 355 → 467 px (+32 %) | 3 227 → 4 010 px (+24 %) |
  | 390 px | 407 → 442 px (+9 %) | 6 722 → 7 212 px (+7 %) |

  La part des caractères des cartes sous 12 px passe de 95 % à 0 % (de 73,5 % à 0 % à 390 px). Sur un écran
  de 1 440 × 900 px, la première rangée de trois cartes tient toujours, mais on voit moins de la deuxième : le
  prix de la lisibilité est une page plus longue d'un quart environ, ce qui compte pour les quelque
  400 contacts de l'annuaire réel.
- **Cibles (WCAG 2.5.8).** Les 119 pastilles de la démonstration font 24 px de haut et plus de 70 px de large :
  aucune n'est sous le seuil. Le lien e-mail (12 px de texte, 15 px de haut) n'est pas agrandi : il tient par
  l'exception d'espacement de la norme, un cercle de 24 px centré sur lui ne touche aucune autre cible, de
  320 à 1 920 px, y compris les boutons « Modifier » qui l'entourent sur la carte de la personne connectée
  (le sien, et celui de son établissement sous le logo si elle en est responsable) ; un test le garde.
  Avant, la démonstration comptait 128 cibles sous 24 px, dont jusqu'à 30 (à 600 px) qui échouaient même
  à l'exception.
- **Reste ouvert dans l'audit.** Cette version porte sur les cartes. Pas traités : les textes de l'en-tête
  (« Projet financé par l'État… » à 10 px, noms des financeurs à 11 px) et du bandeau des fondateurs, les
  repères « avant / après » de la fenêtre de relecture (`.mk-pill`, 8,5 px), les unités en `px` (la
  préférence de taille de police du navigateur n'agit toujours pas, le zoom oui ; passer en `rem` serait un
  chantier de plus) et les 44 px recommandés au doigt pour les boutons de filtre (42 px sous 600 px) et
  Fondateurs / Partenaires (36 px).
- **Pour les développeurs** : `tests/support/card-metrics.mjs` (nouveau) mesure la page rendue : taille du
  texte, hauteur des pastilles, isolement des petites cibles. La section « Accessibilité » de
  `docs/developpeurs.md` a une règle de plus (le plancher de 12 px et les 24 px), `TESTING.md` trois contrôles à l'œil
  pour un vrai Grist (« Texte des cartes » et « Badge de l'établissement en texte » en section 12, « Cibles à la
  souris » en section 15), et `specs.md` une exigence de lisibilité.
- **Tests** : 799 tests (282 dans un vrai navigateur, optionnels sans Playwright), 5 de plus qu'à la
  1.17.0 (4 dans `tests/responsive.test.mjs`, 1 dans `tests/accessibility.test.mjs`). Dans
  `tests/responsive.test.mjs` : le test des tailles de texte « le bureau garde ses tailles » est remplacé
  par « le texte des cartes fait 12 px à toute largeur » (14 px pour le nom sur ordinateur, 15 px sous
  600 px) ; à la souris, de 320 à 1 920 px, aucun texte de carte sous 12 px et aucune pastille ou badge
  sous 24 px de haut ; la même mesure au doigt (414 et 820 px) ; chaque cible de moins de 24 px est isolée
  des autres (le cercle de la norme) ; les nombres des filtres font 12 px. Dans
  `tests/accessibility.test.mjs` : sur la carte de la personne connectée, « Votre fiche » et les boutons
  « Modifier » (le sien et celui de son établissement) font 12 px et 24 px de haut au moins, et le lien
  e-mail reste à l'écart de ces boutons. Les six tests écrits ou réécrits échouent tous sur la feuille de
  style d'avant cette version. Vingt et une variantes fautives de `style.css` (chaque taille remise à
  l'ancienne valeur, chaque hauteur ou marge retirée, y compris pour le bouton de l'établissement, les
  anciennes tailles rétablies sous 600 px ou au doigt, le lien e-mail collé au bouton « Modifier », les
  pastilles remontées sur le lien e-mail) ont été essayées une à une, le fichier étant remis en état après
  chacune : toutes font échouer au moins un test.
- **Documentation** : quinze captures sont refaites (aperçu, cartes sans logo, quatre menus de filtre, filtres
  combinés, partenaires, recherche, bandeau de données partielles, légende de la carte, bouton, relecture et
  confirmation de « Modifier ma fiche », mode admin) ; les neuf autres sont celles de la 1.17.0 (les images où
  seule bougeait la marge, le décalage d'un demi-pixel ou le fond derrière une fenêtre n'ont pas été
  remplacées : celles des fenêtres « Modifier ma fiche », « Modifier la fiche de… » et « Fiche de
  l'établissement » montrent le même contenu). `docs/demo/capturer.mjs`
  s'adapte aux cartes plus hautes : la légende demande une fenêtre de 3 600 px (la carte de Camille Rousseau est
  loin dans la liste) et la relecture lève le plafond de 900 px de la fenêtre le temps de la capture, puisqu'elle
  le dépasse maintenant.

## 1.17.0 — La fiche d'un établissement, modifiée par son responsable

Une demande d'Antoine, validée sur la maquette v5 le 12 octobre 2026 (« Go pour tout implémenter »,
puis « j'attends à ce que l'implémentation finale soit comme la maquette présentée ») : le
**responsable d'un établissement** modifie lui-même, depuis l'annuaire, la fiche de son établissement,
sans passer par un administrateur.

Comme pour les fiches de personnes, les modifications sont **directes** (ni validation par un
administrateur, ni historique) et le widget ne crée aucune table ni aucune colonne. Une nouveauté
technique : pour changer un logo, le widget **envoie lui-même le fichier à Grist** (c'est la première
requête réseau que son code émet) ; elle est cadrée par des protections décrites plus bas et dans
`docs/securite.md`.

### Ce que fait un responsable

- **Qui.** Une personne est **responsable** d'un établissement quand la table `ACL` a une ligne qui
  porte son adresse et cet établissement (colonne `Responsable_de_l_Etablissement`). Être
  administrateur ne suffit pas : le mode admin ne concerne que les fiches de personnes. Grist rapproche
  l'adresse de la personne connectée de `ACL` dans une nouvelle colonne **facultative** de la table-sonde,
  `Responsable_de` (formule dans `GRIST_SETUP.md`, étape 2) ; sans elle, tout fonctionne sauf cette
  fiche.
- **Où cliquer.** « **✎ Modifier** » sous le logo de l'établissement (ou sous son sigle) sur chaque
  carte de cet établissement, et « **Mon établissement** » dans le bandeau « Ma présence » : ce second
  bouton marche même sans carte, ou quand l'établissement est masqué de l'annuaire. Un responsable de
  plusieurs établissements choisit d'abord lequel ouvrir.
- **Ce qu'on modifie.** Le **logo** (« Ajouter un logo », « Remplacer le logo », « Retirer le logo »), le
  **nom complet**, la case « **Établissement visible dans l'annuaire** » (colonne `ok_pour_apparaitre` :
  décochée, aucune fiche de l'établissement n'apparaît, et un avis dit combien disparaissent avant
  l'enregistrement) et la liste des **responsables** (« Retirer », « Rétablir », « Nommer » une personne
  choisie ou une adresse saisie). Le sigle et le statut sont montrés en lecture seule : seule l'équipe du
  PUI les règle.
- **Enregistrer.** Comme sur la maquette, il n'y a **pas de fenêtre de relecture** : le pied de la
  fenêtre dit ce qui va changer (« 2 modifications : nom, visibilité ») et « Enregistrer » écrit **tout
  en une seule action Grist** (le nom, la visibilité, le logo et les lignes d'`ACL`) : Grist refuse un
  des changements, aucun n'est appliqué. Ensuite l'annuaire est relu, la fenêtre se ferme et un
  message le confirme (« La fiche de CHD est enregistrée. »).
- **Un établissement garde toujours au moins un responsable** (le dernier ne se retire pas). Se retirer
  soi-même est possible, avec un avertissement. Nommer quelqu'un ne le rend pas administrateur : le
  widget **n'écrit jamais la colonne `admin`** ; retirer un responsable qui est aussi administrateur lui
  laisse sa ligne et son droit, seul l'établissement en est retiré.
- **Deux responsables à la fois.** Si le nom, la visibilité ou le logo ont changé dans Grist depuis
  l'ouverture, rien n'est écrit : la fenêtre reprend la fiche actuelle, garde la saisie et le dit. Des
  champs différents se cumulent, et les responsables nommés par un autre entre-temps restent.
- **Après l'écriture,** le widget relit tout et nomme ce que Grist n'aurait pas gardé. Chaque échec
  (droits refusés, colonne à formule, fiche disparue, panne…) a sa phrase en français.

### L'envoi du logo

- **Rien n'est envoyé avant « Enregistrer ».** L'image choisie s'affiche aussitôt en aperçu, sans quitter
  le navigateur.
- **Le fichier n'est jamais envoyé tel quel.** Le navigateur le décode, le redessine (480 pixels de
  large au plus) et le ré-encode en **PNG** : plus de métadonnées, plus de script (un SVG peut en
  contenir), une taille bornée. Formats acceptés : PNG, JPG, WebP, SVG ; 1 Mo au plus ; une image de
  plus de 40 millions de pixels est refusée avant d'être décodée.
- **Un jeton d'écriture demandé pour chaque envoi, et jamais gardé** (celui des logos affichés reste en
  lecture seule). Une seule requête (`POST …/attachments`), en `https` (ou le poste local pour la
  démonstration), sans cookie ni adresse de la page, qui s'arrête au bout de 30 secondes. Aucun jeton
  ni aucune adresse dans les messages ni dans la console.
- **Si l'envoi échoue,** rien n'est écrit et la fenêtre dit quoi faire (« Déposez le fichier directement
  dans Grist »). Si l'écriture de la fiche échoue après un envoi réussi, le fichier reste dans les pièces
  jointes du document sans servir : le widget le dit, il ne sait pas supprimer une pièce jointe.

### Ce qui n'a pas pu être essayé

Les tests simulent la réponse de Grist ; trois points ne se constatent que dans un vrai document :
que Grist **accepte l'envoi** avec ce jeton, que le navigateur **laisse le widget lire la réponse** de
l'envoi (en-têtes d'autorisation entre sites de l'instance), et que les **règles d'accès** laissent un
responsable écrire dans `Etablissements` et `ACL` et ajouter une pièce jointe. La formule de la colonne
`Responsable_de` n'a pas non plus été essayée. Si l'un manque, rien n'est cassé : la fenêtre le dit et le
logo se change dans Grist, comme avant. Le protocole d'essai est la section 17 de `TESTING.md`.
**Point à ne pas oublier :** sans règle d'accès qui réserve la colonne `admin` d'`ACL` aux
administrateurs, un responsable pourrait se donner le droit d'administrateur depuis la console
(`GRIST_SETUP.md`, étape 4). Un responsable peut aussi cocher lui-même `ok_pour_apparaitre` de son
établissement (la case « visible dans l'annuaire ») : la validation n'est plus réservée à l'équipe du PUI,
sauf règle d'accès qui la lui réserve.

### Écarts avec la maquette

Antoine a demandé que l'implémentation finale soit comme la maquette. Comparée à elle côte à côte, à
1 280 et 390 px, la fenêtre de la fiche d'un établissement (écran D1) et les boutons des cartes (écran
D0) lui sont conformes dans leur disposition, leurs textes et leurs états. Restent les écarts
suivants, et leur raison :

- **La zone « Ma présence » de l'en-tête** garde le dessin de l'habillage de la 1.14.0 (le nom, la
  phrase d'état et l'interrupteur avec son étiquette sur deux rangées) ; « Mon établissement » prend le
  coin de la première rangée, comme « Mode admin ». Une personne à la fois administratrice, responsable
  et propriétaire d'une carte a trois rangées de boutons. La maquette montre une seule rangée, avec un
  interrupteur sans texte : l'étiquette dit ce que fait l'interrupteur, et cet en-tête est déjà en ligne.
- **Les logos d'exemple de la maquette** (« Maquette, essayer avec : ESTIA, IOGS, Technowest ») servaient
  à essayer sans fichier : le vrai widget choisit un fichier, ils ne sont pas reproduits.
- **Les responsables ont leurs initiales, pas une photo.** La photo de profil arrive dans la version
  suivante.
- **Un nom n'est montré que si la fiche est dans l'annuaire.** Pour une adresse dont la fiche est masquée
  ou absente, la liste écrit « Fiche masquée de l'annuaire » ou « Adresse sans fiche dans l'annuaire », et
  la liste des personnes qu'on peut nommer ne propose que des fiches visibles (une autre personne se nomme
  par son adresse) : l'annuaire ne dévoile pas le nom d'une personne qui a choisi de ne pas y figurer,
  ce que la maquette (où tout le monde apparaît) ne distinguait pas.
- **La phrase sous la case de visibilité** change quand l'établissement est déjà masqué (« Cet
  établissement est masqué de l'annuaire : aucune de ses fiches n'y apparaît. ») : la maquette dirait que
  les fiches « seront masquées » alors qu'elles le sont déjà.
- **Les refus d'un logo sont plus précis** que le message unique de la maquette : format non accepté,
  poids avec celui du fichier choisi (« Cette image pèse 1,4 Mo… »), fichier vide ou image illisible.
- **Un SVG est redessiné en PNG** comme les autres formats, alors que la maquette le garde tel quel : le
  widget n'envoie jamais un fichier qui peut contenir du code.
- **Les polices** : inchangé depuis la 1.15.0 (le widget ne charge aucune police).

### Un pied de fenêtre comme sur la maquette, sur téléphone

La comparaison a aussi relevé un écart qui datait de la 1.12.0 : sur 390 px, le pied des fenêtres
(modification de fiche, relecture) mettait le résumé sur une ligne et les boutons sur la suivante,
parce que le résumé réservait 220 px. La maquette les met sur **une seule ligne** quand ils tiennent
(« 1 champ modifié | Retour | Valider », « Aucune modification | Annuler | Enregistrer »). Le résumé
prend maintenant sa largeur naturelle ; il passe toujours à la ligne quand le texte ou les boutons
ne tiennent pas. Cela change les trois fenêtres.

### Réglages dans Grist

À faire une fois, à la main (`GRIST_SETUP.md`) : la colonne `Responsable_de` de la table-sonde
(étape 2, facultative) ; une ligne d'`ACL` par responsable et par établissement, le premier étant
nommé dans Grist (étape 3) ; `nom_complet`, `ok_pour_apparaitre` et `logo` d'`Etablissements`, ainsi
que `email` et `Responsable_de_l_Etablissement` d'`ACL`, en colonnes de **données** (étape 1) ; les
règles d'accès de l'étape 4, dont celle qui réserve `admin` aux administrateurs.

### Pour les développeurs

Cinq modules nouveaux, sans dépendance : `etablissement.js` (droits `etablissementRightsFor()`, brouillon,
delta `diffEtablissement()`, phrases), `etablissement-save.js` (`readEtablissement()`, `savePlanOf()`,
`saveEtablissement()` : relecture, détection par champ, une action atomique, vérification),
`etablissement-ui.js` (la fenêtre `createEtablissementDialog()`), `upload.js` (`uploadAttachment()`) et
`image-prep.js` (`prepareImage()`, `checkImageFile()`). `identity.js` : `identity.etablissements` et
`responsableIds()`. `constants.js` : `PROBE_RESPONSABLE_COLUMN`, `ETABLISSEMENT_COLUMNS`, `ACL_COLUMNS`,
`IMAGE_RULES`. `dom.js` : `button()` et `notice()` (partagés avec `profile-ui.js`). `render.js` :
`fillEtablissementEdit()`. `account-ui.js` : le bouton « Mon établissement » (`etab`). `main.js` :
`openEtablissement()`, `loadFiche()`, `ficheOf()`, `saveFiche()`, `lookupPerson()`, `refreshIdentity()`.
`profile.js` : `isEmailAddress()` ; `attachments.js` : `readTokenInfo()` exporté. Préfixes de la console :
`[FICHE-ETAB]`, `[ENVOI]`, `[IMAGE]` (`[ETABLISSEMENT]` garde son sens d'avant : les contacts sans
établissement). Aucune table créée.

### Documentation et captures

Le guide utilisateur (« La fiche de mon établissement »), `GRIST_SETUP.md`, `specs.md`, le guide
développeur, la sécurité, la maintenance, `grist_structure.txt`, `TESTING.md` (section 17) et le README
suivent. Une capture s'ajoute (`fiche-etablissement.png`) ; `docs/demo/capturer.mjs` accepte
désormais le nom des captures à refaire (et `--sortie=<dossier>`), pour n'en refaire qu'une. La
démonstration a deux responsables fictives (CHD) et un serveur d'envoi de fichiers.

### Tests

**794 tests** (dont 277 dans un vrai navigateur, optionnels sans Playwright) contre 652 (dont 227)
à la sortie de la 1.16.3.

- *Droits* : `etablissementRightsFor()` fermé par défaut (pas d'identité, compte Lecteur, administrateur
  sans établissement) ; `responsableIds()` ; un bouton forcé à la main n'ouvre rien ; la colonne
  `Responsable_de` absente.
- *Le brouillon* : le delta ne porte que ce qui change, un nom vide ou refusé, un logo retiré seulement
  s'il y en a un, au moins un responsable, nommer (adresse mal formée, déjà responsable, réactivation d'un
  responsable retiré), l'avertissement de visibilité.
- *L'écriture* : une seule action atomique (la ligne d'établissement d'abord, puis `ACL`), fermée sans
  droit, conflit détecté champ par champ, valeurs déjà appliquées, ligne d'administrateur conservée,
  ligne sans établissement reprise, `admin` jamais écrite, au moins un responsable sur la liste relue,
  envoi puis relecture, refus de Grist, colonne à formule, fichier orphelin, aucune adresse dans la console.
- *L'envoi et l'image* : jeton demandé à chaque envoi et jamais gardé, adresse refusée, délai,
  statuts, réponse illisible, aucun jeton dans les messages ; refus avant lecture, dimensions, PNG
  redessiné, SVG, image trop grande.
- *Dans un navigateur* : qui voit quel bouton, le contenu de la fenêtre, l'enregistrement de chaque
  champ, les échecs, les conflits, le clavier et les noms accessibles, la mise en page de 320 à 1 280
  px, le pied de fenêtre (fiche, formulaire et relecture) sur la ligne des boutons dès que tout tient,
  l'isolation du réseau (le widget ne contacte que le serveur local, l'API Grist simulée et ses pièces
  jointes, même quand un logo est envoyé).
- *Documentation* : les phrases citées par le guide sont celles du code ; la démonstration reçoit
  l'envoi d'un logo et le sert, refuse sans jeton ou au-delà de 2 Mo ; la responsable fictive modifie
  son établissement de bout en bout ; les protections de l'envoi sont vérifiées dans le code.

Contrôle négatif : 42 modifications du code de la fiche d'un établissement ont été essayées une à une
(droit de modifier, écriture sans droit, détection d'un changement concurrent, ligne d'administrateur,
vérification après écriture, protections de l'envoi, limites de l'image, démonstration). Les tests en
ont détecté 34 d'emblée ; les huit autres ont montré des tests manquants (la vérification du logo et de
la visibilité après l'écriture, une adresse portée par deux cartes, le poids d'un PNG redessiné et la
limite de pixels d'une image, un bouton forcé à la main, le nom d'une fiche masquée), ajoutés depuis :
sept sont maintenant détectées. La dernière (le droit de modifier recalculé au moment d'enregistrer, que
`main.js` vérifie déjà à l'ouverture de la fenêtre) ne peut pas se produire par l'interface : c'est une
seconde barrière, que l'écriture elle-même (`saveEtablissement()` fermé par défaut) double.

## 1.16.3 — Interrupteur de présence : focus gardé, réussite annoncée, contrastes

Quatrième des six « gains rapides » de l'audit UI/UX (Antoine a lancé le lot le 12 octobre 2026, un
gain par version), pour les constats **U47**, **U48** et **U49** : l'interrupteur « Apparaître dans
l'annuaire » du bandeau « Ma présence ». **Ce qui change à l'œil** : la piste de l'interrupteur est plus
sombre (gris bleuté éteinte, vert plus profond allumée) ; le reste du bandeau, la mise en page, les
textes et les données sont inchangés, et l'annonce faite aux lecteurs d'écran ne se voit pas. Quatre
fichiers de code portent le changement (`account-ui.js`, `main.js`, `constants.js`, `style.css`) :
revenir au comportement et aux couleurs d'avant, c'est `git revert` de la fusion de cette version.

- **Le focus ne se perd plus (U47, WCAG 2.4.3).** Pendant l'écriture, le bouton était désactivé
  (`disabled`), et un bouton désactivé perd le focus : au clavier, la touche Tab suivante repartait du haut
  de la page (mesuré par l'audit : `document.activeElement` valait `BODY` pendant l'écriture et après). Le
  bouton porte maintenant `aria-disabled="true"` : il reste grisé, avec le pointeur d'attente, mais garde le
  focus pendant toute l'écriture et après la relecture de l'annuaire (le bandeau n'est pas reconstruit), et un
  clic ou une touche de plus pendant l'écriture est ignoré (le verrou `togglePending` de `main.js` ne change
  pas).
- **La réussite est annoncée (U47, WCAG 4.1.3).** Après une écriture réussie, la région d'état du bandeau
  (`role="status"`) dit « Modification enregistrée. Vous avez accepté d'apparaître dans l'annuaire. » ou
  « Modification enregistrée. Vous n'apparaissez plus dans l'annuaire. », puis s'efface au bout de six
  secondes (`PRESENCE_ANNOUNCE_MS`, dans `constants.js`) ou dès le message suivant. Avant, cette région était
  simplement vidée : la réussite n'avait aucun message. Les lecteurs d'écran lisent la phrase, mais elle
  n'occupe aucune place à l'écran (classe `.sr-only`), puisque la phrase du bandeau et l'interrupteur disent
  déjà la même chose ; « Enregistrement… » et les erreurs restent visibles, comme avant. Si l'annuaire n'a pas
  pu être relu après une écriture réussie, seul le message visible « Modification enregistrée ; l'annuaire
  n'a pas pu être rechargé. » reste : rien n'est annoncé comme confirmé.
- **L'état se distingue (U48, WCAG 1.4.11).** L'état de l'interrupteur ne tient qu'à sa piste et à son curseur
  (le texte du bouton ne change pas) : il leur faut 3:1 au moins avec leur fond. Les couleurs sont celles que
  l'audit proposait :

  | | Avant | Après |
  |---|---|---|
  | Piste éteinte sur le fond du bouton | `#c3c9d8` (1,56:1) | `#7d879c` (3,40:1) |
  | Curseur blanc sur la piste éteinte | 1,66:1 | 3,61:1 |
  | Piste allumée sur le fond du bouton | `#1ba99a` (2,75:1) | `#147c72` (4,76:1) |
  | Curseur blanc sur la piste allumée | 2,92:1 | 5,05:1 |

- **Contraste élevé et mouvement réduit (U49, WCAG 1.4.11 et 2.3.3).** Dans le mode contraste élevé de
  Windows (`forced-colors: active`), le navigateur impose ses couleurs : la piste et le curseur prenaient le
  même fond, sans bordure ni ombre, et l'interrupteur éteint ne se distinguait plus de l'interrupteur
  allumé. La piste a maintenant une bordure et des couleurs système (éteinte : fond `Canvas`, bordure et
  curseur `ButtonText` ; allumée : fond et bordure `Highlight`, curseur `HighlightText`), et le curseur
  reste centré malgré la bordure. Quand le système demande de réduire les animations
  (`prefers-reduced-motion: reduce`), la piste et le curseur changent d'état sans la transition de 0,15 s.
- **Reste ouvert dans l'audit.** U48 demandait aussi une bordure du bouton à 3:1 : elle fait 1,23:1 sur le
  bandeau blanc, comme celle du champ de recherche et des filtres (constat U25), et la relever changerait
  l'aspect de tous les contrôles : non traité dans ce lot. U46 (bandeau écrasé de 380 à 510 px) est le
  sixième gain du lot ; U54 (ordre de tabulation de la barre d'outils) n'en fait pas partie.
- **Correction de la 1.16.2.** Cette version annonçait que l'« interrupteur inactif à 4,49:1 » du constat
  U19 serait traité avec l'interrupteur de présence. C'était une erreur de lecture : ce 4,49:1 est le texte
  des boutons Fondateurs et Partenaires quand ils sont inactifs (`--muted` sur `#f7f8fc`, soit 4,49:1 au lieu
  de 4,5:1). Le texte de l'interrupteur de présence fait plus de 15:1 dans les deux états. Ce contraste reste
  ouvert pour un autre lot ; la phrase de la 1.16.2 est corrigée plus bas.
- **Pour les développeurs** : `account-ui.js` expose `announce()` en plus de `setBusy()` et `setStatus()` ;
  `setBusy()` pose `aria-disabled` et non `disabled` (la raison est dans le code) ; le module importe
  maintenant `constants.js` (le schéma des imports de `docs/developpeurs.md` en tient compte). La section
  « Accessibilité » de `docs/developpeurs.md` a une règle de plus sur l'interrupteur, `TESTING.md`
  (section 15) cinq contrôles à l'œil pour un vrai Grist, et le guide utilisateur dit ce qui change au
  clavier et avec un lecteur d'écran.
- **Tests** : 652 tests (227 dans un vrai navigateur, optionnels sans Playwright), 9 de plus qu'à la
  1.16.2, dont 7 ajoutés ici (les deux autres viennent de la relecture de la documentation, PR #26).
  Dans `tests/e2e.test.mjs` : l'interrupteur garde le focus pendant et après l'écriture, grisé avec
  le pointeur d'attente, et les touches de plus pressées pendant l'écriture n'écrivent rien ; la réussite est
  dite par la région d'état (phrase exacte, boîte réduite et rognée, délai relancé par une deuxième bascule,
  effacement au bout de six secondes sur une horloge simulée) ; une écriture réussie suivie d'une relecture
  ratée laisse le message visible, sans annonce de réussite ; « Enregistrement… » et une erreur sont vérifiés
  à l'écran (une erreur garde ses marges et sa bordure même rognée : le test regarde le rognage, pas
  seulement la taille de la boîte). Dans `tests/accessibility.test.mjs` : la piste et le curseur gardent 3:1
  avec leur fond, éteints puis allumés, lus dans `style.css` (sans navigateur) puis sur la page rendue ;
  avec `forced-colors` émulé, la piste a une bordure visible, un curseur distinct d'elle, un état éteint et un
  état allumé différents et un curseur centré ; avec `prefers-reduced-motion`, plus de transition.
  `tests/docs.test.mjs` exige les deux nouvelles phrases dans le guide et l'arête
  `account-ui.js → constants.js` dans le schéma. Vingt-six variantes fautives du code, de la feuille de
  style et des documents ont été essayées une à une, le code étant remis en état après chacune : vingt-cinq
  font échouer au moins un test ; la vingt-sixième, qui retire la seule garde de clic de `account-ui.js`, ne
  change rien tant que `togglePending` (`main.js`) bloque aussi le deuxième envoi, et retirer les deux
  gardes à la fois fait échouer le test du double clic.
- **Documentation** : les quatre captures où la piste de l'interrupteur se voit (`ma-presence`,
  `ma-presence-retiree`, `ma-presence-masquee`, `mode-admin`) sont refaites ; les dix-neuf autres sont celles
  de la 1.16.2. Dans `mode-admin`, les logos des cartes sont aussi pleinement affichés : la capture
  précédente les avait pris en plein fondu.

## 1.16.2 — Pastilles et lien e-mail plus foncés, lisibles (WCAG 1.4.3)

Troisième des six « gains rapides » de l'audit UI/UX (Antoine a lancé le lot le 12 octobre 2026, un
gain par version), pour la part du constat **U19** qui touche aux couleurs des étiquettes. **C'est le
seul gain du lot qui change l'aspect de la page** : les pastilles, les titres de groupe et le lien
e-mail sont plus sombres. Tout le reste (mise en page, textes, tailles, filtres, données) est
inchangé. Deux fichiers portent le changement, `constants.js` et `style.css` : revenir aux couleurs
d'avant, c'est `git revert` de la fusion de cette version.

- **Pourquoi.** Le texte blanc d'une pastille mesure 8,5 px ; la norme (WCAG 1.4.3, niveau AA) exige
  4,5:1 entre le texte et son fond, quelle que soit sa taille. Cinq des dix couleurs de catégorie
  faisaient de 2,16:1 à 3,56:1 : l'audit comptait 134 pastilles sur 202 et 60 titres de groupe sur 80
  sous le seuil, plus le lien e-mail à 3,30:1.
- **Ce qui change.** Les cinq couleurs sont foncées **à teinte et saturation constantes** (on ne baisse
  que la luminosité : chaque catégorie garde sa couleur), jusqu'à 4,6:1 au moins avec le blanc :

  | Catégorie | Avant | Après |
  |---|---|---|
  | Actions | `#f28a54` (2,46:1) | `#c84e0f` (4,61:1) |
  | Tâches | `#ff9800` (2,16:1) | `#a96500` (4,62:1) |
  | Communautés | `#d85b9d` (3,56:1) | `#cf3788` (4,61:1) |
  | GT | `#1ba99a` (2,92:1) | `#158378` (4,62:1) |
  | Instances | `#4f8ee8` (3,30:1) | `#2271e2` (4,64:1) |
  | Lien e-mail (`--blue`) | `#4f8ee8` (3,30:1) | `#2271e2` (4,64:1) |

  Les cinq autres catégories (Compétences, Domaines, Actions des tâches, Établissement, Rôle PUI)
  étaient déjà conformes et ne bougent pas.
- **Où cela se voit.** Partout où le widget lit `CATEGORIES[…].color` : pastilles et titres de groupe des
  cartes, point de couleur des boutons de filtre, filet de couleur en haut de leur menu, et, dans la
  fenêtre de modification de fiche, titres de section et pastilles cochées. Le lien e-mail des cartes
  prend le nouveau bleu. Les variables `--orange`, `--teal` et `--pink` de `style.css` ne changent
  pas : elles servent à des décors qui ne portent pas de texte (filet de couleur en haut des cartes,
  avatar, piste de l'interrupteur de présence, ✦ de l'état vide, icône de confirmation).
- **Reste ouvert dans U19, pour d'autres lots** : le sous-titre de la page sur son dégradé (4,03:1),
  les invites des champs (4,34:1), le nombre à droite d'une option de menu sous le survol (4,22:1) et
  le texte des boutons Fondateurs et Partenaires quand ils sont inactifs (`--muted` sur `#f7f8fc`, 4,49:1 ;
  la première rédaction de cette phrase l'attribuait à tort à l'interrupteur de présence, corrigé en 1.16.3).
- **Pour les développeurs** : `constants.js` dit que la couleur d'une catégorie doit garder 4,5:1 avec
  le blanc et comment en choisir une autre (la foncer à teinte constante) ; la recette « Ajouter une
  catégorie » de `docs/developpeurs.md` et la section « Accessibilité » en parlent, et `TESTING.md`
  a un contrôle à l'œil pour un vrai Grist.
- **Tests** : 643 tests (221 dans un vrai navigateur, optionnels sans Playwright), 3 de plus qu'à la
  1.16.1. Dans `tests/accessibility.test.mjs` : chaque couleur de `CATEGORIES` garde 4,5:1 avec le blanc,
  et la couleur de `.email` lue dans `style.css` aussi (sans navigateur : une catégorie ajoutée plus tard
  est contrôlée aussi) ; dans le navigateur, chaque pastille, chaque titre de groupe et le lien e-mail
  d'une carte qui porte une pastille de chaque catégorie sont mesurés sur la page rendue (couleur de texte
  et fond calculés), ce qui garde aussi le branchement de `render.js`. Douze variantes fautives ont été
  essayées une à une, le code étant remis en état après chacune (chacune des cinq couleurs et du bleu de
  retour à l'ancienne valeur, lien e-mail sur la variable orange ou en gris clair, titres de groupe et fond
  des pastilles en couleur fixe, texte des pastilles en gris clair, nouvelle catégorie trop claire) : toutes
  font échouer au moins un test.
- **Documentation** : captures où une pastille, un titre de groupe, un point de filtre ou le lien e-mail
  se voit (dix-huit sur vingt-trois) ; les cinq autres (« Ma présence », bandeau d'erreur, bandeau des
  fondateurs) sont celles de la 1.16.1.

## 1.16.1 — Cartes triées par nom, recherche « prénom nom »

Deuxième des six « gains rapides » de l'audit UI/UX (Antoine a lancé le lot le 12 octobre 2026, un
gain par version). Deux constats majeurs de l'audit, U31 (recherche fragile) et U32 (aucun tri),
levés ensemble : ils tiennent au même geste, retrouver une personne. **Rien d'autre ne change** : les
filtres, les menus, les compteurs, la mise en page et les bandeaux sont ceux de la 1.16.0.

- **Les cartes sont triées par nom de famille, puis par prénom**, dans l'ordre alphabétique
  français : « Éluard » est avec les E, « de Gaulle » avec les D (la particule compte comme une
  lettre). Une personne sans nom de famille se range d'après son prénom ; deux homonymes parfaits
  gardent l'ordre des lignes de `BDD`. Avant, les cartes suivaient l'ordre des lignes de la table
  Grist, c'est-à-dire l'ordre de saisie : pour retrouver quelqu'un sans le chercher, il fallait
  parcourir toutes les cartes. Le tri se fait une seule fois à chaque lecture de Grist
  (`buildContacts()`), pas à chaque frappe ni à chaque filtre ; une modification de nom dans Grist
  replace la carte à sa lettre, sans recharger la page.
- **La recherche trouve « prénom nom ».** Elle testait le nom et le prénom séparément : aucune requête
  ne pouvait couvrir les deux, et « Élise Marchetti » ne donnait rien (l'audit a relevé « karim benali »,
  « benali karim », « Jean Le Cœur » et « Zoé É » : 0 résultat). Chaque mot tapé doit maintenant se
  trouver dans « prénom nom », dans n'importe quel ordre : « élise marchetti », « marchetti élise » et
  « eli mar » trouvent Élise Marchetti, et un mot seul cherche toujours dans le prénom comme dans le nom.
  Tous les mots doivent être trouvés : « Élise Garnier » ne trouve personne s'il n'y a pas d'Élise Garnier.
- **Les écritures d'un même nom se valent**, pour la recherche principale seulement. L'audit avait relevé
  que « marie christine » ne trouvait pas « Marie-Christine », que « d'arcy » écrit avec l'apostrophe
  typographique ne trouvait pas « D'Arcy » (l'apostrophe droite, si) et que « coeur » ne trouvait pas
  « Cœur ». Désormais les tirets, les points et les soulignés valent des espaces, l'apostrophe (droite ou
  typographique) disparaît, « œ », « æ », « ß », « ø », « ł » et « đ » s'écrivent comme on les tape, et les
  espaces se réduisent à une seule (`normalizeForSearch()`). Les menus, les sélections et les compteurs
  gardent `normalize()` tel quel : ils n'ont pas à confondre plus de libellés qu'avant.
- **La liste ne se redessine plus à chaque lettre.** Elle attend 200 ms sans nouvelle frappe
  (`SEARCH_DELAY_MS`) : un mot de six lettres ne reconstruit plus les cartes qu'une fois au lieu de six
  (chaque reconstruction coûte ≈ 0,15 s à 400 contacts d'après l'audit). Un champ vidé (Échap, croix du
  champ) s'applique tout de suite, et « Réinitialiser » annule la frappe en attente. C'est un répit, pas
  la réponse à la lenteur à grande échelle (constat U33), qui relève de l'audit de performance prévu après
  le mode admin : une reconstruction complète des cartes à chaque application reste le coût.
- **Pour les développeurs** : la section « Filtres, compteurs et recherche » de `docs/developpeurs.md`
  décrit la recherche mot par mot, la clé de recherche gardée par contact (`searchKey()` : une frappe
  parcourt tout l'annuaire), l'ordre des cartes (`compareContacts()`, un seul `Intl.Collator` partagé) et
  l'attente de la frappe. `docs/demo/capturer.mjs` ne suppose plus que la carte de la personne
  connectée est sur la première rangée : les cartes étant triées, celle de Camille Rousseau est sur la
  dernière ; la capture de son bouton montre sa rangée, celle de la confirmation défile jusqu'à sa carte,
  celle de la carte légendée la choisit par son nom, et `node docs/demo/capturer.mjs apercu partenaires`
  ne refait que les captures dont le nom commence ainsi.
- **Tests** : 640 tests (220 dans un vrai navigateur, optionnels sans Playwright), 18 de plus qu'à la 1.16.0
  (622, dont 213). Le tri : un
  test d'unité de l'ordre (accents, particules, prénom en second critère, nom vide, valeurs vides) et un
  test de `loadDirectory()` ; dans le navigateur, les cartes d'une table à l'envers apparaissent triées, et
  une modification de nom dans Grist replace la carte. La recherche : huit tests de `filterContacts()` (mot
  par mot, tous les mots, tirets, apostrophes, œ, séparateurs seuls, contacts sans prénom ou sans nom, nom
  relu pour un contact reconstruit), un de `normalizeForSearch()` et un du compteur de menu, qui cherche
  comme les cartes ; dans le navigateur, les requêtes de l'audit. L'attente : quatre lettres tapées dans la
  même tâche ne provoquent qu'une mise à jour des cartes, un champ vidé s'applique sans attendre,
  « Réinitialiser » annule l'attente et n'en laisse aucune mise à jour superflue. Les vingt variantes fautives
  essayées une à une (tri retiré, prénom avant nom, ordre par code, `some` au lieu de `every`, apostrophe ou
  tiret conservés, attente retirée, attente non annulée…) font toutes échouer au moins un test. Les tests
  qui supposaient l'ordre des lignes de Grist (une carte « la première », « la troisième ») cherchent
  maintenant la carte par son nom, et la liste des noms de référence (`DEFAULT_CARD_NAMES`) est dans l'ordre
  alphabétique. Cinq tests du menu Tâches par action de la 1.16.0 (`tests/e2e-taches.test.mjs`) attendaient
  aussi cet ordre : leurs listes de noms sont dans l'ordre alphabétique, la carte de la fiche relue est
  retrouvée par son nom, et le menu est refermé avant de cliquer le badge de Bob, que le menu recouvrait
  depuis que sa carte est la première de la rangée. Le banc d'essai (`tests/support/browser.mjs`) ne fait
  plus échouer tout un fichier quand une page se ferme pendant la lecture d'une ligne de console : sur une
  machine chargée, `tests/e2e.test.mjs` échouait ainsi malgré ses 68 scénarios verts. Un scénario fait
  échouer cette lecture à la main (sans le correctif, il échoue à chaque essai).
- **Documentation** : guide utilisateur (« Rechercher une personne », l'ordre des cartes), maintenance (limites
  connues), spécifications, README, `TESTING.md` (section 2 du protocole manuel, à jouer dans un vrai Grist) et
  les captures où l'ordre des cartes se voit (aperçu, filtres, partenaires, mode admin, carte légendée, bouton
  « Modifier », confirmation, bandeau d'état, sans logos).

## 1.16.0 — Les tâches rangées par action : le menu Tâches se range comme les compétences

À la demande d'Antoine (« pourrais-tu faire pareil pour les tâches ? »), le menu **Tâches**
est rangé en **groupes d'actions**, exactement comme le menu Compétences l'est par domaine
depuis la 1.13.0 : une case par action, un détail dépliable, une recherche à deux niveaux.
Le filtre **Actions** ne change pas. Les cartes, les tags et les données de Grist ne
changent pas non plus, et **aucune colonne n'est à ajouter** : l'action d'une tâche se lit
dans le **numéro** de son libellé.

- **L'action d'une tâche, c'est le numéro avant le point.** « 1.3 Animer le réseau » est une
  tâche de l'action 1, « 5.4 Veille » une tâche de l'action 5. Le numéro d'une action est le
  début de son libellé : « Action 1 : … » (ou « Action 1: … »). Sont aussi compris « T1.3 »,
  « Tâche n° 1.3 », « Action n° 1 », « A1 », « 1. … » et « 1 - … ». Le widget lit le libellé
  affiché : le libellé corrigé quand il est rempli, le brut sinon. À numéro égal, la première
  ligne d'`Actions` range les tâches.
- **Un seul bouton, sept filtres.** Le menu « Tâches » range ses tâches par action (les actions
  dans l'ordre de leur numéro, « Action 2 » avant « Action 10 », chacune repliée au départ).
  À droite d'une action, le nombre de cartes qui ont **au moins une** de ses tâches. Une action
  qui n'a aucune tâche ne figure pas dans le menu.
- **« Sans action » en dernier.** Une tâche sans numéro, ou dont le numéro ne correspond à
  aucune action, est rangée sous « Sans action », pour que ses personnes restent trouvables.
  La console liste ses identifiants de ligne (`[REFS] Taches: n ligne(s) sans regroupement pour
  macroTaches…`) : la numéroter dans Grist, puis recharger.
- **Le même fonctionnement que les compétences.** Cocher une action coche toutes ses tâches ;
  la flèche déplie le détail, la case de l'action est à moitié cochée quand une partie
  seulement l'est ; un seul ensemble de tâches cochées (tout est un OU dans le menu, ET avec les
  autres filtres) ; le badge du bouton compte une action entière pour **un** ; à l'ouverture,
  les actions et les tâches cochées passent en tête ; une étiquette de tâche cliquée sur une
  carte coche cette tâche. La recherche (« Action ou tâche… ») trouve une action comme une
  tâche, et un numéro aussi : « 2.1 » retrouve la tâche, « action 2 » l'action et toutes ses
  tâches.
- **Le filtre Actions ne change pas.** Il reste une liste à plat, qui filtre sur les actions
  inscrites sur les cartes (`BDD.Actions`) ; il se cumule (ET) avec le menu Tâches, sans que
  l'un coche l'autre. Ce ne sont pas les mêmes personnes : participer à une action n'est pas
  avoir l'une de ses tâches.
- **Sans numéro, le menu reste à plat.** Si aucune tâche ne peut être rangée (aucune action
  numérotée, aucune tâche numérotée, ou aucun numéro en commun), le menu Tâches reste une liste
  à plat, comme avant, sans bandeau : la console dit pourquoi (`[REFS] Taches: aucune ligne
  n'est rattachée à une action pour macroTaches (n sur m ont un numéro, k action(s) en ont
  un) : le menu reste à plat.`). Son infobulle et son champ de recherche reprennent alors les
  textes par défaut (« Rechercher dans Tâches… »), qui ne parlent pas d'actions.
- **Les nombres dans l'ordre, dans tous les menus.** `compareLabels()` trie désormais les
  nombres comme des nombres : « 1.2 » avant « 1.10 », « Action 2 » avant « Action 10 », et
  aussi « GT 2 » avant « GT 10 » dans les autres menus. Rien d'autre ne change dans l'ordre
  alphabétique.
- **Le formulaire de modification de fiche** range aussi les tâches par action (la liste des
  actions reste à plat), sans autre changement : la relecture avant/après et l'écriture sont
  ceux de la 1.12.0.
- **Pour les développeurs.** `constants.js` : « Actions des tâches » (`macroTaches`) est un
  regroupement de `Taches` déclaré par `groups: 'taches'`, `fallback: 'Sans action'` et
  `numberedIn: 'actions'` (le groupe d'une ligne se déduit du numéro de son libellé, pas d'une
  colonne) ; `grouping: 'macroTaches'` sur « Tâches » ; l'infobulle et le champ de recherche
  d'un menu rangé par groupe sont ceux de son regroupement (`hint`, `placeholder` passent de
  « Compétences » à `macro`). `grist-data.js` : `taskActionNumber()`, `actionNumber()`,
  `completeGroupMap()` déduit le groupe des numéros sans relire de table (une lecture ratée de
  `Taches` ou d'`Actions` garde donc les libellés précédents). `render.js` : `groupingWording()`.
  Le composant de la 1.13.0 (`menuGroups()`, `buildGroupedMenu()`, `toggleFilterGroup()`)
  sert tel quel : aucun nouveau module, aucune table créée, aucune colonne lue de plus.
- **Documentation et captures.** Le guide utilisateur gagne la section « Actions et tâches », la
  maintenance les règles de numérotation des libellés (et leurs symptômes), le guide développeur
  le regroupement par numéros, `TESTING.md` (section 3, spécifique Tâches par action),
  `specs.md` et `grist_structure.txt` suivent. Le jeu de démonstration numérote ses actions et
  ses tâches (« Action 1: … », « 1.1 … », une tâche sans numéro) : une capture nouvelle montre
  le menu Tâches, et les autres sont régénérées, les libellés d'actions et de tâches des cartes
  portant leur numéro.
- **Tests** : 622 tests (dont 213 dans un vrai navigateur, optionnels sans Playwright) contre
  555 (dont 187) avant ce lot. Les tests du rangement par numéros couvrent chaque forme de
  libellé (positives et négatives), les actions qui se partagent un numéro, l'action 0, le repli
  « Sans action », les trois cas de menu à plat et la console, les lectures en panne ; dans
  Chromium, le parcours complet du menu (action entière, détail, case partielle, OU et ET,
  nombres, recherche d'une action, d'une tâche ou d'un numéro, étiquette de carte,
  Réinitialiser, données qui changent dans Grist, clavier, aucun contrôle sans nom accessible
  dans le menu ouvert, formulaire de profil) et la tenue du menu de 280 à 768 px sur des noms
  d'action très longs. Contrôle négatif : 39 modifications du code ont été essayées une à une ;
  les tests en ont détecté 38 d'emblée et la dernière (un libellé comme « 12 réunions » pris
  pour une tâche de l'action 1) après l'ajout de tests que ce contrôle a montrés manquants.

## 1.15.0 — Le mode admin, et la modification de fiche fidèle à la maquette

Deux choses dans cette version, toutes deux demandées par Antoine le 12 octobre 2026 :

1. un administrateur modifie la fiche de n'importe qui **depuis un « mode admin »** qu'il allume
   lui-même, et peut alors changer l'adresse e-mail et l'établissement d'une autre personne ;
2. la fenêtre de modification, sa relecture, les repères sur les cartes et la confirmation sont
   **alignés sur la maquette v5** qu'il a validée (« Go pour tout implémenter », puis « j'attends à
   ce que l'implémentation finale soit comme la maquette présentée »). La 1.12.0 en était une
   première version : elle est reprise ici, écart par écart.

Rien d'autre ne change : les modifications restent directes (ni validation par un administrateur,
ni historique), le widget ne crée aucune table et n'ajoute aucune colonne.

### Le mode admin

- **Un bouton « Mode admin » dans le bandeau « Ma présence »**, réservé aux administrateurs (case
  `admin` de la table `ACL`). Il est **éteint à chaque ouverture** : un administrateur qui n'y touche
  pas se comporte comme tout le monde et ne voit « Modifier » que sur sa propre fiche. Avant, en
  1.12.0, il voyait « Modifier » sur toutes les cartes dès l'ouverture, ce qui l'exposait à
  ouvrir la fiche d'un autre par mégarde.
- **Allumé**, il ajoute « ✎ Modifier la fiche » sur toutes les cartes affichées et montre, sous la
  barre d'outils, une bande qui rappelle le mode (« Mode admin : un bouton « Modifier la fiche »
  apparaît sur chaque carte. Vos changements sont relus avant d'être validés. »). Un second clic
  l'éteint.
- **Un administrateur sans fiche** (son adresse ne figure pas dans `BDD`) voit maintenant un
  bandeau qui le dit (« Administrateur », « Connecté avec … : cette adresse ne figure pas dans
  l'annuaire »), au lieu d'un bandeau absent sans explication, et y trouve quand même son mode
  admin. Un compte ordinaire sans fiche reçoit le même constat, sans interrupteur.
- **Sur sa propre fiche, un administrateur reste comme tout le monde** : le titre « Modifier mon
  profil », l'e-mail et l'établissement verrouillés.

### L'administrateur change l'e-mail et l'établissement

- **Deux champs de plus**, seulement quand un administrateur en mode admin modifie la fiche **d'une
  autre personne** : « E-mail » et « Établissement ». Une personne ne les change jamais sur sa
  fiche (l'e-mail la désigne, l'établissement décide de ce qui s'affiche), et le périmètre comme
  le choix de présence restent hors du widget.
- **L'adresse** est nettoyée et mise en minuscules ; elle doit avoir la forme d'une adresse e-mail
  (le même lien `mailto:` que celui des cartes doit pouvoir la porter) et **ne figurer sur aucune
  autre fiche** : l'adresse retrouve la personne, deux fiches ne la partagent pas. Le message
  nomme la personne quand sa fiche est visible dans l'annuaire (« Cette adresse est déjà utilisée
  par Camille Rousseau. »), sinon dit seulement « une autre fiche » : le nom d'une fiche masquée
  ne se dévoile pas. La règle est revérifiée à l'enregistrement, sur les lignes lues à ce
  moment-là (une adresse prise entre-temps : « Cette adresse e-mail est maintenant celle d'une
  autre fiche : rien n'a été modifié »).
- **L'établissement** se choisit parmi les **noms complets** (`Etablissements.nom_complet`, l'acronyme
  à défaut), obligatoire. Choisir un établissement qui n'a pas validé sa présence
  (`ok_pour_apparaitre`) affiche sous le champ : « Cet établissement n'a pas validé sa présence :
  la fiche ne sera pas visible dans l'annuaire », et la relecture le répète.
- **La relecture prévient** que l'adresse change dans `BDD`, pas dans la table `ACL` : une personne
  administratrice ou responsable d'établissement garde ses droits sur son ancienne adresse
  jusqu'à ce que `ACL` soit corrigée (le widget n'écrit jamais dans `ACL`).
- **Fermé par défaut.** `saveProfile()` refuse d'écrire l'e-mail ou l'établissement si la
  relecture n'a pas été préparée par un administrateur. Comme tout le mode admin, ce n'est qu'un
  verrou d'interface : seules les règles d'accès de Grist protègent les données
  (`GRIST_SETUP.md`, section 4).

### La modification de fiche, comme la maquette

- **La fenêtre.** Un bloc d'identité en tête (initiales, nom, e-mail, puis, à droite, le logo de
  l'établissement, ou sa pastille s'il n'en a pas) qui dit, pour une personne ordinaire, que son e-mail et son établissement ne se
  changent pas ici (« Verrouillé : l'e-mail et l'établissement sont liés à votre compte. Pour les
  corriger, contactez un administrateur. »), les champs dans l'ordre de la maquette
  (« Rôle dans le PUI » remplace « Rôle PUI »), un pied de fenêtre qui dit en une ligne ce qui
  va changer ou ce qui bloque, et le récapitulatif « Ce qui va changer » sous le formulaire.
  Les messages des champs commencent par une majuscule et disent quoi faire (« Un numéro
  français compte 10 chiffres, par exemple 05 56 78 90 12. »). Un brouillon sans prénom ni nom est
  refusé, et le dit sur les deux champs.
- **La relecture.** Une fenêtre plus large, avec la légende des repères, la carte « Avant » (« telle
  qu'elle est aujourd'hui ») et la carte « Après » (« telle qu'elle apparaîtra ») côte à côte, l'une
  sous l'autre dans un cadre étroit, puis un « Détail des changements ». Les repères de la carte
  « Après » sont ceux de la maquette : contour vert et pastille pour une ligne ajoutée ou modifiée,
  texte barré en rouge pour une ligne retirée, « + » devant un tag ajouté, tag retiré barré, contour
  autour du badge d'établissement qui change. Les pastilles et les mots cachés (« ajouté »,
  « retiré ») restent du texte, lu par les lecteurs d'écran.
- **Les avis de la relecture** ont les phrases de la maquette : « Votre établissement n'a pas validé
  sa présence : votre fiche reste masquée dans l'annuaire. », « Votre fiche est masquée de
  l'annuaire : vous n'avez pas accepté d'apparaître (interrupteur en haut de page). », et pour un
  administrateur qui déplace une fiche, « <Établissement> n'a pas validé sa présence : après
  cette modification, la fiche ne sera plus visible dans l'annuaire. ».
- **Les cartes.** Le bouton « ✎ Modifier » et l'étiquette « Votre fiche » passent sous la fonction,
  dans la colonne du nom, et ne touchent plus le badge d'établissement. Un titre (infobulle) dit
  à qui sert chaque bouton.
- **La confirmation.** Quand tout est enregistré, la fenêtre **se ferme** et un message apparaît en
  bas de l'écran six secondes (« Vos modifications sont enregistrées. », ou « La fiche de … est
  enregistrée. » pour un administrateur). Il est annoncé aux lecteurs d'écran par une zone `status`
  toujours présente, le message visible leur étant caché pour ne pas être lu deux fois. La
  fenêtre ne reste ouverte (« Fiche enregistrée ») que s'il reste quelque chose à lire : un champ
  que Grist n'a pas gardé, ou un annuaire qui n'a pas pu être rechargé.

- **Le bandeau « Ma présence » ne se laisse plus écraser.** Sur un téléphone (390 px), le texte du
  bandeau (le nom et « Vous apparaissez dans l'annuaire ») se laissait écraser par l'interrupteur
  « Apparaître dans l'annuaire » et se lisait mal : le texte garde une largeur de départ (150 px),
  c'est l'interrupteur, puis les boutons, qui passent à la ligne. Dans l'en-tête de la 1.14.0
  (dès 860 px), un administrateur a trois commandes au lieu de deux : « Mode admin » prend le coin
  de la première rangée, à droite du nom, pour que l'interrupteur garde sa largeur, sur une ligne,
  et que le bandeau reste à la hauteur du titre. Un test vérifie de 280 à 1 440 px que rien ne se
  recouvre ni ne se coupe.

### Écarts avec la maquette

Antoine a demandé que l'implémentation finale soit comme la maquette. Comparée à elle côte à côte,
à 1 280 et 390 px, la fenêtre de modification, la relecture, les repères, la bande « Mode admin » et
la confirmation lui sont conformes. Restent les écarts suivants, et leur raison :

- **La zone « Ma présence » de l'en-tête** garde le dessin de l'habillage de la 1.14.0 : le nom, la
  phrase d'état et l'interrupteur avec son étiquette, sur deux rangées (« Mode admin » dans le coin de
  la première). La maquette la montrait sur une seule rangée, avec un interrupteur sans texte. L'étiquette
  dit ce que fait l'interrupteur, ce qu'un lecteur d'écran et une personne qui découvre l'annuaire
  attendent ; cet en-tête est déjà en ligne.
- **Sur téléphone, les cartes de la relecture** ont la taille des vraies cartes, un peu plus grandes que
  sur la maquette (le texte des cartes est agrandi sous 600 px et sur écran tactile, 1.9.1) : la relecture montre exactement ce qu'on verra.
- **Les polices.** Le widget n'en charge aucune (page de sécurité) : il prend celle du poste, Inter
  quand elle y est installée. Les largeurs de texte varient donc légèrement d'un poste à l'autre ; les
  tests de mise en page passent avec une police plus large (DejaVu Sans, celle de la CI).
- **La photo de profil** (carte « Photo de profil » de la fenêtre, avatar sur les cartes) et **la fiche
  d'un établissement** (bouton « Modifier » du responsable) de la maquette ne sont pas dans cette version :
  elles arrivent dans les suivantes.

### Pour les développeurs

`constants.js` : `fieldsFor(admin)`, champs `admin`, `labelsFrom`, `required`, genre `'email'` et
`ETABLISSEMENT_NAMES` (les noms complets, lus par `grist-data.js` avec les autres libellés).
`profile.js` : `rightsFor(identity, { adminMode })`, `profileFormModel`/`diffProfile`/`rebaseChanges`
avec `{ admin }`, `diffProfile(…, { emailTaken })`, `NAME_REQUIRED`. `profile-save.js` :
`prepareReview(…, { admin })`, une seule lecture de `BDD` pour la relecture, `saveProfile()` fermé
par défaut. `presence.js` : `describeUnknownAccount()`, `describeHiddenFiche(status, { own,
etablissement })`. `account-ui.js` : bouton « Mode admin » (`aria-pressed`), `switchable: false`.
`preview.js` : l'établissement et l'e-mail font partie des lignes comparées. `main.js` : `toggleAdminMode()`,
`showToast()`, `emailTakenElsewhere()`. `profile-ui.js` : la fenêtre unique, ses étapes
(`editing`, `preparing`, `reviewing`, `saving`, `saved`) et `finish()`. Aucun nouveau module, aucune
table créée.

### Documentation et captures

Le guide utilisateur (« Modifier ma fiche », avec le mode admin), `GRIST_SETUP.md` (section 3 :
le mode admin, l'e-mail et l'établissement, la table `ACL`), `specs.md`, le guide développeur, la
sécurité, la maintenance et `TESTING.md` suivent. Les captures de la modification de fiche sont
refaites d'après la nouvelle fenêtre, et trois s'ajoutent : la confirmation, le mode admin et la
fiche d'une autre personne modifiée par un administrateur.

### Tests

**555 tests** (dont 187 dans un vrai navigateur, optionnels sans Playwright) contre 506 (dont 167)
à la sortie de la 1.14.1.

- *Mode admin* : éteint à l'ouverture, un administrateur ne voit « Modifier » que sur sa fiche ; allumé,
  sur toutes les cartes ; le bouton s'actionne au clavier, annonce son état (`aria-pressed`) et garde
  le focus quand les cartes sont redessinées ; il reste allumé quand l'annuaire est relu ; un
  administrateur sans fiche le trouve dans un bandeau sans interrupteur de présence ; un bouton
  « Modifier » forcé à la main sur la fiche d'un autre, mode éteint, n'ouvre rien. `rightsFor()` :
  le droit d'administrateur n'existe qu'avec un mode exactement `true` et un compte qui est
  administrateur.
- *E-mail et établissement* : les deux champs n'existent que pour un administrateur qui modifie la
  fiche d'une autre personne (`profileFormModel`, `diffProfile`, `rebaseChanges`, `prepareReview`,
  `saveProfile` les ignorent ou les refusent sinon, quoi que contienne le brouillon) ; adresse mal
  formée, trop longue, prise par une autre fiche (en ignorant la casse, y compris quand le formulaire
  ne le savait pas), vidée, lue comme une formule par un tableur ; établissement jamais vidé ni
  inconnu ; une adresse prise entre la relecture et l'enregistrement n'est pas écrite ; un
  changement concurrent de ces colonnes ramène à la relecture ; tout s'écrit en **une seule**
  `UpdateRecord` ; un établissement qui n'a pas validé sa présence retire la fiche de l'annuaire, ce
  que la relecture dit d'abord.
- *Fidélité à la maquette* : confirmation par message (délai de six secondes mesuré avec l'horloge du
  navigateur, remplacée et relancée par un second enregistrement, annoncée aux lecteurs d'écran), la
  fenêtre qui reste ouverte quand Grist n'a pas tout gardé ou que l'annuaire ne se recharge pas, les
  phrases de chaque message, la légende, les deux colonnes, les repères de la carte « Après », le
  bouton « Modifier » rangé sous la fonction sans toucher le badge d'établissement, le titre « Modifier
  mon profil » conservé sur sa propre fiche, et `describeUnknownAccount()` (adresse inconnue,
  administrateur sans fiche, colonne `email` absente de `BDD`).
- *Habillage et fenêtre de modification* : le logo de l'établissement dans le bloc d'identité de
  la fenêtre (pastille quand il n'a pas de logo, ou quand le fichier manque), le bandeau « Ma
  présence » de l'en-tête de 280 à 1 440 px (rien ne se recouvre, l'interrupteur garde sa largeur)
  et les deux colonnes de la relecture, que le test des logos retrouve.
- Les tests de la 1.12.0 qui décrivaient l'ancienne fenêtre (textes, étapes, sélecteurs) sont
  réécrits pour la nouvelle ; aucun n'a été supprimé sans remplaçant.

## 1.14.1 — Champ de recherche nommé, anneau de focus visible au clavier

Premier des six « gains rapides » de l'audit UI/UX (Antoine a lancé le lot le 12 octobre
2026, un gain par version). Deux non-conformités d'accessibilité (WCAG 2.2 AA) levées sur la
recherche, **sans rien changer à l'aspect de la page pour qui n'utilise que la souris** (constats
U13 et U14 de l'audit).

- **Le champ de recherche a un nom.** Dans l'arbre d'accessibilité de Chromium, le champ n'avait
  aucun nom : son `<label>` ne contenait que l'icône de loupe, masquée aux lecteurs d'écran, et
  l'invite grisée (`placeholder`) n'est pas un nom fiable. Il porte maintenant
  `aria-label="Rechercher par nom ou prénom"`, qui reprend le texte affiché dans le champ
  (« Rechercher par nom ou prénom… ») : le nom que dit un lecteur d'écran ou qu'épelle une commande
  vocale (« cliquer sur Rechercher par nom ou prénom ») est celui qu'on lit à l'écran (WCAG 2.5.3).
  C'était le seul contrôle de la page sans nom ; la recherche à l'intérieur d'un menu de filtre
  (« Rechercher dans Compétences ») en avait déjà un.
- **On voit où l'on est au clavier.** Le champ de recherche supprimait son anneau de focus
  (`outline: 0`) sans le remplacer : tabuler jusqu'à lui ne montrait rien (0 pixel de différence
  entre les captures avant et après, mesuré). Un anneau violet de 2 px entoure maintenant le cadre
  entier, loupe comprise, en suivant ses coins arrondis (`.search-box:focus-within`) ; comme pour
  tout champ de saisie, il s'affiche aussi quand on clique dans le champ. La recherche à
  l'intérieur d'un menu avait seulement une bordure violette de 1 px (4,4:1) : elle reçoit le même
  anneau, en plus de sa bordure.
- **Un seul anneau pour tous les contrôles**, défini une fois en tête de `style.css`
  (`:where(button, a, input, select, textarea, summary, [tabindex]):focus-visible` : 2 px, violet
  `#6257d9`, à 2 px du bord). Avant, les contrôles sans règle propre gardaient l'anneau par défaut du
  navigateur, qui varie d'un navigateur à l'autre et n'a pas été pensé pour ce thème. Le violet fait 5,4:1
  sur blanc (3:1 exigés pour un indicateur de focus, WCAG 1.4.11). L'anneau commun n'ayant aucune
  spécificité (`:where()`), les règles propres aux contrôles qui en avaient déjà une (la
  flèche des domaines, « ✎ Modifier », « Modifier mon profil », les champs des fenêtres) gardent la leur ;
  à la souris, il n'apparaît pas (`:focus-visible`), sauf dans un champ de saisie.
- **Pour les développeurs** : une section « Accessibilité » dans `docs/developpeurs.md` (noms accessibles,
  anneau de focus, ce qui reste à vérifier), `tests/support/contrast.mjs` (rapport de contraste WCAG
  à partir des couleurs calculées par le navigateur, que les gains suivants réemploient) et la section 15
  de `TESTING.md` (contrôle à jouer au clavier et au lecteur d'écran).
- **Tests** : 506 tests (167 dans un vrai navigateur, optionnels sans Playwright). Nouveau fichier
  `tests/accessibility.test.mjs` (6 tests) : rapports de contraste de référence (sans navigateur) ; une
  garde sur les feuilles de style, qui refuse tout nouveau `outline: 0` ou `outline: none` non déclaré avec sa
  raison (sans navigateur) ; le champ de recherche nommé par son rôle, et dont le nom reprend le texte visible ;
  aucun contrôle sans nom accessible dans l'arbre d'accessibilité (`ariaSnapshot()`), page au repos puis menu
  ouvert avec un domaine déplié ; le parcours complet à la tabulation, où chaque arrêt doit changer de
  capture avec et sans focus, porter un anneau plein de 2 px au moins et de 3:1 au moins ; le même parcours dans
  un menu ouvert (recherche, cases, flèches de détail).
- **Contrôle négatif.** Cinq modifications volontaires (nom retiré du champ, anneau du cadre retiré,
  `outline: 0` rétabli sur la recherche des menus, anneau commun retiré, anneau ramené à 1 px) ont été
  essayées une à une, le code étant remis en état après chacune : chacune fait échouer au moins un des
  nouveaux tests.
- **Pas encore essayé avec un vrai lecteur d'écran** (NVDA, VoiceOver, TalkBack), ni dans Firefox et Safari :
  section 15 de `TESTING.md`. Restent ouverts dans l'audit, pour d'autres lots : la sémantique des menus
  de filtres (`aria-expanded`, Échap pour les fermer), l'ordre de tabulation dans les menus et la région que
  les lecteurs d'écran relisent (toute la grille de cartes, `aria-live`).

## 1.14.0 — Habillage du PUI : logos des établissements, financeurs et bandeau des fondateurs

Le PUI est le consortium de tous ses établissements fondateurs : il n'a pas d'identité
graphique propre, ce sont leurs logos qui l'habillent. Les logos sont stockés dans le
document Grist (pièces jointes) : ni le dépôt ni le widget n'en contiennent. **Tout est
facultatif** : sans les colonnes ni la table décrites plus bas, le widget montre les noms à la
place des logos (la pastille de toujours sur les cartes, les fondateurs validés en texte dans
le bandeau du bas, pas de financeurs en tête de page) et ne demande aucun jeton à Grist.

- **Sur les cartes : le logo de l'établissement, seul** (le nom ne s'affiche, dans une
  pastille, que si Grist n'a pas de logo pour lui). Un clic dessus filtre sur
  l'établissement, comme la pastille ; on l'atteint au clavier ; le nom est son texte
  alternatif et son infobulle. Plus haut qu'une pastille, le logo couvre les deux rangées du
  nom et de la fonction, comme l'avatar : le nom reste centré sur l'avatar et rien ne passe
  sous le logo.
- **Un seul bandeau en haut** (limiter la place prise, demande d'Antoine) : le titre et le
  compteur à gauche, les **financeurs** discrets au centre (la phrase « Projet financé par
  l'État dans le cadre de France 2030 » et leurs logos, **affichés en niveaux de gris** quelle
  que soit la version déposée dans Grist, comme sur la maquette ; le rond du bandeau du bas
  garde ses couleurs), la zone « Ma présence » et « Modifier mon profil » à droite, devenue
  compacte. Selon la largeur du cadre Grist : sous 860 px tout s'empile ; de 860 à 1 179 px,
  le titre à gauche et à droite les financeurs au-dessus du profil ; à partir de 1 180 px,
  les trois côte à côte, la phrase de financement ne s'ajoutant qu'à partir de 1 320 px (elle
  reste lue par les lecteurs d'écran). Les seuils laissent de la marge avec une police plus
  large que prévue (celle de la CI).
- **Tout en bas : le bandeau des fondateurs.** Les logos des établissements fondateurs qui
  ont validé leur apparition, dans l'ordre de la colonne `ordre_bandeau` (celui du bandeau
  fourni par le PUI), le rond « France 2030 » qui le ferme (le financeur de ce nom) et la
  phrase de financement, dont le nom du PUI renvoie à la page du projet. Une infobulle donne
  le nom complet de chaque établissement. Sous 560 px de largeur utile, les logos se
  répartissent sur quatre colonnes au lieu de huit.
- **Un poids visuel voisin.** Un emblème carré, une bannière large et une signature haute
  ne se règlent pas à la même hauteur : le widget vise une **surface** par logo, répartie
  selon les proportions du fichier puis bornée en largeur et en hauteur (`logoSize()`). Les
  logos apparaissent en fondu une fois chargés, sans cadre cassé ni texte qui clignote.
- **Quand un logo manque, le nom le remplace**, sans bandeau rouge : fichier absent,
  supprimé ou illisible (cet établissement seulement), jeton refusé par Grist ou version de
  Grist sans cette méthode (tous les logos, un seul avertissement `[LOGOS]` par série
  d'échecs). Une table `Financeurs` absente ne produit aucun message : l'en-tête n'a
  simplement pas de financeurs.
- **À faire dans Grist** (`GRIST_SETUP.md`, étape 5) : dans `Etablissements`, les colonnes
  `logo` (Pièces jointes) et `ordre_bandeau` (Numérique) ; si l'on veut des financeurs, une
  table `Financeurs` (`nom`, `logo`, `ordre`) ; puis un fichier par cellule, de préférence un
  SVG ou un PNG sur fond transparent, rogné au plus près. Modifier ces tables ne prévient pas
  le widget : recharger la page. **La table `Financeurs` est la seule table qu'il faut créer, à
  la main ; le widget ne l'écrit jamais.** Les financeurs ne sont pas des établissements : les
  ranger dans `Etablissements` les ferait apparaître dans le filtre « Établissement » et dans
  les règles de visibilité.
- **Comment le widget lit les fichiers.** Il lit les identifiants des pièces jointes
  (`['L', 12]`), demande à Grist un **jeton d'accès en lecture seule**
  (`docApi.getAccessToken({ readOnly: true })`, la méthode que donne la documentation de
  Grist) et pose dans des balises `<img>` des adresses de la forme
  `<adresse de l'API>/attachments/<identifiant>/download?auth=<jeton>`. Le jeton est demandé
  une seule fois pour toutes les images, renouvelé 30 secondes avant son expiration, redemandé
  une fois quand une image échoue (page restée ouverte), et jamais plus d'une fois toutes les
  30 secondes après un refus. Aucune requête `fetch` n'est ajoutée au code.
- **Sécurité** (`docs/securite.md`, nouvelle section « Les logos et le jeton d'accès aux
  pièces jointes »). Le jeton n'est **pas limité aux pièces jointes** : tant qu'il est valable
  (quelques minutes), qui le détient peut lire le document avec les droits de la personne
  connectée, jamais l'écrire. Il se trouve dans l'adresse de chaque logo (onglet Réseau des
  outils du navigateur ; le navigateur écrit lui-même cette adresse dans sa console quand un
  logo ne se charge pas : **ne pas partager de capture de la console ni de l'onglet Réseau**).
  Le widget le garde en mémoire seulement, ne le journalise jamais ni ne l'envoie ailleurs, et
  n'envoie pas l'adresse de la page avec la demande d'image (`referrerPolicy="no-referrer"`).
- **Pas encore essayé dans un vrai Grist.** Les tests simulent la réponse de Grist ; la
  section 14 de `TESTING.md` est le contrôle à jouer sur une copie du document (jeton, adresses
  des images, droits d'un compte Lecteur, expiration du jeton, mise en page).
- **Pour les développeurs** : `branding.js` (ce qu'on montre : fondateurs, financeurs, rond,
  logo de chaque établissement, taille des logos ; sans DOM), `attachments.js` (le jeton et
  l'adresse de chaque fichier ; sans DOM) et `branding-ui.js` (les images et les deux
  bandeaux) sont nouveaux ; `loadDirectory()` renvoie aussi les lignes brutes d'`Etablissements`
  et de `Financeurs` (table facultative, absente sans message) ; `render.js` dessine le logo
  d'une carte, y compris dans la relecture avant/après ; `constants.js` gagne `BRANDING`,
  `BAND_LOGO`, `FUNDER_LOGO`, `CARD_LOGO` et `PUI_URL`. `tests/support/fake-attachments.mjs`
  sert des pièces jointes au faux Grist des tests navigateur et le faux Grist sait répondre à
  `getAccessToken`.
- **Démonstration et captures.** `docs/demo/logos-fictifs.mjs` dessine des logos **inventés**
  (de proportions variées) pour les établissements et financeurs imaginaires : aucun logo
  réel n'entre dans le dépôt public. `?sanslogos` simule un Grist qui refuse le jeton. Toutes
  les captures de `docs/images/` sont régénérées, avec deux nouvelles (`bandeau-fondateurs.png`,
  `sans-logos.png`).
- **Tests** : 499 tests (164 dans un vrai navigateur, optionnels sans Playwright), dont les
  nouveaux fichiers `tests/branding.test.mjs`, `tests/attachments.test.mjs`,
  `tests/branding-e2e.test.mjs` et `tests/branding-layout.test.mjs` (mise en page de 320 à
  1 920 px, logos de formes variées, en-tête aux trois largeurs, bandeau qui se replie). Un
  nouveau test vérifie que le widget n'écrit ni le jeton ni l'adresse d'un logo dans la
  console, et `tests/docs.test.mjs` vérifie désormais que le schéma des imports de la
  documentation développeur est exactement celui du code et que la page de sécurité cite
  `getAccessToken`, la nouvelle méthode de l'API de Grist qu'emploie le widget.
- **Contrôle négatif.** Quinze modifications volontaires du code des logos (fondateur sans
  validation, ordre 0 accepté, rond cherché par son nom exact, jeton non renouvelé avant
  son expiration, jeton demandé en écriture, aucun délai d'attente, adresse de la page
  envoyée avec l'image, logos des cartes chargés tout de suite, nouvelle tentative sans fin,
  jeton non encodé, bornes de taille inversées, jeton redemandé à chaque image, échec qui
  ne retarde pas la demande suivante, logo du dernier fichier au lieu du premier, financeurs
  sans ordre) ont été essayées une à une, le code étant remis en état après chacune :
  chacune fait échouer au moins un test. La « nouvelle tentative sans fin » n'en faisait
  échouer aucun ; un test a été ajouté pour elle. Les tests de mise en page ont aussi été
  rejoués avec DejaVu Sans seule, la police de remplacement de la CI, plus large que celle du
  développement, ce qui a conduit à des seuils d'en-tête avec de la marge et à une zone
  « Ma présence » qui ne change pas de hauteur quand la police est large.

## 1.13.0 — Les domaines dans le menu Compétences : un seul menu, une double recherche

Le filtre « Domaines » de la 1.9.0 (un second bouton à côté de « Compétences ») est
retiré, à la demande d'Antoine : les domaines (les compétences macro) sont désormais
les **groupes du menu « Compétences »**, qui se cherche à deux niveaux, par domaine ou
par compétence. Les données Grist, les cartes et les tags ne changent pas.

- **Un seul bouton, sept filtres.** « Domaines » disparaît de la barre d'outils. Le menu
  « Compétences » range ses compétences par domaine (domaines triés, « Autres » en
  dernier pour les compétences que `Macro_competences` ne classe pas), chacun replié
  au départ. À droite d'un domaine, le nombre de cartes qui ont **au moins une**
  compétence de ce domaine (une personne qui en a deux n'est comptée qu'une fois).
- **Cocher un domaine coche toutes ses compétences.** La flèche à droite du domaine
  déplie le détail, pour n'en choisir que quelques-unes ; la case du domaine est alors
  à moitié cochée (état indéterminé), un clic la complète, un second décoche tout. La
  case d'un domaine n'est qu'un raccourci : il n'y a qu'**une** sélection, faite de
  compétences, et la case est déduite de ce qui est coché.
- **Recherche à deux niveaux.** Le champ du menu (« Domaine ou compétence… ») trouve un
  domaine comme une compétence, sans tenir compte des accents ni des majuscules : un
  domaine dont le nom correspond reste avec **toutes** ses compétences, une compétence
  qui correspond reste sous son domaine. Pendant la recherche tout est déplié (les
  flèches disparaissent) ; vider le champ rétablit l'état précédent. La recherche
  ne coche rien.
- **À l'ouverture du menu**, les domaines qui contiennent une valeur cochée passent en
  tête, la valeur cochée en tête de son domaine, et un domaine coché en partie s'ouvre
  de lui-même. Rien ne se déplace pendant qu'on coche : la ligne qu'on vient de cocher
  reste sous les yeux.
- **Le badge du bouton compte un domaine entier pour un.** Cocher un domaine de douze
  compétences affiche « 1 », pas « 12 » ; un domaine coché en partie compte ses
  compétences cochées une à une, et une compétence écrite sous deux domaines une seule
  fois.
- **Ce qui change pour qui utilisait « Domaines ».** Tout est désormais un OU dans le
  menu, comme dans tous les autres : un domaine et une compétence d'un **autre** domaine
  cochés ensemble montrent les personnes de l'un *ou* de l'autre. Le cumul de la 1.9.0
  (un domaine ET une compétence, qui ne gardait que les personnes ayant les deux) n'existe
  plus ; pour restreindre à une compétence d'un domaine, on coche cette compétence seule.
  Une étiquette de compétence cliquée sur une carte coche la compétence, comme avant ; le
  domaine passe à moitié coché (ou coché si c'est sa seule compétence).
- **Compteurs.** Le nombre d'un domaine est calculé avec le reste des critères (recherche,
  interrupteurs Fondateurs/Partenaires, autres menus) mais sans le menu Compétences
  lui-même, comme le nombre de chaque option : cocher une compétence ne change pas celui
  de son domaine. Un seul passage sur les contacts compte compétences et domaines.
- **Menu plat de repli.** Si Grist ne donne aucun domaine (colonne `Macro_competences`
  absente ou table illisible), le menu Compétences reste complet mais à plat, sans domaines,
  et le bandeau d'état prévient comme avant.
- **Accessibilité.** De vraies cases à cocher (« partielle » annoncée par les lecteurs
  d'écran), une flèche qui est un bouton (`aria-expanded`, `aria-controls`, « Détail de
  <domaine> »), le champ de recherche annoncé « Rechercher dans Compétences ». Le repli passe
  par une classe CSS : l'attribut `hidden` est forcé en `display: none !important`.
- **Mise en page.** Un nom de compétence très long, sans point de coupure, passait hors du
  menu : il passe à la ligne (`overflow-wrap: anywhere`), dans tous les menus. Au tactile,
  la flèche et la case de domaine ont la taille des autres cibles.
- **Pour les développeurs.** `constants.js` : `grouping` (inverse de `groups`) sur la
  catégorie « Compétences », `macro` n'a plus de bouton. `filters.js` : `menuGroups()`,
  `groupState()`, `toggleGroup()`, `selectionCount()` ; `computeFilterCounts()` compte
  aussi le regroupement d'un filtre. `render.js` : `buildGroupedMenu()`, `buildGroup()`,
  `searchGroups()`, `settleGroupedMenu()`. `main.js` : `toggleFilterGroup()`. Aucun nouveau
  module, aucune table créée.
- **Documentation et captures.** Le guide utilisateur passe à sept filtres et explique le
  menu ; le guide développeur, la maintenance, `TESTING.md` (section 3, spécifique
  Compétences par domaine), `specs.md` et `grist_structure.txt` suivent. Les captures sont
  régénérées : la barre d'outils change, deux images nouvelles montrent le menu groupé et
  sa recherche, `filtre-menu.png` montre un menu à plat.
- **Tests** : 406 tests (dont 124 dans un vrai navigateur, optionnels sans Playwright) contre
  376 (dont 110) avant ce lot. Les tests du filtre « Domaines » séparé sont remplacés par ceux
  du menu groupé, qui couvrent le rangement des domaines (ordre, « Autres » en dernier,
  orthographes mêlées, menu plat), les états d'un domaine, cocher un domaine entier, le badge,
  les compteurs, et dans Chromium le parcours complet (domaine entier, détail, case partielle,
  recherche à deux niveaux, ouverture réordonnée, étiquette de carte, Réinitialiser,
  accessibilité, reconstruction des menus quand Grist change un libellé) et la tenue du menu de
  280 à 1 920 px, y compris sans la police Inter, comme dans la CI. Contrôle négatif : 52 modifications du code
  ont été essayées une à une ; les tests en ont détecté 50 (dont 3 après l'ajout de tests que
  ce contrôle a montrés manquants) et les 2 autres sont sans effet visible, les nombres posés à
  la construction des menus étant aussitôt recalculés à l'affichage des cartes.

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
- **Mise en page.** Dans un cadre de 280 px (le plus étroit que mesure `tests/responsive.test.mjs`),
  l'interrupteur du bandeau « Ma présence » débordait de 2 px quand une personne était
  identifiée : il se resserre désormais, son texte passe à la ligne. Les boutons du pied
  de la fenêtre passent eux aussi à la ligne au lieu de sortir du cadre.
- **Tests** : 371 tests (110 dans un vrai navigateur, optionnels sans Playwright), dont
  144 pour ce lot : construction des écritures (listes calculées sur la fiche
  actuelle, téléphone numérique ou texte), relecture, conflit concurrent, refus, cartes
  avant/après, avis « fiche masquée », et le parcours complet dans Chromium, de 280 à
  1 100 px de large. Contrôle négatif : 58 modifications du code (signature de conflit
  non comparée, liste écrite sans les valeurs actuelles, retrait ignoré, colonne en trop
  écrite, carte « après » identique à « avant », bouton sur toutes les cartes, Échap
  sans avertissement, pastille manquante, boutons qui débordent…) ont été essayées :
  56 font chacune échouer au moins un test ; les deux autres ne changent rien de visible
  (une copie de brouillon que la fenêtre refait à chaque ouverture, un avis de champ
  déplacé que le message général remplace).

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
