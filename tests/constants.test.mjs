import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, FILTERS, TAG_GROUPS, REFERENCE_TABLES, LIST_CATEGORIES, MAIN_TABLE } from '../constants.js';

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
  assert.deepEqual(tables, ['Actions', 'Taches', 'Communautes', 'GT', 'Competences', 'INSTANCES', 'Etablissements', 'Role_Dans_le_PUI']);
});

test('the main table is BDD, and the old Annuaire table is no longer read', () => {
  assert.equal(MAIN_TABLE, 'BDD');
  assert.ok(!REFERENCE_TABLES.some(([table]) => table === 'Annuaire'));
});

test('each reference table lists its corrected label column before its raw one', () => {
  assert.deepEqual(Object.fromEntries(REFERENCE_TABLES), {
    Actions: ['Actions_corrigees', 'Actions'],
    Taches: ['Taches_corrige', 'Taches'],
    Communautes: ['communautes_corrigees', 'communautes'],
    GT: ['GT_corrige', 'GT'],
    Competences: ['Competences_corrigees', 'Competences'],
    INSTANCES: ['Instances_Corrigees', 'Instances'],
    Etablissements: ['acronyme', 'nom_complet'],
    Role_Dans_le_PUI: 'Role'
  });
});

test('LIST_CATEGORIES maps each ReferenceList column of BDD to its own reference table', () => {
  assert.deepEqual(LIST_CATEGORIES, [
    { key: 'actions', column: 'Actions', table: 'Actions' },
    { key: 'taches', column: 'Taches', table: 'Taches' },
    { key: 'communautes', column: 'Communautes', table: 'Communautes' },
    { key: 'gt', column: 'GT', table: 'GT' },
    { key: 'competences', column: 'Competences', table: 'Competences' },
    { key: 'instances', column: 'Instances', table: 'INSTANCES' }
  ]);
});
