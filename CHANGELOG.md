# Changelog

## 1.7.0 — Défaut Partenaires désactivé, en-tête PUI Bordeaux, compteurs par option

- **Scope Fondateurs/Partenaires** : "Partenaires" est désormais décoché par
  défaut au chargement (Fondateurs reste coché). Le bouton "Réinitialiser" ne
  touche plus du tout ces 2 interrupteurs — un choix fait par l'utilisateur
  pendant la session (ex: activer Partenaires) survit à un clic sur
  "Réinitialiser", qui ne remet à zéro que les autres filtres/la recherche.
- **En-tête** : remplace le bloc eyebrow/titre/sous-titre ("Annuaire PUI
  Bordeaux" / "Annuaire des membres" / "Retrouvez les contacts...") par
  "PUI Bordeaux" (titre) / "Annuaire des accompagnateurs de l'innovation"
  (sous-titre) / "Pas de mauvaise porte, toujours le bon interlocuteur"
  (accroche, nouvelle classe `.tagline`). Classe `.eyebrow` (devenue inutile)
  retirée du CSS.
- **Compteurs par option de filtre** : chaque option d'un menu de filtre
  affiche désormais à droite le nombre de cartes qui correspondraient si on
  la cochait, compte tenu de tous les AUTRES filtres déjà actifs (recherche,
  scope, autres catégories) — pas seulement un total brut. Réutilise la
  classe `.option-count`, présente dans le CSS mais inutilisée jusqu'ici.
  - `filterContacts()` (filters.js) prend un 5e paramètre optionnel
    `excludeKey` : saute la vérification d'une catégorie, pour calculer son
    propre compte sans que sa propre sélection ne le fausse.
  - Nouvelle fonction pure `computeFilterCounts()` (filters.js), qui tallie
    par catégorie et par libellé normalisé (cohérent avec le matching
    insensible casse/accents déjà en place).
  - `createFilterUI()` affiche le compte initial ; nouvelle fonction
    `updateFilterCounts()` (render.js) rafraîchit TOUS les menus après
    chaque `refreshCards()` (recherche, scope, filtre, reset) sans perturber
    un menu ouvert (même principe que `updateFilterUI()`).
- **Tests** : couverture de `excludeKey` et `computeFilterCounts()` (45/45
  tests passent).

## 1.6.0 — Filtrage par statut d'établissement (fondateur/partenaire/ok_pour_apparaitre)

**Feature** : les cartes ne sont désormais visibles que si l'établissement du
contact est fondateur OU partenaire (jamais "autres"), ET a validé son
apparition (colonne `ok_pour_apparaitre`). Ces 4 colonnes booléennes vivent
dans la table Etablissements (cf. `grist_structure.txt`).

- Nouvelles fonctions pures (`grist-data.js`) : `fetchEtablissementsFlags()`
  (charge la table Etablissements et indexe fondateur/partenaire/
  ok_pour_apparaitre par id de ligne ET par libellé résolu — même ambiguïté
  d'encodage Grist que pour le reste de la table, voir refId()/refLabel()),
  `etablissementFlags()` (résout les indicateurs d'un contact) et
  `isEtablissementEligible()` (la règle d'éligibilité : ok_pour_apparaitre ET
  (fondateur OU partenaire) ; un contact sans établissement identifiable dans
  la table — repli Etablissement2, référence orpheline — est exclu par
  défaut, faute de validation à faire valoir).
- `enrich()` attache `etablissement_fondateur` / `etablissement_partenaire` /
  `etablissement_ok_pour_apparaitre` à chaque contact (3e paramètre optionnel
  `etabFlags`, rétrocompatible).
- `main.js` applique `isEtablissementEligible()` en filtre fixe (non
  désactivable) avant tout affichage.
- **UI** : 2 interrupteurs sobres "Fondateurs" / "Partenaires" dans la barre
  d'outils (cochés par défaut), pour affiner l'affichage parmi les contacts
  déjà éligibles ci-dessus — pilotés par `filterContacts(..., scope)`
  (`filters.js`), un 4e paramètre optionnel distinct des menus `FILTERS`
  existants (2 interrupteurs fixes, pas une liste de valeurs Grist).
- **Tests** : couverture complète des nouvelles fonctions pures et du
  paramètre `scope` de `filterContacts()`.

## 1.5.1 — Correctif urgent : tags Instances/Actions/GT/Communautés/Tâches disparus en prod

Régression introduite par le correctif "#7" de la 1.4.0 (qui retirait
l'affichage d'un id numérique brut quand une référence ne résolvait à aucun
libellé). Constatée en production le jour même du déploiement de 1.4.0/1.5.0 :
plus aucun tag Instances/Actions/GT/Communautés/Tâches sur aucune carte,
filtres correspondants inopérants (Établissement et recherche libre non
affectés).

**Cause réelle** : les tables liées à ces 5 colonnes ReferenceList ont, en
production, une "visible column" configurée — Grist envoie donc les items de
la liste déjà résolus en texte (ex. `['L', 'CME']`), pas en id numérique brut
(`['L', 7]`) comme supposé. `enrich()` cherchait
`referenceMaps['Instances'][String('CME')]`, qui échoue nécessairement (la
table est indexée par id numérique, pas par texte) — l'item était alors jeté
par le correctif 1.4.0 au lieu d'être affiché. Avant 1.4.0, un fallback
`|| text(id)` masquait ce cas par coïncidence (`text('CME') === 'CME'`) ; ce
même fallback affichait aussi, à tort, l'id numérique brut ("47") quand une
référence était réellement introuvable — les deux cas partageaient le même
code et ne pouvaient pas être distingués sans le corriger correctement.

C'est exactement le risque identifié — mais classé comme non confirmé,
donc non traité — lors de l'audit archi/sécurité (angle "invariants",
voir historique de la revue) : la même ambiguïté texte-déjà-résolu/id-brut
qui avait cassé Établissement (CHANGELOG 1.1.0-1.1.2) pouvait aussi affecter
les colonnes ReferenceList. Elle s'est avérée réelle.

- **Correctif** : nouvelle fonction `resolveListItem(item, referenceMap)`
  (grist-data.js), utilisée par `enrich()` pour chaque item d'une
  ReferenceList — gère le texte déjà résolu (retourné tel quel) ET l'id
  numérique brut (résolu via la table de référence, `''` si introuvable,
  toujours filtré ensuite). Signature volontairement proche de
  `refLabel()`/`refId()`, qui géraient déjà ce même risque pour les
  Références uniques (Établissement, Rôle PUI).
- **Tests** : régression figée explicitement — `resolveListItem` testé sur
  les 2 formes, et un test `enrich()` dédié reproduit le scénario exact
  constaté en prod (items ReferenceList pré-résolus en texte).

## 1.5.0 — Valeurs cochées en tête de menu + badge de comptage

- **Feature** : dans chaque menu de filtre, la ou les valeurs cochées
  remontent en tête de liste (le reste des options reste trié
  alphabétiquement en dessous) — nouvelle fonction pure
  `sortWithCheckedFirst()` (grist-data.js), utilisée à la construction du
  menu. Le bouton du filtre affiche en plus un badge avec le nombre de
  valeurs cochées (`.filter-count` — CSS déjà présente dans le projet mais
  inutilisée depuis le retrait de cette fonctionnalité en v0.98 ; simplement
  reconnectée).
- Une case cochée/décochée met à jour uniquement le menu concerné
  (`updateFilterUI()`, render.js) sans reconstruire tout le DOM des filtres —
  un autre menu resté ouvert, ou une recherche tapée dedans, n'est pas
  perturbé (même principe que le correctif 1.4.0 sur `createFilterUI`).
  Attention lors de la mise à jour de cette fonction : l'ordre au sein de
  chaque groupe (coché / non coché) est recalculé par tri explicite à chaque
  appel, pas déduit de l'ordre DOM existant — une valeur qui passe de cochée
  à non cochée doit reprendre sa place alphabétique, pas rester figée là où
  elle se trouvait juste avant (piège identifié et corrigé pendant le
  développement de cette version, voir le test associé dans
  `tests/data.test.mjs`).
- **Même comportement quelle que soit l'origine du clic** : cocher une case
  dans un menu, cliquer le badge établissement d'une carte, ou cliquer un tag
  de carte (Instances/Actions/GT/Compétences/Communautés/Tâches) déclenchent
  tous la même fonction `toggleFilter()` dans `main.js` — `updateFilterUI()`
  y est appelée une seule fois pour couvrir les trois cas. Point d'attention
  spécifique aux clics venus d'une carte : ils ne passent jamais par la case
  à cocher du menu (qui peut même ne pas être montée si le menu n'a jamais
  été ouvert) — `updateFilterUI()` resynchronise donc explicitement l'état
  `checked` de la case, pas seulement l'habillage visuel, sans quoi rouvrir
  le menu après un clic sur une carte aurait montré une case décochée pour un
  filtre pourtant actif.

## 1.4.0 — Audit & stabilisation (2) : 9 correctifs + refonte enrich()/constants.js

Suite à une revue d'architecture/sécurité complète (agents indépendants sur
8 angles : correction, invariants, traçage inter-fichiers, réutilisation,
simplification, efficacité, altitude, conventions — chaque candidat
re-vérifié indépendamment avant retenue). Aucun changement de périmètre
fonctionnel : les correctifs alignent le comportement sur `specs.md`, rien
n'est ajouté ni retiré côté fonctionnalités utilisateur.

**Correctifs (bugs) :**

- **Tag "Rôle PUI" invisible sur toutes les cartes, quelles que soient les
  données.** `enrich()` ne posait que `role_label` (singulier), jamais lu
  nulle part — `TAG_GROUPS`/`render.js` attendent `role_labels` (pluriel,
  convention commune à tous les groupes de tags). `enrich()` pose désormais
  `role_labels` comme un tableau (0 ou 1 élément), au même titre que les
  autres catégories.
- **Numéros de téléphone affichés sans leur 0 initial.** `numero_de_telephone`
  est une colonne Grist **Numeric** : un numéro saisi `0556789012` est stocké/
  renvoyé comme `556789012` (un type numérique ne peut pas porter de zéro
  initial). Nouvelle fonction `formatPhone()` (grist-data.js) qui rétablit le
  0 pour tout numéro à 9 chiffres et formate par paires ("05 56 78 90 12") ;
  tout format inattendu est renvoyé tel quel plutôt que déformé.
- **Filtre "Compétences" silencieusement inefficace en cas de casse/accents
  différents.** Le menu "Compétences" liste les libellés de la table
  `Competances`, mais chaque contact a ses tags dans 15 colonnes de texte
  libre (`competences_1`..`15`) — deux sources jamais recoupées. Nouvelle
  fonction `normalize()` (casse + accents, via `NFD` + `\p{Diacritic}`)
  utilisée pour le matching de tous les filtres catégorie ainsi que pour la
  recherche libre nom/prénom (strictement plus permissive que l'ancien
  `toLocaleLowerCase('fr-FR')` seul : aucune recherche qui fonctionnait avant
  ne peut cesser de fonctionner).
- **Sélection de filtre bloquée silencieusement à 0 résultat après un
  renommage côté Grist.** `activeFilters` est indexé par libellé (pas par
  id) ; renommer un établissement/une instance/etc. dans Grist laissait
  l'ancien libellé coché dans un Set sans case à cocher correspondante pour
  le décocher — seul "Réinitialiser" (qui vide tout) permettait de s'en
  sortir. Nouvelle fonction `pruneStaleFilters()` (filters.js), appelée à
  chaque rafraîchissement des tables de référence : retire une sélection
  qui n'est plus une option valide du menu, sans toucher à une sélection
  simplement sans contact correspondant pour l'instant (ce n'est pas la même
  chose).
