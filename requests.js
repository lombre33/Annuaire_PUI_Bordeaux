// Les demandes de modification : une personne dépose une demande dans la table
// Annuaire_Demandes, un administrateur la valide ou la refuse, et seule la
// validation écrit dans BDD. Aucun accès au DOM ici.
//
// Tout ce qui se lit dans la table des demandes est une donnée non fiable : depuis
// la console du navigateur, n'importe qui peut y écrire ce qu'il veut. Rien ne
// s'applique donc sans avoir été relu champ par champ (parseChanges), et l'auteur
// de la demande, la colonne Email que Grist remplit lui-même, doit être la
// personne de la fiche. Une demande qui ne passe pas ces contrôles ne peut être
// que refusée.

import { MAIN_TABLE, PROFILE_FIELDS, REQUESTS_TABLE, REQUEST_STATUS } from './constants.js';
import { describePerson, formatPhone, normalizeEmail, refId, safeValues, tableToRows, text } from './grist-data.js';
import { cleanText, frenchPhoneDigits, textFault } from './profile.js';
import { classifyWriteError } from './presence.js';

const PAYLOAD_VERSION = 1;
const MAX_PAYLOAD_LENGTH = 20000;
const MAX_LIST_ITEMS = 300;
export const MAX_MESSAGE_LENGTH = 500;

// Erreur dont le message est une phrase française destinée à la personne ; l'erreur
// d'origine reste dans `cause`.
export class RequestError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'RequestError';
  }
}

const FIELDS_BY_KEY = new Map(PROFILE_FIELDS.map(field => [field.key, field]));

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isRowId = value => Number.isSafeInteger(value) && value > 0;
const shorten = value => String(value).slice(0, 40);

// ===== Relire une demande =====

// Chaque lecteur rend { value } ou { error }. `apres` est ce qui compte (la valeur
// proposée) ; `avant` ne sert qu'à signaler une fiche qui a changé depuis. Les
// libellés ne sont jamais crus sur parole : ils viennent des tables de référence
// actuelles.
const readers = {
  text(field, change) {
    if (typeof change.apres !== 'string') return { error: 'valeur proposée illisible' };
    const after = cleanText(change.apres);
    const fault = textFault(after);
    if (fault) return { error: fault };
    return { value: { avant: typeof change.avant === 'string' ? change.avant : '', apres: after } };
  },

  phone(field, change) {
    if (typeof change.apres !== 'string') return { error: 'valeur proposée illisible' };
    const after = change.apres === '' ? '' : frenchPhoneDigits(change.apres);
    if (after === null) return { error: 'numéro français à 10 chiffres attendu' };
    return { value: { avant: typeof change.avant === 'string' ? change.avant : '', apres: after } };
  },

  reference(field, change, referenceMaps) {
    const labels = referenceMaps[field.category] || {};
    const id = change.apres?.id;
    if (!Number.isSafeInteger(id) || id < 0) return { error: 'valeur proposée illisible' };
    if (id !== 0 && !Object.hasOwn(labels, String(id))) return { error: 'valeur inconnue' };
    const beforeId = Number.isSafeInteger(change.avant?.id) && change.avant.id >= 0 ? change.avant.id : 0;
    return {
      value: {
        avant: { id: beforeId, label: labels[String(beforeId)] || '' },
        apres: { id, label: labels[String(id)] || '' }
      }
    };
  },

  list(field, change, referenceMaps) {
    const labels = referenceMaps[field.category] || {};
    const idsOf = value => {
      if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) return null;
      const ids = value.map(item => item?.id);
      return ids.every(isRowId) ? [...new Set(ids)] : null;
    };
    const added = idsOf(change.ajout);
    const removed = idsOf(change.retrait);
    if (!added || !removed) return { error: 'listes de valeurs illisibles' };
    if (added.some(id => !Object.hasOwn(labels, String(id)))) return { error: 'valeur inconnue' };
    if (added.length + removed.length === 0) return { error: 'aucun changement' };
    const entry = id => ({ id, label: labels[String(id)] || '' });
    return { value: { ajout: added.map(entry), retrait: removed.map(entry) } };
  }
};

