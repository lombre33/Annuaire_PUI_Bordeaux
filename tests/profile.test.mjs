import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  profileFormModel, diffProfile, summarizeChanges, cleanText, frenchPhoneDigits, textFault, MAX_TEXT_LENGTH,
  draftOf, draftFromChanges
} from '../profile.js';
import { parseChanges } from '../requests.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { sampleTables, withoutOptionalColumns } from './fixtures.mjs';

// ===== profile : ce qu'on peut changer sur sa fiche, et ce qu'on propose =====

const quiet = { info() {}, warn() {} };

async function setup(tables = sampleTables()) {
  const { referenceMaps } = await loadDirectory(createFakeGrist({ tables }).docApi, { log: quiet });
  const rows = tableToRows(tables.BDD);
  return { referenceMaps, row: id => rows.find(candidate => candidate.id === id) };
}

const field = (model, key) => model.find(entry => entry.key === key);

test('profileFormModel offers every editable column with the current value of the row', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps); // Ana
  assert.deepEqual(model.map(entry => entry.key),
    ['prenom', 'nom', 'Fonction', 'numero_de_telephone', 'Role_dans_le_PUI', 'Instances', 'Actions', 'GT', 'Competences', 'Communautes', 'Taches']);
  assert.equal(field(model, 'Fonction').value, 'Pharmacienne');
  assert.equal(field(model, 'numero_de_telephone').value, '05 56 78 90 12', 'le 0 perdu par le type Numeric est rétabli');
  assert.equal(field(model, 'Role_dans_le_PUI').value, 1);
  assert.deepEqual(field(model, 'Competences').value, [1, 2]);
});

test('profileFormModel shows 0 for a person without role, never a missing value', async () => {
  const { referenceMaps, row } = await setup();
  assert.equal(field(profileFormModel(row(2), referenceMaps), 'Role_dans_le_PUI').value, 0);
});

test('profileFormModel lists the options of each reference sorted by label, and never offers email, Etablissement, perimetre or consent', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(field(model, 'Competences').options.map(option => option.label), ['Divers', 'Hématologie', 'Oncologie', 'Pharmacovigilance']);
  assert.deepEqual(field(model, 'Role_dans_le_PUI').options, [{ id: 1, label: 'Référent qualité' }]);
  for (const forbidden of ['email', 'Etablissement', 'perimetre', 'Accepte_apparaitre', 'Avatar']) {
    assert.equal(field(model, forbidden), undefined, forbidden);
  }
});

test('profileFormModel shows only the values it can name: a row without label stays out of the form', async () => {
  const { referenceMaps, row } = await setup();
  const hugo = profileFormModel(row(10), referenceMaps); // Instances ['L', 999]
  assert.deepEqual(field(hugo, 'Instances').value, []);
});

test('profileFormModel leaves out the optional columns BDD does not have', async () => {
  const tables = withoutOptionalColumns(sampleTables());
  const { referenceMaps, row } = await setup(tables);
  const keys = profileFormModel(row(1), referenceMaps).map(entry => entry.key);
  assert.ok(!keys.includes('numero_de_telephone') && !keys.includes('Role_dans_le_PUI'));
  assert.ok(keys.includes('Fonction'));
});

test('diffProfile finds no change when the draft is the current form', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(diffProfile(row(1), draftOf(model), referenceMaps), { champs: {}, errors: [], fieldErrors: {}, summary: '' });
});

test('diffProfile records old and new value of a text field, with a readable summary', async () => {
  const { referenceMaps, row } = await setup();
  const result = diffProfile(row(1), { Fonction: 'Cheffe de service' }, referenceMaps);
  assert.deepEqual(result.champs, { Fonction: { avant: 'Pharmacienne', apres: 'Cheffe de service' } });
  assert.equal(result.summary, 'Fonction : « Pharmacienne » → « Cheffe de service »');
  assert.deepEqual(result.errors, []);
});

test('diffProfile cleans typed text: spaces, line breaks and control characters', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Fonction: '  Cheffe \n de\tservice\u0000 ' }, referenceMaps);
  assert.equal(champs.Fonction.apres, 'Cheffe de service');
});

