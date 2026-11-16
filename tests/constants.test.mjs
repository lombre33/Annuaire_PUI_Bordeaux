import { test } from 'node:test';
import assert from './support/assert.mjs';
import { CATEGORIES, CONSENT_ADMIN_LABEL, FILTERS, TAG_GROUPS, REFERENCE_TABLES, REFERENCE_SOURCES, LIST_CATEGORIES, MAIN_TABLE, PROFILE_FIELDS, fieldsFor } from '../constants.js';

test('FILTERS lists the 7 filter buttons in display order, Rôle dans le PUI last: a grouping has no button of its own, it is the groups of the menu it arranges', () => {
  assert.deepEqual(FILTERS.map(f => f.key), ['taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement', 'role']);
  assert.ok(!FILTERS.some(f => f.key === 'macro'), 'plus de filtre « Domaines » séparé');
  assert.ok(!FILTERS.some(f => f.key === 'macroTaches'), 'pas de filtre « Groupes d\'actions » : les groupes rangent le menu Actions');
  assert.ok(!FILTERS.some(f => f.key === 'actions'), 'plus de filtre « Actions » à part depuis la 1.39.0 : le menu des tâches porte ce nom');
  assert.equal(FILTERS.find(f => f.key === 'taches').label, 'Actions', 'les tâches s\'appellent « Actions » à l\'écran');
  assert.equal(FILTERS.find(f => f.key === 'role').label, 'Rôle dans le PUI');
});

