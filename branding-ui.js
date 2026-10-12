// Affichage de l'habillage : les logos (une image, ou le nom en texte quand le logo
// manque ou ne se charge pas), les financeurs du bandeau du haut et les fondateurs
// du bandeau du bas. branding.js décide quoi montrer, attachments.js donne les
// adresses des fichiers ; ici on ne construit que le DOM, avec textContent.

import { BAND_LOGO, FUNDER_LOGO, PUI_URL } from './constants.js';
import { logoSize } from './branding.js';

// Un logo : une <img> invisible tant qu'elle n'est pas chargée (ni cadre cassé ni texte
// alternatif qui clignote). Quand Grist ne donne pas le fichier (pas de jeton, fichier
// supprimé ou illisible), `onFail` remplace le logo par le nom, une seule fois. Une
// image en erreur est d'abord retentée avec un jeton renouvelé : il a pu expirer
// pendant que la page restait ouverte.
//   eager   charger tout de suite (les logos de l'en-tête et du pied de page) ; sinon
//           l'image attend d'approcher de l'écran, comme celles des cartes
//   onLoad  appelé avec l'image dès qu'elle est chargée, avant qu'elle ne devienne visible
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

  image.addEventListener('load', () => {
    onLoad?.(image);
    image.classList.add('loaded');
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

function textNode(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

// Le logo d'un emplacement, ou son nom (un <span> de classe `className`) quand il n'y
// en a pas, ou quand le fichier ne se charge pas. `limits` : la surface et les bornes du
// logo (constants.js) ; le logo reçoit alors ses dimensions en variables CSS --w et --h
// (classe `sized`) et la feuille de style en tire sa taille.
function logoOrName(attachments, logo, name, className, limits) {
  const asName = () => textNode('span', className, name);
  if (logo === null || !attachments) return asName();
  const holder = document.createElement('span');
  holder.className = 'logo-holder';
  const onLoad = limits ? image => sizeLogo(image, limits) : undefined;
  holder.append(createLogoImage(attachments, logo, name, () => holder.replaceChildren(asName()), { eager: true, onLoad }));
  return holder;
}

function funderItem(funder, attachments) {
  const item = document.createElement('li');
  item.className = 'funder';
  item.append(logoOrName(attachments, funder.logo, funder.name, 'funder-name', FUNDER_LOGO));
  return item;
}

function founderItem(founder, attachments) {
  const item = document.createElement('li');
  item.className = 'band-item';
  item.title = founder.name;
  item.append(logoOrName(attachments, founder.logo, founder.label || founder.name, 'band-name', BAND_LOGO));
  return item;
}

// `roots` : { funders, fundersLogos, band, bandLogos, bandRoundel, bandLink }, les
// éléments de index.html. Masqués tant qu'ils n'ont rien à montrer : un document sans
// logo ni financeur garde l'en-tête et le pied de page d'avant.
export function createBrandingUI(roots, attachments) {
  roots.bandLink.href = PUI_URL;
  let shown = null;

  return {
    // Reconstruit les financeurs et le bandeau, seulement si quelque chose a changé :
    // refaire les images à chaque lecture de Grist les ferait clignoter.
    render(branding) {
      if (branding.signature === shown) return;
      shown = branding.signature;

      roots.fundersLogos.replaceChildren(...branding.funders.map(funder => funderItem(funder, attachments)));
      roots.funders.hidden = branding.funders.length === 0;

      roots.bandLogos.replaceChildren(...branding.founders.map(founder => founderItem(founder, attachments)));
      const roundel = branding.roundel;
      roots.bandRoundel.replaceChildren(...(roundel ? [logoOrName(attachments, roundel.logo, roundel.name, 'band-name', null)] : []));
      roots.band.hidden = branding.founders.length === 0;
    }
  };
}
