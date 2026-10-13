// Affichage de l'habillage : les logos (une image, ou le nom en texte quand le logo
// manque ou ne se charge pas) et les fondateurs du bandeau du bas. branding.js décide
// quoi montrer, attachments.js donne les adresses des fichiers ; ici on ne construit que
// le DOM, avec textContent. Les financeurs sont deux images fixes de index.html.

import { BAND_LOGO, CARD_LOGO, PUI_URL } from './constants.js';
import { logoSize, inkBounds, hasInk } from './branding.js';

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
// L'image qu'on voit se demande toujours comme une image ordinaire, sans CORS : un Grist qui ne la donnerait
// pas en CORS, ou un navigateur qui bride la lecture des pixels, ne doit jamais faire disparaître un logo
// (1.25.1). Lire ses pixels, c'est à fitCardLogo de le tenter, sur une copie à part.
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

// Les logos des cartes sont fournis avec des marges de toutes tailles (un logo large au milieu d'un carré
// transparent paraît minuscule à côté d'un logo coupé au ras). Le logo est donc lu : son encre (inkBounds) est
// recadrée dans une copie, puis sa taille se tire de sa surface (sizeLogo, CARD_LOGO), pas de celle du fichier.
// La lecture se fait sur une copie du fichier demandée à part, en CORS (sans CORS, le navigateur interdit de lire les
// pixels) : l'image qu'on voit, elle, reste une image ordinaire. Un logo dont les pixels ne se lisent pas (Grist ne le
// donne pas en CORS, le navigateur bride le canvas, la lecture tarde) garde sa taille de repli de style.css, mais se montre.
const ANALYSIS_SIDE = 256; // côté le plus long de l'image sur laquelle l'encre est cherchée
const COPY_SIDE = 320; // côté le plus long de la copie recadrée
const NO_MARGIN = 0.97; // une encre qui occupe déjà 97 % de l'image dans les deux sens n'est pas recadrée
export const ANALYSIS_TIMEOUT_MS = 3000; // une lecture plus longue est abandonnée : le logo se montre tel quel
const PROBE_PARAM = 'annuaire_pixels'; // distingue la lecture des pixels de l'image affichée (probeUrl)
const UNREADABLE = { readable: false, url: null };
const analyses = new Map(); // identifiant de la pièce jointe -> Promise<{ readable, url }>

function readInk(image) {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!(width > 0 && height > 0)) return { readable: false, url: null };
  try {
    const scale = Math.min(1, ANALYSIS_SIDE / Math.max(width, height));
    const columns = Math.max(1, Math.round(width * scale));
    const rows = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = columns;
    canvas.height = rows;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, columns, rows);
    const ink = inkBounds(context.getImageData(0, 0, columns, rows).data, columns, rows);
    if (!ink) return { readable: true, url: null };
    // Un pixel de marge pour ne pas rogner le lissage des bords.
    const left = Math.max(0, ink.x - 1);
    const top = Math.max(0, ink.y - 1);
    const right = Math.min(columns, ink.x + ink.width + 1);
    const bottom = Math.min(rows, ink.y + ink.height + 1);
    if ((right - left) / columns >= NO_MARGIN && (bottom - top) / rows >= NO_MARGIN) return { readable: true, url: null };
    const sx = Math.floor(left * width / columns);
    const sy = Math.floor(top * height / rows);
    const sw = Math.min(width - sx, Math.ceil((right - left) * width / columns));
    const sh = Math.min(height - sy, Math.ceil((bottom - top) * height / rows));
    const shrink = Math.min(1, COPY_SIDE / Math.max(sw, sh));
    const copy = document.createElement('canvas');
    copy.width = Math.max(1, Math.round(sw * shrink));
    copy.height = Math.max(1, Math.round(sh * shrink));
    const copyContext = copy.getContext('2d', { willReadFrequently: true });
    copyContext.drawImage(image, sx, sy, sw, sh, 0, 0, copy.width, copy.height);
    // Un navigateur qui brouille ou vide les lectures de canvas rendrait une copie blanche : le logo ne serait plus
    // le sien. Une copie sans rien dedans n'est pas utilisée.
    if (!hasInk(copyContext.getImageData(0, 0, copy.width, copy.height).data)) return UNREADABLE;
    return { readable: true, url: copy.toDataURL('image/png') };
  } catch {
    return UNREADABLE;
  }
}

// Une adresse distincte de celle de l'image affichée, que Grist traite comme elle (il ignore le paramètre) : l'image affichée
// vient d'être chargée sans CORS, et la réponse que le cache en garde (Grist la garde une heure, sans `Vary: Origin`) n'a
// pas les en-têtes CORS ; la même adresse redemandée en CORS y serait prise puis refusée. Une adresse qui n'est pas
// celle d'un serveur (une image en data:) est gardée telle quelle.
function probeUrl(source) {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return source;
    url.searchParams.set(PROBE_PARAM, '1');
    return url.href;
  } catch {
    return source;
  }
}

// La lecture d'un logo, une seule fois par pièce jointe : toutes les cartes d'un même établissement attendent la même.
// Le fichier est redemandé à Grist dans une image à part, en CORS (seule façon d'en lire les pixels). Elle ne répond
// jamais d'une erreur : refusée, illisible ou trop lente, la lecture rend UNREADABLE.
function analyseInk(image, attachmentId) {
  if (!analyses.has(attachmentId)) {
    analyses.set(attachmentId, new Promise(resolve => {
      const copy = new Image();
      copy.crossOrigin = 'anonymous';
      copy.referrerPolicy = 'no-referrer';
      const finish = result => {
        clearTimeout(timer);
        copy.onload = copy.onerror = null;
        resolve(result);
      };
      const timer = setTimeout(() => finish(UNREADABLE), ANALYSIS_TIMEOUT_MS);
      copy.onload = () => finish(readInk(copy));
      copy.onerror = () => finish(UNREADABLE);
      copy.src = probeUrl(image.currentSrc || image.src);
    }));
  }
  return analyses.get(attachmentId);
}

// À appeler au chargement (onLoad de createLogoImage) d'un logo de carte, avec le `show` qu'il reçoit. Renvoie
// toujours false : le logo reste caché le temps de la lecture, puis se montre à sa taille (recadré, ou tel
// quel s'il n'a pas de marges), ou à la taille de repli de la feuille de style s'il ne s'est pas laissé lire.
// Recadré, il est remplacé par sa copie, dont le chargement appelle de nouveau cette fonction.
export function fitCardLogo(image, attachmentId, show) {
  const finish = () => {
    sizeLogo(image, CARD_LOGO);
    image.parentElement?.classList.add('fitted');
  };
  if (image.dataset.fit === 'trimmed') {
    finish();
    show();
    return false;
  }
  analyseInk(image, attachmentId).then(result => {
    if (result.url) {
      image.dataset.fit = 'trimmed';
      image.src = result.url;
      return;
    }
    if (result.readable) finish();
    show();
  }).catch(show);
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
