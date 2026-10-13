import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectory, DirectoryLoadError } from '../grist-data.js';
import { FILTERS } from '../constants.js';
import { computeFilterCounts, createEmptyFilterState, filterContacts, menuGroups } from '../filters.js';
import { sampleTables, withoutOptionalColumns, withTaskActions, DEFAULT_CARD_NAMES, HOSTILE_FIRST_NAME } from './fixtures.mjs';

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
  // Dans l'ordre des cartes : Bergonié, Bernard, Durand, Hostile, Martin.
  assert.deepEqual(contacts.map(c => c.etablissement_label), ['Institut Bergonié', 'CHU', 'UBM', 'CHU', 'CHU'],
    'tous les contacts affichables ont leur établissement');
  assert.deepEqual(issues, []);
  Object.values(docApi.calls).forEach(count => assert.equal(count, 1));
  assert.equal(docApi.calls.Etablissements, 1, 'Etablissements n\'est lu qu\'une fois (libellés ET indicateurs)');
  assert.equal(docApi.calls.BDD, 1);
});

test('loadDirectory sorts the contacts by family name then first name, and keeps the order of the rows for homonyms', async () => {
  const tables = sampleTables();
  // Hugo Bernard (ligne 10) devient un second « Gina Bergonié », puis les lignes 9 et 10 échangent leur place.
  tables.BDD.prenom[9] = 'Gina';
  tables.BDD.nom[9] = 'Bergonié';
  const swapped = tables.BDD;
  Object.keys(swapped).forEach(column => [swapped[column][8], swapped[column][9]] = [swapped[column][9], swapped[column][8]]);
  const { contacts } = await load(tables);
  assert.deepEqual(contacts.map(c => `${c.prenom} ${c.nom}`),
    ['Gina Bergonié', 'Gina Bergonié', 'Bob Durand', `${HOSTILE_FIRST_NAME} Hostile`, 'Ana Martin'], 'par nom de famille, ni dans l\'ordre des lignes ni par prénom d\'abord');
  assert.deepEqual(contacts.slice(0, 2).map(c => c.id), [10, 9], 'homonymes : l\'ordre des lignes de la table');
});

test('loadDirectory reads the tables of the new structure and none of the old ones, nor a funders table', async () => {
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
  for (const column of ['nom', 'prenom', 'Etablissement', 'Accepte_apparaitre']) {
    const tables = sampleTables();
    delete tables.BDD[column];
    await assert.rejects(
      load(tables),
      error => error instanceof DirectoryLoadError && error.message.includes(`« ${column} »`) && error.message.includes('BDD')
    );
  }
});

