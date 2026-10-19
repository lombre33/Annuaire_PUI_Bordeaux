import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffContacts, hasMarks, previewOf, withAvatarChange } from '../preview.js';
import { TAG_GROUPS } from '../constants.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { quiet } from './support/logs.mjs';
import { sampleTables } from './fixtures.mjs';

// ===== preview : la carte « avant », la carte « après » et ce qui les distingue =====

// Le document d'exemple chargé comme le fait le widget : les cartes de l'annuaire, les
// libellés de référence et les indicateurs d'établissement.
async function directory() {
  const tables = sampleTables();
  const { docApi } = createFakeGrist({ tables });
  const loaded = await loadDirectory(docApi, { log: quiet });
  return { ...loaded, row: id => tableToRows(tables.BDD).find(candidate => candidate.id === id) };
}

// Une carte réduite à ce que diffContacts() lit.
const card = ({ prenom = 'Ana', nom = 'Martin', Fonction = '', numero_de_telephone = 0, email = '', etablissement_label = '', labels = {} } = {}) =>
  ({ prenom, nom, Fonction, numero_de_telephone, email, etablissement_label, labels });

// ===== diffContacts =====

test('diffContacts finds nothing between two identical cards, and hasMarks agrees', () => {
  const marks = diffContacts(card({ labels: { instances: ['CME'] } }), card({ labels: { instances: ['CME'] } }));
  assert.deepEqual(marks, { texts: {}, tags: {} });
  assert.equal(hasMarks(marks), false);
});

test('diffContacts marks each line of text that changed, and only that line', () => {
  const name = diffContacts(card(), card({ prenom: 'Anna' }));
  assert.deepEqual(name.texts, { name: { before: 'Ana Martin', after: 'Anna Martin' } });
  const role = diffContacts(card(), card({ Fonction: 'Cheffe de service' }));
  assert.deepEqual(role.texts, { fonction: { before: '', after: 'Cheffe de service' } });
  const phone = diffContacts(card({ numero_de_telephone: 536499012 }), card({ numero_de_telephone: 536499013 }));
  assert.deepEqual(phone.texts, { tel: { before: '05 36 49 90 12', after: '05 36 49 90 13' } });
  assert.equal(hasMarks(name) && hasMarks(role) && hasMarks(phone), true);
});

test('diffContacts reads the name as the card shows it: a nameless card is called « Sans nom »', () => {
  const marks = diffContacts(card({ prenom: '', nom: '' }), card({ prenom: 'Ana', nom: '' }));
  assert.deepEqual(marks.texts, { name: { before: 'Sans nom', after: 'Ana' } });
  assert.deepEqual(diffContacts(card({ prenom: ' Ana ', nom: 'Martin ' }), card()).texts, {}, 'les espaces ne comptent pas');
});

test('diffContacts reads the phone as the card shows it: the same number in two forms is not a change', () => {
  const sameNumber = diffContacts(card({ numero_de_telephone: 536499012 }), card({ numero_de_telephone: '05 36 49 90 12' }));
  assert.deepEqual(sameNumber.texts, {});
  const cleared = diffContacts(card({ numero_de_telephone: 536499012 }), card({ numero_de_telephone: null }));
  assert.deepEqual(cleared.texts, { tel: { before: '05 36 49 90 12', after: '' } });
  assert.deepEqual(diffContacts(card({ numero_de_telephone: 0 }), card({ numero_de_telephone: '' })).texts, {}, 'vide vaut vide');
});

test('diffContacts lists the tags added and removed, category by category', () => {
  const before = card({ labels: { instances: ['CME', 'COVIRIS'], competences: ['Oncologie'], role: ['Référent qualité'] } });
  const after = card({ labels: { instances: ['CME', 'CLIN'], competences: ['Oncologie', 'Hématologie'], actions: ['Audit'] } });
  const { tags, texts } = diffContacts(before, after);
  assert.deepEqual(tags, {
    instances: { added: ['CLIN'], removed: ['COVIRIS'] },
    actions: { added: ['Audit'], removed: [] },
    competences: { added: ['Hématologie'], removed: [] },
    role: { added: [], removed: ['Référent qualité'] }
  });
  assert.deepEqual(texts, {});
});

test('diffContacts does not mark a label written otherwise: case and accents do not make a new tag', () => {
  const marks = diffContacts(card({ labels: { competences: ['Hématologie'] } }), card({ labels: { competences: ['hematologie'] } }));
  assert.deepEqual(marks, { texts: {}, tags: {} });
});

