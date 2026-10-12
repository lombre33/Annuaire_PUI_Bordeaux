import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, normalize } from '../grist-data.js';
import {
  filterContacts, createEmptyFilterState, pruneStaleFilters, computeFilterCounts
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

// ===== Compétences macro : un filtre de plus, sans toucher au détail =====

test('filterContacts: the macro skills filter keeps the contacts with a skill in any selected domain, and combines with the detailed skills', () => {
  const contacts = [
    { nom: 'A', labels: { macro: ['Cancérologie'], competences: ['Oncologie', 'Hématologie'] } },
    { nom: 'B', labels: { macro: ['Pharmacie', 'Cancérologie'], competences: ['Pharmacovigilance', 'Oncologie'] } },
    { nom: 'C', labels: { macro: ['Autres'], competences: ['Divers'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.macro.add('Pharmacie');
  activeFilters.macro.add('Autres');
  assert.deepEqual(filterContacts(contacts, activeFilters, '').map(c => c.nom), ['B', 'C'], 'OU entre domaines');

  activeFilters.macro.clear();
  activeFilters.macro.add('Cancérologie');
  assert.deepEqual(filterContacts(contacts, activeFilters, '').map(c => c.nom), ['A', 'B']);

  activeFilters.competences.add('Hématologie');
  assert.deepEqual(filterContacts(contacts, activeFilters, '').map(c => c.nom), ['A'], 'ET avec le détail : le détail reste filtrable');
});

test('computeFilterCounts counts a contact once per domain, whatever the number of its skills in that domain', () => {
  const contacts = [
    { nom: 'A', labels: { macro: ['Cancérologie'], competences: ['Oncologie', 'Hématologie'] } },
    { nom: 'B', labels: { macro: ['Cancérologie', 'Pharmacie'], competences: ['Oncologie', 'Pharmacovigilance'] } }
  ];
  const counts = computeFilterCounts(contacts, createEmptyFilterState(), '', undefined);
  assert.deepEqual(counts.macro, { cancerologie: 2, pharmacie: 1 });
  assert.equal(counts.competences.oncologie, 2);

  const activeFilters = createEmptyFilterState();
  activeFilters.competences.add('Pharmacovigilance');
  assert.deepEqual(computeFilterCounts(contacts, activeFilters, '', undefined).macro, { cancerologie: 1, pharmacie: 1 },
    'les domaines tiennent compte des compétences cochées');
});

test('pruneStaleFilters drops a selected domain that no longer exists, and keeps the detailed skills untouched', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.macro.add('Ancien domaine');
  activeFilters.macro.add('Cancérologie');
  activeFilters.competences.add('Oncologie');
  const referenceMaps = { macro: { 1: 'Cancérologie' }, competences: { 1: 'Oncologie' } };
  const pruned = pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...pruned.macro], ['Cancérologie']);
  assert.deepEqual([...pruned.competences], ['Oncologie']);
});
