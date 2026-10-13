import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  profileFormModel, diffProfile, cleanText, frenchPhoneDigits, textFault, MAX_TEXT_LENGTH,
  draftOf, rightsFor, rebaseChanges, describeChanges, blankFiche, NAME_REQUIRED, ETABLISSEMENT_REQUIRED
} from '../profile.js';
import { buildRowUpdate } from '../profile-save.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { sampleTables, withAvatars, withoutOptionalColumns, withTaskActions, withShownEmail, BOB_SHOWN_EMAIL, NEW_EMAIL } from './fixtures.mjs';

// ===== profile : qui peut modifier une fiche, ce qu'on peut y changer, et ce qui change =====

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

test('profileFormModel tells the category of each reference and list field, and none for a text field', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  assert.equal(field(model, 'Competences').category, 'competences');
  assert.equal(field(model, 'Role_dans_le_PUI').category, 'role');
  assert.ok(!('category' in field(model, 'Fonction')));
});

test('profileFormModel shows 0 for a person without role, never a missing value', async () => {
  const { referenceMaps, row } = await setup();
  assert.equal(field(profileFormModel(row(2), referenceMaps), 'Role_dans_le_PUI').value, 0);
});

test('profileFormModel lists the options of each reference sorted by label, and never offers email, Etablissement, perimetre or consent', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(field(model, 'Instances').options.map(option => option.label), ['CME', 'COVIRIS']);
  assert.deepEqual(field(model, 'Role_dans_le_PUI').options, [{ id: 1, label: 'Référent qualité' }]);
  for (const forbidden of ['email', 'Etablissement', 'perimetre', 'Accepte_apparaitre']) {
    assert.equal(field(model, forbidden), undefined, forbidden);
  }
});

test('profileFormModel groups the competences by domain, the fallback domain last, and leaves other lists ungrouped', async () => {
  const { referenceMaps, row } = await setup();
  const model = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(field(model, 'Competences').options.map(option => [option.group, option.label]), [
    ['Cancérologie', 'Hématologie'],
    ['Cancérologie', 'Oncologie'],
    ['Pharmacie', 'Pharmacovigilance'],
    ['Autres', 'Divers']
  ]);
  assert.ok(field(model, 'Instances').options.every(option => !('group' in option)));
});

test('profileFormModel offers the competences ungrouped when the document has no domain column', async () => {
  const tables = sampleTables();
  delete tables.Competences.Macro_competences;
  const { referenceMaps, row } = await setup(tables);
  const options = field(profileFormModel(row(1), referenceMaps), 'Competences').options;
  assert.deepEqual(options.map(option => option.label), ['Divers', 'Hématologie', 'Oncologie', 'Pharmacovigilance']);
  assert.ok(options.every(option => !('group' in option)));
});

test('profileFormModel groups the tasks by action, « Sans action » last, once the tasks and the actions are numbered', async () => {
  const { referenceMaps, row } = await setup(withTaskActions());
  const model = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(field(model, 'Taches').options.map(option => [option.group, option.label]), [
    ['Action 1 : Vaccination', '1.1 Relecture'],
    ['Action 1 : Vaccination', '1.2 Rappel vaccinal'],
    ['Action 2 : Audit', '2.1 Inspection'],
    ['Sans action', 'Veille']
  ]);
  assert.deepEqual(field(model, 'Taches').value, [1, 3], 'les tâches de la fiche restent cochées, rangées ou non');
  assert.ok(field(model, 'Actions').options.every(option => !('group' in option)), 'la liste des actions reste à plat');
  assert.ok(field(model, 'Competences').options.every(option => option.group), 'les compétences gardent leurs domaines');
});

test('profileFormModel offers the tasks ungrouped when none is tied to an action', async () => {
  const { referenceMaps, row } = await setup();
  assert.deepEqual(field(profileFormModel(row(1), referenceMaps), 'Taches').options, [{ id: 1, label: 'Relecture' }]);

  const tables = withTaskActions();
  tables.Actions.Actions = ['Vaccination', 'Audit']; // des actions sans numéro
  const unnumbered = await setup(tables);
  const options = field(profileFormModel(unnumbered.row(1), unnumbered.referenceMaps), 'Taches').options;
  assert.deepEqual(options.map(option => option.label), ['1.1 Relecture', '1.2 Rappel vaccinal', '2.1 Inspection', 'Veille']);
  assert.ok(options.every(option => !('group' in option)));
});

test('an action never leaks into the changes: champs keep only id and label', async () => {
  const { referenceMaps, row } = await setup(withTaskActions());
  const result = diffProfile(row(1), { Taches: [1, 2, 3] }, referenceMaps);
  assert.deepEqual(result.champs.Taches, { ajout: [{ id: 2, label: '1.2 Rappel vaccinal' }], retrait: [] });
});

test('a group never leaks into the changes: champs keep only id and label', async () => {
  const { referenceMaps, row } = await setup();
  const result = diffProfile(row(1), { Competences: [1, 2, 3] }, referenceMaps);
  assert.deepEqual(result.champs.Competences, { ajout: [{ id: 3, label: 'Pharmacovigilance' }], retrait: [] });
});

// Trois lignes brutes de Taches que la colonne « corrigé » ramène au même libellé (l'une à la casse
// près), et une tâche à part. Ana porte la ligne 2, Bob les lignes 1 et 3, Gina aucune.
function withSameCorrectedLabel() {
  const tables = sampleTables();
  tables.Taches = {
    id: [1, 2, 3, 4],
    Taches: ['Pilotage', 'pilotage/suivi', 'Pilotage / Suivi', 'Veille'],
    Taches_corrige: ['Tâche 1.1 : Pilotage/Suivi', 'Tâche 1.1 : Pilotage/Suivi', 'tâche 1.1 : pilotage/suivi', ''],
    Taches_role: ['', '', '', '']
  };
  tables.BDD.Taches[0] = ['L', 2];
  tables.BDD.Taches[1] = ['L', 1, 3];
  return tables;
}

