import { test } from 'node:test';
import assert from './support/assert.mjs';
import { DEACTIVATED_COLUMN, DEPARTURE_GROUPS, PROFILE_FIELDS } from '../constants.js';
import { buildContacts, describeVisibility, isDeactivatedRow, loadDirectory } from '../grist-data.js';
import { colleaguesOf, departedOf, transferOf } from '../departure.js';
import { createDeactivatedColumn } from '../schema.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { ADMIN_EMAIL, ANA_EMAIL, BOB_EMAIL, IRIS_EMAIL, departureTables, sampleTables, withDeactivation, withIdentity, withSchema, withTaskActions } from './fixtures.mjs';

// ===== departure : ce que le départ d'un·e collègue lit et ce que le transfert changerait (1.46.0) =====

async function directoryOf(tables = departureTables()) {
  const fake = createFakeGrist({ user: { email: ADMIN_EMAIL }, tables });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  return { ...directory, fake, tables };
}

const rowOf = (tables, id) => Object.fromEntries(Object.keys(tables.BDD).map(column => [column, tables.BDD[column][tables.BDD.id.indexOf(id)]]));
const initialsOf = row => (String(row.prenom ?? '')[0] ?? '?');
const photoOf = () => 0;

// ===== Les fiches désactivées =====

test('a deactivated fiche is never a contact, and says why in describeVisibility, whatever the person agreed to', async () => {
  const tables = withDeactivation(sampleTables(), { deactivated: { 1: true } });
  const { contacts, people } = await directoryOf(tables);
  assert.equal(contacts.some(contact => contact.email === ANA_EMAIL), false);
  assert.equal(contacts.some(contact => contact.email === 'hostile@chu-bordeaux.example'), true);
  const status = people.findByEmail(ANA_EMAIL)[0].status;
  assert.deepEqual({ accepted: status.accepted, deactivated: status.deactivated, visible: status.visible }, { accepted: true, deactivated: true, visible: false });
});

test('only the value true deactivates a fiche: empty, false, text or a missing column leave it active (nothing to migrate)', () => {
  assert.equal(isDeactivatedRow({ [DEACTIVATED_COLUMN]: true }), true);
  [false, null, undefined, 0, 1, 'true', 'Oui', ['L']].forEach(value => assert.equal(isDeactivatedRow({ [DEACTIVATED_COLUMN]: value }), false, String(value)));
  assert.equal(isDeactivatedRow({}), false);
  assert.equal(isDeactivatedRow(null), false);
});

test('a deactivated fiche is kept out of the directory but stays a normal row for the person who left: her choice to appear is untouched', async () => {
  const tables = withDeactivation(sampleTables(), { deactivated: { 1: true } });
  const rows = tables.BDD;
  assert.equal(rows.Accepte_apparaitre[0], true);
  const { referenceMaps, etabFlags } = await directoryOf(tables);
  const row = rowOf(tables, 1);
  assert.deepEqual(buildContacts([row], referenceMaps, etabFlags), []);
  assert.deepEqual(buildContacts([{ ...row, [DEACTIVATED_COLUMN]: false }], referenceMaps, etabFlags).map(contact => contact.prenom), ['Ana']);
  assert.equal(describeVisibility({ ...row, [DEACTIVATED_COLUMN]: false }, referenceMaps, etabFlags).visible, true);
});

test('deactivatedOf lists the deactivated fiches of one establishment, in table order, and leaves out pending requests', async () => {
  const tables = withDeactivation(sampleTables(), { deactivated: { 1: true, 6: true, 2: true } });
  tables.BDD.En_attente_validation = tables.BDD.id.map(id => id === 6);
  const { people } = await directoryOf(tables);
  assert.deepEqual(people.deactivatedOf(1).map(entry => entry.row.id), [1]);
  assert.deepEqual(people.deactivatedOf(2).map(entry => entry.row.id), [2]);
  assert.deepEqual(people.deactivatedOf(3), []);
  assert.equal(people.hasDeactivatedColumn, true);
});

