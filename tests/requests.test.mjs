import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChanges, buildRowUpdate, describeRequest, describeChanges, loadRequests, requestsOf, submitRequest, validateRequest,
  validateRequests, refuseRequest, classifyRequests, ownRequestState, hasRequestsTable, RequestError, isPending
} from '../requests.js';
import { profileFormModel, diffProfile } from '../profile.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { sampleTables, withIdentity, withRequests, withSchema, ANA_EMAIL, BOB_EMAIL, ADMIN_EMAIL } from './fixtures.mjs';

// ===== requests : déposer, relire, valider, refuser une demande de modification =====

const quiet = { info() {}, warn() {}, error() {} };

// Un document complet (identité, demandes, métadonnées), vu par une personne.
async function world(email = ANA_EMAIL, { tables = withSchema(withRequests(withIdentity())), ...options } = {}) {
  const fake = createFakeGrist({ tables, user: email ? { email } : null, ...options });
  const directory = await loadDirectory(fake.docApi, { log: quiet });
  return { ...fake, tables, ...directory, find: id => directory.people.findById(id) };
}

const person = (w, id) => w.find(id);
const row = (w, id) => tableToRows(w.tables.BDD).find(candidate => candidate.id === id);
const requestRows = w => tableToRows(w.tables.Annuaire_Demandes);

// Dépose une demande comme le ferait la modale : formulaire → brouillon → diff → envoi.
async function fileRequest(w, personId, draft, message = '') {
  const diff = diffProfile(row(w, personId), draft, w.referenceMaps);
  assert.deepEqual(diff.errors, []);
  return submitRequest(w.docApi, row(w, personId), diff, message, { log: quiet });
}

const adminOptions = w => ({ adminEmail: ADMIN_EMAIL, referenceMaps: w.referenceMaps, columnTypes: { numero_de_telephone: 'Numeric' }, now: () => 1700000000, log: quiet });

const payload = champs => JSON.stringify({ v: 1, champs });

// ===== parseChanges =====

test('parseChanges reads each kind of change, and takes the labels from the reference tables, not from the request', async () => {
  const { referenceMaps } = await world();
  const parsed = parseChanges(payload({
    Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' },
    numero_de_telephone: { avant: '0556789012', apres: '0556789013' },
    Role_dans_le_PUI: { avant: { id: 1, label: 'MENSONGE' }, apres: { id: 0, label: '<img src=x>' } },
    Competences: { ajout: [{ id: 3, label: '<b>faux</b>' }], retrait: [{ id: 1 }] }
  }), referenceMaps);
  assert.deepEqual(parsed.champs, {
    Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' },
    numero_de_telephone: { avant: '0556789012', apres: '0556789013' },
    Role_dans_le_PUI: { avant: { id: 1, label: 'Référent qualité' }, apres: { id: 0, label: '' } },
    Competences: { ajout: [{ id: 3, label: 'Pharmacovigilance' }], retrait: [{ id: 1, label: 'Oncologie' }] }
  });
});

test('parseChanges rejects the whole request as soon as one field is not editable', async () => {
  const { referenceMaps } = await world();
  for (const key of ['email', 'Etablissement', 'perimetre', 'Accepte_apparaitre', 'id', 'Avatar', '__proto__', 'constructor', 'toString', 'Inconnu']) {
    const json = `{"v":1,"champs":{"Fonction":{"avant":"","apres":"x"},"${key}":{"avant":"","apres":"x"}}}`;
    const parsed = parseChanges(json, referenceMaps);
    assert.equal(parsed.champs, undefined, key);
    assert.match(parsed.error, /champ non modifiable/, key);
  }
});

test('parseChanges rejects a request that is not a well-formed version-1 payload', async () => {
  const { referenceMaps } = await world();
  const bad = [undefined, null, 42, '', '   ', 'pas du json', '[]', '"texte"', 'null', '{}', '{"v":2,"champs":{}}',
    '{"v":2,"champs":{"Fonction":{"avant":"","apres":"x"}}}', '{"champs":{"Fonction":{"avant":"","apres":"x"}}}',
    '{"v":1}', '{"v":1,"champs":[]}', '{"v":1,"champs":{}}', '{"v":1,"champs":"x"}',
    // valide, mais démesurée : même un JSON correct est refusé au-delà de 20 000 caractères
    payload({ Fonction: { avant: '', apres: 'x' } }) + ' '.repeat(20001)];
  for (const json of bad) {
    const parsed = parseChanges(json, referenceMaps);
    assert.equal(parsed.champs, undefined, String(json).slice(0, 30));
    assert.ok(parsed.error);
  }
});