test('diffContacts only looks at the groups of tags the card shows', () => {
  // Établissement a son badge, les compétences macro ne figurent pas sur la carte.
  const marks = diffContacts(card({ labels: { etablissement: ['CHU'], macro: ['Cancérologie'] } }),
    card({ labels: { etablissement: ['UBM'], macro: ['Pharmacie'] } }));
  assert.deepEqual(marks, { texts: {}, tags: {} });
  assert.deepEqual(TAG_GROUPS.map(group => group.key), ['instances', 'actions', 'gt', 'competences', 'communautes', 'taches', 'role']);
});

test('diffContacts keeps the labels of the card, in the order the card shows them', () => {
  const marks = diffContacts(card({ labels: { gt: ['B', 'A'] } }), card({ labels: { gt: ['C', 'B', 'D'] } }));
  assert.deepEqual(marks.tags.gt, { added: ['C', 'D'], removed: ['A'] });
});

// ===== previewOf =====

test('previewOf gives the card before exactly as the directory shows it', async () => {
  const { contacts, referenceMaps, etabFlags, row } = await directory();
  const { before } = previewOf(row(1), {}, referenceMaps, etabFlags);
  assert.deepEqual(before, contacts.find(contact => contact.id === 1));
});

test('previewOf gives the card after with the values that will be written, enriched like the directory', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const values = { Fonction: 'Cheffe de service', numero_de_telephone: 536499013, Role_dans_le_PUI: 0, Competences: ['L', 2, 3] };
  const { before, after, marks } = previewOf(row(1), values, referenceMaps, etabFlags);
  assert.equal(after.Fonction, 'Cheffe de service');
  assert.equal(after.numero_de_telephone, 536499013);
  assert.deepEqual(after.labels.competences, ['Hématologie', 'Pharmacovigilance']);
  assert.deepEqual(after.labels.role, []);
  assert.deepEqual(after.labels.macro, ['Cancérologie', 'Pharmacie'], 'les domaines suivent les compétences');
  assert.equal(after.etablissement_label, 'CHU', 'ce qu\'on ne modifie pas reste');
  assert.equal(after.etablissement_fondateur, true);
  assert.equal(after.email, before.email);
  assert.deepEqual(marks, {
    texts: {
      fonction: { before: 'Pharmacienne', after: 'Cheffe de service' },
      tel: { before: '05 36 49 90 12', after: '05 36 49 90 13' }
    },
    tags: {
      competences: { added: ['Pharmacovigilance'], removed: ['Oncologie'] },
      role: { added: [], removed: ['Référent qualité'] }
    }
  });
});

test('previewOf marks a name that changes, and the establishment badge follows the establishment', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const renamed = previewOf(row(1), { prenom: 'Anna' }, referenceMaps, etabFlags);
  assert.equal(renamed.after.prenom, 'Anna');
  assert.deepEqual(renamed.marks, { texts: { name: { before: 'Ana Martin', after: 'Anna Martin' } }, tags: {} });
  // Établissement 4 (INSERM) n'a pas été validé : la carte « après » le dit, comme l'annuaire.
  const moved = previewOf(row(1), { Etablissement: 4 }, referenceMaps, etabFlags);
  assert.equal(moved.after.etablissement_label, 'INSERM');
  assert.equal(moved.after.etablissement_ok_pour_apparaitre, false);
  assert.equal(moved.before.etablissement_ok_pour_apparaitre, true);
});

test('previewOf marks nothing when the values written are the ones the card already has', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const { marks } = previewOf(row(1), { Fonction: 'Pharmacienne', Competences: ['L', 2, 1], numero_de_telephone: 536499012 }, referenceMaps, etabFlags);
  assert.deepEqual(marks, { texts: {}, tags: {} });
  assert.equal(hasMarks(marks), false);
});

test('previewOf keeps the values the form does not show: a value without a name is not turned into a tag', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  // Hugo (10) : Instances ['L', 999], une valeur absente de la table de référence.
  const { before, after, marks } = previewOf(row(10), { Instances: ['L', 999, 1] }, referenceMaps, etabFlags);
  assert.deepEqual(before.labels.instances, []);
  assert.deepEqual(after.labels.instances, ['CME']);
  assert.deepEqual(marks.tags, { instances: { added: ['CME'], removed: [] } });
});

test('previewOf does not change the row it is given', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const original = row(1);
  const snapshot = structuredClone(original);
  const values = { Fonction: 'Cheffe', Competences: ['L', 3] };
  const valuesSnapshot = structuredClone(values);
  previewOf(original, values, referenceMaps, etabFlags);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(values, valuesSnapshot);
});

