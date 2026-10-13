# Réglages à faire dans Grist

Ce que le widget attend du document Grist, au-delà de la table `BDD` et de ses
tables de référence (voir `grist_structure.txt`). Chaque étape dit pourquoi, comment
la faire et comment vérifier qu'elle a marché.

| Étape | Quoi | Sans elle |
|---|---|---|
| 1 | Les colonnes que le widget écrit dans `BDD` sont des colonnes de **données** | l'interrupteur « Ma présence » ou l'enregistrement d'une fiche échoue, avec un message qui renvoie ici |
| 2 | Table `Annuaire_Sonde` (qui est connecté ?), avec sa colonne `Responsable_de` pour les responsables d'établissement : **le widget la crée lui-même** au premier chargement, ouvert par un compte qui peut modifier la structure du document | si le widget n'a pas pu la créer, personne n'est identifié : ni bandeau ni bouton « Modifier », rien d'autre ne change ; sans la seule colonne `Responsable_de`, personne ne peut modifier la fiche de son établissement |
| 3 | `ACL` : case `admin` cochée pour les administrateurs, une ligne par responsable d'établissement | personne n'est administrateur ni responsable d'établissement |
| 4 | Règles d'accès (à vous) | l'interface est un verrou de confort, pas une sécurité : depuis la 1.12.0, une fiche se modifie sans validation, et depuis la 1.17.0 une fiche d'établissement aussi |
| 5 | Les logos des établissements : colonnes `logo` et `ordre_bandeau` dans `Etablissements` (facultatif) ; le remplacement d'un logo depuis le widget en dépend. Les financeurs n'en dépendent pas : ce sont deux images fixes du widget | les noms remplacent les logos : la pastille de toujours sur les cartes, la liste des fondateurs en texte dans le bandeau du bas ; un responsable ne peut plus changer le logo de son établissement depuis le widget (la fenêtre le dit) ; rien d'autre ne change |
| 6 | La photo de profil : colonne `Avatar` (Pièces jointes) dans `BDD` (facultatif) | les cartes gardent les initiales et le formulaire de modification n'a pas de carte « Photo de profil » ; rien d'autre ne change |

Le widget ne modifie jamais la structure du document (colonne, règle d'accès) et ne crée
qu'une seule table, `Annuaire_Sonde`, quand elle manque (étape 2) : tout le reste de ce qui
est ci-dessous se fait à la main, une fois. Hors cette création, il n'écrit que
des lignes et des cellules : celle de la personne connectée dans `BDD` (son choix de présence, sa
fiche) ou, pour un administrateur en mode admin, celle d'une autre personne (sa fiche), la ligne
passagère d'`Annuaire_Sonde` et, pour un responsable d'établissement, la ligne de son établissement
dans `Etablissements` (nom complet, visibilité, logo) et les lignes d'`ACL` de ses responsables.
Quand un responsable remplace le logo, ou une personne sa photo de profil (étape 6), il ajoute aussi
une **pièce jointe** au document. Les logos et les photos affichés (étapes 5 et 6) sont lus.

## 1. Les colonnes que le widget écrit : des colonnes de données

Le widget écrit dans `BDD` dans trois cas :

- quand une personne utilise l'interrupteur « Ma présence » : la colonne
  `Accepte_apparaitre` ;
- quand elle enregistre la modification de sa fiche : `prenom`, `nom`, `Fonction`,
  `numero_de_telephone`, `Role_dans_le_PUI`, `Instances`, `Actions`, `GT`,
  `Competences`, `Communautes`, `Taches` et, si elle existe (étape 6), `Avatar` ;
- quand un administrateur, mode admin allumé, enregistre la fiche d'une autre
  personne : les mêmes colonnes, plus `email` et `Etablissement`.

Jamais `perimetre` (le widget ne le lit ni ne l'écrit plus depuis la 1.27.0), ni `Accepte_apparaitre` depuis la fenêtre de modification.

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

Depuis la 1.17.0, le widget écrit aussi, quand un responsable enregistre la fiche de
son établissement, dans trois colonnes d'`Etablissements` (`nom_complet`,
`ok_pour_apparaitre` et `logo`) et dans deux colonnes d'`ACL` (`email` et
`Responsable_de_l_Etablissement`) : ce sont aussi des colonnes de **données**. Il n'écrit
jamais `admin`, ni le sigle, ni les cases `fondateur`, `partenaire` et `autres`.

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

