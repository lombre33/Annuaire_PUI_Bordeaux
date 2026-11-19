// Qui est la personne connectée ? L'API des widgets Grist ne donne ni son e-mail
// ni son nom (le jeton d'accès est celui du document, pas de la session). La
// seule voie est une table-sonde dont une colonne a pour formule de déclenchement
// `user.Email` : Grist la calcule à la création d'une ligne, avec l'identité de
// qui l'a créée. Le widget ajoute une ligne, la relit, puis la supprime : il attend la réponse
// de Grist à la suppression, la retente une fois, et dit dans la console pourquoi si Grist la
// refuse (la table est faite pour rester vide). Il supprime aussi les lignes à l'adresse de la
// personne que d'anciens chargements ont laissées, jamais celles des autres. Quand la
// table-sonde manque, il la crée d'abord (`createProbeTable`, GRIST_SETUP.md étape 2) :
// c'est la seule table qu'il ait le droit de créer.
//
// Ce n'est qu'un verrou d'interface. N'importe qui peut ouvrir la console de son
// navigateur et le contourner : seules les règles d'accès de Grist protègent
// vraiment les données (GRIST_SETUP.md).
//
// Dans le doute, personne n'est identifié : sans table-sonde, sans formule qui
// répond, ou si Grist refuse l'écriture (compte Lecteur, règle d'accès), le
// widget n'offre simplement aucune modification. Un visiteur sans compte (lien
// public) n'est jamais identifié non plus : l'adresse anon@getgrist.com que Grist lui
// donne est celle de tous les visiteurs, et le widget lui propose de se connecter (1.44.0).

import { ANONYMOUS_EMAIL, PROBE_RESPONSABLE_COLUMN, PROBE_TABLE } from './constants.js';
import { normalizeEmail, tableToRows, text } from './grist-data.js';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

// L'adresse que Grist donne à un visiteur sans compte (un lien public) n'a pas la forme d'une erreur, mais n'est celle de personne.
const isAnonymousEmail = email => normalizeEmail(email) === ANONYMOUS_EMAIL;

// Ce que Grist répond quand une règle d'accès refuse une écriture : « Blocked by table create access rules ».
const ACCESS_REFUSED = /blocked by .*access rules/i;

// Une erreur de Grist (ou celle qui l'enveloppe : `cause`) dit-elle qu'une règle d'accès a refusé la lecture ou l'écriture ?
export function isAccessRefused(error) {
  for (let current = error, depth = 0; current && depth < 4; current = current.cause, depth += 1) {
    if (ACCESS_REFUSED.test(String(current?.message ?? current))) return true;
  }
  return false;
}
// Ce que Grist (ou le faux Grist des tests) répond à une écriture dans une table qui n'existe pas.
const MISSING_TABLE = /keyerror|invalid table|table .*(not found|inconnue|introuvable|does not exist)|no such table/i;

// La table-sonde telle que GRIST_SETUP.md (étape 2) la décrit. Chaque colonne est une colonne de DONNÉES
// (`isFormula: false`) dont `formula` est une formule de déclenchement : sans `recalcWhen` ni `recalcDeps`,
// Grist ne la calcule qu'à la création d'une ligne, avec l'identité de qui la crée.
const PROBE_COLUMNS = [
  { id: 'Email', type: 'Text', isFormula: false, formula: 'user.Email' },
  {
    id: 'Admin', type: 'Bool', isFormula: false,
    formula: [
      'mail = (user.Email or "").strip().lower()',
      'return bool(mail) and any(bool(r.admin) for r in ACL.all if (r.email or "").strip().lower() == mail)'
    ].join('\n')
  },
  {
    id: PROBE_RESPONSABLE_COLUMN, type: 'Text', isFormula: false,
    formula: [
      'mail = (user.Email or "").strip().lower()',
      'ids = sorted({r.Responsable_de_l_Etablissement.id for r in ACL.all',
      '              if mail and (r.email or "").strip().lower() == mail and r.Responsable_de_l_Etablissement})',
      'return ",".join(str(i) for i in ids)'
    ].join('\n')
  }
];