test('parseChanges rejects values of the wrong type or an unknown reference', async () => {
  const { referenceMaps } = await world();
  const bad = {
    'text not a string': { Fonction: { apres: 42 } },
    'text change a string': { Fonction: 'x' },
    'text change null': { Fonction: null },
    'text change an array': { Fonction: ['x'] },
    'text change a number': { Fonction: 3 },
    'list change null': { Competences: null },
    'reference change null': { Role_dans_le_PUI: null },
    'text with formula': { Fonction: { apres: '=1+1' } },
    'text too long': { Fonction: { apres: 'x'.repeat(201) } },
    'phone not French': { numero_de_telephone: { apres: '+44 7700 900123' } },
    'phone not a string': { numero_de_telephone: { apres: 556789012 } },
    'reference unknown': { Role_dans_le_PUI: { apres: { id: 99 } } },
    'reference negative': { Role_dans_le_PUI: { apres: { id: -1 } } },
    'reference float': { Role_dans_le_PUI: { apres: { id: 1.5 } } },
    'reference string': { Role_dans_le_PUI: { apres: { id: '1' } } },
    'reference missing': { Role_dans_le_PUI: { apres: null } },
    'list unknown added': { Competences: { ajout: [{ id: 404 }], retrait: [] } },
    'list not arrays': { Competences: { ajout: 'x', retrait: [] } },
    'list ids not integers': { Competences: { ajout: [{ id: '3' }], retrait: [] } },
    'list negative id': { Competences: { ajout: [], retrait: [{ id: -3 }] } },
    'list zero id': { Competences: { ajout: [], retrait: [{ id: 0 }] } },
    'list null item': { Competences: { ajout: [null], retrait: [] } },
    'list item not an object': { Competences: { ajout: [3], retrait: [] } },
    'list empty': { Competences: { ajout: [], retrait: [] } },
    'list too long': { Competences: { ajout: [], retrait: Array.from({ length: 301 }, (_, index) => ({ id: index + 1 })) } }
  };
  for (const [name, champs] of Object.entries(bad)) {
    const parsed = parseChanges(payload(champs), referenceMaps);
    assert.equal(parsed.champs, undefined, name);
    assert.ok(parsed.error, name);
  }
});

test('parseChanges tells an unreadable reference from one the table does not know', async () => {
  const { referenceMaps } = await world();
  const reasonFor = id => parseChanges(payload({ Role_dans_le_PUI: { apres: { id } } }), referenceMaps).error;
  assert.match(reasonFor(-1), /Rôle PUI : valeur proposée illisible/);
  assert.match(reasonFor(99), /Rôle PUI : valeur inconnue/);
});

test('parseChanges collapses a repeated id in a list and lets one remove a value the table does not name', async () => {
  const { referenceMaps } = await world();
  const parsed = parseChanges(payload({ Instances: { ajout: [{ id: 1 }, { id: 1 }], retrait: [{ id: 999 }] } }), referenceMaps);
  assert.deepEqual(parsed.champs.Instances, { ajout: [{ id: 1, label: 'CME' }], retrait: [{ id: 999, label: '' }] });
});

// ===== buildRowUpdate =====

test('buildRowUpdate computes a list from the CURRENT row: concurrent changes and unnamed values survive', async () => {
  const w = await world();
  // Hugo : Instances [999]. La demande ajoute CME (1) ; entre-temps Grist y a ajouté COVIRIS (3).
  const change = { Instances: { ajout: [{ id: 1, label: 'CME' }], retrait: [] } };
  const current = { ...row(w, 10), Instances: ['L', 999, 3] };
  assert.deepEqual(buildRowUpdate(change, current).values, { Instances: ['L', 999, 3, 1] });
  const removal = { Competences: { ajout: [{ id: 3, label: 'x' }], retrait: [{ id: 1, label: 'y' }] } };
  assert.deepEqual(buildRowUpdate(removal, row(w, 1)).values, { Competences: ['L', 2, 3] });
});

test('buildRowUpdate is idempotent: adding what is already there or removing what is gone changes nothing more', async () => {
  const w = await world();
  const change = { Competences: { ajout: [{ id: 1, label: '' }], retrait: [{ id: 404, label: '' }] } };
  assert.deepEqual(buildRowUpdate(change, row(w, 1)).values, { Competences: ['L', 1, 2] });
});

test('buildRowUpdate writes an emptied list in the Grist encoding', async () => {
  const w = await world();
  const change = { Competences: { ajout: [], retrait: [{ id: 1, label: '' }, { id: 2, label: '' }] } };
  assert.deepEqual(buildRowUpdate(change, row(w, 1)).values, { Competences: ['L'] });
});

test('buildRowUpdate refuses to rewrite a list that holds values it cannot represent', async () => {
  const w = await world();
  // Ana : Actions ['L', 'Vaccination'] (déjà résolu en texte).
  const change = { Actions: { ajout: [{ id: 2, label: 'Audit' }], retrait: [] } };
  assert.match(buildRowUpdate(change, row(w, 1)).error, /Actions : la fiche contient des valeurs que le widget ne sait pas modifier/);
});

test('buildRowUpdate writes the phone in the form of its column: a number when Numeric, a text otherwise', async () => {
  const w = await world();
  const change = { numero_de_telephone: { avant: '', apres: '0556789013' } };
  assert.deepEqual(buildRowUpdate(change, row(w, 1), { numero_de_telephone: 'Numeric' }).values, { numero_de_telephone: 556789013 });
  assert.deepEqual(buildRowUpdate(change, row(w, 1), { numero_de_telephone: 'Int' }).values, { numero_de_telephone: 556789013 });
  assert.deepEqual(buildRowUpdate(change, row(w, 1), { numero_de_telephone: 'Text' }).values, { numero_de_telephone: '05 56 78 90 13' });
  assert.deepEqual(buildRowUpdate(change, row(w, 1), {}).values, { numero_de_telephone: 556789013 }, 'type inconnu : la cellule est un nombre');
  assert.deepEqual(buildRowUpdate(change, { ...row(w, 1), numero_de_telephone: '05 56 78 90 12' }, {}).values,
    { numero_de_telephone: '05 56 78 90 13' }, 'type inconnu : la cellule est un texte');
  const clear = { numero_de_telephone: { avant: '', apres: '' } };
  assert.deepEqual(buildRowUpdate(clear, row(w, 1), { numero_de_telephone: 'Numeric' }).values, { numero_de_telephone: null });
  assert.deepEqual(buildRowUpdate(clear, row(w, 1), { numero_de_telephone: 'Text' }).values, { numero_de_telephone: '' });
});

