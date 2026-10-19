// La fiche d'un établissement (1.17.0) : qui peut la modifier, ce que la fenêtre propose, ce que
// le responsable a changé et comment le dire. Rien n'est écrit ici (etablissement-save.js) et il
// n'y a aucun accès au DOM ni à Grist.
//
// Comme pour la fiche d'une personne, ce que le responsable change est un delta : le nom et la
// visibilité (avant, après), le logo (remplacé ou retiré) et les responsables (ajoutés, retirés,
// jamais la liste entière : ce qu'un autre a ajouté entre-temps reste).

import { attachmentIds } from './attachments.js';
import { ACL_COLUMNS, CATEGORIES, ETABLISSEMENT_COLUMNS } from './constants.js';
import { compareLabels, displayName, normalizeEmail, pickLabel, refId, text } from './grist-data.js';
import { cleanText, isEmailAddress, textFault } from './profile.js';

// ===== Qui peut modifier quelle fiche =====

// Renvoie une fonction `identifiant d'établissement → vrai ou faux` pour la personne connectée :
// vrai seulement pour un établissement dont la sonde la dit responsable. Fermé par défaut : sans
// identité fiable (pas de table-sonde, compte Lecteur…), personne ne modifie aucun établissement.
// Un administrateur n'en modifie pas pour autant : le mode admin ne concerne que les fiches de
// personnes.
//
// Ce n'est qu'un verrou d'interface. N'importe qui peut ouvrir la console de son navigateur et
// l'ignorer : seules les règles d'accès de Grist protègent vraiment les données (GRIST_SETUP.md).
export function etablissementRightsFor(identity) {
  if (identity?.status !== 'ready') return () => false;
  const listed = Array.isArray(identity.etablissements) ? identity.etablissements : [];
  const mine = new Set(listed.filter(id => Number.isSafeInteger(id) && id > 0));
  return id => mine.has(id);
}

// ===== L'établissement et ses responsables =====

// Le statut de l'établissement, en lecture seule dans la fenêtre : il vient des cases fondateur,
// partenaire et autres, que seule l'équipe du PUI règle.
export function statusLabel(row) {
  if (row.fondateur === true) return 'Fondateur du PUI';
  if (row.partenaire === true) return 'Partenaire du PUI';
  if (row.autres === true) return 'Structure extérieure au PUI';
  return 'Non précisé';
}

// Une ligne d'Etablissements, telle que la fenêtre la montre : { id, acronym, sigle, name, visible,
// status, logo, logoColumn }. `acronym` repli sur le nom complet quand le sigle manque (comme partout
// dans le widget) ; `sigle` est le sigle seul (vide s'il manque) ; `name` est le nom complet tel que
// Grist le garde (vide s'il l'est) ; `visible` n'est vrai que pour `true` exactement (comme pour la
// visibilité d'une carte) ; `logo` liste les fichiers de la cellule ; `logoColumn` dit si la colonne
// du logo existe (habillage facultatif, GRIST_SETUP.md étape 5).
export function etablissementOf(row) {
  return {
    id: row.id,
    acronym: pickLabel(row, CATEGORIES.etablissement.field),
    sigle: text(row[CATEGORIES.etablissement.field[0]]),
    name: text(row[ETABLISSEMENT_COLUMNS.name]),
    visible: row[ETABLISSEMENT_COLUMNS.visible] === true,
    status: statusLabel(row),
    logo: attachmentIds(row[ETABLISSEMENT_COLUMNS.logo]),
    logoColumn: ETABLISSEMENT_COLUMNS.logo in row
  };
}

// Les responsables de l'établissement `etablissementId`, d'après les lignes d'ACL : une entrée par
// adresse (casse et espaces ignorés), avec les lignes d'ACL qui la portent pour cet établissement.
// `admin` : la ligne donne aussi le droit d'administrateur, qu'il ne faut jamais perdre en la
// supprimant. Une ligne dont l'établissement n'est pas un identifiant de ligne (texte déjà résolu)
// n'est reconnue pour aucun établissement : mieux vaut ne rien lister que supprimer la ligne d'un
// autre.
export function responsablesOf(aclRows, etablissementId) {
  const byEmail = new Map();
  aclRows.forEach(row => {
    if (refId(row[ACL_COLUMNS.etablissement]) !== etablissementId) return;
    const email = normalizeEmail(row[ACL_COLUMNS.email]);
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, { email, rows: [] });
    byEmail.get(email).rows.push({ id: row.id, admin: row[ACL_COLUMNS.admin] === true });
  });
  return [...byEmail.values()];
}

