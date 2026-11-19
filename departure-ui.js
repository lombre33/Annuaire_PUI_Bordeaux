// La fenêtre « Départ d'un·e collègue » (index.html : #departDialog, 1.46.0) : le responsable d'un établissement y désactive la fiche d'un·e collègue qui part,
// après avoir, s'il veut, transféré ses valeurs (compétences, GT, instances, actions…) à une autre personne de l'établissement. Rien n'est supprimé : la
// fiche reste dans Grist et n'apparaît plus dans l'annuaire (depuis la 1.46.1, sa case « Accepte_apparaitre » est décochée, aucune colonne de plus), et le
// responsable peut la réactiver en recochant la case. Trois écrans : la liste (les collègues et les fiches qui n'apparaissent pas), le choix de ce qui est
// transféré, puis la confirmation, qui montre ce que chaque rubrique contenait AVANT et aura APRÈS.
// DOM seulement : departure.js calcule, departure-save.js lit et écrit, main.js relit l'annuaire après chaque écriture.

import { DEPARTURE_GROUPS } from './constants.js';
import { button, dropdown, el, foundText, matchesTerm, notice, searchField } from './dom.js';
import { createDialogShell } from './dialog-shell.js';

const SEARCH_FROM = 8; // à partir de ce nombre de collègues, la liste a sa recherche
const MANY = 6; // au-delà, les valeurs d'une rubrique se replient dans un détail
const NO_RECIPIENT = 0;

const plural = (count, one, many) => (count > 1 ? many : one);

// « 3 valeurs » : le nombre de valeurs d'une rubrique, au pluriel quand il y en a plusieurs.
const valuesText = count => `${count} valeur${plural(count, '', 's')}`;

// ===== Les éléments d'une liste =====

function personRow(session, person, { actions, tag }) {
  const row = el('li', 'es-resp dp-person');
  row.dataset.personId = String(person.id);
  const main = el('div', 'es-resp-main');
  const name = el('p', 'es-resp-name', person.name);
  if (tag) name.append(el('span', 'es-tag es-tag-you', tag));
  main.append(name);
  if (person.email) main.append(el('p', 'es-resp-mail', person.email));
  row.append(session.renderAvatar({ initials: person.initials, photo: person.photo }), main, ...actions);
  return row;
}

// Ce que dit une rubrique de la confirmation : combien de valeurs la personne qui reprend avait, combien elle aura, ce qui s'ajoute et ce qu'elle a déjà.
function groupBlock(group) {
  const block = el('li', 'dp-group');
  block.dataset.group = group.key;
  block.append(el('p', 'dp-group-title', group.label));
  if (!group.available) {
    block.append(el('p', 'dp-group-line', 'Cette rubrique n’existe pas dans BDD : rien n’est transféré.'));
    return block;
  }
  block.append(el('p', 'dp-group-count', `Avant ${valuesText(group.before)} → après ${valuesText(group.after)}`));
  if (group.add.length === 0 && !(group.responsible?.length > 0)) {
    block.append(el('p', 'dp-group-line', group.already.length > 0 ? 'Tout y est déjà : rien n’est ajouté.' : 'Rien à transférer : la fiche n’en a aucune.'));
    return block;
  }
  [['Ajoutées', group.add], ['Responsable de', group.responsible ?? []], ['Déjà présentes', group.already]]
    .filter(([, labels]) => labels.length > 0)
    .forEach(([title, labels]) => {
      if (labels.length > MANY) {
        const details = el('details', 'dp-more');
        details.append(el('summary', '', `${title} (${labels.length})`), el('p', 'dp-group-line', labels.join(', ')));
        block.append(details);
      } else {
        block.append(el('p', 'dp-group-line', `${title} : ${labels.join(', ')}`));
      }
    });
  return block;
}

// ===== La fenêtre =====