test('buildRowUpdate writes text and references, and refuses a nameless row or a missing column', async () => {
  const w = await world();
  const change = { Fonction: { avant: '', apres: 'Cheffe' }, Role_dans_le_PUI: { avant: { id: 1, label: '' }, apres: { id: 0, label: '' } } };
  assert.deepEqual(buildRowUpdate(change, row(w, 1)).values, { Fonction: 'Cheffe', Role_dans_le_PUI: 0 });
  const nameless = { prenom: { avant: '', apres: '' }, nom: { avant: '', apres: '' } };
  assert.match(buildRowUpdate(nameless, row(w, 1)).error, /ni prénom ni nom/);
  const alreadyNameless = { ...row(w, 1), prenom: '', nom: '' };
  assert.deepEqual(buildRowUpdate({ Fonction: { avant: '', apres: 'Cheffe' } }, alreadyNameless).values, { Fonction: 'Cheffe' },
    'une fiche déjà sans nom peut changer autre chose');
  assert.match(buildRowUpdate({ prenom: { avant: '', apres: '' } }, alreadyNameless).error, /ni prénom ni nom/);
  const { numero_de_telephone: _omitted, ...withoutPhone } = row(w, 1);
  assert.match(buildRowUpdate({ numero_de_telephone: { avant: '', apres: '0102030405' } }, withoutPhone).error, /la colonne numero_de_telephone n'existe pas/);
});

// ===== submitRequest, loadRequests =====

test('submitRequest files a pending request and leaves Date and Email to Grist, which makes the author trustworthy', async () => {
  const w = await world(ANA_EMAIL);
  const id = await fileRequest(w, 1, { Fonction: 'Cheffe de service', Competences: [2, 3] }, '  Merci !\nAna ');
  assert.equal(id, 1);
  const [request] = requestRows(w);
  assert.equal(request.Personne, 1);
  assert.equal(request.Statut, 'en_attente');
  assert.equal(request.Email, ANA_EMAIL, 'l\'auteur est celui que Grist a enregistré');
  assert.equal(typeof request.Date, 'number');
  assert.equal(request.Message, 'Merci ! Ana');
  assert.equal(request.Resume, 'Fonction : « Pharmacienne » → « Cheffe de service » ; Compétences : +Pharmacovigilance, −Oncologie');
  assert.deepEqual(JSON.parse(request.Changements), {
    v: 1,
    champs: {
      Fonction: { avant: 'Pharmacienne', apres: 'Cheffe de service' },
      Competences: { ajout: [{ id: 3, label: 'Pharmacovigilance' }], retrait: [{ id: 1, label: 'Oncologie' }] }
    }
  });
  const added = w.calls.find(call => call.table === 'Annuaire_Demandes');
  assert.ok(!('Email' in added.values) && !('Date' in added.values), 'le widget n\'écrit ni Email ni Date');
});

test('submitRequest never touches BDD', async () => {
  const w = await world(ANA_EMAIL);
  const before = structuredClone(w.tables.BDD);
  await fileRequest(w, 1, { Fonction: 'Cheffe de service' });
  assert.deepEqual(w.tables.BDD, before);
  assert.ok(w.calls.every(call => call.table === 'Annuaire_Demandes'));
});

test('submitRequest refuses an empty request and truncates a long message', async () => {
  const w = await world(ANA_EMAIL);
  await assert.rejects(submitRequest(w.docApi, row(w, 1), { champs: {}, summary: '' }, '', { log: quiet }), RequestError);
  assert.deepEqual(w.calls, []);
  await fileRequest(w, 1, { Fonction: 'Cheffe' }, 'x'.repeat(2000));
  assert.equal(requestRows(w)[0].Message.length, 500);
});

test('submitRequest turns an access-rule refusal into a clear message and creates nothing', async () => {
  const w = await world(ANA_EMAIL, { denyWrites: ['Annuaire_Demandes'] });
  const diff = diffProfile(row(w, 1), { Fonction: 'Cheffe' }, w.referenceMaps);
  await assert.rejects(submitRequest(w.docApi, row(w, 1), diff, '', { log: quiet }), error => {
    assert.ok(error instanceof RequestError);
    assert.match(error.message, /^Grist a refusé l'envoi de la demande/);
    return true;
  });
  assert.deepEqual(requestRows(w), []);
});

test('submitRequest reports a missing table without losing the draft: a plain RequestError', async () => {
  const tables = withSchema(withIdentity());
  const w = await world(ANA_EMAIL, { tables });
  const diff = diffProfile(row(w, 1), { Fonction: 'Cheffe' }, w.referenceMaps);
  await assert.rejects(submitRequest(w.docApi, row(w, 1), diff, '', { log: quiet }), error => {
    assert.match(error.message, /^L'envoi de la demande n'a pas pu aboutir/);
    return true;
  });
});

test('loadRequests lists requests from the oldest, and requestsOf finds those an address filed, newest first', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Première' });
  await fileRequest(w, 1, { Fonction: 'Seconde' });
  w.tables.Annuaire_Demandes.Date = [1700000200, 1700000100];
  const bob = createFakeGrist({ tables: w.tables, user: { email: BOB_EMAIL } });
  await submitRequest(bob.docApi, row(w, 2), diffProfile(row(w, 2), { Fonction: 'Chef' }, w.referenceMaps), '', { log: quiet });
  const requests = await loadRequests(w.docApi);
  assert.deepEqual(requests.map(request => request.id), [2, 1, 3], 'de la plus ancienne (Date) à la plus récente');
  assert.deepEqual(requestsOf(requests, ANA_EMAIL.toUpperCase()).map(request => request.id), [1, 2], 'celles d\'Ana, la plus récente d\'abord');
  assert.deepEqual(requestsOf(requests, BOB_EMAIL).map(request => request.id), [3]);
  assert.deepEqual(requestsOf(requests, ''), []);
  assert.deepEqual(requestsOf(requests, '   '), []);
  assert.deepEqual(requestsOf(requests, 'inconnu@example.fr'), []);
  assert.ok(requests.every(isPending));
});

test('requestsOf never hands the requests without a recorded author to an empty address', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  w.tables.Annuaire_Demandes.Email = [''];
  const requests = await loadRequests(w.docApi);
  assert.equal(requests[0].authorEmail, '');
  assert.deepEqual(requestsOf(requests, ''), []);
  assert.deepEqual(requestsOf(requests, ANA_EMAIL), []);
});