test('diffProfile does not turn an untouched value into a change, even a messy one', async () => {
  const tables = sampleTables();
  tables.BDD.Fonction[0] = 'Pharmacienne  chef';
  tables.BDD.numero_de_telephone[0] = 'poste 1234';
  const { referenceMaps, row } = await setup(tables);
  const result = diffProfile(row(1), { Fonction: 'Pharmacienne  chef', numero_de_telephone: 'poste 1234' }, referenceMaps);
  assert.deepEqual(result, { champs: {}, errors: [], fieldErrors: {}, summary: '' });
});

test('diffProfile refuses text that a spreadsheet would read as a formula, and text that is too long', async () => {
  const { referenceMaps, row } = await setup();
  for (const bad of ['=SOMME(A1)', '+33 cmd', '-2+3', '@admin']) {
    const result = diffProfile(row(1), { Fonction: bad }, referenceMaps);
    assert.deepEqual(result.champs, {}, bad);
    assert.match(result.errors[0], /Fonction : ne peut pas commencer par = \+ - ou @\./);
  }
  const long = diffProfile(row(1), { Fonction: 'x'.repeat(MAX_TEXT_LENGTH + 1) }, referenceMaps);
  assert.match(long.errors[0], /200 caractères au plus/);
  assert.deepEqual(diffProfile(row(1), { Fonction: 'x'.repeat(MAX_TEXT_LENGTH) }, referenceMaps).errors, []);
});

test('diffProfile accepts a French phone number in any usual writing and stores its canonical form', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { numero_de_telephone: '+33 5 56 78 90 13' }, referenceMaps);
  assert.deepEqual(champs, { numero_de_telephone: { avant: '0556789012', apres: '0556789013' } });
  assert.deepEqual(diffProfile(row(1), { numero_de_telephone: '05.56.78.90.12' }, referenceMaps).champs, {},
    'le même numéro écrit autrement n\'est pas un changement');
});

test('diffProfile refuses a phone number that is not a French 10-digit number, and lets one clear the field', async () => {
  const { referenceMaps, row } = await setup();
  for (const bad of ['12345', '+44 7700 900123', 'appelez-moi', '05 56 78 90']) {
    const result = diffProfile(row(1), { numero_de_telephone: bad }, referenceMaps);
    assert.deepEqual(result.champs, {}, bad);
    assert.match(result.errors[0], /Téléphone : un numéro français à 10 chiffres est attendu/);
  }
  const cleared = diffProfile(row(1), { numero_de_telephone: '' }, referenceMaps);
  assert.deepEqual(cleared.champs, { numero_de_telephone: { avant: '0556789012', apres: '' } });
});

test('diffProfile handles a reference: change, removal, and an id the table does not know', async () => {
  const { referenceMaps, row } = await setup();
  const removal = diffProfile(row(1), { Role_dans_le_PUI: 0 }, referenceMaps);
  assert.deepEqual(removal.champs, { Role_dans_le_PUI: { avant: { id: 1, label: 'Référent qualité' }, apres: { id: 0, label: '' } } });
  assert.equal(removal.summary, 'Rôle PUI : « Référent qualité » → (vide)');
  const unknown = diffProfile(row(1), { Role_dans_le_PUI: 99 }, referenceMaps);
  assert.deepEqual(unknown.champs, {});
  assert.match(unknown.errors[0], /Rôle PUI : valeur inconnue/);
  assert.deepEqual(diffProfile(row(2), { Role_dans_le_PUI: 1 }, referenceMaps).champs.Role_dans_le_PUI.avant, { id: 0, label: '' });
});

test('diffProfile records a list as values to add and values to remove', async () => {
  const { referenceMaps, row } = await setup();
  const { champs, summary } = diffProfile(row(1), { Competences: [2, 3] }, referenceMaps); // Ana : 1, 2
  assert.deepEqual(champs.Competences, {
    ajout: [{ id: 3, label: 'Pharmacovigilance' }],
    retrait: [{ id: 1, label: 'Oncologie' }]
  });
  assert.equal(summary, 'Compétences : +Pharmacovigilance, −Oncologie');
});

test('diffProfile treats a reordered list as unchanged, and an unknown id as an error', async () => {
  const { referenceMaps, row } = await setup();
  assert.deepEqual(diffProfile(row(1), { Competences: [2, 1] }, referenceMaps).champs, {});
  const unknown = diffProfile(row(1), { Competences: [1, 2, 404] }, referenceMaps);
  assert.deepEqual(unknown.champs, {});
  assert.match(unknown.errors[0], /Compétences : valeur inconnue/);
});

