// Le serveur REST de Grist, réduit à ce qui décide si une page d'une AUTRE origine (le widget, servi par
// GitHub Pages) peut lui envoyer un fichier avec un jeton d'accès. C'est un vrai serveur HTTP, sur un autre
// port que la page : CORS y est appliqué par Chromium, pas par un faux (tests/support/fake-attachments.mjs
// répond à la place du serveur, sans réseau, et ne peut donc pas le montrer).
//
// Il reprend l'ordre des intergiciels de Grist (grist-core, `FlexServer.addApiMiddleware`) :
//   1. `addRequestUser` (app/server/lib/Authorizer.ts) lit le jeton `?auth=`. Un jeton d'accès n'est pas un
//      identifiant explicite : toute requête qui modifie le document (autre que GET, HEAD, OPTIONS) doit
//      porter `X-Requested-With: XMLHttpRequest` ou `Content-Type: application/json`, sinon 401. Cette
//      réponse part AVANT les en-têtes CORS : le navigateur la cache à la page, dont `fetch` échoue comme
//      sur une panne de réseau.
//   2. `trustOriginHandler` (app/server/lib/FlexServer.ts) : une origine qui n'est pas celle de Grist reçoit
//      `Access-Control-Allow-Origin: *` et le droit d'envoyer `Content-Type` et `X-Requested-With`, sans
//      cookie ni `Authorization` (403 sinon) ; une requête de vérification (OPTIONS) reçoit 200.
//   3. la route `POST /api/docs/:docId/attachments` lit le fichier du champ `upload` et renvoie la liste
//      des identifiants créés.
// Il garde chaque requête reçue (`requests`), avec ce qu'il a répondu.

import http from 'node:http';

export const FIRST_ID = 2001;
const DOC_PATH = '/api/docs/fake-doc';

// Le fichier d'un envoi multipart : { field, fileName, contentType, size }.
function readFile(body, contentType) {
  const boundary = /boundary=(.+)$/.exec(contentType ?? '')?.[1];
  if (!boundary) return null;
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
    size: end - (headerEnd + 4)
  };
}

export async function startGristRest({ token = 'test-jeton-rest' } = {}) {
  const requests = [];
  let nextId = FIRST_ID;

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://grist.test');
    const headers = request.headers;
    const entry = {
      method: request.method,
      path: url.pathname,
      token: url.searchParams.get('auth'),
      origin: headers.origin ?? null,
      requestedWith: headers['x-requested-with'] ?? null,
      wantedHeaders: headers['access-control-request-headers'] ?? null,
      cookie: headers.cookie ?? null,
      referer: headers.referer ?? null,
      status: null,
      file: null
    };
    requests.push(entry);
    const answer = (status, type, body, extra = {}) => {
      entry.status = status;
      response.writeHead(status, { 'content-type': type, ...extra });
      response.end(body);
    };

    // 1. addRequestUser : le jeton, puis la garde contre les envois d'un formulaire d'un autre site.
    if (entry.token !== token) return answer(401, 'application/json', '{"error":"Bad request: invalid auth param"}');
    const marked = (headers['x-requested-with'] ?? '').toLowerCase() === 'xmlhttprequest' || headers['content-type'] === 'application/json';
    if (!marked && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return answer(401, 'application/json', '{"error":"Unauthenticated requests require one of the headers \'Content-Type: application/json\' or \'X-Requested-With: XMLHttpRequest\'"}');
    }

    // 2. trustOriginHandler, pour une origine que Grist ne reconnaît pas.
    const cors = {
      'access-control-allow-methods': 'GET, PATCH, PUT, POST, DELETE, OPTIONS',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Content-Type, X-Requested-With'
    };
    if (headers.cookie || headers.authorization) return answer(403, 'application/json', '{"error":"Credentials not supported for cross-origin requests"}');
    if (request.method === 'OPTIONS') return answer(200, 'text/plain', 'OK', cors);

    // 3. la route des pièces jointes.
    if (request.method === 'POST' && url.pathname === `${DOC_PATH}/attachments`) {
      const chunks = [];
      request.on('data', chunk => chunks.push(chunk));
      request.on('end', () => {
        entry.file = readFile(Buffer.concat(chunks), headers['content-type']);
        if (!entry.file) return answer(400, 'application/json', '{"error":"missing payload"}', cors);
        answer(200, 'application/json', JSON.stringify([nextId++]), cors);
      });
      return undefined;
    }
    return answer(404, 'application/json', '{"error":"Not found"}', cors);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    requests,
    token,
    // La réponse de getAccessToken que le widget reçoit de ce document.
    accessToken: { token, baseUrl: `${origin}${DOC_PATH}`, ttlMsecs: 600000 },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })
  };
}