test('loadRequests puts requests filed at the same instant in the order of their identifier', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Première' });
  await fileRequest(w, 1, { Fonction: 'Seconde' });
  w.tables.Annuaire_Demandes.id = [2, 1];
  w.tables.Annuaire_Demandes.Date = [1700000000, 1700000000];
  assert.deepEqual((await loadRequests(w.docApi)).map(request => request.id), [1, 2]);
});

test('loadRequests reads the person of a request whatever the form of the reference', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  assert.equal((await loadRequests(w.docApi))[0].personId, 1);
  w.tables.Annuaire_Demandes.Personne = [['R', 'BDD', 1]];
  assert.equal((await loadRequests(w.docApi))[0].personId, 1);
  for (const unreadable of ['1; DROP', ['R', 'BDD', 'abc'], ['R', 'BDD', 1.5], 1.5, null, undefined]) {
    w.tables.Annuaire_Demandes.Personne = [unreadable];
    assert.equal((await loadRequests(w.docApi))[0].personId, 0, `illisible : aucune fiche (${JSON.stringify(unreadable)})`);
  }
  w.tables.Annuaire_Demandes.Personne = [0];
  assert.equal((await loadRequests(w.docApi))[0].personId, 0);
});

// ===== describeRequest =====

async function describeFiled(w, personId, draft, { findPerson } = {}) {
  await fileRequest(w, personId, draft);
  const requests = await loadRequests(w.docApi);
  return describeRequest(requests.at(-1), { findPerson: findPerson || (id => w.find(id)), referenceMaps: w.referenceMaps, columnTypes: { numero_de_telephone: 'Numeric' } });
}

test('describeRequest shows an administrator what changes, field by field, and what validating would write', async () => {
  const w = await world(ANA_EMAIL);
  const d = await describeFiled(w, 1, { Fonction: 'Cheffe', numero_de_telephone: '05 56 78 90 13', Role_dans_le_PUI: 0, Competences: [2, 3] });
  assert.equal(d.canValidate, true);
  assert.deepEqual(d.problems, []);
  assert.deepEqual(d.person, { id: 1, name: 'Ana Martin', etablissement: 'CHU' });
  assert.equal(d.authorEmail, ANA_EMAIL);
  assert.deepEqual(d.lines, [
    { key: 'Fonction', label: 'Fonction', kind: 'text', before: 'Pharmacienne', after: 'Cheffe' },
    { key: 'numero_de_telephone', label: 'Téléphone', kind: 'phone', before: '05 56 78 90 12', after: '05 56 78 90 13' },
    { key: 'Role_dans_le_PUI', label: 'Rôle PUI', kind: 'reference', before: 'Référent qualité', after: '' },
    { key: 'Competences', label: 'Compétences', kind: 'list', added: ['Pharmacovigilance'], removed: ['Oncologie'] }
  ]);
  assert.deepEqual(d.update, { Fonction: 'Cheffe', numero_de_telephone: 556789013, Role_dans_le_PUI: 0, Competences: ['L', 2, 3] });
  assert.deepEqual(d.warnings, []);
});

test('describeRequest blocks a request filed with another address than the one of the row', async () => {
  const w = await world(BOB_EMAIL);
  // Bob dépose une demande visant la fiche d'Ana (il écrit Personne = 1 depuis la console).
  const diff = diffProfile(row(w, 1), { Fonction: 'Piratée' }, w.referenceMaps);
  await submitRequest(w.docApi, row(w, 1), diff, '', { log: quiet });
  const [request] = await loadRequests(w.docApi);
  const d = describeRequest(request, { findPerson: id => w.find(id), referenceMaps: w.referenceMaps });
  assert.equal(d.canValidate, false);
  assert.match(d.problems.join(' '), /autre adresse que celle de la fiche/);
  assert.equal(d.update, null);
});

