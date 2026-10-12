# Protocole de test

Ce widget n'a pas de test automatisé contre une vraie instance Grist (voir
« Tests automatisés » plus bas pour ce qui est couvert avec une API Grist
simulée). Ce document est le protocole de test **manuel**, à exécuter dans
Grist avant tout déploiement qui touche `main.js`, `render.js`, `index.html`
ou `style.css`. Pour un changement limité à `grist-data.js`/`filters.js`, les
tests automatisés suffisent à condition d'être complétés pour le changement.

## Tests automatisés

```
node --test
```

Sans dépendance, un fichier de tests par module :

- `tests/grist-data.test.mjs` — décodage et formats des données Grist : `text`,
  `normalize`, `normalizeForSearch` (œ, apostrophes, tirets, points, espaces),
  `compareLabels` (les nombres dans l'ordre), `compareContacts` (l'ordre des cartes), `formatPhone`,
  `safeValues`, `tableToRows`,
  `pickLabel`, `labelMapFromRows`, `groupLabelMap`, `taskActionNumber`, `actionNumber`,
  `refId`, `refLabel`, `isEmptyReference`,
  `resolveListItem`, `isInScope`, `createRequestSequencer`,
  `referenceMapsEqual`, `mailtoHref`.
- `tests/enrich.test.mjs` — `enrich` (établissement dans ses 3 encodages, rôle,
  catégories liste dont compétences, domaines, tâches et actions, libellés sans doublon, anciennes
  colonnes ignorées, indicateurs) et `labelsOf`.
- `tests/etablissements.test.mjs` — `etablissementFlagsFromRows` (dont les
  doublons), `etablissementFlags` (par identifiant de ligne, repli sur le
  libellé), `isEtablissementEligible`, `filterVisibleEstablishments`.
