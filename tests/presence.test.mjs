import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describePresence, setPresence, explainWriteError, PresenceError } from '../presence.js';
import { loadDirectory } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { sampleTables, ANA_EMAIL, BOB_EMAIL, IRIS_EMAIL } from './fixtures.mjs';

// ===== presence : ce qu'on dit à la personne, et l'écriture de son choix =====

const quiet = { info() {}, warn() {}, error() {} };

async function setup(tables = sampleTables(), options = {}) {
  const fake = createFakeGrist({ tables, ...options });
  const { people } = await loadDirectory(fake.docApi, { log: quiet });
  return { ...fake, tables, people, find: email => people.findByEmail(email) };
}

test('describePresence: a visible person is told so', async () => {
  const { find } = await setup();
  assert.deepEqual(describePresence(find(ANA_EMAIL)), {
    accepted: true, visible: true, tone: 'ok', message: 'Vous apparaissez dans l\'annuaire.'
  });
});

test('describePresence: a partner is told she needs the Partenaires switch to be seen', async () => {
  const { find } = await setup();
  const presence = describePresence(find(BOB_EMAIL));
  assert.equal(presence.tone, 'ok');
  assert.match(presence.message, /interrupteur « Partenaires »/);
});

test('describePresence: someone who has not accepted is not in the directory, and the switch is off', async () => {
  const { find } = await setup();
  assert.deepEqual(describePresence(find(IRIS_EMAIL)), {
    accepted: false, visible: false, tone: 'off', message: 'Vous n\'apparaissez pas dans l\'annuaire.'
  });
  assert.equal(describePresence(find('jules@chu-bordeaux.fr')).accepted, false, 'case vide : pas d\'accord');
});