// Les personnes que l'annuaire montre pour l'établissement `etablissementId` (`contacts` : les cartes
// affichables, buildContacts), de quoi proposer des personnes à nommer, dire combien de fiches la
// case « visible dans l'annuaire » décochée ferait disparaître et si la mienne en fait partie.
// Seules les fiches visibles comptent : le nom de quelqu'un qui n'apparaît pas ne se dévoile pas.
// `initialsOf(contact)` : les initiales de la carte. Renvoie { candidates, hidden, includesMe } ;
// `candidates` : [{ email, name, initials }] par ordre alphabétique, une fois par adresse.
export function peopleOfEtablissement(contacts, etablissementId, meEmail, initialsOf) {
  const me = normalizeEmail(meEmail);
  const people = contacts.filter(contact => refId(contact.Etablissement) === etablissementId);
  const byEmail = new Map();
  people.forEach(contact => {
    const email = normalizeEmail(contact.email);
    if (email && isEmailAddress(email) && !byEmail.has(email)) {
      byEmail.set(email, { email, name: displayName(contact), initials: initialsOf(contact) });
    }
  });
  return {
    candidates: [...byEmail.values()].sort((a, b) => compareLabels(a.name, b.name)),
    hidden: people.length,
    includesMe: me !== '' && people.some(contact => normalizeEmail(contact.email) === me)
  };
}

// ===== Le brouillon =====

// Le brouillon que la fenêtre modifie, pris sur l'établissement (etablissementOf) et sur ses
// responsables (responsablesOf) :
//   name          le nom complet, tel qu'on le tape
//   visible       établissement visible dans l'annuaire (ok_pour_apparaitre)
//   logo          { action: 'keep' | 'remove' | 'replace', file } ; `file` : l'image redessinée
//                 (image-prep.js) quand l'action est 'replace'
//   responsables  [{ email, state: 'kept' | 'added' | 'removed' }]
export function draftOfEtablissement(etablissement, responsables) {
  return {
    name: etablissement.name,
    visible: etablissement.visible,
    logo: { action: 'keep' },
    responsables: responsables.map(({ email }) => ({ email, state: 'kept' }))
  };
}

const keptOf = draft => draft.responsables.filter(item => item.state !== 'removed');

// Le brouillon ramené sur la liste des responsables telle que Grist la contient maintenant (la fiche a
// changé pendant que la fenêtre était ouverte) : ce que la personne a retiré reste retiré pour ceux qui
// sont encore là ; une adresse qu'un autre a déjà nommée n'est plus « ajoutée » ; une adresse que
// personne ne porte plus disparaît. Le nom, la visibilité et le logo saisis ne bougent pas.
export function rebaseDraft(draft, responsables) {
  const byEmail = new Map(draft.responsables.map(item => [item.email, item]));
  const present = new Set(responsables.map(({ email }) => email));
  const kept = responsables.map(({ email }) => ({ email, state: byEmail.get(email)?.state === 'removed' ? 'removed' : 'kept' }));
  const added = draft.responsables.filter(item => item.state === 'added' && !present.has(item.email));
  return { ...draft, responsables: [...kept, ...added] };
}

// « Retirer » : une adresse ajoutée dans ce brouillon disparaît ; une adresse présente est marquée
// retirée. « Rétablir » : l'inverse. L'adresse est celle que la liste montre.
export function toggleResponsable(draft, email) {
  const at = draft.responsables.findIndex(item => item.email === email);
  if (at < 0) return;
  const item = draft.responsables[at];
  if (item.state === 'added') draft.responsables.splice(at, 1);
  else item.state = item.state === 'removed' ? 'kept' : 'removed';
}

// « Nommer » : ajoute au brouillon un responsable, une adresse saisie ou celle d'une personne
// choisie. Renvoie la phrase qui dit pourquoi elle est refusée, ou '' quand elle est ajoutée
// (ou rétablie, si elle venait d'être retirée).
export function nominate(draft, input) {
  const typed = cleanText(input);
  if (typed === '') return 'Choisissez une personne ou saisissez une adresse e-mail.';
  const email = typed.toLowerCase();
  if (!isEmailAddress(email) || textFault(email)) return 'Indiquez une adresse e-mail valide.';
  const known = draft.responsables.find(item => item.email === email);
  if (known && known.state !== 'removed') return 'Cette personne est déjà responsable.';
  if (known) known.state = 'kept';
  else draft.responsables.push({ email, state: 'added' });
  return '';
}

// ===== Ce qui change =====

export const NAME_REQUIRED = 'Indiquez le nom complet de l’établissement.';
export const KEEP_ONE = 'Un établissement doit garder au moins un responsable.';

// Le logo : { action } si la personne le remplace (par un fichier) ou le retire (alors qu'il y en a un), sinon null.
function diffLogo(before, draft) {
  const action = draft.logo?.action;
  if (action === 'replace' && draft.logo.file) return { action: 'replace' };
  if (action === 'remove' && before.logo.length > 0) return { action: 'remove' };
  return null;
}

