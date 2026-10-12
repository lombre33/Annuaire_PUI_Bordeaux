// Présence d'une personne dans l'annuaire : ce qu'on lui dit de sa situation et
// l'écriture de son choix (la case Accepte_apparaitre de sa ligne de BDD). Aucun
// accès au DOM ici.
//
// `persons` : les lignes de BDD qui portent l'adresse de la personne connectée
// (people.findByEmail). Il n'y en a normalement qu'une ; s'il y en a plusieurs, le
// choix s'applique à toutes, pour qu'un retrait vaille partout.

import { CONSENT_COLUMN, MAIN_TABLE } from './constants.js';

// Ce qui retient hors de l'annuaire une fiche acceptée, dit à la personne concernée
// (« votre fiche ») ou à un administrateur qui relit une autre fiche (« la fiche »).
const VOICES = {
  own: { fiche: 'votre fiche', etablissement: 'votre établissement' },
  admin: { fiche: 'la fiche', etablissement: 'son établissement' }
};

function etablissementReasons({ fiche, etablissement }) {
  return {
    missing: `${fiche} n'a pas d'établissement`,
    unknown: `${etablissement} n'est pas reconnu`,
    not_validated: `${etablissement} n'a pas encore été validé`,
    not_eligible: `${etablissement} n'est ni fondateur ni partenaire`
  };
}

function hiddenReasons(statuses, voice = VOICES.own) {
  const etablissements = etablissementReasons(voice);
  const reasons = statuses.flatMap(status => [
    !status.named && `${voice.fiche} n'a ni prénom ni nom`,
    !status.inScope && `${voice.fiche} n'a pas de périmètre`,
    etablissements[status.etablissement]
  ]).filter(Boolean);
  return [...new Set(reasons)];
}

// Situation de la personne : { accepted, visible, tone, message }.
//   accepted  la case est cochée sur toutes ses lignes (état de l'interrupteur)
//   visible   au moins une de ses fiches figure dans l'annuaire
//   tone      'ok' (elle apparaît), 'off' (elle a choisi de ne pas apparaître),
//             'warn' (elle a accepté mais reste masquée, ou en partie seulement)
export function describePresence(persons) {
  const statuses = persons.map(person => person.status);
  const accepted = statuses.every(status => status.accepted);
  const visible = statuses.some(status => status.visible);
  const several = persons.length > 1
    ? ` ${persons.length} fiches portent votre adresse : votre choix s'applique à toutes.`
    : '';

  if (!accepted) {
    const partly = statuses.some(status => status.accepted);
    return partly
      ? { accepted, visible, tone: 'warn', message: `Vous n'avez accepté d'apparaître que sur une partie de vos fiches.${several}` }
      : { accepted, visible, tone: 'off', message: `Vous n'apparaissez pas dans l'annuaire.${several}` };
  }
  if (visible) {
    const partnerOnly = statuses.filter(status => status.visible).every(status => status.partnerOnly);
    const where = partnerOnly ? ' (visible avec l\'interrupteur « Partenaires »)' : '';
    return { accepted, visible, tone: 'ok', message: `Vous apparaissez dans l'annuaire${where}.${several}` };
  }
  const reasons = hiddenReasons(statuses);
  const why = reasons.length ? ` : ${reasons.join(' ; ')}` : '';
  return {
    accepted,
    visible,
    tone: 'warn',
    message: `Vous avez accepté d'apparaître, mais votre fiche reste masquée${why}. Contactez un administrateur.${several}`
  };
}

