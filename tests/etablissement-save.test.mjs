import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EtablissementSaveError, readEtablissement, saveEtablissement, savePlanOf } from '../etablissement-save.js';
import { KEEP_ONE, diffEtablissement, draftOfEtablissement, nominate, toggleResponsable } from '../etablissement.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { sampleTables, withBranding, withIdentity, ADMIN_EMAIL, ANA_EMAIL, BOB_EMAIL } from './fixtures.mjs';

// ===== etablissement-save : relire, vérifier, écrire la fiche d'un établissement =====

const CHU = 1; // fondateur, logo 11, responsable : Ana (ligne d'ACL 1, aussi administratrice)
const UBM = 2; // partenaire, logo 12, responsable : Bob (ligne d'ACL 3)
const FILE = { blob: 'image', name: 'logo.png' };

function world(options = {}) {
  const tables = options.tables ?? withIdentity(withBranding(sampleTables()));
  const fake = createFakeGrist({ user: { email: BOB_EMAIL }, ...options, tables });
  return { ...fake, tables };
}

const writes = w => w.calls.filter(call => ['AddRecord', 'UpdateRecord', 'RemoveRecord'].includes(call.action));

// Ouvre la fiche d'un établissement, y fait `edit`, et prépare l'enregistrement comme la fenêtre.
async function prepare(w, id, edit, { file = null, responsable = true } = {}) {
  const opened = await readEtablissement(w.docApi, id, { log: quiet });
  const draft = draftOfEtablissement(opened.etablissement, opened.responsables ?? []);
  edit(draft);
  const result = diffEtablissement(opened.etablissement, draft, { readable: opened.responsables !== null });
  assert.deepEqual(result.errors, [], 'le brouillon est valable');
  return { opened, plan: savePlanOf(opened.row, result.champs, { file, responsable }) };
}

const save = (w, plan, upload) => saveEtablissement(w.docApi, plan, { upload, log: quiet });
const rejection = async promise => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof EtablissementSaveError, `une EtablissementSaveError, pas ${error}`);
    return error;
  }
  assert.fail('devait être refusé');
};
const uploader = (id = 77) => {
  const calls = [];
  return Object.assign(async file => { calls.push(file); return id; }, { calls });
};
const etab = (w, id) => {
  const table = w.tables.Etablissements;
  const index = table.id.indexOf(id);
  return Object.fromEntries(Object.keys(table).map(column => [column, table[column][index]]));
};

// ----- Lire -----

test('readEtablissement returns the row as it is now, its sheet version and its responsables', async () => {
  const w = world();
  const opened = await readEtablissement(w.docApi, CHU, { log: quiet });
  assert.equal(opened.row.id, CHU);
  assert.deepEqual(opened.etablissement, {
    id: 1, acronym: 'CHU', sigle: 'CHU', name: 'CHU de Bordeaux', visible: true, status: 'Fondateur du PUI', logo: [11], logoColumn: true
  });
  assert.deepEqual(opened.responsables, [{ email: ANA_EMAIL, rows: [{ id: 1, admin: true }] }]);
  assert.equal(opened.acl.length, 3);
});

test('readEtablissement opens the sheet without the responsables when ACL cannot be read, and says so without any address', async () => {
  const { lines, log } = logged();
  const w = world({ failTables: ['ACL'] });
  const opened = await readEtablissement(w.docApi, CHU, { log });
  assert.equal(opened.responsables, null);
  assert.equal(opened.acl, null);
  assert.equal(opened.etablissement.name, 'CHU de Bordeaux');
  assert.match(lines.warn.join('\n'), /ACL.*GRIST_SETUP\.md/);
  assert.ok(!lines.warn.join('\n').includes('@'));
});

test('readEtablissement reports an establishment that is gone or a table that cannot be read, in French, without writing', async () => {
  const w = world();
  assert.match((await rejection(readEtablissement(w.docApi, 99, { log: quiet }))).message, /n’existe plus/);
  const broken = world({ failTables: ['Etablissements'] });
  const error = await rejection(readEtablissement(broken.docApi, CHU, { log: quiet }));
  assert.match(error.message, /n’a pas pu être relue dans Grist : rien n’a été modifié/);
  assert.ok(error.cause);
  assert.deepEqual(writes(w), []);
});

// ----- Écrire le nom, la visibilité -----