test('diffProfile never removes a value the form could not show', async () => {
  const { referenceMaps, row } = await setup();
  // Hugo a l'instance 999, que la table Instances ne nomme pas : il en ajoute une autre.
  const { champs } = diffProfile(row(10), { Instances: [1] }, referenceMaps);
  assert.deepEqual(champs.Instances, { ajout: [{ id: 1, label: 'CME' }], retrait: [] });
});

test('diffProfile keeps at least a first or a last name', async () => {
  const { referenceMaps, row } = await setup();
  const both = diffProfile(row(1), { prenom: '', nom: '  ' }, referenceMaps);
  assert.match(both.errors.at(-1), /au moins un prénom ou un nom/);
  const one = diffProfile(row(1), { prenom: '' }, referenceMaps);
  assert.deepEqual(one.errors, []);
  assert.equal(one.champs.prenom.apres, '');
});

test('diffProfile ignores a field the draft does not mention and a column the row does not have', async () => {
  const tables = withoutOptionalColumns(sampleTables());
  const { referenceMaps, row } = await setup(tables);
  assert.deepEqual(diffProfile(row(1), { numero_de_telephone: '0102030405' }, referenceMaps).champs, {});
  assert.deepEqual(diffProfile(row(1), {}, referenceMaps).champs, {});
});

test('diffProfile reads a cleaned text equal to the stored one as no change', async () => {
  const { referenceMaps, row } = await setup();
  for (const typed of ['Pharmacienne ', '  Pharmacienne', 'Pharmacienne\n', 'Pharma\tcienne'.replace('\t', '')]) {
    assert.deepEqual(diffProfile(row(1), { Fonction: typed }, referenceMaps).champs, {}, JSON.stringify(typed));
  }
});

test('diffProfile counts a repeated id of the draft once', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Competences: [2, 3, 3] }, referenceMaps);
  assert.deepEqual(champs.Competences.ajout, [{ id: 3, label: 'Pharmacovigilance' }]);
});

test('diffProfile refuses a draft of the wrong type instead of reading it as "none" or "empty"', async () => {
  const { referenceMaps, row } = await setup();
  for (const wrong of ['1', '', null, 1.5, -1, NaN, [1], {}]) {
    const result = diffProfile(row(1), { Role_dans_le_PUI: wrong }, referenceMaps);
    assert.deepEqual(result.champs, {}, `référence ${JSON.stringify(wrong)}`);
    assert.match(result.errors.join(' '), /Rôle PUI : valeur illisible/, `référence ${JSON.stringify(wrong)}`);
  }
  for (const wrong of ['1', '', null, 1, {}, [1, '2'], [1, null], [1.5], [NaN]]) {
    const result = diffProfile(row(1), { Competences: wrong }, referenceMaps);
    assert.deepEqual(result.champs, {}, `liste ${JSON.stringify(wrong)}`);
    assert.match(result.errors.join(' '), /Compétences : valeur illisible/, `liste ${JSON.stringify(wrong)}`);
  }
});

test('diffProfile lets a row that has no name yet change something else, or get its first name', async () => {
  const { referenceMaps, row } = await setup();
  const nameless = { ...row(1), prenom: '', nom: '' };
  assert.deepEqual(diffProfile(nameless, { Fonction: 'Cheffe' }, referenceMaps).errors, []);
  const blank = diffProfile(nameless, { prenom: ' ' }, referenceMaps);
  assert.deepEqual([blank.champs, blank.errors], [{}, []], 'un nom vide laissé vide n\'est pas un changement');
  const named = diffProfile(nameless, { prenom: 'Ana' }, referenceMaps);
  assert.deepEqual(named.errors, []);
  assert.deepEqual(named.champs.prenom, { avant: '', apres: 'Ana' });
});

test('diffProfile reports each refusal against its own field', async () => {
  const { referenceMaps, row } = await setup();
  const result = diffProfile(row(1), {
    Fonction: '=1+1', numero_de_telephone: '12', Role_dans_le_PUI: 99, Competences: [404], Instances: 'x'
  }, referenceMaps);
  assert.deepEqual(Object.keys(result.fieldErrors).sort(), ['Competences', 'Fonction', 'Instances', 'Role_dans_le_PUI', 'numero_de_telephone']);
  assert.equal(result.fieldErrors.Fonction, 'ne peut pas commencer par = + - ou @.');
  assert.match(result.fieldErrors.numero_de_telephone, /^un numéro français à 10 chiffres est attendu/);
  assert.equal(result.errors.length, 5);
  assert.ok(result.errors.every(message => /^[^:]+ : /.test(message)), 'chaque phrase nomme son champ');
  const nameless = diffProfile({ ...row(1), nom: '' }, { prenom: '' }, referenceMaps);
  assert.deepEqual(nameless.fieldErrors, { prenom: 'Indiquez au moins un prénom ou un nom.' });
});

