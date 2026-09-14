import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeValues, tableToRows, isInScope, text, pickLabel, enrich, refId, refLabel,
  normalize, compareLabels, formatPhone, fetchTable, createRequestSequencer, referenceMapsEqual,
  sortWithCheckedFirst, resolveListItem, fetchEtablissementsFlags, etablissementFlags,
  isEtablissementEligible, filterVisibleEstablishments
} from '../grist-data.js';
import { filterContacts, createEmptyFilterState, pruneStaleFilters } from '../filters.js';

test('safeValues strips the Grist list marker "L" and empty values', () => {
  assert.deepEqual(safeValues(['L']), []);
  assert.deepEqual(safeValues(['L', 5, 12]), [5, 12]);
  assert.deepEqual(safeValues(null), []);
  assert.deepEqual(safeValues(undefined), []);
  assert.deepEqual(safeValues(0), []);
  assert.deepEqual(safeValues(''), []);
  assert.deepEqual(safeValues('x'), ['x']);
  assert.deepEqual(safeValues(42), [42]);
});

test('text() normalizes null/undefined to an empty string and trims', () => {
  assert.equal(text(null), '');
  assert.equal(text(undefined), '');
  assert.equal(text('  Bordeaux  '), 'Bordeaux');
  assert.equal(text(7), '7');
});

test('normalize() folds case and strips accents for resilient label matching', () => {
  assert.equal(normalize('Oncologie'), 'oncologie');
  assert.equal(normalize('École'), 'ecole');
  assert.equal(normalize('Référent qualité'), 'referent qualite');
  assert.equal(normalize('  Pharmacie Clinique  '), 'pharmacie clinique');
  assert.equal(normalize(null), '');
});

test('compareLabels sorts using French locale rules, not raw UTF-16 order', () => {
  // .sort() par défaut classerait "UBM" avant "chu" (majuscules d'abord) —
  // ce n'est pas l'ordre alphabétique attendu par un utilisateur francophone.
  assert.deepEqual(['UBM', 'chu', 'Anap'].sort(compareLabels), ['Anap', 'chu', 'UBM']);
});

test('formatPhone restores the French leading 0 lost by Grist\'s Numeric column type', () => {
  assert.equal(formatPhone(556789012), '05 56 78 90 12');
  assert.equal(formatPhone('556789012'), '05 56 78 90 12');
  assert.equal(formatPhone('0556789012'), '05 56 78 90 12', 'un numéro à 10 chiffres déjà complet reste correct');
  assert.equal(formatPhone(0), '', '0 = case non renseignée, comme partout ailleurs dans le code (cf. safeValues)');
  assert.equal(formatPhone(null), '');
  assert.equal(formatPhone(undefined), '');
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('123'), '123', 'longueur inattendue: renvoyé tel quel plutôt que déformé');
});

test('sortWithCheckedFirst moves checked values to the front while keeping each group alphabetically sorted', () => {
  const sorted = ['Angers', 'Bordeaux', 'Paris']; // déjà trié alphabétiquement, comme dans render.js
  assert.deepEqual(sortWithCheckedFirst(sorted, new Set(['Paris'])), ['Paris', 'Angers', 'Bordeaux']);
  assert.deepEqual(sortWithCheckedFirst(sorted, new Set()), ['Angers', 'Bordeaux', 'Paris']);
  assert.deepEqual(sortWithCheckedFirst(sorted, new Set(['Angers', 'Paris'])), ['Angers', 'Paris', 'Bordeaux'],
    'le groupe coché doit lui-même rester alphabétique (Angers avant Paris), pas dans l\'ordre de sélection');
});

test('createRequestSequencer only recognizes the most recently started request as latest', () => {
  const sequencer = createRequestSequencer();
  const first = sequencer.next();
  const second = sequencer.next();
  assert.equal(sequencer.isLatest(first), false, 'une requête plus ancienne ne doit plus être "latest" une fois une nouvelle démarrée');
  assert.equal(sequencer.isLatest(second), true);
});

