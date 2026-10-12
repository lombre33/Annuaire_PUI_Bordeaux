// Enregistrer une fiche modifiée : relire la ligne de BDD, vérifier que la personne a
// relu ce qui s'y trouve vraiment, puis écrire. Créer la fiche d'une personne qui n'en a pas
// (une ligne ajoutée à BDD, jamais une table). Aucun accès au DOM ici.
//
// Les modifications s'appliquent tout de suite, sans validation ni historique. Pour
// qu'elles restent sûres :
//   - elles se calculent sur la ligne telle qu'elle est AU MOMENT d'écrire : une liste
//     s'obtient en retirant et en ajoutant, rien d'autre, donc ce qu'un autre a ajouté
//     entre-temps et les valeurs que le formulaire ne montrait pas sont conservées ;
//   - si les champs touchés ont changé dans Grist depuis la relecture, rien n'est écrit :
//     la personne relit d'abord ce qui s'y trouve (signatureOf) ;
//   - l'écriture est une seule action Grist, donc atomique.

import { MAIN_TABLE, PROFILE_FIELDS } from './constants.js';
import { describeVisibility, formatPhone, normalizeEmail, safeValues, tableToRows, text } from './grist-data.js';
import { classifyWriteError } from './presence.js';
import { describeChanges, diffProfile, rebaseChanges } from './profile.js';
import { previewOf } from './preview.js';
import { readColumnTypes } from './schema.js';

// Erreur dont le message est une phrase française destinée à la personne ; l'erreur
// d'origine reste dans `cause` et dans la console.
export class ProfileSaveError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'ProfileSaveError';
  }
}

// Dans quelle forme écrire un numéro de téléphone : en nombre si la colonne est
// numérique (le 0 initial est perdu, l'affichage le rétablit), en texte sinon. Sans
// métadonnées, on suit la cellule actuelle : une chaîne reste une chaîne.
function phoneIsNumeric(columnTypes, row) {
  const type = columnTypes.numero_de_telephone;
  if (type) return type === 'Numeric' || type === 'Int';
  return typeof row.numero_de_telephone !== 'string';
}

// Les valeurs à écrire dans la ligne de BDD pour appliquer `champs` (la forme de
// diffProfile, ramenée sur la fiche par rebaseChanges) : { values } ou { error }.
// Une liste se calcule sur les valeurs ACTUELLES de la fiche.
export function buildRowUpdate(champs, row, columnTypes = {}) {
  const values = {};
  for (const field of PROFILE_FIELDS) {
    const change = champs[field.key];
    if (!change) continue;
    if (!(field.key in row)) return { error: `${field.label} : la colonne ${field.key} n'existe pas dans ${MAIN_TABLE}` };
    if (field.kind === 'text' || field.kind === 'email') {
      values[field.key] = change.apres;
    } else if (field.kind === 'phone') {
      const numeric = phoneIsNumeric(columnTypes, row);
      if (change.apres === '') values[field.key] = numeric ? null : '';
      else values[field.key] = numeric ? Number(change.apres) : formatPhone(change.apres);
    } else if (field.kind === 'reference') {
      values[field.key] = change.apres.id;
    } else {
      const current = safeValues(row[field.key]);
      if (current.some(item => !Number.isSafeInteger(item))) {
        return { error: `${field.label} : la fiche contient des valeurs que le widget ne sait pas modifier, à corriger dans Grist` };
      }
      const removed = new Set(change.retrait.map(entry => entry.id));
      const kept = current.filter(id => !removed.has(id));
      const added = change.ajout.map(entry => entry.id).filter(id => !kept.includes(id));
      values[field.key] = ['L', ...kept, ...added];
    }
  }
  const touchesName = 'nom' in values || 'prenom' in values;
  if (touchesName && !text(values.nom ?? row.nom) && !text(values.prenom ?? row.prenom)) {
    return { error: 'la fiche n\'aurait plus ni prénom ni nom' };
  }
  return { values };
}

// Ce que les champs touchés contiennent dans la ligne, sous une forme comparable :
// si elle change entre la relecture et l'écriture, quelqu'un d'autre a modifié la fiche.
export function signatureOf(row, keys) {
  return JSON.stringify(keys.map(key => row?.[key] ?? null));
}

// Les phrases dites à la personne quand Grist n'a pas pu lire ou écrire.
const FAILURES = {
  read: 'La fiche n\'a pas pu être relue dans Grist : rien n\'a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  gone: 'Cette fiche n\'existe plus dans Grist : rien n\'a été modifié.',
  denied: 'Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche. Contactez un administrateur.',
  emailTaken: 'Cette adresse e-mail est maintenant celle d\'une autre fiche : rien n\'a été modifié. Revenez à la fiche et choisissez-en une autre.',
  formula: 'Une colonne de la fiche est une colonne à formule : elle ne peut pas être modifiée depuis le widget. Voir GRIST_SETUP.md.',
  other: 'La modification n\'a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.'
};

