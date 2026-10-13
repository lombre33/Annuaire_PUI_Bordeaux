import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIdentity, isReadOnlyAddress, responsableIds } from '../identity.js';
import { createFakeGrist } from './support/fake-grist.js';
import { PROBE_TABLE } from '../constants.js';
import { withIdentity, ANA_EMAIL, BOB_EMAIL, ADMIN_EMAIL, IRIS_EMAIL } from './fixtures.mjs';

// ===== readIdentity : qui est connecté ? (table-sonde à formules déclenchées) =====

function recordingLog() {
  const log = { infos: [], warnings: [], info: (...args) => log.infos.push(args), warn: (...args) => log.warnings.push(args) };
  return log;
}

// Un document, vu par une personne donnée.
function session(email, tables = withIdentity(), options = {}) {
  const fake = createFakeGrist({ tables, user: email === null ? null : { email }, ...options });
  return { ...fake, tables, log: recordingLog() };
}

const identify = (s, options = {}) => readIdentity(s.docApi, { log: s.log, ...options });

// Le nettoyage de la ligne de sonde part sans être attendu : on laisse les
// promesses en attente se terminer avant de relire le document.
const settle = () => new Promise(resolve => setImmediate(resolve));

test('readIdentity returns the e-mail Grist stamped on the probe row, and no administrator rights for an ordinary user', async () => {
  const s = session(BOB_EMAIL);
  const identity = await identify(s);
  assert.deepEqual(identity, { status: 'ready', email: BOB_EMAIL, admin: false, etablissements: [2], reason: '' });
});

test('readIdentity reports administrator rights from the ACL table, ignoring case and spaces in both addresses', async () => {
  const ana = await identify(session(` ${ANA_EMAIL.toUpperCase()} `));
  assert.equal(ana.status, 'ready');
  assert.equal(ana.admin, true, 'ACL écrit « Ana.Martin@CHU-Bordeaux.fr » : même personne');
  assert.equal((await identify(session(ADMIN_EMAIL))).admin, true);
  assert.equal((await identify(session(IRIS_EMAIL))).admin, false, 'présente dans BDD mais absente d\'ACL');
});

test('readIdentity grants administrator rights only for a probe Admin value that is exactly true', async () => {
  for (const stamped of ['oui', 'true', 1, null, '']) {
    const s = session(ANA_EMAIL, withIdentity(), { triggers: { Annuaire_Sonde: { Admin: () => stamped } } });
    const identity = await identify(s);
    assert.equal(identity.status, 'ready');
    assert.equal(identity.admin, false, `${JSON.stringify(stamped)} ne vaut pas administrateur`);
  }
});

// ===== Les établissements dont la personne est responsable (colonne Responsable_de de la sonde) =====

test('readIdentity lists the establishments the person is responsible for, from the probe column Responsable_de', async () => {
  const forEtab = async email => (await identify(session(email))).etablissements;
  assert.deepEqual(await forEtab(ANA_EMAIL), [1], 'Ana : responsable du CHU (ACL l\'écrit avec des majuscules)');
  assert.deepEqual(await forEtab(BOB_EMAIL), [2], 'Bob : responsable de son établissement, sans être administrateur');
  assert.deepEqual(await forEtab(ADMIN_EMAIL), [], 'un administrateur n\'est pas responsable pour autant');
  assert.deepEqual(await forEtab(IRIS_EMAIL), []);
});

test('readIdentity lists several establishments once each, in order, whatever the ACL rows look like', async () => {
  const tables = withIdentity();
  tables.ACL.id.push(4, 5, 6);
  tables.ACL.email.push(` ${BOB_EMAIL.toUpperCase()} `, BOB_EMAIL, BOB_EMAIL);
  tables.ACL.Responsable_de_l_Etablissement.push(5, 2, 0);
  tables.ACL.admin.push(false, false, true);
  assert.deepEqual((await identify(session(BOB_EMAIL, tables))).etablissements, [2, 5], 'doublon écarté, ligne sans établissement ignorée');
});

test('readIdentity has no establishment when the probe has no Responsable_de column, and says so without any address', async () => {
  const tables = withIdentity();
  delete tables.Annuaire_Sonde.Responsable_de;
  const s = session(ANA_EMAIL, tables);
  const identity = await identify(s);
  assert.equal(identity.status, 'ready');
  assert.equal(identity.admin, true, 'le reste de l\'identité ne dépend pas de cette colonne');
  assert.deepEqual(identity.etablissements, []);
  assert.match(JSON.stringify(s.log.infos), /Responsable_de.*GRIST_SETUP\.md/);
  assert.ok(!JSON.stringify(s.log.infos).includes('@'));
});