- `tests/filters.test.mjs` — `filterContacts` (dont la recherche « prénom nom », mot par
  mot et dans n'importe quel ordre, et ses écritures tolérées), `pruneStaleFilters`,
  `computeFilterCounts` (dont les compteurs des domaines et des actions) et le menu
  rangé par groupe, domaine ou action : `menuGroups`, `groupState`, `toggleGroup`,
  `selectionCount`.
- `tests/load-directory.test.mjs` — `loadDirectory()` avec un faux `docApi`
  (une lecture par table, cartes triées par nom, aucune ancienne table lue, libellé corrigé
  prioritaire, tables indispensables illisibles, table de référence illisible,
  colonnes obligatoires, facultatives ou introuvables, annuaire vide expliqué,
  doublons d'acronymes, domaines des compétences, tâches rangées par action
  d'après leur numéro : formats de libellé, repli « Sans action », menu à plat,
  lectures en panne).
- `tests/identity.test.mjs` — `readIdentity` avec un faux document Grist (adresse
  lue sur la ligne de la sonde, administrateur d'après `ACL`, compte Lecteur,
  table-sonde absente, formule muette, écriture refusée, lecture en panne, ligne de
  sonde toujours retirée, personnes simultanées, aucune adresse dans la console) et
  `isReadOnlyAddress`.
- `tests/people.test.mjs` — l'index des lignes de `BDD` par adresse et par
  identifiant (`findByEmail`, `findById`, doublons, colonne `email` absente) et `describeVisibility` : le
  verdict « apparaît ou non, et pourquoi » concorde avec `buildContacts`, ligne par
  ligne.
- `tests/presence.test.mjs` — `describePresence` (les messages dits à la
  personne), `describeUnknownAccount` (adresse absente de `BDD`, administrateur sans
  fiche, colonne `email` manquante), `describeHiddenFiche` (les avis de la relecture),
  `setPresence` (une écriture atomique, seule la case de la personne, plusieurs lignes,
  refus de Grist) et `explainWriteError`.
- `tests/profile.test.mjs` — `rightsFor` (qui peut modifier quelle fiche, fermé par
  défaut, le droit d'administrateur seulement avec le mode admin allumé),
  `profileFormModel` et `draftOf` (dont l'e-mail et l'établissement d'un administrateur),
  `diffProfile` (textes nettoyés et refusés, téléphone français, e-mail refusé s'il est mal
  formé, trop long, vidé ou pris par une autre fiche, établissement jamais vidé ni inconnu,
  références, listes en ajouts et retraits), `rebaseChanges` (ramener les changements sur
  la fiche actuelle) et `describeChanges`.
- `tests/profile-save.test.mjs` — `buildRowUpdate` (listes calculées sur la fiche
  actuelle, téléphone numérique ou texte, e-mail et établissement), `signatureOf`,
  `readRow`, `prepareReview` (cartes avant et après, rien d'écrit, l'e-mail et
  l'établissement ignorés hors administrateur, une adresse prise refusée), `saveProfile`
  (une seule action atomique, changement concurrent, adresse prise entre-temps, fermé par
  défaut pour l'e-mail et l'établissement, refus de Grist, aucune adresse ni valeur dans la
  console) et `unsavedLabels`.
- `tests/preview.test.mjs` — `diffContacts` et `previewOf` : ce qui change entre la
  carte avant et la carte après.
- `tests/schema.test.mjs` — `readColumnTypes` (type des colonnes de `BDD`, repli).
- `tests/attachments.test.mjs` — `attachmentIds` (cellules `['L', …]`, identifiant seul,
  cellule vide) et `createAttachments` (jeton en lecture seule demandé une seule fois,
  renouvelé avant son expiration, échecs et délai d'attente, réponses inattendues,
  aucune adresse ni aucun jeton dans la console).
- `tests/branding.test.mjs` — `buildBranding` (fondateurs validés du bandeau du bas dans
  l'ordre, financeurs, rond « France 2030 », logo de chaque établissement),
  `logoForContact`, `logoSize` et le branchement sur `loadDirectory` (table `Financeurs`
  facultative).
- `tests/support/fake-grist.js` — le faux document Grist commun aux tests Node et
  au test navigateur : lectures, `applyUserActions` atomique (ajout, modification,
  suppression), formules déclenchées de la sonde, pannes, écritures refusées (par
  table ou par ligne).
- `tests/support/browser.mjs` — l'outillage des tests navigateur : serveur
  statique, Chromium, faux Grist injecté dans la page, console des pages relue sans
  qu'une lecture interrompue par la fermeture de la page fasse échouer le fichier.
- `tests/support/grouped-menu.mjs` — les aides communes aux tests des menus rangés par
  groupe (Compétences par domaine, Tâches par action) : groupe, case, flèche,
  nombres, éléments visibles.
- `tests/support/fake-attachments.mjs` — les pièces jointes du faux Grist pour les tests
  navigateur : des logos dessinés à la demande (proportions variées, un logo très haut,
  une bannière très large, un SVG sans dimensions), un fichier supprimé (404), un
  fichier qui n'est pas une image, et un compte des téléchargements et des jetons employés.
- `tests/support/contrast.mjs` — le rapport de contraste WCAG (`contrastRatio`, `parseColor`) à
  partir des couleurs calculées par le navigateur, pour les tests d'accessibilité.
- `tests/constants.test.mjs` — cohérence de la taxonomie (`constants.js`),
  table principale `BDD`, libellé corrigé avant le libellé brut.
- `tests/rules.test.mjs` — règle du projet : aucun fichier de code ne lit la
  colonne `nom_de_domaine`.

Avec Playwright (`npm install --no-save playwright`, puis
`npx playwright install chromium`), `tests/e2e.test.mjs` exécute en plus 69
scénarios dans un vrai navigateur sur les données de `tests/fixtures.mjs`
(structure `BDD`) : nombre de contacts et badge établissement de chaque carte, cartes triées
par nom (même quand Grist envoie les lignes dans le désordre), interrupteurs
Fondateurs/Partenaires, recherche (« prénom nom » dans les deux sens, noms composés, tirets,
apostrophe, œ), attente de la frappe (une seule mise à jour pour quatre lettres tapées d'un coup,
champ vidé sans attendre, « Réinitialiser » qui annule l'attente), filtres et compteurs, menu Compétences rangé par
domaine (case de domaine, détail replié, case partielle, recherche à deux niveaux,
ouverture réordonnée, badge, accessibilité), texte HTML affiché
sans injection, lien mailto, pannes de lecture (bandeau, cartes conservées), et le
bandeau « Ma présence » (personne identifiée ou non, compte Lecteur, interrupteur,
double clic, écriture refusée, personne sans fiche, qui voit alors une mention sans
interrupteur), et le banc d'essai lui-même (une lecture de la console interrompue par la
fermeture de la page ne laisse aucun rejet non traité).
`CHROMIUM_PATH` désigne un Chromium déjà installé. Sans Playwright, ces
scénarios sont ignorés.

`tests/e2e-taches.test.mjs` y ajoute 24 scénarios sur le menu Tâches rangé par action,
sur des tâches et des actions numérotées (`withTaskActions` dans `tests/fixtures.mjs`) :
sept boutons seulement, le filtre Actions inchangé, actions repliées avec « Sans action »
en dernier, case d'action et case partielle, OU dans le menu et ET avec les autres
filtres, nombres de cartes, recherche d'une action, d'une tâche ou d'un numéro, tag de
carte, Réinitialiser, données qui changent dans Grist, menu à plat sans numéros (console
et sans bandeau), clavier, et le formulaire de modification de fiche, qui range lui aussi
les tâches par action.

`tests/e2e-profile.test.mjs` y ajoute 61 scénarios sur la modification d'une fiche : qui
voit un bouton « Modifier » (personne ordinaire, administrateur avec ou sans mode admin,
compte Lecteur, anonyme, adresse inconnue, doublon), le formulaire et ses refus, la
relecture (carte avant et carte après, ce qui change repéré, rien d'écrit), l'écriture
en une seule action, le mode admin (bouton à bascule, clavier, focus, annuaire relu),
l'e-mail et l'établissement d'une autre personne (champs, refus, adresse prise, fiche
retirée de l'annuaire), le message de confirmation et ses délais (horloge du navigateur),
la fenêtre qui reste ouverte quand Grist n'a pas tout gardé, le téléphone numérique ou
texte, un refus de Grist, un changement concurrent, une fiche supprimée, le double clic,
Échap, un prénom piégé, le focus, la tabulation dans la fenêtre, le bouton « Modifier »
rangé sous la fonction, le bandeau « Ma présence » qui ne se chevauche à aucune largeur et
l'affichage de 280 à 360px.

`tests/responsive.test.mjs` y ajoute 20 scénarios sur la mise en page, de 280 à
1920px de large, sur un jeu de données chargé (`tests/fixtures-responsive.mjs` :
noms, e-mails, fonctions et tags très longs, dont certains sans point de
coupure) : aucun défilement horizontal, texte contenu dans les cartes, nom
jamais sous le badge de l'établissement, trois, deux puis une colonne, barre
d'outils, menus de filtres (les menus Compétences et Tâches dépliés compris) entièrement
dans le cadre, cibles tactiles (écran
tactile émulé), tailles de texte, bandeau d'erreur et état vide à 320px, et
mise en page de référence à partir de 1400px. Les barres de défilement y sont
visibles (15px de moins), le cas le plus serré.

`tests/branding-e2e.test.mjs` y ajoute 27 scénarios sur l'habillage, avec des logos servis par
`tests/support/fake-attachments.mjs` : logo seul sur les cartes, pastille texte quand il manque,
clic et clavier, jeton demandé une seule fois et en lecture seule, financeurs, bandeau des
fondateurs dans l'ordre, rond « France 2030 », jeton refusé ou méthode absente, fichier
supprimé ou illisible, aucune trace du jeton dans la console, relecture d'une fiche.
`tests/branding-layout.test.mjs` y ajoute 13 scénarios sur la mise en page de l'habillage, de
320 à 1920px : en-tête (titre, financeurs, profil), logos de formes variées dans leur case,
bandeau du bas qui se replie, rien qui dépasse du cadre.
`tests/accessibility.test.mjs` y ajoute 4 scénarios (et 2 tests sans navigateur : les rapports de
contraste de référence, et une garde sur les feuilles de style qui refuse tout `outline: 0` ou
`outline: none` non justifié) sur le clavier et le lecteur d'écran : le champ de recherche nommé par son
rôle, aucun contrôle sans nom dans l'arbre d'accessibilité (page au repos, menu ouvert), et le parcours
complet à la tabulation (page, puis menu ouvert) où chaque arrêt change de capture avec et sans focus, avec
un anneau plein de 2 px au moins et de 3:1 au moins.

Limite assumée : l'API Grist y est simulée (`tests/support/fake-grist.js` :
`docApi.fetchTable` sur des données aux encodages observés en production, et des
écritures dont la formule déclenchée de la sonde est reproduite, pas exécutée par
Grist). Le test garantit que le vrai
`main.js`/`render.js` réagissent correctement à ces encodages et à ces pannes ;
il ne garantit pas que Grist envoie toujours ces formes — d'où le protocole
manuel ci-dessous, à jouer dans un vrai document avant déploiement.

Si vous ajoutez une fonction à `grist-data.js` ou `filters.js` : ajoutez son
test dans le fichier de `tests/` qui correspond à son rôle (liste ci-dessus).
Si vous changez l'affichage, ajoutez ou adaptez un scénario de
`tests/e2e.test.mjs` — n'attendez pas une revue ultérieure. Si vous changez la
mise en page (`style.css`), faites de même dans `tests/responsive.test.mjs`.

## Préparation

1. `npx serve .` ou `python3 -m http.server 8080` à la racine du dépôt (les
   modules ES ne se chargent pas via `file://`).
2. Dans Grist, ouvrir le document contenant la table `BDD`, ajouter (ou
   pointer temporairement) un widget custom vers `http://localhost:8080`.
3. Ouvrir la console navigateur (F12) — la garder ouverte tout le protocole :
   plusieurs points ci-dessous s'appuient sur l'absence d'erreur/warning
   inattendu, et sur les diagnostics `[GRIST]`/`[REFS]`/`[ETABLISSEMENT]`.
4. Avoir sous la main un contact de test dont vous pouvez modifier les
   champs sans impacter de vraies données (ou travailler sur une copie du
   document).

## 1. Chargement initial

- [ ] Aucune erreur dans la console au chargement.
- [ ] `[GRIST] Enregistrements reçus: N` correspond au nombre de lignes de
      `BDD`, et le nombre de cartes affichées (`#resultCount`) est
      inférieur ou égal à N (seuls les contacts avec `perimetre` non
      vide s'affichent — voir `isInScope()`).
- [ ] Les 7 boutons de filtre (Actions, Tâches, Communautés, GT, Compétences,
      Instances, Établissement) sont présents dans la barre d'outils. Il n'y a
      pas de bouton « Domaines » : les domaines sont dans le menu Compétences.
- [ ] Sur une carte avec toutes les infos renseignées : initiales correctes
      dans l'avatar, nom + prénom, fonction visible, logo (ou pastille)
      de l'établissement en haut à droite, email en lien `mailto:`, téléphone visible.
- [ ] Sur une carte avec des infos manquantes (pas de fonction / pas
      d'email / pas de téléphone) : les lignes correspondantes sont
      absentes, pas affichées vides.

## 2. Recherche libre

- [ ] Taper un nom existant (ex. 3 premières lettres) → seuls les contacts
      correspondants restent, une fraction de seconde après la dernière lettre.
- [ ] Recherche sur le prénom, pas seulement le nom.
- [ ] **Prénom et nom ensemble** (1.16.1) : taper « prénom nom » d'une personne réelle
      → sa carte ; le même couple dans l'autre ordre (« nom prénom ») → la même carte ;
      quelques lettres de chacun (« pré nom ») → la même carte ; le prénom d'une personne
      et le nom d'une autre → aucun résultat.
- [ ] **Écritures tolérées** (1.16.1) : pour un nom composé réel (« Marie-Christine »),
      taper la même chose avec une espace au lieu du tiret → la carte ; pour un nom avec
      apostrophe (« D'Arcy »), taper sans apostrophe → la carte. À défaut de tels noms dans
      le document, le contrôle se fait sur la copie de démonstration.
- [ ] **Cartes triées** (1.16.1) : sans filtre, les cartes se lisent de A à Z par nom de
      famille (puis prénom) ; ajouter un contact dans Grist, au bout de la table, le place
      à sa lettre dans les secondes qui suivent, sans recharger la page.
- [ ] **Frappe rapide** : taper six lettres d'un coup → la liste ne scintille pas et ne
      s'affiche qu'à la fin de la frappe ; effacer le champ (Échap ou croix) → toutes les
      cartes reviennent tout de suite ; cliquer « Réinitialiser » juste après avoir tapé →
      le champ est vide et toutes les cartes sont là, rien ne se refiltre ensuite.
- [ ] Recherche insensible à la casse (`DUPONT` = `dupont`).
- [ ] **Recherche insensible aux accents** (ex. taper `ecole` doit matcher un
      nom contenant `École`, si un tel contact existe — sinon vérifier sur
      n'importe quel nom accentué du jeu de données réel) — comportement
      nouveau en 1.4.0, strictement plus permissif qu'avant.
- [ ] Recherche vide → tous les contacts (dans le périmètre) réapparaissent.
- [ ] Recherche sans aucun résultat → état vide (`#emptyState`) affiché,
      grille de cartes vide.

## 3. Chaque filtre, seul

Pour chacun des 7 filtres (Actions, Tâches, Communautés, GT, Compétences,
Instances, Établissement) :

- [ ] Ouvrir le menu (clic sur le bouton) → seul ce menu est ouvert (les
      autres se ferment).
- [ ] Cocher une valeur → seuls les contacts ayant cette valeur restent.
- [ ] **La valeur cochée remonte en tête du menu**, les valeurs non cochées
      restant triées alphabétiquement en dessous ; **le bouton du filtre
      affiche un badge avec le nombre de valeurs cochées** (ex. "①").
- [ ] Décocher → le badge disparaît (0 = pas de badge), la valeur reprend sa
      place alphabétique parmi les non cochées.
- [ ] Cocher deux valeurs du **même** filtre → union (OU) : les contacts
      ayant l'une OU l'autre valeur s'affichent ; les deux valeurs cochées
      sont en tête, triées alphabétiquement entre elles ; badge = 2.
- [ ] Cocher 3 valeurs, puis décocher celle du **milieu** (pas la première ni
      la dernière cochée) → l'ordre des deux valeurs encore cochées ET des
      valeurs redevenues non cochées reste correctement alphabétique dans
      chaque groupe (pas d'ordre "gelé" dans sa position précédente).
- [ ] Champ de recherche en haut du menu : taper du texte → seules les
      options correspondantes restent visibles dans la liste ; ça ne coche
      ni ne décoche rien.
- [ ] Cliquer en dehors du menu → il se ferme.

Spécifique **Compétences** (et toutes les catégories issues d'une table de
référence) :

- [ ] Le menu propose un seul libellé par compétence : le libellé corrigé
      (`Competences_corrigees`) quand il est rempli, le libellé brut sinon.
      Les compétences d'une carte portent les mêmes libellés que le menu.
- [ ] Cocher une compétence dans le menu garde exactement les contacts dont
      la carte affiche cette compétence.

Spécifique **Compétences par domaine** (compétences macro, colonne
`Macro_competences` de la table `Competences`) : le menu Compétences range ses
valeurs par domaine, sans second bouton.

- [ ] L'infobulle du bouton « Compétences » parle de domaines ; le champ de
      recherche du menu dit « Domaine ou compétence… » en entier, sans être
      coupé.
- [ ] Le menu liste chaque domaine une seule fois (pas de doublon dû à la casse
      ou aux accents), triés alphabétiquement, plus « Autres » **en dernier** s'il
      existe une compétence sans domaine. Les domaines sont repliés ; à droite de
      chacun, le nombre de contacts (pas de compétences) qui ont au moins une
      compétence de ce domaine.
- [ ] La flèche d'un domaine (ou la touche Entrée sur elle) déplie ses
      compétences, triées alphabétiquement, avec leur nombre de contacts ; un
      second clic les replie.
- [ ] Cocher la case d'un domaine coche toutes ses compétences et garde les
      contacts qui ont l'une d'elles. Le badge du bouton affiche 1, quel que
      soit le nombre de compétences. La recocher décoche tout.
- [ ] Déplier un domaine et cocher une seule de ses compétences : la case du
      domaine passe à moitié cochée (un tiret) ; un clic dessus la complète.
      Décocher la dernière compétence décoche le domaine.
- [ ] Tout est un OU : un domaine coché et une compétence d'un **autre** domaine
      cochée montrent les contacts de l'un ou de l'autre ; badge = 2.
- [ ] Les contacts d'un même domaine qui ont deux compétences de ce domaine ne
      sont comptés qu'une fois.
- [ ] Fermer puis rouvrir le menu : les domaines qui contiennent une valeur
      cochée sont en tête, la valeur cochée en tête de son domaine, et un domaine
      coché en partie s'ouvre de lui-même pour montrer lesquelles. Rien ne bouge
      pendant qu'on coche.
- [ ] Recherche du menu : « sante » (sans accent) garde le domaine
      « Santé… » avec **toutes** ses compétences ; le nom d'une compétence seule
      garde cette compétence sous son domaine, sans les autres. Les flèches
      disparaissent et tout est déplié pendant la recherche ; vider le champ
      rétablit l'état précédent. La recherche ne coche rien.
- [ ] Réinitialiser décoche domaines et compétences, vide la recherche du menu
      et le badge disparaît.
- [ ] Cliquer sur une étiquette de compétence d'une carte coche cette
      compétence : sa case est cochée dans son domaine, le domaine passe à moitié
      coché (ou coché si c'est sa seule compétence).
- [ ] Au clavier : Tabulation passe de la case d'un domaine à sa flèche, puis à ses
      compétences si elles sont dépliées ; Espace coche une case ; un lecteur d'écran annonce « Détail
      de <domaine> » et l'état déplié ou replié de la flèche.
- [ ] La console liste, par identifiant de ligne, les compétences que
      `Macro_competences` ne classe pas (`[REFS] Competences : n ligne(s) sans
      regroupement…`) : les classer dans Grist, puis recharger le widget.
- [ ] Sans la colonne `Macro_competences` (essai sur une copie du document) : le
      bandeau « Colonne de libellé introuvable » s'affiche et le menu Compétences
      reste complet, mais à plat, sans domaines.

Spécifique **Tâches par action** : le menu Tâches range ses valeurs par action, sans
second bouton et sans colonne à ajouter dans Grist. Le numéro avant le point du libellé
d'une tâche (« 2.1 … ») est celui de son action, dont le libellé commence par « Action 2 ».
Le menu Tâches fonctionne comme le menu Compétences par domaine (ci-dessus) : reprendre
les mêmes essais en remplaçant domaine par action et compétence par tâche, puis :

- [ ] L'infobulle du bouton « Tâches » parle d'actions ; le champ de recherche du menu
      dit « Action ou tâche… » en entier, sans être coupé.
- [ ] Les actions sont dans l'ordre de leur numéro (« Action 2 » avant « Action 10 »),
      chaque tâche sous l'action dont elle porte le numéro, et les tâches d'une action
      dans l'ordre de leur numéro (« 1.2 » avant « 1.10 »). « Sans action » est **en
      dernier** s'il existe une tâche sans numéro, ou dont le numéro ne correspond à
      aucune action. Une action qui n'a aucune tâche ne figure pas dans le menu.
- [ ] Le filtre **Actions** est inchangé : toujours une liste à plat, qui filtre sur les
      actions inscrites sur les cartes, et qui ne coche pas le menu Tâches (ni
      l'inverse). Les deux se cumulent (ET).
- [ ] Rechercher « 2.1 » (le numéro d'une tâche) garde cette tâche sous son action ;
      « action 2 » garde l'action avec toutes ses tâches.
- [ ] Renuméroter une tâche dans `Taches` (par exemple « 2.1 … » devient « 1.4 … »)
      puis recharger : elle change d'action. Une sélection qui portait l'ancien libellé
      est retirée.
- [ ] La console liste, par identifiant de ligne, les tâches classées sous « Sans
      action » (`[REFS] Taches : n ligne(s) sans regroupement…`) : les numéroter dans
      Grist, puis recharger le widget.
- [ ] Sur une copie du document où **aucune tâche** ne commence par un numéro « n.m »
      (ou aucune action par « Action n »), le menu Tâches reste complet, mais à plat,
      sans actions et sans bandeau ; la console dit pourquoi (`[REFS] Taches : aucune
      ligne n'est rattachée à une action…`).
- [ ] Dans la fenêtre « Modifier mon profil », la liste des tâches est rangée par action
      elle aussi, et celle des actions reste à plat.

## 4. Filtres combinés

- [ ] Deux filtres de catégories différentes cochés (ex. une Instance +
      un Établissement) → intersection (ET) : seuls les contacts qui
      correspondent aux deux restent.
- [ ] Recherche libre + un filtre catégorie en même temps → les deux
      s'appliquent ensemble.
- [ ] Les 7 filtres cochés simultanément (au moins une valeur chacun) →
      résultat cohérent (potentiellement vide, mais sans erreur console).

## 5. Interactions carte → filtre

- [ ] Cliquer sur le badge établissement d'une carte → le filtre
      Établissement se coche sur cette valeur, la grille se filtre en
      conséquence.
- [ ] Cliquer sur un tag Instances/Actions/GT/Compétences/Communautés/Tâches
      d'une carte → le filtre correspondant se coche, curseur "main" au
      survol de ces tags.
- [ ] **Après un clic sur un tag/badge de carte** (pas dans le menu) : ouvrir
      le menu du filtre concerné → la valeur cliquée est bien en tête, sa
      case est bien cochée (pas seulement mise en évidence visuellement), et
      le badge de comptage sur le bouton du filtre est à jour — même
      résultat qu'en cochant la case directement dans le menu.
- [ ] **Le tag "Rôle PUI" d'une carte n'est PAS cliquable** : curseur normal
      au survol (pas de main), le cliquer ne change rien à la grille ni aux
      filtres actifs. *(Rôle PUI est volontairement affiché mais non
      filtrable — voir specs.md ; nouveau en 1.4.0 puisque ce tag était
      invisible avant ce correctif, donc jamais testable.)*

## 6. Bouton Réinitialiser

- [ ] Avec une recherche + plusieurs filtres actifs (dont du texte tapé
      dans un champ de recherche interne à un menu) → cliquer
      "Réinitialiser" vide la recherche, décoche tous les filtres, **vide
      aussi les champs de recherche internes aux menus** (pas seulement les
      cases), et réaffiche tous les contacts du périmètre.

## 7. Scénarios de non-régression spécifiques à la 1.4.0

Ces scénarios ciblent chacun un bug corrigé qui n'est pas (ou pas
entièrement) couvert par `node --test`, parce qu'il implique `main.js`/
`render.js` ou un comportement en conditions réelles Grist :

- [ ] **Téléphone** : repérer un contact dont le téléphone commence par 0
      dans Grist (la quasi-totalité) → la carte affiche bien le 0 initial,
      formaté par paires (`05 56 78 90 12`), pas un nombre à 9 chiffres.
- [ ] **Rôle PUI** : un contact avec `Role_dans_le_PUI` renseigné affiche
      bien une section "Rôle PUI" dans ses tags de carte.
- [ ] **Renommage de libellé** : dans Grist, cocher un filtre (ex.
      Établissement sur une valeur), puis renommer cette valeur dans la
      table de référence correspondante (ex. `Etablissements.acronyme`).
      Revenir sur le widget : la sélection périmée doit avoir disparu
      d'elle-même (pas de grille bloquée à 0 résultat sans explication), et
      le nouveau libellé doit être proposé dans le menu. *Remettre le
      libellé d'origine après le test.*
- [ ] **Édition pendant un menu ouvert** : ouvrir un menu de filtre (ex.
      Instances), taper du texte dans sa recherche interne, puis éditer un
      champ **sans rapport** sur un autre contact directement dans Grist
      (ex. son numéro de téléphone). Revenir sur le widget : le menu ouvert
      ne doit **pas** se fermer ni perdre le texte tapé (peut prendre
      jusqu'à ~250 ms après l'édition pour se stabiliser — c'est le délai du
      debounce, normal).
- [ ] **Éditions rapprochées** : modifier 2-3 contacts différents coup sur
      coup dans Grist (en quelques secondes) → revenir sur le widget,
      vérifier que les cartes reflètent bien l'état **final** de tous les
      contacts modifiés (pas un état intermédiaire ou partiel).
- [ ] **Référence vide ou orpheline** : si un contact a une `Etablissement`
      vide ou qui ne résout à aucune ligne d'`Etablissements`, la console doit
      afficher un `[ETABLISSEMENT] ... sans Etablissement` listant
      l'identifiant de ligne de ce contact (pas son email) — et il n'apparaît
      pas dans la grille (aucun indicateur d'établissement à faire valoir), ni
      aucun tag portant un id numérique brut.

## 8. Cas limites de données

- [ ] Contact sans aucune valeur dans les 7 catégories de tags → carte
      affichée sans section `card-tags` visible (pas de section vide).
- [ ] Contact avec `perimetre` vide → absent de la grille (et absent du
      compte `#resultCount`).
- [ ] Contact dont `Accepte_apparaitre` est décoché ou vide → absent de la
      grille, sans bandeau. Le cocher dans Grist puis recharger le widget : la
      carte apparaît. La console indique `[CONSENTEMENT] n/m …` (nombre
      seulement, aucun nom).
- [ ] Contact sans `nom` ni `prenom` → absent de la grille (filtré par
      `buildContacts()`).
- [ ] Établissement dont l'acronyme est vide (seul `nom_complet` renseigné) →
      badge affiché avec le nom complet.
- [ ] Deux lignes d'`Etablissements` de même acronyme → chaque contact garde
      le statut de la ligne à laquelle il est rattaché.

## 9. Vérifications techniques

- [ ] Panneau d'accès du widget dans Grist : niveau réellement accordé =
      `full` (cohérent avec `manifest.yml` et `window.grist.ready(...)`).
- [ ] Aucune erreur réseau (onglet Réseau des DevTools) sur les appels
      `fetchTable` des 8 tables de référence.
- [ ] Redimensionner/recharger le widget plusieurs fois de suite → pas
      d'accumulation d'erreurs ni de comportement différent au 2e/3e
      chargement (sanity check sur le `debounce`/`sequencer`).

## 10. Bandeau d'état (1.7.1)

À jouer sur une **copie** du document, jamais sur le document de production :

- [ ] Chargement normal : aucun bandeau rouge sous la barre d'outils.
- [ ] Renommer temporairement la table `Etablissements`, recharger le widget :
      bandeau « Impossible de charger l'annuaire depuis Grist (table
      « Etablissements » illisible) », compteur « Chargement impossible ». Une
      fois la table remise sous son nom, recharger : le bandeau disparaît.
- [ ] Renommer temporairement la table `Actions`, recharger : les cartes
      restent affichées et le bandeau signale « Tables illisibles (Actions) ».
- [ ] Renommer temporairement la colonne `ok_pour_apparaitre` d'`Etablissements`,
      recharger : bandeau d'erreur qui nomme la colonne (« colonne
      « ok_pour_apparaitre » absente de la table Etablissements »), pas un
      annuaire vide. Remettre son nom ensuite.
- [ ] Décocher `Accepte_apparaitre` pour tout le monde, recharger : bandeau
      « Personne n'a accepté d'apparaître… » et aucune carte. Renommer
      temporairement la colonne : bandeau d'erreur qui la nomme, aucune carte.
- [ ] Après modification de `ok_pour_apparaitre` dans `Etablissements`,
      **recharger le widget** (Grist ne le prévient pas, voir README « Limites
      connues ») puis vérifier le nombre de contacts et le badge de chaque carte.

## 11. Ma présence (1.11.0)

Réglages d'abord : `GRIST_SETUP.md` (colonne de données, table `Annuaire_Sonde`, case
`admin`). À jouer sur une **copie** du document, console du navigateur ouverte.

- [ ] Sans la table `Annuaire_Sonde` : aucun bandeau « Ma présence », l'annuaire
      s'affiche comme avant, la console dit `[IDENTITE] table « Annuaire_Sonde »
      introuvable`.
- [ ] Avec la table, un compte qui peut modifier le document et dont l'adresse est
      dans `BDD.email` : le bandeau apparaît à droite de l'en-tête avec son nom et
      sa situation ; la console dit `[IDENTITE] personne identifiée (administrateur :
      oui|non)` sans aucune adresse ; la table `Annuaire_Sonde` est vide.
- [ ] Administrateur : le compte dont l'adresse est dans `ACL` avec `admin` coché
      est « administrateur : oui », un autre « non » (même avec une adresse écrite en
      majuscules dans `ACL`).
- [ ] Interrupteur : le décocher retire la carte de la personne et décoche
      `Accepte_apparaitre` dans Grist ; le recocher la fait revenir. Il n'écrit que
      cette case, sur la ligne de la personne.
- [ ] Compte **Lecteur** : pas de bandeau, aucune ligne ajoutée à `Annuaire_Sonde`.
- [ ] Compte connecté dont l'adresse n'est pas dans `BDD` : pas de bandeau, la
      console l'explique sans citer d'adresse.
- [ ] Règle d'accès qui refuse la modification de `BDD` pour ce compte : l'interrupteur
      affiche « Grist a refusé la modification… » et reste dans son état réel.
- [ ] Deux comptes dans deux navigateurs, widgets ouverts en même temps : chacun voit
      son propre nom.
- [ ] Établissement non validé : la personne qui a accepté voit pourquoi sa fiche
      reste masquée.

## 12. Largeur du cadre (1.9.1)

Les tests automatisés couvrent Chromium (écran tactile émulé compris). À jouer
dans un vrai document Grist, y compris sur un téléphone ou une tablette (Safari
iOS, Chrome Android) que les tests ne couvrent pas :

- [ ] Largeur d'au moins 1400px : une seule rangée dans la barre d'outils
      (recherche, filtres, interrupteurs), trois colonnes de cartes, comme avant
      la 1.9.1.
- [ ] Réduire la section du widget (poignée entre deux sections de Grist) sous
      1400px : la recherche, les interrupteurs et « Réinitialiser » passent sur
      une première rangée, les filtres sur la largeur dessous.
- [ ] Sous 840px : deux colonnes de cartes. Sous 600px : une colonne, la
      recherche, puis les filtres étirés, puis les interrupteurs.
- [ ] À 320px (ou le panneau le plus étroit possible) : aucune barre de
      défilement horizontale, ni dans le widget ni sur la page Grist.
- [ ] Dans un cadre étroit, ouvrir chaque menu de filtre, y compris le dernier
      de la rangée : il reste entièrement visible, sans être coupé à droite, et
      se referme d'un clic ailleurs. Élargir le cadre puis le rouvrir : il
      s'ouvre de nouveau sous son bouton.
- [ ] Menu Compétences ouvert et un domaine déplié, dans le cadre le plus étroit
      (et de même le menu Tâches avec une action dépliée) : aucune barre de
      défilement horizontale, un nom de compétence, de tâche ou d'action très
      long passe à la ligne (il ne déborde ni du menu ni de la page), la flèche et
      le nombre de chaque domaine ou action restent visibles, et la flèche se
      touche sans viser.
- [ ] Carte avec un nom, un prénom et une fonction très longs : le nom tient sur
      deux lignes au plus, le badge d'établissement reste à sa droite, rien ne
      passe sous le badge ni hors de la carte.
- [ ] Téléphone ou tablette : toucher le champ de recherche ne zoome pas la page
      (champs à 16px), les badges, tags et le lien e-mail se touchent sans
      viser, et un filtre touché ne reste pas coloré une fois relâché.

## 13. Modifier sa fiche (1.12.0, reprise en 1.15.0)

Réglages d'abord : `GRIST_SETUP.md` (colonnes de données, règles d'accès). À jouer sur
une **copie** du document, avec deux comptes (une personne ordinaire et un
administrateur) dans deux navigateurs, console ouverte. Le mode admin et la modification de
l'e-mail et de l'établissement sont à la section 16.

- [ ] Personne ordinaire : un bouton « ✎ Modifier » sous la fonction de sa seule carte,
      avec la mention « Votre fiche », et « Modifier mon profil » dans le bandeau. Aucune
      autre carte n'a de bouton, et il n'y a pas de bouton « Mode admin ».
- [ ] Administrateur, mode admin éteint : exactement comme une personne ordinaire.
- [ ] Compte Lecteur, document sans `Annuaire_Sonde` : ni bandeau ni bouton. Compte dont
      l'adresse ne figure pas dans `BDD` : un bandeau « Compte absent de l'annuaire » sans
      interrupteur de présence ni bouton « Modifier ».
- [ ] Ouvrir sa fiche : un bloc d'identité (initiales, nom, e-mail, et à droite le logo de
      l'établissement, ou son nom en pastille s'il n'a pas de logo) et la
      phrase « Verrouillé : l'e-mail et l'établissement sont liés à votre compte… » ; les
      champs contiennent les valeurs de Grist (le téléphone avec son 0 initial et ses
      espaces). La console ne dit pas `[SCHEMA] Types de colonnes illisibles` (sinon le
      widget suit la forme de la cellule : vérifier le téléphone plus bas).
- [ ] Changer la fonction, retirer un tag, en ajouter un, changer le téléphone : le pied
      de fenêtre compte les champs modifiés et « Ce qui va changer » apparaît sous le
      formulaire. Vider le prénom **et** le nom : « Indiquez au moins un prénom ou un
      nom. » sous les deux champs, « Relire mes modifications » grisé.
- [ ] « Relire mes modifications » : la fenêtre s'élargit, une légende explique les
      repères, la carte « Avant » (« telle qu'elle est aujourd'hui ») est à côté de la carte
      « Après » (« telle qu'elle apparaîtra »), puis vient le « Détail des changements ».
      Sur la carte « Après » : contour vert et pastille « modifié » ou « ajouté » sur une
      ligne de texte, « + » devant un tag ajouté, tag retiré barré, ligne vidée barrée
      avec la pastille « supprimé ». **Rien n'a changé dans Grist** à ce stade.
- [ ] Une personne qui n'a pas accepté d'apparaître, ou dont l'établissement n'est pas
      validé : la relecture de sa fiche porte un avis qui le dit (« Votre fiche est masquée
      de l'annuaire : vous n'avez pas accepté d'apparaître… » / « Votre établissement n'a
      pas validé sa présence : votre fiche reste masquée dans l'annuaire. »). Une personne
      visible n'a aucun avis.
- [ ] « Retour » : les saisies sont conservées. « Annuler » : rien n'est écrit.
- [ ] « Valider » : la fenêtre se ferme et un message « Vos modifications sont enregistrées. »
      reste six secondes en bas de l'écran. Dans Grist, seuls les champs modifiés ont
      changé ; `email`, `Etablissement`, `perimetre` et `Accepte_apparaitre` sont
      intacts ; un seul « Annuler » de Grist défait toute la modification. L'annuaire
      montre la fiche à jour sans rechargement.
- [ ] Téléphone : colonne numérique, Grist stocke un nombre sans 0 initial et la carte
      affiche « 05 56 78 90 12 » ; colonne de texte, il stocke « 05 56 78 90 12 ». Vider
      le champ vide la cellule.
- [ ] Changement concurrent : ouvrir la relecture, changer la **même** colonne dans
      Grist, puis « Valider » : la fenêtre revient à la relecture avec l'avis « La fiche
      a changé dans Grist pendant la relecture » et rien n'est écrit ; « Valider » à
      nouveau écrit. En changeant une **autre** colonne, l'enregistrement réussit sans
      l'écraser.
- [ ] Règle d'accès qui refuse la modification de `BDD` à ce compte : « Grist a refusé
      la modification… », la relecture reste ouverte, rien n'est écrit.
- [ ] Un compte ordinaire ne peut pas modifier la fiche d'un autre ni `email`,
      `Etablissement`, `perimetre` : depuis la console (contexte de l'iframe du
      widget), `grist.docApi.applyUserActions([['UpdateRecord', 'BDD', <autre ligne>,
      {Fonction: 'x'}]])` est refusé.
- [ ] Rendre temporairement `Fonction` à formule : le message parle d'une colonne à
      formule et renvoie à `GRIST_SETUP.md`. Remettre une colonne de données.
- [ ] Une fiche dont une liste contient une valeur sans libellé : modifier une autre
      liste conserve cette valeur.
- [ ] Si Grist ne garde pas tout (par exemple une colonne à formule qui recalcule la valeur)
      ou si l'annuaire ne se recharge pas : la fenêtre reste ouverte sur « Fiche enregistrée »
      avec la réserve, et aucun message de confirmation n'apparaît.
- [ ] Échap : avec des modifications, un premier appui avertit et un second ferme ;
      sans modification, un seul appui ferme. Pendant l'enregistrement, Échap ne ferme
      pas.
- [ ] Clavier et lecteur d'écran (au moins une fois, NVDA ou VoiceOver) : le titre de
      chaque étape est annoncé, « ajouté », « retiré » et « modifié » sont lus dans la
      carte « Après » (les pastilles sont du texte, les tags ont un mot caché), le message
      de confirmation est annoncé à la fermeture (une seule fois), le focus revient au
      bouton d'origine à la fermeture.
- [ ] Téléphone ou tablette : la fenêtre tient dans l'écran, les cartes avant et après
      sont l'une sous l'autre, « Valider » reste accessible.
- [ ] La console ne montre aucune erreur ni aucune adresse e-mail.

## 14. Logos et habillage (1.14.0)

Réglages d'abord : `GRIST_SETUP.md`, étape 5 (colonnes `logo` et `ordre_bandeau` d'`Etablissements`, table
facultative `Financeurs`). À jouer sur une **copie** du document, avec la console et l'onglet Réseau du
navigateur ouverts (F12). **Ce protocole est le seul contrôle du jeton d'accès et des adresses de pièces
jointes : les tests automatiques simulent la réponse de Grist.** Si un point échoue, relever le message de
la console, l'adresse de l'image dans l'onglet Réseau et le code de réponse.

- [ ] Document sans aucune colonne ni table de logos : aucune erreur, aucune ligne `[LOGOS]`, aucune demande de
      jeton dans l'onglet Réseau, pas de financeurs en tête de page, les pastilles texte sur les cartes comme
      avant la 1.14.0, et en bas de page le bandeau des fondateurs validés **en texte** (leurs acronymes).
- [ ] Un logo (PNG ou SVG) ajouté dans la colonne `logo` de deux établissements fondateurs validés, puis le
      widget rechargé : le logo remplace la pastille sur leurs cartes, **seul** (ni nom dessous) ; les autres
      établissements gardent leur pastille. Cliquer le logo filtre sur l'établissement, comme la pastille.
- [ ] Onglet Réseau : **une seule** demande de jeton au chargement, puis une demande par logo à une adresse de
      la forme `…/attachments/<numéro>/download?auth=…`, réponse 200 de type image (pas 401, 403 ni 404).
      Aucune ligne `[LOGOS]` dans la console.
- [ ] Table `Financeurs` remplie (`nom`, `logo`, `ordre`) : au centre de l'en-tête (cadre assez large), la phrase
      « Projet financé par l'État dans le cadre de France 2030 » puis les logos, dans l'ordre d'`ordre`.
- [ ] Bandeau tout en bas : seuls les fondateurs **validés**, dans l'ordre d'`ordre_bandeau` ; le rond
      « France 2030 » à droite (le financeur de ce nom) ; la phrase de financement dont le lien ouvre la page
      du projet dans un nouvel onglet ; une infobulle donne le nom complet de chaque établissement.
- [ ] **Les droits** : avec un compte **Lecteur**, puis un compte **Éditeur**, les logos s'affichent dans les
      deux cas (le jeton demandé est en lecture seule). Les règles d'accès de l'étape 4 posées, un compte
      ordinaire voit toujours les logos ; sinon, noter lesquels sont refusés (les noms les remplacent, sans
      bandeau rouge).
- [ ] **Expiration du jeton** : laisser la page ouverte plus longtemps que sa validité (quelques minutes),
      puis cocher et décocher un filtre : les logos des cartes reviennent (un nouveau jeton est demandé, visible
      dans l'onglet Réseau), sans cadre cassé ni nom à leur place.
- [ ] Supprimer le fichier de la cellule `logo` d'un établissement, recharger : seul cet établissement retrouve
      sa pastille (et son nom dans le bandeau du bas) ; les autres logos sont intacts, sans bandeau rouge.
- [ ] Renommer temporairement la table `Financeurs` : les financeurs disparaissent, sans erreur ni bandeau
      rouge. Remettre son nom. Même chose avec la colonne `logo` : les noms remplacent les logos partout.
- [ ] Remplacer un logo dans Grist puis recharger le widget : le nouveau logo apparaît (sans recharger, rien ne
      change : Grist ne prévient pas le widget d'un changement d'`Etablissements`).
- [ ] Un logo SVG qui n'a ni `width` ni `height` (seulement un `viewBox`) s'affiche à une taille raisonnable ;
      un logo en hauteur et une bannière large ont un poids visuel voisin de leurs voisins.
- [ ] Mise en page, en réduisant la section du widget : à partir de 1180px, le titre à gauche, les financeurs
      au centre (leur phrase de financement ne s'ajoute qu'à partir de 1320px), le profil à droite ; de 860 à
      1179px, les financeurs au-dessus du profil, à droite ; sous 860px, tout est empilé ; les financeurs du haut
      sont en niveaux de gris, le rond du bandeau du bas en couleurs ; quand la largeur utile du bandeau du bas
      passe sous 560px, ses logos se
      répartissent sur quatre colonnes au lieu de huit. Aucune barre de
      défilement horizontale, aucun logo déformé ni coupé.
- [ ] Console : aucune erreur, aucune adresse e-mail, ni jeton ni adresse d'image dans les lignes écrites par
      le widget (le navigateur, lui, en écrit une pour une image introuvable : ne pas la partager).
- [ ] Clavier et lecteur d'écran (au moins une fois) : un logo de carte se focalise avec Tab et s'active avec
      Entrée ; les logos sont lus par le nom de l'établissement ; le logo seul garde un nom accessible.
- [ ] La relecture d'une modification de fiche montre le logo de l'établissement sur les deux cartes, sans rien
      de cliquable.

## 15. Clavier et lecteur d'écran (1.14.1)

Les tests automatiques lisent l'arbre d'accessibilité de Chromium et comparent des captures avec et sans
focus : ils ne remplacent ni un lecteur d'écran réel, ni Firefox, ni Safari. **À jouer au moins une fois,
dans le vrai Grist** (la section du widget dans la page, pas la démonstration), avec le clavier seul. Pour un
lecteur d'écran : NVDA ou JAWS sous Windows, VoiceOver sous macOS ou iOS, TalkBack sous Android.

- [ ] Appuyer sur **Tab** depuis le début de la page : le focus passe, dans l'ordre, par l'interrupteur et le
      bouton de « Ma présence » (si on est identifié), le champ de recherche, les boutons de filtre, les
      boutons Fondateurs et Partenaires, Réinitialiser, puis les boutons et liens de chaque carte. À chaque
      arrêt, **un anneau violet de 2 px entoure le contrôle** ; aucun arrêt n'est invisible. **Maj+Tab** revient
      en arrière.
- [ ] Le champ de recherche : l'anneau entoure le cadre entier, loupe comprise, avec ses coins arrondis (pas
      seulement la ligne de saisie) ; il s'affiche aussi quand on clique dans le champ.
- [ ] Ouvrir un menu de filtre (Entrée ou Espace sur son bouton) puis tabuler : l'anneau suit la recherche du
      menu, les cases et les flèches de détail des domaines.
- [ ] À la souris, aucun anneau n'apparaît autour d'un bouton cliqué (sauf dans un champ de saisie).
- [ ] **Lecteur d'écran** : en arrivant sur le champ de recherche, il annonce **« Rechercher par nom ou
      prénom »** et un champ de recherche (pas « champ de saisie » sans nom, pas seulement l'invite grisée). Dans
      un menu ouvert, la recherche est annoncée « Rechercher dans … » suivi du nom du filtre.
- [ ] **Mode contraste élevé** (Windows : réglage « Contraste » ; Chrome : `forced-colors` émulé dans les outils
      de développement, onglet Rendu) : l'anneau de focus reste visible sur chaque contrôle.
- [ ] Zoom du navigateur à 200 % : l'anneau n'est coupé par aucun bord (ni celui de la barre d'outils, ni celui
      d'une carte, ni celui d'un menu).

## 16. Mode admin, e-mail et établissement (1.15.0)

À jouer avec un compte administrateur (case `admin` d'`ACL`) et un compte ordinaire,
sur une copie du document.

- [ ] Administrateur : le bandeau « Ma présence » porte un bouton « Mode admin » (absent
      pour un compte ordinaire). À l'ouverture il est éteint et seule la carte de
      l'administrateur a un bouton « Modifier ».
- [ ] Allumer le mode admin : le bouton passe à l'état appuyé, une bande « Mode admin : … »
      apparaît sous les filtres et toutes les cartes affichées portent « ✎ Modifier la
      fiche ». Recharger la page : le mode est éteint. Le rallumer au clavier (Tab, Entrée).
- [ ] Un administrateur sans fiche dans `BDD` : un bandeau « Administrateur » avec le seul
      bouton « Mode admin », sans interrupteur de présence.
- [ ] Modifier la fiche d'une autre personne : le titre est « Modifier la fiche de … », une
      phrase rappelle le mode admin, et les champs **E-mail** et **Établissement** sont
      modifiables (l'établissement parmi les noms complets). Sur sa propre fiche ils restent
      verrouillés.
- [ ] Changer l'e-mail pour une adresse que porte une autre fiche : « Cette adresse est déjà
      utilisée par … » (le nom si cette personne est visible dans l'annuaire, « une autre
      fiche » sinon). Une adresse mal formée, ou vidée, est refusée aussi.
- [ ] Choisir un établissement qui n'a pas validé sa présence : l'avertissement sous le champ,
      puis dans la relecture l'avis « … n'a pas validé sa présence : après cette modification,
      la fiche ne sera plus visible dans l'annuaire. ». Après « Valider », la carte disparaît.
- [ ] Changer l'e-mail : la relecture prévient que la table `ACL` ne suit pas. Après
      « Valider », `BDD.email` a changé et `ACL` est intacte.
- [ ] La relecture montre la nouvelle adresse et le nouvel établissement sur la carte
      « Après » (le badge d'établissement entouré), et « Valider » écrit tout en une seule
      action Grist (un seul « Annuler » de Grist défait tout).
- [ ] Après « Valider » : le message « La fiche de … est enregistrée. » apparaît six secondes.
- [ ] Prendre l'adresse choisie dans Grist (autre fenêtre) entre la relecture et « Valider » :
      « Cette adresse e-mail est maintenant celle d'une autre fiche : rien n'a été modifié »,
      rien n'est écrit.
- [ ] Console (contexte de l'iframe) : un compte ordinaire ne peut pas changer `email` ni
      `Etablissement` sur une fiche, avec la règle d'accès de l'étape 4 de `GRIST_SETUP.md`.
- [ ] Comparaison à la maquette v5 : ouvrir la maquette et le widget côte à côte à la même
      largeur (1280 px, puis 390 px) et vérifier la fenêtre de modification, la relecture,
      les repères de la carte « Après », le bandeau, la bande « Mode admin » et le message
      de confirmation. Les écarts voulus sont dans le CHANGELOG (1.15.0).
