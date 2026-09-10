import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeValues, tableToRows, isInScope, text, pickLabel, enrich, refId } from '../grist-data.js';
import { filterContacts, createEmptyFilterState } from '../filters.js';

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

test('filterContacts applies the free-text search on Nom/Prenom', () => {
  const contacts = [
    { Nom: 'Dupont', Prenom: 'Alice' },
    { Nom: 'Martin', Prenom: 'Bob' }
  ];
  const activeFilters = createEmptyFilterState();
  assert.equal(filterContacts(contacts, activeFilters, 'dup').length, 1);
  assert.equal(filterContacts(contacts, activeFilters, '').length, 2);
  assert.equal(filterContacts(contacts, activeFilters, 'inconnu').length, 0);
});

test('filterContacts applies a category filter (etablissement)', () => {
  const contacts = [
    { Nom: 'A', etablissement_label: 'CHU' },
    { Nom: 'B', etablissement_label: 'Clinique' }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.etablissement.add('CHU');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].Nom, 'A');
});

test('pickLabel falls back to the next field when the first is empty', () => {
  assert.equal(pickLabel({ acronyme: 'CHU', nom_complet: 'CHU de Bordeaux' }, ['acronyme', 'nom_complet']), 'CHU');
  assert.equal(pickLabel({ acronyme: '', nom_complet: 'CHU de Bordeaux' }, ['acronyme', 'nom_complet']), 'CHU de Bordeaux');
  assert.equal(pickLabel({ acronyme: null, nom_complet: null }, ['acronyme', 'nom_complet']), '');
});

test('refId extracts the row id from the ["R", tableId, rowId] Grist encoding', () => {
  assert.equal(refId(['R', 'Etablissements', 42]), 42);
  assert.equal(refId(42), 42, 'un id déjà nu doit rester tel quel');
  assert.equal(refId(0), null);
  assert.equal(refId(null), null);
  assert.equal(refId(undefined), null);
  assert.equal(refId([]), null, 'tableau vide/mal formé: pas de crash, pas d\'id');
});

test('enrich: établissement resolves via the reference map (encoded ["R", ...] Reference), with an Etablissement2 fallback', () => {
  const referenceMaps = { Etablissements: { 12: 'CHU' } };
  // Encodage réel envoyé par Grist pour une Référence unique.
  assert.equal(enrich({ Etablissement: ['R', 'Etablissements', 12] }, referenceMaps).etablissement_label, 'CHU');
  // Id déjà nu (au cas où) : doit aussi fonctionner.
  assert.equal(enrich({ Etablissement: 12 }, referenceMaps).etablissement_label, 'CHU');
  // Référence présente mais introuvable dans la table (id orphelin) : repli sur Etablissement2.
  assert.equal(enrich({ Etablissement: ['R', 'Etablissements', 999], Etablissement2: 'Clinique du Parc' }, referenceMaps).etablissement_label, 'Clinique du Parc');
  assert.equal(enrich({}, referenceMaps).etablissement_label, '');
});

test('filterContacts applies a tag-list filter (e.g. instances)', () => {
  const contacts = [
    { Nom: 'A', instances_labels: ['CME'] },
    { Nom: 'B', instances_labels: ['COVIRIS'] }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].Nom, 'A');
});
