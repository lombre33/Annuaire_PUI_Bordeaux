import { test } from 'node:test';
import assert from './support/assert.mjs';
import { DEACTIVATED_COLUMN, DEPARTURE_GROUPS, PENDING_COLUMN } from '../constants.js';
import { DepartureError, applyDeparture, prepareDeparture, reactivateFiche } from '../departure-save.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { ADMIN_EMAIL, ANA_EMAIL, BOB_EMAIL, departureTables, withSchema, withValidation } from './fixtures.mjs';

// ===== departure-save : relire, vérifier, écrire le départ d'un·e collègue (1.46.0) =====

// Le document de départ de tests/fixtures.mjs, vu par un administrateur : Ana (id 1, CHU) part, Hugo (id 10, CHU) reprend ses valeurs ; Bob (id 2) est à l'UBM.
// `fail(['BDD'])` rend ensuite illisibles les tables nommées : l'annuaire est déjà chargé, c'est la relecture qui échoue.
async function world(options = {}) {
  const tables = options.tables ?? withSchema(departureTables());
  const broken = { tables: [] };
  const fake = createFakeGrist({ user: { email: ADMIN_EMAIL }, ...options, tables, failTables: () => broken.tables });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  const row = id => tableToRows(tables.BDD).find(candidate => candidate.id === id);
  return { ...fake, ...directory, tables, row, fail: names => { broken.tables = names; }, context: { referenceMaps: directory.referenceMaps, log: quiet } };
}

const ALL = DEPARTURE_GROUPS.filter(group => group.on).map(group => group.key);

// La demande du responsable du CHU qui désactive Ana et laisse ses valeurs à Hugo ; `changes` la modifie.
const request = (changes = {}) => ({ etablissementId: 1, responsable: true, meEmail: ADMIN_EMAIL, departingId: 1, recipientId: 10, groups: ALL, ...changes });
const prepare = (w, changes) => prepareDeparture(w.docApi, request(changes), w.context);
const writes = w => w.calls.filter(call => call.action === 'UpdateRecord' && call.ok);
const refused = (promise, pattern) => assert.rejects(promise, error => error instanceof DepartureError && pattern.test(error.message));

// ===== prepareDeparture =====

test('prepareDeparture reads the two fiches as they are now and says what the departure would change, without writing anything', async () => {
  const w = await world();
  const review = await prepare(w);
  assert.deepEqual(review.departing, { id: 1, name: 'Ana Martin', email: ANA_EMAIL });
  assert.deepEqual(review.recipient, { id: 10, name: 'Hugo Bernard', email: '' });
  assert.equal(review.etablissementId, 1);
  assert.deepEqual(review.groups.map(group => group.key), ALL);
  // Hugo reçoit CME, Oncologie (il a déjà Hématologie), « Réseau douleur », les actions 1.1 et 2.1, et la responsabilité de la 1.1 ; il garde l'instance inconnue
  // de sa fiche (999) et son action « Veille ».
  assert.deepEqual(review.values, {
    Instances: ['L', 999, 1],
    Competences: ['L', 2, 1],
    Communautes: ['L', 2],
    Taches: ['L', 4, 1, 3],
    Taches_responsable: ['L', 1]
  });
  assert.equal(review.total, 6);
  assert.deepEqual(writes(w), [], 'préparer n\'écrit rien');
});

test('prepareDeparture without any rubric chosen is a plain deactivation: no recipient needed, nothing to copy', async () => {
  const w = await world();
  const review = await prepare(w, { groups: [], recipientId: 0 });
  assert.deepEqual({ recipient: review.recipient, groups: review.groups, total: review.total, values: review.values }, { recipient: null, groups: [], total: 0, values: {} });
  assert.equal(review.signatures.recipient, null);
});

test('prepareDeparture with a recipient but no rubric checked copies nothing and still deactivates', async () => {
  const w = await world();
  const review = await prepare(w, { groups: [] });
  assert.equal(review.recipient, null, 'sans rubrique, la personne qui reprend ne compte pas');
  assert.deepEqual(review.values, {});
});

