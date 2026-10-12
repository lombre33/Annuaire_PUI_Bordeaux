import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIdentity, isReadOnlyAddress } from '../identity.js';
import { createFakeGrist } from './support/fake-grist.js';
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
  assert.deepEqual(identity, { status: 'ready', email: BOB_EMAIL, admin: false, reason: '' });
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

test('readIdentity leaves the probe table empty: the row it adds is removed', async () => {
  const s = session(ANA_EMAIL);
  await identify(s);
  await settle();
  assert.deepEqual(s.calls.map(call => [call.action, call.table]),
    [['AddRecord', 'Annuaire_Sonde'], ['RemoveRecord', 'Annuaire_Sonde']]);
  assert.deepEqual(s.tables.Annuaire_Sonde, { id: [], Email: [], Admin: [] });
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
});

test('readIdentity reports the missing probe table without writing anything', async () => {
  const tables = withIdentity();
  delete tables.Annuaire_Sonde;
  const s = session(ANA_EMAIL, tables);
  const identity = await identify(s);
  assert.equal(identity.status, 'unavailable');
  assert.equal(identity.email, '');
  assert.equal(identity.admin, false);
  assert.match(identity.reason, /Annuaire_Sonde/);
  assert.match(s.log.warnings[0][0], /\[IDENTITE\].*Annuaire_Sonde.*GRIST_SETUP\.md/);
  assert.deepEqual(s.calls, []);
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
