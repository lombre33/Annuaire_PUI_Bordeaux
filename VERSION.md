# Version 1.28.9 — Audit exhaustif, lot 6 : le cadre commun des fenêtres est allégé, sans rien changer pour les personnes (voir CHANGELOG.md)

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
Depuis la 1.21.4, les logos des cartes avaient tous la même surface visuelle : le widget lisait leurs pixels pour en retirer les marges
(retiré en 1.26.1, rétabli en 1.27.2 sans jamais cacher un logo).
Depuis la 1.21.5, l'envoi d'un fichier à Grist (photo de profil, logo d'établissement) porte l'en-tête `X-Requested-With: XMLHttpRequest` que Grist
exige d'une requête qui écrit avec un jeton d'accès : sans lui le navigateur ne montrait qu'une panne de réseau (rejoué dans Chromium contre un vrai
serveur HTTP d'une autre origine ; pas encore essayé dans le vrai Grist d'Antoine).
Depuis la 1.21.6, la fenêtre « Modifier mon profil » ne propose qu'une entrée par libellé dans ses listes : plusieurs lignes brutes
qui ont le même libellé corrigé (une tâche proposée trois fois) ne forment plus qu'une case, qui les couvre toutes.
Depuis la 1.21.7, le widget attend la réponse de Grist à la suppression de la ligne qu'il ajoute à `Annuaire_Sonde`, la retente une fois,
dit dans la console pourquoi si Grist la refuse, et supprime les anciennes lignes laissées à l'adresse de la personne (jamais celles des autres).
Depuis la 1.22.0, les filtres, les cartes et la fenêtre de modification ne lisent que la colonne « corrigé » des tables de référence dès qu'une
table en remplit une : une ligne sans libellé corrigé n'apparaît plus (une table qui n'en remplit aucune garde ses libellés bruts).
Depuis la 1.24.0, un huitième filtre, « Rôle PUI » (table `Role_Dans_le_PUI`), ferme la barre, et le rôle de la personne s'affiche en
pastille ; les menus de filtre réunissent deux libellés qui ne diffèrent que par la casse ou les accents.
Depuis la 1.25.0, la fenêtre « Créer ma fiche » a une case « Apparaître dans l'annuaire », cochée d'avance, qui renseigne `Accepte_apparaitre` et change le
bouton en « Publier ma fiche » (la 1.27.0 a levé la condition du périmètre : une fiche publiée apparaît tout de suite) ; les listes
d'établissements des fenêtres ne montrent que les acronymes ; chaque liste à choix des fenêtres a un champ de recherche (non essayé dans le vrai Grist).
Depuis la 1.25.1, la pastille du rôle a sa propre boîte, plus petite.
Depuis la 1.25.2, le logo qu'on voit sur une carte était une image ordinaire (sans CORS), ses pixels étant lus à part (retiré en 1.26.1).
Depuis la 1.26.0, l'étiquette d'une tâche dit le rôle de la personne dans cette tâche (colonne facultative `Taches_role` de `Taches`, lue sur les lignes brutes
que `BDD.Taches` désigne pour elle, pas sur le libellé corrigé) : dans une bulle à la souris et au clavier, sous le nom de la tâche sur un téléphone.
Depuis la 1.26.1, le widget ne lit plus les pixels des logos des cartes : chaque logo est une image ordinaire dans une case de 104 x 42 px (85 % dès 330 px
de large de carte, 70 % en dessous), qui se montre dès qu'elle est chargée, quoi que Grist réponde à une demande CORS (rejoué dans Chromium, pas essayé dans
un vrai Grist ni sur Firefox). Les logos ne sont plus recadrés : un logo posé dans un grand carré transparent paraît plus petit qu'un logo coupé au ras.
Depuis la 1.27.2, l'égalité de taille des logos des cartes revient : le logo se montre dès qu'il est chargé (au plus 400 ms d'attente), et sa lecture, à part, lui retire ses marges et lui
donne la surface des autres quand Grist laisse lire ses pixels ; sinon il reste dans sa case de 104 x 42 px. La console (`[LOGOS]`) dit la version qui s'exécute, combien de logos Grist
donne, et pourquoi un logo ne se charge pas ou ne se lit pas (rejoué dans Chromium, pas essayé dans un vrai Grist ni sur Firefox).
Depuis la 1.27.0, le périmètre (`BDD.perimetre`) ne décide plus de rien : une fiche s'affiche dès que la personne a accepté d'apparaître et que son établissement est
validé, fondateur ou partenaire, donc celle qu'elle vient de créer apparaît tout de suite ; la colonne n'est plus lue ni indispensable. La liste des établissements des
fenêtres de profil ne propose que les fondateurs et les partenaires (et celui que la fiche porte déjà), et sa recherche est dans « Créer ma fiche » et dans la fiche d'une
autre personne en mode admin (non essayé dans le vrai Grist).
Depuis la 1.27.1, le rôle PUI n'est plus une pastille mais du texte, comme la fonction, à droite de la ligne de l'e-mail : jamais sur une autre ligne, coupé par « … »
quand il est trop long (le rôle entier au survol), masqué quand l'e-mail ne lui laisse presque rien.
Depuis la 1.27.3, le menu Établissement ne propose que les établissements dont une fiche peut s'afficher (validés, fondateurs ou partenaires) et dont l'interrupteur est allumé : un
partenaire n'y figure que si Partenaires est allumé, un fondateur que si Fondateurs l'est ; une coche dont l'option disparaît est retirée avec elle.
Depuis la 1.28.0, le choix de l'établissement et celui du rôle (fenêtres de profil) sont une seule liste déroulante : un bouton qui montre le choix et, ouverte, un panneau avec la recherche en haut dont les
valeurs se réduisent en direct (au clavier : flèches, Entrée, Échap, qui ne ferme que le panneau ; sur un écran tactile le panneau ne prend pas le focus d'office) ; les champs reprennent leur demi-largeur
(non essayé dans le vrai Grist ni sur un vrai téléphone).
Depuis la 1.28.1, chaque logo d'établissement est chargé une seule fois, à part, avant d'être donné aux images des cartes, du bandeau et des fenêtres : Firefox annule la demande d'une image que la page retire pendant son chargement, et l'annuaire se redessine souvent (soupçonné d'être la cause de la disparition des logos signalée le 13 octobre 2026, ce qui était faux : voir la 1.28.2). La console (`[LOGOS] Bilan`) dit combien de logos Grist a donnés et combien s'affichent, et la version qui s'exécute est écrite en bas de la page.
Depuis la 1.28.2, la disparition des logos du 13 octobre 2026 est élucidée : elle venait des règles d'accès du document d'Antoine, pas du code. Le jeton qui affiche les pièces jointes est en lecture seule, donc compté comme un Lecteur, et la colonne `logo` d'`Etablissements` n'était lisible que par les Éditeurs et les propriétaires : Grist refusait les seize fichiers. Une règle de colonne sur `logo` (`user.Access in [OWNER, EDITOR, VIEWER]`, lecture autorisée) les a fait revenir. La console le dit désormais dans le premier avertissement `[LOGOS]` d'un logo refusé, `GRIST_SETUP.md` (étapes 4 à 6), `docs/securite.md` et `TESTING.md` aussi, la documentation des conditions d'accès est corrigée (aucun appel de fonction dans une condition : un attribut d'utilisateur pour les responsables d'établissement, non essayé dans un vrai Grist) et la copie de test `archives/1.21.3/` est supprimée.
965 tests (dont 357 dans un vrai navigateur, optionnels sans Playwright).
