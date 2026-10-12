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
- [Continuité : départs et absence d'administrateur](#continuité--départs-et-absence-dadministrateur)
- [Limites connues](#limites-connues)
- [Maintenir la documentation](#maintenir-la-documentation)
- [Pistes d'amélioration](#pistes-damélioration)

## Qui fait quoi

| Rôle | Responsabilités | Outils |
|---|---|---|
| **Administrateur des données** | Contacts, établissements et leur statut, valeurs des listes de filtres, validation des apparitions | Le document Grist |
| **Mainteneur du code** | Widget, tests, publication, documentation | GitHub, `node --test` |

Le dépôt est celui du compte GitHub `lombre33` : <https://github.com/lombre33/Annuaire_PUI_Bordeaux>.

Chaque rôle doit avoir un suppléant, et le document Grist comme le dépôt doivent avoir au moins deux propriétaires : voir [Continuité](#continuité--départs-et-absence-dadministrateur).

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

## Continuité : départs et absence d'administrateur

L'annuaire n'a ni serveur ni base de données à lui : il tient à des comptes qui appartiennent à des personnes. Si elles partent sans passation, il ne s'arrête pas du jour au lendemain, mais ses données se périment, plus personne ne peut le corriger et, selon le cas, il finit par disparaître. Ce chapitre dit de quoi il dépend, ce qui arrive dans chaque cas, ce qu'il faut prévoir à l'avance, les bonnes pratiques d'usage et comment le reprendre sans son créateur.

**L'essentiel**

1. **Deux propriétaires au moins** pour le document Grist, et deux au moins pour le dépôt GitHub. Le dépôt appartient aujourd'hui à un compte personnel, qui n'a qu'un seul propriétaire : c'est le point le plus fragile.
2. **Une sauvegarde régulière** du document Grist, rangée hors du dépôt public.
3. **Une fiche de continuité** : qui possède quoi, qui remplace qui, où sont les sauvegardes.
4. **Les personnes qui partent sont retirées** de l'annuaire, et leurs accès supprimés, dès leur départ.
5. **Un contrôle tous les trimestres** ([contrôles réguliers](#contrôles-réguliers)).

### De quoi l'annuaire dépend

| Élément | Où il se trouve | Qui peut le gérer | Si plus personne ne peut le gérer |
|---|---|---|---|
| **Les données** | Le document Grist, sur l'instance de l'État (`grist.numerique.gouv.fr`) | Les propriétaires du document, de son espace de travail et du site qui les contient : les accès se transmettent du site à l'espace de travail, puis au document | Le widget affiche toujours les données du document, mais personne ne peut plus les corriger, ni changer le partage ou les règles d'accès, réservés aux propriétaires. La documentation de Grist ne dit pas comment reprendre la main : ne pas y compter |
| **Le code** | Le dépôt GitHub `lombre33/Annuaire_PUI_Bordeaux` | Son seul propriétaire, le compte personnel `lombre33` | Le widget continue de fonctionner, mais rien ne peut plus être corrigé ni publié. Si le compte est supprimé, GitHub supprime ses dépôts et ses sites Pages, donc le widget, et ne peut pas les restaurer |
| **L'adresse du widget** | GitHub Pages, saisie dans « Enter Custom URL » du widget de chaque page Grist | Le même compte | Renommer ou transférer le dépôt change l'adresse du site **sans redirection** : à la place de l'annuaire, Grist affiche une erreur ou une zone vide, tant que l'adresse n'est pas corrigée dans chaque page |
| **Le script de l'API Grist** | `docs.getgrist.com`, chargé par `index.html` | Grist | Sans lui, la page affiche « 0 contact » sans bandeau d'explication ; le détail est dans la console du navigateur |
| **La connaissance** | Cette documentation, `grist_structure.txt`, `specs.md`, les tests | Quiconque peut écrire dans le dépôt | Elle se périme : `tests/docs.test.mjs` signale une partie des oublis, pas tous |

Rien n'est à renouveler (pas de serveur, pas de nom de domaine, pas de certificat), mais il suffit qu'un compte ou une adresse de messagerie disparaisse pour tout bloquer.

### Ce qui arrive si…

| Situation | Effet sur l'annuaire | Que faire |
|---|---|---|
| Une personne de l'annuaire quitte le PUI ou change de structure | Sa carte reste affichée avec des coordonnées périmées : le widget ne sait rien des départs | La retirer sans attendre ([Quand quelqu'un part](#quand-quelquun-part)) |
| L'administrateur des données part | Plus personne pour valider un établissement, ajouter une valeur de filtre ou corriger une fiche : l'annuaire se fige | Lui faire transmettre le rôle avant son départ ; avoir un suppléant |
| Le seul propriétaire du document Grist n'a plus accès à son compte | Plus personne ne peut gérer le partage ni les règles d'accès | Prévenir : au moins deux propriétaires. Sinon, demander de l'aide à l'équipe qui gère l'instance Grist, sans garantie de réponse |
| Le compte GitHub propriétaire est inaccessible ou supprimé | Inaccessible : le widget fonctionne, mais aucune correction ni publication n'est possible. Supprimé : le dépôt, donc le widget, disparaît | Dépôt dans une organisation à deux propriétaires, copie de secours ([Reprendre l'annuaire sans son créateur](#reprendre-lannuaire-sans-son-créateur)) |
| Le dépôt est renommé ou transféré | L'adresse du widget change, sans redirection | Corriger l'adresse dans chaque page Grist |
| GitHub Pages ou `docs.getgrist.com` est indisponible | Le widget est vide ou affiche « 0 contact » | Attendre : les données ne sont pas touchées |
| Le document Grist est supprimé par erreur | Ses données et son historique disparaissent avec lui | Le restaurer depuis la corbeille dans les 30 jours ; au-delà, depuis une sauvegarde |
| Une mise à jour de Grist change son API | Le widget peut mal fonctionner | Rejouer [`TESTING.md`](../TESTING.md) après chaque mise à jour de l'instance ([Dépendances et mises à jour](#dépendances-et-mises-à-jour)) |

### Ce qu'il faut prévoir

1. **Au moins deux propriétaires du document Grist**, nommés, de préférence dans des services différents. Un propriétaire ne peut pas modifier son propre accès : c'est un autre propriétaire qui le retire quand la personne part, ce qui suppose d'en avoir deux. Penser aussi à l'espace de travail et au site qui contiennent le document : leurs accès se transmettent au document.
2. **Un administrateur des données et un suppléant**, qui savent tous deux ajouter une personne, valider un établissement et ajouter une valeur de filtre ([Opérations courantes](#opérations-courantes-dans-grist)).
3. **Le dépôt dans une organisation GitHub** avec deux propriétaires au moins. GitHub le recommande : avec un seul propriétaire injoignable, les projets de l'organisation peuvent devenir inaccessibles. Un dépôt personnel n'a qu'un propriétaire ; ses collaborateurs peuvent pousser du code, mais ni supprimer le dépôt, ni changer sa visibilité, ni inviter d'autres personnes. Le transfert change l'adresse de GitHub Pages : le faire une fois, à un moment choisi, corriger l'adresse dans chaque page Grist, puis faire le [contrôle](#contrôle-après-un-changement-de-données). À défaut d'organisation, GitHub permet de désigner un **successeur** du compte personnel (réglages du compte, « Successor settings »).
4. **Des sauvegardes hors de Grist.** Grist garde lui-même des instantanés du document (d'après sa documentation : horaires pendant environ un jour, mensuels pendant plus d'un an, à vérifier sur l'instance utilisée), mais ils disparaissent avec le document s'il est supprimé définitivement. Télécharger régulièrement le document (fichier `.grist`, qui ne contient pas la liste des personnes avec qui il est partagé : la noter à part) et ses pièces jointes éventuelles (photos, logos), puis les ranger dans un espace à accès restreint, jamais dans le dépôt public. Une sauvegarde contient des données personnelles : prévoir sa durée de conservation et sa destruction.
5. **Une copie du code** ailleurs que sur le compte d'origine (un clone ou un fork sur un autre compte ou une autre forge) : supprimer un compte supprime ses dépôts, pas les copies faites ailleurs.
6. **Une licence.** Le dépôt n'en déclare aucune : par défaut, tous les droits sont réservés, et la reprise du code par d'autres suppose l'accord de son propriétaire. À décider par le propriétaire du dépôt.
7. **Une fiche de continuité** (ci-dessous), tenue à jour et rangée hors du dépôt public, parce qu'elle contient des noms et des adresses.

### Fiche de continuité

À copier dans un document **hors du dépôt public**, puis à remplir et à relire (voir [Contrôles réguliers](#contrôles-réguliers)).

| Élément | Titulaire | Suppléant | Où le trouver | Vérifié le |
|---|---|---|---|---|
| Propriétaires du document Grist (et de son espace de travail) | | | | |
| Administrateur des données | | | | |
| Mainteneur du code | | | | |
| Propriétaires de l'organisation GitHub | | | | |
| Pages Grist qui utilisent le widget, et adresse saisie dans chacune | | | | |
| Sauvegardes : emplacement, fréquence, durée de conservation | | | | |
| Responsable du traitement des données personnelles ([sécurité](securite.md#données-personnelles)) | | | | |

### Bonnes pratiques d'usage

**Administrateur des données**

- Modifier les données **dans le document Grist seulement**, jamais dans une copie qui divergerait ensuite.
- **Ne pas renommer ni supprimer** une table ou une colonne que le widget lit (elles sont listées dans [`grist_structure.txt`](../grist_structure.txt)) : l'annuaire affiche un bandeau rouge ou perd une information. Pour restructurer, travailler sur une copie du document, puis prévenir le mainteneur. Une règle d'accès Grist peut réserver la modification de la structure aux propriétaires (rubrique « Lock down structure » de la documentation des règles d'accès de Grist).
- **Retirer un établissement** en décochant `ok_pour_apparaitre`, pas en supprimant sa ligne : un contact dont l'établissement n'existe plus est masqué sans aucun message.
- Après chaque changement, faire le [contrôle](#contrôle-après-un-changement-de-données) ; après une modification d'une table de référence, **recharger la page**.
- Donner le rôle **Éditeur** (Editor) à qui doit modifier les données, **Lecteur** (Viewer) aux autres, et **Propriétaire** (Owner) à très peu de personnes. Relire cette liste chaque trimestre.
- **Vérifier qui a accès au document** : l'annuaire n'est pas mieux protégé que lui ([sécurité](securite.md#affichage-et-droits-daccès)).
- **Répondre sans délai** à une personne qui demande à corriger sa fiche ou à disparaître de l'annuaire ([Quand quelqu'un part](#quand-quelquun-part)).

**Mainteneur du code**

- Passer par une **pull request** à la CI verte : un push direct sur `main` publie aussitôt pour tous les documents.
- **Tester dans une copie** du document avant de publier ([`TESTING.md`](../TESTING.md)), puis taguer la version.
- Tenir la **documentation à jour** ([Maintenir la documentation](#maintenir-la-documentation)) : le guide de contribution de Grist.Gouv demande qu'un widget soit assez documenté pour qu'une autre personne puisse le comprendre et le faire évoluer sans son auteur.
- Ne jamais mettre dans le dépôt public de vraie donnée ni le schéma complet du document.
- Activer l'**authentification à deux facteurs** et protéger la branche `main` ([sécurité](securite.md#recommandations)).
- **Ne pas renommer ni déplacer le dépôt** sans prévenir : l'adresse du widget en dépend.

### Quand quelqu'un part

**Une personne de l'annuaire**

1. Supprimer sa ligne de `BDD`. Les instantanés de Grist permettent de la retrouver pendant un temps. Le consentement individuel (`Accepte_apparaitre`, en préparation : [Chantiers en cours](developpeurs.md#chantiers-en-cours)) permettra de masquer une fiche sans l'effacer.
2. Si elle a demandé l'effacement de ses données, purger aussi les sauvegardes qui la contiennent, selon la durée de conservation prévue.

**Un administrateur des données, un propriétaire ou un mainteneur**

1. **Avant son départ**, ajouter son successeur comme propriétaire du document Grist (et de l'espace de travail et du site si besoin) et de l'organisation GitHub.
2. Faire un **exercice à blanc** avec lui : ouvrir le document, ajouter puis retirer une valeur dans une copie, lancer `node --test`, ouvrir la dernière pull request.
3. **Faire retirer ses accès** par un autre propriétaire, côté Grist et côté GitHub : on ne peut pas modifier son propre accès.
4. **Exporter une sauvegarde** du document, avec ses pièces jointes.
5. **Mettre à jour la fiche de continuité**, et prévenir les personnes qui utilisent l'annuaire si l'administrateur des données change.

### Contrôles réguliers

| Quand | Quoi |
|---|---|
| À chaque changement de données | Le [contrôle](#contrôle-après-un-changement-de-données) : compteur, pastilles, bandeau |
| Chaque mois | Relire la liste des personnes : départs, changements de fonction ou de structure. Ouvrir l'annuaire et vérifier qu'aucun bandeau rouge n'apparaît |
| Chaque trimestre | Vérifier les propriétaires et les éditeurs du document Grist, et les propriétaires de l'organisation GitHub. Exporter une sauvegarde et la ranger. Vérifier que la dernière exécution de la CI sur `main` est verte et que l'annuaire s'ouvre depuis Grist |
| Chaque année, et à chaque changement d'équipe | Relire la fiche de continuité. **Tester une restauration** : importer la sauvegarde dans un nouveau document et y ouvrir l'annuaire. Relire la durée de conservation des sauvegardes et les [dépendances](#dépendances-et-mises-à-jour) |

### Reprendre l'annuaire sans son créateur

Le dépôt est public et le widget est une page statique, sans compilation : tant que le dépôt (ou une copie) existe, une autre personne peut le reprendre.

1. **Récupérer le code** : `git clone https://github.com/lombre33/Annuaire_PUI_Bordeaux.git`, ou une copie de secours. Sans licence, la reprise suppose l'accord du propriétaire.
2. **Vérifier qu'il fonctionne** : `node --test` (Node 22.7 ou plus), puis `node docs/demo/serveur-demo.mjs` pour le voir sans Grist ([README](../README.md#essayer-sans-grist)).
3. **Le publier** : copier `index.html`, `style.css` et les fichiers `.js` de la racine ([Organisation du code](developpeurs.md#organisation-du-code)) sur un hébergement de pages statiques en HTTPS, ou activer GitHub Pages sur la copie.
4. **Pointer Grist vers la nouvelle adresse** : dans chaque page du document, ouvrir les options du widget et remplacer l'adresse dans « Enter Custom URL ». L'accès complet est à accorder de nouveau si Grist le demande.
5. **Contrôler** : [contrôle après un changement de données](#contrôle-après-un-changement-de-données), puis protocole de [`TESTING.md`](../TESTING.md).
6. **Reprendre la main sur les données** : il faut être propriétaire du document Grist (voir [De quoi l'annuaire dépend](#de-quoi-lannuaire-dépend)).

Une piste plus durable : le guide de contribution des widgets Grist.Gouv (juillet 2026) prévoit que l'équipe de l'instance de l'État puisse reprendre un widget public (chemin A), voire l'héberger sur ses instances après une revue de sécurité (chemin B). Cela supprimerait la dépendance à un compte personnel. Rien n'est engagé.

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
- **Mise en page éprouvée dans Chromium seulement.** Le widget s'adapte à la largeur de son cadre (de 320 pixels à un grand écran), mais les tests automatiques ne couvrent ni Safari, ni Firefox, ni un vrai Grist sur téléphone : [`TESTING.md`](../TESTING.md), section 12. Entre 600 et 675 pixels de large environ, le bouton « Réinitialiser » se retrouve seul sur sa ligne, sous la recherche.
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
| Les propriétaires, les sauvegardes ou l'adresse du widget | La fiche de continuité (hors dépôt) et le chapitre [Continuité](#continuité--départs-et-absence-dadministrateur) |

`tests/docs.test.mjs` vérifie aussi que les liens et images de la documentation existent, que chaque image a un texte alternatif et que le jeu de démonstration reste fictif et lisible par le vrai widget.

## Pistes d'amélioration

Non engagées ; à décider par le propriétaire du dépôt.

- Rattraper les étiquettes de version manquantes : seule `v1.3.1` existe aujourd'hui, alors que l'étape 4 de « Publier » demande d'étiqueter chaque version.
- Protéger la branche `main` (voir [sécurité](securite.md#recommandations)) et activer les mises à jour automatiques des actions GitHub (Dependabot).
- Ajouter une licence : le dépôt est public et n'en déclare aucune ; par défaut, tous les droits sont réservés.
- Fusionner les deux simulateurs de l'API Grist ([documentation développeur](developpeurs.md#données-et-captures-de-démonstration)).
- Paginer ou charger progressivement les cartes si l'annuaire grossit beaucoup.
- Compléter le [lexique du PUI](utilisateurs.md#lexique-du-pui) : Instances, Actions, Communautés, Tâches, Rôle PUI et périmètre attendent une définition.
- Déplacer le dépôt dans une organisation GitHub à deux propriétaires au moins, et choisir une licence (voir [Continuité](#continuité--départs-et-absence-dadministrateur)).
