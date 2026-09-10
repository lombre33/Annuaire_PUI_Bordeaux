# Changelog

## 1.0.0 — Audit & stabilisation

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