test('diffContacts marks a new e-mail address and a new établissement, as lines of text', () => {
  const before = card({ email: 'ana@chu.example', etablissement_label: 'CHU' });
  assert.deepEqual(diffContacts(before, card({ email: 'ana.martin@chu.example', etablissement_label: 'CHU' })).texts,
    { email: { before: 'ana@chu.example', after: 'ana.martin@chu.example' } });
  assert.deepEqual(diffContacts(before, card({ email: 'ana@chu.example', etablissement_label: 'UBM' })).texts,
    { etab: { before: 'CHU', after: 'UBM' } });
  assert.deepEqual(diffContacts(card(), card({ email: 'ana@chu.example' })).texts, { email: { before: '', after: 'ana@chu.example' } }, 'une adresse ajoutée');
  assert.equal(hasMarks(diffContacts(before, card({ email: 'ana@chu.example', etablissement_label: 'UBM' }))), true);
  assert.equal(hasMarks(diffContacts(before, before)), false);
});

test('previewOf shows the card after with the new address and the flags of the new établissement', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const preview = previewOf(row(2), { email: 'nouveau@chu-bordeaux.example', Etablissement: 1 }, referenceMaps, etabFlags); // Bob, de l'UBM au CHU
  assert.equal(preview.before.etablissement_label, 'UBM');
  assert.equal(preview.after.etablissement_label, 'CHU');
  assert.deepEqual([preview.before.etablissement_fondateur, preview.after.etablissement_fondateur], [false, true]);
  assert.equal(preview.after.email, 'nouveau@chu-bordeaux.example');
  assert.deepEqual(preview.marks.texts, {
    etab: { before: 'UBM', after: 'CHU' },
    email: { before: 'bob@u-bordeaux-montaigne.example', after: 'nouveau@chu-bordeaux.example' }
  });
});

// ===== La photo de profil sur la carte « après » =====

test('hasMarks counts a change of photo, which marks neither a text nor a tag', () => {
  assert.equal(hasMarks({ texts: {}, tags: {}, avatar: { before: 0, after: 'replace' } }), true);
  assert.equal(hasMarks({ texts: {}, tags: {}, avatar: { before: 501, after: 'remove' } }), true);
  assert.equal(hasMarks({ texts: {}, tags: {} }), false);
});

test('withAvatarChange shows a new photo on the card after by its local address, and marks it', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const preview = previewOf({ ...row(1), Avatar: ['L', 501] }, { Fonction: 'Cheffe' }, referenceMaps, etabFlags);
  const { before, after, marks } = withAvatarChange(preview, { action: 'replace', avant: 501 }, { url: 'blob:http://widget/1', blob: new Blob(['x']) });
  assert.equal(after.avatarUrl, 'blob:http://widget/1');
  assert.equal(after.Fonction, 'Cheffe', 'le reste de la carte « après » est conservé');
  assert.equal(before.avatarUrl, undefined, 'la carte « avant » montre la photo de Grist, pas une image locale');
  assert.deepEqual(marks.avatar, { before: 501, after: 'replace' });
  assert.deepEqual(marks.texts, { fonction: { before: 'Pharmacienne', after: 'Cheffe' } }, 'les marques des autres champs restent');
  assert.equal(hasMarks(marks), true);
});

test('withAvatarChange removes the photo from the card after: only the initials are left', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const preview = previewOf({ ...row(1), Avatar: ['L', 501] }, {}, referenceMaps, etabFlags);
  assert.deepEqual(preview.after.Avatar, ['L', 501]);
  const { after, marks } = withAvatarChange(preview, { action: 'remove', avant: 501 }, 0);
  assert.deepEqual(after.Avatar, ['L']);
  assert.equal(after.avatarUrl, undefined);
  assert.deepEqual(marks, { texts: {}, tags: {}, avatar: { before: 501, after: 'remove' } });
});

test('withAvatarChange never takes an address that the page did not make itself, and never changes what it is given', async () => {
  const { referenceMaps, etabFlags, row } = await directory();
  const preview = previewOf(row(1), {}, referenceMaps, etabFlags);
  const snapshot = structuredClone(preview);
  assert.equal(withAvatarChange(preview, { action: 'replace', avant: 0 }, undefined).after.avatarUrl, '', 'sans image : pas d\'adresse');
  assert.equal(withAvatarChange(preview, { action: 'replace', avant: 0 }, { url: 42 }).after.avatarUrl, '42', 'toujours une chaîne');
  assert.deepEqual(preview, snapshot);
});