// Grist ouvre le widget d'un compte Lecteur avec `readonly=true` dans l'adresse
// du cadre (la dernière valeur est la sienne). Un Lecteur ne peut rien écrire,
// pas même la ligne de la sonde : inutile d'essayer. `search` : la partie de
// l'adresse après le « ? » (`location.search`).
export function isReadOnlyAddress(search) {
  try {
    const values = new URLSearchParams(search || '').getAll('readonly');
    return values.length > 0 && values[values.length - 1] === 'true';
  } catch {
    return false;
  }
}

const without = (status, reason) => ({ status, email: '', admin: false, etablissements: [], reason });
const unavailable = reason => without('unavailable', reason);
const anonymous = reason => without('anonymous', reason);

// Les établissements dont la personne est responsable : la colonne `Responsable_de` de la sonde
// donne leurs identifiants de ligne (« 1,3 », ou une liste de références). Tout ce qui n'est pas un
// identifiant entier positif est ignoré.
export function responsableIds(cell) {
  const items = Array.isArray(cell) ? cell : String(cell ?? '').split(/[\s,;]+/).map(token => token.replace(/^\[|\]$/g, ''));
  return [...new Set(items.filter(item => typeof item === 'number' || /^\d+$/.test(item)).map(Number)
    .filter(id => Number.isSafeInteger(id) && id > 0))];
}

