import { test } from 'node:test';
import assert from './support/assert.mjs';
import { isPendingRow, loadDirectory, describeVisibility } from '../grist-data.js';
import { describeCreated, describeHiddenFiche, describePending } from '../presence.js';
import { createPendingColumn } from '../schema.js';
import { blankFiche, profileFormModel } from '../profile.js';
import { PENDING_COLUMN } from '../constants.js';
import { createFakeGrist } from './support/fake-grist.js';
import { logged, quiet } from './support/logs.mjs';
import { sampleTables, withIdentity, withRequest, withSchema, withValidation } from './fixtures.mjs';

// ===== La validation des nouvelles fiches (1.45.0) : ce que chaque couche lit de la case « en attente » =====

const accepted = (tables, id) => { tables.BDD.Accepte_apparaitre[id - 1] = true; return tables; };

test('only a true « En_attente_validation » makes a row a request: empty, false or absent mean validated', () => {
  assert.equal(isPendingRow({ [PENDING_COLUMN]: true }), true);
  for (const cell of [false, null, undefined, 0, 1, 'true', '']) assert.equal(isPendingRow({ [PENDING_COLUMN]: cell }), false, `${cell} n'est pas une demande`);
  assert.equal(isPendingRow({}), false);
  assert.equal(isPendingRow(null), false);
});

test('a pending request is in no card of the directory, even when the person agreed to appear and the établissement is validated', async () => {
  const tables = withRequest(withValidation(withIdentity()), { email: 'zoe@chu-bordeaux.example', prenom: 'Zoé', nom: 'Nouvelle', Etablissement: 1, Accepte_apparaitre: true });
  const { docApi } = createFakeGrist({ tables });
  const { contacts, people } = await loadDirectory(docApi, { log: quiet });
  assert.equal(contacts.length, 5, 'les cinq contacts d\'avant, pas de sixième');
  assert.equal(contacts.some(contact => contact.prenom === 'Zoé'), false);
  const [request] = people.findByEmail('zoe@chu-bordeaux.example');
  assert.deepEqual([request.status.accepted, request.status.pending, request.status.visible], [true, true, false]);
  assert.deepEqual(people.pendingRequests().map(person => person.row.id), [13]);
  assert.equal(people.hasPendingColumn, true);
});

test('without the column every row is validated, and the index says the column is missing', async () => {
  const { docApi } = createFakeGrist({ tables: sampleTables() });
  const { contacts, people } = await loadDirectory(docApi, { log: quiet });
  assert.equal(contacts.length, 5);
  assert.deepEqual(people.pendingRequests(), []);
  assert.equal(people.hasPendingColumn, false);
});

test('the console counts the requests apart from the contacts, and the requests raise no warning of their own', async () => {
  const tables = withRequest(withValidation(withIdentity()), { email: 'zoe@chu-bordeaux.example', prenom: 'Zoé', nom: 'Nouvelle', Etablissement: 0, Accepte_apparaitre: null });
  const { docApi } = createFakeGrist({ tables });
  const { lines, log } = logged();
  await loadDirectory(docApi, { log });
  assert.ok(lines.info.some(line => /Enregistrements reçus: 13 \(contacts affichables\s: 5, demandes en attente\s: 1\)/.test(line)), lines.info.join('\n'));
  assert.equal(lines.warn.some(line => /Zoé|zoe|sans établissement|Etablissement vide/i.test(line)), false, 'une demande sans établissement ne déclenche aucun avertissement');
});

test('describeVisibility reports the pending state and never shows a pending fiche', () => {
  const maps = { etablissement: { 1: 'CHU' } };
  const flags = { byId: { 1: { fondateur: true, partenaire: false, ok_pour_apparaitre: true } } };
  const row = { id: 1, prenom: 'Zoé', nom: 'N', Etablissement: 1, Accepte_apparaitre: true };
  assert.deepEqual(describeVisibility(row, maps, flags), { accepted: true, named: true, etablissement: 'ok', partnerOnly: false, pending: false, deactivated: false, visible: true });
  assert.deepEqual(describeVisibility({ ...row, [PENDING_COLUMN]: true }, maps, flags), { accepted: true, named: true, etablissement: 'ok', partnerOnly: false, pending: true, deactivated: false, visible: false });
});

test('the bar tells a person who waits for validation that their fiche is pending, with nothing to switch or edit', () => {
  const view = describePending({ name: 'Zoé Nouvelle', initials: 'ZN', photo: 0 });
  assert.equal(view.name, 'Zoé Nouvelle');
  assert.equal(view.switchable, false);
  assert.equal(view.accepted, false);
  assert.match(view.message, /en attente de validation par un administrateur/);
  assert.equal(describePending().name, 'Ma demande');
});

