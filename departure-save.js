// Le départ d'un·e collègue, côté Grist (1.46.0) : relire les fiches, préparer ce que le responsable relit avant de confirmer, puis écrire. Aucun DOM ici.
//
// Rien n'est supprimé. Désactiver une fiche, c'est DÉCOCHER BDD.Accepte_apparaitre sur sa ligne (1.46.1 ; la 1.46.0 cochait une colonne de plus, Fiche_desactivee,
// qu'Antoine a refusée) : la fiche reste dans Grist et le widget ne la montre plus. La réactiver, c'est recocher la case. Le
// transfert recopie les valeurs de la fiche qui part dans celle qui reprend (departure.js). Tout s'écrit en UNE action Grist (la ligne de la personne qui
// reprend, puis celle de la personne qui part) : atomique, jamais un transfert sans désactivation ni l'inverse. Comme pour une fiche (profile-save.js) :
//   - tout se calcule sur les lignes TELLES QU'ELLES SONT AU MOMENT de la relecture, jamais sur ce que la fenêtre avait montré ;
//   - si l'une des deux fiches a changé entre la relecture et l'écriture, rien n'est écrit : le responsable relit d'abord ;
//   - fermé par défaut : sans être responsable de l'établissement, ni la désactivation ni la réactivation n'est tentée, et les deux fiches doivent être
//     de cet établissement (ce que Grist, lui, garantit par ses règles d'accès : GRIST_SETUP.md, étape 4).
//
// Le widget ne s'accorde aucun droit : un verrou d'interface se contourne depuis la console, et seules les règles d'accès de Grist protègent les données.

import { CONSENT_COLUMN, MAIN_TABLE, PENDING_COLUMN } from './constants.js';
import { DOC_REFS } from './doc-refs.js';
import { transferOf } from './departure.js';
import { hasAccepted, normalizeEmail, refId, tableToRows, text } from './grist-data.js';
import { classifyWriteError } from './presence.js';
import { buildRowUpdate, signatureOf } from './profile-save.js';
import { readColumnTypes } from './schema.js';

// Erreur dont le message est une phrase française destinée au responsable ; l'erreur d'origine reste dans `cause` et dans la console.
export class DepartureError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'DepartureError';
  }
}

const FAILURES = {
  read: 'Les fiches n’ont pas pu être relues dans Grist : rien n’a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  denied: 'Grist a refusé la modification : vos droits ne permettent pas de désactiver cette fiche ou de modifier celle de la personne qui reprend. Contactez un administrateur.',
  formula: `Une colonne de la fiche est une colonne à formule : elle ne peut pas être modifiée depuis le widget (voir le ${DOC_REFS.columns.text}).`,
  other: 'La modification n’a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  notResponsable: 'Cette modification ne peut pas être enregistrée : vous n’êtes pas responsable de cet établissement.',
  gone: 'Cette fiche n’existe plus dans Grist : rien n’a été modifié.',
  goneRecipient: 'La personne qui devait reprendre les valeurs n’a plus de fiche dans Grist : rien n’a été modifié.',
  otherEtablissement: 'Cette fiche n’est pas celle d’une personne de cet établissement : rien n’a été modifié.',
  recipientOtherEtablissement: 'La personne qui reprend les valeurs n’est pas de cet établissement : rien n’a été modifié.',
  notActive: 'Cette fiche est une demande en attente de validation : un administrateur doit d’abord la valider ou la refuser. Rien n’a été modifié.',
  recipientNotActive: 'La fiche de la personne qui reprend les valeurs n’apparaît pas dans l’annuaire (demande en attente, ou accord d’apparaître non donné) : rien n’a été modifié.',
  alreadyDeactivated: 'Cette fiche n’apparaît déjà plus dans l’annuaire (la personne n’a pas donné son accord d’apparaître) : rien n’a été modifié.',
  self: 'Vous ne pouvez pas désactiver votre propre fiche. Contactez un administrateur.',
  noRecipient: 'Choisissez la personne qui reprend les valeurs, ou ne cochez aucune rubrique.',
  sameRecipient: 'La personne qui part ne peut pas reprendre ses propres valeurs : choisissez une autre personne.',
  notKept: 'Grist n’a pas gardé tout ce qui était demandé : vérifiez les deux fiches dans Grist ou contactez un administrateur.'
};

