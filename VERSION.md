# Version 1.17.0 — La fiche d'un établissement, modifiée par son responsable (voir CHANGELOG.md)

Le widget lit la table `BDD` (1.8.0), range les compétences par domaine dans un seul
menu « Compétences » (un filtre « Domaines » séparé en 1.9.0, intégré à ce menu en
1.13.0) et les tâches par action dans le menu « Tâches » d'après leur numéro (1.16.0),
s'adapte à la largeur de son cadre (1.9.1), n'affiche que les personnes qui ont
accepté d'apparaître (1.10.0), laisse la personne connectée, identifiée par son
adresse e-mail, choisir d'apparaître ou non (1.11.0), puis modifier sa fiche directement,
après une relecture de la carte avant et après (1.12.0, réglages dans `GRIST_SETUP.md`),
et affiche les logos des établissements, des financeurs et des fondateurs, des pièces
jointes du document lues avec un jeton d'accès en lecture seule (1.14.0, facultatif,
étape 5 de `GRIST_SETUP.md`). Le champ de recherche a un nom pour les lecteurs d'écran et
un anneau violet montre le contrôle actif au clavier (1.14.1, audit UI/UX). Depuis la
1.15.0, un administrateur allume un « mode admin » pour modifier la fiche de n'importe qui,
e-mail et établissement compris, et la fenêtre de modification suit la maquette validée
par Antoine. Depuis la 1.16.1, les cartes sont triées par nom de famille puis par prénom et
la recherche trouve « prénom nom » dans n'importe quel ordre, tirets, apostrophes et « œ » compris
(audit UI/UX). Depuis la 1.16.2, les pastilles de catégorie, les titres de groupe et le lien e-mail
sont assez foncés pour être lus (4,5:1 au moins avec le blanc, audit UI/UX). Depuis la 1.16.3,
l'interrupteur de présence garde le focus pendant l'écriture, annonce sa réussite aux lecteurs d'écran,
a une piste à 3:1 au moins de son fond et reste lisible en contraste élevé (audit UI/UX).
Depuis la 1.17.0, le responsable d'un établissement (une ligne d'`ACL`) modifie la fiche de son
établissement (logo, nom complet, visibilité, responsables) ; le widget envoie lui-même le fichier
du logo à Grist (réglages dans `GRIST_SETUP.md`, non essayés dans un vrai Grist). 794 tests (dont
277 dans un vrai navigateur, optionnels sans Playwright).
