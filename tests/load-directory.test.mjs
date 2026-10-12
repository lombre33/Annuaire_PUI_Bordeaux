import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectory, DirectoryLoadError } from '../grist-data.js';
import { sampleTables, withOptionalColumns, DEFAULT_CARD_NAMES } from './fixtures.mjs';

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

const load = (tables, options = {}) => loadDirectory(fakeDocApi(tables, options.docApi), { log: recordingLog(), ...options.load });

// Ajoute à Etablissements une 2e ligne « CHU » validée à l'inverse de la première.
function withDuplicateCHU(tables) {
  const copy = structuredClone(tables);
  copy.Etablissements.id.push(6);
  copy.Etablissements.acronyme.push('CHU');
  copy.Etablissements.nom_complet.push('CHU (doublon)');
  copy.Etablissements.fondateur.push(true);
  copy.Etablissements.partenaire.push(false);
  copy.Etablissements.autres.push(false);
  copy.Etablissements.ok_pour_apparaitre.push(false);
  return copy;
}

test('loadDirectory returns the displayable contacts, each with its Etablissement label, and reads every table exactly once', async () => {
  const docApi = fakeDocApi(sampleTables());
  const { contacts, issues } = await loadDirectory(docApi, { log: recordingLog() });
  // Contrôle demandé avant chaque changement : nombre de contacts + établissement rempli.
  assert.deepEqual(contacts.filter(c => c.etablissement_fondateur).map(c => `${c.prenom} ${c.nom}`), DEFAULT_CARD_NAMES);
  assert.equal(contacts.length, 5, '4 fondateurs + 1 partenaire (Bob), avant l\'interrupteur Partenaires de l\'UI');
  assert.deepEqual(contacts.map(c => c.etablissement_label), ['CHU', 'UBM', 'CHU', 'Institut Bergonié', 'CHU'],
    'tous les contacts affichables ont leur établissement');
  assert.deepEqual(issues, []);
  Object.values(docApi.calls).forEach(count => assert.equal(count, 1));
  assert.equal(docApi.calls.Etablissements, 1, 'Etablissements n\'est lu qu\'une fois (libellés ET indicateurs)');
  assert.equal(docApi.calls.BDD, 1);
});

test('loadDirectory reads the tables of the new structure and none of the old ones', async () => {
  const docApi = fakeDocApi(sampleTables());
  await loadDirectory(docApi, { log: recordingLog() });
  assert.deepEqual(Object.keys(docApi.calls).sort(), [
    'Actions', 'BDD', 'Communautes', 'Competences', 'Etablissements', 'GT', 'INSTANCES', 'Role_Dans_le_PUI', 'Taches'
  ]);
});

test('loadDirectory resolves reference tables, preferring the corrected label over the raw one', async () => {
  const { referenceMaps, etabFlags } = await load(sampleTables());
  assert.deepEqual(referenceMaps.INSTANCES, { 1: 'CME', 3: 'COVIRIS' }, 'libellé corrigé prioritaire ; la ligne sans libellé est ignorée');
  assert.deepEqual(referenceMaps.Actions, { 1: 'Vaccination', 2: 'Audit' }, 'libellé brut quand aucun libellé corrigé n\'est rempli');
  assert.deepEqual(referenceMaps.Competences, { 1: 'Oncologie' });
  assert.deepEqual(referenceMaps.Etablissements, { 1: 'CHU', 2: 'UBM', 3: 'Clinique', 4: 'INSERM', 5: 'Institut Bergonié' });
  assert.equal(etabFlags.byLabel['Institut Bergonié'].fondateur, true);
});

test('loadDirectory logs contacts without Etablissement by row id only, never by email', async () => {
  const log = recordingLog();
  await loadDirectory(fakeDocApi(sampleTables()), { log });
  const diagnostic = log.warnings.find(args => String(args[0]).startsWith('[ETABLISSEMENT]'));
  assert.ok(diagnostic);
  assert.deepEqual(diagnostic[1], [5]);
  assert.ok(!JSON.stringify(log.warnings).includes('@'));
});

test('loadDirectory throws a DirectoryLoadError naming the table when BDD or Etablissements cannot be read', async () => {
  for (const table of ['BDD', 'Etablissements']) {
    await assert.rejects(
      load(sampleTables(), { docApi: { failing: [table] } }),
      error => error instanceof DirectoryLoadError && error.message.includes(table)
    );
  }
});

test('loadDirectory treats a docApi that throws synchronously like a rejected read', async () => {
  await assert.rejects(load(sampleTables(), { docApi: { throwSync: ['Etablissements'] } }), DirectoryLoadError);
  const { issues } = await load(sampleTables(), { docApi: { throwSync: ['Actions'] } });
  assert.match(issues[0], /Actions/);
});

