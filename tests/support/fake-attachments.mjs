// Pièces jointes du faux document Grist pour les tests navigateur : les logos. Le widget
// les demande à l'adresse que donne getAccessToken (FAKE_ATTACHMENTS_URL) ; ce module
// répond à sa place, sans réseau, avec une image dessinée à la demande.
//
// Le fichier N est un SVG dont les proportions dépendent de N (de 60 x 30 à 180 x 50),
// pour que les logos aient des formes différentes comme les vrais. Des fichiers
// particuliers simulent les cas limites :
//   TALL_FILE      un logo en hauteur (40 x 120)
//   WIDE_FILE      une bannière très large (300 x 30)
//   UNSIZED_FILE   un SVG qui n'a qu'un viewBox, sans width ni height (100 x 50)
//   MISSING_FILE   le serveur répond 404 (fichier supprimé)
//   BROKEN_FILE    le serveur répond 200 mais le contenu n'est pas une image

import { FAKE_ATTACHMENTS_URL } from './fake-grist.js';

export const MISSING_FILE = 999;
export const BROKEN_FILE = 998;
export const TALL_FILE = 997;
export const WIDE_FILE = 996;
export const UNSIZED_FILE = 995;

const SPECIAL_SIZES = {
  [TALL_FILE]: { width: 40, height: 120 },
  [WIDE_FILE]: { width: 300, height: 30 },
  [UNSIZED_FILE]: { width: 100, height: 50 }
};

// Dimensions du logo N, de façon que les tests puissent calculer ce qu'ils attendent.
export function fakeLogoSize(id) {
  return SPECIAL_SIZES[id] ?? { width: 60 + (id % 7) * 20, height: 30 + (id % 3) * 10 };
}

function logoSvg(id) {
  const { width, height } = fakeLogoSize(id);
  const size = id === UNSIZED_FILE ? '' : ` width="${width}" height="${height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" rx="6" fill="hsl(${(id * 47) % 360} 55% 45%)"/>`
    + `<text x="50%" y="55%" fill="#fff" font-family="sans-serif" font-size="14" text-anchor="middle">${id}</text></svg>`;
}

const PATH = new URL(FAKE_ATTACHMENTS_URL).pathname;

// Répond aux téléchargements de pièces jointes d'un contexte Playwright. Renvoie
// { hits } : le nombre de téléchargements demandés par fichier, et les jetons reçus.
export async function routeAttachments(context) {
  const record = { hits: {}, tokens: [] };
  await context.route(url => url.origin === new URL(FAKE_ATTACHMENTS_URL).origin && url.pathname.startsWith(`${PATH}/attachments/`), route => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split('/').at(-2));
    record.hits[id] = (record.hits[id] ?? 0) + 1;
    record.tokens.push(url.searchParams.get('auth'));
    if (id === MISSING_FILE) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    if (id === BROKEN_FILE) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'ceci n\'est pas une image' });
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: logoSvg(id) });
  });
  return record;
}