test('TAG_GROUPS lists the 6 tag sections of a card in display order, Rôle dans le PUI first, Établissement and the groupings excluded', () => {
  assert.deepEqual(TAG_GROUPS.map(g => g.key), ['role', 'instances', 'taches', 'gt', 'competences', 'communautes']);
  assert.equal(TAG_GROUPS.find(g => g.key === 'taches').label, 'Actions');
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
    ['Actions', 'Taches', 'Communautes', 'GT', 'Competences', 'Referentiel_competences_CURIE', 'INSTANCES', 'Etablissements', 'Role_Dans_le_PUI']);
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
    curie: ['referenciel_C_U_R_I_E'],
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

test('the C.U.R.I.E groups are a second grouping of the same skills: an optional column of Competences of their own, and a skill it does not classify is left out of it', () => {
  const { competences, macro, curie } = CATEGORIES;
  assert.equal(curie.table, competences.table);
  assert.equal(curie.column, competences.column, 'les compétences de la personne se lisent dans la même colonne de BDD');
  assert.deepEqual(curie.field, ['referenciel_C_U_R_I_E']);
  assert.equal(curie.groups, 'competences');
  assert.equal(curie.fallback, undefined, 'pas de groupe « Hors C.U.R.I.E » : une compétence que la colonne ne classe pas n\'est pas montrée sous cet onglet (1.41.1)');
  assert.deepEqual(curie.referential, { table: 'Referentiel_competences_CURIE', field: ['Competence'] },
    'la colonne est une Référence vers la table du référentiel : Grist n\'envoie que le numéro de ligne (3, 13…), le libellé du groupe est dans cette table (1.43.1)');
  assert.equal(macro.referential, undefined, 'les domaines sont des noms : rien n\'y est écarté ni renommé');
  const source = key => REFERENCE_SOURCES.find(entry => entry.key === key);
  assert.deepEqual(source('curie').referential, curie.referential, 'la lecture des libellés le sait');
  assert.equal(source('macro').referential, undefined);
  assert.ok(REFERENCE_TABLES.includes('Referentiel_competences_CURIE'), 'la table du référentiel se lit, comme les autres tables de référence');
  assert.equal(macro.fallback, 'Autres', 'le rangement de départ garde son groupe de repli : personne n\'y devient introuvable');
  assert.equal(curie.optional, true, 'la colonne est facultative : sans elle, pas d\'onglet, ni bandeau ni avertissement');
  assert.equal(curie.numberedIn, undefined);
  assert.equal(macro.optional, undefined, 'la colonne des domaines reste attendue');
  assert.deepEqual([macro.tab, curie.tab], ['Classique', 'C.U.R.I.E'], 'les deux onglets, « Classique » à gauche');
  assert.deepEqual(competences.groupings, ['macro', 'curie'], 'le rangement de départ est « Classique » : le menu est inchangé tant que Grist ne donne pas C.U.R.I.E');
  assert.ok(competences.viewsLabel, 'la barre d\'onglets a un nom pour les lecteurs d\'écran');
  assert.notEqual(curie.color, competences.color);
  assert.notEqual(curie.color, macro.color, 'le nom d\'un groupe C.U.R.I.E se distingue d\'un domaine dans le menu');
  assert.ok(!FILTERS.some(f => f.key === 'curie'), 'aucun filtre ni bouton de plus');
  assert.ok(!TAG_GROUPS.some(g => g.key === 'curie'), 'aucune pastille de plus sur les cartes');
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
  assert.equal(CATEGORIES.actions.groups, undefined, 'la table des actions ne range rien : elle nomme les groupes');
  assert.equal(CATEGORIES.actions.groupings, undefined);
  assert.equal(CATEGORIES.actions.column, undefined, 'depuis la 1.39.0 la colonne BDD.Actions n\'est plus lue : les actions d\'une personne sont ses tâches');
  assert.ok(!FILTERS.concat(TAG_GROUPS, LIST_CATEGORIES, PROFILE_FIELDS.filter(field => field.kind === 'list')).some(entry => entry.key === 'actions'),
    'la table des actions n\'a ni filtre, ni pastille de carte, ni liste dans la fenêtre de profil');
  assert.deepEqual(taches.groupings, ['macroTaches'], 'un seul rangement : le menu Actions n\'a pas d\'onglets');
  assert.equal(taches.viewsLabel, undefined);
});

test('the tasks are what the person reads as « Actions »: the key, the table and the BDD column keep the name they had', () => {
  const { taches, macroTaches } = CATEGORIES;
  assert.equal(taches.label, 'Actions');
  assert.equal(macroTaches.label, 'Groupes d’actions');
  assert.equal(taches.table, 'Taches');
  assert.equal(taches.column, 'Taches');
  assert.ok(LIST_CATEGORIES.some(entry => entry.key === 'taches' && entry.column === 'Taches' && entry.table === 'Taches'));
});

test('only a grouping has a fallback, hint, placeholder, tab, numbering or optional column, and its source keeps them', () => {
  Object.entries(CATEGORIES).forEach(([key, category]) => {
    if (category.groups) return;
    ['numberedIn', 'fallback', 'hint', 'placeholder', 'tab', 'optional'].forEach(option =>
      assert.equal(category[option], undefined, `${key} n'est pas un regroupement : pas de ${option}`));
  });
  REFERENCE_SOURCES.forEach(source => {
    const { groups, fallback, numberedIn, optional } = CATEGORIES[source.key];
    assert.deepEqual([source.groups, source.fallback, source.numberedIn, source.optional], [groups, fallback, numberedIn, optional],
      `la source de ${source.key} garde les réglages de son regroupement`);
  });
});

test('a category and its groupings point at each other, and only the grouped category has a menu', () => {
  const grouped = Object.entries(CATEGORIES).filter(([, category]) => category.groupings);
  assert.deepEqual(grouped.map(([key]) => key), ['taches', 'competences']);
  grouped.forEach(([key, category]) => category.groupings.forEach(grouping => assert.equal(CATEGORIES[grouping].groups, key)));
  assert.deepEqual(grouped.map(([, category]) => category.groupings), [['macroTaches'], ['macro', 'curie']]);
  grouped.forEach(([key, category]) => {
    assert.deepEqual(FILTERS.find(f => f.key === key).groupings, category.groupings, `le menu ${key} connaît ses regroupements`);
    category.groupings.forEach(grouping => assert.ok(FILTERS.every(f => f.key !== grouping), 'un regroupement n\'a pas de menu'));
  });
  assert.equal(Object.values(CATEGORIES).filter(category => category.groups).length, grouped.flatMap(([, category]) => category.groupings).length,
    'chaque regroupement range une catégorie');
  const withTabs = grouped.filter(([, category]) => category.groupings.length > 1);
  assert.deepEqual(withTabs.map(([key]) => key), ['competences'], 'seul le menu Compétences a des onglets');
  withTabs.forEach(([, category]) => category.groupings.forEach(grouping =>
    assert.ok(CATEGORIES[grouping].tab, `${grouping} : un rangement parmi plusieurs a le texte de son onglet`)));
});

test('the button of a grouped menu says what it offers: groups to tick whole, and a search over both levels', () => {
  const grouped = [
    ['macro', /domaine/i, /domaine/i, /compétence/i],
    ['curie', /C\.U\.R\.I\.E/, /groupe/i, /compétence/i],
    ['macroTaches', /action/i, /action/i, /tâche/i]
  ];
  grouped.forEach(([key, hintNoun, placeholderNoun, detail]) => {
    const { hint, placeholder } = CATEGORIES[key];
    assert.match(hint, hintNoun);
    assert.match(placeholder, placeholderNoun);
    assert.match(placeholder, detail);
    assert.ok(placeholder.length <= 28, `${key} : le champ du menu est étroit (270px) : un texte plus long y est coupé, et au tactile il passe à 16px`);
  });
});

test('LIST_CATEGORIES maps each ReferenceList column of BDD to its own reference table', () => {
  assert.deepEqual(LIST_CATEGORIES, [
    { key: 'taches', column: 'Taches', table: 'Taches' },
    { key: 'communautes', column: 'Communautes', table: 'Communautes' },
    { key: 'gt', column: 'GT', table: 'GT' },
    { key: 'competences', column: 'Competences', table: 'Competences' },
    { key: 'macro', column: 'Competences', table: 'Competences', groups: 'competences' },
    { key: 'curie', column: 'Competences', table: 'Competences', groups: 'competences' },
    { key: 'macroTaches', column: 'Taches', table: 'Taches', groups: 'taches' },
    { key: 'instances', column: 'Instances', table: 'INSTANCES' }
  ]);
});

test('the profile starts with the choice to appear, an administrator\'s, then the photo, which anybody edits on their own fiche', () => {
  assert.deepEqual(PROFILE_FIELDS[0], { key: 'Accepte_apparaitre', label: CONSENT_ADMIN_LABEL, kind: 'consent', admin: true, afterCreation: true });
  assert.equal(PROFILE_FIELDS.filter(field => field.kind === 'consent').length, 1);
  assert.deepEqual(PROFILE_FIELDS[1], { key: 'Avatar', label: 'Photo de profil', kind: 'image', afterCreation: true });
  assert.equal(PROFILE_FIELDS.filter(field => field.kind === 'image').length, 1);
  assert.ok(!PROFILE_FIELDS[1].admin, 'la photo n\'est pas réservée à un administrateur');
});

test('the choice to appear is the administrator\'s on the fiche of somebody else, and nobody\'s on a fiche being created or on their own', () => {
  const keys = (...options) => fieldsFor(...options).map(field => field.key);
  assert.ok(keys(true).includes('Accepte_apparaitre'), 'un administrateur sur la fiche d\'une autre personne');
  assert.equal(keys(true)[0], 'Accepte_apparaitre', 'au début de la fenêtre');
  assert.ok(!keys(false).includes('Accepte_apparaitre'), 'sa propre fiche : l\'interrupteur du bandeau « Ma présence » la règle');
  assert.ok(!keys(true, true).includes('Accepte_apparaitre'), 'la création a sa propre case, cochée d\'avance');
  assert.ok(!keys(false, true).includes('Accepte_apparaitre'));
  assert.ok(!keys(undefined).includes('Accepte_apparaitre'), 'fermé par défaut : seul `true` exactement ouvre un champ d\'administrateur');
  assert.match(CONSENT_ADMIN_LABEL, /Accepte d.apparaître/);
});

test('the photo is offered on a fiche that exists, to its owner and to an administrator, and not on a fiche that is being created', () => {
  const keys = (...options) => fieldsFor(...options).map(field => field.key);
  assert.ok(keys(false).includes('Avatar'), 'sa propre fiche');
  assert.ok(keys(true).includes('Avatar'), 'la fiche d\'une autre personne, par un administrateur');
  assert.ok(!keys(false, true).includes('Avatar'), 'la création : la photo s\'ajoute ensuite, depuis « Modifier mon profil »');
  assert.ok(keys(false, true).includes('Etablissement'), 'la création choisit toujours l\'établissement');
});
