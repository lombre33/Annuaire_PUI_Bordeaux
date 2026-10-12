import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProfileSaveError, buildRowUpdate, signatureOf, readRow, prepareReview, saveProfile, unsavedLabels
} from '../profile-save.js';
import { profileFormModel, draftOf } from '../profile.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { UploadError } from '../upload.js';
import { sampleTables, withAvatars, withIdentity, withSchema, ANA_EMAIL } from './fixtures.mjs';

// ===== profile-save : relire, vérifier, écrire une fiche modifiée =====

const logged = () => {
  const lines = { info: [], warn: [], error: [] };
  const log = Object.fromEntries(Object.keys(lines).map(level => [level, (...args) => lines[level].push(args.map(String).join(' '))]));
  return { lines, log };
};
const quiet = { info() {}, warn() {}, error() {} };

// Un document complet (identité, métadonnées), vu par une personne. `fail(['BDD'])`
// rend ensuite illisibles les tables nommées : l'annuaire est déjà chargé, c'est la
// relecture d'une fiche qui échoue.
async function world(options = {}) {
  const tables = options.tables ?? withSchema(withIdentity());
  const broken = { tables: [] };
  const fake = createFakeGrist({ user: { email: ANA_EMAIL }, ...options, tables, failTables: () => broken.tables });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  const row = id => tableToRows(tables.BDD).find(candidate => candidate.id === id);
  return {
    ...fake, ...directory, tables, row,
    fail: names => { broken.tables = names; },
    // La fiche telle que le formulaire l'ouvre.
    form: (id, { admin = false } = {}) => {
      const opened = structuredClone(row(id));
      return { row: opened, draft: draftOf(profileFormModel(opened, directory.referenceMaps, { admin })) };
    },
    context: { referenceMaps: directory.referenceMaps, etabFlags: directory.etabFlags, log: quiet }
  };
}

const writes = w => w.calls.filter(call => ['AddRecord', 'UpdateRecord', 'RemoveRecord'].includes(call.action));

// Ouvre le formulaire d'une fiche, y saisit `changes`, prépare la relecture. `admin` : un
// administrateur modifie la fiche d'une autre personne (e-mail et établissement compris).
async function review(w, id, changes, { admin = false } = {}) {
  const { row, draft } = w.form(id, { admin });
  return prepareReview(w.docApi, row, { ...draft, ...changes }, { ...w.context, admin });
}

// ===== buildRowUpdate =====

test('buildRowUpdate computes a list from the CURRENT row: concurrent changes and unnamed values survive', async () => {
  const w = await world();
  // Hugo : Instances [999]. Le changement ajoute CME (1) ; entre-temps Grist y a ajouté COVIRIS (3).
  const change = { Instances: { ajout: [{ id: 1, label: 'CME' }], retrait: [] } };
  const current = { ...w.row(10), Instances: ['L', 999, 3] };
  assert.deepEqual(buildRowUpdate(change, current).values, { Instances: ['L', 999, 3, 1] });
  const removal = { Competences: { ajout: [{ id: 3, label: 'x' }], retrait: [{ id: 1, label: 'y' }] } };
  assert.deepEqual(buildRowUpdate(removal, w.row(1)).values, { Competences: ['L', 2, 3] });
});

test('buildRowUpdate is idempotent: adding what is already there or removing what is gone changes nothing more', async () => {
  const w = await world();
  const change = { Competences: { ajout: [{ id: 1, label: '' }], retrait: [{ id: 404, label: '' }] } };
  assert.deepEqual(buildRowUpdate(change, w.row(1)).values, { Competences: ['L', 1, 2] });
});

test('buildRowUpdate writes an emptied list in the Grist encoding', async () => {
  const w = await world();
  const change = { Competences: { ajout: [], retrait: [{ id: 1, label: '' }, { id: 2, label: '' }] } };
  assert.deepEqual(buildRowUpdate(change, w.row(1)).values, { Competences: ['L'] });
});

test('buildRowUpdate refuses to rewrite a list that holds values it cannot represent', async () => {
  const w = await world();
  // Ana : Actions ['L', 'Vaccination'] (déjà résolu en texte).
  const change = { Actions: { ajout: [{ id: 2, label: 'Audit' }], retrait: [] } };
  assert.match(buildRowUpdate(change, w.row(1)).error, /Actions : la fiche contient des valeurs que le widget ne sait pas modifier/);
});

test('buildRowUpdate writes the phone in the form of its column: a number when Numeric, a text otherwise', async () => {
  const w = await world();
  const change = { numero_de_telephone: { avant: '', apres: '0556789013' } };
  assert.deepEqual(buildRowUpdate(change, w.row(1), { numero_de_telephone: 'Numeric' }).values, { numero_de_telephone: 556789013 });
  assert.deepEqual(buildRowUpdate(change, w.row(1), { numero_de_telephone: 'Int' }).values, { numero_de_telephone: 556789013 });
  assert.deepEqual(buildRowUpdate(change, w.row(1), { numero_de_telephone: 'Text' }).values, { numero_de_telephone: '05 56 78 90 13' });
  assert.deepEqual(buildRowUpdate(change, w.row(1), {}).values, { numero_de_telephone: 556789013 }, 'type inconnu : la cellule est un nombre');
  assert.deepEqual(buildRowUpdate(change, { ...w.row(1), numero_de_telephone: '05 56 78 90 12' }, {}).values,
    { numero_de_telephone: '05 56 78 90 13' }, 'type inconnu : la cellule est un texte');
  const clear = { numero_de_telephone: { avant: '', apres: '' } };
  assert.deepEqual(buildRowUpdate(clear, w.row(1), { numero_de_telephone: 'Numeric' }).values, { numero_de_telephone: null });
  assert.deepEqual(buildRowUpdate(clear, w.row(1), { numero_de_telephone: 'Text' }).values, { numero_de_telephone: '' });
});

