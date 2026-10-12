import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, enrich, labelsOf } from '../grist-data.js';

test('enrich: etablissement_label reads Etablissement2 directly (Text, formule côté Grist = acronyme déduit de nom_de_domaine)', () => {
  // Etablissement2 est une colonne Text simple : jamais l'ambiguïté
  // texte-déjà-résolu/id-brut/['R',...] d'une Référence — cf. hotfix suite au
  // changement de schéma Grist (nom_de_domaine s'est avéré peu fiable pour
  // cet usage, remplacé par Etablissement2, seule source de vérité).
  assert.equal(enrich({ Etablissement2: 'UBM' }, {}).etablissement_label, 'UBM');
  assert.equal(enrich({ Etablissement2: '' }, {}).etablissement_label, '');
  assert.equal(enrich({}, {}).etablissement_label, '');
});

test('enrich: labels.etablissement mirrors etablissement_label as a single-element array (or empty)', () => {
  assert.deepEqual(enrich({ Etablissement2: 'CHU' }, {}).labels.etablissement, ['CHU']);
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

test('enrich: list-reference categories (Instances/Actions/GT/Communautés/Tâches) drop ids that fail to resolve, instead of leaking the raw numeric id as a fake label', () => {
  const referenceMaps = { Instances: { 7: 'CME' } };
  assert.deepEqual(enrich({ Instances: ['L', 7, 999] }, referenceMaps).labels.instances, ['CME'],
    'id 999 introuvable dans la table de référence: ignoré, pas affiché comme "999"');
  assert.deepEqual(enrich({ Instances: ['L'] }, referenceMaps).labels.instances, []);
});

test('enrich: list-reference categories resolve correctly when Grist sends pre-resolved text instead of numeric ids (production regression, 2026-09-14)', () => {
  const referenceMaps = { Instances: { 7: 'CME' } };
  // ['L', 'CME'] : la table Instances a une visible column configurée en
  // prod, donc Grist envoie directement le texte, pas ['L', 7].
  assert.deepEqual(enrich({ Instances: ['L', 'CME'] }, referenceMaps).labels.instances, ['CME']);
});

test('enrich: each list-reference category reads its own Annuaire column and its own reference table, not another\'s', () => {
  const referenceMaps = {
    Instances: { 1: 'Instance A' },
    Actions: { 2: 'Action B' },
    GT: { 3: 'GT C' },
    Communautees: { 4: 'Communauté D' },
    Taches: { 5: 'Tâche E' }
  };
  const contact = {
    Instances: ['L', 1],
    Actions: ['L', 2],
    GT: ['L', 3],
    Communautee_s_: ['L', 4], // nom de colonne Grist réel, différent de la clé "communautes"
    Taches: ['L', 5]
  };
  const result = enrich(contact, referenceMaps);
  assert.deepEqual(result.labels.instances, ['Instance A']);
  assert.deepEqual(result.labels.actions, ['Action B']);
  assert.deepEqual(result.labels.gt, ['GT C']);
  assert.deepEqual(result.labels.communautes, ['Communauté D']);
  assert.deepEqual(result.labels.taches, ['Tâche E']);
});

test('enrich: labels.competences reads exactly competences_1 through competences_15', () => {
  const contact = { competences_1: 'A', competences_15: 'O', competences_16: 'ignoré (pas une colonne réelle)' };
  assert.deepEqual(enrich(contact, {}).labels.competences, ['A', 'O']);
});

test('labelsOf returns the labels of one category, or an empty list for a contact that has none', () => {
  const contact = enrich({ Etablissement2: 'CHU' }, {});
  assert.deepEqual(labelsOf(contact, 'etablissement'), ['CHU']);
  assert.deepEqual(labelsOf(contact, 'instances'), []);
  assert.deepEqual(labelsOf(contact, 'inconnue'), []);
  assert.deepEqual(labelsOf({ Nom: 'Sans enrichissement' }, 'instances'), []);
});

test('enrich: attaches etablissement_fondateur/partenaire/ok_pour_apparaitre from etabFlags, via Etablissement2', () => {
  const etabFlags = { byId: {}, byLabel: { UBM: { fondateur: false, partenaire: true, ok_pour_apparaitre: true } } };
  const enriched = enrich({ Etablissement2: 'UBM' }, {}, etabFlags);
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, true);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, true);
});

test('enrich: etablissement_fondateur/partenaire/ok_pour_apparaitre default to false when etabFlags is omitted or unresolved', () => {
  const enriched = enrich({ Etablissement2: 'UBM' }, {});
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, false);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, false);
});