test('profileFormModel offers one entry per label when several rows read the same, checked whichever row the fiche holds', async () => {
  const { referenceMaps, row } = await setup(withSameCorrectedLabel());
  const taches = field(profileFormModel(row(1), referenceMaps), 'Taches');
  assert.deepEqual(taches.options, [
    { id: 1, label: 'Tâche 1.1 : Pilotage/Suivi', ids: [1, 2, 3] },
    { id: 4, label: 'Veille' }
  ]);
  assert.deepEqual(taches.value, [1], 'Ana porte la ligne 2 : l\'entrée est cochée');
  assert.deepEqual(field(profileFormModel(row(2), referenceMaps), 'Taches').value, [1], 'Bob porte deux lignes : une seule entrée cochée');
  assert.deepEqual(diffProfile(row(1), { Taches: [1] }, referenceMaps).champs, {}, 'rien n\'a changé');
});

test('unchecking an entry that merges several rows removes all of them, and checking it adds one', async () => {
  const { referenceMaps, row } = await setup(withSameCorrectedLabel());
  const merged = { id: 1, label: 'Tâche 1.1 : Pilotage/Suivi', ids: [1, 2, 3] };

  const bob = diffProfile(row(2), { Taches: [4] }, referenceMaps).champs;
  assert.deepEqual(bob.Taches, { ajout: [{ id: 4, label: 'Veille' }], retrait: [merged] });
  assert.deepEqual(buildRowUpdate(bob, row(2)).values, { Taches: ['L', 4] }, 'les lignes 1 et 3 partent ensemble');

  const gina = diffProfile(row(9), { Taches: [1] }, referenceMaps).champs; // aucune ligne portée
  assert.deepEqual(buildRowUpdate(gina, row(9)).values, { Taches: ['L', 1] }, 'une seule ligne ajoutée');

  // Pendant ce temps, la fiche de Gina a pris une autre ligne du même libellé : rien à ajouter, rien à retirer à tort.
  const added = diffProfile(row(9), { Taches: [1] }, referenceMaps).champs;
  const taken = { ...row(9), Taches: ['L', 3] };
  assert.deepEqual(rebaseChanges(added, taken, referenceMaps).champs, {}, 'déjà portée par la ligne 3');
  const removed = diffProfile(row(2), { Taches: [] }, referenceMaps).champs;
  assert.deepEqual(rebaseChanges(removed, { ...row(2), Taches: ['L', 3] }, referenceMaps).champs.Taches.retrait, [merged]);
  assert.deepEqual(rebaseChanges(removed, { ...row(2), Taches: ['L'] }, referenceMaps).champs, {}, 'déjà retirée');
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
  assert.deepEqual(diffProfile(row(1), draftOf(model), referenceMaps), { champs: {}, errors: [], fieldErrors: {} });
});

test('diffProfile records old and new value of a text field', async () => {
  const { referenceMaps, row } = await setup();
  const result = diffProfile(row(1), { Fonction: 'Cheffe de service' }, referenceMaps);
  assert.deepEqual(result.champs, { Fonction: { avant: 'Pharmacienne', apres: 'Cheffe de service' } });
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
  assert.deepEqual(result, { champs: {}, errors: [], fieldErrors: {} });
});

test('diffProfile refuses text that a spreadsheet would read as a formula, and text that is too long', async () => {
  const { referenceMaps, row } = await setup();
  for (const bad of ['=SOMME(A1)', '+33 cmd', '-2+3', '@admin']) {
    const result = diffProfile(row(1), { Fonction: bad }, referenceMaps);
    assert.deepEqual(result.champs, {}, bad);
    assert.match(result.errors[0], /Fonction : Ne peut pas commencer par = \+ - ou @\./);
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
    assert.match(result.errors[0], /Téléphone : Un numéro français compte 10 chiffres, par exemple 05 56 78 90 12\./);
  }
  const cleared = diffProfile(row(1), { numero_de_telephone: '' }, referenceMaps);
  assert.deepEqual(cleared.champs, { numero_de_telephone: { avant: '0556789012', apres: '' } });
});

test('diffProfile handles a reference: change, removal, and an id the table does not know', async () => {
  const { referenceMaps, row } = await setup();
  const removal = diffProfile(row(1), { Role_dans_le_PUI: 0 }, referenceMaps);
  assert.deepEqual(removal.champs, { Role_dans_le_PUI: { avant: { id: 1, label: 'Référent qualité' }, apres: { id: 0, label: '' } } });
  const unknown = diffProfile(row(1), { Role_dans_le_PUI: 99 }, referenceMaps);
  assert.deepEqual(unknown.champs, {});
  assert.match(unknown.errors[0], /Rôle dans le PUI : Valeur inconnue/);
  assert.deepEqual(diffProfile(row(2), { Role_dans_le_PUI: 1 }, referenceMaps).champs.Role_dans_le_PUI.avant, { id: 0, label: '' });
});

test('diffProfile records a list as values to add and values to remove', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Competences: [2, 3] }, referenceMaps); // Ana : 1, 2
  assert.deepEqual(champs.Competences, {
    ajout: [{ id: 3, label: 'Pharmacovigilance' }],
    retrait: [{ id: 1, label: 'Oncologie' }]
  });
});

