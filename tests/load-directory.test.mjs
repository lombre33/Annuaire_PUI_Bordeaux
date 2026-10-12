import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectory, DirectoryLoadError } from '../grist-data.js';
import { sampleTables, DEFAULT_CARD_NAMES } from './fixtures.mjs';

// ===== loadDirectory : lecture de Grist → contacts affichables =====

// Faux docApi : sert les tables de tests/fixtures.mjs, compte les lectures par
// table et peut simuler des tables illisibles.
function fakeDocApi(tables, { failing = [], throwSync = [] } = {}) {
  const calls = {};
  return {
    calls,
    fetchTable(name) {
      calls[name] = (calls[name] || 0) + 1;
      if (throwSync.includes(name)) throw new Error(`échec synchrone ${name}`);
      if (failing.includes(name)) return Promise.reject(new Error(`échec ${name}`));
      return Promise.resolve(structuredClone(tables[name]));
    }
  };
}

function recordingLog() {
  const log = { infos: [], warnings: [], info: (...args) => log.infos.push(args), warn: (...args) => log.warnings.push(args) };
  return log;
}

test('loadDirectory returns the displayable contacts, each with its Etablissement2 label, and reads every table exactly once', async () => {
  const docApi = fakeDocApi(sampleTables());
  const { contacts, issues } = await loadDirectory(docApi, { log: recordingLog() });
  // Contrôle demandé avant chaque changement : nombre de contacts + Etablissement2 rempli.
  assert.deepEqual(contacts.filter(c => c.etablissement_fondateur).map(c => `${c.Prenom} ${c.Nom}`), DEFAULT_CARD_NAMES);
  assert.equal(contacts.length, 5, '4 fondateurs + 1 partenaire (Bob), avant l\'interrupteur Partenaires de l\'UI');
  assert.ok(contacts.every(c => c.etablissement_label), 'tous les contacts affichables ont un établissement');
  assert.deepEqual(issues, []);
  Object.values(docApi.calls).forEach(count => assert.equal(count, 1));
  assert.equal(docApi.calls.Etablissements, 1, 'Etablissements n\'est lu qu\'une fois (libellés ET indicateurs)');
});

test('loadDirectory resolves reference tables and keeps the establishment menu data', async () => {
  const { referenceMaps, etabFlags } = await loadDirectory(fakeDocApi(sampleTables()), { log: recordingLog() });
  assert.deepEqual(referenceMaps.Instances, { 1: 'CME', 3: 'COVIRIS' }, 'la ligne sans libellé est ignorée');
  assert.deepEqual(referenceMaps.Etablissements, { 1: 'CHU', 2: 'UBM', 3: 'Clinique', 4: 'INSERM', 5: 'Institut Bergonié' });
  assert.equal(etabFlags.byLabel['Institut Bergonié'].fondateur, true);
});

test('loadDirectory logs contacts without Etablissement2 by row id only, never by email', async () => {
  const log = recordingLog();
  await loadDirectory(fakeDocApi(sampleTables()), { log });
  const diagnostic = log.warnings.find(args => String(args[0]).startsWith('[ETABLISSEMENT]'));
  assert.ok(diagnostic);
  assert.deepEqual(diagnostic[1], [5]);
  assert.ok(!JSON.stringify(log.warnings).includes('@'));
});

test('loadDirectory throws a DirectoryLoadError naming the table when Annuaire or Etablissements cannot be read', async () => {
  for (const table of ['Annuaire', 'Etablissements']) {
    await assert.rejects(
      loadDirectory(fakeDocApi(sampleTables(), { failing: [table] }), { log: recordingLog() }),
      error => error instanceof DirectoryLoadError && error.message.includes(table)
    );
  }
});

