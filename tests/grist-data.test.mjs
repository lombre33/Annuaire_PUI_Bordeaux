import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeValues, tableToRows, isInScope, text, pickLabel, refId, refLabel, isEmptyReference, normalize, normalizeForSearch,
  compareLabels, compareContacts,
  formatPhone, createRequestSequencer, referenceMapsEqual, sortWithCheckedFirst, resolveListItem,
  labelMapFromRows, mailtoHref, groupLabelMap, hasAccepted, buildContacts, displayName
} from '../grist-data.js';

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

test('normalizeForSearch() makes the usual spellings of a name equal: œ, apostrophes, hyphens, dots, spaces', () => {
  // Les écritures dont l'audit UI/UX a constaté qu'elles ne donnaient aucun résultat (U31).
  assert.equal(normalizeForSearch('Jean Le Cœur'), 'jean le coeur', 'œ s\'écrit « oe »');
  assert.equal(normalizeForSearch('Aeschylus Æsir'), 'aeschylus aesir', 'æ s\'écrit « ae »');
  assert.equal(normalizeForSearch('Sophie D’Arcy'), 'sophie darcy', 'apostrophe typographique');
  assert.equal(normalizeForSearch('Sophie D\'Arcy'), 'sophie darcy', 'apostrophe droite : même résultat');
  assert.equal(normalizeForSearch('Marie-Christine de La Rochefoucauld-Montmorency'),
    'marie christine de la rochefoucauld montmorency', 'le tiret vaut une espace');
  assert.equal(normalizeForSearch('Jean–Pierre'), 'jean pierre', 'tiret demi-cadratin');
  assert.equal(normalizeForSearch('J.-P. Martin'), 'j p martin', 'initiales avec points');
  assert.equal(normalizeForSearch('  Zoé \t  Élise  '), 'zoe elise', 'accents, casse et espaces multiples');
  assert.equal(normalizeForSearch('Straße Søren Łukasz Đorđe'), 'strasse soren lukasz dorde', 'lettres que la décomposition accentuée ne touche pas');
  assert.equal(normalizeForSearch(null), '');
  assert.equal(normalizeForSearch(' - \' . '), '', 'que des séparateurs : rien');
  // normalize(), lui, ne change pas : il sert aux menus, aux sélections et aux compteurs.
  assert.equal(normalize('Marie-Christine D’Arcy Cœur'), 'marie-christine d’arcy cœur');
});