test('diffProfile treats a reordered list as unchanged, and an unknown id as an error', async () => {
  const { referenceMaps, row } = await setup();
  assert.deepEqual(diffProfile(row(1), { Competences: [2, 1] }, referenceMaps).champs, {});
  const unknown = diffProfile(row(1), { Competences: [1, 2, 404] }, referenceMaps);
  assert.deepEqual(unknown.champs, {});
  assert.match(unknown.errors[0], /Compétences : Valeur inconnue/);
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
    assert.match(result.errors.join(' '), /Rôle dans le PUI : Valeur illisible/, `référence ${JSON.stringify(wrong)}`);
  }
  for (const wrong of ['1', '', null, 1, {}, [1, '2'], [1, null], [1.5], [NaN]]) {
    const result = diffProfile(row(1), { Competences: wrong }, referenceMaps);
    assert.deepEqual(result.champs, {}, `liste ${JSON.stringify(wrong)}`);
    assert.match(result.errors.join(' '), /Compétences : Valeur illisible/, `liste ${JSON.stringify(wrong)}`);
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
  assert.equal(result.fieldErrors.Fonction, 'Ne peut pas commencer par = + - ou @.');
  assert.match(result.fieldErrors.numero_de_telephone, /^Un numéro français compte 10 chiffres/);
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

// ===== rightsFor : qui peut modifier quelle fiche =====

const ready = (email, admin = false) => ({ status: 'ready', email, admin, reason: '' });
const BDD_ROWS = tableToRows(sampleTables().BDD);
const rowOf = id => BDD_ROWS.find(candidate => candidate.id === id);

test('rightsFor lets a person edit their own fiche, whatever the case and spaces of the address', () => {
  const rights = rightsFor(ready(' Ana.Martin@CHU-Bordeaux.FR '));
  assert.equal(rights(rowOf(1)), 'own');
  assert.equal(rights(rowOf(2)), null, 'la fiche d\'une autre personne');
  assert.equal(rights(rowOf(10)), null, 'une fiche sans adresse n\'est la fiche de personne');
});

test('rightsFor lets an administrator edit every fiche once the admin mode is on, and tells her own from the others', () => {
  const rights = rightsFor(ready('ana.martin@chu-bordeaux.fr', true), { adminMode: true });
  assert.equal(rights(rowOf(1)), 'own');
  assert.equal(rights(rowOf(2)), 'admin');
  assert.equal(rights(rowOf(10)), 'admin', 'même une fiche sans adresse');
  assert.equal(rightsFor(ready('admin@chu-bordeaux.fr', true), { adminMode: true })(rowOf(1)), 'admin', 'une administratrice sans fiche');
});

test('rightsFor gives an administrator no more than anybody else while the admin mode is off', () => {
  for (const rights of [rightsFor(ready('ana.martin@chu-bordeaux.fr', true)), rightsFor(ready('ana.martin@chu-bordeaux.fr', true), { adminMode: false }),
    rightsFor(ready('ana.martin@chu-bordeaux.fr', true), {})]) {
    assert.equal(rights(rowOf(1)), 'own', 'sa propre fiche reste modifiable');
    assert.equal(rights(rowOf(2)), null, 'celle d\'un autre ne l\'est pas sans le mode admin');
    assert.equal(rights(rowOf(10)), null);
  }
  assert.equal(rightsFor(ready('admin@chu-bordeaux.fr', true))(rowOf(1)), null, 'une administratrice sans fiche n\'a rien à modifier');
});

test('rightsFor never grants the admin right for an admin mode that is not exactly true, or to somebody who is not an administrator', () => {
  for (const adminMode of [1, 'true', 'oui', {}, [], null, undefined]) {
    assert.equal(rightsFor(ready('ana.martin@chu-bordeaux.fr', true), { adminMode })(rowOf(2)), null, JSON.stringify(adminMode));
  }
  assert.equal(rightsFor(ready('ana.martin@chu-bordeaux.fr', false), { adminMode: true })(rowOf(2)), null, 'le mode ne fait pas un administrateur');
  assert.equal(rightsFor(ready('ana.martin@chu-bordeaux.fr', false), { adminMode: true })(rowOf(1)), 'own');
});

test('rightsFor is closed by default: no reliable identity, no right, administrator flag or not', () => {
  const hostile = { email: 'ana.martin@chu-bordeaux.fr', admin: true };
  for (const identity of [null, undefined, {}, { ...hostile, status: 'unavailable' }, { ...hostile, status: 'viewer' }, { ...hostile, status: 'pending' }]) {
    assert.equal(rightsFor(identity)(rowOf(1)), null, JSON.stringify(identity));
    assert.equal(rightsFor(identity)(rowOf(2)), null, JSON.stringify(identity));
    assert.equal(rightsFor(identity, { adminMode: true })(rowOf(2)), null, `${JSON.stringify(identity)} même en mode admin`);
  }
});

test('rightsFor takes only a real true for an administrator, and never matches an empty address', () => {
  for (const admin of [1, 'true', 'oui', {}, [], 'admin']) {
    assert.equal(rightsFor(ready('ana.martin@chu-bordeaux.fr', admin), { adminMode: true })(rowOf(2)), null, JSON.stringify(admin));
  }
  const blank = rightsFor(ready('   '));
  assert.equal(blank(rowOf(10)), null, 'une adresse vide ne désigne pas les fiches sans adresse');
  assert.equal(blank(rowOf(1)), null);
  assert.equal(rightsFor(ready('ana.martin@chu-bordeaux.fr'))(null), null);
  assert.equal(rightsFor(ready('ana.martin@chu-bordeaux.fr', true), { adminMode: true })(undefined), null);
});

// ===== rebaseChanges : ramener ce que la personne a changé sur la fiche d'aujourd'hui =====

test('rebaseChanges leaves the changes alone when the fiche has not moved since the form was opened', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), {
    Fonction: 'Cheffe', numero_de_telephone: '05 56 78 90 13', Role_dans_le_PUI: 0, Competences: [2, 3]
  }, referenceMaps);
  const rebased = rebaseChanges(champs, row(1), referenceMaps);
  assert.deepEqual(rebased.champs, champs);
  assert.deepEqual(rebased.moved, []);
});

test('rebaseChanges starts a text, a phone and a reference from their value of today, and names the fields that moved', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), {
    Fonction: 'Cheffe', numero_de_telephone: '05 56 78 90 13', Role_dans_le_PUI: 0
  }, referenceMaps);
  // Pendant ce temps, quelqu'un d'autre a changé la fonction, le téléphone et le rôle.
  const today = { ...row(1), Fonction: 'Directrice', numero_de_telephone: 556789099, Role_dans_le_PUI: 2 };
  const maps = { ...referenceMaps, role: { 1: 'Référent qualité', 2: 'Coordinatrice' } };
  const rebased = rebaseChanges(champs, today, maps);
  assert.deepEqual(rebased.champs, {
    Fonction: { avant: 'Directrice', apres: 'Cheffe' },
    numero_de_telephone: { avant: '0556789099', apres: '0556789013' },
    Role_dans_le_PUI: { avant: { id: 2, label: 'Coordinatrice' }, apres: { id: 0, label: '' } }
  });
  assert.deepEqual(rebased.moved, ['Fonction', 'Téléphone', 'Rôle dans le PUI']);
});