test('saveEtablissement writes the name and visibility in one UpdateRecord and nothing else', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.name = 'CHU de Bordeaux — Pellegrin'; draft.visible = false; });
  const result = await save(w, plan);
  assert.deepEqual(result, { status: 'saved', unsaved: [], attachmentId: null });
  assert.deepEqual(writes(w).map(call => [call.action, call.table, call.rowId, call.values]), [
    ['UpdateRecord', 'Etablissements', CHU, { nom_complet: 'CHU de Bordeaux — Pellegrin', ok_pour_apparaitre: false }]
  ]);
  assert.deepEqual(w.tokenRequests, [], 'sans nouveau logo, aucun jeton n’est demandé');
});

test('saveEtablissement is closed by default: nothing is read or written unless the person is responsable', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.visible = false; }, { responsable: false });
  let reads = 0;
  const docApi = { ...w.docApi, fetchTable: (...args) => { reads += 1; return w.docApi.fetchTable(...args); } };
  const error = await rejection(saveEtablissement(docApi, plan, { log: quiet }));
  assert.match(error.message, /vous n’êtes pas responsable de cet établissement/);
  assert.equal(reads, 0);
  assert.deepEqual(writes(w), []);
  for (const forged of [undefined, null, 'oui', 1, {}]) {
    await rejection(saveEtablissement(docApi, { ...plan, responsable: forged }, { log: quiet }));
  }
  assert.deepEqual(writes(w), []);
});

test('saveEtablissement refuses a plan with nothing in it', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, () => {});
  assert.deepEqual(plan.champs, {});
  assert.match((await rejection(save(w, plan))).message, /Aucun changement à enregistrer/);
  assert.deepEqual(writes(w), []);
});

test('saveEtablissement writes nothing when someone changed the same fields since the sheet was opened, and returns what is there now', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.name = 'Mon nom'; draft.visible = false; });
  w.tables.Etablissements.nom_complet[0] = 'CHU (nom changé ailleurs)';
  const result = await save(w, plan);
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.moved, ['nom']);
  assert.equal(result.state.row.nom_complet, 'CHU (nom changé ailleurs)');
  assert.equal(result.leftover, undefined);
  assert.deepEqual(writes(w), [], 'même la visibilité, qui n’a pas bougé, n’est pas écrite : la personne relit d’abord');
  assert.equal(etab(w, CHU).ok_pour_apparaitre, true);
});

test('saveEtablissement ignores a change made elsewhere to a field the person did not touch', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.visible = false; });
  w.tables.Etablissements.nom_complet[0] = 'CHU (nom changé ailleurs)';
  assert.equal((await save(w, plan)).status, 'saved');
  assert.equal(etab(w, CHU).nom_complet, 'CHU (nom changé ailleurs)', 'le nom d’un autre n’est pas écrasé');
  assert.equal(etab(w, CHU).ok_pour_apparaitre, false);
});

test('saveEtablissement does not write a value somebody already set to the same thing, and says when nothing is left to do', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.visible = false; });
  w.tables.Etablissements.ok_pour_apparaitre[0] = false;
  assert.match((await rejection(save(w, plan))).message, /déjà dans la fiche de l’établissement/);
  assert.deepEqual(writes(w), []);

  const two = world();
  const both = await prepare(two, CHU, draft => { draft.visible = false; draft.name = 'Nom neuf'; });
  two.tables.Etablissements.ok_pour_apparaitre[0] = false;
  assert.equal((await save(two, both.plan)).status, 'saved');
  assert.deepEqual(writes(two).map(call => call.values), [{ nom_complet: 'Nom neuf' }], 'seul ce qui reste à faire est écrit');
});

test('saveEtablissement names the missing column instead of writing a partial change', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.visible = false; draft.name = 'Autre'; });
  delete w.tables.Etablissements.ok_pour_apparaitre;
  const error = await rejection(save(w, plan));
  assert.match(error.message, /la colonne ok_pour_apparaitre n’existe pas dans Etablissements/);
  assert.deepEqual(writes(w), []);
});

// ----- Écrire les responsables -----

