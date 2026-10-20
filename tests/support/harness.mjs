// Le navigateur et le serveur des tests navigateur : un serveur statique pour le vrai index.html, Chromium (Playwright) et l'API
// Grist simulée qui sert les données de tests/fixtures.mjs. `createHarness()` lance un navigateur et un serveur pour le fichier
// de test qui l'appelle : tests/support/browser.mjs en fait le harnais des tests e2e*.test.mjs, tests/support/layout.mjs celui des
// tests de mise en page.
//
// Optionnel : nécessite Playwright (npm install --no-save playwright puis
// npx playwright install chromium). Sans lui ces tests sont ignorés et
// `node --test` reste vert. CHROMIUM_PATH désigne un Chromium déjà installé.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTables } from '../fixtures.mjs';
import { routeAttachments } from './fake-attachments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const GRIST_API_URL = 'https://docs.getgrist.com/grist-plugin-api.js';

// Remplace grist-plugin-api.js : le faux document que partagent les tests Node
// (tests/support/fake-grist.js, `export` retiré), branché sur des variables que le
// test pose avant le chargement et peut modifier ensuite (relues à chaque appel) :
// __tables, __failTables, __user (la personne connectée), __denyWrites (tables dont
// l'écriture est refusée), __denyRows (lignes protégées), __delay, __readGate (la promesse
// que toute lecture attend), __accessToken (la réponse de getAccessToken), __withoutMethods
// (méthodes que cette version de Grist n'a pas). __triggerRecords rejoue un onRecords (édition
// Grist) ; __fake.calls liste les actions envoyées à Grist, __fake.tokenRequests les demandes
// de jeton ; __releaseReads laisse passer les lectures retenues (option `holdReads`).
const FAKE_GRIST = fs.readFileSync(path.join(ROOT, 'tests/support/fake-grist.js'), 'utf8').replace(/^export /gm, '');
const GRIST_MOCK = `${FAKE_GRIST}
window.__fake = createFakeGrist({
  tables: () => window.__tables,
  failTables: () => window.__failTables,
  user: () => window.__user,
  denyWrites: () => window.__denyWrites,
  denyRows: () => window.__denyRows,
  delay: () => window.__delay,
  readGate: () => window.__readGate,
  accessToken: () => window.__accessToken
});
(window.__withoutMethods || []).forEach(name => { delete window.__fake.docApi[name]; });
window.grist = {
  ready(options) { window.__gristReady = options; },
  onRecords(callback) { window.__triggerRecords = callback; setTimeout(callback, 0); },
  docApi: window.__fake.docApi
};`;

// Playwright masque les barres de défilement ; dans Grist elles retirent 15 px à la largeur utile, le cas le plus serré d'une mise
// en page : `keepScrollbars` les garde.
async function startBrowser({ keepScrollbars }) {
  try {
    const { chromium } = await import('playwright');
    return await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      ...(keepScrollbars ? { ignoreDefaultArgs: ['--hide-scrollbars'] } : {})
    });
  } catch {
    return null;
  }
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    // GitHub Pages répond avec « access-control-allow-origin: * » : sans lui, un cadre sandbox sans allow-same-origin (origine opaque)
    // ne pourrait pas charger les modules du widget, qui se chargent en CORS.
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    response.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// La page n'a rien chargé ni exécuté que la politique de sécurité de contenu de index.html refuse. Sans ce contrôle, une
// ressource refusée passerait inaperçue des tests (l'image manque, le script ne part pas) et ne se verrait qu'en production,
// dans la console d'une personne. `widget` : ce que renvoie openWidget(). Un test qui refuse exprès une ressource vide ensuite
// `widget.logs.cspViolations`.
export async function assertNoCspViolation({ page, logs }) {
  await page.evaluate(() => 0).catch(() => {}); // laisse arriver les signalements encore en route (la page a pu se fermer)
  assert.deepEqual(logs.cspViolations, [], 'la page a enfreint la politique de sécurité de contenu de index.html');
}

