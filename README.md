# Annuaire PUI Bordeaux — Custom Widget Grist

Widget custom Grist (HTML/CSS/JS natif, sans build ni dépendance npm) affichant
l'annuaire des membres du PUI sous forme de cartes filtrables. Le cahier des
charges complet est dans [`specs.md`](./specs.md).

## Architecture

Pas de bundler : le navigateur charge directement des modules ES natifs.

- `index.html` — structure de la page + template de carte.
- `style.css` — feuille de style (un seul fichier, non minifié à la main).
- `constants.js` — taxonomie des filtres/tags (`FILTERS`, `TAG_GROUPS`), source unique.
- `grist-data.js` — fonctions pures : lecture des tables Grist, conversion
  colonnes→lignes, enrichissement des contacts. Aucune dépendance au DOM.
- `filters.js` — état des filtres actifs + logique de filtrage (pure elle aussi).
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

Les tests couvrent les fonctions pures (`grist-data.js`, `filters.js`), y compris
un test de non-régression sur le filtre `perimetre_all` (voir CHANGELOG).
Node ≥ 18 suffit (testé avec Node 22), aucune dépendance à installer.

Il n'y a pas de test end-to-end automatisé contre une vraie instance Grist —
avant chaque déploiement, valider manuellement dans Grist :
recherche, chacun des 7 filtres seul puis combinés, bouton Réinitialiser,
état vide, clic sur un tag (carte ou établissement) pour filtrer.

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
