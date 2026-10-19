// La fenêtre de modification d'une fiche, en deux temps : le formulaire (profile-form.js), puis la relecture (profile-review.js :
// la carte avant et la carte après, avec ce qui change repéré). Valider ferme la fenêtre
// et main.js confirme par un message ; un écran de confirmation ne reste que si Grist n'a
// pas tout gardé. Textes et mise en page suivent la maquette v5.
// DOM seulement : ce qui change (profile.js), ce qui s'écrit (profile-save.js) et les
// cartes (render.js) viennent de la session que main.js donne à open(). Ce fichier tient l'état de la fenêtre et
// enchaîne les étapes ; le cadre commun aux fenêtres (titre, pied, Échap) est dans dialog-shell.js.

import { CONSENT_COLUMN } from './constants.js';
import { button, notice } from './dom.js';
import { createDialogShell } from './dialog-shell.js';
import { buildForm, countLabel, editingHeading, forgetPhoto, refreshForm } from './profile-form.js';
import { createdNotice, reviewHeading, reviewParts, savedHeading, savedParts, validateLabel } from './profile-review.js';

const emptyEvaluation = () => ({ errors: [], fieldErrors: {}, lines: [] });

// L'état de la fenêtre (`ctx`, décrit dans profile-form.js) : rien tant qu'elle est fermée.
function createContext(dialog) {
  const ctx = {
    dialog,
    shell: null,
    session: null,
    generation: 0, // change à chaque ouverture : une réponse tardive d'une session fermée est ignorée
    draft: {},
    phase: 'editing', // 'editing' | 'preparing' | 'reviewing' | 'saving' | 'saved'
    evaluation: emptyEvaluation(),
    review: null,
    preparingPhoto: false,
    ui: {},
    get creating() { return this.session.mode === 'create'; },
    get admin() { return this.session.mode === 'admin'; },
    get publishes() { return this.creating && this.draft[CONSENT_COLUMN] === true; }
  };
  ctx.shell = createDialogShell(dialog, {
    isSaving: () => ctx.phase === 'saving',
    hasUnsaved: () => ctx.session !== null && ctx.phase !== 'saved' && ctx.evaluation.lines.length > 0
  });
  return ctx;
}

const reviewLabel = ctx => (ctx.creating ? 'Relire ma fiche' : ctx.admin ? 'Relire les modifications' : 'Relire mes modifications');

// ===== Étape 1 : le formulaire =====

function renderEditing(ctx) {
  const { dialog, shell } = ctx;
  ctx.phase = 'editing';
  dialog.classList.remove('dlg-review');
  shell.setHeading(...editingHeading(ctx));
  shell.body.replaceChildren(...buildForm(ctx));
  ctx.ui.reviewButton = button(reviewLabel(ctx), 'btn btn-primary', () => startReview(ctx));
  ctx.ui.summary = shell.renderFoot('', button('Annuler', 'btn', shell.close), ctx.ui.reviewButton);
  refreshForm(ctx);
  shell.announceStep();
}

// ===== Étape 2 : la relecture =====

function setPreparing(ctx, preparing) {
  const { reviewButton } = ctx.ui;
  reviewButton.disabled = preparing || reviewButton.disabled;
  reviewButton.textContent = preparing ? 'Préparation…' : reviewLabel(ctx);
  reviewButton.setAttribute('aria-busy', String(preparing));
}

async function startReview(ctx) {
  if (ctx.phase !== 'editing' || ctx.ui.reviewButton.disabled) return;
  const mine = ctx.generation;
  ctx.phase = 'preparing';
  setPreparing(ctx, true);
  ctx.ui.alert.replaceChildren();
  let next;
  try {
    next = await ctx.session.review(ctx.draft);
  } catch (error) {
    if (mine !== ctx.generation) return;
    ctx.phase = 'editing';
    setPreparing(ctx, false);
    refreshForm(ctx);
    ctx.ui.alert.replaceChildren(notice('ko', error?.message || 'La relecture n\'a pas pu être préparée.', 'alert'));
    ctx.shell.body.scrollTop = 0;
    return;
  }
  if (mine !== ctx.generation) return;
  renderReview(ctx, next, next.notice);
}

function renderReview(ctx, next, message = '') {
  const { dialog, shell } = ctx;
  ctx.review = next;
  ctx.phase = 'reviewing';
  dialog.classList.toggle('dlg-review', !ctx.creating);
  shell.setHeading(...reviewHeading(ctx));
  ctx.ui = { fields: {} };
  shell.body.replaceChildren(...reviewParts(ctx, message));
  ctx.ui.back = button('Retour', 'btn', () => backToEditing(ctx));
  ctx.ui.validate = button(validateLabel(ctx), 'btn btn-ok', () => validate(ctx));
  ctx.ui.summary = shell.renderFoot(countLabel(ctx, next.lines.length), ctx.ui.back, ctx.ui.validate);
  shell.announceStep();
}

function backToEditing(ctx) {
  if (ctx.phase !== 'reviewing') return;
  renderEditing(ctx);
}

// ===== Étape 3 : l'enregistrement =====

function setSaving(ctx, saving) {
  const { validate: validateButton, back } = ctx.ui;
  validateButton.textContent = saving ? 'Enregistrement…' : validateLabel(ctx);
  validateButton.setAttribute('aria-busy', String(saving));
  validateButton.disabled = saving;
  back.disabled = saving;
  ctx.shell.lockClose(saving);
}

