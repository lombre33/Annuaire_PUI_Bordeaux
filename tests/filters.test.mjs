import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, normalize, enrich } from '../grist-data.js';
import { FILTERS } from '../constants.js';
import {
  filterContacts, createEmptyFilterState, pruneStaleFilters, computeFilterCounts,
  menuGroups, groupState, toggleGroup, selectionCount
} from '../filters.js';

test('filterContacts applies the free-text search on nom/prenom', () => {
  const contacts = [
    { nom: 'Dupont', prenom: 'Alice' },
    { nom: 'Martin', prenom: 'Bob' }
  ];
  const activeFilters = createEmptyFilterState();
  assert.equal(filterContacts(contacts, activeFilters, 'dup').length, 1);
  assert.equal(filterContacts(contacts, activeFilters, '').length, 2);
  assert.equal(filterContacts(contacts, activeFilters, 'inconnu').length, 0);
});

test('filterContacts free-text search on nom/prenom is accent- and case-insensitive', () => {
  const contacts = [
    { nom: 'École', prenom: 'Alice' },
    { nom: 'Autre', prenom: 'Bob' }
  ];
  const activeFilters = createEmptyFilterState();
  assert.equal(filterContacts(contacts, activeFilters, 'ecole').length, 1);
  assert.equal(filterContacts(contacts, activeFilters, 'ÉCOLE').length, 1);
});

test('filterContacts applies a category filter (etablissement) via the uniform labels.etablissement array', () => {
  const contacts = [
    { nom: 'A', labels: { etablissement: ['CHU'] } },
    { nom: 'B', labels: { etablissement: ['Clinique'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.etablissement.add('CHU');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].nom, 'A');
});

test('filterContacts applies a tag-list filter (e.g. instances)', () => {
  const contacts = [
    { nom: 'A', labels: { instances: ['CME'] } },
    { nom: 'B', labels: { instances: ['COVIRIS'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].nom, 'A');
});

test('filterContacts matches a category filter regardless of case/accent differences between a card label and the reference-table option', () => {
  // Le libellé d'une carte et celui du menu peuvent venir de colonnes
  // différentes (libellé brut ou corrigé) et diverger par la casse ou les
  // accents sans être une vraie différence pour l'utilisateur (cf. CHANGELOG,
  // audit archi/sécurité).
  const contacts = [
    { nom: 'A', labels: { competences: ['oncologie'] } },
    { nom: 'B', labels: { competences: ['Autre'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.competences.add('Oncologie');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].nom, 'A');
});

test('pruneStaleFilters drops a selected label that no longer exists in its reference table (e.g. renamed in Grist)', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.etablissement.add('CHU');
  activeFilters.etablissement.add('UBM');
  const referenceMaps = { etablissement: { 1: 'CHU-Bordeaux', 2: 'UBM' } };
  const pruned = pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...pruned.etablissement], ['UBM'], 'CHU a été renommé en CHU-Bordeaux : la sélection orpheline doit disparaître, UBM doit rester');
  assert.deepEqual([...activeFilters.etablissement], ['CHU', 'UBM'], 'l\'état d\'origine n\'est pas modifié');
});

test('pruneStaleFilters leaves selections untouched when nothing changed, even if temporarily no contact matches', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  const referenceMaps = { instances: { 7: 'CME' } };
  const pruned = pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...pruned.instances], ['CME'], 'CME reste une option valide du menu, donc pas une sélection périmée');
  assert.deepEqual(Object.keys(pruned), Object.keys(createEmptyFilterState()), 'une entrée par catégorie, même sans sélection');
});

