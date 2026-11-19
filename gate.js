// Qui voit l'annuaire (1.45.0, Antoine, 19 novembre 2026 : « les gens ne voient pas l'annuaire tant qu'ils ne sont pas dedans »). Le lien du document
// est public avec accès éditeur : toute personne connectée peut l'ouvrir. Ici, ce que le widget en fait : l'annuaire ne s'affiche qu'à un
// administrateur, à un responsable d'établissement ou à une personne dont une fiche VALIDÉE porte l'adresse. Les autres lisent un écran qui leur dit où elles en sont :
//   checking       l'identité (ou l'annuaire) n'est pas encore lue : rien ne se montre d'ici là (fermé par défaut, 1.45.2)
//   pending        leur demande de fiche attend la validation d'un administrateur
//   create         pas de fiche, mais le domaine de leur adresse est celui d'un établissement : elles peuvent la demander
//   deactivated    leur fiche a été désactivée par le responsable de leur établissement : elles l'ont quitté (1.46.0)
//   denied         pas de fiche, et le domaine de leur adresse n'est celui d'aucun établissement
//   unverifiable   le widget ne lit pas les domaines des établissements : il ne peut pas trancher (fermé par défaut)
//   noemail        BDD n'a pas de colonne « email » lisible pour ce compte : le widget ne retrouve la fiche de personne
//   anonymous      visiteur sans compte (identity.js) : l'annuaire demande la connexion
//   unidentified   le widget n'a pas pu lire qui est connecté (sonde illisible, délai dépassé) : fermé, jamais ouvert à l'aveugle (1.45.2)
//   readonly       cadre en lecture seule : Grist ne dit pas qui est connecté, le widget ne peut pas vérifier l'adresse (1.45.2)
//   unreadable     Grist a refusé au compte la lecture de l'annuaire (règle d'accès, 1.45.2)
//   loadfailed     la lecture de l'annuaire a échoué pour une autre raison (panne, colonne absente) : le bandeau d'état offre « Réessayer » (1.45.2)
// C'est un contrôle d'INTERFACE : il ne cache que ce que le widget dessine. Ce que Grist donne au widget, ce sont ses règles d'accès qui le
// décident (GRIST_SETUP.md) : une personne qui n'est pas dans l'annuaire n'y lit aucune ligne de BDD. Un responsable d'établissement (une ligne d'ACL) est
// « dans l'annuaire » comme un administrateur : ses règles d'accès lui donnent la lecture, il n'a pas besoin d'une fiche.
// Depuis la 1.45.2 l'annuaire est FERMÉ PAR DÉFAUT : un compte que le widget n'a pas identifié (lecture seule, sonde illisible, identité pas encore lue)
// ne le voit pas non plus ; l'écran dit pourquoi, et la console de la personne donne la raison (ligne [IDENTITE]).
// Sans DOM ni Grist : des fonctions pures.

import { etablissementsForEmail } from './domains.js';

