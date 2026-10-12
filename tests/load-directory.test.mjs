import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectory, DirectoryLoadError } from '../grist-data.js';
import { sampleTables, withoutOptionalColumns, DEFAULT_CARD_NAMES } from './fixtures.mjs';

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
  assert.deepEqual(referenceMaps.instances, { 1: 'CME', 3: 'COVIRIS' }, 'libellé corrigé prioritaire ; la ligne sans libellé est ignorée');
  assert.deepEqual(referenceMaps.actions, { 1: 'Vaccination', 2: 'Audit' }, 'libellé brut quand aucun libellé corrigé n\'est rempli');
  assert.deepEqual(referenceMaps.competences, { 1: 'Oncologie', 2: 'Hématologie', 3: 'Pharmacovigilance', 4: 'Divers' });
  assert.deepEqual(referenceMaps.etablissement, { 1: 'CHU', 2: 'UBM', 3: 'Clinique', 4: 'INSERM', 5: 'Institut Bergonié' });
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
  const previousMaps = { actions: { 1: 'Vaccination', 2: 'Audit' } };
  const withPrevious = await load(sampleTables(), { docApi: { failing: ['Actions'] }, load: { previousMaps } });
  assert.deepEqual(withPrevious.referenceMaps.actions, previousMaps.actions);
  assert.equal(withPrevious.issues.length, 1);
  assert.match(withPrevious.issues[0], /Actions/);
  assert.equal(withPrevious.contacts.length, 5, 'les contacts restent affichés');

  const firstLoad = await load(sampleTables(), { docApi: { failing: ['Actions', 'GT'] } });
  assert.deepEqual(firstLoad.referenceMaps.actions, {});
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

test('loadDirectory refuses an Etablissements table that lacks a visibility column instead of hiding every contact', async () => {
  for (const column of ['fondateur', 'partenaire', 'ok_pour_apparaitre']) {
    const tables = sampleTables();
    delete tables.Etablissements[column];
    await assert.rejects(
      load(tables),
      error => error instanceof DirectoryLoadError && error.message.includes(`« ${column} »`) && error.message.includes('Etablissements')
    );
  }
});

test('loadDirectory reports a reference table none of whose label columns exist, and keeps the directory', async () => {
  const tables = sampleTables();
  delete tables.Actions.Actions;
  delete tables.Actions.Actions_corrigees;
  const log = recordingLog();
  const { contacts, referenceMaps, issues } = await loadDirectory(fakeDocApi(tables), { log });
  assert.equal(contacts.length, 5, 'les contacts restent affichés');
  assert.deepEqual(referenceMaps.actions, {});
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Actions \(Actions_corrigees ou Actions\)/);
  assert.ok(log.warnings.some(args => String(args[0]).includes('Actions') && String(args[0]).includes('introuvable')));
});

test('loadDirectory falls back to the raw label with a console warning when only the corrected column is missing', async () => {
  const tables = sampleTables();
  delete tables.Actions.Actions_corrigees;
  const log = recordingLog();
  const { referenceMaps, issues } = await loadDirectory(fakeDocApi(tables), { log });
  assert.deepEqual(referenceMaps.actions, { 1: 'Vaccination', 2: 'Audit' });
  assert.deepEqual(issues, [], 'pas de bandeau : les libellés bruts suffisent');
  assert.ok(log.warnings.some(args => String(args[0]).includes('Actions_corrigees')));
});

test('loadDirectory reads the phone and the PUI role that BDD now holds', async () => {
  const { contacts } = await load(sampleTables());
  assert.equal(contacts[0].numero_de_telephone, 556789012);
  assert.deepEqual(contacts[0].labels.role, ['Référent qualité']);
  assert.deepEqual(contacts[1].labels.role, []);
});