test('buildRowUpdate writes text and references, and refuses a nameless row or a missing column', async () => {
  const w = await world();
  const change = { Fonction: { avant: '', apres: 'Cheffe' }, Role_dans_le_PUI: { avant: { id: 1, label: '' }, apres: { id: 0, label: '' } } };
  assert.deepEqual(buildRowUpdate(change, w.row(1)).values, { Fonction: 'Cheffe', Role_dans_le_PUI: 0 });
  const nameless = { prenom: { avant: '', apres: '' }, nom: { avant: '', apres: '' } };
  assert.match(buildRowUpdate(nameless, w.row(1)).error, /ni prénom ni nom/);
  const alreadyNameless = { ...w.row(1), prenom: '', nom: '' };
  assert.deepEqual(buildRowUpdate({ Fonction: { avant: '', apres: 'Cheffe' } }, alreadyNameless).values, { Fonction: 'Cheffe' },
    'une fiche déjà sans nom peut changer autre chose');
  assert.match(buildRowUpdate({ prenom: { avant: '', apres: '' } }, alreadyNameless).error, /ni prénom ni nom/);
  const { numero_de_telephone: _omitted, ...withoutPhone } = w.row(1);
  assert.match(buildRowUpdate({ numero_de_telephone: { avant: '', apres: '0102030405' } }, withoutPhone).error, /la colonne numero_de_telephone n'existe pas/);
});

test('buildRowUpdate writes nothing for an empty set of changes, and only the columns that changed', async () => {
  const w = await world();
  assert.deepEqual(buildRowUpdate({}, w.row(1)), { values: {} });
  const { values } = buildRowUpdate({ Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' } }, w.row(1));
  assert.deepEqual(Object.keys(values), ['Fonction']);
});

// ===== signatureOf =====

test('signatureOf changes when a touched cell changes, and only then', async () => {
  const w = await world();
  const keys = ['Fonction', 'Competences'];
  const before = signatureOf(w.row(1), keys);
  assert.equal(signatureOf({ ...w.row(1) }, keys), before, 'la même fiche donne la même signature');
  assert.notEqual(signatureOf({ ...w.row(1), Fonction: 'Autre' }, keys), before);
  assert.notEqual(signatureOf({ ...w.row(1), Competences: ['L', 1, 2, 3] }, keys), before);
  assert.equal(signatureOf({ ...w.row(1), nom: 'Autre', Instances: ['L', 3] }, keys), before, 'une cellule non touchée ne compte pas');
  assert.equal(signatureOf(null, keys), '[null,null]', 'une fiche absente a sa propre signature');
});

// ===== readRow =====

test('readRow gives the row as Grist holds it now, and says so in French when it is gone or unreadable', async () => {
  const w = await world();
  assert.equal((await readRow(w.docApi, 1)).prenom, 'Ana');
  await assert.rejects(readRow(w.docApi, 404), error => error instanceof ProfileSaveError && /n'existe plus dans Grist/.test(error.message));
  const { lines, log } = logged();
  const broken = await world();
  broken.fail(['BDD']);
  await assert.rejects(readRow(broken.docApi, 1, { log }), error => error instanceof ProfileSaveError && /n'a pas pu être relue/.test(error.message));
  assert.equal(lines.error.length, 1);
  assert.match(lines.error[0], /^\[PROFIL\] lecture de la fiche impossible/);
});

// ===== prepareReview =====

test('prepareReview builds the card before and after from the fiche as Grist holds it, and writes nothing', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe de service', numero_de_telephone: '05 56 78 90 13', Role_dans_le_PUI: 0, Competences: [2, 3] });
  assert.equal(next.rowId, 1);
  assert.equal(next.before.Fonction, 'Pharmacienne');
  assert.equal(next.after.Fonction, 'Cheffe de service');
  assert.equal(next.after.numero_de_telephone, 556789013, 'la carte « après » montre ce que Grist stockera');
  assert.deepEqual(next.after.labels.competences, ['Hématologie', 'Pharmacovigilance']);
  assert.deepEqual(next.after.labels.role, []);
  assert.deepEqual(next.before.labels.competences, ['Oncologie', 'Hématologie']);
  assert.deepEqual(next.marks.tags.competences, { added: ['Pharmacovigilance'], removed: ['Oncologie'] });
  assert.deepEqual(next.marks.tags.role, { added: [], removed: ['Référent qualité'] });
  assert.deepEqual(next.marks.texts.fonction, { before: 'Pharmacienne', after: 'Cheffe de service' });
  assert.deepEqual(next.lines.map(line => line.key), ['Fonction', 'numero_de_telephone', 'Role_dans_le_PUI', 'Competences']);
  assert.equal(next.notice, '');
  assert.equal(next.columnTypes.numero_de_telephone, 'Numeric');
  assert.deepEqual(writes(w), [], 'la relecture n\'écrit rien dans Grist');
});

test('prepareReview says whether the fiche figures in the directory, as the directory itself decides', async () => {
  const w = await world();
  const visible = await review(w, 1, { Fonction: 'Cheffe' });
  assert.equal(visible.visibility.visible, true);
  assert.equal(visible.visibility.accepted, true);
  // Iris a refusé d'apparaître ; Dan est accepté mais son établissement n'est pas validé.
  const refused = await review(w, 11, { Fonction: 'Ingénieure' });
  assert.deepEqual([refused.visibility.visible, refused.visibility.accepted], [false, false]);
  const unvalidated = await review(w, 4, { Fonction: 'Chargé de projet' });
  assert.deepEqual([unvalidated.visibility.visible, unvalidated.visibility.accepted, unvalidated.visibility.etablissement], [false, true, 'not_validated']);
  // Ce que la modification écrit compte : une fiche qu'on rend sans nom ne figurerait plus (mais elle est refusée plus haut).
  w.tables.BDD.Accepte_apparaitre[0] = false;
  assert.equal((await review(w, 1, { Fonction: 'Cheffe' })).visibility.accepted, false, 'la fiche relue dans Grist, pas celle du formulaire');
});

test('prepareReview refuses to review nothing, and a draft that has errors', async () => {
  const w = await world();
  await assert.rejects(review(w, 1, {}), error => error instanceof ProfileSaveError && /rien à relire/.test(error.message));
  await assert.rejects(review(w, 1, { Fonction: '=1+1' }), /rien à relire/);
  await assert.rejects(review(w, 1, { numero_de_telephone: '12' }), /rien à relire/);
  assert.deepEqual(writes(w), []);
});

test('prepareReview never drops a refused field silently: one error stops the whole review, even beside valid changes', async () => {
  const w = await world();
  await assert.rejects(review(w, 1, { Fonction: '=1+1', numero_de_telephone: '05 56 78 90 13' }),
    error => error instanceof ProfileSaveError && /rien à relire/.test(error.message));
  await assert.rejects(review(w, 1, { prenom: '', nom: '', Fonction: 'Cheffe' }), /rien à relire/);
  assert.deepEqual(writes(w), []);
});

test('prepareReview reads the fiche again: the card before shows what Grist holds now, and the notice names what moved', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  // Pendant que la personne remplit le formulaire, quelqu'un d'autre change la fonction et ajoute une compétence.
  w.tables.BDD.Fonction[0] = 'Directrice';
  w.tables.BDD.Competences[0] = ['L', 1, 2, 4];
  const next = await prepareReview(w.docApi, row, { ...draft, Fonction: 'Cheffe', Competences: [1, 2, 3] }, w.context);
  assert.equal(next.before.Fonction, 'Directrice', 'la carte « avant » est celle d\'aujourd\'hui');
  assert.deepEqual(next.champs.Fonction, { avant: 'Directrice', apres: 'Cheffe' });
  assert.match(next.notice, /ont changé dans Grist depuis l'ouverture de la fenêtre : Fonction\./);
  assert.deepEqual(next.after.labels.competences.sort(), ['Divers', 'Hématologie', 'Oncologie', 'Pharmacovigilance'],
    'l\'ajout fait par un autre est conservé dans la carte « après »');
});

test('prepareReview says there is nothing to save when somebody else already made the same changes', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  w.tables.BDD.Fonction[0] = 'Cheffe';
  await assert.rejects(prepareReview(w.docApi, row, { ...draft, Fonction: 'Cheffe' }, w.context),
    error => error instanceof ProfileSaveError && /déjà dans la fiche/.test(error.message));
});

test('prepareReview reports a fiche that was deleted, a table it cannot read, and a column that is gone', async () => {
  const w = await world();
  const { row, draft } = w.form(1);
  const gone = { ...w.tables.BDD };
  Object.keys(gone).forEach(column => { gone[column] = gone[column].filter((_, index) => w.tables.BDD.id[index] !== 1); });
  w.tables.BDD = gone;
  await assert.rejects(prepareReview(w.docApi, row, { ...draft, Fonction: 'X' }, w.context), /n'existe plus dans Grist/);

  const broken = await world();
  const form = broken.form(1);
  broken.fail(['BDD']);
  await assert.rejects(prepareReview(broken.docApi, form.row, { ...form.draft, Fonction: 'X' }, broken.context), /n'a pas pu être relue/);

  const missing = await world();
  const opened = missing.form(1);
  delete missing.tables.BDD.numero_de_telephone;
  await assert.rejects(prepareReview(missing.docApi, opened.row, { ...opened.draft, numero_de_telephone: '05 56 78 90 13' }, missing.context),
    /la colonne numero_de_telephone n'existe pas dans BDD/);
});

test('prepareReview writes the phone in the form of the column the document declares, and in the form of the cell without metadata', async () => {
  const text = await world({ tables: withSchema(withIdentity(), { phoneType: 'Text' }) });
  assert.equal((await review(text, 1, { numero_de_telephone: '0556789013' })).after.numero_de_telephone, '05 56 78 90 13');
  const noMeta = await world({ tables: withIdentity() });
  const next = await review(noMeta, 1, { numero_de_telephone: '0556789013' });
  assert.deepEqual(next.columnTypes, {});
  assert.equal(next.after.numero_de_telephone, 556789013, 'sans métadonnées, la cellule est un nombre : on écrit un nombre');
});

test('prepareReview keeps the unnamed values of a list and refuses to rewrite a list it cannot read', async () => {
  const w = await world();
  const hugo = await review(w, 10, { Instances: [1] }); // Hugo : Instances ['L', 999], valeur que le formulaire ne montre pas
  assert.deepEqual(hugo.champs.Instances.ajout, [{ id: 1, label: 'CME' }]);
  await assert.rejects(review(w, 1, { Actions: [1, 2] }), /Actions : la fiche contient des valeurs que le widget ne sait pas modifier/);
});

// ===== saveProfile =====

test('saveProfile writes the changes in one single UpdateRecord of the fiche, and only the columns that changed', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe de service', numero_de_telephone: '+33 5 56 78 90 13', Competences: [2, 3] });
  const result = await saveProfile(w.docApi, next, { log: quiet });
  assert.equal(result.status, 'saved');
  assert.deepEqual(writes(w), [{
    action: 'UpdateRecord', table: 'BDD', rowId: 1, ok: true,
    values: { Fonction: 'Cheffe de service', numero_de_telephone: 556789013, Competences: ['L', 2, 3] }
  }]);
  assert.deepEqual(result.values, writes(w)[0].values);
  assert.equal(w.row(1).email, ANA_EMAIL, 'l\'adresse n\'est jamais écrite');
  assert.equal(w.row(1).Accepte_apparaitre, true, 'le choix de présence n\'est jamais touché');
});

test('saveProfile leaves every other fiche alone, and the cells of the fiche it was not asked to change', async () => {
  const w = await world();
  const before = structuredClone(w.tables.BDD);
  await saveProfile(w.docApi, await review(w, 1, { Fonction: 'Cheffe' }), { log: quiet });
  const after = w.tables.BDD;
  Object.keys(before).forEach(column => before[column].forEach((value, index) => {
    if (column === 'Fonction' && index === 0) return;
    assert.deepEqual(after[column][index], value, `${column}, ligne ${index + 1}`);
  }));
  assert.equal(after.Fonction[0], 'Cheffe');
});

test('after saving, the directory shows the new values: the whole path, from the form to the card', async () => {
  const w = await world();
  await saveProfile(w.docApi, await review(w, 1, { Fonction: 'Cheffe de service', numero_de_telephone: '+33 5 56 78 90 14', Competences: [3], prenom: 'Anna' }), { log: quiet });
  const { contacts } = await loadDirectory(w.docApi, { log: quiet });
  const ana = contacts.find(contact => contact.id === 1);
  assert.equal(ana.prenom, 'Anna');
  assert.equal(ana.Fonction, 'Cheffe de service');
  assert.equal(ana.numero_de_telephone, 556789014);
  assert.deepEqual(ana.labels.competences, ['Pharmacovigilance']);
});

test('what the card after showed is what the directory shows once the fiche is saved', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe', Competences: [2, 3], Role_dans_le_PUI: 0, numero_de_telephone: '' });
  await saveProfile(w.docApi, next, { log: quiet });
  const { contacts } = await loadDirectory(w.docApi, { log: quiet });
  const ana = contacts.find(contact => contact.id === 1);
  assert.deepEqual(ana.labels, next.after.labels);
  assert.equal(ana.Fonction, next.after.Fonction);
  assert.equal(ana.numero_de_telephone, next.after.numero_de_telephone);
});

test('saveProfile writes nothing when a field the person touched has changed in Grist since the review', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe', Competences: [2, 3] });
  w.tables.BDD.Fonction[0] = 'Directrice'; // quelqu'un d'autre, après la relecture
  const result = await saveProfile(w.docApi, next, { log: quiet });
  assert.equal(result.status, 'changed');
  assert.equal(result.row.Fonction, 'Directrice', 'la fiche d\'aujourd\'hui, pour relire');
  assert.deepEqual(writes(w), []);
  assert.equal(w.tables.BDD.Fonction[0], 'Directrice');
});

test('saveProfile also asks for a new review when a touched list changed meanwhile, so the card after stays true', async () => {
  const w = await world();
  const next = await review(w, 1, { Competences: [2, 3] });
  w.tables.BDD.Competences[0] = ['L', 1, 2, 4];
  assert.equal((await saveProfile(w.docApi, next, { log: quiet })).status, 'changed');
  assert.deepEqual(writes(w), []);
});

test('saveProfile ignores what changed in a field the person did not touch, and keeps it', async () => {
  const w = await world();
  const next = await review(w, 1, { numero_de_telephone: '05 56 78 90 13' });
  w.tables.BDD.Fonction[0] = 'Directrice'; // une autre colonne, changée entre-temps
  assert.equal((await saveProfile(w.docApi, next, { log: quiet })).status, 'saved');
  assert.equal(w.tables.BDD.Fonction[0], 'Directrice', 'ce qu\'un autre a changé n\'est pas écrasé');
  assert.equal(w.tables.BDD.numero_de_telephone[0], 556789013);
});

test('saveProfile writes only once for a given review: a second attempt finds the fiche already changed', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe' });
  assert.equal((await saveProfile(w.docApi, next, { log: quiet })).status, 'saved');
  assert.equal((await saveProfile(w.docApi, next, { log: quiet })).status, 'changed', 'la signature a changé : pas de deuxième écriture');
  assert.equal(writes(w).length, 1);
});

test('saveProfile reports a fiche deleted since the review, and refuses an empty review', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe' });
  Object.keys(w.tables.BDD).forEach(column => w.tables.BDD[column].shift());
  await assert.rejects(saveProfile(w.docApi, next, { log: quiet }), /n'existe plus dans Grist/);
  await assert.rejects(saveProfile(w.docApi, { ...next, champs: {} }, { log: quiet }), /Aucun changement à enregistrer/);
});

test('saveProfile turns a refusal of the access rules into a clear message, logs the cause and changes nothing', async () => {
  for (const options of [{ denyWrites: ['BDD'] }, { denyRows: { BDD: [1] } }]) {
    const w = await world(options);
    const next = await review(w, 1, { Fonction: 'Cheffe' });
    const { lines, log } = logged();
    await assert.rejects(saveProfile(w.docApi, next, { log }), error => {
      assert.ok(error instanceof ProfileSaveError);
      assert.match(error.message, /^Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche/);
      assert.ok(error.cause instanceof Error, 'l\'erreur d\'origine est gardée');
      return true;
    });
    assert.equal(w.tables.BDD.Fonction[0], 'Pharmacienne');
    assert.match(lines.error[0], /^\[PROFIL\] écriture impossible/);
  }
});

test('saveProfile explains a formula column and any other failure, without the raw Grist message', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe' });
  const failing = message => ({
    fetchTable: w.docApi.fetchTable,
    applyUserActions: async () => { throw new Error(message); }
  });
  await assert.rejects(saveProfile(failing('Cannot modify formula column "Fonction"'), next, { log: quiet }), /colonne à formule/);
  await assert.rejects(saveProfile(failing('boom 500'), next, { log: quiet }), error => {
    assert.match(error.message, /^La modification n'a pas pu être enregistrée\. Réessayez/);
    assert.doesNotMatch(error.message, /boom/);
    return true;
  });
});

test('saveProfile never logs the address of the person, nor the values it writes', async () => {
  const w = await world({ denyWrites: ['BDD'] });
  const next = await review(w, 1, { Fonction: 'Valeur très personnelle' });
  const { lines, log } = logged();
  await assert.rejects(saveProfile(w.docApi, next, { log }));
  const everything = JSON.stringify(lines);
  assert.ok(!everything.includes('@'), 'aucune adresse dans la console');
  assert.ok(!everything.includes('Valeur très personnelle'));
});

test('an administrator saves the fiche of someone else the same way, on that fiche only', async () => {
  const w = await world({ user: { email: 'admin@chu-bordeaux.fr' } });
  await saveProfile(w.docApi, await review(w, 9, { Fonction: 'Directrice générale' }), { log: quiet });
  assert.deepEqual(writes(w).map(call => [call.table, call.rowId]), [['BDD', 9]]);
  assert.equal(w.tables.BDD.Fonction[8], 'Directrice générale');
});

// ===== unsavedLabels =====

test('unsavedLabels is empty when Grist kept everything, and names the fields it did not keep', async () => {
  const w = await world();
  const next = await review(w, 1, { Fonction: 'Cheffe', Competences: [2, 3], Role_dans_le_PUI: 0 });
  await saveProfile(w.docApi, next, { log: quiet });
  assert.deepEqual(unsavedLabels(next, w.row(1), w.referenceMaps), []);
  // Grist a ignoré la fonction et le rôle, et remis la compétence retirée.
  const stubborn = { ...w.row(1), Fonction: 'Pharmacienne', Role_dans_le_PUI: 1, Competences: ['L', 1, 2, 3] };
  assert.deepEqual(unsavedLabels(next, stubborn, w.referenceMaps), ['Fonction', 'Rôle dans le PUI', 'Compétences']);
});

// ===== L'administrateur qui change l'e-mail et l'établissement d'une autre personne =====

test('buildRowUpdate writes the e-mail as a text and the établissement as a row id', async () => {
  const w = await world();
  const change = {
    email: { avant: 'bob@u-bordeaux-montaigne.fr', apres: 'nouveau@u-bordeaux-montaigne.fr' },
    Etablissement: { avant: { id: 2, label: 'UBM' }, apres: { id: 1, label: 'CHU' } }
  };
  assert.deepEqual(buildRowUpdate(change, w.row(2)).values, { email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1 });
  const noColumn = { ...w.row(2) };
  delete noColumn.email;
  assert.match(buildRowUpdate({ email: change.email }, noColumn).error, /E-mail : la colonne email n'existe pas dans BDD/);
});

test('prepareReview for an administrator shows the new address and the new établissement on the card after, and marks them', async () => {
  const w = await world();
  const next = await review(w, 2, { email: ' Nouveau@U-Bordeaux-Montaigne.fr ', Etablissement: 1 }, { admin: true });
  assert.equal(next.admin, true);
  assert.deepEqual(Object.keys(next.champs), ['email', 'Etablissement']);
  assert.equal(next.before.email, 'bob@u-bordeaux-montaigne.fr');
  assert.equal(next.after.email, 'nouveau@u-bordeaux-montaigne.fr');
  assert.equal(next.before.etablissement_label, 'UBM');
  assert.equal(next.after.etablissement_label, 'CHU');
  assert.equal(next.after.etablissement_fondateur, true, 'la carte « après » prend les indicateurs du nouvel établissement');
  assert.deepEqual(next.marks.texts, {
    etab: { before: 'UBM', after: 'CHU' },
    email: { before: 'bob@u-bordeaux-montaigne.fr', after: 'nouveau@u-bordeaux-montaigne.fr' }
  });
  // Le détail des changements dit les noms complets ; la carte, elle, garde les acronymes.
  assert.deepEqual(next.lines.map(line => [line.key, line.before, line.after]), [
    ['email', 'bob@u-bordeaux-montaigne.fr', 'nouveau@u-bordeaux-montaigne.fr'],
    ['Etablissement', 'Université Bordeaux Montaigne', 'CHU de Bordeaux']
  ]);
  assert.deepEqual(writes(w), []);
});

test('prepareReview says that a fiche moved to an établissement that has not validated its presence leaves the directory', async () => {
  const w = await world();
  const before = await review(w, 1, { Fonction: 'Cheffe' });
  assert.equal(before.visibility.visible, true);
  // INSERM (id 4) n'a pas validé sa présence : Ana disparaîtrait de l'annuaire.
  const moved = await review(w, 1, { Etablissement: 4 }, { admin: true });
  assert.equal(moved.visibility.visible, false);
  assert.equal(moved.visibility.etablissement, 'not_validated');
  // Un partenaire validé : Bob reste visible, mais seulement avec l'interrupteur Partenaires.
  const partner = await review(w, 1, { Etablissement: 2 }, { admin: true });
  assert.deepEqual([partner.visibility.visible, partner.visibility.partnerOnly], [true, true]);
});

test('prepareReview refuses an address that another fiche already holds, whatever its case, even when the form did not know', async () => {
  const w = await world();
  await assert.rejects(review(w, 2, { email: 'ANA.MARTIN@chu-bordeaux.fr' }, { admin: true }),
    error => error instanceof ProfileSaveError && /rien à relire/.test(error.message));
  // Le formulaire ne connaissait pas cette adresse : c'est la relecture de Grist qui la voit.
  const { row, draft } = w.form(2, { admin: true });
  w.tables.BDD.email[3] = 'libre@exemple.fr'; // Dan
  await assert.rejects(prepareReview(w.docApi, row, { ...draft, email: 'libre@exemple.fr' }, { ...w.context, admin: true }), /rien à relire/);
  assert.deepEqual(writes(w), []);
  assert.equal((await review(w, 2, { email: 'encore.libre@exemple.fr' }, { admin: true })).after.email, 'encore.libre@exemple.fr');
});

test('prepareReview does not read the e-mail or the établissement of a draft unless an administrator is at work', async () => {
  const w = await world();
  const { row, draft } = w.form(2);
  await assert.rejects(prepareReview(w.docApi, row, { ...draft, email: 'intrus@exemple.fr', Etablissement: 1 }, w.context),
    error => error instanceof ProfileSaveError && /rien à relire/.test(error.message), 'rien d\'autre n\'est modifié : rien à relire');
  const beside = await prepareReview(w.docApi, row, { ...draft, email: 'intrus@exemple.fr', Etablissement: 1, Fonction: 'Chef' }, w.context);
  assert.deepEqual(Object.keys(beside.champs), ['Fonction'], 'ces deux champs sont écartés, le reste passe');
  assert.equal(beside.admin, false);
  assert.equal(beside.after.email, 'bob@u-bordeaux-montaigne.fr');
});

test('saveProfile writes the e-mail and the établissement beside the other columns in one single UpdateRecord', async () => {
  const w = await world();
  const next = await review(w, 2, { email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1, Fonction: 'Chef' }, { admin: true });
  const result = await saveProfile(w.docApi, next, { log: quiet });
  assert.equal(result.status, 'saved');
  assert.deepEqual(writes(w), [{
    action: 'UpdateRecord', table: 'BDD', rowId: 2, ok: true,
    values: { email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1, Fonction: 'Chef' }
  }]);
  assert.equal(w.tables.BDD.email[1], 'nouveau@u-bordeaux-montaigne.fr');
  assert.equal(w.tables.BDD.Etablissement[1], 1);
});

test('saveProfile refuses an address that another fiche took since the review, and writes nothing', async () => {
  const w = await world();
  const next = await review(w, 2, { email: 'convoite@exemple.fr' }, { admin: true });
  w.tables.BDD.email[3] = 'Convoite@Exemple.fr'; // Dan a pris l'adresse entre-temps (sans toucher à la fiche de Bob)
  await assert.rejects(saveProfile(w.docApi, next, { log: quiet }),
    error => error instanceof ProfileSaveError && /Cette adresse e-mail est maintenant celle d'une autre fiche : rien n'a été modifié/.test(error.message));
  assert.deepEqual(writes(w), []);
});

test('saveProfile gives the review back when somebody changed the e-mail or the établissement since it was read', async () => {
  const w = await world();
  const next = await review(w, 2, { Etablissement: 1 }, { admin: true });
  w.tables.BDD.Etablissement[1] = 4;
  const result = await saveProfile(w.docApi, next, { log: quiet });
  assert.equal(result.status, 'changed', 'la signature couvre l\'établissement');
  assert.deepEqual(writes(w), []);
  const mail = await review(w, 2, { email: 'autre@exemple.fr' }, { admin: true });
  w.tables.BDD.email[1] = 'ailleurs@exemple.fr';
  assert.equal((await saveProfile(w.docApi, mail, { log: quiet })).status, 'changed', 'la signature couvre l\'e-mail');
});

test('saveProfile closed by default: a review that was not prepared for an administrator cannot write the e-mail or the établissement', async () => {
  const w = await world();
  const next = await review(w, 2, { email: 'nouveau@u-bordeaux-montaigne.fr' }, { admin: true });
  for (const admin of [false, undefined, 'oui', 1]) {
    await assert.rejects(saveProfile(w.docApi, { ...next, admin }, { log: quiet }),
      error => error instanceof ProfileSaveError && /réservés à un administrateur/.test(error.message), JSON.stringify(admin));
  }
  const { admin, ...unmarked } = next;
  await assert.rejects(saveProfile(w.docApi, unmarked, { log: quiet }), /réservés à un administrateur/);
  assert.deepEqual(writes(w), []);
});

test('unsavedLabels notices an e-mail or an établissement that Grist did not keep', async () => {
  const w = await world();
  const next = await review(w, 2, { email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1 }, { admin: true });
  assert.deepEqual(unsavedLabels(next, w.row(2), w.referenceMaps), ['E-mail', 'Établissement']);
  await saveProfile(w.docApi, next, { log: quiet });
  const saved = tableToRows(w.tables.BDD).find(candidate => candidate.id === 2);
  assert.deepEqual(unsavedLabels(next, saved, w.referenceMaps), []);
  assert.deepEqual(unsavedLabels(next, { ...saved, Etablissement: 4 }, w.referenceMaps), ['Établissement']);
});

// ===== La photo de profil (colonne Avatar de BDD, pièce jointe) =====

// Ana a la photo 501, Bob la 502, Hostile le fichier 998 ; Dan (4), Hugo (10) et les autres n'en ont pas.
const avatarWorld = (options = {}) => world({ tables: withSchema(withIdentity(withAvatars())), ...options });

// Une photo que le formulaire vient de préparer (image-prep.js), telle que le brouillon la porte.
const photo = () => ({ blob: new Blob(['jpeg']), name: 'photo-de-profil.jpg', width: 256, height: 256, url: 'blob:http://widget/photo-1' });

// L'envoi simulé de upload.js : garde ce qu'on lui donne et ce que Grist avait déjà reçu à ce moment-là
// (`writesBefore`), rend l'identifiant 2000 ou échoue avec `fail`. `during` : ce qui arrive dans
// le document pendant l'envoi (quelqu'un d'autre modifie la fiche).
function uploader(w, { id = 2000, fail = null, during = null } = {}) {
  const sent = [];
  const upload = async file => {
    sent.push({ file, writesBefore: writes(w).length });
    during?.();
    if (fail) throw fail;
    return id;
  };
  return { upload, sent };
}

test('buildRowUpdate leaves the photo for after its upload, and refuses a column that is not a column of attachments', async () => {
  const w = await avatarWorld();
  const change = { Avatar: { action: 'replace', avant: 501 } };
  assert.deepEqual(buildRowUpdate(change, w.row(1), { Avatar: 'Attachments' }), { values: {} }, 'son identifiant n\'existe pas encore');
  assert.deepEqual(buildRowUpdate(change, w.row(1), {}), { values: {} }, 'type inconnu : on suit la cellule');
  assert.deepEqual(buildRowUpdate({ Avatar: { action: 'remove', avant: 501 }, Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' } }, w.row(1), { Avatar: 'Attachments' }).values,
    { Fonction: 'Cheffe' }, 'la photo n\'est jamais dans les valeurs de buildRowUpdate');
  assert.match(buildRowUpdate(change, w.row(1), { Avatar: 'Text' }).error, /Photo de profil : la colonne Avatar n'est pas une colonne de pièces jointes/);
  const { Avatar: _omitted, ...withoutAvatar } = w.row(1);
  assert.match(buildRowUpdate(change, withoutAvatar, { Avatar: 'Attachments' }).error, /Photo de profil : la colonne Avatar n'existe pas dans BDD/);
});

test('prepareReview of a new photo keeps the file for the upload, shows it on the card after and marks it', async () => {
  const w = await avatarWorld();
  const chosen = photo();
  const next = await review(w, 1, { Avatar: chosen });
  assert.deepEqual(next.champs, { Avatar: { action: 'replace', avant: 501 } });
  assert.equal(next.file, chosen, 'le fichier part tel quel à l\'enregistrement');
  assert.equal(next.before.Avatar.at(-1), 501);
  assert.equal(next.before.avatarUrl, undefined);
  assert.equal(next.after.avatarUrl, 'blob:http://widget/photo-1', 'la carte « après » montre l\'image préparée, pas encore dans Grist');
  assert.deepEqual(next.marks.avatar, { before: 501, after: 'replace' });
  assert.deepEqual(next.lines, [{ key: 'Avatar', label: 'Photo de profil', kind: 'image', before: 501, after: 'replace' }]);
  assert.equal(next.notice, '');
  assert.equal(next.columnTypes.Avatar, 'Attachments');
  assert.deepEqual(writes(w), [], 'la relecture n\'écrit rien');
  assert.equal(w.tables.BDD.Avatar[0].at(-1), 501);
});

test('prepareReview of a first photo and of a removal: the card after has the new photo, or only the initials', async () => {
  const w = await avatarWorld();
  const first = await review(w, 9, { Avatar: photo() });
  assert.deepEqual(first.champs, { Avatar: { action: 'replace', avant: 0 } });
  assert.deepEqual(first.marks.avatar, { before: 0, after: 'replace' });
  assert.equal(first.after.avatarUrl, 'blob:http://widget/photo-1');

  const removal = await review(w, 1, { Avatar: 0 });
  assert.deepEqual(removal.champs, { Avatar: { action: 'remove', avant: 501 } });
  assert.equal(removal.file, null, 'rien à envoyer pour retirer une photo');
  assert.deepEqual(removal.after.Avatar, ['L'], 'la carte « après » n\'a plus que les initiales');
  assert.equal(removal.after.avatarUrl, undefined);
  assert.deepEqual(removal.marks.avatar, { before: 501, after: 'remove' });
  assert.deepEqual(removal.lines.map(line => [line.key, line.before, line.after]), [['Avatar', 501, 'remove']]);
});

test('prepareReview refuses a photo that is not the one of the form: another attachment, a missing file, nothing to remove', async () => {
  const w = await avatarWorld();
  for (const [id, input] of [[1, 502], [1, { url: 'blob:x' }], [1, { blob: new Blob([]), name: 'x.jpg' }], [9, 502], [9, 0], [1, 501]]) {
    await assert.rejects(review(w, id, { Avatar: input }), error => error instanceof ProfileSaveError && /rien à relire/.test(error.message),
      `${id} : ${JSON.stringify(input)}`);
  }
  assert.deepEqual(writes(w), []);
});

test('prepareReview names the photo in the notice when somebody else changed it since the form was opened', async () => {
  const w = await avatarWorld();
  const { row, draft } = w.form(1);
  w.tables.BDD.Avatar[0] = ['L', 502];
  const next = await prepareReview(w.docApi, row, { ...draft, Avatar: photo() }, w.context);
  assert.deepEqual(next.champs.Avatar, { action: 'replace', avant: 502 }, 'la photo d\'aujourd\'hui');
  assert.deepEqual(next.marks.avatar, { before: 502, after: 'replace' });
  assert.match(next.notice, /ont changé dans Grist depuis l'ouverture de la fenêtre : Photo de profil\./);
  // Retirée par quelqu'un d'autre : il n'y a plus rien à retirer.
  const gone = await avatarWorld();
  const form = gone.form(1);
  gone.tables.BDD.Avatar[0] = ['L'];
  await assert.rejects(prepareReview(gone.docApi, form.row, { ...form.draft, Avatar: 0 }, gone.context), /déjà dans la fiche/);
});

test('prepareReview refuses a photo when the Avatar column is not a column of attachments, or does not exist', async () => {
  const tables = withSchema(withIdentity(withAvatars()));
  const column = tables._grist_Tables_column.colId.indexOf('Avatar');
  tables._grist_Tables_column.type[column] = 'Text';
  const text = await world({ tables });
  await assert.rejects(review(text, 1, { Avatar: photo() }),
    error => error instanceof ProfileSaveError && /Photo de profil : la colonne Avatar n'est pas une colonne de pièces jointes/.test(error.message));

  const plain = await world();
  const { row, draft } = plain.form(1);
  assert.equal('Avatar' in draft, false, 'sans colonne, le formulaire n\'offre pas de photo');
  await assert.rejects(prepareReview(plain.docApi, row, { ...draft, Avatar: photo() }, plain.context),
    error => error instanceof ProfileSaveError && /rien à relire/.test(error.message), 'seule la photo : rien à relire');
  const beside = await prepareReview(plain.docApi, row, { ...draft, Avatar: photo(), Fonction: 'Cheffe' }, plain.context);
  assert.deepEqual(Object.keys(beside.champs), ['Fonction'], 'le reste du brouillon passe : seule la photo est écartée');
  assert.equal(beside.file, null);
});

test('saveProfile uploads the photo AFTER its checks and writes its attachment in the same UpdateRecord as the other columns', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo(), Fonction: 'Cheffe de service' });
  const { upload, sent } = uploader(w);
  const result = await saveProfile(w.docApi, next, { upload, log: quiet });
  assert.equal(result.status, 'saved');
  assert.equal(result.attachmentId, 2000);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].file, next.file, 'le fichier de la relecture, tel quel');
  assert.equal(sent[0].writesBefore, 0, 'rien n\'est écrit avant l\'envoi');
  assert.deepEqual(writes(w), [{
    action: 'UpdateRecord', table: 'BDD', rowId: 1, ok: true,
    values: { Fonction: 'Cheffe de service', Avatar: ['L', 2000] }
  }]);
  assert.deepEqual(w.tables.BDD.Avatar[0], ['L', 2000]);
  assert.equal(w.tables.BDD.Avatar[1].at(-1), 502, 'la photo d\'une autre fiche n\'est pas touchée');
  assert.deepEqual(unsavedLabels(next, tableToRows(w.tables.BDD)[0], w.referenceMaps, { attachmentId: result.attachmentId }), []);
});

test('saveProfile removes a photo with an empty list, without uploading anything', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: 0 });
  const { upload, sent } = uploader(w);
  const result = await saveProfile(w.docApi, next, { upload, log: quiet });
  assert.equal(result.status, 'saved');
  assert.equal(result.attachmentId, null);
  assert.deepEqual(sent, []);
  assert.deepEqual(writes(w).map(call => call.values), [{ Avatar: ['L'] }]);
  assert.deepEqual(w.tables.BDD.Avatar[0], ['L']);
  // Sans fonction d'envoi, retirer une photo marche aussi : il n'y a rien à envoyer.
  const again = await avatarWorld();
  assert.equal((await saveProfile(again.docApi, await review(again, 2, { Avatar: 0 }), { log: quiet })).status, 'saved');
});

test('saveProfile writes a first photo on a fiche that had none', async () => {
  const w = await avatarWorld();
  const result = await saveProfile(w.docApi, await review(w, 9, { Avatar: photo() }), { upload: uploader(w).upload, log: quiet });
  assert.equal(result.status, 'saved');
  assert.deepEqual(w.tables.BDD.Avatar[w.tables.BDD.id.indexOf(9)], ['L', 2000]);
  // Hugo : une cellule null, comme Grist en donne pour une pièce jointe jamais remplie.
  const hugo = await avatarWorld();
  await saveProfile(hugo.docApi, await review(hugo, 10, { Avatar: photo() }), { upload: uploader(hugo).upload, log: quiet });
  assert.deepEqual(hugo.tables.BDD.Avatar[hugo.tables.BDD.id.indexOf(10)], ['L', 2000]);
});

test('saveProfile asks for the photo again when there is no file or no way to send it, before reading or writing anything', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo() });
  const calls = w.calls.length;
  for (const options of [{ log: quiet }, { upload: 'oui', log: quiet }]) {
    await assert.rejects(saveProfile(w.docApi, next, options),
      error => error instanceof ProfileSaveError && error.message === 'La photo choisie n\'est plus disponible : choisissez-la de nouveau.' && error.leftover === null);
  }
  await assert.rejects(saveProfile(w.docApi, { ...next, file: null }, { upload: uploader(w).upload, log: quiet }), /choisissez-la de nouveau/);
  assert.equal(w.calls.length, calls, 'rien n\'a été lu ni écrit');
});

