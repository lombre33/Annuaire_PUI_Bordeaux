# Réglages à faire dans Grist

Ce que le widget attend du document Grist, au-delà de la table `BDD` et de ses
tables de référence (voir `grist_structure.txt`). Chaque étape dit pourquoi, comment
la faire et comment vérifier qu'elle a marché.

| Étape | Quoi | Sans elle |
|---|---|---|
| 1 | `BDD.Accepte_apparaitre` est une colonne de **données** (case à cocher) | l'interrupteur « Ma présence » échoue, avec un message qui renvoie ici |
| 2 | Table `Annuaire_Sonde` (qui est connecté ?) | personne n'est identifié : pas de bandeau, rien d'autre ne change |
| 3 | Case `admin` cochée dans `ACL` pour les administrateurs | personne n'est administrateur |
| 4 | Table `Annuaire_Demandes` (les demandes de modification de fiche) | personne ne peut proposer de modification, aucun écran de validation |
| 5 | Règles d'accès (à vous) | l'interface est un verrou de confort, pas une sécurité |

Le widget ne crée ni ne modifie jamais une table ou une colonne de lui-même : tout
ce qui est ci-dessous se fait à la main, une fois.

## 1. `Accepte_apparaitre` : une colonne de données

Le widget écrit cette colonne quand une personne utilise l'interrupteur « Ma
présence ». Grist refuse d'écrire dans une colonne **à formule** : elle doit être une
colonne de **données**, de type **Case à cocher** (Bascule).

1. Ouvrez les données brutes de `BDD`, colonne `Accepte_apparaitre`, panneau de
   droite « Colonne ».
2. Type : **Case à cocher**. Comportement : **Colonne de données**. Si Grist propose
   « Convertir en colonne de données », choisissez-le.
3. Cochez la case des personnes qui ont déjà donné leur accord. Une case vide ou
   décochée masque la personne.

Une colonne créée vide par Grist se convertit d'elle-même à la première saisie. Un
export de structure la montre alors comme une colonne à formule `return False` tant
que personne n'a rien saisi : c'est normal, et c'est pour cela que cette étape existe.

Vérifier : cochez une case dans Grist, la carte de la personne apparaît dans le widget
(au besoin, rechargez-le). Si l'interrupteur « Ma présence » affiche « La colonne
Accepte_apparaitre est une colonne à formule », reprenez l'étape.

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
l'adresse elle-même), le bandeau « Ma présence » au-dessus des filtres, et la table
`Annuaire_Sonde` vide.

Si le bandeau manque, la console dit pourquoi :

| Ligne `[IDENTITE]` | Cause | Remède |
|---|---|---|
| `table « Annuaire_Sonde » introuvable` | la table n'existe pas, ou son identifiant diffère | étape 2 |
| `la formule user.Email de Annuaire_Sonde n'a renvoyé aucune adresse` | la formule n'est pas une formule de déclenchement, ou le compte est anonyme | reprendre la colonne `Email` |
| `lecture impossible : …` | Grist a refusé l'écriture ou la lecture (règle d'accès) | étape 5 |
| `document ouvert en lecture seule` | compte **Lecteur** : il ne peut rien écrire | normal, aucune modification n'est proposée |
| `Aucune ligne de BDD ne porte l'adresse…` | la personne est connectée mais son adresse n'est pas dans `BDD.email` | corriger l'adresse dans `BDD` |
| `BDD n'a pas de colonne « email »` | la colonne n'existe pas ou a un autre nom | la rajouter sous ce nom |

## 3. Les administrateurs dans `ACL`

La table `ACL` a trois colonnes : `email`, `Responsable_de_l_Etablissement` et
`admin`. Seule `admin` sert pour l'instant. Cochez-la pour chaque administrateur. Si
la colonne est une colonne à formule, convertissez-la d'abord en colonne de données :
on ne coche pas les cases d'une colonne à formule.

L'adresse de `ACL` est comparée à celle de Grist sans tenir compte des majuscules ni
des espaces.

## 4. La table `Annuaire_Demandes` : les demandes de modification

Une personne ne modifie pas sa fiche elle-même : elle dépose une **demande**, qu'un
administrateur valide ou refuse. Seule la validation écrit dans `BDD`. Les demandes
vivent dans une table que le widget lit et écrit, mais ne crée jamais.

Le nom de la table et des colonnes est exact.

| Colonne | Type | Rôle |
|---|---|---|
| `Date` | Date et heure | quand la demande a été déposée ; **formule de déclenchement** `NOW()` |
| `Email` | Texte | **l'auteur** de la demande ; **formule de déclenchement** `user.Email` |
| `Personne` | Référence vers `BDD` | la fiche concernée |
| `Statut` | Choix : `en_attente`, `validee`, `refusee` | l'état de la demande |
| `Changements` | Texte | ce qui est demandé, en JSON ; **ne pas modifier à la main** |
| `Resume` | Texte | la même chose en une phrase, pour la lire dans Grist |
| `Message` | Texte | le mot facultatif de la personne à l'administrateur |
| `Traitee_par` | Texte | l'adresse de l'administrateur qui a validé ou refusé |
| `Traitee_le` | Date et heure | quand |
| `Motif_refus` | Texte | la raison, dite à la personne |

`Date` et `Email` sont remplis **par Grist**, jamais par le widget : c'est ce qui rend
l'auteur fiable. Ce sont les mêmes formules de déclenchement que celles de
`Annuaire_Sonde`, appliquées aux nouveaux enregistrements et à rien d'autre.

