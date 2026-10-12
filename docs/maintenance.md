# Maintenance

Cette page explique comment garder l'annuaire et le widget en bon état : qui fait quoi, comment renseigner et corriger les données dans Grist, comment diagnostiquer un problème, comment publier et revenir en arrière, et quelles sont les limites connues. Elle décrit la **version 1.16.0**.

Pages liées : [README](../README.md), [guide utilisateur](utilisateurs.md), [documentation développeur](developpeurs.md), [sécurité](securite.md).

## Sommaire

- [Qui fait quoi](#qui-fait-quoi)
- [Pourquoi un contact est visible ou non](#pourquoi-un-contact-est-visible-ou-non)
- [Opérations courantes dans Grist](#opérations-courantes-dans-grist)
- [Les logos et le bandeau du bas](#les-logos-et-le-bandeau-du-bas)
- [Contrôle après un changement de données](#contrôle-après-un-changement-de-données)
- [Diagnostiquer un problème](#diagnostiquer-un-problème)
- [Avant de publier une modification du code](#avant-de-publier-une-modification-du-code)
- [Publier](#publier)
- [Revenir en arrière](#revenir-en-arrière)
- [Dépendances et mises à jour](#dépendances-et-mises-à-jour)
- [Continuité : départs et absence d'administrateur](#continuité--départs-et-absence-dadministrateur)
- [Limites connues](#limites-connues)
- [Maintenir la documentation](#maintenir-la-documentation)
- [Pistes d'amélioration](#pistes-damélioration)

## Qui fait quoi

| Rôle | Responsabilités | Outils |
|---|---|---|
| **Administrateur des données** | Contacts, établissements et leur statut (dont la validation `ok_pour_apparaitre`), valeurs des listes de filtres, administrateurs de l'annuaire (table `ACL`), réglages de « Ma présence » et de la modification de fiche ([`GRIST_SETUP.md`](../GRIST_SETUP.md)), règles d'accès | Le document Grist |
| **Mainteneur du code** | Widget, tests, publication, documentation | GitHub, `node --test` |

Le dépôt est celui du compte GitHub `lombre33` : <https://github.com/lombre33/Annuaire_PUI_Bordeaux>.

Chaque rôle doit avoir un suppléant, et le document Grist comme le dépôt doivent avoir au moins deux propriétaires : voir [Continuité](#continuité--départs-et-absence-dadministrateur).

## Pourquoi un contact est visible ou non

Une personne n'est affichée que si **toutes** les conditions suivantes sont vraies. Elles se règlent dans Grist :

| Condition | Où la régler | Si elle n'est pas remplie |
|---|---|---|
| Un nom ou un prénom | Colonnes `nom` et `prenom` de la table `BDD` | La ligne est ignorée |
| Au moins un périmètre | Colonne `perimetre` de `BDD` (liste de références) | Contact masqué |
| **L'accord de la personne** | Case `Accepte_apparaitre` de sa ligne de `BDD` : elle la coche elle-même avec « Ma présence », ou un administrateur dans Grist, avec son accord | Contact masqué. Une case vide ou décochée n'est pas un accord. La console indique `[CONSENTEMENT] n/m …` : le nombre de personnes masquées pour cette raison, jamais leurs noms |
| Un établissement | Colonne `Etablissement` de `BDD` : une référence vers une ligne d'`Etablissements`, qui ne doit pas être vide | Contact masqué. Si la colonne est vide, la console le signale (`[ETABLISSEMENT]`) ; si elle désigne une ligne qui n'existe plus, rien n'est signalé |
| Établissement validé | Case `ok_pour_apparaitre` de la ligne d'`Etablissements` | Contacts de l'établissement masqués |
| Établissement fondateur ou partenaire | Cases `fondateur` et `partenaire` | Un établissement ni fondateur ni partenaire (« autres ») n'est jamais affiché ; la case `autres` elle-même n'est pas lue |

Côté écran, les interrupteurs **Fondateurs** et **Partenaires** affinent ensuite l'affichage ([guide utilisateur](utilisateurs.md#fondateurs-et-partenaires)). Le schéma complet des règles est dans la [documentation développeur](developpeurs.md#règles-daffichage).

Quatre précisions sur la version 1.16.0 :

- L'établissement vient de la référence `Etablissement`, résolue par identifiant de ligne. L'ancienne colonne calculée `Etablissement2` n'est plus utilisée depuis la 1.8.0, et deux lignes d'`Etablissements` de même acronyme ne se confondent plus.
- **Les deux accords sont indépendants.** Valider un établissement (`ok_pour_apparaitre`) ne fait pas apparaître une personne qui n'a pas accepté, et une personne qui a accepté n'apparaît pas tant que son établissement n'est pas validé. Seul « coché » vaut accord.
- La colonne `Accepte_apparaitre` est **obligatoire** : si elle manque, le widget affiche une erreur et aucune carte (jamais l'annuaire de tout le monde). Elle doit être une colonne de **données** (case à cocher), pas une formule, sans quoi Grist refuse que la personne la modifie ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 1). Si **personne** n'a accepté, un bandeau le dit ; que quelques personnes aient refusé n'est pas une anomalie, et aucun bandeau ne le signale.
- **Modifier une fiche avec le widget change ces conditions dans un seul cas.** Le formulaire d'une personne n'écrit jamais `email`, `Etablissement`, `perimetre` ni `Accepte_apparaitre`, et refuse une fiche qui n'aurait plus ni prénom ni nom : il ne fait donc apparaître ni disparaître personne. Un administrateur en mode admin, lui, peut changer l'`Etablissement` d'une autre personne (ce qui peut la faire apparaître ou disparaître) et son `email` ; jamais `perimetre` ni `Accepte_apparaitre`. La relecture dit d'abord si la fiche reste ou devient masquée, et pourquoi.

## Opérations courantes dans Grist

Les noms de tables et de colonnes sont ceux de [`grist_structure.txt`](../grist_structure.txt).

**Ajouter une personne.** Renseigner le nom, le prénom, l'adresse e-mail (elle sert aussi à retrouver la fiche quand la personne utilise « Ma présence » ou modifie sa fiche), l'établissement (en choisissant sa ligne dans la colonne `Etablissement`), au moins un périmètre, puis ses instances, actions, groupes de travail (GT), communautés, tâches et compétences, qui sont des listes de références. **Ne cocher `Accepte_apparaitre` qu'avec l'accord de la personne** : sans cette case, elle n'apparaît pas. Vérifier que le logo (ou la pastille) de la carte désigne bien l'établissement attendu (le widget n'utilise pas la colonne `nom_de_domaine`).

**Recueillir ou retirer l'accord d'une personne.** C'est la case `Accepte_apparaitre` de sa ligne de `BDD`. La personne peut la cocher ou la décocher elle-même avec l'interrupteur « Apparaître dans l'annuaire » du bandeau « Ma présence », à condition d'être connectée à Grist avec l'adresse de sa fiche et de pouvoir modifier le document. Sinon, un administrateur coche la case dans Grist, **à la demande de la personne ou avec son accord**. Une personne qui a décoché l'interrupteur ne se recoche pas à sa place. Décocher masque la personne sans effacer ses données.

**Corriger ou compléter la fiche de quelqu'un.** Trois voies, qui s'appliquent toutes **tout de suite**, sans validation par un administrateur et sans historique tenu par le widget :

- la **personne elle-même** clique sur « ✎ Modifier » sur sa carte (marquée « Votre fiche ») ou sur « Modifier mon profil » dans le bandeau « Ma présence » (même si elle n'apparaît pas dans l'annuaire), puis relit la carte « Avant » et la carte « Après » avant de valider ;
- un **administrateur** (case `admin` d'`ACL`) allume d'abord « Mode admin » dans le bandeau « Ma présence » (éteint à chaque ouverture) ; chaque carte affichée porte alors « ✎ Modifier la fiche », avec la même fenêtre. Une fiche masquée de l'annuaire n'a pas de carte, donc pas de bouton ;
- **directement dans Grist**, pour une fiche masquée ou pour ce que le widget ne modifie pas.

Le widget modifie le prénom, le nom, la fonction, le téléphone, le rôle dans le PUI et les listes Instances, Actions, GT, Compétences, Communautés et Tâches ; un administrateur en mode admin modifie en plus l'`email` et l'`Etablissement` d'une autre personne (ces deux champs restent verrouillés sur sa propre fiche). **Reste réservé à Grist** : `perimetre` (même pour un administrateur), l'ajout et la suppression de fiches, et la case `Accepte_apparaitre` (la personne l'écrit avec « Ma présence », sinon on la coche dans Grist avec son accord).

**Colonnes écrites par le widget : des colonnes de données.** Dans `BDD`, `prenom`, `nom`, `email`, `Etablissement`, `Fonction`, `numero_de_telephone`, `Role_dans_le_PUI`, `Instances`, `Actions`, `GT`, `Competences`, `Communautes`, `Taches` (la liste du formulaire, `PROFILE_FIELDS` dans `constants.js`, dont `email` et `Etablissement`, réservés à l'administrateur en mode admin) et `Accepte_apparaitre` doivent être des colonnes de **données**, pas des formules : Grist refuse d'écrire dans une colonne à formule ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 1).

**Poser et tester les règles d'accès.** Depuis la 1.12.0, rien d'autre que les règles d'accès de Grist n'empêche de modifier depuis la console la fiche de quelqu'un d'autre, ou `email` ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 4 ; [sécurité](securite.md#écritures-et-règles-daccès)). Ces règles **n'ont pas été essayées dans un vrai Grist** : les poser d'abord sur une **copie** du document, puis les tester avec un compte ordinaire et un compte administrateur ([`TESTING.md`](../TESTING.md), section 13).

**Désigner un administrateur de l'annuaire.** Dans la table `ACL`, une ligne par personne avec son adresse e-mail et la case `admin` cochée ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 3 ; l'adresse est comparée sans tenir compte de la casse ni des espaces). Un administrateur allume, dans le bandeau « Ma présence », le bouton **Mode admin** (éteint à chaque ouverture) : il voit alors « ✎ Modifier la fiche » sur toutes les cartes affichées et peut corriger la fiche de toute autre personne affichée, e-mail et établissement compris (ces deux champs restent verrouillés sur sa propre fiche ; avant la 1.15.0, il voyait « Modifier » sur toutes les cartes dès l'ouverture, et ne changeait ni l'un ni l'autre) : n'en désigner que le strict nécessaire. Le droit est lu à l'ouverture de la page : la personne doit recharger pour que l'ajout ou le retrait soit pris en compte. Pour retirer un administrateur, décocher `admin` ou supprimer sa ligne.

**Garder la table `Annuaire_Sonde` en l'état.** Elle sert à savoir qui est connecté ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 2). Ne la supprimer ni la renommer, ne pas toucher à ses colonnes `Email` et `Admin` ni à leurs formules de déclenchement : sans elle, plus personne n'est identifié, et l'annuaire s'affiche alors normalement, mais sans bandeau « Ma présence » ni bouton « ✎ Modifier ». Elle est vide au repos ; une ligne restée là parce qu'une page a été fermée au mauvais moment peut être supprimée sans risque.

**Ajouter ou valider un établissement.** Ajouter une ligne dans `Etablissements` avec son acronyme (ou, à défaut, son nom complet : c'est son libellé affiché) et son statut : `fondateur` (l'un des 16 établissements fondateurs du PUI), `partenaire` (un partenaire du PUI) ou `autres` (une structure extérieure au PUI qui a collaboré à certaines tâches : elle n'apparaît jamais dans l'annuaire). Cocher `ok_pour_apparaitre` une fois la validation obtenue : tant qu'elle n'est pas cochée, aucun de ses contacts n'apparaît et l'établissement n'est pas proposé dans le filtre. **Recharger ensuite la page** : Grist ne prévient pas le widget d'un changement dans cette table.

**Ajouter une valeur à un filtre** (une action, une instance, un GT, une communauté, une tâche, une compétence). Ajouter une ligne dans la table de référence correspondante, puis recharger la page. Chaque table a deux colonnes de libellé : le widget affiche le **libellé corrigé** quand il est rempli, le libellé brut (celui de l'import) sinon. Une ligne sans aucun libellé est ignorée.

| Filtre | Table | Libellé corrigé | Libellé brut |
|---|---|---|---|
| Actions | `Actions` | `Actions_corrigees` | `Actions` |
| Tâches | `Taches` | `Taches_corrige` | `Taches` |
| Communautés | `Communautes` | `communautes_corrigees` | `communautes` |
| GT | `GT` | `GT_corrige` | `GT` |
| Compétences | `Competences` | `Competences_corrigees` | `Competences` |
| Instances | `INSTANCES` (en majuscules) | `Instances_Corrigees` | `Instances` |

**Renommer une valeur.** La renommer dans sa table de référence. Les contacts qui y sont liés suivent, et une sélection de filtre qui portait l'ancien nom est retirée d'elle-même.

**Compétences et domaines.** Les compétences d'une personne sont une liste de références vers la table `Competences`. Chaque compétence a un **domaine**, dans la colonne `Macro_competences` de cette table : il range le menu **Compétences** par domaine (les compétences macro) : on y coche un domaine entier ou une compétence. Renseignez-le pour toute nouvelle compétence.

- Une compétence **sans domaine** est classée sous « Autres », pour que ses personnes restent trouvables. La console liste alors ses identifiants de ligne (`[REFS] Competences: n ligne(s) sans regroupement pour macro…`) : classez-la dans Grist, puis rechargez la page.
- Écrivez un domaine toujours de la même façon : la casse et les accents sont ignorés (« Cancérologie » et « cancerologie » forment un seul domaine, écrit comme dans la plus petite ligne de la table).
- Le domaine d'une personne se déduit de ses compétences : une personne sans compétence n'a aucun domaine, et deux compétences d'un même domaine ne la comptent qu'une fois dans ce domaine.
- La colonne `Comptetences_macr` de `BDD` n'est pas lue.

**Tâches et actions.** Les tâches d'une personne sont une liste de références vers la table `Taches`. Aucune colonne ne relie une tâche à son action : c'est le **numéro** au début du libellé de la tâche qui le fait, et il range le menu **Tâches** par action (on y coche une action entière ou une tâche). Il n'y a rien à ajouter dans Grist, mais la façon d'écrire les libellés compte.

- Une tâche s'écrit **« n.m Libellé »**, où *n* est le numéro de son action : « 1.3 Animer le réseau » est une tâche de l'action 1, « 5.4 Veille » une tâche de l'action 5. Le widget lit le numéro dans le libellé affiché, donc dans `Taches_corrige` quand il est rempli, dans `Taches` sinon. « T1.3 » et « Tâche n° 1.3 » sont aussi compris.
- Une action s'écrit **« Action n : Libellé »**, avec le même numéro *n*, dans la table `Actions` (colonne `Actions_corrigees` ou `Actions`). « Action 1: … » est aussi compris, comme « Action n° 1 », « A1 », « 1. » et « 1 - ». Si deux actions portent le même numéro, c'est la plus ancienne (la ligne de plus petit identifiant de la table) qui range les tâches.
- Une tâche **sans numéro**, ou dont le numéro ne correspond à aucune action, est classée sous « Sans action », en fin de menu. La console liste alors ses identifiants de ligne (`[REFS] Taches: n ligne(s) sans regroupement pour macroTaches…`) : numérotez-la dans Grist, puis rechargez la page.
- Si **aucune** tâche ne peut être rangée (aucune action numérotée, aucune tâche numérotée, ou aucun numéro en commun), le menu reste une liste à plat, sans bandeau : la console dit pourquoi (`[REFS] Taches: aucune ligne n'est rattachée à une action pour macroTaches (n sur m ont un numéro, k action(s) en ont un) : le menu reste à plat.`).
- Renuméroter une tâche change son libellé : une sélection de filtre qui portait l'ancien libellé est retirée d'elle-même, comme pour toute valeur renommée. Renommer une action sans toucher à son numéro ne déplace aucune tâche.
- Le filtre **Actions** n'est pas concerné : il reste une liste à plat, qui lit la colonne `Actions` de `BDD`. Une action sans tâche numérotée n'apparaît pas dans le menu Tâches, mais reste dans ce filtre.

## Les logos et le bandeau du bas

Depuis la 1.14.0, les logos sont des **pièces jointes du document Grist** : le widget n'en contient aucun. Tout est facultatif, et le [guide utilisateur](utilisateurs.md#les-logos-et-le-bandeau-du-bas) montre le résultat. La mise en place (colonnes à créer, préparation des fichiers) est à l'étape 5 de [`GRIST_SETUP.md`](../GRIST_SETUP.md).

| Ce qu'on veut | Où le régler dans Grist |
|---|---|
| Le logo d'un établissement, sur ses cartes et dans le bandeau du bas | Colonne `logo` (Pièces jointes) de sa ligne d'`Etablissements` |
| Les établissements du bandeau du bas, et leur ordre | Cases `fondateur` et `ok_pour_apparaitre` cochées, puis colonne `ordre_bandeau` (Numérique) : 1, 2, 3… de gauche à droite. Sans numéro, l'établissement passe après les autres, dans l'ordre de la table |
| Les logos des financeurs, en haut de la page, et leur ordre | Table `Financeurs` : colonnes `nom`, `logo` (Pièces jointes) et `ordre` (Numérique) |
| Le rond qui ferme le bandeau du bas | Le financeur dont le `nom` est exactement `France 2030` (casse et accents ignorés) |

- **Ajouter ou remplacer un logo.** Cliquer la cellule `logo`, puis « + » (ou glisser le fichier). **Remplacer** le fichier plutôt qu'en ajouter un : seul le premier est affiché. De préférence un SVG (ou un PNG) sur fond transparent, rogné au plus près du dessin : le widget règle lui-même la taille de chaque logo pour qu'une rangée de formes différentes ait un poids voisin, mais il ne peut pas deviner une marge blanche. Puis **recharger la page** : modifier `Etablissements` ou `Financeurs` ne prévient pas le widget.
- **Changer l'ordre.** Modifier `ordre_bandeau` (bandeau du bas) ou `ordre` (financeurs), puis recharger.
- **Un établissement sans logo** garde sa pastille avec son acronyme sur les cartes, et son acronyme en texte dans le bandeau du bas : tant qu'aucun logo n'a été ajouté dans Grist, le bandeau du bas liste donc simplement les fondateurs validés, en texte. Un établissement qui n'est ni fondateur ni validé n'apparaît pas dans le bandeau.
- **La table `Financeurs`** se crée à la main et le widget n'y écrit jamais ; sans elle, l'en-tête n'a simplement pas de financeurs. Elle existe parce que les financeurs ne sont pas des établissements : les ranger dans `Etablissements` les ferait apparaître dans le filtre « Établissement » et dans les règles de visibilité.
- **Les vrais logos restent dans Grist.** Ne jamais les ajouter au dépôt public : les captures et la démonstration n'utilisent que des dessins inventés (`docs/demo/logos-fictifs.mjs`). Un logo n'est pas un secret : toute personne qui peut lire le document peut télécharger ses pièces jointes.
- **Sauvegarde.** Les logos sont des pièces jointes : les inclure dans les sauvegardes du document ([Continuité](#ce-quil-faut-prévoir)).

Les symptômes et leurs remèdes sont dans [Diagnostiquer un problème](#diagnostiquer-un-problème) ; ce que le jeton d'accès permet, et comment le widget limite sa fuite, dans la page [sécurité](securite.md#les-logos-et-le-jeton-daccès-aux-pièces-jointes).

## Contrôle après un changement de données

Après chaque changement de données (ajout, modification, import), vérifier les points suivants :

1. **Le nombre de contacts** affiché en haut à gauche, à côté du titre, correspond à ce qu'on attend.
2. **Chaque carte a le logo ou la pastille de son établissement** (colonne `Etablissement` correctement remplie).
3. **La console du navigateur** (F12), sur les lignes `[GRIST] Enregistrements reçus: N (contacts affichables : M)` et `[ETABLISSEMENT] …` : N est le nombre de lignes de la table, M celui des cartes possibles, et un message `[ETABLISSEMENT]` liste (vingt au plus) les identifiants de ligne des contacts qui ont un périmètre mais pas d'établissement. Un écart entre N et M peut venir de personnes qui n'ont pas accepté d'apparaître (la ligne `[CONSENTEMENT] n/m …` en donne le nombre), d'un établissement non validé, d'un statut « autres » ou d'une référence qui ne désigne plus aucune ligne : ces derniers cas ne sont pas détaillés.
4. **Aucun bandeau rouge** sous la barre d'outils.
5. **Les menus Compétences et Tâches** : si le menu Compétences montre des domaines et que le dernier s'appelle « Autres », des compétences n'ont pas de domaine ; si le menu Tâches montre des actions et que le dernier s'appelle « Sans action », des tâches n'ont pas de numéro d'action (voir [Opérations courantes](#opérations-courantes-dans-grist)).
6. **« Ma présence »** : ouvert avec son propre compte (dont l'adresse figure dans `BDD.email`), le widget affiche le bandeau, la console dit `[IDENTITE] personne identifiée …` et la table `Annuaire_Sonde` est vide.
7. **« ✎ Modifier »** : avec ce même compte, la carte de la personne porte « Votre fiche » et le bouton, et aucune autre carte n'en a ; avec un compte administrateur, aucune autre carte n'en a tant que le mode admin est éteint, et toutes les cartes affichées en ont un une fois le mode admin allumé ([`TESTING.md`](../TESTING.md), sections 13 et 16).
8. **Les logos** : les logos des établissements sur les cartes, ceux des financeurs au centre de l'en-tête, ceux des fondateurs dans l'ordre voulu tout en bas, et aucune ligne `[LOGOS]` dans la console ([`TESTING.md`](../TESTING.md), section 14).

## Diagnostiquer un problème

La console du navigateur (F12) porte le détail : `[GRIST]` (lignes reçues), `[REFS]` (entrées par catégorie de filtre, lectures échouées, compétences sans domaine, tâches sans action), `[ETABLISSEMENT]` (contacts sans établissement), `[CONSENTEMENT]` (personnes masquées faute d'accord), `[IDENTITE]` (pourquoi la personne connectée n'est pas identifiée), `[PRESENCE]` (écriture refusée), `[PROFIL]` (fiche illisible ou écriture refusée), `[SCHEMA]` (types de colonnes illisibles) et `[LOGOS]` (jeton d'accès aux pièces jointes refusé, habillage impossible). Aucune de ces lignes ne contient de nom, d'adresse ni de jeton, hormis le message brut d'une erreur renvoyée par Grist. Quand un logo ne se charge pas, c'est le navigateur lui-même qui écrit dans la console « Failed to load resource » avec l'adresse de l'image, jeton compris : ne pas partager cette ligne.

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Bandeau « Impossible de charger l'annuaire depuis Grist (table « X » illisible) » | La table X a été renommée, supprimée ou n'est plus accessible | Vérifier son nom dans Grist, puis recharger la page |
| Bandeau « Impossible de charger l'annuaire depuis Grist (colonne « X » absente de la table BDD) » (ou de la table `Etablissements`) | Une colonne obligatoire a été renommée ou supprimée : `nom`, `prenom`, `Etablissement`, `perimetre` ou `Accepte_apparaitre` dans `BDD` ; `fondateur`, `partenaire` ou `ok_pour_apparaitre` dans `Etablissements` | La rétablir sous son nom exact, puis recharger |
| Bandeau « Tables illisibles (X) : des libellés ou des tags peuvent manquer » | Même cause pour une table de référence : les cartes restent, avec les libellés du chargement précédent s'il y en a un (sinon, le filtre et les tags concernés restent vides) | Corriger la table, recharger |
| Bandeau « Colonne de libellé introuvable : T (A ou B) … » | Aucune des colonnes de libellé de la table T n'existe plus : les tags et le filtre correspondants restent vides. Si seule la colonne corrigée manque, le libellé brut est utilisé et seule la console avertit | Rétablir la colonne (voir le tableau des libellés dans [Opérations courantes](#opérations-courantes-dans-grist)), puis recharger |
| Bandeau « Acronymes en double dans Etablissements (X) … » | Cas rare : deux lignes de même acronyme, statuts différents, avec un établissement transmis sous forme de texte. Le statut le plus strict est retenu : les contacts sont masqués s'il ne les rend plus éligibles | Supprimer le doublon ou harmoniser ses statuts |
| Bandeau « perimetre est vide pour tous les contacts… » | La colonne `perimetre` ne contient plus rien | Vérifier la colonne dans Grist |
| Bandeau « Etablissement est vide pour tous les contacts… » | La colonne `Etablissement` est vide partout | Vérifier la colonne dans Grist |
| Bandeau « Personne n'a accepté d'apparaître : Accepte_apparaitre n'est coché pour aucun contact… » | La case n'est cochée pour personne : colonne recréée, import, ou colonne devenue une formule | Cocher la case des personnes qui ont accepté ; vérifier que c'est une colonne de données ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 1) |
| Bandeau « Aucun contact affichable alors que la table … contient des lignes… » | Aucune ligne ne remplit toutes les conditions | Reprendre le tableau [Pourquoi un contact est visible ou non](#pourquoi-un-contact-est-visible-ou-non) |
| Une personne manque | Une condition n'est pas remplie (dont l'accord de la personne), ou un interrupteur est désactivé | Même tableau ; vérifier aussi Fondateurs et Partenaires. La personne peut ouvrir « Ma présence » : son bandeau lui dit pourquoi |
| Une personne ne voit ni le bandeau « Ma présence » ni de bouton « ✎ Modifier » | Elle n'est pas identifiée : compte Lecteur (normal : le widget n'essaie rien et ne dit rien dans la console), table `Annuaire_Sonde` absente ou mal réglée, formule muette, ou écriture refusée par une règle d'accès | Hors compte Lecteur, lire la ligne `[IDENTITE] …` de sa console : elle dit laquelle ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étapes 2 et 4) |
| Le bandeau dit « Compte absent de l'annuaire » (ou « Fiche introuvable ») | Le compte est identifié, mais son adresse ne figure dans aucune ligne de `BDD.email` (ou `BDD` n'a pas de colonne `email`) : il n'y a pas de fiche à modifier, et le bandeau n'a ni interrupteur ni « Modifier mon profil » | Corriger l'adresse dans `BDD` ; la console dit `[IDENTITE] Aucune ligne de BDD ne porte l'adresse…` (ou `BDD n'a pas de colonne « email »`) |
| Message « Grist a refusé la modification : vos droits ne permettent pas de changer cette information. Contactez un administrateur. » sous le bandeau | Une règle d'accès interdit à cette personne de modifier sa case | Revoir la règle ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 4), ou cocher la case dans Grist à sa place, avec son accord |
| Message « Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche. Contactez un administrateur. » dans la fenêtre de relecture | Une règle d'accès interdit cette modification à cette personne (rien n'a été écrit, la relecture reste ouverte) | Revoir la règle, peut-être trop stricte ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 4), ou corriger la fiche dans Grist |
| Message « La colonne Accepte_apparaitre est une colonne à formule… » | La colonne n'est pas une colonne de données | La convertir ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 1) |
| Message « Une colonne de la fiche est une colonne à formule : elle ne peut pas être modifiée depuis le widget. Voir GRIST_SETUP.md. » | Une des colonnes que le widget écrit dans `BDD` est devenue une formule | La convertir en colonne de données ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 1) |
| Pas de bouton « ✎ Modifier » sur la carte de quelqu'un | Normal pour une personne ordinaire : elle n'a le bouton que sur sa propre fiche, un administrateur sur toutes les cartes affichées une fois le mode admin allumé (bouton « Mode admin » du bandeau). Une fiche masquée n'a pas de carte | Si c'est un administrateur qui ne le voit pas, la console dit `[IDENTITE] personne identifiée (administrateur : non)` : vérifier sa ligne d'`ACL` (adresse, case `admin`) et la colonne `Admin` de la sonde ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étapes 2 et 3), puis recharger la page |
| « Modifier mon profil » absent du bandeau, alors que la carte a son bouton | Plusieurs lignes de `BDD` portent la même adresse : le bandeau ne sait pas laquelle ouvrir (la console le dit : `[IDENTITE] … lignes de BDD portent la même adresse…`) | Supprimer ou corriger les doublons dans Grist |
| Message « La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau. » ou « Ces informations ont changé dans Grist depuis l'ouverture de la fenêtre : … » | Changement concurrent : quelqu'un a modifié les mêmes champs dans Grist entre-temps. Rien n'a été écrit | Relire la carte « Avant » (l'état actuel), puis valider à nouveau si la modification est toujours voulue |
| Message « Cette fiche n'existe plus dans Grist : rien n'a été modifié. » ou « La fiche n'a pas pu être relue dans Grist : rien n'a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | Fiche supprimée entre-temps, ou lecture de `BDD` refusée ou interrompue | Recharger la page ; lire la ligne `[PROFIL] …` de la console |
| Message « La modification n'a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | Autre refus ou panne de Grist à l'écriture | Lire la ligne `[PROFIL] écriture impossible` de la console |
| Message « Grist n'a pas gardé tout ce qui était demandé (…). Vérifiez la fiche dans Grist ou contactez un administrateur. » | Grist a accepté l'écriture, mais la fiche relue ne contient pas la valeur demandée pour les champs nommés | Vérifier la fiche, puis le réglage de ces colonnes dans Grist |
| Message « Les modifications sont enregistrées, mais l'annuaire n'a pas pu être rechargé. Rechargez la page pour les voir. » | L'écriture a réussi, mais la relecture de l'annuaire a échoué | Recharger la page |
| Message « Ces modifications ne peuvent pas être enregistrées : … » avec « la fiche contient des valeurs que le widget ne sait pas modifier, à corriger dans Grist » | Une liste de la fiche contient autre chose que des identifiants de ligne | Corriger la cellule dans Grist |
| Téléphone refusé : « Un numéro français compte 10 chiffres, par exemple 05 56 78 90 12. » ; texte refusé : « Ne peut pas commencer par = + - ou @. » ou « 200 caractères au plus. » | Saisie hors des contrôles du formulaire : numéro qui n'est pas un numéro français à 10 chiffres, texte qui commence par un signe de formule de tableur ou qui est trop long | Corriger la saisie |
| Avis « Votre établissement n'a pas validé sa présence… », « Votre fiche est masquée de l'annuaire… » ou « Votre fiche reste masquée de l'annuaire… » ; pour un administrateur, « … n'a pas validé sa présence : après cette modification… », « Cette fiche est masquée de l'annuaire… » ou « Cette fiche reste masquée de l'annuaire… », dans la relecture | Ce n'est pas une erreur : la modification sera enregistrée, mais la fiche ne figure pas dans l'annuaire (accord de la personne, périmètre, établissement…) tant que la cause demeure | Lire la raison dans l'avis, puis la lever dans Grist ou avec « Ma présence » |
| Un administrateur change l'e-mail d'une fiche : « Cette adresse est déjà utilisée par … », « Indiquez une adresse e-mail valide. » ou, à la validation, « Cette adresse e-mail est maintenant celle d'une autre fiche : rien n'a été modifié… » | Une autre fiche porte déjà cette adresse (elle retrouve la personne : deux fiches ne la partagent pas), ou l'adresse n'a pas la forme d'une adresse e-mail. À la relecture, l'avis « L'adresse change dans BDD, pas dans la table ACL… » n'est pas une erreur : le widget n'écrit jamais dans `ACL` | Choisir une autre adresse ; si la personne est administratrice, corriger aussi sa ligne d'`ACL` dans Grist |
| La table `Annuaire_Sonde` contient des lignes | Une page a été fermée entre l'ajout et la suppression de la ligne | Vider la table, sans risque |
| Une carte n'a ni logo ni pastille d'établissement | Ne devrait pas arriver : un contact sans établissement reconnu est masqué | Lire les lignes `[ETABLISSEMENT]` de la console |
| Tous les logos sont remplacés par des noms ; la console dit `[LOGOS] Jeton d'accès aux pièces jointes indisponible…` | Grist ne donne pas de jeton : version de Grist sans cette méthode, accès du widget insuffisant, ou compte qui ne peut pas lire les pièces jointes | Vérifier l'accès `full` du widget et la version de Grist ; essayer avec un compte qui peut modifier le document ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 5). Un seul avertissement par série d'échecs : le widget attend 30 secondes avant de redemander |
| Le nom d'un seul établissement ou financeur à la place de son logo | Le fichier est absent de la cellule `logo`, a été supprimé, ou n'est pas une image lisible | Remplacer le fichier dans Grist, puis recharger la page |
| Un fondateur manque dans le bandeau du bas | Il n'est pas fondateur, ou n'a pas validé son apparition (`ok_pour_apparaitre`) | Cocher les cases ; l'ordre est celui d'`ordre_bandeau` |
| Pas de financeurs en tête de page | La table `Financeurs` n'existe pas (ou son nom diffère), ou elle est vide | Reprendre les noms exacts de l'étape 5 de [`GRIST_SETUP.md`](../GRIST_SETUP.md) |
| Pas de bandeau en bas de page | Aucun établissement n'est à la fois `fondateur` et `ok_pour_apparaitre` | Cocher les deux cases pour les fondateurs |
| Le rond du bandeau du bas manque | Aucun financeur ne s'appelle exactement `France 2030` | Corriger le `nom` du financeur |
| Un logo paraît trop petit, ou entouré de blanc | Marge ou fond blanc dans le fichier | Rogner l'image, fond transparent |
| La console dit `[LOGOS] Impossible d'afficher les logos : …` | Erreur inattendue en construisant l'habillage ; les cartes restent affichées | Transmettre la ligne au mainteneur |
| Une section de tags manque sur une carte | La valeur liée n'a pas de libellé dans sa table de référence | Console : `[REFS] clé (Table): n entrées (k ligne(s) sans …)` ; renseigner le libellé |
| Le menu Compétences est une liste à plat, sans domaines, ou ne montre que « Autres » | La colonne `Macro_competences` n'existe plus (bandeau « Colonne de libellé introuvable »), ou aucune compétence n'a de domaine | Rétablir la colonne, ou renseigner les domaines, puis recharger |
| Le menu Tâches est une liste à plat, sans actions, ou ne montre que « Sans action » | Aucun libellé de tâche ne commence par un numéro « n.m », aucune action ne commence par « Action n », ou ces numéros ne se rejoignent pas | Numéroter les tâches et les actions comme indiqué dans [Opérations courantes](#opérations-courantes-dans-grist), puis recharger ; la ligne `[REFS] Taches` de la console donne les comptes |
| Un établissement manque dans le filtre Établissement | Il n'est pas validé (`ok_pour_apparaitre`) | Le valider, puis recharger |
| Une modification n'apparaît pas | Elle porte sur une table autre que celle des contacts | Recharger la page ([Limites connues](#limites-connues)) |
| Un téléphone s'affiche sans son 0 ou dans un format étrange | La colonne est numérique : le widget rétablit le 0 d'un numéro de 9 chiffres et met en forme un numéro de 10 chiffres qui commence par 0 ; toute autre valeur est affichée telle quelle | Corriger la valeur dans Grist |
| Une adresse n'est pas un lien | Adresse saisie sous une forme inhabituelle (plusieurs destinataires, paramètres) | La corriger dans Grist |
| Rien ne s'affiche, sans bandeau | Widget mal configuré, ou accès insuffisant | Vérifier l'URL du widget et son accès `full`, puis la console |

## Avant de publier une modification du code

1. `node --test` est entièrement vert, avec Playwright installé pour exécuter aussi les scénarios navigateur ([documentation développeur](developpeurs.md#tests)).
2. Si `main.js`, `render.js`, `profile-ui.js`, `index.html`, `style.css` ou `dialogs.css` ont changé : jouer le protocole manuel de [`TESTING.md`](../TESTING.md) dans une **copie** du document Grist.
3. Une correction a son test de non-régression.
4. [`CHANGELOG.md`](../CHANGELOG.md) et [`VERSION.md`](../VERSION.md) sont à jour.
5. Si l'interface a changé : captures régénérées (`node docs/demo/capturer.mjs`) et [guide utilisateur](utilisateurs.md) corrigé.

## Publier

1. Ouvrir une pull request vers `main` ; la CI doit être verte. (Publier directement sur `main` reste possible, mais la CI ne s'exécute alors qu'après la publication et ne la bloque pas : lancer `node --test` en local d'abord.)
2. Fusionner. **GitHub Pages republie le widget : tous les documents Grist qui l'utilisent reçoivent la nouvelle version au prochain chargement.** Il n'y a pas d'environnement de recette ni de déploiement progressif.
3. Dans un vrai document, vérifier le [contrôle après un changement de données](#contrôle-après-un-changement-de-données) (compteur, logos ou pastilles, console, bandeau).
4. Taguer la version publiée : `git tag vX.Y.Z` puis `git push origin vX.Y.Z`.

## Revenir en arrière

Si une version publiée pose problème, le plus sûr est d'annuler le changement par un **nouveau commit**, sans réécrire l'historique :

1. Repérer le commit fautif : `git fetch`, puis `git log --oneline origin/main`.
2. L'annuler avec `git revert`. Les pull requests de ce dépôt sont fusionnées par des commits de fusion (deux parents, numéro de la pull request dans le titre) :
   - pour annuler une pull request entière : `git revert -m 1 <identifiant de la fusion>` ;
   - pour un commit isolé : `git revert <identifiant du commit>`.
3. Passer par une pull request. En cas d'urgence, un push direct sur `main` reste possible : lancer `node --test` en local d'abord.
4. Attendre que GitHub Pages republie, puis recharger la page du document Grist.
5. Vérifier le [contrôle après un changement de données](#contrôle-après-un-changement-de-données).

Ne pas utiliser `git push --force` sur `main` : le widget en production se met à jour à chaque modification de cette branche.

## Dépendances et mises à jour

- **À l'exécution : aucune.** Le dépôt n'a pas de `package.json`. Le seul script externe est `grist-plugin-api.js`, chargé depuis `docs.getgrist.com` ([sécurité](securite.md#risques-et-protections)). Les logos ne sont pas une dépendance externe : ce sont des pièces jointes du document Grist.
- **En CI** ([`.github/workflows/tests.yml`](../.github/workflows/tests.yml)) : Node 22, `playwright@1.64.0` (version figée), `actions/checkout@v4` et `actions/setup-node@v4`. Les revoir à chaque nouvelle version majeure de Node, de Playwright ou de ces actions : mettre à jour le fichier, puis vérifier que les scénarios navigateur passent.
- **Pour lancer les tests en local** : Node 22.7 ou plus, ou 20.19 ou plus ([documentation développeur](developpeurs.md#tests)). Le dépôt n'a pas de `package.json` : en dessous, les tests échouent avant même de s'exécuter.
- **Navigateur** : le widget utilise des fonctions récentes (modules ES, `Object.hasOwn`, propriétés Unicode des expressions régulières) et demande donc un navigateur à jour.
- **API de Grist** : elle n'est pas versionnée côté widget. Après une mise à jour de l'instance Grist, rejouer le protocole manuel de [`TESTING.md`](../TESTING.md).

## Continuité : départs et absence d'administrateur

L'annuaire n'a ni serveur ni base de données à lui : il tient à des comptes qui appartiennent à des personnes. Si elles partent sans passation, il ne s'arrête pas du jour au lendemain, mais ses données se périment, plus personne ne peut le corriger et, selon le cas, il finit par disparaître. Ce chapitre dit de quoi il dépend, ce qui arrive dans chaque cas, ce qu'il faut prévoir à l'avance, les bonnes pratiques d'usage et comment le reprendre sans son créateur.

**L'essentiel**

1. **Deux propriétaires au moins** pour le document Grist, et deux au moins pour le dépôt GitHub. Le dépôt appartient aujourd'hui à un compte personnel, qui n'a qu'un seul propriétaire : c'est le point le plus fragile ([hébergement et risques à ce jour](#hébergement-et-risques-à-ce-jour)).
2. **Une sauvegarde régulière** du document Grist, rangée hors du dépôt public.
3. **Une fiche de continuité** : qui possède quoi, qui remplace qui, où sont les sauvegardes.
4. **Les personnes qui partent sont retirées** de l'annuaire, et leurs accès supprimés, dès leur départ.
5. **Un contrôle tous les trimestres** ([contrôles réguliers](#contrôles-réguliers)).

### De quoi l'annuaire dépend

| Élément | Où il se trouve | Qui peut le gérer | Si plus personne ne peut le gérer |
|---|---|---|---|
| **Les données** | Le document Grist, sur l'instance de l'État (`grist.numerique.gouv.fr`) | Les propriétaires du document, de son espace de travail et du site qui les contient : les accès se transmettent du site à l'espace de travail, puis au document | Le widget affiche toujours les données du document, mais personne ne peut plus les corriger, ni changer le partage ou les règles d'accès, réservés aux propriétaires. La documentation de Grist ne dit pas comment reprendre la main : ne pas y compter |
| **Le code** | Le dépôt GitHub `lombre33/Annuaire_PUI_Bordeaux` | Son seul propriétaire, le compte personnel `lombre33` de la personne qui a créé le widget | Le widget continue de fonctionner, mais rien ne peut plus être corrigé ni publié. Si le compte est supprimé, GitHub supprime ses dépôts et ses sites Pages, donc le widget, et ne peut pas les restaurer |
| **Les réglages de « Ma présence » et de la modification de fiche** | Le document Grist : table `Annuaire_Sonde` et ses formules, colonnes de données que le widget écrit dans `BDD`, table `ACL`, règles d'accès | Les propriétaires du document | Sans la sonde, plus personne n'est identifié : l'annuaire s'affiche normalement, mais sans bandeau ni modification (le widget échoue en sécurité). Sans `ACL`, la formule de `Admin` ne peut plus s'appliquer et plus personne ne serait reconnu comme administrateur (comportement de Grist non constaté : à essayer sur une copie). Les formules ne se recréent pas seules : la marche à suivre est dans [`GRIST_SETUP.md`](../GRIST_SETUP.md) |
| **Les logos** | Le document Grist : colonne `logo` d'`Etablissements`, table `Financeurs` | Les propriétaires et les éditeurs du document | Les logos déjà en place restent affichés mais ne peuvent plus être remplacés. Si les fichiers sont supprimés, les noms les remplacent : l'annuaire continue de fonctionner |
| **L'adresse du widget** | GitHub Pages, saisie dans « Enter Custom URL » du widget de chaque page Grist | Le même compte | Renommer ou transférer le dépôt change l'adresse du site **sans redirection** : à la place de l'annuaire, Grist affiche une erreur ou une zone vide, tant que l'adresse n'est pas corrigée dans chaque page |
| **Le script de l'API Grist** | `docs.getgrist.com`, chargé par `index.html` | Grist | Sans lui, la page affiche « 0 contact » sans bandeau d'explication ; le détail est dans la console du navigateur |
| **La connaissance** | Cette documentation, `grist_structure.txt`, `specs.md`, les tests | Quiconque peut écrire dans le dépôt | Elle se périme : `tests/docs.test.mjs` signale une partie des oublis, pas tous |

Rien n'est à renouveler (pas de serveur, pas de nom de domaine, pas de certificat), mais il suffit qu'un compte ou une adresse de messagerie disparaisse pour tout bloquer.

### Hébergement et risques à ce jour

État des lieux au 12 octobre 2026, tel que le propriétaire du dépôt le décrit :

- **Le code est sur le compte GitHub personnel de la personne qui a créé le widget** (`lombre33`), seule propriétaire du dépôt et du site GitHub Pages qui sert le widget. C'est le point le plus fragile de l'annuaire.
- **Une migration vers le GitLab UB n'est pas possible aujourd'hui** : il n'a pas de module « Pages », or le widget est une page statique que Grist charge par son adresse web.
- **Piste proposée : migrer vers un GitHub DIESE.** Une migration change l'adresse du site, sans redirection : la faire une fois, puis corriger l'adresse du widget dans chaque page Grist, comme le décrit [Ce qu'il faut prévoir](#ce-quil-faut-prévoir), point 3.
- **Dans Grist, les administrateurs sont uniquement des agents en poste à ce jour.** Si tous partent sans passation, plus personne n'administre le document : voir [Ce qui arrive si…](#ce-qui-arrive-si), et [Ce qu'il faut prévoir](#ce-quil-faut-prévoir), points 1 et 2.

### Ce qui arrive si…

| Situation | Effet sur l'annuaire | Que faire |
|---|---|---|
| Une personne de l'annuaire quitte le PUI ou change de structure | Sa carte reste affichée avec des coordonnées périmées : le widget ne sait rien des départs | La retirer sans attendre ([Quand quelqu'un part](#quand-quelquun-part)) |
| L'administrateur des données part | Plus personne pour valider un établissement, ajouter une valeur de filtre ou corriger une fiche : l'annuaire se fige | Lui faire transmettre le rôle avant son départ ; avoir un suppléant |
| Un administrateur de l'annuaire part sans que sa ligne d'`ACL` soit retirée | Son droit d'administrateur (case `admin`) subsiste tant que la ligne existe et qu'il garde son adresse : il peut encore modifier toutes les fiches affichées, sans validation | Décocher `admin` ou supprimer sa ligne dans `ACL` ([Quand quelqu'un part](#quand-quelquun-part)) |
| La table `Annuaire_Sonde`, ses formules ou `ACL` sont supprimées ou renommées | Sans la sonde ou ses formules, plus personne n'est identifié : pas de bandeau « Ma présence ». Sans `ACL`, plus d'administrateur reconnu (comportement de Grist non constaté : à essayer sur une copie). Les cartes s'affichent comme avant | Recréer la table d'après [`GRIST_SETUP.md`](../GRIST_SETUP.md), étapes 2 et 3 |
| Le seul propriétaire du document Grist n'a plus accès à son compte | Plus personne ne peut gérer le partage ni les règles d'accès | Prévenir : au moins deux propriétaires. Sinon, demander de l'aide à l'équipe qui gère l'instance Grist, sans garantie de réponse |
| Le compte GitHub propriétaire est inaccessible ou supprimé | Inaccessible : le widget fonctionne, mais aucune correction ni publication n'est possible. Supprimé : le dépôt, donc le widget, disparaît | Dépôt dans une organisation à deux propriétaires, copie de secours ([Reprendre l'annuaire sans son créateur](#reprendre-lannuaire-sans-son-créateur)) |
| Le dépôt est renommé ou transféré | L'adresse du widget change, sans redirection | Corriger l'adresse dans chaque page Grist |
| GitHub Pages ou `docs.getgrist.com` est indisponible | Le widget est vide ou affiche « 0 contact » | Attendre : les données ne sont pas touchées |
| Le document Grist est supprimé par erreur | Ses données et son historique disparaissent avec lui | Le restaurer depuis la corbeille dans les 30 jours ; au-delà, depuis une sauvegarde |
| Une mise à jour de Grist change son API | Le widget peut mal fonctionner | Rejouer [`TESTING.md`](../TESTING.md) après chaque mise à jour de l'instance ([Dépendances et mises à jour](#dépendances-et-mises-à-jour)) |

### Ce qu'il faut prévoir

1. **Au moins deux propriétaires du document Grist**, nommés, de préférence dans des services différents. Un propriétaire ne peut pas modifier son propre accès : c'est un autre propriétaire qui le retire quand la personne part, ce qui suppose d'en avoir deux. Penser aussi à l'espace de travail et au site qui contiennent le document : leurs accès se transmettent au document.
2. **Un administrateur des données et un suppléant**, qui savent tous deux ajouter une personne, valider un établissement, ajouter une valeur de filtre et désigner un administrateur de l'annuaire ([Opérations courantes](#opérations-courantes-dans-grist)).
3. **Le dépôt dans une organisation GitHub** avec deux propriétaires au moins. GitHub le recommande : avec un seul propriétaire injoignable, les projets de l'organisation peuvent devenir inaccessibles. Un dépôt personnel n'a qu'un propriétaire ; ses collaborateurs peuvent pousser du code, mais ni supprimer le dépôt, ni changer sa visibilité, ni inviter d'autres personnes. Le transfert change l'adresse de GitHub Pages : le faire une fois, à un moment choisi, corriger l'adresse dans chaque page Grist, puis faire le [contrôle](#contrôle-après-un-changement-de-données). La piste proposée est un GitHub DIESE ([hébergement et risques à ce jour](#hébergement-et-risques-à-ce-jour)). À défaut d'organisation, GitHub permet de désigner un **successeur** du compte personnel (réglages du compte, « Successor settings »).
4. **Des sauvegardes hors de Grist.** Grist garde lui-même des instantanés du document (d'après sa documentation : horaires pendant environ un jour, mensuels pendant plus d'un an, à vérifier sur l'instance utilisée), mais ils disparaissent avec le document s'il est supprimé définitivement. Télécharger régulièrement le document (fichier `.grist`, qui ne contient pas la liste des personnes avec qui il est partagé : la noter à part) et ses pièces jointes éventuelles (les logos ; les photos de profil, quand elles existeront), puis les ranger dans un espace à accès restreint, jamais dans le dépôt public. Une sauvegarde contient des données personnelles : prévoir sa durée de conservation et sa destruction.
5. **Une copie du code** ailleurs que sur le compte d'origine (un clone ou un fork sur un autre compte ou une autre forge) : supprimer un compte supprime ses dépôts, pas les copies faites ailleurs.
6. **Une licence.** Le dépôt n'en déclare aucune : par défaut, tous les droits sont réservés, et la reprise du code par d'autres suppose l'accord de son propriétaire. À décider par le propriétaire du dépôt.
7. **Une fiche de continuité** (ci-dessous), tenue à jour et rangée hors du dépôt public, parce qu'elle contient des noms et des adresses.

### Fiche de continuité

À copier dans un document **hors du dépôt public**, puis à remplir et à relire (voir [Contrôles réguliers](#contrôles-réguliers)).

| Élément | Titulaire | Suppléant | Où le trouver | Vérifié le |
|---|---|---|---|---|
| Propriétaires du document Grist (et de son espace de travail) | | | | |
| Administrateur des données | | | | |
| Administrateurs de l'annuaire (cases `admin` d'`ACL`) et règles d'accès du document | | | | |
| Mainteneur du code | | | | |
| Propriétaires de l'organisation GitHub | | | | |
| Pages Grist qui utilisent le widget, et adresse saisie dans chacune | | | | |
| Sauvegardes : emplacement, fréquence, durée de conservation | | | | |
| Responsable du traitement des données personnelles ([sécurité](securite.md#données-personnelles)) | | | | |

### Bonnes pratiques d'usage

**Administrateur des données**

- Modifier les données **dans le document Grist seulement**, jamais dans une copie qui divergerait ensuite.
- **Ne pas renommer ni supprimer** une table ou une colonne que le widget lit (elles sont listées dans [`grist_structure.txt`](../grist_structure.txt)), ni `Annuaire_Sonde`, ses colonnes `Email` et `Admin` et leurs formules : l'annuaire affiche un bandeau rouge, perd une information ou n'identifie plus personne. Pour restructurer, travailler sur une copie du document, puis prévenir le mainteneur. Une règle d'accès Grist peut réserver la modification de la structure aux propriétaires (rubrique « Lock down structure » de la documentation des règles d'accès de Grist).
- **Retirer un établissement** en décochant `ok_pour_apparaitre`, pas en supprimant sa ligne : un contact dont l'établissement n'existe plus est masqué sans aucun message.
- **Respecter le choix des personnes.** Ne cocher `Accepte_apparaitre` qu'avec l'accord de la personne, et ne pas recocher la case d'une personne qui l'a décochée. Décocher masque sans effacer : pour effacer, supprimer la ligne ([Quand quelqu'un part](#quand-quelquun-part)).
- **Limiter les administrateurs de l'annuaire** (cases `admin` d'`ACL`) au strict nécessaire, et relire cette liste chaque trimestre avec celle des éditeurs du document : depuis la 1.12.0, chacun peut modifier la fiche de n'importe qui, sans validation.
- **Relire les règles d'accès** du document chaque trimestre ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 4), et les tester sur une **copie** avec un compte ordinaire : elles n'ont pas été essayées dans un vrai Grist.
- **Prévenir les personnes que leurs modifications sont immédiates** : le widget ne les fait valider par personne et n'en garde aucun historique ; la relecture « Avant » et « Après » est leur seul garde-fou. Leur dire aussi que les administrateurs peuvent modifier toutes les fiches.
- **Après une mauvaise modification** (erreur ou malveillance), l'équipe peut remettre l'ancienne valeur, avec le widget ou dans Grist. Pour la retrouver : le bouton « Annuler » de Grist, qui défait, selon [`GRIST_SETUP.md`](../GRIST_SETUP.md), le dernier changement du widget (non constaté dans un vrai Grist) ; l'historique du document (onglet « Activité »), qui garde sans doute les changements ; les instantanés de Grist (d'après sa documentation, à vérifier sur l'instance). Le widget, lui, ne garde rien. En cas de malveillance, retirer aussi l'accès de la personne au document et sa ligne d'`ACL`, puis vérifier les règles d'accès.
- Après chaque changement, faire le [contrôle](#contrôle-après-un-changement-de-données) ; après une modification d'une table de référence, **recharger la page**.
- Donner le rôle **Éditeur** (Editor) à qui doit modifier les données, **Lecteur** (Viewer) aux autres, et **Propriétaire** (Owner) à très peu de personnes. Relire cette liste chaque trimestre. Un compte Lecteur n'a ni bandeau « Ma présence » ni bouton « ✎ Modifier » : pour qu'une personne gère elle-même son accord et sa fiche, il lui faut le droit de modifier le document, restreint par des règles d'accès à sa seule fiche ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 4, à tester d'abord sur une copie).
- **Vérifier qui a accès au document** : l'annuaire n'est pas mieux protégé que lui ([sécurité](securite.md#affichage-et-droits-daccès)). Savoir aussi qui peut voir son historique : chaque ouverture du widget par une personne qui peut écrire, et chaque modification de fiche, y laisse sans doute une trace ([sécurité](securite.md#écritures-et-règles-daccès)).
- **Répondre sans délai** à une personne qui demande à corriger sa fiche ou à disparaître de l'annuaire ([Quand quelqu'un part](#quand-quelquun-part)). Elle corrige elle-même sa fiche avec « ✎ Modifier » ; l'e-mail et l'établissement se changent à sa demande par un administrateur (avec le mode admin, ou dans Grist) ; le périmètre se change dans Grist.

**Mainteneur du code**

- Passer par une **pull request** à la CI verte : un push direct sur `main` publie aussitôt pour tous les documents.
- **Tester dans une copie** du document avant de publier ([`TESTING.md`](../TESTING.md)), puis taguer la version.
- Tenir la **documentation à jour** ([Maintenir la documentation](#maintenir-la-documentation)) : le guide de contribution de Grist.Gouv demande qu'un widget soit assez documenté pour qu'une autre personne puisse le comprendre et le faire évoluer sans son auteur.
- Ne jamais mettre dans le dépôt public de vraie donnée ni le schéma complet du document.
- Activer l'**authentification à deux facteurs** et protéger la branche `main` ([sécurité](securite.md#recommandations)).
- **Ne pas renommer ni déplacer le dépôt** sans prévenir : l'adresse du widget en dépend.

### Quand quelqu'un part

**Une personne de l'annuaire**

1. Pour la **masquer sans l'effacer**, décocher `Accepte_apparaitre` (la personne peut aussi le faire elle-même avec « Ma présence »). Pour l'**effacer**, supprimer sa ligne de `BDD` : les instantanés de Grist permettent de la retrouver pendant un temps.
2. Si elle a accès au document Grist, retirer cet accès (sinon elle peut encore modifier sa fiche avec le widget, et celles des autres si elle est administrateur) ; si elle figure dans `ACL`, décocher `admin` ou supprimer sa ligne.
3. Si elle a demandé l'effacement de ses données, purger aussi les sauvegardes qui la contiennent, selon la durée de conservation prévue.

**Un administrateur des données, un propriétaire ou un mainteneur**

1. **Avant son départ**, ajouter son successeur comme propriétaire du document Grist (et de l'espace de travail et du site si besoin) et de l'organisation GitHub, et, s'il administre l'annuaire, cocher `admin` pour son successeur dans `ACL`.
2. Faire un **exercice à blanc** avec lui : ouvrir le document, ajouter puis retirer une valeur dans une copie, lancer `node --test`, ouvrir la dernière pull request.
3. **Faire retirer ses accès** par un autre propriétaire, côté Grist et côté GitHub : on ne peut pas modifier son propre accès. Retirer aussi sa ligne d'`ACL`.
4. **Exporter une sauvegarde** du document, avec ses pièces jointes.
5. **Mettre à jour la fiche de continuité**, et prévenir les personnes qui utilisent l'annuaire si l'administrateur des données change.

### Contrôles réguliers

| Quand | Quoi |
|---|---|
| À chaque changement de données | Le [contrôle](#contrôle-après-un-changement-de-données) : compteur, logos ou pastilles, bandeau |
| Chaque mois | Relire la liste des personnes : départs, changements de fonction ou de structure. Ouvrir l'annuaire et vérifier qu'aucun bandeau rouge n'apparaît |
| Chaque trimestre | Vérifier les propriétaires et les éditeurs du document Grist, les administrateurs de l'annuaire (`ACL`), les règles d'accès du document et les propriétaires de l'organisation GitHub. Vérifier que la table `Annuaire_Sonde` est vide. Exporter une sauvegarde et la ranger. Vérifier que la dernière exécution de la CI sur `main` est verte et que l'annuaire s'ouvre depuis Grist |
| Chaque année, et à chaque changement d'équipe | Relire la fiche de continuité. **Tester une restauration** : importer la sauvegarde dans un nouveau document et y ouvrir l'annuaire. Relire la durée de conservation des sauvegardes et les [dépendances](#dépendances-et-mises-à-jour) |

### Reprendre l'annuaire sans son créateur

Le dépôt est public et le widget est une page statique, sans compilation : tant que le dépôt (ou une copie) existe, une autre personne peut le reprendre.

1. **Récupérer le code** : `git clone https://github.com/lombre33/Annuaire_PUI_Bordeaux.git`, ou une copie de secours. Sans licence, la reprise suppose l'accord du propriétaire.
2. **Vérifier qu'il fonctionne** : `node --test` (Node 22.7 ou plus), puis `node docs/demo/serveur-demo.mjs` pour le voir sans Grist ([README](../README.md#essayer-sans-grist)).
3. **Le publier** : copier `index.html`, `style.css`, `dialogs.css` et les fichiers `.js` de la racine ([Organisation du code](developpeurs.md#organisation-du-code)) sur un hébergement de pages statiques en HTTPS, ou activer GitHub Pages sur la copie.
4. **Pointer Grist vers la nouvelle adresse** : dans chaque page du document, ouvrir les options du widget et remplacer l'adresse dans « Enter Custom URL ». L'accès complet est à accorder de nouveau si Grist le demande.
5. **Contrôler** : [contrôle après un changement de données](#contrôle-après-un-changement-de-données), puis protocole de [`TESTING.md`](../TESTING.md).
6. **Reprendre la main sur les données** : il faut être propriétaire du document Grist (voir [De quoi l'annuaire dépend](#de-quoi-lannuaire-dépend)).

Une piste plus durable : le guide de contribution des widgets Grist.Gouv (juillet 2026) prévoit que l'équipe de l'instance de l'État puisse reprendre un widget public (chemin A), voire l'héberger sur ses instances après une revue de sécurité (chemin B). Cela supprimerait la dépendance à un compte personnel. Rien n'est engagé.

## Limites connues

- **Les logos n'ont pas été essayés dans un vrai Grist.** Le widget suit la méthode que documente Grist pour afficher une pièce jointe (jeton `getAccessToken` en lecture seule, adresse `/attachments/<identifiant>/download?auth=…`), mais les tests simulent la réponse de Grist : le contrôle est la section 14 de [`TESTING.md`](../TESTING.md). Un seul fichier par cellule est affiché (le premier), et un changement dans `Etablissements` ou `Financeurs` demande de recharger la page. Le jeton, valable quelques minutes, figure dans l'adresse des images : ne pas partager de capture de la console ou de l'onglet Réseau ([sécurité](securite.md#les-logos-et-le-jeton-daccès-aux-pièces-jointes)).
- **Modifier une table de référence ne rafraîchit pas le widget.** Grist ne prévient le widget que des changements de la table liée à sa section (la table des contacts). Après avoir modifié `Etablissements` (par exemple `ok_pour_apparaitre`) ou une autre table de référence, recharger la page.
- **Établissement sans acronyme.** Le libellé d'un établissement est son acronyme, ou son nom complet quand l'acronyme est vide. Le contact y est rattaché par l'identifiant de ligne de sa référence `Etablissement`, sans dépendre de ce libellé : un établissement sans acronyme s'affiche donc avec son nom complet.
- **Script de l'API Grist.** `index.html` charge `grist-plugin-api.js` depuis `docs.getgrist.com`, sans version figée. Le charger depuis l'instance utilisée serait plus cohérent, mais cela ne se vérifie que dans un vrai document Grist : ce changement n'a pas été fait.
- **Accès `full`, choisi délibérément.** Le widget voit tout le document, pas seulement l'annuaire. C'est un choix assumé, que des garde-fous doivent encadrer ([sécurité](securite.md#niveau-daccès-demandé-à-grist)).
- **Un domaine se déduit des compétences.** Une personne sans compétence n'a aucun domaine : elle n'est comptée dans aucun domaine du menu Compétences. Il en va de même pour les actions du menu Tâches, qui se déduisent des tâches.
- **L'action d'une tâche se lit dans son libellé.** Aucune colonne ne la porte : une tâche dont le libellé n'a pas la forme « n.m … », ou dont le numéro ne correspond à aucune action, est rangée sous « Sans action ». Renumérotée, une tâche change de libellé, donc de valeur de filtre.
- **« Ma présence » et « ✎ Modifier » sont des verrous d'interface, pas une sécurité.** L'interrupteur n'agit que sur la fiche de la personne connectée et le bouton n'apparaît que sur sa carte (sur toutes les cartes affichées pour un administrateur en mode admin), mais la console du navigateur les contourne : seules les règles d'accès de Grist protègent vraiment `BDD`, y compris `email`, `Etablissement` et `perimetre` ([sécurité](securite.md#écritures-et-règles-daccès)). Les règles proposées dans [`GRIST_SETUP.md`](../GRIST_SETUP.md) n'ont pas été essayées dans un vrai document : à tester sur une copie.
- **« Ma présence » et la modification de fiche supposent des réglages dans Grist** ([`GRIST_SETUP.md`](../GRIST_SETUP.md)) et un compte qui peut modifier le document : un compte Lecteur n'a ni bandeau ni bouton. La personne n'est retrouvée que si l'adresse de son compte Grist figure dans `BDD.email` (casse et espaces ignorés). Si plusieurs lignes portent la même adresse, son choix de présence s'applique à toutes et le bandeau ne propose pas « Modifier mon profil » (chaque carte garde son bouton « ✎ Modifier »).
- **Chaque ouverture laisse sans doute une trace dans l'historique du document** (création puis suppression d'une ligne de `Annuaire_Sonde`, avec l'adresse de la personne) ; qui peut la voir et combien de temps elle est conservée sont à vérifier dans l'instance ([sécurité](securite.md#écritures-et-règles-daccès)).
- **Les administrateurs voient « ✎ Modifier la fiche » sur toutes les cartes affichées, une fois le mode admin allumé.** Le droit vient d'`ACL` par la sonde et se lit à l'ouverture de la page : un droit ajouté ou retiré ne se voit qu'après rechargement. Le mode admin, lui, est éteint à chaque ouverture. Une fiche masquée de l'annuaire n'a pas de carte, donc pas de bouton : elle se corrige dans Grist. Changer l'adresse e-mail d'une fiche ne change pas la table `ACL` : si la personne est administratrice ou responsable d'établissement (la colonne `Responsable_de_l_Etablissement` n'est pas encore lue par le widget), il faut aussi corriger sa ligne d'`ACL`. Le périmètre d'une fiche ne se modifie pas avec le widget, même pour un administrateur : cela se fait dans Grist.
- **Pas de validation, pas d'historique du widget.** Les modifications s'appliquent tout de suite et le widget n'en garde aucune trace. Pour savoir qui a changé quoi : l'historique du document Grist, qui garde sans doute les changements (à constater dans l'instance) ; pour revenir en arrière : « Annuler » (selon [`GRIST_SETUP.md`](../GRIST_SETUP.md), non constaté dans un vrai Grist) et les instantanés de Grist.
- **Le changement concurrent est détecté, pas empêché.** Si les champs touchés ont changé dans Grist depuis la relecture, rien n'est écrit et la personne relit. Mais le widget relit la fiche juste avant d'écrire : un changement survenu entre cette lecture et l'écriture n'est pas détecté. Deux modifications de champs différents se cumulent, y compris dans une liste.
- **Le téléphone s'écrit dans la forme de sa colonne.** Colonne numérique : un nombre, sans 0 initial (la carte le rétablit) ; colonne de texte : le numéro avec ses espaces. Le widget lit le type de la colonne dans les métadonnées de Grist (`_grist_Tables_column`) ; s'il ne peut pas (la console dit `[SCHEMA] Types de colonnes illisibles`), il suit la forme de la cellule actuelle. Seul un numéro français à 10 chiffres est accepté.
- **Les listes ne contiennent que des valeurs connues.** Le formulaire propose les valeurs des tables de référence ; une valeur sans libellé reste telle quelle dans la fiche, et une cellule de liste qui contient autre chose que des identifiants de ligne n'est pas réécrite (le widget le dit : à corriger dans Grist).
- **Recherche par nom ou par prénom, pas les deux.** Le champ teste le nom et le prénom séparément : « Élise Marchetti » ne donne aucun résultat, « Élise » ou « Marchetti » trouvent la carte.
- **Ordre des cartes.** Les cartes s'affichent dans l'ordre où Grist envoie les lignes de `BDD`, sans tri ; seuls les menus de filtre sont triés par ordre alphabétique.
- **Cas que le bandeau ne signale pas.** Un contact dont l'établissement désigne une ligne qui n'existe plus est masqué sans message, et une colonne facultative supprimée de `BDD` (`email`, `Fonction`, `numero_de_telephone`, `Role_dans_le_PUI`) fait simplement disparaître l'information des cartes. Pour repérer le premier cas, comparer N et M dans la ligne `[GRIST]` de la console.
- **Mise en page éprouvée dans Chromium seulement.** Le widget s'adapte à la largeur de son cadre (de 320 pixels à un grand écran), mais les tests automatiques ne couvrent ni Safari, ni Firefox, ni un vrai Grist sur téléphone : [`TESTING.md`](../TESTING.md), section 12. Entre 600 et 675 pixels de large environ, le bouton « Réinitialiser » se retrouve seul sur sa ligne, sous la recherche.
- **Échelle.** Toutes les cartes sont construites à chaque changement, sans pagination. Mesure faite à la version 1.7.1, avant l'arrivée de la table `BDD` : taper dans la recherche coûte 10 à 17 ms avec 500 lignes et 45 à 65 ms avec 2 000 lignes. À l'échelle actuelle, rien n'est à faire ; au-delà de plusieurs milliers de contacts, une pagination serait à étudier.
- **Pas de test contre un vrai Grist.** Les tests automatiques simulent l'API ; seul le protocole manuel de [`TESTING.md`](../TESTING.md) valide le comportement dans Grist.

## Maintenir la documentation

| Si l'on change… | Mettre à jour… |
|---|---|
| L'interface | [Guide utilisateur](utilisateurs.md), captures (`node docs/demo/capturer.mjs`), [`TESTING.md`](../TESTING.md) |
| Les logos ou le bandeau du bas | [`GRIST_SETUP.md`](../GRIST_SETUP.md) (étape 5), [Les logos et le bandeau du bas](#les-logos-et-le-bandeau-du-bas), la page [sécurité](securite.md#les-logos-et-le-jeton-daccès-aux-pièces-jointes), les logos inventés de `docs/demo/logos-fictifs.mjs` et les captures |
| Une règle d'affichage | [`specs.md`](../specs.md), le schéma de la [documentation développeur](developpeurs.md#règles-daffichage), [Pourquoi un contact est visible ou non](#pourquoi-un-contact-est-visible-ou-non), le guide utilisateur, le résumé du [README](../README.md), la ligne « Affichage d'un contact » des [risques](securite.md#risques-et-protections), et le réglage par défaut des interrupteurs Fondateurs et Partenaires |
| La structure Grist (tables, colonnes) | [`grist_structure.txt`](../grist_structure.txt), `tests/fixtures.mjs`, `docs/demo/donnees-fictives.mjs`, les noms cités dans cette page et dans la documentation développeur |
| Le code (modules, noms de fonctions) | [Documentation développeur](developpeurs.md) : `tests/docs.test.mjs` signale un nom de fonction cité qui n'existe plus |
| Les droits ou les écritures du widget | [Sécurité](securite.md), [`GRIST_SETUP.md`](../GRIST_SETUP.md), et toutes les mentions de ce que le widget écrit (README, `specs.md`, guide utilisateur, documentation développeur, `grist_structure.txt`, `TESTING.md`) : `tests/docs.test.mjs` échoue si une page le dit « en lecture seule » ou si le code emploie une méthode d'écriture que la page de sécurité ne cite pas |
| Une version | [`CHANGELOG.md`](../CHANGELOG.md), [`VERSION.md`](../VERSION.md), et les mentions de la version courante (rechercher son numéro dans `README.md` et dans `docs/`) |
| Un message du bandeau d'état | [Guide utilisateur](utilisateurs.md#messages-du-bandeau-rouge), [Diagnostiquer un problème](#diagnostiquer-un-problème), [Fiabilité](developpeurs.md#fiabilité--que-se-passe-t-il-en-cas-de-panne-) |
| Une version de Node, de Playwright ou d'une action CI | [Dépendances et mises à jour](#dépendances-et-mises-à-jour), [Sécurité](securite.md#risques-et-protections), [Documentation développeur](developpeurs.md#versions-déploiement-et-ci) |
| Les propriétaires, les sauvegardes ou l'adresse du widget | La fiche de continuité (hors dépôt) et le chapitre [Continuité](#continuité--départs-et-absence-dadministrateur) |

`tests/docs.test.mjs` vérifie aussi que les liens et images de la documentation existent, que chaque image a un texte alternatif et que le jeu de démonstration reste fictif et lisible par le vrai widget.

## Pistes d'amélioration

Non engagées ; à décider par le propriétaire du dépôt.

- Essayer les règles d'accès proposées ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 4) dans un vrai document Grist, avec un compte ordinaire et un administrateur ([`TESTING.md`](../TESTING.md), section 13), puis corriger la documentation si le comportement diffère.
- Rattraper les étiquettes de version manquantes : seule `v1.3.1` existe aujourd'hui, alors que l'étape 4 de « Publier » demande d'étiqueter chaque version.
- Protéger la branche `main` (voir [sécurité](securite.md#recommandations)) et activer les mises à jour automatiques des actions GitHub (Dependabot).
- Ajouter une licence : le dépôt est public et n'en déclare aucune ; par défaut, tous les droits sont réservés.
- Paginer ou charger progressivement les cartes si l'annuaire grossit beaucoup.
- Compléter le [lexique du PUI](utilisateurs.md#lexique-du-pui) : Instances, Actions, Communautés, Tâches, Rôle PUI et périmètre attendent une définition.
- Déplacer le dépôt dans une organisation GitHub à deux propriétaires au moins (piste proposée : un GitHub DIESE), et choisir une licence (voir [Continuité](#continuité--départs-et-absence-dadministrateur)).