// Les lignes de BDD telles qu'elles sont maintenant dans Grist. Lève une DepartureError.
async function readRows(docApi, log) {
  try {
    return tableToRows(await docApi.fetchTable(MAIN_TABLE));
  } catch (error) {
    log.error('[DEPART] lecture de BDD impossible :', error);
    throw new DepartureError(FAILURES.read, error);
  }
}

const personOf = row => ({
  id: row.id,
  name: `${text(row.prenom)} ${text(row.nom)}`.trim() || 'Sans nom',
  email: normalizeEmail(row.email)
});

// Une fiche que l'annuaire montre, côté fiche : validée et acceptée (le reste du critère, l'établissement validé, ne dépend pas de la personne).
const isActive = row => row[PENDING_COLUMN] !== true && hasAccepted(row);

// Ce qui, d'une ligne, dit qu'elle est encore la même fiche d'une personne de l'établissement : sa signature (profile-save.js, signatureOf) s'y ajoute.
const IDENTITY_KEYS = [CONSENT_COLUMN, PENDING_COLUMN, 'Etablissement', 'email'];

// Prépare ce que le responsable relit avant de confirmer : relit les fiches et calcule ce que le départ changerait. Rien n'est écrit. `request` :
//   etablissementId   l'établissement dont la personne est responsable
//   responsable       la personne est responsable de cet établissement (etablissementRightsFor) ; sinon rien n'est tenté
//   meEmail           l'adresse de la personne connectée : elle ne désactive pas sa propre fiche
//   departingId       la ligne de BDD de la personne qui part
//   recipientId       la ligne de celle qui reprend (0 ou null : aucun transfert)
//   groups            les rubriques à transférer (des clés de DEPARTURE_GROUPS) ; il en faut au moins une pour qu'il y ait un transfert
// Renvoie la relecture { departing, recipient, groups, total, values, signatures, etablissementId } que applyDeparture() écrit. Lève une DepartureError.
export async function prepareDeparture(docApi, request, { referenceMaps, log = console }) {
  const { etablissementId, responsable, meEmail, departingId, recipientId = 0, groups = [] } = request;
  if (responsable !== true) throw new DepartureError(FAILURES.notResponsable);
  const rows = await readRows(docApi, log);
  const departing = rows.find(row => row.id === departingId);
  if (!departing) throw new DepartureError(FAILURES.gone);
  if (refId(departing.Etablissement) !== etablissementId) throw new DepartureError(FAILURES.otherEtablissement);
  if (departing[PENDING_COLUMN] === true) throw new DepartureError(FAILURES.notActive);
  if (!hasAccepted(departing)) throw new DepartureError(FAILURES.alreadyDeactivated);
  const me = normalizeEmail(meEmail);
  if (me && normalizeEmail(departing.email) === me) throw new DepartureError(FAILURES.self);

  let recipient = null;
  if (groups.length > 0) {
    if (!recipientId) throw new DepartureError(FAILURES.noRecipient);
    if (recipientId === departingId) throw new DepartureError(FAILURES.sameRecipient);
    recipient = rows.find(row => row.id === recipientId) ?? null;
    if (!recipient) throw new DepartureError(FAILURES.goneRecipient);
    if (refId(recipient.Etablissement) !== etablissementId) throw new DepartureError(FAILURES.recipientOtherEtablissement);
    if (!isActive(recipient)) throw new DepartureError(FAILURES.recipientNotActive);
  }

  const transfer = recipient ? transferOf(departing, recipient, groups, referenceMaps) : { groups: [], champs: {}, total: 0 };
  let values = {};
  if (recipient && Object.keys(transfer.champs).length > 0) {
    const columnTypes = await readColumnTypes(docApi, MAIN_TABLE, { log });
    const built = buildRowUpdate(transfer.champs, recipient, columnTypes);
    if (built.error) throw new DepartureError(`Ces valeurs ne peuvent pas être transférées : ${built.error}.`);
    values = built.values;
  }
  return {
    etablissementId,
    departing: personOf(departing),
    recipient: recipient ? personOf(recipient) : null,
    groups: transfer.groups,
    total: transfer.total,
    values,
    signatures: {
      departing: signatureOf(departing, IDENTITY_KEYS),
      recipient: recipient ? signatureOf(recipient, [...IDENTITY_KEYS, ...Object.keys(values)]) : null
    }
  };
}