test('filterContacts applies the scope toggle (fondateur/partenaire) in addition to the fixed eligibility gate applied upstream', () => {
  const contacts = [
    { nom: 'A', etablissement_fondateur: true, etablissement_partenaire: false },
    { nom: 'B', etablissement_fondateur: false, etablissement_partenaire: true }
  ];
  const activeFilters = createEmptyFilterState();
  assert.equal(filterContacts(contacts, activeFilters, '', { fondateur: true, partenaire: true }).length, 2);
  const onlyFondateurs = filterContacts(contacts, activeFilters, '', { fondateur: true, partenaire: false });
  assert.equal(onlyFondateurs.length, 1);
  assert.equal(onlyFondateurs[0].nom, 'A');
  assert.equal(filterContacts(contacts, activeFilters, '', { fondateur: false, partenaire: false }).length, 0);
  // scope omis (ex: anciens appels) : aucun filtrage par scope, comportement inchangé.
  assert.equal(filterContacts(contacts, activeFilters, '').length, 2);
});

test('filterContacts excludeKey skips one category\'s own selection while still applying every other filter', () => {
  const contacts = [
    { nom: 'A', labels: { instances: ['CME'], gt: ['GT1'] } },
    { nom: 'B', labels: { instances: ['COVIRIS'], gt: ['GT1'] } },
    { nom: 'C', labels: { instances: ['CME'], gt: ['GT2'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  activeFilters.gt.add('GT1');
  // Sans excludeKey : les 2 filtres s'appliquent, seul A matche (CME + GT1).
  assert.deepEqual(filterContacts(contacts, activeFilters, '').map(c => c.nom), ['A']);
  // excludeKey='instances' : le filtre Instances est ignoré, seul GT1 s'applique -> A et B.
  assert.deepEqual(filterContacts(contacts, activeFilters, '', undefined, 'instances').map(c => c.nom), ['A', 'B']);
});

test('computeFilterCounts tallies, per filter category, how many contacts each option would match given every OTHER active filter/search/scope', () => {
  const contacts = [
    { nom: 'Alice', labels: { instances: ['CME'], gt: ['GT1'] }, etablissement_fondateur: true, etablissement_partenaire: false },
    { nom: 'Bob', labels: { instances: ['COVIRIS'], gt: ['GT1'] }, etablissement_fondateur: false, etablissement_partenaire: true },
    { nom: 'Chloe', labels: { instances: ['CME'], gt: ['GT2'] }, etablissement_fondateur: true, etablissement_partenaire: false }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.gt.add('GT1'); // ne doit pas influencer le compte de sa propre catégorie (gt), seulement celui des autres.

  const counts = computeFilterCounts(contacts, activeFilters, '', { fondateur: true, partenaire: true });
  // instances : filtré par gt=GT1 (l'autre filtre actif) -> Alice(CME) + Bob(COVIRIS), pas Chloe.
  assert.deepEqual(counts.instances, { cme: 1, coviris: 1 });
  // gt : sa propre sélection (GT1) est ignorée pour son propre compte -> les 3 contacts comptent.
  assert.deepEqual(counts.gt, { gt1: 2, gt2: 1 });
});

test('computeFilterCounts keys are normalized (case/accent-insensitive), matching filterContacts\' own matching rules', () => {
  const contacts = [{ nom: 'A', labels: { competences: ['oncologie'] } }];
  const activeFilters = createEmptyFilterState();
  const counts = computeFilterCounts(contacts, activeFilters, '', undefined);
  assert.equal(counts.competences[normalize('Oncologie')], 1, 'le tally doit matcher un libellé de référence "Oncologie" malgré la casse différente');
});

// ===== Compétences et domaines : un seul menu, un seul filtre =====
// Les domaines (compétences macro) rangent le menu Compétences : cocher un domaine coche
// toutes ses compétences. Le filtre ne connaît que des compétences.

const competencesFilter = FILTERS.find(filter => filter.key === 'competences');
const names = contacts => contacts.map(contact => contact.nom);

// Les libellés d'une table Competences : id → libellé, id → domaine (le repli « Autres »
// est déjà posé, comme le fait loadDirectory).
const SKILLS = {
  competences: { 1: 'Oncologie', 2: 'Hématologie', 3: 'Pharmacovigilance', 4: 'Divers', 5: 'Radiothérapie' },
  macro: { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Pharmacie', 4: 'Autres', 5: 'Cancérologie' }
};

test('createEmptyFilterState has no filter of its own for the domains: they are groups of the skills menu', () => {
  assert.deepEqual(Object.keys(createEmptyFilterState()),
    ['actions', 'taches', 'communautes', 'gt', 'competences', 'instances', 'etablissement']);
});

test('ticking a domain keeps the contacts with at least one skill in it, exactly like the former « Domaines » filter', () => {
  // Chaque contact est enrichi comme dans l'annuaire : ses domaines se déduisent de ses compétences.
  const contacts = [
    { nom: 'A', Competences: ['L', 1, 2] },
    { nom: 'B', Competences: ['L', 3, 1] },
    { nom: 'C', Competences: ['L', 4] },
    { nom: 'D', Competences: ['L'] },
    { nom: 'E', Competences: ['L', 5] }
  ].map(contact => enrich(contact, SKILLS));
  const groups = menuGroups(competencesFilter, SKILLS);
  assert.deepEqual(groups.map(group => group.label), ['Cancérologie', 'Pharmacie', 'Autres']);

  groups.forEach(group => {
    const activeFilters = createEmptyFilterState();
    toggleGroup(activeFilters.competences, group.values);
    assert.deepEqual(names(filterContacts(contacts, activeFilters, '')),
      names(contacts.filter(contact => contact.labels.macro.includes(group.label))),
      `cocher « ${group.label} » donne les contacts de ce domaine, ni plus ni moins`);
  });
  assert.deepEqual(names(contacts.filter(contact => contact.labels.macro.length === 0)), ['D'], 'sans compétence, aucun domaine : la personne n\'est dans aucun groupe');
});

test('domains add up (OU), skills add up with them, and the whole still combines (ET) with the other filters', () => {
  const contacts = [
    { nom: 'A', labels: { competences: ['Oncologie', 'Hématologie'], instances: ['CME'] } },
    { nom: 'B', labels: { competences: ['Pharmacovigilance', 'Oncologie'], instances: ['COVIRIS'] } },
    { nom: 'C', labels: { competences: ['Divers'], instances: ['CME'] } },
    { nom: 'D', labels: { competences: ['Radiothérapie'], instances: ['CME'] } }
  ];
  const activeFilters = createEmptyFilterState();
  toggleGroup(activeFilters.competences, ['Pharmacovigilance']); // le domaine Pharmacie
  toggleGroup(activeFilters.competences, ['Divers']); // le domaine Autres
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['B', 'C'], 'OU entre deux domaines');

  activeFilters.competences.add('Radiothérapie'); // une compétence seule, d'un autre domaine
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['B', 'C', 'D'], 'une compétence s\'ajoute aux domaines cochés');

  activeFilters.instances.add('CME');
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['C', 'D'], 'ET avec un autre filtre');
});

test('a domain ticked then partly unticked keeps only the contacts of the skills still ticked', () => {
  const contacts = [
    { nom: 'A', labels: { competences: ['Oncologie'] } },
    { nom: 'B', labels: { competences: ['Hématologie'] } },
    { nom: 'C', labels: { competences: ['Radiothérapie'] } }
  ];
  const activeFilters = createEmptyFilterState();
  const cancerology = menuGroups(competencesFilter, SKILLS)[0].values;
  toggleGroup(activeFilters.competences, cancerology);
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['A', 'B', 'C']);
  activeFilters.competences.delete('Hématologie');
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['A', 'C']);
});

test('computeFilterCounts counts a contact once per domain, whatever the number of its skills in that domain', () => {
  const contacts = [
    { nom: 'A', labels: { macro: ['Cancérologie'], competences: ['Oncologie', 'Hématologie'] } },
    { nom: 'B', labels: { macro: ['Cancérologie', 'Pharmacie'], competences: ['Oncologie', 'Pharmacovigilance'] } }
  ];
  const counts = computeFilterCounts(contacts, createEmptyFilterState(), '', undefined);
  assert.deepEqual(counts.macro, { cancerologie: 2, pharmacie: 1 });
  assert.equal(counts.competences.oncologie, 2);
});

test('the count of a domain ignores the skills ticked in its own menu, but not the other filters, the search or the scope', () => {
  const contacts = [
    { nom: 'Alice', labels: { macro: ['Cancérologie'], competences: ['Oncologie'], instances: ['CME'] }, etablissement_fondateur: true },
    { nom: 'Bob', labels: { macro: ['Cancérologie', 'Pharmacie'], competences: ['Oncologie', 'Pharmacovigilance'], instances: ['COVIRIS'] }, etablissement_partenaire: true },
    { nom: 'Chloe', labels: { macro: ['Pharmacie'], competences: ['Pharmacovigilance'], instances: ['CME'] }, etablissement_fondateur: true }
  ];
  const scope = { fondateur: true, partenaire: true };
  const activeFilters = createEmptyFilterState();
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', scope).macro, { cancerologie: 2, pharmacie: 2 });

  // Cocher une compétence du menu ne change pas le nombre de cartes de son domaine : ce
  // nombre dit ce que donnerait le domaine, comme celui d'une compétence ignore sa propre sélection.
  activeFilters.competences.add('Oncologie');
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', scope).macro, { cancerologie: 2, pharmacie: 2 });

  // Un autre filtre, la recherche et l'interrupteur Fondateurs/Partenaires s'appliquent bien.
  activeFilters.instances.add('CME');
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', scope).macro, { cancerologie: 1, pharmacie: 1 }, 'autre filtre');
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, 'chlo', scope).macro, { pharmacie: 1 }, 'recherche');
  assert.deepEqual(computeFilterCounts(contacts, createEmptyFilterState(), '', { fondateur: true, partenaire: false }).macro,
    { cancerologie: 1, pharmacie: 1 }, 'interrupteur');
});

