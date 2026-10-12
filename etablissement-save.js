// Enregistrer la fiche d'un établissement (1.17.0) : relire l'établissement et la liste de ses
// responsables dans Grist, vérifier que rien n'a changé sous les yeux de la personne, puis écrire.
// Aucun accès au DOM ici.
//
// Comme pour la fiche d'une personne (profile-save.js), les modifications s'appliquent tout de suite,
// sans validation ni historique, et restent sûres parce que :
//   - elles se calculent sur ce que Grist contient AU MOMENT d'écrire : une liste de responsables se
//     modifie en retirant et en ajoutant, rien d'autre, donc ce qu'un autre a nommé entre-temps reste ;
//   - si le nom, la visibilité ou le logo ont changé dans Grist depuis l'ouverture de la fenêtre,
//     rien n'est écrit : la personne relit d'abord ce qui s'y trouve ;
//   - tout s'écrit en une seule action Grist (la ligne d'Etablissements et les lignes d'ACL), donc
//     atomique : un établissement ne reste jamais à moitié modifié ;
//   - rien ne s'écrit sans que la personne soit responsable de l'établissement, et un établissement
//     garde toujours au moins un responsable.
//
// Le fichier d'un nouveau logo est envoyé AVANT l'écriture (upload.js) ; si l'écriture n'a pas lieu
// ensuite, le fichier reste dans les pièces jointes du document sans qu'aucune cellule ne le
// référence : l'erreur le dit (`leftover`) pour que la personne en soit informée.

import { ACL_COLUMNS, ACL_TABLE, ETABLISSEMENT_COLUMNS, ETABLISSEMENT_TABLE } from './constants.js';
import { KEEP_ONE, etablissementOf, responsablesOf } from './etablissement.js';
import { isEmptyReference, normalizeEmail, tableToRows } from './grist-data.js';
import { classifyWriteError } from './presence.js';

// Erreur dont le message est une phrase française destinée à la personne ; l'erreur d'origine reste
// dans `cause` et dans la console. `leftover` : l'identifiant du fichier envoyé qui n'a servi à rien.
export class EtablissementSaveError extends Error {
  constructor(message, cause, { leftover = null } = {}) {
    super(message, { cause });
    this.name = 'EtablissementSaveError';
    this.leftover = leftover;
  }
}

const FAILURES = {
  read: 'La fiche de l’établissement n’a pas pu être relue dans Grist : rien n’a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  aclRead: 'La liste des responsables n’a pas pu être relue dans Grist : rien n’a été modifié. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  gone: 'Cet établissement n’existe plus dans Grist : rien n’a été modifié.',
  denied: 'Grist a refusé la modification : vos droits ne permettent pas de changer cet établissement ou la liste de ses responsables. Contactez un administrateur.',
  formula: 'Une colonne de l’établissement est une colonne à formule : elle ne peut pas être modifiée depuis le widget. Voir GRIST_SETUP.md.',
  other: 'La modification n’a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.',
  notResponsable: 'Cette modification ne peut pas être enregistrée : vous n’êtes pas responsable de cet établissement.',
  nothing: 'Aucun changement à enregistrer.',
  already: 'Ces modifications sont déjà dans la fiche de l’établissement : il n’y a rien à enregistrer.',
  noFile: 'Le logo choisi n’est plus disponible : choisissez-le de nouveau.'
};

// Les champs de la fiche qui s'écrivent dans Etablissements, avec leur mot dans les phrases.
const FIELDS = [
  { key: 'logo', label: 'logo' },
  { key: 'name', label: 'nom' },
  { key: 'visible', label: 'visibilité' }
];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ===== Lire =====

// La ligne `etablissementId` d'Etablissements et la table des responsables, telles qu'elles sont
// maintenant dans Grist : { row, acl }. `acl` est null quand la table ne peut pas être lue (elle
// n'existe pas, ou une règle d'accès la refuse à cette personne) : la fiche s'ouvre alors sans la
// liste des responsables, qu'elle ne montre ni ne modifie. Lève une EtablissementSaveError si
// l'établissement lui-même ne se lit pas.
async function readState(docApi, etablissementId, log) {
  let rows;
  try {
    rows = tableToRows(await docApi.fetchTable(ETABLISSEMENT_TABLE));
  } catch (error) {
    log.error('[FICHE-ETAB] lecture de la fiche impossible :', error);
    throw new EtablissementSaveError(FAILURES.read, error);
  }
  const row = rows.find(candidate => candidate.id === etablissementId);
  if (!row) throw new EtablissementSaveError(FAILURES.gone);

  let acl = null;
  try {
    acl = tableToRows(await docApi.fetchTable(ACL_TABLE));
  } catch (error) {
    log.warn(`[FICHE-ETAB] La table ${ACL_TABLE} ne peut pas être lue : la liste des responsables n'est ni montrée ni modifiable (GRIST_SETUP.md).`, error?.message || error);
  }
  return { row, acl };
}