// `dialog` : le <dialog> de index.html. open(session), session :
//   etablissement      { id, acronym }
//   colleagues()       les personnes que l'annuaire montre pour l'établissement (departure.js, colleaguesOf), lues à chaque dessin
//   departed()         les fiches de l'établissement qui n'apparaissent pas faute d'accord (departure.js, departedOf)
//   isResponsable      adresse → vrai si la personne est aussi responsable de l'établissement
//   prepare(request)   → promesse de la relecture (departure-save.js, prepareDeparture) ; { departingId, recipientId, groups } ; un échec porte son message
//   apply(review)      → promesse de { status: 'saved', total } ou { status: 'changed' } (departure-save.js, applyDeparture, puis main.js relit l'annuaire)
//   reactivate(person) → promesse de { status } (departure-save.js, reactivateFiche, puis main.js relit l'annuaire)
//   renderAvatar       { initials, photo } → l'avatar rond d'une personne (avatar-ui.js)
//   onChanged          (facultatif) appelé quand une écriture a réussi
//   onClose            (facultatif) rend le focus à l'endroit d'où la fenêtre a été ouverte
export function createDepartureDialog(dialog) {
  let session = null;
  let busy = false;
  let generation = 0;
  let announcement = '';
  const shell = createDialogShell(dialog, { isSaving: () => busy, hasUnsaved: () => false });

  dialog.addEventListener('close', () => {
    generation += 1;
    const closed = session;
    session = null;
    busy = false;
    announcement = '';
    shell.reset();
    closed?.onClose?.();
  });

  const heading = (title, detail = session.etablissement.acronym) => shell.setHeading(title, detail);

  // ----- La liste -----

  // Une liste de personnes (`items` : les lignes, chacune avec son `dataset.name`), avec sa recherche à partir de SEARCH_FROM personnes.
  function searchableList(items, { label, placeholder }) {
    const list = el('ul', 'es-resp-list dp-list');
    list.append(...items);
    const status = el('p', 'sr-only');
    status.setAttribute('role', 'status');
    const parts = [];
    if (items.length >= SEARCH_FROM) {
      parts.push(searchField({
        label,
        placeholder,
        onTerm: found => {
          let shown = 0;
          items.forEach(item => {
            const match = matchesTerm(item.dataset.name, found);
            item.hidden = !match;
            if (match) shown += 1;
          });
          status.textContent = foundText(found, shown);
        }
      }));
    }
    parts.push(list, status);
    return parts;
  }

  function colleagueList() {
    const people = session.colleagues();
    if (people.length === 0) return [el('p', 'es-sec-help', 'Aucune fiche de cet établissement n’apparaît dans l’annuaire.')];
    const items = people.map(person => {
      const depart = person.me ? [] : [button('Départ…', 'btn', () => renderPlan(person))];
      depart.forEach(node => node.setAttribute('aria-label', `Départ de ${person.name}`));
      const item = personRow(session, person, { actions: depart, tag: person.me ? 'vous' : '' });
      item.dataset.name = person.name;
      return item;
    });
    return searchableList(items, { label: 'Rechercher un·e collègue', placeholder: 'Rechercher un·e collègue…' });
  }

  function departedItem(person, { confirming, error }) {
    const confirm = confirming === person.id;
    const actions = confirm
      ? [button('Confirmer la réactivation', 'btn btn-primary', () => reactivate(person)), button('Annuler', 'btn', () => renderList())]
      : [button('Réactiver', 'btn', () => renderList({ confirming: person.id }))];
    if (!confirm) actions[0].setAttribute('aria-label', `Réactiver la fiche de ${person.name}`);
    const item = personRow(session, person, { actions, tag: '' });
    item.dataset.state = 'removed';
    item.dataset.name = person.name;
    // Recocher la case est un geste que seule la personne a le droit de décider : la fenêtre le rappelle avant de confirmer.
    if (confirm) item.querySelector('.es-resp-main').append(el('p', 'es-sec-help dp-consent', 'Cela coche « Apparaître dans l’annuaire » sur sa fiche : ne le faites que si la personne vous a donné son accord.'));
    if (error?.id === person.id) item.querySelector('.es-resp-main').append(notice('ko', error.message, 'alert'));
    return item;
  }

  function renderList({ confirming = null, error = null } = {}) {
    generation += 1;
    heading('Départ d’un·e collègue');
    const parts = [];
    if (announcement) {
      const done = el('p', 'rq-done', announcement);
      done.setAttribute('role', 'status');
      parts.push(done);
    }
    parts.push(el('p', 'rq-lead', 'Quand une personne quitte l’établissement, sa fiche est désactivée : elle reste dans Grist, rien n’est supprimé, mais elle n’apparaît plus dans l’annuaire (sa case « Apparaître dans l’annuaire » est décochée). '
      + 'Vous pouvez d’abord transférer ses compétences, GT, instances, actions… à une autre personne de l’établissement.'));
    const people = el('section', 'es-sec');
    people.setAttribute('aria-labelledby', 'departPeopleTitle');
    const title = el('h3', 'es-sec-title', 'Personnes de l’établissement');
    title.id = 'departPeopleTitle';
    people.append(title, ...colleagueList());
    parts.push(people);

    const gone = session.departed();
    if (gone.length > 0) {
      const section = el('section', 'es-sec');
      section.setAttribute('aria-labelledby', 'departGoneTitle');
      const goneTitle = el('h3', 'es-sec-title', `Fiches qui n’apparaissent pas (${gone.length})`);
      goneTitle.id = 'departGoneTitle';
      const help = el('p', 'es-sec-help', 'Ces personnes n’apparaissent pas dans l’annuaire : elles ont quitté l’établissement, ou n’ont pas accepté d’apparaître. Leurs fiches restent dans Grist. '
        + 'Réactiver une fiche recoche son accord d’apparaître ; les valeurs déjà transférées à une autre personne y restent.');
      section.append(goneTitle, help, ...searchableList(gone.map(person => departedItem(person, { confirming, error })), { label: 'Rechercher une fiche', placeholder: 'Rechercher une fiche…' }));
      parts.push(section);
    }
    shell.body.replaceChildren(...parts);
    shell.showActions(button('Fermer', 'btn', shell.close));
    shell.announceStep();
  }

  // ----- Ce qui est transféré -----

  // L'état du choix en cours : la personne qui part, celle qui reprend (0 : aucune) et les rubriques cochées.
  function renderPlan(person, { recipientId = NO_RECIPIENT, picked = new Set(DEPARTURE_GROUPS.filter(group => group.on).map(group => group.key)), message = '' } = {}) {
    generation += 1;
    const choice = { recipientId, picked };
    heading(`Départ de ${person.name}`);
    const parts = [];
    if (message) parts.push(notice('pending', message, 'status'));
    parts.push(el('p', 'rq-lead', 'La fiche de cette personne sera désactivée. Si quelqu’un reprend son travail, ses valeurs peuvent être recopiées sur la fiche de cette personne : '
      + 'elle garde les siennes, rien n’est ajouté en double, et la fiche qui part garde les siennes.'));
    if (session.isResponsable(person.email)) {
      parts.push(notice('pending', 'Cette personne est aussi responsable de l’établissement : pensez à la retirer de la liste des responsables, dans la fiche de l’établissement.', 'status'));
    }

    const field = el('div', 'fld fld-wide');
    const label = el('span', 'fld-label', 'Personne qui reprend ses valeurs');
    label.id = 'departRecipientLabel';
    const recipients = session.colleagues().filter(other => other.id !== person.id);
    const options = [{ id: NO_RECIPIENT, label: 'Ne rien transférer' }, ...recipients.map(other => ({ id: other.id, label: other.name }))];
    const checks = [];
    const next = button('Continuer', 'btn btn-primary', () => review(person, choice));
    const syncChecks = () => {
      checks.forEach(({ input }) => { input.disabled = choice.recipientId === NO_RECIPIENT; });
    };
    const pick = dropdown({
      id: 'departRecipient',
      labelId: label.id,
      options,
      value: recipientId,
      placeholder: 'Ne rien transférer',
      searchLabel: 'Rechercher une personne',
      onChange: id => {
        choice.recipientId = id;
        syncChecks();
      }
    });
    field.append(label, pick.element);

    const group = el('fieldset', 'dp-groups');
    group.append(el('legend', 'fld-label', 'Rubriques à transférer'));
    DEPARTURE_GROUPS.forEach(item => {
      const line = el('label', 'dp-check');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = choice.picked.has(item.key);
      input.dataset.group = item.key;
      input.addEventListener('change', () => {
        if (input.checked) choice.picked.add(item.key);
        else choice.picked.delete(item.key);
      });
      line.append(input, el('span', '', item.label));
      checks.push({ input });
      group.append(line);
    });
    syncChecks();
    parts.push(field, group);

    shell.body.replaceChildren(...parts);
    shell.showActions(button('Retour', 'btn', () => renderList()), next);
    shell.announceStep();
  }

  // ----- La confirmation -----

  async function review(person, choice) {
    if (busy) return;
    const groups = choice.recipientId === NO_RECIPIENT ? [] : DEPARTURE_GROUPS.filter(item => choice.picked.has(item.key)).map(item => item.key);
    const mine = generation;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('.dlg-actions .btn').forEach(node => { node.disabled = true; });
    let result;
    try {
      result = await session.prepare({ departingId: person.id, recipientId: choice.recipientId, groups });
    } catch (error) {
      if (mine !== generation) return;
      busy = false;
      dialog.removeAttribute('aria-busy');
      renderPlan(person, { ...choice, message: error?.message || 'La fiche n’a pas pu être relue.' });
      return;
    }
    if (mine !== generation) return;
    busy = false;
    dialog.removeAttribute('aria-busy');
    renderConfirm(person, choice, result);
  }

  function renderConfirm(person, choice, result) {
    generation += 1;
    heading(`Désactiver la fiche de ${result.departing.name} ?`);
    const parts = [
      notice('pending', `La fiche de ${result.departing.name} n’apparaîtra plus dans l’annuaire : sa case « Apparaître dans l’annuaire » sera décochée. Elle reste dans Grist : rien n’est supprimé, et vous pouvez la réactiver.`, 'status')
    ];
    if (result.recipient && result.groups.length > 0) {
      const section = el('section', 'es-sec');
      section.setAttribute('aria-labelledby', 'departTransferTitle');
      const title = el('h3', 'es-sec-title', `Valeurs recopiées sur la fiche de ${result.recipient.name}`);
      title.id = 'departTransferTitle';
      const list = el('ul', 'dp-groups-list');
      list.append(...result.groups.map(groupBlock));
      section.append(title, list);
      if (result.total === 0) section.append(el('p', 'es-sec-help', 'Rien à ajouter : la fiche sera seulement désactivée.'));
      parts.push(section);
    } else {
      parts.push(el('p', 'rq-lead', 'Aucune valeur n’est transférée.'));
    }
    shell.body.replaceChildren(...parts);
    shell.showActions(
      button('Retour', 'btn', () => renderPlan(person, choice)),
      button('Désactiver la fiche', 'btn btn-danger', () => confirm(person, choice, result))
    );
    shell.announceStep();
  }

  async function confirm(person, choice, result) {
    if (busy) return;
    const mine = generation;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    shell.lockClose(true);
    shell.body.querySelectorAll('button, input').forEach(node => { node.disabled = true; });
    dialog.querySelectorAll('.dlg-actions .btn').forEach(node => { node.disabled = true; });
    let outcome;
    try {
      outcome = await session.apply(result);
    } catch (error) {
      if (mine !== generation) return;
      busy = false;
      dialog.removeAttribute('aria-busy');
      shell.lockClose(false);
      renderPlan(person, { ...choice, message: error?.message || 'La fiche n’a pas pu être désactivée.' });
      return;
    }
    if (mine !== generation) return;
    busy = false;
    dialog.removeAttribute('aria-busy');
    shell.lockClose(false);
    if (outcome.status === 'changed') {
      renderPlan(person, { ...choice, message: 'L’une des deux fiches a changé dans Grist pendant que vous relisiez : rien n’a été écrit. Relisez, puis confirmez à nouveau.' });
      return;
    }
    announcement = `La fiche de ${result.departing.name} est désactivée`
      + (result.recipient && result.total > 0 ? `, et ${valuesText(result.total)} ${plural(result.total, 'a été recopiée', 'ont été recopiées')} sur la fiche de ${result.recipient.name}.` : '.');
    session.onChanged?.();
    renderList();
  }

  // ----- La réactivation -----

  async function reactivate(person) {
    if (busy) return;
    const mine = generation;
    busy = true;
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('.dp-list .btn').forEach(node => node.setAttribute('aria-disabled', 'true'));
    try {
      const outcome = await session.reactivate(person);
      if (mine !== generation) return;
      announcement = outcome.status === 'reactivated'
        ? `La fiche de ${person.name} est réactivée.`
        : `La fiche de ${person.name} n’était plus à réactiver : quelqu’un d’autre s’en est occupé.`;
      busy = false;
      if (outcome.status === 'reactivated') session.onChanged?.();
      renderList();
    } catch (error) {
      if (mine !== generation) return;
      announcement = '';
      busy = false;
      renderList({ error: { id: person.id, message: error?.message || 'La fiche n’a pas pu être réactivée.' } });
    } finally {
      busy = false;
      dialog.removeAttribute('aria-busy');
    }
  }

  return {
    isOpen: () => dialog.open,

    // Redessine la liste quand l'annuaire vient d'être relu (une autre personne a pu changer une fiche) : seulement sur l'écran de la liste.
    refresh() {
      if (dialog.open && !busy && dialog.querySelector('#departPeopleTitle')) renderList();
    },

    open(next) {
      generation += 1;
      session = next;
      announcement = '';
      renderList();
      if (!dialog.open) dialog.showModal();
      shell.announceStep();
    }
  };
}