test('loadDirectory does not need the perimetre column, and an empty perimetre hides nobody', async () => {
  const withoutColumn = sampleTables();
  delete withoutColumn.BDD.perimetre;
  const { contacts, issues } = await load(withoutColumn);
  assert.equal(contacts.length, 5, 'les mêmes contacts, sans colonne perimetre');
  assert.deepEqual(issues, []);

  const emptyEverywhere = sampleTables();
  emptyEverywhere.BDD.perimetre = emptyEverywhere.BDD.perimetre.map(() => ['L']);
  assert.equal((await load(emptyEverywhere)).contacts.length, 5, 'les mêmes contacts, avec un périmètre vide partout');
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
  const [ana, bob] = ['Ana', 'Bob'].map(prenom => contacts.find(contact => contact.prenom === prenom));
  assert.equal(ana.numero_de_telephone, 556789012);
  assert.deepEqual(ana.labels.role, ['Référent qualité']);
  assert.deepEqual(bob.labels.role, []);
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

// ===== Consentement individuel : BDD.Accepte_apparaitre =====

test('loadDirectory hides the people who have not accepted to appear, with no banner: refusals are normal', async () => {
  const { contacts, issues } = await load(sampleTables());
  const names = contacts.map(contact => contact.prenom);
  assert.deepEqual(names, ['Gina', 'Hugo', 'Bob', HOSTILE_FIRST_NAME, 'Ana'], 'dans l\'ordre des noms : Bergonié, Bernard, Durand, Hostile, Martin');
  assert.ok(!names.includes('Iris'), 'Iris a refusé d\'apparaître');
  assert.ok(!names.includes('Jules'), 'Jules n\'a pas répondu : cellule vide');
  assert.deepEqual(issues, []);
});

test('loadDirectory counts only a checked box as consent, never an empty or look-alike value', async () => {
  for (const value of [false, null, undefined, 0, '', 'true', 'oui', 1]) {
    const tables = sampleTables();
    tables.BDD.Accepte_apparaitre[0] = value; // Ana
    const { contacts } = await load(tables);
    assert.ok(!contacts.some(contact => contact.prenom === 'Ana'), `${JSON.stringify(value)} n'est pas un accord`);
    assert.equal(contacts.length, 4);
  }
});

test('loadDirectory shows a person as soon as they accept, and consent never overrides the establishment rules', async () => {
  const tables = sampleTables();
  tables.BDD.Accepte_apparaitre[10] = true; // Iris
  tables.BDD.Accepte_apparaitre[11] = true; // Jules
  const { contacts } = await load(tables);
  assert.deepEqual(contacts.map(contact => contact.prenom), ['Gina', 'Hugo', 'Bob', HOSTILE_FIRST_NAME, 'Ana', 'Iris', 'Jules']);
  const accepted = tables.BDD.prenom.filter((_, index) => tables.BDD.Accepte_apparaitre[index] === true);
  ['Carla', 'Dan', 'Eve', 'Fred'].forEach(name => {
    assert.ok(accepted.includes(name), `${name} a accepté d'apparaître`);
    assert.ok(!contacts.some(contact => contact.prenom === name), `${name} reste masqué par une autre règle`);
  });
});

test('loadDirectory says why the directory is empty when nobody has accepted to appear', async () => {
  const tables = sampleTables();
  tables.BDD.Accepte_apparaitre = tables.BDD.Accepte_apparaitre.map(() => false);
  const { contacts, issues } = await load(tables);
  assert.equal(contacts.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Personne n'a accepté d'apparaître/);
  assert.match(issues[0], /Accepte_apparaitre/);
});

test('loadDirectory does not blame the consent column when it is another rule that empties the directory', async () => {
  const nothingValidated = sampleTables();
  nothingValidated.Etablissements.ok_pour_apparaitre = nothingValidated.Etablissements.ok_pour_apparaitre.map(() => false);
  const { issues } = await load(nothingValidated);
  assert.match(issues[0], /Aucun contact affichable/);
});

test('loadDirectory tells the console how many people are hidden for lack of consent, never who', async () => {
  const log = recordingLog();
  await loadDirectory(fakeDocApi(sampleTables()), { log });
  const info = log.infos.find(args => String(args[0]).startsWith('[CONSENTEMENT]'));
  assert.ok(info, 'un message de console sur le consentement');
  assert.match(info[0], /^\[CONSENTEMENT\] 2\/12 /, 'Iris et Jules, sur les 12 lignes de BDD');
  assert.ok(!/Iris|Jules|@/.test(JSON.stringify(log.infos)), 'ni nom ni adresse dans la console');
});

test('loadDirectory explains an empty directory instead of leaving an unexplained « 0 contact »', async () => {
  const noEtablissement = sampleTables();
  noEtablissement.BDD.Etablissement = noEtablissement.BDD.Etablissement.map(() => 0);
  const nothingValidated = sampleTables();
  nothingValidated.Etablissements.ok_pour_apparaitre = nothingValidated.Etablissements.ok_pour_apparaitre.map(() => false);

  const explain = async tables => (await load(tables)).issues;
  assert.match((await explain(noEtablissement))[0], /Etablissement est vide/);
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
  assert.deepEqual(contacts.map(c => c.nom), ['Bergonié', 'Bernard', 'Durand', 'Hostile', 'Martin'],
    'chaque contact garde le statut de sa propre ligne (ici la ligne validée, id 1)');
  assert.deepEqual(issues, []);
});

test('loadDirectory: when Grist sends the establishment as text, duplicate acronyms with different statuses hide their contacts and are reported', async () => {
  const tables = withDuplicateCHU(sampleTables());
  const textLabels = { 1: 'CHU', 2: 'UBM', 3: 'Clinique', 4: 'INSERM', 5: 'Institut Bergonié', 0: '' };
  tables.BDD.Etablissement = tables.BDD.Etablissement.map(id => textLabels[id]);
  const { contacts, issues } = await load(tables);
  assert.deepEqual(contacts.map(c => c.nom), ['Bergonié', 'Durand'], 'plus aucun contact du CHU');
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
  assert.deepEqual(contacts.find(c => c.prenom === 'Ana').labels.competences, ['Oncologie', 'Hématologie']);
});

test('loadDirectory reuses the previous skills and domains together when the Competences table cannot be read, and names the table once', async () => {
  const previousMaps = {
    competences: { 1: 'Oncologie', 2: 'Hématologie', 3: 'Pharmacovigilance', 4: 'Divers' },
    macro: { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Pharmacie', 4: 'Autres' }
  };
  const { referenceMaps, contacts, issues } = await load(sampleTables(), { docApi: { failing: ['Competences'] }, load: { previousMaps } });
  assert.deepEqual(referenceMaps.macro, previousMaps.macro);
  assert.deepEqual(referenceMaps.competences, previousMaps.competences);
  assert.deepEqual(contacts.find(c => c.prenom === 'Ana').labels.macro, ['Cancérologie']);
  assert.deepEqual(issues.length, 1);
  assert.match(issues[0], /Competences/);
  assert.equal(issues[0].match(/Competences/g).length, 1, 'table nommée une seule fois');

  const firstLoad = await load(sampleTables(), { docApi: { failing: ['Competences'] } });
  assert.deepEqual([firstLoad.referenceMaps.macro, firstLoad.referenceMaps.competences], [{}, {}]);
});

// ===== Tâches rangées par action : le numéro avant le point du libellé =====
// Aucune colonne ne relie une tâche à son action : « 1.3 Animer le réseau » est une tâche de
// l'action 1, que la table Actions numérote dans son libellé (« Action 1 : … »).

const VACCINATION = 'Action 1 : Vaccination';
const AUDIT = 'Action 2 : Audit';
const actionsOf = contacts => Object.fromEntries(contacts.map(c => [c.nom, c.labels.macroTaches]));
const NUMBERED_GROUPS = { 1: VACCINATION, 2: VACCINATION, 3: AUDIT, 4: 'Sans action' };

test('loadDirectory gives each contact the actions of its tasks: the number of a task is the number of its action, « Sans action » when it has none', async () => {
  const docApi = fakeDocApi(withTaskActions());
  const { contacts, referenceMaps, issues } = await loadDirectory(docApi, { log: recordingLog() });
  assert.equal(docApi.calls.Taches, 1, 'la table Taches n\'est lue qu\'une fois, pour les tâches et leurs actions');
  assert.equal(docApi.calls.Actions, 1);
  assert.deepEqual(referenceMaps.taches, { 1: '1.1 Relecture', 2: '1.2 Rappel vaccinal', 3: '2.1 Inspection', 4: 'Veille' });
  assert.deepEqual(referenceMaps.macroTaches, NUMBERED_GROUPS);
  const byName = Object.fromEntries(contacts.map(c => [c.nom, c.labels]));
  assert.deepEqual(byName.Martin.taches, ['1.1 Relecture', '2.1 Inspection']);
  assert.deepEqual(byName.Martin.macroTaches, [VACCINATION, AUDIT], 'deux tâches de deux actions : deux groupes');
  assert.deepEqual(byName.Durand.macroTaches, [AUDIT]);
  assert.deepEqual(byName['Bergonié'].macroTaches, [VACCINATION]);
  assert.deepEqual(byName.Bernard.macroTaches, ['Sans action']);
  assert.deepEqual(byName.Hostile.macroTaches, [], 'aucune tâche : aucune action');
  assert.deepEqual(issues, []);
});

test('loadDirectory names the group of a task by the label of its action, as the Actions filter shows it: the corrected one first', async () => {
  const tables = withTaskActions();
  tables.Actions.Actions_corrigees = ['Action 1 : Vaccinations (corrigé)', 'Action 2 : Audit'];
  const { referenceMaps } = await load(tables);
  assert.equal(referenceMaps.actions[1], 'Action 1 : Vaccinations (corrigé)', 'le filtre Actions propose le libellé corrigé');
  assert.deepEqual(referenceMaps.macroTaches, { 1: 'Action 1 : Vaccinations (corrigé)', 2: 'Action 1 : Vaccinations (corrigé)', 3: AUDIT, 4: 'Sans action' },
    'le groupe porte le même nom que l\'option du filtre Actions');
});

test('loadDirectory makes one menu entry of the corrected labels that differ only by case, filtering on it covers every row, and the action of its number, written « [ PUI ] Action n », still ranges it', async () => {
  const tables = withTaskActions();
  tables.Actions.Actions = ['[ PUI ] Action 1: Vaccination', '[ PUI ] Action 2: Audit'];
  tables.Taches = {
    id: [1, 2, 3, 4, 5],
    Taches: ['relecture', 'Relecture (v2)', 'RELECTURE', 'Inspection', 'Veille'],
    Taches_corrige: ['Tâche 1.1 : Relecture', 'Tâche 1.1 : Relecture', 'tâche 1.1 : relecture', 'Tâche 2.1 : Inspection', 'Veille'],
    Taches_role: ['', '', '', '', '']
  };
  // Ana porte la ligne 1, Bob les lignes 2 et 3 (écrites à la casse près), Gina la ligne 4, Hugo la ligne 5.
  const tasksOf = { 1: ['L', 1], 2: ['L', 2, 3], 9: ['L', 4], 10: ['L', 5] };
  tables.BDD.Taches = tables.BDD.id.map(id => tasksOf[id] || ['L']);
  const { contacts, referenceMaps } = await load(tables);

  assert.deepEqual(menuGroups(FILTERS.find(filter => filter.key === 'taches'), referenceMaps), [
    { label: '[ PUI ] Action 1: Vaccination', values: ['Tâche 1.1 : Relecture'] },
    { label: '[ PUI ] Action 2: Audit', values: ['Tâche 2.1 : Inspection'] },
    { label: 'Sans action', values: ['Veille'] }
  ]);
  const state = createEmptyFilterState();
  state.taches.add('Tâche 1.1 : Relecture');
  assert.deepEqual(filterContacts(contacts, state, '').map(contact => contact.nom).sort(), ['Durand', 'Martin'],
    'les porteurs de la ligne 1, de la ligne 2 et de la ligne 3 sont tous trouvés');
});

test('loadDirectory reads the number in the label the menu shows: the corrected label of a task, not its raw label', async () => {
  const tables = withTaskActions();
  tables.Taches.Taches_corrige = ['1.1 Relecture', '1.2 rappel vaccinal', '2.1 Inspection', '2.4 Veille réglementaire']; // « Veille » reçoit un numéro, corrigé
  tables.Taches.Taches[0] = 'Relecture sans numéro'; // le libellé brut perd le sien : seul le corrigé compte
  const { referenceMaps } = await load(tables);
  assert.deepEqual(referenceMaps.macroTaches, { 1: VACCINATION, 2: VACCINATION, 3: AUDIT, 4: AUDIT });
  assert.equal(referenceMaps.taches[1], '1.1 Relecture');
});

test('loadDirectory understands the usual ways to write a number: « 1.3 », « T1.3 », « Tâche 1.3 » for a task, « Action 1 », « 1. », « A1 » for an action', async () => {
  const tasks = {
    '1.1 Relecture': 1, 'T1.1 Relecture': 1, 'Tâche 1.1 : Relecture': 1, 'tache n° 1.1 - Relecture': 1, '01.1 Relecture': 1, '1.1': 1,
    '2.10 Clôture': 2, '2.1': 2
  };
  const actions = [
    ['Action 1 : Vaccination', 'Action 2 : Audit'],
    ['Action 1: Vaccination', 'Action 2: Audit'],
    ['1. Vaccination', '2. Audit'],
    ['1 - Vaccination', '2 - Audit'],
    ['A1 Vaccination', 'A2 Audit'],
    ['Action n° 1', 'Action n° 2'],
    ['ACTION 1', 'action 2']
  ];
  for (const [task, number] of Object.entries(tasks)) {
    for (const labels of actions) {
      const tables = withTaskActions();
      tables.Actions.Actions = labels;
      tables.Taches.Taches = [task, '9.9 Hors action', 'Sans numéro', 'Sans numéro 2'];
      tables.Taches.Taches_corrige = ['', '', '', ''];
      const { referenceMaps } = await load(tables);
      assert.deepEqual(referenceMaps.macroTaches, { 1: labels[number - 1], 2: 'Sans action', 3: 'Sans action', 4: 'Sans action' },
        `« ${task} » dans « ${labels[0]} »`);
    }
  }
});

test('loadDirectory files a task without number, or with the number of no action, under « Sans action », and tells the console which, by row id', async () => {
  const tables = withTaskActions();
  tables.Taches.Taches = ['1.1 Relecture', '7.1 Action inconnue', '2.1 Inspection', 'Veille'];
  tables.Taches.Taches_corrige = ['', '', '', ''];
  const log = recordingLog();
  const { referenceMaps, issues } = await loadDirectory(fakeDocApi(tables), { log });
  assert.deepEqual(referenceMaps.macroTaches, { 1: VACCINATION, 2: 'Sans action', 3: AUDIT, 4: 'Sans action' });
  assert.deepEqual(issues, [], 'une tâche sans action n\'est pas une anomalie à signaler à tout le monde');
  const info = log.infos.find(args => String(args[0]).includes('sans regroupement') && String(args[0]).includes('Taches'));
  assert.ok(info, 'un message de console sur les tâches sans action');
  assert.deepEqual(info[1], ['2', '4']);
  assert.match(info[0], /macroTaches.*« Sans action »/);
});

test('loadDirectory accepts an action 0, for the tasks of a coordination that comes before the first action', async () => {
  const tables = withTaskActions();
  tables.Actions.Actions = ['Action 0: Coordination', 'Action 2: Audit'];
  tables.Taches.Taches = ['0.1 Cadrage', '0.2 Suivi', '2.1 Inspection', 'Veille'];
  tables.Taches.Taches_corrige = ['', '', '', ''];
  const { referenceMaps } = await load(tables);
  assert.deepEqual(referenceMaps.macroTaches, { 1: 'Action 0: Coordination', 2: 'Action 0: Coordination', 3: 'Action 2: Audit', 4: 'Sans action' });
});

test('loadDirectory takes the first row when two actions carry the same number, and merges nothing else', async () => {
  const tables = withTaskActions();
  tables.Actions = { id: [1, 2, 3], Actions: ['Action 2 : Audit', 'Action 1 : Vaccination', 'Action 1 : Vaccination (doublon)'], Actions_corrigees: ['', '', ''] };
  const { referenceMaps } = await load(tables);
  assert.deepEqual(referenceMaps.macroTaches, NUMBERED_GROUPS, 'la ligne 2 l\'emporte sur la ligne 3, même numéro');
});

test('loadDirectory keeps the tasks flat when no task is tied to an action, without banner and with the reason in the console', async () => {
  const noNumberedAction = withTaskActions();
  noNumberedAction.Actions.Actions = ['Vaccination', 'Audit'];
  const noNumberedTask = withTaskActions();
  noNumberedTask.Taches.Taches = ['Relecture', 'Rappel vaccinal', 'Inspection', 'Veille'];
  noNumberedTask.Taches.Taches_corrige = ['', '', '', ''];
  const noMatching = withTaskActions();
  noMatching.Taches.Taches = ['7.1 Relecture', '7.2 Rappel', '8.1 Inspection', '8.2 Veille'];
  noMatching.Taches.Taches_corrige = ['', '', '', ''];
  const cases = { 'aucune action numérotée': noNumberedAction, 'aucune tâche numérotée': noNumberedTask, 'aucun numéro en commun': noMatching, 'données de départ': sampleTables() };
  for (const [name, tables] of Object.entries(cases)) {
    const log = recordingLog();
    const { referenceMaps, issues, contacts } = await loadDirectory(fakeDocApi(tables), { log });
    assert.deepEqual(referenceMaps.macroTaches, {}, `${name} : pas de faux groupe « Sans action » pour tout le monde`);
    assert.ok(Object.keys(referenceMaps.taches).length > 0, `${name} : les tâches restent lisibles`);
    assert.deepEqual(issues, [], `${name} : pas de bandeau`);
    assert.ok(contacts.every(c => c.labels.macroTaches.length === 0), name);
    assert.ok(log.infos.some(args => String(args[0]).includes('le menu reste à plat') && String(args[0]).includes('macroTaches')), `${name} : la console le dit`);
  }
});

test('loadDirectory counts, in the console, the tasks and the actions that carry a number, to tell why the menu stays flat', async () => {
  const tables = withTaskActions();
  tables.Actions.Actions = ['Vaccination', 'Audit'];
  const log = recordingLog();
  await loadDirectory(fakeDocApi(tables), { log });
  const info = log.infos.find(args => String(args[0]).includes('le menu reste à plat'));
  assert.match(info[0], /3 sur 4 ont un numéro, 0 action\(s\) en ont un/);
});

test('loadDirectory says nothing about the tasks when there is no task at all', async () => {
  const tables = withTaskActions();
  tables.Taches = { id: [], Taches: [], Taches_corrige: [], Taches_role: [] };
  tables.BDD.Taches = tables.BDD.id.map(() => ['L']);
  const log = recordingLog();
  const { referenceMaps, issues } = await loadDirectory(fakeDocApi(tables), { log });
  assert.deepEqual(referenceMaps.macroTaches, {});
  assert.deepEqual(issues, []);
  assert.deepEqual(log.infos.filter(args => String(args[0]).includes('macroTaches') && String(args[0]).includes('à plat')), []);
});

test('loadDirectory still asks for the label column of Taches, once: the grouping reads no column of its own', async () => {
  const tables = withTaskActions();
  delete tables.Taches.Taches;
  delete tables.Taches.Taches_corrige;
  const { issues, referenceMaps } = await load(tables);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Taches \(Taches_corrige ou Taches\)/);
  assert.equal(issues[0].match(/Taches \(/g).length, 1, 'table nommée une seule fois');
  assert.deepEqual(referenceMaps.macroTaches, {});
});

test('loadDirectory keeps the tasks grouped with the previous labels when the Taches table cannot be read, and names the table once', async () => {
  const previousMaps = { taches: { 1: '1.1 Relecture', 2: '1.2 Rappel vaccinal', 3: '2.1 Inspection', 4: 'Veille' } };
  const { referenceMaps, contacts, issues } = await load(withTaskActions(), { docApi: { failing: ['Taches'] }, load: { previousMaps } });
  assert.deepEqual(referenceMaps.taches, previousMaps.taches);
  assert.deepEqual(referenceMaps.macroTaches, NUMBERED_GROUPS, 'les actions se recalculent sur les libellés conservés');
  assert.deepEqual(actionsOf(contacts).Martin, [VACCINATION, AUDIT]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Taches/);
  assert.equal(issues[0].match(/Taches/g).length, 1, 'table nommée une seule fois');

  const firstLoad = await load(withTaskActions(), { docApi: { failing: ['Taches'] } });
  assert.deepEqual([firstLoad.referenceMaps.macroTaches, firstLoad.referenceMaps.taches], [{}, {}]);
});

test('loadDirectory keeps the tasks flat when the Actions table cannot be read and nothing is known of it, and grouped with the previous labels otherwise', async () => {
  const first = await load(withTaskActions(), { docApi: { failing: ['Actions'] } });
  assert.deepEqual(first.referenceMaps.macroTaches, {}, 'sans le nom des actions, aucune tâche n\'est rattachée');
  assert.equal(Object.keys(first.referenceMaps.taches).length, 4);
  assert.equal(first.issues.length, 1);
  assert.match(first.issues[0], /Actions/);

  const previousMaps = { actions: { 1: VACCINATION, 2: AUDIT } };
  const next = await load(withTaskActions(), { docApi: { failing: ['Actions'] }, load: { previousMaps } });
  assert.deepEqual(next.referenceMaps.macroTaches, NUMBERED_GROUPS);
});

test('loadDirectory follows a change made in Grist: an action renumbered or a task renumbered moves the tasks', async () => {
  const tables = withTaskActions();
  const first = await load(tables);
  tables.Taches.Taches_corrige[0] = '2.1 Relecture'; // « Relecture » passe à l'audit
  tables.Actions.Actions[1] = 'Action 2 : Contrôle'; // l'audit est renommé
  const second = await load(tables);
  assert.deepEqual(first.referenceMaps.macroTaches, NUMBERED_GROUPS);
  assert.deepEqual(second.referenceMaps.macroTaches, { 1: 'Action 2 : Contrôle', 2: VACCINATION, 3: 'Action 2 : Contrôle', 4: 'Sans action' });
  assert.deepEqual(actionsOf(second.contacts).Martin, ['Action 2 : Contrôle']);
});

test('loadDirectory ranges the tasks of a contact whose cell holds the text of the task, not its row id', async () => {
  const tables = withTaskActions();
  tables.BDD.Taches[0] = ['L', '1.1 relecture', 'Tâche inconnue'];
  const { contacts } = await load(tables);
  assert.deepEqual(actionsOf(contacts).Martin, [VACCINATION], 'le texte retrouve sa ligne ; « Tâche inconnue » est ignorée');
});

// ===== Libellés corrigés : la colonne corrigée seule, une entrée par libellé =====

test('loadDirectory reads the corrected label alone once a table fills one: a row without it is left out, and the console counts them', async () => {
  const tables = withTaskActions();
  tables.Taches.Taches_corrige = ['1.1 Relecture', '', '2.1 Inspection', ''];
  const log = recordingLog();
  const { referenceMaps, contacts } = await loadDirectory(fakeDocApi(tables), { log });
  assert.deepEqual(referenceMaps.taches, { 1: '1.1 Relecture', 3: '2.1 Inspection' }, 'les lignes 2 et 4 n\'ont pas de libellé corrigé : ni leur libellé brut, ni rien');
  assert.deepEqual(contacts.find(contact => contact.nom === 'Bergonié').labels.taches, [], 'sa seule tâche (ligne 2) n\'a pas de libellé corrigé : pas de tag');
  const info = log.infos.find(args => String(args[0]).startsWith('[REFS] taches (Taches)'));
  assert.match(info[0], /2 ligne\(s\) sans Taches_corrige, ignorée\(s\)/);
});

test('loadDirectory keeps the raw labels of a table that has no corrected label yet, so its filter is not empty', async () => {
  const tables = withTaskActions();
  tables.Taches.Taches_corrige = ['', '', '', ''];
  const { referenceMaps } = await load(tables);
  assert.deepEqual(referenceMaps.taches, { 1: '1.1 Relecture', 2: '1.2 rappel vaccinal', 3: '2.1 Inspection', 4: 'Veille' });
});

test('several raw rows with the same corrected label make one entry of the filter, which finds the contacts of every one of those rows', async () => {
  const tables = withTaskActions();
  tables.Taches = {
    id: [1, 2, 3, 4],
    Taches: ['1.1 Relecture', 'T1.1  relecture', '1.1 relecture (ancien)', 'Veille'],
    Taches_corrige: ['1.1 Relecture', '1.1 Relecture', '1.1 Relecture', 'Veille'],
    Taches_role: ['', '', '', '']
  };
  // Ana, Gina et Hugo portent chacun une ligne brute différente ; Bob aucune.
  const rowOf = { 1: ['L', 1], 9: ['L', 2], 10: ['L', 3] };
  tables.BDD.Taches = tables.BDD.id.map(id => rowOf[id] || ['L']);
  const { contacts, referenceMaps } = await load(tables);
  const group = menuGroups(FILTERS.find(filter => filter.key === 'taches'), referenceMaps).find(({ label }) => label === VACCINATION);
  assert.deepEqual(group.values, ['1.1 Relecture'], 'une seule entrée dans le menu, pas trois');
  const active = createEmptyFilterState();
  active.taches.add('1.1 Relecture');
  assert.deepEqual(filterContacts(contacts, active).map(contact => contact.nom).sort(), ['Bergonié', 'Bernard', 'Martin']);
  assert.equal(computeFilterCounts(contacts, createEmptyFilterState()).taches['1.1 relecture'], 3, 'le nombre de l\'entrée compte les trois contacts');
});
