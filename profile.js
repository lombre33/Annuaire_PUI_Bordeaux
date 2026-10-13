// Modifier une fiche : qui peut le faire, ce que le formulaire propose, ce que la
// personne a changé et comment le dire. Rien n'est écrit ici (l'enregistrement est
// dans profile-save.js) et il n'y a aucun accès au DOM ni à Grist.
//
// Ce que la personne change est un delta, pas une copie de la fiche : pour une liste,
// les valeurs à ajouter et à retirer ; pour le reste, l'ancienne et la nouvelle valeur.
// Ainsi une valeur que le formulaire ne montre pas (une ligne de référence sans
// libellé) n'est jamais perdue, et ce qu'un autre a changé entre-temps non plus.

import { avatarIdOf } from './attachments.js';
import { CATEGORIES, PROFILE_FIELDS, fieldsFor } from './constants.js';
import { compareLabels, formatPhone, normalize, normalizeEmail, refId, safeValues, text } from './grist-data.js';

export const MAX_TEXT_LENGTH = 200;

// Ce que dit le formulaire d'une fiche qui n'aurait ni prénom ni nom : le champ et le
// résumé du pied de fenêtre le reconnaissent à cette phrase.
export const NAME_REQUIRED = 'Indiquez au moins un prénom ou un nom.';

// Ce que dit le formulaire de création quand la personne n'a pas choisi son établissement.
export const ETABLISSEMENT_REQUIRED = 'Choisissez votre établissement.';

// Un texte qui commence par l'un de ces caractères serait lu comme une formule par
// un tableur qui ouvre un export de l'annuaire.
const SPREADSHEET_FORMULA_START = /^[=+\-@]/;