test('describeCreated says the request was sent, whatever the person ticked, and only a fiche that is not pending is « publiée »', () => {
  const pending = { pending: true, visible: false, accepted: true };
  assert.match(describeCreated(pending, true), /^Votre demande est envoyée\s: un administrateur doit valider votre fiche, qui apparaîtra ensuite dans l’annuaire\. Revenez plus tard\.$/);
  assert.match(describeCreated(pending, false), /une fois l’interrupteur\s«\sApparaître dans l'annuaire\s»\sactivé/);
  assert.match(describeCreated(null, true), /^Votre demande est envoyée/, 'sans relecture de Grist, la création est toujours une demande');
  // Un administrateur crée sa fiche sans validation : les phrases d'avant.
  assert.match(describeCreated(null, true, { pending: false }), /^Votre fiche est publiée\. Rechargez la page/);
  const direct = { pending: false, visible: true, accepted: true, named: true, etablissement: 'ok' };
  assert.equal(describeCreated(direct, true), 'Votre fiche est publiée : elle apparaît dans l’annuaire.');
  assert.match(describeCreated(direct, false), /^Votre fiche est créée\. Pour apparaître/);
  assert.match(describeCreated({ ...direct, visible: false, etablissement: 'not_validated' }, true), /^Votre fiche est publiée, mais elle reste masquée/);
});

test('describeHiddenFiche says a pending fiche waits for an administrator, in the voice of whoever reads it', () => {
  const pending = { pending: true, visible: false, accepted: true, named: true, etablissement: 'ok' };
  assert.match(describeHiddenFiche(pending, { own: true, creating: true }), /sera envoyée à un administrateur, qui doit la valider/);
  assert.match(describeHiddenFiche(pending, { own: true }), /^Votre fiche est en attente de validation/);
  assert.match(describeHiddenFiche(pending, { own: false }), /^Cette fiche est une demande en attente de validation/);
  assert.equal(describeHiddenFiche({ ...pending, pending: false, visible: true }, { own: true }), '');
});

test('createPendingColumn adds a data column of check boxes to BDD, once, and says why when Grist refuses', async () => {
  const tables = withSchema(withIdentity());
  const fake = createFakeGrist({ tables });
  const first = logged();
  assert.equal(await createPendingColumn(fake.docApi, { log: first.log }), '');
  assert.deepEqual(fake.calls.filter(call => call.action === 'AddColumn').map(call => [call.table, call.values]), [['BDD', { type: 'Bool', isFormula: false }]]);
  assert.equal(fake.calls.find(call => call.action === 'AddColumn').rowId, PENDING_COLUMN, 'le fil de la colonne est son nom');
  assert.ok(PENDING_COLUMN in tables.BDD, 'la colonne existe, une valeur par ligne');
  assert.equal(tables.BDD[PENDING_COLUMN].length, tables.BDD.id.length);
  assert.match(first.lines.info.join('\n'), /colonne\s«\sEn_attente_validation\s»\sabsente de BDD\s: créée, une case à cocher/);

  const refusedTables = withSchema(withIdentity());
  const refused = createFakeGrist({ tables: refusedTables, denyStructure: true });
  const failure = await createPendingColumn(refused.docApi, { log: quiet });
  assert.match(failure, /manque dans BDD et Grist n'a pas permis de la créer/);
  assert.match(failure, /personne ne peut créer sa fiche tant qu'elle manque/);
  assert.equal(PENDING_COLUMN in refusedTables.BDD, false);
});

test('a newcomer\'s form offers only the établissements of their domain, and keeps the others for an administrator', async () => {
  const { docApi } = createFakeGrist({ tables: withValidation(withIdentity()) });
  const { people, referenceMaps, etabFlags } = await loadDirectory(docApi, { log: quiet });
  const blank = blankFiche(people.columns, 'zoe@chu-bordeaux.example');
  const labels = model => model.find(field => field.key === 'Etablissement').options.map(option => option.label);
  assert.deepEqual(labels(profileFormModel(blank, referenceMaps, { creating: true, etabFlags })), ['CHU', 'INSERM', 'Institut Bergonié', 'UBM'], 'sans restriction : fondateurs et partenaires');
  assert.deepEqual(labels(profileFormModel(blank, referenceMaps, { creating: true, etabFlags, allowedEtablissements: [1] })), ['CHU']);
  assert.deepEqual(labels(profileFormModel(blank, referenceMaps, { creating: true, etabFlags, allowedEtablissements: [] })), [], 'aucun établissement autorisé : aucun choix');
});
