# Protocole de test

Ce widget n'a pas de test automatisé contre une vraie instance Grist (voir
« Tests automatisés » plus bas pour ce qui est couvert avec une API Grist
simulée). Ce document est le protocole de test **manuel**, à exécuter dans
Grist avant tout déploiement qui touche `main.js`, `render.js`, `index.html`
ou `style.css`. Pour un changement limité à `grist-data.js`/`filters.js`, les
tests automatisés suffisent à condition d'être complétés pour le changement.

## Tests automatisés

```
node --test
```

Sans dépendance, un fichier de tests par module :

- `tests/grist-data.test.mjs` — décodage et formats des données Grist : `text`,
  `normalize` (dont sa mémoire, bornée à 20 000 textes : mêmes résultats qu'à froid, 1.29.0),
  `normalizeForSearch` (œ, apostrophes, tirets, points, espaces),
  `compareLabels` (les nombres dans l'ordre), `compareContacts` (l'ordre des cartes), `formatPhone`,
  `safeValues`, `tableToRows`,
  `pickLabel`, `labelMapFromRows`, `groupLabelMap`, `taskActionNumber`, `actionNumber`,
  `refId`, `refLabel`, `isEmptyReference`,
  `resolveListItem`, `createRequestSequencer`, `debounce` (une rafale n'appelle qu'une fois, le
  premier appel part tout de suite, 1.29.0),
  `referenceMapsEqual`, `mailtoHref` et `shownEmail` (l'adresse montrée sur la carte : `email_affiche`,
  sinon celle du compte).
- `tests/enrich.test.mjs` — `enrich` (établissement dans ses 3 encodages, rôle,
  catégories liste dont compétences, domaines, tâches et actions, libellés sans doublon, anciennes
  colonnes ignorées, indicateurs) et `labelsOf`.
- `tests/etablissements.test.mjs` — `etablissementFlagsFromRows` (dont les
  doublons), `etablissementFlags` (par identifiant de ligne, repli sur le
  libellé, jamais une propriété d'`Object`), `isEtablissementEligible`, `filterVisibleEstablishments` (le menu Établissement offre ce que les cartes
  peuvent montrer, selon les interrupteurs).
- `tests/filters.test.mjs` — `filterContacts` (dont la recherche « prénom nom », mot par
  mot et dans n'importe quel ordre, et ses écritures tolérées), `pruneStaleFilters`,
  `computeFilterCounts` (dont les compteurs des domaines et des actions, et un libellé qui porte le nom d'une
  propriété d'objet : « constructor », « __proto__ ») et le menu
  rangé par groupe, domaine ou action : `menuGroups`, `groupState`, `toggleGroup`,
  `selectionCount`.
- `tests/load-directory.test.mjs` — `loadDirectory()` avec un faux `docApi`
  (une lecture par table, cartes triées par nom, aucune ancienne table lue ni table `Financeurs`,
  libellé corrigé seul (une ligne qui n'en a pas disparaît, sauf dans une table qui n'en remplit
  encore aucun ; plusieurs lignes brutes de même libellé corrigé : une seule entrée du filtre),
  tables indispensables illisibles, table de référence illisible,
  colonnes obligatoires, facultatives (`perimetre`, que le widget ne lit plus) ou introuvables,
  annuaire vide expliqué,
  doublons d'acronymes, domaines des compétences, tâches rangées par action
  d'après leur numéro : formats de libellé, repli « Sans action », menu à plat,
  lectures en panne).
- `tests/task-roles.test.mjs` — le rôle de la personne dans une tâche (`Taches_role`) : lu sur les lignes
  brutes que `BDD.Taches` lui désigne et non sur le libellé corrigé que plusieurs lignes partagent, tous les
  rôles d'une étiquette qui regroupe plusieurs de ses lignes, colonne absente ou vide sans message, table
  illisible (rôles précédents gardés), texte déjà résolu sans rôle.
- `tests/identity.test.mjs` — `readIdentity` avec un faux document Grist (adresse
  lue sur la ligne de la sonde, administrateur d'après `ACL`, établissements dont la
  personne est responsable d'après la colonne `Responsable_de`, compte Lecteur,
  table-sonde absente puis créée par le widget avec ses trois colonnes et leurs formules de
  déclenchement (1.20.0), création refusée, table numérotée retirée quand une autre personne
  l'a créée au même instant, formule muette, écriture refusée, lecture en panne, ligne de
  sonde supprimée avant de répondre (suppression attendue, retentée une fois, jamais attendue
  sans fin, dite dans la console avec la raison de Grist ; anciennes lignes laissées à la même
  adresse supprimées, jamais celles des autres), règle d'accès la plus stricte, personnes
  simultanées, aucune adresse dans la console), `responsableIds` et `isReadOnlyAddress`.
- `tests/people.test.mjs` — l'index des lignes de `BDD` par adresse et par
  identifiant (`findByEmail`, `findById`, doublons, colonne `email` absente) et `describeVisibility` : le
  verdict « apparaît ou non, et pourquoi » concorde avec `buildContacts`, ligne par
  ligne.
- `tests/presence.test.mjs` — `describePresence` (les messages dits à la
  personne), `describeUnknownAccount` (adresse absente de `BDD`, administrateur sans
  fiche, colonne `email` manquante), `describeHiddenFiche` (les avis de la relecture, dont celui
  d'une fiche en cours de création), `describeCreated` (dit si la fiche qui vient d'être créée
  apparaît, et pourquoi elle n'apparaît pas), `setPresence` (une écriture atomique, seule la case
  de la personne, plusieurs lignes, refus de Grist) et `explainWriteError`.
- `tests/profile.test.mjs` — `rightsFor` (qui peut modifier quelle fiche, fermé par
  défaut, le droit d'administrateur seulement avec le mode admin allumé),
  `profileFormModel` et `draftOf` (dont l'e-mail et l'établissement d'un administrateur, l'e-mail
  affiché `email_affiche` offert à tout le monde, et le formulaire d'une fiche en création :
  `blankFiche`, l'établissement à choisir parmi les fondateurs et les partenaires, un nom et un
  établissement réclamés une fois le formulaire commencé, jamais l'e-mail du compte, pas de
  photo même avec une colonne `Avatar`),
  `diffProfile` (textes nettoyés et refusés, téléphone français, e-mail refusé s'il est mal
  formé, trop long, vidé ou pris par une autre fiche, adresse affichée facultative et dont seule
  la forme est vérifiée, établissement jamais vidé ni inconnu,
  références, listes en ajouts et retraits, photo remplacée ou retirée), `rebaseChanges` (ramener
  les changements sur la fiche actuelle) et `describeChanges`. La photo n'est proposée que si `BDD`
  a une colonne `Avatar`.
- `tests/profile-save.test.mjs` — `buildRowUpdate` (listes calculées sur la fiche
  actuelle, téléphone numérique ou texte, e-mail et établissement), `signatureOf`,
  `readRow`, `prepareReview` (cartes avant et après, rien d'écrit, l'e-mail et
  l'établissement ignorés hors administrateur, une adresse prise refusée), `saveProfile`
  (une seule action atomique, changement concurrent, adresse prise entre-temps, fermé par
  défaut pour l'e-mail et l'établissement, refus de Grist, aucune adresse ni valeur dans la
  console ; pour une photo : envoi après les vérifications et avant l'écriture, nouvelle
  relecture après l'envoi, `Avatar` écrit dans la même action, fichier resté sans servir,
  aucun envoi pour un retrait), `prepareCreation` (la carte « Ma fiche » telle qu'elle apparaîtra,
  rien d'écrit), `createProfile` (une seule action `AddRecord` sur `BDD` : l'adresse du compte en
  minuscules, ce qui a été rempli et `Accepte_apparaitre` comme un choix, jamais `perimetre` ; rien
  d'écrit quand une fiche porte déjà l'adresse, quand le brouillon est incomplet ou quand Grist
  refuse) et `unsavedLabels` (aussi pour le choix d'apparaître d'une fiche créée).
- `tests/preview.test.mjs` — `diffContacts`, `previewOf` et `withAvatarChange` : ce qui change
  entre la carte avant et la carte après, la photo comprise.
- `tests/schema.test.mjs` — `readColumnTypes` (type des colonnes de `BDD`, repli).
- `tests/attachments.test.mjs` — `attachmentIds` et `avatarIdOf` (cellules `['L', …]`, identifiant
  seul, cellule vide) et `createAttachments` (jeton en lecture seule demandé une seule fois,
  renouvelé avant son expiration, échecs et délai d'attente, réponses inattendues,
  un seul avertissement quand Grist refuse le jeton).
- `tests/etablissement.test.mjs` — la fiche d'un établissement sans Grist ni DOM :
  `etablissementRightsFor` (fermé par défaut, un administrateur n'est pas responsable pour
  autant), `etablissementOf`, `responsablesOf`, `peopleOfEtablissement` (fiches visibles
  seulement), le brouillon (`nominate`, `toggleResponsable`, `rebaseDraft`),
  `diffEtablissement` (nom, visibilité, logo, responsables ; dernier responsable) et les
  phrases (`summaryOf`, `visibilityWarning`).
- `tests/etablissement-save.test.mjs` — `readEtablissement` et `saveEtablissement` avec le
  faux Grist : droit exigé, une seule action atomique, conflit sur le nom, la visibilité ou
  le logo, déjà appliqué, ligne d'`ACL` d'administrateur conservée, adresse reprise ou
  créée, au moins un responsable (aussi sur la liste relue), envoi du logo puis relecture,
  refus de Grist, fichier orphelin, vérification après écriture, aucune adresse dans
  l'avertissement d'une table `ACL` illisible.
- `tests/upload.test.mjs` — `uploadAttachment` : jeton en écriture demandé à chaque envoi et
  jamais gardé, adresse refusée hors https, requête sans cookie ni adresse de page, délai,
  statuts 401, 403, 413 et autres, réponse illisible, ni jeton ni adresse dans la
  console, consigne de l'appelant (celle du logo, celle de la photo).
- `tests/save-upload.test.mjs` — `uploadThenRecheck` (1.28.5), le temps commun à l'enregistrement d'un
  profil et d'une fiche d'établissement quand un fichier est remplacé : l'envoi d'abord, la relecture
  ensuite ; l'échec de l'envoi devient l'erreur de l'appelant (la phrase d'un `UploadError` telle
  quelle, sinon une phrase de repli et la cause dans la console) ; l'identifiant du fichier resté dans
  Grist quand la relecture refuse l'écriture. Sans navigateur.
- `tests/image-prep.test.mjs` — `megabytes`, `imageFaultMessage` (la phrase d'une `ImageError` telle quelle,
  sinon « illisible » et la cause dans la console), `checkImageFile`, `fitWithin`, `squareCrop` et les refus de
  `prepareImage` avant lecture : formats, poids et fichier vide refusés, plus grand côté ramené
  à 480 px au plus, SVG agrandi ; pour une photo, carré découpé au centre sans agrandir, 256 px au plus,
  JPEG demandé, SVG refusé. Le dessin lui-même et le PNG ou le JPEG produit s'essaient dans Chromium
  (`tests/e2e-etablissement.test.mjs` pour un logo, `tests/e2e-avatar.test.mjs` pour une photo).
- `tests/avatar-ui.test.mjs` — `photoSource` : l'identifiant d'une pièce jointe de Grist ou une
  adresse `blob:` fabriquée par le navigateur sont les seules sources d'une photo ; toute autre
  adresse, tout autre type et toute forme vide donnent « pas de photo ».
- `tests/branding.test.mjs` — `buildBranding` (fondateurs validés du bandeau du bas dans
  l'ordre, logo de chaque établissement), `logoForContact`, `logoSize` (bandeau du bas), les
  deux images fixes des financeurs et le branchement sur `loadDirectory` (qui ne lit plus de
  table `Financeurs`).
- `tests/support/fake-grist.js` — le faux document Grist commun aux tests Node et
  au test navigateur : lectures, `applyUserActions` atomique (ajout, modification,
  suppression, `AddTable` et `RemoveTable` : l'identifiant d'une table déjà prise est
  numéroté, comme le fait Grist), formules déclenchées de la sonde, pannes, écritures
  refusées (par table ou par ligne).
- `tests/support/harness.mjs` — le navigateur et le serveur des tests navigateur : serveur
  statique pour le vrai `index.html`, Chromium, faux Grist injecté dans la page, console des
  pages relue sans qu'une lecture interrompue par la fermeture de la page fasse échouer le
  fichier. Chaque fichier de test en lance sa propre instance (`createHarness()`). La page n'attend
  plus l'événement `load` quand un test retient ou suspend le téléchargement d'un logo
  (`downloadHold`, `downloadFirst`, `downloadCors`) : depuis la 1.29.0 la première lecture part tout de suite, les
  logos sont demandés avant `load`, et `load` attendrait la réponse qu'on retient exprès. Depuis la 1.29.1, chaque
  ressource que la politique de sécurité de contenu de `index.html` refuse à la page est relevée
  (`logs.cspViolations`) et `withWidget` fait échouer tout scénario dont la page l'enfreint
  (`assertNoCspViolation`) : une ressource refusée ne passe plus inaperçue, ni à la mise en page de
  `tests/support/layout.mjs`, qui passe par le même `runWidget`. Chaque `page.setViewportSize` ne rend
  la main qu'une fois la mise en page posée (`layoutSettled` : la hauteur de la page et le bas de la
  dernière carte ne bougent plus pendant six images) : depuis la 1.29.0 le navigateur ne dessine que les
  cartes proches de l'écran et corrige la hauteur estimée des autres une ou deux images après un
  changement de largeur, ce qui faisait échouer par intermittence deux mesures de
  `tests/branding-layout.test.mjs` (1.29.1).
- `tests/support/browser.mjs` — l'outillage des tests navigateur : ce harnais, et les attentes
  que ces tests partagent (cartes, bandeau, message, focus rendu, sa propre fiche ouverte,
  actions envoyées à `BDD`, ni jeton ni adresse du document dans la console, aucune violation de la
  politique de sécurité de contenu, mise en page posée, pied d'une fenêtre sur une ou deux lignes).
- `tests/support/layout.mjs` — le même harnais avec les barres de défilement (dans Grist elles
  retirent 15 px de large), les largeurs testées et les mesures de cartes de
  `tests/responsive.test.mjs` et `tests/branding-layout.test.mjs`.
- `tests/support/dialog-page.mjs` — les repères des fenêtres de modification d'une fiche et
  d'un établissement (titre, résumé, avis, ouverte ou fermée), la tabulation qui reste dans la
  fenêtre, les contrôles sans nom et la mise en page (`dialogFit`), pour
  `tests/e2e-profile.test.mjs`, `tests/e2e-avatar.test.mjs` et `tests/e2e-etablissement.test.mjs`.
- `tests/support/grouped-menu.mjs` — les aides communes aux tests des menus rangés par
  groupe (Compétences par domaine, Tâches par action) : groupe, case, flèche,
  nombres, éléments visibles, et le parcours au clavier (`assertKeyboardWalk`).
- `tests/support/fiction.mjs` — le contrôle que le jeu de données d'un test ne contient que des
  coordonnées inventées (`assertFictionalContacts`).
- `tests/support/logs.mjs` — une console muette ou relue (`quiet`, `logged`) pour les tests qui
  passent un `log` aux fonctions du widget.
- `tests/support/multipart.mjs` — la lecture d'un fichier envoyé en `multipart/form-data`
  (`readMultipartFile`), commune aux faux serveurs de pièces jointes, au serveur REST des
  tests et au serveur de démonstration.
- `tests/support/widget-sources.mjs` — le code du widget tel que les tests de garde le lisent
  (`WIDGET_SOURCES` : les modules à la racine, `withoutComments` : sans leurs commentaires), pour
  `tests/docs.test.mjs` et `tests/csp.test.mjs`.
- `tests/support-helpers.test.mjs` — les aides ci-dessus refusent ce qu'elles doivent refuser :
  chaque cas leur donne une page volontairement fautive (un bouton sans nom, un élément qui
  sort de la fenêtre ou de la carte, une tabulation qui s'échappe, le jeton dans la console, un
  mauvais parcours au clavier, une page qui enfreint sa politique de sécurité de contenu, relevée
  par `assertNoCspViolation` comme par `withWidget`) et attend leur refus.
- `tests/support/fake-attachments.mjs` — les pièces jointes du faux Grist pour les tests
  navigateur : des logos dessinés à la demande (proportions variées, un logo très haut,
  une bannière très large, un SVG sans dimensions), un fichier supprimé (404), un
  fichier qui n'est pas une image, des portraits carrés (les fichiers 500 à 599, les mêmes visages
  fictifs que la démonstration), un compte des téléchargements et des jetons employés, et la
  réception des fichiers envoyés (logo d'un établissement, photo de profil) avec leurs refus, leur
  coupure et leur réponse sans en-têtes d'autorisation entre sites.
- `tests/support/grist-rest-server.mjs` — un vrai serveur HTTP qui joue l'API REST de Grist pour l'envoi
  d'un fichier, dans l'ordre des intergiciels de Grist (en-tête `X-Requested-With` exigé d'une requête qui
  écrit avec un jeton, puis CORS) : Chromium y applique lui-même le partage de ressources entre sites
  (`tests/e2e-upload-cors.test.mjs`).
- `tests/support/task-role-tables.mjs` — le document du rôle dans une tâche (`withTaskRoles` : `Taches_role`
  sur les lignes brutes, plusieurs lignes de même libellé corrigé), pour `tests/task-roles.test.mjs` et
  `tests/e2e-task-roles.test.mjs`.
- `tests/support/contrast.mjs` — le rapport de contraste WCAG (`contrastRatio`, `parseColor`) à
  partir des couleurs calculées par le navigateur, pour les tests d'accessibilité.
- `tests/support/card-metrics.mjs` — la taille du texte et des cibles des cartes sur la page rendue
  (`measureCards` : texte sous 12px, pastilles ou boutons sous 24px de haut, petites cibles trop près
  d'une autre), pour `tests/responsive.test.mjs` et `tests/accessibility.test.mjs`.
- `tests/constants.test.mjs` — cohérence de la taxonomie (`constants.js`),
  table principale `BDD`, libellé corrigé avant le libellé brut.
- `tests/rules.test.mjs` — règle du projet : aucun fichier de code ne lit la
  colonne `nom_de_domaine`.
- `tests/docs.test.mjs` — la documentation ne se périme pas : liens, ancres et images de
  `README.md` et de `docs/`, fichiers et fonctions cités, jeu de données fictif et serveur de
  démonstration, phrases du guide utilisateur, schéma des imports, préfixes de la console et
  affirmations de la page de sécurité qui doivent suivre le code (méthodes de l'API Grist, une
  seule requête réseau et ses protections, aucun stockage). Sans navigateur.
- `tests/license.test.mjs` — la licence : `LICENSE` est le texte officiel de la GNU GPL version 3
  (empreinte vérifiée), le README la déclare et renvoie vers `LICENSE`, `SECURITY.md` dit où
  signaler un problème sans issue publique ni adresse personnelle. Sans navigateur.
- `tests/index-html.test.mjs` — la page `index.html` (1.29.0) : la liste de ses
  `<link rel="modulepreload">` est exactement l'ensemble des modules que `main.js` importe, directement
  ou non, chacun une fois (un module oublié revient à l'ancienne attente, un module supprimé est une
  erreur 404) ; le script de la page est `main.js`, en module. Sans navigateur.
- `tests/csp.test.mjs` — la politique de sécurité de contenu de `index.html` (1.29.1), lue telle qu'elle est
  écrite : une seule balise, dans l'en-tête, avant toute ressource ; aucune directive que le navigateur
  ignorerait dans une balise (`frame-ancestors`, `report-uri`) ; tout fermé par défaut, ni joker, ni `http` en
  clair hors de la boucle locale, `'unsafe-inline'` pour les styles seulement ; `script-src` d'accord avec les
  balises `<script>` de la page (changer l'adresse de l'API Grist sans la politique, ou l'inverse, casserait le
  widget) ; ni script, ni gestionnaire d'événement, ni formulaire en ligne dans la page, ni script, cadre,
  formulaire, gestionnaire ou minuterie à texte fabriqués par le code ; et `docs/securite.md` qui recopie la
  politique mot pour mot. Sans navigateur.

Avec Playwright (`npm install --no-save playwright`, puis
`npx playwright install chromium`), `tests/e2e.test.mjs` exécute en plus 75
scénarios dans un vrai navigateur sur les données de `tests/fixtures.mjs`
(structure `BDD`) : nombre de contacts et badge établissement de chaque carte, cartes triées
par nom (même quand Grist envoie les lignes dans le désordre), interrupteurs
Fondateurs/Partenaires (dont la liste du menu Établissement, qui les suit), recherche (« prénom nom » dans les deux sens, noms composés, tirets,
apostrophe, œ), attente de la frappe (une seule mise à jour pour quatre lettres tapées d'un coup,
champ vidé sans attendre, « Réinitialiser » qui annule l'attente), filtres et compteurs (dont le filtre Rôle PUI), menu Compétences rangé par
domaine (case de domaine, détail replié, case partielle, recherche à deux niveaux,
ouverture réordonnée, badge, accessibilité), texte HTML affiché
sans injection, lien mailto, pannes de lecture (bandeau, cartes conservées), et le
bandeau « Ma présence » (personne identifiée ou non, table-sonde absente puis créée par le
widget, ou création refusée, compte Lecteur, interrupteur,
double clic, focus gardé pendant et après l'écriture, réussite annoncée puis effacée,
écriture refusée, personne sans fiche, qui voit alors une mention sans interrupteur), et le
banc d'essai lui-même (une lecture de la console interrompue par la
fermeture de la page ne laisse aucun rejet non traité).
`CHROMIUM_PATH` désigne un Chromium déjà installé. Sans Playwright, ces
scénarios sont ignorés.

`tests/e2e-taches.test.mjs` y ajoute 25 scénarios sur le menu Tâches rangé par action,
sur des tâches et des actions numérotées (`withTaskActions` dans `tests/fixtures.mjs`) :
huit boutons seulement, le filtre Actions inchangé, actions repliées avec « Sans action »
en dernier, case d'action et case partielle, OU dans le menu et ET avec les autres
filtres, nombres de cartes, recherche d'une action, d'une tâche ou d'un numéro, tag de
carte, Réinitialiser, données qui changent dans Grist, menu à plat sans numéros (console
et sans bandeau), clavier, et le formulaire de modification de fiche, qui range lui aussi
les tâches par action.

`tests/e2e-task-roles.test.mjs` y ajoute 5 scénarios sur le rôle dans une tâche (`withTaskRoles` dans
`tests/support/task-role-tables.mjs`) : le rôle écrit dans l'étiquette et lu avec la tâche, la bulle à la souris
(au-dessus, dans le cadre, refermée en la quittant), au clavier (Échap, cartes redessinées) et, sur un écran
tactile émulé, le rôle sous le nom de la tâche sans bulle ; une tâche qui s'appelle « constructor » s'écrit
comme les autres, sans rôle ni erreur.

`tests/e2e-cards.test.mjs` y ajoute 9 scénarios sur les cartes à grande échelle (1.29.0), avec 64 fiches
(`withClones` dans `tests/fixtures.mjs`) : les cartes gardées d'un dessin à l'autre (une recherche puis son
effacement rendent les mêmes éléments dans le même ordre ; un filtre, l'interrupteur « Partenaires » et
« Réinitialiser » réutilisent aussi les cartes), une relecture de Grist qui reconstruit toutes les cartes et
montre la donnée nouvelle, le mode admin qui ne reconstruit que les cartes dont les droits changent, une
identité qui arrive après les cartes (écriture lente de la sonde) et leur ajoute le bouton « ✎ Modifier » sous
le logo, sans toucher aux cartes d'un autre établissement, le contrat de `renderCards` (chacun des six
ingrédients d'une carte, un seul à la fois, la fait reconstruire, et rien d'autre), une rafale de cinq éditions
dans Grist qui ne provoque qu'une relecture de `BDD`, 250 ms après la dernière, les cartes éloignées de l'écran
que le navigateur ne dessine pas (`content-visibility`) et la tabulation, qui passe par chaque carte, celles que
le navigateur n'avait pas encore dessinées comprises.

`tests/e2e-csp.test.mjs` y ajoute 16 scénarios sur la politique de sécurité de contenu (1.29.1), joués dans la
vraie page : 14 tentatives que la politique doit refuser, chacune signalée par le navigateur (événement
`securitypolicyviolation`) sans que rien ne s'exécute ni que la page ne quitte le widget (script et gestionnaire
d'événement en ligne, adresse `javascript:`, script ou feuille de style d'un autre site, image ou requête en `http`
vers un autre site, cadre, objet, police, média, travailleur, balise `<base>`, formulaire), un scénario de
ce qu'elle doit laisser passer (images et requêtes en `https`, aperçus `data:` et `blob:`, boucle locale) et un
dernier où le widget se charge dans un cadre sandbox sans `allow-same-origin` (origine opaque, comme Grist peut
l'encadrer) : `'self'` doit y laisser charger les fichiers du dépôt.

`tests/e2e-profile.test.mjs` y ajoute 68 scénarios sur la modification et la création d'une fiche : qui
voit un bouton « Modifier » (personne ordinaire, administrateur avec ou sans mode admin,
compte Lecteur, anonyme, adresse inconnue, doublon), le formulaire et ses refus, la
relecture (carte avant et carte après, ce qui change repéré, rien d'écrit), l'écriture
en une seule action, le mode admin (bouton à bascule, clavier, focus, annuaire relu),
l'e-mail et l'établissement d'une autre personne (champs, refus, adresse prise, fiche
retirée de l'annuaire), le message de confirmation et ses délais (horloge du navigateur),
la fenêtre qui reste ouverte quand Grist n'a pas tout gardé, le téléphone numérique ou
texte, un refus de Grist, un changement concurrent, une fiche supprimée, le double clic,
Échap, un prénom piégé, le focus, la tabulation dans la fenêtre, le bouton « Modifier »
rangé sous la fonction, le bandeau « Ma présence » qui ne se chevauche à aucune largeur, dont le
texte garde 200px de 320 à 840px (sept comptes, un mot sans coupure, le bloc des boutons vide caché)
et l'affichage de 280 à 360px. Cinq d'entre eux sont ceux de « Créer ma fiche » (une personne sans fiche
remplit la fenêtre, relit une seule carte et publie : une seule ligne ajoutée à `BDD`, ni périmètre ni photo ;
la case « Apparaître dans l'annuaire » décochée), de la liste déroulante des établissements (recherche en
direct, flèches, Entrée, Échap, écran tactile) et de l'e-mail affiché (`email_affiche`).

`tests/e2e-etablissement.test.mjs` y ajoute 50 scénarios sur la fiche d'un établissement :
qui voit « ✎ Modifier » sous un logo et « Mon établissement » (responsable, administrateur non
responsable, compte Lecteur, anonyme, plusieurs établissements, établissement masqué, bouton forcé à
la main), le contenu de
la fenêtre face à la maquette v5, l'enregistrement du nom, de la visibilité, du logo (PNG, JPG, WebP,
SVG piégé redessiné en PNG, retrait) et des responsables (nommer, retirer, rétablir, dernier
responsable, retrait de soi-même, adresse dont la fiche est masquée), les refus avant envoi (dont les
dimensions démesurées et le poids d'un PNG redessiné) et les pannes de l'envoi (droits, taille,
serveur, réponse illisible, jeton refusé), le fichier resté sans servir, le refus de Grist, le conflit
pendant que la fenêtre est ouverte, Échap, le double clic, le clavier et les noms accessibles, la
mise en page de 320 à 1280px et l'absence de tout appel réseau autre que l'API simulée.

`tests/e2e-avatar.test.mjs` y ajoute 37 scénarios sur la photo de profil, avec des portraits servis par
`tests/support/fake-attachments.mjs` : la photo à la place des initiales sur les cartes, dans le bandeau « Ma
présence » et dans la liste des responsables (initiales sans photo, avec un fichier supprimé ou illisible, ou
sans colonne `Avatar`), l'agrandissement au clic, à Entrée et à Espace et sa fermeture par chaque geste, la
carte « Photo de profil » du formulaire, le choix d'un fichier (recadrage en carré de 256 px en JPEG, photo de
téléphone remise à l'endroit et sans position GPS, JPG, WebP, PNG transparent posé sur du blanc, refus avant
tout envoi), l'attente pendant la préparation de l'image (préparation ralentie : un second choix, le retrait et
« Relire » ne font rien, fermer la fenêtre abandonne la photo sans erreur), la relecture (anneau, pastille,
miniatures, une photo qui ne se charge pas faute de jeton), le retrait, l'ajout par une administratrice, les
pannes de l'envoi (refus, jeton, réponse sans en-têtes d'autorisation entre sites), le fichier resté sans
servir, le conflit pendant l'envoi, l'abandon d'une photo choisie, « Créer ma fiche » sans carte photo, les cadres de 280 à 390px (dont la fenêtre
qui agrandit la photo, sans blanc sous la légende) et les noms accessibles.

`tests/responsive.test.mjs` y ajoute 23 scénarios (et 1 test sans navigateur : le jeu de
données de la mise en page ne contient que des coordonnées fictives) sur la mise en page, de 280 à
1920px de large, sur un jeu de données chargé (`tests/fixtures-responsive.mjs` :
noms, e-mails, fonctions et tags très longs, dont certains sans point de
coupure) : aucun défilement horizontal, texte contenu dans les cartes, nom
jamais sous le badge de l'établissement, trois, deux puis une colonne, barre
d'outils, menus de filtres (les menus Compétences et Tâches dépliés compris) entièrement
dans le cadre, cibles tactiles (écran
tactile émulé), taille du texte des cartes (12px au moins à toute largeur, souris ou doigt), pastilles de
24px de haut et petites cibles isolées (WCAG 2.5.8), bandeau d'erreur et état vide à 320px, et
mise en page de référence à partir de 1400px. Les barres de défilement y sont
visibles (15px de moins), le cas le plus serré.

`tests/branding-e2e.test.mjs` y ajoute 35 scénarios sur l'habillage, avec des logos servis par
`tests/support/fake-attachments.mjs` : logo seul sur les cartes, pastille texte quand il manque,
clic et clavier, jeton demandé une seule fois et en lecture seule, financeurs (deux images fixes : une
table `Financeurs` restée dans le document ne change rien), bandeau des fondateurs dans l'ordre, rond
« France 2030 », jeton refusé ou méthode absente, fichier supprimé ou illisible, lecture des pixels sur une
adresse à part qui ne décide jamais de l'affichage (un Grist qui refuse CORS ou ne répond pas laisse les
logos s'afficher), console qui dit la version et ce que Grist donne des logos, avec le remède quand il les
refuse (1.28.2), aucune trace du jeton dans la console, relecture d'une fiche.
`tests/branding-layout.test.mjs` y ajoute 19 scénarios sur la mise en page de l'habillage, de
320 à 1920px : en-tête (titre, financeurs, profil), logos de formes variées dans leur case et à la même
surface visuelle (marges transparentes retirées), rôle PUI à droite de la ligne de l'e-mail, bandeau du
bas qui se replie, rien qui dépasse du cadre.

`tests/logos-preload-e2e.test.mjs` y ajoute 8 scénarios sur le chargement des logos, avec un Grist
capricieux servi par `tests/support/fake-attachments.mjs` (réponses retenues puis libérées, première demande
annulée ou sans réponse) : l'annuaire redessiné pendant que Grist tarde ne retire aucune image de logo en
cours de chargement et chaque logo n'est demandé qu'une fois (1.28.1), un logo dont la première demande est
perdue s'affiche quand même, une image muette laisse la place au sigle après huit secondes, un fichier
supprimé n'est pas redemandé sans fin, la ligne `[LOGOS] Bilan` de la console (information, ou
avertissement qui compte les refus) et la version écrite en bas de la page.

`tests/e2e-upload-cors.test.mjs` y ajoute 2 scénarios sur l'envoi d'une photo à un vrai serveur HTTP d'une
autre origine (`tests/support/grist-rest-server.mjs`), dans l'ordre des intergiciels de Grist et avec le CORS
que Chromium applique lui-même : l'envoi aboutit avec l'en-tête `X-Requested-With` (1.21.5) ; sans lui, la même
requête échoue comme la panne signalée le 13 octobre 2026 (401 sans en-têtes CORS, donc une simple panne de
réseau pour la page).
`tests/accessibility.test.mjs` y ajoute 11 scénarios (et 8 tests sans navigateur : les rapports de
contraste de référence, une garde sur les feuilles de style qui refuse tout `outline: 0` ou
`outline: none` non justifié, le contraste de chaque couleur de catégorie et du lien e-mail, et celui de la
piste et du curseur de l'interrupteur de présence, et la case à cocher dessinée par la feuille de style :
thème clair imposé, fond blanc, bordure à 3:1, le gris des textes secondaires à 4,5:1 sur chacun des fonds clairs où
il se pose, et une garde sur `index.html` : aucun `aria-label` sur un élément sans rôle) sur le clavier, le lecteur d'écran et les couleurs : le
champ de recherche nommé par son rôle, aucun contrôle sans nom dans l'arbre d'accessibilité (page au repos,
menu ouvert), le parcours complet à la tabulation (page, puis menu ouvert) où chaque arrêt change de capture
avec et sans focus, avec un anneau plein de 2 px au moins et de 3:1 au moins, les pastilles, les titres de
groupe et le lien e-mail d'une carte mesurés sur la page rendue (4,5:1 au moins), la piste et le curseur
de l'interrupteur (3:1 au moins, en contraste forcé et sans transition quand on réduit les animations), et,
sur la carte de la personne connectée, « Votre fiche » et les boutons « Modifier » (le sien et celui de son
établissement) à 12px, ces boutons à 24px de haut et le lien e-mail à l'écart d'eux. Sur la page rendue, une case de filtre
vide reste blanche à bordure visible même avec le thème sombre du téléphone et prend le violet une fois
cochée, et ce qu'on tape dans la recherche (comme son texte d'invite) reste lisible quand le navigateur
passe en sombre (Firefox mobile, 1.21.2 et 1.21.3).

Limite assumée : l'API Grist y est simulée (`tests/support/fake-grist.js` :
`docApi.fetchTable` sur des données aux encodages observés en production, et des
écritures dont la formule déclenchée de la sonde est reproduite, pas exécutée par
Grist). Le test garantit que le vrai
`main.js`/`render.js` réagissent correctement à ces encodages et à ces pannes ;
il ne garantit pas que Grist envoie toujours ces formes — d'où le protocole
manuel ci-dessous, à jouer dans un vrai document avant déploiement. Ce que Grist accepte d'écrire ou de
lire ne l'est pas davantage : la ligne d'une fiche créée par une personne ordinaire et la table-sonde que
crée le widget (sections 11 et 19), la colonne `Taches_role` (section 20), l'envoi d'un logo ou d'une
photo (sections 17 et 18), l'affichage des logos (section 14) et la politique de sécurité de contenu, dont le Grist
simulé ne demande rien qu'elle refuse (section 22).

Si vous ajoutez une fonction à `grist-data.js` ou `filters.js` : ajoutez son
test dans le fichier de `tests/` qui correspond à son rôle (liste ci-dessus).
Si vous changez l'affichage, ajoutez ou adaptez un scénario de
`tests/e2e.test.mjs` — n'attendez pas une revue ultérieure. Si vous changez la
mise en page (`style.css`), faites de même dans `tests/responsive.test.mjs`.

## Préparation

1. `npx serve .` ou `python3 -m http.server 8080` à la racine du dépôt (les
   modules ES ne se chargent pas via `file://`).
2. Dans Grist, ouvrir le document contenant la table `BDD`, ajouter (ou
   pointer temporairement) un widget custom vers `http://localhost:8080`.
3. Ouvrir la console navigateur (F12) — la garder ouverte tout le protocole :
   plusieurs points ci-dessous s'appuient sur l'absence d'erreur/warning
   inattendu, et sur les diagnostics `[GRIST]`/`[REFS]`/`[ETABLISSEMENT]`.
4. Avoir sous la main un contact de test dont vous pouvez modifier les
   champs sans impacter de vraies données (ou travailler sur une copie du
   document).

## 1. Chargement initial

- [ ] Aucune erreur dans la console au chargement.
- [ ] `[GRIST] Enregistrements reçus: N` correspond au nombre de lignes de
      `BDD`, et le nombre de cartes affichées (`#resultCount`) est
      inférieur ou égal à N (les personnes qui n'ont pas accepté d'apparaître, ou dont
      l'établissement n'est pas validé, fondateur ou partenaire, ne s'affichent pas ;
      `perimetre` ne compte plus depuis la 1.27.0).
- [ ] Les 8 boutons de filtre (Actions, Tâches, Communautés, GT, Compétences,
      Instances, Établissement, Rôle PUI) sont présents dans la barre d'outils. Il n'y a
      pas de bouton « Domaines » : les domaines sont dans le menu Compétences.
- [ ] Sur une carte avec toutes les infos renseignées : initiales correctes
      dans l'avatar, nom + prénom, fonction visible, logo (ou pastille)
      de l'établissement en haut à droite, email en lien `mailto:`, téléphone visible.
- [ ] Sur une carte avec des infos manquantes (pas de fonction / pas
      d'email / pas de téléphone) : les lignes correspondantes sont
      absentes, pas affichées vides.

## 2. Recherche libre

- [ ] Taper un nom existant (ex. 3 premières lettres) → seuls les contacts
      correspondants restent, une fraction de seconde après la dernière lettre.
- [ ] Recherche sur le prénom, pas seulement le nom.
- [ ] **Prénom et nom ensemble** (1.16.1) : taper « prénom nom » d'une personne réelle
      → sa carte ; le même couple dans l'autre ordre (« nom prénom ») → la même carte ;
      quelques lettres de chacun (« pré nom ») → la même carte ; le prénom d'une personne
      et le nom d'une autre → aucun résultat.
- [ ] **Écritures tolérées** (1.16.1) : pour un nom composé réel (« Marie-Christine »),
      taper la même chose avec une espace au lieu du tiret → la carte ; pour un nom avec
      apostrophe (« D'Arcy »), taper sans apostrophe → la carte. À défaut de tels noms dans
      le document, le contrôle se fait sur la copie de démonstration.
- [ ] **Cartes triées** (1.16.1) : sans filtre, les cartes se lisent de A à Z par nom de
      famille (puis prénom) ; ajouter un contact dans Grist, au bout de la table, le place
      à sa lettre dans les secondes qui suivent, sans recharger la page.
- [ ] **Frappe rapide** : taper six lettres d'un coup → la liste ne scintille pas et ne
      s'affiche qu'à la fin de la frappe ; effacer le champ (Échap ou croix) → toutes les
      cartes reviennent tout de suite ; cliquer « Réinitialiser » juste après avoir tapé →
      le champ est vide et toutes les cartes sont là, rien ne se refiltre ensuite.
- [ ] Recherche insensible à la casse (`DUPONT` = `dupont`).
- [ ] **Recherche insensible aux accents** (ex. taper `ecole` doit matcher un
      nom contenant `École`, si un tel contact existe — sinon vérifier sur
      n'importe quel nom accentué du jeu de données réel) — comportement
      nouveau en 1.4.0, strictement plus permissif qu'avant.
- [ ] Recherche vide → tous les contacts affichés réapparaissent.
- [ ] Recherche sans aucun résultat → état vide (`#emptyState`) affiché,
      grille de cartes vide.

## 3. Chaque filtre, seul

Pour chacun des 8 filtres (Actions, Tâches, Communautés, GT, Compétences,
Instances, Établissement, Rôle PUI) :

- [ ] Ouvrir le menu (clic sur le bouton) → seul ce menu est ouvert (les
      autres se ferment).
- [ ] Cocher une valeur → seuls les contacts ayant cette valeur restent.
- [ ] **La valeur cochée remonte en tête du menu**, les valeurs non cochées
      restant triées alphabétiquement en dessous ; **le bouton du filtre
      affiche un badge avec le nombre de valeurs cochées** (ex. "①").
- [ ] Décocher → le badge disparaît (0 = pas de badge), la valeur reprend sa
      place alphabétique parmi les non cochées.
- [ ] Cocher deux valeurs du **même** filtre → union (OU) : les contacts
      ayant l'une OU l'autre valeur s'affichent ; les deux valeurs cochées
      sont en tête, triées alphabétiquement entre elles ; badge = 2.
- [ ] Cocher 3 valeurs, puis décocher celle du **milieu** (pas la première ni
      la dernière cochée) → l'ordre des deux valeurs encore cochées ET des
      valeurs redevenues non cochées reste correctement alphabétique dans
      chaque groupe (pas d'ordre "gelé" dans sa position précédente).
- [ ] Champ de recherche en haut du menu : taper du texte → seules les
      options correspondantes restent visibles dans la liste ; ça ne coche
      ni ne décoche rien.
- [ ] Cliquer en dehors du menu → il se ferme.

Spécifique **Établissement** (1.27.3) :

- [ ] Le menu ne liste que les établissements validés (`ok_pour_apparaitre`), fondateurs ou partenaires, dont
      l'interrupteur est allumé : par défaut les fondateurs seuls ; allumer Partenaires ajoute les
      partenaires, éteindre Fondateurs retire les fondateurs. Un établissement « autres » ou non validé n'y
      figure jamais. Une coche dont l'option disparaît (on éteint l'interrupteur) est retirée, et la grille
      suit.

Spécifique **Compétences** (et toutes les catégories issues d'une table de
référence) :

- [ ] Le menu propose un seul libellé par compétence : le libellé corrigé
      (`Competences_corrigees`). Une compétence dont il est vide n'est pas proposée tant
      que la table en remplit au moins un ; une table qui n'en remplit aucun garde les
      libellés bruts. Les compétences d'une carte portent les mêmes libellés que le menu.
- [ ] Cocher une compétence dans le menu garde exactement les contacts dont
      la carte affiche cette compétence.

Spécifique **Compétences par domaine** (compétences macro, colonne
`Macro_competences` de la table `Competences`) : le menu Compétences range ses
valeurs par domaine, sans second bouton.

- [ ] L'infobulle du bouton « Compétences » parle de domaines ; le champ de
      recherche du menu dit « Domaine ou compétence… » en entier, sans être
      coupé.
- [ ] Le menu liste chaque domaine une seule fois (pas de doublon dû à la casse
      ou aux accents), triés alphabétiquement, plus « Autres » **en dernier** s'il
      existe une compétence sans domaine. Les domaines sont repliés ; à droite de
      chacun, le nombre de contacts (pas de compétences) qui ont au moins une
      compétence de ce domaine.
- [ ] La flèche d'un domaine (ou la touche Entrée sur elle) déplie ses
      compétences, triées alphabétiquement, avec leur nombre de contacts ; un
      second clic les replie.
- [ ] Cocher la case d'un domaine coche toutes ses compétences et garde les
      contacts qui ont l'une d'elles. Le badge du bouton affiche 1, quel que
      soit le nombre de compétences. La recocher décoche tout.
- [ ] Déplier un domaine et cocher une seule de ses compétences : la case du
      domaine passe à moitié cochée (un tiret) ; un clic dessus la complète.
      Décocher la dernière compétence décoche le domaine.
- [ ] Tout est un OU : un domaine coché et une compétence d'un **autre** domaine
      cochée montrent les contacts de l'un ou de l'autre ; badge = 2.
- [ ] Les contacts d'un même domaine qui ont deux compétences de ce domaine ne
      sont comptés qu'une fois.
- [ ] Fermer puis rouvrir le menu : les domaines qui contiennent une valeur
      cochée sont en tête, la valeur cochée en tête de son domaine, et un domaine
      coché en partie s'ouvre de lui-même pour montrer lesquelles. Rien ne bouge
      pendant qu'on coche.
- [ ] Recherche du menu : « sante » (sans accent) garde le domaine
      « Santé… » avec **toutes** ses compétences ; le nom d'une compétence seule
      garde cette compétence sous son domaine, sans les autres. Les flèches
      disparaissent et tout est déplié pendant la recherche ; vider le champ
      rétablit l'état précédent. La recherche ne coche rien.
- [ ] Réinitialiser décoche domaines et compétences, vide la recherche du menu
      et le badge disparaît.
- [ ] Cliquer sur une étiquette de compétence d'une carte coche cette
      compétence : sa case est cochée dans son domaine, le domaine passe à moitié
      coché (ou coché si c'est sa seule compétence).
- [ ] Au clavier : Tabulation passe de la case d'un domaine à sa flèche, puis à ses
      compétences si elles sont dépliées ; Espace coche une case ; un lecteur d'écran annonce « Détail
      de <domaine> » et l'état déplié ou replié de la flèche.
- [ ] La console liste, par identifiant de ligne, les compétences que
      `Macro_competences` ne classe pas (`[REFS] Competences : n ligne(s) sans
      regroupement…`) : les classer dans Grist, puis recharger le widget.
- [ ] Sans la colonne `Macro_competences` (essai sur une copie du document) : le
      bandeau « Colonne de libellé introuvable » s'affiche et le menu Compétences
      reste complet, mais à plat, sans domaines.

Spécifique **Tâches par action** : le menu Tâches range ses valeurs par action, sans
second bouton et sans colonne à ajouter dans Grist. Le numéro avant le point du libellé
d'une tâche (« 2.1 … ») est celui de son action, dont le libellé commence par « Action 2 ».
Le menu Tâches fonctionne comme le menu Compétences par domaine (ci-dessus) : reprendre
les mêmes essais en remplaçant domaine par action et compétence par tâche, puis :

- [ ] L'infobulle du bouton « Tâches » parle d'actions ; le champ de recherche du menu
      dit « Action ou tâche… » en entier, sans être coupé.
- [ ] Les actions sont dans l'ordre de leur numéro (« Action 2 » avant « Action 10 »),
      chaque tâche sous l'action dont elle porte le numéro, et les tâches d'une action
      dans l'ordre de leur numéro (« 1.2 » avant « 1.10 »). « Sans action » est **en
      dernier** s'il existe une tâche sans numéro, ou dont le numéro ne correspond à
      aucune action. Une action qui n'a aucune tâche ne figure pas dans le menu.
- [ ] Le filtre **Actions** est inchangé : toujours une liste à plat, qui filtre sur les
      actions inscrites sur les cartes, et qui ne coche pas le menu Tâches (ni
      l'inverse). Les deux se cumulent (ET).
- [ ] Rechercher « 2.1 » (le numéro d'une tâche) garde cette tâche sous son action ;
      « action 2 » garde l'action avec toutes ses tâches.
- [ ] Renuméroter une tâche dans `Taches` (par exemple « 2.1 … » devient « 1.4 … »)
      puis recharger : elle change d'action. Une sélection qui portait l'ancien libellé
      est retirée.
- [ ] La console liste, par identifiant de ligne, les tâches classées sous « Sans
      action » (`[REFS] Taches: n ligne(s) sans regroupement…`) : les numéroter dans
      Grist, puis recharger le widget.
- [ ] Sur une copie du document où **aucune tâche** ne commence par un numéro « n.m »
      (ou aucune action par « Action n »), le menu Tâches reste complet, mais à plat,
      sans actions et sans bandeau ; la console dit pourquoi (`[REFS] Taches: aucune
      ligne n'est rattachée à une action…`).
- [ ] Dans la fenêtre « Modifier mon profil », la liste des tâches est rangée par action
      elle aussi, et celle des actions reste à plat.

## 4. Filtres combinés

- [ ] Deux filtres de catégories différentes cochés (ex. une Instance +
      un Établissement) → intersection (ET) : seuls les contacts qui
      correspondent aux deux restent.
- [ ] Recherche libre + un filtre catégorie en même temps → les deux
      s'appliquent ensemble.
- [ ] Les 8 filtres cochés simultanément (au moins une valeur chacun) →
      résultat cohérent (potentiellement vide, mais sans erreur console).

## 5. Interactions carte → filtre

- [ ] Cliquer sur le badge établissement d'une carte → le filtre
      Établissement se coche sur cette valeur, la grille se filtre en
      conséquence.
- [ ] Cliquer sur un tag Instances/Actions/GT/Compétences/Communautés/Tâches
      d'une carte → le filtre correspondant se coche, curseur "main" au
      survol de ces tags.
- [ ] **Après un clic sur un tag/badge de carte** (pas dans le menu) : ouvrir
      le menu du filtre concerné → la valeur cliquée est bien en tête, sa
      case est bien cochée (pas seulement mise en évidence visuellement), et
      le badge de comptage sur le bouton du filtre est à jour — même
      résultat qu'en cochant la case directement dans le menu.
- [ ] **Le rôle PUI d'une carte (du texte violet, comme la fonction, à droite de la ligne de l'e-mail) est cliquable** (1.24.0, 1.27.1) :
      curseur "main" au survol, le rôle souligné ; un clic coche la valeur
      dans le filtre « Rôle PUI » et la grille se filtre ; un second clic la
      décoche. Il reste sur la ligne de l'e-mail à toute largeur, sans la
      faire passer à la ligne ni agrandir la carte : un rôle long
      (« Référent innovation et valorisation ») est coupé par « … » et le
      rôle entier s'affiche au survol ; il disparaît quand l'e-mail prend
      presque toute la ligne (téléphone étroit, e-mail très long).

## 6. Bouton Réinitialiser

- [ ] Avec une recherche + plusieurs filtres actifs (dont du texte tapé
      dans un champ de recherche interne à un menu) → cliquer
      "Réinitialiser" vide la recherche, décoche tous les filtres, **vide
      aussi les champs de recherche internes aux menus** (pas seulement les
      cases), et réaffiche tous les contacts affichés.

## 7. Scénarios de non-régression spécifiques à la 1.4.0

Ces scénarios ciblent chacun un bug corrigé qui n'est pas (ou pas
entièrement) couvert par `node --test`, parce qu'il implique `main.js`/
`render.js` ou un comportement en conditions réelles Grist :

- [ ] **Téléphone** : repérer un contact dont le téléphone commence par 0
      dans Grist (la quasi-totalité) → la carte affiche bien le 0 initial,
      formaté par paires (`05 56 78 90 12`), pas un nombre à 9 chiffres.
- [ ] **Rôle PUI** : un contact avec `Role_dans_le_PUI` renseigné affiche
      bien son rôle en petite pastille (à droite de la fonction et de l'e-mail sur
      une carte de 480 px ou plus, sous l'e-mail sur une carte plus étroite), et le menu
      du filtre « Rôle PUI » liste les valeurs de la table `Role_Dans_le_PUI`.
- [ ] **Renommage de libellé** : dans Grist, cocher un filtre (ex.
      Établissement sur une valeur), puis renommer cette valeur dans la
      table de référence correspondante (ex. `Etablissements.acronyme`).
      Revenir sur le widget : la sélection périmée doit avoir disparu
      d'elle-même (pas de grille bloquée à 0 résultat sans explication), et
      le nouveau libellé doit être proposé dans le menu. *Remettre le
      libellé d'origine après le test.*
- [ ] **Édition pendant un menu ouvert** : ouvrir un menu de filtre (ex.
      Instances), taper du texte dans sa recherche interne, puis éditer un
      champ **sans rapport** sur un autre contact directement dans Grist
      (ex. son numéro de téléphone). Revenir sur le widget : le menu ouvert
      ne doit **pas** se fermer ni perdre le texte tapé (peut prendre
      jusqu'à ~250 ms après l'édition pour se stabiliser — c'est le délai du
      debounce, normal).
- [ ] **Éditions rapprochées** : modifier 2-3 contacts différents coup sur
      coup dans Grist (en quelques secondes) → revenir sur le widget,
      vérifier que les cartes reflètent bien l'état **final** de tous les
      contacts modifiés (pas un état intermédiaire ou partiel).
- [ ] **Référence vide ou orpheline** : si un contact a une `Etablissement`
      vide ou qui ne résout à aucune ligne d'`Etablissements`, la console doit
      afficher un `[ETABLISSEMENT] ... sans Etablissement` listant
      l'identifiant de ligne de ce contact (pas son email) — et il n'apparaît
      pas dans la grille (aucun indicateur d'établissement à faire valoir), ni
      aucun tag portant un id numérique brut.

## 8. Cas limites de données

- [ ] Contact sans aucune valeur dans les 7 catégories de tags → carte
      affichée sans section `card-tags` visible (pas de section vide).
- [ ] Contact avec `perimetre` vide, mais qui a accepté d'apparaître et dont l'établissement
      est validé (fondateur ou partenaire) → présent dans la grille et dans le compte
      `#resultCount`, sans erreur ni étiquette vide (1.27.0 : le périmètre ne décide plus de rien).
- [ ] Contact dont `Accepte_apparaitre` est décoché ou vide → absent de la
      grille, sans bandeau. Le cocher dans Grist puis recharger le widget : la
      carte apparaît. La console indique `[CONSENTEMENT] n/m …` (nombre
      seulement, aucun nom).
- [ ] Contact sans `nom` ni `prenom` → absent de la grille (filtré par
      `buildContacts()`).
- [ ] Établissement dont l'acronyme est vide (seul `nom_complet` renseigné) →
      badge affiché avec le nom complet.
- [ ] Deux lignes d'`Etablissements` de même acronyme → chaque contact garde
      le statut de la ligne à laquelle il est rattaché.

## 9. Vérifications techniques

- [ ] Panneau d'accès du widget dans Grist : niveau réellement accordé =
      `full` (cohérent avec `manifest.yml` et `window.grist.ready(...)`).
- [ ] Aucune erreur réseau (onglet Réseau des DevTools) sur les appels
      `fetchTable` des 8 tables de référence.
- [ ] Redimensionner/recharger le widget plusieurs fois de suite → pas
      d'accumulation d'erreurs ni de comportement différent au 2e/3e
      chargement (sanity check sur le `debounce`/`sequencer`).

## 10. Bandeau d'état (1.7.1)

À jouer sur une **copie** du document, jamais sur le document de production :

- [ ] Chargement normal : aucun bandeau rouge sous la barre d'outils.
- [ ] Renommer temporairement la table `Etablissements`, recharger le widget :
      bandeau « Impossible de charger l'annuaire depuis Grist (table
      « Etablissements » illisible) », compteur « Chargement impossible ». Une
      fois la table remise sous son nom, recharger : le bandeau disparaît.
- [ ] Renommer temporairement la table `Actions`, recharger : les cartes
      restent affichées et le bandeau signale « Tables illisibles (Actions) ».
- [ ] Renommer temporairement la colonne `ok_pour_apparaitre` d'`Etablissements`,
      recharger : bandeau d'erreur qui nomme la colonne (« colonne
      « ok_pour_apparaitre » absente de la table Etablissements »), pas un
      annuaire vide. Remettre son nom ensuite.
- [ ] Décocher `Accepte_apparaitre` pour tout le monde, recharger : bandeau
      « Personne n'a accepté d'apparaître… » et aucune carte. Renommer
      temporairement la colonne : bandeau d'erreur qui la nomme, aucune carte.
- [ ] Après modification de `ok_pour_apparaitre` dans `Etablissements`,
      **recharger le widget** (Grist ne le prévient pas, voir README « Limites
      connues ») puis vérifier le nombre de contacts et le badge de chaque carte.

## 11. Ma présence (1.11.0)

Réglages d'abord : `GRIST_SETUP.md` (colonne de données, table `Annuaire_Sonde`, que le widget crée
lui-même depuis la 1.20.0 quand elle manque, case `admin`). À jouer sur une **copie** du document,
console du navigateur ouverte.

- [ ] Sans la table `Annuaire_Sonde` : depuis la 1.20.0, le widget la crée lui-même quand le compte qui
      l'ouvre peut modifier la structure du document (section 19, « La table-sonde créée par le widget »).
      Si Grist le refuse à ce compte : aucun bandeau « Ma présence », l'annuaire s'affiche comme avant,
      la console dit `[IDENTITE] table « Annuaire_Sonde » introuvable, et Grist n'a pas permis de la créer :
      … (voir GRIST_SETUP.md)`, et rien n'est écrit.
- [ ] Avec la table, un compte qui peut modifier le document et dont l'adresse est
      dans `BDD.email` : le bandeau apparaît à droite de l'en-tête avec son nom et
      sa situation ; la console dit `[IDENTITE] personne identifiée (administrateur :
      oui|non, responsable de N établissement(s))` sans aucune adresse ; la table `Annuaire_Sonde` est vide.
- [ ] Administrateur : le compte dont l'adresse est dans `ACL` avec `admin` coché
      est « administrateur : oui », un autre « non » (même avec une adresse écrite en
      majuscules dans `ACL`).
- [ ] Interrupteur : le décocher retire la carte de la personne et décoche
      `Accepte_apparaitre` dans Grist ; le recocher la fait revenir. Il n'écrit que
      cette case, sur la ligne de la personne.
- [ ] Compte **Lecteur** : pas de bandeau, aucune ligne ajoutée à `Annuaire_Sonde` ; la console dit
      `[IDENTITE] Grist a ouvert le widget en lecture seule…` (même ligne dans « Voir en tant que » si Grist
      y ouvre le widget en lecture seule ; sinon, la ligne `[IDENTITE] lecture impossible : …` donne le refus).
- [ ] Les deux règles d'`Annuaire_Sonde` de `GRIST_SETUP.md` (étape 4) posées, avec un compte qui peut
      modifier le document : la console dit toujours `[IDENTITE] personne identifiée…`, le bandeau et le
      bouton « Modifier » sont là, la table reste vide. Depuis la console d'un compte ordinaire,
      modifier une ligne d'`Annuaire_Sonde` (en créer une, puis changer son `Email`) est refusé, et lire
      la ligne d'un autre compte ne renvoie rien.
- [ ] **La ligne de la sonde est supprimée avant que le bandeau s'affiche (1.21.7).** Les deux règles
      posées : la table est déjà vide quand le bandeau apparaît. Retirer à ce compte le droit de
      **supprimer** (règle 1) puis recharger : la personne est identifiée quand même, la console dit
      `[IDENTITE] la ligne N de Annuaire_Sonde n'a pas pu être supprimée : …` avec la raison de Grist
      (jamais une adresse) et la table garde la ligne. Remettre le droit puis recharger : la ligne laissée
      plus tôt à l'adresse de ce compte est supprimée aussi (`ancienne(s) ligne(s) … supprimées`), jamais
      celle d'un autre compte.
- [ ] Compte connecté dont l'adresse n'est pas dans `BDD` : un bandeau « Compte
      absent de l'annuaire » sans interrupteur, avec un seul bouton « Créer ma fiche » (section 19) ;
      la console l'explique sans citer d'adresse.
- [ ] Règle d'accès qui refuse la modification de `BDD` pour ce compte : l'interrupteur
      affiche « Grist a refusé la modification… » et reste dans son état réel.
- [ ] Deux comptes dans deux navigateurs, widgets ouverts en même temps : chacun voit
      son propre nom.
- [ ] Établissement non validé : la personne qui a accepté voit pourquoi sa fiche
      reste masquée.

## 12. Largeur du cadre (1.9.1)

Les tests automatisés couvrent Chromium (écran tactile émulé compris). À jouer
dans un vrai document Grist, y compris sur un téléphone ou une tablette (Safari
iOS, Chrome Android) que les tests ne couvrent pas :

- [ ] Largeur d'au moins 1400px : une seule rangée dans la barre d'outils
      (recherche, filtres, interrupteurs), trois colonnes de cartes, comme avant
      la 1.9.1.
- [ ] Réduire la section du widget (poignée entre deux sections de Grist) sous
      1400px : la recherche, les interrupteurs et « Réinitialiser » passent sur
      une première rangée, les filtres sur la largeur dessous.
- [ ] Sous 840px : deux colonnes de cartes. Sous 600px : une colonne, la
      recherche, puis les filtres étirés, puis les interrupteurs.
- [ ] À 320px (ou le panneau le plus étroit possible) : aucune barre de
      défilement horizontale, ni dans le widget ni sur la page Grist.
- [ ] Dans un cadre étroit, ouvrir chaque menu de filtre, y compris le dernier
      de la rangée : il reste entièrement visible, sans être coupé à droite, et
      se referme d'un clic ailleurs. Élargir le cadre puis le rouvrir : il
      s'ouvre de nouveau sous son bouton.
- [ ] Menu Compétences ouvert et un domaine déplié, dans le cadre le plus étroit
      (et de même le menu Tâches avec une action dépliée) : aucune barre de
      défilement horizontale, un nom de compétence, de tâche ou d'action très
      long passe à la ligne (il ne déborde ni du menu ni de la page), la flèche et
      le nombre de chaque domaine ou action restent visibles, et la flèche se
      touche sans viser.
- [ ] Carte avec un nom, un prénom et une fonction très longs : le nom tient sur
      deux lignes au plus, le badge d'établissement reste à sa droite, rien ne
      passe sous le badge ni hors de la carte.
- [ ] **Bandeau « Ma présence »** (1.17.2), compte identifié, cadre réduit de 860px à 320px (panneau
      latéral, tablette en portrait, téléphone) : le nom et le message gardent 200px de large au moins ; quand
      l'interrupteur ne tient plus à côté du texte, il passe dessous (jamais de texte serré en colonne étroite
      à côté de lui) ; l'avatar reste à gauche du texte ; un compte sans fiche n'a pas de vide sous son message.
      Vérifier aussi avec un message long (fiche masquée pour plusieurs raisons).
- [ ] Téléphone ou tablette : toucher le champ de recherche ne zoome pas la page
      (champs à 16px), les badges, tags et le lien e-mail se touchent sans
      viser, et un filtre touché ne reste pas coloré une fois relâché.
- [ ] **Texte des cartes** (1.17.1) : à 1 440 px comme à 390 px, étiquettes, titres de groupe, fonction, e-mail,
      téléphone, « Votre fiche », « Modifier » et, pour un responsable d'établissement, le « Modifier » sous le
      logo de son établissement ont la même taille (12px) et se lisent sans effort ; seul le nom grossit sous
      600 px. Une étiquette a une hauteur confortable à viser (24px) et deux étiquettes voisines ne se touchent
      pas. Les cartes sont plus hautes qu'avant la 1.17.1 (un tiers environ à 1 440 px) : faire défiler une
      longue liste et juger si le défilement reste agréable. Comparer à `docs/images/apercu.png`.
- [ ] **Badge de l'établissement en texte** (1.17.1) (un établissement sans logo, ou `?sanslogos` dans la
      démonstration) : l'acronyme est lu en 12px, entier, à droite du nom sans passer dessous ; un nom
      plus long que 136px est coupé par « … ».

## 13. Modifier sa fiche (1.12.0, reprise en 1.15.0)

Réglages d'abord : `GRIST_SETUP.md` (colonnes de données, règles d'accès). À jouer sur
une **copie** du document, avec deux comptes (une personne ordinaire et un
administrateur) dans deux navigateurs, console ouverte. Le mode admin et la modification de
l'e-mail et de l'établissement sont à la section 16.

- [ ] Personne ordinaire : un bouton « ✎ Modifier » sous la fonction de sa seule carte,
      avec la mention « Votre fiche », et « Modifier mon profil » dans le bandeau. Aucune
      autre carte n'a de bouton, et il n'y a pas de bouton « Mode admin ».
- [ ] Administrateur, mode admin éteint : exactement comme une personne ordinaire.
- [ ] Compte Lecteur, ou document dont la table `Annuaire_Sonde` manque et que le widget ne peut pas créer
      (section 19) : ni bandeau ni bouton. Compte dont l'adresse ne figure pas dans `BDD` : un bandeau
      « Compte absent de l'annuaire » sans interrupteur de présence ni bouton « Modifier », mais avec le
      bouton « Créer ma fiche » (section 19).
- [ ] Ouvrir sa fiche : un bloc d'identité (initiales, nom, e-mail, et à droite le logo de
      l'établissement, ou sa pastille s'il n'a pas de logo) et la
      phrase « Verrouillé : l’e-mail et l’établissement sont liés à votre compte… » ; les
      champs contiennent les valeurs de Grist (le téléphone avec son 0 initial et ses
      espaces). La console ne dit pas `[SCHEMA] Types de colonnes illisibles` (sinon le
      widget suit la forme de la cellule : vérifier le téléphone plus bas).
- [ ] Changer la fonction, retirer un tag, en ajouter un, changer le téléphone : le pied
      de fenêtre compte les champs modifiés et « Ce qui va changer » apparaît sous le
      formulaire. Vider le prénom **et** le nom : « Indiquez au moins un prénom ou un
      nom. » sous les deux champs, « Relire mes modifications » grisé.
- [ ] « Relire mes modifications » : la fenêtre s'élargit, une légende explique les
      repères, la carte « Avant » (« telle qu’elle est aujourd’hui ») est à côté de la carte
      « Après » (« telle qu’elle apparaîtra »), puis vient le « Détail des changements ».
      Sur la carte « Après » : contour vert et pastille « modifié » ou « ajouté » sur une
      ligne de texte, « + » devant un tag ajouté, tag retiré barré, ligne vidée barrée
      avec la pastille « supprimé ». **Rien n'a changé dans Grist** à ce stade.
- [ ] Une personne qui n'a pas accepté d'apparaître, ou dont l'établissement n'est pas
      validé : la relecture de sa fiche porte un avis qui le dit (« Votre fiche est masquée
      de l’annuaire : vous n’avez pas accepté d’apparaître… » / « Votre établissement n’a
      pas validé sa présence : votre fiche reste masquée dans l’annuaire. »). Une personne
      visible n'a aucun avis.
- [ ] « Retour » : les saisies sont conservées. « Annuler » : rien n'est écrit.
- [ ] « Valider » : la fenêtre se ferme et un message « Vos modifications sont enregistrées. »
      reste six secondes en bas de l'écran. Dans Grist, seuls les champs modifiés ont
      changé ; `email`, `Etablissement`, `perimetre` et `Accepte_apparaitre` sont
      intacts ; un seul « Annuler » de Grist défait toute la modification. L'annuaire
      montre la fiche à jour sans rechargement.
- [ ] Téléphone : colonne numérique, Grist stocke un nombre sans 0 initial et la carte
      affiche « 05 56 78 90 12 » ; colonne de texte, il stocke « 05 56 78 90 12 ». Vider
      le champ vide la cellule.
- [ ] Changement concurrent : ouvrir la relecture, changer la **même** colonne dans
      Grist, puis « Valider » : la fenêtre revient à la relecture avec l'avis « La fiche
      a changé dans Grist pendant la relecture » et rien n'est écrit ; « Valider » à
      nouveau écrit. En changeant une **autre** colonne, l'enregistrement réussit sans
      l'écraser.
- [ ] Règle d'accès qui refuse la modification de `BDD` à ce compte : « Grist a refusé
      la modification… », la relecture reste ouverte, rien n'est écrit.
- [ ] Un compte ordinaire ne peut pas modifier la fiche d'un autre ni `email`,
      `Etablissement`, `perimetre` : depuis la console (contexte de l'iframe du
      widget), `grist.docApi.applyUserActions([['UpdateRecord', 'BDD', <autre ligne>,
      {Fonction: 'x'}]])` est refusé.
- [ ] Rendre temporairement `Fonction` à formule : le message parle d'une colonne à
      formule et renvoie à `GRIST_SETUP.md`. Remettre une colonne de données.
- [ ] Une fiche dont une liste contient une valeur sans libellé : modifier une autre
      liste conserve cette valeur.
- [ ] Si Grist ne garde pas tout (par exemple une colonne à formule qui recalcule la valeur)
      ou si l'annuaire ne se recharge pas : la fenêtre reste ouverte sur « Fiche enregistrée »
      avec la réserve, et aucun message de confirmation n'apparaît.
- [ ] Échap : avec des modifications, un premier appui avertit et un second ferme ;
      sans modification, un seul appui ferme. Pendant l'enregistrement, Échap ne ferme
      pas.
- [ ] Clavier et lecteur d'écran (au moins une fois, NVDA ou VoiceOver) : le titre de
      chaque étape est annoncé, « ajouté », « retiré » et « modifié » sont lus dans la
      carte « Après » (les pastilles sont du texte, les tags ont un mot caché), le message
      de confirmation est annoncé à la fermeture (une seule fois), le focus revient au
      bouton d'origine à la fermeture.
- [ ] Téléphone ou tablette : la fenêtre tient dans l'écran, les cartes avant et après
      sont l'une sous l'autre, « Valider » reste accessible.
- [ ] La console ne montre aucune erreur ni aucune adresse e-mail.

## 14. Logos et habillage (1.14.0)

Réglages d'abord : `GRIST_SETUP.md`, étape 5 (colonnes `logo` et `ordre_bandeau` d'`Etablissements`). Les
financeurs n'en dépendent pas : deux images fixes du widget (1.21.0). À jouer sur une **copie** du document,
avec la console et l'onglet Réseau du
navigateur ouverts (F12). **Ce protocole est le seul contrôle du jeton d'accès et des adresses de pièces
jointes : les tests automatiques simulent la réponse de Grist.** Si un point échoue, relever le message de
la console, l'adresse de l'image dans l'onglet Réseau et le code de réponse.