test('readIdentity ignores a Responsable_de value that is not a list of row numbers', async () => {
  for (const stamped of [null, '', 'oui', true, '0', -3, {}]) {
    const s = session(ANA_EMAIL, withIdentity(), { triggers: { Annuaire_Sonde: { Responsable_de: () => stamped } } });
    assert.deepEqual((await identify(s)).etablissements, [], `${JSON.stringify(stamped)} ne désigne aucun établissement`);
  }
  const listed = session(ANA_EMAIL, withIdentity(), { triggers: { Annuaire_Sonde: { Responsable_de: () => ['L', 4, 9] } } });
  assert.deepEqual((await identify(listed)).etablissements, [4, 9], 'une colonne de références (liste d\'identifiants) est lue de même');
});

test('responsableIds reads row numbers from text, from a list of references, or from nothing', () => {
  assert.deepEqual(responsableIds('1,3'), [1, 3]);
  assert.deepEqual(responsableIds('1, 3 ; 3'), [1, 3]);
  assert.deepEqual(responsableIds(['L', 2, 5]), [2, 5]);
  assert.deepEqual(responsableIds(['L']), []);
  assert.deepEqual(responsableIds(''), []);
  assert.deepEqual(responsableIds(null), []);
  assert.deepEqual(responsableIds(undefined), []);
  assert.deepEqual(responsableIds('0,7,7'), [7]);
  assert.deepEqual(responsableIds([1.5, 'x', 2]), [2]);
});

test('a viewer and an unidentified account are responsible for nothing', async () => {
  assert.deepEqual((await identify(session(ANA_EMAIL), { readOnly: true })).etablissements, []);
  assert.deepEqual((await identify(session(null))).etablissements, []);
});

test('readIdentity leaves the probe table empty: the row it adds is removed', async () => {
  const s = session(ANA_EMAIL);
  await identify(s);
  await settle();
  assert.deepEqual(s.calls.map(call => [call.action, call.table]),
    [['AddRecord', 'Annuaire_Sonde'], ['RemoveRecord', 'Annuaire_Sonde']]);
  assert.deepEqual(s.tables.Annuaire_Sonde, { id: [], Email: [], Admin: [], Responsable_de: [] });
});

test('readIdentity writes only to the probe table, never to the directory', async () => {
  const s = session(ANA_EMAIL);
  await identify(s);
  await settle();
  assert.ok(s.calls.every(call => call.table === 'Annuaire_Sonde'));
});

test('readIdentity does not even try for a read-only (viewer) account', async () => {
  const s = session(ANA_EMAIL);
  const identity = await identify(s, { readOnly: true });
  assert.equal(identity.status, 'viewer');
  assert.equal(identity.email, '');
  assert.deepEqual(s.calls, [], 'un Lecteur ne peut rien écrire : aucune tentative');
  assert.match(s.log.infos[0][0], /^\[IDENTITE\].*lecture seule.*readonly=true/, 'la console dit pourquoi aucun bouton n\'est proposé');
  assert.deepEqual(s.log.warnings, []);
});

// La règle d'accès que GRIST_SETUP.md (étape 4) donne à la sonde : toute personne peut ajouter et supprimer
// une ligne, personne ne peut en modifier une, et chacune ne lit que les lignes à son adresse.
test('readIdentity works with the strictest rule on the probe: add and delete only, a person reads only the rows at their own address', async () => {
  const tables = withIdentity();
  tables.Annuaire_Sonde = { id: [7], Email: [ANA_EMAIL], Admin: [true], Responsable_de: ['1'] }; // la ligne d'une autre personne
  const s = session(BOB_EMAIL, tables);
  const actions = [];
  const strict = {
    ...s.docApi,
    applyUserActions: async userActions => {
      actions.push(...userActions.map(action => action[0]));
      if (userActions.some(action => !['AddRecord', 'RemoveRecord'].includes(action[0]))) throw new Error('Blocked by table update access rules');
      return s.docApi.applyUserActions(userActions);
    },
    fetchTable: async name => {
      const table = await s.docApi.fetchTable(name);
      if (name !== PROBE_TABLE) return table;
      const own = table.id.map((_, index) => table.Email[index] === BOB_EMAIL);
      return Object.fromEntries(Object.entries(table).map(([column, values]) => [column, values.filter((_, index) => own[index])]));
    }
  };
  const identity = await readIdentity(strict, { log: s.log });
  await settle();
  assert.deepEqual(identity, { status: 'ready', email: BOB_EMAIL, admin: false, etablissements: [2], reason: '' });
  assert.deepEqual(actions, ['AddRecord', 'RemoveRecord'], 'le widget n\'ajoute que sa ligne et ne fait que la supprimer');
  assert.deepEqual(s.tables.Annuaire_Sonde.id, [7], 'la ligne de l\'autre personne est intacte, la nôtre est retirée');
});