- **Rendu périmé possible en cas d'éditions rapprochées dans Grist.**
  `window.grist.onRecords` peut se redéclencher avant la fin d'un appel
  précédent (8 `fetchTable()` en vol) ; sans garde, l'invocation la plus
  lente pouvait résoudre en dernier et écraser un affichage plus récent avec
  des données périmées. Nouveau `createRequestSequencer()` (grist-data.js) :
  seule l'invocation la plus récente est autorisée à appliquer son résultat.
- **Menus de filtres fermés/vidés à chaque édition, même sans rapport avec
  les filtres.** `createFilterUI()` (destructive : ferme tout menu ouvert,
  vide les recherches internes) et le rafraîchissement des 8 tables de
  référence s'exécutaient à chaque déclenchement de `onRecords`, y compris
  pour l'édition d'un seul champ d'un seul contact. Nouvelle fonction
  `referenceMapsEqual()` : la reconstruction des menus n'a lieu que si le
  contenu des tables de référence a réellement changé. `onRecords` est en
  plus désormais *debounced* (250 ms) pour absorber les rafales d'éditions.
- **Libellé de référence vide affichait l'id numérique brut comme tag.** Pour
  Instances/Actions/GT/Communautés/Tâches, un id sans libellé résolu
  retombait sur `text(id)` (ex: la carte affichait "47"). `enrich()` ignore
  désormais un id non résolu plutôt que d'afficher sa valeur numérique brute
  — cohérent avec le reste du widget, où un champ non renseigné est
  simplement absent plutôt qu'affiché avec une valeur factice.