**Depuis la 1.20.0, le widget crée cette table lui-même quand elle manque.** Au premier
chargement, ouvert par un compte qui peut modifier la structure du document (le propriétaire,
ou un éditeur que les règles d'accès n'en empêchent pas), il ajoute la table `Annuaire_Sonde`
avec les trois colonnes ci-dessous, formules de déclenchement comprises, puis continue comme
si elle avait toujours été là. Il ne crée rien si elle existe déjà et ne modifie jamais ses
colonnes ni ses formules : si vous en changez une, il la respecte. Un compte Lecteur n'essaie
rien. Si Grist refuse la création, personne n'est identifié et la console le dit (tableau
plus bas) : faites alors ouvrir le widget par un propriétaire, ou créez la table à la main.
C'est la seule table que le widget crée ; elle apparaît dans les données brutes du document.

Le nom de la table et des colonnes est exact : `Annuaire_Sonde`, `Email`, `Admin` et,
pour la fiche d'un établissement (1.17.0), `Responsable_de` (facultative : sans elle,
tout le reste fonctionne et personne ne modifie de fiche d'établissement).

**Rien n'est à saisir dans cette table**, et `Admin` comme `Responsable_de` ne doublent pas
`ACL` : ce sont des formules de déclenchement qui **lisent** `ACL` à l'instant où le widget
ajoute sa ligne (adresse de la personne connectée, puis ses droits d'après `ACL`). `ACL` reste
le seul endroit où l'on nomme les administrateurs et les responsables d'établissement. Ces deux
colonnes existent pour que le widget connaisse les droits de la personne connectée sans lui
ouvrir la lecture de tout `ACL` ; la ligne est supprimée aussitôt lue, la table est vide au repos.

**À la main** (si vous préférez créer la table vous-même, ou si le widget n'en a pas le droit)

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
4. Colonne `Responsable_de` (facultative), type **Texte**, mêmes réglages, avec la
   formule suivante :

   ```python
   mail = (user.Email or "").strip().lower()
   ids = sorted({r.Responsable_de_l_Etablissement.id for r in ACL.all
                 if mail and (r.email or "").strip().lower() == mail and r.Responsable_de_l_Etablissement})
   return ",".join(str(i) for i in ids)
   ```

   Elle renvoie les identifiants des établissements dont la personne est responsable
   (« 3 » ou « 3,7 »), d'après les lignes d'`ACL` qui portent son adresse **et** un
   établissement ; la valeur est vide pour tout autre compte. Le widget n'en garde que les
   entiers positifs. Cette formule n'a pas été essayée dans un vrai Grist : vérifiez
   la valeur de la colonne dans la table `Annuaire_Sonde` en y laissant une ligne le temps
   d'un essai (créez-la vous-même dans Grist avec votre compte).

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

  def _default_Responsable_de(rec, table, value, user):
    mail = (user.Email or "").strip().lower()
    ids = sorted({r.Responsable_de_l_Etablissement.id for r in ACL.all
                  if mail and (r.email or "").strip().lower() == mail and r.Responsable_de_l_Etablissement})
    return ",".join(str(i) for i in ids)
  Responsable_de = grist.Text()
```

Vérifier : ouvrez le widget avec un compte qui peut modifier le document et dont
l'adresse figure dans la colonne `email` de `BDD`, console du navigateur ouverte. Au tout
premier chargement, la console dit d'abord que la table est créée. Vous
devez voir `[IDENTITE] personne identifiée (administrateur : oui|non, responsable de N
établissement(s))` (jamais l'adresse elle-même), la zone « Ma présence » à droite de
l'en-tête (sous le titre sur un écran étroit), un bouton « Modifier » sur la carte de la
personne, et la table `Annuaire_Sonde` vide. Pour un compte désigné responsable dans
`ACL` (étape 3), le bandeau porte aussi « Mon établissement ».

Si le bandeau manque ou ne propose pas de fiche, la console dit pourquoi :

| Ligne `[IDENTITE]` | Cause | Remède |
|---|---|---|
| `table « Annuaire_Sonde » introuvable, et Grist n'a pas permis de la créer` | la table n'existait pas, et le compte qui a ouvert le widget n'a pas le droit de créer une table (règle d'accès, compte qui n'est pas propriétaire) | faites ouvrir le widget par un propriétaire du document, ou créez la table à la main (étape 2) |
| `la sonde n'a pas de colonne « Responsable_de » : pas de fiche d'établissement` | la colonne facultative n'existe pas : personne ne peut modifier de fiche d'établissement | colonne `Responsable_de`, étape 2 (point 4) |
| `la formule user.Email de Annuaire_Sonde n'a renvoyé aucune adresse` | la formule n'est pas une formule de déclenchement, ou le compte est anonyme | reprendre la colonne `Email` |
| `lecture impossible : …` | Grist a refusé l'écriture ou la lecture (règle d'accès) | étape 4 |
| `Aucune ligne de BDD ne porte l'adresse…` | la personne est connectée mais son adresse n'est pas dans `BDD.email` : le bandeau dit « Compte absent de l'annuaire » | corriger l'adresse dans `BDD` |
| `BDD n'a pas de colonne « email »` | la colonne n'existe pas ou a un autre nom : le bandeau dit « Fiche introuvable » | la rajouter sous ce nom |

Un compte **Lecteur** n'a ni bandeau ni ligne dans la console : le widget n'essaie rien
(normal, aucune modification n'est proposée).

## 3. Les administrateurs dans `ACL`

La table `ACL` a trois colonnes : `email`, `Responsable_de_l_Etablissement` et
`admin`.

**Les administrateurs** (`admin`). Cochez la case pour chaque administrateur : il
voit, dans le bandeau « Ma présence », un bouton **Mode admin** (éteint à chaque
ouverture). Une fois allumé, un bouton « Modifier la fiche » apparaît sur toutes les
cartes affichées et il peut corriger la fiche de n'importe qui, **adresse e-mail et
établissement compris** (sur sa propre fiche, ces deux champs restent verrouillés). Si
la colonne est une colonne à formule, convertissez-la d'abord en colonne de données :
on ne coche pas les cases d'une colonne à formule.

**Les responsables d'établissement** (`Responsable_de_l_Etablissement`, 1.17.0). Une
ligne par personne et par établissement : l'adresse dans `email` et l'établissement dans
`Responsable_de_l_Etablissement` (une Référence vers `Etablissements`). La personne voit,
dans le bandeau « Ma présence », un bouton **Mon établissement**, et un bouton
« ✎ Modifier » sous le logo de son établissement sur chacune de ses cartes : elle
modifie son logo, son nom complet, sa visibilité dans l'annuaire et la liste de ses
responsables (étapes 4 et 5). Un administrateur n'est pas responsable pour autant : il faut une ligne
avec un établissement ; une même ligne peut porter `admin` **et** un établissement. Un
responsable peut nommer d'autres responsables depuis le widget : le premier est à
nommer dans Grist, sans quoi personne ne peut ouvrir la fiche. Un établissement garde
toujours au moins un responsable (le widget refuse d'enregistrer le contraire). Le widget
**n'écrit jamais `admin`** : nommer quelqu'un responsable ne le rend pas administrateur.
Quand un responsable en retire un autre, la ligne d'`ACL` est supprimée, sauf si elle porte
`admin` : elle garde alors la case et perd seulement son établissement.

L'adresse de `ACL` est comparée à celle de Grist sans tenir compte des majuscules ni
des espaces.

**Changer l'e-mail d'une fiche ne change pas `ACL`.** Le widget ne modifie pas la ligne
d'`ACL` d'une personne dont un administrateur change l'adresse : si elle est administratrice (ou
responsable d'un établissement), ses droits restent attachés à son ancienne adresse. La
relecture le rappelle à l'administrateur ; c'est à l'administrateur des données de corriger la
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
| `Annuaire_Sonde` : ajouter une ligne, lire et supprimer **la sienne**, ne rien modifier | toute personne qui peut modifier le document (les deux règles exactes sont plus bas) | sinon elle n'est pas identifiée (le widget échoue en sécurité : ni bandeau ni bouton) |
| `BDD` : modifier `prenom`, `nom`, `Fonction`, `numero_de_telephone`, `Role_dans_le_PUI`, `Instances`, `Actions`, `GT`, `Competences`, `Communautes`, `Taches`, `Avatar` (si vous l'avez ajoutée, étape 6), `Accepte_apparaitre` | la personne dont `email` est la sienne, et les administrateurs | c'est ce que le widget écrit |
| `BDD` : modifier `email`, `Etablissement` | les administrateurs | c'est ce que le widget écrit quand un administrateur, mode admin allumé, change l'adresse ou l'établissement d'une autre personne. `email` désigne la personne : qui peut le changer peut prendre l'identité d'un autre. `Etablissement` décide de qui apparaît |
| `BDD` : modifier `perimetre` | les administrateurs | le widget ne l'écrit jamais, et ne le lit plus depuis la 1.27.0 : il ne décide plus de qui apparaît |
| `BDD` : ajouter ou supprimer une ligne | les administrateurs | le widget ne crée ni ne supprime jamais de fiche |
| `ACL` : lire les lignes de son établissement | les responsables de cet établissement, et les administrateurs | c'est ce qui affiche la liste des responsables dans la fiche. Si la règle la leur refuse, la fiche s'ouvre sans cette liste et le dit |
| `ACL` : ajouter, supprimer, modifier `email` et `Responsable_de_l_Etablissement` d'une ligne de son établissement | les responsables de cet établissement, et les administrateurs | c'est ce que le widget écrit quand un responsable nomme ou retire un responsable. **`admin` : les administrateurs seulement** (le widget ne l'écrit jamais ; sans cette règle, un responsable pourrait se donner le droit d'administrateur depuis la console) |
| `Etablissements` : modifier `nom_complet`, `ok_pour_apparaitre` et `logo` d'**une ligne** | les responsables de cette ligne, et les administrateurs | c'est ce que le widget écrit pour la fiche d'un établissement. `ok_pour_apparaitre` décide de qui apparaît ; `acronyme`, `fondateur`, `partenaire` et `autres` : l'équipe du PUI seulement, le widget ne les écrit pas |
| Ajouter une pièce jointe au document | les responsables et les administrateurs (le logo) ; toute personne qui modifie sa fiche (sa photo de profil, étape 6) | c'est ce que fait l'envoi d'un logo ou d'une photo. Un compte au rôle **Lecteur** du document ne peut rien écrire, pas même cela |
| `ACL` : lire et modifier les lignes des autres | les administrateurs | la formule d'`Annuaire_Sonde` la lit pour son propre compte, sans passer par les droits de la personne |

**Les deux règles d'`Annuaire_Sonde`.** Dans « Règles d'accès », ajoutez la table
`Annuaire_Sonde` avec ces deux règles, dans cet ordre (pour chaque droit, la première règle qui
s'applique et qui se prononce l'emporte) :

| Règle | Condition | Lire | Créer | Modifier | Supprimer |
|---|---|---|---|---|---|
| 1 | `rec.Email == user.Email` (la ligne est la sienne) | autorisé | (laisser vide) | **refusé** | autorisé |
| 2 | tout le monde (aucune condition) | refusé | **autorisé** | refusé | refusé |

Chacun peut ainsi ajouter une ligne, la lire et la supprimer, mais personne ne peut en modifier
une (l'adresse que Grist y inscrit ne se réécrit pas) ni lire celles des autres. Sans ces règles,
toute personne qui peut écrire dans le document lirait les adresses des autres et pourrait
réécrire une ligne. Cela ne lui donnerait pas pour autant les droits de quelqu'un d'autre sur les
fiches : le widget ne lit que la ligne qu'il vient d'ajouter, et ce sont les règles de `BDD`,
`Etablissements` et `ACL` (ci-dessus) qui protègent les données. La création ne porte aucune
condition (une ligne qui n'existe pas encore n'a pas d'adresse à comparer). Le widget fonctionne
avec ces droits : il ajoute une ligne, la relit, puis la supprime. À essayer sur une copie.

**Si des lignes restent dans `Annuaire_Sonde`.** La table doit être vide au repos. Depuis la 1.21.7,
le widget attend la réponse de Grist à la suppression de sa ligne, la retente une fois et, si Grist la
refuse, écrit dans la console du navigateur (F12) une phrase qui commence par
`[IDENTITE] la ligne … n'a pas pu être supprimée :`, suivie de la raison donnée par Grist (en général
une règle d'accès qui n'autorise pas « Supprimer » à `rec.Email == user.Email`, la règle 1 ci-dessus).
À chaque chargement, il supprime aussi les lignes plus anciennes laissées à l'adresse de la personne,
jamais celles des autres. Les lignes déjà présentes peuvent être supprimées à la main sans risque :
le widget ne les relit pas.

Pour « un responsable de cette ligne d'`Etablissements` » (ou de cette ligne d'`ACL`), un
attribut d'utilisateur qui cherche `user.Email` dans la colonne `email` d'`ACL` ne rend que
la **première** ligne : pour une personne responsable de plusieurs établissements, une
condition qui consulte toutes les lignes d'`ACL` de son adresse (par exemple en
parcourant `ACL.lookupRecords(email=user.Email)`) est plus sûre. La table-sonde n'est pas une
source utilisable ici : elle est vide au repos, la valeur de sa colonne `Responsable_de` n'existe
que le temps de l'identification. À essayer sur une copie.

Pour « la personne dont `email` est la sienne », une condition comme
`user.Email and rec.email and user.Email.strip().lower() == rec.email.strip().lower()`.
Pour « les administrateurs », le plus simple est un attribut d'utilisateur de Grist
(« Ajouter des attributs d'utilisateur ») qui cherche `user.Email` dans la colonne
`email` de `ACL` : la condition devient `user.Acl.admin`, si vous avez nommé l'attribut
`Acl`. Comme cet attribut ne lit qu'une ligne (voir ci-dessus), cochez `admin` sur **chaque**
ligne d'`ACL` d'un administrateur qui en a plusieurs (le bouton « Mode admin » du widget, lui,
regarde toutes les lignes). La recherche de Grist tient compte de la casse : écrivez les
adresses d'`ACL` en minuscules.

Si vous préférez que le rôle dans le PUI (`Role_dans_le_PUI`) soit attribué par les
administrateurs, retirez-le de la deuxième ligne : le champ reste affiché dans la
fenêtre, mais Grist refusera la modification.

Un refus des règles d'accès n'abîme rien : le widget affiche « Grist a refusé la
modification : vos droits ne permettent pas de changer cette fiche… » (« … cet
établissement ou la liste de ses responsables… » pour une fiche d'établissement), la
fenêtre reste ouverte et aucune cellule n'a été écrite : l'enregistrement d'une fiche est une
seule action Grist, qui passe ou ne passe pas en entier. Seule exception : le fichier d'un
nouveau logo, déjà envoyé, reste alors dans les pièces jointes sans servir (étape 5). Si c'est
l'envoi du fichier que Grist refuse, le message est un autre (« Grist a refusé le fichier : vos
droits ne permettent pas d’ajouter une pièce jointe au document. Contactez un administrateur. »)
et rien n'a été envoyé.

## 5. Les logos des établissements (facultatif)

Le widget est aux couleurs du consortium plutôt qu'à celles d'un établissement : le logo
de chaque établissement figure sur ses cartes, et les logos des fondateurs forment un
bandeau en bas de page. Ces logos sont des **pièces jointes du document Grist** : le dépôt
du widget n'en contient aucun (il est public, et un logo réel n'y a pas sa place sans
l'accord de son titulaire). Sans ces colonnes ou sans fichier, rien ne casse : le **nom** de
l'établissement remplace son logo (la pastille de toujours sur ses cartes, son acronyme en
texte dans le bandeau du bas). Le bandeau du bas, lui, est affiché dès qu'un établissement
fondateur a validé sa présence, même sans aucun logo.

**Les financeurs ne sont pas dans Grist.** Depuis la 1.21.0, le visuel des financeurs en
tête de page (République française, ANR, Bpifrance, France 2030, avec sa phrase) et le rond
France 2030 du bandeau du bas sont deux images fixes du widget (`assets/financeurs.png` et
`assets/france-2030.png`), reprises de la maquette : ce sont des éléments qui ne bougent pas.
Rien n'est à créer ni à remplir, et une table `Financeurs` restée dans le document est
ignorée (vous pouvez la supprimer).

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

**Préparer les fichiers**

- **PNG ou SVG**, de préférence **SVG** (net à toute taille), sur **fond transparent**,
  **rognés au plus près du dessin**. Sur les cartes, le widget donne à tous les logos la
  même hauteur (64 px sur une carte assez large, 32 px sur une carte étroite), quelle que soit
  leur forme, et en borne la largeur pour qu'une bannière très large ne déborde pas ; dans le bandeau du bas, il ajuste la taille de chacun
  pour qu'une rangée de logos de formes différentes (un emblème carré, une bannière large,
  une signature haute) ait un poids visuel voisin. Une marge blanche autour d'un logo le
  ferait paraître plus petit que les autres, et un fond blanc opaque dessinerait un
  rectangle blanc sur le fond de la page.
- Un SVG doit déclarer sa taille (`width` et `height`, ou au moins un `viewBox`).
- Une cellule peut contenir plusieurs fichiers, mais seul le premier est affiché : pour
  changer un logo, **remplacez** le fichier au lieu d'en ajouter un.
- Aucun logo n'est un secret : toute personne qui peut lire le document peut télécharger
  ses pièces jointes.

**Ajouter ou changer un logo.** Dans Grist, cliquez la cellule `logo` de l'établissement
puis le « + » (ou glissez le fichier). Modifier cette table ne rafraîchit
pas le widget tout seul : rechargez la page. Depuis la 1.17.0, un **responsable
d'établissement** remplace aussi le logo de son établissement depuis le widget (fiche de
l'établissement, voir plus bas).

**Comment le widget les lit.** Il demande à Grist un jeton d'accès **en lecture seule**
(`getAccessToken`) et affiche chaque logo par une balise `<img>` à l'adresse que Grist
indique : c'est la méthode que la documentation de Grist donne pour afficher une pièce
jointe. Le jeton figure donc dans l'adresse de l'image ; il ne permet que de **lire** le
document (pas d'y écrire), pour quelques minutes, puis le widget en demande un autre. Voir
[`docs/securite.md`](docs/securite.md#les-logos-et-le-jeton-daccès-aux-pièces-jointes).
Cet affichage **n'a pas pu être essayé dans un vrai document Grist** (les tests simulent
la réponse de Grist) : vérifiez-le sur votre document avant de compter dessus
([`TESTING.md`](TESTING.md), section 14).

**Remplacer un logo depuis le widget (1.17.0).** Le widget redessine l'image choisie (PNG,
JPG, WebP ou SVG, 1 Mo au plus) en un PNG de 480 px au plus, puis l'envoie à Grist : il
demande un jeton d'accès **en écriture**, le temps de cet envoi seul et sans le garder, et
poste le fichier à l'API du document (`POST …/attachments`) ; il écrit ensuite
l'identifiant de la pièce jointe dans la cellule `logo`, avec le reste de la fiche, en une
seule action. L'ancien fichier n'est pas supprimé par le widget ; ce que Grist en fait ensuite
(conservation pour l'historique, nettoyage des pièces jointes inutilisées) est à constater
sur votre document. Si l'envoi réussit mais que l'écriture est refusée ensuite, la pièce jointe
reste dans le document sans servir : le widget le dit, et le nettoyage se fait dans Grist.
Voir [`docs/securite.md`](docs/securite.md#lenvoi-dun-fichier-et-le-jeton-en-écriture). Trois
points **n'ont pas pu être essayés dans un vrai document Grist** : que Grist accepte l'envoi
avec ce jeton, que le navigateur laisse le widget lire la réponse (cela dépend des en-têtes
d'autorisation entre sites que renvoie l'instance Grist), et
que les règles d'accès de l'étape 4 laissent un responsable faire tout cela
([`TESTING.md`](TESTING.md), section 17). Si l'envoi ne marche pas, rien n'est cassé : le
widget affiche une phrase qui dit quoi faire (le plus souvent « Déposez le fichier directement
dans Grist ») et le logo se change dans Grist, comme avant.

Vérifier : ouvrez le widget, console ouverte. Les logos des établissements apparaissent
sur les cartes (tous à la même hauteur), ceux des fondateurs en bas de page ; le visuel des
financeurs est au centre de l'en-tête et le rond France 2030 dans le bandeau du bas, quoi
qu'il y ait dans Grist. Si les logos ne s'affichent pas, la console dit pourquoi :

| Ce que vous voyez | Cause | Remède |
|---|---|---|
| `[LOGOS] Jeton d'accès aux pièces jointes indisponible : les logos sont remplacés par le texte.` et des noms à la place de tous les logos | Grist ne donne pas de jeton (version de Grist sans `getAccessToken`, ou règle d'accès qui interdit la lecture des pièces jointes) | Vérifier l'accès du widget (`full`) et la version de Grist ; essayer avec un compte qui peut modifier le document |
| Le nom d'**un seul** établissement à la place de son logo, ou un message « Failed to load resource » du navigateur | Le fichier est absent de la cellule `logo`, a été supprimé, ou n'est pas une image lisible (PNG, SVG, JPEG…) | Remplacer le fichier dans Grist |
| `[LOGOS] Impossible d'afficher les logos : …` | Une erreur inattendue en construisant l'habillage ; les cartes restent affichées | Transmettre la ligne au mainteneur du code |
| Pas de bandeau en bas de page | Aucun établissement n'est à la fois `fondateur` et `ok_pour_apparaitre` | Cocher les deux cases pour les fondateurs |
| Un logo paraît trop petit, ou entouré de blanc | Marge ou fond blanc dans le fichier | Rogner l'image, fond transparent |

## 6. La photo de profil (facultatif)

Depuis la 1.19.0, une personne peut ajouter sa **photo de profil** : elle remplace ses
initiales sur sa carte, s'agrandit au clic et se montre aussi dans le bandeau « Ma
présence » et dans les fenêtres. Comme un logo, c'est une **pièce jointe du document
Grist** : le dépôt du widget n'en contient aucune (il est public, et le visage d'une
personne n'y a pas sa place). Sans la colonne ci-dessous, rien ne casse : les cartes
gardent leurs initiales et le formulaire de modification n'a pas de carte « Photo de
profil ».

**Dans `BDD`**, une colonne à ajouter (nom exact) :

| Colonne | Type | Rôle |
|---|---|---|
| `Avatar` | Pièces jointes | La photo de profil de la personne : sur sa carte, dans le bandeau « Ma présence » et dans les fenêtres. Seul le premier fichier de la cellule est utilisé |

1. Dans les données brutes de `BDD`, ajoutez une colonne nommée exactement `Avatar`, de
   type **Pièces jointes**.
2. Comme les autres colonnes que le widget écrit (étape 1), elle doit être une colonne de
   **données**, pas une formule.
3. À l'étape 4, ajoutez `Avatar` aux colonnes que la personne dont `email` est la sienne
   (et les administrateurs) peut modifier, et laissez toute personne qui modifie sa fiche
   ajouter une pièce jointe au document : sans cela, l'envoi est refusé (« Grist a refusé le
   fichier : vos droits ne permettent pas d'ajouter une pièce jointe au document »).
4. Rechargez le widget : ouvrez « Modifier mon profil », la carte « Photo de profil »
   apparaît.

**Ce que le widget fait d'une photo.** La personne choisit un fichier (JPG, PNG ou WebP,
2 Mo au plus) ; le navigateur le redessine : recadré en carré au centre, 256 pixels de côté
au plus, converti en JPEG, sans lieu, date ni modèle d'appareil. Rien n'est envoyé avant la
relecture et le clic sur « Valider » : le widget demande alors à Grist un jeton d'accès
**en écriture**, le temps de cet envoi seul et sans le garder, poste le fichier à l'API du
document (`POST …/attachments`, comme pour un logo) et écrit l'identifiant de la pièce
jointe dans la cellule `Avatar`, avec le reste de la fiche, en une seule action. Un
administrateur, mode admin allumé, fait de même pour la fiche d'une autre personne. Voir
[`docs/securite.md`](docs/securite.md#lenvoi-dun-fichier-et-le-jeton-en-écriture).

**Retirer ou remplacer une photo ne supprime pas l'ancien fichier.** « Retirer la photo »
vide la cellule ; remplacer une photo en met une autre. Dans les deux cas, l'ancien fichier
reste dans les pièces jointes du document, lisible par toute personne qui y a accès, tant
que vous ne l'y supprimez pas. Une photo est une **donnée personnelle** : à la demande d'une
personne, supprimez aussi le fichier, pas seulement le contenu de la cellule (ce que Grist
garde ensuite pour son historique et ses instantanés est à constater sur votre document).
Même chose pour un fichier envoyé dont l'écriture a ensuite échoué : le widget le dit, mais
ne sait pas le supprimer.

**Poser une photo vous-même.** Dans Grist, cliquez la cellule `Avatar` de la personne,
puis le « + » (ou glissez le fichier). Préférez une image carrée et légère : le widget
l'affiche en rond, la réduit à l'affichage mais la télécharge entière. Rechargez la page
du widget.

**Trois points n'ont pas pu être essayés dans un vrai document Grist** (les tests simulent
la réponse) : que Grist accepte l'envoi avec le jeton en écriture, que le navigateur laisse
le widget lire la réponse (cela dépend des en-têtes d'autorisation entre sites que renvoie
l'instance Grist), et que les règles d'accès de l'étape 4 laissent une personne ordinaire
ajouter la pièce jointe et écrire `Avatar`. Jouez [`TESTING.md`](TESTING.md), section 18,
sur une copie du document avant d'inviter les personnes à ajouter une photo. Si l'envoi ne
marche pas, rien n'est cassé : le widget affiche une phrase (« … Contactez un
administrateur si le problème persiste. ») et la photo se pose dans Grist, comme ci-dessus.

Vérifier : une personne qui a une photo la voit à la place de ses initiales sur sa carte,
un clic l'agrandit, et la console ne montre ni `[LOGOS]` ni `[ENVOI]`.

| Ce que vous voyez | Cause | Remède |
|---|---|---|
| Pas de carte « Photo de profil » dans le formulaire | `BDD` n'a pas de colonne `Avatar` (ou son nom diffère) | Ajouter la colonne sous ce nom, puis recharger |
| Une photo posée dans la cellule, mais la carte garde les initiales | Le fichier n'est pas une image lisible, ou a été supprimé ; ou Grist ne donne pas de jeton de lecture (`[LOGOS] Jeton d'accès…` : alors aucun logo ne s'affiche non plus) | Remplacer le fichier, vérifier l'accès du widget (`full`), recharger |
| « Grist n’a pas donné au widget l’autorisation d’envoyer un fichier. Contactez un administrateur si le problème persiste. » (ou l'un de ses voisins) à la validation | L'instance Grist ne donne pas de jeton en écriture, refuse la requête du navigateur ou ne répond pas : l'envoi n'a pas pu être essayé dans un vrai Grist | Lire la ligne `[ENVOI]` de la console ; poser la photo dans la cellule ; signaler au mainteneur |
| « Grist a refusé le fichier : vos droits ne permettent pas d’ajouter une pièce jointe au document. Contactez un administrateur. » | Une règle d'accès interdit à cette personne d'ajouter une pièce jointe | Revoir l'étape 4 |
| Des pièces jointes qui ne servent plus s'accumulent | Des photos retirées, remplacées ou jamais utilisées : le widget ne supprime pas de fichier | Les repérer et les supprimer dans Grist |

## À savoir

- **Deux actions d'historique par chargement.** Chaque ouverture du widget laisse une
  création et une suppression dans `Annuaire_Sonde`, de même que chaque enregistrement qui
  change les responsables d'un établissement (le widget relit alors les droits de la
  personne). C'est normal. Si une page est
  fermée entre les deux, une ligne orpheline peut rester : vous pouvez vider la table
  sans risque.
- **« Annuler » de Grist** défait sans doute le dernier changement fait par le widget, y
  compris un changement de présence ou l'enregistrement d'une fiche (une seule action
  Grist) : non constaté dans un vrai Grist.
- **Le widget ne garde aucun historique des modifications**, ni table de demandes :
  elles s'appliquent tout de suite. Pour savoir qui a changé quoi, c'est l'historique de
  Grist lui-même (onglet « Activité » du document, qui garde sans doute les changements ;
  durée de conservation selon votre formule).
- **Deux personnes qui modifient la même fiche en même temps** : si elles touchent
  aux mêmes champs, la seconde est ramenée à la relecture avec ce que Grist contient
  maintenant (rien n'est écrit sans qu'elle l'ait relu) ; sinon les deux modifications
  se cumulent, y compris dans une liste.
- **Une liste qui contient une valeur sans libellé** (une ligne de référence supprimée)
  garde cette valeur à l'enregistrement ; si la cellule contient autre chose que des
  identifiants de ligne, le widget refuse de la réécrire et le dit : à corriger dans
  Grist.
- **Deux responsables qui modifient la même fiche d'établissement en même temps** : s'ils
  touchent au même champ (nom, visibilité, logo), le second est ramené à la fiche actuelle
  avec sa saisie, sans rien perdre ; sinon les deux modifications se cumulent, y compris
  les responsables nommés par l'un et par l'autre.
- **Des pièces jointes orphelines** : si un responsable envoie un logo (ou une personne sa
  photo) et que l'écriture de la fiche échoue ensuite, que la fiche a changé dans Grist
  pendant l'envoi, ou que la page est fermée entre l'envoi et l'écriture, le fichier reste
  dans les pièces jointes du document ; de même, une photo retirée ou remplacée laisse
  l'ancien fichier. Le widget ne sait pas supprimer une pièce jointe.
- **Une adresse sur plusieurs lignes de `BDD`** : le choix de présence s'applique à
  toutes ces lignes (la console le signale). Mieux vaut corriger les doublons.
- **Une personne connectée avec une autre adresse que celle de `BDD`** n'est pas
  retrouvée : le bandeau dit « Compte absent de l'annuaire » (« Administrateur » pour
  un administrateur, « Fiche introuvable » si `BDD` n'a pas de colonne `email`), sans
  interrupteur de présence ni bouton « Modifier ».
