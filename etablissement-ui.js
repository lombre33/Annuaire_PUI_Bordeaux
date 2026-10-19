// La fiche d'un établissement : une fenêtre où un responsable change le logo, le nom complet, la
// visibilité dans l'annuaire et la liste des responsables. L'enregistrement est direct, sans
// relecture avant/après (la maquette v5 validée le veut ainsi). Textes et mise en page suivent la
// maquette.
// DOM seulement : ce qui change (etablissement.js), ce qui s'écrit (etablissement-save.js) et
// l'image (image-prep.js) viennent de ce que main.js donne à open(). Ce fichier tient l'état de la
// fenêtre et enchaîne les étapes ; le formulaire est dans etablissement-form.js et le cadre commun
// aux fenêtres (titre, pied, Échap) dans dialog-shell.js.

import { button, el, notice } from './dom.js';
import { createDialogShell } from './dialog-shell.js';
import { draftOfEtablissement, rebaseDraft } from './etablissement.js';
import { buildForm, forgetPreview, paintLogo, paintResponsables, refreshForm } from './etablissement-form.js';

const emptyEvaluation = () => ({ champs: {}, labels: [], errors: [], fieldErrors: {} });

// L'état de la fenêtre (`ctx`, décrit dans etablissement-form.js) : rien tant qu'elle est fermée.
function createContext(dialog) {
  const ctx = {
    dialog,
    shell: null,
    session: null,
    generation: 0, // change à chaque ouverture : une réponse tardive d'une fenêtre fermée est ignorée
    chosen: null, // l'établissement choisi : { id, acronym, name }
    fiche: null,
    draft: null,
    phase: 'closed', // 'choosing' | 'loading' | 'editing' | 'saving' | 'saved' | 'failed'
    evaluation: emptyEvaluation(),
    previewUrl: null, // l'adresse locale de l'image choisie, à libérer
    ui: {},
    get acronym() { return this.fiche?.etablissement.acronym ?? this.chosen?.acronym ?? ''; }
  };
  ctx.shell = createDialogShell(dialog, {
    isSaving: () => ctx.phase === 'saving',
    hasUnsaved: () => ctx.session !== null && ctx.phase === 'editing' && ctx.evaluation.labels.length > 0
  });
  return ctx;
}

// ===== Choix de l'établissement =====

// Un responsable de plusieurs établissements choisit celui dont il ouvre la fiche.
function choiceItem(ctx, choice) {
  const item = el('li');
  const pick = button('', 'es-choice', () => start(ctx, choice));
  pick.dataset.etabId = String(choice.id);
  pick.append(el('span', 'es-choice-name', choice.acronym));
  if (choice.name && choice.name !== choice.acronym) pick.append(el('span', 'es-choice-full', choice.name));
  item.append(pick);
  return item;
}

function renderChooser(ctx) {
  const { shell } = ctx;
  ctx.phase = 'choosing';
  shell.setHeading('Mon établissement', 'Vous êtes responsable de plusieurs établissements : choisissez celui dont vous voulez modifier la fiche.');
  ctx.ui = {};
  const list = el('ul', 'es-choices');
  list.append(...ctx.session.choices.map(choice => choiceItem(ctx, choice)));
  shell.body.replaceChildren(list);
  shell.showActions(button('Annuler', 'btn', shell.close));
  shell.announceStep();
}

function start(ctx, choice) {
  ctx.chosen = choice;
  load(ctx);
}

// ===== Lecture de la fiche =====

function renderLoading(ctx) {
  const { shell } = ctx;
  ctx.phase = 'loading';
  shell.setHeading(`Fiche de l’établissement : ${ctx.acronym}`, 'Lecture de la fiche dans Grist…');
  ctx.ui = {};
  const wait = el('p', 'es-wait', 'Lecture de la fiche dans Grist…');
  wait.setAttribute('role', 'status');
  shell.body.replaceChildren(wait);
  shell.showActions(button('Annuler', 'btn', shell.close));
  shell.announceStep();
}