test('computeFilterCounts tallies the domains with the same keys as the filtering: case and accents ignored', () => {
  const contacts = [{ nom: 'A', labels: { macro: ['cancérologie'], competences: ['Oncologie'] } }];
  const counts = computeFilterCounts(contacts, createEmptyFilterState(), '', undefined);
  assert.equal(counts.macro[normalize('Cancérologie')], 1);
});

test('pruneStaleFilters drops a ticked skill that no longer exists, whatever domain it was in', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.competences.add('Ancienne compétence');
  activeFilters.competences.add('Oncologie');
  const pruned = pruneStaleFilters(activeFilters, { competences: { 1: 'Oncologie' }, macro: { 1: 'Cancérologie' } });
  assert.deepEqual([...pruned.competences], ['Oncologie']);
  assert.ok(!('macro' in pruned), 'pas de sélection de domaine à purger : le domaine n\'est pas une valeur du filtre');
});

// ===== Les groupes du menu =====

test('menuGroups ranges the skills by domain: domains sorted, « Autres » last, skills sorted in each', () => {
  const groups = menuGroups(competencesFilter, {
    competences: { 1: 'Zoologie', 2: 'Écologie', 3: 'Biologie', 4: 'Divers', 5: 'Chimie' },
    macro: { 1: 'Vivant', 2: 'Vivant', 3: 'Vivant', 4: 'Autres', 5: 'Sciences' }
  });
  assert.deepEqual(groups, [
    { label: 'Sciences', values: ['Chimie'] },
    { label: 'Vivant', values: ['Biologie', 'Écologie', 'Zoologie'] },
    { label: 'Autres', values: ['Divers'] }
  ], 'tri alphabétique français : « Écologie » entre « Biologie » et « Zoologie »');
});