test('rebaseChanges drops what somebody else has already done, and says nothing about it', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Fonction: 'Cheffe', numero_de_telephone: '05 56 78 90 13', Role_dans_le_PUI: 0 }, referenceMaps);
  const today = { ...row(1), Fonction: 'Cheffe', numero_de_telephone: 556789013, Role_dans_le_PUI: 0 };
  assert.deepEqual(rebaseChanges(champs, today, referenceMaps), { champs: {}, moved: [] });
});

test('rebaseChanges keeps the additions and removals of a list, minus those that are already done', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Competences: [2, 3] }, referenceMaps); // +3, −1
  // Quelqu'un a déjà retiré la 1 et ajouté la 4 : la 4 est conservée, le retrait n'a plus lieu d'être.
  const today = { ...row(1), Competences: ['L', 2, 4] };
  assert.deepEqual(rebaseChanges(champs, today, referenceMaps).champs.Competences, {
    ajout: [{ id: 3, label: 'Pharmacovigilance' }],
    retrait: []
  });
  // Tout est déjà fait : la liste disparaît des changements.
  const done = { ...row(1), Competences: ['L', 2, 3] };
  assert.deepEqual(rebaseChanges(champs, done, referenceMaps), { champs: {}, moved: [] });
});

test('rebaseChanges never reports a list as moved: lists apply to any state', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Competences: [1, 2, 3] }, referenceMaps);
  assert.deepEqual(rebaseChanges(champs, { ...row(1), Competences: ['L', 4] }, referenceMaps).moved, []);
});

test('rebaseChanges keeps the order of the form, ignores a field it does not know, and does not change its input', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), { Competences: [2], Fonction: 'Cheffe', prenom: 'Anna' }, referenceMaps);
  const withStranger = { ...champs, email: { avant: 'a', apres: 'b' }, Etablissement: { avant: 1, apres: 2 } };
  const copy = structuredClone(withStranger);
  const rebased = rebaseChanges(withStranger, row(1), referenceMaps);
  assert.deepEqual(Object.keys(rebased.champs), ['prenom', 'Fonction', 'Competences']);
  assert.deepEqual(withStranger, copy);
});

// ===== describeChanges : les lignes montrées sous les deux cartes =====

test('describeChanges gives one line per changed field in form order, whatever the order of the changes', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(1), {
    Competences: [2, 3], Fonction: 'Cheffe', numero_de_telephone: '', Role_dans_le_PUI: 0, prenom: 'Anna'
  }, referenceMaps);
  const lines = describeChanges(champs);
  assert.deepEqual(lines.map(line => line.key), ['prenom', 'Fonction', 'numero_de_telephone', 'Role_dans_le_PUI', 'Competences']);
  assert.deepEqual(lines[0], { key: 'prenom', label: 'Prénom', kind: 'text', before: 'Ana', after: 'Anna' });
  assert.deepEqual(lines[2], { key: 'numero_de_telephone', label: 'Téléphone', kind: 'phone', before: '05 56 78 90 12', after: '' });
  assert.deepEqual(lines[3], { key: 'Role_dans_le_PUI', label: 'Rôle dans le PUI', kind: 'reference', before: 'Référent qualité', after: '' });
  assert.deepEqual(lines[4], { key: 'Competences', label: 'Compétences', kind: 'list', added: ['Pharmacovigilance'], removed: ['Oncologie'] });
  const shuffled = Object.fromEntries(Object.entries(champs).reverse());
  assert.deepEqual(describeChanges(shuffled), lines);
});

test('describeChanges names a value by its identifier when its label is unknown, and gives nothing for nothing', () => {
  const lines = describeChanges({ Instances: { ajout: [{ id: 9, label: '' }], retrait: [] } });
  assert.deepEqual(lines[0].added, ['n° 9']);
  assert.deepEqual(describeChanges({}), []);
});

// ===== L'administrateur qui modifie la fiche d'une autre personne : e-mail et établissement =====

test('profileFormModel offers the e-mail and the établissement to an administrator, in the order of the form, and to nobody else', async () => {
  const { referenceMaps, row } = await setup();
  const admin = profileFormModel(row(2), referenceMaps, { admin: true }); // Bob, vu par une administratrice
  assert.deepEqual(admin.map(entry => entry.key),
    ['prenom', 'nom', 'email', 'Etablissement', 'Fonction', 'numero_de_telephone', 'Role_dans_le_PUI', 'Instances', 'Actions', 'GT', 'Competences', 'Communautes', 'Taches']);
  assert.deepEqual(field(admin, 'email'), { key: 'email', label: 'E-mail', kind: 'email', value: 'bob@u-bordeaux-montaigne.fr' });
  const etab = field(admin, 'Etablissement');
  assert.deepEqual([etab.kind, etab.category, etab.value, etab.required], ['reference', 'etablissement', 2, true]);
  assert.deepEqual(etab.options.map(option => option.label),
    ['Clinique', 'CHU', 'INSERM', 'Institut Bergonié', 'UBM'].sort((a, b) => a.localeCompare(b, 'fr-FR')),
    'tous les établissements, validés ou non, par leur acronyme (leur nom complet seulement quand ils n\'en ont pas), triés');
  for (const forbidden of ['perimetre', 'Accepte_apparaitre', 'Avatar']) assert.equal(field(admin, forbidden), undefined, forbidden);
  for (const model of [profileFormModel(row(2), referenceMaps), profileFormModel(row(2), referenceMaps, { admin: false }), profileFormModel(row(2), referenceMaps, {})]) {
    assert.equal(field(model, 'email'), undefined);
    assert.equal(field(model, 'Etablissement'), undefined);
  }
});

test('profileFormModel does not offer an e-mail column that BDD does not have, and shows 0 for a person without établissement', async () => {
  const tables = sampleTables();
  delete tables.BDD.email;
  const { referenceMaps, row } = await setup(tables);
  const model = profileFormModel(row(2), referenceMaps, { admin: true });
  assert.equal(field(model, 'email'), undefined, 'colonne facultative absente : rien à modifier');
  assert.equal(field(model, 'Etablissement').value, 2);
  const eve = await setup();
  assert.equal(field(profileFormModel(eve.row(5), eve.referenceMaps, { admin: true }), 'Etablissement').value, 0, 'Eve n\'a pas d\'établissement');
});

