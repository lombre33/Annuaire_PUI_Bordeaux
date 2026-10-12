# Version 1.7.1 — Pannes de lecture Grist visibles, chargement unique, test navigateur (voir CHANGELOG.md)

Un échec de lecture Grist ou une colonne manquante affiche désormais un
bandeau explicite au lieu d'un « 0 contact » silencieux. Les tables sont lues
une seule fois par chargement, les acronymes d'établissement en double ne
dépendent plus de leur ordre, et le lien mailto n'est créé que pour une adresse
simple. 76 tests (dont 20 dans un vrai navigateur, optionnels sans Playwright).