test('menuGroups keeps the fallback group last and files an unclassified skill in it, whatever the spelling of « Autres »', () => {
  const groups = menuGroups(competencesFilter, {
    competences: { 1: 'Alpha', 2: 'Beta', 3: 'Gamma' },
    macro: { 1: 'autres', 2: 'Zèbre' } // la ligne 3 n'est pas classée du tout
  });
  assert.deepEqual(groups, [
    { label: 'Zèbre', values: ['Beta'] },
    { label: 'autres', values: ['Alpha', 'Gamma'] }
  ], 'un seul groupe de repli, écrit comme la plus petite ligne, rejeté en dernier malgré son initiale');
});

test('menuGroups merges two spellings of a domain into one group, like the counts do', () => {
  const groups = menuGroups(competencesFilter, {
    competences: { 1: 'Oncologie', 2: 'Hématologie' },
    macro: { 1: 'Cancérologie', 2: 'cancerologie' }
  });
  assert.deepEqual(groups, [{ label: 'Cancérologie', values: ['Hématologie', 'Oncologie'] }]);
});

test('menuGroups lists a skill once per domain, and twice when its label is written on rows of two domains', () => {
  const groups = menuGroups(competencesFilter, {
    competences: { 1: 'Gestion', 2: 'Gestion', 3: 'Gestion', 4: 'Droit' },
    macro: { 1: 'Pilotage', 2: 'Pilotage', 3: 'Achats', 4: 'Achats' }
  });
  assert.deepEqual(groups, [
    { label: 'Achats', values: ['Droit', 'Gestion'] },
    { label: 'Pilotage', values: ['Gestion'] }
  ]);
});

