import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  etablissementRightsFor, statusLabel, etablissementOf, responsablesOf, draftOfEtablissement,
  toggleResponsable, nominate, diffEtablissement, summaryOf, visibilityWarning, rebaseDraft, peopleOfEtablissement, NAME_REQUIRED, KEEP_ONE
} from '../etablissement.js';
import { tableToRows } from '../grist-data.js';
import { MAX_TEXT_LENGTH } from '../profile.js';
import { sampleTables, withBranding, withIdentity, ANA_EMAIL, ADMIN_EMAIL, BOB_EMAIL } from './fixtures.mjs';

// ===== etablissement : la logique pure de la fiche d'établissement (rien n'est écrit ici) =====

const world = () => withIdentity(withBranding(sampleTables()));
const etabRow = id => tableToRows(world().Etablissements).find(row => row.id === id);
const aclRows = () => tableToRows(world().ACL);

// ----- Qui peut modifier quelle fiche -----

test('etablissementRightsFor grants only the establishments the probe lists, and only for a ready identity', () => {
  const rights = etablissementRightsFor({ status: 'ready', admin: false, etablissements: [2, 5] });
  assert.deepEqual([1, 2, 3, 4, 5].map(rights), [false, true, false, false, true]);
});

test('etablissementRightsFor is closed by default: no identity, a viewer, an unreadable probe, a missing list', () => {
  for (const identity of [undefined, null, {}, { status: 'viewer', etablissements: [1] }, { status: 'unavailable', etablissements: [1] },
    { status: 'ready' }, { status: 'ready', etablissements: [] }, { status: 'ready', etablissements: 'x' }]) {
    assert.equal(etablissementRightsFor(identity)(1), false, JSON.stringify(identity));
  }
});

test('etablissementRightsFor ignores anything that is not a row number, and an administrator is not a responsable by right', () => {
  const rights = etablissementRightsFor({ status: 'ready', admin: true, etablissements: ['1', -1, 0, 1.5, null, '2', 3] });
  assert.deepEqual([0, 1, 2, 3].map(rights), [false, false, false, true], 'seul un identifiant de ligne entier compte');
  assert.equal(etablissementRightsFor({ status: 'ready', admin: true, etablissements: [] })(1), false, 'le mode admin ne concerne pas les établissements');
});

// ----- L'établissement vu par la fenêtre -----

test('statusLabel names the status the team set, founder first', () => {
  assert.equal(statusLabel({ fondateur: true }), 'Fondateur du PUI');
  assert.equal(statusLabel({ fondateur: true, partenaire: true }), 'Fondateur du PUI');
  assert.equal(statusLabel({ partenaire: true }), 'Partenaire du PUI');
  assert.equal(statusLabel({ autres: true }), 'Structure extérieure au PUI');
  assert.equal(statusLabel({}), 'Non précisé');
  assert.equal(statusLabel({ fondateur: 'oui', partenaire: 1 }), 'Non précisé', 'seul true vaut oui');
});

test('etablissementOf reads the sheet fields from an Etablissements row', () => {
  assert.deepEqual(etablissementOf(etabRow(1)), {
    id: 1, acronym: 'CHU', sigle: 'CHU', name: 'CHU de Bordeaux', visible: true, status: 'Fondateur du PUI', logo: [11], logoColumn: true
  });
  assert.deepEqual(etablissementOf(etabRow(2)), {
    id: 2, acronym: 'UBM', sigle: 'UBM', name: 'Université Bordeaux Montaigne', visible: true, status: 'Partenaire du PUI', logo: [12], logoColumn: true
  });
});

test('etablissementOf falls back to the full name without an acronym, and reports no logo or an unpublished row faithfully', () => {
  const noAcronym = etablissementOf(etabRow(5));
  assert.equal(noAcronym.acronym, 'Institut Bergonié');
  assert.equal(noAcronym.sigle, '', 'le sigle seul reste vide');
  assert.deepEqual(noAcronym.logo, [], 'pas de logo');
  const hidden = etablissementOf(etabRow(4));
  assert.equal(hidden.visible, false);
  assert.equal(hidden.status, 'Fondateur du PUI');
  assert.deepEqual(etablissementOf({ id: 9, ok_pour_apparaitre: 'oui' }).visible, false, 'seul true vaut visible');
  assert.deepEqual(etablissementOf({ id: 9 }), {
    id: 9, acronym: '', sigle: '', name: '', visible: false, status: 'Non précisé', logo: [], logoColumn: false
  }, 'sans colonne de logo, la fenêtre le sait');
});

