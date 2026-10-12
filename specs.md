Cahier des charges



UI/UX : Une UI/UX moderne, colorée et agréable à la navigation sur PC. Le widget s'adapte aussi à la largeur de son cadre Grist (demande d'Antoine du 12/10/2026, 1.9.1) : utilisable sans défilement horizontal de 320px de large (téléphone, panneau étroit) à un grand écran, la mise en page « PC » restant celle de référence à partir de 1400px. Accessible au clavier et aux lecteurs d'écran (audit UI/UX du 12/10/2026, 1.14.1) : chaque contrôle a un nom et un anneau de focus violet le désigne quand on tabule.



objectifs  : Proposer Annuaire efficace pour retrouver les membres du pui et avoir des filtres pertinents.



L'ensemble des donnnées sont présentes dans le grist qui sert de base de donnée et d'api back-end. 



Features

* Carte
  * Avatar : Pas d'avatar mais à la rigueur les initiales de la personne joliment indiquées dans une bulle. 
  * Nom Prénom 
  * Fonction (si renseignée, vide sinon)
  * Établissement : son logo, seul (son nom ne s'affiche, dans une pastille, que si Grist n'a pas de logo pour lui) (1.14.0)
  *  Email
  *  Tel si renseigné
  *  Les Instances, Actions, GT, communautés Role dans le PUI auxquelles la personne fait partie (le cas échéant)
* En-tête et pied de page (décisions d'Antoine du 12/10/2026, 1.14.0) : le PUI est le consortium de tous ses établissements fondateurs et n'a pas d'identité graphique propre, ce sont leurs logos qui l'habillent.
  * Un seul bandeau d'en-tête, pour limiter la place prise : le titre en haut à gauche, les financeurs (ANR, France 2030…) discrets au centre, la zone du profil à droite.
  * Un bandeau tout en bas avec les logos des établissements fondateurs, dans l'ordre et à la position du bandeau fourni par le PUI, fermé par le rond « France 2030 » et la phrase de financement.
  * Les logos sont stockés dans le document Grist (pièces jointes), jamais dans le dépôt, et sont facultatifs : sans eux, les noms s'affichent.
* Filtres
  * Un champs de texte libre qui recherche sur le nom prénom
  * 6 filtres pour les instances, actions, GT, Taches compétances et communauté
  * Le menu « Compétences » range les compétences par domaine (les compétences macro, colonne Macro_competences de la table Competences) et se cherche à deux niveaux (décision d'Antoine du 12/10/2026, 1.13.0 ; il n'y a plus de filtre « Domaines » à part, qui existait en 1.9.0) : cocher un domaine coche toutes ses compétences, la flèche d'un domaine déplie le détail, et le champ de recherche du menu trouve un domaine comme une compétence. Il n'y a qu'une sélection, faite de compétences : tout est un OU dans le menu. Les cartes ne changent pas.
  * Nous n'afficherons QUE les contacts ayant au moins une valeur dans la colonne perimetre de la table BDD (même si nous n'avons pas clairement les périmètres, la colonne sert juste à cela)
  * Consentement individuel : un contact n'apparaît que si la personne a accepté d'apparaître (colonne Accepte_apparaitre de BDD, une case à cocher). Seul « coché » vaut accord ; une case vide ou décochée masque la personne. Ce consentement s'ajoute aux règles ci-dessous, il ne les remplace pas.
  * « Ma présence » : la personne connectée à Grist (identifiée par l'adresse e-mail de sa ligne de BDD) voit en haut de l'annuaire si elle apparaît et peut changer son accord d'un clic (colonne Accepte_apparaitre). C'est un verrou d'interface : seules les règles d'accès de Grist protègent vraiment les données (voir GRIST_SETUP.md).
  * Modifier sa fiche (décision d'Antoine du 12/10/2026, 1.12.0) : la personne connectée peut modifier sa propre fiche (bouton « Modifier » de sa carte ou du bandeau). Les modifications s'appliquent directement : aucune validation par un administrateur, aucun historique, aucune table créée par le widget. Avant d'enregistrer, une fenêtre de relecture montre la carte avant et la carte après, les changements étant repérés dans la carte « après », avec un bouton pour valider ; la fenêtre se ferme ensuite et un message confirme l'enregistrement. Sont modifiables : prénom, nom, fonction, téléphone, rôle dans le PUI, instances, actions, GT, compétences, communautés et tâches. Ne le sont jamais sur sa propre fiche : l'adresse e-mail, l'établissement, le périmètre et le choix de présence (qui a son propre interrupteur). L'aspect de la fenêtre, de la relecture et des repères est celui de la maquette v5 que l'auteur a validée le 12/10/2026.
  * Mode admin (1.15.0) : un administrateur (case admin de la table ACL) allume, dans le bandeau « Ma présence », un interrupteur « Mode admin » (éteint à chaque ouverture) qui ajoute un bouton « Modifier la fiche » sur toutes les cartes affichées. Il modifie alors la fiche de n'importe qui, avec la même relecture avant/après, et peut changer son adresse e-mail et son établissement (la relecture prévient que la table ACL ne suit pas un changement d'adresse, et qu'une fiche déplacée dans un établissement qui n'a pas validé sa présence quitte l'annuaire). Le périmètre et le choix de présence d'une personne ne se changent toujours pas depuis le widget.
  * Fiche d'un établissement (1.17.0) : un responsable d'établissement (une ligne de la table ACL qui porte son adresse et son établissement) modifie la fiche de son établissement depuis l'annuaire, par le bouton « Modifier » sous le logo de l'établissement sur les cartes ou par « Mon établissement » dans le bandeau « Ma présence ». Il change le logo (le fichier choisi est redessiné en PNG puis ajouté aux pièces jointes du document Grist), le nom complet, la visibilité dans l'annuaire (colonne ok_pour_apparaitre) et la liste des responsables, qu'il complète ou réduit (un établissement garde toujours au moins un responsable ; le widget n'écrit jamais la colonne admin). Comme pour une fiche personnelle, les modifications s'appliquent directement, sans validation par un administrateur et sans historique, aucune table n'est créée ; contrairement à elle, il n'y a pas de fenêtre de relecture avant/après : le bas de la fenêtre résume les changements et un clic sur Enregistrer écrit tout en une seule action Grist. Le sigle, le statut (fondateur, partenaire, autres) et l'ordre du bandeau ne se modifient pas depuis le widget. L'aspect est celui des écrans D0 et D1 de la maquette v5 que l'auteur a validée le 12/10/2026.
  * Visibilité par établissement (table Etablissements, colonnes booléennes fondateur / partenaire / autres / ok_pour_apparaitre) :
    * Un contact n'apparaît que si son établissement est fondateur OU partenaire — jamais si "autres" (ni l'un ni l'autre).
    * Dans tous les cas, l'établissement doit avoir validé (ok_pour_apparaitre = true), sans quoi ses contacts n'apparaissent jamais.
    * Interrupteurs "Fondateurs" / "Partenaires" dans l'UI pour affiner l'affichage parmi les contacts déjà éligibles ci-dessus : Fondateurs coché par défaut, Partenaires décoché (depuis la 1.7.0).




Tech : Custom Widget Grist, via hébergement sur GitHub et servi via url (tout s'exécute dans l'instance Grist) et l'api grist est appelée dans le html avant les scripts du plugin. 

HTML/CSS/JS natif.

Le nom et le type des colonnes sont disponibles dans le fichier grist_structure.txt

L'ancienne table Annuaire et ses colonnes perimetre_1 à perimetre_25 ne sont plus utilisées : elles ont uniquement servi lors d'un précédent import. La table principale est BDD.
