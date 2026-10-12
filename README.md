# Annuaire PUI Bordeaux — Custom Widget Grist

Widget custom Grist (HTML/CSS/JS natif, sans build ni dépendance npm) affichant
l'annuaire des membres du PUI sous forme de cartes filtrables. Le cahier des
charges complet est dans [`specs.md`](./specs.md).

## Architecture

Pas de bundler : le navigateur charge directement des modules ES natifs.

- `index.html` — structure de la page + template de carte.
- `style.css` — feuille de style (un seul fichier, non minifié à la main).
- `constants.js` — taxonomie, source unique : `CATEGORIES` donne, pour chaque
  catégorie (actions, instances, compétences, établissement, rôle...), son
  libellé, sa couleur, sa table de référence et sa colonne dans `Annuaire` ;
  `FILTERS`, `TAG_GROUPS`, `REFERENCE_TABLES` et `LIST_CATEGORIES` en sont
  dérivés. Ajouter une catégorie = une entrée ici.
- `grist-data.js` — lecture des tables Grist (`loadDirectory()`, seule
  fonction qui appelle `docApi`), conversion colonnes→lignes, enrichissement
  des contacts (`contact.labels[clé]`, lu par `labelsOf()`). Aucune dépendance
  au DOM.
- `filters.js` — état des filtres actifs + logique de filtrage (fonctions pures).
- `render.js` — construction du DOM (cartes, menus de filtres). Pas de logique métier.
- `main.js` — point d'entrée : câble `window.grist` et les événements DOM aux
  modules ci-dessus.
- `grist_structure.txt` — schéma Grist **réduit aux seules tables/colonnes lues
  par le widget**. Voir la note de sécurité plus bas.

Cette segmentation vise à limiter le risque de régression : la logique de
filtrage/enrichissement est testable indépendamment du DOM et de Grist.

## Tests

```
node --test
```

Sans rien installer (Node ≥ 18, testé avec Node 22), `node --test` exécute les
tests unitaires (`tests/*.test.mjs`, un fichier par module) : lecture des tables Grist
(`loadDirectory()` avec un faux `docApi`), résolution des Références,
enrichissement des contacts, filtrage, et plusieurs tests de non-régression
(filtre `perimetre_all`, tag « Rôle PUI », fallback établissement, pannes de
lecture — voir CHANGELOG).

`tests/e2e.test.mjs` charge le vrai `index.html` (`main.js`, `render.js`) dans
Chromium avec une API Grist simulée et vérifie ce que voit l'utilisateur
(nombre de contacts, badge `Etablissement2`, filtres, bandeau d'état). Il est
ignoré tant que Playwright n'est pas installé — ce n'est pas une dépendance du
widget :

```
npm install --no-save playwright
npx playwright install chromium
node --test
```

Ces tests ne remplacent pas un essai dans un vrai document Grist : voir
[`TESTING.md`](TESTING.md) pour le protocole manuel à exécuter avant chaque
déploiement.

## Développement local

Les modules ES ne se chargent pas via `file://` (CORS). Servir le dossier avec
un serveur statique, par exemple :

```
npx serve .
# ou
python3 -m http.server 8080
```

Le widget appelle `window.grist`, qui n'existe que dans le contexte d'un
document Grist réel — pour un test fonctionnel complet, il faut l'ouvrir
comme custom widget dans Grist (URL du serveur local), pas en accédant à
`index.html` isolément.

## Déploiement

Le widget est servi statiquement via GitHub Pages depuis ce dépôt
(`https://lombre33.github.io/Annuaire_PUI_Bordeaux/`), déclarée dans
`manifest.yml`. Un `git push` sur la branche par défaut met à jour le widget en
production immédiatement pour tous les documents Grist qui l'utilisent — pas
de rollback automatique. Taguer les versions stables (`git tag vX.Y.Z`) pour
pouvoir revenir en arrière facilement si besoin.

## Limites connues

- **Modifier une table de référence ne rafraîchit pas le widget.** Grist ne
  prévient le widget que des changements de la table `Annuaire`. Après avoir
  modifié `Etablissements` (par exemple `ok_pour_apparaitre`) ou une autre
  table de référence, recharger le widget pour voir le changement.
- **Établissement sans acronyme** : le widget identifie l'établissement d'un
  contact par `Etablissement2`, qui doit être égal à l'acronyme de la ligne
  d'`Etablissements` (ou à son nom complet quand l'acronyme est vide). Si la
  formule d'`Etablissement2` renvoie autre chose, le contact ne correspond à
  aucune ligne et reste masqué.
- **Script de l'API Grist** : `index.html` charge `grist-plugin-api.js` depuis
  `docs.getgrist.com`, sans version figée. Le charger depuis l'instance
  utilisée (`grist.numerique.gouv.fr`) serait plus cohérent, mais ne se vérifie
  que dans un vrai document Grist : non modifié.

## Accès à la donnée Grist

Confirmé côté Grist (panneau d'accès du widget) : l'accès réel est `full`,
pas `read table`. C'est cohérent avec le code, qui lit plusieurs tables
tierces via `grist.docApi.fetchTable(...)` (`Actions`, `Taches`,
`Etablissements`, etc.) — `read table` n'aurait donné accès qu'à la table
liée à la section du widget. `manifest.yml` et `window.grist.ready(...)`
déclarent maintenant `full` pour refléter la réalité.

Implication : ce widget a une visibilité en lecture sur l'ensemble du
document Grist, pas seulement sur les tables listées dans ce README — y
compris sur des tables sans rapport avec l'annuaire. Réduire ce périmètre
(par exemple en isolant l'annuaire et ses tables de référence dans un
document Grist dédié, ou en repensant l'accès) est une piste à évaluer
séparément ; ce n'est pas traité par cet audit.

## Note de sécurité

Le document Grist source contient, en plus des tables utilisées par ce widget,
d'autres tables sans rapport avec l'annuaire (dont une table d'identifiants/
session et une réplique d'un système d'authentification tiers). Ne jamais
copier le schéma complet du document dans ce dépôt : `grist_structure.txt` ne
doit contenir que les tables/colonnes listées dans la section Architecture
ci-dessus.