test('diffProfile lets an administrator change the e-mail, written in lower case with the spaces around it removed', async () => {
  const { referenceMaps, row } = await setup();
  const next = (email, options = { admin: true }) => diffProfile(row(2), { email }, referenceMaps, options);
  assert.deepEqual(next('  Bob.Nouveau@U-Bordeaux-Montaigne.FR ').champs.email,
    { avant: 'bob@u-bordeaux-montaigne.fr', apres: 'bob.nouveau@u-bordeaux-montaigne.fr' });
  assert.deepEqual(next('bob@u-bordeaux-montaigne.fr').champs, {}, 'laissée telle quelle');
  assert.deepEqual(next('BOB@u-bordeaux-montaigne.fr'), { champs: {}, errors: [], fieldErrors: {} }, 'la même adresse écrite autrement n\'est pas un changement');
  assert.deepEqual(next('Dan@Inserm.fr', { admin: true, emailTaken: address => address === 'dan@inserm.fr' }).fieldErrors,
    { email: 'Cette adresse est déjà utilisée par une autre fiche.' });
});

test('diffProfile names the owner of a taken e-mail when the caller gives a name, and says only "une autre fiche" otherwise', async () => {
  const { referenceMaps, row } = await setup();
  const fault = emailTaken => diffProfile(row(2), { email: 'ana.martin@chu-bordeaux.fr' }, referenceMaps, { admin: true, emailTaken }).fieldErrors.email;
  assert.equal(fault(() => 'Ana Martin'), 'Cette adresse est déjà utilisée par Ana Martin.', 'une fiche visible dans l\'annuaire se nomme');
  assert.equal(fault(() => true), 'Cette adresse est déjà utilisée par une autre fiche.', 'une fiche masquée ne dévoile pas son nom');
  assert.equal(fault(() => false), undefined);
});

test('the list of établissements offers the acronym of each one, never a mix with the full names, whatever Grist gave as full names', async () => {
  const { referenceMaps, row } = await setup();
  const labels = maps => field(profileFormModel(row(2), maps, { admin: true }), 'Etablissement').options.map(option => option.label).sort();
  const acronyms = ['CHU', 'Clinique', 'INSERM', 'Institut Bergonié', 'UBM'].sort(); // « Institut Bergonié » n'a pas d'acronyme : son nom complet
  assert.deepEqual(labels(referenceMaps), acronyms);
  assert.deepEqual(labels({ ...referenceMaps, etablissementNom: {} }), acronyms, 'les noms complets ne comptent pas');
  assert.deepEqual(labels({ ...referenceMaps, etablissementNom: { 1: 'Nom complet de tout autre établissement' } }), acronyms);
  const next = diffProfile(row(2), { Etablissement: 1 }, referenceMaps, { admin: true }).champs.Etablissement;
  assert.deepEqual(next, { avant: { id: 2, label: 'UBM' }, apres: { id: 1, label: 'CHU' } });
});

test('diffProfile refuses an e-mail that is not an address, that is too long, or that a spreadsheet would read as a formula', async () => {
  const { referenceMaps, row } = await setup();
  const fault = email => diffProfile(row(2), { email }, referenceMaps, { admin: true }).fieldErrors.email;
  for (const bad of ['pas une adresse', 'bob@', 'bob@chu', 'bob @chu.fr', 'bob@chu..', 'bob@chu.f', 'a,b@chu.fr', 'a;b@chu.fr', 'a<b@chu.fr', 'bob@chu.fr?cc=x@y.fr',
    'bob@chu.fr#x', 'bob@chu.fr, cc@chu.fr', '"bob"@chu.fr', 'bob@@chu.fr']) {
    assert.equal(fault(bad), 'Indiquez une adresse e-mail valide.', bad);
  }
  assert.equal(fault(`${'a'.repeat(195)}@chu.fr`), `${MAX_TEXT_LENGTH} caractères au plus.`);
  assert.equal(fault('+bob@chu.fr'), 'Ne peut pas commencer par = + - ou @.');
  assert.equal(fault('=bob@chu.fr'), 'Ne peut pas commencer par = + - ou @.');
  assert.equal(fault('@chu.fr'), 'Ne peut pas commencer par = + - ou @.');
  for (const good of ['bob@chu.fr', 'prenom.nom+tag@sous.domaine.example.fr', 'o\'brien@chu.fr', 'a_b-c@chu-bordeaux.fr']) {
    assert.equal(fault(good), undefined, good);
  }
});

test('diffProfile does not let an e-mail be emptied, but leaves an empty one alone', async () => {
  const { referenceMaps, row } = await setup();
  const emptied = diffProfile(row(2), { email: '   ' }, referenceMaps, { admin: true });
  assert.deepEqual(emptied.champs, {});
  assert.deepEqual(emptied.fieldErrors, { email: 'Indiquez une adresse e-mail valide.' });
  assert.deepEqual(emptied.errors, ['E-mail : Indiquez une adresse e-mail valide.']);
  // Hugo n'a pas d'adresse : la laisser vide n'est pas une erreur, lui en donner une est un changement.
  assert.deepEqual(diffProfile(row(10), { email: '' }, referenceMaps, { admin: true }), { champs: {}, errors: [], fieldErrors: {} });
  assert.deepEqual(diffProfile(row(10), { email: '  ' }, referenceMaps, { admin: true }), { champs: {}, errors: [], fieldErrors: {} });
  assert.deepEqual(diffProfile(row(10), { email: 'hugo@chu-bordeaux.fr' }, referenceMaps, { admin: true }).champs.email,
    { avant: '', apres: 'hugo@chu-bordeaux.fr' });
});

test('diffProfile lets an administrator move a person to another établissement, never to none, never to an unknown one', async () => {
  const { referenceMaps, row } = await setup();
  const next = (draft, fiche = 2) => diffProfile(row(fiche), draft, referenceMaps, { admin: true });
  assert.deepEqual(next({ Etablissement: 1 }).champs.Etablissement,
    { avant: { id: 2, label: 'UBM' }, apres: { id: 1, label: 'CHU' } });
  assert.deepEqual(next({ Etablissement: 2 }).champs, {}, 'même établissement : pas un changement');
  assert.deepEqual(next({ Etablissement: 0 }).fieldErrors, { Etablissement: 'Une valeur est requise.' });
  assert.deepEqual(next({ Etablissement: 99 }).fieldErrors, { Etablissement: 'Valeur inconnue.' });
  for (const unreadable of ['1', -1, 1.5, null, NaN, [1]]) {
    assert.deepEqual(next({ Etablissement: unreadable }).fieldErrors, { Etablissement: 'Valeur illisible.' }, String(unreadable));
  }
  // Une personne qui n'a pas encore d'établissement n'est pas en faute de n'en avoir aucun.
  assert.deepEqual(next({ Etablissement: 0 }, 5), { champs: {}, errors: [], fieldErrors: {} });
  assert.deepEqual(next({ Etablissement: 4 }, 5).champs.Etablissement, { avant: { id: 0, label: '' }, apres: { id: 4, label: 'INSERM' } });
});

