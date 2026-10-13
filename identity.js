// Qui est la personne connectée ? L'API des widgets Grist ne donne ni son e-mail
// ni son nom (le jeton d'accès est celui du document, pas de la session). La
// seule voie est une table-sonde dont une colonne a pour formule de déclenchement
// `user.Email` : Grist la calcule à la création d'une ligne, avec l'identité de
// qui l'a créée. Le widget ajoute une ligne, la relit, puis la supprime. Quand la
// table-sonde manque, il la crée d'abord (`createProbeTable`, GRIST_SETUP.md étape 2) :
// c'est la seule table qu'il ait le droit de créer.
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
  if (readOnly) {
    log.info('[IDENTITE] Grist a ouvert le widget en lecture seule (readonly=true dans l\'adresse du cadre) : '
      + 'personne n\'est identifié et aucune modification n\'est proposée.');
    return { status: 'viewer', email: '', admin: false, etablissements: [], reason: 'document ouvert en lecture seule' };
  }

  let rowId = null;
  try {
    const tables = await docApi.listTables();
    if (!tables.includes(PROBE_TABLE)) {
      const failure = await createProbeTable(docApi, log);
      if (failure) return reportUnavailable(log, failure);
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

// Crée la table-sonde absente. Renvoie '' si elle existe désormais, sinon la raison de l'échec (par
// exemple un compte sans droit sur la structure du document : Grist refuse). Si une autre personne l'a
// créée au même instant, Grist numérote la nôtre (« Annuaire_Sonde2 ») : on la retire, la table
// d'origine sert à tous.
async function createProbeTable(docApi, log) {
  try {
    const created = await docApi.applyUserActions([['AddTable', PROBE_TABLE, PROBE_COLUMNS]]);
    const made = created?.retValues?.[0]?.id;
    if (typeof made === 'string' && made !== PROBE_TABLE) {
      await Promise.resolve(docApi.applyUserActions([['RemoveTable', made]])).catch(() => {});
      log.info(`[IDENTITE] table « ${PROBE_TABLE} » déjà créée par une autre personne.`);
    } else {
      log.info(`[IDENTITE] table « ${PROBE_TABLE} » absente : créée (GRIST_SETUP.md, étape 2).`);
    }
    return '';
  } catch (error) {
    return `table « ${PROBE_TABLE} » introuvable, et Grist n'a pas permis de la créer : ${error?.message || error} (voir GRIST_SETUP.md)`;
  }
}

function reportUnavailable(log, reason) {
  log.warn(`[IDENTITE] ${reason}`);
  return unavailable(reason);
}