test('prepareDeparture leaves the role alone unless it is asked for, and then copies the chosen roles but never the computed ones', async () => {
  const w = await world();
  assert.equal('Role_dans_le_PUI' in (await prepare(w)).values, false);
  const review = await prepare(w, { groups: ['role'] });
  assert.deepEqual(review.values, { Role_dans_le_PUI: ['L', 1] });
  assert.deepEqual(review.groups.map(group => group.add), [['Référent qualité']]);
});

test('prepareDeparture is closed by default: without being responsible of the établissement, nothing is even read', async () => {
  const w = await world();
  await refused(prepare(w, { responsable: false }), /pas responsable de cet établissement/);
  await refused(prepare(w, { responsable: undefined }), /pas responsable de cet établissement/);
  await refused(prepare(w, { responsable: 'true' }), /pas responsable de cet établissement/);
});

test('prepareDeparture refuses a fiche of another établissement, a missing one, a request, an already deactivated one and one\'s own', async () => {
  const w = await world();
  await refused(prepare(w, { departingId: 2 }), /pas celle d’une personne de cet établissement/);
  await refused(prepare(w, { departingId: 999 }), /n’existe plus/);
  await refused(prepare(w, { meEmail: ANA_EMAIL.toUpperCase() }), /ne pouvez pas désactiver votre propre fiche/);

  const pending = await world({ tables: withSchema(withValidation(departureTables(), { pending: { 1: true } })) });
  await refused(prepare(pending), /demande en attente de validation/);

  const gone = departureTables();
  gone.BDD[DEACTIVATED_COLUMN][0] = true;
  await refused(prepare(await world({ tables: withSchema(gone) })), /déjà désactivée/);
});

test('prepareDeparture refuses a recipient that cannot take the values over, and says what is wrong', async () => {
  const w = await world();
  await refused(prepare(w, { recipientId: 0 }), /Choisissez la personne qui reprend/);
  await refused(prepare(w, { recipientId: null }), /Choisissez la personne qui reprend/);
  await refused(prepare(w, { recipientId: 1 }), /ne peut pas reprendre ses propres valeurs/);
  await refused(prepare(w, { recipientId: 999 }), /n’a plus de fiche/);
  await refused(prepare(w, { recipientId: 2 }), /n’est pas de cet établissement/);

  const deactivated = departureTables();
  deactivated.BDD[DEACTIVATED_COLUMN][deactivated.BDD.id.indexOf(10)] = true;
  await refused(prepare(await world({ tables: withSchema(deactivated) })), /n’est pas active/);

  const pending = await world({ tables: withSchema(withValidation(departureTables(), { pending: { 10: true } })) });
  await refused(prepare(pending), /n’est pas active/);
});

test('prepareDeparture says so when BDD has no « Fiche_desactivee » column, and what to do about it', async () => {
  const tables = departureTables();
  delete tables.BDD[DEACTIVATED_COLUMN];
  const w = await world({ tables: withSchema(tables) });
  await refused(prepare(w), /Fiche_desactivee/);
  await assert.rejects(prepare(w), error => /GRIST_SETUP\.md/.test(error.message) === false, 'le message ne nomme pas de fichier : il renvoie à la documentation');
});

test('prepareDeparture reports a read failure as such, and nothing is written', async () => {
  const w = await world();
  w.fail(['BDD']);
  const { lines, log } = logged();
  await assert.rejects(prepareDeparture(w.docApi, request(), { referenceMaps: w.referenceMaps, log }), error => error instanceof DepartureError && /relues dans Grist/.test(error.message));
  assert.ok(lines.error.some(line => /\[DEPART\]/.test(line)), lines.error.join('\n'));
  assert.deepEqual(writes(w), []);
});

