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
  `normalize`, `compareLabels`, `formatPhone`, `safeValues`, `tableToRows`,
  `pickLabel`, `labelMapFromRows`, `groupLabelMap`, `refId`, `refLabel`, `isEmptyReference`,
  `resolveListItem`, `isInScope`, `createRequestSequencer`,
  `referenceMapsEqual`, `mailtoHref`.
- `tests/enrich.test.mjs` — `enrich` (établissement dans ses 3 encodages, rôle,
  catégories liste dont compétences et domaines, libellés sans doublon, anciennes
  colonnes ignorées, indicateurs) et `labelsOf`.
- `tests/etablissements.test.mjs` — `etablissementFlagsFromRows` (dont les
  doublons), `etablissementFlags` (par identifiant de ligne, repli sur le
  libellé), `isEtablissementEligible`, `filterVisibleEstablishments`.
- `tests/filters.test.mjs` — `filterContacts`, `pruneStaleFilters`,
  `computeFilterCounts` (dont les compteurs des domaines) et le menu rangé par
  domaine : `menuGroups`, `groupState`, `toggleGroup`, `selectionCount`.
- `tests/load-directory.test.mjs` — `loadDirectory()` avec un faux `docApi`
  (une lecture par table, aucune ancienne table lue, libellé corrigé
  prioritaire, tables indispensables illisibles, table de référence illisible,
  colonnes obligatoires, facultatives ou introuvables, annuaire vide expliqué,
  doublons d'acronymes, domaines des compétences).
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
  personne), `setPresence` (une écriture atomique, seule la case de la personne,
  plusieurs lignes, refus de Grist) et `explainWriteError`.
- `tests/profile.test.mjs` — `rightsFor` (qui peut modifier quelle fiche, fermé par
  défaut), `profileFormModel` et `draftOf`, `diffProfile` (textes nettoyés et refusés,
  téléphone français, références, listes en ajouts et retraits), `rebaseChanges`
  (ramener les changements sur la fiche actuelle) et `describeChanges`.
- `tests/profile-save.test.mjs` — `buildRowUpdate` (listes calculées sur la fiche
  actuelle, téléphone numérique ou texte), `signatureOf`, `readRow`, `prepareReview`
  (cartes avant et après, rien d'écrit), `saveProfile` (une seule action atomique,
  changement concurrent, refus de Grist, aucune adresse ni valeur dans la console) et
  `unsavedLabels`.
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
  statique, Chromium, faux Grist injecté dans la page.
- `tests/support/fake-attachments.mjs` — les pièces jointes du faux Grist pour les tests
  navigateur : des logos dessinés à la demande (proportions variées, un logo très haut,
  une bannière très large, un SVG sans dimensions), un fichier supprimé (404), un
  fichier qui n'est pas une image, et un compte des téléchargements et des jetons employés.
- `tests/constants.test.mjs` — cohérence de la taxonomie (`constants.js`),
  table principale `BDD`, libellé corrigé avant le libellé brut.
- `tests/rules.test.mjs` — règle du projet : aucun fichier de code ne lit la
  colonne `nom_de_domaine`.

Avec Playwright (`npm install --no-save playwright`, puis
`npx playwright install chromium`), `tests/e2e.test.mjs` exécute en plus 62
scénarios dans un vrai navigateur sur les données de `tests/fixtures.mjs`
(structure `BDD`) : nombre de contacts et badge établissement de chaque carte, interrupteurs
Fondateurs/Partenaires, recherche, filtres et compteurs, menu Compétences rangé par
domaine (case de domaine, détail replié, case partielle, recherche à deux niveaux,
ouverture réordonnée, badge, accessibilité), texte HTML affiché
sans injection, lien mailto, pannes de lecture (bandeau, cartes conservées), et le
bandeau « Ma présence » (personne identifiée ou non, compte Lecteur, interrupteur,
double clic, écriture refusée, personne sans fiche).
`CHROMIUM_PATH` désigne un Chromium déjà installé. Sans Playwright, ces
scénarios sont ignorés.