test('diffProfile ignores the e-mail and the établissement of a draft when nobody is administrating, whatever the draft holds', async () => {
  const { referenceMaps, row } = await setup();
  const draft = { email: 'intrus@example.fr', Etablissement: 1, Fonction: 'Chef' };
  for (const options of [undefined, {}, { admin: false }, { admin: 'oui' }, { admin: 1 }]) {
    const next = diffProfile(row(2), draft, referenceMaps, options);
    assert.deepEqual(Object.keys(next.champs), ['Fonction'], JSON.stringify(options));
  }
  const bad = diffProfile(row(2), { email: 'pas une adresse', Etablissement: 99 }, referenceMaps);
  assert.deepEqual(bad, { champs: {}, errors: [], fieldErrors: {} }, 'même invalides, ils ne sont pas lus');
});

test('rebaseChanges rebuilds the e-mail and the établissement from the current fiche, and names them when somebody else moved them', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(2), { email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1 }, referenceMaps, { admin: true });
  const same = rebaseChanges(champs, row(2), referenceMaps, { admin: true });
  assert.deepEqual(same.moved, []);
  assert.deepEqual(same.champs, champs);
  // Entre-temps, quelqu'un d'autre a changé l'adresse ET l'établissement.
  const moved = rebaseChanges(champs, { ...row(2), email: 'autre@exemple.fr', Etablissement: 4 }, referenceMaps, { admin: true });
  assert.deepEqual(moved.moved, ['E-mail', 'Établissement']);
  assert.deepEqual(moved.champs.email, { avant: 'autre@exemple.fr', apres: 'nouveau@u-bordeaux-montaigne.fr' });
  assert.deepEqual(moved.champs.Etablissement, { avant: { id: 4, label: 'INSERM' }, apres: { id: 1, label: 'CHU' } });
  // Déjà fait par un autre : plus rien à écrire.
  assert.deepEqual(rebaseChanges(champs, { ...row(2), email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1 }, referenceMaps, { admin: true }).champs, {});
  // Sans administrateur, ces deux champs sont écartés.
  assert.deepEqual(rebaseChanges(champs, row(2), referenceMaps).champs, {});
  assert.deepEqual(rebaseChanges(champs, row(2), referenceMaps, { admin: false }).champs, {});
});

test('describeChanges says the e-mail and the établissement like any other text and reference', async () => {
  const { referenceMaps, row } = await setup();
  const { champs } = diffProfile(row(2), { email: 'nouveau@u-bordeaux-montaigne.fr', Etablissement: 1, prenom: 'Robert' }, referenceMaps, { admin: true });
  assert.deepEqual(describeChanges(champs), [
    { key: 'prenom', label: 'Prénom', kind: 'text', before: 'Bob', after: 'Robert' },
    { key: 'email', label: 'E-mail', kind: 'email', before: 'bob@u-bordeaux-montaigne.fr', after: 'nouveau@u-bordeaux-montaigne.fr' },
    { key: 'Etablissement', label: 'Établissement', kind: 'reference', before: 'UBM', after: 'CHU' }
  ]);
});

// ===== La photo de profil (colonne Avatar de BDD, pièce jointe) =====

// Une photo que le formulaire vient de préparer (image-prep.js) : le fichier et son adresse locale.
const photo = (overrides = {}) => ({ blob: new Blob(['jpeg']), name: 'photo-de-profil.jpg', width: 256, height: 256, url: 'blob:http://widget/1', ...overrides });

test('profileFormModel offers the photo first, with the id of the current attachment, only when BDD has an Avatar column', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const ana = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(ana[0], { key: 'Avatar', label: 'Photo de profil', kind: 'image', value: 501 });
  assert.deepEqual(ana.slice(1).map(entry => entry.key), ['prenom', 'nom', 'Fonction', 'numero_de_telephone', 'Role_dans_le_PUI', 'Instances', 'Actions', 'GT', 'Competences', 'Communautes', 'Taches']);
  assert.ok(!('options' in ana[0]) && !('category' in ana[0]));

  const without = await setup();
  assert.equal(field(profileFormModel(without.row(1), without.referenceMaps), 'Avatar'), undefined, 'rien à modifier sans la colonne');
});

test('profileFormModel shows 0 for a person without photo, whatever form Grist gives an empty attachment cell', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  assert.equal(field(profileFormModel(row(9), referenceMaps), 'Avatar').value, 0, "une liste vide ['L']");
  assert.equal(field(profileFormModel(row(10), referenceMaps), 'Avatar').value, 0, 'une cellule null');
  const odd = { ...row(1), Avatar: 0 };
  assert.equal(field(profileFormModel(odd, referenceMaps), 'Avatar').value, 0);
  const several = { ...row(1), Avatar: ['L', 7, 8] };
  assert.equal(field(profileFormModel(several, referenceMaps), 'Avatar').value, 7, 'la première pièce jointe est celle qu’on montre');
});

test('profileFormModel offers the photo to an administrator too, still first', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const keys = profileFormModel(row(1), referenceMaps, { admin: true }).map(entry => entry.key);
  assert.deepEqual(keys.slice(0, 3), ['Avatar', 'prenom', 'nom']);
  assert.ok(keys.includes('email') && keys.includes('Etablissement'));
});

test('draftOf starts the photo at the current attachment id', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  assert.equal(draftOf(profileFormModel(row(1), referenceMaps)).Avatar, 501);
  assert.equal(draftOf(profileFormModel(row(9), referenceMaps)).Avatar, 0);
});

