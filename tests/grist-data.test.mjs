import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeValues, tableToRows, isInScope, text, pickLabel, refId, refLabel, normalize, compareLabels,
  formatPhone, createRequestSequencer, referenceMapsEqual, sortWithCheckedFirst, resolveListItem,
  labelMapFromRows, mailtoHref
} from '../grist-data.js';

test('safeValues strips the Grist list marker "L" and empty values', () => {
  assert.deepEqual(safeValues(['L']), []);
  assert.deepEqual(safeValues(['L', 5, 12]), [5, 12]);
  assert.deepEqual(safeValues(null), []);
  assert.deepEqual(safeValues(undefined), []);
  assert.deepEqual(safeValues(0), []);
  assert.deepEqual(safeValues(''), []);
  assert.deepEqual(safeValues('x'), ['x']);
  assert.deepEqual(safeValues(42), [42]);
});

test('text() normalizes null/undefined to an empty string and trims', () => {
  assert.equal(text(null), '');
  assert.equal(text(undefined), '');
  assert.equal(text('  Bordeaux  '), 'Bordeaux');
  assert.equal(text(7), '7');
});

test('normalize() folds case and strips accents for resilient label matching', () => {
  assert.equal(normalize('Oncologie'), 'oncologie');
  assert.equal(normalize('École'), 'ecole');
  assert.equal(normalize('Référent qualité'), 'referent qualite');
  assert.equal(normalize('  Pharmacie Clinique  '), 'pharmacie clinique');
  assert.equal(normalize(null), '');
});

test('compareLabels sorts using French locale rules, not raw UTF-16 order', () => {
  // .sort() par défaut classerait "UBM" avant "chu" (majuscules d'abord) —
  // ce n'est pas l'ordre alphabétique attendu par un utilisateur francophone.
  assert.deepEqual(['UBM', 'chu', 'Anap'].sort(compareLabels), ['Anap', 'chu', 'UBM']);
});

test('formatPhone restores the French leading 0 lost by Grist\'s Numeric column type', () => {
  assert.equal(formatPhone(556789012), '05 56 78 90 12');
  assert.equal(formatPhone('556789012'), '05 56 78 90 12');
  assert.equal(formatPhone('0556789012'), '05 56 78 90 12', 'un numéro à 10 chiffres déjà complet reste correct');
  assert.equal(formatPhone(0), '', '0 = case non renseignée, comme partout ailleurs dans le code (cf. safeValues)');
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone(undefined), '');
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('123'), '123', 'longueur inattendue: renvoyé tel quel plutôt que déformé');
});

test('sortWithCheckedFirst moves checked values to the front while keeping each group alphabetically sorted', () => {
  const sorted = ['Angers', 'Bordeaux', 'Paris']; // déjà trié alphabétiquement, comme dans render.js
  assert.deepEqual(sortWithCheckedFirst(sorted, new Set(['Paris'])), ['Paris', 'Angers', 'Bordeaux']);
  assert.deepEqual(sortWithCheckedFirst(sorted, new Set()), ['Angers', 'Bordeaux', 'Paris']);
  assert.deepEqual(sortWithCheckedFirst(sorted, new Set(['Angers', 'Paris'])), ['Angers', 'Paris', 'Bordeaux'],
    'le groupe coché doit lui-même rester alphabétique (Angers avant Paris), pas dans l\'ordre de sélection');
});

test('createRequestSequencer only recognizes the most recently started request as latest', () => {
  const sequencer = createRequestSequencer();
  const first = sequencer.next();
  const second = sequencer.next();
  assert.equal(sequencer.isLatest(first), false, 'une requête plus ancienne ne doit plus être "latest" une fois une nouvelle démarrée');
  assert.equal(sequencer.isLatest(second), true);
});

test('referenceMapsEqual compares reference-table content regardless of key order', () => {
  const a = { Etablissements: { 1: 'CHU', 2: 'UBM' }, Actions: { 5: 'Vaccination' } };
  const b = { Actions: { 5: 'Vaccination' }, Etablissements: { 2: 'UBM', 1: 'CHU' } };
  assert.equal(referenceMapsEqual(a, b), true);
  assert.equal(referenceMapsEqual(a, { ...b, Actions: { 5: 'Autre' } }), false);
  assert.equal(referenceMapsEqual({}, {}), true);
  assert.equal(referenceMapsEqual({ Etablissements: { 1: 'CHU' } }, {}), false);
});

test('isInScope: regression test for the perimetre_all filter', () => {
  // Avant correction, `Array.isArray(p) && p.length > 0` était toujours vrai
  // car ['L'] (liste vide côté Grist) a une longueur de 1.
  assert.equal(isInScope({ perimetre_all: ['L'] }), false, 'une liste Grist vide ne doit pas être "in scope"');
  assert.equal(isInScope({ perimetre_all: ['L', 3] }), true);
  assert.equal(isInScope({ perimetre_all: undefined }), false);
  assert.equal(isInScope({ perimetre_all: [] }), false);
});

test('tableToRows converts a Grist column-oriented table into rows', () => {
  const table = { id: [1, 2], Nom: ['Dupont', 'Martin'], Prenom: ['Alice', 'Bob'] };
  assert.deepEqual(tableToRows(table), [
    { id: 1, Nom: 'Dupont', Prenom: 'Alice' },
    { id: 2, Nom: 'Martin', Prenom: 'Bob' }
  ]);
  assert.deepEqual(tableToRows(null), []);
  assert.deepEqual(tableToRows([{ id: 1 }]), [{ id: 1 }]);
});

