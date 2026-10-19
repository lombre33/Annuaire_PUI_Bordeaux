// Les deux dernières étapes de la fenêtre de modification d'une fiche : la relecture (la carte avant et la carte après, avec ce qui
// change repéré) et, quand Grist n'a pas tout gardé, l'écran « Fiche enregistrée ». Textes et mise en page suivent la maquette v5.
// DOM seulement : profile-ui.js enchaîne les étapes (`ctx`, l'état de la fenêtre : voir profile-form.js).

import { el, notice } from './dom.js';
import { changeList } from './profile-form.js';

// Ce que la personne voit une fois sa fiche créée : la fenêtre se ferme et ce message le dit. main.js le
// compose d'après ce que Grist a gardé (`result.notice`) ; celui-ci sert à défaut.
const CREATED_NOTICE = 'Votre fiche est créée. Pour apparaître dans l’annuaire, activez l’interrupteur « Apparaître dans l\'annuaire ».';
export const createdNotice = result => result?.notice || CREATED_NOTICE;

// Ce que l'administrateur doit savoir quand il change l'adresse e-mail d'une fiche :
// les droits de la personne (table ACL) ne suivent pas.
const EMAIL_NOTICE = 'L’adresse change dans BDD, pas dans la table ACL : si cette personne est administratrice ou '
  + 'responsable d’un établissement, ses droits restent attachés à son ancienne adresse.';

export const validateLabel = ctx => (ctx.creating ? (ctx.publishes ? 'Publier ma fiche' : 'Créer ma fiche') : 'Valider');

// ===== La relecture =====

export function reviewHeading(ctx) {
  return [
    ctx.creating ? (ctx.publishes ? 'Relire avant de publier' : 'Relire avant de créer') : 'Relire avant de valider',
    ctx.creating
      ? 'Voici votre carte telle qu’elle apparaîtra dans l’annuaire. La fiche est créée tout de suite, sans validation.'
      : `Voici ${ctx.admin ? `la carte de ${ctx.session.person.name}` : 'votre carte'} telle qu’elle est aujourd’hui et telle qu’elle apparaîtra. `
        + 'Les changements sont repérés sur la carte « Après ».'
  ];
}

// Une colonne de la relecture : « Avant » ou « Après », sa légende et la carte.
function previewColumn(tone, label, note, card) {
  const column = el('section', `rv-col rv-col-${tone}`);
  const heading = el('h3', '', label);
  heading.id = `review-${tone}-title`;
  heading.append(el('small', '', note));
  column.setAttribute('aria-labelledby', heading.id);
  column.append(heading, card);
  return column;
}

// Ce que veulent dire les repères de la carte « Après » : un exemple de chacun.
function legend() {
  const box = el('p', 'rv-legend');
  const added = el('span');
  const sampleAdded = el('b', 'lg lg-add', '+ Exemple');
  sampleAdded.setAttribute('aria-hidden', 'true');
  added.append(sampleAdded, ' ajouté ou modifié : contour vert et pastille');
  const gone = el('span');
  const sampleGone = el('b', 'lg lg-del', 'Exemple');
  sampleGone.setAttribute('aria-hidden', 'true');
  gone.append(sampleGone, ' retiré : barré en rouge');
  box.append(added, gone);
  return box;
}

// Les cartes de la relecture. Une fiche qu'on crée n'a pas de carte « avant » : une seule carte, sans repères ni légende, dans
// une fenêtre de largeur ordinaire.
function previewCards(ctx) {
  const { session, review } = ctx;
  const cards = el('div', ctx.creating ? 'rv-cols rv-cols-one' : 'rv-cols');
  if (ctx.creating) {
    cards.append(previewColumn('after', 'Ma fiche', 'telle qu’elle apparaîtra', session.renderCard(review.after, null)));
  } else {
    cards.append(
      previewColumn('before', 'Avant', 'telle qu’elle est aujourd’hui', session.renderCard(review.before, null)),
      previewColumn('after', 'Après', 'telle qu’elle apparaîtra', session.renderCard(review.after, review.marks))
    );
  }
  return cards;
}

// Les avis qui précèdent les cartes : le message de l'étape (une fiche qui a changé pendant la relecture), la fiche absente de
// l'annuaire, l'adresse qu'un administrateur change.
function reviewNotices(ctx, message) {
  const { session, review } = ctx;
  const notices = [];
  if (message) notices.push(notice('pending', message, 'status'));
  const hidden = session.hiddenNotice?.(review) || '';
  if (hidden) notices.push(notice('pending', hidden, 'status'));
  if (ctx.admin && review.lines.some(line => line.key === 'email')) notices.push(notice('pending', EMAIL_NOTICE, 'status'));
  return notices;
}

// Les éléments du corps de la fenêtre à l'étape de la relecture, dans leur ordre. `ctx.ui` repart à neuf, l'appelant l'a vidé.
export function reviewParts(ctx, message) {
  const { ui, review } = ctx;
  ui.alert = el('div', 'dlg-alert');
  const parts = [ui.alert];
  if (!ctx.creating) parts.push(legend());
  parts.push(...reviewNotices(ctx, message));
  const cards = previewCards(ctx);
  const detailTitle = ctx.creating ? 'Ce qui sera enregistré' : 'Détail des changements';
  const detail = el('section', 'recap');
  detail.setAttribute('aria-label', detailTitle);
  detail.append(el('h4', 'recap-title', detailTitle), changeList(ctx, review.lines));
  parts.push(cards, detail);
  return parts;
}

// ===== L'enregistrement avec une réserve =====

export function savedHeading(ctx) {
  const { person } = ctx.session;
  return [
    ctx.creating ? 'Fiche créée' : 'Fiche enregistrée',
    ctx.creating ? 'Votre fiche est dans l’annuaire Grist.' : ctx.admin ? `La fiche de ${person.name} est à jour.` : 'Votre fiche est à jour.'
  ];
}

// Enregistré, mais avec une réserve à lire : Grist n'a pas tout gardé, ou l'annuaire n'a pas pu être rechargé.
export function savedParts(ctx, result) {
  const { person } = ctx.session;
  const done = el('div', 'sent');
  done.append(
    el('div', 'sent-mark', '✓'),
    el('h3', '', ctx.creating ? 'Votre fiche est créée' : ctx.admin ? `La fiche de ${person.name} est enregistrée` : 'Vos modifications sont enregistrées'),
    el('p', '', ctx.creating
      ? (ctx.publishes ? createdNotice(result) : 'Pour apparaître dans l’annuaire, activez l’interrupteur « Apparaître dans l\'annuaire » en haut de page.')
      : 'Elles s\'appliquent tout de suite dans Grist, sans validation.')
  );
  const recap = el('div', 'recap');
  recap.append(el('h4', 'recap-title', ctx.creating ? 'Ce qui a été enregistré' : 'Ce qui a changé'), changeList(ctx, result.lines));
  done.append(recap);
  const parts = [done];
  if (result.leftovers.length > 0) {
    parts.unshift(notice('ko', `Grist n'a pas gardé tout ce qui était demandé (${result.leftovers.join(', ')}). `
      + 'Vérifiez la fiche dans Grist ou contactez un administrateur.', 'alert'));
  }
  if (!result.reloaded) {
    parts.unshift(notice('pending', 'Les modifications sont enregistrées, mais l\'annuaire n\'a pas pu être rechargé. Rechargez la page pour les voir.', 'status'));
  }
  return parts;
}