function renderFailed(ctx, message) {
  const { shell } = ctx;
  ctx.phase = 'failed';
  shell.setHeading(`Fiche de l’établissement : ${ctx.acronym}`, 'La fiche n’a pas pu être ouverte.');
  shell.body.replaceChildren(notice('ko', message || 'La fiche n’a pas pu être lue dans Grist.', 'alert'));
  shell.showActions(button('Fermer', 'btn btn-primary', shell.close));
  shell.announceStep();
}

async function load(ctx) {
  const mine = ctx.generation;
  renderLoading(ctx);
  let loaded;
  try {
    loaded = await ctx.session.load(ctx.chosen.id);
  } catch (error) {
    if (mine !== ctx.generation) return;
    renderFailed(ctx, error?.message);
    return;
  }
  if (mine !== ctx.generation) return;
  ctx.fiche = loaded;
  ctx.draft = draftOfEtablissement(loaded.etablissement, loaded.responsables ?? []);
  renderForm(ctx);
}

// ===== Le formulaire =====

// `message` : ce que la personne doit lire en tête (la fiche a changé dans Grist pendant que la fenêtre était ouverte).
function renderForm(ctx, message = '') {
  const { shell, fiche } = ctx;
  ctx.phase = 'editing';
  shell.setHeading(`Fiche de l’établissement : ${fiche.etablissement.acronym}`, 'Vos modifications s’enregistrent tout de suite, sans validation ni relecture.');
  shell.body.replaceChildren(...buildForm(ctx, message));
  ctx.ui.save = button('Enregistrer', 'btn btn-primary', () => save(ctx));
  ctx.ui.cancel = button('Annuler', 'btn', shell.close);
  ctx.ui.summary = shell.renderFoot('', ctx.ui.cancel, ctx.ui.save);
  paintLogo(ctx);
  if (fiche.responsables !== null) paintResponsables(ctx);
  refreshForm(ctx);
  shell.announceStep();
}

// ===== L'enregistrement =====

function setSaving(ctx, saving) {
  const { save: saveButton, cancel } = ctx.ui;
  saveButton.textContent = saving ? 'Enregistrement…' : 'Enregistrer';
  saveButton.setAttribute('aria-busy', String(saving));
  saveButton.disabled = saving;
  cancel.disabled = saving;
  ctx.shell.lockClose(saving);
}

// L'enregistrement a échoué : rien n'est perdu, la personne reste sur le formulaire avec la raison.
function saveFailed(ctx, error) {
  ctx.phase = 'editing';
  setSaving(ctx, false);
  refreshForm(ctx);
  ctx.ui.alert.replaceChildren(notice('ko', error?.message || 'La modification n’a pas pu être enregistrée.', 'alert'));
  ctx.shell.body.scrollTop = 0;
}

// La fiche a changé dans Grist pendant que la fenêtre était ouverte (rien n'est écrit) : le formulaire repart de la fiche telle
// qu'elle est maintenant, et ce que la personne a saisi est conservé.
function reopenChanged(ctx, result) {
  ctx.fiche = result.fiche;
  ctx.draft = ctx.fiche.responsables === null ? { ...ctx.draft, responsables: [] } : rebaseDraft(ctx.draft, ctx.fiche.responsables);
  renderForm(ctx, result.notice);
}

async function save(ctx) {
  if (ctx.phase !== 'editing' || ctx.ui.save.disabled) return;
  const mine = ctx.generation;
  ctx.phase = 'saving';
  setSaving(ctx, true);
  ctx.ui.alert.replaceChildren();
  let result;
  try {
    result = await ctx.session.save(ctx.draft, ctx.fiche);
  } catch (error) {
    if (mine !== ctx.generation) return;
    saveFailed(ctx, error);
    return;
  }
  if (mine !== ctx.generation) return;
  ctx.shell.lockClose(false);
  if (result.status === 'changed') reopenChanged(ctx, result);
  else if (result.unsaved?.length > 0 || result.reloaded === false) renderSaved(ctx, result);
  else finish(ctx);
}

// Tout est enregistré : la fenêtre se ferme et un message le confirme. Rien ne reste à lire.
function finish(ctx) {
  const { notify } = ctx.session;
  const label = ctx.acronym;
  ctx.phase = 'saved';
  ctx.dialog.close();
  notify?.(`La fiche de ${label} est enregistrée.`);
}