test('describeRequest compares the author to the row without minding case or spaces', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  w.tables.Annuaire_Demandes.Email = ['  ANA.Martin@Example.FR '];
  w.tables.BDD.email[0] = 'ana.martin@example.fr';
  const reloaded = await loadDirectory(w.docApi, { log: quiet });
  const [request] = await loadRequests(w.docApi);
  const d = describeRequest(request, { findPerson: id => reloaded.people.findById(id), referenceMaps: w.referenceMaps });
  assert.equal(d.canValidate, true);
  assert.deepEqual(d.problems, []);
});

test('describeRequest blocks a request whose author Grist did not record (the Email formula is missing)', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  w.tables.Annuaire_Demandes.Email = [''];
  const [request] = await loadRequests(w.docApi);
  const d = describeRequest(request, { findPerson: id => w.find(id), referenceMaps: w.referenceMaps });
  assert.equal(d.canValidate, false);
  assert.match(d.problems.join(' '), /user\.Email/);
});

test('describeRequest blocks a request for a row that no longer exists, one already processed, and a hostile payload', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const [request] = await loadRequests(w.docApi);
  const context = { findPerson: id => w.find(id), referenceMaps: w.referenceMaps };
  assert.match(describeRequest({ ...request, personId: 404 }, context).problems.join(' '), /fiche concernée est introuvable/);
  assert.match(describeRequest({ ...request, status: 'validee' }, context).problems.join(' '), /déjà été traitée/);
  const hostile = describeRequest({ ...request, changes: payload({ email: { avant: '', apres: 'pirate@example.fr' } }) }, context);
  assert.equal(hostile.canValidate, false);
  assert.match(hostile.problems.join(' '), /champ non modifiable/);
  assert.deepEqual(hostile.lines, []);
});

test('describeRequest reports why a request cannot be applied to the row as it is now, and offers nothing to write', async () => {
  const w = await world(ANA_EMAIL);
  // Les Actions d'Ana contiennent « Vaccination », un texte que le formulaire ne saurait pas réécrire.
  const d = await describeFiled(w, 1, { Actions: [2] });
  assert.equal(d.canValidate, false);
  assert.equal(d.update, null);
  assert.match(d.problems.join(' '), /Actions : la fiche contient des valeurs que le widget ne sait pas modifier/);
});

test('describeRequest reads a Changements cell that is not text as an empty request', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const [request] = await loadRequests(w.docApi);
  const context = { findPerson: id => w.find(id), referenceMaps: w.referenceMaps };
  for (const changes of [42, null, undefined, ['L'], { v: 1 }]) {
    const d = describeRequest({ ...request, changes }, context);
    assert.equal(d.canValidate, false, String(changes));
    assert.match(d.problems.join(' '), /aucun changement/, String(changes));
  }
});

test('describeRequest warns when a value changed in Grist since the request was filed', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe', numero_de_telephone: '05 56 78 90 13', Role_dans_le_PUI: 0 });
  w.tables.BDD.Fonction[0] = 'Responsable';
  w.tables.BDD.numero_de_telephone[0] = 0;
  w.tables.BDD.Role_dans_le_PUI[0] = 0;
  const [request] = await loadRequests(w.docApi);
  const reloaded = await loadDirectory(w.docApi, { log: quiet });
  const d = describeRequest(request, { findPerson: id => reloaded.people.findById(id), referenceMaps: w.referenceMaps });
  assert.equal(d.canValidate, true, 'un avertissement n\'interdit pas la validation');
  assert.match(d.warnings.join('\n'), /Fonction : la fiche a changé depuis la demande \(valeur actuelle : Responsable\)/);
  assert.match(d.warnings.join('\n'), /Téléphone : la fiche a changé depuis la demande \(valeur actuelle : vide\)/);
  assert.match(d.warnings.join('\n'), /Rôle PUI : la fiche a changé depuis la demande \(valeur actuelle : aucun\)/);
});

// ===== validateRequest =====

test('validateRequest applies the request to the row and marks it validated, in one atomic action', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe', Competences: [2, 3] });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await validateRequest(admin.docApi, 1, adminOptions(admin));
  assert.equal(row(w, 1).Fonction, 'Cheffe');
  assert.deepEqual(row(w, 1).Competences, ['L', 2, 3]);
  const [request] = requestRows(w);
  assert.equal(request.Statut, 'validee');
  assert.equal(request.Traitee_par, ADMIN_EMAIL);
  assert.equal(request.Traitee_le, 1700000000);
  assert.deepEqual(admin.calls.filter(call => call.action === 'UpdateRecord').map(call => call.table), ['BDD', 'Annuaire_Demandes']);
});

test('validateRequest changes nothing in BDD when the request cannot be marked validated (atomic)', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables, denyWrites: ['Annuaire_Demandes'] });
  const before = structuredClone(w.tables);
  await assert.rejects(validateRequest(admin.docApi, 1, adminOptions(admin)), error => {
    assert.match(error.message, /^Grist a refusé la validation/);
    return true;
  });
  assert.deepEqual(w.tables, before);
});

test('validateRequest turns a refusal of the write on BDD into a clear message, and the request stays pending', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables, denyWrites: ['BDD'] });
  await assert.rejects(validateRequest(admin.docApi, 1, adminOptions(admin)), /^RequestError: Grist a refusé la validation/);
  assert.equal(requestRows(w)[0].Statut, 'en_attente');
  assert.equal(row(w, 1).Fonction, 'Pharmacienne');
});