// La mise en page se pose quelques images après un changement de largeur : le navigateur ne dessine que les cartes proches de
// l'écran (`content-visibility: auto`, 1.29.0) et remplace la hauteur estimée des autres par la leur dès qu'il les dessine. Deux
// mesures séparées par ce changement (le bandeau « sous la dernière carte » de l'une, la dernière carte de l'autre) ne se recoupent
// pas. `layoutSettled` attend donc que la hauteur de la page et le bas de la dernière carte restent les mêmes pendant `frames`
// images de suite ; openWidget() y soumet chaque `page.setViewportSize`. Au bout de `timeout` ms elle échoue : une page qui bouge
// sans cesse ne se mesure pas.
export const layoutSettled = (page, { frames = 6, timeout = 5000 } = {}) => page.evaluate(({ stableFor, limit }) => new Promise((resolve, reject) => {
  const signature = () => {
    const cards = document.querySelectorAll('.contact-card');
    const last = cards.length > 0 ? cards[cards.length - 1].getBoundingClientRect().bottom : 0;
    return [document.documentElement.scrollHeight, document.documentElement.scrollWidth, last].join(' ');
  };
  let previous = signature();
  let stable = 0;
  let over = false;
  const timer = setTimeout(() => { over = true; reject(new Error(`la mise en page ne se pose pas (${signature()})`)); }, limit);
  const tick = () => {
    if (over) return;
    const current = signature();
    stable = current === previous ? stable + 1 : 0;
    previous = current;
    if (stable < stableFor) { requestAnimationFrame(tick); return; }
    over = true;
    clearTimeout(timer);
    resolve();
  };
  requestAnimationFrame(tick);
}), { stableFor: frames, limit: timeout });

// Joue `run` sur la page ouverte, vérifie qu'elle n'a pas enfreint sa politique de sécurité de contenu, puis ferme le contexte :
// la fin commune de `withWidget` ici et dans tests/support/layout.mjs.
export async function runWidget(widget, run) {
  try {
    await run(widget);
    await assertNoCspViolation(widget);
  } finally {
    await widget.context.close();
  }
}

