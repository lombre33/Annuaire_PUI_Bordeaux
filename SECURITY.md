# Politique de sécurité

Ce dépôt contient le widget « Annuaire PUI Bordeaux » pour Grist. Il est public : une faille décrite dans une *issue* serait lisible par tout le monde.

## Signaler un problème de sécurité

- Utilisez le signalement privé de vulnérabilités de GitHub (onglet **Security** du dépôt, bouton **Report a vulnerability**) s'il est activé.
- Sinon, contactez directement le propriétaire du dépôt (compte GitHub [`lombre33`](https://github.com/lombre33)).
- N'ouvrez pas d'*issue* publique pour une faille.

Précisez la version concernée (voir [`VERSION.md`](VERSION.md)), ce que vous avez observé et, si possible, comment le reproduire avec le jeu de démonstration (`node docs/demo/serveur-demo.mjs`) et non avec des données réelles.

## Versions corrigées

Seule la dernière version publiée est corrigée : c'est celle de la branche `main`, servie par GitHub Pages aux documents Grist qui l'utilisent.

## Pour aller plus loin

[Sécurité et confidentialité](docs/securite.md) décrit l'accès demandé à Grist, ce que le widget écrit, les données personnelles, les risques connus et les recommandations.
