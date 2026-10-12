// Pièces jointes du faux document Grist pour les tests navigateur : les logos. Le widget
// les demande à l'adresse que donne getAccessToken (FAKE_ATTACHMENTS_URL) ; ce module
// répond à sa place, sans réseau, avec une image dessinée à la demande.
//
// Le fichier N est un SVG dont les proportions dépendent de N (de 60 x 30 à 180 x 50),
// pour que les logos aient des formes différentes comme les vrais. Des fichiers
// particuliers simulent les cas limites :
//   PORTRAIT_FIRST à +99  des photos de profil (256 x 256), de couleur différente selon le numéro
//   TALL_FILE      un logo en hauteur (40 x 120)
//   WIDE_FILE      une bannière très large (300 x 30)
//   UNSIZED_FILE   un SVG qui n'a qu'un viewBox, sans width ni height (100 x 50)
//   MISSING_FILE   le serveur répond 404 (fichier supprimé)
//   BROKEN_FILE    le serveur répond 200 mais le contenu n'est pas une image
//
// Il reçoit aussi les envois de fichiers (POST <adresse>/attachments?auth=<jeton>, le logo d'un
// établissement, la photo de profil d'une personne) : le fichier est gardé, reçoit l'identifiant suivant (à partir de FIRST_UPLOAD_ID)
// et se télécharge ensuite comme les autres. `upload` règle la réponse du serveur :
//   mode   'ok' (défaut), 'denied' (403), 'too-large' (413), 'error' (500), 'bad-answer' (200 sans
//          identifiant), 'unreachable' (la connexion échoue)
//   cors   faux : la réponse n'a pas les en-têtes CORS, le navigateur la refuse au widget (le fichier
//          est pourtant gardé par le serveur : `uploads[n].id` et les téléchargements le montrent)
//   delay  millisecondes d'attente avant de répondre

import { FAKE_ATTACHMENTS_URL } from './fake-grist.js';

export const FIRST_UPLOAD_ID = 2000;
export const MISSING_FILE = 999;
export const BROKEN_FILE = 998;
export const TALL_FILE = 997;
export const WIDE_FILE = 996;
export const UNSIZED_FILE = 995;
// Les photos de profil des tests : les fichiers 500 à 599 sont des portraits carrés.
export const PORTRAIT_FIRST = 500;
const isPortrait = id => id >= PORTRAIT_FIRST && id < PORTRAIT_FIRST + 100;

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

// Six illustrations de visages, les mêmes que celles de la maquette v5 (de simples dessins, pas de
// vraies personnes) : { fond, peau, haut, cheveux, longs }.
const PORTRAITS = [
  { bg: '#dbeafe', skin: '#f2c9a0', shirt: '#6257d9', hair: '#3b2a20', long: false },
  { bg: '#fde7d9', skin: '#c68a62', shirt: '#1ba99a', hair: '#1b1b1f', long: true },
  { bg: '#e8e6ff', skin: '#f5d3b3', shirt: '#d85b9d', hair: '#8a5a2b', long: true },
  { bg: '#dff5ef', skin: '#8d5a3b', shirt: '#172033', hair: '#141414', long: false },
  { bg: '#fff3d6', skin: '#ecbf97', shirt: '#f28a54', hair: '#d9a441', long: false },
  { bg: '#e9ecf5', skin: '#d9a581', shirt: '#4f8ee8', hair: '#5b3a29', long: true }
];

function portraitSvg(id) {
  const { bg, skin, shirt, hair, long } = PORTRAITS[(id - PORTRAIT_FIRST) % PORTRAITS.length];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 120 120">'
    + `<rect width="120" height="120" fill="${bg}"/>`
    + (long ? `<ellipse cx="60" cy="58" rx="25" ry="31" fill="${hair}"/>` : '')
    + `<path d="M16 120c2-26 22-38 44-38s42 12 44 38z" fill="${shirt}"/><rect x="52" y="64" width="16" height="22" rx="7" fill="${skin}"/>`
    + `<ellipse cx="60" cy="52" rx="18" ry="21" fill="${skin}"/><path d="M41 50c-1-17 9-27 20-27 13 0 21 9 19 27-4-7-10-11-19-11s-15 4-20 11z" fill="${hair}"/></svg>`;
}