test('referenceMapsEqual compares reference-table content regardless of key order', () => {
  const a = { Etablissements: { 1: 'CHU', 2: 'UBM' }, Actions: { 5: 'Vaccination' } };
  const b = { Actions: { 5: 'Vaccination' }, Etablissements: { 2: 'UBM', 1: 'CHU' } };
  assert.equal(referenceMapsEqual(a, b), true);
  assert.equal(referenceMapsEqual(a, { ...b, Actions: { 5: 'Autre' } }), false);
  assert.equal(referenceMapsEqual({}, {}), true);
  assert.equal(referenceMapsEqual({ Etablissements: { 1: 'CHU' } }, {}), false);
});

test('isInScope: regression test for the perimetre_all filter', () => {
  // Avant correction, `Array.isArray(p) && p.length > 0` était toujours vrai
  // car ['L'] (liste vide côté Grist) a une longueur de 1.
  assert.equal(isInScope({ perimetre_all: ['L'] }), false, 'une liste Grist vide ne doit pas être "in scope"');
  assert.equal(isInScope({ perimetre_all: ['L', 3] }), true);
  assert.equal(isInScope({ perimetre_all: undefined }), false);
  assert.equal(isInScope({ perimetre_all: [] }), false);
});

test('tableToRows converts a Grist column-oriented table into rows', () => {
  const table = { id: [1, 2], Nom: ['Dupont', 'Martin'], Prenom: ['Alice', 'Bob'] };
  assert.deepEqual(tableToRows(table), [
    { id: 1, Nom: 'Dupont', Prenom: 'Alice' },
    { id: 2, Nom: 'Martin', Prenom: 'Bob' }
  ]);
  assert.deepEqual(tableToRows(null), []);
  assert.deepEqual(tableToRows([{ id: 1 }]), [{ id: 1 }]);
});

test('tableToRows returns no rows when the table object has no id array (defensive default, not a crash)', () => {
  assert.deepEqual(tableToRows({ Nom: ['Dupont'] }), []);
});

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

test('filterContacts applies a category filter (etablissement) via the uniform etablissement_labels array', () => {
  const contacts = [
    { Nom: 'A', etablissement_labels: ['CHU'] },
    { Nom: 'B', etablissement_labels: ['Clinique'] }
  ];
  const activeFilters = createEmptyFilterState();
  activeFilters.etablissement.add('CHU');
  const result = filterContacts(contacts, activeFilters, '');
  assert.equal(result.length, 1);
  assert.equal(result[0].Nom, 'A');
});

test('filterContacts applies a tag-list filter (e.g. instances)', () => {
  const contacts = [
    { Nom: 'A', instances_labels: ['CME'] },
    { Nom: 'B', instances_labels: ['COVIRIS'] }
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
    { Nom: 'A', competences_labels: ['oncologie'] },
    { Nom: 'B', competences_labels: ['Autre'] }
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
  pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...activeFilters.etablissement], ['UBM'], 'CHU a été renommé en CHU-Bordeaux : la sélection orpheline doit disparaître, UBM doit rester');
});

test('pruneStaleFilters leaves selections untouched when nothing changed, even if temporarily no contact matches', () => {
  const activeFilters = createEmptyFilterState();
  activeFilters.instances.add('CME');
  const referenceMaps = { Instances: { 7: 'CME' } };
  pruneStaleFilters(activeFilters, referenceMaps);
  assert.deepEqual([...activeFilters.instances], ['CME'], 'CME reste une option valide du menu, donc pas une sélection périmée');
});

test('pickLabel falls back to the next field when the first is empty', () => {
  assert.equal(pickLabel({ acronyme: 'CHU', nom_complet: 'CHU de Bordeaux' }, ['acronyme', 'nom_complet']), 'CHU');
  assert.equal(pickLabel({ acronyme: '', nom_complet: 'CHU de Bordeaux' }, ['acronyme', 'nom_complet']), 'CHU de Bordeaux');
  assert.equal(pickLabel({ acronyme: null, nom_complet: null }, ['acronyme', 'nom_complet']), '');
});

