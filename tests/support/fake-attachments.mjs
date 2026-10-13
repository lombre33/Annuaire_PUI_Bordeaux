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
//   PADDED_FILE    un logo de 400 x 140 posé au milieu d'un carré transparent de 800 x 800
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
import { visageSvg } from '../../docs/demo/portraits-fictifs.mjs';

export const FIRST_UPLOAD_ID = 2000;
export const MISSING_FILE = 999;
export const BROKEN_FILE = 998;
export const TALL_FILE = 997;
export const WIDE_FILE = 996;
export const UNSIZED_FILE = 995;
export const PADDED_FILE = 994;
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
  if (id === PADDED_FILE) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">'
      + '<rect x="200" y="330" width="400" height="140" rx="12" fill="#123b6b"/></svg>';
  }
  const { width, height } = fakeLogoSize(id);
  const size = id === UNSIZED_FILE ? '' : ` width="${width}" height="${height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" rx="6" fill="hsl(${(id * 47) % 360} 55% 45%)"/>`
    + `<text x="50%" y="55%" fill="#fff" font-family="sans-serif" font-size="14" text-anchor="middle">${id}</text></svg>`;
}

// Les visages sont ceux de la démonstration (docs/demo/portraits-fictifs.mjs) : de simples dessins.
const portraitSvg = id => visageSvg(id - PORTRAIT_FIRST);

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
//   download  les téléchargements : `cors` vrai (défaut), toute demande reçoit les en-têtes CORS ; faux, un Grist qui
//             ne donne pas les fichiers en CORS : une demande CORS (le navigateur joint l'en-tête Origin) échoue comme
//             sur un vrai serveur sans en-têtes CORS, une demande ordinaire passe ; 'hang', une demande CORS ne reçoit
//             jamais de réponse. (Une réponse fabriquée ici sans en-têtes CORS passerait quand même le contrôle de
//             Chromium : c'est la demande elle-même qui échoue.) Un Grist capricieux, pour les logos :
//             `hold`   vrai, aucune réponse ne part avant `release()` (le temps de redessiner l'annuaire autant qu'on veut
//                      pendant que les fichiers « arrivent ») ; la page fermée, la retenue tombe
//             `first`  'abort' ou 'hang' : la première demande de chaque fichier échoue, ou reste sans réponse (les suivantes passent)
//   release   met fin à `hold`
//   requests  les demandes de téléchargement reçues : { id, crossOrigin, probe, answered }, selon que le navigateur a joint
//             l'en-tête Origin (une demande CORS) ou non, que l'adresse porte le paramètre de la lecture des pixels d'un
//             logo (`annuaire_pixels`, branding-ui.js) ou non, et que le serveur a répondu ou non, dans l'ordre
export async function routeAttachments(context) {
  const record = {
    hits: {}, tokens: [], uploads: [], stored: {}, upload: { mode: 'ok', cors: true, delay: 0 },
    download: { cors: true, hold: false, first: null }, requests: [], failed: new Set(),
    release() { record.download.hold = false; }
  };
  const cors = { 'access-control-allow-origin': '*' };
  // Une retenue oubliée laisserait des réponses en attente sur une page fermée : la fermeture la lève.
  context.on('close', record.release);

  await context.route(url => url.origin === ORIGIN && url.pathname.startsWith(`${PATH}/attachments/`), async route => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split('/').at(-2));
    record.hits[id] = (record.hits[id] ?? 0) + 1;
    record.tokens.push(url.searchParams.get('auth'));
    const crossOrigin = 'origin' in route.request().headers();
    const entry = { id, crossOrigin, probe: url.searchParams.has('annuaire_pixels'), answered: false };
    record.requests.push(entry);
    // Un Grist lent : les réponses se font attendre, le temps que l'annuaire se redessine pendant que les logos arrivent.
    while (record.download.hold) await new Promise(resolve => setTimeout(resolve, 20));
    // Un Grist dont la première réponse pour un fichier n'arrive jamais ('hang') ou échoue ('abort') : les suivantes passent.
    if (record.download.first && !record.failed.has(id)) {
      record.failed.add(id);
      if (record.download.first === 'abort') return route.abort('failed');
      if (record.download.first === 'hang') return undefined;
    }
    entry.answered = true;
    // Comme Grist, qui laisse le widget lire les fichiers avec un jeton d'accès (CORS), donc leurs pixels ;
    // `download.cors` faux ou 'hang' simule un Grist qui ne le fait pas.
    if (crossOrigin && record.download.cors === 'hang') return undefined;
    if (crossOrigin && record.download.cors === false) return route.abort('failed');
    const headers = cors;
    if (id === MISSING_FILE) return route.fulfill({ status: 404, headers, contentType: 'text/plain', body: 'Not found' });
    if (id === BROKEN_FILE) return route.fulfill({ status: 200, headers, contentType: 'image/svg+xml', body: 'ceci n\'est pas une image' });
    const stored = record.stored[id];
    if (stored) return route.fulfill({ status: 200, headers, contentType: stored.contentType, body: stored.bytes });
    if (isPortrait(id)) return route.fulfill({ status: 200, headers, contentType: 'image/svg+xml', body: portraitSvg(id) });
    return route.fulfill({ status: 200, headers, contentType: 'image/svg+xml', body: logoSvg(id) });
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