// Ce que la fenêtre montre à l'ouverture : { row, etablissement, acl, responsables }. `row` est la
// ligne brute (la base de comparaison de savePlanOf), `etablissement` sa version pour la fenêtre
// (etablissementOf), `responsables` la liste (responsablesOf) ou null si elle n'a pas pu être lue.
export async function readEtablissement(docApi, etablissementId, { log = console } = {}) {
  const { row, acl } = await readState(docApi, etablissementId, log);
  return {
    row,
    etablissement: etablissementOf(row),
    acl,
    responsables: acl === null ? null : responsablesOf(acl, etablissementId)
  };
}

// ===== Préparer =====

// Le plan d'un enregistrement, tiré de ce que la fenêtre a montré (`row`, la ligne brute lue à
// l'ouverture), de ce que la personne a changé (`champs`, diffEtablissement) et du fichier du
// nouveau logo (`file`, image-prep.js). `responsable` : la personne est responsable de cet
// établissement (etablissementRightsFor).
export function savePlanOf(row, champs, { file = null, responsable = false } = {}) {
  const base = {};
  FIELDS.forEach(({ key }) => { if (champs[key]) base[key] = row[ETABLISSEMENT_COLUMNS[key]] ?? null; });
  return { etablissementId: row.id, responsable: responsable === true, champs, base, file };
}

// Compare la ligne d'Etablissements relue au plan. Renvoie { moved, values } : `moved`, les champs
// que quelqu'un d'autre a changés depuis l'ouverture de la fenêtre (leur mot) ; `values`, ce qu'il
// reste à écrire dans la ligne (sans le logo remplacé, dont l'identifiant n'existe qu'après l'envoi).
function rebaseRow(row, plan) {
  const moved = [];
  const values = {};
  FIELDS.forEach(({ key, label }) => {
    const change = plan.champs[key];
    if (!change) return;
    const column = ETABLISSEMENT_COLUMNS[key];
    if (!(column in row)) {
      throw new EtablissementSaveError(`Ces modifications ne peuvent pas être enregistrées : la colonne ${column} n’existe pas dans ${ETABLISSEMENT_TABLE}${key === 'logo' ? ' (GRIST_SETUP.md, étape 5)' : ''}.`);
    }
    const now = row[column] ?? null;
    if (key === 'logo') {
      if (!same(now, plan.base.logo)) moved.push(label);
      else if (change.action === 'remove') values[column] = ['L'];
    } else if (same(now, change.apres)) {
      // Déjà dans la fiche : rien à écrire.
    } else if (!same(now, plan.base[key])) {
      moved.push(label);
    } else {
      values[column] = change.apres;
    }
  });
  return { moved, values };
}

// Les actions d'ACL qui donnent à l'établissement les responsables voulus, calculées sur la table
// telle qu'elle est maintenant : { actions, kept }. `kept` : les adresses qui seront responsables.
//   - un responsable retiré dont la ligne porte aussi le droit d'administrateur n'est pas supprimé :
//     la ligne perd seulement son établissement, l'administrateur reste administrateur ;
//   - une adresse ajoutée qui figure déjà dans ACL sans établissement (un administrateur) reprend
//     cette ligne ; sinon une ligne est créée, sans toucher à la colonne admin.
function aclActionsFor(acl, etablissementId, { ajout, retrait }) {
  const current = responsablesOf(acl, etablissementId);
  const removing = new Set(retrait.map(normalizeEmail));
  const actions = [];
  current.filter(entry => removing.has(entry.email)).forEach(entry => {
    entry.rows.forEach(row => {
      actions.push(row.admin
        ? ['UpdateRecord', ACL_TABLE, row.id, { [ACL_COLUMNS.etablissement]: 0 }]
        : ['RemoveRecord', ACL_TABLE, row.id]);
    });
  });
  const kept = new Set(current.map(entry => entry.email).filter(email => !removing.has(email)));
  ajout.map(normalizeEmail).forEach(email => {
    if (kept.has(email)) return; // un autre l'a nommé entre-temps
    const free = acl.find(row => normalizeEmail(row[ACL_COLUMNS.email]) === email && isEmptyReference(row[ACL_COLUMNS.etablissement]));
    actions.push(free
      ? ['UpdateRecord', ACL_TABLE, free.id, { [ACL_COLUMNS.etablissement]: etablissementId }]
      : ['AddRecord', ACL_TABLE, null, { [ACL_COLUMNS.email]: email, [ACL_COLUMNS.etablissement]: etablissementId }]);
    kept.add(email);
  });
  return { actions, kept: [...kept] };
}

// Ce qu'il y a à écrire d'après l'état relu : { status: 'changed', moved, state } (quelqu'un a modifié
// la fiche pendant que la fenêtre était ouverte : rien n'est écrit) ou { status: 'ready', values,
// actions } (les valeurs de la ligne, hors logo envoyé, et les actions d'ACL). Lève une
// EtablissementSaveError quand l'enregistrement serait refusé.
function evaluate(state, plan) {
  const { moved, values } = rebaseRow(state.row, plan);
  if (moved.length > 0) return { status: 'changed', moved, state };

  let actions = [];
  if (plan.champs.responsables) {
    if (state.acl === null) throw new EtablissementSaveError(FAILURES.aclRead);
    const planned = aclActionsFor(state.acl, plan.etablissementId, plan.champs.responsables);
    if (planned.kept.length === 0) throw new EtablissementSaveError(KEEP_ONE);
    actions = planned.actions;
  }
  return { status: 'ready', values, actions };
}

