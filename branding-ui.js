// Affichage de l'habillage : les logos (une image, ou le nom en texte quand le logo
// manque ou ne se charge pas) et les fondateurs du bandeau du bas. branding.js décide
// quoi montrer, attachments.js donne les adresses des fichiers ; ici on ne construit que
// le DOM, avec textContent. Les financeurs sont deux images fixes de index.html.

import { BAND_LOGO, PUI_URL } from './constants.js';
import { logoSize } from './branding.js';

// Un logo : une <img> invisible tant qu'elle n'est pas chargée (ni cadre cassé ni texte
// alternatif qui clignote). Quand Grist ne donne pas le fichier (pas de jeton, fichier
// supprimé ou illisible), `onFail` remplace le logo par le nom, une seule fois. Une
// image en erreur est d'abord retentée avec un jeton renouvelé : il a pu expirer
// pendant que la page restait ouverte. Les photos de profil (avatar-ui.js) passent par ici aussi.
//   eager   charger tout de suite (les logos de l'en-tête et du pied de page) ; sinon
//           l'image attend d'approcher de l'écran, comme celles des cartes
//   onLoad  appelé avec l'image et `show` (qui la rend visible) dès qu'elle est chargée, avant qu'elle ne
//           devienne visible ; s'il renvoie false, l'image reste cachée jusqu'à ce que l'appelant appelle `show`
//           ou que son prochain chargement la montre
// L'image qu'on voit se demande toujours comme une image ordinaire, sans CORS, et rien ne dépend de la lecture de ses
// pixels : un Grist qui ne la donnerait pas en CORS, ou un navigateur qui bride cette lecture, ne doit jamais faire
// disparaître un logo (1.25.2 et 1.26.1).
export function createLogoImage(attachments, attachmentId, alt, onFail, { eager = false, onLoad } = {}) {
  const image = document.createElement('img');
  image.className = 'logo-img';
  image.alt = alt;
  image.decoding = 'async';
  image.loading = eager ? 'eager' : 'lazy';
  image.draggable = false;
  // L'adresse de la page du widget n'a pas à être envoyée au serveur de Grist.
  image.referrerPolicy = 'no-referrer';

  let failed = false;
  let retried = false;
  let requested = '';
  const fail = () => {
    if (failed) return;
    failed = true;
    onFail();
  };
  const assign = () => {
    requested = attachments.url(attachmentId) ?? '';
    if (requested) image.src = requested;
    return requested !== '';
  };

  const show = () => image.classList.add('loaded');
  image.addEventListener('load', () => {
    if (onLoad?.(image, show) === false) return;
    show();
  });
  image.addEventListener('error', async () => {
    if (failed) return;
    if (retried) {
      fail();
      return;
    }
    retried = true;
    if (await attachments.refresh(requested) && assign()) return;
    fail();
  });

  if (!assign()) {
    attachments.ready().then(ready => {
      if (!ready || !assign()) fail();
    });
  }
  return image;
}

// Donne au logo chargé ses dimensions en variables CSS --w et --h (classe `sized`) d'après
// ses proportions ; la feuille de style en tire sa taille. `limits` : la surface et les bornes
// du logo (constants.js). Sans proportions connues (un navigateur qui ne donne pas de
// dimensions à un SVG sans width ni height), la feuille de style borne l'image.
export function sizeLogo(image, limits) {
  const box = logoSize(image.naturalWidth / image.naturalHeight, limits);
  if (!box) return;
  image.style.setProperty('--w', box.width.toFixed(1));
  image.style.setProperty('--h', box.height.toFixed(1));
  image.classList.add('sized');
}

// Les logos des cartes ne sont plus lus ni recadrés (1.26.1) : chacun se montre tel quel, dans la case de style.css. Cette
// fonction ne sert plus qu'au render.js que le cache d'un navigateur peut garder dix minutes après une mise en ligne
// (GitHub Pages) et qui l'importe encore : elle montre le logo, sans rien lire. À retirer avec CARD_LOGO, inkBounds et hasInk.
export function fitCardLogo(image, attachmentId, show) {
  show?.();
  return false;
}

function textNode(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// Le logo d'un fondateur du bandeau, ou son nom (un <span> de classe `band-name`) quand il
// n'y en a pas, ou quand le fichier ne se charge pas. Le logo reçoit ses dimensions en
// variables CSS --w et --h (classe `sized`, BAND_LOGO) et la feuille de style en tire sa taille.
function logoOrName(attachments, logo, name) {
  const asName = () => textNode('span', 'band-name', name);
  if (logo === null || !attachments) return asName();
  const holder = document.createElement('span');
  holder.className = 'logo-holder';
  const onLoad = image => sizeLogo(image, BAND_LOGO);
  holder.append(createLogoImage(attachments, logo, name, () => holder.replaceChildren(asName()), { eager: true, onLoad }));
  return holder;
}

function founderItem(founder, attachments) {
  const item = document.createElement('li');
  item.className = 'band-item';
  item.title = founder.name;
  item.append(logoOrName(attachments, founder.logo, founder.label || founder.name));
  return item;
}

// `roots` : { band, bandLogos, bandLink }, les éléments de index.html. Le bandeau reste
// masqué tant qu'aucun fondateur n'a validé sa présence.
export function createBrandingUI(roots, attachments) {
  roots.bandLink.href = PUI_URL;
  let shown = null;

  return {
    // Reconstruit le bandeau, seulement si quelque chose a changé : refaire les images à
    // chaque lecture de Grist les ferait clignoter.
    render(branding) {
      if (branding.signature === shown) return;
      shown = branding.signature;

      roots.bandLogos.replaceChildren(...branding.founders.map(founder => founderItem(founder, attachments)));
      roots.band.hidden = branding.founders.length === 0;
    }
  };
}
