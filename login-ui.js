// La fenêtre de connexion d'un visiteur sans compte (index.html : #acces), la MÊME que celle du widget « agenda partagé » (retour d'Antoine,
// 19 novembre 2026 : « pourquoi la modale de log in n'est pas exactement la même que celle de l'autre projet »). La 1.44.0 n'en avait repris que
// la logique (l'adresse de connexion, l'ouverture d'office, `target="_top"`) et avait réécrit la fenêtre dans le style des autres fenêtres de
// l'annuaire ; la 1.45.1 la reprend à l'identique : la même mise en page (une carte à bandeau magenta, trois étapes numérotées avec leur dessin,
// une note, deux boutons), les mêmes classes (`acces`, `acces__etapes`… : login.css, dont tests/login-window.test.mjs garde chaque règle
// d'accord avec l'agenda), le même comportement. Ne changent que ce que l'annuaire impose : son nom et ce qu'on y fait (les textes), la page où
// Grist ramène la personne (login.js) et la troisième illustration (login-art.js).
//
// Le comportement, celui de l'agenda : la fenêtre s'ouvre d'elle-même UNE fois, quand on sait que la personne est sans compte ; Échap, un clic à
// côté ou « Continuer sans me connecter » la ferment, sans la rouvrir ensuite. Le bouton « Se connecter » de l'en-tête mène DIRECTEMENT à la
// page de connexion de Grist (Grist cache son propre bouton en `?style=singlePage`) ; sans adresse de connexion, il rouvre la fenêtre.
// `target="_top"` : le widget est dans un cadre, c'est la page entière de Grist qui doit changer, dans le même onglet (la personne revient
// ensuite sur l'annuaire, pas sur un onglet resté ouvert) ; le clic est le geste que le navigateur exige. DOM seulement : qui est sans compte
// et l'adresse de connexion viennent de main.js (identity.js, login.js).

import { el, button } from './dom.js';
import { illustration } from './login-art.js';
import { LOGIN_SERVICE, LOGIN_REFERENCE } from './constants.js';

// Les trois étapes : [dessin, titre, détail]. Sans adresse de connexion, le bouton n'est pas dans la fenêtre : il est en haut à droite de la page de
// Grist, d'où la première étape et son dessin.
function steps(url) {
  return [
    url
      ? ['hereButton', 'Cliquez sur « Se connecter »', 'Le bouton est en bas de cette fenêtre.']
      : ['button', 'Cliquez sur « Se connecter »', 'Le bouton se trouve en haut à droite de cette page.'],
    ['service', `Choisissez ${LOGIN_SERVICE}`, `C’est la même connexion que pour ${LOGIN_REFERENCE} : vos identifiants professionnels habituels.`],
    ['record', 'Revenez ici et retrouvez votre fiche', 'L’annuaire vous reconnaît : il s’ouvre, et vous pouvez modifier votre fiche ou, si vous n’en avez pas, la créer.']
  ];
}

function stepItem([art, title, detail], index) {
  const item = el('li');
  const number = el('span', 'acces__num', String(index + 1));
  number.setAttribute('aria-hidden', 'true');
  const text = el('div', 'acces__texte');
  text.append(el('h3', '', title), el('p', '', detail));
  const figure = el('figure');
  figure.append(illustration(art, { service: LOGIN_SERVICE, reference: LOGIN_REFERENCE }));
  item.append(number, text, figure);
  return item;
}

// Le contenu de la fenêtre pour une personne sans compte : comment se connecter, en trois étapes. `close` ferme la fenêtre.
function content(url, close) {
  const body = el('div', 'acces__corps');
  body.tabIndex = -1;
  body.setAttribute('autofocus', '');
  const title = el('h2', '', 'Connectez-vous pour accéder à l’annuaire');
  title.id = 'acces-titre';
  const list = el('ol', 'acces__etapes');
  list.append(...steps(url).map(stepItem));
  const actions = el('div', 'acces__actions');
  if (url) {
    const link = el('a', 'acces__bouton', 'Se connecter');
    link.href = url;
    link.target = '_top';
    link.rel = 'noopener';
    actions.append(button('Continuer sans me connecter', 'acces__lien', close), link);
  } else {
    actions.append(button('J’ai compris', 'acces__bouton', close));
  }
  body.append(
    el('p', 'acces__sur', 'Annuaire réservé aux membres'),
    title,
    el('p', 'acces__intro', `Pour consulter l’annuaire et modifier votre fiche, vous devez être connecté(e). Pas de compte à créer : c’est le même compte que ${LOGIN_REFERENCE}, via ${LOGIN_SERVICE}.`),
    list,
    el('p', 'acces__note', 'Votre adresse professionnelle doit figurer dans l’annuaire. Sinon, et si son domaine est celui d’un établissement du PUI, le bouton « Créer ma fiche » vous permet d’en demander la création.'),
    actions
  );
  return body;
}

// `dialog` : le <dialog id="acces"> de index.html ; `link` : le lien « Se connecter » de l'en-tête (une adresse de connexion), `openButton` : son
// repli sans adresse (il rouvre la fenêtre). Renvoie { show }.
export function createLoginPrompt(dialog, { link, openButton }) {
  let shownFor = null; // l'adresse dont la fenêtre dit le contenu ; la refaire, c'est perdre la place de la personne dans la fenêtre
  let proposed = false; // la fenêtre s'est ouverte d'elle-même : elle ne le refait pas
  const close = () => dialog.close();

  function open() {
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  }

  // Un clic à côté de la carte (sur le fond) la ferme, comme Échap.
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  openButton.addEventListener('click', open);

  return {
    // `url` : la page de connexion de Grist (login.js), '' si le widget n'a pas pu la construire ; `autoOpen` : ouvrir la fenêtre d'elle-même, la
    // première fois seulement. main.js l'appelle quand l'identité dit « sans compte ».
    show(url, { autoOpen = true } = {}) {
      if (shownFor !== url) {
        shownFor = url;
        dialog.replaceChildren(content(url, close));
      }
      link.hidden = !url;
      if (url) link.href = url;
      openButton.hidden = Boolean(url);
      if (autoOpen && !proposed) {
        proposed = true;
        open();
      }
    }
  };
}
