// Modifier sa fiche : ce que la personne peut changer, ce qu'elle propose, et le
// résumé qu'on en tire. Rien n'est écrit dans BDD ici (un administrateur applique
// la demande, voir requests.js), et aucun accès au DOM ni à Grist.
//
// Une demande est un delta, pas une copie de la fiche : pour une liste, les valeurs
// à ajouter et à retirer ; pour le reste, l'ancienne et la nouvelle valeur. Ainsi
// une valeur que le formulaire ne montre pas (une ligne de référence sans libellé)
// n'est jamais perdue, et ce qu'un autre a changé entre-temps non plus.

import { PROFILE_FIELDS } from './constants.js';
import { compareLabels, formatPhone, refId, safeValues, text } from './grist-data.js';

export const MAX_TEXT_LENGTH = 200;

// Un texte qui commence par l'un de ces caractères serait lu comme une formule par
// un tableur qui ouvre un export de l'annuaire.
const SPREADSHEET_FORMULA_START = /^[=+\-@]/;

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

// Les valeurs qu'une table de référence propose : [{ id, label }] triées.
export function optionsOf(category, referenceMaps) {
  return Object.entries(referenceMaps[category] || {})
    .map(([id, label]) => ({ id: Number(id), label }))
    .sort((a, b) => compareLabels(a.label, b.label));
}

// Identifiants d'une cellule ReferenceList qui figurent parmi `options` (ceux que
// le formulaire peut montrer).
function knownIds(cell, options) {
  const known = new Set(options.map(option => option.id));
  return safeValues(cell).filter(item => typeof item === 'number' && known.has(item));
}

// Le formulaire de modification d'une fiche : un champ par PROFILE_FIELDS, avec la
// valeur actuelle de la fiche (`value`) et, pour une référence ou une liste, les
// valeurs proposées (`options`).
export function profileFormModel(row, referenceMaps) {
  // Une colonne facultative absente de BDD n'est pas proposée (rien à modifier).
  return PROFILE_FIELDS.filter(field => field.key in row).map(field => {
    const base = { key: field.key, label: field.label, kind: field.kind };
    if (field.kind === 'text') return { ...base, value: text(row[field.key]) };
    if (field.kind === 'phone') return { ...base, value: formatPhone(row[field.key]) };
    const options = optionsOf(field.category, referenceMaps);
    if (field.kind === 'reference') return { ...base, options, value: refId(row[field.key]) || 0 };
    return { ...base, options, value: knownIds(row[field.key], options) };
  });
}

const labelOf = (options, id) => options.find(option => option.id === id)?.label || '';

function sameSet(a, b) {
  return a.length === b.length && a.every(item => b.includes(item));
}

// Compare le brouillon de la personne à sa fiche. `draft` : { colonne → valeur } ;
// une colonne absente n'est pas touchée. Un texte et un numéro sont des chaînes,
// une référence est un identifiant entier (0 : aucune), une liste un tableau
// d'identifiants entiers ; tout autre type est refusé. Renvoie { champs, errors, summary } : `champs` ne contient que ce
// qui change, dans la forme que requests.js sérialise ; `errors` dit pourquoi le
// brouillon est refusé ; `summary` résume les changements en une phrase.
export function diffProfile(row, draft, referenceMaps) {
  const champs = {};
  const errors = [];

  PROFILE_FIELDS.forEach(field => {
    if (!(field.key in draft) || !(field.key in row)) return;
    const input = draft[field.key];

    if (field.kind === 'text') {
      const before = text(row[field.key]);
      if (String(input ?? '') === before) return; // laissé tel quel : pas un changement, même si le texte n'est pas « propre »
      const after = cleanText(input);
      const fault = textFault(after);
      if (fault) errors.push(`${field.label} : ${fault}.`);
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    if (field.kind === 'phone') {
      const shown = formatPhone(row[field.key]);
      if (String(input ?? '') === shown) return; // laissé tel quel, même s'il n'est pas à la française
      const typed = cleanText(input);
      const before = frenchPhoneDigits(shown) || '';
      const after = typed === '' ? '' : frenchPhoneDigits(typed);
      if (after === null) errors.push(`${field.label} : un numéro français à 10 chiffres est attendu (05 56 78 90 12).`);
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    const options = optionsOf(field.category, referenceMaps);

    // Un brouillon d'un autre type que prévu est une erreur, jamais « aucune valeur » :
    // une saisie illisible ne doit pas retirer un rôle ou vider une liste.
    if (field.kind === 'reference') {
      if (!Number.isSafeInteger(input) || input < 0) {
        errors.push(`${field.label} : valeur illisible.`);
        return;
      }
      const before = refId(row[field.key]) || 0;
      const after = input;
      if (after !== 0 && !options.some(option => option.id === after)) {
        errors.push(`${field.label} : valeur inconnue.`);
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
      errors.push(`${field.label} : valeur illisible.`);
      return;
    }
    const wanted = input;
    if (wanted.some(id => !options.some(option => option.id === id))) {
      errors.push(`${field.label} : valeur inconnue.`);
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
    errors.push('Indiquez au moins un prénom ou un nom.');
  }
  return { champs, errors, summary: summarizeChanges(champs) };
}

const quoted = value => (value === '' ? '(vide)' : `« ${value} »`);
const labelsList = (entries, sign) => entries.map(entry => `${sign}${entry.label || `n° ${entry.id}`}`);

// Une ligne par champ modifié, lisible telle quelle dans Grist :
// « Fonction : « Pharmacienne » → « Cheffe de service » ; Compétences : +Hématologie, −Oncologie ».
export function summarizeChanges(champs) {
  return PROFILE_FIELDS.filter(field => champs[field.key]).map(field => {
    const change = champs[field.key];
    if (field.kind === 'list') {
      return `${field.label} : ${[...labelsList(change.ajout, '+'), ...labelsList(change.retrait, '−')].join(', ')}`;
    }
    if (field.kind === 'reference') return `${field.label} : ${quoted(change.avant.label)} → ${quoted(change.apres.label)}`;
    return `${field.label} : ${quoted(change.avant)} → ${quoted(change.apres)}`;
  }).join(' ; ');
}