// Enregistré, mais avec une réserve à lire : Grist n'a pas tout gardé, ou l'annuaire n'a pas pu être rechargé. La fenêtre reste
// ouverte pour le dire.
function savedParts(ctx, result) {
  const done = el('div', 'sent');
  done.append(
    el('div', 'sent-mark', '✓'),
    el('h3', '', `La fiche de ${ctx.acronym} est enregistrée`),
    el('p', '', 'Les modifications s’appliquent tout de suite dans Grist, sans validation.')
  );
  const parts = [done];
  if (result.unsaved?.length > 0) {
    parts.unshift(notice('ko', `Grist n’a pas gardé tout ce qui était demandé (${result.unsaved.join(', ')}). `
      + 'Vérifiez la fiche dans Grist ou contactez un administrateur.', 'alert'));
  }
  if (result.reloaded === false) {
    parts.unshift(notice('pending', 'Les modifications sont enregistrées, mais l’annuaire n’a pas pu être rechargé. Rechargez la page pour les voir.', 'status'));
  }
  return parts;
}

function renderSaved(ctx, result) {
  const { shell } = ctx;
  ctx.phase = 'saved';
  shell.setHeading('Fiche enregistrée', `La fiche de ${ctx.acronym} est à jour.`);
  shell.body.replaceChildren(...savedParts(ctx, result));
  shell.showActions(button('Fermer', 'btn btn-primary', shell.close));
  shell.announceStep();
}

// ===== Ouverture et fermeture =====

function open(ctx, next) {
  ctx.generation += 1;
  forgetPreview(ctx);
  ctx.session = next;
  ctx.chosen = null;
  ctx.fiche = null;
  ctx.draft = null;
  ctx.shell.disarm();
  ctx.evaluation = emptyEvaluation();
  if (!ctx.dialog.open) ctx.dialog.showModal();
  if (next.choices.length === 1) start(ctx, next.choices[0]);
  else renderChooser(ctx);
}

function reset(ctx) {
  ctx.generation += 1;
  ctx.session = null;
  ctx.chosen = null;
  ctx.fiche = null;
  ctx.draft = null;
  ctx.phase = 'closed';
  forgetPreview(ctx);
  ctx.evaluation = emptyEvaluation();
  ctx.shell.reset();
  ctx.ui = {};
}

// `dialog` : le <dialog> de index.html.
//
// open(session) :
//   choices     [{ id, acronym, name }] les établissements dont la personne est responsable : un
//               seul s'ouvre tout de suite, plusieurs se choisissent d'abord
//   load        (identifiant) → promesse de la fiche telle qu'elle est dans Grist (main.js la relit) :
//                 etablissement   etablissementOf()
//                 responsables    [{ email }] ou null si la liste n'a pas pu être lue
//                 candidates      [{ email, name, initials }] les personnes de l'établissement qu'on
//                                 peut nommer
//                 warning         { hidden, includesMe } : combien de fiches l'annuaire montre pour
//                                 cet établissement, et si la mienne en fait partie
//                 meEmail         l'adresse de la personne connectée
//               un échec porte dans `message` la phrase à montrer
//   lookup      adresse → { name, initials, photo } si la personne a une fiche visible dans l'annuaire
//               (`photo` : l'identifiant de sa photo de profil, 0 sans photo), { hidden: true } si elle
//               en a une qui n'y figure pas (son nom ne se dévoile pas), null si aucune fiche ne porte
//               cette adresse
//   renderAvatar  { initials, photo } → l'avatar rond d'une personne (avatar-ui.js)
//   renderLogo  (fiche) → l'élément qui montre le logo actuel (null : le sigle en pastille)
//   save        (draft, fiche) → promesse de { status: 'saved', unsaved, reloaded } ou
//               { status: 'changed', fiche, notice } (la fiche a changé dans Grist pendant que la
//               fenêtre était ouverte : rien n'est écrit) ; un échec porte `message`
//   notify      (facultatif) message → la confirmation d'un enregistrement sans réserve, donnée une
//               fois la fenêtre fermée
//   onClose     (facultatif) appelé quand la fenêtre est fermée : rend le focus à l'endroit d'où elle
//               a été ouverte
export function createEtablissementDialog(dialog) {
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