// ----- Les responsables d'après ACL -----

test('responsablesOf lists the people ACL names for the establishment, ignoring case, spaces and other establishments', () => {
  assert.deepEqual(responsablesOf(aclRows(), 1), [{ email: ANA_EMAIL, rows: [{ id: 1, admin: true }] }]);
  assert.deepEqual(responsablesOf(aclRows(), 2), [{ email: BOB_EMAIL, rows: [{ id: 3, admin: false }] }]);
  assert.deepEqual(responsablesOf(aclRows(), 3), [], 'aucun responsable déclaré');
});

test('responsablesOf groups the rows of one address, keeps each row’s own admin flag and skips rows it cannot place', () => {
  const rows = [
    { id: 1, email: ' Ana@X.example ', Responsable_de_l_Etablissement: 7, admin: true },
    { id: 2, email: 'ana@x.example', Responsable_de_l_Etablissement: 7, admin: false },
    { id: 3, email: 'bob@x.example', Responsable_de_l_Etablissement: 'CHU', admin: false },
    { id: 4, email: '', Responsable_de_l_Etablissement: 7, admin: false },
    { id: 5, email: 'cat@x.example', Responsable_de_l_Etablissement: 8, admin: false },
    { id: 6, email: 'dan@x.example', Responsable_de_l_Etablissement: 0, admin: true },
    { id: 7, email: 'eve@x.example', Responsable_de_l_Etablissement: 7, admin: 'oui' }
  ];
  assert.deepEqual(responsablesOf(rows, 7), [
    { email: 'ana@x.example', rows: [{ id: 1, admin: true }, { id: 2, admin: false }] },
    { email: 'eve@x.example', rows: [{ id: 7, admin: false }] }
  ]);
});

// ----- Les personnes que l'annuaire montre -----

const card = (prenom, nom, email, Etablissement) => ({ prenom, nom, email, Etablissement });
const initialsOf = contact => `${contact.prenom.charAt(0)}${contact.nom.charAt(0)}`;

test('peopleOfEtablissement lists, alphabetically and once per address, the people the directory shows for the establishment', () => {
  const contacts = [
    card('Zoé', 'Zola', 'zoe@x.example', 1),
    card('Ana', 'Martin', 'Ana.Martin@CHU-Bordeaux.example', 1),
    card('Ana', 'Martin', 'ana.martin@chu-bordeaux.example', 1),
    card('Bob', 'Durand', 'bob@x.example', 2),
    card('Sans', 'Courriel', '', 1),
    card('Mal', 'Écrit', 'pas-une-adresse', 1)
  ];
  const result = peopleOfEtablissement(contacts, 1, 'zoe@x.example', initialsOf);
  assert.deepEqual(result.candidates, [
    { email: 'ana.martin@chu-bordeaux.example', name: 'Ana Martin', initials: 'AM' },
    { email: 'zoe@x.example', name: 'Zoé Zola', initials: 'ZZ' }
  ]);
  assert.equal(result.hidden, 5, 'cinq cartes de l’établissement 1 disparaîtraient, adresse ou non');
  assert.equal(result.includesMe, true);
});

test('peopleOfEtablissement keeps the first card of an address that two cards share', () => {
  const contacts = [card('Ana', 'Martin', 'partagee@x.example', 1), card('Anne', 'Dupont', 'PARTAGEE@x.example', 1)];
  assert.deepEqual(peopleOfEtablissement(contacts, 1, '', initialsOf).candidates, [
    { email: 'partagee@x.example', name: 'Ana Martin', initials: 'AM' }
  ]);
});

test('peopleOfEtablissement does not count the cards of other establishments, nor invent a presence for me', () => {
  const contacts = [card('Bob', 'Durand', 'bob@x.example', 2), card('Ana', 'Martin', 'ana@x.example', ['R', 'Etablissements', 1])];
  assert.deepEqual(peopleOfEtablissement(contacts, 2, 'ana@x.example', initialsOf), {
    candidates: [{ email: 'bob@x.example', name: 'Bob Durand', initials: 'BD' }], hidden: 1, includesMe: false
  });
  assert.equal(peopleOfEtablissement(contacts, 1, 'ANA@x.example', initialsOf).includesMe, true, 'adresse comparée sans casse, référence en liste lue aussi');
  assert.equal(peopleOfEtablissement(contacts, 1, '', initialsOf).includesMe, false);
  assert.deepEqual(peopleOfEtablissement([], 1, 'ana@x.example', initialsOf), { candidates: [], hidden: 0, includesMe: false });
});