test('without the column, nothing is deactivated and the index says the column is missing', async () => {
  const { people, contacts } = await directoryOf(sampleTables());
  assert.equal(people.hasDeactivatedColumn, false);
  assert.deepEqual(people.deactivatedOf(1), []);
  assert.equal(contacts.length, 5, 'les cinq contacts de l\'exemple, comme avant la 1.46.0');
});

test('the console counts the deactivated fiches apart, and warns about none of them', async () => {
  const tables = withDeactivation(sampleTables(), { deactivated: { 1: true, 11: true } });
  tables.BDD.Etablissement[10] = 0; // Iris (désactivée) n'a plus d'établissement : son départ n'est pas une anomalie
  const { lines, log } = logged();
  const fake = createFakeGrist({ user: { email: ADMIN_EMAIL }, tables });
  await loadDirectory(fake.docApi, { log });
  assert.ok(lines.info.some(line => /fiches désactivées\s: 2/.test(line)), lines.info.join('\n'));
  assert.equal(lines.warn.some(line => /Iris|sans établissement|Etablissement vide|consentement/i.test(line) && /désactiv/i.test(line)), false);
});

test('createDeactivatedColumn adds a data column of check boxes to BDD, once, and says why when Grist refuses', async () => {
  const tables = withSchema(withIdentity());
  const fake = createFakeGrist({ tables });
  const first = logged();
  assert.equal(await createDeactivatedColumn(fake.docApi, { log: first.log }), '');
  assert.deepEqual(fake.calls.filter(call => call.action === 'AddColumn').map(call => [call.table, call.rowId, call.values]), [['BDD', DEACTIVATED_COLUMN, { type: 'Bool', isFormula: false }]]);
  assert.ok(DEACTIVATED_COLUMN in tables.BDD);
  assert.equal(tables.BDD[DEACTIVATED_COLUMN].length, tables.BDD.id.length);
  assert.match(first.lines.info.join('\n'), /colonne\s«\sFiche_desactivee\s»\sabsente de BDD\s: créée, une case à cocher/);

  const refusedTables = withSchema(withIdentity());
  const failure = await createDeactivatedColumn(createFakeGrist({ tables: refusedTables, denyStructure: true }).docApi, { log: quiet });
  assert.match(failure, /manque dans BDD et Grist n'a pas permis de la créer/);
  assert.match(failure, /le départ d'un·e collègue n'est pas proposé tant qu'elle manque/);
  assert.equal(DEACTIVATED_COLUMN in refusedTables.BDD, false);
});

// ===== Les personnes =====

test('colleaguesOf lists the visible fiches of one establishment in alphabetical order, marks mine, and never shows a hidden one', async () => {
  const { contacts } = await directoryOf(departureTables());
  const people = colleaguesOf(contacts, 1, ANA_EMAIL.toUpperCase(), { initialsOf, photoOf });
  assert.deepEqual(people.map(person => person.id), [6, 1, 10], 'par ordre alphabétique de leur nom affiché');
  assert.deepEqual(people.map(person => person.name.replace(/^<img[^>]*> /, '')), ['Hostile', 'Ana Martin', 'Hugo Bernard']);
  assert.deepEqual(people.map(person => [person.name, person.me]).filter(([, me]) => me), [['Ana Martin', true]]);
  assert.equal(people.some(person => /Refus|Sansreponse/.test(person.name)), false, 'Iris a refusé d’apparaître, Jules n’a pas répondu');
  assert.equal(people.every(person => Number.isInteger(person.id)), true);
  assert.deepEqual(colleaguesOf(contacts, 3, '', { initialsOf, photoOf }), []);
  assert.deepEqual(colleaguesOf(contacts, 1, '', { initialsOf, photoOf }).filter(person => person.me), []);
});

test('colleaguesOf keeps a fiche without an address: it is found by its row, not by its e-mail', async () => {
  const { contacts } = await directoryOf(departureTables());
  const hugo = colleaguesOf(contacts, 1, ANA_EMAIL, { initialsOf, photoOf }).find(person => person.name === 'Hugo Bernard');
  assert.deepEqual({ id: hugo.id, email: hugo.email, me: hugo.me }, { id: 10, email: '', me: false });
});

test('departedOf names the deactivated people by their row, sorted, with a name even when they have none', async () => {
  const tables = withDeactivation(departureTables(), { deactivated: { 1: true, 10: true, 8: true } });
  const { people } = await directoryOf(tables);
  const gone = departedOf(people.deactivatedOf(1), { initialsOf, photoOf });
  assert.deepEqual(gone.map(person => [person.id, person.name]).sort((a, b) => a[0] - b[0]), [[1, 'Ana Martin'], [8, 'Sans nom'], [10, 'Hugo Bernard']]);
  assert.deepEqual(gone.map(person => person.name), [...gone.map(person => person.name)].sort((a, b) => a.localeCompare(b, 'fr')));
});

// ===== Le transfert =====

test('the groups offered are the lists of the fiche, the role apart: it is personal and unchecked at first', () => {
  assert.deepEqual(DEPARTURE_GROUPS.map(group => [group.key, group.on]), [
    ['instances', true], ['gt', true], ['competences', true], ['communautes', true], ['taches', true], ['role', false]
  ]);
  const listColumns = DEPARTURE_GROUPS.flatMap(group => group.fields.map(field => field.key));
  assert.deepEqual(listColumns, ['Instances', 'GT', 'Competences', 'Communautes', 'Taches', 'Taches_responsable', 'Role_dans_le_PUI']);
  // Rien de ce qui est personnel ou écrit par un administrateur ne se transfère.
  const never = ['prenom', 'nom', 'email', 'Etablissement', 'Fonction', 'numero_de_telephone', 'Avatar', 'email_affiche', 'Accepte_apparaitre'];
  assert.deepEqual(listColumns.filter(key => never.includes(key)), []);
  assert.ok(listColumns.every(key => PROFILE_FIELDS.some(field => field.key === key && field.kind === 'list')));
});

test('transferOf copies what the recipient does not have, counts before and after, and keeps what they already have', async () => {
  const { referenceMaps, tables } = await directoryOf();
  const result = transferOf(rowOf(tables, 1), rowOf(tables, 10), ['instances', 'competences', 'communautes'], referenceMaps);
  const byKey = Object.fromEntries(result.groups.map(group => [group.key, group]));
  assert.deepEqual(byKey.instances, { key: 'instances', label: 'Instances', available: true, before: 0, after: 1, add: ['CME'], already: [], responsible: null });
  assert.deepEqual({ before: byKey.competences.before, after: byKey.competences.after, add: byKey.competences.add, already: byKey.competences.already },
    { before: 1, after: 2, add: ['Oncologie'], already: ['Hématologie'] });
  assert.deepEqual(byKey.communautes.add, ['Réseau douleur']);
  assert.equal(result.total, 3);
  assert.deepEqual(Object.keys(result.champs).sort(), ['Communautes', 'Competences', 'Instances']);
  assert.deepEqual(result.champs.Competences.ajout.map(entry => [entry.id, entry.label]), [[1, 'Oncologie']]);
  assert.deepEqual(result.champs.Competences.retrait, []);
});

test('transferOf adds nothing twice: values that read the same count as one, even when they are different rows of the table', async () => {
  const tables = departureTables();
  tables.Competences.id.push(5);
  tables.Competences.Competences.push('oncologie (doublon brut)');
  tables.Competences.Competences_corrigees.push('Oncologie');
  tables.Competences.Macro_competences.push('Cancérologie');
  tables.BDD.Competences[tables.BDD.id.indexOf(10)] = ['L', 5]; // Hugo a « Oncologie » par une autre ligne que celle d'Ana
  const { referenceMaps } = await directoryOf(tables);
  const result = transferOf(rowOf(tables, 1), rowOf(tables, 10), ['competences'], referenceMaps);
  const group = result.groups[0];
  assert.deepEqual({ before: group.before, after: group.after, add: group.add, already: group.already }, { before: 1, after: 2, add: ['Hématologie'], already: ['Oncologie'] });
  assert.deepEqual(result.champs.Competences.ajout.map(entry => entry.label), ['Hématologie']);
});

test('transferOf hands the responsibility over with the action, and only for an action the recipient will hold', async () => {
  const { referenceMaps, tables } = await directoryOf();
  const both = transferOf(rowOf(tables, 1), rowOf(tables, 10), ['taches'], referenceMaps);
  assert.deepEqual(both.groups[0].add, ['1.1 Relecture', '2.1 Inspection']);
  assert.deepEqual(both.groups[0].responsible, ['1.1 Relecture']);
  assert.equal(both.total, 3);
  assert.deepEqual(both.champs.Taches_responsable.ajout.map(entry => entry.label), ['1.1 Relecture']);

  // Hugo est déjà responsable de l'action 1.1 : la responsabilité ne se double pas.
  const alreadyResponsible = rowOf(tables, 10);
  alreadyResponsible.Taches_responsable = ['L', 1];
  const again = transferOf(rowOf(tables, 1), alreadyResponsible, ['taches'], referenceMaps);
  assert.deepEqual(again.groups[0].responsible, []);
  assert.equal('Taches_responsable' in again.champs, false);

  // Sans les actions, rien de leur responsabilité ne passe.
  assert.deepEqual(transferOf(rowOf(tables, 1), rowOf(tables, 10), ['instances'], referenceMaps).groups.map(group => group.key), ['instances']);
});

test('transferOf without the « Responsable de » column still moves the actions', async () => {
  const tables = withIdentity(withDeactivation(withTaskActions()));
  const { referenceMaps } = await directoryOf(tables);
  const result = transferOf(rowOf(tables, 1), rowOf(tables, 10), ['taches'], referenceMaps);
  assert.deepEqual(result.groups[0].add, ['1.1 Relecture', '2.1 Inspection']);
  assert.equal(result.groups[0].responsible, null);
  assert.deepEqual(Object.keys(result.champs), ['Taches']);
});

test('transferOf never copies the roles the widget computes (member or responsible of an action): only the roles the person chose', async () => {
  const tables = departureTables();
  tables.Role_Dans_le_PUI = { id: [1, 2, 3], Role: ['Référent qualité', 'Membre d’une action', 'Responsable d’une action'] };
  tables.BDD.Role_dans_le_PUI[0] = ['L', 1, 2, 3];
  const { referenceMaps } = await directoryOf(tables);
  const result = transferOf(rowOf(tables, 1), rowOf(tables, 10), ['role'], referenceMaps);
  assert.deepEqual(result.groups[0].add, ['Référent qualité']);
});

test('transferOf says when a rubric cannot move because a column is missing, and when there is nothing to add', async () => {
  const tables = departureTables();
  delete tables.BDD.GT;
  const { referenceMaps } = await directoryOf(tables);
  const result = transferOf(rowOf(tables, 1), rowOf(tables, 10), ['gt', 'instances'], referenceMaps);
  assert.deepEqual(result.groups.map(group => [group.key, group.available]), [['instances', true], ['gt', false]]);
  assert.equal(result.total, 1);
  assert.deepEqual(Object.keys(result.champs), ['Instances']);

  const none = transferOf(rowOf(tables, 10), rowOf(tables, 1), ['competences'], referenceMaps);
  assert.deepEqual(none.groups[0].add, []);
  assert.deepEqual(none.groups[0].already, ['Hématologie']);
  assert.deepEqual(none.champs, {});
  assert.equal(none.total, 0);
});

test('transferOf with no group chosen changes nothing, and an unknown group is ignored', async () => {
  const { referenceMaps, tables } = await directoryOf();
  assert.deepEqual(transferOf(rowOf(tables, 1), rowOf(tables, 10), [], referenceMaps), { groups: [], champs: {}, total: 0 });
  assert.deepEqual(transferOf(rowOf(tables, 1), rowOf(tables, 10), ['perimetre', 'email'], referenceMaps), { groups: [], champs: {}, total: 0 });
});

test('the people used by these tests are the ones the sample says (Ana and Hugo at the CHU, Bob at the UBM, Iris who refused)', () => {
  const tables = departureTables();
  assert.deepEqual([1, 10].map(id => rowOf(tables, id).Etablissement), [1, 1]);
  assert.equal(rowOf(tables, 2).email, BOB_EMAIL);
  assert.equal(rowOf(tables, 11).email, IRIS_EMAIL);
});