test('refId extracts the row id from the ["R", tableId, rowId] Grist encoding, but not from a string', () => {
  assert.equal(refId(['R', 'Etablissements', 42]), 42);
  assert.equal(refId(42), 42, 'un id déjà nu doit rester tel quel');
  assert.equal(refId('UBM'), null, 'une chaîne est du texte déjà résolu, pas un id — voir refLabel()');
  assert.equal(refId(0), null);
  assert.equal(refId(null), null);
  assert.equal(refId(undefined), null);
  assert.equal(refId([]), null, 'tableau vide/mal formé: pas de crash, pas d\'id');
});

test('refLabel resolves a Reference cell in any of the 3 shapes Grist can send', () => {
  const referenceMap = { 12: 'CHU' };
  // Cas réel constaté en prod : la table liée a une "visible column" configurée,
  // Grist envoie déjà le texte d'affichage résolu ("UBM") plutôt qu'un id.
  assert.equal(refLabel('UBM', referenceMap), 'UBM');
  // Encodage brut d'une Référence : ['R', tableId, rowId].
  assert.equal(refLabel(['R', 'Etablissements', 12], referenceMap), 'CHU');
  // Id déjà nu.
  assert.equal(refLabel(12, referenceMap), 'CHU');
  // Référence vide ou introuvable.
  assert.equal(refLabel(0, referenceMap), '');
  assert.equal(refLabel(['R', 'Etablissements', 999], referenceMap), '');
});

test('enrich: établissement resolves whether Grist sends resolved text, a raw id, or an ["R", ...] reference', () => {
  const referenceMaps = { Etablissements: { 12: 'CHU' } };
  assert.equal(enrich({ Etablissement: 'UBM' }, referenceMaps).etablissement_label, 'UBM');
  assert.equal(enrich({ Etablissement: ['R', 'Etablissements', 12] }, referenceMaps).etablissement_label, 'CHU');
  assert.equal(enrich({ Etablissement: 12 }, referenceMaps).etablissement_label, 'CHU');
  // Référence introuvable dans la table : repli sur Etablissement2.
  assert.equal(enrich({ Etablissement: ['R', 'Etablissements', 999], Etablissement2: 'Clinique du Parc' }, referenceMaps).etablissement_label, 'Clinique du Parc');
  assert.equal(enrich({}, referenceMaps).etablissement_label, '');
});

test('enrich: etablissement_labels mirrors etablissement_label as a single-element array (or empty)', () => {
  const referenceMaps = { Etablissements: { 12: 'CHU' } };
  assert.deepEqual(enrich({ Etablissement: 12 }, referenceMaps).etablissement_labels, ['CHU']);
  assert.deepEqual(enrich({}, referenceMaps).etablissement_labels, []);
});

test('enrich: role_labels resolves Role_dans_le_PUI as an array, matching the _labels convention every other tag group uses', () => {
  // Régression : avant ce correctif, enrich() ne posait que role_label
  // (singulier), que rien ne lisait jamais — le tag "Rôle PUI" n'apparaissait
  // donc sur aucune carte, quelles que soient les données (cf. CHANGELOG).
  const referenceMaps = { Role_Dans_le_PUI: { 3: 'Référent qualité' } };
  assert.deepEqual(enrich({ Role_dans_le_PUI: 3 }, referenceMaps).role_labels, ['Référent qualité']);
  assert.deepEqual(enrich({}, referenceMaps).role_labels, [], 'pas de référence: liste vide');
  assert.deepEqual(enrich({ Role_dans_le_PUI: 999 }, referenceMaps).role_labels, [], 'référence introuvable: liste vide, pas de valeur fantôme');
});

test('enrich: list-reference categories (Instances/Actions/GT/Communautés/Tâches) drop ids that fail to resolve, instead of leaking the raw numeric id as a fake label', () => {
  const referenceMaps = { Instances: { 7: 'CME' } };
  assert.deepEqual(enrich({ Instances: ['L', 7, 999] }, referenceMaps).instances_labels, ['CME'],
    'id 999 introuvable dans la table de référence: ignoré, pas affiché comme "999"');
  assert.deepEqual(enrich({ Instances: ['L'] }, referenceMaps).instances_labels, []);
});

