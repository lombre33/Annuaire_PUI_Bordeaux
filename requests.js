// Les demandes de fiche en attente de validation (1.45.0, Antoine, 19 novembre 2026) : une personne qui n'est pas dans l'annuaire crée sa fiche
// (profile-save.js, createProfile), qui reste une DEMANDE (BDD.En_attente_validation vraie) tant qu'un administrateur ne l'a pas validée. Ici, ce
// que l'administrateur lit (la liste des demandes, avec ce qui aide à décider) et ce qu'il écrit : valider (la case passe à faux) ou refuser
// (la ligne est supprimée). Aucun DOM ; requests-ui.js dessine la fenêtre. Les écritures ne sont que des lignes de BDD, jamais une table.

import { ETABLISSEMENT_DOMAIN_COLUMN, MAIN_TABLE, PENDING_COLUMN } from './constants.js';
import { refId, tableToRows, text } from './grist-data.js';
import { classifyWriteError } from './presence.js';
import { domainMatches, domainsOf, emailDomain } from './domains.js';

// Une erreur dont le message est une phrase française destinée à l'administrateur ; l'erreur d'origine reste dans `cause` et dans la console.
export class RequestError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'RequestError';
  }
}

const FAILURES = {
  denied: 'Grist a refusé : vos droits ne permettent pas de traiter cette demande.',
  read: 'Grist n\'a pas pu relire la demande. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  other: 'La demande n\'a pas pu être traitée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.'
};

// Ce que l'administrateur lit d'une demande : { id, name, email, etablissement, fonction, domain } ;
//   domain   'ok' (le domaine de l'adresse est l'un de ceux de l'établissement choisi), 'other' (il ne l'est pas : à regarder avant de valider),
//            'unknown' (Etablissements n'a pas de colonne des domaines, ou l'établissement n'en déclare aucun : rien à comparer)
// `persons` : people.pendingRequests() (grist-data.js) ; `etablissementRows` : les lignes d'Etablissements.
export function describeRequests(persons, etablissementRows = []) {
  const byId = new Map(etablissementRows.filter(row => Number.isInteger(row.id)).map(row => [row.id, row]));
  return persons.map(({ row, name, etablissement }) => {
    const listed = domainsOf(byId.get(refId(row.Etablissement))?.[ETABLISSEMENT_DOMAIN_COLUMN]);
    const domain = emailDomain(row.email);
    return {
      id: row.id,
      name: name || 'Sans nom',
      email: text(row.email),
      etablissement: etablissement || 'Sans établissement',
      fonction: text(row.Fonction),
      domain: listed.length === 0 || !domain ? 'unknown' : domainMatches(domain, listed) ? 'ok' : 'other'
    };
  });
}

// Relit la ligne de la demande avant d'écrire : un autre administrateur a pu la valider ou la refuser entre-temps. Renvoie
// { status: 'ready' } ou { status: 'gone' } (la ligne n'existe plus) ou { status: 'done' } (elle n'est plus en attente). Lève une RequestError.
async function inspect(docApi, request, log) {
  let table;
  try {
    table = await docApi.fetchTable(MAIN_TABLE);
  } catch (error) {
    log.error('[PROFIL] lecture de BDD impossible :', error);
    throw new RequestError(FAILURES.read, error);
  }
  const row = tableToRows(table).find(candidate => candidate.id === request.id);
  if (!row) return { status: 'gone' };
  if (row[PENDING_COLUMN] !== true) return { status: 'done' };
  return { status: 'ready' };
}

async function write(docApi, action, log) {
  try {
    await docApi.applyUserActions([action]);
  } catch (error) {
    log.error('[PROFIL] écriture impossible :', error);
    throw new RequestError(FAILURES[classifyWriteError(error)] ?? FAILURES.other, error);
  }
}

// Valide la demande : la fiche devient une fiche ordinaire (elle apparaît si la personne a accepté d'apparaître et si son établissement est
// éligible). Renvoie { status: 'validated' }, ou 'gone' / 'done' quand la demande n'était plus à traiter (rien n'est écrit).
export async function approveRequest(docApi, request, { log = console } = {}) {
  const state = await inspect(docApi, request, log);
  if (state.status !== 'ready') return state;
  await write(docApi, ['UpdateRecord', MAIN_TABLE, request.id, { [PENDING_COLUMN]: false }], log);
  return { status: 'validated' };
}

// Refuse la demande : la ligne est supprimée (la personne peut redemander). Renvoie { status: 'refused' }, ou 'gone' / 'done' sans rien écrire.
export async function refuseRequest(docApi, request, { log = console } = {}) {
  const state = await inspect(docApi, request, log);
  if (state.status !== 'ready') return state;
  await write(docApi, ['RemoveRecord', MAIN_TABLE, request.id], log);
  return { status: 'refused' };
}
