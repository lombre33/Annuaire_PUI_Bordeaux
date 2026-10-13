// Affichage de l'habillage : les logos (une image, ou le nom en texte quand le logo
// manque ou ne se charge pas) et les fondateurs du bandeau du bas. branding.js décide
// quoi montrer, attachments.js donne les adresses des fichiers ; ici on ne construit que
// le DOM, avec textContent. Les financeurs sont deux images fixes de index.html.

import { BAND_LOGO, CARD_LOGO, PUI_URL } from './constants.js';
import { logoSize, inkBounds, hasInk } from './branding.js';

export const HOLD_LIMIT_MS = 5000; // un logo que retient onLoad se montre au plus tard après ce délai (plus que ANALYSIS_TIMEOUT_MS)
export const PRELOAD_LIMIT_MS = 5000; // une tentative de chargement à part qui n'a rien rendu après ce délai est comptée perdue
export const STALL_LIMIT_MS = 8000; // un logo préchargé qui n'a ni chargé ni échoué après ce délai laisse la place au nom
const PRELOAD_TRIES = 3; // tentatives de chargement à part d'un logo (la 1re, puis sous une autre adresse, voir preload)
const RETRY_FAILED_MS = 30 * 1000; // un logo qui a échoué n'est pas redemandé à Grist plus souvent que ça

// Chaque logo d'établissement est chargé UNE fois, à part, dans une image que ce module garde : le chargement ne dépend
// ni des cartes (elles sont toutes redessinées à chaque filtre, à chaque édition dans Grist, à l'arrivée de l'identité),
// ni du ramasse-miettes. Firefox annule (NS_BINDING_ABORTED) la demande d'une image qu'on retire du document avant sa fin
// et en recommence une autre : si le document se redessine plus vite que Grist ne répond, aucun logo n'arrive jamais
// (retour d'Antoine du 13 octobre 2026). Les cartes ne reçoivent l'adresse de leur logo qu'une fois ce chargement fini :
// il est alors en mémoire et leur image s'affiche aussitôt, quel que soit le nombre de rendus.
//   attachments -> Map(identifiant de la pièce jointe -> { image, result, settledAt, settled })
//   result      { ok: true, url } ou { ok: false, cause } où cause vaut 'token', 'file' ou 'late'
const preloads = new WeakMap();
const RETRY_PARAM = 'annuaire_retry'; // une autre adresse pour la même pièce jointe : Grist ignore le paramètre (comme PROBE_PARAM)

function entriesOf(attachments) {
  if (!preloads.has(attachments)) preloads.set(attachments, new Map());
  return preloads.get(attachments);
}

// La même adresse, avec un paramètre de plus que Grist ignore : le navigateur la traite comme un autre fichier. Une adresse
// qui n'est pas celle d'un serveur (une image en data:) est gardée telle quelle.
function withParam(source, name) {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return source;
    url.searchParams.set(name, '1');
    return url.href;
  } catch {
    return source;
  }
}

// Une tentative : 'load', 'error' ou 'late' (ni l'un ni l'autre dans PRELOAD_LIMIT_MS). Son image reste celle de l'entrée,
// donc en vie tant que la page vit : une tentative perdue peut encore aboutir, sans conséquence.
function attempt(entry, url) {
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    entry.images.push(image);
    const timer = setTimeout(() => resolve('late'), PRELOAD_LIMIT_MS);
    image.addEventListener('load', () => { clearTimeout(timer); resolve('load'); });
    image.addEventListener('error', () => { clearTimeout(timer); resolve('error'); });
    image.src = url;
  });
}

// Jusqu'à PRELOAD_TRIES tentatives. Une image en erreur ou sans réponse a pu être victime du navigateur ou d'un jeton
// expiré : si Grist donne un autre jeton (refresh), la suivante l'emploie ; sinon elle demande le même fichier sous une
// autre adresse (withParam), pour ne pas retomber sur une réponse ratée gardée en cache.
async function preload(attachments, id, entry) {
  if (!attachments.url(id) && !await attachments.ready()) return { ok: false, cause: 'token' };
  let otherAddress = false;
  let cause = 'file';
  for (let tries = 0; tries < PRELOAD_TRIES; tries += 1) {
    const base = attachments.url(id);
    if (!base) return { ok: false, cause: 'token' };
    const url = otherAddress ? withParam(base, RETRY_PARAM) : base;
    const outcome = await attempt(entry, url);
    if (outcome === 'load') return { ok: true, url };
    cause = outcome === 'late' ? 'late' : 'file';
    if (!await attachments.refresh(base)) otherAddress = true;
  }
  return { ok: false, cause };
}