test('describePresence: someone who accepted but stays hidden is told why, in their own words', async () => {
  const { find } = await setup();
  const why = email => describePresence(find(email));
  assert.equal(why('carla@clinique.fr').tone, 'warn');
  assert.match(why('carla@clinique.fr').message, /accepté d'apparaître, mais votre fiche reste masquée : votre établissement n'est ni fondateur ni partenaire\. Contactez un administrateur\./);
  assert.match(why('dan@inserm.fr').message, /votre établissement n'a pas encore été validé/);
  assert.match(why('eve@example.fr').message, /votre fiche n'a pas d'établissement/);
  assert.match(why('fred@chu-bordeaux.fr').message, /votre fiche n'a pas de périmètre/);
  assert.match(why('x@chu-bordeaux.fr').message, /ni prénom ni nom/);
  assert.equal(why('carla@clinique.fr').accepted, true, 'elle a bien accepté : l\'interrupteur est allumé');
});

test('describePresence lists every reason when several apply', async () => {
  const tables = sampleTables();
  tables.BDD.perimetre[3] = ['L']; // Dan : établissement non validé ET aucun périmètre
  const { find } = await setup(tables);
  const { message } = describePresence(find('dan@inserm.fr'));
  assert.match(message, /pas de périmètre ; votre établissement n'a pas encore été validé/);
});

test('describePresence with several rows for one address: the switch is on only if all accepted, and the message says it applies to all', async () => {
  const tables = sampleTables();
  tables.BDD.email[1] = ANA_EMAIL; // Bob (partenaire) partage l'adresse d'Ana
  const { find } = await setup(tables);
  const both = describePresence(find(ANA_EMAIL));
  assert.equal(both.accepted, true);
  assert.match(both.message, /2 fiches portent votre adresse : votre choix s'applique à toutes\./);

  tables.BDD.Accepte_apparaitre[1] = false;
  const mixed = describePresence((await setup(tables)).find(ANA_EMAIL));
  assert.equal(mixed.accepted, false, 'une fiche non acceptée suffit à éteindre l\'interrupteur');
  assert.equal(mixed.tone, 'warn');
  assert.match(mixed.message, /que sur une partie de vos fiches/);
});

test('setPresence ticks Accepte_apparaitre on the person\'s row, and only there', async () => {
  const { tables, find, docApi } = await setup();
  const expected = structuredClone(tables.BDD);
  expected.Accepte_apparaitre[10] = true; // Iris
  await setPresence(docApi, find(IRIS_EMAIL), true, { log: quiet });
  assert.deepEqual(tables.BDD, expected, 'une seule cellule a changé');
});

test('setPresence sends a single atomic UpdateRecord on BDD per row, and nothing else', async () => {
  const { find, docApi, calls, tables } = await setup();
  await setPresence(docApi, find(ANA_EMAIL), false, { log: quiet });
  assert.deepEqual(calls, [{ action: 'UpdateRecord', table: 'BDD', rowId: 1, values: { Accepte_apparaitre: false }, ok: true }]);
  assert.equal(tables.BDD.Accepte_apparaitre[0], false);
});

test('setPresence writes real booleans, so a person is never half-accepted', async () => {
  const { find, docApi, tables } = await setup();
  await setPresence(docApi, find('jules@chu-bordeaux.fr'), true, { log: quiet });
  assert.strictEqual(tables.BDD.Accepte_apparaitre[11], true);
  await setPresence(docApi, find('jules@chu-bordeaux.fr'), false, { log: quiet });
  assert.strictEqual(tables.BDD.Accepte_apparaitre[11], false);
});

test('setPresence applies the choice to every row carrying the address, in one action', async () => {
  const tables = sampleTables();
  tables.BDD.email[1] = ANA_EMAIL;
  const { find, docApi, calls } = await setup(tables);
  await setPresence(docApi, find(ANA_EMAIL), false, { log: quiet });
  assert.deepEqual(calls.map(call => [call.table, call.rowId, call.values]),
    [['BDD', 1, { Accepte_apparaitre: false }], ['BDD', 2, { Accepte_apparaitre: false }]]);
  assert.deepEqual(tables.BDD.Accepte_apparaitre.slice(0, 2), [false, false]);
});

test('setPresence changes nothing when one of the rows is gone: the batch is atomic', async () => {
  const tables = sampleTables();
  tables.BDD.email[1] = ANA_EMAIL;
  const { find, docApi } = await setup(tables);
  const persons = find(ANA_EMAIL);
  // Bob (ligne 2) est supprimé dans Grist entre la lecture et le clic.
  const removed = persons.map(person => person.row.id === 2 ? { ...person, row: { ...person.row, id: 404 } } : person);
  const snapshot = structuredClone(tables.BDD);
  await assert.rejects(setPresence(docApi, removed, false, { log: quiet }), PresenceError);
  assert.deepEqual(tables.BDD, snapshot, 'la ligne d\'Ana n\'a pas été modifiée seule');
});

test('setPresence turns a refusal by Grist access rules into a clear French message, and keeps the original error', async () => {
  const { find, docApi, tables } = await setup(sampleTables(), { denyWrites: ['BDD'] });
  const logged = [];
  await assert.rejects(
    setPresence(docApi, find(ANA_EMAIL), false, { log: { error: (...args) => logged.push(args) } }),
    error => {
      assert.ok(error instanceof PresenceError);
      assert.match(error.message, /^Grist a refusé la modification/);
      assert.match(error.cause.message, /access rules/);
      return true;
    }
  );
  assert.equal(tables.BDD.Accepte_apparaitre[0], true, 'rien n\'a changé');
  assert.match(logged[0][0], /\[PRESENCE\]/);
});

test('setPresence refuses to run without a person to update', async () => {
  const { docApi, calls } = await setup();
  await assert.rejects(setPresence(docApi, [], true, { log: quiet }), PresenceError);
  assert.deepEqual(calls, []);
});

test('explainWriteError recognises access rules and formula columns, and stays generic otherwise', () => {
  for (const detail of ['Blocked by table update access rules', 'ACL denied', 'Permission denied', 'forbidden']) {
    assert.match(explainWriteError(new Error(detail)), /^Grist a refusé la modification/, detail);
  }
  assert.match(explainWriteError(new Error('Can\'t save value to formula column Accepte_apparaitre')), /colonne de données.*GRIST_SETUP\.md/);
  assert.match(explainWriteError(new Error('timeout')), /n'a pas pu être enregistrée/);
  assert.match(explainWriteError(undefined), /n'a pas pu être enregistrée/);
  assert.match(explainWriteError('texte brut'), /n'a pas pu être enregistrée/);
});
