// Test navigateur de l'habillage : charge le vrai index.html dans Chromium, avec un Grist
// simulé dont les pièces jointes (logos) sont servies par tests/support/fake-attachments.mjs,
// et vérifie ce que voit l'utilisateur : le logo sur les cartes (ou le nom à défaut), les
// financeurs en haut, le bandeau des fondateurs en bas, et les repli quand Grist ne donne
// pas les fichiers.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md). Sans lui ces
// tests sont ignorés et `node --test` reste vert.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTables, withBranding, HOSTILE_FIRST_NAME } from './fixtures.mjs';
import { FAKE_ATTACHMENTS_URL } from './support/fake-grist.js';
import { routeAttachments, MISSING_FILE, BROKEN_FILE } from './support/fake-attachments.mjs';
import { PUI_URL } from '../constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const GRIST_API_URL = 'https://docs.getgrist.com/grist-plugin-api.js';

// Même simulateur que e2e.test.mjs : le faux document des tests Node, branché sur des
// variables posées avant le chargement (relues à chaque appel).
const FAKE_GRIST = fs.readFileSync(path.join(ROOT, 'tests/support/fake-grist.js'), 'utf8').replace(/^export /gm, '');
const GRIST_MOCK = `${FAKE_GRIST}
window.__fake = createFakeGrist({
  tables: () => window.__tables,
  accessToken: () => window.__accessToken
});
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
const skip = browser ? false : 'Playwright/Chromium indisponible (voir TESTING.md)';

if (!browser && process.env.REQUIRE_E2E) {
  test('le navigateur de test de l\'habillage est disponible', () => assert.fail('Playwright/Chromium introuvable alors que REQUIRE_E2E est défini'));
}

after(async () => {
  await browser?.close();
  server?.close();
});

// `accessToken` : la réponse de getAccessToken (undefined : un jeton valable ; null : Grist refuse).
async function openWidget({ tables = withBranding(), accessToken, width = 1480 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  // Hermétique : seuls le serveur local, l'API Grist simulée et les pièces jointes simulées répondent.
  await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
  await context.route(GRIST_API_URL, route => route.fulfill({ contentType: 'text/javascript', body: GRIST_MOCK }));
  const files = await routeAttachments(context);
  const page = await context.newPage();
  const logs = { errors: [], warnings: [] };
  page.on('pageerror', error => logs.errors.push(error.message));
  page.on('console', message => {
    // Un fichier introuvable est consigné par le navigateur lui-même, pas par le widget.
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) logs.errors.push(message.text());
    if (message.type() === 'warning') logs.warnings.push(message.text());
  });
  await page.addInitScript(values => {
    window.__tables = values.tables;
    window.__accessToken = values.accessToken;
  }, { tables, accessToken });
  await page.goto(`${baseUrl}/index.html`);
  return { page, context, logs, files };
}

async function withWidget(options, run) {
  const widget = await openWidget(options);
  try {
    await run(widget);
  } finally {
    await widget.context.close();
  }
}

const waitForCards = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.contact-card').length === expected, count);
const waitForLogos = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.logo-img.loaded').length >= expected, count);
const reload = page => page.evaluate(() => window.__triggerRecords());
const tokenRequests = page => page.evaluate(() => window.__fake.tokenRequests);
const badgeOf = (page, index) => page.locator('.contact-card').nth(index).locator('.etablissement-tag');
const logoUrl = id => `${FAKE_ATTACHMENTS_URL}/attachments/${id}/download?auth=fake-token`;

// Ce qu'affiche chaque case d'une liste : le texte alternatif de son logo, ou son texte.
const entriesOf = (page, selector) => page.locator(selector).evaluateAll(items =>
  items.map(item => item.querySelector('img')?.alt ?? item.textContent.trim()));

// ===== Cartes =====

test('une carte montre le logo de son établissement, seul : ni nom dessous ni pastille', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const badge = badgeOf(page, 0); // Ana, CHU
    await badge.locator('img.loaded').waitFor();
    assert.equal(await badge.evaluate(element => element.classList.contains('has-logo')), true);
    assert.equal(await badge.locator('img').getAttribute('src'), logoUrl(11), 'le fichier 11 est le logo du CHU');
    assert.equal(await badge.locator('img').getAttribute('alt'), 'CHU');
    assert.equal(await badge.getAttribute('title'), 'CHU de Bordeaux', 'le nom complet au survol');
    assert.equal((await badge.textContent()).trim(), '', 'le nom ne s\'affiche pas quand il y a un logo');
    assert.deepEqual(logs.errors, []);
  }));

test('un établissement sans logo garde la pastille texte, et les autres cartes leur logo', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const gina = badgeOf(page, 2); // Institut Bergonié : pas de logo
    assert.equal(await gina.evaluate(element => element.classList.contains('has-logo')), false);
    assert.equal(await gina.locator('img').count(), 0);
    assert.equal(await gina.textContent(), 'Institut Bergonié');
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 3, 'les trois cartes du CHU');
  }));

test('cliquer le logo filtre sur l\'établissement, comme la pastille', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    await badgeOf(page, 0).click();
    await waitForCards(page, 3);
    const filter = page.locator('.filter[data-filter-key="etablissement"]');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    await badgeOf(page, 0).click();
    await waitForCards(page, 4);
  }));

test('le logo est un bouton qu\'on atteint au clavier, nommé par l\'établissement', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const badge = badgeOf(page, 0);
    assert.equal(await badge.evaluate(element => element.tagName), 'BUTTON');
    await badge.focus();
    await page.keyboard.press('Enter');
    await waitForCards(page, 3);
  }));

test('une pièce jointe n\'est demandée à Grist qu\'avec un jeton en lecture seule, obtenu une seule fois pour toutes les images', { skip }, () =>
  withWidget({}, async ({ page, files }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 8); // 3 cartes, 1 logo de fondateur, 3 financeurs, le rond France 2030
    assert.deepEqual(await tokenRequests(page), [{ readOnly: true }]);
    assert.deepEqual(Object.keys(files.hits).sort(), ['11', '21', '22', '23'], 'un téléchargement par fichier, pas un de plus');
    assert.ok(files.tokens.length >= 4 && files.tokens.every(token => token === 'fake-token'));
  }));

test('les logos des cartes se chargent à l\'approche de l\'écran, ceux de l\'en-tête et du bandeau tout de suite, aucun ne dit d\'où il vient', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 8);
    const attribute = (selector, name) => page.locator(selector).evaluateAll((images, property) => images.map(image => image[property]), name);
    assert.deepEqual(await attribute('.etablissement-tag img', 'loading'), ['lazy', 'lazy', 'lazy']);
    assert.deepEqual(await attribute('#fundersLogos img, #bandLogos img, #bandRoundel img', 'loading'), Array(5).fill('eager'));
    const policies = await attribute('.logo-img', 'referrerPolicy');
    assert.equal(policies.length, 8);
    assert.ok(policies.every(policy => policy === 'no-referrer'), 'l\'adresse du widget n\'est pas envoyée au serveur de Grist');
  }));

test('sans aucun logo ni financeur dans le document, Grist n\'est jamais sollicité pour un jeton', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await tokenRequests(page), []);
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.deepEqual(logs.errors, []);
    assert.deepEqual(logs.warnings.filter(text => /LOGOS|Financeurs|logo/i.test(text)), []);
  }));

// ===== Financeurs, en haut =====

test('les financeurs s\'affichent dans l\'ordre de la table, un logo chacun et le nom à défaut', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#funders').isVisible(), true);
    assert.deepEqual(await entriesOf(page, '#fundersLogos li'), ['République française', 'ANR', 'Bpifrance', 'France 2030'],
      'Bpifrance n\'a pas de logo : son nom prend sa place');
    assert.equal(await page.locator('#fundersLogos li').nth(0).locator('img').getAttribute('src'), logoUrl(21));
    assert.equal(await page.locator('#funders .funders-label').textContent(), 'Projet financé par l\'État dans le cadre de France 2030');
  }));

test('sans table Financeurs, l\'en-tête n\'a pas de financeurs et rien n\'est signalé', { skip }, () => {
  const tables = withBranding();
  delete tables.Financeurs;
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#funders').isHidden(), true);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.deepEqual(logs.errors, []);
  });
});

test('un nom de financeur contenant du HTML s\'affiche en texte brut', { skip }, () => {
  const tables = withBranding();
  tables.Financeurs.nom[3] = HOSTILE_FIRST_NAME;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#fundersLogos .funder-name').textContent(), HOSTILE_FIRST_NAME);
    assert.equal(await page.locator('#fundersLogos [src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  });
});

// ===== Bandeau des fondateurs, en bas =====

test('le bandeau du bas liste les fondateurs validés dans l\'ordre de ordre_bandeau, logo ou nom', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#foundersBand').isVisible(), true);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU'],
      'Bergonié (ordre 1, sans logo : son nom) puis CHU (ordre 2) ; INSERM n\'a pas validé sa présence, UBM est partenaire');
    assert.equal(await page.locator('#bandLogos li').nth(1).locator('img').getAttribute('src'), logoUrl(11));
    assert.equal(await page.locator('#bandLogos li').nth(1).getAttribute('title'), 'CHU de Bordeaux');
  }));

test('le logo de France 2030 ferme le bandeau, avec la phrase de financement et le lien vers le projet', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#bandRoundel img').getAttribute('src'), logoUrl(23));
    assert.equal(await page.locator('#bandRoundel img').getAttribute('alt'), 'France 2030');
    assert.equal(await page.locator('.band-sentence').textContent(),
      'Le Pôle universitaire d\'innovation Bordeaux est un projet financé par l\'État dans le cadre de France 2030.');
    const link = page.locator('#bandLink');
    assert.equal(await link.getAttribute('href'), PUI_URL);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  }));

test('sans logo dans le document, le bandeau garde les noms des fondateurs, dans l\'ordre de la table', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['CHU', 'Institut Bergonié']);
    assert.equal(await page.locator('#foundersBand img').count(), 0);
    assert.equal(await page.locator('#bandRoundel').textContent(), '');
  }));

test('sans aucun fondateur dans Etablissements, le bandeau n\'est pas affiché, les financeurs si', { skip }, () => {
  const tables = withBranding();
  // Plus de fondateur : les contacts ne sont plus éligibles non plus (fondateur ou partenaire).
  tables.Etablissements.fondateur = tables.Etablissements.fondateur.map(() => false);
  return withWidget({ tables }, async ({ page }) => {
    await page.waitForFunction(() => !document.getElementById('funders').hidden);
    assert.equal(await page.locator('#foundersBand').isHidden(), true);
    assert.equal(await page.locator('#bandLogos li').count(), 0);
  });
});

test('un fondateur qui retire sa présence (ok_pour_apparaitre) disparaît du bandeau à la lecture suivante', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => { window.__tables.Etablissements.ok_pour_apparaitre[0] = false; });
    await reload(page);
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos li').length === 1);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié']);
  }));

// ===== Quand Grist ne donne pas les fichiers =====

test('si Grist refuse le jeton, les logos laissent la place aux noms, une seule demande et un seul avertissement', { skip }, () =>
  withWidget({ accessToken: null }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo') && !document.querySelector('.logo-holder img'));
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#fundersLogos li'), ['République française', 'ANR', 'Bpifrance', 'France 2030']);
    assert.equal(await page.locator('#bandRoundel').textContent(), 'France 2030');
    assert.equal((await tokenRequests(page)).length, 1);
    assert.equal(logs.warnings.filter(text => text.includes('[LOGOS]')).length, 1);
    assert.deepEqual(logs.errors, []);
    // L'annuaire, lui, marche : le filtre par établissement aussi.
    await badgeOf(page, 0).click();
    await waitForCards(page, 3);
  }));

test('un fichier supprimé dans Grist : la pastille texte reprend sa place, sans redemander de jeton', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo')
      || [...document.querySelectorAll('.etablissement-tag.has-logo')].every(badge => badge.textContent.trim() === '' && badge.querySelector('img.loaded')));
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card .etablissement-tag')]
      .filter(badge => badge.textContent.trim() === 'CHU').length === 3);
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 0);
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.equal((await tokenRequests(page)).length, 1, 'un fichier absent n\'est pas un jeton périmé');
    assert.deepEqual(logs.errors, []);
    await badgeOf(page, 0).click();
    await waitForCards(page, 3);
  });
});

test('un fichier qui n\'est pas une image : le nom reprend sa place dans le bandeau comme sur les cartes', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', BROKEN_FILE];
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos li .band-name').length === 2);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.equal(await page.locator('#bandLogos img').count(), 0);
  });
});

test('un document dont l\'API n\'a pas getAccessToken (un vieux Grist) s\'affiche avec les noms', { skip }, async () => {
  const context = await browser.newContext();
  try {
    await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
    await context.route(GRIST_API_URL, route => route.fulfill({
      contentType: 'text/javascript',
      body: GRIST_MOCK.replace('docApi: window.__fake.docApi', 'docApi: { fetchTable: window.__fake.docApi.fetchTable, listTables: window.__fake.docApi.listTables, applyUserActions: window.__fake.docApi.applyUserActions }')
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(tables => { window.__tables = tables; }, withBranding());
    await page.goto(`${baseUrl}/index.html`);
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo'));
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

// ===== Mises à jour =====

test('une lecture de Grist qui ne change aucun logo ne reconstruit ni le bandeau ni les financeurs', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => {
      document.querySelector('#bandLogos li').dataset.kept = 'oui';
      document.querySelector('#fundersLogos li').dataset.kept = 'oui';
    });
    await page.evaluate(() => { window.__tables.BDD.Fonction[0] = 'Cheffe de projet'; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('.contact-card .fonction').textContent === 'Cheffe de projet');
    assert.equal(await page.locator('#bandLogos li').first().getAttribute('data-kept'), 'oui');
    assert.equal(await page.locator('#fundersLogos li').first().getAttribute('data-kept'), 'oui');
  }));

test('changer un logo dans Grist change l\'image du bandeau et des cartes à la lecture suivante', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => { window.__tables.Etablissements.logo[0] = ['L', 31]; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('#bandLogos li:nth-child(2) img')?.src.includes('/attachments/31/'));
    await badgeOf(page, 0).locator('img.loaded').waitFor();
    assert.equal(await badgeOf(page, 0).locator('img').getAttribute('src'), logoUrl(31));
  }));

test('ajouter la table Financeurs dans Grist fait apparaître les financeurs sans recharger la page', { skip }, () => {
  const tables = withBranding();
  const financeurs = tables.Financeurs;
  delete tables.Financeurs;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#funders').isHidden(), true);
    await page.evaluate(value => { window.__tables.Financeurs = value; }, financeurs);
    await reload(page);
    await page.waitForFunction(() => !document.getElementById('funders').hidden);
    assert.equal(await page.locator('#fundersLogos li').count(), 4);
  });
});

// ===== Un logo ne casse jamais l'annuaire =====

test('l\'annuaire fonctionne pendant que les logos se chargent : recherche et filtres répondent', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.fill('#searchInput', 'bergonie');
    await waitForCards(page, 1);
    assert.equal(await page.locator('.contact-card .etablissement-tag').textContent(), 'Institut Bergonié');
    await page.click('#resetFilters');
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
  }));