// Le chargement à part du logo `id` : une promesse qui rend { ok: true, url } (l'adresse à donner aux images) ou
// { ok: false, cause }. Une seule par logo, partagée par toutes les images qui l'attendent ; un échec est gardé
// RETRY_FAILED_MS, pour ne pas solliciter à chaque rendu un Grist qui vient de refuser.
function preloadLogo(attachments, id) {
  const entries = entriesOf(attachments);
  const known = entries.get(id);
  if (known && (!known.result || known.result.ok || Date.now() - known.settledAt < RETRY_FAILED_MS)) return known.settled;
  const entry = { images: [], result: null, settledAt: 0, settled: null };
  entry.settled = preload(attachments, id, entry).then(result => {
    entry.result = result;
    entry.settledAt = Date.now();
    return result;
  });
  entries.set(id, entry);
  return entry.settled;
}

// Ce que la console dit des logos chargés à part : combien, et ce qu'il en est advenu. Aucune adresse, aucun jeton.
export function logoStats(attachments) {
  const stats = { asked: 0, loaded: 0, refused: 0, late: 0, token: 0, pending: 0 };
  entriesOf(attachments).forEach(({ result }) => {
    stats.asked += 1;
    if (!result) stats.pending += 1;
    else if (result.ok) stats.loaded += 1;
    else if (result.cause === 'file') stats.refused += 1;
    else if (result.cause === 'late') stats.late += 1;
    else stats.token += 1;
  });
  return stats;
}

