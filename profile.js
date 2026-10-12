// Modifier une fiche : qui peut le faire, ce que le formulaire propose, ce que la
// personne a changé et comment le dire. Rien n'est écrit ici (l'enregistrement est
// dans profile-save.js) et il n'y a aucun accès au DOM ni à Grist.
//
// Ce que la personne change est un delta, pas une copie de la fiche : pour une liste,
// les valeurs à ajouter et à retirer ; pour le reste, l'ancienne et la nouvelle valeur.
// Ainsi une valeur que le formulaire ne montre pas (une ligne de référence sans
// libellé) n'est jamais perdue, et ce qu'un autre a changé entre-temps non plus.

import { CATEGORIES, PROFILE_FIELDS } from './constants.js';
import { compareLabels, formatPhone, normalizeEmail, refId, safeValues, text } from './grist-data.js';

export const MAX_TEXT_LENGTH = 200;

// Un texte qui commence par l'un de ces caractères serait lu comme une formule par
// un tableur qui ouvre un export de l'annuaire.
const SPREADSHEET_FORMULA_START = /^[=+\-@]/;

// ===== Qui peut modifier quelle fiche =====

// Renvoie une fonction `row → droit` pour la personne connectée : 'own' (c'est sa
// fiche : celle dont l'adresse est la sienne), 'admin' (celle d'une autre, qu'une
// administratrice peut modifier) ou null. Fermé par défaut : sans identité fiable
// (pas de table-sonde, compte Lecteur…), personne ne peut rien modifier.
//
// Ce n'est qu'un verrou d'interface. N'importe qui peut ouvrir la console de son
// navigateur et l'ignorer : seules les règles d'accès de Grist protègent vraiment
// les données (GRIST_SETUP.md).
export function rightsFor(identity) {
  if (identity?.status !== 'ready') return () => null;
  const mine = normalizeEmail(identity.email);
  const admin = identity.admin === true;
  return row => {
    if (!row) return null;
    if (mine && normalizeEmail(row.email) === mine) return 'own';
    return admin ? 'admin' : null;
  };
}

// ===== Saisie =====

// Texte saisi sur une ligne : caractères de contrôle et retours à la ligne
// remplacés par une espace, espaces multiples réduits, bords retirés.
export function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pourquoi un texte est refusé, ou '' s'il est accepté.
export function textFault(value) {
  if (value.length > MAX_TEXT_LENGTH) return `${MAX_TEXT_LENGTH} caractères au plus`;
  if (SPREADSHEET_FORMULA_START.test(value)) return 'ne peut pas commencer par = + - ou @';
  return '';
}