// Lit l'identité de la personne : { status, email, admin, etablissements, reason }.
//   status 'ready'        email, admin et etablissements sont fiables (ils viennent des formules
//                         de la sonde, jamais de ce que le navigateur prétend) ; `etablissements`
//                         liste les identifiants des établissements dont la personne est
//                         responsable (vide sans la colonne `Responsable_de`)
//   status 'viewer'       compte Lecteur : aucune écriture possible
//   status 'anonymous'    visiteur sans compte (1.44.0) : Grist lui donne l'adresse anon@getgrist.com, ou ses règles d'accès lui
//                         refusent la ligne de la sonde (une règle `user.IsLoggedIn`). Un compte connecté que la règle de la sonde
//                         refuse est pris pour lui : la fenêtre de connexion le dit (login-ui.js) et la console donne la raison
//   status 'unavailable'  `reason` dit pourquoi (pour la console)
// Ne lève jamais : une identité introuvable n'est pas une panne du widget.
export async function readIdentity(docApi, { readOnly = false, log = console, cleanupWaitMs = CLEANUP_WAIT_MS } = {}) {
  if (readOnly) {
    log.info('[IDENTITE] Grist a ouvert le widget en lecture seule (readonly=true dans l\'adresse du cadre) : '
      + 'personne n\'est identifié et aucune modification n\'est proposée.');
    return { status: 'viewer', email: '', admin: false, etablissements: [], reason: 'document ouvert en lecture seule' };
  }

  let rowId = null;
  let older = []; // les lignes à l'adresse de la personne qu'un chargement précédent a laissées
  try {
    // La liste des tables (_grist_Tables) est refusée à qui les règles d'accès privent de la lecture par défaut (« tout refusé sauf au propriétaire ») :
    // le widget ne sait alors pas si la sonde existe, et l'essaie directement (1.45.2, constaté dans un Grist local par le fil des permissions).
    let tables = null;
    try {
      tables = await docApi.listTables();
    } catch (error) {
      log.info(`[IDENTITE] la liste des tables est illisible pour ce compte (${error?.message || error}) : la table ${PROBE_TABLE} est essayée directement.`);
    }
    if (tables && !tables.includes(PROBE_TABLE)) {
      const failure = await createProbeTable(docApi, log);
      if (failure?.refused) return reportAnonymous(log, failure.reason);
      if (failure) return reportUnavailable(log, failure.reason);
    }
    let added;
    try {
      added = await docApi.applyUserActions([['AddRecord', PROBE_TABLE, null, {}]]);
    } catch (error) {
      const detail = String(error?.message || error);
      if (ACCESS_REFUSED.test(detail)) {
        return reportAnonymous(log, `Grist refuse la ligne de ${PROBE_TABLE} (${detail})`, 'règle d\'accès : la ligne de la sonde est refusée');
      }
      // Sans liste des tables, une table absente se reconnaît à la réponse de Grist ; elle est alors créée, comme avec la liste.
      if (tables || !MISSING_TABLE.test(detail)) throw error;
      const failure = await createProbeTable(docApi, log);
      if (failure?.refused) return reportAnonymous(log, failure.reason);
      if (failure) return reportUnavailable(log, failure.reason);
      added = await docApi.applyUserActions([['AddRecord', PROBE_TABLE, null, {}]]);
    }
    rowId = added?.retValues?.[0];
    if (!Number.isInteger(rowId)) {
      rowId = null;
      return reportUnavailable(log, `Grist n'a pas renvoyé la ligne créée dans ${PROBE_TABLE}`);
    }
    const rows = tableToRows(await docApi.fetchTable(PROBE_TABLE));
    const row = rows.find(candidate => candidate.id === rowId);
    if (!row) return reportUnavailable(log, `la ligne ajoutée à ${PROBE_TABLE} n'a pas été retrouvée à la relecture`);
    const email = text(row.Email);
    if (!EMAIL_SHAPE.test(email)) {
      return reportUnavailable(log, `la formule user.Email de ${PROBE_TABLE} n'a renvoyé aucune adresse`);
    }
    if (isAnonymousEmail(email)) {
      log.info('[IDENTITE] visiteur sans compte (Grist lui donne l\'adresse anonyme que tous les visiteurs sans compte partagent) : personne n\'est identifié, le widget propose de se connecter.');
      return anonymous('Grist ne connaît pas cette personne (adresse anonyme)');
    }
    older = rows.filter(other => other.id < rowId && normalizeEmail(other.Email) === normalizeEmail(email)).map(other => other.id);
    const admin = row.Admin === true;
    const etablissements = responsableIds(row[PROBE_RESPONSABLE_COLUMN]);
    if (!(PROBE_RESPONSABLE_COLUMN in row)) {
      log.info(`[IDENTITE] la sonde n'a pas de colonne « ${PROBE_RESPONSABLE_COLUMN} » : pas de fiche d'établissement (GRIST_SETUP.md).`);
    }
    log.info(`[IDENTITE] personne identifiée (administrateur : ${admin ? 'oui' : 'non'}, `
      + `responsable de ${etablissements.length} établissement${etablissements.length > 1 ? 's' : ''})`);
    return { status: 'ready', email, admin, etablissements, reason: '' };
  } catch (error) {
    return reportUnavailable(log, `lecture impossible : ${error?.message || error}`);
  } finally {
    // Le nettoyage est attendu, mais pas indéfiniment : une réponse qui ne vient pas ne prive pas la personne
    // de son identité (il continue en arrière-plan et dit lui-même comment il finit).
    const cleanup = removeProbeRows(docApi, rowId, older, log).catch(() => {});
    if (!(await finishesWithin(cleanup, cleanupWaitMs))) {
      log.warn(`[IDENTITE] Grist n'a pas répondu à la suppression de la ligne de ${PROBE_TABLE} en ${cleanupWaitMs / 1000} s : `
        + 'l\'identité est rendue sans l\'attendre.');
    }
  }
}

// Combien de temps le widget attend la réponse de Grist à la suppression de ses lignes de sonde.
const CLEANUP_WAIT_MS = 8000;

// Vrai si `promise` finit avant `ms` millisecondes.
async function finishesWithin(promise, ms) {
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(false), ms); });
  try {
    return await Promise.race([promise.then(() => true), late]);
  } finally {
    clearTimeout(timer);
  }
}

// Supprime des lignes de la sonde. La réponse de Grist est attendue, avec une seconde tentative :
// une ligne qui reste n'a rien d'anodin, la table est faite pour rester vide. Renvoie '' quand c'est
// fait, sinon la raison que Grist a donnée.
async function removeRows(docApi, ids) {
  let reason = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await docApi.applyUserActions([ids.length === 1 ? ['RemoveRecord', PROBE_TABLE, ids[0]] : ['BulkRemoveRecord', PROBE_TABLE, ids]]);
      return '';
    } catch (error) {
      reason = String(error?.message || error);
    }
  }
  return reason;
}