const ORIGIN = new URL(FAKE_ATTACHMENTS_URL).origin;
const PATH = new URL(FAKE_ATTACHMENTS_URL).pathname;

// Le fichier d'un envoi multipart : { field, fileName, contentType, bytes }. Les octets sont lus en
// latin1 pour que la position dans le texte soit celle dans le fichier.
function readUpload(request) {
  const boundary = /boundary=(.+)$/.exec(request.headers()['content-type'] ?? '')?.[1];
  const body = request.postDataBuffer();
  if (!boundary || !body) return null;
  const text = body.toString('latin1');
  const start = text.indexOf(`--${boundary}`);
  const headerEnd = text.indexOf('\r\n\r\n', start);
  const end = text.indexOf(`\r\n--${boundary}`, headerEnd + 4);
  if (start < 0 || headerEnd < 0 || end < 0) return null;
  const head = text.slice(start, headerEnd);
  return {
    field: /name="([^"]*)"/.exec(head)?.[1] ?? '',
    fileName: /filename="([^"]*)"/.exec(head)?.[1] ?? '',
    contentType: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? '',
    bytes: body.subarray(headerEnd + 4, end)
  };
}

// Répond aux téléchargements et aux envois de pièces jointes d'un contexte Playwright. Renvoie :
//   hits      le nombre de téléchargements demandés par fichier
//   tokens    les jetons reçus (téléchargements)
//   uploads   les envois reçus : { token, method, referrer, cookie, field, fileName, contentType, bytes, id }
//             (`id` : l'identifiant donné au fichier, null quand le serveur refuse)
//   upload    la réponse du serveur aux envois, modifiable par le test (voir plus haut)
export async function routeAttachments(context) {
  const record = { hits: {}, tokens: [], uploads: [], stored: {}, upload: { mode: 'ok', cors: true, delay: 0 } };
  const cors = { 'access-control-allow-origin': '*' };

  await context.route(url => url.origin === ORIGIN && url.pathname.startsWith(`${PATH}/attachments/`), route => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split('/').at(-2));
    record.hits[id] = (record.hits[id] ?? 0) + 1;
    record.tokens.push(url.searchParams.get('auth'));
    if (id === MISSING_FILE) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    if (id === BROKEN_FILE) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'ceci n\'est pas une image' });
    const stored = record.stored[id];
    if (stored) return route.fulfill({ status: 200, contentType: stored.contentType, body: stored.bytes });
    if (isPortrait(id)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: portraitSvg(id) });
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: logoSvg(id) });
  });

  await context.route(url => url.origin === ORIGIN && url.pathname === `${PATH}/attachments`, async route => {
    const request = route.request();
    const { mode, cors: allowed, delay } = record.upload;
    const sent = readUpload(request);
    const headers = cors;
    const entry = {
      token: new URL(request.url()).searchParams.get('auth'),
      method: request.method(),
      referrer: request.headers().referer ?? null,
      cookie: request.headers().cookie ?? null,
      ...sent,
      id: null
    };
    record.uploads.push(entry);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (mode === 'unreachable') return route.abort('connectionfailed');
    if (mode === 'denied') return route.fulfill({ status: 403, headers, contentType: 'text/plain', body: 'Forbidden' });
    if (mode === 'too-large') return route.fulfill({ status: 413, headers, contentType: 'text/plain', body: 'Payload too large' });
    if (mode === 'error') return route.fulfill({ status: 500, headers, contentType: 'text/plain', body: 'Server error' });
    if (mode === 'bad-answer') return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{}' });
    entry.id = FIRST_UPLOAD_ID + Object.keys(record.stored).length;
    record.stored[entry.id] = { contentType: entry.contentType || 'application/octet-stream', bytes: entry.bytes };
    // Sans en-têtes CORS, le serveur a bien reçu et gardé le fichier mais le navigateur refuse d'en
    // donner la réponse au widget : fetch échoue comme pour une panne de réseau. Playwright ne
    // bloque pas de lui-même une réponse sans ces en-têtes ; on reproduit donc ce que fait un vrai
    // navigateur.
    if (!allowed) return route.abort('failed');
    return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify([entry.id]) });
  });
  return record;
}