test('resolveListItem resolves a ReferenceList item whether Grist sends a raw id or already-resolved text', () => {
  // Régression prod du 14/09 (voir CHANGELOG 1.5.1) : une ReferenceList peut
  // arriver avec des items déjà résolus en texte (visible column configurée
  // sur la table liée), pas seulement des ids numériques — même ambiguïté que
  // refId()/refLabel() pour une Référence unique, mais jamais gérée ici avant
  // ce correctif. Résultat en prod : tags Instances/Actions/GT/Communautés/
  // Tâches disparus de toutes les cartes.
  const referenceMap = { 7: 'CME' };
  assert.equal(resolveListItem('CME', referenceMap), 'CME', 'texte déjà résolu: utilisé tel quel');
  assert.equal(resolveListItem(7, referenceMap), 'CME', 'id numérique brut: résolu via la table de référence');
  assert.equal(resolveListItem(999, referenceMap), '', 'id numérique introuvable: chaîne vide, pas de valeur fantôme');
  assert.equal(resolveListItem('', referenceMap), '');
});

test('enrich: list-reference categories resolve correctly when Grist sends pre-resolved text instead of numeric ids (production regression, 2026-09-14)', () => {
  const referenceMaps = { Instances: { 7: 'CME' } };
  // ['L', 'CME'] : la table Instances a une visible column configurée en
  // prod, donc Grist envoie directement le texte, pas ['L', 7].
  assert.deepEqual(enrich({ Instances: ['L', 'CME'] }, referenceMaps).instances_labels, ['CME']);
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
  assert.deepEqual(result.instances_labels, ['Instance A']);
  assert.deepEqual(result.actions_labels, ['Action B']);
  assert.deepEqual(result.gt_labels, ['GT C']);
  assert.deepEqual(result.communautes_labels, ['Communauté D']);
  assert.deepEqual(result.taches_labels, ['Tâche E']);
});

test('enrich: competences_labels reads exactly competences_1 through competences_15', () => {
  const contact = { competences_1: 'A', competences_15: 'O', competences_16: 'ignoré (pas une colonne réelle)' };
  assert.deepEqual(enrich(contact, {}).competences_labels, ['A', 'O']);
});

test('fetchTable resolves a table into an id->label map, using the given label field', async (t) => {
  t.after(() => { delete globalThis.window; });
  globalThis.window = { grist: { docApi: { fetchTable: async () => (
    { id: [1, 2], Action: ['Vaccination', ''] }
  ) } } };
  const map = await fetchTable('Actions', 'Action');
  assert.deepEqual(map, { 1: 'Vaccination' });
});

test('fetchTable falls back through multiple label fields in order (acronyme -> nom_complet)', async (t) => {
  t.after(() => { delete globalThis.window; });
  globalThis.window = { grist: { docApi: { fetchTable: async () => (
    { id: [1, 2], acronyme: ['CHU', ''], nom_complet: ['CHU de Bordeaux', 'Clinique X'] }
  ) } } };
  const map = await fetchTable('Etablissements', ['acronyme', 'nom_complet']);
  assert.deepEqual(map, { 1: 'CHU', 2: 'Clinique X' });
});

test('fetchTable swallows a docApi error and returns an empty map rather than throwing', async (t) => {
  t.after(() => { delete globalThis.window; });
  globalThis.window = { grist: { docApi: { fetchTable: async () => { throw new Error('network down'); } } } };
  const map = await fetchTable('Actions', 'Action');
  assert.deepEqual(map, {});
});

test('fetchEtablissementsFlags indexes the fondateur/partenaire/ok_pour_apparaitre booleans by row id AND by resolved label', async (t) => {
  t.after(() => { delete globalThis.window; });
  globalThis.window = { grist: { docApi: { fetchTable: async () => ({
    id: [1, 2, 3],
    acronyme: ['CHU', '', 'Clinique'],
    nom_complet: ['CHU de Bordeaux', 'UBM', 'Clinique du Parc'],
    fondateur: [true, false, false],
    partenaire: [false, true, false],
    autres: [false, false, true],
    ok_pour_apparaitre: [true, true, false]
  }) } } };
  const flags = await fetchEtablissementsFlags();
  assert.deepEqual(flags.byId['1'], { fondateur: true, partenaire: false, ok_pour_apparaitre: true });
  assert.deepEqual(flags.byId['2'], { fondateur: false, partenaire: true, ok_pour_apparaitre: true });
  assert.deepEqual(flags.byId['3'], { fondateur: false, partenaire: false, ok_pour_apparaitre: false });
  // acronyme prioritaire, repli sur nom_complet si acronyme est vide pour cette ligne (id 2).
  assert.deepEqual(flags.byLabel['CHU'], flags.byId['1']);
  assert.deepEqual(flags.byLabel['UBM'], flags.byId['2']);
  assert.deepEqual(flags.byLabel['Clinique'], flags.byId['3']);
});