- **Tri des menus de filtres non francophone.** `[...].sort()` par défaut
  classe par code UTF-16 (majuscules avant minuscules, ex: "UBM" avant
  "chu"), contrairement au reste du fichier qui utilise déjà
  `toLocaleLowerCase('fr-FR')`. Nouvelle fonction `compareLabels()`
  (`localeCompare(..., 'fr-FR')`), réutilisée pour ce tri.
- **Élément de template mort.** `<p class="structure detail-row">` dans le
  template de carte (`index.html`) n'était sélectionné nulle part dans
  `render.js` — retiré (aucun impact visuel, il était déjà invisible).

**Refactor (base saine, sans impact fonctionnel) :**

- `constants.js` est maintenant la seule source de la liste des tables à
  charger : `main.js` dérive `REFERENCE_TABLES` de `FILTERS` (+ nouveau
  `ROLE_REFERENCE` pour `Role_Dans_le_PUI`, qui n'a pas de filtre dédié) au
  lieu de dupliquer table/champ à la main — les deux listes avaient déjà
  divergé (`FILTERS.etablissement.field` valait encore `'acronyme'` seul).
- `TAG_GROUPS` ne contient plus `etablissement` (son entrée y était morte :
  l'établissement a son propre badge dédié sur la carte, pas une section de
  tags générique) — supprime un faux signal lors de la lecture du code.
- `enrich()` : les 5 blocs quasi identiques pour Instances/Actions/GT/
  Communautés/Tâches sont remplacés par une seule boucle pilotée par une
  table de correspondance (`LIST_REFERENCE_FIELDS`) — un futur ajout de
  catégorie est une ligne, pas un bloc copié-collé à 3 tokens à modifier
  (source du risque documenté lors de l'audit).
- `filters.js` : suppression du cas particulier `etablissement` dans
  `filterContacts()` — `enrich()` produit maintenant `etablissement_labels`
  au même format que toutes les autres catégories.
- Diagnostic console `[ETABLISSEMENT]` (main.js) : retrait de l'échantillon
  de valeur brute (question tranchée depuis la 1.1.2, devenu bruit à chaque
  chargement) ; conservation du signalement des références orphelines,
  toujours utile.

**Tests :** voir [`tests/data.test.mjs`](tests/data.test.mjs) — nouveaux tests
pour `normalize()`, `compareLabels()`, `formatPhone()`, `createRequestSequencer()`,
`referenceMapsEqual()`, `pruneStaleFilters()`, `fetchTable()` (succès, repli
multi-colonnes, erreur réseau — chemins jamais testés jusqu'ici), le
comportement révisé d'`enrich()` (dont un test qui verrouille explicitement
le mapping colonne→table→sortie pour les 5 catégories liste, contre une
future erreur de copier-coller sur `LIST_REFERENCE_FIELDS`). Voir aussi
[`TESTING.md`](TESTING.md), nouveau protocole de test manuel exhaustif à
exécuter avant chaque déploiement (complète les tests automatisés, qui ne
couvrent que les fonctions pures — pas `main.js`/`render.js`, DOM et
`window.grist` réels non simulables sans dépendance supplémentaire).

## 1.3.1 — Retour à 3 colonnes

La grille à 4 colonnes (1.3.0) ne convainc pas à l'usage. Retour à 3 colonnes
en gardant la carte compacte : `repeat(4,minmax(210px,1fr))` ->
`repeat(3,minmax(240px,1fr))`, gap inchangé (14px). Le style de carte
(avatar/police/tags resserrés) n'est pas concerné.

## 1.3.0 — Carte contact compacte, grille à 4 colonnes

Suite à trois maquettes comparées (dense/tags résumés+N/ligne condensée), la
direction "dense, même structure" a été retenue et implémentée (CSS uniquement,
structure HTML/JS inchangée) :

- Avatar 54px -> 38px, nom 18px -> 14px, badges/tags/titres de groupe resserrés
  d'environ 30%, espacements entre sections réduits.
- Grille de cartes : 3 colonnes (min 280px) -> 4 colonnes (min 210px), gap
  16px -> 14px. Le minimum de 210px reste sous la largeur réellement
  disponible à la largeur plancher du widget (`body{min-width:980px}`) pour
  éviter un débordement horizontal du dernier au premier chargement.
- Nom et badge établissement tronqués en ellipse (`text-overflow:ellipsis`)
  au-delà d'une largeur donnée — la carte compacte laisse moins de place aux
  cas rares de nom ou d'acronyme d'établissement très long.

## 1.2.0 — Recherche libre dans chaque dropdown de filtre

- **Feature** : un champ de texte apparaît en haut de chaque menu de filtre
  (Actions, Établissement, Instances...) pour rechercher parmi les options par
  nom, sans avoir à faire défiler la liste. Filtrage purement visuel côté DOM
  (`option.hidden`), n'affecte pas les cases cochées ni les contacts affichés.
  Le bouton "Réinitialiser" vide aussi ces champs (l'UI des filtres est
  reconstruite, comme pour les cases à cocher).

## 1.1.2 — Établissement : encodage réel confirmé (texte déjà résolu)

Le correctif 1.1.1 (hypothèse `['R', tableId, rowId]`) n'avait toujours aucun
effet visible. Le diagnostic console ajouté dans ce même correctif a permis de
trancher sans deviner : `contact.Etablissement` arrive en réalité comme une
**chaîne déjà résolue** (ex: `"UBM"`), pas un id ni un tableau encodé. La table
`Etablissements` a une "visible column" configurée côté Grist (probablement
`acronyme`), donc l'API renvoie directement le texte d'affichage — alors que
d'autres tables liées (Instances, Actions...) n'ont pas cette config et
renvoient un id brut à résoudre nous-mêmes. Le code faisait
`referenceMaps['Etablissements'][String(contact.Etablissement)]`, soit
`referenceMaps['Etablissements']["UBM"]` — une map indexée par id numérique,
donc échec systématique et silencieux, pour 100% des contacts (319/319 dans
les logs), indépendamment de l'état d'`acronyme`/`nom_complet` en base.

- **Correctif** : nouvelle fonction `refLabel(value, referenceMap)` qui gère
  les 3 formes possibles d'une Référence unique (texte déjà résolu / id nu /
  `['R', ...]`) plutôt que d'en supposer une seule. Appliquée à `Etablissement`
  et `Role_dans_le_PUI`. `refId()` est conservé comme brique interne mais ne
  traite plus une chaîne comme un id.
- **Tests** : cas `refLabel('UBM', ...)` ajouté — c'est la forme réellement
  observée en production, désormais couverte explicitement.

## 1.1.1 — Établissement toujours invisible : mauvais encodage de la Référence

Le correctif 1.1.0 n'avait aucun effet visible (confirmé par test en conditions
réelles) : il traitait le mauvais problème. La vraie cause :

