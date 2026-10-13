// Habillage de l'annuaire : logos des établissements (cartes et bandeau des
// fondateurs), lus dans Etablissements (constants.js, BRANDING). Rien ici ne touche le
// DOM ni Grist : on reçoit des lignes déjà lues, branding-ui.js construit l'affichage.
// Les financeurs n'en dépendent pas : leur visuel et le rond France 2030 sont deux
// images fixes du dépôt (assets/, index.html).
//
// Tout est facultatif. Une colonne absente donne simplement un établissement sans logo,
// jamais une erreur : le widget s'affiche comme avant, avec les noms à la place des logos.

import { BRANDING, CATEGORIES } from './constants.js';
import { attachmentIds } from './attachments.js';
import { pickLabel, refId, text } from './grist-data.js';

const LABEL_FIELDS = CATEGORIES.etablissement.field; // acronyme, sinon nom complet

// Un numéro d'ordre vaut à partir de 1 : une cellule Numérique vide vaut parfois 0
// (voir isBlank dans grist-data.js). Sans numéro valable, l'élément passe après ceux
// qui en ont un, dans l'ordre de la table.
function orderOf(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Infinity;
}

function sortByOrder(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.order === b.item.order ? a.index - b.index : a.item.order < b.item.order ? -1 : 1))
    .map(({ item }) => item);
}

// Premier fichier d'une cellule « Pièces jointes », ou null.
function firstAttachment(cell) {
  return attachmentIds(cell)[0] ?? null;
}

// Les établissements fondateurs du bandeau du bas : fondateur ET ok_pour_apparaitre (un
// établissement qui n'a pas validé sa présence n'apparaît nulle part), triés par
// ordre_bandeau.
function foundersOf(rows) {
  return sortByOrder(rows
    .filter(row => row.fondateur === true && row.ok_pour_apparaitre === true)
    .map(row => {
      const label = pickLabel(row, LABEL_FIELDS);
      return {
        id: row.id,
        label,
        name: text(row.nom_complet) || label,
        logo: firstAttachment(row[BRANDING.logoColumn]),
        order: orderOf(row[BRANDING.bandOrderColumn])
      };
    })
    .filter(founder => founder.label || founder.name));
}

// Le logo de chaque établissement, pour les cartes : retrouvé par l'identifiant de
// ligne que porte BDD.Etablissement, ou par le libellé quand Grist a déjà résolu la
// Référence en texte (comme etablissementFlags dans grist-data.js). Deux lignes de
// même libellé : la première qui a un logo.
function logosOf(rows) {
  const byId = new Map();
  const byLabel = new Map();
  rows.forEach(row => {
    if (row.id === null || row.id === undefined) return;
    const label = pickLabel(row, LABEL_FIELDS);
    const entry = { logo: firstAttachment(row[BRANDING.logoColumn]), name: text(row.nom_complet) || label };
    byId.set(String(row.id), entry);
    const known = byLabel.get(label);
    if (label && (!known || (!known.logo && entry.logo))) byLabel.set(label, entry);
  });
  return { byId, byLabel };
}

// `etablissementRows` : lignes d'Etablissements. Renvoie :
//   founders   les fondateurs du bandeau du bas, dans l'ordre : { id, label, name, logo }
//   logos      le logo de chaque établissement, pour les cartes (voir logoForContact)
//   signature  texte qui change quand l'affichage doit changer : permet de ne pas
//              reconstruire (et faire clignoter) les logos à chaque lecture de Grist
export function buildBranding({ etablissementRows = [] } = {}) {
  const founders = foundersOf(etablissementRows);
  return {
    founders,
    logos: logosOf(etablissementRows),
    signature: JSON.stringify(founders)
  };
}

// Logo et nom de l'établissement d'un contact : { logo, name }, où `logo` est
// l'identifiant du fichier ou null. null si l'établissement n'est pas dans les lignes
// lues (la carte garde alors la pastille texte).
export function logoForContact(branding, contact) {
  const id = refId(contact.Etablissement);
  const label = typeof contact.Etablissement === 'string' ? text(contact.Etablissement) : text(contact.etablissement_label);
  return (id && branding.logos.byId.get(String(id))) || (label && branding.logos.byLabel.get(label)) || null;
}

// Taille d'un logo de même poids visuel que ses voisins : on vise une surface, répartie
// selon les proportions du logo (un logo large est plus large et moins haut qu'un logo
// carré, de même surface), puis bornée en hauteur et en largeur. C'est ce qui donne à une
// rangée de logos de formes différentes l'aspect d'un bandeau dessiné à la main.
// `ratio` : largeur / hauteur du fichier. Renvoie { width, height } dans l'unité des
// limites, ou null si les proportions sont inconnues (SVG sans dimensions, par exemple).
export function logoSize(ratio, { area, maxWidth, maxHeight }) {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  let width = Math.sqrt(area * ratio);
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  return { width, height };
}

// Un pixel qui ne fait pas partie du logo : transparent, ou à peu près blanc (le fond d'un JPEG, d'un PNG sans transparence).
const MIN_ALPHA = 24;
const NEAR_WHITE = 235;
const isClear = (pixels, index) => pixels[index + 3] < MIN_ALPHA
  || Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) >= NEAR_WHITE;

// Il y a quelque chose à voir : un pixel au moins n'est ni transparent ni à peu près blanc.
export function hasInk(pixels) {
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (!isClear(pixels, index)) return true;
  }
  return false;
}

// Le plus petit rectangle qui contient tout ce qui se voit d'un logo, sans ses marges transparentes ou blanches.
// `pixels` : les octets RGBA de l'image (getImageData), `width` et `height` ses dimensions. Renvoie
// { x, y, width, height }, ou null quand il n'y a rien à retirer : une image dont un coin porte une couleur
// (le fond fait alors partie du logo) ou une image vide.
export function inkBounds(pixels, width, height) {
  if (!(width > 0 && height > 0) || pixels.length < width * height * 4) return null;
  const last = width * height - 1;
  if (![0, width - 1, last - (width - 1), last].every(pixel => isClear(pixels, pixel * 4))) return null;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isClear(pixels, (y * width + x) * 4)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  if (right < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
