# Sécurité et confidentialité

Cette page répond aux questions qu'on se pose avant de mettre l'annuaire entre les mains d'un public : qu'est-ce que le widget peut lire et faire, où vont les données, quels sont les risques restants et comment les réduire. Elle décrit la **version 1.9.0** ; le chantier d'édition de fiche, qui ajoutera des écritures, obligera à la compléter (voir [Évolutions en cours](#évolutions-en-cours)).

Pages liées : [README](../README.md), [documentation développeur](developpeurs.md), [maintenance](maintenance.md), [guide utilisateur](utilisateurs.md).

## Sommaire

- [Résumé](#résumé)
- [Ce que le widget lit, écrit et envoie](#ce-que-le-widget-lit-écrit-et-envoie)
- [Niveau d'accès demandé à Grist](#niveau-daccès-demandé-à-grist)
- [Risques et protections](#risques-et-protections)
- [Affichage et droits d'accès](#affichage-et-droits-daccès)
- [Données dans le dépôt](#données-dans-le-dépôt)
- [Données personnelles](#données-personnelles)
- [Recommandations](#recommandations)
- [Signaler un problème de sécurité](#signaler-un-problème-de-sécurité)
- [Évolutions en cours](#évolutions-en-cours)

## Résumé

| Question | Réponse pour la version 1.9.0 |
|---|---|
| Le widget écrit-il dans le document Grist ? | **Non.** Il n'utilise que la lecture (`fetchTable`) et deux appels d'initialisation (`ready`, `onRecords`) |
| Où vont les données qu'il lit ? | **Nulle part ailleurs que dans la page affichée** : le code n'émet aucune requête réseau, ne stocke rien dans le navigateur (ni cookie, ni stockage local) et ne communique avec aucun service de statistiques |
| Quelles tables lit-il ? | Celles de [`grist_structure.txt`](../grist_structure.txt) (neuf tables) |
| Pourquoi demande-t-il l'accès complet (`full`) au document ? | **C'est un choix assumé** : le widget lit plusieurs tables et les fonctionnalités prévues écriront dans le document. Cet accès couvre **tout le document** ; trois garde-fous doivent l'encadrer, à mettre en place ou à vérifier : des règles d'accès Grist, une branche `main` protégée et des tables sensibles hors du document ou protégées (voir [le détail](#niveau-daccès-demandé-à-grist)) |
| Qui peut changer le code qui s'exécute ? | Toute personne qui peut publier sur la branche `main` du dépôt : GitHub Pages sert ce code à tous les documents qui utilisent le widget. **C'est le risque principal**, voir ci-dessous |
| Les contacts que le widget masque sont-ils protégés ? | **Non.** Masquer un contact est un choix d'affichage, pas un contrôle d'accès. Seules les règles d'accès de Grist protègent une donnée |
| Y a-t-il de vraies données dans le dépôt public ? | **Non, à notre connaissance.** Le schéma est réduit et les captures comme le jeu de démonstration sont fictifs. Une recherche d'adresses e-mail et de numéros de téléphone dans tout l'historique (12 octobre 2026) n'a trouvé que des valeurs d'exemple |

## Ce que le widget lit, écrit et envoie

Vérifié dans le code de la version 1.9.0 :

- **Lecture.** `loadDirectory()` appelle `docApi.fetchTable()` une fois par table de [`grist_structure.txt`](../grist_structure.txt) à chaque chargement. C'est le seul accès aux données.
- **Écriture.** Aucun appel d'écriture dans le document (`applyUserActions` ou équivalent) : le widget est en lecture seule.
- **Réseau.** Le code du widget ne contient aucun `fetch`, `XMLHttpRequest` ni `sendBeacon`. La page charge seulement ses propres fichiers (GitHub Pages) et le script `grist-plugin-api.js` (voir plus bas). Elle ne charge ni police, ni image, ni bibliothèque externe.
- **Stockage local.** Aucun usage de `localStorage`, `sessionStorage` ni de cookie.
- **Journal du navigateur.** La console reçoit des diagnostics (`[GRIST]`, `[REFS]`, `[ETABLISSEMENT]`) et l'erreur brute d'un chargement raté, mais **jamais** un nom, une adresse ou un numéro de contact : seuls les identifiants de ligne Grist des contacts concernés y figurent.
- **Rendu.** Tout texte venu de Grist est inséré avec `textContent`, jamais comme HTML. Un lien `mailto:` n'est créé que pour une adresse simple, sans paramètre ni destinataire supplémentaire.

## Niveau d'accès demandé à Grist

Le widget demande l'accès **`full`** (accès complet au document), à deux endroits : `grist.ready({ requiredAccess: 'full' })` dans `main.js` et `accessLevel: full` dans [`manifest.yml`](../manifest.yml). Ce niveau a été constaté dans le panneau d'accès du widget dans Grist lors d'un audit.

**Un choix assumé, pas un défaut à corriger.** Le propriétaire du dépôt a choisi cet accès, pour deux raisons. D'une part, le widget lit plusieurs tables : le niveau `read table` ne donne accès qu'à la table liée à la section du widget, or il lit aussi les tables de référence (actions, instances, établissements…). D'autre part, les fonctionnalités prévues, à commencer par l'édition de profil, écriront dans le document. L'enjeu n'est donc pas de réduire cet accès mais de l'entourer de garde-fous.

**Ce que cela signifie.** Selon [la documentation de Grist sur les widgets personnalisés](https://grist-docs.beta.numerique.gouv.fr/widget-custom/), un widget en accès complet peut lire tout le document, le transmettre à un tiers et le modifier de n'importe quelle manière. Grist demande donc que la page du widget soit possédée et contrôlée par une personne de confiance. Le widget actuel n'en fait rien (voir ci-dessus), mais **c'est la confiance dans le code publié qui protège le document**, pas une limite technique.

**Les trois garde-fous.** Ils se complètent et aucun ne remplace les autres. Leur mise en œuvre est détaillée dans les [Recommandations](#recommandations).

| Garde-fou | Ce qu'il protège | Où le régler |
|---|---|---|
| **Règles d'accès Grist (ACL)**, appliquées par le serveur | Les données elles-mêmes : qui peut lire ou modifier quoi, côté serveur (comportement à vérifier avec un widget en accès complet : voir [Affichage et droits d'accès](#affichage-et-droits-daccès)) | Grist, document de l'annuaire |
| **Branche `main` protégée**, authentification à deux facteurs | Le code qui s'exécute avec cet accès : GitHub Pages sert `main` tel quel | GitHub, dépôt |
| **Tables sensibles hors du document, ou protégées** | Les données sans rapport avec l'annuaire que l'accès complet rend atteignables : des tables du document source qui ne concernent pas l'annuaire, dont certaines sensibles | Grist |

**État constaté le 12 octobre 2026.** Côté GitHub, lu par l'API de GitHub : la branche `main` n'est pas protégée (ni protection de branche, ni règle de dépôt) ; la détection de secrets et son blocage à l'envoi sont activés ; les mises à jour de sécurité Dependabot et le signalement privé de vulnérabilités ne le sont pas. L'authentification à deux facteurs des comptes ne se lit pas depuis le dépôt. Côté Grist, les règles d'accès et le contenu du document ne se vérifient pas depuis le dépôt : à confirmer par l'administrateur de l'instance. Les garde-fous sont donc **à mettre en place ou à confirmer**, pas acquis.

## Risques et protections

| Risque | Protection en place | Reste à faire |
|---|---|---|
| **Code malveillant publié** : un compte GitHub compromis ou une modification piégée change le code que GitHub Pages sert, avec l'accès complet au document | Tests automatiques à chaque pull request ; détection de secrets GitHub activée. Aucune revue n'est imposée avant fusion | Protéger la branche `main`, activer l'authentification à deux facteurs, limiter les droits d'écriture (voir [Recommandations](#recommandations)) |
| **Données sensibles du document atteignables** : l'accès complet couvre aussi les tables sans rapport avec l'annuaire | Le widget ne lit que les tables de [`grist_structure.txt`](../grist_structure.txt) | Sortir ces tables du document ou les protéger par des règles d'accès (voir [Recommandations](#recommandations)) |
| **Script tiers** : `index.html` charge `grist-plugin-api.js` depuis `docs.getgrist.com`, sans version figée | Aucune | Le charger depuis l'instance Grist utilisée, à valider dans un vrai document |
| **Injection de contenu** (une donnée Grist contenant du HTML ou un script) | `textContent` partout, aucun `innerHTML` alimenté par une donnée ; scénario de test avec un prénom piégé | Rien à faire |
| **Lien `mailto:` piégé** (`?cc=`, `bcc`, plusieurs destinataires) | `mailtoHref()` n'accepte qu'une adresse simple, le reste s'affiche en texte ; testé | Rien à faire |
| **Fuite par la console** (diagnostics partagés lors d'une démonstration) | Seuls les identifiants de ligne sont journalisés ; testé | Rien à faire |
| **Affichage d'un contact qui ne devrait pas l'être** | Logique « fermée » : établissement inconnu, non validé ou « autres » = contact masqué (en cas de doublon d'acronyme transmis en texte, le statut le plus strict l'emporte) ; règles testées | Rien à faire |
| **Écriture involontaire dans le document** | Le code n'appelle aucune méthode d'écriture | Quand les écritures arriveront : règles d'accès Grist côté serveur, et revue à part de tout ajout d'écriture (voir [Évolutions en cours](#évolutions-en-cours)) |
| **Dépendances** | Aucune à l'exécution. En intégration continue (CI) : Node 22, `playwright@1.64.0` figé, `actions/checkout@v4` et `actions/setup-node@v4` (références par étiquette de version, non épinglées sur un identifiant de commit), droit `contents: read` seulement | Mettre à jour régulièrement (voir [maintenance](maintenance.md#dépendances-et-mises-à-jour)) |
| **Données réelles dans le dépôt public** | Schéma réduit, données de démonstration fictives, test automatique (voir [Données dans le dépôt](#données-dans-le-dépôt)) | Vigilance à chaque commit |

## Affichage et droits d'accès

Les règles d'affichage ([guide utilisateur](utilisateurs.md#pourquoi-une-personne-napparaît-elle-pas-)) décident **ce que le widget montre**. Elles ne décident pas **ce qui est lisible** :

- une personne qui a accès au document Grist peut lire les mêmes tables directement dans Grist, y compris les contacts que le widget masque (établissement non validé, « autres », hors périmètre) ;
- le widget lui-même lit tout ce que lui ouvre son accès `full`.

Pour qu'une donnée ne soit pas lisible, il faut une **règle d'accès Grist** (ACL) sur le document. La documentation de Grist consultée ne précise pas comment ces règles s'appliquent à un widget en accès complet : **testez ce comportement dans votre instance avant de vous y fier**, par exemple en ouvrant le widget avec un compte aux droits restreints.

**Un verrou dans l'interface ne protège pas.** Cela vaut aussi pour les écritures à venir : un contrôle fait seulement dans le code du widget (par exemple « le bouton n'est visible que pour certaines personnes ») n'arrête que la personne de bonne foi. Quiconque a accès au document peut contourner la page, en écrivant directement dans Grist ou en modifiant la page dans son navigateur. Seules les règles d'accès appliquées par le serveur Grist constituent une vraie barrière, sous réserve de la vérification demandée plus haut.

## Données dans le dépôt

Le dépôt GitHub est **public**. Il ne doit contenir aucune donnée réelle de l'annuaire ni du document Grist.

- **Schéma réduit.** [`grist_structure.txt`](../grist_structure.txt) ne liste que les tables et colonnes utiles au widget. Le document Grist source contient d'autres tables sans rapport avec l'annuaire, dont certaines sensibles : ne jamais copier son schéma complet dans le dépôt. Pour du débogage, le garder en local.
- **Jeux de test et de démonstration inventés.** Règle : `tests/fixtures.mjs` et `docs/demo/donnees-fictives.mjs` ne contiennent que des personnes inventées (les adresses de `tests/fixtures.mjs` reprennent toutefois des domaines d'institutions réelles : voir [Recommandations](#recommandations), point 6). Le jeu de démonstration l'est entièrement, établissements compris : ses adresses se terminent par `.example` (domaine réservé à la documentation par la RFC 2606) et ses numéros appartiennent au plan réservé à la fiction (`05 36 49 xx xx`, `06 39 98 xx xx`, décision ARCEP n° 2018-0881). `tests/docs.test.mjs` vérifie ces deux points. Le jeu de `tests/fixtures-responsive.mjs` (tests de mise en page) suit la même règle, vérifiée par `tests/responsive.test.mjs`.
- **Captures d'écran.** Les images de `docs/images/` sont produites par `docs/demo/capturer.mjs` à partir de ce jeu fictif. Ne jamais y mettre la capture du vrai annuaire.
- **Si des données réelles sont enregistrées par erreur dans le dépôt (commit)**, les retirer dans un nouveau commit ne suffit pas : l'historique Git les conserve. Prévenir sans attendre le propriétaire du dépôt (purge de l'historique et, si besoin, information du responsable du traitement).

## Données personnelles

L'annuaire affiche des données à caractère personnel, d'ordre professionnel : nom, prénom, fonction, établissement, adresse e-mail, téléphone et participations aux instances, actions et groupes de travail (GT). Cette page n'est pas une analyse juridique ; voici les points techniques utiles au responsable du traitement.

- **Verrou de publication.** Dans la version 1.9.0, l'apparition d'un contact dépend de son **établissement** : celui-ci doit l'avoir autorisée (`ok_pour_apparaitre`) et être fondateur ou partenaire. Un consentement individuel de la personne est en préparation (voir [Évolutions en cours](#évolutions-en-cours)).
- **Minimisation.** Le widget n'affiche que les champs prévus par le [cahier des charges](../specs.md). Il lit cependant toutes les colonnes des neuf tables, y compris celles qu'il n'affiche pas, et les garde en mémoire dans le navigateur le temps de la session : seules les règles d'accès Grist peuvent restreindre ce qui est lu.
- **Pas de copie.** Le widget ne conserve rien dans le navigateur et n'envoie rien à un autre service ; les données demeurent dans Grist, unique lieu où exercer les droits de rectification et d'effacement.
- **À confirmer par le responsable du traitement** : information des personnes, modalités d'exercice de leurs droits, durée de conservation, liste des personnes ayant accès au document Grist.

## Recommandations

Classées par ordre décroissant de rapport utilité/effort. Ce sont des **propositions**, à décider par le propriétaire du dépôt et par l'administrateur de l'instance Grist. Les trois premières sont les [garde-fous](#niveau-daccès-demandé-à-grist) de l'accès complet.

1. **Poser les règles d'accès Grist (ACL) du document**, au plus tard avant de livrer les écritures de l'édition de profil : qui peut lire quelles tables, qui peut modifier quelles lignes et quelles colonnes. C'est le seul contrôle qui tienne côté serveur. À tester avec un compte aux droits restreints (voir [Affichage et droits d'accès](#affichage-et-droits-daccès)).
2. **Protéger la branche `main` sur GitHub** (elle ne l'est pas au 12 octobre 2026). Au minimum, interdire le force-push et la suppression de la branche ; idéalement, exiger une pull request et une CI verte avant fusion. Activer l'authentification à deux facteurs sur les comptes qui ont un droit d'écriture, et limiter ces droits au strict nécessaire. C'est la protection la plus efficace contre le risque principal.
3. **Sortir du document les tables sensibles sans rapport avec l'annuaire** ou, à défaut, les protéger par des règles d'accès : l'accès complet du widget les couvre.
4. **Charger `grist-plugin-api.js` depuis l'instance utilisée** (`grist.numerique.gouv.fr`) plutôt que depuis `docs.getgrist.com`. Cela ne se vérifie que dans un vrai document Grist : à tester avant d'être appliqué.
5. **Étudier une politique de sécurité de contenu** (`Content-Security-Policy`, en balise `<meta>` car GitHub Pages ne permet pas d'en-têtes personnalisés) qui limiterait les scripts à ceux du dépôt et de Grist. Comme le point 4, à valider dans un vrai document.
6. **Utiliser des valeurs réservées à la fiction dans `tests/fixtures.mjs`** : le domaine `.example` pour les adresses et les plages `05 36 49 xx xx` ou `06 39 98 xx xx` pour les numéros. Ses adresses de test reprennent aujourd'hui des noms de domaine d'institutions réelles, avec des noms de personnes inventés, et son numéro (`05 56 78 90 12`) a l'allure d'un vrai numéro de Gironde. Aucun risque connu, mais un doublon avec une vraie adresse ou un vrai numéro n'est pas exclu.
7. **Activer le signalement privé de vulnérabilités de GitHub** (Settings, Code security). Au 12 octobre 2026 il n'est pas activé : la section [Signaler un problème de sécurité](#signaler-un-problème-de-sécurité) ne propose donc qu'un contact direct.

## Signaler un problème de sécurité

Utilisez le signalement privé de vulnérabilités de GitHub (onglet Security du dépôt) s'il est activé ; sinon, contactez directement le propriétaire du dépôt (compte GitHub `lombre33`). Dans tous les cas, n'ouvrez pas d'*issue* publique, puisque le dépôt est public. Précisez la version (voir [`VERSION.md`](../VERSION.md)), ce que vous avez observé et, si possible, comment le reproduire avec le jeu de démonstration (`node docs/demo/serveur-demo.mjs`) et non avec des données réelles.

## Évolutions en cours

Cette page décrit la version 1.9.0. Deux chantiers la compléteront :

- **Le consentement individuel** : seules les personnes dont `Accepte_apparaitre` est cochée apparaîtraient, en plus de la validation de leur établissement. C'est un verrou de publication de plus, sans nouvel accès : les paragraphes [Données personnelles](#données-personnelles) et [Affichage et droits d'accès](#affichage-et-droits-daccès) seront à jour à sa fusion.
- **L'édition de fiche par la personne connectée** donnera au widget des **écritures** dans le document Grist, ce que permet l'accès complet, choisi pour cela. Les modifications s'appliqueront directement, sans validation par un administrateur : aucune étape ne filtrera une écriture avant qu'elle atteigne les données. Ce chantier ajoutera des opérations sensibles à vérifier, et il fera des règles d'accès Grist le vrai point de contrôle (le widget ne pouvant pas, seul, empêcher une écriture). Chaque ligne du tableau [Risques et protections](#risques-et-protections) sera revue à la fusion de ce chantier, avec la procédure de configuration côté Grist.
