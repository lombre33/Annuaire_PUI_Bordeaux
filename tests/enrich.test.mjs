import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrich, labelsOf } from '../grist-data.js';

test('enrich: etablissement_label resolves BDD.Etablissement, a direct Reference, in any of the shapes Grist can send', () => {
  const referenceMaps = { Etablissements: { 2: 'UBM' } };
  assert.equal(enrich({ Etablissement: 2 }, referenceMaps).etablissement_label, 'UBM', 'identifiant de ligne (fetchTable)');
  assert.equal(enrich({ Etablissement: ['R', 'Etablissements', 2] }, referenceMaps).etablissement_label, 'UBM');
  assert.equal(enrich({ Etablissement: 'UBM' }, referenceMaps).etablissement_label, 'UBM', 'texte déjà résolu');
  assert.equal(enrich({ Etablissement: 0 }, referenceMaps).etablissement_label, '', 'référence vide');
  assert.equal(enrich({ Etablissement: 999 }, referenceMaps).etablissement_label, '', 'ligne introuvable : pas de valeur fantôme');
  assert.equal(enrich({}, {}).etablissement_label, '');
});

test('enrich: labels.etablissement mirrors etablissement_label as a single-element array (or empty)', () => {
  assert.deepEqual(enrich({ Etablissement: 1 }, { Etablissements: { 1: 'CHU' } }).labels.etablissement, ['CHU']);
  assert.deepEqual(enrich({}, {}).labels.etablissement, []);
});

test('enrich: labels.role resolves Role_dans_le_PUI as an array, like every other tag group', () => {
  // Régression : enrich() ne posait qu'une valeur singulière, que rien ne
  // lisait — le tag "Rôle PUI" n'apparaissait donc sur aucune carte, quelles
  // que soient les données (cf. CHANGELOG).
  const referenceMaps = { Role_Dans_le_PUI: { 3: 'Référent qualité' } };
  assert.deepEqual(enrich({ Role_dans_le_PUI: 3 }, referenceMaps).labels.role, ['Référent qualité']);
  assert.deepEqual(enrich({}, referenceMaps).labels.role, [], 'pas de référence: liste vide');
  assert.deepEqual(enrich({ Role_dans_le_PUI: 999 }, referenceMaps).labels.role, [], 'référence introuvable: liste vide, pas de valeur fantôme');
});

test('enrich: list-reference categories (Instances/Actions/GT/Communautés/Tâches/Compétences) drop ids that fail to resolve, instead of leaking the raw numeric id as a fake label', () => {
  const referenceMaps = { INSTANCES: { 7: 'CME' } };
  assert.deepEqual(enrich({ Instances: ['L', 7, 999] }, referenceMaps).labels.instances, ['CME'],
    'id 999 introuvable dans la table de référence: ignoré, pas affiché comme "999"');
  assert.deepEqual(enrich({ Instances: ['L'] }, referenceMaps).labels.instances, []);
});

test('enrich: list-reference categories resolve correctly when Grist sends pre-resolved text instead of numeric ids (production regression, 2026-09-14)', () => {
  const referenceMaps = { INSTANCES: { 7: 'CME' } };
  // ['L', 'CME'] : la table Instances a une visible column configurée en
  // prod, donc Grist envoie directement le texte, pas ['L', 7].
  assert.deepEqual(enrich({ Instances: ['L', 'CME'] }, referenceMaps).labels.instances, ['CME']);
});

test('enrich: each list-reference category reads its own BDD column and its own reference table, not another\'s', () => {
  // La table INSTANCES s'écrit en majuscules dans Grist, les autres non.
  const referenceMaps = {
    INSTANCES: { 1: 'Instance A' },
    Actions: { 2: 'Action B' },
    GT: { 3: 'GT C' },
    Communautes: { 4: 'Communauté D' },
    Taches: { 5: 'Tâche E' },
    Competences: { 6: 'Compétence F' }
  };
  const contact = {
    Instances: ['L', 1],
    Actions: ['L', 2],
    GT: ['L', 3],
    Communautes: ['L', 4],
    Taches: ['L', 5],
    Competences: ['L', 6]
  };
  const result = enrich(contact, referenceMaps);
  assert.deepEqual(result.labels.instances, ['Instance A']);
  assert.deepEqual(result.labels.actions, ['Action B']);
  assert.deepEqual(result.labels.gt, ['GT C']);
  assert.deepEqual(result.labels.communautes, ['Communauté D']);
  assert.deepEqual(result.labels.taches, ['Tâche E']);
  assert.deepEqual(result.labels.competences, ['Compétence F']);
});

test('enrich: the old columns of the Annuaire table (competences_1..15, Communautee_s_, Etablissement2) are no longer read', () => {
  const contact = { competences_1: 'Ancienne compétence', Communautee_s_: ['L', 4], Etablissement2: 'CHU' };
  const result = enrich(contact, { Communautes: { 4: 'Ancienne communauté' } });
  assert.deepEqual(result.labels.competences, []);
  assert.deepEqual(result.labels.communautes, []);
  assert.equal(result.etablissement_label, '');
});

test('labelsOf returns the labels of one category, or an empty list for a contact that has none', () => {
  const contact = enrich({ Etablissement: 1 }, { Etablissements: { 1: 'CHU' } });
  assert.deepEqual(labelsOf(contact, 'etablissement'), ['CHU']);
  assert.deepEqual(labelsOf(contact, 'instances'), []);
  assert.deepEqual(labelsOf(contact, 'inconnue'), []);
  assert.deepEqual(labelsOf({ nom: 'Sans enrichissement' }, 'instances'), []);
});

const UBM_FLAGS = { fondateur: false, partenaire: true, ok_pour_apparaitre: true };

test('enrich: attaches etablissement_fondateur/partenaire/ok_pour_apparaitre from etabFlags, via BDD.Etablissement', () => {
  const etabFlags = { byId: { 2: UBM_FLAGS }, byLabel: {} };
  const enriched = enrich({ Etablissement: 2 }, {}, etabFlags);
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, true);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, true);
});

test('enrich: etablissement_fondateur/partenaire/ok_pour_apparaitre default to false when etabFlags is omitted or unresolved', () => {
  const enriched = enrich({ Etablissement: 2 }, {});
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, false);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, false);
});