test('validateRequest refuses a spoofed request and leaves the row untouched', async () => {
  const w = await world(BOB_EMAIL);
  await submitRequest(w.docApi, row(w, 1), diffProfile(row(w, 1), { Fonction: 'Piratée' }, w.referenceMaps), '', { log: quiet });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await assert.rejects(validateRequest(admin.docApi, 1, adminOptions(admin)), /autre adresse que celle de la fiche/);
  assert.equal(row(w, 1).Fonction, 'Pharmacienne');
  assert.equal(requestRows(w)[0].Statut, 'en_attente');
});

test('validateRequest works from the state of Grist at that moment: a request processed meanwhile is not applied twice', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await validateRequest(admin.docApi, 1, adminOptions(admin));
  w.tables.BDD.Fonction[0] = 'Changée ensuite';
  await assert.rejects(validateRequest(admin.docApi, 1, adminOptions(admin)), /déjà été traitée/);
  assert.equal(row(w, 1).Fonction, 'Changée ensuite');
});

test('validateRequest keeps what was changed in Grist after the request, and the values the form never showed', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Competences: [1, 2, 3] }); // ajoute Pharmacovigilance
  w.tables.BDD.Competences[0] = ['L', 1, 2, 4, 777]; // un administrateur a ajouté Divers (4) et une ligne sans libellé (777)
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await validateRequest(admin.docApi, 1, adminOptions(admin));
  assert.deepEqual(row(w, 1).Competences, ['L', 1, 2, 4, 777, 3]);
});

test('validateRequest refuses a request for a deleted row, an unknown request, and an administrator it cannot identify', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await assert.rejects(validateRequest(admin.docApi, 99, adminOptions(admin)), /n'existe plus/);
  await assert.rejects(validateRequest(admin.docApi, 1, { ...adminOptions(admin), adminEmail: '' }), /Administrateur non identifié/);
  w.tables.BDD = Object.fromEntries(Object.entries(w.tables.BDD).map(([column, values]) => [column, values.slice(1)]));
  await assert.rejects(validateRequest(admin.docApi, 1, adminOptions(admin)), /fiche concernée est introuvable/);
  assert.equal(requestRows(w)[0].Statut, 'en_attente');
});

test('after a validation the directory shows the new values: the whole path, from the form to the card', async () => {
  const w = await world(ANA_EMAIL);
  const model = profileFormModel(row(w, 1), w.referenceMaps);
  assert.ok(model.length > 0);
  await fileRequest(w, 1, { Fonction: 'Cheffe de service', numero_de_telephone: '+33 5 56 78 90 14', Competences: [3] });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await validateRequest(admin.docApi, 1, adminOptions(admin));
  const { contacts } = await loadDirectory(admin.docApi, { log: quiet });
  const ana = contacts.find(contact => contact.id === 1);
  assert.equal(ana.Fonction, 'Cheffe de service');
  assert.equal(ana.numero_de_telephone, 556789014);
  assert.deepEqual(ana.labels.competences, ['Pharmacovigilance']);
});

// ===== refuseRequest =====

test('refuseRequest marks the request refused with its reason and leaves the row alone', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  const before = structuredClone(w.tables.BDD);
  await refuseRequest(admin.docApi, 1, '  Fonction\ninexacte ', adminOptions(admin));
  const [request] = requestRows(w);
  assert.equal(request.Statut, 'refusee');
  assert.equal(request.Motif_refus, 'Fonction inexacte');
  assert.equal(request.Traitee_le, 1700000000);
  assert.equal(request.Traitee_par, ADMIN_EMAIL);
  assert.deepEqual(w.tables.BDD, before);
});

test('refuseRequest keeps the reason within 500 characters', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await refuseRequest(admin.docApi, 1, 'x'.repeat(2000), adminOptions(admin));
  assert.equal(requestRows(w)[0].Motif_refus.length, 500);
});

