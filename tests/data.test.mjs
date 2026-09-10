import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeValues, tableToRows, isInScope, text } from '../grist-data.js';
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
