import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, FILTERS, TAG_GROUPS, REFERENCE_TABLES, REFERENCE_SOURCES, LIST_CATEGORIES, MAIN_TABLE } from '../constants.js';

test('FILTERS lists the 8 filter buttons in display order, the macro skills just before the detailed ones', () => {
  assert.deepEqual(FILTERS.map(f => f.key), ['actions', 'taches', 'communautes', 'gt', 'macro', 'competences', 'instances', 'etablissement']);
});

test('TAG_GROUPS lists the 7 tag sections of a card in display order, Rôle PUI included, Établissement and the macro skills excluded', () => {
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
  assert.equal(new Set(REFERENCE_TABLES).size, REFERENCE_TABLES.length);
  assert.deepEqual(REFERENCE_TABLES,
    ['Actions', 'Taches', 'Communautes', 'GT', 'Competences', 'INSTANCES', 'Etablissements', 'Role_Dans_le_PUI']);
});

test('the main table is BDD, and the old Annuaire table is no longer read', () => {
  assert.equal(MAIN_TABLE, 'BDD');
  assert.ok(!REFERENCE_TABLES.includes('Annuaire'));
});

test('each category lists its corrected label column before its raw one', () => {
  assert.deepEqual(Object.fromEntries(REFERENCE_SOURCES.map(({ key, field }) => [key, field])), {
    actions: ['Actions_corrigees', 'Actions'],
    taches: ['Taches_corrige', 'Taches'],
    communautes: ['communautes_corrigees', 'communautes'],
    gt: ['GT_corrige', 'GT'],
    competences: ['Competences_corrigees', 'Competences'],
    macro: ['Macro_competences'],
    instances: ['Instances_Corrigees', 'Instances'],
    etablissement: ['acronyme', 'nom_complet'],
    role: 'Role'
  });
});

test('the macro skills are a grouping of the detailed skills: same table and BDD column, own label column, « Autres » for what is not classified', () => {
  const { competences, macro } = CATEGORIES;
  assert.equal(macro.table, competences.table);
  assert.equal(macro.column, competences.column);
  assert.deepEqual(macro.field, ['Macro_competences']);
  assert.equal(macro.groups, 'competences');
  assert.equal(macro.fallback, 'Autres');
  assert.notEqual(macro.color, competences.color);
  assert.equal(macro.label, 'Domaines');
  assert.match(macro.hint, /Compétences macro/, 'l\'infobulle fait le lien avec le nom donné dans Grist');
  assert.equal(Object.values(CATEGORIES).filter(category => category.groups).length, 1);
});

test('LIST_CATEGORIES maps each ReferenceList column of BDD to its own reference table', () => {
  assert.deepEqual(LIST_CATEGORIES, [
    { key: 'actions', column: 'Actions', table: 'Actions' },
    { key: 'taches', column: 'Taches', table: 'Taches' },
    { key: 'communautes', column: 'Communautes', table: 'Communautes' },
    { key: 'gt', column: 'GT', table: 'GT' },
    { key: 'competences', column: 'Competences', table: 'Competences' },
    { key: 'macro', column: 'Competences', table: 'Competences', groups: 'competences' },
    { key: 'instances', column: 'Instances', table: 'INSTANCES' }
  ]);
});
