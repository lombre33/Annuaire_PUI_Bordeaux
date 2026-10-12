# Réglages à faire dans Grist

Ce que le widget attend du document Grist, au-delà de la table `BDD` et de ses
tables de référence (voir `grist_structure.txt`). Chaque étape dit pourquoi, comment
la faire et comment vérifier qu'elle a marché.

| Étape | Quoi | Sans elle |
|---|---|---|
| 1 | Les colonnes que le widget écrit dans `BDD` sont des colonnes de **données** | l'interrupteur « Ma présence » ou l'enregistrement d'une fiche échoue, avec un message qui renvoie ici |
| 2 | Table `Annuaire_Sonde` (qui est connecté ?) | personne n'est identifié : ni bandeau ni bouton « Modifier », rien d'autre ne change |
| 3 | Case `admin` cochée dans `ACL` pour les administrateurs | personne n'est administrateur |
| 4 | Règles d'accès (à vous) | l'interface est un verrou de confort, pas une sécurité : depuis la 1.12.0, une fiche se modifie sans validation |
| 5 | Les logos : colonnes `logo` et `ordre_bandeau` dans `Etablissements`, table `Financeurs` (facultatif) | les noms remplacent les logos : la pastille de toujours sur les cartes, la liste des fondateurs en texte dans le bandeau du bas, pas de financeurs en tête de page ; rien d'autre ne change |

