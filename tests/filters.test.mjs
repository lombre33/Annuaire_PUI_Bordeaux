import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, normalize } from '../grist-data.js';
import {
  filterContacts, createEmptyFilterState, pruneStaleFilters, computeFilterCounts
} from '../filters.js';

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

test('filterContacts free-text search on Nom/Prenom is accent- and case-insensitive', () => {
  const contacts = [
    { Nom: 'École', Prenom: 'Alice' },
    { Nom: 'Autre', Prenom: 'Bob' }
  ];
  const activeFilters = createEmptyFilterState();
  assert.equal(filterContacts(contacts, activeFilters, 'ecole').length, 1);
  assert.equal(filterContacts(contacts, activeFilters, 'ÉCOLE').length, 1);
});

test('filterContacts applies a category filter (etablissement) via the uniform labels.etablissement array', () => {
  const contacts = [
    { Nom: 'A', labels: { etablissement: ['CHU'] } },
    { Nom: 'B', labels: { etablissement: ['Clinique'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.etablissement.add('CHU');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].Nom, 'A');
});

test('filterContacts applies a tag-list filter (e.g. instances)', () => {
  const contacts = [
    { Nom: 'A', labels: { instances: ['CME'] } },
    { Nom: 'B', labels: { instances: ['COVIRIS'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].Nom, 'A');
});

test('filterContacts matches a category filter regardless of case/accent differences between a free-text tag and the reference-table option', () => {
  // Cas réel : competences_1..15 sont du texte libre saisi à la main, alors
  // que le menu "Compétences" liste les libellés de la table Competances —
  // les deux peuvent diverger par la casse/les accents sans être une vraie
  // différence pour l'utilisateur (cf. CHANGELOG, audit archi/sécurité).
  const contacts = [
    { Nom: 'A', labels: { competences: ['oncologie'] } },
    { Nom: 'B', labels: { competences: ['Autre'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.competences.add('Oncologie');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].Nom, 'A');
});

test('pruneStaleFilters drops a selected label that no longer exists in its reference table (e.g. renamed in Grist)', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.etablissement.add('CHU');
  activeFilters.etablissement.add('UBM');
  const referenceMaps = { Etablissements: { 1: 'CHU-Bordeaux', 2: 'UBM' } };
  const pruned = pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...pruned.etablissement], ['UBM'], 'CHU a été renommé en CHU-Bordeaux : la sélection orpheline doit disparaître, UBM doit rester');
  assert.deepEqual([...activeFilters.etablissement], ['CHU', 'UBM'], 'l\'état d\'origine n\'est pas modifié');
});

test('pruneStaleFilters leaves selections untouched when nothing changed, even if temporarily no contact matches', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  const referenceMaps = { Instances: { 7: 'CME' } };
  const pruned = pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...pruned.instances], ['CME'], 'CME reste une option valide du menu, donc pas une sélection périmée');
  assert.deepEqual(Object.keys(pruned), Object.keys(createEmptyFilterState()), 'une entrée par catégorie, même sans sélection');
});

test('filterContacts applies the scope toggle (fondateur/partenaire) in addition to the fixed eligibility gate applied upstream', () => {
  const contacts = [
    { Nom: 'A', etablissement_fondateur: true, etablissement_partenaire: false },
    { Nom: 'B', etablissement_fondateur: false, etablissement_partenaire: true }
  ];
  const activeFilters = createEmptyFilterState();
  assert.equal(filterContacts(contacts, activeFilters, '', { fondateur: true, partenaire: true }).length, 2);
  const onlyFondateurs = filterContacts(contacts, activeFilters, '', { fondateur: true, partenaire: false });
  assert.equal(onlyFondateurs.length, 1);
  assert.equal(onlyFondateurs[0].Nom, 'A');
  assert.equal(filterContacts(contacts, activeFilters, '', { fondateur: false, partenaire: false }).length, 0);
  // scope omis (ex: anciens appels) : aucun filtrage par scope, comportement inchangé.
  assert.equal(filterContacts(contacts, activeFilters, '').length, 2);
});

test('filterContacts excludeKey skips one category\'s own selection while still applying every other filter', () => {
  const contacts = [
    { Nom: 'A', labels: { instances: ['CME'], gt: ['GT1'] } },
    { Nom: 'B', labels: { instances: ['COVIRIS'], gt: ['GT1'] } },
    { Nom: 'C', labels: { instances: ['CME'], gt: ['GT2'] } }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  activeFilters.gt.add('GT1');
  // Sans excludeKey : les 2 filtres s'appliquent, seul A matche (CME + GT1).
  assert.deepEqual(filterContacts(contacts, activeFilters, '').map(c => c.Nom), ['A']);
  // excludeKey='instances' : le filtre Instances est ignoré, seul GT1 s'applique -> A et B.
  assert.deepEqual(filterContacts(contacts, activeFilters, '', undefined, 'instances').map(c => c.Nom), ['A', 'B']);
});

test('computeFilterCounts tallies, per filter category, how many contacts each option would match given every OTHER active filter/search/scope', () => {
  const contacts = [
    { Nom: 'Alice', labels: { instances: ['CME'], gt: ['GT1'] }, etablissement_fondateur: true, etablissement_partenaire: false },
    { Nom: 'Bob', labels: { instances: ['COVIRIS'], gt: ['GT1'] }, etablissement_fondateur: false, etablissement_partenaire: true },
    { Nom: 'Chloe', labels: { instances: ['CME'], gt: ['GT2'] }, etablissement_fondateur: true, etablissement_partenaire: false }
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
  const contacts = [{ Nom: 'A', labels: { competences: ['oncologie'] } }];
  const activeFilters = createEmptyFilterState();
  const counts = computeFilterCounts(contacts, activeFilters, '', undefined);
  assert.equal(counts.competences[normalize('Oncologie')], 1, 'le tally doit matcher un libellé de référence "Oncologie" malgré la casse différente du texte libre');
});