- **Correctif** : `contact.Etablissement` est une colonne Référence **unique**
  (pas une liste). L'API Grist encode ce type `['R', tableId, rowId]`, pas un
  simple nombre — contrairement à une ReferenceList, dont les éléments internes
  restent des nombres nus une fois le marqueur `['L', ...]` retiré (c'est pour
  ça que les filtres Instances/Actions/GT etc. fonctionnaient déjà). Le code
  faisait `String(contact.Etablissement)` en supposant un nombre brut, ce qui
  donnait une clé du type `"R,Etablissements,42"` ne correspondant à rien dans
  la table de référence — échec silencieux, quel que soit l'état d'`acronyme`/
  `nom_complet`. Nouvelle fonction `refId()` qui normalise `['R', ...]` (ou un
  id déjà nu) vers l'id numérique. Appliquée à `Etablissement` et
  `Role_dans_le_PUI` (même type de colonne, même bug potentiel).
- **Outillage** : le diagnostic console `[ETABLISSEMENT] ...` affiche
  maintenant un exemple de valeur brute (avec son type JS) en plus des
  comptages, pour confirmer l'encodage réel sans avoir à deviner.

## 1.1.0 — Établissement invisible sur les cartes / filtre non fonctionnel

- **Correctif** : la référence `Etablissement` était bien renseignée côté
  Grist pour la plupart des contacts, mais son libellé ne se résolvait pas
  systématiquement — certaines lignes de la table `Etablissements` n'ont que
  `nom_complet` de rempli, pas `acronyme` (seule colonne utilisée jusqu'ici
  pour construire le libellé). `fetchTable()` accepte désormais une liste de
  colonnes de repli (`['acronyme', 'nom_complet']`) ; la première non vide
  gagne. Comme le filtre "Établissement" (dropdown + correspondance carte)
  est construit sur les mêmes libellés que les cartes, ce correctif répare
  aussi le filtre, sans logique supplémentaire côté filtre.
