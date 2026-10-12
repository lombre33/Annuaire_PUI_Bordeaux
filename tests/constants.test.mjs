import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, FILTERS, TAG_GROUPS, REFERENCE_TABLES, REFERENCE_SOURCES, LIST_CATEGORIES, MAIN_TABLE, PROFILE_FIELDS, fieldsFor } from '../constants.js';

test('FILTERS lists the 7 filter buttons in display order: a grouping has no button of its own, it is the groups of the menu it arranges', () => {
  assert.deepEqual(FILTERS.map(f => f.key), ['actions', 'taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement']);
  assert.ok(!FILTERS.some(f => f.key === 'macro'), 'plus de filtre « Domaines » séparé');
  assert.ok(!FILTERS.some(f => f.key === 'macroTaches'), 'pas de filtre « Actions des tâches » : les actions rangent le menu Tâches');
});

test('TAG_GROUPS lists the 7 tag sections of a card in display order, Rôle PUI included, Établissement and the groupings excluded', () => {
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
    macroTaches: ['Taches_corrige', 'Taches'],
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
  assert.notEqual(macro.color, competences.color, 'le nom d\'un domaine se distingue d\'une compétence dans le menu');
  assert.equal(macro.label, 'Domaines');
  assert.equal(macro.numberedIn, undefined, 'Macro_competences est une colonne : le domaine ne se déduit d\'aucun numéro');
});

test('the tasks are grouped by action from their numbers: no column of their own, the labels of Taches, « Sans action » for what is not classified', () => {
  const { taches, macroTaches } = CATEGORIES;
  assert.equal(macroTaches.table, taches.table);
  assert.equal(macroTaches.column, taches.column);
  assert.deepEqual(macroTaches.field, taches.field, 'aucune colonne à ajouter dans Grist : le numéro est dans le libellé de la tâche');
  assert.equal(macroTaches.groups, 'taches');
  assert.equal(macroTaches.fallback, 'Sans action');
  assert.equal(macroTaches.numberedIn, 'actions', 'le numéro d\'une tâche désigne une ligne d\'Actions, dont le libellé nomme le groupe');
  assert.notEqual(macroTaches.numberedIn, macroTaches.groups);
  assert.ok(CATEGORIES[macroTaches.numberedIn], 'la catégorie visée existe');
  assert.notEqual(macroTaches.color, taches.color, 'le nom d\'une action se distingue d\'une tâche dans le menu');
  assert.equal(CATEGORIES.actions.groups, undefined, 'le filtre Actions reste tel quel');
  assert.equal(CATEGORIES.actions.grouping, undefined);
});

test('only a grouping has a fallback, hint, placeholder or numbering, and its source keeps them', () => {
  Object.entries(CATEGORIES).forEach(([key, category]) => {
    if (category.groups) return;
    ['numberedIn', 'fallback', 'hint', 'placeholder'].forEach(option =>
      assert.equal(category[option], undefined, `${key} n'est pas un regroupement : pas de ${option}`));
  });
  REFERENCE_SOURCES.forEach(source => {
    const { groups, fallback, numberedIn } = CATEGORIES[source.key];
    assert.deepEqual([source.groups, source.fallback, source.numberedIn], [groups, fallback, numberedIn],
      `la source de ${source.key} garde les réglages de son regroupement`);
  });
});

test('a category and its grouping point at each other, and only the grouped category has a menu', () => {
  const grouped = Object.entries(CATEGORIES).filter(([, category]) => category.grouping);
  assert.deepEqual(grouped.map(([key]) => key), ['taches', 'competences']);
  grouped.forEach(([key, category]) => assert.equal(CATEGORIES[category.grouping].groups, key));
  assert.deepEqual(grouped.map(([, category]) => category.grouping), ['macroTaches', 'macro']);
  grouped.forEach(([key, category]) => {
    assert.ok(FILTERS.find(f => f.key === key).grouping, `le menu ${key} connaît son regroupement`);
    assert.ok(FILTERS.every(f => f.key !== category.grouping), 'le regroupement n\'a pas de menu');
  });
  assert.equal(Object.values(CATEGORIES).filter(category => category.groups).length, grouped.length, 'chaque regroupement range une catégorie');
});

test('the button of a grouped menu says what it offers: groups to tick whole, and a search over both levels', () => {
  [['macro', /domaine/i, /compétence/i], ['macroTaches', /action/i, /tâche/i]].forEach(([key, noun, detail]) => {
    const { hint, placeholder } = CATEGORIES[key];
    assert.match(hint, noun);
    assert.match(placeholder, noun);
    assert.match(placeholder, detail);
    assert.ok(placeholder.length <= 28, `${key} : le champ du menu est étroit (270px) : un texte plus long y est coupé, et au tactile il passe à 16px`);
  });
});

test('LIST_CATEGORIES maps each ReferenceList column of BDD to its own reference table', () => {
  assert.deepEqual(LIST_CATEGORIES, [
    { key: 'actions', column: 'Actions', table: 'Actions' },
    { key: 'taches', column: 'Taches', table: 'Taches' },
    { key: 'communautes', column: 'Communautes', table: 'Communautes' },
    { key: 'gt', column: 'GT', table: 'GT' },
    { key: 'competences', column: 'Competences', table: 'Competences' },
    { key: 'macro', column: 'Competences', table: 'Competences', groups: 'competences' },
    { key: 'macroTaches', column: 'Taches', table: 'Taches', groups: 'taches' },
    { key: 'instances', column: 'Instances', table: 'INSTANCES' }
  ]);
});

test('the profile starts with the photo, which anybody edits on their own fiche, like the other columns of the person', () => {
  assert.deepEqual(PROFILE_FIELDS[0], { key: 'Avatar', label: 'Photo de profil', kind: 'image', afterCreation: true });
  assert.equal(PROFILE_FIELDS.filter(field => field.kind === 'image').length, 1);
  assert.ok(!PROFILE_FIELDS[0].admin, 'la photo n\'est pas réservée à un administrateur');
});

test('the photo is offered on a fiche that exists, to its owner and to an administrator, and not on a fiche that is being created', () => {
  const keys = (...options) => fieldsFor(...options).map(field => field.key);
  assert.ok(keys(false).includes('Avatar'), 'sa propre fiche');
  assert.ok(keys(true).includes('Avatar'), 'la fiche d\'une autre personne, par un administrateur');
  assert.ok(!keys(false, true).includes('Avatar'), 'la création : la photo s\'ajoute ensuite, depuis « Modifier mon profil »');
  assert.ok(keys(false, true).includes('Etablissement'), 'la création choisit toujours l\'établissement');
});