// Relit le texte de la colonne Changements : { champs } ou { error } (en français,
// pour l'administrateur). Un champ qui n'est pas modifiable, un type inattendu ou
// une valeur inconnue rendent TOUTE la demande inapplicable : jamais appliquée à
// moitié.
export function parseChanges(json, referenceMaps) {
  if (typeof json !== 'string' || json.trim() === '') return { error: 'la demande ne contient aucun changement' };
  if (json.length > MAX_PAYLOAD_LENGTH) return { error: 'la demande est trop longue' };
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { error: 'la demande est illisible (ce n\'est pas du JSON valide)' };
  }
  if (!isPlainObject(data) || data.v !== PAYLOAD_VERSION || !isPlainObject(data.champs)) {
    return { error: 'format de demande inconnu' };
  }
  const champs = {};
  for (const [key, change] of Object.entries(data.champs)) {
    const field = FIELDS_BY_KEY.get(key);
    if (!field) return { error: `champ non modifiable dans une demande : « ${shorten(key)} »` };
    if (!isPlainObject(change)) return { error: `${field.label} : changement illisible` };
    const read = readers[field.kind](field, change, referenceMaps);
    if (read.error) return { error: `${field.label} : ${read.error}` };
    champs[key] = read.value;
  }
  if (Object.keys(champs).length === 0) return { error: 'la demande ne contient aucun changement' };
  return { champs };
}

// ===== Appliquer une demande à une fiche =====

// Dans quelle forme écrire un numéro de téléphone : en nombre si la colonne est
// numérique (le 0 initial est perdu, l'affichage le rétablit), en texte sinon. Sans
// métadonnées, on suit la cellule actuelle : une chaîne reste une chaîne.
function phoneIsNumeric(columnTypes, row) {
  const type = columnTypes.numero_de_telephone;
  if (type) return type === 'Numeric' || type === 'Int';
  return typeof row.numero_de_telephone !== 'string';
}