// Le nettoyage de la sonde : la ligne qu'on vient d'ajouter, puis (seulement si elle est partie) les lignes
// plus anciennes à la même adresse. Ne lève jamais. La console donne les numéros de ligne et la raison de
// Grist, jamais une adresse.
async function removeProbeRows(docApi, rowId, older, log) {
  if (rowId === null) return;
  const refused = await removeRows(docApi, [rowId]);
  if (refused) {
    log.warn(`[IDENTITE] la ligne ${rowId} de ${PROBE_TABLE} n'a pas pu être supprimée : ${refused} `
      + '(règles d\'accès de la sonde : la personne doit pouvoir supprimer sa propre ligne, GRIST_SETUP.md étape 4).');
    return;
  }
  if (older.length === 0) return;
  const stale = await removeRows(docApi, older);
  if (stale) log.warn(`[IDENTITE] ${older.length} ancienne(s) ligne(s) de ${PROBE_TABLE} à votre adresse n'ont pas pu être supprimées : ${stale}`);
  else log.info(`[IDENTITE] ${older.length} ancienne(s) ligne(s) de ${PROBE_TABLE} à votre adresse, laissées par un chargement précédent, supprimées.`);
}

// Crée la table-sonde absente. Renvoie null si elle existe désormais, sinon { reason, refused } : la raison
// de l'échec et si ce sont les règles d'accès de Grist qui refusent (un compte sans droit sur la structure
// du document). Un visiteur sans compte ne voit pas la table-sonde, que ses règles cachent (elle manque
// alors à la liste des tables qu'il lit), et la structure lui est fermée : il tombe ici. Si une autre personne l'a
// créée au même instant, Grist numérote la nôtre (« Annuaire_Sonde2 ») : on la retire, la table
// d'origine sert à tous.
async function createProbeTable(docApi, log) {
  try {
    const created = await docApi.applyUserActions([['AddTable', PROBE_TABLE, PROBE_COLUMNS]]);
    const made = created?.retValues?.[0]?.id;
    if (typeof made === 'string' && made !== PROBE_TABLE) {
      await Promise.resolve(docApi.applyUserActions([['RemoveTable', made]])).catch(() => {});
      log.info(`[IDENTITE] table « ${PROBE_TABLE} » déjà créée par une autre personne.`);
    } else {
      log.info(`[IDENTITE] table « ${PROBE_TABLE} » absente : créée (GRIST_SETUP.md, étape 2).`);
    }
    return null;
  } catch (error) {
    return {
      reason: `table « ${PROBE_TABLE} » introuvable, et Grist n'a pas permis de la créer : ${error?.message || error} (voir GRIST_SETUP.md)`,
      refused: ACCESS_REFUSED.test(String(error?.message || error))
    };
  }
}

function reportUnavailable(log, reason) {
  log.warn(`[IDENTITE] ${reason}`);
  return unavailable(reason);
}

// Les règles d'accès de Grist refusent la sonde à cette personne : un visiteur sans compte, quand la règle de la sonde exige `user.IsLoggedIn`
// (GRIST_SETUP.md, étape 4). Rien ne dit qu'une personne connectée à qui la même règle s'applique en est une autre : le widget lui propose
// de se connecter, et la console dit quoi revoir. `detail` : ce que la console dit du refus de Grist ; `reason` : ce que l'identité en retient.
function reportAnonymous(log, detail, reason = detail) {
  log.warn(`[IDENTITE] ${detail} : le widget prend cette personne pour un visiteur sans compte et lui propose de se connecter. `
    + 'Si elle est connectée, la règle d\'accès de la sonde (ou le droit de créer la table) est à revoir (GRIST_SETUP.md, étapes 2 et 4).');
  return anonymous(reason);
}