test('saveEtablissement names a new responsable with an ACL row that carries only the address and the establishment', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, ' Claire.Moreau@U-Bordeaux-Montaigne.fr '); });
  assert.equal((await save(w, plan)).status, 'saved');
  assert.deepEqual(writes(w).map(call => [call.action, call.table, call.values]), [
    ['AddRecord', 'ACL', { email: 'claire.moreau@u-bordeaux-montaigne.fr', Responsable_de_l_Etablissement: UBM }]
  ]);
  assert.ok(!('admin' in writes(w)[0].values), 'la colonne admin n’est jamais écrite');
  const added = w.tables.ACL.id.length - 1;
  assert.equal(w.tables.ACL.admin[added], null, 'le droit d’administrateur n’est pas donné');
});

test('saveEtablissement gives an administrator without establishment the establishment on the SAME row, keeping the admin right', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, ADMIN_EMAIL.toUpperCase()); });
  await save(w, plan);
  assert.deepEqual(writes(w).map(call => [call.action, call.rowId, call.values]), [['UpdateRecord', 2, { Responsable_de_l_Etablissement: UBM }]]);
  assert.equal(w.tables.ACL.admin[1], true);
  assert.equal(w.tables.ACL.id.length, 3, 'aucune ligne en double');
});

test('saveEtablissement removes a responsable by deleting their ACL row, but keeps the row of an administrator', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, 'relais@x.fr'); toggleResponsable(draft, BOB_EMAIL); });
  await save(w, plan);
  assert.deepEqual(writes(w).map(call => (call.action === 'AddRecord' ? [call.action] : [call.action, call.rowId])), [['RemoveRecord', 3], ['AddRecord']]);
  assert.ok(!w.tables.ACL.email.includes(BOB_EMAIL));

  const chu = world();
  const second = await prepare(chu, CHU, draft => { nominate(draft, 'relais@x.fr'); toggleResponsable(draft, ANA_EMAIL); });
  await save(chu, second.plan);
  assert.deepEqual(writes(chu).map(call => [call.action, call.rowId, call.values]), [
    ['UpdateRecord', 1, { Responsable_de_l_Etablissement: 0 }],
    ['AddRecord', 4, { email: 'relais@x.fr', Responsable_de_l_Etablissement: CHU }]
  ]);
  assert.equal(chu.tables.ACL.admin[0], true, 'Ana reste administratrice');
  assert.equal(chu.tables.ACL.email[0], 'Ana.Martin@CHU-Bordeaux.fr');
});

test('saveEtablissement never touches the rows of other establishments, even for the same address', async () => {
  const w = world();
  w.tables.ACL.id.push(4);
  w.tables.ACL.email.push(BOB_EMAIL);
  w.tables.ACL.Responsable_de_l_Etablissement.push(5);
  w.tables.ACL.admin.push(false);
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, 'relais@x.fr'); toggleResponsable(draft, BOB_EMAIL); });
  await save(w, plan);
  assert.deepEqual(writes(w).map(call => [call.action, call.rowId]), [['RemoveRecord', 3], ['AddRecord', 5]]);
  assert.equal(w.tables.ACL.Responsable_de_l_Etablissement[w.tables.ACL.id.indexOf(4)], 5, 'Bob reste responsable de l’établissement 5');
});

test('saveEtablissement keeps one responsable at least, judging by the list as it is NOW in Grist', async () => {
  const w = world();
  w.tables.ACL.id.push(4);
  w.tables.ACL.email.push('carl@x.fr');
  w.tables.ACL.Responsable_de_l_Etablissement.push(UBM);
  w.tables.ACL.admin.push(false);
  // La fenêtre montre Bob et Carl ; la personne retire Carl, ce qui laisse Bob.
  const { plan } = await prepare(w, UBM, draft => { toggleResponsable(draft, 'carl@x.fr'); });
  // Pendant ce temps, quelqu'un d'autre a retiré Bob : retirer Carl ne laisserait plus personne.
  w.tables.ACL.Responsable_de_l_Etablissement[2] = 0;
  assert.equal((await rejection(save(w, plan))).message, KEEP_ONE);
  assert.deepEqual(writes(w), []);

  const crowded = world();
  const second = await prepare(crowded, UBM, draft => { toggleResponsable(draft, BOB_EMAIL); nominate(draft, 'relais@x.fr'); });
  assert.equal((await save(crowded, second.plan)).status, 'saved');
  assert.deepEqual(crowded.tables.ACL.email.filter((_, index) => crowded.tables.ACL.Responsable_de_l_Etablissement[index] === UBM), ['relais@x.fr']);
});