`tests/e2e-profile.test.mjs` y ajoute 43 scénarios sur la modification d'une fiche : qui
voit un bouton « Modifier » (personne ordinaire, administrateur, compte Lecteur,
anonyme, adresse inconnue, doublon), le formulaire et ses refus, la relecture (carte
avant et carte après, ce qui change repéré, rien d'écrit), l'écriture en une seule
action, la fiche modifiée par un administrateur, le téléphone numérique ou texte, un
refus de Grist, un changement concurrent, une fiche supprimée, le double clic, Échap,
un prénom piégé, le focus, la tabulation dans la fenêtre et l'affichage de 280 à 360px.

`tests/responsive.test.mjs` y ajoute 19 scénarios sur la mise en page, de 280 à
1920px de large, sur un jeu de données chargé (`tests/fixtures-responsive.mjs` :
noms, e-mails, fonctions et tags très longs, dont certains sans point de
coupure) : aucun défilement horizontal, texte contenu dans les cartes, nom
jamais sous le badge de l'établissement, trois, deux puis une colonne, barre
d'outils, menus de filtres (le menu Compétences déplié compris) entièrement dans le
cadre, cibles tactiles (écran
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
      correspondants restent.
- [ ] Recherche sur le prénom, pas seulement le nom.
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
- [ ] Menu Compétences ouvert et un domaine déplié, dans le cadre le plus étroit :
      aucune barre de défilement horizontale, un nom de compétence très long
      passe à la ligne (il ne déborde ni du menu ni de la page), la flèche et le
      nombre de chaque domaine restent visibles, et la flèche se touche sans
      viser.
- [ ] Carte avec un nom, un prénom et une fonction très longs : le nom tient sur
      deux lignes au plus, le badge d'établissement reste à sa droite, rien ne
      passe sous le badge ni hors de la carte.
- [ ] Téléphone ou tablette : toucher le champ de recherche ne zoome pas la page
      (champs à 16px), les badges, tags et le lien e-mail se touchent sans
      viser, et un filtre touché ne reste pas coloré une fois relâché.

## 13. Modifier sa fiche (1.12.0)

Réglages d'abord : `GRIST_SETUP.md` (colonnes de données, règles d'accès). À jouer sur
une **copie** du document, avec deux comptes (une personne ordinaire et un
administrateur) dans deux navigateurs, console ouverte.

- [ ] Personne ordinaire : un bouton « ✎ Modifier » sur sa seule carte, marquée
      « Votre fiche », et « Modifier mon profil » dans le bandeau. Aucune autre carte
      n'a de bouton.
- [ ] Administrateur : un bouton sur toutes les cartes ; celui de sa propre fiche ouvre
      « Modifier mon profil », les autres « Modifier la fiche de … ».
- [ ] Compte Lecteur, compte absent de `BDD`, document sans `Annuaire_Sonde` : aucun
      bouton.
- [ ] Ouvrir sa fiche : les champs contiennent les valeurs de Grist (le téléphone avec
      son 0 initial et ses espaces) ; l'e-mail et l'établissement sont affichés mais
      pas modifiables. La console ne dit pas `[SCHEMA] Types de colonnes illisibles`
      (sinon le widget suit la forme de la cellule : vérifier le téléphone plus bas).
- [ ] Changer la fonction, retirer un tag, en ajouter un, changer le téléphone, puis
      « Relire » : la carte « Avant » est la fiche actuelle, la carte « Après » montre
      les nouvelles valeurs repérées (relief et pastille « modifié » ou « ajouté » sur
      une ligne de texte, « + » devant un tag ajouté, tag retiré barré, ligne vidée
      barrée avec la pastille « supprimé »). **Rien n'a changé dans Grist** à ce stade.
- [ ] Une personne qui n'a pas accepté d'apparaître, ou dont l'établissement n'est pas
      validé : la relecture de sa fiche porte un avis qui le dit, avec la raison
      (« Votre fiche est masquée de l'annuaire… » / « Votre fiche reste masquée de
      l'annuaire : … »). Une personne visible n'a aucun avis.
- [ ] « Retour » : les saisies sont conservées. « Annuler » : rien n'est écrit.
- [ ] « Valider » : « Fiche enregistrée ». Dans Grist, seuls les champs modifiés ont
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
- [ ] Échap : avec des modifications, un premier appui avertit et un second ferme ;
      sans modification, un seul appui ferme. Pendant l'enregistrement, Échap ne ferme
      pas.
- [ ] Clavier et lecteur d'écran (au moins une fois, NVDA ou VoiceOver) : le titre de
      chaque étape est annoncé, « ajouté », « retiré » et « modifié » sont lus dans la
      carte « Après » (les pastilles sont du texte, les tags ont un mot caché), le focus revient au bouton d'origine à la fermeture.
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