test('fetchEtablissementsFlags swallows a docApi error and returns empty maps rather than throwing', async (t) => {
  t.after(() => { delete globalThis.window; });
  globalThis.window = { grist: { docApi: { fetchTable: async () => { throw new Error('network down'); } } } };
  const flags = await fetchEtablissementsFlags();
  assert.deepEqual(flags, { byId: {}, byLabel: {} });
});

test('etablissementFlags resolves via byLabel when Etablissement arrives as already-resolved text (prod encoding)', () => {
  const etabFlags = { byId: {}, byLabel: { UBM: { fondateur: false, partenaire: true, ok_pour_apparaitre: true } } };
  assert.deepEqual(etablissementFlags({ Etablissement: 'UBM' }, etabFlags), { fondateur: false, partenaire: true, ok_pour_apparaitre: true });
});

test('etablissementFlags resolves via byId for a raw id or an ["R", ...] reference', () => {
  const etabFlags = { byId: { 12: { fondateur: true, partenaire: false, ok_pour_apparaitre: true } }, byLabel: {} };
  assert.deepEqual(etablissementFlags({ Etablissement: 12 }, etabFlags), { fondateur: true, partenaire: false, ok_pour_apparaitre: true });
  assert.deepEqual(etablissementFlags({ Etablissement: ['R', 'Etablissements', 12] }, etabFlags), { fondateur: true, partenaire: false, ok_pour_apparaitre: true });
});

test('etablissementFlags returns null when unresolved (no Etablissement, orphan reference, or Etablissement2-only fallback)', () => {
  const etabFlags = { byId: { 12: { fondateur: true, partenaire: false, ok_pour_apparaitre: true } }, byLabel: {} };
  assert.equal(etablissementFlags({}, etabFlags), null);
  assert.equal(etablissementFlags({ Etablissement: 999 }, etabFlags), null);
  // Etablissement2 est du texte libre, pas une référence vers Etablissements : jamais d'indicateurs.
  assert.equal(etablissementFlags({ Etablissement2: 'Clinique du Parc' }, etabFlags), null);
});

test('isEtablissementEligible requires ok_pour_apparaitre AND (fondateur OR partenaire)', () => {
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: true, etablissement_fondateur: true, etablissement_partenaire: false }), true);
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: true, etablissement_fondateur: false, etablissement_partenaire: true }), true);
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: true, etablissement_fondateur: false, etablissement_partenaire: false }), false, '"autres" (ni fondateur ni partenaire) ne doit jamais être éligible');
  assert.equal(isEtablissementEligible({ etablissement_ok_pour_apparaitre: false, etablissement_fondateur: true, etablissement_partenaire: true }), false, 'ok_pour_apparaitre=false bloque même un fondateur/partenaire');
  assert.equal(isEtablissementEligible({}), false);
});

test('enrich: attaches etablissement_fondateur/partenaire/ok_pour_apparaitre from etabFlags', () => {
  const referenceMaps = { Etablissements: {} };
  const etabFlags = { byId: {}, byLabel: { UBM: { fondateur: false, partenaire: true, ok_pour_apparaitre: true } } };
  const enriched = enrich({ Etablissement: 'UBM' }, referenceMaps, etabFlags);
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, true);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, true);
});

test('enrich: etablissement_fondateur/partenaire/ok_pour_apparaitre default to false when etabFlags is omitted or unresolved', () => {
  const referenceMaps = { Etablissements: {} };
  const enriched = enrich({ Etablissement: 'UBM' }, referenceMaps);
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, false);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, false);
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