- [ ] Document sans aucune colonne de logos : aucune erreur, aucun avertissement `[LOGOS]` (la ligne d'information
      `Version …` dit « aucun logo »), aucune demande de
      jeton dans l'onglet Réseau, les pastilles texte sur les cartes comme avant la 1.14.0, et en bas de page
      le bandeau des fondateurs validés **en texte** (leurs acronymes). Les financeurs sont là quand même, en
      tête de page comme en bas (images fixes).
- [ ] Un logo (PNG ou SVG) ajouté dans la colonne `logo` de deux établissements fondateurs validés, puis le
      widget rechargé : le logo remplace la pastille sur leurs cartes, **seul** (ni nom dessous) ; les autres
      établissements gardent leur pastille. Cliquer le logo filtre sur l'établissement, comme la pastille.
- [ ] Onglet Réseau : **une seule** demande de jeton au chargement, puis une demande par logo à une adresse de
      la forme `…/attachments/<numéro>/download?auth=…`, réponse 200 de type image (pas 401, 403 ni 404).
      Aucun avertissement `[LOGOS]` dans la console (les lignes d'information `Version …` et `Bilan : …` y sont normales).
- [ ] **Chaque logo n'est demandé qu'une fois, et un redessin ne le fait pas disparaître (1.28.1)** : dans **Firefox** de préférence (il annule la demande
      d'une image retirée en cours de chargement, `NS_BINDING_ABORTED` ; ce mécanisme n'a jamais été observé dans un vrai Grist), onglet Réseau et console (filtre « LOGOS ») ouverts, recharger le widget et taper vite dans la recherche pendant que les
      logos arrivent : tous les logos des cartes et du bandeau s'affichent, l'onglet Réseau montre **une seule** demande par logo (pas une par carte) et aucune ligne
      `NS_BINDING_ABORTED`, la ligne `[LOGOS] Bilan : N logos chargés sur N ; affichés : x/x sur les cartes, y/y dans le bandeau` arrive dans les
      15 secondes (avertissement s'il en manque : elle dit combien sont refusés, sans réponse ou sans jeton), et le bas de la page dit « Version … » comme le titre du CHANGELOG (sinon le
      cache de GitHub Pages sert encore l'ancien code : Ctrl+Maj+R ou une fenêtre privée).
- [ ] Financeurs, au centre de l'en-tête (cadre assez large) : le visuel de la maquette (République française,
      ANR, Bpifrance, France 2030) avec, à sa gauche dès 1320 px, la phrase « Projet financé par l'État dans le
      cadre de France 2030 ». Identiques dans tous les documents, sans table `Financeurs` (une table de ce nom,
      si elle existe encore, est ignorée).
- [ ] Bandeau tout en bas : seuls les fondateurs **validés**, dans l'ordre d'`ordre_bandeau` ; le rond
      « France 2030 » à droite (image fixe) ; la phrase de financement dont le lien ouvre la page
      du projet dans un nouvel onglet ; une infobulle donne le nom complet de chaque établissement.
- [ ] Cartes : tous les logos ont la **même hauteur** (64 px sur une carte d'au moins 380 px de large, 48 px dès 330 px,
      32 px en dessous), quelle que soit leur forme ; un logo très large
      est réduit à ses proportions au lieu de déborder sur le nom de la personne.
- [ ] **Les droits (1.28.2)** : avec « Voir en tant que » un propriétaire, un **Éditeur** (et un **Lecteur**, si les
      Lecteurs lisent l'annuaire), les logos s'affichent dans tous les cas, les règles d'accès de l'étape 4 posées.
      Le jeton est en lecture seule, donc compté comme un Lecteur : si la colonne `logo` ne leur est pas lisible, la
      console dit `[LOGOS] Bilan : 0 logo chargé sur N (N refusés…` et le premier avertissement `ne se charge pas`
      donne la cause probable et le remède (règle de colonne sur `logo`, `GRIST_SETUP.md` étape 5) ; si elle n'est pas
      lisible par les Éditeurs, la ligne `Version …` dit `0 avec un logo dans la colonne logo`. Les noms remplacent
      les logos refusés, sans bandeau rouge.
- [ ] **Expiration du jeton** : laisser la page ouverte plus longtemps que sa validité (quelques minutes),
      puis cocher et décocher un filtre : les logos des cartes reviennent (un nouveau jeton est demandé, visible
      dans l'onglet Réseau), sans cadre cassé ni nom à leur place.
- [ ] Supprimer le fichier de la cellule `logo` d'un établissement, recharger : seul cet établissement retrouve
      sa pastille (et son nom dans le bandeau du bas) ; les autres logos sont intacts, sans bandeau rouge.
- [ ] Renommer temporairement la colonne `logo` : les noms remplacent les logos des établissements partout,
      sans erreur ni bandeau rouge, et les financeurs restent affichés. Remettre son nom.
- [ ] Remplacer un logo dans Grist puis recharger le widget : le nouveau logo apparaît (sans recharger, rien ne
      change : Grist ne prévient pas le widget d'un changement d'`Etablissements`).
- [ ] Un logo SVG qui n'a ni `width` ni `height` (seulement un `viewBox`) s'affiche à une taille raisonnable ;
      dans le bandeau du bas, un logo en hauteur et une bannière large ont un poids visuel voisin de leurs voisins.
- [ ] Mise en page, en réduisant la section du widget : à partir de 1180px, le titre à gauche, les financeurs
      au centre (leur phrase de financement ne s'ajoute qu'à partir de 1320px), le profil à droite ; de 860 à
      1179px, les financeurs au-dessus du profil, à droite ; sous 860px, tout est empilé ; les financeurs du haut
      sont gris ardoise (c'est l'image de la maquette), le rond du bandeau du bas en couleurs ; quand la largeur utile du bandeau du bas
      passe sous 560px, ses logos se
      répartissent sur quatre colonnes au lieu de huit. Aucune barre de
      défilement horizontale, aucun logo déformé ni coupé.
- [ ] Console : aucune erreur, aucune adresse e-mail, ni jeton ni adresse d'image dans les lignes écrites par
      le widget (le navigateur, lui, en écrit une pour une image introuvable : ne pas la partager).
- [ ] Clavier et lecteur d'écran (au moins une fois) : un logo de carte se focalise avec Tab et s'active avec
      Entrée ; les logos sont lus par le nom de l'établissement ; le logo seul garde un nom accessible.
- [ ] La relecture d'une modification de fiche montre le logo de l'établissement sur les deux cartes, sans rien
      de cliquable.

## 15. Clavier et lecteur d'écran (1.14.1)

Les tests automatiques lisent l'arbre d'accessibilité de Chromium et comparent des captures avec et sans
focus : ils ne remplacent ni un lecteur d'écran réel, ni Firefox, ni Safari. **À jouer au moins une fois,
dans le vrai Grist** (la section du widget dans la page, pas la démonstration), avec le clavier seul. Pour un
lecteur d'écran : NVDA ou JAWS sous Windows, VoiceOver sous macOS ou iOS, TalkBack sous Android.

- [ ] Appuyer sur **Tab** depuis le début de la page : le focus passe, dans l'ordre, par l'interrupteur et le
      bouton de « Ma présence » (si on est identifié), le champ de recherche, les boutons de filtre, les
      boutons Fondateurs et Partenaires, Réinitialiser, puis les boutons et liens de chaque carte. À chaque
      arrêt, **un anneau violet de 2 px entoure le contrôle** ; aucun arrêt n'est invisible. **Maj+Tab** revient
      en arrière.
- [ ] Le champ de recherche : l'anneau entoure le cadre entier, loupe comprise, avec ses coins arrondis (pas
      seulement la ligne de saisie) ; il s'affiche aussi quand on clique dans le champ.
- [ ] Ouvrir un menu de filtre (Entrée ou Espace sur son bouton) puis tabuler : l'anneau suit la recherche du
      menu, les cases et les flèches de détail des domaines.
- [ ] À la souris, aucun anneau n'apparaît autour d'un bouton cliqué (sauf dans un champ de saisie).
- [ ] **Lecteur d'écran** : en arrivant sur le champ de recherche, il annonce **« Rechercher par nom ou
      prénom »** et un champ de recherche (pas « champ de saisie » sans nom, pas seulement l'invite grisée). Dans
      un menu ouvert, la recherche est annoncée « Rechercher dans … » suivi du nom du filtre.
- [ ] **Mode contraste élevé** (Windows : réglage « Contraste » ; Chrome : `forced-colors` émulé dans les outils
      de développement, onglet Rendu) : l'anneau de focus reste visible sur chaque contrôle.
- [ ] Zoom du navigateur à 200 % : l'anneau n'est coupé par aucun bord (ni celui de la barre d'outils, ni celui
      d'une carte, ni celui d'un menu).
- [ ] **Couleurs des étiquettes** (1.16.2) : sur une carte qui en porte plusieurs, le texte blanc des
      pastilles (Instances, Actions, GT, Compétences, Communautés, Tâches, Rôle PUI) se lit sans effort à la
      taille normale, comme les titres de groupe et l'adresse e-mail ; on distingue encore les catégories
      d'un coup d'œil, et le point de chaque bouton de filtre a la couleur des pastilles de sa catégorie.
      À comparer avec `docs/images/carte-anatomie.png`.
- [ ] **Cibles à la souris** (1.17.1) : cliquer sur une étiquette de carte (elle ajoute le filtre correspondant),
      sur le bouton « Modifier » de sa propre carte, sur celui de son établissement sous le logo (pour un
      responsable) et sur le lien e-mail : chaque clic touche la bonne cible du premier coup, sans toucher la
      voisine ; passer de l'une à l'autre à la souris ne donne pas l'impression de viser trop petit.
- [ ] **Interrupteur de présence au clavier** (1.16.3) : tabuler jusqu'à « Apparaître dans l'annuaire »
      (compte identifié, fiche présente) et appuyer sur **Espace** : l'interrupteur bascule et **l'anneau
      violet reste sur lui**, pendant « Enregistrement… » comme après ; la touche Tab suivante va au champ de
      recherche, pas au début de la page. Espace et Entrée pressés plusieurs fois pendant l'enregistrement
      n'écrivent qu'une fois (une seule modification de la case dans l'activité du document Grist).
- [ ] **Lecteur d'écran, présence** (1.16.3) : après la bascule, il lit **une fois** « Modification
      enregistrée. Vous avez accepté d'apparaître dans l'annuaire. » (ou « … Vous n'apparaissez plus dans
      l'annuaire. »), sans que rien de nouveau n'apparaisse à l'écran. Avec une règle d'accès qui refuse
      l'écriture : il lit le message d'erreur, qui est aussi visible sous le bandeau.
- [ ] **Piste de l'interrupteur** (1.16.3) : éteinte (gris bleuté) comme allumée (vert profond), la piste se
      distingue du fond gris clair du bouton et son curseur blanc se voit sur elle sans effort. À comparer
      avec `docs/images/ma-presence.png` et `ma-presence-retiree.png`.
- [ ] **Mode contraste élevé, présence** (1.16.3) : l'interrupteur éteint est une piste vide bordée avec le
      curseur à gauche, l'interrupteur allumé une piste pleine avec le curseur à droite, de couleurs
      différentes ; le curseur est centré dans la piste, bordure comprise.
- [ ] **Animations réduites** (1.16.3) (Windows : « Afficher les animations » désactivé ; Chrome :
      `prefers-reduced-motion` émulé dans l'onglet Rendu) : le curseur change de côté sans glisser.

## 16. Mode admin, e-mail et établissement (1.15.0)

À jouer avec un compte administrateur (case `admin` d'`ACL`) et un compte ordinaire,
sur une copie du document.

- [ ] Administrateur : le bandeau « Ma présence » porte un bouton « Mode admin » (absent
      pour un compte ordinaire). À l'ouverture il est éteint et seule la carte de
      l'administrateur a un bouton « Modifier ».
- [ ] Allumer le mode admin : le bouton passe à l'état appuyé, une bande « Mode admin : … »
      apparaît sous les filtres et toutes les cartes affichées portent « ✎ Modifier la
      fiche ». Recharger la page : le mode est éteint. Le rallumer au clavier (Tab, Entrée).
- [ ] Un administrateur sans fiche dans `BDD` : un bandeau « Administrateur » avec le seul
      bouton « Mode admin », sans interrupteur de présence.
- [ ] Modifier la fiche d'une autre personne : le titre est « Modifier la fiche de … », une
      phrase rappelle le mode admin, et les champs **E-mail** et **Établissement** sont
      modifiables (l'établissement dans une liste déroulante à recherche, par son sigle, parmi les
      fondateurs et les partenaires). Sur sa propre fiche ils restent
      verrouillés.
- [ ] Changer l'e-mail pour une adresse que porte une autre fiche : « Cette adresse est déjà
      utilisée par … » (le nom si cette personne est visible dans l'annuaire, « une autre
      fiche » sinon). Une adresse mal formée, ou vidée, est refusée aussi.
- [ ] Choisir un établissement qui n'a pas validé sa présence : l'avertissement sous le champ,
      puis dans la relecture l'avis « … n’a pas validé sa présence : après cette modification,
      la fiche ne sera plus visible dans l’annuaire. ». Après « Valider », la carte disparaît.
- [ ] Changer l'e-mail : la relecture prévient que la table `ACL` ne suit pas. Après
      « Valider », `BDD.email` a changé et `ACL` est intacte.
- [ ] La relecture montre la nouvelle adresse et le nouvel établissement sur la carte
      « Après » (le badge d'établissement entouré), et « Valider » écrit tout en une seule
      action Grist (un seul « Annuler » de Grist défait tout).
- [ ] Après « Valider » : le message « La fiche de … est enregistrée. » apparaît six secondes.
- [ ] Prendre l'adresse choisie dans Grist (autre fenêtre) entre la relecture et « Valider » :
      « Cette adresse e-mail est maintenant celle d'une autre fiche : rien n'a été modifié »,
      rien n'est écrit.
- [ ] Console (contexte de l'iframe) : un compte ordinaire ne peut pas changer `email` ni
      `Etablissement` sur une fiche, avec la règle d'accès de l'étape 4 de `GRIST_SETUP.md`.
- [ ] Comparaison à la maquette v5 : ouvrir la maquette et le widget côte à côte à la même
      largeur (1280 px, puis 390 px) et vérifier la fenêtre de modification, la relecture,
      les repères de la carte « Après », le bandeau, la bande « Mode admin » et le message
      de confirmation. Les écarts voulus sont dans le CHANGELOG (1.15.0).

## 17. Fiche d'un établissement (1.17.0)

Réglages d'abord : `GRIST_SETUP.md`, étape 1 (les colonnes écrites sont des colonnes de données), étape 2
(colonne `Responsable_de` de la sonde), étape 3 (les lignes d'`ACL`), étape 4 (règles d'accès sur
`Etablissements`, `ACL` et les pièces jointes) et étape 5 (colonne `logo`). À jouer sur une
**copie** du document, avec la console et l'onglet Réseau du navigateur ouverts (F12), avec :

- un compte **responsable** : son adresse figure dans `ACL`, avec un établissement (cas ordinaire : un seul) ;
- un compte **administrateur** qui n'est responsable d'aucun établissement ;
- un compte ordinaire, pour les règles d'accès.

**Ce protocole est le seul contrôle de l'envoi du logo et des règles d'accès : les tests automatiques
simulent la réponse de Grist.** Quatre points ne peuvent être constatés que dans un vrai document : (1) que
Grist **accepte** l'envoi du fichier avec le jeton en écriture que le widget demande, (2) que le navigateur
**laisse le widget lire la réponse** (identifiant de la pièce jointe), (3) que les règles d'accès laissent un
responsable écrire dans `Etablissements` et `ACL` et ajouter une pièce jointe, (4) que la formule de la
colonne `Responsable_de` de la sonde, elle non plus jamais essayée, renvoie bien les établissements de la personne. Si l'un échoue, relever le
message du widget, la ligne de la console, la requête et son code de réponse dans l'onglet Réseau.

**Entrées et droits**

- [ ] Sonde **sans** colonne `Responsable_de` : aucune erreur, la console dit une fois « la sonde n'a pas de
      colonne « Responsable_de » : pas de fiche d'établissement », ni « Mon établissement » ni « ✎ Modifier »
      sous un logo, rien d'autre ne change.
- [ ] Colonne ajoutée, une ligne d'`ACL` (adresse du responsable, établissement) : après rechargement, la console
      dit « personne identifiée (administrateur : non, responsable de 1 établissement) », le bandeau porte
      « Mon établissement » et **toutes** les cartes affichées de cet établissement (et elles seules) portent « ✎ Modifier »
      sous le logo. Aucune adresse dans la console.
- [ ] L'administrateur qui n'est pas responsable : ni « Mon établissement » ni « ✎ Modifier » sous les logos,
      même mode admin allumé. Le nommer responsable dans `ACL` (même adresse, ligne qui garde `admin` coché) : les
      deux boutons apparaissent, et les boutons « Mode admin » et « Modifier mon profil » restent aussi.
- [ ] Un responsable de deux établissements : « Mon établissement » ouvre d'abord la liste, on choisit.
- [ ] Un compte Lecteur et un visiteur anonyme : aucun bouton d'établissement.
- [ ] « Mon établissement » ouvre la fiche **même quand l'établissement est masqué de l'annuaire** (case
      « visible » décochée) ou que la personne n'a pas de carte.

**Contenu de la fenêtre**

- [ ] Le titre « Fiche de l’établissement : … », le logo actuel (ou le sigle en pastille), le sigle et le statut en
      lecture seule, le nom complet, la case « Établissement visible dans l’annuaire », les responsables.
- [ ] La liste des responsables donne le nom des personnes dont la fiche figure dans l'annuaire, « Fiche masquée de
      l’annuaire » pour une adresse dont la fiche n'y figure pas, « Adresse sans fiche dans l’annuaire » sinon.
      Aucun nom d'une fiche masquée n'apparaît, ni dans la liste ni dans la liste déroulante.
- [ ] Règle d'accès qui interdit à ce compte de lire `ACL` : la fenêtre s'ouvre, dit que la liste des responsables
      n'est ni affichée ni modifiable, et le reste s'enregistre.

**Nom, visibilité, responsables** (sans logo)

- [ ] Changer le nom complet puis « Enregistrer » : « La fiche de … est enregistrée. » six secondes ; dans Grist,
      `nom_complet` a changé, **une seule** action (un seul « Annuler » de Grist défait tout). Un nom vide est refusé
      sous le champ.
- [ ] Décocher la visibilité : l'avis dit combien de fiches seront masquées (« …, y compris la vôtre »). Après
      enregistrement, `ok_pour_apparaitre` est faux, les cartes de l'établissement disparaissent et « Mon
      établissement » reste disponible. Recocher la case, enregistrer : elles reviennent.
- [ ] Nommer un responsable, par la liste puis par une adresse saisie : `ACL` reçoit une ligne avec **seulement**
      l'adresse (en minuscules) et l'établissement ; `admin` n'est pas coché. Une adresse mal formée est refusée.
      Nommer l'adresse d'un administrateur qui a une ligne `ACL` sans établissement : cette ligne **reprend** l'établissement
      (pas de seconde ligne) et son `admin` reste coché.
- [ ] Retirer un responsable : sa ligne disparaît d'`ACL`, **sauf** si elle porte `admin` : elle perd alors seulement
      l'établissement. « Rétablir » annule un retrait non enregistré. Retirer le dernier : « Un établissement doit
      garder au moins un responsable », « Enregistrer » grisé.
- [ ] Se retirer soi-même : l'avis « Vous retirez votre propre accès… » ; après enregistrement, les boutons
      d'établissement disparaissent (les droits sont relus), l'annuaire reste affiché.

**Le logo : l'envoi** (les trois points ci-dessus)

- [ ] « Ajouter un logo » ou « Remplacer le logo » avec un PNG de moins de 1 Mo : un aperçu remplace le logo, rien
      n'est encore envoyé (onglet Réseau : aucune requête d'envoi ; la demande de jeton en écriture, selon la façon dont
      Grist la sert, peut ne pas s'y afficher).
- [ ] « Enregistrer » : **une** demande de jeton, puis **une** requête `POST …/attachments?auth=…` de réponse 200 dont
      le corps est `[<numéro>]`, sans cookie ni en-tête `Referer`. Aucune erreur de la console (en particulier aucun
      « blocked by CORS policy »). Dans Grist, la cellule `logo` de l'établissement contient le **nouveau** fichier (un seul),
      c'est un **PNG** de 480 px au plus ; les cartes de l'établissement portent le nouveau logo sans recharger.
- [ ] **Si l'envoi échoue** : le message dit pourquoi et, sauf pour un fichier trop volumineux, quoi faire (déposer le
      fichier à la main dans Grist, ou « Contactez un administrateur » quand les droits manquent). Relever la
      requête. Cas « réponse sans en-têtes d'autorisation entre sites » : la console du navigateur parle de
      « CORS » et le widget dit « L’envoi du fichier à Grist a échoué » ; vérifier si le fichier s'est pourtant ajouté
      aux pièces jointes du document (fichier orphelin) et le noter.
- [ ] Un fichier trop lourd (plus de 1 Mo), d'un autre format (PDF, GIF), vide ou illisible : refusé sous le logo
      **avant** tout envoi, avec une phrase claire.
- [ ] Un SVG qui contient un `<script>` : accepté, mais ce qui part est un PNG (télécharger la pièce jointe dans Grist pour
      le vérifier) ; aucun script ne s'exécute.
- [ ] « Retirer le logo » puis « Enregistrer » : la cellule `logo` est vide, les cartes reprennent le sigle.
- [ ] Noter ce que devient l'**ancien** fichier après un remplacement : Grist garde-t-il la pièce jointe tant qu'elle
      est référencée dans l'historique, puis la supprime-t-il ? Le widget ne sait pas supprimer une pièce jointe.
- [ ] Un compte à qui une règle interdit d'ajouter une pièce jointe : « Grist a refusé le fichier : vos droits ne
      permettent pas d’ajouter une pièce jointe au document. », rien d'écrit dans la fiche.

**Refus, conflits, pannes**

- [ ] Règle d'accès qui interdit la modification d'`Etablissements` à ce compte : « Grist a refusé la modification… »,
      la fiche reste ouverte avec la saisie, **rien** n'est écrit (ni l'établissement ni `ACL`).
- [ ] Deux onglets sur la même fiche : modifier le nom dans l'un et enregistrer ; dans l'autre, ne changer que la
      visibilité et enregistrer : les deux changements sont conservés. Changer le **même** champ dans les deux :
      le second reçoit « La fiche a changé dans Grist pendant que la fenêtre était ouverte… », sa saisie est gardée
      et rien n'est écrit.
- [ ] Deux responsables qui nomment chacun une personne différente : les deux nominations sont conservées.
- [ ] Échap avec des modifications : un premier appui avertit, un second ferme sans rien écrire. Double clic sur
      « Enregistrer » : un seul enregistrement.
- [ ] Console : aucun nom, aucune adresse e-mail, ni jeton ni adresse d'envoi dans les lignes écrites par le widget
      (le navigateur, lui, peut écrire l'adresse d'une requête bloquée : ne pas partager sa console).

**Clavier, lecteur d'écran, mise en page**

- [ ] Tout se fait au clavier : ouvrir la fenêtre, parcourir les champs, cocher la case, nommer et retirer un
      responsable, choisir un fichier, enregistrer. Un anneau de focus visible à chaque arrêt. À la fermeture, le focus revient
      au bouton d'où la fenêtre a été ouverte.
- [ ] Lecteur d'écran (au moins une fois) : la fenêtre est annoncée par son titre ; la case est lue « Établissement visible dans
      l’annuaire » puis son explication ; chaque bouton « Retirer » dit de qui il s'agit ; « Préparation de l’image… », le
      résumé du pied (nom vide, dernier responsable), l'échec d'un enregistrement et une adresse refusée sont annoncés ;
      le refus d'un fichier sous le logo ne l'est pas de lui-même, il se lit en revenant sur le champ du fichier.
- [ ] En réduisant la section du widget de 1280 à 320 px : le bouton « Mon établissement » reste dans le bandeau
      sans chevaucher le nom ni les autres boutons (à partir de 860 px, quelqu'un qui a à la fois « Mode admin »,
      « Mon établissement » et sa propre fiche voit trois rangées de boutons), la fenêtre occupe l'écran sur un
      cadre étroit, rien ne dépasse.
- [ ] Comparaison à la maquette v5 : ouvrir la maquette (écrans D0 et D1) et le widget côte à côte à la même largeur
      (1280 px, puis 390 px). Les écarts voulus sont dans le CHANGELOG (1.17.0).

## 18. Photo de profil (1.19.0)

Réglages d'abord : `GRIST_SETUP.md`, étape 6 (colonne `Avatar`, de type Pièces jointes, dans `BDD`) et étape 4
(règles d'accès sur `BDD` et sur les pièces jointes). À jouer sur une **copie** du document, avec la console et
l'onglet Réseau du navigateur ouverts (F12), avec :

- un compte **ordinaire** (ni administrateur ni responsable d'établissement) dont l'adresse figure dans `BDD.email`,
  sur une fiche qui apparaît dans l'annuaire ;
- un compte **administrateur** ;
- un compte **Lecteur** du document.

**Ce protocole est le seul contrôle de l'envoi d'une photo par une personne ordinaire et des règles d'accès : les
tests automatiques simulent la réponse de Grist.** Trois points ne peuvent être constatés que dans un vrai
document : (1) que Grist **accepte** l'envoi du fichier avec le jeton en écriture que le widget demande, (2) que le
navigateur **laisse le widget lire la réponse** (identifiant de la pièce jointe), (3) que les règles d'accès laissent
une personne **ordinaire** ajouter une pièce jointe et écrire `Avatar` sur **sa** fiche, et seulement la sienne. Si
l'un échoue, relever le message du widget, la ligne de la console, la requête et son code de réponse dans
l'onglet Réseau.

**Sans la colonne**

- [ ] Document **sans** colonne `Avatar` : les cartes montrent les initiales, le formulaire « Modifier mon profil »
      n'a pas de carte « Photo de profil », aucune erreur ni avertissement `[LOGOS]` dans la console (les
      lignes d'information `Version …` et `Bilan : …` y sont normales).

**Affichage** (colonne ajoutée)

- [ ] Déposer une image carrée (PNG ou JPG) dans la cellule `Avatar` de deux personnes dont la fiche apparaît, puis
      recharger le widget : leurs cartes montrent la photo **à la place des initiales** (dans un rond) ; les autres
      cartes gardent leurs initiales. Onglet Réseau : une demande par photo, à une adresse de la forme
      `…/attachments/<numéro>/download?auth=…`, réponse 200 de type image ; les photos de cartes hors écran ne sont
      demandées qu'à l'approche (défilement). Aucun avertissement `[LOGOS]` dans la console.
- [ ] Un clic sur la photo d'une carte l'**agrandit**, avec le nom, la fonction et l'établissement en légende. La croix,
      un clic sur la photo ou à côté, et Échap la ferment ; le focus revient sur la photo de la carte.
- [ ] Avec le compte de l'une de ces personnes : sa photo remplace ses initiales dans le bandeau « Ma présence » et
      dans le bloc d'identité de la fenêtre « Modifier mon profil ».
- [ ] Un fichier qui n'est pas une image dans une cellule, ou un fichier supprimé : la carte garde les initiales,
      sans image cassée ni bouton qui ne fait rien.
- [ ] Une personne dont la fiche est masquée (accord retiré, établissement non validé) : pas de carte, donc pas de
      photo nulle part dans l'annuaire.
- [ ] Un compte **Lecteur** voit les photos (le jeton demandé pour les afficher est en lecture seule).

**Ajouter sa photo** (compte ordinaire)

- [ ] « Modifier mon profil » : la carte « Photo de profil » est le premier bloc après l'identité, avec « Ajouter une
      photo » et sans bouton « Retirer la photo ». À l'ouverture, **rien** n'est demandé ni écrit.
- [ ] Choisir une photo de téléphone en portrait de moins de 2 Mo : l'aperçu montre le **centre** de la photo,
      recadré en carré et **à l'endroit** ; le bouton devient « Changer la photo » et « Retirer la photo » apparaît.
      Onglet Réseau : aucune requête d'envoi, aucune demande de jeton en écriture à ce stade.
- [ ] Un fichier de plus de 2 Mo, un PDF, un GIF, un SVG, un fichier vide ou abîmé : refusé sous les boutons, avant
      tout envoi, avec une phrase claire (« Cette image pèse X Mo : choisissez-en une de 2 Mo au plus. », « Ce fichier
      n’est pas une image acceptée : choisissez un fichier JPG, PNG ou WebP. »…) ; la photo actuelle reste.
- [ ] « Relire mes modifications » : sur la carte « Après », la photo est entourée d'un anneau vert avec la pastille
      « photo ajoutée » ; la carte « Avant » garde les initiales ; le « Détail des changements » montre « aucune photo »
      puis la nouvelle, en miniature (un clic l'agrandit). Onglet Réseau : toujours aucun envoi.
- [ ] « Valider » : **une** demande de jeton en écriture, puis **une** requête `POST …/attachments?auth=…` de réponse
      200 dont le corps est `[<numéro>]`, sans cookie ni en-tête `Referer`, puis l'écriture de la fiche. Aucune erreur de
      la console (en particulier aucun « blocked by CORS policy »). Dans Grist, la cellule `Avatar` contient le
      **nouveau** fichier (un seul) : le télécharger, c'est un **JPEG carré de 256 px au plus**, sans métadonnées (aucune
      position GPS : le vérifier avec un outil Exif), remis à l'endroit.
- [ ] La carte de la personne montre la photo sans recharger ; le message de confirmation s'affiche six secondes.
- [ ] Un PNG transparent : la photo a un fond **blanc**, jamais noir.
- [ ] **Si l'envoi échoue** : la relecture reste ouverte avec la photo choisie, un message dit quoi faire et se termine
      par « Contactez un administrateur si le problème persiste. », la fiche est inchangée. Relever la requête et son
      code. Cas « réponse sans en-têtes d'autorisation entre sites » : la console du navigateur parle de « CORS » et le
      widget dit « L’envoi du fichier à Grist a échoué » ; vérifier si le fichier s'est pourtant ajouté aux pièces jointes
      du document (fichier sans emploi) et le noter.
- [ ] Un compte à qui une règle interdit d'ajouter une pièce jointe : « Grist a refusé le fichier : vos droits ne
      permettent pas d’ajouter une pièce jointe au document. Contactez un administrateur. », rien d'écrit dans la fiche.
- [ ] Un compte à qui une règle interdit d'écrire `Avatar` : le fichier est envoyé, l'écriture est refusée, et le message
      ajoute « Le fichier de la nouvelle photo, déjà envoyé à Grist, reste dans les pièces jointes du document sans
      servir. » Vérifier que le fichier est bien là, sans cellule qui le référence.

**Changer, retirer**

- [ ] « Changer la photo » puis « Relire » : la pastille dit « photo modifiée » ; après « Valider », la cellule `Avatar`
      ne contient que la nouvelle photo. **Noter ce que devient l'ancien fichier** : reste-t-il dans les pièces jointes
      du document ? (le widget ne sait pas supprimer une pièce jointe.) Grist le supprime-t-il de lui-même ?
- [ ] « Retirer la photo » puis « Relire » : l'anneau est rouge, la pastille dit « photo retirée », le détail
      montre la photo actuelle puis « photo retirée » ; « Valider » : la cellule est vide, les initiales reviennent, et l'onglet Réseau ne montre
      **aucun** envoi. L'ancien fichier reste-t-il dans les pièces jointes ? Le noter.
- [ ] Sans photo au départ : choisir une photo puis la retirer revient à ne rien changer (« Relire » reste grisé).
- [ ] Échap avec une photo choisie : un premier appui prévient, un second ferme ; rouvrir la fenêtre repart de la
      photo de Grist.

**Administrateur, droits, concurrence**

- [ ] Compte administrateur, mode admin allumé, « ✎ Modifier la fiche » d'une autre personne : la même carte « Photo
      de profil ». Ajouter, remplacer et retirer la photo : **seule** la ligne concernée est écrite ; la photo s'affiche
      sur la carte de cette personne.
- [ ] Règles d'accès posées : un compte ordinaire ne peut pas écrire `Avatar` sur la fiche d'un autre, ni depuis le
      widget (le bouton n'existe pas) ni depuis la console.
- [ ] Deux onglets sur la même fiche : photo changée dans l'un, puis photo choisie dans l'autre (ouvert avant) : au « Valider »,
      « La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau. » ; rien n'est
      écrit sur la fiche, et le message dit où est resté le fichier envoyé.
- [ ] Console : aucun nom, aucune adresse e-mail, ni jeton ni adresse d'envoi dans les lignes écrites par le widget (le
      navigateur, lui, peut écrire l'adresse d'une requête bloquée : ne pas partager sa console).

**Clavier, lecteur d'écran, mise en page**

- [ ] Au clavier : la photo d'une carte se focalise avec Tab (« Agrandir la photo de … ») et s'agrandit avec Entrée ou
      Espace ; Échap la ferme et le focus revient sur la carte. Dans le formulaire : « Ajouter une photo » et « Retirer la
      photo » se parcourent et s'activent au clavier ; quand « Retirer la photo » disparaît, le focus passe à « Ajouter une
      photo ». Un anneau de focus visible à chaque arrêt.
- [ ] Lecteur d'écran (au moins une fois) : les boutons de la photo sont lus par leur texte ; « Préparation de l’image… »
      et les refus sont annoncés ; la photo agrandie est annoncée par sa légende.
- [ ] En réduisant la section du widget de 1280 à 320 px : la carte « Photo de profil » reste lisible (l'aperçu au-dessus
      des boutons sur un cadre étroit), la photo agrandie tient dans l'écran, rien ne dépasse.
- [ ] Comparaison à la maquette v5 : ouvrir la maquette (écrans de la photo de profil) et le widget côte à côte à la
      même largeur (1280 px, puis 390 px). Les écarts voulus sont dans le CHANGELOG (1.19.0).

## 19. Créer ma fiche, e-mail affiché et table-sonde (1.18.0, 1.20.0)

Réglages d'abord : `GRIST_SETUP.md`, étape 1 (la colonne `email_affiche`, facultative, et les colonnes que le
widget écrit : des colonnes de données), étape 2 (la table `Annuaire_Sonde`, que le widget crée au besoin) et
étape 4 (la règle d'accès qui laisse une personne **ajouter** à `BDD` la ligne qui porte son adresse). À jouer sur
une **copie** du document, avec la console et l'onglet Réseau du navigateur ouverts (F12), avec :

- un compte **ordinaire** (ni administrateur ni responsable d'établissement) dont l'adresse ne figure dans
  **aucune** fiche de `BDD` ;
- un compte **administrateur** (case `admin` d'`ACL`) sans fiche dans `BDD` ;
- un compte ordinaire **avec** une fiche et un compte **Lecteur** ;
- un compte **propriétaire** du document, pour la table-sonde.

**Ce protocole est le seul contrôle de la création d'une fiche par une personne ordinaire et de la création de la
table-sonde par le widget : les tests automatiques simulent la réponse de Grist.** Quatre points ne peuvent être
constatés que dans un vrai document : (1) que la règle d'accès de l'étape 4 laisse une personne ordinaire
**ajouter** à `BDD` la ligne qui porte son adresse (`newRec.email == user.Email`), et seulement celle-là, (2) qu'elle
laisse aussi écrire `email_affiche`, (3) que Grist **accepte** l'`AddTable` du widget (colonnes de données à formule
de déclenchement) pour le compte qui ouvre l'annuaire le premier, et que ces formules se calculent bien à la création
d'une ligne, (4) que l'adresse que le widget écrit **en minuscules** est celle que la règle attend. Si l'un échoue,
relever le message du widget, la ligne de la console, la requête et son code de réponse dans l'onglet Réseau.

**Entrée et droits**

- [ ] Compte ordinaire sans fiche : le bandeau « Ma présence » est intitulé « Compte absent de l'annuaire » et porte
      **seulement** un bouton « Créer ma fiche » (ni interrupteur de présence, ni « Modifier mon profil »). La
      console dit `[IDENTITE] Aucune ligne de BDD ne porte l'adresse de la personne connectée…`, sans aucune
      adresse. Administrateur sans fiche : « Administrateur », avec « Mode admin » et « Créer ma fiche ».
- [ ] Une personne qui a déjà une fiche, un compte Lecteur et un compte que l'annuaire ne reconnaît pas : pas de
      bouton « Créer ma fiche ». `BDD` sans colonne `email` : pas de bouton, le bandeau dit « Fiche introuvable » et
      la console `BDD n'a pas de colonne « email »…`.

**La fenêtre**

- [ ] « Créer ma fiche » ouvre la fenêtre « Créer ma fiche » (la même que « Modifier mon profil ») : « Vous relisez
      votre fiche avant de la publier : elle est ajoutée tout de suite, sans validation. » ; l'**adresse du compte**
      dans le bloc d'identité, sans champ pour la saisir, avec « L’adresse e-mail est celle de votre compte. Une fois
      la fiche créée, seul un administrateur peut changer l’établissement. » ; le pied dit « Aucun champ rempli »
      et « Relire ma fiche » est grisé. **Rien** n'est écrit à l'ouverture (onglet Réseau, `BDD`).
- [ ] **Établissement** : une liste déroulante (« Choisir… » tant que rien n'est choisi) qui propose les
      établissements **fondateurs et partenaires** par leur sigle, jamais une structure « autres » ; sa recherche,
      en haut du panneau, ne garde en direct que ce qui répond. Au clavier, Entrée ou ↓ l'ouvre, ↓ et ↑ parcourent,
      Entrée choisit, Échap ne ferme que le panneau (pas la fenêtre). Sur un téléphone, le panneau s'ouvre sans
      ouvrir le clavier et chaque valeur se touche sans viser.
- [ ] Pas de carte « Photo de profil », même quand `BDD` a une colonne `Avatar` : la photo s'ajoute ensuite, depuis
      « Modifier mon profil » (section 18).
- [ ] La case **« Apparaître dans l’annuaire »** est cochée d'avance, avec sa phrase (« Décochée, votre fiche est
      créée mais reste masquée jusqu’à ce que vous activiez l’interrupteur en haut de page. ») ; elle ne compte pas
      parmi les champs remplis.
- [ ] Un formulaire que personne n'a commencé ne réclame rien. Dès qu'un champ est rempli, le pied dit « Indiquez au
      moins un prénom ou un nom » puis « Choisissez votre établissement » (aussi sous le champ), et « Relire ma
      fiche » reste grisé jusqu'à ce que les deux soient réglés.

**E-mail affiché** (colonne `email_affiche`)

- [ ] **Sans** la colonne : ni « Créer ma fiche » ni « Modifier mon profil » n'ont le champ « E-mail affiché », la carte
      montre `email`. **Avec** : le champ est entre la fonction et le téléphone, pour tout le monde (aussi pour un
      administrateur qui modifie la fiche d'une autre personne), avec sa phrase « Facultatif : l’adresse montrée sur
      la carte. Laissée vide, la carte montre l’adresse du compte. »
- [ ] Remplir « E-mail affiché » (par exemple `Contact@Etablissement.example`) puis valider : la relecture repère le
      changement d'adresse ; dans Grist, **seule** la colonne `email_affiche` a changé, **en minuscules** ; la carte
      et son lien `mailto:` montrent cette adresse ; `email` (l'identité) est intact ; la personne garde « Votre
      fiche » et « Modifier » (l'annuaire la reconnaît toujours par l'adresse de son compte).
- [ ] Vider le champ puis valider : `email_affiche` est vide dans Grist, la carte revient à l'adresse du compte.
- [ ] Une adresse mal formée, qui commence par `=`, `+`, `-` ou `@`, de plus de 200 caractères ou sur plusieurs
      lignes : refusée sous le champ, « Corrigez l’adresse e-mail » au pied, « Relire » grisé. Une adresse que montre
      déjà une autre fiche : acceptée.
- [ ] Règles d'accès : un compte ordinaire ne peut pas écrire `email_affiche` sur la fiche d'un autre (console,
      contexte de l'iframe du widget). Si la règle ne l'autorise pas sur **sa** fiche, « Grist a refusé la
      modification… » et rien n'est écrit.

**Relire et publier**

- [ ] « Relire ma fiche » : « Relire avant de publier », **une seule carte** (« Ma fiche », telle qu'elle apparaîtra,
      sans carte « Avant »), puis « Ce qui sera enregistré » ; aucun avis quand rien ne retient la fiche. Avec la
      case décochée, le titre est « Relire avant de créer » et l'avis dit « Votre fiche est masquée de l’annuaire :
      vous n’avez pas accepté d’apparaître… » ; avec un établissement qui n'a pas validé sa présence, « Votre
      établissement n’a pas validé sa présence : votre fiche reste masquée dans l’annuaire. ». « Retour » garde les
      saisies et le choix de la case ; « Annuler » n'écrit rien.
- [ ] **« Publier ma fiche »** (case cochée) : dans Grist, **une seule ligne ajoutée** à `BDD` (un seul « Annuler » de
      Grist la retire) : `email` = l'adresse du compte **en minuscules**, `Etablissement` = le choix,
      `Accepte_apparaitre` coché, et les champs remplis ; ni `perimetre` ni `Avatar`, et aucune autre table touchée.
      La fenêtre se ferme, le message « Votre fiche est publiée : elle apparaît dans l’annuaire. » s'affiche, la carte
      arrive dans la grille **sans recharger la page** (établissement validé, fondateur ou partenaire), le bandeau
      montre l'interrupteur (allumé) et « Modifier mon profil », il n'y a plus de bouton « Créer ma fiche » et le
      focus revient sur « Modifier mon profil ».
- [ ] Case **décochée** : le dernier bouton est « Créer ma fiche » ; la ligne est écrite avec `Accepte_apparaitre`
      **décoché** ; le message dit « Votre fiche est créée. Pour apparaître dans l’annuaire, activez l’interrupteur
      « Apparaître dans l'annuaire ». », aucune carte, l'interrupteur du bandeau reste éteint ; l'allumer fait
      apparaître la carte.
- [ ] Établissement qui n'a pas validé sa présence (`ok_pour_apparaitre` faux) : la ligne est créée ; le message
      « Votre fiche est publiée, mais elle reste masquée de l’annuaire … Contactez un administrateur. » dit
      pourquoi ; la carte apparaît quand l'établissement valide (recharger le widget).

**Refus, conflits, pannes**

- [ ] **Sans la règle d'ajout sur `BDD`** (étape 4), ou avec une règle qui l'interdit à ce compte : « Grist a refusé la
      création : vos droits ne permettent pas d'ajouter une fiche. Contactez un administrateur. » en haut de la fenêtre,
      qui reste ouverte avec le brouillon ; **rien** n'est écrit. La règle posée, « Publier ma fiche » réussit sans
      refaire la saisie. Depuis la console (contexte de l'iframe du widget), ajouter une ligne qui porte l'adresse
      d'une **autre** personne, `grist.docApi.applyUserActions([['AddRecord', 'BDD', null, {email: '<autre adresse>'}]])`,
      est refusé ; celle qui porte la sienne est acceptée.
- [ ] Si l'adresse de votre compte Grist s'écrit avec des majuscules : **noter** si la règle accepte quand même la
      création (le widget écrit `email` en minuscules ; la condition `rec.email == user.Email` ne les ignore pas,
      `GRIST_SETUP.md`, étape 4).
- [ ] Deux onglets : ouvrir la fenêtre dans l'un, créer la fiche dans l'autre, puis valider le premier : « Une fiche
      porte déjà votre adresse : rien n'a été créé. Rechargez la page pour la retrouver. » ; `BDD` ne porte qu'**une**
      ligne à cette adresse ; une fois la page rechargée, « Modifier mon profil » ouvre cette fiche.
- [ ] Une colonne de la fiche que Grist ne garde pas (colonne qui recalcule la valeur) : la fiche est créée, la
      fenêtre reste ouverte sur « Fiche créée » (« Votre fiche est dans l’annuaire Grist. ») avec la réserve et la liste
      « Ce qui a été enregistré » ; « Fermer » la ferme, sans message de confirmation.
- [ ] Échap avec des saisies : un premier appui avertit, un second ferme sans rien écrire ; pendant l'envoi, Échap ne
      ferme pas. Double clic sur « Publier ma fiche » : **une** ligne.
- [ ] Console : aucune adresse ni valeur de la fiche dans les lignes écrites par le widget ; un échec écrit
      `[PROFIL] création impossible : …` (ou `[PROFIL] lecture de BDD impossible : …`).

**Après la création**

- [ ] « Modifier mon profil » ouvre la fiche créée : l'adresse et l'établissement sont verrouillés, la carte « Photo de
      profil » est là si `Avatar` existe, et l'interrupteur « Ma présence » décoche puis recoche `Accepte_apparaitre`.
- [ ] Un administrateur, mode admin allumé, peut changer l'établissement de la fiche créée (même liste déroulante à
      recherche, sigles des fondateurs et des partenaires).

**La table-sonde créée par le widget** (1.20.0 ; avec un compte propriétaire, la table `Annuaire_Sonde` supprimée de la
copie, ainsi que ses deux règles d'accès, à reposer à la fin)

- [ ] Au premier chargement, le widget crée la table : la console dit `[IDENTITE] table « Annuaire_Sonde » absente :
      créée (GRIST_SETUP.md, étape 2).` puis `[IDENTITE] personne identifiée (…)`. Dans les données brutes, la table a
      trois colonnes, `Email` (Texte), `Admin` (Case à cocher) et `Responsable_de` (Texte), des colonnes de **données**
      dont la **formule de déclenchement** (`user.Email`, puis la recherche dans `ACL`) ne s'applique qu'aux nouveaux
      enregistrements ; elle est vide et le bandeau « Ma présence » est là. **Noter** ce que Grist en fait (le panneau
      « Colonne » de chaque colonne, la valeur d'`Email` d'une ligne ajoutée à la main) : c'est ce que les tests ne
      peuvent pas dire.
- [ ] Recharger, puis rouvrir avec un autre compte : plus de création (la console ne dit plus « créée »), aucune table
      `Annuaire_Sonde2`, colonnes et formules **intactes** (changer une formule puis recharger : elle est respectée).
- [ ] Table absente et compte qui ne peut pas modifier la structure du document (règle d'accès, ou « Voir en tant que »
      un compte à qui elle est refusée) : la console dit `[IDENTITE] table « Annuaire_Sonde » introuvable, et Grist n'a
      pas permis de la créer : … (voir GRIST_SETUP.md)`, aucun bandeau, l'annuaire s'affiche comme avant, rien n'est
      écrit. Un compte Lecteur n'essaie rien.
- [ ] Deux comptes qui ouvrent l'annuaire au même instant sur un document sans la table (à défaut, plusieurs ouvertures
      de suite) : il ne reste qu'**une** table `Annuaire_Sonde`, jamais de `Annuaire_Sonde2` ; la console du second dit
      « déjà créée par une autre personne ».
- [ ] Reposer ensuite les **deux règles d'accès** de la sonde (`GRIST_SETUP.md`, étape 4) et rejouer les points de la
      section 11.

**Clavier, lecteur d'écran, mise en page**

- [ ] Tout se fait au clavier : « Créer ma fiche », les champs, la liste déroulante, la case, « Relire ma fiche »,
      « Publier ma fiche ». Un anneau de focus visible à chaque arrêt ; à la fermeture, le focus revient sur « Modifier
      mon profil » (le bouton « Créer ma fiche » a disparu).
- [ ] Lecteur d'écran (au moins une fois) : la case est lue « Apparaître dans l’annuaire » puis sa phrase, la liste
      déroulante est annoncée par son nom, « Choisissez votre établissement. » est lu avec son champ, le message de fin
      est annoncé une seule fois.
- [ ] En réduisant la section du widget de 1280 à 320 px : la fenêtre tient dans l'écran, la liste déroulante s'ouvre
      sans dépasser, la case reste visible, le bouton « Créer ma fiche » du bandeau ne chevauche rien, rien ne déborde.
- [ ] Comparaison à la maquette v5 : ouvrir la maquette et le widget côte à côte à la même largeur (1280 px, puis
      390 px). Les écarts voulus sont dans le CHANGELOG (1.18.0, 1.25.0 et 1.28.0).

## 20. Rôle dans une tâche (1.26.0)

Réglages d'abord : aucun, si la table `Taches` a sa colonne `Taches_role` (facultative : sans elle, aucun rôle ne
s'affiche et rien n'est signalé). À jouer sur une **copie** du document, avec un compte dont les cartes portent des
tâches. **Ce protocole est le seul contrôle de la lecture de `Taches_role` dans un vrai Grist : les tests
automatiques simulent `fetchTable`.** Le rôle se retrouve par les identifiants de lignes que Grist envoie pour
`BDD.Taches` (une liste `['L', 12, 15]`) ; si Grist les envoyait déjà résolus en texte, aucun rôle ne s'afficherait
(comportement prévu, mais à constater ici).

- [ ] **Les lignes brutes, pas le libellé corrigé.** Deux lignes brutes de `Taches` ont le même libellé corrigé (donc une
      seule étiquette sur les cartes) et des `Taches_role` différents (« Pilote », « Contributeur »). Une personne qui
      les porte toutes les deux voit l'étiquette dire les deux (« Rôles : Pilote, Contributeur »), sans doublon ;
      une autre personne qui n'a que l'une de ces lignes ne voit que **son** rôle, jamais celui d'une ligne voisine qui
      partage l'étiquette.
- [ ] Souris : survoler l'étiquette d'une tâche qui a un rôle ouvre une bulle « Rôle : Pilote » au-dessus de
      l'étiquette, entière dans le cadre ; la quitter la ferme ; un clic sur l'étiquette filtre toujours sur la tâche.
- [ ] Clavier : Tab jusqu'à l'étiquette ouvre la même bulle ; Échap la ferme (sans fermer autre chose). Lecteur
      d'écran (au moins une fois) : le rôle est lu avec la tâche.
- [ ] Téléphone (écran tactile, ou émulation) : pas de bulle ; le rôle est écrit sous le nom de la tâche, dans
      l'étiquette.
- [ ] Rôle vide, colonne `Taches_role` renommée ou absente, ligne sans libellé corrigé (jamais affichée) : l'étiquette
      est inchangée, ni bulle ni message, et la console ne dit rien.
- [ ] La carte « Après » de la relecture d'une modification de fiche ne montre pas le rôle (il ne s'y modifie pas) ;
      enregistrer une fiche ne change aucune ligne de `Taches` : `Taches_role` est intact dans Grist.
- [ ] Changer un rôle dans Grist : recharger le widget pour le voir.

## 21. Rapidité à grande échelle (1.29.0)

Réglages d'abord : aucun. À jouer dans le vrai Grist, sur une **copie** du document pour les points qui modifient
une fiche. **Ce protocole est le seul contrôle de ces dispositifs dans un vrai Grist et sur un vrai Firefox mobile :
les mesures de l'audit (500 à 20 000 lignes) viennent de Chromium, sur des données synthétiques et sans Grist.**

- [ ] **Un seul chargement.** Ouvrir la console du navigateur, recharger la page de Grist : une seule ligne
      `[GRIST] Enregistrements reçus: …` au chargement. Deux lignes à 0,25 s d'écart voudraient dire que Grist
      rappelle `onRecords` de lui-même au démarrage : rien de faux à l'écran, mais une lecture de plus. Pour
      revenir à l'ancienne attente, enlever le test `first` de `debounce()` (`grist-data.js`).
- [ ] **Aucune erreur 404 dans la console** au chargement (l'onglet « Réseau » ne montre aucun module introuvable) :
      la liste `<link rel="modulepreload">` de `index.html` nomme des fichiers qui existent.
- [ ] **Défilement.** Descendre jusqu'en bas de l'annuaire à la molette et à la barre de défilement : les cartes
      se dessinent avant d'arriver à l'écran (aucune carte vide qui se remplit sous les yeux) ; la barre peut se
      corriger un peu en cours de route (la hauteur d'une carte jamais vue est estimée à 480 px). Les photos des
      cartes lointaines arrivent à l'approche de la carte.
- [ ] **Recherche du navigateur et clavier.** Ctrl+F d'un nom loin sous l'écran : le navigateur le trouve et y
      mène, la carte est dessinée. Tab depuis le premier bouton d'une carte parcourt toutes les cartes, dans
      l'ordre, sans en sauter.
- [ ] **Les cartes ne se périment pas.** Dans Grist, modifier la fonction d'une personne affichée (copie du document) :
      la carte du widget montre la nouvelle valeur après sa relecture, sans recharger la page. Allumer puis
      éteindre le « mode admin » : les boutons « ✎ Modifier la fiche » apparaissent sur toutes les cartes, y
      compris celles déjà vues avant, puis disparaissent toutes.
- [ ] **Recherche et filtres vifs.** Taper dans la recherche, cocher un filtre, allumer et éteindre « Partenaires » : la
      grille répond sans attente visible, sur l'annuaire entier, y compris sur le téléphone.
- [ ] **Navigateurs sans `content-visibility`** (Firefox avant la 125, Safari avant la 18) : la règle est ignorée,
      toutes les cartes sont dessinées comme avant la 1.29.0 ; rien ne change à l'écran, seule la rapidité
      sur un très grand annuaire est moindre.


## 22. Politique de sécurité de contenu (1.29.1)

Réglages d'abord : aucun. À jouer dans le vrai Grist, la console du navigateur (F12) ouverte **avant** de recharger la page,
sur un ordinateur puis sur un téléphone. **Ce protocole est le seul contrôle de la politique de `index.html` dans un vrai
Grist : les tests la vérifient sur un Grist simulé, dont le script ne demande rien de plus que ce qu'elle laisse passer.** Si
une case échoue, la cause probable est une ressource que la politique refuse, et la console dit laquelle.

- [ ] **Aucun refus dans la console.** Recharger la page de Grist qui contient le widget, chercher « Content Security Policy »
      et « Refused to » dans la console : aucune ligne. Une ligne comme « Refused to load the script/stylesheet/image …
      because it violates the following Content Security Policy directive » nomme la directive et l'adresse refusées :
      les relever, puis ajouter l'origine à la directive (`docs/developpeurs.md`, recette « Charger une ressource d'un autre
      site ») ou revenir en arrière (dernière case).
- [ ] **Le widget s'ouvre comme avant.** Les cartes, les financeurs, le bandeau du bas, les filtres et leurs menus, la
      recherche, le bandeau « Ma présence » : rien ne manque ni ne change par rapport à la 1.29.0 (sections 1 à 6, 11).
- [ ] **Les logos et les photos s'affichent** (sections 14 et 18). Si seuls ceux-là manquent et que la console dit
      `img-src`, l'adresse des pièces jointes de Grist n'est pas en `https` : relever laquelle.
- [ ] **Le choix d'une image montre son aperçu** (sections 17 et 18) : « ✎ Modifier » sous un logo, ou « ✎ Modifier mon
      profil » puis « Photo de profil », choisir un fichier : l'aperçu apparaît (images `blob:` et `data:`).
- [ ] **L'envoi d'une image aboutit** (sur une copie du document, sections 17 et 18) : la requête d'envoi n'est pas refusée
      (`connect-src`) et l'image s'affiche ensuite.
- [ ] **Les fenêtres de modification** (sections 13 et 17) s'ouvrent, se valident et se ferment comme avant : le script de
      Grist ajoute une balise `<style>` au document, que `style-src 'unsafe-inline'` laisse passer.
- [ ] **Essai sans `'unsafe-eval'` (facultatif).** Retirer `'unsafe-eval'` de `script-src` dans une copie de `index.html` servie
      pour l'essai (dans Chrome, les remplacements locaux des outils de développement évitent de publier), recharger :
      si la console ne dit rien de plus et si tout ci-dessus marche, le retirer pour de bon dans `index.html` et dans
      `docs/securite.md` (`tests/csp.test.mjs` les compare).
- [ ] **Firefox et Safari** (ordinateur et téléphone) : les mêmes contrôles. Ces navigateurs ne disent pas les refus avec
      les mêmes mots, mais le résultat visible doit être le même.
- [ ] **Retour en arrière** si le widget ne s'ouvre pas ou s'ouvre incomplet : supprimer la balise
      `<meta http-equiv="Content-Security-Policy" …>` de `index.html` (le reste du code n'en dépend pas) et noter ce que la
      console avait dit.