test('compareContacts() orders by family name then first name, the French way', () => {
  const sorted = people => people.slice().sort(compareContacts).map(person => `${person.prenom} ${person.nom}`);
  assert.deepEqual(sorted([
    { prenom: 'Zoé', nom: 'Fabre' },
    { prenom: 'Ana', nom: 'Éluard' },
    { prenom: 'Bob', nom: 'Durand' },
    { prenom: 'Léa', nom: 'Dupont' },
    { prenom: 'Eve', nom: 'de Gaulle' }
  ]), ['Eve de Gaulle', 'Léa Dupont', 'Bob Durand', 'Ana Éluard', 'Zoé Fabre'],
  'les accents ne rejettent pas « Éluard » après le Z, et « de Gaulle » est avec les D');
  assert.deepEqual(sorted([
    { prenom: 'Hugo', nom: 'Martin' },
    { prenom: 'Ana', nom: 'Martin' },
    { prenom: 'Élise', nom: 'Martin' }
  ]), ['Ana Martin', 'Élise Martin', 'Hugo Martin'], 'même nom : par prénom');
  assert.deepEqual(sorted([
    { prenom: 'Jean', nom: 'Lebrun' },
    { prenom: 'Jean', nom: 'Le Cœur' }
  ]), ['Jean Le Cœur', 'Jean Lebrun'], 'l\'espace d\'un nom composé passe avant les lettres');
  assert.deepEqual(sorted([
    { prenom: 'Madonna', nom: '' },
    { prenom: 'Zoé', nom: 'Martin' },
    { prenom: 'Ana', nom: 'Bernard' }
  ]), ['Ana Bernard', 'Madonna ', 'Zoé Martin'], 'une personne sans nom de famille se range d\'après son prénom');
  assert.equal(compareContacts({ prenom: 'Ana', nom: 'Martin' }, { prenom: 'Ana', nom: 'Martin' }), 0, 'homonymes : égalité, le tri stable garde l\'ordre des lignes');
  assert.equal(compareContacts({ prenom: null, nom: undefined }, { prenom: '', nom: '' }), 0, 'valeurs vides sans erreur');
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

test('isInScope: regression test for the perimetre filter', () => {
  // Avant correction, `Array.isArray(p) && p.length > 0` était toujours vrai
  // car ['L'] (liste vide côté Grist) a une longueur de 1.
  assert.equal(isInScope({ perimetre: ['L'] }), false, 'une liste Grist vide ne doit pas être "in scope"');
  assert.equal(isInScope({ perimetre: ['L', 3] }), true);
  assert.equal(isInScope({ perimetre: undefined }), false);
  assert.equal(isInScope({ perimetre: [] }), false);
  assert.equal(isInScope({ perimetre_all: ['L', 3] }), false, 'l\'ancienne colonne perimetre_all n\'existe plus dans BDD');
});

test('tableToRows converts a Grist column-oriented table into rows', () => {
  const table = { id: [1, 2], nom: ['Dupont', 'Martin'], prenom: ['Alice', 'Bob'] };
  assert.deepEqual(tableToRows(table), [
    { id: 1, nom: 'Dupont', prenom: 'Alice' },
    { id: 2, nom: 'Martin', prenom: 'Bob' }
  ]);
  assert.deepEqual(tableToRows(null), []);
  assert.deepEqual(tableToRows([{ id: 1 }]), [{ id: 1 }]);
});

test('tableToRows returns no rows when the table object has no id array (defensive default, not a crash)', () => {
  assert.deepEqual(tableToRows({ nom: ['Dupont'] }), []);
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

test('isEmptyReference is true only for a Reference that points at nothing', () => {
  [0, null, undefined, '', '  ', [], ['R', 'Etablissements', 0]].forEach(value => {
    assert.equal(isEmptyReference(value), true, `${JSON.stringify(value)} ne désigne rien`);
  });
  [3, 'UBM', ['R', 'Etablissements', 3]].forEach(value => {
    assert.equal(isEmptyReference(value), false, `${JSON.stringify(value)} désigne un établissement`);
  });
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

test('labelMapFromRows resolves rows into an id->label map using the given label field, skipping rows without a label', () => {
  const rows = tableToRows({ id: [1, 2], Action: ['Vaccination', ''] });
  assert.deepEqual(labelMapFromRows(rows, 'Action'), { 1: 'Vaccination' });
});

test('labelMapFromRows falls back through multiple label fields in order (acronyme -> nom_complet)', () => {
  const rows = tableToRows({ id: [1, 2], acronyme: ['CHU', ''], nom_complet: ['CHU de Bordeaux', 'Clinique X'] });
  assert.deepEqual(labelMapFromRows(rows, ['acronyme', 'nom_complet']), { 1: 'CHU', 2: 'Clinique X' });
});

test('labelMapFromRows ignores rows without an id', () => {
  assert.deepEqual(labelMapFromRows([{ id: null, Action: 'Orpheline' }, { id: 3, Action: 'Audit' }], 'Action'), { 3: 'Audit' });
});

test('mailtoHref builds a link for a plain address and refuses anything that could add recipients or parameters', () => {
  assert.equal(mailtoHref('ana.martin@chu-bordeaux.fr'), 'mailto:ana.martin@chu-bordeaux.fr');
  assert.equal(mailtoHref('  ana+pui@chu.fr  '), 'mailto:ana+pui@chu.fr', 'espaces autour retirés, + conservé');
  assert.equal(mailtoHref("o'brien@chu.fr"), "mailto:o'brien@chu.fr");
  ['a@b.fr?cc=x@y.fr', 'a@b.fr,c@d.fr', 'a@b.fr;c@d.fr', 'a@b.fr&bcc=x@y.fr', 'a@b.fr#x', 'a b@c.fr',
    'pas-une-adresse', '@b.fr', 'a@', '', null, undefined].forEach(value => {
    assert.equal(mailtoHref(value), '', `${value} ne doit pas devenir un lien`);
  });
});

test('groupLabelMap gives every detailed row the label of its group, or the fallback when the group is empty', () => {
  const detailMap = { 1: 'Oncologie', 2: 'Hématologie', 3: 'Divers' };
  assert.deepEqual(groupLabelMap({ 1: 'Cancérologie', 2: 'Cancérologie' }, detailMap, 'Autres'),
    { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Autres' });
  assert.deepEqual(groupLabelMap({ 1: '  ', 2: null }, detailMap, 'Autres'), { 1: 'Autres', 2: 'Autres', 3: 'Autres' },
    'vide ou espaces : non classé');
});

test('groupLabelMap writes a group the same way everywhere: the spelling of the lowest row id wins', () => {
  const detailMap = { 1: 'A', 2: 'B', 3: 'C' };
  assert.deepEqual(groupLabelMap({ 1: 'Cancérologie', 2: 'cancerologie', 3: 'CANCÉROLOGIE ' }, detailMap, 'Autres'),
    { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Cancérologie' });
  assert.deepEqual(groupLabelMap({ 1: 'autres' }, { 1: 'A', 2: 'B' }, 'Autres'), { 1: 'autres', 2: 'autres' },
    'un domaine saisi « autres » et le repli ne font qu\'une option');
});

test('groupLabelMap ignores rows that are not in the detailed map and works without a fallback', () => {
  assert.deepEqual(groupLabelMap({ 1: 'X', 9: 'Orphelin' }, { 1: 'A', 2: 'B' }, 'Autres'), { 1: 'X', 2: 'Autres' });
  assert.deepEqual(groupLabelMap({ 1: 'X' }, { 1: 'A', 2: 'B' }), { 1: 'X' }, 'sans repli, une ligne non classée est omise');
  assert.deepEqual(groupLabelMap({}, {}, 'Autres'), {});
});

test('hasAccepted counts a checked box (true) as consent and nothing else', () => {
  assert.equal(hasAccepted({ Accepte_apparaitre: true }), true);
  [false, null, undefined, 0, 1, '', 'true', 'oui', ['L']].forEach(value => {
    assert.equal(hasAccepted({ Accepte_apparaitre: value }), false, `${JSON.stringify(value)} n'est pas un accord`);
  });
  assert.equal(hasAccepted({}), false, 'colonne absente : pas d\'accord');
});

test('buildContacts keeps only the people who accepted, whatever their establishment allows', () => {
  const etabFlags = { byId: { 1: { fondateur: true, partenaire: false, ok_pour_apparaitre: true } }, byLabel: {} };
  const rows = [
    { id: 1, prenom: 'Ana', nom: 'A', Etablissement: 1, Accepte_apparaitre: true },
    { id: 2, prenom: 'Bea', nom: 'B', Etablissement: 1, Accepte_apparaitre: false },
    { id: 3, prenom: 'Cleo', nom: 'C', Etablissement: 1, Accepte_apparaitre: null }
  ];
  assert.deepEqual(buildContacts(rows, {}, etabFlags).map(contact => contact.prenom), ['Ana']);
});

test('displayName writes "Prénom Nom" as the card does, trims, and falls back to "Sans nom"', () => {
  assert.equal(displayName({ prenom: 'Ana', nom: 'Martin' }), 'Ana Martin');
  assert.equal(displayName({ prenom: '  Ana ', nom: ' Martin  ' }), 'Ana Martin');
  assert.equal(displayName({ prenom: 'Ana', nom: '' }), 'Ana');
  assert.equal(displayName({ prenom: null, nom: 'Martin' }), 'Martin');
  assert.equal(displayName({ prenom: '', nom: '' }), 'Sans nom');
  assert.equal(displayName({}), 'Sans nom');
});
