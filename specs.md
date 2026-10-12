Cahier des charges



UI/UX : Une UI/UX moderne, colorée et agréable à la navigation sur PC. Le widget s'adapte aussi à la largeur de son cadre Grist (demande d'Antoine du 12/10/2026, 1.9.1) : utilisable sans défilement horizontal de 320px de large (téléphone, panneau étroit) à un grand écran, la mise en page « PC » restant celle de référence à partir de 1400px.



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
  * Un filtre « Domaines » (les compétences macro, colonne Macro_competences de la table Competences) placé avant « Compétences » : il garde les contacts qui ont au moins une compétence dans l'un des domaines cochés, et se combine avec le détail des compétences. Les cartes ne changent pas.
  * Nous n'afficherons QUE les contacts ayant au moins une valeur dans la colonne perimetre de la table BDD (même si nous n'avons pas clairement les périmètres, la colonne sert juste à cela)
  * Consentement individuel : un contact n'apparaît que si la personne a accepté d'apparaître (colonne Accepte_apparaitre de BDD, une case à cocher). Seul « coché » vaut accord ; une case vide ou décochée masque la personne. Ce consentement s'ajoute aux règles ci-dessous, il ne les remplace pas.
  * Visibilité par établissement (table Etablissements, colonnes booléennes fondateur / partenaire / autres / ok_pour_apparaitre) :
    * Un contact n'apparaît que si son établissement est fondateur OU partenaire — jamais si "autres" (ni l'un ni l'autre).
    * Dans tous les cas, l'établissement doit avoir validé (ok_pour_apparaitre = true), sans quoi ses contacts n'apparaissent jamais.
    * Interrupteurs "Fondateurs" / "Partenaires" dans l'UI pour affiner l'affichage parmi les contacts déjà éligibles ci-dessus : Fondateurs coché par défaut, Partenaires décoché (depuis la 1.7.0).




Tech : Custom Widget Grist, via hébergement sur GitHub et servi via url (tout s'exécute dans l'instance Grist) et l'api grist est appelée dans le html avant les scripts du plugin. 

HTML/CSS/JS natif.

Le nom et le type des colonnes sont disponibles dans le fichier grist_structure.txt

L'ancienne table Annuaire et ses colonnes perimetre_1 à perimetre_25 ne sont plus utilisées : elles ont uniquement servi lors d'un précédent import. La table principale est BDD.