test('loadDirectory treats a docApi that throws synchronously like a rejected read', async () => {
  await assert.rejects(
    loadDirectory(fakeDocApi(sampleTables(), { throwSync: ['Etablissements'] }), { log: recordingLog() }),
    DirectoryLoadError
  );
  const { issues } = await loadDirectory(fakeDocApi(sampleTables(), { throwSync: ['Actions'] }), { log: recordingLog() });
  assert.match(issues[0], /Actions/);
});

test('loadDirectory keeps going when a reference table is unreadable: previous labels are reused and the problem is reported', async () => {
  const previousMaps = { Actions: { 1: 'Vaccination', 2: 'Audit' } };
  const withPrevious = await loadDirectory(fakeDocApi(sampleTables(), { failing: ['Actions'] }), { previousMaps, log: recordingLog() });
  assert.deepEqual(withPrevious.referenceMaps.Actions, previousMaps.Actions);
  assert.equal(withPrevious.issues.length, 1);
  assert.match(withPrevious.issues[0], /Actions/);
  assert.equal(withPrevious.contacts.length, 5, 'les contacts restent affichés');

  const firstLoad = await loadDirectory(fakeDocApi(sampleTables(), { failing: ['Actions', 'GT'] }), { log: recordingLog() });
  assert.deepEqual(firstLoad.referenceMaps.Actions, {});
  assert.match(firstLoad.issues[0], /Actions, GT/);
});

test('loadDirectory refuses an Annuaire table that lacks Etablissement2 or perimetre_all instead of silently showing nothing', async () => {
  for (const column of ['Etablissement2', 'perimetre_all']) {
    const tables = sampleTables();
    delete tables.Annuaire[column];
    await assert.rejects(
      loadDirectory(fakeDocApi(tables), { log: recordingLog() }),
      error => error instanceof DirectoryLoadError && error.message.includes(column)
    );
  }
});

test('loadDirectory explains an empty directory instead of leaving an unexplained « 0 contact »', async () => {
  const noEtablissement = sampleTables();
  noEtablissement.Annuaire.Etablissement2 = noEtablissement.Annuaire.Etablissement2.map(() => '');
  const noPerimetre = sampleTables();
  noPerimetre.Annuaire.perimetre_all = noPerimetre.Annuaire.perimetre_all.map(() => ['L']);
  const nothingValidated = sampleTables();
  nothingValidated.Etablissements.ok_pour_apparaitre = nothingValidated.Etablissements.ok_pour_apparaitre.map(() => false);

  const explain = async tables => (await loadDirectory(fakeDocApi(tables), { log: recordingLog() })).issues;
  assert.match((await explain(noEtablissement))[0], /Etablissement2 est vide/);
  assert.match((await explain(noPerimetre))[0], /perimetre_all est vide/);
  assert.match((await explain(nothingValidated))[0], /Aucun contact affichable/);
});

test('loadDirectory stays quiet when the Annuaire table is genuinely empty', async () => {
  const tables = sampleTables();
  Object.keys(tables.Annuaire).forEach(column => { tables.Annuaire[column] = []; });
  const { contacts, issues } = await loadDirectory(fakeDocApi(tables), { log: recordingLog() });
  assert.deepEqual([contacts, issues], [[], []]);
});

test('loadDirectory hides the contacts of an establishment whose duplicate rows disagree, and reports it', async () => {
  const tables = sampleTables();
  tables.Etablissements.id.push(6);
  tables.Etablissements.acronyme.push('CHU');
  tables.Etablissements.nom_complet.push('CHU (doublon)');
  tables.Etablissements.fondateur.push(true);
  tables.Etablissements.partenaire.push(false);
  tables.Etablissements.autres.push(false);
  tables.Etablissements.ok_pour_apparaitre.push(false);
  const { contacts, issues } = await loadDirectory(fakeDocApi(tables), { log: recordingLog() });
  assert.deepEqual(contacts.map(c => c.Nom), ['Durand', 'Bergonié'], 'plus aucun contact du CHU');
  assert.match(issues[0], /CHU/);
});