**Avec votre widget « Structure de table Grist »** (onglet Import, mode « Nouvelle
table », cocher **Formules**) : collez

```python
import grist
from functions import *
import datetime, math, re

@grist.UserTable
class Annuaire_Demandes:
  def _default_Date(rec, table, value, user):
    return NOW()
  Date = grist.DateTime('Europe/Paris')

  def _default_Email(rec, table, value, user):
    return user.Email
  Email = grist.Text()
  Personne = grist.Reference('BDD')
  Statut = grist.Choice()
  Changements = grist.Text()
  Resume = grist.Text()
  Message = grist.Text()
  Traitee_par = grist.Text()
  Traitee_le = grist.DateTime('Europe/Paris')
  Motif_refus = grist.Text()
```

Puis, sur la colonne `Statut`, déclarez les trois valeurs `en_attente`, `validee` et
`refusee`. La table est vide au départ.

**Ce que le widget exige d'une demande** (et pourquoi) : n'importe qui peut écrire
n'importe quoi dans cette table depuis la console du navigateur, donc rien n'est cru
sur parole. Avant toute validation le widget relit la demande champ par champ
(seuls prénom, nom, fonction, téléphone, rôle PUI et les six listes sont
modifiables, jamais l'e-mail, l'établissement, le périmètre ni l'accord), retrouve
les libellés dans les tables de référence, et vérifie que **l'adresse de l'auteur
est celle de la fiche**. Une demande qui ne passe pas ces contrôles ne peut qu'être
refusée. Le tout est appliqué en une seule action : la fiche et le statut changent
ensemble ou pas du tout.

**Pour que l'auteur soit fiable**, les règles d'accès de l'étape 5 doivent
empêcher d'écrire soi-même la colonne `Email` d'une demande : sans cela, quelqu'un
pourrait déposer une demande au nom d'un autre. L'administrateur voit toujours
l'adresse de l'auteur et ce qui change, il n'est jamais obligé de valider.

Vérifier : aucune ligne n'apparaît tant que personne n'a rien demandé ; une demande
déposée par le widget a `Statut` = `en_attente`, un `Email` et une `Date` remplis
**sans que le widget les ait écrits**.

## 5. Règles d'accès

Le widget parle à Grist **avec les droits de la personne connectée**. Les règles
d'accès décident donc de ce qu'il peut faire, et ce sont elles seules qui protègent
vraiment les données : un verrou d'interface se contourne depuis la console du
navigateur. Ce qui suit est ce dont le widget a besoin, pas une configuration
complète. Je n'ai pas pu l'essayer dans un vrai Grist : à tester sur une copie du
document.

- **`Annuaire_Sonde`** : toute personne qui peut modifier le document doit pouvoir y
  **créer, lire et supprimer** des lignes. Sinon elle n'est pas identifiée (le widget
  échoue en sécurité, sans bandeau).
- **`BDD.Accepte_apparaitre`** : pour que l'interrupteur ne serve qu'à soi, une règle
  sur cette colonne autorise la **modification** quand l'adresse de la personne est
  celle de la ligne, par exemple avec la condition
  `user.Email and rec.email and user.Email.strip().lower() == rec.email.strip().lower()`,
  et la refuse à tout autre que vous.
- **`Annuaire_Demandes`** : toute personne qui peut modifier le document doit pouvoir
  y **créer** une ligne et **lire les siennes** (`rec.Email == user.Email`, casse et
  espaces ignorés). Les administrateurs lisent et **modifient** toutes les lignes
  (valider, refuser). Personne d'autre ne modifie ni ne supprime une demande, et
  **personne ne doit pouvoir choisir lui-même `Email`** à la création : testez-le
  depuis la console du navigateur avec un compte non administrateur, en ajoutant
  une ligne dont `Email` est une autre adresse, qui doit être refusée ou écrasée par
  Grist. Si ce test échoue, ne vous fiez pas à l'auteur affiché.
- **`BDD`** : une modification par les administrateurs doit rester possible, c'est
  ainsi que la validation d'une demande s'applique. Les personnes, elles, n'ont pas
  besoin d'écrire dans `BDD` autrement que par l'interrupteur « Ma présence » sur
  leur propre ligne.
- **`ACL`** : peut être masquée à tous sauf à vous. La formule de `Annuaire_Sonde`
  la lit pour son propre compte, sans passer par les droits de la personne.

Un refus des règles d'accès n'abîme rien : le widget affiche « Grist a refusé la
modification… » et l'interrupteur reste dans son état réel.

## À savoir

- **Deux actions d'historique par chargement.** Chaque ouverture du widget laisse une
  création et une suppression dans `Annuaire_Sonde`. C'est normal. Si une page est
  fermée entre les deux, une ligne orpheline peut rester : vous pouvez vider la table
  sans risque.
- **« Annuler » de Grist** défait le dernier changement fait par le widget, y compris
  un changement de présence.
- **Une adresse sur plusieurs lignes de `BDD`** : le choix de présence s'applique à
  toutes ces lignes (la console le signale). Mieux vaut corriger les doublons.
- **Une personne connectée avec une autre adresse que celle de `BDD`** n'est pas
  retrouvée : pas de bandeau.
- **Les demandes traitées restent dans `Annuaire_Demandes`** : c'est l'historique de
  ce qui a été validé ou refusé, et ce que la personne relit. Videz-la de temps en
  temps (les lignes validées ou refusées depuis longtemps) : le widget relit toute la
  table à l'ouverture.