// Une adresse e-mail simple : quelque chose, une arobase, un domaine avec un point. Sans
// espace, virgule, point-virgule, guillemet, parenthèse, chevron, « ? », « # », « & » ni
// « % » : ce qu'un lien « mailto: » ne saurait pas porter (voir mailtoHref).
const EMAIL_SHAPE = /^[^\s@,;:<>()"\\?#&%]+@[^\s@,;:<>()"\\?#&%]+\.[^\s@,;:<>()"\\?#&%.]{2,}$/;

// Vrai si `value` (déjà nettoyé, en minuscules) a la forme d'une adresse e-mail simple.
export const isEmailAddress = value => EMAIL_SHAPE.test(value);

// Vrai pour une photo que le formulaire vient de préparer (image-prep.js) : { blob, name, ... } avec un
// fichier non vide. Le brouillon d'une photo vaut cet objet (nouvelle photo), 0 (la retirer) ou
// l'identifiant de la photo actuelle (rien ne change).
const isPreparedImage = value => Boolean(value) && typeof value === 'object' && Number.isFinite(value.blob?.size) && value.blob.size > 0;

// ===== Qui peut modifier quelle fiche =====

// Renvoie une fonction `row → droit` pour la personne connectée : 'own' (c'est sa
// fiche : celle dont l'adresse est la sienne), 'admin' (celle d'une autre, qu'une
// administratrice peut modifier) ou null. Fermé par défaut : sans identité fiable
// (pas de table-sonde, compte Lecteur…), personne ne peut rien modifier.
//
// Un administrateur n'a le droit 'admin' que lorsqu'il a allumé le « mode admin »
// (`adminMode`) : sans lui, il se comporte comme tout le monde et ne voit « Modifier »
// que sur sa propre fiche.
//
// Ce n'est qu'un verrou d'interface. N'importe qui peut ouvrir la console de son
// navigateur et l'ignorer : seules les règles d'accès de Grist protègent vraiment
// les données (GRIST_SETUP.md).
export function rightsFor(identity, { adminMode = false } = {}) {
  if (identity?.status !== 'ready') return () => null;
  const mine = normalizeEmail(identity.email);
  const admin = identity.admin === true && adminMode === true;
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

// Une phrase de message commence par une majuscule : elle s'affiche seule sous le champ.
const sentence = text => text.charAt(0).toUpperCase() + text.slice(1);

// Pourquoi une adresse e-mail (déjà nettoyée et mise en minuscules) est refusée, ou ''.
// `before` : l'adresse actuelle de la fiche ; `emailTaken(adresse)` dit si une AUTRE fiche
// porte déjà cette adresse (c'est elle qui retrouve la personne : deux fiches ne la partagent
// pas). Il renvoie vrai, ou le nom de la personne quand la fiche est visible dans l'annuaire
// (un nom qu'on voit déjà ne dévoile rien ; celui d'une fiche masquée, si).
function emailFault(after, before, emailTaken) {
  if (after === '') return before === '' ? '' : 'Indiquez une adresse e-mail valide.';
  const fault = textFault(after);
  if (fault) return `${sentence(fault)}.`;
  if (!EMAIL_SHAPE.test(after)) return 'Indiquez une adresse e-mail valide.';
  const owner = after !== before && emailTaken(after);
  if (owner) return `Cette adresse est déjà utilisée par ${typeof owner === 'string' ? owner : 'une autre fiche'}.`;
  return '';
}

// Pourquoi l'adresse que la carte affiche (facultative : `email_affiche`) est refusée, ou ''. Elle peut
// être vidée (la carte montre alors l'adresse du compte) et plusieurs fiches peuvent la porter (une
// boîte de service) : seule sa forme compte, contrairement à l'adresse du compte.
function shownEmailFault(after) {
  if (after === '') return '';
  const fault = textFault(after);
  if (fault) return `${sentence(fault)}.`;
  return EMAIL_SHAPE.test(after) ? '' : 'Indiquez une adresse e-mail valide.';
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

// ===== Une fiche qui n'existe pas encore =====

const BLANK_CELL = { text: '', email: '', phone: '', reference: 0 };

// La fiche vide d'une personne qui n'en a pas : une cellule vide, de la forme qu'elle a dans Grist,
// pour chaque colonne de BDD (`columns`) que le formulaire sait remplir à la création (pas la photo :
// elle s'ajoute ensuite), et l'adresse de son compte (`email`). Le formulaire et la comparaison la
// traitent comme n'importe quelle fiche.
export function blankFiche(columns, email = '') {
  const row = { id: 0 };
  PROFILE_FIELDS.filter(field => columns.includes(field.key) && field.afterCreation !== true).forEach(field => {
    row[field.key] = field.kind === 'list' ? ['L'] : BLANK_CELL[field.kind];
  });
  return { ...row, email };
}

// ===== Le formulaire =====

// La catégorie qui regroupe celle-ci (les domaines regroupent les compétences), ou null.
const groupingOf = category => Object.entries(CATEGORIES).find(([, other]) => other.groups === category) || null;

// Les valeurs qu'une table de référence propose : [{ id, label }] triées. Quand un
// regroupement est connu (les domaines des compétences), chaque valeur porte aussi son
// `group` et les valeurs sont rangées groupe par groupe, le groupe de repli (« Autres »)
// en dernier : le formulaire peut les présenter par domaine sans rien recalculer.
// `merge` : une seule entrée par libellé (voir mergeSameLabels), pour les listes.
export function optionsOf(category, referenceMaps, { merge = false } = {}) {
  const grouping = groupingOf(category);
  const groups = grouping ? referenceMaps[grouping[0]] || {} : {};
  const grouped = Object.keys(groups).length > 0;
  const fallback = grouping?.[1].fallback;
  const rank = group => (group === fallback ? 1 : 0);
  const options = Object.entries(referenceMaps[category] || {})
    .map(([id, label]) => ({ id: Number(id), label, ...(grouped && { group: groups[id] || fallback }) }));
  return (merge ? mergeSameLabels(options) : options)
    .sort((a, b) => (grouped
      ? rank(a.group) - rank(b.group) || compareLabels(a.group, b.group) || compareLabels(a.label, b.label)
      : compareLabels(a.label, b.label)));
}

// Une seule entrée par libellé, à la casse et aux accents près et dans un même groupe : plusieurs
// lignes de la table liée peuvent se lire pareil (des lignes brutes que la colonne « corrigé » ramène
// au même libellé), et proposées telles quelles, la même tâche s'afficherait plusieurs fois. L'entrée
// garde le plus petit identifiant ; `ids` les nomme tous quand il y en a plusieurs : cocher ou décocher
// l'entrée vaut pour toutes ces lignes (voir knownIds, diffProfile et buildRowUpdate).
function mergeSameLabels(options) {
  const merged = new Map();
  [...options].sort((a, b) => a.id - b.id).forEach(option => {
    const key = `${normalize(option.group)}|${normalize(option.label)}`;
    const entry = merged.get(key);
    if (!entry) merged.set(key, { ...option });
    else entry.ids = [...(entry.ids || [entry.id]), option.id];
  });
  return [...merged.values()];
}

// Identifiant d'une ligne de la table liée → identifiant de l'entrée qui la porte (le même, sauf
// pour une ligne qui se lit comme une autre : voir mergeSameLabels).
const entryOfRow = options => new Map(options.flatMap(option => (option.ids || [option.id]).map(id => [id, option.id])));

// La table de libellés d'un champ de référence ou de liste : les noms complets quand le champ
// en propose (`labelsFrom`) et que Grist en a donné, sinon ceux de sa catégorie.
function labelsKey(field, referenceMaps) {
  const names = field.labelsFrom;
  return names && Object.keys(referenceMaps[names] || {}).length > 0 ? names : field.category;
}

// Identifiants (ceux des entrées de `options`) des valeurs d'une cellule ReferenceList que le
// formulaire peut montrer. Une ligne qui se lit comme une autre compte pour son entrée.
function knownIds(cell, options) {
  const entryOf = entryOfRow(options);
  return [...new Set(safeValues(cell).filter(item => typeof item === 'number' && entryOf.has(item)).map(item => entryOf.get(item)))];
}

// Les établissements qu'une fiche peut choisir : ceux que la table Etablissements marque fondateur ou partenaire,
// jamais une structure « autres » (ni l'un ni l'autre), et celui que la fiche porte déjà, pour que la liste le
// montre même s'il n'en est pas. Sans les indicateurs des établissements (`etabFlags`), rien n'est écarté.
function choosableEtablissements(options, row, etabFlags) {
  if (!etabFlags?.byId) return options;
  const current = refId(row.Etablissement);
  return options.filter(option => {
    const flags = etabFlags.byId[String(option.id)];
    return option.id === current || flags?.fondateur === true || flags?.partenaire === true;
  });
}

// Le formulaire de modification d'une fiche : un champ par PROFILE_FIELDS, avec la
// valeur actuelle de la fiche (`value`) et, pour une référence ou une liste, sa
// `category` et les valeurs proposées (`options`). `admin` : un administrateur modifie la
// fiche d'une autre personne, et change aussi son e-mail et son établissement. `creating` : la
// personne crée sa fiche (blankFiche) et choisit son établissement. `etabFlags` : les indicateurs des
// établissements (etablissementFlagsFromRows), qui restreignent la liste des établissements.
export function profileFormModel(row, referenceMaps, { admin = false, creating = false, etabFlags = null } = {}) {
  // Une colonne facultative absente de BDD n'est pas proposée (rien à modifier).
  return fieldsFor(admin, creating).filter(field => field.key in row).map(field => {
    const base = {
      key: field.key, label: field.label, kind: field.kind,
      ...(field.category && { category: field.category }), ...(field.required && { required: true }),
      ...(field.optional && { optional: true })
    };
    if (field.kind === 'text' || field.kind === 'email') return { ...base, value: text(row[field.key]) };
    if (field.kind === 'image') return { ...base, value: avatarIdOf(row[field.key]) };
    if (field.kind === 'phone') return { ...base, value: formatPhone(row[field.key]) };
    const options = optionsOf(labelsKey(field, referenceMaps), referenceMaps, { merge: field.kind === 'list' });
    if (field.kind === 'reference') {
      const choices = field.category === 'etablissement' ? choosableEtablissements(options, row, etabFlags) : options;
      return { ...base, options: choices, value: refId(row[field.key]) || 0 };
    }
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

// Une valeur d'une liste, telle que `champs` la garde : son identifiant, son libellé et, pour une entrée
// qui en réunit plusieurs, les identifiants de toutes ses lignes.
function listEntry(options, id) {
  const option = options.find(candidate => candidate.id === id);
  return { id, label: option?.label || '', ...(option?.ids && { ids: option.ids }) };
}

function sameSet(a, b) {
  return a.length === b.length && a.every(item => b.includes(item));
}

// Compare le brouillon de la personne à sa fiche. `draft` : { colonne → valeur } ;
// une colonne absente n'est pas touchée. Un texte et un numéro sont des chaînes,
// une référence est un identifiant entier (0 : aucune), une liste un tableau
// d'identifiants entiers, une photo l'identifiant actuel (rien ne change), 0 (la retirer)
// ou l'image préparée par image-prep.js (la remplacer) ; tout autre type est refusé. Renvoie { champs, errors,
// fieldErrors } : `champs` ne contient que ce qui change (voir rebaseChanges et
// buildRowUpdate pour son usage) ; `errors` dit pourquoi le brouillon est refusé (une
// phrase par défaut), `fieldErrors` la même chose champ par champ (colonne → message),
// pour l'afficher sous le champ.
//   admin        un administrateur modifie la fiche d'une autre personne : l'e-mail et
//                l'établissement du brouillon comptent. Sinon ils sont ignorés, quoi que
//                le brouillon contienne.
//   creating     la personne remplit sa fiche (`row` : blankFiche) : l'établissement compte,
//                et, dès qu'elle a rempli quelque chose, il faut un nom et un établissement
//   emailTaken   adresse → vrai (ou le nom de la personne) si une AUTRE fiche la porte déjà
export function diffProfile(row, draft, referenceMaps, { admin = false, creating = false, emailTaken = () => false } = {}) {
  const champs = {};
  const errors = [];
  const fieldErrors = {};
  const fail = (field, message) => {
    errors.push(`${field.label} : ${message}`);
    fieldErrors[field.key] = message;
  };

  const fields = fieldsFor(admin, creating);
  fields.forEach(field => {
    if (!(field.key in draft) || !(field.key in row)) return;
    const input = draft[field.key];

    // La photo : l'identifiant actuel (ou 0 sans photo) ne change rien ; 0 la retire ; un objet
    // préparé par image-prep.js la remplace (le fichier part à l'enregistrement, voir profile-save.js).
    if (field.kind === 'image') {
      const before = avatarIdOf(row[field.key]);
      if (input === before || (input === 0 && before === 0)) return;
      if (input === 0) champs[field.key] = { action: 'remove', avant: before };
      else if (isPreparedImage(input)) champs[field.key] = { action: 'replace', avant: before };
      else fail(field, 'Valeur illisible.');
      return;
    }

    if (field.kind === 'email') {
      const before = text(row[field.key]);
      if (String(input ?? '') === before) return; // laissée telle quelle : pas un changement
      const after = cleanText(input).toLowerCase();
      const fault = field.optional ? shownEmailFault(after) : emailFault(after, before, emailTaken);
      if (fault) fail(field, fault);
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    if (field.kind === 'text') {
      const before = text(row[field.key]);
      if (String(input ?? '') === before) return; // laissé tel quel : pas un changement, même si le texte n'est pas « propre »
      const after = cleanText(input);
      const fault = textFault(after);
      if (fault) fail(field, `${sentence(fault)}.`);
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    if (field.kind === 'phone') {
      const shown = formatPhone(row[field.key]);
      if (String(input ?? '') === shown) return; // laissé tel quel, même s'il n'est pas à la française
      const typed = cleanText(input);
      const before = frenchPhoneDigits(shown) || '';
      const after = typed === '' ? '' : frenchPhoneDigits(typed);
      if (after === null) fail(field, 'Un numéro français compte 10 chiffres, par exemple 05 56 78 90 12.');
      else if (after !== before) champs[field.key] = { avant: before, apres: after };
      return;
    }

    const options = optionsOf(labelsKey(field, referenceMaps), referenceMaps, { merge: field.kind === 'list' });

    // Un brouillon d'un autre type que prévu est une erreur, jamais « aucune valeur » :
    // une saisie illisible ne doit pas retirer un rôle ou vider une liste.
    if (field.kind === 'reference') {
      if (!Number.isSafeInteger(input) || input < 0) {
        fail(field, 'Valeur illisible.');
        return;
      }
      const before = refId(row[field.key]) || 0;
      const after = input;
      if (after !== 0 && !options.some(option => option.id === after)) {
        fail(field, 'Valeur inconnue.');
      } else if (after === 0 && field.required && before !== 0) {
        fail(field, 'Une valeur est requise.');
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
      fail(field, 'Valeur illisible.');
      return;
    }
    const entryOf = entryOfRow(options);
    if (input.some(id => !entryOf.has(id))) {
      fail(field, 'Valeur inconnue.');
      return;
    }
    const wanted = [...new Set(input.map(id => entryOf.get(id)))];
    const current = knownIds(row[field.key], options);
    if (sameSet(current, wanted)) return;
    champs[field.key] = {
      ajout: wanted.filter(id => !current.includes(id)).map(id => listEntry(options, id)),
      retrait: current.filter(id => !wanted.includes(id)).map(id => listEntry(options, id))
    };
  });

  // Une fiche qu'on crée ne se juge qu'une fois commencée : le formulaire vide ne réclame rien.
  const started = creating && Object.keys(champs).length > 0;
  const name = field => (champs[field] ? champs[field].apres : text(row[field]));
  if ((started || 'nom' in champs || 'prenom' in champs) && !name('nom') && !name('prenom')) {
    errors.push(NAME_REQUIRED);
    ['prenom', 'nom'].filter(key => started || key in champs).forEach(key => { fieldErrors[key] = NAME_REQUIRED; });
  }
  const etablissement = fields.find(field => field.key === 'Etablissement');
  if (started && etablissement && 'Etablissement' in row && !champs.Etablissement) fail(etablissement, ETABLISSEMENT_REQUIRED);
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
// `admin` : comme pour diffProfile, l'e-mail et l'établissement ne comptent que pour un
// administrateur qui modifie la fiche d'une autre personne ; sinon ils sont écartés. `creating` :
// l'établissement compte aussi pour la personne qui vient de créer sa fiche.
export function rebaseChanges(champs, row, referenceMaps, { admin = false, creating = false } = {}) {
  const rebased = {};
  const moved = [];
  fieldsFor(admin, creating).filter(field => champs[field.key]).forEach(field => {
    const change = champs[field.key];

    // La photo : retirer une photo déjà absente ne change rien ; sinon l'action reste, calculée à
    // partir de la photo actuelle. Une photo changée dans Grist depuis l'ouverture est signalée.
    if (field.kind === 'image') {
      const current = avatarIdOf(row[field.key]);
      if (change.action === 'remove' && current === 0) return;
      if (current !== change.avant) moved.push(field.label);
      rebased[field.key] = { action: change.action, avant: current };
      return;
    }

    if (field.kind === 'text' || field.kind === 'email') {
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
      const labels = referenceMaps[labelsKey(field, referenceMaps)] || {};
      rebased[field.key] = { avant: { id: current, label: labels[String(current)] || '' }, apres: change.apres };
      return;
    }

    const present = new Set(safeValues(row[field.key]).filter(Number.isSafeInteger));
    const there = entry => (entry.ids || [entry.id]).some(id => present.has(id));
    const ajout = change.ajout.filter(entry => !there(entry));
    const retrait = change.retrait.filter(there);
    if (ajout.length + retrait.length > 0) rebased[field.key] = { ajout, retrait };
  });
  return { champs: rebased, moved };
}

// Une ligne par champ modifié : le champ, ce qu'il valait, ce qu'il vaudra. `champs` a
// la forme de diffProfile(), dans l'ordre du formulaire.
//   texte, téléphone, référence   { key, label, kind, before, after }
//   photo                         { key, label, kind: 'image', before, after } : `before`, l'identifiant de
//                                 la photo actuelle (0 : aucune) ; `after`, 'replace' ou 'remove'
//   liste                         { key, label, kind, added, removed } (des libellés)
export function describeChanges(champs) {
  const label = entry => entry.label || `n° ${entry.id}`;
  return PROFILE_FIELDS.filter(field => champs[field.key]).map(field => {
    const change = champs[field.key];
    const base = { key: field.key, label: field.label, kind: field.kind };
    if (field.kind === 'image') return { ...base, before: change.avant, after: change.action };
    if (field.kind === 'list') return { ...base, added: change.ajout.map(label), removed: change.retrait.map(label) };
    if (field.kind === 'reference') return { ...base, before: change.avant.label, after: change.apres.label };
    if (field.kind === 'phone') return { ...base, before: formatPhone(change.avant), after: formatPhone(change.apres) };
    return { ...base, before: change.avant, after: change.apres };
  });
}
