import { test } from 'node:test';
import assert from './support/assert.mjs';
import { profileFormModel, draftOf, diffProfile, describeChanges, blankFiche, rebaseChanges } from '../profile.js';
import { buildRowUpdate, prepareReview, saveProfile } from '../profile-save.js';
import { createResponsibleColumn } from '../schema.js';
import { loadDirectory, tableToRows, tagText, labelsOf } from '../grist-data.js';
import { PROFILE_FIELDS, RESPONSIBLE_COLUMN, RESPONSIBLE_LABEL } from '../constants.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { ANA_EMAIL, sampleTables, withIdentity, withResponsibleColumn, withSchema, withTaskActions } from './fixtures.mjs';

// ===== « Responsable de » (1.40.0) : les actions dont la personne est responsable, BDD.Taches_responsable =====
//
// Ana (ligne 1) a les actions 1.1 Relecture (ligne 1 de Taches) et 2.1 Inspection (ligne 3) ; Bob a 2.1 ; Gina (9) a 1.2 ; Hugo (10) a Veille.
// Dans withResponsibleColumn, Ana est responsable de 1.1 Relecture.

const field = (model, key) => model.find(entry => entry.key === key);

async function world(tables = withSchema(withIdentity(withResponsibleColumn())), options = {}) {
  const fake = createFakeGrist({ user: { email: ANA_EMAIL }, ...options, tables });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  const row = id => tableToRows(tables.BDD).find(candidate => candidate.id === id);
  return {
    ...fake, ...directory, tables, row,
    form: (id, { admin = false } = {}) => {
      const opened = structuredClone(row(id));
      return { row: opened, draft: draftOf(profileFormModel(opened, directory.referenceMaps, { admin })) };
    },
    context: { referenceMaps: directory.referenceMaps, etabFlags: directory.etabFlags, log: quiet }
  };
}

// ----- Le formulaire -----

test('the profile fields: « Responsable de » comes right after the actions, tied to them, and is a list of the same table', () => {
  const keys = PROFILE_FIELDS.map(entry => entry.key);
  assert.equal(keys[keys.indexOf('Taches') + 1], RESPONSIBLE_COLUMN);
  const entry = PROFILE_FIELDS.find(candidate => candidate.key === RESPONSIBLE_COLUMN);
  assert.deepEqual([entry.label, entry.kind, entry.category, entry.companionOf], [RESPONSIBLE_LABEL, 'list', 'taches', 'Taches']);
  assert.equal(RESPONSIBLE_LABEL, 'Responsable de');
  assert.equal(RESPONSIBLE_COLUMN, 'Taches_responsable');
});

test('profileFormModel offers « Responsable de » under the actions, with the same options and the actions ticked, once BDD has the column', async () => {
  const w = await world();
  const model = profileFormModel(w.row(1), w.referenceMaps);
  assert.deepEqual(model.map(entry => entry.key).slice(-2), ['Taches', RESPONSIBLE_COLUMN]);
  const flagged = field(model, RESPONSIBLE_COLUMN);
  assert.deepEqual([flagged.label, flagged.kind, flagged.category, flagged.companionOf], ['Responsable de', 'list', 'taches', 'Taches']);
  assert.deepEqual(flagged.options, field(model, 'Taches').options, 'les mêmes actions à cocher');
  assert.deepEqual(flagged.value, [1], 'Ana est responsable de 1.1 Relecture');
  assert.deepEqual(field(model, 'Taches').value, [1, 3]);
  assert.deepEqual(field(profileFormModel(w.row(2), w.referenceMaps), RESPONSIBLE_COLUMN).value, [], 'Bob n\'en a coché aucune');
});

test('profileFormModel has no « Responsable de » without the column: the widget has not created it, or Grist refused', async () => {
  const w = await world(withSchema(withIdentity(withTaskActions())));
  assert.equal(field(profileFormModel(w.row(1), w.referenceMaps), RESPONSIBLE_COLUMN), undefined);
  assert.ok(!(RESPONSIBLE_COLUMN in blankFiche(['id', 'prenom', 'Taches'])), 'une fiche qu\'on crée ne l\'a pas non plus');
  assert.ok(RESPONSIBLE_COLUMN in blankFiche(['id', 'prenom', 'Taches', RESPONSIBLE_COLUMN]), 'avec la colonne, une fiche qu\'on crée la propose');
});

// ----- Ce qui change -----

