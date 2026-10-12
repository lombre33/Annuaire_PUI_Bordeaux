# Maintenance

Cette page explique comment garder l'annuaire et le widget en bon état : qui fait quoi, comment renseigner et corriger les données dans Grist, comment diagnostiquer un problème, comment publier et revenir en arrière, et quelles sont les limites connues. Elle décrit la **version 1.9.0**.

Pages liées : [README](../README.md), [guide utilisateur](utilisateurs.md), [documentation développeur](developpeurs.md), [sécurité](securite.md).

## Sommaire

- [Qui fait quoi](#qui-fait-quoi)
- [Pourquoi un contact est visible ou non](#pourquoi-un-contact-est-visible-ou-non)
- [Opérations courantes dans Grist](#opérations-courantes-dans-grist)
- [Contrôle après un changement de données](#contrôle-après-un-changement-de-données)
- [Diagnostiquer un problème](#diagnostiquer-un-problème)
- [Avant de publier une modification du code](#avant-de-publier-une-modification-du-code)
- [Publier](#publier)
- [Revenir en arrière](#revenir-en-arrière)
- [Dépendances et mises à jour](#dépendances-et-mises-à-jour)
- [Limites connues](#limites-connues)
- [Maintenir la documentation](#maintenir-la-documentation)
- [Pistes d'amélioration](#pistes-damélioration)

## Qui fait quoi

| Rôle | Responsabilités | Outils |
|---|---|---|
| **Administrateur des données** | Contacts, établissements et leur statut, valeurs des listes de filtres, validation des apparitions | Le document Grist |
| **Mainteneur du code** | Widget, tests, publication, documentation | GitHub, `node --test` |

Le dépôt est celui du compte GitHub `lombre33` : <https://github.com/lombre33/Annuaire_PUI_Bordeaux>.

## Pourquoi un contact est visible ou non

Une personne n'est affichée que si **toutes** les conditions suivantes sont vraies. Elles se règlent dans Grist :

| Condition | Où la régler | Si elle n'est pas remplie |
|---|---|---|
| Un nom ou un prénom | Colonnes `nom` et `prenom` de la table `BDD` | La ligne est ignorée |
| Au moins un périmètre | Colonne `perimetre` de `BDD` (liste de références) | Contact masqué |
| Un établissement | Colonne `Etablissement` de `BDD` : une référence vers une ligne d'`Etablissements`, qui ne doit pas être vide | Contact masqué. Si la colonne est vide, la console le signale (`[ETABLISSEMENT]`) ; si elle désigne une ligne qui n'existe plus, rien n'est signalé |
| Établissement validé | Case `ok_pour_apparaitre` de la ligne d'`Etablissements` | Contacts de l'établissement masqués |
| Établissement fondateur ou partenaire | Cases `fondateur` et `partenaire` | Un établissement ni fondateur ni partenaire (« autres ») n'est jamais affiché ; la case `autres` elle-même n'est pas lue |

Côté écran, les interrupteurs **Fondateurs** et **Partenaires** affinent ensuite l'affichage ([guide utilisateur](utilisateurs.md#fondateurs-et-partenaires)). Le schéma complet des règles est dans la [documentation développeur](developpeurs.md#règles-daffichage).

Deux précisions sur la version 1.9.0 :

- L'établissement vient de la référence `Etablissement`, résolue par identifiant de ligne. L'ancienne colonne calculée `Etablissement2` n'est plus utilisée depuis la 1.8.0, et deux lignes d'`Etablissements` de même acronyme ne se confondent plus.
- La colonne `Accepte_apparaitre` de `BDD` (le consentement individuel de la personne) **n'est pas encore lue** : la cocher ou non ne change rien à l'affichage pour l'instant (voir [Chantiers en cours](developpeurs.md#chantiers-en-cours)).

## Opérations courantes dans Grist

Les noms de tables et de colonnes sont ceux de [`grist_structure.txt`](../grist_structure.txt).

**Ajouter une personne.** Renseigner le nom, le prénom, l'établissement (en choisissant sa ligne dans la colonne `Etablissement`), au moins un périmètre, puis ses instances, actions, groupes de travail (GT), communautés, tâches et compétences, qui sont des listes de références. Vérifier que le badge de la carte affiche bien l'établissement attendu (le widget n'utilise pas la colonne `nom_de_domaine`).

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

**Compétences et domaines.** Les compétences d'une personne sont une liste de références vers la table `Competences`. Chaque compétence a un **domaine**, dans la colonne `Macro_competences` de cette table : il alimente le filtre « Domaines » (les compétences macro). Renseignez-le pour toute nouvelle compétence.

- Une compétence **sans domaine** est classée sous « Autres », pour que ses personnes restent trouvables. La console liste alors ses identifiants de ligne (`[REFS] Competences: n ligne(s) sans regroupement pour macro…`) : classez-la dans Grist, puis rechargez la page.
- Écrivez un domaine toujours de la même façon : la casse et les accents sont ignorés (« Cancérologie » et « cancerologie » forment un seul domaine, écrit comme dans la plus petite ligne de la table).
- Le domaine d'une personne se déduit de ses compétences : une personne sans compétence n'a aucun domaine, et deux compétences d'un même domaine ne la comptent qu'une fois dans ce domaine.
- La colonne `Comptetences_macr` de `BDD` n'est pas lue.

## Contrôle après un changement de données

Après chaque changement de données (ajout, modification, import), vérifier les points suivants :

1. **Le nombre de contacts** affiché en haut à droite correspond à ce qu'on attend.
2. **Chaque carte a sa pastille d'établissement** (colonne `Etablissement` correctement remplie).
3. **La console du navigateur** (F12), sur les lignes `[GRIST] Enregistrements reçus: N (contacts affichables : M)` et `[ETABLISSEMENT] …` : N est le nombre de lignes de la table, M celui des cartes possibles, et un message `[ETABLISSEMENT]` liste (vingt au plus) les identifiants de ligne des contacts qui ont un périmètre mais pas d'établissement. Un écart entre N et M peut aussi venir d'un établissement non validé, d'un statut « autres » ou d'une référence qui ne désigne plus aucune ligne : ces cas-là ne sont pas détaillés.
4. **Aucun bandeau rouge** sous la barre d'outils.
5. **Le filtre Domaines** : si l'option « Autres » apparaît, des compétences n'ont pas de domaine (voir [Opérations courantes](#opérations-courantes-dans-grist)).

## Diagnostiquer un problème

La console du navigateur (F12) porte le détail : `[GRIST]` (lignes reçues), `[REFS]` (entrées par catégorie de filtre, lectures échouées, compétences sans domaine), `[ETABLISSEMENT]` (contacts sans établissement).

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Bandeau « Impossible de charger l'annuaire depuis Grist (table “X” illisible) » | La table X a été renommée, supprimée ou n'est plus accessible | Vérifier son nom dans Grist, puis recharger la page |
| Bandeau « Impossible de charger l'annuaire depuis Grist (colonne “X” absente de la table BDD) » (ou de la table `Etablissements`) | Une colonne obligatoire a été renommée ou supprimée : `nom`, `prenom`, `Etablissement` ou `perimetre` dans `BDD` ; `fondateur`, `partenaire` ou `ok_pour_apparaitre` dans `Etablissements` | La rétablir sous son nom exact, puis recharger |
| Bandeau « Tables illisibles (X) : des libellés ou des tags peuvent manquer » | Même cause pour une table de référence : les cartes restent, avec les libellés du chargement précédent s'il y en a un (sinon, le filtre et les tags concernés restent vides) | Corriger la table, recharger |
| Bandeau « Colonne de libellé introuvable : T (A ou B) … » | Aucune des colonnes de libellé de la table T n'existe plus : les tags et le filtre correspondants restent vides. Si seule la colonne corrigée manque, le libellé brut est utilisé et seule la console avertit | Rétablir la colonne (voir le tableau des libellés dans [Opérations courantes](#opérations-courantes-dans-grist)), puis recharger |
| Bandeau « Acronymes en double dans Etablissements (X) … » | Cas rare : deux lignes de même acronyme, statuts différents, avec un établissement transmis sous forme de texte. Le statut le plus strict est retenu : les contacts sont masqués s'il ne les rend plus éligibles | Supprimer le doublon ou harmoniser ses statuts |
| Bandeau « perimetre est vide pour tous les contacts… » | La colonne `perimetre` ne contient plus rien | Vérifier la colonne dans Grist |
| Bandeau « Etablissement est vide pour tous les contacts… » | La colonne `Etablissement` est vide partout | Vérifier la colonne dans Grist |
| Bandeau « Aucun contact affichable alors que la table … contient des lignes… » | Aucune ligne ne remplit toutes les conditions | Reprendre le tableau [Pourquoi un contact est visible ou non](#pourquoi-un-contact-est-visible-ou-non) |
| Une personne manque | Une condition n'est pas remplie, ou un interrupteur est désactivé | Même tableau ; vérifier aussi Fondateurs et Partenaires |
| Une carte n'a pas de pastille d'établissement | Ne devrait pas arriver : un contact sans établissement reconnu est masqué | Lire les lignes `[ETABLISSEMENT]` de la console |
| Une section de tags manque sur une carte | La valeur liée n'a pas de libellé dans sa table de référence | Console : `[REFS] clé (Table): n entrées (k ligne(s) sans …)` ; renseigner le libellé |
| Le filtre Domaines est vide, ou ne propose que « Autres » | La colonne `Macro_competences` n'existe plus (bandeau « Colonne de libellé introuvable »), ou aucune compétence n'a de domaine | Rétablir la colonne, ou renseigner les domaines, puis recharger |
| Un établissement manque dans le filtre Établissement | Il n'est pas validé (`ok_pour_apparaitre`) | Le valider, puis recharger |
| Une modification n'apparaît pas | Elle porte sur une table autre que celle des contacts | Recharger la page ([Limites connues](#limites-connues)) |
| Un téléphone s'affiche sans son 0 ou dans un format étrange | La colonne est numérique : le widget rétablit le 0 d'un numéro de 9 chiffres et met en forme un numéro de 10 chiffres qui commence par 0 ; toute autre valeur est affichée telle quelle | Corriger la valeur dans Grist |
| Une adresse n'est pas un lien | Adresse saisie sous une forme inhabituelle (plusieurs destinataires, paramètres) | La corriger dans Grist |
| Rien ne s'affiche, sans bandeau | Widget mal configuré, ou accès insuffisant | Vérifier l'URL du widget et son accès `full`, puis la console |

## Avant de publier une modification du code

1. `node --test` est entièrement vert, avec Playwright installé pour exécuter aussi les scénarios navigateur ([documentation développeur](developpeurs.md#tests)).
2. Si `main.js`, `render.js`, `index.html` ou `style.css` ont changé : jouer le protocole manuel de [`TESTING.md`](../TESTING.md) dans une **copie** du document Grist.
3. Une correction a son test de non-régression.
4. [`CHANGELOG.md`](../CHANGELOG.md) et [`VERSION.md`](../VERSION.md) sont à jour.
5. Si l'interface a changé : captures régénérées (`node docs/demo/capturer.mjs`) et [guide utilisateur](utilisateurs.md) corrigé.

## Publier

1. Ouvrir une pull request vers `main` ; la CI doit être verte. (Publier directement sur `main` reste possible, mais la CI ne s'exécute alors qu'après la publication et ne la bloque pas : lancer `node --test` en local d'abord.)
2. Fusionner. **GitHub Pages republie le widget : tous les documents Grist qui l'utilisent reçoivent la nouvelle version au prochain chargement.** Il n'y a pas d'environnement de recette ni de déploiement progressif.
3. Dans un vrai document, vérifier le [contrôle après un changement de données](#contrôle-après-un-changement-de-données) (compteur, pastilles, console, bandeau).
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

- **À l'exécution : aucune.** Le dépôt n'a pas de `package.json`. Le seul script externe est `grist-plugin-api.js`, chargé depuis `docs.getgrist.com` ([sécurité](securite.md#risques-et-protections)).
- **En CI** ([`.github/workflows/tests.yml`](../.github/workflows/tests.yml)) : Node 22, `playwright@1.64.0` (version figée), `actions/checkout@v4` et `actions/setup-node@v4`. Les revoir à chaque nouvelle version majeure de Node, de Playwright ou de ces actions : mettre à jour le fichier, puis vérifier que les scénarios navigateur passent.
- **Pour lancer les tests en local** : Node 22.7 ou plus, ou 20.19 ou plus ([documentation développeur](developpeurs.md#tests)). Le dépôt n'a pas de `package.json` : en dessous, les tests échouent avant même de s'exécuter.
- **Navigateur** : le widget utilise des fonctions récentes (modules ES, `Object.hasOwn`, propriétés Unicode des expressions régulières) et demande donc un navigateur à jour.
- **API de Grist** : elle n'est pas versionnée côté widget. Après une mise à jour de l'instance Grist, rejouer le protocole manuel de [`TESTING.md`](../TESTING.md).

## Limites connues

- **Modifier une table de référence ne rafraîchit pas le widget.** Grist ne prévient le widget que des changements de la table liée à sa section (la table des contacts). Après avoir modifié `Etablissements` (par exemple `ok_pour_apparaitre`) ou une autre table de référence, recharger la page.
- **Établissement sans acronyme.** Le libellé d'un établissement est son acronyme, ou son nom complet quand l'acronyme est vide. Le contact y est rattaché par l'identifiant de ligne de sa référence `Etablissement`, sans dépendre de ce libellé : un établissement sans acronyme s'affiche donc avec son nom complet.
- **Script de l'API Grist.** `index.html` charge `grist-plugin-api.js` depuis `docs.getgrist.com`, sans version figée. Le charger depuis l'instance utilisée serait plus cohérent, mais cela ne se vérifie que dans un vrai document Grist : ce changement n'a pas été fait.
- **Accès `full`, choisi délibérément.** Le widget voit tout le document, pas seulement l'annuaire. C'est un choix assumé, que des garde-fous doivent encadrer ([sécurité](securite.md#niveau-daccès-demandé-à-grist)).
- **Un domaine se déduit des compétences.** Une personne sans compétence n'a aucun domaine : elle n'apparaît dans aucune option du filtre « Domaines ».
- **Consentement individuel non lu.** La colonne `Accepte_apparaitre` de `BDD` n'influence pas encore l'affichage (voir [Chantiers en cours](developpeurs.md#chantiers-en-cours)).
- **Recherche par nom ou par prénom, pas les deux.** Le champ teste le nom et le prénom séparément : « Élise Marchetti » ne donne aucun résultat, « Élise » ou « Marchetti » trouvent la carte.
- **Ordre des cartes.** Les cartes s'affichent dans l'ordre où Grist envoie les lignes de `BDD`, sans tri ; seuls les menus de filtre sont triés par ordre alphabétique.
- **Cas que le bandeau ne signale pas.** Un contact dont l'établissement désigne une ligne qui n'existe plus est masqué sans message, et une colonne facultative supprimée de `BDD` (`email`, `Fonction`, `numero_de_telephone`, `Role_dans_le_PUI`) fait simplement disparaître l'information des cartes. Pour repérer le premier cas, comparer N et M dans la ligne `[GRIST]` de la console.
- **Écran de PC uniquement** : largeur minimale de 980 pixels, pas de version mobile ([`specs.md`](../specs.md)).
- **Échelle.** Toutes les cartes sont construites à chaque changement, sans pagination. Mesure faite à la version 1.7.1, avant l'arrivée de la table `BDD` : taper dans la recherche coûte 10 à 17 ms avec 500 lignes et 45 à 65 ms avec 2 000 lignes. À l'échelle actuelle, rien n'est à faire ; au-delà de plusieurs milliers de contacts, une pagination serait à étudier.
- **Pas de test contre un vrai Grist.** Les tests automatiques simulent l'API ; seul le protocole manuel de [`TESTING.md`](../TESTING.md) valide le comportement dans Grist.

## Maintenir la documentation

| Si l'on change… | Mettre à jour… |
|---|---|
| L'interface | [Guide utilisateur](utilisateurs.md), captures (`node docs/demo/capturer.mjs`), [`TESTING.md`](../TESTING.md) |
| Une règle d'affichage | [`specs.md`](../specs.md), le schéma de la [documentation développeur](developpeurs.md#règles-daffichage), [Pourquoi un contact est visible ou non](#pourquoi-un-contact-est-visible-ou-non), le guide utilisateur, le résumé du [README](../README.md), la ligne « Affichage d'un contact » des [risques](securite.md#risques-et-protections), et le réglage par défaut des interrupteurs Fondateurs et Partenaires |
| La structure Grist (tables, colonnes) | [`grist_structure.txt`](../grist_structure.txt), `tests/fixtures.mjs`, `docs/demo/donnees-fictives.mjs`, les noms cités dans cette page et dans la documentation développeur |
| Le code (modules, noms de fonctions) | [Documentation développeur](developpeurs.md) : `tests/docs.test.mjs` signale un nom de fonction cité qui n'existe plus |
| Les droits ou les écritures du widget | [Sécurité](securite.md), et toutes les mentions de « lecture seule » (README, guide utilisateur, documentation développeur) |
| Une version | [`CHANGELOG.md`](../CHANGELOG.md), [`VERSION.md`](../VERSION.md), et les mentions de la version courante (rechercher son numéro dans `README.md` et dans `docs/`) |
| Un message du bandeau d'état | [Guide utilisateur](utilisateurs.md#messages-du-bandeau-rouge), [Diagnostiquer un problème](#diagnostiquer-un-problème), [Fiabilité](developpeurs.md#fiabilité--que-se-passe-t-il-en-cas-de-panne-) |
| Une version de Node, de Playwright ou d'une action CI | [Dépendances et mises à jour](#dépendances-et-mises-à-jour), [Sécurité](securite.md#risques-et-protections), [Documentation développeur](developpeurs.md#versions-déploiement-et-ci) |

`tests/docs.test.mjs` vérifie aussi que les liens et images de la documentation existent, que chaque image a un texte alternatif et que le jeu de démonstration reste fictif et lisible par le vrai widget.

## Pistes d'amélioration

Non engagées ; à décider par le propriétaire du dépôt.

- Rattraper les étiquettes de version manquantes : seule `v1.3.1` existe aujourd'hui, alors que l'étape 4 de « Publier » demande d'étiqueter chaque version.
- Protéger la branche `main` (voir [sécurité](securite.md#recommandations)) et activer les mises à jour automatiques des actions GitHub (Dependabot).
- Ajouter une licence : le dépôt est public et n'en déclare aucune ; par défaut, tous les droits sont réservés.
- Fusionner les deux simulateurs de l'API Grist ([documentation développeur](developpeurs.md#données-et-captures-de-démonstration)).
- Paginer ou charger progressivement les cartes si l'annuaire grossit beaucoup.