// Les lignes de BDD telles qu'elles sont maintenant dans Grist, et celle dont l'identifiant
// est `rowId` : { row, rows }. Lève une ProfileSaveError.
async function readFiche(docApi, rowId, log) {
  let table;
  try {
    table = await docApi.fetchTable(MAIN_TABLE);
  } catch (error) {
    log.error('[PROFIL] lecture de la fiche impossible :', error);
    throw new ProfileSaveError(FAILURES.read, error);
  }
  const rows = tableToRows(table);
  const row = rows.find(candidate => candidate.id === rowId);
  if (!row) throw new ProfileSaveError(FAILURES.gone);
  return { row, rows };
}

// La ligne `rowId` de BDD telle qu'elle est maintenant dans Grist. Lève une ProfileSaveError.
export async function readRow(docApi, rowId, { log = console } = {}) {
  return (await readFiche(docApi, rowId, log)).row;
}

// Adresse → vrai si une AUTRE ligne que `rowId` porte déjà cette adresse (sans tenir compte
// de la casse ni des espaces) : l'adresse retrouve la personne, deux fiches ne la partagent pas.
function emailTakenBy(rows, rowId) {
  const owners = new Set(rows.filter(other => other.id !== rowId).map(other => normalizeEmail(other.email)).filter(Boolean));
  return email => owners.has(normalizeEmail(email));
}

// Prépare la relecture de ce que la personne a changé : relit la fiche dans Grist, ramène
// dessus les changements et en tire la carte « avant » et la carte « après ». Rien n'est
// écrit. `row` est la fiche telle que le formulaire l'a montrée : c'est par rapport à elle
// que se calcule ce que la personne a touché, `draft` ce que le formulaire contient.
// Renvoie la relecture :
//   rowId, admin, champs, signature, columnTypes
//                                           ce que saveProfile() écrira, et comment
//   before, after, marks, lines             ce qu'on montre (preview.js, describeChanges)
//   visibility                              describeVisibility() de la fiche après la
//                                           modification : figure-t-elle dans l'annuaire ?
//   notice                                  les champs que quelqu'un d'autre a changés
//                                           depuis l'ouverture du formulaire, ou ''
// Lève une ProfileSaveError.
export async function prepareReview(docApi, row, draft, { referenceMaps, etabFlags, admin = false, log = console }) {
  const { row: fresh, rows } = await readFiche(docApi, row.id, log);
  const { champs, errors } = diffProfile(row, draft, referenceMaps, { admin, emailTaken: emailTakenBy(rows, row.id) });
  if (errors.length > 0 || Object.keys(champs).length === 0) {
    throw new ProfileSaveError('Il n\'y a rien à relire : corrigez les champs signalés ou modifiez la fiche.');
  }
  const { champs: rebased, moved } = rebaseChanges(champs, fresh, referenceMaps, { admin });
  if (Object.keys(rebased).length === 0) {
    throw new ProfileSaveError('Ces modifications sont déjà dans la fiche : il n\'y a rien à enregistrer.');
  }
  const columnTypes = await readColumnTypes(docApi, MAIN_TABLE, { log });
  const built = buildRowUpdate(rebased, fresh, columnTypes);
  if (built.error) throw new ProfileSaveError(`Ces modifications ne peuvent pas être enregistrées : ${built.error}.`);
  const { before, after, marks } = previewOf(fresh, built.values, referenceMaps, etabFlags);
  return {
    rowId: row.id,
    admin,
    champs: rebased,
    lines: describeChanges(rebased),
    signature: signatureOf(fresh, Object.keys(rebased)),
    columnTypes,
    before,
    after,
    marks,
    visibility: describeVisibility({ ...fresh, ...built.values }, referenceMaps, etabFlags),
    notice: moved.length > 0
      ? `Ces informations ont changé dans Grist depuis l'ouverture de la fenêtre : ${moved.join(', ')}. La carte « Avant » montre leur état actuel.`
      : ''
  };
}

// Après l'écriture : les champs de la relecture que la fiche `saved` (relue dans Grist)
// n'a pas gardés, par leur libellé. Vide quand Grist a tout retenu.
export function unsavedLabels(review, saved, referenceMaps) {
  const who = { admin: review.admin === true, creating: review.creating === true };
  return describeChanges(rebaseChanges(review.champs, saved, referenceMaps, who).champs).map(line => line.label);
}

// Écrit les changements d'une relecture (prepareReview). Renvoie { status: 'saved',
// values } ou { status: 'changed', row } : la fiche a changé dans Grist depuis la
// relecture, rien n'a été écrit et `row` est son état actuel. Lève une ProfileSaveError.
export async function saveProfile(docApi, review, { log = console } = {}) {
  const keys = Object.keys(review.champs);
  if (keys.length === 0) throw new ProfileSaveError('Aucun changement à enregistrer.');
  // Fermé par défaut : l'e-mail et l'établissement ne s'écrivent que pour un administrateur.
  if (review.admin !== true && PROFILE_FIELDS.some(field => field.admin && keys.includes(field.key))) {
    throw new ProfileSaveError('Ces modifications ne peuvent pas être enregistrées : l\'e-mail et l\'établissement sont réservés à un administrateur.');
  }
  const { row, rows } = await readFiche(docApi, review.rowId, log);
  if (signatureOf(row, keys) !== review.signature) return { status: 'changed', row };
  if (review.champs.email && emailTakenBy(rows, review.rowId)(review.champs.email.apres)) {
    throw new ProfileSaveError(FAILURES.emailTaken);
  }

  const built = buildRowUpdate(review.champs, row, review.columnTypes);
  if (built.error) throw new ProfileSaveError(`Ces modifications ne peuvent pas être enregistrées : ${built.error}.`);
  try {
    await docApi.applyUserActions([['UpdateRecord', MAIN_TABLE, review.rowId, built.values]]);
  } catch (error) {
    log.error('[PROFIL] écriture impossible :', error);
    throw new ProfileSaveError(FAILURES[classifyWriteError(error)], error);
  }
  return { status: 'saved', values: built.values };
}

