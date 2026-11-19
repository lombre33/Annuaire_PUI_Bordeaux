// Le départ d'un·e collègue (1.46.0, Antoine, 19 novembre 2026 : « une personne qui est gestionnaire d'un établissement peut supprimer la fiche d'un·e
// collègue de cet établissement (le départ d'une personne), et migrer ses valeurs vers une autre personne », puis « ça désactive la fiche mais ça ne la
// supprime pas de la BDD, juste plus visible dans le widget »). Depuis la 1.46.1 (« il y avait déjà un booléen pour apparaître, il suffit de le
// désactiver »), le départ DÉCOCHE `Accepte_apparaitre` : aucune colonne de plus. Ici, ce que le responsable lit (ses collègues, les fiches de son
// établissement qui n'apparaissent pas), ce qu'il choisit (qui reprend quelles rubriques) et ce que ce choix changerait : le calcul seul, sans DOM ni
// Grist. L'écriture est dans departure-save.js, la fenêtre dans departure-ui.js.
//
// Le transfert est une COPIE sans doublon : la personne qui reprend reçoit les valeurs qu'elle n'a pas déjà (comparées par libellé, comme le formulaire de
// profil), les siennes restent, et la fiche qui part garde les siennes, de sorte que rien ne se perd et qu'une réactivation la rend telle qu'elle était.

import { DEPARTURE_GROUPS } from './constants.js';
import { automaticRoles, compareLabels, displayName, normalize, normalizeEmail, refId } from './grist-data.js';
import { listEntriesOf } from './profile.js';

// ===== Les personnes =====

// Les collègues de l'établissement `etablissementId` que l'annuaire montre (`contacts` : les cartes affichables, buildContacts), par ordre alphabétique :
// [{ id, name, email, initials, photo, me }]. `id` : l'identifiant de la ligne de BDD (une fiche sans adresse se retrouve par lui) ; `me` : la fiche porte
// l'adresse de la personne connectée (`meEmail`), qu'on ne désactive pas soi-même. Seules les fiches visibles comptent, comme pour les responsables :
// le nom de quelqu'un qui n'apparaît pas ne se dévoile pas. `initialsOf(contact)` : les initiales de la carte ; `photoOf(contact)` : sa photo (0 sans photo).
export function colleaguesOf(contacts, etablissementId, meEmail, { initialsOf, photoOf }) {
  const me = normalizeEmail(meEmail);
  return contacts
    .filter(contact => refId(contact.Etablissement) === etablissementId)
    .map(contact => ({
      id: contact.id,
      name: displayName(contact),
      email: normalizeEmail(contact.email),
      initials: initialsOf(contact),
      photo: photoOf(contact),
      me: me !== '' && normalizeEmail(contact.email) === me
    }))
    .sort((a, b) => compareLabels(a.name, b.name) || a.id - b.id);
}

// Les fiches de l'établissement qui n'apparaissent pas faute d'accord, d'après `people.withoutConsentOf` (grist-data.js) : [{ id, name, email, initials, photo }],
// par ordre alphabétique. Ce sont celles des personnes parties, mais aussi de celles qui n'ont pas (encore) accepté d'apparaître : la case ne dit pas
// pourquoi. Leur nom se montre : seul le responsable de l'établissement (ou un administrateur) les lit, pour en réactiver une.
export function departedOf(entries, { initialsOf, photoOf }) {
  return entries
    .map(({ row, name }) => ({ id: row.id, name: name || 'Sans nom', email: normalizeEmail(row.email), initials: initialsOf(row), photo: photoOf(row) }))
    .sort((a, b) => compareLabels(a.name, b.name) || a.id - b.id);
}

// ===== Ce que le transfert changerait =====

const roleWords = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Les valeurs d'une liste que la fiche porte et qu'un transfert peut recopier. Le rôle « Membre d'une action » et « Responsable d'une action » ne s'écrivent
// jamais : le widget les déduit des actions de la personne (grist-data.js, roleEntries), les recopier n'aurait aucun effet.
function transferable(group, field, row, referenceMaps) {
  const entries = listEntriesOf(field, row, referenceMaps);
  if (group.key !== 'role') return entries;
  const { member, responsible } = automaticRoles(referenceMaps.role);
  const automatic = new Set([roleWords(member), roleWords(responsible)]);
  return entries.filter(entry => !automatic.has(roleWords(entry.label)));
}

const labelsOfEntries = entries => entries.map(entry => entry.label);

// Ce que recopier les rubriques `keys` (des clés de DEPARTURE_GROUPS) de `from` (la fiche qui part) dans `to` (celle qui reprend) ajouterait, rubrique par
// rubrique, sans doublon :
//   groups   [{ key, label, available, before, after, add, already, responsible }] ; `available` : la colonne manque d'une des deux fiches (rien n'est
//            transféré) ; `before` et `after` : combien de valeurs la personne qui reprend a avant et après ; `add` : les libellés ajoutés ; `already` : ceux
//            que `from` a et que `to` a déjà ; `responsible` : les actions dont la responsabilité passe aussi (la colonne « Responsable de »), null sinon
//   champs   les ajouts par colonne de BDD, dans la forme de `champs` de profile.js ({ colonne → { ajout: [entrée], retrait: [] } }) : buildRowUpdate
//            (profile-save.js) en tire les cellules à écrire
//   total    le nombre de valeurs ajoutées, responsabilités comprises
export function transferOf(from, to, keys, referenceMaps) {
  const champs = {};
  let total = 0;
  const groups = DEPARTURE_GROUPS.filter(group => keys.includes(group.key)).map(group => {
    const main = group.fields.find(field => !field.companionOf);
    const available = Boolean(main) && main.key in from && main.key in to;
    const empty = { key: group.key, label: group.label, available, before: 0, after: 0, add: [], already: [], responsible: null };
    if (!available) return empty;
    const had = transferable(group, main, to, referenceMaps);
    const held = new Set(had.map(entry => entry.id));
    const incoming = transferable(group, main, from, referenceMaps);
    const added = incoming.filter(entry => !held.has(entry.id));
    if (added.length > 0) champs[main.key] = { ajout: added, retrait: [] };
    total += added.length;

    // « Responsable de » suit les actions : la responsabilité d'une action ne passe que pour une action que la personne qui reprend aura.
    const companion = group.fields.find(field => field.companionOf);
    let responsible = null;
    if (companion && companion.key in from && companion.key in to) {
      const afterwards = new Set([...held, ...added.map(entry => entry.id)]);
      const alreadyResponsible = new Set(listEntriesOf(companion, to, referenceMaps).map(entry => entry.id));
      const handedOver = listEntriesOf(companion, from, referenceMaps).filter(entry => afterwards.has(entry.id) && !alreadyResponsible.has(entry.id));
      if (handedOver.length > 0) champs[companion.key] = { ajout: handedOver, retrait: [] };
      total += handedOver.length;
      responsible = labelsOfEntries(handedOver);
    }
    return {
      ...empty,
      before: had.length,
      after: had.length + added.length,
      add: labelsOfEntries(added),
      already: labelsOfEntries(incoming.filter(entry => held.has(entry.id))),
      responsible
    };
  });
  return { groups, champs, total };
}
