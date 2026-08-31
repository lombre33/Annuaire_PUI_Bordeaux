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
  * 4 filtres pour les intances, actions, GT et communauté



Tech : Custom Widget Grist, via hébergement sur GitHub et servi via url (tout s'exécute dans l'instance Grist) et l'api grist est appelée dans le html avant les scripts du plugin. 

HTML/CSS/JS natif.

Le nom et le type des colonnes sont disponibles dans le fichier girst_structure.txt

Les colonnes périmètres ne sont pas à utiliser, elles ont uniquement servi lors d'un précédant important.
