// Habillage de l'annuaire : logos des établissements (cartes et bandeau des
// fondateurs) et des financeurs, lus dans Etablissements et dans la table
// facultative Financeurs (constants.js, BRANDING). Rien ici ne touche le DOM ni
// Grist : on reçoit des lignes déjà lues, branding-ui.js construit l'affichage.
//
// Tout est facultatif. Une colonne ou une table absente donne simplement une liste
// vide ou un établissement sans logo, jamais une erreur : le widget s'affiche comme
// avant, avec les noms à la place des logos.

import { BRANDING, CATEGORIES } from './constants.js';
import { attachmentIds } from './attachments.js';
import { normalize, pickLabel, refId, text } from './grist-data.js';

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

// Les financeurs de la table Financeurs, triés par `ordre`. `rows` vaut null quand
// la table n'existe pas ou ne se lit pas : pas de financeurs, et pas d'erreur.
function fundersOf(rows) {
  if (!Array.isArray(rows)) return [];
  return sortByOrder(rows
    .map(row => ({
      id: row.id,
      name: text(row[BRANDING.funderNameColumn]),
      logo: firstAttachment(row[BRANDING.funderLogoColumn]),
      order: orderOf(row[BRANDING.funderOrderColumn])
    }))
    .filter(funder => funder.name || funder.logo));
}

// `etablissementRows` : lignes d'Etablissements ; `financeurRows` : lignes de
// Financeurs, ou null si la table est absente. Renvoie :
//   founders   les fondateurs du bandeau du bas, dans l'ordre : { id, label, name, logo }
//   funders    les financeurs, dans l'ordre : { id, name, logo }
//   roundel    le financeur dont le logo ferme le bandeau du bas, ou null
//   logos      le logo de chaque établissement, pour les cartes (voir logoForContact)
//   signature  texte qui change quand l'affichage doit changer : permet de ne pas
//              reconstruire (et faire clignoter) les logos à chaque lecture de Grist
export function buildBranding({ etablissementRows = [], financeurRows = null } = {}) {
  const founders = foundersOf(etablissementRows);
  const funders = fundersOf(financeurRows);
  const roundelName = normalize(BRANDING.roundelFunder);
  const roundel = funders.find(funder => normalize(funder.name) === roundelName) ?? null;
  return {
    founders,
    funders,
    roundel,
    logos: logosOf(etablissementRows),
    signature: JSON.stringify([founders, funders, roundel])
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
