// Présence d'une personne dans l'annuaire : ce qu'on lui dit de sa situation et
// l'écriture de son choix (la case Accepte_apparaitre de sa ligne de BDD). Aucun
// accès au DOM ici.
//
// `persons` : les lignes de BDD qui portent l'adresse de la personne connectée
// (people.findByEmail). Il n'y en a normalement qu'une ; s'il y en a plusieurs, le
// choix s'applique à toutes, pour qu'un retrait vaille partout.

import { CONSENT_COLUMN, MAIN_TABLE } from './constants.js';

// Ce qui retient hors de l'annuaire une fiche acceptée, dans les mots de la
// personne concernée.
const ETABLISSEMENT_REASONS = {
  missing: 'votre fiche n\'a pas d\'établissement',
  unknown: 'votre établissement n\'est pas reconnu',
  not_validated: 'votre établissement n\'a pas encore été validé',
  not_eligible: 'votre établissement n\'est ni fondateur ni partenaire'
};

function hiddenReasons(statuses) {
  const reasons = statuses.flatMap(status => [
    !status.named && 'votre fiche n\'a ni prénom ni nom',
    !status.inScope && 'votre fiche n\'a pas de périmètre',
    ETABLISSEMENT_REASONS[status.etablissement]
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
// et la colonne à formule ('formula'), et on reste générique ('other') pour le reste.
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
