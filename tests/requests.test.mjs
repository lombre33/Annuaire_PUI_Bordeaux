import { test } from 'node:test';
import assert from './support/assert.mjs';
import { RequestError, approveRequest, describeRequests, refuseRequest } from '../requests.js';
import { loadDirectory } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { ADMIN_EMAIL, DOMAIN_COLUMN, withIdentity, withRequest, withValidation } from './fixtures.mjs';

// ===== requests : valider ou refuser une fiche demandée par la personne (1.45.0) =====

// Un document avec trois demandes : Zoé (domaine du CHU, établissement CHU), Léo (domaine du CHU, mais il demande l'UBM) et Mia (domaine d'un
// établissement qui n'en déclare aucun : INSERM a son domaine vidé).
function tablesWithRequests() {
  let tables = withValidation(withIdentity());
  tables.Etablissements[DOMAIN_COLUMN][3] = '';
  tables = withRequest(tables, { email: 'zoe@chu-bordeaux.example', prenom: 'Zoé', nom: 'Nouvelle', Etablissement: 1, Fonction: 'Pharmacienne' });
  tables = withRequest(tables, { email: 'leo@chu-bordeaux.example', prenom: 'Léo', nom: 'Voisin', Etablissement: 2 });
  tables = withRequest(tables, { email: 'mia@inserm.example', prenom: 'Mia', nom: 'Chercheuse', Etablissement: 4 });
  return tables;
}

async function world(options = {}) {
  const tables = options.tables ?? tablesWithRequests();
  const fake = createFakeGrist({ user: { email: ADMIN_EMAIL }, ...options, tables });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  return { ...fake, ...directory, tables, described: () => describeRequests(directory.people.pendingRequests(), directory.etablissementRows) };
}
const writes = w => w.calls.filter(call => ['AddRecord', 'UpdateRecord', 'RemoveRecord'].includes(call.action));

test('describeRequests gives what helps to decide, and says whether the domain of the address is the one of the établissement asked for', async () => {
  const w = await world();
  assert.deepEqual(w.described().map(({ id, ...rest }) => rest), [
    { name: 'Zoé Nouvelle', email: 'zoe@chu-bordeaux.example', etablissement: 'CHU', fonction: 'Pharmacienne', domain: 'ok' },
    { name: 'Léo Voisin', email: 'leo@chu-bordeaux.example', etablissement: 'UBM', fonction: '', domain: 'other' },
    { name: 'Mia Chercheuse', email: 'mia@inserm.example', etablissement: 'INSERM', fonction: '', domain: 'unknown' }
  ]);
  assert.deepEqual(w.described().map(request => request.id), [13, 14, 15]);
});

test('describeRequests copes with requests that have no name, no établissement or no domain column at all', () => {
  const person = { row: { id: 9, email: '', Etablissement: 0, Fonction: null }, name: '', etablissement: '' };
  assert.deepEqual(describeRequests([person], []), [{ id: 9, name: 'Sans nom', email: '', etablissement: 'Sans établissement', fonction: '', domain: 'unknown' }]);
  assert.deepEqual(describeRequests([], []), []);
});

test('approveRequest turns the request into a fiche: the pending case becomes false, and nothing else is written', async () => {
  const w = await world();
  const [zoe] = w.described();
  assert.deepEqual(await approveRequest(w.docApi, zoe, { log: quiet }), { status: 'validated' });
  assert.deepEqual(writes(w).map(({ action, table, rowId, values }) => ({ action, table, rowId, values })),
    [{ action: 'UpdateRecord', table: 'BDD', rowId: 13, values: { En_attente_validation: false } }]);
  const { people, contacts } = await loadDirectory(w.docApi, { log: quiet });
  assert.deepEqual(people.pendingRequests().map(person => person.name), ['Léo Voisin', 'Mia Chercheuse']);
  assert.equal(people.findByEmail('zoe@chu-bordeaux.example')[0].status.pending, false);
  // Zoé n'a pas encore accepté d'apparaître : validée, sa fiche n'est pas dans l'annuaire pour autant.
  assert.equal(contacts.some(contact => contact.email === 'zoe@chu-bordeaux.example'), false);
});

test('a validated fiche appears in the directory once the person agreed to appear', async () => {
  const tables = tablesWithRequests();
  tables.BDD.Accepte_apparaitre[12] = true;
  const w = await world({ tables });
  await approveRequest(w.docApi, w.described()[0], { log: quiet });
  const { contacts } = await loadDirectory(w.docApi, { log: quiet });
  assert.equal(contacts.some(contact => contact.email === 'zoe@chu-bordeaux.example'), true);
});

test('refuseRequest deletes the row, and only that one', async () => {
  const w = await world();
  const [, leo] = w.described();
  assert.deepEqual(await refuseRequest(w.docApi, leo, { log: quiet }), { status: 'refused' });
  assert.deepEqual(writes(w).map(({ action, table, rowId }) => ({ action, table, rowId })), [{ action: 'RemoveRecord', table: 'BDD', rowId: 14 }]);
  assert.equal(w.tables.BDD.id.length, 14);
  assert.equal(w.tables.BDD.email.includes('leo@chu-bordeaux.example'), false);
  assert.equal(w.tables.BDD.email.includes('zoe@chu-bordeaux.example'), true);
});

test('a request another administrator already dealt with is not written again: it was validated, or it is gone', async () => {
  const w = await world();
  const [zoe, leo] = w.described();
  w.tables.BDD.En_attente_validation[12] = false; // un autre administrateur a validé Zoé
  assert.deepEqual(await approveRequest(w.docApi, zoe, { log: quiet }), { status: 'done' });
  assert.deepEqual(await refuseRequest(w.docApi, zoe, { log: quiet }), { status: 'done' }, 'refuser une fiche validée la supprimerait : jamais');
  w.tables.BDD.En_attente_validation[13] = null; // Léo n'est plus en attente non plus
  assert.deepEqual(await refuseRequest(w.docApi, leo, { log: quiet }), { status: 'done' });
  await w.docApi.applyUserActions([['RemoveRecord', 'BDD', 15]]); // Mia a été supprimée
  assert.deepEqual(await approveRequest(w.docApi, { id: 15 }, { log: quiet }), { status: 'gone' });
  assert.deepEqual(await refuseRequest(w.docApi, { id: 15 }, { log: quiet }), { status: 'gone' });
  assert.equal(writes(w).length, 1, 'seule la suppression simulée ci-dessus est passée');
});

test('a refusal by the access rules, or a failing read, is told in French and logged, and nothing is written', async () => {
  const denied = await world({ denyWrites: ['BDD'] });
  const first = logged();
  for (const act of [approveRequest, refuseRequest]) {
    await assert.rejects(act(denied.docApi, denied.described()[0], { log: first.log }), error => error instanceof RequestError
      && /Grist a refusé/.test(error.message) && /droits/.test(error.message) && Boolean(error.cause));
  }
  assert.equal(first.lines.error.length, 2, 'la console garde le détail');
  assert.equal(denied.tables.BDD.id.length, 15);

  const unreadable = await world();
  const request = unreadable.described()[0];
  const failures = { tables: ['BDD'] };
  const flaky = createFakeGrist({ tables: unreadable.tables, failTables: () => failures.tables });
  await assert.rejects(approveRequest(flaky.docApi, request, { log: quiet }), error => error instanceof RequestError && /n'a pas pu relire la demande/.test(error.message));
  assert.deepEqual(writes(flaky), []);
});
