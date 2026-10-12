// Qui est la personne connectée ? L'API des widgets Grist ne donne ni son e-mail
// ni son nom (le jeton d'accès est celui du document, pas de la session). La
// seule voie est une table-sonde dont une colonne a pour formule de déclenchement
// `user.Email` : Grist la calcule à la création d'une ligne, avec l'identité de
// qui l'a créée. Le widget ajoute une ligne, la relit, puis la supprime.
//
// Ce n'est qu'un verrou d'interface. N'importe qui peut ouvrir la console de son
// navigateur et le contourner : seules les règles d'accès de Grist protègent
// vraiment les données (GRIST_SETUP.md).
//
// Dans le doute, personne n'est identifié : sans table-sonde, sans formule qui
// répond, ou si Grist refuse l'écriture (compte Lecteur, règle d'accès), le
// widget n'offre simplement aucune modification.

import { PROBE_RESPONSABLE_COLUMN, PROBE_TABLE } from './constants.js';
import { tableToRows, text } from './grist-data.js';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

// Grist ouvre le widget d'un compte Lecteur avec `readonly=true` dans l'adresse
// du cadre (la dernière valeur est la sienne). Un Lecteur ne peut rien écrire,
// pas même la ligne de la sonde : inutile d'essayer. `search` : la partie de
// l'adresse après le « ? » (`location.search`).
export function isReadOnlyAddress(search) {
  let values = [];
  try {
    values = new URLSearchParams(search || '').getAll('readonly');
  } catch {
    return false;
  }
  return values.length > 0 && values[values.length - 1] === 'true';
}

const unavailable = reason => ({ status: 'unavailable', email: '', admin: false, etablissements: [], reason });

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
//   status 'unavailable'  `reason` dit pourquoi (pour la console)
// Ne lève jamais : une identité introuvable n'est pas une panne du widget.
export async function readIdentity(docApi, { readOnly = false, log = console } = {}) {
  if (readOnly) return { status: 'viewer', email: '', admin: false, etablissements: [], reason: 'document ouvert en lecture seule' };

  let rowId = null;
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(PROBE_TABLE)) {
      return reportUnavailable(log, `table « ${PROBE_TABLE} » introuvable (voir GRIST_SETUP.md)`);
    }
    const added = await docApi.applyUserActions([['AddRecord', PROBE_TABLE, null, {}]]);
    rowId = added?.retValues?.[0];
    if (!Number.isInteger(rowId)) {
      rowId = null;
      return reportUnavailable(log, `Grist n'a pas renvoyé la ligne créée dans ${PROBE_TABLE}`);
    }
    const row = tableToRows(await docApi.fetchTable(PROBE_TABLE)).find(candidate => candidate.id === rowId);
    const email = text(row?.Email);
    if (!EMAIL_SHAPE.test(email)) {
      return reportUnavailable(log, `la formule user.Email de ${PROBE_TABLE} n'a renvoyé aucune adresse`);
    }
    const admin = row.Admin === true;
    const etablissements = responsableIds(row[PROBE_RESPONSABLE_COLUMN]);
    if (!(PROBE_RESPONSABLE_COLUMN in row)) {
      log.info(`[IDENTITE] la sonde n'a pas de colonne « ${PROBE_RESPONSABLE_COLUMN} » : pas de fiche d'établissement (GRIST_SETUP.md).`);
    }
    log.info(`[IDENTITE] personne identifiée (administrateur : ${admin ? 'oui' : 'non'}, `
      + `responsable de ${etablissements.length} établissement${etablissements.length > 1 ? 's' : ''})`);
    return { status: 'ready', email, admin, etablissements, reason: '' };
  } catch (error) {
    return reportUnavailable(log, `lecture impossible : ${error?.message || error}`);
  } finally {
    // Nettoyage au mieux : une ligne oubliée ne gêne personne.
    if (rowId !== null) Promise.resolve(docApi.applyUserActions([['RemoveRecord', PROBE_TABLE, rowId]])).catch(() => {});
  }
}

function reportUnavailable(log, reason) {
  log.warn(`[IDENTITE] ${reason}`);
  return unavailable(reason);
}
