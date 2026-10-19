import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tableToRows, etablissementFlagsFromRows, etablissementFlags, isEtablissementEligible,
  filterVisibleEstablishments, buildContacts
} from '../grist-data.js';
import { createEmptyFilterState, filterContacts } from '../filters.js';

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

// Les établissements de l'exemple : validé ou non, fondateur, partenaire, les deux, ni l'un ni l'autre (« autres »).
const MENU_LABELS = { 1: 'CHU', 2: 'UBM', 3: 'Clinique', 4: 'INSERM', 5: 'Bergonié', 6: 'ClinX' };
const MENU_FLAGS = {
  byId: {
    1: { fondateur: true, partenaire: false, ok_pour_apparaitre: true },
    2: { fondateur: false, partenaire: true, ok_pour_apparaitre: true },
    3: { fondateur: false, partenaire: false, ok_pour_apparaitre: true }, // « autres » : jamais
    4: { fondateur: true, partenaire: false, ok_pour_apparaitre: false }, // pas validé : jamais
    5: { fondateur: true, partenaire: true, ok_pour_apparaitre: true }
    // id 6 absent d'Etablissements : jamais
  },
  byLabel: {}
};

test('le menu Établissement ne propose un partenaire que si Partenaires est allumé, et un fondateur que si Fondateurs l\'est', () => {
  const menu = scope => Object.values(filterVisibleEstablishments(MENU_LABELS, MENU_FLAGS, scope));
  assert.deepEqual(menu({ fondateur: true, partenaire: false }), ['CHU', 'Bergonié'], 'au départ : les fondateurs validés, pas UBM (partenaire)');
  assert.deepEqual(menu({ fondateur: true, partenaire: true }), ['CHU', 'UBM', 'Bergonié']);
  assert.deepEqual(menu({ fondateur: false, partenaire: true }), ['UBM', 'Bergonié'], 'Partenaires seuls : plus CHU');
  assert.deepEqual(menu({ fondateur: false, partenaire: false }), [], 'aucun interrupteur : aucune carte, donc aucune option');
  assert.deepEqual(menu(undefined), ['CHU', 'UBM', 'Bergonié'], 'sans interrupteurs : tous ceux qui peuvent s\'afficher, jamais « autres », non validé ni inconnu');
});

test('le menu Établissement propose un établissement exactement quand ses contacts peuvent s\'afficher, quelle que soit la position des interrupteurs', () => {
  // Un contact qui a accepté, dans chacun des huit statuts possibles (validé, fondateur, partenaire).
  const labels = {};
  const byId = {};
  const rows = [];
  let id = 0;
  [true, false].forEach(ok => [true, false].forEach(fondateur => [true, false].forEach(partenaire => {
    id += 1;
    labels[id] = `E${id}`;
    byId[id] = { fondateur, partenaire, ok_pour_apparaitre: ok };
    rows.push({ id, prenom: 'Ana', nom: `N${id}`, Etablissement: id, Accepte_apparaitre: true });
  })));
  const etabFlags = { byId, byLabel: {} };
  const contacts = buildContacts(rows, { etablissement: labels }, etabFlags);

  [{ fondateur: true, partenaire: false }, { fondateur: true, partenaire: true },
    { fondateur: false, partenaire: true }, { fondateur: false, partenaire: false }].forEach(scope => {
    const offered = Object.values(filterVisibleEstablishments(labels, etabFlags, scope)).sort();
    const shown = filterContacts(contacts, createEmptyFilterState(), '', scope).map(contact => contact.etablissement_label).sort();
    assert.deepEqual(offered, shown, `Fondateurs ${scope.fondateur}, Partenaires ${scope.partenaire} : le menu offre ce que les cartes montrent`);
  });
  assert.equal(contacts.length, 3, 'des huit statuts, trois peuvent s\'afficher (validé et fondateur ou partenaire)');
});

test('etablissementFlags never takes a property of Object for the flags of an establishment', () => {
  const rows = tableToRows({
    id: [1, 2],
    acronyme: ['__proto__', 'CHU'],
    nom_complet: ['Établissement au nom étrange', 'CHU de Bordeaux'],
    fondateur: [true, true],
    partenaire: [false, false],
    autres: [false, false],
    ok_pour_apparaitre: [true, true]
  });
  const flags = etablissementFlagsFromRows(rows);
  assert.deepEqual(etablissementFlags({ Etablissement: '__proto__' }, flags), { fondateur: true, partenaire: false, ok_pour_apparaitre: true },
    'un libellé « __proto__ » est un libellé comme un autre');
  assert.equal(etablissementFlags({ Etablissement: 'constructor' }, flags), null, 'aucune ligne ne porte ce libellé');
  assert.equal(etablissementFlags({ Etablissement: 'toString' }, flags), null);
  assert.equal(Object.getPrototypeOf(flags.byLabel), Object.prototype, 'un objet ordinaire, comme avant');
  assert.equal(flags.byLabel.CHU.fondateur, true);
});