// ----- Le brouillon -----

const CHU = () => etablissementOf(etabRow(1));
const draftWith = (...emails) => draftOfEtablissement(CHU(), emails.map(email => ({ email })));

test('draftOfEtablissement starts from the establishment as it is, with every responsable kept', () => {
  assert.deepEqual(draftWith(ANA_EMAIL, BOB_EMAIL), {
    name: 'CHU de Bordeaux', visible: true, logo: { action: 'keep' },
    responsables: [{ email: ANA_EMAIL, state: 'kept' }, { email: BOB_EMAIL, state: 'kept' }]
  });
});

test('toggleResponsable marks a responsable removed, then brings them back; an address added here simply disappears', () => {
  const draft = draftWith(ANA_EMAIL);
  toggleResponsable(draft, ANA_EMAIL);
  assert.equal(draft.responsables[0].state, 'removed');
  toggleResponsable(draft, ANA_EMAIL);
  assert.equal(draft.responsables[0].state, 'kept');
  assert.equal(nominate(draft, 'nouveau@x.example'), '');
  toggleResponsable(draft, 'nouveau@x.example');
  assert.deepEqual(draft.responsables.map(item => item.email), [ANA_EMAIL]);
  toggleResponsable(draft, 'inconnu@x.example');
  assert.equal(draft.responsables.length, 1, 'une adresse absente ne change rien');
});

test('rebaseDraft brings the draft onto the list Grist holds now, keeping what the person typed', () => {
  const draft = draftWith(ANA_EMAIL, BOB_EMAIL);
  draft.name = 'Nom tapé';
  draft.visible = false;
  draft.logo = { action: 'remove' };
  toggleResponsable(draft, BOB_EMAIL);
  nominate(draft, 'claire@x.example');
  nominate(draft, 'dan@x.example');
  // Entre-temps : Ana est partie, Dan a été nommé par un autre, Eve aussi.
  const now = [{ email: BOB_EMAIL }, { email: 'dan@x.example' }, { email: 'eve@x.example' }];
  const rebased = rebaseDraft(draft, now);
  assert.deepEqual(rebased.responsables, [
    { email: BOB_EMAIL, state: 'removed' },
    { email: 'dan@x.example', state: 'kept' },
    { email: 'eve@x.example', state: 'kept' },
    { email: 'claire@x.example', state: 'added' }
  ]);
  assert.deepEqual([rebased.name, rebased.visible, rebased.logo], ['Nom tapé', false, { action: 'remove' }]);
  assert.equal(draft.responsables.length, 4, 'le brouillon d’origine n’est pas modifié');
});

test('rebaseDraft makes a plain draft of the current list when nothing was touched', () => {
  assert.deepEqual(rebaseDraft(draftWith(ANA_EMAIL), [{ email: 'x@y.example' }]).responsables, [{ email: 'x@y.example', state: 'kept' }]);
  assert.deepEqual(rebaseDraft(draftWith(ANA_EMAIL), []).responsables, []);
});

test('nominate adds a responsable in lower case, once, and says why when it refuses', () => {
  const draft = draftWith(ANA_EMAIL);
  assert.equal(nominate(draft, '  Nouveau.Nom@Exemple.EXAMPLE '), '');
  assert.deepEqual(draft.responsables.at(-1), { email: 'nouveau.nom@exemple.example', state: 'added' });
  assert.equal(nominate(draft, 'NOUVEAU.NOM@exemple.example'), 'Cette personne est déjà responsable.');
  assert.equal(nominate(draft, ANA_EMAIL.toUpperCase()), 'Cette personne est déjà responsable.');
  assert.equal(nominate(draft, ''), 'Choisissez une personne ou saisissez une adresse e-mail.');
  assert.equal(nominate(draft, '   '), 'Choisissez une personne ou saisissez une adresse e-mail.');
  for (const bad of ['pas une adresse', 'a@b', '@x.example', 'deux@x.example, trois@x.example', 'a b@x.example', '+x@exemple.example', `${'a'.repeat(MAX_TEXT_LENGTH)}@x.example`]) {
    assert.equal(nominate(draft, bad), 'Indiquez une adresse e-mail valide.', bad);
  }
  assert.equal(draft.responsables.length, 2, 'rien n’a été ajouté par un refus');
});

