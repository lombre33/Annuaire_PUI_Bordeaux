# Version 1.7.2 — Refactor sans changement de comportement (voir CHANGELOG.md)

Le code est réorganisé pour se lire et se modifier plus facilement : taxonomie
déclarée une seule fois (`constants.js`), libellés d'un contact regroupés dans
`labels`, fonctions longues découpées, tests répartis par module. L'affichage et
les règles sont identiques à la 1.7.1. 82 tests (dont 20 dans un vrai
navigateur, optionnels sans Playwright).