test('menuGroups leaves a menu flat when the category has no grouping, or Grist gives none', () => {
  const maps = { actions: { 1: 'Vaccination' }, competences: { 1: 'Oncologie' }, macro: { 1: 'Cancérologie' } };
  assert.equal(menuGroups(FILTERS.find(filter => filter.key === 'actions'), maps), null, 'Actions n\'a pas de regroupement');
  assert.equal(menuGroups(competencesFilter, { competences: { 1: 'Oncologie' }, macro: {} }), null, 'colonne de domaine absente : menu plat');
  assert.equal(menuGroups(competencesFilter, { competences: { 1: 'Oncologie' } }), null, 'aucune lecture du regroupement');
  assert.equal(menuGroups(competencesFilter, { competences: {}, macro: {} }), null);
  assert.deepEqual(menuGroups(competencesFilter, maps), [{ label: 'Cancérologie', values: ['Oncologie'] }]);
});

test('groupState tells whether none, some or all of the values of a group are ticked', () => {
  const values = ['A', 'B', 'C'];
  assert.equal(groupState(new Set(), values), 'none');
  assert.equal(groupState(new Set(['X']), values), 'none', 'une valeur d\'ailleurs ne compte pas');
  assert.equal(groupState(new Set(['A']), values), 'some');
  assert.equal(groupState(new Set(['A', 'C', 'X']), values), 'some');
  assert.equal(groupState(new Set(['C', 'A', 'B']), values), 'all');
});

test('toggleGroup ticks all the values of a group, completes a partial group, and unticks a complete one — touching nothing else', () => {
  const selected = new Set(['Ailleurs']);
  toggleGroup(selected, ['A', 'B', 'C']);
  assert.deepEqual([...selected].sort(), ['A', 'Ailleurs', 'B', 'C'], 'vide → complet');
  selected.delete('B');
  toggleGroup(selected, ['A', 'B', 'C']);
  assert.deepEqual([...selected].sort(), ['A', 'Ailleurs', 'B', 'C'], 'partiel → complet, pas vide');
  toggleGroup(selected, ['A', 'B', 'C']);
  assert.deepEqual([...selected], ['Ailleurs'], 'complet → vide, sans toucher aux autres groupes');
});