test('refuseRequest refuses a request already processed, an unknown one, and reports an access-rule refusal', async () => {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Cheffe' });
  const denied = await world(ADMIN_EMAIL, { tables: w.tables, denyWrites: ['Annuaire_Demandes'] });
  await assert.rejects(refuseRequest(denied.docApi, 1, 'non', adminOptions(denied)), /^RequestError: Les règles d'accès de Grist ne permettent pas d'enregistrer ce refus/);
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  await assert.rejects(refuseRequest(admin.docApi, 7, 'non', adminOptions(admin)), /n'existe plus/);
  await refuseRequest(admin.docApi, 1, 'non', adminOptions(admin));
  await assert.rejects(refuseRequest(admin.docApi, 1, 'encore', adminOptions(admin)), /déjà été traitée/);
  await assert.rejects(refuseRequest(admin.docApi, 1, 'non', { ...adminOptions(admin), adminEmail: '' }), /Administrateur non identifié/);
});

// ===== Une demande plus récente remplace les précédentes =====

// Trois demandes d'Ana (1: ancienne, 2: puis 3: la plus récente), une de Bob, aux dates choisies.
async function manyRequests() {
  const w = await world(ANA_EMAIL);
  await fileRequest(w, 1, { Fonction: 'Première' });
  await fileRequest(w, 1, { Fonction: 'Seconde' });
  await fileRequest(w, 1, { Fonction: 'Troisième' });
  const bob = createFakeGrist({ tables: w.tables, user: { email: BOB_EMAIL } });
  await submitRequest(bob.docApi, row(w, 2), diffProfile(row(w, 2), { Fonction: 'Chef' }, w.referenceMaps), '', { log: quiet });
  w.tables.Annuaire_Demandes.Date = [1700000100, 1700000200, 1700000300, 1700000150];
  const admin = await world(ADMIN_EMAIL, { tables: w.tables });
  return { w, admin };
}

test('classifyRequests keeps one request to process per person, the most recent, and calls the others replaced', async () => {
  const { w } = await manyRequests();
  const { active, history } = classifyRequests(await loadRequests(w.docApi));
  assert.deepEqual(active.map(request => request.id), [4, 3], 'à traiter : Bob (150) puis la plus récente d\'Ana (300)');
  assert.deepEqual(history.map(request => [request.id, request.effectiveStatus]), [[2, 'remplacee'], [1, 'remplacee']]);
});

test('classifyRequests sorts the processed requests by decision, most recent first, and keeps their status', async () => {
  const { w, admin } = await manyRequests();
  await refuseRequest(admin.docApi, 4, 'non', adminOptions(admin));
  w.tables.Annuaire_Demandes.Traitee_le[3] = 1700000900;
  const { active, history } = classifyRequests(await loadRequests(w.docApi));
  assert.deepEqual(active.map(request => request.id), [3]);
  assert.deepEqual(history.map(request => [request.id, request.effectiveStatus]), [[4, 'refusee'], [2, 'remplacee'], [1, 'remplacee']]);
});

test('classifyRequests never treats requests without a readable person as replacing each other', async () => {
  const { w } = await manyRequests();
  w.tables.Annuaire_Demandes.Personne = [0, 0, 0, 0];
  const { active, history } = classifyRequests(await loadRequests(w.docApi));
  assert.equal(active.length, 4);
  assert.equal(history.length, 0);
});

test('classifyRequests puts requests filed at the same instant in the order of their identifier', async () => {
  const { w } = await manyRequests();
  w.tables.Annuaire_Demandes.Date = [1700000100, 1700000100, 1700000100, 1700000100];
  const { active, history } = classifyRequests(await loadRequests(w.docApi));
  assert.deepEqual(active.map(request => request.id), [3, 4]);
  assert.deepEqual(history.map(request => request.id), [2, 1]);
});

test('validateRequest closes the older requests of the same person with the new one, in one action', async () => {
  const { w, admin } = await manyRequests();
  await validateRequest(admin.docApi, 3, adminOptions(admin));
  const statuses = requestRows(w).map(request => request.Statut);
  assert.deepEqual(statuses, ['remplacee', 'remplacee', 'validee', 'en_attente'], 'celle de Bob n\'est pas touchée');
  assert.equal(requestRows(w)[0].Traitee_par, ADMIN_EMAIL);
  assert.equal(row(w, 1).Fonction, 'Troisième');
  assert.equal(admin.calls.filter(call => call.table === 'Annuaire_Demandes').length, 3);
});

test('validateRequest changes nothing at all when the older requests cannot be closed (atomic)', async () => {
  const { w } = await manyRequests();
  const denied = await world(ADMIN_EMAIL, { tables: w.tables, denyWrites: ['Annuaire_Demandes'] });
  const before = structuredClone(w.tables);
  await assert.rejects(validateRequest(denied.docApi, 3, adminOptions(denied)), /Grist a refusé la validation/);
  assert.deepEqual(w.tables, before);
});

test('validateRequest changes nothing when only one of the older requests is protected (atomic)', async () => {
  const { w } = await manyRequests();
  const guarded = await world(ADMIN_EMAIL, { tables: w.tables, denyRows: { Annuaire_Demandes: [1] } });
  const before = structuredClone(w.tables);
  await assert.rejects(validateRequest(guarded.docApi, 3, adminOptions(guarded)), /Grist a refusé la validation/);
  assert.deepEqual(w.tables, before, 'ni la fiche, ni la demande 3, ni la demande 2 n\'ont bougé');
});

test('between two requests filed at the same instant, the later identifier is the more recent', async () => {
  const { w, admin } = await manyRequests();
  w.tables.Annuaire_Demandes.Date = [1700000100, 1700000100, 1700000100, 1700000150];
  await assert.rejects(validateRequest(admin.docApi, 2, adminOptions(admin)), /remplacée par une plus récente/);
  await validateRequest(admin.docApi, 3, adminOptions(admin));
  assert.deepEqual(requestRows(w).map(request => request.Statut), ['remplacee', 'remplacee', 'validee', 'en_attente']);
});

test('validateRequest and refuseRequest refuse a request that a more recent one of the same person has replaced', async () => {
  const { w, admin } = await manyRequests();
  await assert.rejects(validateRequest(admin.docApi, 1, adminOptions(admin)), /remplacée par une plus récente/);
  await assert.rejects(refuseRequest(admin.docApi, 2, 'non', adminOptions(admin)), /remplacée par une plus récente/);
  assert.deepEqual(requestRows(w).map(request => request.Statut), ['en_attente', 'en_attente', 'en_attente', 'en_attente']);
  assert.equal(row(w, 1).Fonction, 'Pharmacienne');
});

test('refuseRequest closes the older requests of the same person too', async () => {
  const { w, admin } = await manyRequests();
  await refuseRequest(admin.docApi, 3, 'Pas cette fois', adminOptions(admin));
  assert.deepEqual(requestRows(w).map(request => request.Statut), ['remplacee', 'remplacee', 'refusee', 'en_attente']);
  assert.equal(requestRows(w)[2].Motif_refus, 'Pas cette fois');
  assert.equal(requestRows(w)[0].Motif_refus ?? '', '', 'le motif est celui de la demande refusée, pas des remplacées');
});

// ===== validateRequests : plusieurs demandes d'un coup =====

test('validateRequests validates each request on its own: a failure does not stop the others', async () => {
  const { w, admin } = await manyRequests();
  // La fiche de Bob est supprimée entre-temps : sa demande ne peut plus être validée.
  w.tables.BDD = Object.fromEntries(Object.entries(w.tables.BDD).map(([column, values]) => [column, values.filter((_, index) => w.tables.BDD.id[index] !== 2)]));
  const outcomes = await validateRequests(admin.docApi, [4, 3], adminOptions(admin));
  assert.deepEqual(outcomes.map(outcome => [outcome.id, outcome.ok]), [[4, false], [3, true]]);
  assert.match(outcomes[0].error, /fiche concernée est introuvable/);
  assert.equal(row(w, 1).Fonction, 'Troisième');
  assert.equal(requestRows(w)[3].Statut, 'en_attente');
});

test('validateRequests answers with a plain message for an error it did not foresee, and nothing to do for an empty list', async () => {
  const { admin } = await manyRequests();
  const broken = { ...admin.docApi, fetchTable: async () => { throw new Error('panne'); } };
  const outcomes = await validateRequests(broken, [3], { ...adminOptions(admin), log: quiet });
  assert.deepEqual(outcomes, [{ id: 3, ok: false, error: 'Erreur inattendue, voir la console.' }]);
  assert.deepEqual(await validateRequests(admin.docApi, [], adminOptions(admin)), []);
});

// ===== Ce que la personne voit de ses demandes =====

test('ownRequestState gives the request waiting and the last one that was processed', async () => {
  const { w, admin } = await manyRequests();
  let state = ownRequestState(await loadRequests(w.docApi), ANA_EMAIL.toUpperCase());
  assert.equal(state.pending.id, 3, 'la plus récente');
  assert.equal(state.last, null);
  await refuseRequest(admin.docApi, 3, 'Précisez', adminOptions(admin));
  state = ownRequestState(await loadRequests(w.docApi), ANA_EMAIL);
  assert.equal(state.pending, null, 'les demandes remplacées ne comptent plus comme en attente');
  assert.equal(state.last.id, 3);
  assert.equal(state.last.status, 'refusee');
  assert.equal(state.last.reason, 'Précisez');
});

test('ownRequestState picks the most recently processed request, and ignores replaced ones and other people', async () => {
  const { w } = await manyRequests();
  w.tables.Annuaire_Demandes.Statut = ['validee', 'refusee', 'remplacee', 'en_attente'];
  w.tables.Annuaire_Demandes.Traitee_le = [1700000500, 1700000400, 1700000600, 0];
  const state = ownRequestState(await loadRequests(w.docApi), ANA_EMAIL);
  assert.equal(state.last.id, 1, 'la décision la plus récente parmi les validées et refusées');
  assert.equal(state.pending, null);
  assert.deepEqual(ownRequestState(await loadRequests(w.docApi), BOB_EMAIL).pending.id, 4);
  assert.deepEqual(ownRequestState(await loadRequests(w.docApi), ''), { pending: null, last: null });
});

test('hasRequestsTable says whether the table of requests exists, and no when the list cannot be read', async () => {
  const withTable = createFakeGrist({ tables: withSchema(withRequests(withIdentity())) });
  assert.equal(await hasRequestsTable(withTable.docApi, { log: quiet }), true);
  const withoutTable = createFakeGrist({ tables: withSchema(withIdentity()) });
  assert.equal(await hasRequestsTable(withoutTable.docApi, { log: quiet }), false);
  const lines = [];
  const broken = { listTables: async () => { throw new Error('panne'); } };
  assert.equal(await hasRequestsTable(broken, { log: { warn: (...args) => lines.push(args.join(' ')) } }), false);
  assert.match(lines[0], /^\[DEMANDES\] Liste des tables illisible/);
});

test('describeChanges gives the lines of a request in form order, the same for the person and for the administrator', async () => {
  const w = await world(ANA_EMAIL);
  const diff = diffProfile(row(w, 1), { Competences: [2, 3], Fonction: 'Cheffe', prenom: 'Anna' }, w.referenceMaps);
  const lines = describeChanges(diff.champs);
  assert.deepEqual(lines.map(line => line.key), ['prenom', 'Fonction', 'Competences']);
  const shuffled = { Competences: diff.champs.Competences, prenom: diff.champs.prenom, Fonction: diff.champs.Fonction };
  assert.deepEqual(describeChanges(shuffled), lines, 'toujours dans l\'ordre du formulaire');
  await fileRequest(w, 1, { Competences: [2, 3], Fonction: 'Cheffe', prenom: 'Anna' });
  const [request] = await loadRequests(w.docApi);
  const d = describeRequest(request, { findPerson: id => w.find(id), referenceMaps: w.referenceMaps });
  assert.deepEqual(d.lines, lines);
  assert.deepEqual(describeChanges({}), []);
});
