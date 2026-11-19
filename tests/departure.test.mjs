import { test } from 'node:test';
import assert from './support/assert.mjs';
import { DEPARTURE_GROUPS, PROFILE_FIELDS } from '../constants.js';
import { loadDirectory } from '../grist-data.js';
import { colleaguesOf, departedOf, transferOf } from '../departure.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { ADMIN_EMAIL, ANA_EMAIL, BOB_EMAIL, IRIS_EMAIL, departureTables, withIdentity, withTaskActions } from './fixtures.mjs';

// ===== departure : ce que le départ d'un·e collègue lit et ce que le transfert changerait (1.46.0) =====

async function directoryOf(tables = departureTables()) {
  const fake = createFakeGrist({ user: { email: ADMIN_EMAIL }, tables });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  return { ...directory, fake, tables };
}

const rowOf = (tables, id) => Object.fromEntries(Object.keys(tables.BDD).map(column => [column, tables.BDD[column][tables.BDD.id.indexOf(id)]]));
const initialsOf = row => (String(row.prenom ?? '')[0] ?? '?');
const photoOf = () => 0;

// ===== Les fiches qui n'apparaissent pas (le départ décoche Accepte_apparaitre, 1.46.1) =====

const untick = (tables, ...ids) => {
  ids.forEach(id => { tables.BDD.Accepte_apparaitre[tables.BDD.id.indexOf(id)] = false; });
  return tables;
};

test('unticking « Accepte_apparaitre » is all a departure does to the directory: the fiche leaves the cards, ticking it brings it back', async () => {
  const before = await directoryOf(departureTables());
  assert.equal(before.contacts.some(contact => contact.email === ANA_EMAIL), true);
  const after = await directoryOf(untick(departureTables(), 1));
  assert.equal(after.contacts.some(contact => contact.email === ANA_EMAIL), false);
  assert.equal(after.contacts.length, before.contacts.length - 1, 'un contact de moins, exactement');
  const status = after.people.findByEmail(ANA_EMAIL)[0].status;
  assert.deepEqual({ accepted: status.accepted, pending: status.pending, visible: status.visible }, { accepted: false, pending: false, visible: false });
  assert.equal('deactivated' in status, false, 'aucune colonne de plus : le départ ne dit rien que la case ne dise déjà');
  // L'établissement de chaque fiche ne bouge pas : seule la case change.
  assert.deepEqual(after.tables.BDD.Etablissement, before.tables.BDD.Etablissement);
  const ticked = untick(departureTables(), 1);
  ticked.BDD.Accepte_apparaitre[ticked.BDD.id.indexOf(1)] = true;
  const back = await directoryOf(ticked);
  assert.equal(back.contacts.some(contact => contact.email === ANA_EMAIL), true);
  assert.equal(back.contacts.length, before.contacts.length);
});

test('withoutConsentOf lists the fiches of one establishment the directory does not show for lack of consent, in table order, and leaves out pending requests', async () => {
  const tables = untick(departureTables(), 1, 2);
  tables.BDD.En_attente_validation = tables.BDD.id.map(id => id === 12);
  const { people } = await directoryOf(tables);
  assert.deepEqual(people.withoutConsentOf(1).map(entry => entry.row.id), [1, 11], 'Ana (partie) et Iris (a refusé) ; Jules est une demande en attente');
  assert.deepEqual(people.withoutConsentOf(2).map(entry => entry.row.id), [2]);
  assert.deepEqual(people.withoutConsentOf(3), []);
  const everyone = (await directoryOf(departureTables())).people;
  assert.deepEqual(everyone.withoutConsentOf(1).map(entry => entry.row.id), [11, 12], 'sans la colonne des demandes : Iris a refusé, Jules n’a pas répondu');
});

test('the console says nothing more than before the departure existed: no count of departed fiches, no new warning', async () => {
  const { lines, log } = logged();
  const fake = createFakeGrist({ user: { email: ADMIN_EMAIL }, tables: untick(departureTables(), 1) });
  await loadDirectory(fake.docApi, { log });
  assert.equal(lines.info.some(line => /désactiv/.test(line)), false, lines.info.join('\n'));
  assert.equal(lines.warn.some(line => /désactiv/.test(line)), false);
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

test('departedOf names the people whose fiche does not appear by their row, sorted, with a name even when they have none', async () => {
  const { people } = await directoryOf(untick(departureTables(), 1, 10, 8));
  const gone = departedOf(people.withoutConsentOf(1), { initialsOf, photoOf });
  assert.deepEqual(gone.map(person => [person.id, person.name]).sort((a, b) => a[0] - b[0]),
    [[1, 'Ana Martin'], [8, 'Sans nom'], [10, 'Hugo Bernard'], [11, 'Iris Refus'], [12, 'Jules Sansreponse']]);
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
  const tables = withIdentity(withTaskActions());
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