// Les valeurs à écrire dans la ligne de BDD pour appliquer `champs` : { values } ou
// { error }. Une liste se calcule sur les valeurs ACTUELLES de la fiche (on retire
// et on ajoute, rien d'autre) : ce qu'un administrateur a changé depuis la demande,
// et les valeurs que le formulaire ne montrait pas, sont conservés.
export function buildRowUpdate(champs, row, columnTypes = {}) {
  const values = {};
  for (const field of PROFILE_FIELDS) {
    const change = champs[field.key];
    if (!change) continue;
    if (!(field.key in row)) return { error: `${field.label} : la colonne ${field.key} n'existe pas dans ${MAIN_TABLE}` };
    if (field.kind === 'text') {
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

// ===== Lire les demandes =====

// Une ligne de la table des demandes, sous une forme sûre à manipuler. `changes` est
// le contenu brut de la colonne Changements, pas encore relu (parseChanges).
function readRequestRow(row) {
  const personId = refId(row.Personne);
  return {
    id: row.id,
    date: row.Date,
    authorEmail: text(row.Email),
    personId: Number.isSafeInteger(personId) ? personId : 0,
    status: text(row.Statut),
    changes: row.Changements,
    message: text(row.Message),
    reason: text(row.Motif_refus),
    decidedBy: text(row.Traitee_par),
    decidedAt: row.Traitee_le
  };
}

export const isPending = request => request.status === REQUEST_STATUS.pending;

// La table des demandes existe-t-elle ? Sinon le widget ne propose aucune modification
// de fiche (GRIST_SETUP.md, étape 4). Une lecture impossible vaut « non » : on ne
// propose jamais ce qu'on ne sait pas enregistrer.
export async function hasRequestsTable(docApi, { log = console } = {}) {
  try {
    return (await docApi.listTables()).includes(REQUESTS_TABLE);
  } catch (error) {
    log.warn('[DEMANDES] Liste des tables illisible :', error?.message || error);
    return false;
  }
}

// Les demandes de la table, de la plus ancienne à la plus récente.
export async function loadRequests(docApi) {
  const rows = tableToRows(await docApi.fetchTable(REQUESTS_TABLE));
  return rows.map(readRequestRow).sort((a, b) => (Number(a.date) || 0) - (Number(b.date) || 0) || a.id - b.id);
}

// Les demandes déposées avec l'adresse `email` (celle que Grist a enregistrée), la
// plus récente d'abord. `requests` vient de loadRequests (ancienne en premier).
export function requestsOf(requests, email) {
  const key = normalizeEmail(email);
  if (!key) return [];
  return requests.filter(request => normalizeEmail(request.authorEmail) === key).reverse();
}

// Ce que la personne doit savoir de ses demandes : celle qui attend (la plus récente),
// et la dernière qui a été traitée (validée ou refusée).
export function ownRequestState(requests, email) {
  const mine = requestsOf(requests, email);
  const decided = mine
    .filter(request => request.status === REQUEST_STATUS.accepted || request.status === REQUEST_STATUS.refused)
    .sort((a, b) => (Number(b.decidedAt) || 0) - (Number(a.decidedAt) || 0) || b.id - a.id);
  return { pending: mine.find(isPending) || null, last: decided[0] || null };
}

// Une personne a au plus une demande à traiter : la plus récente remplace celles qu'elle
// avait déposées avant (elle part de la fiche et d'elle, voir profile.js). Les autres
// demandes en attente de la même personne sont « remplacées » : on ne les montre plus
// à valider, et la validation ou le refus de la plus récente les clôt.
// `requests` : de la plus ancienne à la plus récente (loadRequests). Renvoie
// { active: demandes à traiter, plus anciennes d'abord ; history: les autres, plus
// récentes d'abord, avec leur état réel dans `effectiveStatus` }.
export function classifyRequests(requests) {
  const newest = new Map();
  requests.filter(isPending).forEach(request => newest.set(groupKey(request), request));
  const active = [];
  const history = [];
  requests.forEach(request => {
    if (!isPending(request)) {
      history.push({ ...request, effectiveStatus: request.status });
    } else if (newest.get(groupKey(request)) === request) {
      active.push(request);
    } else {
      history.push({ ...request, effectiveStatus: REQUEST_STATUS.superseded });
    }
  });
  history.sort((a, b) => (Number(b.decidedAt || b.date) || 0) - (Number(a.decidedAt || a.date) || 0) || b.id - a.id);
  return { active, history };
}

// Les demandes d'une même personne se regroupent par fiche ; une demande sans fiche
// lisible (supprimée ?) ne remplace rien et n'est remplacée par rien.
const groupKey = request => (request.personId > 0 ? `p${request.personId}` : `r${request.id}`);

// Les demandes en attente de la même fiche, déposées avant `request` ou après.
function otherPending(requests, request) {
  return requests.filter(other => other.id !== request.id && isPending(other) && groupKey(other) === groupKey(request));
}

const isOlder = (a, b) => (Number(a.date) || 0) < (Number(b.date) || 0) || ((Number(a.date) || 0) === (Number(b.date) || 0) && a.id < b.id);

// ===== Ce que voit l'administrateur =====

// Une ligne du détail d'une demande : le champ, ce qu'il valait, ce qu'on propose.
// Même texte pour la personne qui prépare sa demande et pour l'administrateur qui la lit.
function describeChange(field, change) {
  const base = { key: field.key, label: field.label, kind: field.kind };
  const label = entry => entry.label || `n° ${entry.id}`;
  if (field.kind === 'list') return { ...base, added: change.ajout.map(label), removed: change.retrait.map(label) };
  if (field.kind === 'reference') return { ...base, before: change.avant.label, after: change.apres.label };
  if (field.kind === 'phone') return { ...base, before: formatPhone(change.avant), after: formatPhone(change.apres) };
  return { ...base, before: change.avant, after: change.apres };
}

// Les lignes de détail de `champs` (la forme de parseChanges et de diffProfile), dans
// l'ordre du formulaire.
export function describeChanges(champs) {
  return PROFILE_FIELDS.filter(field => champs[field.key]).map(field => describeChange(field, champs[field.key]));
}

// Ce que la fiche contient aujourd'hui si cela diffère de ce que la demande
// croyait (`avant`), sinon null. Seul signe d'une fiche modifiée depuis : une
// liste s'applique en ajoutant et retirant, donc ne peut pas se « périmer ».
function valueSinceRequest(field, change, row, referenceMaps) {
  if (field.kind === 'text') {
    const current = text(row[field.key]);
    return current === change.avant ? null : current || 'vide';
  }
  if (field.kind === 'phone') {
    const current = frenchPhoneDigits(formatPhone(row[field.key])) || '';
    return current === change.avant ? null : formatPhone(row[field.key]) || 'vide';
  }
  if (field.kind === 'reference') {
    const current = refId(row[field.key]) || 0;
    return current === change.avant.id ? null : (referenceMaps[field.category] || {})[String(current)] || 'aucun';
  }
  return null;
}

// Décrit une demande pour l'administrateur : { id, status, date, authorEmail,
// person, message, lines, problems, warnings, canValidate, champs, update }.
//   problems  ce qui interdit de la valider (elle ne peut alors qu'être refusée)
//   warnings  ce qui mérite un coup d'œil : la fiche a changé depuis la demande
//   lines     une ligne par champ : { key, label, kind, before, after } ou, pour
//             une liste, { added, removed } (des libellés)
//   update    les valeurs que la validation écrirait dans BDD
// `findPerson(id)` renvoie { row, name, etablissement } ou null.
export function describeRequest(request, { findPerson, referenceMaps, columnTypes = {} }) {
  const problems = [];
  const warnings = [];
  const person = findPerson(request.personId);

  if (!isPending(request)) problems.push('cette demande a déjà été traitée');
  if (!person) {
    problems.push('la fiche concernée est introuvable (supprimée ?)');
  } else if (!request.authorEmail) {
    problems.push('l\'auteur de la demande n\'est pas enregistré : la colonne Email de la table des demandes doit avoir la formule user.Email');
  } else if (normalizeEmail(request.authorEmail) !== normalizeEmail(person.row.email)) {
    problems.push('la demande a été déposée avec une autre adresse que celle de la fiche');
  }

  const parsed = parseChanges(request.changes, referenceMaps);
  if (parsed.error) problems.push(parsed.error);

  const lines = parsed.champs ? describeChanges(parsed.champs) : [];
  let update = null;
  if (parsed.champs) {
    PROFILE_FIELDS.filter(field => parsed.champs[field.key]).forEach(field => {
      const since = person && valueSinceRequest(field, parsed.champs[field.key], person.row, referenceMaps);
      if (since) warnings.push(`${field.label} : la fiche a changé depuis la demande (valeur actuelle : ${since}).`);
    });
    if (person && problems.length === 0) {
      const built = buildRowUpdate(parsed.champs, person.row, columnTypes);
      if (built.error) problems.push(built.error);
      else update = built.values;
    }
  }

  return {
    id: request.id,
    status: request.status,
    date: request.date,
    authorEmail: request.authorEmail,
    person: person ? { id: person.row.id, name: person.name, etablissement: person.etablissement } : null,
    message: request.message,
    lines,
    problems,
    warnings,
    canValidate: problems.length === 0 && Boolean(update),
    champs: parsed.champs || null,
    update
  };
}

// ===== Déposer, valider, refuser =====

// Ce qu'on dit à la personne quand Grist n'a pas pu écrire : la règle d'accès qui a
// refusé, ou une panne dont le détail est dans la console.
const FAILURES = {
  submit: {
    denied: 'Grist a refusé l\'envoi de la demande : vos droits ne le permettent pas. Contactez un administrateur.',
    other: 'L\'envoi de la demande n\'a pas pu aboutir. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.'
  },
  validate: {
    denied: 'Grist a refusé la validation : vos droits ne le permettent pas.',
    other: 'La validation n\'a pas pu aboutir. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.'
  },
  refuse: {
    denied: 'Les règles d\'accès de Grist ne permettent pas d\'enregistrer ce refus.',
    other: 'Le refus n\'a pas pu être enregistré. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.'
  }
};

function failed(action, error) {
  const messages = FAILURES[action];
  return new RequestError(classifyWriteError(error) === 'denied' ? messages.denied : messages.other, error);
}

// Dépose la demande de la fiche `row` ; { champs, summary } vient de diffProfile().
// Les colonnes Date et Email ne sont PAS écrites ici : Grist les remplit, et c'est
// ce qui rend l'auteur fiable. Renvoie l'identifiant de la demande.
export async function submitRequest(docApi, row, { champs, summary }, message = '', { log = console } = {}) {
  if (Object.keys(champs).length === 0) throw new RequestError('Aucun changement à envoyer.');
  try {
    const result = await docApi.applyUserActions([['AddRecord', REQUESTS_TABLE, null, {
      Personne: row.id,
      Statut: REQUEST_STATUS.pending,
      Changements: JSON.stringify({ v: PAYLOAD_VERSION, champs }),
      Resume: summary,
      Message: cleanText(message).slice(0, MAX_MESSAGE_LENGTH)
    }]]);
    return result?.retValues?.[0];
  } catch (error) {
    log.error('[DEMANDES] Envoi impossible :', error);
    throw failed('submit', error);
  }
}

function requireAdmin(adminEmail) {
  if (!adminEmail) throw new RequestError('Administrateur non identifié : rien n\'a été fait.');
}

// Les demandes de la même fiche qui attendaient avant `request` : elles sont clôturées
// avec elle (« remplacées »), dans la même action. Une demande plus récente de la même
// fiche interdit au contraire de traiter celle-ci : c'est elle qu'il faut traiter ; il ne
// reste donc, après ce contrôle, que des demandes plus anciennes.
function clearOlderPending(requests, request, adminEmail, now) {
  const others = otherPending(requests, request);
  if (others.some(other => isOlder(request, other))) {
    throw new RequestError('Cette demande a été remplacée par une plus récente de la même personne : traitez celle-là.');
  }
  return others.map(other => ['UpdateRecord', REQUESTS_TABLE, other.id, {
    Statut: REQUEST_STATUS.superseded, Traitee_par: adminEmail, Traitee_le: now()
  }]);
}

// Applique la demande à la fiche ET la marque validée, en une seule action atomique :
// jamais l'un sans l'autre. Les tables sont relues à l'instant d'agir : la décision
// porte sur l'état réel de Grist, pas sur ce que l'écran montrait il y a dix minutes.
// Options : adminEmail, referenceMaps, columnTypes. Renvoie la description de la
// demande appliquée.
export async function validateRequest(docApi, requestId, options) {
  const { adminEmail, referenceMaps, columnTypes = {}, now = () => Date.now() / 1000, log = console } = options;
  requireAdmin(adminEmail);
  const [requestsTable, mainTable] = await Promise.all([docApi.fetchTable(REQUESTS_TABLE), docApi.fetchTable(MAIN_TABLE)]);
  const all = tableToRows(requestsTable).map(readRequestRow);
  const request = all.find(candidate => candidate.id === requestId);
  if (!request) throw new RequestError('Cette demande n\'existe plus.');

  const personRow = tableToRows(mainTable).find(candidate => candidate.id === request.personId);
  const description = describeRequest(request, {
    findPerson: () => (personRow ? describePerson(personRow, referenceMaps) : null),
    referenceMaps,
    columnTypes
  });
  if (!description.canValidate) {
    throw new RequestError(`Cette demande ne peut pas être validée : ${description.problems.join(' ; ')}.`);
  }
  const superseded = clearOlderPending(all, request, adminEmail, now);
  try {
    await docApi.applyUserActions([
      ['UpdateRecord', MAIN_TABLE, description.person.id, description.update],
      ['UpdateRecord', REQUESTS_TABLE, request.id, {
        Statut: REQUEST_STATUS.accepted, Traitee_par: adminEmail, Traitee_le: now(), Motif_refus: ''
      }],
      ...superseded
    ]);
  } catch (error) {
    log.error('[DEMANDES] Validation impossible :', error);
    throw failed('validate', error);
  }
  return description;
}

// Valide plusieurs demandes, l'une après l'autre : une demande qui ne passe pas (fiche
// supprimée, droits refusés…) n'empêche pas les autres. Renvoie, pour chacune,
// { id, ok } ou { id, ok: false, error } (le message dit pourquoi).
export async function validateRequests(docApi, requestIds, options) {
  const outcomes = [];
  for (const id of requestIds) {
    try {
      await validateRequest(docApi, id, options);
      outcomes.push({ id, ok: true });
    } catch (error) {
      outcomes.push({ id, ok: false, error: error instanceof RequestError ? error.message : 'Erreur inattendue, voir la console.' });
    }
  }
  return outcomes;
}

// Marque la demande refusée, avec le motif donné à la personne ; la fiche ne bouge pas.
export async function refuseRequest(docApi, requestId, reason, options) {
  const { adminEmail, now = () => Date.now() / 1000, log = console } = options;
  requireAdmin(adminEmail);
  const all = tableToRows(await docApi.fetchTable(REQUESTS_TABLE)).map(readRequestRow);
  const request = all.find(candidate => candidate.id === requestId);
  if (!request) throw new RequestError('Cette demande n\'existe plus.');
  if (!isPending(request)) throw new RequestError('Cette demande a déjà été traitée.');
  const superseded = clearOlderPending(all, request, adminEmail, now);
  try {
    await docApi.applyUserActions([
      ['UpdateRecord', REQUESTS_TABLE, requestId, {
        Statut: REQUEST_STATUS.refused,
        Motif_refus: cleanText(reason).slice(0, MAX_MESSAGE_LENGTH),
        Traitee_par: adminEmail,
        Traitee_le: now()
      }],
      ...superseded
    ]);
  } catch (error) {
    log.error('[DEMANDES] Refus impossible :', error);
    throw failed('refuse', error);
  }
}
