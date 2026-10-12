# Sécurité et confidentialité

Cette page répond aux questions qu'on se pose avant de mettre l'annuaire entre les mains d'un public : qu'est-ce que le widget peut lire et faire, où vont les données, quels sont les risques restants et comment les réduire. Elle décrit la **version 1.11.0**, première version où le widget écrit dans le document ; le chantier d'édition de fiche, qui ajoutera d'autres écritures, obligera à la compléter (voir [Évolutions en cours](#évolutions-en-cours)).

Pages liées : [README](../README.md), [documentation développeur](developpeurs.md), [maintenance](maintenance.md), [guide utilisateur](utilisateurs.md).

## Sommaire

- [Résumé](#résumé)
- [Ce que le widget lit, écrit et envoie](#ce-que-le-widget-lit-écrit-et-envoie)
- [Niveau d'accès demandé à Grist](#niveau-daccès-demandé-à-grist)
- [Risques et protections](#risques-et-protections)
- [Affichage et droits d'accès](#affichage-et-droits-daccès)
- [Écritures et règles d'accès](#écritures-et-règles-daccès)
- [Données dans le dépôt](#données-dans-le-dépôt)
- [Données personnelles](#données-personnelles)
- [Recommandations](#recommandations)
- [Signaler un problème de sécurité](#signaler-un-problème-de-sécurité)
- [Évolutions en cours](#évolutions-en-cours)

## Résumé

| Question | Réponse pour la version 1.11.0 |
|---|---|
| Le widget écrit-il dans le document Grist ? | **Oui, deux choses seulement.** À chaque chargement, il ajoute puis supprime une ligne de la table-sonde `Annuaire_Sonde` pour savoir qui est connecté (sauf pour un compte Lecteur). Et quand la personne connectée actionne l'interrupteur « Ma présence », il coche ou décoche `Accepte_apparaitre` sur sa propre fiche de `BDD`. Il ne crée ni ne supprime jamais de table, de colonne ni de fiche de `BDD`. Voir [Écritures et règles d'accès](#écritures-et-règles-daccès) |
| Où vont les données qu'il lit ? | **Nulle part ailleurs que dans la page affichée** : le code n'émet aucune requête réseau, ne stocke rien dans le navigateur (ni cookie, ni stockage local) et ne communique avec aucun service de statistiques |
| Quelles tables lit-il ? | Celles de [`grist_structure.txt`](../grist_structure.txt) (neuf tables), plus la table-sonde pour savoir qui est connecté. Il ne lit jamais la table `ACL` : seule la formule de la sonde la lit |
| Pourquoi demande-t-il l'accès complet (`full`) au document ? | **C'est un choix assumé** : le widget lit plusieurs tables et écrit dans le document (la sonde, le consentement), et les fonctionnalités prévues écriront davantage. Cet accès couvre **tout le document** ; trois garde-fous doivent l'encadrer, à mettre en place ou à vérifier : des règles d'accès Grist, une branche `main` protégée et des tables sensibles hors du document ou protégées (voir [le détail](#niveau-daccès-demandé-à-grist)) |
| Qui peut changer le code qui s'exécute ? | Toute personne qui peut publier sur la branche `main` du dépôt : GitHub Pages sert ce code à tous les documents qui utilisent le widget. **C'est le risque principal**, voir ci-dessous |
| Les contacts que le widget masque sont-ils protégés ? | **Non.** Masquer un contact, y compris parce que la personne a retiré son accord, est un choix d'affichage, pas un contrôle d'accès ni un effacement. Seules les règles d'accès de Grist protègent une donnée |
| Une personne peut-elle modifier la fiche d'une autre ? | **Pas par l'interface** : l'interrupteur n'agit que sur les fiches qui portent l'adresse de la personne connectée. Mais c'est un verrou d'interface, que la console du navigateur contourne : seules des règles d'accès Grist l'empêchent vraiment. Elles sont **proposées** dans [`GRIST_SETUP.md`](../GRIST_SETUP.md) (étape 4) mais n'ont **pas été essayées** dans un vrai document : à poser et à tester |
| L'ouverture du widget laisse-t-elle une trace ? | **Sans doute, dans l'historique du document Grist** : la ligne de la sonde, qui porte l'adresse de la personne, y est créée puis supprimée à chaque ouverture. Qui peut voir cet historique et combien de temps il est conservé n'est pas précisé par la documentation de Grist consultée : voir [Écritures et règles d'accès](#écritures-et-règles-daccès) |
| Y a-t-il de vraies données dans le dépôt public ? | **Non, à notre connaissance.** Le schéma est réduit et les captures comme le jeu de démonstration sont fictifs. Une recherche d'adresses e-mail et de numéros de téléphone dans tout l'historique (12 octobre 2026) n'a trouvé que des valeurs d'exemple |

## Ce que le widget lit, écrit et envoie

Vérifié dans le code de la version 1.11.0 :

- **Lecture.** `loadDirectory()` appelle `docApi.fetchTable()` une fois par table de [`grist_structure.txt`](../grist_structure.txt) à chaque chargement. `readIdentity()` lit en plus la liste des tables (`listTables`) puis la table-sonde, pour savoir qui est connecté.
- **Écriture.** Deux emplois de `docApi.applyUserActions()`, et deux seulement :
  1. `identity.js`, à chaque chargement (sauf compte Lecteur, ou table-sonde absente) : `AddRecord` puis `RemoveRecord` dans `Annuaire_Sonde`. La ligne est ajoutée vide : c'est Grist qui y inscrit l'adresse et le droit d'administrateur ;
  2. `presence.js`, au clic sur l'interrupteur « Ma présence » : un `UpdateRecord` de `BDD` par fiche de la personne, qui ne porte que `Accepte_apparaitre`, le tout en une seule action atomique.

  Le widget ne crée, ne renomme ni ne supprime jamais de table ou de colonne, et ne supprime aucune fiche de `BDD`. `tests/identity.test.mjs` et `tests/presence.test.mjs` vérifient ce que chaque écriture envoie, et `tests/docs.test.mjs` échoue si le code emploie une autre méthode de l'API de Grist que celles qui sont citées sur cette page : `ready`, `onRecords`, `fetchTable`, `listTables` et `applyUserActions`.
- **Réseau.** Le code du widget ne contient aucun `fetch`, `XMLHttpRequest` ni `sendBeacon`. La page charge seulement ses propres fichiers (GitHub Pages) et le script `grist-plugin-api.js` (voir plus bas). Elle ne charge ni police, ni image, ni bibliothèque externe.
- **Stockage local.** Aucun usage de `localStorage`, `sessionStorage` ni de cookie.
- **Journal du navigateur.** La console reçoit des diagnostics (`[GRIST]`, `[REFS]`, `[ETABLISSEMENT]`, `[CONSENTEMENT]`, `[IDENTITE]`, `[PRESENCE]`) et l'erreur brute d'un chargement raté, mais **jamais** un nom, une adresse ou un numéro de contact : seuls des nombres et les identifiants de ligne Grist des contacts concernés y figurent. La seule exception est le détail brut d'une erreur renvoyée par Grist, que le widget ne contrôle pas.
- **Rendu.** Tout texte venu de Grist est inséré avec `textContent`, jamais comme HTML. Un lien `mailto:` n'est créé que pour une adresse simple, sans paramètre ni destinataire supplémentaire.
- **Adresse de la personne connectée.** Le widget ne la reçoit pas de Grist : il la fait calculer par Grist, par la formule de la table-sonde. L'adresse reste dans la page le temps de la session, sans être journalisée ni envoyée ailleurs. Elle reste en revanche dans l'historique du document (voir [Écritures et règles d'accès](#écritures-et-règles-daccès)).

## Niveau d'accès demandé à Grist

Le widget demande l'accès **`full`** (accès complet au document), à deux endroits : `grist.ready({ requiredAccess: 'full' })` dans `main.js` et `accessLevel: full` dans [`manifest.yml`](../manifest.yml). Ce niveau a été constaté dans le panneau d'accès du widget dans Grist lors d'un audit.

**Un choix assumé, pas un défaut à corriger.** Le propriétaire du dépôt a choisi cet accès, pour deux raisons. D'une part, le widget lit plusieurs tables : le niveau `read table` ne donne accès qu'à la table liée à la section du widget, or il lit aussi les tables de référence (actions, instances, établissements…). D'autre part, le widget écrit dans le document (la sonde et le consentement, depuis la 1.11.0) et les fonctionnalités prévues, à commencer par l'édition de fiche, y écriront davantage. L'enjeu n'est donc pas de réduire cet accès mais de l'entourer de garde-fous.

**Ce que cela signifie.** Selon [la documentation de Grist sur les widgets personnalisés](https://grist-docs.beta.numerique.gouv.fr/widget-custom/), un widget en accès complet peut lire tout le document, le transmettre à un tiers et le modifier de n'importe quelle manière. Grist demande donc que la page du widget soit possédée et contrôlée par une personne de confiance. Le widget actuel n'envoie rien à un tiers et n'écrit que ce qui est décrit ci-dessus, mais **c'est la confiance dans le code publié qui protège le document**, pas une limite technique.

**Les trois garde-fous.** Ils se complètent et aucun ne remplace les autres. Leur mise en œuvre est détaillée dans les [Recommandations](#recommandations).

| Garde-fou | Ce qu'il protège | Où le régler |
|---|---|---|
| **Règles d'accès Grist (ACL)**, appliquées par le serveur | Les données elles-mêmes : qui peut lire ou modifier quoi, côté serveur (comportement à vérifier avec un widget en accès complet : voir [Écritures et règles d'accès](#écritures-et-règles-daccès)) | Grist, document de l'annuaire |
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
| **Fuite par la console** (diagnostics partagés lors d'une démonstration) | Seuls des nombres et des identifiants de ligne sont journalisés, jamais une adresse ni un nom ; testé pour l'identité (`tests/identity.test.mjs`) et le consentement (`tests/load-directory.test.mjs`) | Rien à faire |
| **Affichage d'un contact qui ne devrait pas l'être** | Logique « fermée » : établissement inconnu, non validé ou « autres » = contact masqué (en cas de doublon d'acronyme transmis en texte, le statut le plus strict l'emporte) ; personne qui n'a pas accepté d'apparaître = masquée, seul `true` valant accord ; colonne de consentement absente = erreur et aucune carte, jamais l'annuaire de tout le monde ; règles testées | Rien à faire |
| **Écriture involontaire ou détournée dans le document** | Le widget n'écrit que deux choses (la ligne de la sonde, `Accepte_apparaitre` sur les fiches de la personne connectée), en une seule action atomique pour la seconde, jamais en tâche de fond ; une écriture refusée par Grist ne change rien ; testé. Aucune autre méthode d'écriture n'est employée (`tests/docs.test.mjs`) | Règles d'accès Grist côté serveur (voir [Écritures et règles d'accès](#écritures-et-règles-daccès)) : sans elles, quiconque peut modifier le document peut écrire n'importe quoi depuis la console. Revue à part de tout ajout d'écriture (voir [Évolutions en cours](#évolutions-en-cours)) |
| **Fiche d'un tiers modifiée** : quelqu'un contourne l'interface (console du navigateur) pour écrire sur la fiche d'une autre personne | L'interrupteur n'agit que sur les fiches qui portent l'adresse de la personne connectée. C'est un verrou d'interface, pas une barrière | Règle d'accès sur `BDD.Accepte_apparaitre` qui n'autorise la modification que sur sa propre fiche (`GRIST_SETUP.md`, étape 4), **à tester sur une copie du document** |
| **Trace des consultations** : chaque ouverture du widget laisse sans doute dans l'historique du document la création puis la suppression d'une ligne de la sonde, qui porte l'adresse de la personne | Aucune : c'est le prix de l'identification de la personne connectée | Vérifier qui peut voir l'historique de Grist (onglet Activité) et combien de temps il est conservé, puis en tenir compte dans l'information des personnes (voir [Données personnelles](#données-personnelles)) |
| **Dépendances** | Aucune à l'exécution. En intégration continue (CI) : Node 22, `playwright@1.64.0` figé, `actions/checkout@v4` et `actions/setup-node@v4` (références par étiquette de version, non épinglées sur un identifiant de commit), droit `contents: read` seulement | Mettre à jour régulièrement (voir [maintenance](maintenance.md#dépendances-et-mises-à-jour)) |
| **Données réelles dans le dépôt public** | Schéma réduit, données de démonstration fictives, test automatique (voir [Données dans le dépôt](#données-dans-le-dépôt)) | Vigilance à chaque commit |

## Affichage et droits d'accès

Les règles d'affichage ([guide utilisateur](utilisateurs.md#pourquoi-une-personne-napparaît-elle-pas-)) décident **ce que le widget montre**. Elles ne décident pas **ce qui est lisible** :

- une personne qui a accès au document Grist peut lire les mêmes tables directement dans Grist, y compris les contacts que le widget masque (établissement non validé, « autres », hors périmètre, personne qui n'a pas accepté d'apparaître) ;
- le widget lui-même lit tout ce que lui ouvre son accès `full`.

Pour qu'une donnée ne soit pas lisible, il faut une **règle d'accès Grist** (ACL) sur le document. La documentation de Grist consultée ne précise pas comment ces règles s'appliquent à un widget en accès complet : **testez ce comportement dans votre instance avant de vous y fier**, par exemple en ouvrant le widget avec un compte aux droits restreints.

**Un verrou dans l'interface ne protège pas.** Cela vaut aussi pour les écritures, celles d'aujourd'hui (« Ma présence ») comme celles à venir : un contrôle fait seulement dans le code du widget (par exemple « l'interrupteur n'agit que sur ma fiche ») n'arrête que la personne de bonne foi. Quiconque a accès au document peut contourner la page, en écrivant directement dans Grist ou en modifiant la page dans son navigateur. Seules les règles d'accès appliquées par le serveur Grist constituent une vraie barrière, sous réserve de la vérification demandée plus haut.

## Écritures et règles d'accès

Depuis la version 1.11.0, le widget écrit dans le document (voir [ce qu'il écrit](#ce-que-le-widget-lit-écrit-et-envoie)). Ce que le code fait pour limiter les dégâts, et ce qu'il ne peut pas garantir :

**Ce que le widget fait pour s'encadrer**

- **Dans le doute, il n'écrit pas.** Sans table-sonde, si la formule de la sonde ne renvoie aucune adresse, si Grist refuse l'écriture ou la relecture de la sonde, ou pour un compte Lecteur (le widget n'essaie même pas), personne n'est identifié : pas de bandeau « Ma présence », aucune modification proposée, et l'annuaire s'affiche comme avant.
- **Il n'écrit que sur les fiches de la personne.** Elle est retrouvée par l'adresse e-mail de sa ligne de `BDD`, sans tenir compte de la casse ni des espaces. Une action atomique par clic : si Grist refuse une des lignes, aucune n'est changée.
- **Il ne croit que Grist.** L'adresse et le droit d'administrateur viennent de formules que Grist calcule à la création de la ligne de la sonde, que le widget ajoute **vide** : il ne fournit jamais lui-même l'adresse. Une valeur `Admin` autre que `true` exactement n'ouvre aucun droit.
- **Il montre ce que Grist a enregistré.** Après l'écriture, l'annuaire est relu : l'interrupteur et les cartes reflètent l'état réel, pas ce qu'on espérait. Un refus de Grist (règle d'accès, colonne à formule) devient un message en français, et rien ne change.

**Ce qu'il ne peut pas garantir**

- **Le widget n'est pas une barrière.** Tout ce qui précède se passe dans le navigateur de la personne, qui peut le contourner (console, page modifiée). L'identité que le widget a lue n'est pas une preuve : elle ne sert qu'à décider ce que l'interface propose.
- **Seules les règles d'accès de Grist arrêtent une écriture indue.** [`GRIST_SETUP.md`](../GRIST_SETUP.md) (étape 4) propose trois règles : création, lecture et suppression des lignes de la sonde pour qui peut modifier le document ; modification de `BDD.Accepte_apparaitre` seulement sur sa propre fiche ; `ACL` masquée à tous sauf aux administrateurs. **Ces règles n'ont pas été essayées dans un vrai document Grist**, et la documentation de Grist consultée ne dit pas comment les règles d'accès s'appliquent aux écritures d'un widget : à tester sur une copie du document, avec un compte aux droits restreints, avant de s'y fier.
- **Chaque ouverture laisse sans doute une trace.** La ligne de la sonde, créée puis supprimée à chaque ouverture, porte l'adresse e-mail de la personne. Selon la [documentation de Grist sur l'historique du document](https://grist-docs.beta.numerique.gouv.fr/document-history/), l'onglet « Activité » liste les changements récents sous forme d'extraits de tables, et la case « Toutes les tables » (« All tables ») l'étend à tout le document : l'adresse et le moment de l'ouverture devraient donc y figurer, ce qui revient à un journal des consultations. Cette page ne dit ni qui peut voir l'historique ni combien de temps il est conservé : à constater dans un document de test, puis à porter à la connaissance du responsable du traitement. Si une page se ferme entre l'ajout et la suppression, une ligne peut rester dans la sonde : on peut vider la table sans risque.
- **Le bouton « Annuler » de Grist** défait, selon [`GRIST_SETUP.md`](../GRIST_SETUP.md), le dernier changement fait par le widget, y compris un changement de présence. Ce comportement n'a pas été constaté dans un vrai document.

## Données dans le dépôt

Le dépôt GitHub est **public**. Il ne doit contenir aucune donnée réelle de l'annuaire ni du document Grist.

- **Schéma réduit.** [`grist_structure.txt`](../grist_structure.txt) ne liste que les tables et colonnes utiles au widget. Le document Grist source contient d'autres tables sans rapport avec l'annuaire, dont certaines sensibles : ne jamais copier son schéma complet dans le dépôt. Pour du débogage, le garder en local.
- **Jeux de test et de démonstration inventés.** Règle : `tests/fixtures.mjs` et `docs/demo/donnees-fictives.mjs` ne contiennent que des personnes inventées (les adresses de `tests/fixtures.mjs` reprennent toutefois des domaines d'institutions réelles : voir [Recommandations](#recommandations), point 6). Le jeu de démonstration l'est entièrement, établissements compris : ses adresses se terminent par `.example` (domaine réservé à la documentation par la RFC 2606) et ses numéros appartiennent au plan réservé à la fiction (`05 36 49 xx xx`, `06 39 98 xx xx`, décision ARCEP n° 2018-0881). `tests/docs.test.mjs` vérifie ces deux points. Le jeu de `tests/fixtures-responsive.mjs` (tests de mise en page) suit la même règle, vérifiée par `tests/responsive.test.mjs`.
- **Captures d'écran.** Les images de `docs/images/` sont produites par `docs/demo/capturer.mjs` à partir de ce jeu fictif. Ne jamais y mettre la capture du vrai annuaire.
- **Si des données réelles sont enregistrées par erreur dans le dépôt (commit)**, les retirer dans un nouveau commit ne suffit pas : l'historique Git les conserve. Prévenir sans attendre le propriétaire du dépôt (purge de l'historique et, si besoin, information du responsable du traitement).

## Données personnelles

L'annuaire affiche des données à caractère personnel, d'ordre professionnel : nom, prénom, fonction, établissement, adresse e-mail, téléphone et participations aux instances, actions et groupes de travail (GT). Cette page n'est pas une analyse juridique ; voici les points techniques utiles au responsable du traitement.

- **Verrou de publication.** Depuis la version 1.10.0, un contact n'apparaît que si **deux accords** sont réunis, indépendants l'un de l'autre : celui de son **établissement** (`ok_pour_apparaitre`, fondateur ou partenaire) et celui de la **personne** (`Accepte_apparaitre`, une case à cocher dont seul `true` vaut accord). Depuis la 1.11.0, la personne peut donner ou retirer son accord elle-même avec l'interrupteur « Ma présence ».
- **Retirer son accord masque, il n'efface pas.** La personne qui décoche l'interrupteur disparaît de l'annuaire, mais ses données restent dans le document Grist, lisibles par celles et ceux qui y ont accès, et dans l'historique de Grist. Le droit d'effacement s'exerce dans Grist, pas dans le widget.
- **Minimisation.** Le widget n'affiche que les champs prévus par le [cahier des charges](../specs.md). Il lit cependant toutes les colonnes des neuf tables, y compris celles qu'il n'affiche pas, et les garde en mémoire dans le navigateur le temps de la session : seules les règles d'accès Grist peuvent restreindre ce qui est lu.
- **Pas de copie.** Le widget ne conserve rien dans le navigateur et n'envoie rien à un autre service ; les données demeurent dans Grist, unique lieu où exercer les droits de rectification et d'effacement.
- **Adresse de la personne connectée.** Le widget la fait inscrire par Grist dans la table-sonde pour retrouver sa fiche. Elle reste dans la page le temps de la session et, sans doute, dans l'historique du document (voir [Écritures et règles d'accès](#écritures-et-règles-daccès)) : un journal des ouvertures du widget en est un effet de bord.
- **À confirmer par le responsable du traitement** : information des personnes (y compris sur cette trace et sur le fait que décocher l'interrupteur masque sans effacer), modalités d'exercice de leurs droits, durée de conservation, liste des personnes ayant accès au document Grist et à son historique.

## Recommandations

Classées par ordre décroissant de rapport utilité/effort. Ce sont des **propositions**, à décider par le propriétaire du dépôt et par l'administrateur de l'instance Grist. Les trois premières sont les [garde-fous](#niveau-daccès-demandé-à-grist) de l'accès complet.

1. **Poser les règles d'accès Grist (ACL) du document**, dès maintenant puisque le widget écrit depuis la 1.11.0, et en tout cas avant l'édition de fiche : qui peut lire quelles tables, qui peut modifier quelles lignes et quelles colonnes (les règles utiles à « Ma présence » sont à l'étape 4 de [`GRIST_SETUP.md`](../GRIST_SETUP.md)). C'est le seul contrôle qui tienne côté serveur. À tester sur une copie du document, avec un compte aux droits restreints (voir [Écritures et règles d'accès](#écritures-et-règles-daccès)).
2. **Protéger la branche `main` sur GitHub** (elle ne l'est pas au 12 octobre 2026). Au minimum, interdire le force-push et la suppression de la branche ; idéalement, exiger une pull request et une CI verte avant fusion. Activer l'authentification à deux facteurs sur les comptes qui ont un droit d'écriture, et limiter ces droits au strict nécessaire. C'est la protection la plus efficace contre le risque principal.
3. **Sortir du document les tables sensibles sans rapport avec l'annuaire** ou, à défaut, les protéger par des règles d'accès : l'accès complet du widget les couvre.
4. **Charger `grist-plugin-api.js` depuis l'instance utilisée** (`grist.numerique.gouv.fr`) plutôt que depuis `docs.getgrist.com`. Cela ne se vérifie que dans un vrai document Grist : à tester avant d'être appliqué.
5. **Étudier une politique de sécurité de contenu** (`Content-Security-Policy`, en balise `<meta>` car GitHub Pages ne permet pas d'en-têtes personnalisés) qui limiterait les scripts à ceux du dépôt et de Grist. Comme le point 4, à valider dans un vrai document.
6. **Utiliser des valeurs réservées à la fiction dans `tests/fixtures.mjs`** : le domaine `.example` pour les adresses et les plages `05 36 49 xx xx` ou `06 39 98 xx xx` pour les numéros. Ses adresses de test reprennent aujourd'hui des noms de domaine d'institutions réelles, avec des noms de personnes inventés, et son numéro (`05 56 78 90 12`) a l'allure d'un vrai numéro de Gironde. Aucun risque connu, mais un doublon avec une vraie adresse ou un vrai numéro n'est pas exclu.
7. **Activer le signalement privé de vulnérabilités de GitHub** (Settings, Code security). Au 12 octobre 2026 il n'est pas activé : la section [Signaler un problème de sécurité](#signaler-un-problème-de-sécurité) ne propose donc qu'un contact direct.

## Signaler un problème de sécurité

Utilisez le signalement privé de vulnérabilités de GitHub (onglet Security du dépôt) s'il est activé ; sinon, contactez directement le propriétaire du dépôt (compte GitHub `lombre33`). Dans tous les cas, n'ouvrez pas d'*issue* publique, puisque le dépôt est public. Précisez la version (voir [`VERSION.md`](../VERSION.md)), ce que vous avez observé et, si possible, comment le reproduire avec le jeu de démonstration (`node docs/demo/serveur-demo.mjs`) et non avec des données réelles.

## Évolutions en cours

Cette page décrit la version 1.11.0. Un chantier la complétera :

- **La modification de sa fiche par la personne connectée** (1.12.0, en préparation) donnera au widget davantage d'**écritures** : la personne modifiera sa propre fiche de `BDD`, après une fenêtre de relecture qui montre sa carte avant et après. Les modifications s'appliqueront directement, sans validation par un administrateur, et sans historique des modifications tenu par le widget : aucune étape ne filtrera une écriture avant qu'elle atteigne les données. Les administrateurs pourront modifier les fiches de tout le monde. Ce chantier fait des règles d'accès Grist le vrai point de contrôle, le widget ne pouvant pas, seul, empêcher une écriture : chaque ligne du tableau [Risques et protections](#risques-et-protections) sera revue à sa fusion, avec les règles d'accès à poser.