// ===== Écrire =====

// Relit Etablissements et ACL après l'écriture : les mots des champs que Grist n'a pas gardés
// (vide quand tout y est), ou null si la relecture elle-même échoue.
async function unsavedAfter(docApi, plan, attachmentId, log) {
  let state;
  try {
    state = await readState(docApi, plan.etablissementId, log);
  } catch {
    return null;
  }
  const { champs } = plan;
  const unsaved = [];
  const first = cell => (Array.isArray(cell) ? cell.find(item => Number.isInteger(item) && item > 0) ?? null : null);
  if (champs.logo) {
    const logo = state.row[ETABLISSEMENT_COLUMNS.logo];
    const kept = champs.logo.action === 'replace' ? first(logo) === attachmentId : first(logo) === null;
    if (!kept) unsaved.push('logo');
  }
  if (champs.name && !same(state.row[ETABLISSEMENT_COLUMNS.name], champs.name.apres)) unsaved.push('nom');
  if (champs.visible && !same(state.row[ETABLISSEMENT_COLUMNS.visible], champs.visible.apres)) unsaved.push('visibilité');
  if (champs.responsables && state.acl !== null) {
    const now = new Set(responsablesOf(state.acl, plan.etablissementId).map(entry => entry.email));
    const lost = champs.responsables.ajout.some(email => !now.has(normalizeEmail(email)))
      || champs.responsables.retrait.some(email => now.has(normalizeEmail(email)));
    if (lost) unsaved.push('responsables');
  }
  return unsaved;
}

// Écrit les changements d'une fiche d'établissement (savePlanOf). `upload(file)` envoie le fichier
// du nouveau logo à Grist et renvoie l'identifiant de la pièce jointe (upload.js) ; il n'est appelé
// que si le logo est remplacé. Renvoie
//   { status: 'saved', unsaved, attachmentId }   `unsaved` : les champs que Grist n'a pas gardés
//                                                (vide si tout y est ; null si la relecture a échoué)
//   { status: 'changed', moved, state, leftover } la fiche a changé dans Grist depuis l'ouverture de
//                                                la fenêtre, rien n'est écrit ; `state` : son état actuel
// Lève une EtablissementSaveError.
export async function saveEtablissement(docApi, plan, { upload, log = console } = {}) {
  const { champs } = plan;
  // Fermé par défaut : sans être responsable de cet établissement, rien ne s'écrit.
  if (plan.responsable !== true) throw new EtablissementSaveError(FAILURES.notResponsable);
  if (!FIELDS.some(({ key }) => champs[key]) && !champs.responsables) throw new EtablissementSaveError(FAILURES.nothing);
  const replacing = champs.logo?.action === 'replace';
  if (replacing && (!plan.file || typeof upload !== 'function')) throw new EtablissementSaveError(FAILURES.noFile);

  let evaluated = evaluate(await readState(docApi, plan.etablissementId, log), plan);
  if (evaluated.status === 'changed') return evaluated;

  let attachmentId = null;
  if (replacing) {
    try {
      attachmentId = await upload(plan.file);
    } catch (error) {
      if (error?.name === 'UploadError') throw new EtablissementSaveError(error.message, error);
      log.error('[FICHE-ETAB] envoi du logo impossible :', error);
      throw new EtablissementSaveError(FAILURES.other, error);
    }
    // L'envoi prend du temps : la fiche a pu bouger, on relit avant d'écrire.
    try {
      evaluated = evaluate(await readState(docApi, plan.etablissementId, log), plan);
    } catch (error) {
      if (error instanceof EtablissementSaveError) error.leftover = attachmentId;
      throw error;
    }
    if (evaluated.status === 'changed') return { ...evaluated, leftover: attachmentId };
  }

  const values = { ...evaluated.values };
  if (replacing) values[ETABLISSEMENT_COLUMNS.logo] = ['L', attachmentId];
  const actions = [];
  if (Object.keys(values).length > 0) actions.push(['UpdateRecord', ETABLISSEMENT_TABLE, plan.etablissementId, values]);
  actions.push(...evaluated.actions);
  if (actions.length === 0) throw new EtablissementSaveError(FAILURES.already);

  try {
    await docApi.applyUserActions(actions);
  } catch (error) {
    log.error('[FICHE-ETAB] écriture impossible :', error);
    throw new EtablissementSaveError(FAILURES[classifyWriteError(error)], error, { leftover: attachmentId });
  }
  return { status: 'saved', unsaved: await unsavedAfter(docApi, plan, attachmentId, log), attachmentId };
}