// ===== La table-sonde absente : le widget la crée (GRIST_SETUP.md, étape 2), la seule table qu'il crée =====

const withoutProbe = () => {
  const tables = withIdentity();
  delete tables.Annuaire_Sonde;
  return tables;
};

test('readIdentity creates the missing probe table with the documented trigger-formula columns, then identifies the person', async () => {
  const s = session(ANA_EMAIL, withoutProbe());
  const identity = await identify(s);
  await settle();
  assert.deepEqual(identity, { status: 'ready', email: ANA_EMAIL, admin: true, etablissements: [1], reason: '' });
  assert.deepEqual(s.calls.map(call => [call.action, call.table]),
    [['AddTable', 'Annuaire_Sonde'], ['AddRecord', 'Annuaire_Sonde'], ['RemoveRecord', 'Annuaire_Sonde']]);
  const columns = s.calls[0].values;
  assert.deepEqual(columns.map(({ id, type, isFormula }) => [id, type, isFormula]),
    [['Email', 'Text', false], ['Admin', 'Bool', false], ['Responsable_de', 'Text', false]],
    'des colonnes de données à formule de déclenchement, pas des colonnes à formule');
  assert.equal(columns[0].formula, 'user.Email');
  assert.match(columns[1].formula, /user\.Email.*bool\(r\.admin\) for r in ACL\.all/s);
  assert.match(columns[2].formula, /user\.Email.*Responsable_de_l_Etablissement.*ACL\.all/s);
  assert.ok(columns.every(column => !('recalcWhen' in column) && !('recalcDeps' in column)), 'calculées à la création d\'une ligne, rien d\'autre');
  assert.deepEqual(s.tables.Annuaire_Sonde, { id: [], Email: [], Admin: [], Responsable_de: [] }, 'vide au repos, comme la table faite à la main');
  assert.match(s.log.infos[0][0], /\[IDENTITE\].*Annuaire_Sonde.*créée/);
});

test('readIdentity fails closed, never throws, when Grist refuses to create the missing probe table', async () => {
  const s = session(ANA_EMAIL, withoutProbe(), { denyWrites: ['Annuaire_Sonde'] });
  const identity = await identify(s);
  assert.equal(identity.status, 'unavailable');
  assert.equal(identity.email, '');
  assert.equal(identity.admin, false);
  assert.match(identity.reason, /Annuaire_Sonde.*introuvable.*créer/);
  assert.match(s.log.warnings[0][0], /\[IDENTITE\].*Annuaire_Sonde.*GRIST_SETUP\.md/);
  assert.equal(s.tables.Annuaire_Sonde, undefined, 'rien n\'a été créé');
  assert.deepEqual(s.calls.map(call => [call.action, call.table, call.ok]), [['AddTable', 'Annuaire_Sonde', false]]);
});

test('readIdentity drops the duplicate table Grist numbers when another person created the probe table at the same moment', async () => {
  const s = session(BOB_EMAIL); // la table existe, mais la liste lue par le widget date d'avant sa création
  s.docApi.listTables = async () => [];
  const identity = await identify(s);
  await settle();
  assert.equal(identity.status, 'ready');
  assert.deepEqual(s.calls.map(call => [call.action, call.table]),
    [['AddTable', 'Annuaire_Sonde'], ['RemoveTable', 'Annuaire_Sonde2'], ['AddRecord', 'Annuaire_Sonde'], ['RemoveRecord', 'Annuaire_Sonde']]);
  assert.equal(s.tables.Annuaire_Sonde2, undefined, 'la table numérotée est retirée : une seule sonde dans le document');
  assert.ok('Annuaire_Sonde' in s.tables);
});