test('prepareDeparture refuses to copy into a list the widget cannot rewrite (a value already resolved to text), before anything is written', async () => {
  const tables = departureTables();
  tables.BDD.Taches[tables.BDD.id.indexOf(10)] = ['L', 'Veille'];
  const w = await world({ tables: withSchema(tables) });
  await refused(prepare(w, { groups: ['taches'] }), /Ces valeurs ne peuvent pas être transférées/);
  assert.deepEqual(writes(w), []);
});

// ===== applyDeparture =====

test('applyDeparture writes the transfer and the deactivation in ONE Grist action, the recipient first, and deletes nothing', async () => {
  const w = await world();
  const before = structuredClone(w.tables.BDD);
  const review = await prepare(w);
  assert.deepEqual(await applyDeparture(w.docApi, review, { log: quiet }), { status: 'saved', total: 6 });

  assert.deepEqual(writes(w).map(call => [call.table, call.rowId, Object.keys(call.values)]), [
    ['BDD', 10, ['Instances', 'Competences', 'Communautes', 'Taches', 'Taches_responsable']],
    ['BDD', 1, [DEACTIVATED_COLUMN]]
  ]);
  assert.deepEqual(w.calls.filter(call => ['RemoveRecord', 'BulkRemoveRecord', 'AddRecord', 'AddColumn'].includes(call.action)), [], 'rien ne se supprime ni ne se crée');

  const after = w.tables.BDD;
  const at = id => after.id.indexOf(id);
  assert.equal(after.id.length, before.id.length, 'la fiche reste dans BDD');
  assert.equal(after[DEACTIVATED_COLUMN][at(1)], true);
  assert.deepEqual(after.Etablissement, before.Etablissement, 'les établissements des fiches ne bougent pas');
  assert.deepEqual(after.Competences[at(10)], ['L', 2, 1]);
  // La fiche qui part garde toutes ses valeurs (copie, pas déplacement) : réactivée, elle redevient ce qu'elle était.
  ['Instances', 'Competences', 'Communautes', 'Taches', 'Taches_responsable', 'Role_dans_le_PUI', 'Accepte_apparaitre', 'email'].forEach(key => {
    assert.deepEqual(after[key][at(1)], before[key][at(1)], key);
  });
  // Aucune autre fiche n'est touchée.
  after.id.filter(id => ![1, 10].includes(id)).forEach(id => Object.keys(after).forEach(key => assert.deepEqual(after[key][at(id)], before[key][at(id)], `${key} de la ligne ${id}`)));
});

test('after the departure the directory shows one contact fewer, the others and their establishments unchanged, and the recipient with the new values', async () => {
  const w = await world();
  const countBefore = w.contacts.length;
  assert.equal(countBefore, 5);
  await applyDeparture(w.docApi, await prepare(w), { log: quiet });
  const next = await loadDirectory(w.docApi, { log: quiet });
  assert.equal(next.contacts.length, countBefore - 1);
  assert.deepEqual(next.contacts.map(contact => contact.prenom).sort(), w.contacts.map(contact => contact.prenom).filter(name => name !== 'Ana').sort());
  assert.deepEqual(next.contacts.map(contact => [contact.id, contact.Etablissement]).sort(), w.contacts.filter(contact => contact.prenom !== 'Ana').map(contact => [contact.id, contact.Etablissement]).sort());
  const hugo = next.contacts.find(contact => contact.id === 10);
  assert.deepEqual(next.people.deactivatedOf(1).map(entry => entry.row.id), [1]);
  assert.ok(hugo.Competences, 'Hugo a ses compétences');
});

test('applyDeparture without a recipient only deactivates, in one UpdateRecord', async () => {
  const w = await world();
  const review = await prepare(w, { groups: [] });
  assert.deepEqual(await applyDeparture(w.docApi, review, { log: quiet }), { status: 'saved', total: 0 });
  assert.deepEqual(writes(w).map(call => [call.rowId, call.values]), [[1, { [DEACTIVATED_COLUMN]: true }]]);
});