// « 05 56 78 90 12 », « 05.56.78.90.12 », « +33 5 56 78 90 12 » ou « 0033 5 56 78 90 12 »
// → « 0556789012 ».
// null pour tout ce qui n'est pas un numéro français à 10 chiffres.
export function frenchPhoneDigits(input) {
  const raw = text(input);
  if (!/^\+?[\d\s.\-()]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return digits;
  if (raw.startsWith('+') && /^33[1-9]\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  if (raw.startsWith('+') && /^330[1-9]\d{8}$/.test(digits)) return `0${digits.slice(3)}`; // +33 (0)5 56…
  if (/^0033[1-9]\d{8}$/.test(digits)) return `0${digits.slice(4)}`;
  return null;
}

// ===== Le formulaire =====

// La catégorie qui regroupe celle-ci (les domaines regroupent les compétences), ou null.
const groupingOf = category => Object.entries(CATEGORIES).find(([, other]) => other.groups === category) || null;

// Les valeurs qu'une table de référence propose : [{ id, label }] triées. Quand un
// regroupement est connu (les domaines des compétences), chaque valeur porte aussi son
// `group` et les valeurs sont rangées groupe par groupe, le groupe de repli (« Autres »)
// en dernier : le formulaire peut les présenter par domaine sans rien recalculer.
export function optionsOf(category, referenceMaps) {
  const grouping = groupingOf(category);
  const groups = grouping ? referenceMaps[grouping[0]] || {} : {};
  const grouped = Object.keys(groups).length > 0;
  const fallback = grouping?.[1].fallback;
  const rank = group => (group === fallback ? 1 : 0);
  return Object.entries(referenceMaps[category] || {})
    .map(([id, label]) => ({ id: Number(id), label, ...(grouped && { group: groups[id] || fallback }) }))
    .sort((a, b) => (grouped
      ? rank(a.group) - rank(b.group) || compareLabels(a.group, b.group) || compareLabels(a.label, b.label)
      : compareLabels(a.label, b.label)));
}

// Identifiants d'une cellule ReferenceList qui figurent parmi `options` (ceux que
// le formulaire peut montrer).
function knownIds(cell, options) {
  const known = new Set(options.map(option => option.id));
  return safeValues(cell).filter(item => typeof item === 'number' && known.has(item));
}

// Le formulaire de modification d'une fiche : un champ par PROFILE_FIELDS, avec la
// valeur actuelle de la fiche (`value`) et, pour une référence ou une liste, sa
// `category` et les valeurs proposées (`options`).
export function profileFormModel(row, referenceMaps) {
  // Une colonne facultative absente de BDD n'est pas proposée (rien à modifier).
  return PROFILE_FIELDS.filter(field => field.key in row).map(field => {
    const base = { key: field.key, label: field.label, kind: field.kind, ...(field.category && { category: field.category }) };
    if (field.kind === 'text') return { ...base, value: text(row[field.key]) };
    if (field.kind === 'phone') return { ...base, value: formatPhone(row[field.key]) };
    const options = optionsOf(field.category, referenceMaps);
    if (field.kind === 'reference') return { ...base, options, value: refId(row[field.key]) || 0 };
    return { ...base, options, value: knownIds(row[field.key], options) };
  });
}

// Le brouillon que le formulaire modifie : { colonne → valeur }, pris sur le modèle
// (profileFormModel). Une liste est copiée, pour que le brouillon puisse changer sans
// toucher au modèle.
export function draftOf(model) {
  return Object.fromEntries(model.map(field => [field.key, Array.isArray(field.value) ? [...field.value] : field.value]));
}

// ===== Ce qui change =====

const labelOf = (options, id) => options.find(option => option.id === id)?.label || '';

function sameSet(a, b) {
  return a.length === b.length && a.every(item => b.includes(item));
}

// Compare le brouillon de la personne à sa fiche. `draft` : { colonne → valeur } ;
// une colonne absente n'est pas touchée. Un texte et un numéro sont des chaînes,
// une référence est un identifiant entier (0 : aucune), une liste un tableau
// d'identifiants entiers ; tout autre type est refusé. Renvoie { champs, errors,
// fieldErrors } : `champs` ne contient que ce qui change (voir rebaseChanges et
// buildRowUpdate pour son usage) ; `errors` dit pourquoi le brouillon est refusé (une
// phrase par défaut), `fieldErrors` la même chose champ par champ (colonne → message),
// pour l'afficher sous le champ.
export function diffProfile(row, draft, referenceMaps) {
  const champs = {};
  const errors = [];
  const fieldErrors = {};
  const fail = (field, message) => {
    errors.push(`${field.label} : ${message}`);
    fieldErrors[field.key] = message;
  };

  PROFILE_FIELDS.forEach(field => {
    if (!(field.key in draft) || !(field.key in row)) return;
    const input = draft[field.key];

    if (field.kind === 'text') {
      const before = text(row[field.key]);
      if (String(input ?? '') === before) return; // laissé tel quel : pas un changement, même si le texte n'est pas « propre »
      const after = cleanText(input);
      const fault = textFault(after);
      if (fault) fail(field, `${fault}.`);
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    if (field.kind === 'phone') {
      const shown = formatPhone(row[field.key]);
      if (String(input ?? '') === shown) return; // laissé tel quel, même s'il n'est pas à la française
      const typed = cleanText(input);
      const before = frenchPhoneDigits(shown) || '';
      const after = typed === '' ? '' : frenchPhoneDigits(typed);
      if (after === null) fail(field, 'un numéro français à 10 chiffres est attendu (05 56 78 90 12).');
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    const options = optionsOf(field.category, referenceMaps);

    // Un brouillon d'un autre type que prévu est une erreur, jamais « aucune valeur » :
    // une saisie illisible ne doit pas retirer un rôle ou vider une liste.
    if (field.kind === 'reference') {
      if (!Number.isSafeInteger(input) || input < 0) {
        fail(field, 'valeur illisible.');
        return;
      }
      const before = refId(row[field.key]) || 0;
      const after = input;
      if (after !== 0 && !options.some(option => option.id === after)) {
        fail(field, 'valeur inconnue.');
      } else if (after !== before) {
        champs[field.key] = {
          avant: { id: before, label: labelOf(options, before) },
          apres: { id: after, label: labelOf(options, after) }
        };
      }
      return;
    }

    // Liste : seules les valeurs que le formulaire montre peuvent être retirées ou
    // ajoutées ; les autres (ligne sans libellé…) restent telles quelles.
    if (!Array.isArray(input) || !input.every(Number.isSafeInteger)) {
      fail(field, 'valeur illisible.');
      return;
    }
    const wanted = input;
    if (wanted.some(id => !options.some(option => option.id === id))) {
      fail(field, 'valeur inconnue.');
      return;
    }
    const current = knownIds(row[field.key], options);
    if (sameSet(current, wanted)) return;
    const entry = id => ({ id, label: labelOf(options, id) });
    champs[field.key] = {
      ajout: [...new Set(wanted)].filter(id => !current.includes(id)).map(entry),
      retrait: current.filter(id => !wanted.includes(id)).map(entry)
    };
  });

  const name = field => (champs[field] ? champs[field].apres : text(row[field]));
  if (('nom' in champs || 'prenom' in champs) && !name('nom') && !name('prenom')) {
    const message = 'Indiquez au moins un prénom ou un nom.';
    errors.push(message);
    ['prenom', 'nom'].filter(key => key in champs).forEach(key => { fieldErrors[key] = message; });
  }
  return { champs, errors, fieldErrors };
}

// Ramène les changements (calculés sur la fiche telle que le formulaire l'a montrée)
// sur la fiche telle qu'elle est maintenant dans Grist : { champs, moved }.
//   - un texte, un téléphone ou une référence repart de sa valeur actuelle (`avant`), et
//     disparaît des changements si la fiche a déjà la valeur voulue ;
//   - une liste garde ses ajouts et ses retraits (ils s'appliquent à n'importe quel
//     état), moins ceux qui sont déjà faits ;
//   - `moved` nomme les champs dont la valeur a changé dans Grist depuis que le
//     formulaire a été ouvert : la personne doit le savoir avant de valider.
export function rebaseChanges(champs, row, referenceMaps) {
  const rebased = {};
  const moved = [];
  PROFILE_FIELDS.filter(field => champs[field.key]).forEach(field => {
    const change = champs[field.key];

    if (field.kind === 'text') {
      const current = text(row[field.key]);
      if (current === change.apres) return;
      if (current !== change.avant) moved.push(field.label);
      rebased[field.key] = { avant: current, apres: change.apres };
      return;
    }

    if (field.kind === 'phone') {
      const current = frenchPhoneDigits(formatPhone(row[field.key])) || '';
      if (current === change.apres) return;
      if (current !== change.avant) moved.push(field.label);
      rebased[field.key] = { avant: current, apres: change.apres };
      return;
    }

    if (field.kind === 'reference') {
      const current = refId(row[field.key]) || 0;
      if (current === change.apres.id) return;
      if (current !== change.avant.id) moved.push(field.label);
      const labels = referenceMaps[field.category] || {};
      rebased[field.key] = { avant: { id: current, label: labels[String(current)] || '' }, apres: change.apres };
      return;
    }

    const present = new Set(safeValues(row[field.key]).filter(Number.isSafeInteger));
    const ajout = change.ajout.filter(entry => !present.has(entry.id));
    const retrait = change.retrait.filter(entry => present.has(entry.id));
    if (ajout.length + retrait.length > 0) rebased[field.key] = { ajout, retrait };
  });
  return { champs: rebased, moved };
}

// Une ligne par champ modifié : le champ, ce qu'il valait, ce qu'il vaudra. `champs` a
// la forme de diffProfile(), dans l'ordre du formulaire.
//   texte, téléphone, référence   { key, label, kind, before, after }
//   liste                         { key, label, kind, added, removed } (des libellés)
export function describeChanges(champs) {
  const label = entry => entry.label || `n° ${entry.id}`;
  return PROFILE_FIELDS.filter(field => champs[field.key]).map(field => {
    const change = champs[field.key];
    const base = { key: field.key, label: field.label, kind: field.kind };
    if (field.kind === 'list') return { ...base, added: change.ajout.map(label), removed: change.retrait.map(label) };
    if (field.kind === 'reference') return { ...base, before: change.avant.label, after: change.apres.label };
    if (field.kind === 'phone') return { ...base, before: formatPhone(change.avant), after: formatPhone(change.apres) };
    return { ...base, before: change.avant, after: change.apres };
  });
}
