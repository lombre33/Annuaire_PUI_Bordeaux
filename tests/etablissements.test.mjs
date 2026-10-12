import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tableToRows, etablissementFlagsFromRows, etablissementFlags, isEtablissementEligible,
  filterVisibleEstablishments
} from '../grist-data.js';

test('etablissementFlagsFromRows indexes the fondateur/partenaire/ok_pour_apparaitre booleans by row id AND by resolved label', () => {
  const rows = tableToRows({
    id: [1, 2, 3],
    acronyme: ['CHU', '', 'Clinique'],
    nom_complet: ['CHU de Bordeaux', 'UBM', 'Clinique du Parc'],
    fondateur: [true, false, false],
    partenaire: [false, true, false],
    autres: [false, false, true],
    ok_pour_apparaitre: [true, true, false]
  });
  const flags = etablissementFlagsFromRows(rows);
  assert.deepEqual(flags.byId['1'], { fondateur: true, partenaire: false, ok_pour_apparaitre: true });
  assert.deepEqual(flags.byId['2'], { fondateur: false, partenaire: true, ok_pour_apparaitre: true });
  assert.deepEqual(flags.byId['3'], { fondateur: false, partenaire: false, ok_pour_apparaitre: false });
  // acronyme prioritaire, repli sur nom_complet si acronyme est vide pour cette ligne (id 2).
  assert.deepEqual(flags.byLabel['CHU'], flags.byId['1']);
  assert.deepEqual(flags.byLabel['UBM'], flags.byId['2']);
  assert.deepEqual(flags.byLabel['Clinique'], flags.byId['3']);
  assert.deepEqual(flags.conflicts, []);
});

test('etablissementFlagsFromRows: two rows with the same label keep the strictest status whatever their order, and report the conflict', () => {
  const validated = { id: 1, acronyme: 'CHU', fondateur: true, partenaire: false, ok_pour_apparaitre: true };
  const notValidated = { id: 2, acronyme: 'CHU', fondateur: true, partenaire: false, ok_pour_apparaitre: false };
  [[validated, notValidated], [notValidated, validated]].forEach(rows => {
    const flags = etablissementFlagsFromRows(rows);
    assert.deepEqual(flags.byLabel['CHU'], { fondateur: true, partenaire: false, ok_pour_apparaitre: false },
      'ok_pour_apparaitre n\'est vrai que s\'il l\'est sur toutes les lignes');
    assert.deepEqual(flags.conflicts, ['CHU']);
  });
});

test('etablissementFlagsFromRows: duplicate rows with identical statuses are not a conflict', () => {
  const row = { acronyme: 'CHU', fondateur: true, partenaire: false, ok_pour_apparaitre: true };
  const flags = etablissementFlagsFromRows([{ id: 1, ...row }, { id: 2, ...row }]);
  assert.deepEqual(flags.byLabel['CHU'], { fondateur: true, partenaire: false, ok_pour_apparaitre: true });
  assert.deepEqual(flags.conflicts, []);
});

const UBM_FLAGS = { fondateur: false, partenaire: true, ok_pour_apparaitre: true };

test('etablissementFlags resolves BDD.Etablissement by row id, so duplicate acronyms never get mixed up', () => {
  const etabFlags = {
    byId: { 2: UBM_FLAGS, 6: { fondateur: true, partenaire: false, ok_pour_apparaitre: false } },
    byLabel: { UBM: UBM_FLAGS }
  };
  assert.deepEqual(etablissementFlags({ Etablissement: 2 }, etabFlags), UBM_FLAGS);
  assert.deepEqual(etablissementFlags({ Etablissement: ['R', 'Etablissements', 2] }, etabFlags), UBM_FLAGS);
  assert.deepEqual(etablissementFlags({ Etablissement: 6 }, etabFlags), { fondateur: true, partenaire: false, ok_pour_apparaitre: false });
});

test('etablissementFlags falls back to the label when Grist already resolved the Reference to text', () => {
  const etabFlags = { byId: {}, byLabel: { UBM: UBM_FLAGS } };
  assert.deepEqual(etablissementFlags({ Etablissement: 'UBM' }, etabFlags), UBM_FLAGS);
});

test('etablissementFlags returns null when Etablissement is empty or matches no Etablissements row', () => {
  const etabFlags = { byId: { 2: UBM_FLAGS }, byLabel: { UBM: UBM_FLAGS } };
  assert.equal(etablissementFlags({}, etabFlags), null);
  assert.equal(etablissementFlags({ Etablissement: 0 }, etabFlags), null);
  assert.equal(etablissementFlags({ Etablissement: '' }, etabFlags), null);
  assert.equal(etablissementFlags({ Etablissement: 999 }, etabFlags), null, 'référence orpheline');
  assert.equal(etablissementFlags({ Etablissement: 'Clinique inconnue' }, etabFlags), null);
  assert.equal(etablissementFlags({ Etablissement2: 'UBM' }, etabFlags), null, 'l\'ancienne colonne Etablissement2 n\'est plus lue');
});

test('isEtablissementEligible requires ok_pour_apparaitre AND (fondateur OR partenaire)', () => {
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: true, etablissement_fondateur: true, etablissement_partenaire: false }), true);
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: true, etablissement_fondateur: false, etablissement_partenaire: true }), true);
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: true, etablissement_fondateur: false, etablissement_partenaire: false }), false, '"autres" (ni fondateur ni partenaire) ne doit jamais être éligible');
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: false, etablissement_fondateur: true, etablissement_partenaire: true }), false, 'ok_pour_apparaitre=false bloque même un fondateur/partenaire');
  assert.equal(isEtablissementEligible({}), false);
});

test('filterVisibleEstablishments keeps only ok_pour_apparaitre establishments, for the filter dropdown only', () => {
  const labelMap = { 1: 'CHU', 2: 'UBM', 3: 'ClinX' };
  const etabFlags = {
    byId: {
      1: { fondateur: true, partenaire: false, ok_pour_apparaitre: true },
      2: { fondateur: false, partenaire: true, ok_pour_apparaitre: false },
      // id 3 volontairement absent de etabFlags.byId (référence orpheline / table pas encore chargée)
    },
    byLabel: {}
  };
  assert.deepEqual(filterVisibleEstablishments(labelMap, etabFlags), { 1: 'CHU' });
  assert.deepEqual(filterVisibleEstablishments({}, etabFlags), {});
  assert.deepEqual(filterVisibleEstablishments(labelMap, undefined), {}, 'etabFlags absent: aucune option (pas de validation connue)');
});