test('nominate brings back a responsable who was just removed instead of listing them twice', () => {
  const draft = draftWith(ANA_EMAIL, BOB_EMAIL);
  toggleResponsable(draft, BOB_EMAIL);
  assert.equal(nominate(draft, BOB_EMAIL), '');
  assert.deepEqual(draft.responsables, [{ email: ANA_EMAIL, state: 'kept' }, { email: BOB_EMAIL, state: 'kept' }]);
});

// ----- Ce qui change -----

const before = (overrides = {}) => ({ name: 'CHU de Bordeaux', visible: true, logo: [11], ...overrides });
const diff = (draft, options, base = before()) => diffEtablissement(base, draft, options);

test('diffEtablissement finds nothing to save in a draft nobody touched', () => {
  const result = diff(draftWith(ANA_EMAIL));
  assert.deepEqual(result, { champs: {}, labels: [], errors: [], fieldErrors: {} });
  assert.equal(summaryOf(result), 'Aucune modification');
});

test('diffEtablissement reports the name and visibility as before/after, trimming what was typed', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.name = '  CHU   de\tBordeaux-Sud ';
  draft.visible = false;
  const result = diff(draft);
  assert.deepEqual(result.champs, {
    name: { avant: 'CHU de Bordeaux', apres: 'CHU de Bordeaux-Sud' },
    visible: { avant: true, apres: false }
  });
  assert.deepEqual(result.labels, ['nom', 'visibilité']);
  assert.equal(summaryOf(result), '2 modifications : nom, visibilité');
});

test('diffEtablissement treats a name that only differs by spaces as unchanged', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.name = '  CHU de Bordeaux  ';
  assert.deepEqual(diff(draft).champs, {});
});

test('diffEtablissement refuses an empty name or one a spreadsheet would read as a formula, field by field', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.name = '   ';
  let result = diff(draft);
  assert.equal(result.fieldErrors.name, NAME_REQUIRED);
  assert.deepEqual(result.champs, {});
  assert.deepEqual(result.errors, [NAME_REQUIRED]);
  assert.equal(summaryOf(result), 'Indiquez le nom complet de l’établissement');

  draft.name = '=SOMME(A1)';
  result = diff(draft);
  assert.equal(result.fieldErrors.name, 'Ne peut pas commencer par = + - ou @.');
  assert.equal(summaryOf(result), 'Corrigez le nom');

  draft.name = 'x'.repeat(MAX_TEXT_LENGTH + 1);
  assert.match(diff(draft).fieldErrors.name, /^200 caractères au plus\.$/);
});

test('diffEtablissement does not blame the person for a name already in Grist that would not be accepted today', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.name = '=Nom historique';
  const result = diff(draft, undefined, before({ name: '=Nom historique' }));
  assert.deepEqual(result.fieldErrors, {});
  assert.deepEqual(result.champs, {});
  const blank = draftWith(ANA_EMAIL);
  blank.name = '   ';
  assert.deepEqual(diff(blank, undefined, before({ name: '' })).champs, {}, 'un nom déjà vide qui reste vide ne change rien');
});

test('diffEtablissement only reports a visibility that really differs, and ignores anything that is not a boolean', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.visible = true;
  assert.deepEqual(diff(draft).champs, {});
  draft.visible = 'non';
  assert.deepEqual(diff(draft).champs, {});
  draft.visible = false;
  assert.deepEqual(diff(draft, undefined, before({ visible: false })).champs, {});
});

test('diffEtablissement reports a logo only when there is a file to send or a logo to remove', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.logo = { action: 'replace' };
  assert.deepEqual(diff(draft).champs, {}, 'remplacer sans fichier ne change rien');
  draft.logo = { action: 'replace', file: { name: 'logo.png' } };
  assert.deepEqual(diff(draft).champs, { logo: { action: 'replace' } });
  assert.deepEqual(diff(draft, undefined, before({ logo: [] })).champs, { logo: { action: 'replace' } }, 'un premier logo');
  draft.logo = { action: 'remove' };
  assert.deepEqual(diff(draft).champs, { logo: { action: 'remove' } });
  assert.deepEqual(diff(draft, undefined, before({ logo: [] })).champs, {}, 'rien à retirer');
  draft.logo = { action: 'keep' };
  assert.deepEqual(diff(draft).champs, {});
  draft.logo = undefined;
  assert.deepEqual(diff(draft).champs, {});
});

