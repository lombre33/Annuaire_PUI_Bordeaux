# Version 1.14.0 — Le mode admin, et la modification de fiche fidèle à la maquette (voir CHANGELOG.md)

Le widget lit la table `BDD` (1.8.0), range les compétences par domaine dans un seul
menu « Compétences » (un filtre « Domaines » séparé en 1.9.0, intégré à ce menu en
1.13.0), s'adapte à la largeur de son cadre (1.9.1), n'affiche que les personnes qui ont
accepté d'apparaître (1.10.0), laisse la personne connectée, identifiée par son
adresse e-mail, choisir d'apparaître ou non (1.11.0), puis modifier sa fiche directement,
après une relecture de la carte avant et après (1.12.0, réglages dans `GRIST_SETUP.md`).
Depuis la 1.14.0, un administrateur allume un « mode admin » pour modifier la fiche de
n'importe qui, e-mail et établissement compris, et la fenêtre de modification suit la
maquette validée par Antoine. 453 tests (dont 142 dans un vrai navigateur, optionnels
sans Playwright).
