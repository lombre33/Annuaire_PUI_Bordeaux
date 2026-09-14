# Protocole de test

Ce widget n'a pas de test end-to-end automatisé contre une vraie instance
Grist (voir "Pourquoi pas d'E2E automatisé" plus bas). Ce document est le
protocole de test **manuel**, à exécuter dans Grist avant tout déploiement
qui touche `main.js`, `render.js`, `index.html` ou `style.css` — c'est-à-dire
tout ce que `node --test` ne peut pas exercer. Pour un changement limité à
`grist-data.js`/`filters.js` (fonctions pures), les tests automatisés
suffisent à condition d'être complétés pour le changement (voir plus bas).

## Tests automatisés

```
node --test
```

Couvrent (`tests/data.test.mjs`) : `text`, `normalize`, `compareLabels`,
`formatPhone`, `safeValues`, `tableToRows`, `pickLabel`, `refId`, `refLabel`,
`fetchTable` (succès, repli multi-colonnes, erreur réseau), `enrich`
(établissement dans ses 3 encodages, rôle, catégories liste, compétences),
`isInScope`, `filterContacts`, `createEmptyFilterState`, `pruneStaleFilters`,
`createRequestSequencer`, `referenceMapsEqual`.

Ne couvrent pas (structurellement, par choix d'architecture) : tout ce qui
touche `window.grist` ou le DOM réel — `main.js` (câblage, debounce,
sequencer *en conditions réelles*, `onRecords`) et `render.js` (construction
DOM). C'est le rôle du protocole manuel ci-dessous.

Si vous ajoutez une fonction pure à `grist-data.js` ou `filters.js` : ajoutez
son test dans `tests/data.test.mjs` avant de considérer le travail fini —
n'attendez pas une revue ultérieure pour le faire.

## Pourquoi pas d'E2E automatisé

Le widget appelle `window.grist`, qui n'existe que dans un document Grist
réel (pont iframe/postMessage, voir `grist-plugin-api.js`). Le simuler
fidèlement demanderait soit une dépendance supplémentaire (le projet est
volontairement à zéro dépendance npm), soit un mock qui ne testerait au
final que le mock. Le protocole manuel ci-dessous compense ce vide.

## Préparation

1. `npx serve .` ou `python3 -m http.server 8080` à la racine du dépôt (les
   modules ES ne se chargent pas via `file://`).
2. Dans Grist, ouvrir le document contenant la table `Annuaire`, ajouter (ou
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
      `Annuaire`, et le nombre de cartes affichées (`#resultCount`) est
      inférieur ou égal à N (seuls les contacts avec `perimetre_all` non
      vide s'affichent — voir `isInScope()`).
- [ ] Les 7 boutons de filtre (Actions, Tâches, Communautés, GT, Compétences,
      Instances, Établissement) sont présents dans la barre d'outils.
- [ ] Sur une carte avec toutes les infos renseignées : initiales correctes
      dans l'avatar, nom + prénom, fonction visible, badge établissement en
      haut à droite, email en lien `mailto:`, téléphone visible.
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

Spécifique **Compétences** :

- [ ] Repérer un contact dont une compétence en texte libre diffère par la
      casse ou les accents du libellé listé dans le menu (ex. carte affiche
      "oncologie", menu propose "Oncologie") — cocher l'option du menu doit
      inclure ce contact. *(Régression du correctif 1.4.0 — avant, un tel
      contact était silencieusement exclu.)* S'il n'existe pas de tel cas
      dans les données actuelles, il est prudent d'en créer un temporairement
      pour ce test, puis de le retirer.

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
- [ ] **Référence orpheline** : si un contact a une valeur `Etablissement`
      qui ne résout à aucun libellé (ni `Etablissement2` renseigné), la
      console doit afficher un `[ETABLISSEMENT] ... référence orpheline`
      listant ce contact — et sa carte ne doit pas afficher de badge
      établissement (ni de tag portant un id numérique brut, pour aucune
      catégorie).

## 8. Cas limites de données

- [ ] Contact sans aucune valeur dans les 7 catégories de tags → carte
      affichée sans section `card-tags` visible (pas de section vide).
- [ ] Contact avec `perimetre_all` vide → absent de la grille (et absent du
      compte `#resultCount`).
- [ ] Contact sans `Nom` ni `Prenom` → absent de la grille (filtré côté
      `main.js`, `c.Nom || c.Prenom`).
- [ ] Valeur d'établissement résolue uniquement via `Etablissement2` (pas de
      référence directe) → badge affiché correctement.

## 9. Vérifications techniques

- [ ] Panneau d'accès du widget dans Grist : niveau réellement accordé =
      `full` (cohérent avec `manifest.yml` et `window.grist.ready(...)`).
- [ ] Aucune erreur réseau (onglet Réseau des DevTools) sur les appels
      `fetchTable` des 8 tables de référence.
- [ ] Redimensionner/recharger le widget plusieurs fois de suite → pas
      d'accumulation d'erreurs ni de comportement différent au 2e/3e
      chargement (sanity check sur le `debounce`/`sequencer`).