test('selectionCount counts a whole domain once and every other ticked skill once, so ticking a domain shows 1, not 12', () => {
  const groups = [
    { label: 'Cancérologie', values: ['Oncologie', 'Hématologie', 'Radiothérapie'] },
    { label: 'Pharmacie', values: ['Pharmacovigilance', 'Galénique'] },
    { label: 'Autres', values: ['Divers'] }
  ];
  assert.equal(selectionCount(new Set(), groups), 0);
  assert.equal(selectionCount(new Set(['Oncologie', 'Hématologie', 'Radiothérapie']), groups), 1, 'un domaine entier');
  assert.equal(selectionCount(new Set(['Oncologie', 'Hématologie']), groups), 2, 'deux compétences d\'un domaine partiel');
  assert.equal(selectionCount(new Set(['Oncologie', 'Hématologie', 'Radiothérapie', 'Galénique']), groups), 2, 'un domaine entier et une compétence');
  assert.equal(selectionCount(new Set(['Divers']), groups), 1, 'un domaine d\'une seule compétence');
  assert.equal(selectionCount(new Set(['Oncologie', 'Disparue']), groups), 2, 'une valeur sans groupe compte aussi');
  assert.equal(selectionCount(new Set(['Oncologie', 'Hématologie']), null), 2, 'menu plat : les valeurs cochées');
});

test('selectionCount counts a skill written under two domains once', () => {
  const groups = [
    { label: 'Achats', values: ['Droit', 'Gestion'] },
    { label: 'Pilotage', values: ['Gestion'] }
  ];
  assert.equal(selectionCount(new Set(['Gestion']), groups), 1, 'le domaine Pilotage est complet, Gestion n\'est pas recomptée à part');
  assert.equal(selectionCount(new Set(['Droit', 'Gestion']), groups), 2, 'Achats et Pilotage entiers');
});

// ===== Tâches et actions : le même menu par groupe, pour les tâches =====
// Les actions rangent le menu Tâches comme les domaines rangent le menu Compétences :
// cocher une action coche toutes ses tâches. Le filtre Actions, lui, reste un menu à plat.

const tachesFilter = FILTERS.find(filter => filter.key === 'taches');

// Les libellés d'une table Taches : id → tâche, id → action (le repli « Sans action » est
// déjà posé, comme le fait loadDirectory d'après les numéros).
const RELECTURE = '1.1 Relecture';
const RAPPEL = '1.2 Rappel vaccinal';
const INSPECTION = '2.1 Inspection';
const CARTOGRAPHIE = '2.2 Cartographie';
const VACCINATION = 'Action 1: Vaccination';
const AUDIT = 'Action 2: Audit';
const TASKS = {
  taches: { 1: RELECTURE, 2: RAPPEL, 3: INSPECTION, 4: 'Veille', 5: CARTOGRAPHIE },
  macroTaches: { 1: VACCINATION, 2: VACCINATION, 3: AUDIT, 4: 'Sans action', 5: AUDIT }
};

test('the filter bar has no filter of its own for the actions of the tasks: they are groups of the tasks menu', () => {
  const state = createEmptyFilterState();
  assert.ok(!('macroTaches' in state));
  assert.ok(!FILTERS.some(filter => filter.key === 'macroTaches'));
  assert.equal(tachesFilter.grouping, 'macroTaches', 'le menu Tâches connaît son regroupement');
  assert.equal(FILTERS.find(filter => filter.key === 'actions').grouping, undefined, 'le filtre Actions reste à plat');
});

test('ticking an action keeps the contacts with at least one task in it', () => {
  const contacts = [
    { nom: 'A', Taches: ['L', 1, 2] },
    { nom: 'B', Taches: ['L', 3, 1] },
    { nom: 'C', Taches: ['L', 4] },
    { nom: 'D', Taches: ['L'] },
    { nom: 'E', Taches: ['L', 5] }
  ].map(contact => enrich(contact, TASKS));
  const groups = menuGroups(tachesFilter, TASKS);
  assert.deepEqual(groups.map(group => group.label), [VACCINATION, AUDIT, 'Sans action']);

  groups.forEach(group => {
    const activeFilters = createEmptyFilterState();
    toggleGroup(activeFilters.taches, group.values);
    assert.deepEqual(names(filterContacts(contacts, activeFilters, '')),
      names(contacts.filter(contact => contact.labels.macroTaches.includes(group.label))),
      `cocher « ${group.label} » donne les contacts de cette action, ni plus ni moins`);
  });
  assert.deepEqual(names(contacts.filter(contact => contact.labels.macroTaches.length === 0)), ['D'], 'sans tâche, aucune action');
});