test('applyDeparture writes nothing when one of the two fiches changed in Grist since the review: the responsable reads again', async () => {
  const w = await world();
  const review = await prepare(w);
  w.tables.BDD.Competences[w.tables.BDD.id.indexOf(10)] = ['L', 2, 3]; // quelqu'un a ajouté une compétence à Hugo
  assert.deepEqual(await applyDeparture(w.docApi, review, { log: quiet }), { status: 'changed' });
  assert.deepEqual(writes(w), []);

  const again = await prepare(w);
  const moved = w.tables.BDD.email.indexOf(ANA_EMAIL);
  w.tables.BDD.email[moved] = 'autre.adresse@chu-bordeaux.example'; // la fiche qui part a changé de personne
  assert.deepEqual(await applyDeparture(w.docApi, again, { log: quiet }), { status: 'changed' });
  assert.deepEqual(writes(w), []);

  const third = await prepare(w);
  w.tables.BDD[DEACTIVATED_COLUMN][w.tables.BDD.id.indexOf(1)] = true; // un autre responsable l'a désactivée entre-temps
  assert.deepEqual(await applyDeparture(w.docApi, third, { log: quiet }), { status: 'changed' });
  assert.deepEqual(writes(w), []);
});

test('applyDeparture says « changed » when a fiche was removed meanwhile', async () => {
  const w = await world();
  const review = await prepare(w);
  Object.keys(w.tables.BDD).forEach(key => w.tables.BDD[key].splice(w.tables.BDD.id.indexOf(10), 1));
  assert.deepEqual(await applyDeparture(w.docApi, review, { log: quiet }), { status: 'changed' });
});

test('applyDeparture is all or nothing: a refusal on the departing fiche leaves the recipient untouched too', async () => {
  const w = await world({ denyRows: { BDD: [1] } });
  const before = structuredClone(w.tables);
  const review = await prepare(w);
  const { lines, log } = logged();
  await assert.rejects(applyDeparture(w.docApi, review, { log }), error => error instanceof DepartureError && /Grist a refusé la modification/.test(error.message));
  assert.deepEqual(w.tables, before, 'ni Hugo ni Ana n\'ont changé');
  assert.ok(lines.error.some(line => /\[DEPART\] écriture impossible/.test(line)));
  assert.equal(writes(w).length, 0);
});

test('applyDeparture is all or nothing the other way round: a refusal on the recipient does not deactivate the departing fiche', async () => {
  const w = await world({ denyRows: { BDD: [10] } });
  const before = structuredClone(w.tables);
  await assert.rejects(applyDeparture(w.docApi, await prepare(w), { log: quiet }), error => error instanceof DepartureError && /Grist a refusé la modification/.test(error.message));
  assert.deepEqual(w.tables, before);
});

test('applyDeparture tells a formula column from a refusal, and any other failure from both', async () => {
  const w = await world();
  const review = await prepare(w);
  const failing = message => ({ ...w.docApi, applyUserActions: async () => { throw new Error(message); } });
  await assert.rejects(applyDeparture(failing('Cannot modify formula column'), review, { log: quiet }), error => /colonne à formule/.test(error.message) && !/\.md/.test(error.message));
  await assert.rejects(applyDeparture(failing('socket hang up'), review, { log: quiet }), error => /n’a pas pu être enregistrée/.test(error.message));
});

test('applyDeparture fails loudly when Grist did not keep what was asked, and still succeeds when the check read cannot be done', async () => {
  const w = await world();
  const review = await prepare(w);
  const forgetful = { ...w.docApi, applyUserActions: async actions => { await w.docApi.applyUserActions(actions); w.tables.BDD[DEACTIVATED_COLUMN][0] = false; } };
  await assert.rejects(applyDeparture(forgetful, review, { log: quiet }), error => /n’a pas gardé tout ce qui était demandé/.test(error.message));

  const fresh = await world();
  const second = await prepare(fresh);
  let reads = 0;
  const blind = { ...fresh.docApi, fetchTable: async name => { if (++reads > 1) throw new Error('lecture impossible'); return fresh.docApi.fetchTable(name); } };
  assert.deepEqual(await applyDeparture(blind, second, { log: quiet }), { status: 'saved', total: 6 });
});