test('saveProfile uploads nothing when the fiche already changed since the review', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo() });
  w.tables.BDD.Avatar[0] = ['L', 777]; // quelqu'un d'autre a changé la photo après la relecture
  const { upload, sent } = uploader(w);
  const result = await saveProfile(w.docApi, next, { upload, log: quiet });
  assert.equal(result.status, 'changed');
  assert.equal(result.leftover, undefined, 'rien n\'a été envoyé : rien ne traîne');
  assert.deepEqual(sent, []);
  assert.deepEqual(writes(w), []);
});

test('saveProfile writes nothing when the fiche changed during the upload, and names the file that stays in Grist', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo(), Fonction: 'Cheffe' });
  const { upload } = uploader(w, { during: () => { w.tables.BDD.Fonction[0] = 'Directrice'; } });
  const result = await saveProfile(w.docApi, next, { upload, log: quiet });
  assert.equal(result.status, 'changed');
  assert.equal(result.leftover, 2000, 'la photo est dans les pièces jointes du document mais la fiche ne l\'utilise pas');
  assert.equal(result.row.Fonction, 'Directrice');
  assert.deepEqual(writes(w), []);
  assert.deepEqual(w.tables.BDD.Avatar[0], ['L', 501]);
});

test('saveProfile reports the leftover file when the fiche is gone, or the address taken, during the upload', async () => {
  const gone = await avatarWorld();
  const next = await review(gone, 1, { Avatar: photo() });
  const sentGone = uploader(gone, { during: () => Object.keys(gone.tables.BDD).forEach(column => gone.tables.BDD[column].shift()) });
  await assert.rejects(saveProfile(gone.docApi, next, { upload: sentGone.upload, log: quiet }),
    error => error instanceof ProfileSaveError && /n'existe plus dans Grist/.test(error.message) && error.leftover === 2000);

  const taken = await avatarWorld();
  const mail = await review(taken, 2, { email: 'convoite@exemple.fr', Avatar: photo() }, { admin: true });
  const sentTaken = uploader(taken, { during: () => { taken.tables.BDD.email[3] = 'convoite@exemple.fr'; } });
  await assert.rejects(saveProfile(taken.docApi, mail, { upload: sentTaken.upload, log: quiet }),
    error => error instanceof ProfileSaveError && /Cette adresse e-mail est maintenant celle d'une autre fiche/.test(error.message) && error.leftover === 2000);
  assert.deepEqual(writes(taken), []);
});

test('saveProfile gives the message of an upload that failed, writes nothing and leaves nothing behind', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo(), Fonction: 'Cheffe' });
  const { upload } = uploader(w, { fail: new UploadError('Grist a refusé la photo : vos droits ne permettent pas d\'ajouter des pièces jointes. Contactez un administrateur si le problème persiste.') });
  await assert.rejects(saveProfile(w.docApi, next, { upload, log: quiet }), error => {
    assert.ok(error instanceof ProfileSaveError);
    assert.match(error.message, /^Grist a refusé la photo : vos droits ne permettent pas d'ajouter des pièces jointes\. Contactez un administrateur/);
    assert.ok(error.cause instanceof UploadError, 'l\'erreur d\'origine est gardée');
    assert.equal(error.leftover, null);
    return true;
  });
  assert.deepEqual(writes(w), [], 'ni la photo ni le reste de la fiche ne sont écrits');
  assert.equal(w.tables.BDD.Fonction[0], 'Pharmacienne');
});