// Les textes de chaque écran : { title, text, count }. `count` remplace le compteur de contacts sous le titre de la page.
const SCREENS = {
  pending: () => ({
    title: 'Votre demande est en attente',
    text: 'Un administrateur doit valider votre fiche avant que vous puissiez consulter l’annuaire. Revenez plus tard et rechargez la page : l’annuaire s’ouvrira dès qu’elle sera validée.',
    count: 'Demande en attente'
  }),
  deactivated: () => ({
    title: 'Votre fiche est désactivée',
    text: 'Le responsable de votre établissement a désactivé votre fiche : l’annuaire n’est plus ouvert à votre compte. '
      + 'Si vous pensez que c’est une erreur, contactez le responsable de votre établissement ou un administrateur de l’annuaire.',
    count: 'Fiche désactivée'
  }),
  create: ({ domain }) => ({
    title: 'Vous n’êtes pas encore dans l’annuaire',
    text: `L’annuaire n’est ouvert qu’aux personnes qui y figurent. L’adresse de votre compte (@${domain}) correspond à un établissement du PUI : `
      + 'créez votre fiche. Un administrateur la valide, puis l’annuaire s’ouvre pour vous.',
    count: 'Annuaire réservé'
  }),
  denied: ({ domain }) => ({
    title: 'Annuaire réservé',
    text: `L’annuaire n’est ouvert qu’aux personnes qui y figurent, et l’adresse de votre compte (@${domain}) ne correspond à aucun établissement du PUI. `
      + 'Si vous pensez que c’est une erreur, contactez un administrateur de l’annuaire.',
    count: 'Annuaire réservé'
  }),
  unverifiable: () => ({
    title: 'Vérification impossible',
    text: 'L’annuaire n’est ouvert qu’aux personnes qui y figurent, et le widget ne peut pas lire la liste des établissements et de leurs domaines pour vérifier votre adresse. '
      + 'Contactez un administrateur de l’annuaire.',
    count: 'Annuaire réservé'
  }),
  checking: () => ({
    title: 'Vérification de votre accès',
    text: 'Le widget vérifie que votre compte figure dans l’annuaire. Un instant… Si cet écran reste affiché, rechargez la page ou contactez un administrateur de l’annuaire.',
    count: 'Vérification…'
  }),
  noemail: () => ({
    title: 'Vérification impossible',
    text: 'L’annuaire n’est ouvert qu’aux personnes qui y figurent, et la table BDD n’a pas de colonne « email » lisible pour votre compte : le widget ne peut pas retrouver votre fiche. '
      + 'Contactez un administrateur de l’annuaire.',
    count: 'Annuaire réservé'
  }),
  unidentified: () => ({
    title: 'Compte non reconnu',
    text: 'L’annuaire n’est ouvert qu’aux personnes qui y figurent, et le widget n’a pas pu lire quel est votre compte. '
      + `Rechargez la page ; si cela continue, contactez un administrateur de l’annuaire.`,
    count: 'Annuaire réservé'
  }),
  readonly: () => ({
    title: 'Compte en lecture seule',
    text: 'L’annuaire n’est ouvert qu’aux personnes qui y figurent, et Grist ouvre ce document en lecture seule pour votre compte : le widget ne peut pas lire votre adresse pour la vérifier. '
      + 'Contactez un administrateur de l’annuaire pour obtenir le droit de modifier le document.',
    count: 'Annuaire réservé'
  }),
  unreadable: () => ({
    title: 'Annuaire illisible',
    text: 'Grist n’a pas permis au widget de lire l’annuaire avec votre compte. '
      + `Rechargez la page ; si cela continue, contactez un administrateur de l’annuaire.`,
    count: 'Annuaire réservé'
  }),
  loadfailed: () => ({
    title: 'Annuaire momentanément illisible',
    text: 'Le widget n’a pas pu charger l’annuaire. Utilisez « Réessayer » dans le bandeau d’état ou rechargez la page ; '
      + 'si cela continue, contactez un administrateur de l’annuaire.',
    count: 'Chargement impossible'
  }),
  anonymous: () => ({
    title: 'Annuaire réservé',
    text: 'L’annuaire n’est ouvert qu’aux personnes connectées qui y figurent. Utilisez le bouton « Se connecter » en haut de la page.',
    count: 'Connexion requise'
  })
};

const OPEN = Object.freeze({ open: true });

function closed(kind, details = {}) {
  return { open: false, kind, ...SCREENS[kind](details), ...details };
}

// L'écran que voit la personne : { open: true }, ou { open: false, kind, title, text, count } (et, pour `create`, `allowed` : les identifiants des
// établissements qu'elle peut choisir, `domain` : le domaine de son adresse).
//   identity            ce que readIdentity (identity.js) a rendu, ou null tant qu'il n'est pas lu
//   people              l'index des lignes de BDD (createPeopleIndex), ou null tant que l'annuaire n'est pas lu
//   etablissementRows   les lignes d'Etablissements, avec la colonne des domaines quand elle existe
//   directoryFailed     la lecture de l'annuaire a échoué (le widget n'a donc aucune ligne de BDD)
//   directoryRefused    … parce qu'une règle d'accès la refuse au compte (et non une panne : voir isAccessRefused, identity.js)
export function describeGate({ identity, people, etablissementRows, directoryFailed = false, directoryRefused = false }) {
  if (!identity) return closed('checking');
  if (identity.status === 'anonymous') return closed('anonymous');
  if (identity.status === 'viewer') return closed('readonly');
  if (identity.status !== 'ready') return closed('unidentified');
  if (identity.admin === true || (identity.etablissements?.length ?? 0) > 0) return OPEN;
  if (!people) return closed(directoryFailed ? (directoryRefused ? 'unreadable' : 'loadfailed') : 'checking');
  if (!people.hasEmailColumn) return closed('noemail');
  const mine = people.findByEmail(identity.email);
  if (mine.some(person => !person.status.pending && !person.status.deactivated)) return OPEN;
  if (mine.some(person => person.status.deactivated)) return closed('deactivated');
  if (mine.length > 0) return closed('pending');
  const { readable, ids, domain } = etablissementsForEmail(identity.email, etablissementRows);
  if (!readable) return closed('unverifiable');
  if (ids.length === 0) return closed('denied', { domain });
  return closed('create', { allowed: ids, domain });
}