// Ce que le bandeau dit à une personne connectée dont l'adresse ne figure dans aucune
// ligne de BDD : il n'y a pas de fiche à modifier. Un administrateur y trouve quand même
// le « mode admin ». Même forme que describePresence, sans interrupteur à montrer
// (`switchable: false`). `emailColumn: false` : BDD n'a pas de colonne « email », le
// widget ne peut retrouver la fiche de personne (une affaire de configuration).
export function describeUnknownAccount({ email, admin, emailColumn = true }) {
  const name = admin ? 'Administrateur' : 'Compte absent de l\'annuaire';
  const view = { name, initials: '?', accepted: false, switchable: false, tone: 'info' };
  if (!emailColumn) {
    return {
      ...view,
      name: admin ? name : 'Fiche introuvable',
      message: 'Le widget ne peut pas retrouver votre fiche : la colonne « email » n\'existe pas dans BDD. Contactez un administrateur.'
    };
  }
  const who = email ? `Connecté avec ${email} : cette adresse ne figure pas dans l'annuaire` : 'Cette adresse ne figure pas dans l\'annuaire';
  return {
    ...view,
    message: admin
      ? `${who}, vous n'avez donc pas de fiche à modifier. Le mode admin vous permet de modifier celles des autres.`
      : `${who}, il n'y a donc pas de fiche à modifier.`
  };
}

// Ce que la relecture d'une modification dit d'une fiche absente de l'annuaire : la
// carte « Après » montre une carte que personne ne verra dans la grille tant que la
// cause demeure. `status` vient de describeVisibility() ; `own` dit si la fiche est celle
// de la personne qui relit. Renvoie '' quand la fiche figure dans l'annuaire.
export function describeHiddenFiche(status, { own }) {
  if (status.visible) return '';
  if (!status.accepted) {
    return own
      ? 'Votre fiche est masquée de l\'annuaire : vous n\'avez pas accepté d\'apparaître (interrupteur « Apparaître dans l\'annuaire » en haut de page).'
      : 'Cette fiche est masquée de l\'annuaire : la personne n\'a pas accepté d\'apparaître.';
  }
  const reasons = hiddenReasons([status], own ? VOICES.own : VOICES.admin);
  const why = reasons.length ? ` : ${reasons.join(' ; ')}` : '';
  return `${own ? 'Votre fiche reste masquée' : 'Cette fiche reste masquée'} de l'annuaire${why}.`;
}

// Erreur d'écriture dont le message est une phrase française destinée à la
// personne ; l'erreur d'origine reste dans `cause` et dans la console.
export class PresenceError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'PresenceError';
  }
}

// Ce que Grist répond à une écriture refusée n'est pas stable d'une version à
// l'autre : on reconnaît les deux causes qui comptent, la règle d'accès ('denied')
// et la colonne à formule ('formula'), et on reste générique pour le reste ('other').
export function classifyWriteError(error) {
  const detail = String(error?.message || error || '');
  if (/access rule|blocked|denied|forbidden|permission|\bACL\b/i.test(detail)) return 'denied';
  if (/formula column/i.test(detail)) return 'formula';
  return 'other';
}

export function explainWriteError(error) {
  const kind = classifyWriteError(error);
  if (kind === 'denied') {
    return 'Grist a refusé la modification : vos droits ne permettent pas de changer cette information. Contactez un administrateur.';
  }
  if (kind === 'formula') {
    return `La colonne ${CONSENT_COLUMN} est une colonne à formule : elle doit être une colonne de données (case à cocher). Voir GRIST_SETUP.md.`;
  }
  return 'La modification n\'a pas pu être enregistrée. Réessayez ; si le problème persiste, le détail est dans la console du navigateur.';
}

// Écrit le choix de la personne sur toutes ses lignes, en une seule action
// atomique : jamais une ligne changée et pas l'autre. Lève une PresenceError.
export async function setPresence(docApi, persons, accepted, { log = console } = {}) {
  if (persons.length === 0) throw new PresenceError('Votre fiche est introuvable : rien n\'a été modifié.');
  const actions = persons.map(({ row }) => ['UpdateRecord', MAIN_TABLE, row.id, { [CONSENT_COLUMN]: accepted }]);
  try {
    await docApi.applyUserActions(actions);
  } catch (error) {
    log.error('[PRESENCE] écriture impossible :', error);
    throw new PresenceError(explainWriteError(error), error);
  }
}