test('saveProfile says what it can of any other upload failure, logs the cause, and never the raw message', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo() });
  const { lines, log } = logged();
  const { upload } = uploader(w, { fail: new Error('boom 500 pour ana.martin@chu-bordeaux.fr') });
  await assert.rejects(saveProfile(w.docApi, next, { upload, log }), error => {
    assert.match(error.message, /^La modification n'a pas pu être enregistrée\. Réessayez/);
    assert.doesNotMatch(error.message, /boom/);
    return true;
  });
  assert.match(lines.error[0], /^\[PROFIL\] envoi de la photo impossible/);
  assert.deepEqual(writes(w), []);
});

test('saveProfile keeps the uploaded file in the error when the write is refused, so the page can say it stays in Grist', async () => {
  for (const options of [{ denyWrites: ['BDD'] }, { denyRows: { BDD: [1] } }]) {
    const w = await avatarWorld(options);
    const next = await review(w, 1, { Avatar: photo() });
    const { upload } = uploader(w);
    const { lines, log } = logged();
    await assert.rejects(saveProfile(w.docApi, next, { upload, log }), error => {
      assert.ok(error instanceof ProfileSaveError);
      assert.match(error.message, /^Grist a refusé la modification/);
      assert.equal(error.leftover, 2000);
      return true;
    });
    assert.deepEqual(w.tables.BDD.Avatar[0], ['L', 501]);
    assert.match(lines.error[0], /^\[PROFIL\] écriture impossible/);
    assert.ok(!JSON.stringify(lines).includes('@'), 'aucune adresse dans la console');
  }
});