test('diffProfile sees no change in a photo left as it is, with or without one', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  assert.deepEqual(diffProfile(row(1), { Avatar: 501 }, referenceMaps), { champs: {}, errors: [], fieldErrors: {} });
  assert.deepEqual(diffProfile(row(9), { Avatar: 0 }, referenceMaps), { champs: {}, errors: [], fieldErrors: {} });
  assert.deepEqual(diffProfile(row(10), { Avatar: 0 }, referenceMaps), { champs: {}, errors: [], fieldErrors: {} }, 'cellule null : rien à retirer');
});

test('diffProfile records a new photo as a replacement and keeps the id of the one it replaces', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  assert.deepEqual(diffProfile(row(1), { Avatar: photo() }, referenceMaps).champs, { Avatar: { action: 'replace', avant: 501 } });
  assert.deepEqual(diffProfile(row(9), { Avatar: photo() }, referenceMaps).champs, { Avatar: { action: 'replace', avant: 0 } }, 'une première photo');
});

test('diffProfile records 0 as the removal of the photo, and nothing when there is none to remove', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  assert.deepEqual(diffProfile(row(1), { Avatar: 0 }, referenceMaps).champs, { Avatar: { action: 'remove', avant: 501 } });
  assert.deepEqual(diffProfile(row(9), { Avatar: 0 }, referenceMaps).champs, {});
});

test('diffProfile refuses every other photo: an attachment id that is not the current one, an empty or foreign object', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const refused = [502, 1, 999999, -1, 1.5, '501', '', 'photo', null, undefined, true, [], [501], {}, { url: 'blob:x' },
    { blob: new Blob([]) }, { blob: { size: 0 } }, { blob: 'x' }, photo({ blob: new Blob([]) }), { blob: { size: -3 } }, { blob: { size: NaN } }];
  for (const input of refused) {
    const result = diffProfile(row(1), { Avatar: input }, referenceMaps);
    assert.deepEqual(result.champs, {}, `${String(JSON.stringify(input))} n’est pas un changement`);
    assert.deepEqual(result.fieldErrors, { Avatar: 'Valeur illisible.' }, `${String(JSON.stringify(input))} est refusée`);
    assert.equal(result.errors.length, 1);
  }
});

test('diffProfile never lets a draft point to another attachment of the document: only the current id, 0 or a prepared file', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  // 502 est la photo de Bob : une fiche ne peut pas la reprendre en la désignant par son numéro.
  assert.deepEqual(diffProfile(row(1), { Avatar: 502 }, referenceMaps).fieldErrors, { Avatar: 'Valeur illisible.' });
  assert.deepEqual(diffProfile(row(9), { Avatar: 502 }, referenceMaps).fieldErrors, { Avatar: 'Valeur illisible.' });
});

test('diffProfile ignores the photo of a draft when the row has no Avatar column, and a draft that does not mention it', async () => {
  const plain = await setup();
  assert.deepEqual(diffProfile(plain.row(1), { Avatar: photo() }, plain.referenceMaps), { champs: {}, errors: [], fieldErrors: {} });
  const { referenceMaps, row } = await setup(withAvatars());
  assert.deepEqual(diffProfile(row(1), { Fonction: 'Cheffe' }, referenceMaps).champs, { Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' } });
});

test('diffProfile combines the photo with the other changes', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const { champs, errors } = diffProfile(row(1), { Avatar: photo(), Fonction: 'Cheffe' }, referenceMaps);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(champs).sort(), ['Avatar', 'Fonction']);
  // Une erreur ailleurs ne change pas la lecture de la photo.
  const broken = diffProfile(row(1), { Avatar: photo(), Fonction: '=SOMME(A1)' }, referenceMaps);
  assert.equal(broken.errors.length, 1);
  assert.deepEqual(broken.champs.Avatar, { action: 'replace', avant: 501 });
});

test('rebaseChanges keeps a photo change as it is while the photo has not moved', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const { champs } = diffProfile(row(1), { Avatar: photo() }, referenceMaps);
  assert.deepEqual(rebaseChanges(champs, row(1), referenceMaps), { champs: { Avatar: { action: 'replace', avant: 501 } }, moved: [] });
  const { champs: removal } = diffProfile(row(1), { Avatar: 0 }, referenceMaps);
  assert.deepEqual(rebaseChanges(removal, row(1), referenceMaps), { champs: { Avatar: { action: 'remove', avant: 501 } }, moved: [] });
});

test('rebaseChanges names the photo when somebody else changed it, and starts from the photo of today', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const { champs } = diffProfile(row(1), { Avatar: photo() }, referenceMaps);
  const today = { ...row(1), Avatar: ['L', 777] };
  assert.deepEqual(rebaseChanges(champs, today, referenceMaps), { champs: { Avatar: { action: 'replace', avant: 777 } }, moved: ['Photo de profil'] });
  const { champs: removal } = diffProfile(row(1), { Avatar: 0 }, referenceMaps);
  assert.deepEqual(rebaseChanges(removal, today, referenceMaps), { champs: { Avatar: { action: 'remove', avant: 777 } }, moved: ['Photo de profil'] });
  // Quelqu'un a mis une première photo là où la personne n'en avait pas.
  const { champs: first } = diffProfile(row(9), { Avatar: photo() }, referenceMaps);
  assert.deepEqual(rebaseChanges(first, { ...row(9), Avatar: ['L', 5] }, referenceMaps), { champs: { Avatar: { action: 'replace', avant: 5 } }, moved: ['Photo de profil'] });
});

test('rebaseChanges drops the removal of a photo that somebody else has already removed, and says nothing', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const { champs } = diffProfile(row(1), { Avatar: 0 }, referenceMaps);
  assert.deepEqual(rebaseChanges(champs, { ...row(1), Avatar: ['L'] }, referenceMaps), { champs: {}, moved: [] });
  assert.deepEqual(rebaseChanges(champs, { ...row(1), Avatar: null }, referenceMaps), { champs: {}, moved: [] });
});

test('rebaseChanges still replaces a photo that was removed meanwhile, and says so', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const { champs } = diffProfile(row(1), { Avatar: photo() }, referenceMaps);
  assert.deepEqual(rebaseChanges(champs, { ...row(1), Avatar: ['L'] }, referenceMaps), { champs: { Avatar: { action: 'replace', avant: 0 } }, moved: ['Photo de profil'] });
});