Le widget ne crée ni ne modifie jamais la structure du document (table, colonne,
règle d'accès) : tout ce qui est ci-dessous se fait à la main, une fois. Il n'écrit que
des lignes : celle de la personne dans `BDD` (son choix de présence, sa fiche) et la
ligne passagère d'`Annuaire_Sonde`. Les logos (étape 5) ne sont que lus.

## 1. Les colonnes que le widget écrit : des colonnes de données

Le widget écrit dans `BDD` dans deux cas :

- quand une personne utilise l'interrupteur « Ma présence » : la colonne
  `Accepte_apparaitre` ;
- quand elle enregistre la modification de sa fiche : `prenom`, `nom`, `Fonction`,
  `numero_de_telephone`, `Role_dans_le_PUI`, `Instances`, `Actions`, `GT`,
  `Competences`, `Communautes` et `Taches`. Jamais `email`, `Etablissement`,
  `perimetre` ni `Accepte_apparaitre`.

Grist refuse d'écrire dans une colonne **à formule** : chacune doit être une colonne
de **données**. `Accepte_apparaitre` est de type **Case à cocher** (Bascule) ;
`numero_de_telephone` peut être numérique ou texte, le widget écrit dans la forme de
la colonne (il lit son type dans les métadonnées du document).

1. Ouvrez les données brutes de `BDD`, puis, colonne par colonne, le panneau de
   droite « Colonne ».
2. Comportement : **Colonne de données**. Si Grist propose « Convertir en colonne de
   données », choisissez-le.
3. Pour `Accepte_apparaitre`, type **Case à cocher** ; cochez la case des personnes
   qui ont déjà donné leur accord. Une case vide ou décochée masque la personne.

Une colonne créée vide par Grist se convertit d'elle-même à la première saisie. Un
export de structure la montre alors comme une colonne à formule `return False` tant
que personne n'a rien saisi : c'est normal, et c'est pour cela que cette étape existe.

Vérifier : cochez une case dans Grist, la carte de la personne apparaît dans le widget
(au besoin, rechargez-le). Si l'interrupteur « Ma présence » affiche « La colonne
Accepte_apparaitre est une colonne à formule », ou si l'enregistrement d'une fiche
affiche « Une colonne de la fiche est une colonne à formule », reprenez l'étape pour
la colonne concernée.

## 2. La table `Annuaire_Sonde` : qui est connecté ?

L'API des widgets Grist ne donne pas l'adresse e-mail de la personne connectée (le
jeton d'accès est celui du document, pas celui de la session). La seule voie est
celle que `publipostage+` emploie déjà : une table dont une colonne a pour **formule
de déclenchement** `user.Email`. Grist la calcule à la création d'une ligne, avec
l'identité de qui l'a créée. Le widget, à chaque chargement, ajoute une ligne, la
relit puis la supprime. La table est vide au repos.

Le nom de la table et des colonnes est exact : `Annuaire_Sonde`, `Email`, `Admin`.

**À la main**

1. Ajoutez une table vide, identifiant `Annuaire_Sonde`. Supprimez ses colonnes
   `A`, `B` et `C`.
2. Colonne `Email`, type **Texte**, comportement « Colonne de données », avec la
   **formule de déclenchement** `user.Email` (« Set trigger formula » dans l'interface
   en anglais), appliquée **aux nouveaux enregistrements** (« Apply to new records »)
   et à rien d'autre : ce n'est pas une formule de colonne qui recalcule.
3. Colonne `Admin`, type **Case à cocher**, mêmes réglages, avec la formule suivante :

   ```python
   mail = (user.Email or "").strip().lower()
   return bool(mail) and any(bool(r.admin) for r in ACL.all if (r.email or "").strip().lower() == mail)
   ```

   `Admin` n'est vrai que si l'adresse de la personne figure dans `ACL` avec `admin`
   coché, sans tenir compte des majuscules ni des espaces. Le widget ne croit jamais
   ce que le navigateur prétend : il lit cette valeur, calculée par Grist.

**Avec votre widget « Structure de table Grist »** (onglet Import, mode « Nouvelle
table », cocher **Formules** dans « Éléments à importer ») : collez

```python
import grist
from functions import *
import datetime, math, re

@grist.UserTable
class Annuaire_Sonde:
  def _default_Email(rec, table, value, user):
    return user.Email
  Email = grist.Text()

  def _default_Admin(rec, table, value, user):
    mail = (user.Email or "").strip().lower()
    return bool(mail) and any(bool(r.admin) for r in ACL.all if (r.email or "").strip().lower() == mail)
  Admin = grist.Bool()
```

Vérifier : ouvrez le widget avec un compte qui peut modifier le document et dont
l'adresse figure dans la colonne `email` de `BDD`, console du navigateur ouverte. Vous
devez voir `[IDENTITE] personne identifiée (administrateur : oui|non)` (jamais
l'adresse elle-même), la zone « Ma présence » à droite de l'en-tête (sous le titre sur
un écran étroit), un bouton « Modifier » sur la carte de la personne, et la table
`Annuaire_Sonde` vide.

Si le bandeau manque, la console dit pourquoi :

| Ligne `[IDENTITE]` | Cause | Remède |
|---|---|---|
| `table « Annuaire_Sonde » introuvable` | la table n'existe pas, ou son identifiant diffère | étape 2 |
| `la formule user.Email de Annuaire_Sonde n'a renvoyé aucune adresse` | la formule n'est pas une formule de déclenchement, ou le compte est anonyme | reprendre la colonne `Email` |
| `lecture impossible : …` | Grist a refusé l'écriture ou la lecture (règle d'accès) | étape 4 |
| `document ouvert en lecture seule` | compte **Lecteur** : il ne peut rien écrire | normal, aucune modification n'est proposée |
| `Aucune ligne de BDD ne porte l'adresse…` | la personne est connectée mais son adresse n'est pas dans `BDD.email` | corriger l'adresse dans `BDD` |
| `BDD n'a pas de colonne « email »` | la colonne n'existe pas ou a un autre nom | la rajouter sous ce nom |

## 3. Les administrateurs dans `ACL`

La table `ACL` a trois colonnes : `email`, `Responsable_de_l_Etablissement` et
`admin`. Seule `admin` sert pour l'instant. Cochez-la pour chaque administrateur : il
voit, dans le bandeau « Ma présence », un bouton **Mode admin** (éteint à chaque
ouverture). Une fois allumé, un bouton « Modifier la fiche » apparaît sur toutes les
cartes affichées et il peut corriger la fiche de n'importe qui, **adresse e-mail et
établissement compris** (sur sa propre fiche, ces deux champs restent verrouillés). Si
la colonne est une colonne à formule, convertissez-la d'abord en colonne de données :
on ne coche pas les cases d'une colonne à formule.

L'adresse de `ACL` est comparée à celle de Grist sans tenir compte des majuscules ni
des espaces.

**Changer l'e-mail d'une fiche ne change pas `ACL`.** Le widget n'écrit jamais dans
`ACL` : si la personne dont on change l'adresse est administratrice (ou responsable
d'un établissement), ses droits restent attachés à son ancienne adresse. La relecture
le rappelle à l'administrateur ; c'est à l'administrateur des données de corriger la
ligne d'`ACL` dans Grist.

## 4. Règles d'accès

Le widget parle à Grist **avec les droits de la personne connectée**. Les règles
d'accès décident donc de ce qu'il peut faire, et ce sont elles seules qui protègent
vraiment les données : un verrou d'interface se contourne depuis la console du
navigateur. Depuis la 1.12.0, une personne modifie sa fiche **directement**, sans
validation ni historique tenu par le widget : ces règles sont la seule barrière entre
une fiche et les autres utilisateurs du document.

Ce qui suit est ce dont le widget a besoin, pas une configuration complète. Ces règles
n'ont pas pu être essayées dans un vrai Grist : à tester sur une copie du document.

| Où | Qui peut | Pourquoi |
|---|---|---|
| `Annuaire_Sonde` : créer, lire, supprimer des lignes | toute personne qui peut modifier le document | sinon elle n'est pas identifiée (le widget échoue en sécurité : ni bandeau ni bouton) |
| `BDD` : modifier `prenom`, `nom`, `Fonction`, `numero_de_telephone`, `Role_dans_le_PUI`, `Instances`, `Actions`, `GT`, `Competences`, `Communautes`, `Taches`, `Accepte_apparaitre` | la personne dont `email` est la sienne, et les administrateurs | c'est ce que le widget écrit |
| `BDD` : modifier `email`, `Etablissement` | les administrateurs | c'est ce que le widget écrit quand un administrateur, mode admin allumé, change l'adresse ou l'établissement d'une autre personne. `email` désigne la personne : qui peut le changer peut prendre l'identité d'un autre. `Etablissement` décide de qui apparaît |
| `BDD` : modifier `perimetre` | les administrateurs | le widget ne l'écrit jamais ; il décide de qui apparaît |
| `BDD` : ajouter ou supprimer une ligne | les administrateurs | le widget ne crée ni ne supprime jamais de fiche |
| `ACL` | les administrateurs (masquée aux autres) | la formule d'`Annuaire_Sonde` la lit pour son propre compte, sans passer par les droits de la personne |

Pour « la personne dont `email` est la sienne », une condition comme
`user.Email and rec.email and user.Email.strip().lower() == rec.email.strip().lower()`.
Pour « les administrateurs », le plus simple est un attribut d'utilisateur de Grist
(« Ajouter des attributs d'utilisateur ») qui cherche `user.Email` dans la colonne
`email` de `ACL` : la condition devient `user.Acl.admin`, si vous avez nommé l'attribut
`Acl`. La recherche de Grist tient compte de la casse : écrivez les adresses d'`ACL` en
minuscules.

Si vous préférez que le rôle dans le PUI (`Role_dans_le_PUI`) soit attribué par les
administrateurs, retirez-le de la deuxième ligne : le champ reste affiché dans la
fenêtre, mais Grist refusera la modification.

Un refus des règles d'accès n'abîme rien : le widget affiche « Grist a refusé la
modification : vos droits ne permettent pas de changer cette fiche… », la relecture
reste ouverte, rien n'a été écrit.

## 5. Les logos (facultatif)

Le widget est aux couleurs du consortium plutôt qu'à celles d'un établissement : le logo
de chaque établissement figure sur ses cartes, les financeurs sont rappelés en haut de
la page et les logos des fondateurs forment un bandeau en bas. Ces logos sont des
**pièces jointes du document Grist** : le dépôt du widget n'en contient aucun (il est
public, et un logo réel n'y a pas sa place sans l'accord de son titulaire). Sans ces
colonnes, sans cette table ou sans fichier, rien ne casse : le **nom** de l'établissement
remplace son logo (la pastille de toujours sur ses cartes, son acronyme en texte dans le
bandeau du bas), et il n'y a pas de financeurs en tête de page. Le bandeau du bas, lui,
est affiché dès qu'un établissement fondateur a validé sa présence, même sans aucun logo.

**Dans `Etablissements`**, deux colonnes à ajouter (noms exacts) :

| Colonne | Type | Rôle |
|---|---|---|
| `logo` | Pièces jointes | Le logo de l'établissement : sur ses cartes et, pour un fondateur, dans le bandeau du bas. Seul le premier fichier de la cellule est utilisé |
| `ordre_bandeau` | Numérique | La place du fondateur dans le bandeau du bas : 1 est tout à gauche, puis 2, 3… Sans numéro, le fondateur passe après ceux qui en ont un, dans l'ordre de la table |

Le bandeau du bas montre les établissements **fondateurs** qui ont **validé** leur
apparition (`ok_pour_apparaitre` coché) : un fondateur qui ne l'a pas fait n'y figure
pas. Un partenaire ou une structure « autres » n'y figure jamais, mais son logo apparaît
sur les cartes de ses membres. Les logos se rangent sur une ou deux rangées selon la
largeur du cadre (huit colonnes, quatre sur un cadre étroit), et s'ajustent d'eux-mêmes :
le bandeau reste lisible avec seize logos.

**Une table `Financeurs`**, créée à la main (une ligne par financeur ; nom de la table et
des colonnes exacts) :

| Colonne | Type | Rôle |
|---|---|---|
| `nom` | Texte | Le nom du financeur : affiché à la place du logo quand le fichier manque, et lu par les lecteurs d'écran |
| `logo` | Pièces jointes | Le logo du financeur |
| `ordre` | Numérique | L'ordre des logos en haut de la page, de gauche à droite : 1, 2, 3… |

Le financeur dont le `nom` est exactement `France 2030` (casse et accents ignorés) ferme
aussi le bandeau du bas, sous la forme d'un rond : c'est celui du bandeau que le PUI a
fourni. Un financeur d'un autre nom ne figure qu'en haut de page.

Déposez les logos **en couleurs** : en haut de page, les financeurs doivent rester discrets,
le widget les y affiche donc en niveaux de gris (comme sur la maquette), alors que le rond du
bandeau du bas, qui est le même fichier, garde ses couleurs.

*Pourquoi une table, alors que le widget n'en crée jamais ?* Les financeurs ne sont pas
des établissements : les ranger dans `Etablissements` les ferait apparaître dans le filtre
« Établissement » et dans les règles de visibilité. Une petite table, créée une fois à la
main, que le widget **lit sans jamais y écrire** et dont l'absence ne gêne rien, est le
plus simple. Le widget ne crée pas cette table : si elle manque, il n'affiche simplement
pas de financeurs.

**Préparer les fichiers**

- **PNG ou SVG**, de préférence **SVG** (net à toute taille), sur **fond transparent**,
  **rognés au plus près du dessin**. Le widget ajuste lui-même la taille de chaque logo
  pour qu'une rangée de logos de formes différentes (un emblème carré, une bannière
  large, une signature haute) ait un poids visuel voisin : une marge blanche autour d'un
  logo le ferait paraître plus petit que les autres, et un fond blanc opaque dessinerait
  un rectangle blanc sur le fond de la page.
- Un SVG doit déclarer sa taille (`width` et `height`, ou au moins un `viewBox`).
- Une cellule peut contenir plusieurs fichiers, mais seul le premier est affiché : pour
  changer un logo, **remplacez** le fichier au lieu d'en ajouter un.
- Aucun logo n'est un secret : toute personne qui peut lire le document peut télécharger
  ses pièces jointes.

**Ajouter ou changer un logo.** Dans Grist, cliquez la cellule `logo` de l'établissement
ou du financeur, puis le « + » (ou glissez le fichier). Modifier ces tables ne rafraîchit
pas le widget tout seul : rechargez la page.

**Comment le widget les lit.** Il demande à Grist un jeton d'accès **en lecture seule**
(`getAccessToken`) et affiche chaque logo par une balise `<img>` à l'adresse que Grist
indique : c'est la méthode que la documentation de Grist donne pour afficher une pièce
jointe. Le jeton figure donc dans l'adresse de l'image ; il ne permet que de **lire** le
document (pas d'y écrire), pour quelques minutes, puis le widget en demande un autre. Voir
[`docs/securite.md`](docs/securite.md#les-logos-et-le-jeton-daccès-aux-pièces-jointes).
Cet affichage **n'a pas pu être essayé dans un vrai document Grist** (les tests simulent
la réponse de Grist) : vérifiez-le sur votre document avant de compter dessus
([`TESTING.md`](TESTING.md), section 14).

Vérifier : ouvrez le widget, console ouverte. Les logos des établissements apparaissent
sur les cartes, ceux des financeurs au centre de l'en-tête, ceux des fondateurs en bas
de page. Si ce n'est pas le cas, la console dit pourquoi :

| Ce que vous voyez | Cause | Remède |
|---|---|---|
| `[LOGOS] Jeton d'accès aux pièces jointes indisponible : les logos sont remplacés par le texte.` et des noms à la place de tous les logos | Grist ne donne pas de jeton (version de Grist sans `getAccessToken`, ou règle d'accès qui interdit la lecture des pièces jointes) | Vérifier l'accès du widget (`full`) et la version de Grist ; essayer avec un compte qui peut modifier le document |
| Le nom d'**un seul** établissement à la place de son logo, ou un message « Failed to load resource » du navigateur | Le fichier est absent de la cellule `logo`, a été supprimé, ou n'est pas une image lisible (PNG, SVG, JPEG…) | Remplacer le fichier dans Grist |
| `[LOGOS] Impossible d'afficher les logos : …` | Une erreur inattendue en construisant l'habillage ; les cartes restent affichées | Transmettre la ligne au mainteneur du code |
| Pas de financeurs en tête de page | La table `Financeurs` n'existe pas (ou son nom diffère), ou elle est vide | Reprendre les noms exacts ci-dessus |
| Pas de bandeau en bas de page | Aucun établissement n'est à la fois `fondateur` et `ok_pour_apparaitre` | Cocher les deux cases pour les fondateurs |
| Le rond du bandeau manque | Le financeur ne s'appelle pas exactement `France 2030` | Corriger le `nom` |
| Un logo paraît trop petit, ou entouré de blanc | Marge ou fond blanc dans le fichier | Rogner l'image, fond transparent |

## À savoir

- **Deux actions d'historique par chargement.** Chaque ouverture du widget laisse une
  création et une suppression dans `Annuaire_Sonde`. C'est normal. Si une page est
  fermée entre les deux, une ligne orpheline peut rester : vous pouvez vider la table
  sans risque.
- **« Annuler » de Grist** défait le dernier changement fait par le widget, y compris
  un changement de présence ou l'enregistrement d'une fiche (une seule action Grist).
- **Le widget ne garde aucun historique des modifications**, ni table de demandes :
  elles s'appliquent tout de suite. Pour savoir qui a changé quoi, c'est le journal de
  Grist lui-même (panneau « Historique » du document, durée de conservation selon
  votre formule).
- **Deux personnes qui modifient la même fiche en même temps** : si elles touchent
  aux mêmes champs, la seconde est ramenée à la relecture avec ce que Grist contient
  maintenant (rien n'est écrit sans qu'elle l'ait relu) ; sinon les deux modifications
  se cumulent, y compris dans une liste.
- **Une liste qui contient une valeur sans libellé** (une ligne de référence supprimée)
  garde cette valeur à l'enregistrement ; si la cellule contient autre chose que des
  identifiants de ligne, le widget refuse de la réécrire et le dit : à corriger dans
  Grist.
- **Une adresse sur plusieurs lignes de `BDD`** : le choix de présence s'applique à
  toutes ces lignes (la console le signale). Mieux vaut corriger les doublons.
- **Une personne connectée avec une autre adresse que celle de `BDD`** n'est pas
  retrouvée : pas de bandeau.
