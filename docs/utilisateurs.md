# Guide d'utilisation

Ce guide s'adresse aux personnes qui consultent l'annuaire du PUI de Bordeaux. Il explique comment retrouver quelqu'un, comment lire une carte et que faire quand un contact n'apparaît pas. Toutes les captures utilisent des **données fictives** : les personnes, les établissements, les adresses et les numéros sont inventés.

Pages liées : [README](../README.md), [sécurité et confidentialité](securite.md), [maintenance des données](maintenance.md), [documentation développeur](developpeurs.md).

## Sommaire

- [L'annuaire en bref](#lannuaire-en-bref)
- [Découvrir l'écran](#découvrir-lécran)
- [Lire une carte](#lire-une-carte)
- [Rechercher une personne](#rechercher-une-personne)
- [Filtrer](#filtrer), dont [Domaines et compétences](#domaines-et-compétences)
- [Gagner du temps : cliquer sur une carte](#gagner-du-temps--cliquer-sur-une-carte)
- [Fondateurs et Partenaires](#fondateurs-et-partenaires)
- [Réinitialiser](#réinitialiser)
- [Pourquoi une personne n'apparaît-elle pas ?](#pourquoi-une-personne-napparaît-elle-pas-)
- [Messages du bandeau rouge](#messages-du-bandeau-rouge)
- [Questions fréquentes](#questions-fréquentes)

## L'annuaire en bref

L'annuaire rassemble les accompagnateurs de l'innovation du PUI (Pôle universitaire d'innovation) de Bordeaux. Sa promesse : *pas de mauvaise porte, toujours le bon interlocuteur*.

- Chaque personne est une **carte** : coordonnées, établissement, et tout ce à quoi elle participe (instances, actions, GT, communautés, tâches, compétences, rôle).
- On retrouve quelqu'un par son **nom**, ou par ce qu'il fait grâce aux **filtres**.
- L'annuaire s'ouvre dans Grist, sur un **écran d'ordinateur** : il n'est pas prévu pour un téléphone.
- Il est en **lecture seule** : on n'y modifie rien. Pour corriger ou compléter une information, adressez-vous à la personne qui administre les données dans Grist.

## Découvrir l'écran

![Vue d'ensemble de l'annuaire : en-tête, barre de recherche, huit filtres, interrupteurs Fondateurs et Partenaires, bouton Réinitialiser et cartes de contact](images/apercu.png)

| Élément | À quoi il sert |
|---|---|
| **Compteur** (en haut à droite, « 14 contacts ») | Indique combien de cartes sont affichées avec la recherche et les filtres actuels |
| **Rechercher par nom ou prénom** | Cherche une personne par son nom ou son prénom |
| **Actions, Tâches, Communautés, GT, Domaines, Compétences, Instances, Établissement** | Huit filtres : chaque bouton ouvre un menu de valeurs à cocher |
| **Fondateurs / Partenaires** | Choisit les établissements affichés, selon leur statut |
| **Réinitialiser** | Efface la recherche et décoche tous les filtres |
| **Cartes** | Une carte par personne, trois par ligne |

## Lire une carte

![Une carte de contact avec neuf repères numérotés](images/carte-anatomie.png)

1. **Initiales** de la personne.
2. **Nom et prénom.**
3. **Fonction**, si elle est renseignée.
4. **Établissement** (pastille en haut à droite) : un clic filtre sur cet établissement.
5. **Adresse e-mail** : c'est un lien, un clic ouvre un nouveau message dans votre messagerie si votre navigateur le permet. Une adresse saisie sous une forme inhabituelle (plusieurs destinataires, paramètres) reste affichée en texte, sans lien.
6. **Téléphone**, s'il est renseigné, présenté par paires de chiffres.
7. **Titres de section** : Instances, Actions, GT, Compétences, Communautés, Tâches, Rôle PUI. Une section n'apparaît que si la personne y a au moins une valeur.
8. **Étiquettes colorées** : un clic filtre sur cette valeur (voir [Gagner du temps](#gagner-du-temps--cliquer-sur-une-carte)).
9. **Rôle PUI** : affiché, mais sans filtre associé, donc non cliquable.

Une information absente n'est pas remplacée par une ligne vide : elle n'apparaît simplement pas. Les **domaines** de compétences ne figurent pas sur la carte, qui garde le détail des compétences : ils servent à filtrer (voir [Domaines et compétences](#domaines-et-compétences)).

## Rechercher une personne

Tapez dans **Rechercher par nom ou prénom…** : les cartes se mettent à jour à chaque lettre.

![Recherche « elise » : une seule carte, Élise Marchetti](images/recherche.png)

- La recherche ignore les **majuscules** et les **accents** : « elise » trouve « Élise ».
- Elle porte sur le nom et le prénom, pas sur la fonction ni sur l'établissement (pour ceux-là, utilisez les filtres).
- Elle se combine avec les filtres : seules les personnes qui satisfont les deux restent affichées.
- **Réinitialiser** vide le champ.

## Filtrer

Un clic sur un bouton de filtre ouvre son menu ; ouvrir un menu referme les autres, et un clic en dehors le referme.

![Menu du filtre Domaines ouvert : champ de recherche, options à cocher et nombre de cartes à droite de chaque option](images/filtre-menu.png)

- **Cochez** une ou plusieurs valeurs : les cartes se mettent à jour immédiatement.
- Dans un **même** menu, les valeurs s'additionnent (**ou**) : cocher deux instances affiche les personnes qui sont dans l'une *ou* l'autre.
- Entre **plusieurs** menus, les critères se cumulent (**et**) : une instance et un établissement ne gardent que les personnes qui ont les deux.
- Le **nombre à droite** de chaque option est le nombre de cartes que vous obtiendriez en la cochant, compte tenu de tout le reste.
- Le **champ de recherche** en haut du menu réduit la liste d'options (sans accents ni majuscules). Il ne coche rien.
- Les valeurs cochées **remontent en tête** du menu, et un **chiffre** sur le bouton indique combien de valeurs sont cochées.

![Communautés Santé numérique et Établissement CHD cochés : trois contacts](images/filtres-combines.png)

Ici, « Communautés › Santé numérique » **et** « Établissement › CHD » sont cochés : seules les trois personnes du CHD qui font partie de la communauté Santé numérique restent affichées, et le compteur passe à « 3 contacts ».

### Domaines et compétences

Le filtre **Domaines** regroupe les compétences par domaine (on parle aussi de *compétences macro*). Cochez un domaine pour voir toutes les personnes qui ont **au moins une compétence** dans ce domaine, sans avoir à connaître chacune d'elles. Cochez plusieurs domaines : les valeurs s'additionnent (**ou**), comme dans tout menu.

![Domaine Recherche clinique coché et menu Compétences ouvert : deux contacts, et un compteur à 0 pour les compétences d'autres domaines](images/filtre-domaines.png)

Le filtre **Compétences** reste disponible pour affiner. Ici, « Domaines › Recherche clinique » est coché : deux personnes restent affichées, et le menu Compétences compte, pour chaque compétence, les personnes **de ce domaine** qui l'ont. Cocher « Essais cliniques » garde alors celles du domaine qui ont cette compétence.

Une compétence dont le domaine n'est pas renseigné dans Grist est rangée sous **Autres** : ses personnes restent ainsi trouvables.

## Gagner du temps : cliquer sur une carte

Cliquer sur une étiquette de carte ou sur la pastille d'établissement **coche le filtre correspondant** ; cliquer à nouveau le décoche. C'est le même résultat que cocher la case dans le menu, sans l'ouvrir.

Seul le **Rôle PUI** n'est pas cliquable : il s'affiche mais n'a pas de filtre.

## Fondateurs et Partenaires

Deux interrupteurs choisissent les établissements dont les contacts sont affichés, selon leur statut.

![Interrupteur Partenaires activé et Fondateurs désactivé : seuls les contacts d'établissements partenaires s'affichent](images/partenaires.png)

- Au départ, **Fondateurs** est activé et **Partenaires** ne l'est pas : vous voyez les personnes des établissements fondateurs.
- Activez **Partenaires** pour ajouter celles des établissements partenaires. Désactivez **Fondateurs** pour ne voir que les partenaires.
- Si vous désactivez les deux, aucune carte ne s'affiche : réactivez-en au moins un.
- **Réinitialiser** ne touche pas à ces interrupteurs : votre choix est conservé jusqu'à ce que vous le changiez.

## Réinitialiser

Le bouton **Réinitialiser** efface la recherche, décoche tous les filtres et vide les champs de recherche des menus. Il laisse en l'état les interrupteurs Fondateurs et Partenaires.

Quand rien ne correspond, l'annuaire affiche « Aucun contact trouvé » : modifiez la recherche, ou réinitialisez.

![État vide : « Aucun contact trouvé. Modifiez votre recherche ou réinitialisez les filtres. »](images/etat-vide.png)

## Pourquoi une personne n'apparaît-elle pas ?

**D'abord, côté écran**

1. Une **recherche** ou un **filtre** est actif : cliquez sur **Réinitialiser**.
2. L'interrupteur qui correspond au statut de son établissement est **désactivé** : vérifiez Fondateurs et Partenaires.
3. Le nom est mal orthographié (les accents et les majuscules, eux, sont sans effet).
4. La donnée vient d'être modifiée dans Grist, dans une table autre que la liste des contacts (par exemple la validation d'un établissement) : **rechargez le widget**. Grist ne le prévient que des changements de la liste des contacts.

**Ensuite, côté données**, à transmettre à la personne qui administre l'annuaire. Une personne n'est affichée que si **toutes** ces conditions sont réunies :

- elle a un **nom ou un prénom** ;
- elle a au moins une valeur de **périmètre** (colonne `perimetre`) ;
- elle est rattachée à un établissement (colonne `Etablissement`, qui renvoie à une ligne de la table `Etablissements`) ;
- cet établissement a **validé** son apparition (`ok_pour_apparaitre` coché) ;
- cet établissement est **fondateur ou partenaire**, jamais « autres ».

Quelques cas, avec des personnes fictives du jeu de démonstration :

| Personne fictive | Situation | Résultat |
|---|---|---|
| Sarah Colin | Établissement fondateur qui n'a pas validé son apparition | Jamais affichée |
| Gabriel Noël | Établissement de statut « autres » | Jamais affiché |
| Alice Bertin | Aucun établissement renseigné | Jamais affichée |
| Victor Lambert | Aucun périmètre renseigné | Jamais affiché |
| Clara Dubois | Établissement partenaire validé | Affichée seulement avec l'interrupteur Partenaires |

La page [maintenance](maintenance.md#pourquoi-un-contact-est-visible-ou-non) détaille ces règles pour l'administrateur des données.

## Messages du bandeau rouge

Un bandeau rouge apparaît sous la barre d'outils quand l'annuaire n'a pas pu être lu entièrement. Son but : qu'un annuaire incomplet ne soit jamais pris pour un annuaire vide.

![Bandeau « Impossible de charger l'annuaire depuis Grist » et compteur « Chargement impossible »](images/bandeau-panne.png)

![Bandeau « Tables illisibles (Actions) » avec les cartes toujours affichées](images/bandeau-donnees-partielles.png)

| Message | Signification | Que faire |
|---|---|---|
| « Impossible de charger l'annuaire depuis Grist (table « … » illisible) » ou « colonne « … » absente » | Une donnée indispensable n'a pas pu être lue. Les cartes déjà affichées restent en place | Rechargez la page. Si le message persiste, notez-le et transmettez-le à l'administrateur |
| « Tables illisibles (…) : des libellés ou des tags peuvent manquer » | Les cartes s'affichent, mais certaines étiquettes ou valeurs de filtre peuvent manquer | Rechargez la page, puis prévenez l'administrateur si le message revient |
| « Colonne de libellé introuvable : … Les tags et le filtre correspondants restent vides » | Une table de référence se lit, mais la colonne qui porte les libellés n'existe plus (renommée ou supprimée) | À corriger dans Grist par l'administrateur |
| « Acronymes en double dans Etablissements (…) avec des statuts différents » | Cas rare : deux établissements portent le même acronyme avec des statuts contradictoires et Grist a transmis l'établissement sous forme de texte. Leurs contacts sont masqués | À corriger dans Grist par l'administrateur |
| « perimetre est vide… », « Etablissement est vide… », « Aucun contact affichable… » | Les données sont présentes mais aucune ne remplit les conditions d'affichage | À vérifier dans Grist par l'administrateur |

Le bandeau ne signale pas « aucun résultat pour ma recherche » : c'est le rôle de l'écran « Aucun contact trouvé ».

## Questions fréquentes

**Puis-je modifier une fiche ?**
Non, l'annuaire est en lecture seule. Les corrections se font dans Grist, par la personne qui administre les données.

**D'où viennent les informations ?**
D'un document Grist, qui sert de base de données à l'annuaire. Le widget n'enregistre rien dans votre navigateur.

**J'ai changé une information dans Grist et je ne la vois pas.**
Une modification de la liste des contacts apparaît d'elle-même, après un court instant. Une modification d'une autre table (établissements, valeurs des listes de filtres) demande de **recharger** le widget.

**Le téléphone ou la fonction d'une personne ne s'affiche pas.**
Ils ne s'affichent que s'ils sont renseignés dans Grist.

**Puis-je utiliser l'annuaire sur mon téléphone ?**
Il est conçu pour un écran d'ordinateur (largeur minimale de 980 pixels) : sur un petit écran, la mise en page n'est pas adaptée.

**Mes coordonnées sont-elles visibles par tout le monde ?**
L'annuaire n'affiche une personne que si son établissement a validé son apparition et est fondateur ou partenaire. Il est visible par les personnes qui ont accès à la page Grist qui l'héberge ; les droits d'accès au document lui-même se gèrent dans Grist. Voir [sécurité et confidentialité](securite.md).
