// Qui voit l'annuaire (1.45.0, Antoine, 19 novembre 2026 : « les gens ne voient pas l'annuaire tant qu'ils ne sont pas dedans »). Le lien du document
// est public avec accès éditeur : toute personne connectée peut l'ouvrir. Ici, ce que le widget en fait : l'annuaire ne s'affiche qu'à un
// administrateur, à un responsable d'établissement ou à une personne dont une fiche VALIDÉE porte l'adresse. Les autres lisent un écran qui leur dit où elles en sont :
//   pending        leur demande de fiche attend la validation d'un administrateur
//   create         pas de fiche, mais le domaine de leur adresse est celui d'un établissement : elles peuvent la demander
//   denied         pas de fiche, et le domaine de leur adresse n'est celui d'aucun établissement
//   unverifiable   le widget ne lit pas les domaines des établissements : il ne peut pas trancher (fermé par défaut)
//   anonymous      visiteur sans compte (identity.js) : l'annuaire demande la connexion
// C'est un contrôle d'INTERFACE : il ne cache que ce que le widget dessine. Ce que Grist donne au widget, ce sont ses règles d'accès qui le
// décident (GRIST_SETUP.md) : une personne qui n'est pas dans l'annuaire n'y lit aucune ligne de BDD. Un responsable d'établissement (une ligne d'ACL) est
// « dans l'annuaire » comme un administrateur : ses règles d'accès lui donnent la lecture, il n'a pas besoin d'une fiche. Tant que l'identité n'est pas lue, rien
// n'est fermé (l'annuaire ne lui attend pas) ; un compte Lecteur ou sans table-sonde (identity.js) n'est pas jugé : le widget ne le reconnaît pas.
// Sans DOM ni Grist : des fonctions pures.

import { etablissementsForEmail } from './domains.js';

// Les textes de chaque écran : { title, text, count }. `count` remplace le compteur de contacts sous le titre de la page.
const SCREENS = {
  pending: () => ({
    title: 'Votre demande est en attente',
    text: 'Un administrateur doit valider votre fiche avant que vous puissiez consulter l’annuaire. Revenez plus tard et rechargez la page : l’annuaire s’ouvrira dès qu’elle sera validée.',
    count: 'Demande en attente'
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
export function describeGate({ identity, people, etablissementRows }) {
  if (!identity) return OPEN;
  if (identity.status === 'anonymous') return closed('anonymous');
  if (identity.status !== 'ready' || !people) return OPEN;
  if (identity.admin === true || (identity.etablissements?.length ?? 0) > 0 || !people.hasEmailColumn) return OPEN;
  const mine = people.findByEmail(identity.email);
  if (mine.some(person => !person.status.pending)) return OPEN;
  if (mine.length > 0) return closed('pending');
  const { readable, ids, domain } = etablissementsForEmail(identity.email, etablissementRows);
  if (!readable) return closed('unverifiable');
  if (ids.length === 0) return closed('denied', { domain });
  return closed('create', { allowed: ids, domain });
}