test('draftOf copies the form values, lists included', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  const draft = draftOf(model);
  assert.equal(draft.Fonction, 'Pharmacienne');
  assert.deepEqual(draft.Competences, [1, 2]);
  draft.Competences.push(3);
  assert.deepEqual(field(model, 'Competences').value, [1, 2], 'le modèle n\'est pas modifié par le brouillon');
});

test('draftFromChanges starts from the row of today and puts a pending request over it', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  const parsed = parseChanges(JSON.stringify({
    v: 1,
    champs: {
      Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' },
      numero_de_telephone: { avant: '0556789012', apres: '0556789013' },
      Role_dans_le_PUI: { avant: { id: 1 }, apres: { id: 0 } },
      Competences: { ajout: [{ id: 3 }], retrait: [{ id: 1 }] }
    }
  }), referenceMaps);
  const draft = draftFromChanges(model, parsed.champs);
  assert.equal(draft.Fonction, 'Cheffe');
  assert.equal(draft.numero_de_telephone, '05 56 78 90 13');
  assert.equal(draft.Role_dans_le_PUI, 0);
  assert.deepEqual(draft.Competences, [2, 3]);
  assert.equal(draft.prenom, 'Ana', 'ce que la demande ne touche pas reste comme sur la fiche');
  assert.deepEqual(field(model, 'Competences').value, [1, 2], 'le modèle n\'est pas modifié');
  // Reprendre une demande puis la comparer à la fiche redonne les mêmes changements.
  assert.deepEqual(diffProfile(row(1), draft, referenceMaps).champs, {
    Fonction: parsed.champs.Fonction,
    numero_de_telephone: parsed.champs.numero_de_telephone,
    Role_dans_le_PUI: parsed.champs.Role_dans_le_PUI,
    Competences: { ajout: [{ id: 3, label: 'Pharmacovigilance' }], retrait: [{ id: 1, label: 'Oncologie' }] }
  });
});

test('draftFromChanges keeps what another person added to the row since the request, and does not add twice', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps); // Compétences 1, 2
  const draft = draftFromChanges(model, { Competences: { ajout: [{ id: 2, label: '' }, { id: 3, label: '' }, { id: 404, label: '' }], retrait: [{ id: 99, label: '' }] } });
  assert.deepEqual(draft.Competences, [1, 2, 3], 'une valeur que la table ne propose plus est laissée de côté');
  assert.deepEqual(draftFromChanges(model, {}), draftOf(model));
  assert.deepEqual(draftFromChanges(model), draftOf(model));
});

test('summarizeChanges writes one line per field in form order', () => {
  const summary = summarizeChanges({
    Fonction: { avant: '', apres: 'Cheffe' },
    prenom: { avant: 'Ana', apres: 'Anna' },
    Instances: { ajout: [{ id: 9, label: '' }], retrait: [] }
  });
  assert.equal(summary, 'Prénom : « Ana » → « Anna » ; Fonction : (vide) → « Cheffe » ; Instances : +n° 9');
});

test('cleanText, textFault and frenchPhoneDigits on the awkward cases', () => {
  assert.equal(cleanText(null), '');
  assert.equal(cleanText('a\u0007b'), 'a b');
  assert.equal(textFault('Ana'), '');
  assert.equal(textFault('=1+1'), 'ne peut pas commencer par = + - ou @');
  const accepted = ['0556789012', '05 56 78 90 12', '05.56.78.90.12', '05-56-78-90-12', '+33 5 56 78 90 12', '+33 (0)5 56 78 90 12', '0033 5 56 78 90 12'];
  accepted.forEach(input => assert.equal(frenchPhoneDigits(input), '0556789012', input));
  ['', '556789012', '33 5 56 78 90 12', '+44 7700 900123', '05 56 78 90 123', '0556789012x', null,
    '0033 0 56 78 90 12', '0033 5 56 78 90', '+33 0 56 78 90 12', '+33 5 56 78 90'].forEach(input =>
    assert.equal(frenchPhoneDigits(input), null, String(input)));
});