test('ticking and unticking « Responsable de » is a change of that list: added and removed actions, nothing else', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  assert.deepEqual(diffProfile(row, draft, w.referenceMaps).champs, {}, 'rien n\'a bougé');

  const ticked = diffProfile(row, { ...draft, [RESPONSIBLE_COLUMN]: [1, 3] }, w.referenceMaps).champs;
  assert.deepEqual(Object.keys(ticked), [RESPONSIBLE_COLUMN]);
  assert.deepEqual(ticked[RESPONSIBLE_COLUMN].ajout, [{ id: 3, label: '2.1 Inspection' }]);
  assert.deepEqual(ticked[RESPONSIBLE_COLUMN].retrait, []);
  assert.deepEqual(describeChanges(ticked), [{ key: RESPONSIBLE_COLUMN, label: 'Responsable de', kind: 'list', added: ['2.1 Inspection'], removed: [] }]);

  const unticked = diffProfile(row, { ...draft, [RESPONSIBLE_COLUMN]: [] }, w.referenceMaps).champs;
  assert.deepEqual(unticked[RESPONSIBLE_COLUMN].retrait, [{ id: 1, label: '1.1 Relecture' }]);
  assert.deepEqual(describeChanges(unticked)[0].removed, ['1.1 Relecture']);
});

test('an action removed with its responsibility is two changes of two lists, in the order of the form: the actions, then « Responsable de »', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  const { champs } = diffProfile(row, { ...draft, Taches: [3], [RESPONSIBLE_COLUMN]: [] }, w.referenceMaps);
  assert.deepEqual(describeChanges(champs).map(line => [line.label, line.removed]), [['Actions', ['1.1 Relecture']], ['Responsable de', ['1.1 Relecture']]]);
});

test('buildRowUpdate writes « Responsable de » as a delta on the current cell: what someone else added meanwhile survives', async () => {
  const w = await world();
  const change = { [RESPONSIBLE_COLUMN]: { ajout: [{ id: 3, label: '2.1 Inspection' }], retrait: [{ id: 1, label: '1.1 Relecture' }] } };
  assert.deepEqual(buildRowUpdate(change, w.row(1)).values, { [RESPONSIBLE_COLUMN]: ['L', 3] });
  const current = { ...w.row(1), [RESPONSIBLE_COLUMN]: ['L', 1, 2] }; // entre-temps, Grist y a ajouté la ligne 2
  assert.deepEqual(buildRowUpdate(change, current).values, { [RESPONSIBLE_COLUMN]: ['L', 2, 3] });
  const nowhere = { id: 1, prenom: 'Ana', nom: 'Martin', Taches: ['L', 1] };
  assert.match(buildRowUpdate(change, nowhere).error, /Taches_responsable/, 'sans la colonne, rien ne s\'écrit en silence');
});

test('rebaseChanges keeps what is still to do on the row as Grist has it now: an action already ticked is not ticked twice', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  const { champs } = diffProfile(row, { ...draft, [RESPONSIBLE_COLUMN]: [1, 3] }, w.referenceMaps);
  const meanwhile = { ...w.row(1), [RESPONSIBLE_COLUMN]: ['L', 1, 3] };
  assert.deepEqual(rebaseChanges(champs, meanwhile, w.referenceMaps).champs, {}, 'déjà fait : plus rien à changer');
});

// ----- La relecture et l'enregistrement -----

test('prepareReview shows the role pill that the change makes: « Responsable des actions 1.1, 2.1 » on the card after, and the pill is repérée', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  const review = await prepareReview(w.docApi, row, { ...draft, [RESPONSIBLE_COLUMN]: [1, 3] }, w.context);
  assert.equal(tagText(review.before, 'role', 'Responsable d’une action'), 'Responsable de l’action 1.1');
  assert.equal(tagText(review.after, 'role', 'Responsable d’une action'), 'Responsable des actions 1.1, 2.1');
  assert.deepEqual(review.marks.tags.role, { added: ['Responsable des actions 1.1, 2.1'], removed: ['Responsable de l’action 1.1'] },
    'le texte de la pastille a changé : l\'ancienne est barrée, la nouvelle repérée');
  assert.deepEqual(review.lines.map(line => line.label), ['Responsable de']);
});

test('prepareReview marks a role pill that appears for the first time: Bob ticks his only action', async () => {
  const w = await world();
  const { row, draft } = w.form(2);
  const review = await prepareReview(w.docApi, row, { ...draft, [RESPONSIBLE_COLUMN]: [3] }, w.context);
  assert.deepEqual(labelsOf(review.before, 'role'), ['Membre d’une action']);
  assert.deepEqual(labelsOf(review.after, 'role'), ['Membre d’une action', 'Responsable d’une action']);
  assert.deepEqual(review.marks.tags.role, { added: ['Responsable de l’action 2.1'], removed: [] });
});