test('loadDirectory keeps going when a reference table is unreadable: previous labels are reused and the problem is reported', async () => {
  const previousMaps = { Actions: { 1: 'Vaccination', 2: 'Audit' } };
  const withPrevious = await load(sampleTables(), { docApi: { failing: ['Actions'] }, load: { previousMaps } });
  assert.deepEqual(withPrevious.referenceMaps.Actions, previousMaps.Actions);
  assert.equal(withPrevious.issues.length, 1);
  assert.match(withPrevious.issues[0], /Actions/);
  assert.equal(withPrevious.contacts.length, 5, 'les contacts restent affichés');

  const firstLoad = await load(sampleTables(), { docApi: { failing: ['Actions', 'GT'] } });
  assert.deepEqual(firstLoad.referenceMaps.Actions, {});
  assert.match(firstLoad.issues[0], /Actions, GT/);
});

test('loadDirectory refuses a BDD table that lacks a required column instead of silently showing nothing', async () => {
  for (const column of ['nom', 'prenom', 'Etablissement', 'perimetre']) {
    const tables = sampleTables();
    delete tables.BDD[column];
    await assert.rejects(
      load(tables),
      error => error instanceof DirectoryLoadError && error.message.includes(`« ${column} »`) && error.message.includes('BDD')
    );
  }
});

test('loadDirectory works without the optional BDD columns (Fonction, email, phone, PUI role) and uses them when they come back', async () => {
  const bare = sampleTables();
  delete bare.BDD.Fonction;
  delete bare.BDD.email;
  const withoutOptional = await load(bare);
  assert.equal(withoutOptional.contacts.length, 5);
  assert.deepEqual(withoutOptional.issues, []);

  const { contacts } = await load(withOptionalColumns(sampleTables()));
  assert.equal(contacts[0].numero_de_telephone, 556789012);
  assert.deepEqual(contacts[0].labels.role, ['Référent qualité']);
  assert.deepEqual(contacts[1].labels.role, []);
});

test('loadDirectory ignores Accepte_apparaitre for now: BDD still holds a formula that returns False for everyone', async () => {
  const tables = sampleTables();
  assert.ok(tables.BDD.Accepte_apparaitre.every(value => value === false));
  const { contacts } = await load(tables);
  assert.equal(contacts.length, 5);
});

test('loadDirectory explains an empty directory instead of leaving an unexplained « 0 contact »', async () => {
  const noEtablissement = sampleTables();
  noEtablissement.BDD.Etablissement = noEtablissement.BDD.Etablissement.map(() => 0);
  const noPerimetre = sampleTables();
  noPerimetre.BDD.perimetre = noPerimetre.BDD.perimetre.map(() => ['L']);
  const nothingValidated = sampleTables();
  nothingValidated.Etablissements.ok_pour_apparaitre = nothingValidated.Etablissements.ok_pour_apparaitre.map(() => false);

  const explain = async tables => (await load(tables)).issues;
  assert.match((await explain(noEtablissement))[0], /Etablissement est vide/);
  assert.match((await explain(noPerimetre))[0], /perimetre est vide/);
  assert.match((await explain(nothingValidated))[0], /Aucun contact affichable/);
});

test('loadDirectory stays quiet when the BDD table is genuinely empty', async () => {
  const tables = sampleTables();
  Object.keys(tables.BDD).forEach(column => { tables.BDD[column] = []; });
  const { contacts, issues } = await load(tables);
  assert.deepEqual([contacts, issues], [[], []]);
});

test('loadDirectory: duplicate acronyms hide nobody when contacts reference their own Etablissements row', async () => {
  const { contacts, issues } = await load(withDuplicateCHU(sampleTables()));
  assert.deepEqual(contacts.map(c => c.nom), ['Martin', 'Durand', 'Hostile', 'Bergonié', 'Bernard'],
    'chaque contact garde le statut de sa propre ligne (ici la ligne validée, id 1)');
  assert.deepEqual(issues, []);
});

test('loadDirectory: when Grist sends the establishment as text, duplicate acronyms with different statuses hide their contacts and are reported', async () => {
  const tables = withDuplicateCHU(sampleTables());
  const textLabels = { 1: 'CHU', 2: 'UBM', 3: 'Clinique', 4: 'INSERM', 5: 'Institut Bergonié', 0: '' };
  tables.BDD.Etablissement = tables.BDD.Etablissement.map(id => textLabels[id]);
  const { contacts, issues } = await load(tables);
  assert.deepEqual(contacts.map(c => c.nom), ['Durand', 'Bergonié'], 'plus aucun contact du CHU');
  assert.match(issues[0], /CHU/);
});