// Un logo : une <img> invisible tant qu'elle n'est pas chargée (ni cadre cassé ni texte
// alternatif qui clignote). Quand Grist ne donne pas le fichier (pas de jeton, fichier
// supprimé ou illisible), `onFail(cause)` remplace le logo par le nom, une seule fois. Une
// image en erreur est d'abord retentée avec un jeton renouvelé : il a pu expirer
// pendant que la page restait ouverte. Les photos de profil (avatar-ui.js) passent par ici aussi.
//   eager   charger tout de suite (les logos de l'en-tête et du pied de page) ; sinon
//           l'image attend d'approcher de l'écran, comme celles des cartes
//   preload charger le fichier d'abord à part, une fois pour toutes les images qui le montrent (preloadLogo) : pour les
//           logos d'établissement, jamais pour les photos de profil, qui sont des centaines et n'arrivent qu'à l'approche de
//           l'écran. L'image est alors chargée sans attendre l'écran (le fichier est déjà là), et si rien n'est arrivé
//           STALL_LIMIT_MS après sa demande, `onFail('late')` : un logo ne reste jamais invisible pour de bon
//   onLoad  appelé avec l'image et `show` (qui la rend visible) dès qu'elle est chargée, avant qu'elle ne
//           devienne visible ; s'il renvoie false, l'image reste cachée jusqu'à ce que l'appelant appelle `show`,
//           que son prochain chargement la montre, ou que `holdLimit` ms soient passées : un onLoad qui plante ou
//           qui oublie `show` ne cache jamais un logo pour de bon
// `onFail` reçoit la cause : 'token' (pas de jeton, aucune demande n'a eu lieu), 'file' (Grist n'a pas donné le fichier) ou
// 'late' (la demande n'a jamais abouti).
// L'image qu'on voit se demande toujours comme une image ordinaire, sans CORS, et son affichage ne dépend jamais de
// la lecture de ses pixels : un Grist qui ne la donnerait pas en CORS, ou un navigateur qui bride cette lecture, ne doit
// jamais faire disparaître un logo (1.25.2, 1.26.1). Lire ses pixels, c'est à fitCardLogo de le tenter, sur une copie à part.
export function createLogoImage(attachments, attachmentId, alt, onFail, { eager = false, preload: shared = false, onLoad, holdLimit = HOLD_LIMIT_MS } = {}) {
  const image = document.createElement('img');
  image.className = 'logo-img';
  image.alt = alt;
  image.decoding = 'async';
  image.loading = eager || shared ? 'eager' : 'lazy';
  image.draggable = false;
  // L'adresse de la page du widget n'a pas à être envoyée au serveur de Grist.
  image.referrerPolicy = 'no-referrer';

  let failed = false;
  let retried = false;
  let requested = '';
  let stall = 0;
  const fail = reason => {
    clearTimeout(stall);
    if (failed) return;
    failed = true;
    onFail(reason);
  };
  // `url` : l'adresse que le chargement à part a déjà fait aboutir ; sans elle, celle que Grist donne maintenant.
  const assign = url => {
    requested = url || attachments.url(attachmentId) || '';
    if (requested) {
      if (shared) {
        clearTimeout(stall);
        stall = setTimeout(() => fail('late'), STALL_LIMIT_MS);
      }
      image.src = requested;
    }
    return requested !== '';
  };

  const show = () => image.classList.add('loaded');
  image.addEventListener('load', () => {
    clearTimeout(stall);
    let held = false;
    try {
      held = onLoad?.(image, show) === false;
    } catch (error) {
      console.error('[LOGOS] Erreur en préparant un logo :', error);
    }
    if (held) setTimeout(show, holdLimit);
    else show();
  });
  image.addEventListener('error', async () => {
    clearTimeout(stall);
    if (failed) return;
    if (retried) {
      fail('file');
      return;
    }
    retried = true;
    // refresh dit faux quand l'erreur ne vient pas du jeton (le fichier lui-même : supprimé, refusé par une règle d'accès).
    if (!await attachments.refresh(requested)) fail('file');
    else if (!assign()) fail('token');
  });

  const begin = url => {
    if (!assign(url)) {
      attachments.ready().then(ready => {
        if (!ready || !assign()) fail('token');
      });
    }
  };
  if (!shared) {
    begin();
  } else {
    preloadLogo(attachments, attachmentId).then(result => {
      if (failed) return;
      if (result.ok) begin(result.url);
      else fail(result.cause);
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
// C'est une amélioration qui s'ajoute à un logo déjà chargé, jamais une condition de son affichage (1.27.2) : la lecture
// se fait sur une copie du fichier demandée à part, en CORS (sans CORS, le navigateur interdit de lire les pixels), et
// l'image qu'on voit reste une image ordinaire. Un logo dont les pixels ne se lisent pas (Grist ne le donne pas en
// CORS, le navigateur bride le canvas, la lecture tarde) se montre quand même, dans la case de style.css.
const ANALYSIS_SIDE = 256; // côté le plus long de l'image sur laquelle l'encre est cherchée
const COPY_SIDE = 320; // côté le plus long de la copie recadrée
const NO_MARGIN = 0.97; // une encre qui occupe déjà 97 % de l'image dans les deux sens n'est pas recadrée
export const ANALYSIS_TIMEOUT_MS = 3000; // une lecture plus longue est abandonnée : le logo reste tel quel
export const FIT_GATE_MS = 400; // le logo chargé attend sa lecture au plus ce temps, puis se montre tel quel
const PROBE_PARAM = 'annuaire_pixels'; // distingue la lecture des pixels de l'image affichée (probeUrl)
const UNREADABLE = { readable: false, url: null };
const analyses = new Map(); // identifiant de la pièce jointe -> Promise<{ readable, url }>

// Pourquoi les pixels d'un logo ne se lisent pas, dit une seule fois par cause dans la console (sans adresse : elle porte le jeton).
const WHY = {
  refused: 'Grist ne donne pas les pièces jointes en CORS, ou le fichier a été refusé',
  late: 'Grist n\'a pas répondu à temps à la demande CORS',
  unsized: 'un logo n\'a pas de dimensions connues, comme un SVG sans width ni height',
  blocked: 'le navigateur interdit de lire les pixels d\'une image ou les brouille'
};
const explained = new Set();
function explain(reason) {
  if (explained.has(reason)) return;
  explained.add(reason);
  console.warn(`[LOGOS] Les pixels d'un logo ne se lisent pas (${WHY[reason]}) : les logos des cartes se montrent tels quels, `
    + 'dans leur case, sans égalisation de taille.');
}

function readInk(image) {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!(width > 0 && height > 0)) return { ...UNREADABLE, reason: 'unsized' };
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
    if (!hasInk(copyContext.getImageData(0, 0, copy.width, copy.height).data)) return { ...UNREADABLE, reason: 'blocked' };
    return { readable: true, url: copy.toDataURL('image/png') };
  } catch {
    return { ...UNREADABLE, reason: 'blocked' };
  }
}

// Une adresse distincte de celle de l'image affichée, que Grist traite comme elle (il ignore le paramètre) : l'image affichée
// vient d'être chargée sans CORS, et la réponse que le cache en garde (Grist la garde une heure, sans `Vary: Origin`) n'a
// pas les en-têtes CORS ; la même adresse redemandée en CORS y serait prise puis refusée. Une adresse qui n'est pas
// celle d'un serveur (une image en data:) est gardée telle quelle.
function probeUrl(source) {
  return withParam(source, PROBE_PARAM);
}

// La lecture d'un logo, une seule fois par pièce jointe : toutes les cartes d'un même établissement attendent la même.
// Le fichier est redemandé à Grist dans une image à part, en CORS (seule façon d'en lire les pixels). Elle ne répond
// jamais d'une erreur : refusée, illisible ou trop lente, la lecture rend { readable: false } avec sa cause.
function analyseInk(image, attachmentId) {
  if (!analyses.has(attachmentId)) {
    analyses.set(attachmentId, new Promise(resolve => {
      const copy = new Image();
      copy.crossOrigin = 'anonymous';
      copy.referrerPolicy = 'no-referrer';
      const finish = result => {
        clearTimeout(timer);
        copy.onload = copy.onerror = null;
        if (!result.readable) explain(result.reason);
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ...UNREADABLE, reason: 'late' }), ANALYSIS_TIMEOUT_MS);
      copy.onload = () => finish(readInk(copy));
      copy.onerror = () => finish({ ...UNREADABLE, reason: 'refused' });
      copy.src = probeUrl(image.currentSrc || image.src);
    }));
  }
  return analyses.get(attachmentId);
}

