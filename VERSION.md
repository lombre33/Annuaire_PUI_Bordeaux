# Version 1.15.0 — Les tâches rangées par action dans le menu Tâches (voir CHANGELOG.md)

Le widget lit la table `BDD` (1.8.0), range les compétences par domaine dans un seul
menu « Compétences » (un filtre « Domaines » séparé en 1.9.0, intégré à ce menu en
1.13.0) et les tâches par action dans le menu « Tâches » d'après leur numéro (1.15.0),
s'adapte à la largeur de son cadre (1.9.1), n'affiche que les personnes qui ont
accepté d'apparaître (1.10.0), laisse la personne connectée, identifiée par son
adresse e-mail, choisir d'apparaître ou non (1.11.0), puis modifier sa fiche (celle
de n'importe qui pour un administrateur) directement, après une relecture de la carte
avant et après (1.12.0, réglages dans `GRIST_SETUP.md`), et affiche les logos des
établissements, des financeurs et des fondateurs, des pièces jointes du document lues
avec un jeton d'accès en lecture seule (1.14.0, facultatif, étape 5 de `GRIST_SETUP.md`).
566 tests (dont 189 dans un vrai navigateur, optionnels sans Playwright).
