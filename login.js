// Se connecter à Grist depuis le widget (1.44.0) : l'adresse de la page de connexion de Grist, d'où la personne revient sur la page de
// l'annuaire. Un visiteur sans compte (lien public, identity.js : status 'anonymous') voit l'annuaire en lecture seule ; la fenêtre
// de login-ui.js lui propose cette adresse. Même méthode que le widget « agenda partagé » : l'adresse de l'API du document donne l'hôte,
// l'équipe et l'identifiant du document, dont on tire `<hôte>[/o/<équipe>]/login?next=<page du document>`.
//
// Le widget est dans un cadre : Grist n'y laisse pas voir l'adresse de la page qui le porte, et en mode `?style=singlePage` il cache
// son propre bouton « Se connecter ». Le numéro de la page de l'annuaire se donne donc dans l'adresse du widget (`…/index.html?page=7`,
// GRIST_SETUP.md) ; sans lui, la personne est ramenée à la première page du document.

import { LOGIN_RETURN_STYLE } from './constants.js';

// L'adresse de l'API d'un document : https://hôte[/o/équipe]/api/docs/identifiant (celle que getAccessToken renvoie en `baseUrl`).
const API_ADDRESS = /^(.*)\/api\/docs\/([\w~-]+)\/?$/;
// Un numéro de page de Grist : des chiffres, rien d'autre (il finit dans une adresse).
const PAGE_NUMBER = /^\d{1,6}$/;

// Le numéro de la page de l'annuaire, donné dans l'adresse du widget (`?page=7`) ; '' s'il manque ou s'il n'est pas un nombre.
// `search` : la partie de l'adresse après le « ? » (`location.search`).
export function pageNumberOf(search) {
  try {
    const value = new URLSearchParams(search || '').get('page') ?? '';
    return PAGE_NUMBER.test(value) ? value : '';
  } catch {
    return '';
  }
}

// La page de connexion de Grist d'après l'adresse de l'API du document, avec retour sur la page de l'annuaire (`page`) en style
// `style` ; '' si cette adresse n'est pas celle qu'on attend (le widget ne propose alors aucun lien). Grist ajoute lui-même le
// préfixe de l'équipe (`/o/<équipe>`) au chemin de retour : on ne l'y met pas. « x » tient la place du nom de la page, que Grist
// remplace par le vrai.
export function loginUrl(apiAddress, { page = '', style = LOGIN_RETURN_STYLE } = {}) {
  let url;
  try {
    url = new URL(apiAddress);
  } catch {
    return '';
  }
  const match = url.pathname.match(API_ADDRESS);
  if (!match || !/^https?:$/.test(url.protocol)) return '';
  const [, prefix, doc] = match;
  const path = PAGE_NUMBER.test(page) ? `/${doc}/x/p/${page}` : `/${doc}`;
  const target = style ? `${path}?style=${encodeURIComponent(style)}` : path;
  return `${url.origin}${prefix}/login?next=${encodeURIComponent(target)}`;
}

// L'adresse de connexion du document ouvert : l'adresse de l'API vient de Grist (getAccessToken). '' si Grist refuse le jeton, n'a pas
// cette méthode ou donne une adresse inattendue : la console le dit, la fenêtre explique alors la connexion sans lien. Ne lève jamais.
export async function findLoginUrl(docApi, { search = '', log = console } = {}) {
  try {
    const { baseUrl } = await docApi.getAccessToken({ readOnly: true });
    const url = loginUrl(baseUrl, { page: pageNumberOf(search) });
    if (!url) log.warn('[CONNEXION] l\'adresse de l\'API du document n\'a pas la forme attendue : pas de lien vers la connexion de Grist.');
    return url;
  } catch (error) {
    log.warn(`[CONNEXION] adresse de connexion introuvable : ${error?.message || error}`);
    return '';
  }
}