test('loadDirectory works without the optional BDD columns (Fonction, email, phone, PUI role): same contacts, no issue', async () => {
  const bare = withoutOptionalColumns(sampleTables());
  delete bare.BDD.Fonction;
  delete bare.BDD.email;
  const { contacts, issues } = await load(bare);
  assert.equal(contacts.length, 5);
  assert.deepEqual(issues, []);
  assert.deepEqual(contacts.map(contact => contact.labels.role), contacts.map(() => []));
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

// ===== Compétences macro : une colonne de plus de la table Competences =====

test('loadDirectory gives each contact the domains of its skills, reading the Competences table once', async () => {
  const docApi = fakeDocApi(sampleTables());
  const { contacts, referenceMaps } = await loadDirectory(docApi, { log: recordingLog() });
  assert.equal(docApi.calls.Competences, 1);
  assert.deepEqual(referenceMaps.macro, { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Pharmacie', 4: 'Autres' },
    'domaine écrit autrement unifié ; compétence non classée sous « Autres »');
  const byName = Object.fromEntries(contacts.map(c => [c.nom, c.labels]));
  assert.deepEqual(byName.Martin.competences, ['Oncologie', 'Hématologie']);
  assert.deepEqual(byName.Martin.macro, ['Cancérologie'], 'deux compétences du même domaine : un seul domaine');
  assert.deepEqual(byName.Durand.macro, ['Pharmacie']);
  assert.deepEqual(byName['Bergonié'].macro, ['Autres']);
  assert.deepEqual(byName.Bernard.macro, [], 'aucune compétence : aucun domaine');
});

test('loadDirectory tells the console which skills are not classed in a domain, by row id', async () => {
  const log = recordingLog();
  await loadDirectory(fakeDocApi(sampleTables()), { log });
  const info = log.infos.find(args => String(args[0]).includes('sans regroupement'));
  assert.ok(info, 'un message de console sur les compétences non classées');
  assert.deepEqual(info[1], ['4']);
});

test('loadDirectory without any domain filled in classes every skill under « Autres » and says so only in the console', async () => {
  const tables = sampleTables();
  tables.Competences.Macro_competences = tables.Competences.Macro_competences.map(() => '');
  const { referenceMaps, issues } = await load(tables);
  assert.deepEqual(Object.values(referenceMaps.macro), ['Autres', 'Autres', 'Autres', 'Autres']);
  assert.deepEqual(issues, []);
});

test('loadDirectory without the Macro_competences column leaves the domain filter empty and the detailed skills intact', async () => {
  const tables = sampleTables();
  delete tables.Competences.Macro_competences;
  const { contacts, referenceMaps, issues } = await load(tables);
  assert.deepEqual(referenceMaps.macro, {}, 'pas de faux domaine « Autres » pour tout le monde');
  assert.equal(Object.keys(referenceMaps.competences).length, 4);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Competences \(Macro_competences\)/);
  assert.ok(contacts.every(c => c.labels.macro.length === 0));
  assert.deepEqual(contacts[0].labels.competences, ['Oncologie', 'Hématologie']);
});

test('loadDirectory reuses the previous skills and domains together when the Competences table cannot be read, and names the table once', async () => {
  const previousMaps = {
    competences: { 1: 'Oncologie', 2: 'Hématologie', 3: 'Pharmacovigilance', 4: 'Divers' },
    macro: { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Pharmacie', 4: 'Autres' }
  };
  const { referenceMaps, contacts, issues } = await load(sampleTables(), { docApi: { failing: ['Competences'] }, load: { previousMaps } });
  assert.deepEqual(referenceMaps.macro, previousMaps.macro);
  assert.deepEqual(referenceMaps.competences, previousMaps.competences);
  assert.deepEqual(contacts[0].labels.macro, ['Cancérologie']);
  assert.deepEqual(issues.length, 1);
  assert.match(issues[0], /Competences/);
  assert.equal(issues[0].match(/Competences/g).length, 1, 'table nommée une seule fois');

  const firstLoad = await load(sampleTables(), { docApi: { failing: ['Competences'] } });
  assert.deepEqual([firstLoad.referenceMaps.macro, firstLoad.referenceMaps.competences], [{}, {}]);
});
