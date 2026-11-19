// Les domaines d'adresse e-mail autorisés (1.45.0, Antoine, 19 novembre 2026) : une personne qui n'est pas encore dans l'annuaire ne peut
// créer sa fiche que si le domaine de son adresse est celui d'un établissement (la colonne facultative d'`Etablissements` que nomme ETABLISSEMENT_DOMAIN_COLUMN, constants.js,
// ETABLISSEMENT_DOMAIN_COLUMN). Ce n'est qu'un contrôle d'interface : seules les règles d'accès de Grist protègent vraiment les données, et
// la validation d'un administrateur reste la barrière (GRIST_SETUP.md). Sans DOM ni Grist : des fonctions pures, essayées sans navigateur.

import { ETABLISSEMENT_DOMAIN_COLUMN } from './constants.js';
import { listItems, normalizeEmail, text } from './grist-data.js';

// Un nom de domaine : des étiquettes de lettres, chiffres et tirets séparées par des points, terminées par au moins deux lettres.
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
// Ce qui sépare plusieurs domaines dans une cellule : espaces, retours à la ligne, virgules, points-virgules, barres.
const SEPARATORS = /[\s,;|]+/;

// Un domaine tel qu'une personne l'écrit à la main (« @U-Bordeaux.fr », « https://www.u-bordeaux.fr/ », « *.chu-bordeaux.fr ») ramené à sa forme
// de comparaison (« u-bordeaux.fr »), ou '' quand ce n'en est pas un (« n/a », « sans objet »).
export function cleanDomain(value) {
  const domain = text(value).toLowerCase()
    .replace(/^mailto:/, '')
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^[@*.]+/, '')
    .replace(/^www\./, '')
    .replace(/\.+$/, '');
  return DOMAIN.test(domain) ? domain : '';
}

// Les domaines d'une cellule d'Etablissements : un texte (un ou plusieurs domaines) ou une liste. Sans doublon, sans ce qui n'est pas un domaine.
export function domainsOf(cell) {
  const items = Array.isArray(cell) ? listItems(cell) : [cell];
  return [...new Set(items.flatMap(item => text(item).split(SEPARATORS)).map(cleanDomain).filter(Boolean))];
}

// Le domaine d'une adresse e-mail, en minuscules ('' quand ce n'est pas une adresse).
export function emailDomain(email) {
  const mail = normalizeEmail(email);
  const at = mail.lastIndexOf('@');
  return at > 0 && at < mail.length - 1 ? mail.slice(at + 1) : '';
}

// Un domaine d'adresse est celui de l'établissement s'il est identique à l'un des siens ou en est un sous-domaine (« etu.u-bordeaux.fr »
// pour « u-bordeaux.fr »), jamais l'inverse ni un nom qui se termine pareil sans point (« mon-u-bordeaux.fr »).
export const domainMatches = (domain, listed) => domain !== '' && listed.some(known => domain === known || domain.endsWith(`.${known}`));

// Les établissements que l'adresse d'une personne lui permet de choisir : { readable, ids, domain }.
//   readable  la colonne des domaines existe dans Etablissements (une table vide ne permet pas de le savoir : faux)
//   ids       les identifiants de ligne des établissements dont un domaine est celui de l'adresse
//   domain    le domaine de l'adresse
// Fermé par défaut : sans colonne lisible, aucun établissement n'est autorisé.
export function etablissementsForEmail(email, etablissementRows) {
  const domain = emailDomain(email);
  const rows = Array.isArray(etablissementRows) ? etablissementRows : [];
  const readable = rows.length > 0 && ETABLISSEMENT_DOMAIN_COLUMN in rows[0];
  if (!readable || !domain) return { readable, ids: [], domain };
  const ids = rows
    .filter(row => Number.isInteger(row.id) && domainMatches(domain, domainsOf(row[ETABLISSEMENT_DOMAIN_COLUMN])))
    .map(row => row.id);
  return { readable, ids, domain };
}