// À appeler au chargement (onLoad de createLogoImage) d'un logo de carte, avec le `show` qu'il reçoit. Renvoie
// toujours false : c'est elle qui montre le logo. Elle l'attend au plus FIT_GATE_MS pour qu'il apparaisse tout de suite à sa
// taille (recadré, ou tel quel s'il n'a pas de marges) ; passé ce délai, ou si la lecture échoue, il se montre dans la
// case de style.css, et sa copie recadrée le remplace s'il le faut quand la lecture finit. Recadré, il est remplacé par
// sa copie, dont le chargement appelle de nouveau cette fonction. `data-logo` dit où en est le logo une fois la lecture
// finie : `sized` (il a sa taille, de même surface que les autres) ou `box` (il reste dans la case, ses pixels ne se lisent pas).
export function fitCardLogo(image, attachmentId, show) {
  const reveal = () => show?.();
  const finish = () => {
    sizeLogo(image, CARD_LOGO);
    const sized = image.classList.contains('sized');
    image.parentElement?.classList.toggle('fitted', sized);
    image.dataset.logo = sized ? 'sized' : 'box';
  };
  if (image.dataset.fit === 'trimmed') {
    finish();
    reveal();
    return false;
  }
  const gate = setTimeout(reveal, FIT_GATE_MS);
  analyseInk(image, attachmentId).then(result => {
    clearTimeout(gate);
    if (result.url) {
      image.dataset.fit = 'trimmed';
      image.src = result.url;
      return;
    }
    if (result.readable) finish();
    else image.dataset.logo = 'box';
    reveal();
  }).catch(() => {
    clearTimeout(gate);
    image.dataset.logo = 'box';
    reveal();
  });
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
  holder.append(createLogoImage(attachments, logo, name, () => holder.replaceChildren(asName()), { eager: true, preload: true, onLoad }));
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
