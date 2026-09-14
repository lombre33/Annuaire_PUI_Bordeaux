# Version 1.5.1 — Correctif urgent : tags de référence disparus en prod (voir CHANGELOG.md)

Régression de la 1.4.0 : les tables liées à Instances/Actions/GT/Communautés/
Tâches ont, en production, une "visible column" configurée — Grist envoie
donc leurs ReferenceList déjà résolues en texte, pas en id numérique brut
comme supposé. `enrich()` jetait silencieusement ces items au lieu de les
afficher. Nouvelle fonction `resolveListItem()` qui gère les deux formes,
comme `refLabel()`/`refId()` le faisaient déjà pour Établissement/Rôle PUI.