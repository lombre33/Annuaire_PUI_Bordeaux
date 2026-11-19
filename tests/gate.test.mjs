import { test } from 'node:test';
import assert from './support/assert.mjs';
import { describeGate } from '../gate.js';
import { loadDirectory } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { quiet } from './support/logs.mjs';
import { ADMIN_EMAIL, ANA_EMAIL, NEW_EMAIL, sampleTables, withIdentity, withRequest, withValidation } from './fixtures.mjs';

// ===== gate : qui voit l'annuaire (1.45.0) =====

async function gateFor(identity, tables = withValidation(withIdentity())) {
  const { docApi } = createFakeGrist({ tables, user: { email: identity?.email ?? null } });
  const { people, etablissementRows } = await loadDirectory(docApi, { log: quiet });
  return describeGate({ identity, people, etablissementRows });
}
const ready = (email, extra = {}) => ({ status: 'ready', email, admin: false, etablissements: [], ...extra });

test('nothing is closed before the identity is read, or for a reader or a document without probe (the widget cannot tell who they are)', async () => {
  assert.deepEqual(await gateFor(null), { open: true });
  for (const status of ['viewer', 'unavailable']) assert.deepEqual(await gateFor({ status }), { open: true });
});

test('a visitor without an account gets the sign-in screen, even before the directory is read', () => {
  const gate = describeGate({ identity: { status: 'anonymous', email: 'anon@getgrist.com' }, people: null, etablissementRows: [] });
  assert.equal(gate.open, false);
  assert.equal(gate.kind, 'anonymous');
  assert.equal(gate.count, 'Connexion requise');
  assert.match(gate.text, /Se connecter/);
});

test('a person whose fiche is validated sees the directory, and so does an administrator without a fiche', async () => {
  assert.deepEqual(await gateFor(ready(ANA_EMAIL)), { open: true });
  assert.deepEqual(await gateFor(ready(ADMIN_EMAIL, { admin: true })), { open: true });
  // Un responsable d'établissement (une ligne d'ACL) est dans l'annuaire sans y avoir de fiche : ses règles d'accès lui donnent la lecture.
  assert.deepEqual(await gateFor(ready('responsable@example.test', { etablissements: [1] })), { open: true });
  // Même un administrateur dont la seule ligne est une demande en attente.
  const tables = withValidation(withIdentity(), { pending: { 1: true } });
  assert.deepEqual(await gateFor(ready(ANA_EMAIL, { admin: true }), tables), { open: true });
});

test('a person whose only fiche is a pending request waits, and sees the directory once it is validated', async () => {
  const waiting = await gateFor(ready(ANA_EMAIL), withValidation(withIdentity(), { pending: { 1: true } }));
  assert.equal(waiting.open, false);
  assert.equal(waiting.kind, 'pending');
  assert.equal(waiting.title, 'Votre demande est en attente');
  assert.equal(waiting.count, 'Demande en attente');
  assert.deepEqual(await gateFor(ready(ANA_EMAIL), withValidation(withIdentity(), { pending: { 1: false } })), { open: true });
});

test('a person with a validated fiche and a pending one sees the directory', async () => {
  const tables = withRequest(withValidation(withIdentity()), { email: ANA_EMAIL, prenom: 'Ana', nom: 'Doublon', Etablissement: 1 });
  assert.deepEqual(await gateFor(ready(ANA_EMAIL), tables), { open: true });
});

test('a newcomer whose domain is the one of an établissement can ask for a fiche, for that établissement only', async () => {
  const gate = await gateFor(ready(NEW_EMAIL));
  assert.equal(gate.open, false);
  assert.equal(gate.kind, 'create');
  assert.deepEqual(gate.allowed, [1], 'chu-bordeaux.example : le CHU');
  assert.equal(gate.domain, 'chu-bordeaux.example');
  assert.match(gate.text, /@chu-bordeaux\.example/);
  assert.equal(gate.title, 'Vous n’êtes pas encore dans l’annuaire');
});

test('a newcomer whose domain is nobody\'s is told the directory is not for them', async () => {
  const gate = await gateFor(ready('zoe@webmail.example'));
  assert.equal(gate.open, false);
  assert.equal(gate.kind, 'denied');
  assert.equal(gate.allowed, undefined);
  assert.match(gate.text, /@webmail\.example/);
  assert.match(gate.text, /contactez un administrateur/);
});

test('without the column of domains the widget cannot tell, and the directory stays closed', async () => {
  const gate = await gateFor(ready(NEW_EMAIL), withIdentity(sampleTables()));
  assert.equal(gate.open, false);
  assert.equal(gate.kind, 'unverifiable');
  assert.equal(gate.title, 'Vérification impossible');
});

test('a document with no « email » column in BDD is not judged (the widget cannot find anyone)', () => {
  const people = { hasEmailColumn: false, findByEmail: () => [] };
  assert.deepEqual(describeGate({ identity: ready(NEW_EMAIL), people, etablissementRows: [] }), { open: true });
});