test('diffEtablissement lists the responsables added and removed, never the whole list', () => {
  const draft = draftWith(ANA_EMAIL, BOB_EMAIL);
  toggleResponsable(draft, BOB_EMAIL);
  nominate(draft, 'Claire@x.example');
  const result = diff(draft);
  assert.deepEqual(result.champs.responsables, { ajout: ['claire@x.example'], retrait: [BOB_EMAIL] });
  assert.deepEqual(result.labels, ['responsables']);
  assert.equal(summaryOf(result), '1 modification : responsables');
});

test('diffEtablissement refuses to leave the establishment without a responsable', () => {
  const draft = draftWith(ANA_EMAIL);
  toggleResponsable(draft, ANA_EMAIL);
  const result = diff(draft);
  assert.equal(result.fieldErrors.responsables, KEEP_ONE);
  assert.deepEqual(result.errors, [KEEP_ONE]);
  assert.equal(summaryOf(result), 'Gardez au moins un responsable');
  nominate(draft, 'relais@x.example');
  assert.deepEqual(diff(draft).fieldErrors, {}, 'un autre responsable suffit');
});

test('diffEtablissement does not reproach an empty responsables list nobody touched', () => {
  const draft = draftWith();
  draft.visible = false;
  const result = diff(draft);
  assert.deepEqual(result.fieldErrors, {});
  assert.deepEqual(Object.keys(result.champs), ['visible']);
  nominate(draft, 'premier@x.example');
  assert.deepEqual(diff(draft).champs.responsables, { ajout: ['premier@x.example'], retrait: [] });
});

test('diffEtablissement leaves the responsables alone when the list could not be read', () => {
  const draft = draftWith();
  assert.deepEqual(draft.responsables, []);
  const result = diff(draft, { readable: false });
  assert.deepEqual(result.fieldErrors, {}, 'pas de liste, pas de « au moins un responsable »');
  draft.name = 'Autre nom';
  assert.deepEqual(Object.keys(diff(draft, { readable: false }).champs), ['name']);
});

test('diffEtablissement orders the summary like the sheet and counts a single change in the singular', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.name = 'Autre nom';
  draft.visible = false;
  draft.logo = { action: 'remove' };
  nominate(draft, 'nouveau@x.example');
  const result = diff(draft);
  assert.deepEqual(result.labels, ['logo', 'nom', 'visibilité', 'responsables']);
  assert.equal(summaryOf(result), '4 modifications : logo, nom, visibilité, responsables');
  const single = draftWith(ANA_EMAIL);
  single.visible = false;
  assert.equal(summaryOf(diff(single)), '1 modification : visibilité');
});

test('summaryOf puts the problem before the changes', () => {
  const draft = draftWith(ANA_EMAIL);
  draft.visible = false;
  draft.name = '';
  assert.equal(summaryOf(diff(draft)), 'Indiquez le nom complet de l’établissement');
  assert.equal(summaryOf({ errors: ['autre'], fieldErrors: {}, labels: [] }), 'Corrigez les champs signalés');
});

// ----- Ce que la fenêtre dit de la visibilité -----

test('visibilityWarning says what unchecking the box does to the cards', () => {
  assert.equal(visibilityWarning({ wasVisible: true, hidden: 0, includesMe: false }), 'Cet établissement n’apparaîtra plus dans l’annuaire.');
  assert.equal(visibilityWarning({ wasVisible: true, hidden: 1, includesMe: false }), 'La fiche de cet établissement sera masquée de l’annuaire.');
  assert.equal(visibilityWarning({ wasVisible: true, hidden: 1, includesMe: true }), 'La fiche de cet établissement sera masquée de l’annuaire, y compris la vôtre.');
  assert.equal(visibilityWarning({ wasVisible: true, hidden: 12, includesMe: true }), 'Les 12 fiches de cet établissement seront masquées de l’annuaire, y compris la vôtre.');
  assert.equal(visibilityWarning({ wasVisible: false, hidden: 0, includesMe: false }), 'Cet établissement est masqué de l’annuaire : aucune de ses fiches n’y apparaît.');
});

test('the shared fixture agrees with the tests above (ADMIN_EMAIL is an administrator without establishment)', () => {
  const rows = aclRows();
  assert.deepEqual(responsablesOf(rows, 1).map(entry => entry.email), [ANA_EMAIL]);
  assert.ok(rows.some(row => row.email === ADMIN_EMAIL && row.Responsable_de_l_Etablissement === 0 && row.admin === true));
});