test('applyDeparture says the column is missing if it vanished since the review', async () => {
  const w = await world();
  const review = await prepare(w);
  delete w.tables.BDD[DEACTIVATED_COLUMN];
  await refused(applyDeparture(w.docApi, review, { log: quiet }), /Fiche_desactivee/);
});

// ===== reactivateFiche =====

const deactivatedWorld = async (options = {}) => {
  const tables = departureTables();
  tables.BDD[DEACTIVATED_COLUMN][0] = true;
  return world({ ...options, tables: withSchema(tables) });
};

test('reactivateFiche clears the deactivation and nothing else: the person comes back as she was, her choice to appear untouched', async () => {
  const w = await deactivatedWorld();
  const before = structuredClone(w.tables.BDD);
  assert.deepEqual(await reactivateFiche(w.docApi, { id: 1, etablissementId: 1, responsable: true }, { log: quiet }), { status: 'reactivated' });
  assert.deepEqual(writes(w).map(call => [call.rowId, call.values]), [[1, { [DEACTIVATED_COLUMN]: false }]]);
  assert.equal(w.tables.BDD[DEACTIVATED_COLUMN][0], false);
  assert.equal(w.tables.BDD.Accepte_apparaitre[0], before.Accepte_apparaitre[0]);
  const next = await loadDirectory(w.docApi, { log: quiet });
  assert.equal(next.contacts.some(contact => contact.id === 1), true, 'Ana réapparaît dans l\'annuaire');
});

test('reactivateFiche is closed by default and stays inside the établissement', async () => {
  const w = await deactivatedWorld();
  await refused(reactivateFiche(w.docApi, { id: 1, etablissementId: 1, responsable: false }), /pas responsable de cet établissement/);
  await refused(reactivateFiche(w.docApi, { id: 1, etablissementId: 2, responsable: true }, { log: quiet }), /pas celle d’une personne de cet établissement/);
  assert.deepEqual(writes(w), []);
});

test('reactivateFiche writes nothing for a fiche that is gone, or that someone else already reactivated', async () => {
  const w = await deactivatedWorld();
  assert.deepEqual(await reactivateFiche(w.docApi, { id: 999, etablissementId: 1, responsable: true }, { log: quiet }), { status: 'gone' });
  assert.deepEqual(await reactivateFiche(w.docApi, { id: 6, etablissementId: 1, responsable: true }, { log: quiet }), { status: 'done' });
  assert.deepEqual(writes(w), []);
});

test('reactivateFiche reports the missing column, a refusal of Grist and a failed read', async () => {
  const tables = departureTables();
  delete tables.BDD[DEACTIVATED_COLUMN];
  await refused(reactivateFiche((await world({ tables: withSchema(tables) })).docApi, { id: 1, etablissementId: 1, responsable: true }, { log: quiet }), /Fiche_desactivee/);

  const denied = await deactivatedWorld({ denyWrites: ['BDD'] });
  await refused(reactivateFiche(denied.docApi, { id: 1, etablissementId: 1, responsable: true }, { log: quiet }), /Grist a refusé la modification/);

  const broken = await deactivatedWorld();
  broken.fail(['BDD']);
  await refused(reactivateFiche(broken.docApi, { id: 1, etablissementId: 1, responsable: true }, { log: quiet }), /relues dans Grist/);
});

test('a pending request is never deactivated or reactivated as if it were a colleague', async () => {
  const tables = withValidation(departureTables(), { pending: { 6: true } });
  const w = await world({ tables: withSchema(tables) });
  await refused(prepare(w, { departingId: 6 }), /demande en attente de validation/);
  assert.equal(PENDING_COLUMN in w.tables.BDD, true);
  assert.deepEqual(await reactivateFiche(w.docApi, { id: 6, etablissementId: 1, responsable: true }, { log: quiet }), { status: 'done' });
  assert.equal(BOB_EMAIL.length > 0, true);
});