test('actions add up (OU) with single tasks, the whole combines (ET) with the other filters, and the skills menu is a filter of its own', () => {
  const contacts = [
    { nom: 'A', labels: { taches: [RELECTURE, RAPPEL], competences: ['Oncologie'] } },
    { nom: 'B', labels: { taches: [INSPECTION, RELECTURE], competences: ['Divers'] } },
    { nom: 'C', labels: { taches: ['Veille'], competences: ['Oncologie'] } },
    { nom: 'D', labels: { taches: [CARTOGRAPHIE], competences: ['Oncologie'] } }
  ];
  const activeFilters = createEmptyFilterState();
  toggleGroup(activeFilters.taches, [INSPECTION, CARTOGRAPHIE]); // l'action 2
  toggleGroup(activeFilters.taches, ['Veille']); // « Sans action »
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['B', 'C', 'D'], 'OU entre deux actions');

  activeFilters.taches.add(RELECTURE); // une tâche seule, d'une autre action
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['A', 'B', 'C', 'D']);

  activeFilters.competences.add('Oncologie');
  assert.deepEqual(names(filterContacts(contacts, activeFilters, '')), ['A', 'C', 'D'], 'ET avec le menu Compétences');
});

test('computeFilterCounts counts a contact once per action, whatever the number of its tasks in that action', () => {
  const contacts = [
    { nom: 'A', labels: { macroTaches: [VACCINATION], taches: [RELECTURE, RAPPEL] } },
    { nom: 'B', labels: { macroTaches: [VACCINATION, AUDIT], taches: [RELECTURE, INSPECTION] } }
  ];
  const counts = computeFilterCounts(contacts, createEmptyFilterState(), '', undefined);
  assert.deepEqual(counts.macroTaches, { [normalize(VACCINATION)]: 2, [normalize(AUDIT)]: 1 });
  assert.equal(counts.taches[normalize(RELECTURE)], 2);
});

test('the count of an action ignores the tasks ticked in its own menu, but not the other filters, the search or the scope', () => {
  const contacts = [
    { nom: 'Alice', labels: { macroTaches: [VACCINATION], taches: [RELECTURE], instances: ['CME'] }, etablissement_fondateur: true },
    { nom: 'Bob', labels: { macroTaches: [VACCINATION, AUDIT], taches: [RELECTURE, INSPECTION], instances: ['COVIRIS'] }, etablissement_partenaire: true },
    { nom: 'Chloe', labels: { macroTaches: [AUDIT], taches: [INSPECTION], instances: ['CME'] }, etablissement_fondateur: true }
  ];
  const [vaccination, audit] = [normalize(VACCINATION), normalize(AUDIT)];
  const scope = { fondateur: true, partenaire: true };
  const activeFilters = createEmptyFilterState();
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', scope).macroTaches, { [vaccination]: 2, [audit]: 2 });

  activeFilters.taches.add(RELECTURE);
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', scope).macroTaches, { [vaccination]: 2, [audit]: 2 },
    'cocher une tâche du menu ne change pas le nombre de cartes de son action');

  activeFilters.instances.add('CME');
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', scope).macroTaches, { [vaccination]: 1, [audit]: 1 }, 'autre filtre');
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, 'chlo', scope).macroTaches, { [audit]: 1 }, 'recherche');
  assert.deepEqual(computeFilterCounts(contacts, createEmptyFilterState(), '', { fondateur: true, partenaire: false }).macroTaches,
    { [vaccination]: 1, [audit]: 1 }, 'interrupteur');
});