test('readIdentity gives up, never throws, when the probe formula returns no address (anonymous account)', async () => {
  const s = session(null);
  const identity = await identify(s);
  assert.equal(identity.status, 'unavailable');
  assert.match(identity.reason, /user\.Email/);
  await settle();
  assert.deepEqual(s.tables.Annuaire_Sonde.id, [], 'la ligne de sonde est quand même retirée');
});

test('readIdentity rejects a stamped value that is not an e-mail address', async () => {
  for (const stamped of ['not-an-address', 'two words@x.fr', '@x.fr', 'a@', '']) {
    const s = session(stamped);
    assert.equal((await identify(s)).status, 'unavailable', `« ${stamped} » n'est pas une adresse`);
  }
});

test('readIdentity fails closed when Grist refuses the probe write (access rule): no identity, no exception', async () => {
  const s = session(ANA_EMAIL, withIdentity(), { denyWrites: ['Annuaire_Sonde'] });
  const identity = await identify(s);
  assert.equal(identity.status, 'unavailable');
  assert.equal(identity.admin, false);
  assert.match(s.log.warnings[0][0], /\[IDENTITE\]/);
});

test('readIdentity fails closed when the probe row cannot be read back, and still cleans it up', async () => {
  const s = session(ANA_EMAIL, withIdentity(), { failTables: ['Annuaire_Sonde'] });
  const identity = await identify(s);
  assert.equal(identity.status, 'unavailable');
  await settle();
  assert.deepEqual(s.tables.Annuaire_Sonde.id, []);
});

test('readIdentity fails closed when Grist does not return the id of the created row', async () => {
  const docApi = {
    listTables: async () => ['Annuaire_Sonde'],
    applyUserActions: async () => ({ retValues: [] }),
    fetchTable: async () => { throw new Error('ne doit pas être lue'); }
  };
  const identity = await readIdentity(docApi, { log: recordingLog() });
  assert.equal(identity.status, 'unavailable');
});

test('readIdentity survives docApi methods that throw synchronously', async () => {
  const docApi = { listTables() { throw new Error('boum'); } };
  assert.equal((await readIdentity(docApi, { log: recordingLog() })).status, 'unavailable');
});

test('readIdentity tells each person apart when several open the widget at the same moment', async () => {
  const tables = withIdentity();
  const bob = session(BOB_EMAIL, tables);
  const ana = session(ANA_EMAIL, tables);
  const [forBob, forAna, forAdmin] = await Promise.all([
    identify(bob),
    identify(ana),
    identify(session(ADMIN_EMAIL, tables))
  ]);
  assert.deepEqual([forBob.email, forAna.email, forAdmin.email], [BOB_EMAIL, ANA_EMAIL, ADMIN_EMAIL]);
  assert.deepEqual([forBob.admin, forAna.admin, forAdmin.admin], [false, true, true]);
});

test('readIdentity never writes an e-mail address to the console', async () => {
  const ok = session(ANA_EMAIL);
  await identify(ok);
  const refused = session(ANA_EMAIL, withIdentity(), { denyWrites: ['Annuaire_Sonde'] });
  await identify(refused);
  const missing = withIdentity();
  delete missing.Annuaire_Sonde;
  const absent = session(ANA_EMAIL, missing);
  await identify(absent);
  for (const s of [ok, refused, absent]) {
    assert.ok(!JSON.stringify([s.log.infos, s.log.warnings]).includes('@'), 'les journaux peuvent être partagés pendant une démo');
  }
  assert.match(ok.log.infos[0][0], /\[IDENTITE\].*administrateur : oui/);
});

// ===== isReadOnlyAddress : le cadre d'un compte Lecteur =====

test('isReadOnlyAddress is true only when the frame address says readonly=true (the last value wins)', () => {
  assert.equal(isReadOnlyAddress('?readonly=true'), true);
  assert.equal(isReadOnlyAddress('?access=full&readonly=true&x=1'), true);
  assert.equal(isReadOnlyAddress('?readonly=false&readonly=true'), true);
  assert.equal(isReadOnlyAddress('?readonly=true&readonly=false'), false);
  assert.equal(isReadOnlyAddress('?readonly=false'), false);
  assert.equal(isReadOnlyAddress('?readonly=1'), false);
  assert.equal(isReadOnlyAddress('?readonly'), false);
  assert.equal(isReadOnlyAddress(''), false);
  assert.equal(isReadOnlyAddress(undefined), false);
  assert.equal(isReadOnlyAddress(null), false);
});