// Écrit ce que la relecture (prepareDeparture) montrait, en une seule action Grist : les valeurs de la personne qui reprend, puis la case « Accepte_apparaitre »
// décochée sur la fiche qui part. Renvoie { status: 'saved', total } ou { status: 'changed' } : l'une des deux fiches a changé dans Grist depuis la relecture, rien n'a été
// écrit et le responsable doit relire. Lève une DepartureError.
export async function applyDeparture(docApi, review, { log = console } = {}) {
  const rows = await readRows(docApi, log);
  const departing = rows.find(row => row.id === review.departing.id);
  const recipient = review.recipient ? rows.find(row => row.id === review.recipient.id) : null;
  if (!departing || (review.recipient && !recipient)) return { status: 'changed' };
  if (signatureOf(departing, IDENTITY_KEYS) !== review.signatures.departing) return { status: 'changed' };
  if (recipient && signatureOf(recipient, [...IDENTITY_KEYS, ...Object.keys(review.values)]) !== review.signatures.recipient) return { status: 'changed' };

  const actions = [];
  if (recipient && Object.keys(review.values).length > 0) actions.push(['UpdateRecord', MAIN_TABLE, recipient.id, review.values]);
  actions.push(['UpdateRecord', MAIN_TABLE, departing.id, { [CONSENT_COLUMN]: false }]);
  try {
    await docApi.applyUserActions(actions);
  } catch (error) {
    log.error('[DEPART] écriture impossible :', error);
    throw new DepartureError(FAILURES[classifyWriteError(error)], error);
  }

  // Grist a-t-il tout gardé ? Une relecture qui échoue ne dit rien de plus : l'écriture a réussi.
  let after = null;
  try {
    after = await readRows(docApi, log);
  } catch {
    return { status: 'saved', total: review.total };
  }
  const kept = after.find(row => row.id === departing.id)?.[CONSENT_COLUMN] === false
    && (!recipient || Object.entries(review.values).every(([key, value]) => JSON.stringify(after.find(row => row.id === recipient.id)?.[key] ?? null) === JSON.stringify(value)));
  if (!kept) throw new DepartureError(FAILURES.notKept);
  return { status: 'saved', total: review.total };
}

// Réactive la fiche `id` de l'établissement (1.46.1 : recoche `Accepte_apparaitre`) : elle réapparaît dans l'annuaire. La case est le choix de la PERSONNE : le
// responsable ne la recoche que si la personne a donné son accord, ce que la fenêtre lui rappelle. Ce que le départ avait transféré à une autre personne y reste.
// Renvoie { status: 'reactivated' } ou { status: 'gone' } (la ligne n'existe plus) ou { status: 'done' } (la case est déjà cochée : un autre responsable
// s'en est occupé), sans rien écrire dans les deux derniers cas. Une demande de fiche en attente ne se réactive pas : un administrateur la valide.
// Lève une DepartureError.
export async function reactivateFiche(docApi, { id, etablissementId, responsable }, { log = console } = {}) {
  if (responsable !== true) throw new DepartureError(FAILURES.notResponsable);
  const row = (await readRows(docApi, log)).find(candidate => candidate.id === id);
  if (!row) return { status: 'gone' };
  if (refId(row.Etablissement) !== etablissementId) throw new DepartureError(FAILURES.otherEtablissement);
  if (row[PENDING_COLUMN] === true) throw new DepartureError(FAILURES.notActive);
  if (hasAccepted(row)) return { status: 'done' };
  try {
    await docApi.applyUserActions([['UpdateRecord', MAIN_TABLE, id, { [CONSENT_COLUMN]: true }]]);
  } catch (error) {
    log.error('[DEPART] réactivation impossible :', error);
    throw new DepartureError(FAILURES[classifyWriteError(error)], error);
  }
  return { status: 'reactivated' };
}
