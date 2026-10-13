# Version 1.21.5 — Envoi d'une photo depuis l'ordinateur : l'en-tête que Grist exige (voir CHANGELOG.md)

Le widget lit la table `BDD` (1.8.0), range les compétences par domaine dans un seul
menu « Compétences » (un filtre « Domaines » séparé en 1.9.0, intégré à ce menu en
1.13.0) et les tâches par action dans le menu « Tâches » d'après leur numéro (1.16.0),
s'adapte à la largeur de son cadre (1.9.1), n'affiche que les personnes qui ont
accepté d'apparaître (1.10.0), laisse la personne connectée, identifiée par son
adresse e-mail, choisir d'apparaître ou non (1.11.0), puis modifier sa fiche directement,
après une relecture de la carte avant et après (1.12.0, réglages dans `GRIST_SETUP.md`),
et affiche les logos des établissements et des fondateurs, des pièces
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
du logo à Grist (réglages dans `GRIST_SETUP.md`, non essayés dans un vrai Grist).
Depuis la 1.17.1, tout le texte des cartes fait 12 px au moins et les pastilles 24 px de haut : les cartes
sont plus hautes d'un tiers environ, un écart voulu avec la maquette v5 (audit UI/UX).
Depuis la 1.17.2, dans un cadre de moins de 860 px, le texte du bandeau « Ma présence » garde 200 px au moins :
l'interrupteur passe dessous au lieu de le serrer, et le bloc des boutons vide ne prend plus de place (audit UI/UX).
Depuis la 1.18.0, une personne que Grist reconnaît mais qui n'a pas de ligne dans `BDD` peut créer sa fiche
(bouton « Créer ma fiche » : une ligne ajoutée à `BDD`, jamais une table ; elle choisit son établissement, son e-mail
est celui de son compte) et choisir une adresse e-mail à afficher sur sa carte à la place de celle de son compte
(colonne facultative `email_affiche`, vidée elle revient à l'adresse du compte).
Depuis la 1.19.0, une personne ajoute, change ou retire sa **photo de profil** (colonne `Avatar` de `BDD`, facultative,
étape 6 de `GRIST_SETUP.md`) : elle remplace les initiales sur la carte, s'agrandit au clic, passe par la relecture avant et après,
et le widget l'envoie lui-même à Grist, redessinée en carré de 256 px (JPEG, sans métadonnées ; envoi et règles d'accès non
essayés dans un vrai Grist).
Depuis la 1.20.0, le widget crée lui-même la table `Annuaire_Sonde` (qui est connecté ?, étape 2 de `GRIST_SETUP.md`)
quand elle manque, avec ses trois colonnes à formule de déclenchement ; c'est la seule table qu'il crée.
Depuis la 1.20.1, le menu « Tâches » range de nouveau les tâches par action quand le libellé des actions commence par un
préfixe entre crochets (« [ PUI ] Action 1: … ») : le préfixe est ignoré pour lire le numéro, et reste dans le libellé affiché.
Depuis la 1.21.0, les financeurs (le visuel de l'en-tête et le rond France 2030 du bandeau du bas) sont deux images fixes du
widget, sans table `Financeurs` dans Grist ; tous les logos des cartes ont la même hauteur (32 px) ; `GRIST_SETUP.md` donne
les deux règles d'accès d'`Annuaire_Sonde` (ajouter, lire et supprimer sa propre ligne, ne rien modifier).
Depuis la 1.21.1, les logos des cartes font 64 px de haut sur une carte d'au moins 380 px de large (48 px dès 330 px, 32 px
en dessous), pour garder la place du nom.
Depuis la 1.21.2, les cases à cocher sont dessinées par la feuille de style (fond blanc, bordure, coche) et le widget impose
son thème clair : plus de carré noir sur Firefox Android.
Depuis la 1.21.3, les boutons et les champs prennent la couleur du texte de la page et le texte d'invite est gris foncé : ce qu'on tape
dans la recherche reste lisible sur Firefox mobile en thème sombre (rejoué dans Chromium en schéma sombre imposé, pas essayé dans Firefox).
Depuis la 1.21.4, les logos des cartes ont tous la même surface visuelle : le widget retire les marges transparentes ou blanches de
chaque logo, puis lui donne 3 200 px² répartis selon ses proportions, dans une case de 104 x 42 px au plus (non essayé dans un vrai Grist :
il lit les pixels des logos, ce que Grist doit autoriser).
Depuis la 1.21.5, l'envoi d'un fichier à Grist (photo de profil, logo d'établissement) porte l'en-tête `X-Requested-With: XMLHttpRequest` que Grist
exige d'une requête qui écrit avec un jeton d'accès : sans lui le navigateur ne montrait qu'une panne de réseau (rejoué dans Chromium contre un vrai
serveur HTTP d'une autre origine ; pas encore essayé dans le vrai Grist d'Antoine).
905 tests (dont 327 dans un vrai navigateur, optionnels sans Playwright).