test('saveEtablissement keeps what another responsable added in the meantime, and does not name the same person twice', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, 'relais@x.fr'); nominate(draft, 'autre@x.fr'); });
  // Entre-temps : le même relais est nommé par un autre (écrit avec des majuscules), et une troisième personne aussi.
  w.tables.ACL.id.push(4, 5);
  w.tables.ACL.email.push('Relais@X.fr', 'troisieme@x.fr');
  w.tables.ACL.Responsable_de_l_Etablissement.push(UBM, UBM);
  w.tables.ACL.admin.push(false, false);
  assert.equal((await save(w, plan)).status, 'saved');
  assert.deepEqual(writes(w).map(call => [call.action, call.values.email]), [['AddRecord', 'autre@x.fr']], 'seul ce qui manque est ajouté');
  assert.ok(w.tables.ACL.email.includes('troisieme@x.fr'), 'la nomination d’un autre reste');

  const everything = world();
  const only = await prepare(everything, UBM, draft => { nominate(draft, 'relais@x.fr'); });
  everything.tables.ACL.id.push(4);
  everything.tables.ACL.email.push('relais@x.fr');
  everything.tables.ACL.Responsable_de_l_Etablissement.push(UBM);
  everything.tables.ACL.admin.push(false);
  assert.match((await rejection(save(everything, only.plan))).message, /déjà dans la fiche de l’établissement/);
  assert.deepEqual(writes(everything), []);
});

test('saveEtablissement refuses to change responsables when the ACL table cannot be read, and writes nothing', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, 'relais@x.fr'); });
  const blind = createFakeGrist({ tables: w.tables, failTables: ['ACL'] });
  const error = await rejection(saveEtablissement(blind.docApi, plan, { log: quiet }));
  assert.match(error.message, /La liste des responsables n’a pas pu être relue/);
  assert.deepEqual(writes(blind), []);
});

test('saveEtablissement writes the establishment and its responsables in ONE atomic action', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { draft.name = 'UBM neuve'; nominate(draft, 'relais@x.fr'); });
  let batches = 0;
  const docApi = { ...w.docApi, applyUserActions: actions => { batches += 1; return w.docApi.applyUserActions(actions); } };
  await saveEtablissement(docApi, plan, { log: quiet });
  assert.equal(batches, 1);

  const denied = world({ denyWrites: ['ACL'] });
  const second = await prepare(denied, UBM, draft => { draft.name = 'UBM neuve'; nominate(draft, 'relais@x.fr'); });
  const error = await rejection(save(denied, second.plan));
  assert.match(error.message, /Grist a refusé la modification/);
  assert.equal(etab(denied, UBM).nom_complet, 'Université Bordeaux Montaigne', 'le nom n’a pas été écrit non plus');
});

// ----- Les erreurs d'écriture -----

test('saveEtablissement turns an access rule, a formula column and any other failure into a sentence, and logs the cause', async () => {
  for (const [cause, expected] of [
    ['Blocked by table update access rules', /Grist a refusé la modification : vos droits ne permettent pas/],
    ['Cannot modify formula column nom_complet', /colonne à formule.*GRIST_SETUP\.md/],
    ['socket hang up', /La modification n’a pas pu être enregistrée/]
  ]) {
    const w = world();
    const { lines, log } = logged();
    const { plan } = await prepare(w, CHU, draft => { draft.visible = false; });
    const docApi = { ...w.docApi, applyUserActions: async () => { throw new Error(cause); } };
    const error = await rejection(saveEtablissement(docApi, plan, { log }));
    assert.match(error.message, expected, cause);
    assert.equal(error.cause.message, cause);
    assert.equal(error.leftover, null);
    assert.match(lines.error.join('\n'), /\[FICHE-ETAB\] écriture impossible/);
  }
});