test('menuGroups ranges the tasks by action: actions in numeric order, « Sans action » last, tasks in numeric order in each', () => {
  assert.deepEqual(menuGroups(tachesFilter, TASKS), [
    { label: VACCINATION, values: [RELECTURE, RAPPEL] },
    { label: AUDIT, values: [INSPECTION, CARTOGRAPHIE] },
    { label: 'Sans action', values: ['Veille'] }
  ]);
});

test('menuGroups puts action 10 after action 2 and task 1.10 after task 1.2, not between 1 and 2', () => {
  const groups = menuGroups(tachesFilter, {
    taches: { 1: '10.1 Évaluation', 2: '2.1 Pilotage', 3: '2.10 Clôture', 4: '2.2 Suivi', 5: '1.1 Cadrage', 6: 'Veille' },
    macroTaches: {
      1: 'Action 10: Évaluation', 2: 'Action 2: Pilotage', 3: 'Action 2: Pilotage', 4: 'Action 2: Pilotage', 5: 'Action 1: Cadrage', 6: 'Sans action'
    }
  });
  assert.deepEqual(groups, [
    { label: 'Action 1: Cadrage', values: ['1.1 Cadrage'] },
    { label: 'Action 2: Pilotage', values: ['2.1 Pilotage', '2.2 Suivi', '2.10 Clôture'] },
    { label: 'Action 10: Évaluation', values: ['10.1 Évaluation'] },
    { label: 'Sans action', values: ['Veille'] }
  ]);
});

test('menuGroups files a task with no action under « Sans action », whatever its spelling, and keeps that group last', () => {
  const groups = menuGroups(tachesFilter, {
    taches: { 1: 'Alpha', 2: 'Beta', 3: 'Gamma' },
    macroTaches: { 1: 'sans action', 2: 'Action 1: Zèbre' } // la ligne 3 n'est pas classée du tout
  });
  assert.deepEqual(groups, [
    { label: 'Action 1: Zèbre', values: ['Beta'] },
    { label: 'sans action', values: ['Alpha', 'Gamma'] }
  ]);
});

test('menuGroups leaves the tasks menu flat when no task is tied to an action, and groups only once one is', () => {
  assert.equal(menuGroups(tachesFilter, { taches: { 1: 'Relecture' }, macroTaches: {} }), null, 'aucun numéro en commun : menu plat');
  assert.equal(menuGroups(tachesFilter, { taches: { 1: 'Relecture' } }), null, 'aucune lecture des actions');
  assert.equal(menuGroups(tachesFilter, { taches: {}, macroTaches: {} }), null);
  assert.deepEqual(menuGroups(tachesFilter, { taches: { 1: RELECTURE }, macroTaches: { 1: VACCINATION } }),
    [{ label: VACCINATION, values: [RELECTURE] }]);
});

test('selectionCount counts a whole action once, like a whole domain', () => {
  const groups = menuGroups(tachesFilter, TASKS);
  assert.equal(selectionCount(new Set([INSPECTION, CARTOGRAPHIE]), groups), 1, 'l\'action 2 entière');
  assert.equal(selectionCount(new Set([CARTOGRAPHIE]), groups), 1, 'une tâche seule');
  assert.equal(selectionCount(new Set([INSPECTION, CARTOGRAPHIE, 'Veille', RELECTURE]), groups), 3, 'deux actions entières et une tâche');
});

test('pruneStaleFilters drops a ticked task that no longer exists, and has no action selection to purge', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.taches.add('Ancienne tâche');
  activeFilters.taches.add(RELECTURE);
  const pruned = pruneStaleFilters(activeFilters, TASKS);
  assert.deepEqual([...pruned.taches], [RELECTURE]);
  assert.ok(!('macroTaches' in pruned));
});
