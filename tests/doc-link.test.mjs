// Le lien « Documentation » de l'en-tête (1.37.0) : un petit bouton, sous le slogan, qui ouvre la documentation du dépôt dans un autre
// onglet. Son adresse est DOCS_URL (constants.js), la seule à changer quand le dépôt change d'adresse (migration vers le dépôt de
// production) ; une adresse vide retire le lien.
//
// Les deux premiers tests lisent index.html et constants.js ; les suivants chargent le vrai index.html dans Chromium (optionnel : voir
// TESTING.md) sur une API Grist simulée.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_URL } from '../constants.js';
import { sampleTables } from './fixtures.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKUP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); // sans ses commentaires, qui parlent du lien
const LINK = MARKUP.match(/<a\b([^>]*\bid="docLink"[^>]*)>([\s\S]*?)<\/a>/);
const ACCESSIBLE_NAME = 'Documentation (s\'ouvre dans un nouvel onglet)';

test('DOCS_URL est vide (pas de lien) ou une adresse https sans identifiants', () => {
  assert.equal(typeof DOCS_URL, 'string');
  if (DOCS_URL === '') return;
  const url = new URL(DOCS_URL);
  assert.equal(url.protocol, 'https:', 'une page de documentation se lit en https');
  assert.equal(`${url.username}${url.password}`, '', 'ni nom ni mot de passe dans une adresse écrite dans le code');
});

test('index.html : le lien est caché au départ et sans adresse, il s\'ouvre dans un autre onglet sans transmettre la page, et dit où il mène', () => {
  assert.ok(LINK, 'index.html a un lien d\'id docLink');
  const [, attributes, content] = LINK;
  assert.match(attributes, /\bhidden\b/, 'caché tant que main.js ne lui a pas donné son adresse');
  assert.doesNotMatch(attributes, /\bhref=/, 'son adresse vient de DOCS_URL (constants.js) : une seule à changer');
  assert.match(attributes, /\btarget="_blank"/);
  assert.match(attributes, /\brel="noopener noreferrer"/);
  assert.match(content, /^Documentation/, 'son texte est « Documentation »');
  assert.match(content, /<span class="sr-only"> \(s'ouvre dans un nouvel onglet\)<\/span>/, 'les lecteurs d\'écran savent qu\'il ouvre un autre onglet');
  assert.match(content, /<span class="doc-link-mark" aria-hidden="true">↗<\/span>/, 'la flèche est décorative');
});

test('le lien est dans l\'en-tête, sous le titre et au-dessus de la barre d\'outils, avec l\'adresse DOCS_URL', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const link = page.getByRole('link', { name: ACCESSIBLE_NAME, exact: true });
    assert.equal(await link.count(), 1, 'un seul lien « Documentation »');
    assert.equal(await link.isVisible(), true);
    assert.equal(await link.getAttribute('href'), DOCS_URL);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(await link.evaluate(element => element.closest('.page-header') !== null), true, 'dans l\'en-tête');
    const box = await link.boundingBox();
    const title = await page.locator('h1').boundingBox();
    const toolbar = await page.locator('#toolbar').boundingBox();
    assert.ok(box.y > title.y + title.height, 'sous le titre');
    assert.ok(box.y + box.height <= toolbar.y, 'au-dessus de la barre d\'outils');
    assert.ok(box.height >= 24 && box.width >= 24, `assez grand pour le doigt (${Math.round(box.width)} × ${Math.round(box.height)} px)`);
  }));

test('un clic ouvre DOCS_URL dans un autre onglet, qui ne reçoit pas la page du widget (window.opener)', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    // Le contexte de test refuse tout hôte extérieur : l'onglet reçoit une page vide plutôt que le vrai dépôt.
    await context.route(DOCS_URL.split('#')[0], route => route.fulfill({ contentType: 'text/html', body: '<title>Documentation</title>' }));
    await waitForCards(page, 4);
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: ACCESSIBLE_NAME, exact: true }).click()
    ]);
    await popup.waitForLoadState();
    assert.equal(popup.url(), DOCS_URL);
    assert.equal(await popup.evaluate(() => window.opener), null, 'rel="noopener" : l\'onglet n\'a pas accès à la page du widget');
    assert.equal(page.url().includes('github.com'), false, 'le widget reste où il est');
  }));

test('le lien ne s\'imprime pas : c\'est une commande, comme la barre d\'outils', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#docLink').isVisible(), true, 'à l\'écran');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#docLink').isVisible(), false, 'sur le papier');
  }));

test('sans adresse (DOCS_URL vide), le lien reste caché et rien d\'autre n\'en souffre', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    // Le code livré avec une adresse vide : le serveur de test renvoie constants.js modifié, la page se recharge.
    await page.route('**/constants.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/export const DOCS_URL = '[^']*';/, 'export const DOCS_URL = \'\';');
      await route.fulfill({ response, body });
    });
    await page.reload();
    await waitForCards(page, 4);
    assert.equal(await page.locator('#docLink').count(), 1, 'le lien est dans la page');
    assert.equal(await page.locator('#docLink').isHidden(), true, 'mais caché');
    assert.equal(await page.locator('#docLink').getAttribute('href'), null, 'et sans adresse');
    assert.deepEqual(logs.pageErrors, []);
  }));

test('un index.html ancien, sans le lien (cache de GitHub Pages : dix minutes), ne gêne pas le code neuf', { skip }, () =>
  withWidget({
    tables: sampleTables(),
    // La page est lue avant le module : l'observateur retire le lien dès que l'analyseur le pose, comme s'il n'avait jamais existé.
    initScript: () => new MutationObserver(() => document.getElementById('docLink')?.remove()).observe(document, { childList: true, subtree: true })
  }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#docLink').count(), 0);
    assert.deepEqual(logs.pageErrors, [], 'le code neuf démarre sans ce lien');
  }));
