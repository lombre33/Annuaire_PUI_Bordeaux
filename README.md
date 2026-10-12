<div align="center">

# Annuaire PUI Bordeaux

**Le widget Grist qui retrouve, en quelques clics, le bon interlocuteur du Pôle universitaire d'innovation de Bordeaux.**

*Pas de mauvaise porte, toujours le bon interlocuteur.*

[![Tests](https://github.com/lombre33/Annuaire_PUI_Bordeaux/actions/workflows/tests.yml/badge.svg)](https://github.com/lombre33/Annuaire_PUI_Bordeaux/actions/workflows/tests.yml)
![Widget personnalisé Grist](https://img.shields.io/badge/Grist-widget%20personnalis%C3%A9-6257d9)
![JavaScript natif, sans build](https://img.shields.io/badge/JavaScript-natif%2C%20sans%20build-f28a54)
![Aucune dépendance à l'exécution](https://img.shields.io/badge/d%C3%A9pendances%20d'ex%C3%A9cution-0-1ba99a)

![Aperçu de l'annuaire : recherche, filtres, interrupteurs Fondateurs et Partenaires, cartes de contact](docs/images/apercu.png)

<sub>Toutes les captures de ce dépôt utilisent des données fictives.</sub>

</div>

## Ce que fait le widget

L'annuaire affiche les accompagnateurs de l'innovation du PUI sous forme de **cartes**, que l'on retrouve par leur nom ou par ce qu'ils font.

- 🔎 **Recherche** par nom ou prénom, sans souci d'accents ni de majuscules.
- 🎛️ **Huit filtres** : Actions, Tâches, Communautés, GT, Domaines, Compétences, Instances, Établissement. « Ou » dans un même filtre, « et » entre filtres, avec le nombre de cartes que donnerait chaque option. « Domaines » regroupe les compétences par domaine.
- 🏛️ **Fondateurs et partenaires** : deux interrupteurs choisissent les établissements affichés. Seuls les établissements qui ont validé leur apparition sont montrés.
- 🪪 **Cartes de contact** : initiales, fonction, e-mail, téléphone, établissement et participations. Un clic sur une étiquette filtre sur sa valeur.
- 🛟 **Fiable** : si Grist ne répond pas ou si des données manquent, un bandeau le dit. Un annuaire incomplet ne passe jamais pour un annuaire vide.
- 🔒 **Lecture seule**, sans dépendance à l'exécution : le widget n'écrit rien dans Grist et ne stocke rien dans le navigateur.

## En images

<table>
  <tr>
    <td width="50%"><img src="docs/images/filtre-menu.png" alt="Menu du filtre Domaines avec le nombre de cartes de chaque option"><br><sub><b>Un filtre</b> : champ de recherche, options à cocher, nombre de cartes par option (ici, les domaines de compétences).</sub></td>
    <td width="50%"><img src="docs/images/filtres-combines.png" alt="Deux filtres combinés : trois contacts restent affichés"><br><sub><b>Des filtres combinés</b> : une communauté et un établissement, trois contacts.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/recherche.png" alt="Recherche « elise » qui trouve Élise Marchetti"><br><sub><b>La recherche</b> ignore accents et majuscules : « elise » trouve « Élise ».</sub></td>
    <td width="50%"><img src="docs/images/partenaires.png" alt="Interrupteur Partenaires activé : seuls les contacts partenaires s'affichent"><br><sub><b>Fondateurs et partenaires</b> : on choisit les établissements affichés.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/carte-anatomie.png" alt="Une carte de contact avec ses éléments numérotés"><br><sub><b>Une carte</b> : identité, coordonnées, participations (<a href="docs/utilisateurs.md#lire-une-carte">légende</a>).</sub></td>
    <td width="50%"><img src="docs/images/bandeau-donnees-partielles.png" alt="Bandeau rouge « Tables illisibles (Actions) » au-dessus des cartes"><br><sub><b>Un bandeau d'état</b> prévient quand une lecture Grist échoue.</sub></td>
  </tr>
</table>

## Installer dans Grist

Prérequis : un document Grist qui contient les tables décrites dans [`grist_structure.txt`](grist_structure.txt), avec exactement ces noms de tables et de colonnes.

1. Dans le document, ajoutez un widget : **Add New**, puis **Add Widget to Page**, **Select Widget : Custom**.
2. Pour **Select Data**, choisissez la table des contacts, `BDD` : Grist ne prévient le widget que des changements de cette table.
3. Ouvrez **Widget options** et saisissez l'adresse du widget dans **Enter Custom URL** :
   ```
   https://lombre33.github.io/Annuaire_PUI_Bordeaux/index.html
   ```
4. Accordez l'accès **Full document access** quand Grist le demande : le widget lit plusieurs tables, pas seulement celle de sa section.

Les libellés ci-dessus sont ceux de l'interface anglaise de Grist ; ils peuvent différer dans une autre langue. Le widget est déclaré dans [`manifest.yml`](manifest.yml) (nom, adresse, niveau d'accès).

> **Accès complet, un choix assumé.** Le widget demande l'accès complet au document : il lit plusieurs tables et les évolutions prévues y écrivent. Selon la documentation de Grist, un tel widget peut lire et modifier tout le document ; aujourd'hui, celui-ci ne fait que lire. Ce qui protège le document : des règles d'accès Grist, une branche `main` protégée et des tables sensibles hors du document ou protégées. Voir [Sécurité et confidentialité](docs/securite.md) avant de l'installer.

## Essayer sans Grist

Le dossier [`docs/demo/`](docs/demo) fait tourner le vrai widget avec une API Grist simulée et des données **entièrement fictives**. Il suffit de Node 18 ou plus :

```bash
git clone https://github.com/lombre33/Annuaire_PUI_Bordeaux.git
cd Annuaire_PUI_Bordeaux
node docs/demo/serveur-demo.mjs
# puis ouvrir http://127.0.0.1:8080
```

Ajoutez `?panne=Actions` à l'adresse pour simuler une table de référence illisible et voir le bandeau d'état.

## Comment ça marche

```mermaid
flowchart LR
    grist[("Document Grist<br/>les données")]
    pages["GitHub Pages<br/>le widget : HTML, CSS, JS natif"]
    cards["Cartes filtrables<br/>dans la page Grist"]
    pages -->|"chargé dans une iframe"| cards
    grist <-->|"API de widget : lecture"| cards
```

Le widget est une page statique : pas de compilation, pas de dépendance npm à l'exécution. Il lit les tables du document Grist, applique les règles d'affichage (périmètre, établissement validé, fondateur ou partenaire), puis construit les cartes et les menus de filtre. Les détails sont dans la [documentation développeur](docs/developpeurs.md).

## Documentation

| Pour… | Lire |
|---|---|
| **Utiliser l'annuaire** : rechercher, filtrer, comprendre un message | [Guide d'utilisation](docs/utilisateurs.md) |
| **Comprendre et modifier le code** : architecture, chargement des données, règles, tests, recettes | [Documentation développeur](docs/developpeurs.md) |
| **Évaluer les risques** : accès demandé à Grist, données personnelles, recommandations | [Sécurité et confidentialité](docs/securite.md) |
| **Faire vivre l'annuaire** : règles de visibilité, diagnostic, publication, retour arrière | [Maintenance](docs/maintenance.md) |
| Le cahier des charges | [`specs.md`](specs.md) |
| Le protocole de test manuel avant déploiement | [`TESTING.md`](TESTING.md) |
| L'historique des versions | [`CHANGELOG.md`](CHANGELOG.md), [`VERSION.md`](VERSION.md) |

## Structure du dépôt

```
.
├── index.html            Page du widget et modèle de carte
├── style.css             Feuille de style
├── main.js               Point d'entrée : état, événements, câblage Grist
├── grist-data.js         Lecture et enrichissement des données Grist
├── filters.js            Filtrage et compteurs (fonctions pures)
├── render.js             Construction du DOM : menus et cartes
├── constants.js          Taxonomie : catégories, couleurs, tables
├── manifest.yml          Déclaration du widget : adresse, niveau d'accès
├── grist_structure.txt   Schéma Grist réduit aux colonnes lues
├── specs.md              Cahier des charges
├── CHANGELOG.md          Historique des versions
├── VERSION.md            Version courante
├── TESTING.md            Protocole de test manuel
├── tests/                Tests unitaires et test navigateur
├── docs/                 Documentation, images, démonstration fictive
└── .github/workflows/    Intégration continue
```

## Tests

```bash
node --test
```

Sans rien installer (Node 18 ou plus ; la CI utilise Node 22), cette commande exécute les tests unitaires, un fichier par module. Avec Playwright, elle exécute aussi des scénarios de bout en bout dans un vrai navigateur, sur une API Grist simulée :

```bash
npm install --no-save playwright
npx playwright install chromium
node --test
```

Ces tests ne remplacent pas un essai dans un vrai document Grist : voir [`TESTING.md`](TESTING.md).

## Règles du projet

- **La fiabilité passe avant les nouvelles fonctionnalités.** Chaque correction s'accompagne d'un test de non-régression.
- **L'établissement d'un contact vient de sa référence `Etablissement`** (une ligne de la table `Etablissements`), jamais de la colonne `nom_de_domaine`, qui n'est pas utilisée. Un test le garantit.
- **Aucune vraie donnée dans ce dépôt public** : ni captures de l'annuaire réel, ni schéma complet du document Grist. Les captures et la démonstration utilisent des données inventées.
- **Un push sur `main` met le widget à jour en production** pour tous les documents Grist qui l'utilisent : ne publier que des tests au vert, de préférence par une pull request dont la CI est verte.
