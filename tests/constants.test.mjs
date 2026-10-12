import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, FILTERS, TAG_GROUPS, REFERENCE_TABLES, LIST_CATEGORIES } from '../constants.js';

test('FILTERS lists the 7 filter buttons in display order', () => {
  assert.deepEqual(FILTERS.map(f => f.key), ['actions', 'taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement']);
});

test('TAG_GROUPS lists the 7 tag sections of a card in display order, Rôle PUI included, Établissement excluded', () => {
  assert.deepEqual(TAG_GROUPS.map(g => g.key), ['instances', 'actions', 'gt', 'competences', 'communautes', 'taches', 'role']);
});

test('a category has the same label and color wherever it appears', () => {
  FILTERS.concat(TAG_GROUPS).forEach(entry => {
    assert.equal(entry.label, CATEGORIES[entry.key].label);
    assert.equal(entry.color, CATEGORIES[entry.key].color);
  });
  const tag = Object.fromEntries(TAG_GROUPS.map(g => [g.key, g]));
  FILTERS.filter(f => tag[f.key]).forEach(f => assert.equal(f.color, tag[f.key].color));
});

test('every category names a reference table and a label column, and tables are read once each', () => {
  Object.values(CATEGORIES).forEach(category => {
    assert.ok(category.table && category.field && category.label && category.color);
  });
  const tables = REFERENCE_TABLES.map(([table]) => table);
  assert.equal(new Set(tables).size, tables.length);
  assert.deepEqual(tables, ['Actions', 'Taches', 'Communautees', 'GT', 'Competances', 'Instances', 'Etablissements', 'Role_Dans_le_PUI']);
});

test('LIST_CATEGORIES maps each ReferenceList column of Annuaire to its own reference table', () => {
  assert.deepEqual(LIST_CATEGORIES, [
    { key: 'actions', column: 'Actions', table: 'Actions' },
    { key: 'taches', column: 'Taches', table: 'Taches' },
    { key: 'communautes', column: 'Communautee_s_', table: 'Communautees' },
    { key: 'gt', column: 'GT', table: 'GT' },
    { key: 'instances', column: 'Instances', table: 'Instances' }
  ]);
});