test('tableToRows returns no rows when the table object has no id array (defensive default, not a crash)', () => {
  assert.deepEqual(tableToRows({ Nom: ['Dupont'] }), []);
});

test('pickLabel falls back to the next field when the first is empty', () => {
  assert.equal(pickLabel({ acronyme: 'CHU', nom_complet: 'CHU de Bordeaux' }, ['acronyme', 'nom_complet']), 'CHU');
  assert.equal(pickLabel({ acronyme: '', nom_complet: 'CHU de Bordeaux' }, ['acronyme', 'nom_complet']), 'CHU de Bordeaux');
  assert.equal(pickLabel({ acronyme: null, nom_complet: null }, ['acronyme', 'nom_complet']), '');
});

test('refId extracts the row id from the ["R", tableId, rowId] Grist encoding, but not from a string', () => {
  assert.equal(refId(['R', 'Etablissements', 42]), 42);
  assert.equal(refId(42), 42, 'un id déjà nu doit rester tel quel');
  assert.equal(refId('UBM'), null, 'une chaîne est du texte déjà résolu, pas un id — voir refLabel()');
  assert.equal(refId(0), null);
  assert.equal(refId(null), null);
  assert.equal(refId(undefined), null);
  assert.equal(refId([]), null, 'tableau vide/mal formé: pas de crash, pas d\'id');
});

test('refLabel resolves a Reference cell in any of the 3 shapes Grist can send', () => {
  const referenceMap = { 12: 'CHU' };
  // Cas réel constaté en prod : la table liée a une "visible column" configurée,
  // Grist envoie déjà le texte d'affichage résolu ("UBM") plutôt qu'un id.
  assert.equal(refLabel('UBM', referenceMap), 'UBM');
  // Encodage brut d'une Référence : ['R', tableId, rowId].
  assert.equal(refLabel(['R', 'Etablissements', 12], referenceMap), 'CHU');
  // Id déjà nu.
  assert.equal(refLabel(12, referenceMap), 'CHU');
  // Référence vide ou introuvable.
  assert.equal(refLabel(0, referenceMap), '');
  assert.equal(refLabel(['R', 'Etablissements', 999], referenceMap), '');
});

test('resolveListItem resolves a ReferenceList item whether Grist sends a raw id or already-resolved text', () => {
  // Régression prod du 14/09 (voir CHANGELOG 1.5.1) : une ReferenceList peut
  // arriver avec des items déjà résolus en texte (visible column configurée
  // sur la table liée), pas seulement des ids numériques — même ambiguïté que
  // refId()/refLabel() pour une Référence unique, mais jamais gérée ici avant
  // ce correctif. Résultat en prod : tags Instances/Actions/GT/Communautés/
  // Tâches disparus de toutes les cartes.
  const referenceMap = { 7: 'CME' };
  assert.equal(resolveListItem('CME', referenceMap), 'CME', 'texte déjà résolu: utilisé tel quel');
  assert.equal(resolveListItem(7, referenceMap), 'CME', 'id numérique brut: résolu via la table de référence');
  assert.equal(resolveListItem(999, referenceMap), '', 'id numérique introuvable: chaîne vide, pas de valeur fantôme');
  assert.equal(resolveListItem('', referenceMap), '');
});

test('labelMapFromRows resolves rows into an id->label map using the given label field, skipping rows without a label', () => {
  const rows = tableToRows({ id: [1, 2], Action: ['Vaccination', ''] });
  assert.deepEqual(labelMapFromRows(rows, 'Action'), { 1: 'Vaccination' });
});

test('labelMapFromRows falls back through multiple label fields in order (acronyme -> nom_complet)', () => {
  const rows = tableToRows({ id: [1, 2], acronyme: ['CHU', ''], nom_complet: ['CHU de Bordeaux', 'Clinique X'] });
  assert.deepEqual(labelMapFromRows(rows, ['acronyme', 'nom_complet']), { 1: 'CHU', 2: 'Clinique X' });
});

test('labelMapFromRows ignores rows without an id', () => {
  assert.deepEqual(labelMapFromRows([{ id: null, Action: 'Orpheline' }, { id: 3, Action: 'Audit' }], 'Action'), { 3: 'Audit' });
});

test('mailtoHref builds a link for a plain address and refuses anything that could add recipients or parameters', () => {
  assert.equal(mailtoHref('ana.martin@chu-bordeaux.fr'), 'mailto:ana.martin@chu-bordeaux.fr');
  assert.equal(mailtoHref('  ana+pui@chu.fr  '), 'mailto:ana+pui@chu.fr', 'espaces autour retirés, + conservé');
  assert.equal(mailtoHref("o'brien@chu.fr"), "mailto:o'brien@chu.fr");
  ['a@b.fr?cc=x@y.fr', 'a@b.fr,c@d.fr', 'a@b.fr;c@d.fr', 'a@b.fr&bcc=x@y.fr', 'a@b.fr#x', 'a b@c.fr',
    'pas-une-adresse', '@b.fr', 'a@', '', null, undefined].forEach(value => {
    assert.equal(mailtoHref(value), '', `${value} ne doit pas devenir un lien`);
  });
});