test('saveProfile also refuses, after the upload, a review whose column cannot take a photo, and names the leftover file', async () => {
  const w = await avatarWorld();
  const next = await review(w, 1, { Avatar: photo() });
  await assert.rejects(saveProfile(w.docApi, { ...next, columnTypes: { Avatar: 'Text' } }, { upload: uploader(w).upload, log: quiet }),
    error => error instanceof ProfileSaveError && /n'est pas une colonne de pièces jointes/.test(error.message) && error.leftover === 2000);
  assert.deepEqual(writes(w), []);
});

test('an administrator replaces or removes the photo of someone else, on that fiche only', async () => {
  const w = await avatarWorld({ user: { email: 'admin@chu-bordeaux.fr' } });
  await saveProfile(w.docApi, await review(w, 2, { Avatar: photo() }, { admin: true }), { upload: uploader(w).upload, log: quiet });
  await saveProfile(w.docApi, await review(w, 1, { Avatar: 0 }, { admin: true }), { log: quiet });
  assert.deepEqual(writes(w).map(call => [call.rowId, call.values]), [[2, { Avatar: ['L', 2000] }], [1, { Avatar: ['L'] }]]);
});

test('unsavedLabels notices a photo that Grist did not keep, or kept under another attachment', async () => {
  const w = await avatarWorld();
  const replacing = await review(w, 1, { Avatar: photo(), Fonction: 'Cheffe' });
  assert.deepEqual(unsavedLabels(replacing, w.row(1), w.referenceMaps, { attachmentId: 2000 }), ['Photo de profil', 'Fonction']);
  const saved = { ...w.row(1), Fonction: 'Cheffe', Avatar: ['L', 2000] };
  assert.deepEqual(unsavedLabels(replacing, saved, w.referenceMaps, { attachmentId: 2000 }), []);
  assert.deepEqual(unsavedLabels(replacing, { ...saved, Avatar: ['L', 501] }, w.referenceMaps, { attachmentId: 2000 }), ['Photo de profil']);
  assert.deepEqual(unsavedLabels(replacing, saved, w.referenceMaps), ['Photo de profil'], 'sans identifiant envoyé, la photo n\'est pas enregistrée');

  const removing = await review(w, 1, { Avatar: 0 });
  assert.deepEqual(unsavedLabels(removing, w.row(1), w.referenceMaps), ['Photo de profil'], 'Grist a gardé la photo');
  assert.deepEqual(unsavedLabels(removing, { ...w.row(1), Avatar: ['L'] }, w.referenceMaps), []);
  assert.deepEqual(unsavedLabels(removing, { ...w.row(1), Avatar: null }, w.referenceMaps), [], 'une cellule vide : la photo est retirée');
});