test('saveProfile writes the responsibilities in Bob\'s row only, and the next reading gives him the role with the number of the action', async () => {
  const w = await world(withSchema(withIdentity(withResponsibleColumn())), { user: { email: 'bob@u-bordeaux-montaigne.example' } });
  const { row, draft } = w.form(2);
  const review = await prepareReview(w.docApi, row, { ...draft, [RESPONSIBLE_COLUMN]: [3] }, w.context);
  await saveProfile(w.docApi, review, { log: quiet });
  const writes = w.calls.filter(call => call.action === 'UpdateRecord');
  assert.deepEqual(writes.map(call => [call.table, call.rowId, call.values]), [['BDD', 2, { [RESPONSIBLE_COLUMN]: ['L', 3] }]]);
  const again = await loadDirectory(w.docApi, { log: quiet });
  const bob = again.contacts.find(contact => contact.id === 2);
  assert.deepEqual(labelsOf(bob, 'role'), ['Membre d’une action', 'Responsable d’une action']);
  assert.equal(tagText(bob, 'role', 'Responsable d’une action'), 'Responsable de l’action 2.1');
});

test('an action ticked in « Responsable de » that the person has not (any more) does not make her responsible, whatever the cell says', async () => {
  const tables = withSchema(withIdentity(withResponsibleColumn(withTaskActions(), { 2: ['L', 1] }))); // Bob : cochée « 1.1 », qu'il n'a pas
  const w = await world(tables);
  const bob = w.contacts.find(contact => contact.id === 2);
  assert.deepEqual(labelsOf(bob, 'role'), ['Membre d’une action']);
  assert.deepEqual(bob.roleTexts, {});
});

// ----- La colonne -----

const added = fake => fake.calls.filter(call => call.action === 'AddColumn');

test('createResponsibleColumn adds the column to BDD as a list of references to Taches, a data column, and says so', async () => {
  const tables = withSchema(withIdentity(withTaskActions()));
  const fake = createFakeGrist({ tables });
  const { lines, log } = logged();
  assert.equal(await createResponsibleColumn(fake.docApi, { log }), '');
  assert.deepEqual(added(fake).map(call => [call.table, call.rowId, call.values]), [['BDD', 'Taches_responsable', { type: 'RefList:Taches', isFormula: false }]]);
  assert.ok(RESPONSIBLE_COLUMN in tables.BDD, 'la colonne existe, vide pour chaque ligne');
  assert.equal(tables.BDD.Taches_responsable.length, tables.BDD.id.length);
  assert.ok(tables.BDD.Taches_responsable.every(cell => cell === null));
  assert.match(lines.info.join('\n'), /\[SCHEMA\] colonne « Taches_responsable » absente de BDD/);
});

test('createResponsibleColumn removes the column it made when someone else made it first: Grist numbers ours, the original serves everybody', async () => {
  const tables = withSchema(withIdentity(withResponsibleColumn()));
  const fake = createFakeGrist({ tables });
  const { lines, log } = logged();
  assert.equal(await createResponsibleColumn(fake.docApi, { log }), '');
  assert.deepEqual(fake.calls.map(call => call.action), ['AddColumn', 'RemoveColumn']);
  assert.ok(!('Taches_responsable2' in tables.BDD), 'la colonne numérotée est retirée');
  assert.deepEqual(tables.BDD.Taches_responsable[0], ['L', 1], 'celle d\'origine est intacte');
  assert.match(lines.info.join('\n'), /déjà créée par une autre personne/);
});

test('createResponsibleColumn gives the reason when Grist refuses, and changes nothing', async () => {
  const tables = withSchema(withIdentity(withTaskActions()));
  const fake = createFakeGrist({ tables, denyStructure: true });
  const reason = await createResponsibleColumn(fake.docApi, { log: quiet });
  assert.match(reason, /la colonne « Taches_responsable » manque dans BDD et Grist n'a pas permis de la créer \(Blocked by table structure access rules\)/);
  assert.match(reason, /la case « Responsable de » du profil n'est pas proposée/);
  assert.match(reason, /GRIST_SETUP\.md/);
  assert.ok(!(RESPONSIBLE_COLUMN in tables.BDD));
});
