Cahier des charges



UI/UX : Une UI/UX moderne, colorée et agréable à la navigation sur PC. Le widget s'adapte aussi à la largeur de son cadre Grist (demande d'Antoine du 12/10/2026, 1.9.1) : utilisable sans défilement horizontal de 320px de large (téléphone, panneau étroit) à un grand écran, la mise en page « PC » restant celle de référence à partir de 1400px. Accessible au clavier et aux lecteurs d'écran (audit UI/UX du 12/10/2026, 1.14.1) : chaque contrôle a un nom et un anneau de focus violet le désigne quand on tabule. Lisible à la souris comme au doigt (audit UI/UX, 1.17.1) : le texte des cartes fait 12px au moins et les pastilles 24px de haut au moins. Le bandeau « Ma présence » reste lisible dans un cadre étroit (audit UI/UX, 1.17.2) : son texte garde 200px au moins, l'interrupteur passe dessous au lieu de le serrer.



objectifs  : Proposer Annuaire efficace pour retrouver les membres du pui et avoir des filtres pertinents.



L'ensemble des données sont présentes dans le grist qui sert de base de donnée et d'api back-end. 



Features

* Carte
  * Avatar (1.19.0) : la photo de profil de la personne quand elle en a ajouté une (colonne Avatar de BDD, une pièce jointe), sinon les initiales de la personne joliment indiquées dans une bulle. Un clic sur la photo l'agrandit. Avant la 1.19.0, il n'y avait que les initiales.
  * Nom Prénom 
  * Fonction (si renseignée, vide sinon)
  * Établissement : son logo, seul (son nom ne s'affiche, dans une pastille, que si Grist n'a pas de logo pour lui) (1.14.0)
  *  Email
  *  Tel si renseigné
  *  Les Instances, Actions, GT, communautés Role dans le PUI auxquelles la personne fait partie (le cas échéant)
  * Le rôle de la personne dans une tâche (colonne facultative Taches_role de la table Taches ; demande d'Antoine du 13/10/2026, 1.26.0) : dit au survol de l'étiquette de la tâche, à la souris et au clavier, et écrit sous le nom de la tâche sur un téléphone. Il se lit sur les lignes brutes de Taches que BDD.Taches désigne pour la personne, pas sur le libellé corrigé ; sans rôle, rien ne s'affiche.
* En-tête et pied de page (décisions d'Antoine du 12/10/2026, 1.14.0) : le PUI est le consortium de tous ses établissements fondateurs et n'a pas d'identité graphique propre, ce sont leurs logos qui l'habillent.
  * Un seul bandeau d'en-tête, pour limiter la place prise : le titre en haut à gauche, les financeurs (ANR, France 2030…) discrets au centre, la zone du profil à droite.
  * Un bandeau tout en bas avec les logos des établissements fondateurs, dans l'ordre et à la position du bandeau fourni par le PUI, fermé par le rond « France 2030 » et la phrase de financement.
  * Les logos sont stockés dans le document Grist (pièces jointes), jamais dans le dépôt, et sont facultatifs : sans eux, les noms s'affichent.
* Filtres
  * Un champ de texte libre qui recherche sur le prénom et le nom (1.16.1) : chaque mot tapé doit se trouver dans « prénom nom », dans n'importe quel ordre (« élise marchetti » comme « marchetti élise ») ; les accents, les majuscules, les tirets, les apostrophes et les points ne comptent pas. Il ne porte ni sur la fonction ni sur l'établissement (c'est le filtre Établissement).
  * Les cartes sont triées par nom de famille puis par prénom, dans l'ordre alphabétique français (1.16.1).
  * 8 filtres : instances, actions, GT, tâches, compétences, communautés, établissement et rôle dans le PUI (demande d'Antoine du 13/10/2026, 1.24.0). Le menu « Rôle PUI » liste les valeurs de la table Role_Dans_le_PUI (colonne Role) ; le rôle d'une personne s'affiche sur sa carte en petite pastille (à droite sous le logo sur une carte large, sous l'e-mail sur une carte étroite, 1.25.1), et un clic dessus coche ce filtre.
  * Les valeurs des filtres, les tags des cartes et les listes de la fenêtre de modification sont les libellés corrigés des tables de référence (Actions_corrigees, Taches_corrige, GT_corrige, communautes_corrigees, Competences_corrigees, Instances_Corrigees), à chaque fois (demande d'Antoine du 13/10/2026, 1.22.0) : dès qu'une table remplit au moins un libellé corrigé, une ligne qui n'en a pas n'apparaît pas ; une table qui n'en remplit aucun garde ses libellés bruts. Plusieurs lignes brutes de même libellé corrigé ne forment qu'une valeur.
  * Le menu « Compétences » range les compétences par domaine (les compétences macro, colonne Macro_competences de la table Competences) et se cherche à deux niveaux (décision d'Antoine du 12/10/2026, 1.13.0 ; il n'y a plus de filtre « Domaines » à part, qui existait en 1.9.0) : cocher un domaine coche toutes ses compétences, la flèche d'un domaine déplie le détail, et le champ de recherche du menu trouve un domaine comme une compétence. Il n'y a qu'une sélection, faite de compétences : tout est un OU dans le menu. Les cartes ne changent pas.
  * Le menu « Tâches » range les tâches par action, de la même façon (demande d'Antoine du 12/10/2026, 1.16.0) : cocher une action coche toutes ses tâches, la flèche d'une action déplie le détail, et le champ de recherche du menu trouve une action comme une tâche. L'action d'une tâche n'est pas une colonne : c'est le numéro avant le point du libellé de la tâche (« 1.3 … » est une tâche de l'action 1, dont le libellé commence par « Action 1 »). Une tâche sans numéro, ou sans action de ce numéro, est rangée sous « Sans action ». Le filtre Actions ne change pas. Les cartes ne changent pas.
  * Le périmètre ne décide plus de rien (demande d'Antoine du 13/10/2026, 1.27.0). La règle d'origine n'affichait que les contacts ayant au moins une valeur dans la colonne perimetre de la table BDD (même si nous n'avions pas clairement les périmètres, la colonne ne servait qu'à cela) ; elle masquait une fiche tout juste créée par la personne, qui ne peut pas écrire le périmètre. Une fiche s'affiche désormais dès que la personne a accepté d'apparaître et que son établissement est validé, fondateur ou partenaire ; la colonne perimetre n'est plus lue ni demandée.
  * Consentement individuel : un contact n'apparaît que si la personne a accepté d'apparaître (colonne Accepte_apparaitre de BDD, une case à cocher). Seul « coché » vaut accord ; une case vide ou décochée masque la personne. Ce consentement s'ajoute aux règles ci-dessous, il ne les remplace pas.
  * « Ma présence » : la personne connectée à Grist (identifiée par l'adresse e-mail de sa ligne de BDD) voit en haut de l'annuaire si elle apparaît et peut changer son accord d'un clic (colonne Accepte_apparaitre). C'est un verrou d'interface : seules les règles d'accès de Grist protègent vraiment les données (voir GRIST_SETUP.md).
  * Modifier sa fiche (décision d'Antoine du 12/10/2026, 1.12.0) : la personne connectée peut modifier sa propre fiche (bouton « Modifier » de sa carte ou du bandeau). Les modifications s'appliquent directement : aucune validation par un administrateur, aucun historique, aucune table créée par le widget. Avant d'enregistrer, une fenêtre de relecture montre la carte avant et la carte après, les changements étant repérés dans la carte « après », avec un bouton pour valider ; la fenêtre se ferme ensuite et un message confirme l'enregistrement. Sont modifiables : prénom, nom, fonction, téléphone, rôle dans le PUI, instances, actions, GT, compétences, communautés et tâches, et, depuis la 1.19.0, la photo de profil. Ne le sont jamais sur sa propre fiche : l'adresse e-mail, l'établissement, le périmètre et le choix de présence (qui a son propre interrupteur). L'aspect de la fenêtre, de la relecture et des repères est celui de la maquette v5 que l'auteur a validée le 12/10/2026.
  * Mode admin (1.15.0) : un administrateur (case admin de la table ACL) allume, dans le bandeau « Ma présence », un interrupteur « Mode admin » (éteint à chaque ouverture) qui ajoute un bouton « Modifier la fiche » sur toutes les cartes affichées. Il modifie alors la fiche de n'importe qui, avec la même relecture avant/après, et peut changer son adresse e-mail et son établissement (la relecture prévient que la table ACL ne suit pas un changement d'adresse, et qu'une fiche déplacée dans un établissement qui n'a pas validé sa présence quitte l'annuaire). Le périmètre et le choix de présence d'une personne ne se changent toujours pas depuis le widget.
  * Fiche d'un établissement (1.17.0) : un responsable d'établissement (une ligne de la table ACL qui porte son adresse et son établissement) modifie la fiche de son établissement depuis l'annuaire, par le bouton « Modifier » sous le logo de l'établissement sur les cartes ou par « Mon établissement » dans le bandeau « Ma présence ». Il change le logo (le fichier choisi est redessiné en PNG puis ajouté aux pièces jointes du document Grist), le nom complet, la visibilité dans l'annuaire (colonne ok_pour_apparaitre) et la liste des responsables, qu'il complète ou réduit (un établissement garde toujours au moins un responsable ; le widget n'écrit jamais la colonne admin). Comme pour une fiche personnelle, les modifications s'appliquent directement, sans validation par un administrateur et sans historique, aucune table n'est créée ; contrairement à elle, il n'y a pas de fenêtre de relecture avant/après : le bas de la fenêtre résume les changements et un clic sur Enregistrer écrit tout en une seule action Grist. Le sigle, le statut (fondateur, partenaire, autres) et l'ordre du bandeau ne se modifient pas depuis le widget. L'aspect est celui des écrans D0 et D1 de la maquette v5 que l'auteur a validée le 12/10/2026.
  * Photo de profil (demande d'Antoine du 12/10/2026, 1.19.0) : la colonne Avatar de BDD (type Pièces jointes, facultative) porte la photo de la personne. Elle remplace les initiales sur la carte, dans le bandeau « Ma présence » et dans les fenêtres, et s'agrandit au clic, avec le nom, la fonction et l'établissement. La personne l'ajoute, la change ou la retire dans la fenêtre de modification de sa fiche (un administrateur en mode admin, celle d'une autre personne), avec la même relecture avant/après : la carte « Après » repère la photo ajoutée, modifiée ou retirée. Le navigateur recadre la photo en carré, la ramène à 256 px et en fait un JPEG avant de l'envoyer à Grist (JPG, PNG ou WebP, 2 Mo au plus avant redessin) ; elle est facultative et n'est affichée que si la fiche apparaît. Retirer ou remplacer une photo ne supprime pas l'ancien fichier, que le widget ne sait pas supprimer. Sans la colonne, le widget fonctionne comme avant. L'aspect est celui de la maquette v5 que l'auteur a validée le 12/10/2026.
  * Visibilité par établissement (table Etablissements, colonnes booléennes fondateur / partenaire / autres / ok_pour_apparaitre) :
    * Un contact n'apparaît que si son établissement est fondateur OU partenaire — jamais si "autres" (ni l'un ni l'autre).
    * Dans tous les cas, l'établissement doit avoir validé (ok_pour_apparaitre = true), sans quoi ses contacts n'apparaissent jamais.
    * Interrupteurs "Fondateurs" / "Partenaires" dans l'UI pour affiner l'affichage parmi les contacts déjà éligibles ci-dessus : Fondateurs coché par défaut, Partenaires décoché (depuis la 1.7.0).




Tech : Custom Widget Grist, via hébergement sur GitHub et servi via url (tout s'exécute dans l'instance Grist) et l'api grist est appelée dans le html avant les scripts du plugin. 

HTML/CSS/JS natif.

Le nom et le type des colonnes sont disponibles dans le fichier grist_structure.txt

L'ancienne table Annuaire et ses colonnes perimetre_1 à perimetre_25 ne sont plus utilisées : elles ont uniquement servi lors d'un précédent import. La table principale est BDD.
