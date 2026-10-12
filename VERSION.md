# Version 1.8.0 — Nouvelle structure Grist : le widget lit la table BDD (voir CHANGELOG.md)

Le widget lit la table `BDD` et les tables de référence renommées (`Communautes`,
`Competences`, `INSTANCES`), avec le libellé corrigé de chaque table quand il est
rempli. L'établissement vient de la référence directe `BDD.Etablissement`. Les
règles d'affichage ne changent pas. 92 tests (dont 21 dans un vrai navigateur,
optionnels sans Playwright).
