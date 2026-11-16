// Le bouton « Documentation » de l'en-tête (1.37.0 : un lien ; 1.39.0 : un bouton) : sous le slogan, il ouvre la fenêtre où se lit la
// documentation du dépôt (docs-ui.js ; la fenêtre elle-même est essayée dans tests/docs-viewer.test.mjs). DOCS_URL (constants.js) est
// l'adresse de la page de GitHub que la fenêtre propose à côté, la seule à changer quand le dépôt change d'adresse (migration vers le
// dépôt de production) ; une adresse vide retire le bouton.
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
const MARKUP = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); // sans ses commentaires, qui parlent du bouton
const BUTTON = MARKUP.match(/<button\b([^>]*\bid="docLink"[^>]*)>([\s\S]*?)<\/button>/);
const DIALOG = MARKUP.match(/<dialog\b([^>]*\bid="docDialog"[^>]*)>([\s\S]*?)<\/dialog>/);

test('DOCS_URL est vide (pas de lien) ou une adresse https sans identifiants', () => {
  assert.equal(typeof DOCS_URL, 'string');
  if (DOCS_URL === '') return;
  const url = new URL(DOCS_URL);
  assert.equal(url.protocol, 'https:', 'une page de documentation se lit en https');
  assert.equal(`${url.username}${url.password}`, '', 'ni nom ni mot de passe dans une adresse écrite dans le code');
});

test('index.html : le bouton est caché au départ et sans adresse, il annonce une fenêtre, et son texte est « Documentation »', () => {
  assert.ok(BUTTON, 'index.html a un bouton d\'id docLink');
  const [, attributes, content] = BUTTON;
  assert.match(attributes, /\bhidden\b/, 'caché tant que main.js ne l\'a pas allumé (DOCS_URL)');
  assert.match(attributes, /\btype="button"/, 'un bouton, jamais un envoi de formulaire');
  assert.match(attributes, /\baria-haspopup="dialog"/, 'les lecteurs d\'écran savent qu\'il ouvre une fenêtre');
  assert.doesNotMatch(attributes, /\bhref=/, 'ni adresse ni onglet : il ouvre une fenêtre du widget');
  assert.equal(content.trim(), 'Documentation');
});

test('index.html : la fenêtre de la documentation est une fenêtre nommée, avec sa barre de documents, son corps et son pied', () => {
  assert.ok(DIALOG, 'index.html a une fenêtre d\'id docDialog');
  const [, attributes, content] = DIALOG;
  assert.match(attributes, /\baria-labelledby="docTitle"/);
  assert.match(content, /<h2 id="docTitle" tabindex="-1">Documentation<\/h2>/, 'son titre est le nom de la fenêtre');
  assert.match(content, /<button[^>]*\bdata-close\b[^>]*\baria-label="Fermer la documentation"/, 'une croix nommée');
  assert.match(content, /<nav class="doc-nav" aria-label="Documents"><\/nav>/);
  assert.match(content, /<p class="doc-status sr-only" role="status"><\/p>/, 'le document affiché est annoncé aux lecteurs d\'écran');
  assert.match(content, /<div class="dlg-body doc-body"><\/div>/);
  assert.match(content, /<footer class="dlg-foot"><\/footer>/);
  assert.equal(MARKUP.indexOf('id="docDialog"') > MARKUP.indexOf('id="profileDialog"'), true, 'après les fenêtres de saisie : elle s\'ouvre par-dessus (index.html)');
});

test('le bouton est dans l\'en-tête, sous le titre et au-dessus de la barre d\'outils', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const button = page.getByRole('button', { name: 'Documentation', exact: true });
    assert.equal(await button.count(), 1, 'un seul bouton « Documentation »');
    assert.equal(await button.isVisible(), true);
    assert.equal(await button.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(await button.evaluate(element => element.closest('.page-header') !== null), true, 'dans l\'en-tête');
    const box = await button.boundingBox();
    const title = await page.locator('h1').boundingBox();
    const toolbar = await page.locator('#toolbar').boundingBox();
    assert.ok(box.y > title.y + title.height, 'sous le titre');
    assert.ok(box.y + box.height <= toolbar.y, 'au-dessus de la barre d\'outils');
    assert.ok(box.height >= 24 && box.width >= 24, `assez grand pour le doigt (${Math.round(box.width)} × ${Math.round(box.height)} px)`);
  }));

test('un clic ouvre la fenêtre dans le widget, sans nouvel onglet ni départ vers GitHub', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    await waitForCards(page, 4);
    const opened = [];
    context.on('page', popup => opened.push(popup.url()));
    await page.getByRole('button', { name: 'Documentation', exact: true }).click();
    await page.locator('#docDialog .md').waitFor();
    assert.equal(await page.locator('#docDialog').evaluate(dialog => dialog.open), true);
    assert.deepEqual(opened, [], 'aucun nouvel onglet');
    assert.equal(page.url().includes('github.com'), false, 'le widget reste où il est');
  }));

test('le bouton ne s\'imprime pas : c\'est une commande, comme la barre d\'outils', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#docLink').isVisible(), true, 'à l\'écran');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#docLink').isVisible(), false, 'sur le papier');
  }));

test('sans adresse (DOCS_URL vide), le bouton reste caché et rien d\'autre n\'en souffre', { skip }, () =>
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
    assert.equal(await page.locator('#docLink').count(), 1, 'le bouton est dans la page');
    assert.equal(await page.locator('#docLink').isHidden(), true, 'mais caché');
    assert.equal(await page.locator('#docLink').getAttribute('href'), null, 'et sans adresse');
    assert.equal(await page.locator('#docDialog').evaluate(dialog => dialog.open), false, 'la fenêtre reste fermée');
    assert.deepEqual(logs.pageErrors, []);
  }));

test('un index.html ancien, sans le bouton (cache de GitHub Pages : dix minutes), ne gêne pas le code neuf', { skip }, () =>
  withWidget({
    tables: sampleTables(),
    // La page est lue avant le module : l'observateur retire le bouton dès que l'analyseur le pose, comme s'il n'avait jamais existé.
    initScript: () => new MutationObserver(() => document.getElementById('docLink')?.remove()).observe(document, { childList: true, subtree: true })
  }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#docLink').count(), 0);
    assert.deepEqual(logs.pageErrors, [], 'le code neuf démarre sans ce bouton');
  }));

test('un index.html ancien, avec le lien mais sans la fenêtre, garde un lien vers GitHub : rien n\'est cassé le temps du cache', { skip: skip || !DOCS_URL }, () =>
  withWidget({
    tables: sampleTables(),
    // L'ancien index.html (1.37.0) : un lien <a id="docLink">, pas de fenêtre. L'observateur remplace le bouton et retire la fenêtre.
    initScript: () => new MutationObserver(() => {
      document.getElementById('docDialog')?.remove();
      const button = document.querySelector('button#docLink');
      if (!button) return;
      const link = document.createElement('a');
      link.id = 'docLink';
      link.className = 'doc-link';
      link.hidden = true;
      link.textContent = 'Documentation';
      button.replaceWith(link);
    }).observe(document, { childList: true, subtree: true })
  }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('a#docLink').getAttribute('href'), DOCS_URL, 'le lien mène à la page de GitHub, comme en 1.37.0');
    assert.equal(await page.locator('#docLink').isVisible(), true);
    assert.deepEqual(logs.pageErrors, []);
  }));