test('saveEtablissement reports what Grist did not keep, or that it could not check', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.name = 'Nom neuf'; draft.visible = false; });
  const forgetful = { ...w.docApi, applyUserActions: async actions => {
    const answer = await w.docApi.applyUserActions(actions);
    w.tables.Etablissements.nom_complet[0] = 'CHU de Bordeaux';
    return answer;
  } };
  assert.deepEqual((await saveEtablissement(forgetful, plan, { log: quiet })).unsaved, ['nom']);

  const blind = world();
  const second = await prepare(blind, CHU, draft => { draft.visible = false; });
  let written = false;
  const docApi = {
    ...blind.docApi,
    applyUserActions: async actions => { written = true; return blind.docApi.applyUserActions(actions); },
    fetchTable: async name => { if (written) throw new Error('lecture impossible'); return blind.docApi.fetchTable(name); }
  };
  assert.equal((await saveEtablissement(docApi, second.plan, { log: quiet })).unsaved, null);
});

test('saveEtablissement also names the visibility and the logo when Grist did not keep them', async () => {
  const hidden = world();
  const { plan } = await prepare(hidden, CHU, draft => { draft.visible = false; });
  const forgetfulVisibility = { ...hidden.docApi, applyUserActions: async actions => {
    const answer = await hidden.docApi.applyUserActions(actions);
    hidden.tables.Etablissements.ok_pour_apparaitre[0] = true;
    return answer;
  } };
  assert.deepEqual((await saveEtablissement(forgetfulVisibility, plan, { log: quiet })).unsaved, ['visibilité']);

  const replaced = world();
  const second = await prepare(replaced, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; }, { file: FILE });
  const forgetfulReplacement = { ...replaced.docApi, applyUserActions: async actions => {
    const answer = await replaced.docApi.applyUserActions(actions);
    replaced.tables.Etablissements.logo[0] = ['L', 11];
    return answer;
  } };
  assert.deepEqual((await saveEtablissement(forgetfulReplacement, second.plan, { upload: uploader(77), log: quiet })).unsaved, ['logo']);

  const removed = world();
  const third = await prepare(removed, CHU, draft => { draft.logo = { action: 'remove' }; });
  const forgetfulRemoval = { ...removed.docApi, applyUserActions: async actions => {
    const answer = await removed.docApi.applyUserActions(actions);
    removed.tables.Etablissements.logo[0] = ['L', 11];
    return answer;
  } };
  assert.deepEqual((await saveEtablissement(forgetfulRemoval, third.plan, { log: quiet })).unsaved, ['logo']);
});

test('saveEtablissement notices a responsable change Grist silently dropped', async () => {
  const w = world();
  const { plan } = await prepare(w, UBM, draft => { nominate(draft, 'relais@x.fr'); });
  const forgetful = { ...w.docApi, applyUserActions: async actions => {
    const answer = await w.docApi.applyUserActions(actions);
    w.tables.ACL.Responsable_de_l_Etablissement[w.tables.ACL.id.length - 1] = 0;
    return answer;
  } };
  assert.deepEqual((await saveEtablissement(forgetful, plan, { log: quiet })).unsaved, ['responsables']);
});

// ----- Le logo -----

test('saveEtablissement sends the new logo first, then writes its identifier in the same action as the other changes', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; draft.name = 'CHU neuf'; }, { file: FILE });
  const upload = uploader(77);
  const result = await save(w, plan, upload);
  assert.deepEqual(result, { status: 'saved', unsaved: [], attachmentId: 77 });
  assert.deepEqual(upload.calls, [FILE]);
  assert.deepEqual(writes(w).map(call => call.values), [{ nom_complet: 'CHU neuf', logo: ['L', 77] }]);
});

test('saveEtablissement replaces a logo with the new file only, and gives an establishment its first logo', async () => {
  const w = world();
  const { plan } = await prepare(w, 3, draft => { draft.logo = { action: 'replace', file: FILE }; }, { file: FILE });
  await save(w, plan, uploader(5));
  assert.deepEqual(etab(w, 3).logo, ['L', 5]);
});

test('saveEtablissement removes a logo by emptying the cell, with no upload', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'remove' }; });
  const upload = uploader();
  assert.equal((await save(w, plan, upload)).status, 'saved');
  assert.equal(upload.calls.length, 0);
  assert.deepEqual(etab(w, CHU).logo, ['L']);
});

test('saveEtablissement stops before sending anything when the logo was changed elsewhere since the sheet was opened', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; }, { file: FILE });
  w.tables.Etablissements.logo[0] = ['L', 40];
  const upload = uploader();
  const result = await save(w, plan, upload);
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.moved, ['logo']);
  assert.equal(upload.calls.length, 0, 'aucun fichier n’est envoyé pour rien');
  assert.deepEqual(writes(w), []);
});