- **Outillage** : ajout d'un diagnostic console (`[ETABLISSEMENT] ...`) au
  chargement du widget, qui distingue "pas de référence Etablissement du
  tout" de "référence présente mais id introuvable dans la table
  Etablissements" (référence orpheline) — les deux donnent le même symptôme
  (rien ne s'affiche) mais pas la même cause côté données. Si un contact reste
  sans établissement après ce correctif, la console navigateur (F12) indique
  lequel des deux cas s'applique.
- **Tests** : `pickLabel()` (choix de la colonne de repli) et `enrich()`
  (résolution du libellé établissement, y compris le cas d'une référence
  orpheline) sont couverts par de nouveaux tests unitaires.

## 1.0.0 — Audit & stabilisation

- **Sécurité** : purge complète de l'historique git (`git filter-repo`) — l'ancien schéma complet du document Grist (fichiers `grist_structure.txt` et `grist_structure`) n'est plus reachable dans aucun commit, sur aucune branche. Historique réécrit, tous les hash de commit ont changé.
- **Sécurité** : `manifest.yml` et `window.grist.ready(...)` déclarent désormais `accessLevel: full`, confirmé comme l'accès réellement accordé au widget côté Grist (l'ancienne déclaration `read table` ne reflétait pas la réalité — le widget lit plusieurs tables tierces via `fetchTable`).
- **Sécurité** : `grist_structure.txt` ne contient plus que les tables/colonnes
  effectivement utilisées par le widget. La version précédente exposait, sur un
  dépôt public, le schéma complet du document Grist source (dont une table
  d'identifiants/session et une réplique d'un système d'authentification tiers
  avec des noms de colonnes évoquant des secrets — aucune valeur réelle n'était
  présente, seulement le schéma).