// Renvoie { skip, openWidget, withWidget }. `skip` : faux quand le navigateur est là, sinon la raison pour laquelle les tests
// navigateur sont ignorés. `keepScrollbars` : voir startBrowser().
export async function createHarness({ keepScrollbars = false } = {}) {
  const browser = await startBrowser({ keepScrollbars });
  const server = browser ? await startStaticServer() : null;
  const baseUrl = server ? `http://127.0.0.1:${server.address().port}` : '';
  const skip = browser ? false : 'Playwright/Chromium indisponible (voir TESTING.md)';

  // En CI (REQUIRE_E2E=1), un navigateur absent est un échec, pas un « tout vert »
  // sur des tests ignorés.
  if (!browser && process.env.REQUIRE_E2E) {
    test('le navigateur de test est disponible', () => assert.fail('Playwright/Chromium introuvable alors que REQUIRE_E2E est défini'));
  }

  after(async () => {
    await browser?.close();
    server?.close();
  });

  // `user` : l'adresse de la personne connectée (null : compte anonyme) ; `readOnly` :
  // le cadre d'un compte Lecteur (?readonly=true) ; `denyRows` : { table: [identifiants] }.
  // Les logos sont des pièces jointes : `files` (tests/support/fake-attachments.mjs) compte les
  // fichiers qui ont été téléchargés et les jetons employés ; `accessToken` est la réponse de
  // getAccessToken (null : Grist refuse), `withoutMethods` les méthodes de docApi qu'une
  // vieille version de Grist n'a pas ; `downloadCors` faux ou 'hang', un Grist qui ne donne pas les pièces jointes
  // en CORS (refus, ou pas de réponse), donc qui ne laisse pas lire les pixels d'un logo ; `downloadHold` : aucun fichier ne part avant
  // `files.release()` ; `downloadFirst` : 'abort' ou 'hang', la première demande de chaque fichier échoue ou n'a jamais de réponse (les
  // suivantes passent) ; `initScript` : un script (texte) exécuté dans la page avant tout autre ; `contextOptions` : les options du
  // contexte Playwright (un écran tactile, sans survol : { hasTouch: true, isMobile: true }). `logs.pageErrors` : les exceptions
  // que la page n'a pas rattrapées, sans les messages d'erreur de sa console ; `logs.cspViolations` : ce que la politique de
  // sécurité de contenu de index.html a refusé à la page (voir assertNoCspViolation). `holdReads` : aucune lecture de Grist
  // n'aboutit avant `window.__releaseReads()` (un document lent à répondre) ; `apiBlocked` : le script de l'API de Grist ne se charge
  // pas (réseau coupé, pare-feu, extension), `window.grist` n'existe pas.
  async function openWidget({
    tables = sampleTables(), failTables = [], user = null, denyWrites = [], denyRows = {}, delay = 0, readOnly = false,
    accessToken, withoutMethods = [], downloadCors = true, downloadHold = false, downloadFirst = null, initScript = null,
    contextOptions = {}, holdReads = false, apiBlocked = false
  } = {}) {
    const context = await browser.newContext(contextOptions);
    // Hermétique : seuls le serveur local, l'API Grist simulée et ses pièces jointes répondent.
    await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
    await context.route(GRIST_API_URL, route => (apiBlocked ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: GRIST_MOCK })));
    const files = await routeAttachments(context);
    files.download.cors = downloadCors;
    files.download.hold = downloadHold;
    files.download.first = downloadFirst;
    const page = await context.newPage();
    const logs = { errors: [], warnings: [], infos: [], pageErrors: [], cspViolations: [] };
    // Chaque changement de largeur attend que la mise en page se pose (voir layoutSettled).
    const resize = page.setViewportSize.bind(page);
    page.setViewportSize = async size => {
      await resize(size);
      await layoutSettled(page);
    };
    page.on('pageerror', error => {
      logs.pageErrors.push(error.message);
      logs.errors.push(error.message);
    });
    page.on('console', message => {
      // text() réduit un objet à « JSHandle@object » : on relit les arguments. Un message du
      // navigateur lui-même (un fichier introuvable) n'en a pas : on garde son texte.
      const readable = async () => (await Promise.all(message.args().map(arg => arg.jsonValue())))
        .map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join(' ') || message.text();
      // La lecture est en vol quand le test se termine et ferme la page, surtout quand plusieurs
      // fichiers de test tournent ensemble : elle échoue alors (« Target page, context or browser
      // has been closed ») et, sans personne pour l'attendre, Node fait échouer tout le fichier.
      // Le crochet vide évite ce rejet non traité ; un test qui relit la console voit toujours
      // l'erreur, puisque la promesse gardée dans `logs` reste rejetée.
      const keep = list => { const line = readable(); line.catch(() => {}); list.push(line); };
      if (message.type() === 'error') keep(logs.errors);
      if (message.type() === 'warning') keep(logs.warnings);
      if (message.type() === 'info') keep(logs.infos);
    });
    // Le navigateur signale chaque ressource ou script que la politique de sécurité de contenu de index.html refuse à la page
    // (événement securitypolicyviolation) ; la page le passe au test, qui garde aussi ceux d'avant un rechargement.
    await page.exposeFunction('__reportCspViolation', line => { logs.cspViolations.push(line); });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        window.__reportCspViolation(`${event.violatedDirective} : ${event.blockedURI}`);
      });
    });
    await page.addInitScript(values => {
      window.__tables = values.tables;
      window.__failTables = values.failTables;
      window.__user = values.user;
      window.__denyWrites = values.denyWrites;
      window.__denyRows = values.denyRows;
      window.__delay = values.delay;
      window.__readGate = values.holdReads ? new Promise(resolve => { window.__releaseReads = resolve; }) : null;
      window.__accessToken = values.accessToken;
      window.__withoutMethods = values.withoutMethods;
    }, { tables, failTables, user: user && { email: user }, denyWrites, denyRows, delay, accessToken, withoutMethods, holdReads });
    if (initScript) await page.addInitScript(initScript);
    // Le widget lit Grist dès son démarrage : ses cartes et leurs logos sont dans la page avant l'événement « load », qui attend les
    // images. Quand un fichier est retenu ou ne reçoit jamais de réponse, il ne viendrait pas : la navigation n'attend alors que le document.
    const downloadsStall = downloadHold || downloadFirst === 'hang' || downloadCors === 'hang';
    await page.goto(`${baseUrl}/index.html${readOnly ? '?readonly=true' : ''}`, { waitUntil: downloadsStall ? 'domcontentloaded' : 'load' });
    return { page, context, logs, files };
  }

  const withWidget = async (options, run) => runWidget(await openWidget(options), run);

  return { skip, openWidget, withWidget };
}