// ===== Créer la fiche de la personne connectée =====

// Les phrases dites à la personne quand sa fiche ne peut pas être créée.
const CREATION_FAILURES = {
  ...FAILURES,
  denied: 'Grist a refusé la création : vos droits ne permettent pas d\'ajouter une fiche. Contactez un administrateur.',
  other: 'La fiche n\'a pas pu être créée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  exists: 'Une fiche porte déjà votre adresse : rien n\'a été créé. Rechargez la page pour la retrouver.',
  noEmailColumn: 'BDD n\'a pas de colonne « email » : la fiche ne pourrait pas être reliée à votre compte. Rien n\'a été créé. Contactez un administrateur.'
};

// Relit BDD et vérifie que la fiche peut y être créée : la table a une colonne « email » et aucune ligne
// ne porte déjà cette adresse (créée entre-temps, dans un autre onglet ou par un administrateur).
// Lève une ProfileSaveError.
async function checkCanCreate(docApi, email, log) {
  let table;
  try {
    table = await docApi.fetchTable(MAIN_TABLE);
  } catch (error) {
    log.error('[PROFIL] lecture de BDD impossible :', error);
    throw new ProfileSaveError(FAILURES.read, error);
  }
  if (!('email' in table)) throw new ProfileSaveError(CREATION_FAILURES.noEmailColumn);
  const mine = normalizeEmail(email);
  if (!mine) throw new ProfileSaveError(CREATION_FAILURES.other);
  if (tableToRows(table).some(row => normalizeEmail(row.email) === mine)) throw new ProfileSaveError(CREATION_FAILURES.exists);
}

// Prépare la relecture de la fiche qu'une personne veut créer : vérifie qu'elle n'existe pas déjà, ramène
// le brouillon à ce qui sera écrit et en tire la carte « après ». Rien n'est écrit. `blank` : la fiche
// vide (blankFiche, avec l'adresse du compte), `email` : l'adresse du compte, jamais celle du brouillon.
// Renvoie la relecture : { creating, email, champs, values, lines, after, visibility, notice }.
// Lève une ProfileSaveError.
export async function prepareCreation(docApi, blank, draft, { email, referenceMaps, etabFlags, log = console }) {
  await checkCanCreate(docApi, email, log);
  const { champs, errors } = diffProfile(blank, draft, referenceMaps, { creating: true });
  if (errors.length > 0 || Object.keys(champs).length === 0) {
    throw new ProfileSaveError('Il n\'y a rien à relire : corrigez les champs signalés ou remplissez la fiche.');
  }
  const columnTypes = await readColumnTypes(docApi, MAIN_TABLE, { log });
  const built = buildRowUpdate(champs, blank, columnTypes);
  if (built.error) throw new ProfileSaveError(`Cette fiche ne peut pas être créée : ${built.error}.`);
  const row = { ...blank, email: normalizeEmail(email) };
  return {
    creating: true,
    email: row.email,
    champs,
    values: { email: row.email, ...built.values },
    lines: describeChanges(champs),
    after: previewOf(row, built.values, referenceMaps, etabFlags).after,
    visibility: describeVisibility({ ...row, ...built.values }, referenceMaps, etabFlags),
    notice: ''
  };
}

// Ajoute la ligne de la relecture (prepareCreation) à BDD, en une seule action Grist. Elle porte l'adresse
// du compte et ce que la personne a rempli ; ni le choix de présence (l'interrupteur « Ma présence » en
// décide) ni le périmètre (l'affaire de Grist). Renvoie { status: 'created', rowId } ; lève une
// ProfileSaveError, sans rien écrire, si une fiche porte déjà l'adresse.
export async function createProfile(docApi, review, { log = console } = {}) {
  if (review?.creating !== true || !review.email || Object.keys(review.champs).length === 0) {
    throw new ProfileSaveError('Aucune fiche à créer.');
  }
  await checkCanCreate(docApi, review.email, log);
  let added;
  try {
    added = await docApi.applyUserActions([['AddRecord', MAIN_TABLE, null, review.values]]);
  } catch (error) {
    log.error('[PROFIL] création impossible :', error);
    throw new ProfileSaveError(CREATION_FAILURES[classifyWriteError(error)], error);
  }
  const rowId = added?.retValues?.[0];
  return { status: 'created', rowId: Number.isInteger(rowId) ? rowId : null };
}