// Le nom : { change: { avant, apres } } s'il change, { error } s'il est refusé, {} sinon. Un nom laissé tel quel n'est
// pas un changement, même s'il ne serait pas accepté tapé aujourd'hui.
function diffName(before, draft) {
  const typed = String(draft.name ?? '');
  const name = cleanText(typed);
  if (typed === before.name || name === before.name) return {};
  const fault = textFault(name);
  if (name === '') return { error: NAME_REQUIRED };
  if (fault) return { error: `${fault.charAt(0).toUpperCase()}${fault.slice(1)}.` };
  return { change: { avant: before.name, apres: name } };
}

const diffVisible = (before, draft) => (typeof draft.visible === 'boolean' && draft.visible !== before.visible
  ? { avant: before.visible, apres: draft.visible }
  : null);

// Les responsables : { change: { ajout, retrait } } (des adresses) s'il y en a, { error } si la liste n'en garderait
// aucun. La règle protège contre le retrait du dernier responsable ; elle ne reproche pas à la personne une liste
// qu'elle n'a pas touchée.
function diffResponsables(draft) {
  const ajout = draft.responsables.filter(item => item.state === 'added').map(item => item.email);
  const retrait = draft.responsables.filter(item => item.state === 'removed').map(item => item.email);
  return {
    change: ajout.length + retrait.length > 0 ? { ajout, retrait } : null,
    error: retrait.length > 0 && keptOf(draft).length === 0 ? KEEP_ONE : null
  };
}

const LABELS = { logo: 'logo', name: 'nom', visible: 'visibilité', responsables: 'responsables' };

// Compare le brouillon à l'établissement tel que la fenêtre l'a montré. `before` : { name, visible,
// logo } d'etablissementOf et `responsables` les adresses de départ ; `readable` : la liste des
// responsables a pu être lue (sinon elle n'est ni montrée ni modifiée). Renvoie { champs, labels,
// errors, fieldErrors } :
//   champs       ne contient que ce qui change : name et visible { avant, apres }, logo { action }
//                (replace ou remove), responsables { ajout, retrait } (des adresses)
//   labels       les mots du résumé (logo, nom, visibilité, responsables), dans l'ordre de la fenêtre
//   errors       pourquoi le brouillon est refusé (une phrase par défaut)
//   fieldErrors  la même chose champ par champ : name, responsables
export function diffEtablissement(before, draft, { readable = true } = {}) {
  const champs = {};
  const fieldErrors = {};

  const logo = diffLogo(before, draft);
  if (logo) champs.logo = logo;
  const name = diffName(before, draft);
  if (name.error) fieldErrors.name = name.error;
  else if (name.change) champs.name = name.change;
  const visible = diffVisible(before, draft);
  if (visible) champs.visible = visible;
  if (readable) {
    const responsables = diffResponsables(draft);
    if (responsables.change) champs.responsables = responsables.change;
    if (responsables.error) fieldErrors.responsables = responsables.error;
  }

  const labels = Object.keys(LABELS).filter(key => champs[key]).map(key => LABELS[key]);
  const errors = [fieldErrors.name, fieldErrors.responsables].filter(Boolean);
  return { champs, labels, errors, fieldErrors };
}

// Le résumé du pied de fenêtre : le premier problème (sans point final), sinon ce qui change.
export function summaryOf({ errors, fieldErrors, labels }) {
  if (fieldErrors.name) return fieldErrors.name === NAME_REQUIRED ? NAME_REQUIRED.replace(/\.$/, '') : 'Corrigez le nom';
  if (fieldErrors.responsables) return 'Gardez au moins un responsable';
  if (errors.length > 0) return 'Corrigez les champs signalés';
  if (labels.length === 0) return 'Aucune modification';
  return `${labels.length} modification${labels.length > 1 ? 's' : ''} : ${labels.join(', ')}`;
}

// ===== Ce que la fenêtre dit =====

// Sous la case « visible dans l'annuaire » décochée : ce qui va arriver aux fiches. `wasVisible` :
// l'établissement l'est aujourd'hui ; `hidden` : le nombre de fiches qui disparaîtront (celles qui
// figurent dans l'annuaire) ; `includesMe` : la fiche de la personne en fait partie.
export function visibilityWarning({ wasVisible, hidden, includesMe }) {
  if (!wasVisible) return 'Cet établissement est masqué de l’annuaire : aucune de ses fiches n’y apparaît.';
  if (hidden === 0) return 'Cet établissement n’apparaîtra plus dans l’annuaire.';
  const who = hidden === 1 ? 'La fiche de cet établissement sera masquée' : `Les ${hidden} fiches de cet établissement seront masquées`;
  return `${who} de l’annuaire${includesMe ? ', y compris la vôtre' : ''}.`;
}
