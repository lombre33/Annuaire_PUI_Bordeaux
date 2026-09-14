Cahier des charges



UI/UX : Une UI/UX moderne, colorée et agréable à la navigation sur PC. Pas de responsive.



objectifs  : Proposer Annuaire efficace pour retrouver les membres du pui et avoir des filtres pertinents.



L'ensemble des donnnées sont présentes dans le grist qui sert de base de donnée et d'api back-end. 



Features

* Carte
  * Avatar : Pas d'avatar mais à la rigueur les initiales de la personne joliment indiquées dans une bulle. 
  * Nom Prénom 
  * Fonction (si renseignée, vide sinon)
  * Établissement
  *  Email
  *  Tel si renseigné
  *  Les Instances, Actions, GT, communautés Role dans le PUI auxquelles la personne fait partie (le cas échéant)
* Filtres
  * Un champs de texte libre qui recherche sur le nom prénom
  * 6 filtres pour les instances, actions, GT, Taches compétances et communauté
  * Nous n'afficherons QUE les contacts ayant au moins une valeur dans perimètre_all (meme si nous n'avons pas clairement les périmètre la colones sert juste à cela)
  * Visibilité par établissement (table Etablissements, colonnes booléennes fondateur / partenaire / autres / ok_pour_apparaitre) :
    * Un contact n'apparaît que si son établissement est fondateur OU partenaire — jamais si "autres" (ni l'un ni l'autre).
    * Dans tous les cas, l'établissement doit avoir validé (ok_pour_apparaitre = true), sans quoi ses contacts n'apparaissent jamais.
    * Interrupteurs "Fondateurs" / "Partenaires" dans l'UI (cochés par défaut) pour affiner l'affichage parmi les contacts déjà éligibles ci-dessus.




Tech : Custom Widget Grist, via hébergement sur GitHub et servi via url (tout s'exécute dans l'instance Grist) et l'api grist est appelée dans le html avant les scripts du plugin. 

HTML/CSS/JS natif.

Le nom et le type des colonnes sont disponibles dans le fichier girst_structure.txt

Les colonnes périmètres ne sont pas à utiliser, elles ont uniquement servi lors d'un précédant important.