async function validate(ctx) {
  if (ctx.phase !== 'reviewing') return;
  const mine = ctx.generation;
  ctx.phase = 'saving';
  setSaving(ctx, true);
  ctx.ui.alert.replaceChildren();
  let result;
  try {
    result = await ctx.session.save(ctx.review, ctx.draft);
  } catch (error) {
    if (mine !== ctx.generation) return;
    ctx.phase = 'reviewing';
    setSaving(ctx, false);
    ctx.ui.alert.replaceChildren(notice('ko', error?.message || 'La modification n\'a pas pu être enregistrée.', 'alert'));
    ctx.shell.body.scrollTop = 0;
    return;
  }
  if (mine !== ctx.generation) return;
  ctx.shell.lockClose(false);
  if (result.status === 'changed') renderReview(ctx, result.review, result.notice);
  else if (result.leftovers.length > 0 || !result.reloaded) renderSaved(ctx, result);
  else finish(ctx, result);
}

// Tout est enregistré : la fenêtre se ferme et un message le confirme. Rien ne reste à lire.
function finish(ctx, result) {
  const { person, notify } = ctx.session;
  ctx.phase = 'saved';
  ctx.dialog.close();
  notify?.(ctx.creating ? createdNotice(result) : ctx.admin ? `La fiche de ${person.name} est enregistrée.` : 'Vos modifications sont enregistrées.');
}

// Enregistré, mais avec une réserve à lire : la fenêtre reste ouverte pour la dire.
function renderSaved(ctx, result) {
  const { shell } = ctx;
  ctx.phase = 'saved';
  ctx.dialog.classList.remove('dlg-review');
  shell.setHeading(...savedHeading(ctx));
  shell.body.replaceChildren(...savedParts(ctx, result));
  shell.showActions(button('Fermer', 'btn btn-primary', shell.close));
  shell.announceStep();
}

// ===== Ouverture et fermeture =====

function open(ctx, next) {
  ctx.generation += 1;
  forgetPhoto(ctx);
  ctx.preparingPhoto = false;
  ctx.session = next;
  ctx.draft = Object.fromEntries(Object.entries(next.draft).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
  ctx.shell.disarm();
  renderEditing(ctx);
  if (!ctx.dialog.open) ctx.dialog.showModal();
  ctx.shell.announceStep();
}

function reset(ctx) {
  ctx.generation += 1;
  forgetPhoto(ctx);
  ctx.draft = {};
  ctx.preparingPhoto = false;
  ctx.session = null;
  ctx.review = null;
  ctx.phase = 'editing';
  ctx.dialog.classList.remove('dlg-review');
  ctx.evaluation = emptyEvaluation();
  ctx.shell.reset();
  ctx.ui = {};
}

// `dialog` : le <dialog> de index.html.
//
// open(session) :
//   mode          'own' (sa propre fiche), 'admin' (celle d'une autre personne) ou 'create'
//                 (la personne n'a pas de fiche : elle remplit la sienne, et choisit son établissement)
//   viewerAdmin   la personne connectée est administratrice, même sur sa propre fiche
//   person        { name, email, initials, photo } de la fiche (`photo` : l'identifiant de sa photo
//                 de profil dans Grist, 0 sans photo)
//   etablissement libellé de son établissement
//   renderEtablissement  (facultatif) libellé → l'élément qui montre l'établissement dans le bloc
//                 d'identité (son logo quand Grist en a un) ; sans lui, une pastille avec le nom
//   model         profileFormModel(row, referenceMaps)
//   draft         le brouillon de départ (draftOf). Pour une fiche qu'on crée, il porte aussi la case
//                 Accepte_apparaitre (un booléen, cochée d'avance) : la fenêtre la propose alors, et le
//                 bouton de la dernière étape devient « Publier ma fiche » quand elle est cochée
//   evaluate      draft → { errors, fieldErrors, lines } : ce que le brouillon change et
//                 pourquoi il serait refusé
//   review        draft → promesse de { before, after, marks, lines, visibility, notice } :
//                 relit la fiche dans Grist et prépare les deux cartes ; un échec porte
//                 dans `message` la phrase à montrer
//   hiddenNotice  review → ce que la relecture dit d'une fiche absente de l'annuaire
//                 ('' si elle y figure)
//   fieldWarning  (facultatif) (colonne, valeur) → une mise en garde à lire sous le champ
//                 ('' s'il n'y en a pas)
//   save          (review, draft) → promesse de { status: 'saved', lines, leftovers,
//                 reloaded } ou { status: 'changed', review, notice } (la fiche a changé
//                 pendant la relecture : rien n'est écrit) ; un échec porte `message`.
//                 Une fiche créée porte aussi `notice` : la phrase de fin, d'après ce que Grist a gardé
//   renderCard    (contact, marks) → la carte à montrer (render.js)
//   renderAvatar  { initials, photo } → l'avatar rond (identifiant de pièce jointe, 0 ou { url } : voir
//                 avatar-ui.js ; les initiales sans photo)
//   renderThumb   (photo, légende) → la miniature d'une photo, qui l'agrandit au clic (ou null)
//   notify        (facultatif) message → la confirmation d'un enregistrement sans réserve,
//                 donnée une fois la fenêtre fermée
//   onClose       (facultatif) appelé quand la fenêtre est fermée : rend le focus à
//                 l'endroit d'où elle a été ouverte
export function createProfileDialog(dialog) {
  const ctx = createContext(dialog);

  dialog.addEventListener('close', () => {
    const closed = ctx.session;
    reset(ctx);
    closed?.onClose?.();
  });

  return {
    isOpen: () => dialog.open,

    open: next => open(ctx, next),

    close() {
      if (dialog.open) dialog.close();
    }
  };
}
