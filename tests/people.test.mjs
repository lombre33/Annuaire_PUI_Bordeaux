import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDirectory, buildContacts, isInScope, tableToRows, describeVisibility, createPeopleIndex, normalizeEmail
} from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { sampleTables, ANA_EMAIL, BOB_EMAIL, IRIS_EMAIL } from './fixtures.mjs';

// ===== people : retrouver sa ligne de BDD par adresse e-mail, et savoir pourquoi on (n')apparaît (pas) =====

const quiet = { info() {}, warn() {} };

async function directory(tables = sampleTables()) {
  return loadDirectory(createFakeGrist({ tables }).docApi, { log: quiet });
}

const statusOf = async (people, email) => {
  const [person] = people.findByEmail(email);
  return person.status;
};

test('normalizeEmail ignores case and surrounding spaces, and tolerates empty values', () => {
  assert.equal(normalizeEmail('  Ana.Martin@CHU-Bordeaux.fr '), 'ana.martin@chu-bordeaux.fr');
  assert.equal(normalizeEmail(null), '');
  assert.equal(normalizeEmail(undefined), '');
});

test('loadDirectory returns an index of every BDD row by e-mail address, whatever the case and spaces', async () => {
  const { people } = await directory();
  const [ana] = people.findByEmail(` ${ANA_EMAIL.toUpperCase()} `);
  assert.equal(ana.row.id, 1, 'la ligne elle-même, dont l\'identifiant sert à l\'écriture');
  assert.equal(ana.name, 'Ana Martin');
  assert.equal(ana.etablissement, 'CHU');
  assert.equal(people.findByEmail(ANA_EMAIL).length, 1);
});

test('findByEmail finds nobody for an unknown, empty or missing address', async () => {
  const { people } = await directory();
  assert.deepEqual(people.findByEmail('inconnu@example.fr'), []);
  assert.deepEqual(people.findByEmail(''), []);
  assert.deepEqual(people.findByEmail(null), []);
  assert.deepEqual(people.findByEmail(undefined), []);
  assert.deepEqual(people.findByEmail('   '), [], 'une adresse vide ne désigne pas les lignes sans e-mail');
});

test('findByEmail returns every row that carries the address (a duplicate is reported, not hidden)', async () => {
  const tables = sampleTables();
  tables.BDD.email[1] = ANA_EMAIL.toUpperCase(); // Bob a la même adresse qu'Ana
  const { people } = await directory(tables);
  assert.deepEqual(people.findByEmail(ANA_EMAIL).map(person => person.row.id), [1, 2]);
});

test('describeVisibility says what keeps each person out of the directory', async () => {
  const { people } = await directory();
  const expected = {
    [ANA_EMAIL]: { accepted: true, inScope: true, named: true, etablissement: 'ok', partnerOnly: false, visible: true },
    [BOB_EMAIL]: { accepted: true, inScope: true, named: true, etablissement: 'ok', partnerOnly: true, visible: true },
    'carla@clinique.fr': { accepted: true, inScope: true, named: true, etablissement: 'not_eligible', partnerOnly: false, visible: false },
    'dan@inserm.fr': { accepted: true, inScope: true, named: true, etablissement: 'not_validated', partnerOnly: false, visible: false },
    'eve@example.fr': { accepted: true, inScope: true, named: true, etablissement: 'missing', partnerOnly: false, visible: false },
    'fred@chu-bordeaux.fr': { accepted: true, inScope: false, named: true, etablissement: 'ok', partnerOnly: false, visible: false },
    [IRIS_EMAIL]: { accepted: false, inScope: true, named: true, etablissement: 'ok', partnerOnly: false, visible: false },
    'jules@chu-bordeaux.fr': { accepted: false, inScope: true, named: true, etablissement: 'ok', partnerOnly: false, visible: false },
    'x@chu-bordeaux.fr': { accepted: true, inScope: true, named: false, etablissement: 'ok', partnerOnly: false, visible: false }
  };
  for (const [email, status] of Object.entries(expected)) {
    assert.deepEqual(await statusOf(people, email), status, email);
  }
});

test('describeVisibility flags an establishment that Etablissements does not know', async () => {
  const tables = sampleTables();
  tables.BDD.Etablissement[0] = 99;
  const { people } = await directory(tables);
  assert.equal((await statusOf(people, ANA_EMAIL)).etablissement, 'unknown');
  assert.equal((await statusOf(people, ANA_EMAIL)).visible, false);
});

test('"visible" agrees with buildContacts for every row of BDD: the person is told the truth', async () => {
  const tables = sampleTables();
  tables.BDD.Etablissement[0] = 99; // un établissement inconnu
  const { people, referenceMaps, etabFlags } = await directory(tables);
  const rows = tableToRows(tables.BDD);
  const shown = new Set(buildContacts(rows.filter(isInScope), referenceMaps, etabFlags).map(contact => contact.id));
  assert.ok(shown.size >= 4);
  for (const row of rows) {
    assert.equal(describeVisibility(row, referenceMaps, etabFlags).visible, shown.has(row.id), `ligne ${row.id}`);
  }
  // …et l'index renvoie le même verdict que describeVisibility.
  assert.equal(people.findByEmail(BOB_EMAIL)[0].status.visible, shown.has(2));
});

test('hasEmailColumn tells a BDD without an email column from an empty one', async () => {
  assert.equal((await directory()).people.hasEmailColumn, true);
  const without = sampleTables();
  delete without.BDD.email;
  const { people } = await directory(without);
  assert.equal(people.hasEmailColumn, false);
  assert.deepEqual(people.findByEmail(ANA_EMAIL), []);
  assert.equal(createPeopleIndex([], {}, {}).hasEmailColumn, true, 'aucune ligne : rien à reprocher à la table');
});

// ===== findById : la fiche qu'on veut modifier, désignée par son identifiant de ligne =====

test('findById finds a row by its identifier whether or not it appears in the directory, with the same verdict as findByEmail', async () => {
  const { people } = await directory();
  const ana = people.findById(1);
  assert.equal(ana.row.id, 1);
  assert.equal(ana.name, 'Ana Martin');
  assert.equal(ana.etablissement, 'CHU');
  assert.deepEqual(ana.status, people.findByEmail(ANA_EMAIL)[0].status);
  const iris = people.findById(11); // a refusé d'apparaître : absente de l'annuaire, mais retrouvable
  assert.equal(iris.status.visible, false);
  assert.equal(iris.row.email, IRIS_EMAIL);
});

test('findById finds nothing for an identifier BDD does not hold, and finds a row without e-mail', async () => {
  const { people } = await directory();
  for (const unknown of [0, 99, -1, null, undefined, '1', NaN]) {
    assert.equal(people.findById(unknown), null, String(unknown));
  }
  assert.equal(people.findById(10).row.email, '', 'Hugo n\'a pas d\'adresse : sa ligne reste retrouvable par son identifiant');
});

test('findById gives the row as stored, so what a form shows and what it writes come from the same cells', async () => {
  const tables = sampleTables();
  const { people } = await directory(tables);
  assert.deepEqual(people.findById(2).row, tableToRows(tables.BDD)[1]);
});
