# Documentation développeur

Cette page explique comment le widget est construit et comment le modifier sans le casser : infrastructure, chargement des données, règles d'affichage, tests, déploiement. Elle suppose de savoir lire du JavaScript ; aucune connaissance de Grist n'est requise, les notions utiles sont rappelées au fil du texte.

Pages liées : [README](../README.md) (présentation et installation), [guide utilisateur](utilisateurs.md), [sécurité](securite.md), [maintenance](maintenance.md).

> **Cette page décrit la version 1.13.0** : le widget lit la table `BDD` (1.8.0), range les compétences par domaine (un filtre « Domaines » en 1.9.0, intégré depuis au menu Compétences, 1.13.0), s'adapte à la largeur de son cadre (1.9.1), n'affiche que les personnes qui ont accepté d'apparaître (1.10.0), laisse la personne connectée choisir d'apparaître ou non, « Ma présence » (1.11.0), puis modifier sa fiche (celle de toute personne affichée, pour un administrateur) après une relecture de la carte avant et après (1.12.0). Cette modification s'applique directement : il n'y a ni validation par un administrateur ni historique tenu par le widget. Ce qui n'est pas encore là est résumé dans [Chantiers en cours](#chantiers-en-cours).

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Organisation du code](#organisation-du-code)
- [Chargement des données](#chargement-des-données)
- [Données Grist : structure et encodages](#données-grist--structure-et-encodages)
- [Règles d'affichage](#règles-daffichage)
- [Identité et « Ma présence »](#identité-et--ma-présence-)
- [Modifier une fiche](#modifier-une-fiche)
- [Filtres, compteurs et recherche](#filtres-compteurs-et-recherche)
- [Rendu des cartes et des menus](#rendu-des-cartes-et-des-menus)
- [Fiabilité : que se passe-t-il en cas de panne ?](#fiabilité--que-se-passe-t-il-en-cas-de-panne-)
- [Tests](#tests)
- [Données et captures de démonstration](#données-et-captures-de-démonstration)
- [Recettes](#recettes)
- [Conventions](#conventions)
- [Versions, déploiement et CI](#versions-déploiement-et-ci)
- [Chantiers en cours](#chantiers-en-cours)

## Vue d'ensemble

Le widget est une page web statique : HTML, CSS et JavaScript natif en modules ES. Il n'y a ni compilation, ni bundler, ni dépendance npm à l'exécution. Grist l'affiche dans une iframe sur une page de document et lui fournit son API de widget (`grist-plugin-api.js`) pour lire les tables du document et, dans trois cas précis, y écrire.

```mermaid
flowchart LR
    subgraph grist["Instance Grist"]
        direction TB
        doc[("Document Grist<br/>tables de l'annuaire")]
        page["Page du document<br/>iframe du widget"]
        doc <-->|"API de widget<br/>onRecords, fetchTable, listTables,<br/>applyUserActions"| page
    end
    subgraph github["GitHub"]
        direction TB
        repo["Dépôt<br/>lombre33/Annuaire_PUI_Bordeaux"]
        pages["GitHub Pages<br/>fichiers statiques"]
        ci["GitHub Actions<br/>node --test"]
        repo -->|"push sur main"| pages
        repo -->|"pull request, push sur main"| ci
    end
    api["docs.getgrist.com<br/>grist-plugin-api.js"]
    pages -->|"index.html, main.js, style.css…"| page
    api -->|"script de l'API de widget"| page
```

| Élément | Rôle | Où |
|---|---|---|
| Document Grist | Source unique des données : il sert de base de données et d'API back-end (voir [`specs.md`](../specs.md)) | Instance Grist de l'organisation |
| Dépôt GitHub | Code du widget, tests, documentation | <https://github.com/lombre33/Annuaire_PUI_Bordeaux> |
| GitHub Pages | Sert les fichiers à l'URL déclarée dans [`manifest.yml`](../manifest.yml) | <https://lombre33.github.io/Annuaire_PUI_Bordeaux/> |
| `grist-plugin-api.js` | API de widget de Grist. `index.html` la charge depuis `docs.getgrist.com`, sans version figée | `index.html` |
| GitHub Actions | Exécute `node --test` à chaque pull request et à chaque push sur `main` | `.github/workflows/tests.yml` |

Ce que le widget fait, dans la version 1.13.0 :

- il **lit** les tables du document Grist : neuf lectures `fetchTable` par chargement de l'annuaire et, pour savoir qui est connecté, la liste des tables (`listTables`) puis la table-sonde. Quand une personne prépare la relecture d'une modification, il relit aussi `BDD` (puis une dernière fois juste avant d'écrire) et lit les tables de métadonnées `_grist_Tables` et `_grist_Tables_column` (`schema.js`) ;
- il **écrit** dans trois cas seulement, toujours à l'initiative d'un chargement ou d'un clic, jamais en tâche de fond :
  1. à chaque chargement, il ajoute puis supprime une ligne de la table-sonde `Annuaire_Sonde` (`identity.js`), sauf pour un compte Lecteur ou quand la table n'existe pas ;
  2. quand la personne connectée actionne l'interrupteur « Ma présence », il écrit la case `Accepte_apparaitre` de sa ou de ses lignes de `BDD` (`presence.js`), en une seule action atomique ;
  3. quand une personne valide la relecture de la modification de sa fiche (un administrateur : de la fiche d'une personne affichée), il écrit les colonnes modifiées de cette seule ligne de `BDD` (`profile-save.js`), en une seule action atomique, sans validation ni historique tenu par le widget.

  Il ne crée ni ne modifie jamais la structure du document (tables, colonnes) ;
- il ne stocke rien dans le navigateur et n'émet lui-même aucune requête réseau ;
- il demande l'accès `full` (`grist.ready({ requiredAccess: 'full' })` dans `main.js`, `accessLevel: full` dans `manifest.yml`), un choix assumé : il lit plusieurs tables autres que celle de sa section et écrit dans le document. Les conséquences et les garde-fous sont détaillés dans [sécurité](securite.md#niveau-daccès-demandé-à-grist).

## Organisation du code

```mermaid
flowchart TD
    main["main.js<br/>état, événements, câblage Grist"]
    subgraph annuaire["L'annuaire"]
        render["render.js<br/>construction du DOM"]
        filters["filters.js<br/>filtrage et compteurs"]
    end
    subgraph personne["La personne connectée"]
        identity["identity.js<br/>qui est connecté ?"]
        presence["presence.js<br/>choix d'apparaître"]
        account["account-ui.js<br/>bandeau Ma présence"]
    end
    subgraph fiche["Modifier une fiche"]
        profile["profile.js<br/>droits, formulaire, changements"]
        save["profile-save.js<br/>relire, écrire"]
        preview["preview.js<br/>cartes avant et après"]
        schema["schema.js<br/>type des colonnes"]
        profileui["profile-ui.js<br/>la fenêtre"]
        changes["changes-ui.js<br/>liste Ce qui change"]
        dom["dom.js<br/>el()"]
    end
    data["grist-data.js<br/>lecture et enrichissement"]
    constants["constants.js<br/>taxonomie, tables et colonnes"]
    main --> render
    main --> filters
    main --> data
    main --> identity
    main --> presence
    main --> account
    main --> profile
    main --> save
    main --> profileui
    render --> data
    render --> constants
    render --> filters
    filters --> data
    filters --> constants
    identity --> data
    identity --> constants
    presence --> constants
    data --> constants
    profile --> data
    profile --> constants
    save --> data
    save --> constants
    save --> presence
    save --> profile
    save --> preview
    save --> schema
    preview --> data
    preview --> constants
    schema --> data
    schema --> constants
    profileui --> data
    profileui --> constants
    profileui --> dom
    profileui --> profile
    profileui --> changes
    changes --> constants
    changes --> dom
```

Une flèche signifie « importe » ; tous les `import` des fichiers à la racine y figurent.

| Fichier | Rôle |
|---|---|
| `index.html` | Squelette de la page, `<template id="cardTemplate">` d'une carte, `<dialog id="profileDialog">` de la fenêtre de modification, chargement de l'API Grist puis de `main.js` |
| `style.css` | Feuille de style unique (variables de couleur en tête de fichier) |
| `constants.js` | Noms de la table principale (`MAIN_TABLE`, soit `BDD`), de la case de consentement (`CONSENT_COLUMN`, soit `Accepte_apparaitre`) et de la table-sonde (`PROBE_TABLE`, soit `Annuaire_Sonde`), puis taxonomie : `CATEGORIES` donne, pour chaque catégorie, son libellé, sa couleur, sa table de référence, ses colonnes de libellé et, sauf pour l'établissement et le rôle (des Références simples), sa colonne de liste dans la table principale. `FILTERS`, `TAG_GROUPS`, `REFERENCE_TABLES`, `REFERENCE_SOURCES` et `LIST_CATEGORIES` en sont dérivés. `PROFILE_FIELDS` liste ce qu'une personne peut modifier sur sa fiche (colonne, libellé, nature : texte, téléphone, référence ou liste) |
| `grist-data.js` | Lecture des tables (`loadDirectory()`), décodage des formats Grist, enrichissement des contacts, règles d'éligibilité et de consentement (`hasAccepted()`, `buildContacts()`), l'index des personnes par adresse e-mail ou par identifiant de ligne (`createPeopleIndex()`, dont `findByEmail()` et `findById()`), `describeVisibility()` et `displayName()` (le nom d'un contact tel que les cartes l'affichent) |
| `filters.js` | Forme de l'état des filtres (`createEmptyFilterState()`), `filterContacts()`, `computeFilterCounts()`, `pruneStaleFilters()`, et le menu rangé par groupe (les compétences par domaine) : `menuGroups()`, `groupState()`, `toggleGroup()`, `selectionCount()` |
| `render.js` | Construction du DOM : menus de filtre (`createFilterUI()`, dont le menu Compétences rangé par domaine) et cartes (`renderCards()`, avec le bouton « Modifier » des fiches que la personne peut modifier) ; cartes de relecture sans interaction (`renderPreviewCard()`), où ce qui change est repéré ; `initials()` sert aussi au bandeau « Ma présence » |
| `identity.js` | `readIdentity()` : qui est connecté ? Ajoute une ligne dans la table-sonde `Annuaire_Sonde` (dont Grist calcule l'adresse par une formule `user.Email`), la relit par son identifiant puis la supprime. Renvoie l'adresse et la case administrateur, ou « personne » au moindre doute ; ne bloque jamais l'annuaire |
| `presence.js` | « Ma présence » : `describePresence()` dit à la personne si elle apparaît et pourquoi, `setPresence()` écrit son accord (`Accepte_apparaitre`) sur sa ou ses lignes en une seule action atomique. `describeHiddenFiche()` dit, à la relecture d'une modification, pourquoi la fiche modifiée ne figurerait pas dans l'annuaire ; `classifyWriteError()` range un refus de Grist (règle d'accès, colonne à formule, autre) et sert aussi à `profile-save.js` |
| `account-ui.js` | Le bandeau « Ma présence » au-dessus des filtres, avec le bouton « Modifier mon profil » (`setActions()`) : construit le DOM à partir de ce que décrit `describePresence()`, sans règle métier |
| `profile.js` | Modifier une fiche, sans DOM ni Grist : `rightsFor()` (qui peut modifier quelle fiche : la sienne, ou toutes pour un administrateur ; fermé par défaut), `profileFormModel()` et `draftOf()` (ce que le formulaire propose), `diffProfile()` (ce que la personne a changé, sous forme de delta, et pourquoi une saisie serait refusée), `rebaseChanges()` (ramener ces changements sur la fiche telle qu'elle est maintenant dans Grist) et `describeChanges()` (la liste « Ce qui change ») |
| `profile-save.js` | Relire puis écrire une fiche : `prepareReview()` relit la fiche dans Grist et prépare les cartes avant et après, `saveProfile()` écrit en une seule action atomique (`UpdateRecord`), et seulement si les champs touchés n'ont pas changé depuis la relecture (`signatureOf()`). `buildRowUpdate()` calcule les valeurs à écrire sur la fiche telle qu'elle est au moment d'écrire, `readRow()` la relit, `unsavedLabels()` dit ce que Grist n'a pas gardé |
| `preview.js` | `previewOf()` : la carte « avant » et la carte « après » (la ligne avec les valeurs qui seront écrites, enrichie comme l'annuaire) ; `diffContacts()` : ce qui les distingue |
| `schema.js` | `readColumnTypes()` : le type des colonnes de `BDD` d'après les métadonnées de Grist, pour écrire le téléphone dans la forme de sa colonne |
| `profile-ui.js` | La fenêtre de modification (`createProfileDialog()`) : formulaire, relecture avant/après, confirmation. DOM seulement |
| `changes-ui.js` | `renderChangeList()` : la liste « Ce qui change » de la relecture et de la confirmation. DOM seulement |
| `dom.js` | `el()` : crée un élément avec sa classe et son texte (jamais du HTML : ce qui vient de Grist reste du texte) |
| `dialogs.css` | Feuille de style de la fenêtre de modification (formulaire, relecture, confirmation) |
| `main.js` | Point d'entrée : détient l'état de l'application, relie `window.grist` et les événements du DOM aux autres modules |

Règles de répartition, à respecter pour que les tests restent possibles sans navigateur :

1. `constants.js`, `grist-data.js`, `filters.js`, `identity.js`, `presence.js`, `profile.js`, `profile-save.js`, `preview.js` et `schema.js` n'utilisent jamais le DOM.
2. Seules `loadDirectory()` et `readColumnTypes()` (lectures), `readIdentity()`, `setPresence()` et les fonctions de `profile-save.js` (`prepareReview()` lit, `saveProfile()` écrit) parlent à Grist, par le `docApi` qu'on leur passe : les tests leur fournissent un faux `docApi` (`tests/support/fake-grist.js`). `profile.js` et `preview.js` ne l'utilisent jamais.
3. `render.js` ne contient aucune règle métier : il reçoit des contacts déjà filtrés et des fonctions de rappel (`onToggle`, et `onToggleGroup` pour la case d'un domaine). Ce qu'il sait d'un menu rangé par groupe (les groupes, l'état d'une case de domaine, le chiffre du bouton) vient des fonctions pures de `filters.js`, d'où la flèche `render.js` → `filters.js` du schéma.
4. `filters.js` n'a pas d'effet de bord : `pruneStaleFilters()` renvoie un nouvel état au lieu de modifier son argument.
5. Seul `main.js` détient l'état de l'application (`state`). La fenêtre de modification ne garde que l'état de sa propre session (étape, brouillon), jeté à sa fermeture ; `profile-ui.js`, `changes-ui.js` et `dom.js` ne contiennent aucune règle métier : `main.js` leur donne ce que les autres modules ont calculé.

## Chargement des données

```mermaid
sequenceDiagram
    participant G as Grist
    participant M as main.js
    participant D as grist-data.js
    participant F as filters.js
    participant R as render.js
    G->>M: onRecords (au chargement, puis à chaque édition de la table principale)
    Note over M: debounce de 250 ms, numéro de requête
    M->>D: loadDirectory(docApi, { previousMaps })
    D->>G: fetchTable × 9, en parallèle
    G-->>D: tables en colonnes
    D-->>M: contacts, referenceMaps, etabFlags, people, issues
    M->>M: applyDirectory : purge des sélections périmées, menus de filtre
    M->>F: filterContacts, computeFilterCounts
    M->>R: renderCards, updateFilterCounts
    M->>M: refreshAccount : bandeau Ma présence
    M->>M: showStatus(issues)
```

1. `main.js` déclare l'accès avec `grist.ready({ requiredAccess: 'full' })` puis s'abonne à `grist.onRecords`.
2. `onRecords` ne sert que de **déclencheur** : son contenu est ignoré. Il ne porte pas forcément toutes les colonnes de `BDD` (selon la vue branchée) et résout les Références en texte, alors que `fetchTable()` renvoie la table complète, les Références en identifiants de ligne. Grist ne rappelle `onRecords` que pour les changements de la table liée à la section du widget : modifier une table de référence ne rafraîchit pas le widget (voir [Limites connues](maintenance.md#limites-connues)).
3. Le rappel est temporisé (anti-rebond : `debounce()`, 250 ms) : une rafale d'éditions ne déclenche qu'une lecture. Chaque lecture reçoit un numéro (`createRequestSequencer()`) et seule la plus récente applique son résultat.
4. `loadDirectory()` enchaîne :
   - `readAllTables()` lit les neuf tables en parallèle avec `Promise.allSettled` : une table illisible ne fait pas échouer les autres ;
   - `requireReadable()` puis `requireColumns()` lèvent une `DirectoryLoadError` si une donnée indispensable manque : table `BDD` ou `Etablissements` illisible, colonne obligatoire absente, y compris `Accepte_apparaitre` (voir [Fiabilité](#fiabilité--que-se-passe-t-il-en-cas-de-panne-)) ;
   - `readReferenceMaps()` construit, pour chaque **catégorie** (`REFERENCE_SOURCES`), la correspondance id → libellé : le libellé corrigé s'il est rempli, le libellé brut sinon. Une table illisible garde les libellés précédents de ses catégories (`previousMaps`). Un regroupement comme « Domaines » est complété ensuite par `completeGroupMap()` ;
   - `etablissementFlagsFromRows()` indexe les indicateurs de chaque établissement (fondateur, partenaire, validé) par identifiant de ligne, et par libellé en repli ;
   - `isInScope()` écarte les lignes sans périmètre ; `buildContacts()` ne garde ensuite que les personnes qui ont accepté d'apparaître (`hasAccepted()`), les enrichit avec `enrich()`, puis ne garde que celles qui ont un nom ou un prénom et un établissement éligible (voir [Règles d'affichage](#règles-daffichage)) ;
   - `createPeopleIndex()` indexe **toutes** les lignes de `BDD`, affichées ou non, par adresse e-mail : c'est ce qui permet à « Ma présence » de retrouver la fiche de la personne connectée et de lui dire pourquoi elle n'apparaît pas (voir [Identité et « Ma présence »](#identité-et--ma-présence-)) ;
   - `describeEmptyDirectory()` explique pourquoi l'annuaire est vide quand c'est anormal, y compris quand personne n'a accepté d'apparaître.
5. `applyDirectory()` (dans `main.js`) restreint le menu Établissement aux établissements validés (`filterVisibleEstablishments()`), retire des filtres actifs les valeurs qui n'existent plus (`pruneStaleFilters()`), reconstruit les menus **seulement si les libellés ont changé** (`referenceMapsEqual()`, car reconstruire ferme les menus ouverts), puis rafraîchit les cartes (`refreshCards()`) et le bandeau « Ma présence » (`refreshAccount()`).
6. `showStatus()` affiche ou masque le bandeau d'état avec les messages de `issues`.

Cette suite est enveloppée dans `reloadDirectory()` (`main.js`), qui renvoie `'applied'`, `'stale'` (une lecture plus récente a pris le relais) ou `'failed'` (le bandeau d'état le dit). `onRecords` l'appelle après le délai d'anti-rebond ; l'interrupteur « Ma présence » et l'enregistrement d'une fiche (`saveReviewed()`) l'appellent directement après leur écriture, pour que l'écran montre ce que Grist a enregistré.

`loadDirectory()` renvoie `{ contacts, referenceMaps, etabFlags, people, issues }` : les contacts éligibles et enrichis, les libellés de chaque catégorie (`referenceMaps`, rangés par **clé de catégorie** et non par table, parce que « Compétences » et « Domaines » lisent la même table `Competences`), les indicateurs des établissements, l'index des personnes par adresse e-mail (`people`) et les messages français destinés au bandeau d'état.

Un contact enrichi garde toutes ses colonnes d'origine et reçoit :

- `labels` : un objet `{ clé de catégorie → liste de libellés }`, lu par `labelsOf(contact, clé)`. Établissement et rôle, qui n'ont qu'une valeur, prennent la même forme de liste pour que les filtres et les tags n'aient aucun cas particulier (la pastille de la carte lit `etablissement_label`) ;
- `etablissement_label` : le texte du badge de la carte ;
- `etablissement_fondateur`, `etablissement_partenaire`, `etablissement_ok_pour_apparaitre` : les indicateurs de son établissement.

## Données Grist : structure et encodages

Les noms de tables et de colonnes lus par le widget sont listés dans [`grist_structure.txt`](../grist_structure.txt), un schéma volontairement **réduit** aux tables et colonnes utiles au widget. Ne jamais y copier le schéma complet du document Grist (voir [sécurité](securite.md#données-dans-le-dépôt)). Le widget lit la table principale `BDD` (une ligne par personne, nommée par `MAIN_TABLE`) et les tables de référence de `CATEGORIES` dans `constants.js` : `Actions`, `Taches`, `Communautes`, `GT`, `Competences`, `INSTANCES` (en majuscules), `Etablissements` et `Role_Dans_le_PUI`. La table `Competences` alimente deux catégories, « Compétences » et « Domaines », et n'est lue qu'une fois par chargement. Les colonnes obligatoires sont `nom`, `prenom`, `Etablissement`, `perimetre` et `Accepte_apparaitre` ; `email`, `Fonction`, `numero_de_telephone` et `Role_dans_le_PUI` sont facultatives : absentes, la carte ne les affiche simplement pas. Sans `email`, en revanche, « Ma présence » ne peut pas retrouver la fiche de la personne connectée. Deux autres tables ne font pas partie de l'annuaire proprement dit : la table-sonde `Annuaire_Sonde`, où `identity.js` ajoute, relit puis supprime une ligne, et `ACL`, que lit la formule de la sonde (jamais le widget) pour savoir qui est administrateur. Leur création est décrite dans [`GRIST_SETUP.md`](../GRIST_SETUP.md).

Grist ne renvoie pas toujours les valeurs sous la forme qu'on attendrait. Les encodages ci-dessous ont presque tous provoqué un bug en production (voir le [CHANGELOG](../CHANGELOG.md)) :

| Ce que Grist envoie | Exemple | Fonction qui le décode |
|---|---|---|
| Table en colonnes | `{ id: [1, 2], nom: ['Ana', 'Bob'] }` | `tableToRows()` |
| Liste (ReferenceList) | `['L', 3, 7]` ; une liste vide vaut `['L']`, pas `[]` | `safeValues()`, `resolveListItem()` |
| Référence simple | identifiant de ligne (`3`, ou `0` quand elle est vide) avec `fetchTable()` ; parfois texte déjà résolu (`'UBM'`) ou `['R', 'Table', 3]` selon la configuration de la table liée | `refId()`, `refLabel()` |
| Colonne numérique | un téléphone `556789012` : le 0 initial est perdu | `formatPhone()` |
| Cellule non renseignée | `''`, `null` ou `0` | `isBlank()` |

Règles à respecter :

- Ne jamais supposer une seule forme pour une Référence ni pour un élément de liste. Un id sans libellé est ignoré, jamais affiché tel quel (« 47 » n'aide personne).
- `BDD.Etablissement` est une Référence **directe** vers la ligne d'`Etablissements`, résolue par identifiant de ligne : c'est la seule source de l'établissement d'un contact (`etablissementFlags()`). Chaque contact garde ainsi le statut de sa propre ligne, même si deux établissements portent le même acronyme. Si Grist envoie la Référence déjà résolue en texte, on se replie sur le libellé (l'acronyme, sinon le nom complet).
- Ne jamais lire la colonne `nom_de_domaine`, ni celle de `BDD` ni celle d'`Etablissements` : règle du projet. `tests/rules.test.mjs` échoue si un fichier `.js`, `.mjs`, `.html` ou `.css` du dépôt la cite.
- `perimetre` ne sert qu'à savoir si elle contient au moins une valeur ([`specs.md`](../specs.md)) ; le widget ne lit pas sa table de référence. L'ancienne table `Annuaire` et ses colonnes `perimetre_*` ne sont plus lues.
- Chaque table de référence porte un libellé brut (celui de l'import) et un libellé corrigé : le corrigé est affiché quand il est rempli, le brut sinon (`field` de chaque entrée de `CATEGORIES`).
- Les compétences sont une liste de références (`BDD.Competences`) vers la table `Competences`. Le domaine d'une compétence est sa colonne `Macro_competences` : celui d'un contact se déduit de ses compétences (la colonne `Comptetences_macr` de `BDD` n'est pas lue).
- `Accepte_apparaitre` (le consentement individuel de la personne) est une colonne de **données** de type case à cocher, pas une formule : Grist refuse d'écrire dans une colonne à formule. Seul `true` vaut accord (`hasAccepted()`) : une case vide, décochée, `0` ou un texte masquent la personne. La colonne est obligatoire, parce que, dans le doute, afficher tout le monde serait pire qu'afficher personne : sans elle, le widget affiche une erreur et aucune carte. Il la lit pour décider qui apparaît (1.10.0) et l'écrit quand la personne actionne l'interrupteur « Ma présence » (1.11.0). La procédure côté Grist est dans [`GRIST_SETUP.md`](../GRIST_SETUP.md).

## Règles d'affichage

Le cahier des charges est [`specs.md`](../specs.md) ; en cas d'écart avec le code, le code et le [CHANGELOG](../CHANGELOG.md) font foi. Une ligne de la table principale (`BDD`) devient une carte si elle franchit toutes les étapes suivantes :

```mermaid
flowchart TD
    A(["Ligne de BDD"]) --> B{{"perimetre contient au moins une valeur ?"}}
    B -- non --> X1["Masqué"]
    B -- oui --> P{{"Accepte_apparaitre est coché ?"}}
    P -- non --> X2["Masqué"]
    P -- oui --> C{{"Nom ou prénom renseigné ?"}}
    C -- non --> X3["Masqué"]
    C -- oui --> D{{"Etablissement renvoie à une ligne d'Etablissements ?"}}
    D -- non --> X4["Masqué"]
    D -- oui --> E{{"ok_pour_apparaitre vaut vrai ?"}}
    E -- non --> X5["Masqué"]
    E -- oui --> F{{"Établissement fondateur ou partenaire ?"}}
    F -- "non (« autres »)" --> X6["Masqué"]
    F -- oui --> G{{"Interrupteur Fondateurs ou Partenaires correspondant actif ?"}}
    G -- non --> X7["Masqué"]
    G -- oui --> H{{"Recherche et filtres satisfaits ?"}}
    H -- non --> X8["Masqué"]
    H -- oui --> V(["Carte affichée"])
```

| Étape | Code |
|---|---|
| `perimetre` non vide | `isInScope()` |
| Accord de la personne (`Accepte_apparaitre` coché) | `hasAccepted()`, appelée par `buildContacts()` |
| Nom ou prénom renseigné | `buildContacts()` |
| Établissement identifié, validé, fondateur ou partenaire | `etablissementFlags()` puis `isEtablissementEligible()` |
| Interrupteurs Fondateurs et Partenaires | `matchesScope()` (`filters.js`) |
| Recherche et filtres | `filterContacts()` |

À savoir :

- Parmi les huit étapes du schéma, les six premières sont appliquées une fois par chargement, dans `loadDirectory()`. Les deux dernières le sont à chaque action de l'utilisateur, dans `main.js` : `refreshCards()` appelle `filterContacts()` sur la liste des contacts éligibles.
- **Les deux accords sont indépendants.** Celui de l'établissement (`ok_pour_apparaitre`, que décident ceux qui valident les établissements) ne remplace pas celui de la personne (`Accepte_apparaitre`, que la personne donne elle-même), et celui de la personne ne contourne pas l'établissement. Seul `true` vaut accord : une case vide, décochée, `0` ou un texte ne suffisent pas.
- `describeVisibility()` reprend ces critères un à un pour une ligne de `BDD` et dit pourquoi elle apparaît ou non. `tests/people.test.mjs` vérifie qu'elle concorde avec `buildContacts()` pour chaque ligne du jeu de test : « Ma présence » ne peut donc pas dire autre chose que l'annuaire. `describeHiddenFiche()` (`presence.js`) reprend le même verdict pour la relecture d'une modification, sans ajouter de règle : « Votre fiche est masquée de l'annuaire : vous n'avez pas accepté d'apparaître (interrupteur « Apparaître dans l'annuaire » en haut de page). » pour la personne concernée, « Cette fiche est masquée de l'annuaire : la personne n'a pas accepté d'apparaître. » pour un administrateur, et, si la personne a accepté mais reste masquée, « Votre fiche reste masquée de l'annuaire : … » ou « Cette fiche reste masquée de l'annuaire : … » suivi de la ou des raisons.
- Un établissement « autres » (une structure extérieure au PUI qui a collaboré à certaines tâches, à la différence des établissements fondateurs et des partenaires) n'est jamais affiché : aucune branche du code ne le rend éligible.
- Un établissement inconnu (`Etablissement` vide, ou sans ligne correspondante dans `Etablissements`) n'a aucun indicateur : le contact est exclu plutôt qu'affiché sans validation.
- La Référence `Etablissement` désigne une ligne par son identifiant : deux lignes de même acronyme ne se mélangent pas. Seul le repli par libellé, quand Grist envoie la Référence déjà résolue en texte, ne peut pas les départager : `etablissementFlagsFromRows()` retient alors le statut le plus strict (vrai seulement s'il l'est partout) et signale le libellé dans `conflicts` : les contacts de ce libellé sont masqués si ce statut ne les rend plus éligibles.
- Par défaut, l'interrupteur Fondateurs est actif et Partenaires ne l'est pas (`state.scope` dans `main.js`, changement de la version 1.7.0). « Réinitialiser » ne les modifie pas. Si les deux sont désactivés, aucune carte ne s'affiche.

## Identité et « Ma présence »

Depuis la version 1.11.0, la personne connectée voit en haut de l'annuaire un bandeau qui lui dit si elle apparaît, et lui laisse l'activer ou la retirer d'un clic. Le widget doit pour cela savoir **qui** est connecté, puis **écrire** son choix. Les réglages à faire dans Grist sont dans [`GRIST_SETUP.md`](../GRIST_SETUP.md) ; le protocole d'essai manuel est la [section 11 de `TESTING.md`](../TESTING.md#11-ma-présence-1110).

### Qui est connecté ?

L'API de widget de Grist ne donne ni l'adresse e-mail ni le nom de la personne : le jeton d'accès du widget est celui du document, pas celui de la session. La seule voie est une **table-sonde**, `Annuaire_Sonde`, dont une colonne a pour formule de déclenchement `user.Email` : Grist la calcule à la création d'une ligne, avec l'identité de la personne qui l'a créée. Une seconde colonne, `Admin`, se calcule de la même façon d'après la table `ACL`.

```mermaid
sequenceDiagram
    participant M as main.js
    participant I as identity.js
    participant G as Grist
    M->>I: readIdentity(docApi, { readOnly })
    alt compte Lecteur (readonly=true dans l'adresse du cadre)
        I-->>M: viewer, aucune écriture
    else
        I->>G: listTables
        I->>G: applyUserActions, AddRecord dans Annuaire_Sonde
        Note over G: formules de déclenchement : Email = user.Email, Admin d'après ACL
        G-->>I: identifiant de la ligne créée
        I->>G: fetchTable Annuaire_Sonde
        G-->>I: la ligne, avec Email et Admin
        I->>G: applyUserActions, RemoveRecord de cette ligne
        I-->>M: ready, adresse et droit d'administrateur
    end
    M->>M: refreshAccount : retrouve la fiche par adresse, affiche le bandeau
```

- `readIdentity()` ne lève jamais d'exception et **échoue en sécurité** : sans table-sonde, sans adresse renvoyée par la formule, si Grist refuse l'écriture ou la relecture, ou pour un compte Lecteur, la personne n'est pas identifiée, aucun bandeau n'apparaît et rien d'autre ne change.
- L'identité est lue **à côté** de l'annuaire (`readIdentity(…).then(…)` dans `main.js`) : elle ne retarde ni ne casse jamais l'affichage des cartes.
- La ligne créée est relue par son **identifiant**, celui que renvoie `applyUserActions`, jamais « la dernière ligne » : deux personnes qui ouvrent le widget au même moment se reconnaissent chacune. Elle est ensuite supprimée au mieux : une ligne orpheline ne gêne personne, la table peut être vidée.
- L'adresse doit avoir la forme d'une adresse e-mail. `admin` n'est vrai que si la formule de Grist renvoie exactement `true` : le droit vient de Grist, jamais d'une valeur que le navigateur déclarerait.
- Un compte Lecteur ouvre le widget avec `readonly=true` dans l'adresse du cadre (`isReadOnlyAddress()`, la dernière valeur l'emporte) : il ne peut rien écrire, pas même la ligne de la sonde, donc le widget n'essaie pas.
- La console dit pourquoi personne n'est identifié (`[IDENTITE] …`), **sans jamais écrire d'adresse** : un test le vérifie.

### Retrouver la fiche et décrire la situation

`refreshAccount()` (`main.js`) retrouve les lignes de `BDD` de la personne par son adresse (`people.findByEmail()`, sans tenir compte de la casse ni des espaces), puis `describePresence()` (`presence.js`) décrit sa situation à partir du verdict de `describeVisibility()` :

| Situation | Ton | Message |
|---|---|---|
| Elle apparaît | `ok` | « Vous apparaissez dans l'annuaire. » Pour un établissement partenaire : « … (visible avec l'interrupteur « Partenaires »). » |
| Elle n'a pas accepté | `off` | « Vous n'apparaissez pas dans l'annuaire. » |
| Elle a accepté, mais reste masquée | `warn` | « Vous avez accepté d'apparaître, mais votre fiche reste masquée : … Contactez un administrateur. » suivi de la ou des raisons : ni prénom ni nom, pas de périmètre, pas d'établissement, établissement non reconnu, non validé, ni fondateur ni partenaire |
| Plusieurs fiches, accord sur une partie seulement | `warn` | « Vous n'avez accepté d'apparaître que sur une partie de vos fiches. » |

`account-ui.js` ne contient aucune règle : `createAccountBar()` reçoit la vue à afficher (nom, initiales, état de l'interrupteur, ton et message de `describePresence()`) et construit le DOM ; elle expose `show()`, `hide()`, `setBusy()` et `setStatus()`.

Quand plusieurs lignes portent la même adresse, la personne en est informée (« N fiches portent votre adresse : votre choix s'applique à toutes. ») et la console le signale, avec des identifiants de ligne et jamais d'adresse. Si aucune ligne ne porte l'adresse, ou si `BDD` n'a pas de colonne `email`, il n'y a pas de bandeau et la console l'explique, une seule fois.

### Écrire le choix

`togglePresence()` (`main.js`) gèle l'interrupteur (`setBusy()` : un double clic n'écrit qu'une fois), puis `setPresence()` envoie **une seule** action atomique à `applyUserActions` : un `UpdateRecord` de `BDD` par ligne de la personne, qui ne porte que `Accepte_apparaitre`, en vrai booléen. Un lot refusé ne change rien : jamais une ligne changée et l'autre non. `reloadDirectory()` relit ensuite tout, si bien que l'interrupteur et les cartes montrent ce que Grist a **vraiment** enregistré, pas ce qu'on espérait. Si la relecture échoue alors que l'écriture a réussi, le bandeau le dit (« Modification enregistrée ; l'annuaire n'a pas pu être rechargé. »).

Une écriture refusée devient une `PresenceError` dont le message est une phrase française (`explainWriteError()`) : règle d'accès (« Grist a refusé la modification… »), colonne à formule (avec renvoi à `GRIST_SETUP.md`) ou message générique. L'erreur d'origine reste dans la console (`[PRESENCE]`).

### Un verrou d'interface, pas une sécurité

Tout ce qui précède est du JavaScript qui tourne dans le navigateur de la personne : il décide quoi **proposer**, il ne protège rien. Quelqu'un qui ouvre la console de son navigateur peut appeler lui-même `grist.docApi.applyUserActions`. Ce sont les **règles d'accès de Grist** qui décident de ce qui est vraiment permis : voir [sécurité](securite.md#écritures-et-règles-daccès).

### Tests

`identity.js`, `presence.js` et l'index des personnes se testent sans navigateur grâce au faux document Grist de `tests/support/fake-grist.js` : `tests/identity.test.mjs`, `tests/people.test.mjs` et `tests/presence.test.mjs`. Ce faux document reproduit ce dont le widget dépend : lectures, écritures atomiques qui renvoient `retValues` comme Grist, formules de déclenchement de la sonde, pannes de lecture, écritures refusées. Les tests navigateur (`tests/support/browser.mjs`, utilisé par `tests/e2e.test.mjs` et `tests/e2e-profile.test.mjs`) et le serveur de démonstration en injectent le texte tel quel dans la page, `export` retiré : ce fichier ne doit donc rien importer.

## Modifier une fiche

Depuis la version 1.12.0, une personne connectée modifie sa propre fiche, et un administrateur celle de toute personne affichée dans l'annuaire. Les modifications s'appliquent **directement** : il n'y a ni validation par un administrateur, ni historique tenu par le widget, ni table créée par lui. Avant d'enregistrer, une fenêtre de relecture montre la carte « Avant » et la carte « Après », avec ce qui change repéré. Les réglages à faire dans Grist (colonnes de données, règles d'accès) sont dans [`GRIST_SETUP.md`](../GRIST_SETUP.md) ; le protocole d'essai manuel est la [section 13 de `TESTING.md`](../TESTING.md#13-modifier-sa-fiche-1120).

### Qui peut modifier quoi

`rightsFor()` (`profile.js`) reçoit l'identité de la personne connectée (voir [Qui est connecté ?](#qui-est-connecté-)) et renvoie une fonction qui dit, pour une ligne de `BDD`, ce que la personne peut en faire. Elle est **fermée par défaut** : sans identité fiable (pas de table-sonde, compte Lecteur…), personne ne peut rien modifier.

| Droit | Quand | Ce que la personne voit |
|---|---|---|
| `'own'` | `email` de la ligne est l'adresse de la personne connectée (casse et espaces ignorés) | « ✎ Modifier » et « Votre fiche » sur sa carte, « Modifier mon profil » dans le bandeau ; fenêtre « Modifier mon profil » |
| `'admin'` | `identity.admin` vaut exactement `true` (case `admin` d'`ACL`) et la ligne est celle d'une autre personne | « ✎ Modifier » sur la carte ; fenêtre « Modifier la fiche de X » |
| aucun | tout le reste | aucun bouton |

Ce que la personne peut changer est déclaré une fois, dans `PROFILE_FIELDS` (`constants.js`) : prénom, nom, fonction, téléphone, rôle dans le PUI (une valeur d'une table de référence) et six listes (instances, actions, GT, compétences, communautés, tâches). **Jamais** `email` (c'est lui qui désigne la personne), `Etablissement` ni `perimetre` (ils décident de qui apparaît : l'affaire des administrateurs, dans Grist), ni `Accepte_apparaitre` (l'interrupteur « Ma présence » l'écrit). Une colonne facultative absente de `BDD` n'est pas proposée.

Les boutons « ✎ Modifier » sont sur les cartes (`fillActions()` dans `render.js`) : un administrateur ne modifie donc pas, depuis le widget, une fiche que l'annuaire masque (pas de carte, donc pas de bouton), ni l'adresse e-mail, l'établissement ou le périmètre d'une fiche. Cela se fait dans Grist. La personne concernée, elle, modifie toujours sa propre fiche par « Modifier mon profil », même si elle n'apparaît pas dans l'annuaire ; ce bouton du bandeau n'est proposé que si une seule ligne porte son adresse. Un seul écouteur sur la grille (`main.js`) ouvre la fenêtre, et `openProfile()` revérifie le droit : un bouton ajouté à la main dans la page n'ouvre rien.

Tout cela est un **verrou d'interface**, pas une sécurité : `rightsFor()` décide de ce que le widget propose, il ne protège rien. Seules les règles d'accès de Grist empêchent vraiment la modification de la fiche d'un autre, ou de `email`, `Etablissement` et `perimetre` : voir [sécurité](securite.md#écritures-et-règles-daccès) et l'étape 4 de [`GRIST_SETUP.md`](../GRIST_SETUP.md). Ces règles n'ont pas été essayées dans un vrai Grist.

### Le parcours

```mermaid
sequenceDiagram
    actor P as Personne
    participant U as profile-ui.js
    participant M as main.js
    participant S as profile-save.js
    participant G as Grist
    P->>M: clic sur « ✎ Modifier » ou « Modifier mon profil »
    M->>M: openProfile : le droit est vérifié (rightsFor)
    M->>U: open : formulaire rempli avec la fiche
    P->>U: modifie les champs
    U->>M: evaluate : diffProfile, ni lecture ni écriture
    P->>U: « Relire mes modifications »
    U->>M: review
    M->>S: prepareReview
    S->>G: fetchTable BDD (readRow)
    G-->>S: la fiche telle qu'elle est maintenant
    S->>G: fetchTable _grist_Tables et _grist_Tables_column
    G-->>S: types des colonnes
    Note over S: rebaseChanges, buildRowUpdate, previewOf, signatureOf
    S-->>U: cartes « Avant » et « Après », « Ce qui change », signature
    P->>U: « Valider »
    U->>M: save
    M->>S: saveProfile
    S->>G: fetchTable BDD (readRow)
    G-->>S: la fiche juste avant l'écriture
    alt les colonnes touchées ont changé depuis la relecture
        S-->>M: status changed, rien n'est écrit
        M->>S: prepareReview : nouvelle relecture
        M-->>U: retour à la relecture, avec un avis
    else
        S->>G: applyUserActions : un seul UpdateRecord de BDD
        G-->>S: accepté
        S-->>M: status saved
        M->>M: reloadDirectory : relit l'annuaire
        M->>M: unsavedLabels : Grist a-t-il gardé ce qui était demandé ?
        M-->>U: « Fiche enregistrée »
    end
```

1. **Ouvrir.** `openProfile()` (`main.js`) retrouve la ligne dans l'index des personnes (`findById()`, qui couvre toutes les lignes de `BDD`), vérifie le droit, construit le formulaire (`profileFormModel()`, `draftOf()`) et ouvre la fenêtre (`createProfileDialog()`). La fiche montrée est celle du dernier chargement de l'annuaire : rien n'est lu dans Grist à ce stade.
2. **Saisir.** À chaque frappe, `diffProfile()` compare le brouillon à la fiche : le résumé du pied de fenêtre (« Aucune modification », « Corrigez les champs signalés » ou le nombre de champs modifiés), les messages sous les champs refusés et le bouton « Relire mes modifications » en dépendent. Ni lecture ni écriture.
3. **Relire.** `prepareReview()` relit la fiche, y ramène les changements (`rebaseChanges()`), calcule les valeurs à écrire (`buildRowUpdate()`), puis en tire les deux cartes (`previewOf()`) et la liste « Ce qui change » (`describeChanges()`). La carte « Après » est la ligne de `BDD` avec les valeurs à écrire, enrichie par le même `enrich()` que l'annuaire : elle montre ce que l'annuaire affichera. Si la fiche modifiée ne figurerait pas dans l'annuaire, la relecture le dit, avec la raison (`describeHiddenFiche()`).
4. **Valider.** `saveProfile()` relit la fiche une dernière fois, compare sa signature à celle de la relecture (voir plus bas), puis envoie **une seule** action `UpdateRecord` sur cette ligne de `BDD` : tout ou rien.
5. **Vérifier.** `reloadDirectory()` relit tout l'annuaire, puis `unsavedLabels()` compare la fiche relue à ce qui était demandé : si Grist n'a pas gardé un champ, la confirmation le dit.

**Rien n'est écrit avant « Valider ».** Le formulaire, `diffProfile()`, `prepareReview()`, « Retour » (qui ramène au formulaire avec le brouillon intact), « Annuler », la croix et Échap n'écrivent rien : le seul appel à `applyUserActions` de ce parcours est celui de `saveProfile()`.

### Un delta, pas une copie de la fiche

Pendant que la personne remplit le formulaire, d'autres peuvent modifier la fiche, et le formulaire ne montre pas tout (la valeur d'une liste dont la ligne de référence n'a plus de libellé n'a pas de pastille). Écrire une copie de la fiche telle que le formulaire l'a montrée écraserait ce que les autres ont changé et perdrait ce qu'il ne montre pas. `diffProfile()` calcule donc un **delta**, qui ne contient que ce qui change :

| Champ | Forme du delta | Écriture |
|---|---|---|
| Texte (prénom, nom, fonction) et téléphone | `{ avant, apres }` | la nouvelle valeur remplace celle de la fiche |
| Référence (rôle dans le PUI) | `{ avant: { id, label }, apres: { id, label } }` | l'identifiant de la nouvelle ligne |
| Liste | `{ ajout: [...], retrait: [...] }` | les retraits sont ôtés et les ajouts ajoutés à la liste **actuelle** de la fiche (`['L', ...conservées, ...ajoutées]`), rien d'autre |

`rebaseChanges()` ramène ensuite ce delta sur la fiche telle qu'elle est maintenant dans Grist : un texte, un téléphone ou une référence repart de sa valeur actuelle et disparaît du delta si la fiche a déjà la valeur voulue ; une liste garde ses ajouts et ses retraits, moins ceux qui sont déjà faits ; `moved` nomme les champs dont la valeur a changé dans Grist depuis l'ouverture du formulaire, ce que la relecture dit. `buildRowUpdate()` produit enfin les cellules à écrire, sur la fiche **au moment d'écrire** : `saveProfile()` le refait avec la ligne qu'il vient de relire, si bien qu'un tag ajouté entre-temps par un autre n'est pas perdu. Il refuse une liste qui contient autre chose que des identifiants de ligne, une colonne absente de `BDD` et une fiche qui n'aurait plus ni prénom ni nom. Le **téléphone** s'écrit dans la forme de sa colonne : un nombre si elle est numérique (le 0 initial est perdu, l'affichage le rétablit), un texte sinon ; vidé, il devient une cellule vide.

### Détecter un changement concurrent

`signatureOf()` renvoie le contenu des seules colonnes touchées, sérialisé. `prepareReview()` la calcule sur la fiche relue et la range dans la relecture ; `saveProfile()` relit la fiche et la recalcule. Si elle diffère, quelqu'un d'autre a modifié, depuis la relecture, une colonne que la personne modifie (même par un simple ajout dans la même liste) : **rien n'est écrit**, `saveProfile()` renvoie `{ status: 'changed', row }` et `saveReviewed()` (`main.js`) refait la relecture sur la fiche actuelle. La fenêtre y revient avec l'avis « La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau. » : la personne n'écrit jamais par-dessus une valeur qu'elle n'a pas vue. Un changement fait par un autre dans une colonne qu'elle ne touche pas n'entre pas dans la signature et reste en place, puisque seules les colonnes touchées sont écrites.

Limite : la relecture de la fiche et l'écriture sont deux appels successifs, pas une transaction. Un changement qui arriverait entre les deux ne serait pas vu.

### Les échecs

Un échec attendu devient une `ProfileSaveError` dont le message est une phrase française, montrée dans la fenêtre (`role="alert"`) ; l'erreur d'origine reste dans la console (`[PROFIL]`). Toute autre erreur est remplacée par « L'opération n'a pas pu aboutir. Le détail est dans la console du navigateur. » (`userFacing()`). La fenêtre reste ouverte sur l'étape où l'échec s'est produit, avec le brouillon intact, et un échec avant l'écriture ne change rien dans Grist. Les cas et leurs messages exacts sont dans le tableau de [Fiabilité](#fiabilité--que-se-passe-t-il-en-cas-de-panne-).

### Accessibilité

- La fenêtre est un vrai `<dialog>` ouvert par `showModal` : modale, le reste de la page est inerte et le focus ne s'en échappe pas. Son titre la nomme (`aria-labelledby`).
- À chaque étape (formulaire, relecture, confirmation), le focus est placé sur le titre (`tabindex="-1"`), que le lecteur d'écran annonce, et non sur un bouton qui vient de disparaître.
- Échap ne fait pas perdre un travail par mégarde : avec des modifications, un premier appui affiche « Des modifications ne sont pas enregistrées. Appuyez encore sur Échap pour les abandonner. » et un second ferme. Pendant l'enregistrement, Échap ne ferme rien.
- À la fermeture, le focus revient à l'endroit d'où la fenêtre a été ouverte : le bouton de la même fiche, retrouvé dans la grille redessinée, ou « Modifier mon profil » dans le bandeau.
- Dans la carte « Après », la couleur n'est jamais le seul repère : une ligne de texte modifiée porte une pastille écrite (« modifié », « ajouté » ou « supprimé »), un tag ajouté un « + », un tag retiré reste visible, barré, et chaque repère est aussi dit en texte réservé aux lecteurs d'écran (`sr-only`).
- Une saisie refusée est rattachée à son champ (`aria-invalid`, `aria-describedby`), le résumé est une zone `aria-live`, les avis ont `role="status"` et les erreurs `role="alert"`.
- Dans un cadre de 560 px ou moins, la fenêtre occupe tout l'écran et les cartes « Avant » et « Après » sont l'une sous l'autre (`dialogs.css`).

### Le type des colonnes (schema.js)

`readColumnTypes()` lit deux tables de métadonnées de Grist avec `fetchTable`, `_grist_Tables` et `_grist_Tables_column`, et renvoie `{ colonne → type }` pour `BDD` (« Text », « Numeric », « Ref:Etablissements »…). Le widget n'en tire qu'une chose : écrire le téléphone dans la forme de sa colonne. `prepareReview()` l'appelle une fois par relecture et range le résultat dans la relecture, que `saveProfile()` réutilise. Si les métadonnées sont illisibles, la fonction renvoie `{}` et la console avertit (`[SCHEMA]`) : le téléphone suit alors la forme de la cellule actuelle. Ce ne sont pas des méthodes d'API nouvelles : seul ce que `fetchTable` lit change.

### Aucune validation, aucun historique

Le widget n'attend la validation de personne, ne tient aucun historique des modifications et ne crée aucune table. Pour savoir qui a changé quoi, il faut sans doute se tourner vers l'historique du document Grist lui-même : ce que Grist y garde exactement n'a pas été vérifié. Selon [`GRIST_SETUP.md`](../GRIST_SETUP.md), le bouton « Annuler » de Grist défait toute la modification d'un geste, puisque c'est une seule action ; cela n'a pas été constaté.

### Tests de la modification

`profile.js`, `profile-save.js`, `preview.js` et `schema.js` se testent sans navigateur avec le faux document de `tests/support/fake-grist.js` (qui sait refuser une ligne précise, `denyRows`, et cache les tables `_grist_*` de `listTables`, comme Grist) : `tests/profile.test.mjs`, `tests/profile-save.test.mjs`, `tests/preview.test.mjs` et `tests/schema.test.mjs`. Le parcours complet, dans Chromium, est `tests/e2e-profile.test.mjs`, qui vérifie aussi la tenue de la fenêtre dans des cadres de 280, 320 et 360 px de large.

## Filtres, compteurs et recherche

`filterContacts(contacts, activeFilters, searchTerm, scope, excludeKey)` combine trois prédicats : `matchesSearch()` (nom ou prénom), `matchesScope()` (interrupteurs) et `matchesSelections()` (menus).

- **OU dans une catégorie, ET entre catégories** : cocher deux instances montre les contacts qui ont l'une ou l'autre ; ajouter un établissement ne garde que ceux qui ont en plus cet établissement.
- **Comparaisons normalisées** : `normalize()` retire les accents et la casse (`NFD`, `toLocaleLowerCase('fr-FR')`). « ecole » trouve « École », et deux écritures d'un même libellé (« Cancérologie », « cancerologie ») ne forment qu'une valeur. Cette fonction sert à la recherche principale, à la recherche interne des menus, aux sélections, aux compteurs et à la suppression des doublons (`uniqueLabels()`) : un contact qui a deux libellés équivalents dans une catégorie n'y compte qu'une fois.
- **Domaines : un regroupement de la table `Competences`.** « Domaines » (clé `macro`) lit une autre colonne de la table que « Compétences », `Macro_competences`, et se déclare dans `CATEGORIES` par `groups: 'competences'` : le domaine d'un contact se déduit de ses `BDD.Competences` (`resolveGroupItem()`). Une compétence sans domaine renseigné prend le libellé `fallback` (« Autres »), pour qu'aucun contact ne devienne introuvable ; la console liste ses identifiants de ligne. Deux écritures d'un même domaine n'en font qu'un (`groupLabelMap()`). Si la colonne `Macro_competences` n'existe pas, `referenceMaps.macro` reste vide au lieu de tout classer sous « Autres », et le menu Compétences reste une liste à plat. Les cartes n'affichent pas de domaine (`TAG_KEYS` ne le liste pas).
- **Les domaines sont les groupes du menu Compétences, pas un filtre de plus.** « Compétences » déclare `grouping: 'macro'` (l'inverse de `groups`) ; `FILTER_KEYS` ne liste pas `macro`. Il n'y a qu'**une** sélection, `activeFilters.competences`, qui ne contient que des libellés de compétences : `toggleGroup()` coche ou décoche d'un coup toutes les compétences d'un domaine, et la case d'un domaine n'est qu'un état dérivé (`groupState()` : `none`, `some` ou `all`), jamais un second critère. Tout est donc un OU dans le menu : un domaine coché et une compétence d'un autre domaine s'additionnent. `selectionCount()` donne le chiffre du bouton (un domaine entièrement coché compte pour un, une compétence écrite sous deux domaines une seule fois).
- **Ranger un menu par groupe** : `menuGroups(filter, referenceMaps)` renvoie `[{ label, values }]`, les domaines triés par `compareLabels()` et « Autres » en dernier, chaque domaine avec ses compétences triées. Un domaine se reconnaît à son libellé normalisé (casse et accents), comme son compteur ; une compétence écrite sur deux lignes de domaines différents figure sous les deux. Le résultat est `null` quand le menu doit rester plat : la catégorie n'a pas de `grouping`, ou Grist n'a donné aucun regroupement (colonne absente, table illisible).
- **Compteurs par option** : `computeFilterCounts()` calcule, pour chaque catégorie, le nombre de cartes qui portent chaque valeur. Chaque catégorie est comptée avec **tous les autres filtres** (recherche, interrupteurs, autres menus) mais sans le sien (`excludeKey`) : sinon cocher « Santé numérique » ferait tomber à zéro les autres options de la même catégorie, alors qu'elles s'ajoutent (OU). Le nombre affiché est donc celui de l'option seule : cocher une valeur de plus ajoute ses cartes à celles déjà affichées. Le regroupement d'un filtre est compté avec lui, sur les mêmes cartes, en un seul passage : le nombre d'un domaine ignore la sélection du menu Compétences (cocher une compétence ne le change pas) mais respecte la recherche, les interrupteurs et les autres menus.
- **Ordre des menus** : tri alphabétique français (`compareLabels()`, `localeCompare` en `fr-FR`), valeurs cochées d'abord (`sortWithCheckedFirst()`).
- **Rôle PUI** s'affiche sur les cartes mais n'a ni menu ni filtre ([`specs.md`](../specs.md)) : ses tags ne sont pas cliquables.

## Rendu des cartes et des menus

- `renderCards()` vide la grille puis ajoute une carte par contact (`buildCard()`), clonée depuis `<template id="cardTemplate">`. Les lignes facultatives (fonction, e-mail, téléphone, badge d'établissement) sont remplies par `reveal()`, qui leur ajoute la classe `visible` : le CSS masque l'e-mail, le téléphone et le badge tant qu'ils ne l'ont pas ; une fonction vide reste dans la page sans occuper de hauteur.
- **Aucune donnée Grist n'est insérée comme HTML** : tout passe par `textContent`. `innerHTML` n'est utilisé que pour vider un conteneur. Un prénom contenant `<img onerror=…>` s'affiche en texte (scénario de `tests/e2e.test.mjs`).
- Le lien `mailto:` n'est créé que pour une adresse simple (`mailtoHref()`, expression régulière `SAFE_EMAIL`) : une adresse saisie avec `?cc=…`, plusieurs destinataires ou des espaces reste du texte.
- Les tags d'une catégorie filtrable sont des `<button>` ; ceux de « Rôle PUI » sont des `<span>` non cliquables (`buildTag()`).
- `createFilterUI()` construit tous les menus (`buildFilter()` → `buildFilterMenu()` → `buildOption()`). Chaque option porte sa valeur dans `data-value` : le texte affiché n'est pas la source. Un bouton de filtre peut porter une infobulle (`hint` dans `CATEGORIES`, utilisée par « Compétences »), et son champ de recherche un texte d'invite (`placeholder`), assez court pour ne pas être coupé dans un menu de 270px : un test en fixe la longueur.
- **Le menu rangé par groupe** (`buildGroupedMenu()` → `buildGroup()`, quand `menuGroups()` n'est pas `null`) montre une ligne par domaine : une vraie case à cocher (« partielle » par `indeterminate`, `paintGroup()`), le nombre de cartes, et un bouton flèche qui déplie les compétences (`aria-expanded`, `aria-controls`, `aria-label` « Détail de … »). Les domaines sont repliés au départ ; le repli passe par la classe `open`, jamais par l'attribut `hidden`, que le CSS impose en `display: none !important`. Le champ de recherche du menu trouve un domaine comme une compétence (`searchGroups()`) : un domaine dont le nom correspond garde toutes ses compétences, un autre seulement celles qui correspondent ; tant qu'on cherche, tout est déplié (classe `searching`). Rien ne bouge pendant qu'on coche : c'est `settleGroupedMenu()`, à l'ouverture du menu, qui remet en tête les domaines et les compétences cochés et déplie les domaines cochés en partie.
- `updateFilterUI()` met à jour **un seul menu** (cases, ordre, compteur du bouton) après un clic sur une case, un tag de carte ou un badge d'établissement ; `updateFilterCounts()` rafraîchit les compteurs de tous les menus. Aucun des deux ne reconstruit les menus : cela fermerait un menu ouvert et effacerait la saisie en cours dans sa recherche interne. Les menus ne sont reconstruits (`rebuildFilterUI()`) que par « Réinitialiser », précisément pour vider ces champs, et quand un rechargement apporte des libellés différents.
- Mise en page : le widget s'adapte à la largeur de son cadre Grist, sans largeur minimale (`.widget-shell` garde `max-width: 1480px`). Les seuils de `style.css` sont ceux du cadre, pas de l'écran : sous 1400px les filtres passent sous la recherche, sous 840px les cartes se mettent sur deux colonnes, sous 600px sur une seule avec une barre d'outils empilée et un texte plus grand. Un écran tactile (`pointer: coarse`) reçoit en plus des cibles d'au moins 28px et des champs à 16px, et le survol n'y reste pas collé (`hover: none`). À partir de 1400px, la mise en page est celle de départ. `keepMenuInView()` (`render.js`) décale un menu de filtre qui sortirait du cadre à droite. Tests : `tests/responsive.test.mjs` ; protocole manuel : [`TESTING.md`](../TESTING.md), section 12 ; exigence : [`specs.md`](../specs.md).

## Fiabilité : que se passe-t-il en cas de panne ?

Principe : une panne de lecture ou une donnée indispensable manquante ne doit jamais passer pour un annuaire vide. Les situations ci-dessous produisent un message dans le bandeau d'état (`#statusBanner`, `role="alert"`), sauf celles de « Ma présence », qui parlent dans le bandeau de la personne ou dans la console, et celles de la modification d'une fiche, qui parlent dans la fenêtre de modification. Deux cas de lecture restent muets : un contact dont l'établissement désigne une ligne qui n'existe pas (masqué, sans message sauf si la colonne est vide) et une colonne facultative supprimée de `BDD` (l'information n'est plus affichée) ; voir [Limites connues](maintenance.md#limites-connues).

| Situation | Ce que voit l'utilisateur | Où c'est géré |
|---|---|---|
| La table `BDD` ou `Etablissements` est illisible | Bandeau « Impossible de charger l'annuaire depuis Grist (table “…” illisible) ». Les cartes déjà affichées restent ; le compteur indique « Chargement impossible » s'il n'y avait encore aucun contact chargé | `requireReadable()`, `DirectoryLoadError`, `showLoadError()` |
| Une colonne indispensable manque : `nom`, `prenom`, `Etablissement`, `perimetre` ou `Accepte_apparaitre` dans `BDD` ; `fondateur`, `partenaire` ou `ok_pour_apparaitre` dans `Etablissements` | Même bandeau, avec le nom de la colonne et de la table (« colonne “…” absente de la table BDD ») | `requireColumns()` |
| Une table de référence est illisible (Actions, GT, Instances…) | Les cartes restent, avec les libellés du chargement précédent s'il y en a un (au premier chargement, le filtre et les tags concernés restent vides) ; bandeau « Tables illisibles (…) : des libellés ou des tags peuvent manquer. » | `readReferenceMaps()`, `directoryIssues()` |
| Aucune colonne de libellé n'existe dans une table de référence (par exemple ni `Actions_corrigees` ni `Actions`, ou `Macro_competences` pour les domaines) | Bandeau « Colonne de libellé introuvable : … Les tags et le filtre correspondants restent vides. » Si seule la colonne corrigée manque, le libellé brut est utilisé et seule la console avertit. Pour `Macro_competences`, le menu Compétences reste complet mais n'est plus rangé par domaine | `readReferenceMap()`, `directoryIssues()` |
| Deux établissements de même acronyme et de statuts différents, avec une Référence envoyée en texte | Leurs contacts sont masqués ; bandeau « Acronymes en double dans Etablissements (…) » | `etablissementFlagsFromRows()` |
| La table contient des lignes mais aucun contact n'est affichable | Bandeau qui dit où chercher (colonne `perimetre` ou `Etablissement` vide partout, personne n'a accepté d'apparaître, ou rappel des conditions d'affichage) au lieu d'un « 0 contact » muet. Des refus individuels ne sont pas une anomalie : pas de bandeau tant que d'autres personnes apparaissent | `describeEmptyDirectory()` |
| Rafale d'éditions dans Grist | Une seule lecture, 250 ms après la dernière ; une lecture lente n'écrase pas un affichage plus récent | `debounce()`, `createRequestSequencer()` |
| Un libellé coché est renommé ou supprimé dans Grist | La sélection périmée disparaît d'elle-même, sans grille bloquée à zéro | `pruneStaleFilters()` |
| Adresse e-mail non standard | Texte affiché sans lien | `mailtoHref()` |
| Personne non identifiée : pas de table-sonde, formule muette, écriture ou relecture refusée, compte Lecteur | Pas de bandeau « Ma présence » ; l'annuaire s'affiche comme avant. La console dit pourquoi (`[IDENTITE] …`) | `readIdentity()` |
| Aucune ligne de `BDD` ne porte l'adresse de la personne, ou `BDD` n'a pas de colonne `email` | Pas de bandeau ; la console l'explique, une seule fois | `refreshAccount()`, `createPeopleIndex()` |
| Grist refuse d'écrire le choix (règle d'accès), ou `Accepte_apparaitre` est une colonne à formule | Message en français sous le bandeau ; l'interrupteur reste dans son état réel, rien n'a changé | `setPresence()`, `explainWriteError()` |
| Double clic sur l'interrupteur | Un seul envoi : l'interrupteur est gelé pendant l'écriture | `setBusy()`, `togglePending` |
| Écriture réussie mais relecture de l'annuaire ratée | Message « Modification enregistrée ; l'annuaire n'a pas pu être rechargé. » | `togglePresence()` |
| Modification d'une fiche : la fiche ne peut pas être relue dans Grist | Dans la fenêtre, la relecture ou la validation reste là avec le brouillon : « La fiche n'a pas pu être relue dans Grist : rien n'a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | `readRow()`, `ProfileSaveError` |
| La fiche a été supprimée pendant que la fenêtre était ouverte | « Cette fiche n'existe plus dans Grist : rien n'a été modifié. » | `readRow()` |
| Grist refuse d'écrire la fiche (règle d'accès) | « Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche. Contactez un administrateur. » La relecture reste ouverte, rien n'a été écrit | `saveProfile()`, `classifyWriteError()` |
| Une colonne de la fiche est une colonne à formule | « Une colonne de la fiche est une colonne à formule : elle ne peut pas être modifiée depuis le widget. Voir GRIST_SETUP.md. » | `saveProfile()` |
| Autre échec d'écriture | « La modification n'a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | `saveProfile()` |
| Les colonnes touchées ont changé dans Grist depuis la relecture | Rien n'est écrit ; retour à la relecture, recalculée sur la fiche actuelle : « La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau. » | `signatureOf()`, `saveProfile()`, `saveReviewed()` |
| Des champs ont changé dans Grist entre l'ouverture du formulaire et la relecture | Avis dans la relecture : « Ces informations ont changé dans Grist depuis l'ouverture de la fenêtre : … La carte « Avant » montre leur état actuel. » (les champs à la place des points de suspension) | `rebaseChanges()`, `prepareReview()` |
| Les modifications sont déjà dans la fiche, ou il n'y a rien à relire | « Ces modifications sont déjà dans la fiche : il n'y a rien à enregistrer. » ou « Il n'y a rien à relire : corrigez les champs signalés ou modifiez la fiche. » | `prepareReview()` |
| Une liste contient autre chose que des identifiants de ligne, une colonne manque, ou la fiche n'aurait plus ni prénom ni nom | « Ces modifications ne peuvent pas être enregistrées : … » suivi de la cause ; rien n'est écrit | `buildRowUpdate()` |
| Écriture réussie, mais Grist n'a pas gardé tout ce qui était demandé | Dans la confirmation : « Grist n'a pas gardé tout ce qui était demandé (…). Vérifiez la fiche dans Grist ou contactez un administrateur. » (les champs entre parenthèses) | `unsavedLabels()` |
| Écriture réussie, mais annuaire non rechargé | « Les modifications sont enregistrées, mais l'annuaire n'a pas pu être rechargé. Rechargez la page pour les voir. » | `saveReviewed()`, `renderSaved()` |
| Types de colonnes illisibles | Rien à l'écran : le téléphone suit la forme de la cellule actuelle ; la console avertit (`[SCHEMA]`) | `readColumnTypes()` |
| Erreur inattendue pendant la modification | « L'opération n'a pas pu aboutir. Le détail est dans la console du navigateur. » | `userFacing()` |
| Double clic sur « Valider », ou Échap pendant l'écriture | Un seul envoi ; la fenêtre ne se ferme pas pendant l'écriture | `createProfileDialog()` |

La console du navigateur garde le détail, avec huit préfixes (plus l'erreur brute d'un chargement raté, sans préfixe) :

- `[GRIST]` : nombre d'enregistrements reçus et de contacts affichables ;
- `[REFS]` : entrées chargées par catégorie, lectures échouées, colonnes de libellé introuvables et compétences que `Macro_competences` ne classe pas ;
- `[ETABLISSEMENT]` : contacts qui ont un périmètre mais pas d'`Etablissement` renseigné (vingt identifiants au plus) ;
- `[CONSENTEMENT]` : combien de personnes du périmètre sont masquées faute d'accord (`n/m`) ;
- `[IDENTITE]` : pourquoi personne n'est identifié, ou, pour la personne identifiée, si elle est administrateur ; avertissements sur la fiche introuvable ou portée par plusieurs lignes ;
- `[PRESENCE]` : le détail d'une écriture refusée ;
- `[PROFIL]` : la lecture ou l'écriture d'une fiche qui a échoué, ou une erreur inattendue pendant la modification ;
- `[SCHEMA]` : les types de colonnes illisibles.

Les journaux du widget ne contiennent ni nom ni adresse, seulement des nombres et des identifiants de ligne : la console peut être partagée pendant une démonstration. La seule exception est le détail brut d'une erreur renvoyée par Grist (dans `[PRESENCE]`, `[PROFIL]` ou `[SCHEMA]`, dans `[IDENTITE] lecture impossible : …`, ou lors d'un chargement raté), que le widget ne contrôle pas.

Le tableau des symptômes et des actions à mener côté Grist est dans [maintenance](maintenance.md#diagnostiquer-un-problème).

## Tests

```bash
node --test                              # tous les tests (Node 22.7 ou plus, ou 20.19 ou plus ; la CI utilise Node 22)
node --test tests/filters.test.mjs       # un seul fichier

npm install --no-save playwright        # active les tests navigateur (pas une dépendance du projet)
npx playwright install chromium         # ou CHROMIUM_PATH=/chemin/vers/chromium
```

| Fichier | Ce qu'il vérifie |
|---|---|
| `tests/grist-data.test.mjs` | Décodage des formats Grist, normalisation, téléphone, lien `mailto`, libellés des regroupements, séquenceur de requêtes, accord de la personne (`hasAccepted()`) |
| `tests/enrich.test.mjs` | `enrich()` : établissement dans ses trois encodages, rôle, catégories en liste dont compétences et domaines, libellés sans doublon, indicateurs |
| `tests/etablissements.test.mjs` | Indicateurs d'établissement (par identifiant de ligne, repli sur le libellé), doublons, éligibilité, menu Établissement |
| `tests/filters.test.mjs` | Filtrage, purge des sélections périmées, compteurs (dont ceux des domaines) et menu rangé par groupe : `menuGroups()`, `groupState()`, `toggleGroup()`, `selectionCount()` |
| `tests/load-directory.test.mjs` | `loadDirectory()` avec un faux `docApi` : une lecture par table, libellé corrigé prioritaire, pannes, colonnes obligatoires, facultatives ou introuvables, consentement individuel, annuaire vide expliqué, domaines des compétences |
| `tests/constants.test.mjs` | Cohérence de la taxonomie, table principale `BDD`, libellé corrigé avant le libellé brut |
| `tests/rules.test.mjs` | Règle du projet : aucun fichier de code ne cite la colonne `nom_de_domaine` |
| `tests/identity.test.mjs` | `readIdentity()` et `isReadOnlyAddress()` avec le faux Grist : adresse lue sur la ligne de la sonde, droit d'administrateur d'après `ACL`, compte Lecteur, sonde absente, formule muette, écriture refusée, lecture en panne, ligne de sonde toujours retirée, personnes simultanées, aucune adresse dans la console |
| `tests/people.test.mjs` | L'index des personnes par adresse (casse et espaces ignorés, doublons signalés) et `describeVisibility()`, dont l'accord avec `buildContacts()` sur chaque ligne |
| `tests/presence.test.mjs` | `describePresence()` (les messages dits à la personne) et `setPresence()` : une seule action atomique, vrais booléens, toutes les lignes de la personne ou aucune, refus de Grist traduit en français |
| `tests/profile.test.mjs` | `rightsFor()` (qui peut modifier quelle fiche, fermé par défaut), le modèle du formulaire, `diffProfile()` (textes nettoyés et refusés, téléphone français, références, listes en ajouts et retraits), `rebaseChanges()` et `describeChanges()` |
| `tests/profile-save.test.mjs` | `buildRowUpdate()` (listes calculées sur la fiche actuelle, téléphone numérique ou texte), `signatureOf()`, `prepareReview()` (cartes avant et après, rien d'écrit), `saveProfile()` (une seule action atomique, conflit concurrent, refus de Grist, aucune adresse dans la console) et `unsavedLabels()` |
| `tests/preview.test.mjs` | `diffContacts()` et `previewOf()` : ce qui change entre la carte avant et la carte après |
| `tests/schema.test.mjs` | `readColumnTypes()` : type des colonnes, repli quand les métadonnées sont illisibles |
| `tests/e2e.test.mjs` | Le vrai `index.html` dans Chromium avec le faux Grist : cartes, badge d'établissement, filtres, menu Compétences par domaine (case de domaine, détail, recherche à deux niveaux), compteurs, interrupteurs, pannes, consentement, bandeau « Ma présence » et son interrupteur |
| `tests/e2e-profile.test.mjs` | Le même `index.html` : qui voit un bouton « Modifier », le formulaire, la relecture avant/après, l'écriture, les refus, les conflits, l'accessibilité de la fenêtre, y compris dans un cadre étroit |
| `tests/responsive.test.mjs` | Le même `index.html` de 280 à 1920px de large, sur un jeu de données chargé (`tests/fixtures-responsive.mjs`) : pas de défilement horizontal, texte contenu dans les cartes, colonnes, barre d'outils, menus de filtres dans le cadre (dont le menu Compétences déplié, et une compétence au nom très long), cibles tactiles, tailles de texte |
| `tests/docs.test.mjs` | La documentation ne se périme pas : liens, noms de fonctions cités, jeu de données fictif et personnes de démonstration, serveur de démonstration, affirmations de sécurité (aucun appel réseau, aucun stockage, méthodes de l'API Grist employées) |

- **Version de Node.** Le dépôt n'a pas de `package.json` : Node ne reconnaît les modules ES écrits en `.js` que grâce à la détection automatique de la syntaxe, activée par défaut depuis Node 20.19 et 22.7. En dessous (Node 18, 21, 22.6…), les tests échouent avec « Named export … not found » : c'est l'environnement qui est en cause, pas le code. Le serveur de démonstration, en `.mjs`, démarre dès Node 18.
- Les tests unitaires n'ont aucune dépendance. `tests/e2e.test.mjs`, `tests/e2e-profile.test.mjs` et `tests/responsive.test.mjs` ont besoin de Playwright et de Chromium (l'outillage commun des deux premiers est dans `tests/support/browser.mjs`) ; sans eux leurs scénarios sont ignorés et `node --test` reste vert. La CI définit `REQUIRE_E2E=1` : un navigateur absent y est un échec, pas un « tout vert » sur des tests ignorés.
- Le test navigateur est isolé du réseau : seuls le serveur local et l'API Grist simulée répondent, tout le reste est bloqué.
- Limite assumée : l'API Grist est simulée, avec des données aux encodages observés en production. Ces tests garantissent que le vrai `main.js` et le vrai `render.js` réagissent correctement à ces encodages et à ces pannes ; ils ne garantissent pas que Grist les envoie toujours. Le faux document ne reproduit ni les règles d'accès de Grist ni le calcul réel des formules : il ne rejoue que le résultat attendu de la formule de la sonde (`Email` = adresse de la personne, `Admin` d'après `ACL`). D'où le protocole manuel de [`TESTING.md`](../TESTING.md), à jouer dans un vrai document avant un déploiement qui touche `main.js`, `render.js`, `index.html` ou `style.css`.
- Chaque correction s'accompagne d'un test de non-régression, dans le fichier du module concerné. Une fonction ajoutée à `grist-data.js` ou `filters.js` a son test ; un changement d'affichage adapte ou ajoute un scénario de `tests/e2e.test.mjs` (ou de `tests/e2e-profile.test.mjs` pour la fenêtre de modification), et un changement de mise en page (`style.css`) un scénario de `tests/responsive.test.mjs`.

## Données et captures de démonstration

Le dossier `docs/demo/` permet d'essayer le vrai widget **sans document Grist** et de régénérer les captures d'écran de la documentation, sur des données entièrement fictives.

| Fichier | Rôle |
|---|---|
| `docs/demo/donnees-fictives.mjs` | Jeu de données inventé (personnes, établissements, tables de référence, domaines de compétences, table-sonde vide et table `ACL`) à la structure de [`grist_structure.txt`](../grist_structure.txt) et au format que renvoie `fetchTable()`. `tablesFictives()` le construit, `CARTES_ATTENDUES` donne le nombre de cartes qu'il doit produire et `PERSONNES_DEMO` les adresses fictives que la démonstration peut connecter |
| `docs/demo/serveur-demo.mjs` | Sert le dépôt avec le faux document Grist des tests (`tests/support/fake-grist.js`) à la place de l'API de widget. `index.html` n'est pas dupliqué : il est lu à chaque requête, et seule la balise qui charge `grist-plugin-api.js` est remplacée |
| `docs/demo/capturer.mjs` | Régénère les images de `docs/images/` avec Playwright ; chaque capture est précédée d'une vérification (nombre de cartes, bandeau, fenêtre de modification) |

```bash
node docs/demo/serveur-demo.mjs                # puis http://127.0.0.1:8080  (PORT=9000 pour changer de port)
# http://127.0.0.1:8080/?panne=Actions,GT      simule des tables de référence illisibles
# http://127.0.0.1:8080/?connecte=camille.rousseau@chd.example
#                                              ouvre le widget comme cette personne : bandeau « Ma présence »,
#                                              et sa carte porte « Votre fiche » et « ✎ Modifier »
# http://127.0.0.1:8080/?connecte=mehdi.bensaid@udd.example
#                                              un administrateur : « ✎ Modifier » sur toutes les cartes affichées
# http://127.0.0.1:8080/?connecte=sarah.colin@fdx.example
#                                              une fiche masquée de l'annuaire : la relecture dit pourquoi elle le reste
# …&refus=BDD                                  simule une règle d'accès qui refuse d'écrire dans BDD
#                                              (choix de présence comme modification de fiche)
# …&readonly=true                              ouvre le widget comme un compte Lecteur : ni bandeau ni bouton « Modifier »

npm install --no-save playwright && npx playwright install chromium
node docs/demo/capturer.mjs                    # réécrit docs/images/*.png
```

Règles :

- **Rien de réel dans le dépôt.** Les personnes et établissements sont inventés, les adresses se terminent par `.example` (domaine réservé à la documentation, RFC 2606) et les numéros appartiennent au plan réservé à la fiction (`05 36 49 xx xx`, `06 39 98 xx xx`, décision ARCEP n° 2018-0881). `tests/docs.test.mjs` le vérifie.
- Après toute modification de l'interface, relancer `docs/demo/capturer.mjs`, regarder les images et les committer avec le changement.
- Quand la structure Grist change, adapter `docs/demo/donnees-fictives.mjs` : `tests/docs.test.mjs` échoue tant que le jeu fictif n'est pas lu sans erreur par le vrai `loadDirectory()`.
- Dans le jeu fictif, tout le monde a accepté d'apparaître (`Accepte_apparaitre`) sauf une personne qui a refusé : seuls les établissements et le périmètre décident des autres. `PERSONNES_DEMO` désigne une personne qui apparaît, une qui a refusé, une qui a accepté mais reste masquée (son établissement n'est pas validé) et un administrateur : ce sont elles que photographient les captures « Ma présence » (les trois captures de la modification d'une fiche, le bouton, le formulaire et la relecture, montrent la même modification de la personne qui apparaît), et `tests/docs.test.mjs` vérifie que le bandeau dit pour chacune ce que le guide annonce.
- Les écritures de la démonstration (l'interrupteur « Ma présence » comme la modification d'une fiche) vivent en mémoire dans la page : recharger la page repart du jeu d'origine, et aucun fichier n'est modifié.
- Il n'y a plus qu'un simulateur de l'API Grist : le faux document des tests sert aussi à la démonstration, ce qui évite qu'ils divergent.

## Recettes

**Ajouter une catégorie de filtre ou de tag**

1. Dans Grist : créer la table de référence et la colonne de liste dans la table principale.
2. Dans `constants.js` : ajouter l'entrée dans `CATEGORIES` (libellé, couleur, table, colonnes de libellé dans l'ordre corrigé puis brut, colonne de liste), puis sa clé dans `FILTER_KEYS` (menu de filtre) et/ou `TAG_KEYS` (tags de carte, dans l'ordre d'affichage). Une catégorie qui a une `column` est lue automatiquement (`LIST_CATEGORIES` → `listLabels()`) ; sinon il faut du code dédié dans `enrich()`. Pour un **regroupement** d'une catégorie existante (comme « Domaines » sur `Competences`), lire une autre colonne de la même table : ajouter `groups` (clé de la catégorie regroupée) et `fallback` (libellé des lignes non classées), puis `grouping` (clé du regroupement) sur la catégorie regroupée pour que son menu range ses valeurs par groupe. Le regroupement n'a alors pas de clé dans `FILTER_KEYS`.
3. Adapter `tests/constants.test.mjs` (il fixe les listes attendues), `tests/fixtures.mjs` et un scénario de `tests/e2e.test.mjs`.
4. Mettre à jour `grist_structure.txt`, `TESTING.md` (nombre de filtres), `docs/demo/donnees-fictives.mjs` et [le guide utilisateur](utilisateurs.md), puis régénérer les captures.

**Afficher une nouvelle information sur la carte**

1. Ajouter l'élément dans `<template id="cardTemplate">` (`index.html`) et sa mise en forme dans `style.css`.
2. Le remplir dans `buildCard()` (`render.js`), avec `reveal()` s'il est facultatif et `textContent` pour tout texte venu de Grist.
3. Ajouter un scénario à `tests/e2e.test.mjs`, régénérer les captures (en particulier `docs/images/carte-anatomie.png`, dont la légende se trouve dans [le guide utilisateur](utilisateurs.md#lire-une-carte)).

**Changer une règle d'éligibilité**

1. Modifier la règle dans `grist-data.js` et ses tests (`tests/etablissements.test.mjs`, `tests/load-directory.test.mjs`).
2. Reporter la règle dans `describeVisibility()` et `presence.js`, qui disent à la personne pourquoi elle n'apparaît pas (`tests/people.test.mjs` échoue si leur verdict diverge de celui de `buildContacts()`).
3. Mettre à jour [`specs.md`](../specs.md), le schéma de [Règles d'affichage](#règles-daffichage), le guide utilisateur (« Pourquoi une personne n'apparaît-elle pas ? ») et la [page de maintenance](maintenance.md).

**Renommer une table ou une colonne Grist**

1. La table principale (`MAIN_TABLE`), les tables de référence, leurs colonnes de libellé et les colonnes de liste de `BDD` sont dans `constants.js`. Les autres noms sont écrits en dur : dans `grist-data.js`, le nom de la table `Etablissements`, les colonnes obligatoires de `BDD` (`REQUIRED_COLUMNS`) et d'`Etablissements` (`REQUIRED_ETABLISSEMENT_COLUMNS`), `Etablissement`, `perimetre`, `Role_dans_le_PUI` et les indicateurs d'établissement ; et, pour les colonnes d'identité, dans `grist-data.js`, `filters.js`, `render.js`, `preview.js`, `profile.js` et `profile-save.js` (`nom`, `prenom`, `email`, `Fonction`, `numero_de_telephone`) ; les colonnes que la personne peut modifier sont déclarées dans `PROFILE_FIELDS` (`constants.js`). La case de consentement et la table-sonde ont leur constante dans `constants.js` (`CONSENT_COLUMN`, `PROBE_TABLE`) ; les colonnes `Email` et `Admin` de la sonde sont écrites en dur dans `identity.js`, comme dans les formules de Grist ([`GRIST_SETUP.md`](../GRIST_SETUP.md)).
2. Mettre à jour `grist_structure.txt`, `tests/fixtures.mjs`, `docs/demo/donnees-fictives.mjs` et, si la sonde ou `ACL` changent, `GRIST_SETUP.md`.
3. Lancer `node --test`, puis jouer [`TESTING.md`](../TESTING.md) dans une copie du document.

## Conventions

- **Pas de dépendance à l'exécution.** Toute nouvelle dépendance se discute d'abord.
- **JavaScript** : modules ES, point-virgule, apostrophes simples, indentation de deux espaces ; des fonctions courtes et nommées plutôt que de longs blocs.
- **Commentaires** : ils disent *pourquoi* le code est ainsi. L'histoire détaillée des bugs vit dans le [CHANGELOG](../CHANGELOG.md) et les messages de commit ; un commentaire peut y renvoyer, sans la raconter.
- **Langue** : identifiants en anglais (sauf les noms de colonnes Grist et les fichiers de `docs/demo/`, en français), commentaires et textes affichés en français.
- **Une correction = un test de non-régression**, écrit avec la correction.
- **Jamais** de vraies données dans le dépôt (captures, jeux de test, schéma complet du document Grist) ni de colonne `nom_de_domaine` dans le code.
- Tout changement visible ajoute une entrée au [CHANGELOG](../CHANGELOG.md) et met à jour [`VERSION.md`](../VERSION.md).

## Versions, déploiement et CI

- Une modification passe de préférence par une branche et une pull request vers `main`. La CI (`.github/workflows/tests.yml`) exécute `node --test` sous Node 22 avec `playwright@1.64.0` et `REQUIRE_E2E=1`, avec le seul droit `contents: read`. Elle s'exécute aussi à chaque push sur `main`, mais elle ne bloque pas la publication : avant un push direct, lancer `node --test` en local.
- **Un push sur `main` met le widget à jour en production** pour tous les documents Grist qui l'utilisent, via GitHub Pages (`https://lombre33.github.io/Annuaire_PUI_Bordeaux/`), sans retour arrière automatique. Taguer les versions stables (`git tag vX.Y.Z`) permet de savoir où revenir ; la procédure de retour en arrière est dans [maintenance](maintenance.md#revenir-en-arrière).
- Le numéro de version est dans le titre de [`VERSION.md`](../VERSION.md) et dans les en-têtes du [CHANGELOG](../CHANGELOG.md), la version la plus récente en premier.
- En local, les modules ES ne se chargent pas via `file://`. Servir le dossier avec `python3 -m http.server 8080` ; pour un essai complet avec un vrai document, ajouter un widget personnalisé qui pointe vers `http://localhost:8080` (voir la préparation de [`TESTING.md`](../TESTING.md)). Le serveur de démonstration (`node docs/demo/serveur-demo.mjs`) remplace l'API Grist par un simulateur : il ne sert qu'à essayer le widget sans Grist.

## Chantiers en cours

Au 12 octobre 2026, `main` est en version 1.13.0. Cette documentation la décrit et sera mise à jour à chaque fusion.

**Déjà fusionné**

1. **Nouvelle structure Grist** (1.8.0) : la table principale est `BDD`, avec des références directes (établissement, compétences, instances, actions…) et des tables de référence renommées. Le [CHANGELOG](../CHANGELOG.md) liste chaque changement.
2. **Filtre « Domaines »** (1.9.0), **intégré au menu « Compétences » en 1.13.0** : les domaines (compétences macro) rangent le menu Compétences, avec une case par domaine, un détail dépliable et une recherche à deux niveaux. Il n'y a plus de filtre « Domaines » à part : voir [Filtres, compteurs et recherche](#filtres-compteurs-et-recherche).
3. **Mise en page adaptative** (1.9.1) : le widget s'adapte à la largeur de son cadre, d'un téléphone à un grand écran, comme le décrit [Rendu des cartes et des menus](#rendu-des-cartes-et-des-menus).
4. **Consentement individuel** (1.10.0) : seules les personnes dont `BDD.Accepte_apparaitre` est coché apparaissent, en plus de la validation de leur établissement. La colonne est obligatoire et un annuaire vide est expliqué par le bandeau d'état : voir [Règles d'affichage](#règles-daffichage).
5. **« Ma présence »** (1.11.0) : le widget identifie la personne connectée grâce à une table-sonde et lui laisse choisir d'apparaître ou non, comme le décrit [Identité et « Ma présence »](#identité-et--ma-présence-). C'est la première fois que le widget écrit dans le document : [sécurité](securite.md) en tire les conséquences, et [`GRIST_SETUP.md`](../GRIST_SETUP.md) liste les réglages à faire dans Grist.
6. **Modifier sa fiche directement, avec relecture avant et après** (1.12.0) : une personne connectée modifie sa propre fiche de `BDD`, un administrateur celle de toute personne affichée. Avant d'enregistrer, une fenêtre de relecture montre la carte « Avant » et la carte « Après », les changements étant repérés sur la carte « Après », avec un bouton pour valider. Les modifications s'appliquent directement : le widget ne tient ni validation par un administrateur ni historique, et ne crée aucune table. Voir [Modifier une fiche](#modifier-une-fiche).

**Pas encore dans la 1.13.0**

Ce qui suit n'est pas dans le code, et aucune date n'est promise.

7. **Un mode administrateur que l'on active par un interrupteur** : pas encore. Aujourd'hui, un administrateur voit « ✎ Modifier » sur toutes les cartes affichées, en permanence.
8. **La modification de l'adresse e-mail et de l'établissement par un administrateur** : pas encore. Elle se fait dans Grist, comme celle du périmètre. Un administrateur ne modifie pas non plus, depuis le widget, une fiche que l'annuaire masque (pas de carte, donc pas de bouton).
9. **La modification de la fiche d'un établissement par son responsable** : pas encore. Aucun code du widget ne lit la colonne `Responsable_de_l_Etablissement` d'`ACL`.
10. **Un avatar** : pas encore. Les cartes n'affichent que les initiales de la personne ; aucun code ne lit de colonne Avatar.