test('saveEtablissement relays an upload refusal as is and writes nothing', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; draft.name = 'Autre'; }, { file: FILE });
  const refusal = Object.assign(new Error('Grist a refusé le fichier : il est trop volumineux.'), { name: 'UploadError' });
  const error = await rejection(save(w, plan, async () => { throw refusal; }));
  assert.equal(error.message, 'Grist a refusé le fichier : il est trop volumineux.');
  assert.equal(error.cause, refusal);
  assert.equal(error.leftover, null);
  assert.deepEqual(writes(w), [], 'le nom n’est pas écrit sans le logo : la personne corrige et recommence');
  const surprise = await rejection(save(w, plan, async () => { throw new TypeError('boum'); }));
  assert.match(surprise.message, /La modification n’a pas pu être enregistrée/);
});

test('saveEtablissement tells which file stays behind when the write fails after the upload', async () => {
  const w = world({ denyWrites: ['Etablissements'] });
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; }, { file: FILE });
  const error = await rejection(save(w, plan, uploader(77)));
  assert.match(error.message, /Grist a refusé la modification/);
  assert.equal(error.leftover, 77);
});

test('saveEtablissement re-reads after a slow upload: a fiche changed meanwhile is not overwritten', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; draft.name = 'Mon nom'; }, { file: FILE });
  const slow = async () => { w.tables.Etablissements.nom_complet[0] = 'Nom pris entre-temps'; return 77; };
  const result = await save(w, plan, slow);
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.moved, ['nom']);
  assert.equal(result.leftover, 77);
  assert.deepEqual(writes(w), []);
});

test('saveEtablissement checks the responsables again after a slow upload, and names the file left behind', async () => {
  const w = world();
  w.tables.ACL.id.push(4);
  w.tables.ACL.email.push('carl@x.fr');
  w.tables.ACL.Responsable_de_l_Etablissement.push(UBM);
  w.tables.ACL.admin.push(false);
  const { plan } = await prepare(w, UBM, draft => { draft.logo = { action: 'replace', file: FILE }; toggleResponsable(draft, 'carl@x.fr'); }, { file: FILE });
  const vanish = async () => { w.tables.ACL.Responsable_de_l_Etablissement[2] = 0; return 78; };
  const error = await rejection(save(w, plan, vanish));
  assert.equal(error.message, KEEP_ONE);
  assert.equal(error.leftover, 78);
  assert.deepEqual(writes(w), []);
});

test('saveEtablissement refuses a new logo it has no file or no way to send', async () => {
  const w = world();
  const { plan } = await prepare(w, CHU, draft => { draft.logo = { action: 'replace', file: FILE }; }, { file: FILE });
  assert.match((await rejection(save(w, { ...plan, file: null }, uploader()))).message, /Le logo choisi n’est plus disponible/);
  assert.match((await rejection(save(w, plan))).message, /Le logo choisi n’est plus disponible/);
  assert.deepEqual(writes(w), []);
});

test('saveEtablissement points at the setup step when the logo column does not exist', async () => {
  const w = world({ tables: withIdentity(sampleTables()) });
  const opened = await readEtablissement(w.docApi, CHU, { log: quiet });
  const plan = savePlanOf(opened.row, { logo: { action: 'remove' } }, { responsable: true });
  const error = await rejection(save(w, plan));
  assert.match(error.message, /la colonne logo n’existe pas dans Etablissements \(GRIST_SETUP\.md, étape 5\)/);
});

// ----- Le plan -----

test('savePlanOf keeps, for each touched field, the value the sheet showed, and nothing for the others', () => {
  const row = { id: 3, nom_complet: 'A', ok_pour_apparaitre: true, logo: ['L', 4] };
  const plan = savePlanOf(row, { name: { avant: 'A', apres: 'B' }, responsables: { ajout: ['x@y.fr'], retrait: [] } }, { responsable: true });
  assert.deepEqual(plan, {
    etablissementId: 3, responsable: true, champs: { name: { avant: 'A', apres: 'B' }, responsables: { ajout: ['x@y.fr'], retrait: [] } },
    base: { name: 'A' }, file: null
  });
  assert.equal(savePlanOf(row, {}).responsable, false, 'responsable doit être demandé explicitement');
});
