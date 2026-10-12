// Outils communs des tests navigateur (tests/e2e*.test.mjs) : un serveur statique pour
// le vrai index.html, Chromium (Playwright) et l'API Grist simulée qui sert les
// données de tests/fixtures.mjs. Chaque fichier de test importe ce module : il lance
// son propre navigateur.
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const GRIST_API_URL = 'https://docs.getgrist.com/grist-plugin-api.js';

// Remplace grist-plugin-api.js : le faux document que partagent les tests Node
// (tests/support/fake-grist.js, `export` retiré), branché sur des variables que le
// test pose avant le chargement et peut modifier ensuite (relues à chaque appel) :
// __tables, __failTables, __user (la personne connectée), __denyWrites (tables dont
// l'écriture est refusée), __denyRows (lignes protégées), __delay, __accessToken (la
// réponse de getAccessToken), __withoutMethods (méthodes que cette version de Grist n'a
// pas). __triggerRecords rejoue un onRecords (édition Grist) ; __fake.calls liste les
// actions envoyées à Grist, __fake.tokenRequests les demandes de jeton.
const FAKE_GRIST = fs.readFileSync(path.join(ROOT, 'tests/support/fake-grist.js'), 'utf8').replace(/^export /gm, '');
const GRIST_MOCK = `${FAKE_GRIST}
window.__fake = createFakeGrist({
  tables: () => window.__tables,
  failTables: () => window.__failTables,
  user: () => window.__user,
  denyWrites: () => window.__denyWrites,
  denyRows: () => window.__denyRows,
  delay: () => window.__delay,
  accessToken: () => window.__accessToken
});
(window.__withoutMethods || []).forEach(name => { delete window.__fake.docApi[name]; });
window.grist = {
  ready(options) { window.__gristReady = options; },
  onRecords(callback) { window.__triggerRecords = callback; setTimeout(callback, 0); },
  docApi: window.__fake.docApi
};`;

async function startBrowser() {
  try {
    const { chromium } = await import('playwright');
    return await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
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
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const browser = await startBrowser();
const server = browser ? await startStaticServer() : null;
const baseUrl = server ? `http://127.0.0.1:${server.address().port}` : '';
export const skip = browser ? false : 'Playwright/Chromium indisponible (voir TESTING.md)';

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
// vieille version de Grist n'a pas.
export async function openWidget({
  tables = sampleTables(), failTables = [], user = null, denyWrites = [], denyRows = {}, delay = 0, readOnly = false,
  accessToken, withoutMethods = []
} = {}) {
  const context = await browser.newContext();
  // Hermétique : seuls le serveur local, l'API Grist simulée et ses pièces jointes répondent.
  await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
  await context.route(GRIST_API_URL, route => route.fulfill({ contentType: 'text/javascript', body: GRIST_MOCK }));
  const files = await routeAttachments(context);
  const page = await context.newPage();
  const logs = { errors: [], warnings: [], infos: [] };
  page.on('pageerror', error => logs.errors.push(error.message));
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
  await page.addInitScript(values => {
    window.__tables = values.tables;
    window.__failTables = values.failTables;
    window.__user = values.user;
    window.__denyWrites = values.denyWrites;
    window.__denyRows = values.denyRows;
    window.__delay = values.delay;
    window.__accessToken = values.accessToken;
    window.__withoutMethods = values.withoutMethods;
  }, { tables, failTables, user: user && { email: user }, denyWrites, denyRows, delay, accessToken, withoutMethods });
  await page.goto(`${baseUrl}/index.html${readOnly ? '?readonly=true' : ''}`);
  return { page, context, logs, files };
}

// Rejoue un onRecords (comme une édition dans Grist) et attend la fin du debounce.
export async function reload(page) {
  await page.evaluate(() => window.__triggerRecords());
}

export const cardCount = page => page.locator('.contact-card').count();
export const waitForCards = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.contact-card').length === expected, count);
export const waitForBanner = (page, visible = true) =>
  page.waitForFunction(expected => !document.getElementById('statusBanner').hidden === expected, visible);
export const cardNames = page => page.locator('.contact-card .name').allTextContents();
export const resultCount = page => page.locator('#resultCount').textContent();
export const bannerText = page => page.locator('#statusBanner').textContent();

export async function withWidget(options, run) {
  const widget = await openWidget(options);
  try {
    await run(widget);
  } finally {
    await widget.context.close();
  }
}