test('describeChanges puts the photo first, with the current id and the action, and no file', async () => {
  const { referenceMaps, row } = await setup(withAvatars());
  const { champs } = diffProfile(row(1), { Fonction: 'Cheffe', Avatar: photo() }, referenceMaps);
  const lines = describeChanges(champs);
  assert.deepEqual(lines.map(line => line.key), ['Avatar', 'Fonction']);
  assert.deepEqual(lines[0], { key: 'Avatar', label: 'Photo de profil', kind: 'image', before: 501, after: 'replace' });
  const removal = describeChanges(diffProfile(row(1), { Avatar: 0 }, referenceMaps).champs);
  assert.deepEqual(removal, [{ key: 'Avatar', label: 'Photo de profil', kind: 'image', before: 501, after: 'remove' }]);
  const first = describeChanges(diffProfile(row(9), { Avatar: photo() }, referenceMaps).champs);
  assert.deepEqual(first, [{ key: 'Avatar', label: 'Photo de profil', kind: 'image', before: 0, after: 'replace' }]);
  assert.ok(!JSON.stringify(lines).includes('blob'), 'le fichier n’est jamais dans les lignes montrées');
});

// ===== email_affiche : l'adresse que la carte montre à la place de l'adresse du compte =====

test('email_affiche is offered to everyone, may be emptied or shared, and only its shape is checked; the account e-mail stays locked', async () => {
  const { referenceMaps, row } = await setup(withShownEmail());
  const model = profileFormModel(row(1), referenceMaps);
  assert.deepEqual(model.map(entry => entry.key).slice(0, 4), ['prenom', 'nom', 'Fonction', 'email_affiche']);
  assert.deepEqual(field(model, 'email_affiche'), { key: 'email_affiche', label: 'E-mail affiché', kind: 'email', optional: true, value: '' });

  const kept = diffProfile(row(1), { email_affiche: ' Contact@CHU-Bordeaux.fr ' }, referenceMaps);
  assert.deepEqual(kept.champs, { email_affiche: { avant: '', apres: 'contact@chu-bordeaux.fr' } });
  assert.deepEqual(kept.errors, []);
  assert.deepEqual(diffProfile(row(1), { email_affiche: BOB_SHOWN_EMAIL }, referenceMaps).errors, [], 'une boîte de service se partage entre fiches');
  assert.deepEqual(diffProfile(row(2), { email_affiche: '' }, referenceMaps).champs,
    { email_affiche: { avant: BOB_SHOWN_EMAIL, apres: '' } }, 'vidée, la carte revient à l\'adresse du compte');

  assert.equal(diffProfile(row(1), { email_affiche: 'pas une adresse' }, referenceMaps).fieldErrors.email_affiche, 'Indiquez une adresse e-mail valide.');
  assert.match(diffProfile(row(1), { email_affiche: '=cmd@exemple.fr' }, referenceMaps).fieldErrors.email_affiche, /^Ne peut pas commencer par/);
  assert.deepEqual(diffProfile(row(1), { email: 'autre@exemple.fr' }, referenceMaps).champs, {}, 'l\'adresse du compte ne se change pas ici');
});

// ===== Une fiche qu'on crée : la fiche vide, l'établissement à choisir =====

test('a person who creates her fiche picks her établissement, is asked for a name and an établissement only once she has begun, and cannot touch the e-mail', async () => {
  const tables = withShownEmail();
  const { referenceMaps } = await setup(tables);
  const blank = blankFiche(Object.keys(tables.BDD), NEW_EMAIL);
  const model = profileFormModel(blank, referenceMaps, { creating: true });
  assert.deepEqual(model.map(entry => entry.key), ['prenom', 'nom', 'Etablissement', 'Fonction', 'email_affiche', 'numero_de_telephone',
    'Role_dans_le_PUI', 'Instances', 'Actions', 'GT', 'Competences', 'Communautes', 'Taches']);
  assert.equal(field(model, 'Etablissement').value, 0);
  assert.equal(field(model, 'Etablissement').required, true);
  const draft = draftOf(model);
  const create = changes => diffProfile(blank, { ...draft, ...changes }, referenceMaps, { creating: true });

  assert.deepEqual(create({}), { champs: {}, errors: [], fieldErrors: {} }, 'le formulaire vide ne réclame rien');
  const begun = create({ Fonction: 'Pharmacienne' });
  assert.equal(begun.fieldErrors.prenom, NAME_REQUIRED);
  assert.equal(begun.fieldErrors.nom, NAME_REQUIRED);
  assert.equal(begun.fieldErrors.Etablissement, ETABLISSEMENT_REQUIRED);
  const done = create({ prenom: 'Zoé', nom: 'Nouvelle', Etablissement: 1 });
  assert.deepEqual(done.errors, []);
  assert.deepEqual(Object.keys(done.champs), ['prenom', 'nom', 'Etablissement']);
  assert.equal(done.champs.Etablissement.apres.label, 'CHU');
  assert.equal(create({ prenom: 'Zoé', Etablissement: 1, email: 'autre@exemple.fr' }).champs.email, undefined, 'l\'adresse est celle du compte');
  assert.deepEqual(diffProfile(blank, { ...draft, Etablissement: 1 }, referenceMaps).champs, {}, 'hors création, l\'établissement ne se choisit pas');
});

test('a fiche being created does not offer the photo, even when BDD has an Avatar column: it is added afterwards, from « Modifier mon profil »', async () => {
  const tables = withAvatars();
  const { referenceMaps, row } = await setup(tables);
  const blank = blankFiche(Object.keys(tables.BDD), NEW_EMAIL);
  assert.equal('Avatar' in blank, false, 'la fiche vide n\'a pas de photo');
  const model = profileFormModel(blank, referenceMaps, { creating: true });
  assert.equal(field(model, 'Avatar'), undefined);
  assert.deepEqual(diffProfile(blank, { ...draftOf(model), Avatar: photo() }, referenceMaps, { creating: true }), { champs: {}, errors: [], fieldErrors: {} },
    'une photo glissée dans le brouillon est ignorée');
  assert.equal(field(profileFormModel(row(9), referenceMaps), 'Avatar').value, 0, 'une fois la fiche créée, le formulaire de modification offre la photo');
});
