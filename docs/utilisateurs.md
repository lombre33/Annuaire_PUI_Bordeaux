# Guide utilisateur

Ce guide s'adresse aux personnes qui consultent l'annuaire du Pôle universitaire d'innovation (PUI) de Bordeaux. Il explique comment retrouver quelqu'un, comment lire une carte, comment modifier sa propre fiche et que faire quand un contact n'apparaît pas. Toutes les captures utilisent des **données fictives** : les personnes, les établissements, les adresses et les numéros sont inventés.

Pages liées : [README](../README.md), [sécurité et confidentialité](securite.md), [maintenance](maintenance.md), [documentation développeur](developpeurs.md).

## Sommaire

- [L'annuaire en bref](#lannuaire-en-bref)
- [Lexique du PUI](#lexique-du-pui)
- [Découvrir l'écran](#découvrir-lécran)
- [Lire une carte](#lire-une-carte)
- [Les logos et le bandeau du bas](#les-logos-et-le-bandeau-du-bas)
- [Rechercher une personne](#rechercher-une-personne)
- [Filtrer](#filtrer), dont [Domaines et compétences](#domaines-et-compétences)
- [Gagner du temps : cliquer sur une étiquette](#gagner-du-temps--cliquer-sur-une-étiquette)
- [Fondateurs et Partenaires](#fondateurs-et-partenaires)
- [Réinitialiser](#réinitialiser)
- [Ma présence : apparaître ou non](#ma-présence--apparaître-ou-non)
- [Modifier ma fiche](#modifier-ma-fiche), dont [Quand l'enregistrement échoue](#quand-lenregistrement-échoue), [Pas de validation, pas d'historique](#pas-de-validation-pas-dhistorique) et [Pour les administrateurs](#pour-les-administrateurs)
- [Pourquoi une personne n'apparaît-elle pas ?](#pourquoi-une-personne-napparaît-elle-pas-)
- [Messages du bandeau rouge](#messages-du-bandeau-rouge)
- [Questions fréquentes](#questions-fréquentes)

## L'annuaire en bref

L'annuaire rassemble les accompagnateurs de l'innovation du PUI de Bordeaux. Sa promesse : *pas de mauvaise porte, toujours le bon interlocuteur*.

- Chaque personne est une **carte** : coordonnées, établissement et tout ce à quoi elle participe (instances, actions, groupes de travail ou GT, communautés, tâches, compétences, rôle).
- On retrouve quelqu'un par son **nom** ou, grâce aux **filtres**, par ce qu'il fait.
- L'annuaire porte les **logos** du PUI : celui de chaque établissement sur ses cartes, ceux des financeurs au centre de l'en-tête et ceux des établissements fondateurs dans un bandeau tout en bas ([Les logos et le bandeau du bas](#les-logos-et-le-bandeau-du-bas)).
- L'annuaire s'ouvre dans Grist et **s'adapte à la place qu'on lui donne** : trois colonnes de cartes sur un grand écran, une seule sur un téléphone ou dans un panneau étroit. Les captures de ce guide sont prises sur un grand écran.
- **Chacun décide s'il y figure.** Une personne n'apparaît que si elle a accepté d'apparaître. Si vous ouvrez l'annuaire depuis votre compte Grist et que votre fiche porte l'adresse e-mail de ce compte, un bandeau **Ma présence** vous dit où vous en êtes et vous laisse changer d'avis d'un clic ([Ma présence](#ma-présence--apparaître-ou-non)).
- **Chacun corrige sa propre fiche.** Quand l'annuaire vous reconnaît, un bouton **✎ Modifier** apparaît sur votre carte et un bouton **Modifier mon profil** dans le bandeau : vous changez votre nom, votre fonction, votre téléphone, votre rôle et vos listes, vous relisez votre carte avant et après, puis vous validez ([Modifier ma fiche](#modifier-ma-fiche)). L'enregistrement est direct : aucun administrateur ne valide et l'annuaire ne tient aucun historique. L'adresse e-mail, l'établissement et le périmètre ne se changent pas ici : adressez-vous à l'administrateur des données, c'est-à-dire la personne qui gère le contenu du document Grist.

## Lexique du PUI

<!-- Les lignes « À compléter » attendent une phrase de définition, à écrire directement ici. -->

| Mot | Sens |
|---|---|
| **PUI** | Pôle universitaire d'innovation de Bordeaux |
| **GT** | Groupe de travail |
| **Établissement fondateur** | L'un des 16 établissements qui ont fondé le PUI |
| **Établissement partenaire** | Un partenaire du PUI |
| **Structure « autres »** | Une structure extérieure au PUI, qui a collaboré à certaines tâches. Son statut est « autres » : ses contacts n'apparaissent pas dans l'annuaire |
| **Accord d'apparaître** | Le choix de chaque personne de figurer ou non dans l'annuaire. Sans son accord, une personne n'apparaît pas, même si son établissement a validé son apparition |
| **Instances** | *À compléter* |
| **Actions** | *À compléter* |
| **Communautés** | *À compléter* |
| **Tâches** | *À compléter* |
| **Rôle PUI** | *À compléter* |
| **Périmètre** | *À compléter.* Pour qu'une personne apparaisse, au moins un périmètre doit être renseigné (colonne `perimetre`) |

## Découvrir l'écran

![Vue d'ensemble de l'annuaire : en-tête, barre de recherche, huit filtres, interrupteurs Fondateurs et Partenaires, bouton Réinitialiser et cartes de contact](images/apercu.png)

| Élément | À quoi il sert |
|---|---|
| **Titre et compteur** (en haut à gauche, « PUI Bordeaux » et « 14 contacts ») | Le compteur indique combien de cartes sont affichées avec la recherche et les filtres actuels |
| **Financeurs** (au centre de l'en-tête) | La phrase de financement et les logos des financeurs ([Les logos](#les-logos-et-le-bandeau-du-bas)) |
| **Bandeau « Ma présence »** (à droite de l'en-tête, seulement si l'annuaire vous reconnaît) | Dit si vous apparaissez et vous laisse changer d'avis ([Ma présence](#ma-présence--apparaître-ou-non)). Son bouton **Modifier mon profil** ouvre le formulaire de votre fiche ([Modifier ma fiche](#modifier-ma-fiche)) |
| **Rechercher par nom ou prénom** | Cherche une personne par son nom ou son prénom |
| **Actions, Tâches, Communautés, GT, Domaines, Compétences, Instances, Établissement** | Huit filtres : chaque bouton ouvre un menu de valeurs à cocher |
| **Fondateurs / Partenaires** | Choisit les établissements affichés, selon leur statut |
| **Réinitialiser** | Efface la recherche et décoche tous les filtres |
| **Cartes** | Une carte par personne, trois par ligne, dans l'ordre de la liste des contacts dans Grist (sans tri) |
| **Bandeau des fondateurs** (tout en bas de la page, sous les cartes) | Les logos des établissements fondateurs, le rond « France 2030 » et la phrase de financement ([Les logos](#les-logos-et-le-bandeau-du-bas)) |
| **Bouton « ✎ Modifier »** et mention **« Votre fiche »** (en bas d'une carte, seulement si vous pouvez modifier cette fiche) | Ouvre le formulaire de modification de la fiche ([Modifier ma fiche](#modifier-ma-fiche)). La capture ci-dessus est celle d'un annuaire consulté sans être reconnu : elle n'a ni bandeau ni bouton |

## Lire une carte

![Une carte de contact avec neuf repères numérotés](images/carte-anatomie.png)

1. **Initiales** de la personne.
2. **Prénom et nom** de la personne.
3. **Fonction**, si elle est renseignée.
4. **Établissement** (en haut à droite) : son logo, seul, ou sa pastille s'il n'a pas de logo dans Grist ([Les logos](#les-logos-et-le-bandeau-du-bas)). Un clic filtre sur cet établissement.
5. **Adresse e-mail** : c'est un lien : un clic ouvre un nouveau message dans votre messagerie, si votre navigateur le permet. Une adresse saisie sous une forme inhabituelle (plusieurs destinataires, paramètres) reste affichée en texte, sans lien.
6. **Téléphone**, s'il est renseigné, présenté par paires de chiffres.
7. **Titres de section** : Instances, Actions, GT, Compétences, Communautés, Tâches, Rôle PUI. Une section n'apparaît que si la personne y a au moins une valeur.
8. **Étiquettes colorées** : un clic filtre sur cette valeur (voir [Gagner du temps](#gagner-du-temps--cliquer-sur-une-étiquette)).
9. **Rôle PUI** : affiché, mais sans filtre associé, donc non cliquable.

Sur une carte que vous pouvez modifier, une ligne s'ajoute en bas : la mention **Votre fiche** (sur la vôtre) et le bouton **✎ Modifier** ([Modifier ma fiche](#modifier-ma-fiche)).

Une information absente n'est pas remplacée par une ligne vide : elle n'apparaît simplement pas. Les **domaines** de compétences ne figurent pas sur la carte, qui garde le détail des compétences : ils servent à filtrer (voir [Domaines et compétences](#domaines-et-compétences)).

## Les logos et le bandeau du bas

Le PUI est le consortium de tous ses établissements fondateurs : il n'a pas d'identité graphique propre, ce sont **leurs logos** qui l'habillent. Ils viennent du document Grist, il n'y a rien à installer.

- **Au centre de l'en-tête : les financeurs.** La phrase « Projet financé par l'État dans le cadre de France 2030 » et les logos des financeurs, dans l'ordre choisi dans Grist. Discrets (affichés en niveaux de gris), ils ne sont pas cliquables.
- **Sur chaque carte : le logo de l'établissement**, en haut à droite, **seul**, sans le nom dessous. Un clic dessus filtre sur cet établissement, comme la pastille avant lui ([Gagner du temps](#gagner-du-temps--cliquer-sur-une-étiquette)). Le nom de l'établissement ne s'affiche, dans une pastille, que lorsque Grist n'a pas de logo pour lui.
- **Tout en bas : le bandeau des fondateurs.** Les logos des établissements fondateurs qui ont validé leur apparition, dans l'ordre choisi dans Grist, puis le rond « France 2030 » et une phrase de financement dont le nom du Pôle universitaire d'innovation Bordeaux est un lien vers la page du projet. En survolant un logo, on lit le nom complet de l'établissement.

![Le bandeau du bas : les logos des établissements fondateurs sur une ligne, le rond « 2030 » à droite et, dessous, la phrase « Le Pôle universitaire d'innovation Bordeaux est un projet financé par l'État dans le cadre de France 2030 »](images/bandeau-fondateurs.png)

Les logos de toutes ces captures sont **inventés**, comme le reste du jeu de démonstration.

**Quand un logo manque.** Le nom prend sa place : l'acronyme dans la pastille des cartes, le nom de la structure dans le bandeau du bas et chez les financeurs. L'annuaire reste utilisable. Cela arrive quand le fichier n'a pas été ajouté dans Grist, quand il a été supprimé ou n'est pas une image lisible, ou quand Grist ne donne pas accès aux pièces jointes : ce dernier cas touche **tous** les logos à la fois.

![L'en-tête et les premières cartes quand aucun logo ne se charge : les noms des financeurs remplacent leurs logos et chaque carte porte la pastille de l'acronyme de son établissement (CHD, UDD, ISD)](images/sans-logos.png)

Un logo absent ou mal affiché se corrige dans Grist, par l'administrateur des données ([`GRIST_SETUP.md`](../GRIST_SETUP.md), étape 5, et [maintenance](maintenance.md#les-logos-et-le-bandeau-du-bas)). Les tables de logos ne préviennent pas l'annuaire quand on les modifie : après un changement de logo, rechargez la page.

## Rechercher une personne

Tapez dans **Rechercher par nom ou prénom…** : les cartes se mettent à jour à chaque lettre.

![Recherche « elise » : une seule carte, Élise Marchetti](images/recherche.png)

- La recherche ignore les **majuscules** et les **accents** : « elise » trouve « Élise ».
- Elle porte sur le nom **ou** le prénom, pas sur la fonction ni sur l'établissement (pour l'établissement, utilisez le filtre Établissement). Tapez l'un ou l'autre : « Élise Marchetti » ne donne aucun résultat, alors que « Élise » ou « Marchetti » trouvent la carte.
- Elle se combine avec les filtres : seules les personnes qui satisfont les deux restent affichées.
- **Réinitialiser** vide le champ.

## Filtrer

Un clic sur un bouton de filtre ouvre son menu ; ouvrir un menu referme les autres, et un clic en dehors le referme.

![Menu du filtre Domaines ouvert : champ de recherche, options à cocher et nombre de cartes à droite de chaque option](images/filtre-menu.png)

- **Cochez** une ou plusieurs valeurs : les cartes se mettent à jour immédiatement.
- Dans un **même** menu, les valeurs s'additionnent (**ou**) : cocher deux instances affiche les personnes qui sont dans l'une *ou* l'autre.
- Entre **plusieurs** menus, les critères se cumulent (**et**) : cocher une instance et un établissement ne garde que les personnes qui ont les deux.
- Le **nombre à droite** de chaque option est le nombre de cartes qui portent cette valeur, compte tenu de la recherche, des interrupteurs et des autres menus (pas du menu lui-même). Cocher une valeur de plus **ajoute** donc ses cartes à celles déjà affichées. Une option à **0** n'a aucune carte avec le reste des critères : par exemple, un établissement partenaire tant que Partenaires est désactivé.
- Le **champ de recherche** en haut du menu réduit la liste d'options (sans tenir compte des accents ni des majuscules). Il ne coche rien.
- Les valeurs cochées **remontent en tête** du menu, et un **chiffre** sur le bouton indique combien de valeurs sont cochées.

![Communautés Santé numérique et Établissement CHD cochés : trois contacts](images/filtres-combines.png)

Ici, la communauté « Santé numérique » **et** l'établissement « CHD » sont cochés : seules les trois personnes du CHD qui font partie de la communauté Santé numérique restent affichées, et le compteur passe à « 3 contacts ».

### Domaines et compétences

Le filtre **Domaines** regroupe les compétences par domaine (on parle aussi de *compétences macro*). Cochez un domaine pour voir toutes les personnes qui ont **au moins une compétence** dans ce domaine, sans avoir à connaître chacune d'elles. Cochez plusieurs domaines : les valeurs s'additionnent (**ou**), comme dans tout menu.

![Domaine Recherche clinique coché et menu Compétences ouvert : deux contacts, et un compteur à 0 pour les compétences d'autres domaines](images/filtre-domaines.png)

Le filtre **Compétences** reste disponible pour affiner. Ici, « Domaines › Recherche clinique » est coché : deux personnes restent affichées, et le menu Compétences compte, pour chaque compétence, les personnes **de ce domaine** qui l'ont. Cocher « Essais cliniques » garde alors celles du domaine qui ont cette compétence.

Une compétence dont le domaine n'est pas renseigné dans Grist est rangée sous **Autres** : ses personnes restent ainsi trouvables.

## Gagner du temps : cliquer sur une étiquette

Cliquer sur une étiquette de carte, sur le logo ou la pastille d'établissement **coche le filtre correspondant** ; cliquer à nouveau le décoche. C'est le même résultat que cocher la case dans le menu, sans l'ouvrir.

Seul le **Rôle PUI** n'est pas cliquable : il s'affiche mais n'a pas de filtre.

## Fondateurs et Partenaires

Deux interrupteurs choisissent les établissements dont les contacts sont affichés, selon leur statut : fondateur du PUI ou partenaire (voir le [lexique](#lexique-du-pui)).

![Interrupteur Partenaires activé et Fondateurs désactivé : seuls les contacts d'établissements partenaires s'affichent](images/partenaires.png)

- Au départ, **Fondateurs** est activé et **Partenaires** ne l'est pas : vous voyez les personnes des établissements fondateurs.
- Activez **Partenaires** pour ajouter celles des établissements partenaires. Désactivez **Fondateurs** pour ne voir que les partenaires.
- Si vous désactivez les deux, aucune carte ne s'affiche : réactivez-en au moins un.
- **Réinitialiser** ne touche pas à ces interrupteurs : votre choix reste en place jusqu'à ce que vous le changiez ou que vous rechargiez la page, qui rétablit l'état de départ (Fondateurs activé, Partenaires désactivé).

## Réinitialiser

Le bouton **Réinitialiser** efface la recherche, décoche tous les filtres et vide les champs de recherche des menus. Il laisse en l'état les interrupteurs Fondateurs et Partenaires.

Quand rien ne correspond, l'annuaire affiche « Aucun contact trouvé » : modifiez la recherche ou réinitialisez les filtres.

![État vide : « Aucun contact trouvé. Modifiez votre recherche ou réinitialisez les filtres. »](images/etat-vide.png)

## Ma présence : apparaître ou non

Chaque personne décide elle-même si elle figure dans l'annuaire. Une personne n'apparaît que si elle a **accepté d'apparaître** et si son établissement a validé son apparition (voir [Pourquoi une personne n'apparaît-elle pas ?](#pourquoi-une-personne-napparaît-elle-pas-)).

Si vous ouvrez l'annuaire depuis votre compte Grist et que votre fiche porte l'adresse e-mail de ce compte, un bandeau **Ma présence** s'affiche à droite de l'en-tête. Il porte votre nom, une phrase qui dit où vous en êtes, un interrupteur et, quand une seule fiche porte votre adresse, le bouton **Modifier mon profil** ([Modifier ma fiche](#modifier-ma-fiche)).

![L'en-tête de l'annuaire, avec à droite le bandeau « Ma présence » de Camille Rousseau : « Vous apparaissez dans l'annuaire. », interrupteur « Apparaître dans l'annuaire » activé et bouton « Modifier mon profil » ; à gauche le titre et le compteur à 14 contacts, au centre les financeurs](images/ma-presence.png)

**Changer d'avis.** Cliquez sur l'interrupteur « Apparaître dans l'annuaire ». S'il était activé, il se désactive : votre carte disparaît de l'annuaire et le compteur perd une unité. S'il était désactivé, il s'active et votre carte revient, si rien d'autre ne vous masque. Pendant l'enregistrement, l'interrupteur est gelé et le bandeau indique « Enregistrement… » ; l'annuaire est ensuite relu, si bien que ce que vous voyez est ce que Grist a vraiment enregistré.

![Le bandeau « Ma présence » après un clic sur l'interrupteur : « Vous n'apparaissez pas dans l'annuaire. », interrupteur désactivé, et le compteur de l'en-tête à 13 contacts](images/ma-presence-retiree.png)

**Ce que dit le bandeau**

| Message | Ce que cela veut dire | Que faire |
|---|---|---|
| « Vous apparaissez dans l'annuaire. » | Vous avez donné votre accord et rien ne vous masque | Rien. Désactivez l'interrupteur pour vous retirer |
| « Vous apparaissez dans l'annuaire (visible avec l'interrupteur « Partenaires »). » | Votre établissement est partenaire : votre carte s'affiche quand **Partenaires** est activé | Rien |
| « Vous n'apparaissez pas dans l'annuaire. » | Vous n'avez pas donné votre accord, ou vous l'avez retiré | Activez l'interrupteur pour apparaître |
| « Vous avez accepté d'apparaître, mais votre fiche reste masquée : … Contactez un administrateur. » | Votre accord est donné, mais une autre condition manque. La raison suit les deux-points (voir plus bas) | Transmettez le message à l'administrateur des données : cela se corrige dans Grist |
| « Vous n'avez accepté d'apparaître que sur une partie de vos fiches. » | Plusieurs fiches portent votre adresse, et seules certaines ont votre accord | Un clic sur l'interrupteur donne votre accord à toutes ; prévenez l'administrateur des données pour qu'il supprime les doublons |
| « 2 fiches portent votre adresse : votre choix s'applique à toutes. » | Plusieurs fiches portent votre adresse (le chiffre varie). Votre choix, dans un sens comme dans l'autre, vaut pour chacune | Prévenez l'administrateur des données pour qu'il supprime les doublons |

![L'en-tête de Sarah Colin : son bandeau « Ma présence » dit « Vous avez accepté d'apparaître, mais votre fiche reste masquée : votre établissement n'a pas encore été validé. Contactez un administrateur. »](images/ma-presence-masquee.png)

Quand votre fiche reste masquée alors que vous avez accepté d'apparaître, le message donne la ou les raisons, séparées par des points-virgules :

- « votre fiche n'a ni prénom ni nom » ;
- « votre fiche n'a pas de périmètre » ;
- « votre fiche n'a pas d'établissement » ;
- « votre établissement n'est pas reconnu » ;
- « votre établissement n'a pas encore été validé » ;
- « votre établissement n'est ni fondateur ni partenaire » (une structure « autres »).

**Quand l'enregistrement échoue.** L'interrupteur reste dans son état réel et rien n'a changé. Le message s'affiche sous le bandeau :

| Message | Ce que cela veut dire | Que faire |
|---|---|---|
| « Grist a refusé la modification : vos droits ne permettent pas de changer cette information. Contactez un administrateur. » | Les droits de votre compte ne vous permettent pas de modifier votre fiche | Contactez l'administrateur des données |
| « Modification enregistrée ; l'annuaire n'a pas pu être rechargé. » | Votre choix est bien enregistré, mais l'annuaire n'a pas pu être relu | Rechargez la page |
| « La modification n'a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | Une panne passagère, ou un réglage à revoir | Réessayez ; si cela persiste, prévenez l'administrateur des données |
| « La colonne Accepte_apparaitre est une colonne à formule : elle doit être une colonne de données (case à cocher). Voir GRIST_SETUP.md. » | Un réglage du document Grist est à revoir | Prévenez l'administrateur des données |

**Ce que l'interrupteur change, et ce qu'il ne change pas**

- Il ne change que **votre accord d'apparaître**, sur **votre** fiche. Pour corriger une autre information (fonction, téléphone, listes…), utilisez [Modifier ma fiche](#modifier-ma-fiche). Pour l'adresse e-mail, l'établissement et le périmètre, adressez-vous à l'administrateur des données.
- Vous retirer **masque** votre carte, cela **n'efface pas** vos données : elles restent dans le document Grist, lisibles par les personnes qui y ont accès. Pour demander leur suppression, adressez-vous à l'administrateur des données.
- Vous pouvez changer d'avis à tout moment. Personne ne devrait changer votre choix à votre place : le formulaire de modification ne le touche jamais, et un administrateur ne coche votre case, dans Grist, qu'avec votre accord.

**Pas de bandeau ?** C'est normal quand l'annuaire ne peut pas vous reconnaître : vous n'êtes pas connecté à Grist, votre compte ne peut que consulter le document (rôle Lecteur), l'adresse de votre compte ne figure sur aucune fiche, ou l'annuaire n'a pas encore été réglé pour cela. L'annuaire s'affiche alors comme d'habitude, sans bandeau ni bouton « Modifier mon profil » (voir [Pourquoi n'ai-je pas de bouton Modifier ?](#questions-fréquentes)). Pour apparaître ou ne plus apparaître, ou pour corriger votre fiche, adressez-vous à l'administrateur des données.

## Modifier ma fiche

Vous pouvez corriger vous-même votre fiche : votre nom, votre fonction, votre téléphone, votre rôle dans le PUI et les listes qui forment votre carte (instances, actions, GT, compétences, communautés, tâches). Les modifications **s'appliquent directement** dans Grist : aucun administrateur ne les valide et l'annuaire n'en tient aucun historique ([Pas de validation, pas d'historique](#pas-de-validation-pas-dhistorique)). Mais rien n'est écrit avant une **relecture** : une fenêtre vous montre votre carte **Avant** et votre carte **Après**, avec ce qui change repéré, et c'est vous qui cliquez sur « Valider ».

### Où cliquer

![Le haut de l'annuaire de Camille Rousseau, personne fictive connectée : à droite de l'en-tête, le bandeau « Ma présence » avec l'interrupteur « Apparaître dans l'annuaire » et le bouton « Modifier mon profil », puis des cartes dont la sienne porte la mention « Votre fiche » et le bouton « ✎ Modifier » en bas de la carte](images/modifier-fiche-bouton.png)

*Où cliquer : le bouton « Modifier mon profil » du bandeau « Ma présence » et, sur la carte de la personne connectée (la première ici), la mention « Votre fiche » et le bouton « ✎ Modifier ». Les deux autres cartes n'ont pas de bouton.*

- **Sur une carte.** Le bouton **✎ Modifier** se trouve en bas des cartes que vous avez le droit de modifier. Sur la vôtre, la mention **Votre fiche** l'accompagne. Un administrateur a le bouton sur toutes les cartes affichées ([Pour les administrateurs](#pour-les-administrateurs)).
- **Dans le bandeau « Ma présence ».** Le bouton **Modifier mon profil** ouvre le même formulaire. Il est proposé même si votre carte n'apparaît pas dans l'annuaire (par exemple parce que vous avez retiré votre accord d'apparaître) : c'est alors le seul moyen d'ouvrir votre fiche. Si plusieurs fiches portent votre adresse, le bandeau ne le propose pas, car il ne saurait pas laquelle ouvrir : chaque carte garde alors son propre bouton.
- **Pas de bouton ?** C'est normal quand l'annuaire ne peut pas vous reconnaître (vous n'êtes pas connecté à Grist, votre compte ne peut que consulter le document, l'annuaire n'a pas été réglé pour cela) ou quand l'adresse de votre compte ne figure sur aucune fiche. Voir [Pourquoi n'ai-je pas de bouton Modifier ?](#questions-fréquentes).

### Ce qu'on peut changer, et ce qu'on ne peut pas

| Information | Dans ce formulaire ? |
|---|---|
| Prénom, nom, fonction, téléphone | Oui, en saisissant le texte |
| Rôle PUI | Oui, dans une liste déroulante (une valeur, ou « Non renseigné ») |
| Instances, Actions, GT, Compétences, Communautés, Tâches | Oui, en cochant ou en décochant des pastilles. Les compétences sont rangées par domaine, mais seules les compétences se cochent |
| Adresse e-mail | **Non** : c'est elle qui relie votre compte à votre fiche. À demander à l'administrateur des données |
| Établissement et périmètre | **Non** : ils décident de qui apparaît dans l'annuaire. À demander à l'administrateur des données |
| Le choix d'apparaître | **Non**, pas ici : c'est l'interrupteur « Apparaître dans l'annuaire » du bandeau [Ma présence](#ma-présence--apparaître-ou-non) |

### Remplir le formulaire

![Le formulaire « Modifier mon profil » : un bloc d'identité verrouillé en haut, les champs Prénom, Nom, Fonction et Téléphone, la liste Rôle PUI, puis les listes Instances, Actions, GT et Compétences en pastilles à cocher ; en bas, le nombre de champs modifiés et les boutons « Annuler » et « Relire mes modifications »](images/modifier-fiche-formulaire.png)

*Le formulaire de modification : l'identité verrouillée, les champs de texte, le rôle et les six listes à cocher (la fenêtre défile pour atteindre les dernières). Le pied de fenêtre compte les champs modifiés.*

Le formulaire s'ouvre avec les valeurs actuelles de la fiche. En haut, un bloc rappelle qui vous êtes (initiales, nom, adresse, établissement) et ce qui est verrouillé : « Verrouillé : l'e-mail et l'établissement sont liés à votre compte. Pour les corriger, contactez un administrateur. » Dessous :

- **Prénom, Nom, Fonction, Téléphone** : des zones de texte.
- **Rôle PUI** : une liste déroulante.
- **Instances, Actions, GT, Compétences, Communautés, Tâches** : toutes les valeurs que Grist propose, en pastilles. Un clic coche ou décoche une pastille, et chaque liste dit combien de valeurs sont sélectionnées. Au-delà de douze valeurs, une zone de recherche aide à retrouver une pastille.

**Les règles de saisie**

- Dans un **texte** (prénom, nom, fonction), les retours à la ligne et les espaces en trop sont retirés. Un texte ne peut pas commencer par = + - ou @ (un tableur y verrait une formule) ni dépasser 200 caractères.
- **Prénom et nom** : l'un des deux au moins doit rester renseigné.
- **Téléphone** : un numéro français à 10 chiffres, écrit comme vous voulez : « 05 56 78 90 12 », « 05.56.78.90.12 », « 0556789012 », « +33 5 56 78 90 12 » ou « 0033 5 56 78 90 12 ». Quand vous quittez le champ, un numéro valide est remis en forme (« 05 56 78 90 12 »). Pour effacer le numéro, videz le champ.
- Un champ laissé tel quel n'est pas une modification.

Un champ refusé est signalé sous le champ :

| Message sous le champ | Pourquoi |
|---|---|
| « ne peut pas commencer par = + - ou @ » | Le texte commence par l'un de ces signes |
| 200 « caractères au plus » | Le texte dépasse 200 caractères |
| « un numéro français à 10 chiffres est attendu (05 56 78 90 12). » | Le téléphone n'est pas un numéro français à 10 chiffres |
| « Indiquez au moins un prénom ou un nom. » | Le prénom et le nom seraient tous deux vides (le message s'affiche sous les deux champs) |

En bas de la fenêtre, un résumé dit où vous en êtes : « Aucune modification », le nombre de champs modifiés (par exemple : 2 champs modifiés) ou « Corrigez les champs signalés ». Le bouton **Relire mes modifications** reste grisé tant qu'il n'y a rien à relire ou qu'un champ est refusé.

### Relire avant d'enregistrer

![La fenêtre « Relire vos modifications » : la carte « Avant » et la carte « Après » côte à côte ; dans la carte « Après », la fonction porte la pastille « modifié », une action et une compétence ajoutées portent un « + » et une action et une compétence retirées sont barrées ; dessous, la liste « Ce qui change » et les boutons « Retour » et « Valider »](images/modifier-fiche-relecture.png)

*La relecture : une légende rappelle les repères, puis la carte « Avant », la carte « Après » avec ce qui change repéré, et la liste « Ce qui change ».*

Cliquez sur **Relire mes modifications**. Le bouton indique « Préparation… » le temps que l'annuaire relise la fiche dans Grist ; **rien n'est écrit**. La fenêtre « Relire vos modifications » montre deux cartes côte à côte (l'une sous l'autre sur un écran étroit) :

- **Avant**, « telle qu'elle est aujourd'hui » : la fiche telle qu'elle est maintenant dans Grist ;
- **Après**, « telle qu'elle sera » : exactement ce qui sera écrit, présenté comme l'annuaire l'affichera ensuite.

Dans la carte « Après », ce qui change est repéré, et jamais par la seule couleur :

- une ligne de texte modifiée (nom, fonction, téléphone) est mise en relief en vert, avec la pastille **modifié** ; si la ligne était vide, la pastille dit **ajouté** ;
- une ligne vidée garde son ancienne valeur, barrée, avec la pastille **supprimé** ;
- une étiquette ajoutée est entourée de vert et porte un **+** ; une étiquette retirée reste visible, barrée et entourée de rouge en pointillés.

Sous les cartes, la liste **Ce qui change** donne une ligne par champ modifié. Pour un texte, un téléphone ou le rôle : l'ancienne valeur barrée, une flèche, puis la nouvelle (« non renseigné » si le champ était vide, « supprimé » s'il est vidé). Pour une liste : les valeurs ajoutées (+) et retirées (−).

**Si la fiche ne figure pas dans l'annuaire.** La carte « Après » n'est pas une promesse que la carte sera visible. Quand la fiche reste hors de l'annuaire, un avis le dit en haut de la relecture, avec la raison. Par exemple : « Votre fiche est masquée de l'annuaire : vous n'avez pas accepté d'apparaître (interrupteur « Apparaître dans l'annuaire » en haut de page). » Ou, si vous avez accepté d'apparaître mais que la fiche reste masquée : « Votre fiche reste masquée de l'annuaire : votre établissement n'a pas encore été validé. » Les raisons possibles sont celles du bandeau [Ma présence](#ma-présence--apparaître-ou-non). Vos modifications s'enregistrent quand même : la carte apparaîtra quand rien d'autre ne la masquera plus.

### Valider, revenir en arrière ou abandonner

- **Valider** écrit les modifications dans Grist. Pendant l'écriture, le bouton indique « Enregistrement… » et « Retour » comme la croix ✕ sont grisés : un double clic n'écrit qu'une fois. L'annuaire est ensuite relu, ce qui met la carte à jour, et la fenêtre affiche **Fiche enregistrée** : « Vos modifications sont enregistrées », « Elles s'appliquent tout de suite dans Grist, sans validation. », la liste **Ce qui a changé** et un bouton « Fermer ».
- **Retour** ramène au formulaire avec votre brouillon intact : vous pouvez continuer à le modifier.
- **Annuler** (sur le formulaire) et la croix **✕** ferment la fenêtre tout de suite, sans rien enregistrer.
- **Échap** prévient avant d'abandonner : s'il y a des modifications non enregistrées, un premier appui affiche « Des modifications ne sont pas enregistrées. Appuyez encore sur Échap pour les abandonner. » et un second ferme la fenêtre. Sans modification, Échap ferme tout de suite. Pendant l'enregistrement, Échap ne ferme rien.
- **Sur un téléphone** ou dans un panneau étroit, la fenêtre occupe l'écran et les deux cartes sont l'une sous l'autre. Cet affichage a été vérifié dans un navigateur de bureau, dans des cadres de 280, 320 et 360 px de large, pas encore sur un téléphone.

### Si quelqu'un a modifié la même fiche entre-temps

L'annuaire relit la fiche dans Grist à deux moments : quand vous cliquez sur « Relire mes modifications », puis juste avant d'écrire.

- **Avant la relecture.** Si une information que vous modifiez a changé dans Grist depuis l'ouverture de la fenêtre, un avis le dit (« Ces informations ont changé dans Grist depuis l'ouverture de la fenêtre : … », suivi du nom des champs), et la carte « Avant » montre leur état actuel.
- **Pendant que vous relisez.** Si les champs que vous modifiez ont changé dans Grist depuis la relecture, **rien n'est écrit**. La fenêtre revient à la relecture avec ce que Grist contient maintenant et l'avis « La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau. » Relisez, puis cliquez de nouveau sur « Valider ».
- **Les autres champs ne sont jamais écrasés.** Ce que quelqu'un d'autre a changé dans des champs que vous n'avez pas touchés est conservé. Pour une liste, l'annuaire ne fait que retirer et ajouter ce que vous avez décoché et coché : une étiquette ajoutée entre-temps par une autre personne n'est pas perdue.

### Quand l'enregistrement échoue

Un échec n'est jamais muet : un message apparaît en haut de la fenêtre. Pour les huit premiers messages du tableau, **rien n'a été modifié** et votre brouillon reste dans la fenêtre : vous pouvez réessayer, ou cliquer sur « Retour ». Pour les deux derniers, l'enregistrement a bien eu lieu.

| Message | Ce que cela veut dire | Que faire |
|---|---|---|
| « La fiche n'a pas pu être relue dans Grist : rien n'a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | Grist n'a pas répondu quand l'annuaire a voulu relire la fiche, à la relecture ou au moment de « Valider » | Réessayez ; si cela persiste, prévenez l'administrateur des données |
| « Cette fiche n'existe plus dans Grist : rien n'a été modifié. » | La fiche a été supprimée pendant que vous la modifiiez | Fermez la fenêtre, rechargez la page et prévenez l'administrateur des données |
| « Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche. Contactez un administrateur. » | Une règle d'accès de Grist refuse l'écriture sur cette fiche. La relecture reste ouverte | Contactez l'administrateur des données |
| « Une colonne de la fiche est une colonne à formule : elle ne peut pas être modifiée depuis le widget. Voir GRIST_SETUP.md. » | Un réglage du document Grist est à revoir | Prévenez l'administrateur des données |
| « La modification n'a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur. » | Une panne passagère, ou un réglage à revoir | Réessayez ; si cela persiste, prévenez l'administrateur des données |
| « Ces modifications sont déjà dans la fiche : il n'y a rien à enregistrer. » | Quelqu'un a déjà enregistré les mêmes valeurs | Rien à faire : fermez la fenêtre |
| « Ces modifications ne peuvent pas être enregistrées : … » | La suite du message dit pourquoi : par exemple une liste de la fiche contient autre chose que des identifiants de ligne, ou la fiche n'aurait plus ni prénom ni nom | Selon la suite du message : à corriger dans Grist par l'administrateur des données, ou remettez un prénom ou un nom |
| « L'opération n'a pas pu aboutir. Le détail est dans la console du navigateur. » | Une erreur inattendue | Réessayez ; si cela persiste, prévenez l'administrateur des données |
| « Grist n'a pas gardé tout ce qui était demandé (…). Vérifiez la fiche dans Grist ou contactez un administrateur. » | L'écriture a abouti, mais, en relisant la fiche, l'annuaire constate que Grist n'a pas retenu certains champs (ils sont nommés entre parenthèses) | Vérifiez la fiche ; prévenez l'administrateur des données |
| « Les modifications sont enregistrées, mais l'annuaire n'a pas pu être rechargé. Rechargez la page pour les voir. » | Vos modifications sont bien enregistrées ; l'annuaire n'a simplement pas pu se relire | Rechargez la page |

### Pas de validation, pas d'historique

- **Aucune validation.** Personne ne relit ni n'approuve vos modifications : elles s'appliquent dès que vous cliquez sur « Valider ». Il n'y a pas d'attente.
- **Aucun historique tenu par l'annuaire.** L'annuaire ne garde ni l'ancienne valeur, ni la date, ni l'auteur d'une modification, et il ne crée aucune table dans le document Grist. On ne peut donc pas lui demander qui a changé quoi.
- **Ce que Grist garde de son côté.** Le document Grist garde sans doute une trace de la modification dans son propre journal ; l'annuaire ne l'a pas vérifié, ne la lit pas et ne la montre pas. Selon [`GRIST_SETUP.md`](../GRIST_SETUP.md), le bouton « Annuler » de Grist défait la dernière modification faite par l'annuaire, ce qui n'a pas été constaté.
- **Pour revenir en arrière,** rouvrez la fiche et remettez l'ancienne valeur : l'écran « Fiche enregistrée » rappelle ce qui a changé. Le mieux reste de bien relire avant de valider.

### Pour les administrateurs

Un administrateur est une personne dont la case `admin` est cochée dans la table `ACL` du document Grist (c'est l'administrateur des données qui la coche, voir [`GRIST_SETUP.md`](../GRIST_SETUP.md)). Il peut modifier **toutes les fiches affichées dans l'annuaire**, pas seulement la sienne : le bouton **✎ Modifier** est sur chaque carte, la fenêtre s'intitule « Modifier la fiche de … » et son bouton « Relire les modifications », mais le formulaire, les règles de saisie et la relecture sont les mêmes.

Ce que cela implique, et pourquoi rester prudent :

- La modification s'applique tout de suite à la fiche d'une autre personne, sans qu'elle soit prévenue et sans qu'aucun autre administrateur la valide.
- Le widget ne garde aucun historique : lisez la carte « Avant » et la liste « Ce qui change » avant de cliquer sur « Valider ».
- Un administrateur ne modifie **pas** les fiches masquées de l'annuaire (elles n'ont pas de carte, donc pas de bouton), ni l'adresse e-mail, l'établissement ou le périmètre d'une fiche, ni le choix d'apparaître d'une personne : cela se fait dans Grist. Modifier l'e-mail et l'établissement depuis l'annuaire, ou activer un mode administrateur par un interrupteur, n'existe pas encore : le bouton est toujours présent sur toutes les cartes.
- Pour la fiche d'une autre personne, la relecture dit aussi quand la fiche ne figure pas dans l'annuaire, par exemple : « Cette fiche est masquée de l'annuaire : la personne n'a pas accepté d'apparaître. » ou, si la personne a accepté d'apparaître mais reste masquée : « Cette fiche reste masquée de l'annuaire : son établissement n'a pas encore été validé. »

## Pourquoi une personne n'apparaît-elle pas ?

**D'abord, côté écran**

1. Une **recherche** ou un **filtre** est actif : cliquez sur **Réinitialiser**.
2. L'interrupteur qui correspond au statut de son établissement est **désactivé** : vérifiez Fondateurs et Partenaires.
3. Le nom est mal orthographié (les accents et les majuscules, eux, sont sans effet).
4. La donnée vient d'être modifiée dans Grist, dans une table autre que la liste des contacts (par exemple la validation d'un établissement) : **rechargez la page**. Grist ne prévient l'annuaire que des changements de la liste des contacts.
5. Si c'est de **vous** qu'il s'agit, regardez le bandeau [Ma présence](#ma-présence--apparaître-ou-non) : il dit si vous apparaissez et, sinon, pourquoi.

**Ensuite, côté données** (informations à transmettre à l'administrateur des données). Une personne n'est affichée que si **toutes** ces conditions sont réunies :

- elle a un **nom ou un prénom** ;
- elle a au moins une valeur de **périmètre** (colonne `perimetre`) ;
- elle a **accepté d'apparaître** (case `Accepte_apparaitre` cochée : par elle-même avec « Ma présence », ou dans Grist avec son accord) ;
- elle est rattachée à un établissement (colonne `Etablissement`, qui renvoie à une ligne de la table `Etablissements`) ;
- cet établissement a **validé** son apparition (`ok_pour_apparaitre` coché) ;
- cet établissement est **fondateur ou partenaire** (une structure « autres », extérieure au PUI, n'apparaît jamais).

Quelques cas, avec des personnes fictives du jeu de démonstration :

| Personne fictive | Situation | Résultat |
|---|---|---|
| Sarah Colin | A accepté d'apparaître, mais son établissement fondateur n'a pas validé son apparition | Jamais affichée (son bandeau « Ma présence » le lui dit) |
| Lucas Mercier | N'a pas accepté d'apparaître | Jamais affiché, tant qu'il n'active pas l'interrupteur de « Ma présence » |
| Gabriel Noël | Établissement de statut « autres » | Jamais affiché |
| Alice Bertin | Aucun établissement renseigné | Jamais affichée |
| Victor Lambert | Aucun périmètre renseigné | Jamais affiché |
| Clara Dubois | Établissement partenaire validé | Affichée seulement avec l'interrupteur Partenaires |

Les deux accords sont indépendants : celui de l'établissement ne remplace pas celui de la personne, et celui de la personne ne contourne pas l'établissement. La page [maintenance](maintenance.md#pourquoi-un-contact-est-visible-ou-non) détaille ces règles pour l'administrateur des données.

## Messages du bandeau rouge

Un bandeau rouge apparaît sous la barre d'outils quand l'annuaire n'a pas pu être lu entièrement. Son but : qu'un annuaire incomplet ne soit jamais pris pour un annuaire vide.

![Bandeau « Impossible de charger l'annuaire depuis Grist » et compteur « Chargement impossible »](images/bandeau-panne.png)

![Bandeau « Tables illisibles (Actions) » avec les cartes toujours affichées](images/bandeau-donnees-partielles.png)

| Message | Signification | Que faire |
|---|---|---|
| « Impossible de charger l'annuaire depuis Grist (table “…” illisible) » ou « Impossible de charger l'annuaire depuis Grist (colonne “…” absente de la table …) » | Une donnée indispensable n'a pas pu être lue. Les cartes déjà affichées restent en place | Rechargez la page. Si le message persiste, notez-le et transmettez-le à l'administrateur des données |
| « Tables illisibles (…) : des libellés ou des tags peuvent manquer » | Les cartes s'affichent, mais certains libellés ou « tags » (les étiquettes colorées des cartes) et certaines valeurs de filtre peuvent manquer | Rechargez la page, puis prévenez l'administrateur des données si le message revient |
| « Colonne de libellé introuvable : … Les tags et le filtre correspondants restent vides » | Une table de référence se lit, mais la colonne qui porte les libellés n'existe plus (renommée ou supprimée) | À corriger dans Grist par l'administrateur des données |
| « Acronymes en double dans Etablissements (…) avec des statuts différents » | Cas rare : deux établissements portent le même acronyme avec des statuts contradictoires et Grist a transmis l'établissement sous forme de texte. Le statut le plus strict est retenu : leurs contacts sont masqués s'il ne les rend plus éligibles | À corriger dans Grist par l'administrateur des données |
| « perimetre est vide… », « Etablissement est vide… », « Aucun contact affichable… » | Les données sont présentes mais aucune ne remplit les conditions d'affichage | À vérifier dans Grist par l'administrateur des données |
| « Personne n'a accepté d'apparaître : Accepte_apparaitre n'est coché pour aucun contact… » | Personne n'a donné son accord d'apparaître (ou la case n'est plus renseignée) : l'annuaire est vide faute d'accord, pas faute de données | À vérifier dans Grist par l'administrateur des données. Que quelques personnes seulement aient refusé n'est pas une anomalie : aucun bandeau ne le signale |

Le bandeau ne signale pas « aucun résultat pour ma recherche » : c'est le rôle de l'écran « Aucun contact trouvé ».

## Questions fréquentes

**Puis-je modifier mes informations ?**

Oui, vos informations personnelles : votre nom, votre fonction, votre téléphone, votre rôle et vos listes (instances, actions, GT, compétences, communautés, tâches). Cliquez sur **✎ Modifier** sur votre carte, ou sur **Modifier mon profil** dans le bandeau : vous relisez votre carte avant et après, puis vous validez, et c'est enregistré tout de suite ([Modifier ma fiche](#modifier-ma-fiche)). Décider d'apparaître ou non se fait avec l'interrupteur de [Ma présence](#ma-présence--apparaître-ou-non). L'adresse e-mail, l'établissement et le périmètre se corrigent dans Grist, par l'administrateur des données. Aucun administrateur ne valide vos modifications et l'annuaire n'en garde aucun historique.

**Pourquoi n'ai-je pas de bouton Modifier ?**

Le bouton **✎ Modifier** n'apparaît que sur les cartes que vous avez le droit de modifier : la vôtre, ou toutes les cartes affichées si vous êtes administrateur. Vous n'en avez donc aucun quand l'annuaire ne peut pas vous reconnaître : vous n'êtes pas connecté à Grist, votre compte ne peut que consulter le document (rôle Lecteur), l'annuaire n'a pas été réglé pour cela, ou l'adresse de votre compte ne figure sur aucune fiche. Si plusieurs fiches portent votre adresse, le bandeau ne propose pas **Modifier mon profil**, mais chaque carte garde son bouton. Si votre carte n'apparaît pas dans l'annuaire, le bouton du bandeau reste le seul moyen d'ouvrir votre fiche. Voir [Où cliquer](#où-cliquer) et [Pas de bandeau ?](#ma-présence--apparaître-ou-non).

**Quelqu'un d'autre peut-il changer ma fiche ?**

Les administrateurs, oui : ils peuvent modifier les fiches affichées de tout le monde ([Pour les administrateurs](#pour-les-administrateurs)). Les autres personnes n'ont pas de bouton sur votre carte. Ce verrou est cependant dans l'annuaire : seules les règles d'accès de Grist protègent vraiment votre fiche, et celles que propose [`GRIST_SETUP.md`](../GRIST_SETUP.md) (étape 4) n'ont pas été essayées dans un vrai Grist. Aucun administrateur ne valide les modifications et l'annuaire n'en garde aucun historique ; Grist en garde sans doute une trace de son côté.

**D'où viennent les informations ?**

D'un document Grist, qui sert de base de données à l'annuaire, logos compris : ce sont des fichiers joints à ce document, que votre navigateur télécharge chez Grist avec une autorisation de lecture qui expire en quelques minutes ([sécurité](securite.md#les-logos-et-le-jeton-daccès-aux-pièces-jointes)). L'annuaire n'enregistre rien dans votre navigateur, hormis ce que celui-ci garde de lui-même des images affichées. Dans le document Grist, il n'écrit que dans trois cas : à l'ouverture, une ligne de service qui sert à vous reconnaître (ajoutée puis supprimée aussitôt) ; votre choix d'apparaître ou non, quand vous cliquez sur l'interrupteur ; votre fiche, quand vous cliquez sur « Valider » après une relecture.

**J'ai changé une information dans Grist et je ne la vois pas.**

Une modification de la liste des contacts apparaît d'elle-même, après un court instant. Une modification d'une autre table (établissements, valeurs des listes de filtres) demande de **recharger la page**.

**Le téléphone ou la fonction d'une personne ne s'affiche pas.**

Ils ne s'affichent que s'ils sont renseignés dans Grist.

**Pourquoi vois-je le nom d'un établissement au lieu de son logo ?**

Parce que Grist n'a pas de logo lisible pour cet établissement (fichier absent, supprimé ou qui n'est pas une image), ou parce que Grist n'a pas donné à l'annuaire l'accès aux pièces jointes : ce dernier cas touche tous les logos à la fois. L'annuaire fonctionne normalement, avec les noms. Prévenez l'administrateur des données : un logo se remplace dans la colonne `logo` de la table `Etablissements` ([Les logos et le bandeau du bas](#les-logos-et-le-bandeau-du-bas)).

**Pourquoi un établissement fondateur ne figure-t-il pas dans le bandeau du bas ?**

Le bandeau ne montre que les établissements **fondateurs** qui ont **validé** leur apparition, comme pour les cartes : un établissement qui n'a pas validé n'apparaît nulle part, et un établissement partenaire n'y figure jamais. L'ordre des logos est celui de la colonne `ordre_bandeau`, choisi dans Grist.

**Puis-je utiliser l'annuaire sur mon téléphone ?**

Oui : l'annuaire s'adapte à la largeur de la zone que Grist lui donne. Sur un petit écran ou dans un panneau étroit, les cartes passent sur une colonne, la recherche et les filtres s'empilent, le texte est plus grand et les boutons sont plus faciles à toucher. Cet affichage a été vérifié dans un navigateur de bureau avec un écran tactile simulé, pas encore sur un téléphone : signalez à l'administrateur des données ce qui s'afficherait mal.

**Mes coordonnées sont-elles visibles par tout le monde ?**

L'annuaire n'affiche une personne que si elle a accepté d'apparaître, et si son établissement a validé son apparition et est fondateur ou partenaire. Cette règle ne concerne que l'affichage : les contacts masqués, y compris celles et ceux qui se sont retirés, restent lisibles dans le document Grist par toute personne qui y a accès. L'annuaire lui-même est visible par les personnes qui ont accès à la page Grist qui l'héberge ; les droits d'accès au document se gèrent dans Grist. Voir [sécurité et confidentialité](securite.md).

**Puis-je retirer mes coordonnées de l'annuaire ?**

Oui : désactivez l'interrupteur de [Ma présence](#ma-présence--apparaître-ou-non), votre carte disparaît aussitôt. Cela **masque** votre fiche sans l'effacer : vos données restent dans le document Grist. Pour qu'elles soient supprimées, adressez-vous à l'administrateur des données.

**Pourquoi n'ai-je pas de bandeau « Ma présence » ?**

L'annuaire ne vous propose rien quand il ne peut pas vous reconnaître : compte qui ne peut que consulter (rôle Lecteur), adresse de votre compte absente de l'annuaire, ou réglage manquant dans Grist. Voir [Ma présence](#ma-présence--apparaître-ou-non).

**Que sait l'annuaire de moi quand je l'ouvre ?**

Pour savoir qui vous êtes, l'annuaire demande à Grist l'adresse de votre compte : il ajoute puis supprime une ligne de service dans le document, qui porte cette adresse. Elle n'est ni conservée dans votre navigateur ni envoyée ailleurs, mais cette ligne peut rester visible dans l'historique du document Grist. Voir [sécurité et confidentialité](securite.md#écritures-et-règles-daccès). Quand vous modifiez votre fiche, l'annuaire relit votre ligne dans Grist puis y écrit, en une seule action, les champs que vous avez relus ; il n'en garde ni copie ni historique.