- **Correctif** : le filtre backend `perimetre_all` ("n'afficher que les
  contacts ayant au moins une valeur dans perimetre_all") ne filtrait en
  réalité rien. Grist encode les colonnes liste sous la forme `['L', ...]` ;
  une liste vide est `['L']` (longueur 1), donc le test `p.length > 0` était
  toujours vrai. Le filtre réutilise désormais `safeValues()`, qui retire déjà
  ce marqueur ailleurs dans le code (`isInScope()` dans `grist-data.js`).
  Test de non-régression ajouté dans `tests/data.test.mjs`.
- **Refactor** : `app.js` (345 lignes, monolithique) est réparti en modules ES
  natifs (`constants.js`, `grist-data.js`, `filters.js`, `render.js`,
  `main.js`), sans ajout de dépendance ni de build. La logique
  métier (filtrage, enrichissement des contacts) est désormais testable
  indépendamment du DOM.
- **Doc** : `manifest.yml` pointait vers une URL placeholder
  (`VOTRE-USER.github.io/grist-annuaire-widget`) ; corrigé vers l'URL GitHub
  Pages réelle. Ajout d'un `README.md` (architecture, tests, déploiement,
  accès Grist à vérifier) et de ce changelog.
- **Tests** : premiers tests unitaires (`node --test`), zéro dépendance.

## Historique antérieur

Voir `git log` — développement initial jusqu'à la v0.98 (voir `VERSION.md`
pour la dernière note de version avant cet audit).
