// Test navigateur de bout en bout : charge le vrai index.html (main.js,
// render.js, style.css) dans Chromium, avec une API Grist simulée qui sert les
// données de tests/fixtures.mjs, et vérifie ce que voit l'utilisateur :
// nombre de contacts, badge établissement (Etablissement2), filtres, pannes.
//
// Limite assumée : le simulateur ne remplace pas un vrai document Grist (voir
// TESTING.md) ; il garantit que le câblage et le rendu réels réagissent bien
// aux encodages Grist connus et aux pannes de lecture.
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
import { sampleTables, DEFAULT_CARD_NAMES, HOSTILE_FIRST_NAME } from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const GRIST_API_URL = 'https://docs.getgrist.com/grist-plugin-api.js';

// Remplace grist-plugin-api.js. __tables / __failTables sont posés par le test
// avant le chargement ; __triggerRecords rejoue un onRecords (édition Grist).
const GRIST_MOCK = `
window.grist = {
  ready(options) { window.__gristReady = options; },
  onRecords(callback) { window.__triggerRecords = callback; setTimeout(callback, 0); },
  docApi: {
    async fetchTable(name) {
      if (window.__failTables.includes(name)) throw new Error('Grist indisponible : ' + name);
      if (!window.__tables[name]) throw new Error('Table inconnue : ' + name);
      return JSON.parse(JSON.stringify(window.__tables[name]));
    }
  }
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

after(async () => {
  await browser?.close();
  server?.close();
});

async function openWidget({ tables = sampleTables(), failTables = [] } = {}) {
  const context = await browser.newContext();
  // Hermétique : seul le serveur local et l'API Grist simulée répondent.
  await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
  await context.route(GRIST_API_URL, route => route.fulfill({ contentType: 'text/javascript', body: GRIST_MOCK }));
  const page = await context.newPage();
  const logs = { errors: [], warnings: [] };
  page.on('pageerror', error => logs.errors.push(error.message));
  page.on('console', message => {
    // text() réduit un objet à « JSHandle@object » : on relit les arguments.
    const readable = async () => (await Promise.all(message.args().map(arg => arg.jsonValue())))
      .map(value => (typeof value === 'string' ? value : JSON.stringify(value))).join(' ');
    if (message.type() === 'error') logs.errors.push(readable());
    if (message.type() === 'warning') logs.warnings.push(readable());
  });
  await page.addInitScript(({ tables, failTables }) => {
    window.__tables = tables;
    window.__failTables = failTables;
  }, { tables, failTables });
  await page.goto(`${baseUrl}/index.html`);
  return { page, context, logs };
}

// Rejoue un onRecords (comme une édition dans Grist) et attend la fin du debounce.
async function reload(page) {
  await page.evaluate(() => window.__triggerRecords());
}

const cardCount = page => page.locator('.contact-card').count();
const waitForCards = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.contact-card').length === expected, count);
const waitForBanner = (page, visible = true) =>
  page.waitForFunction(expected => !document.getElementById('statusBanner').hidden === expected, visible);
const cardNames = page => page.locator('.contact-card .name').allTextContents();
const resultCount = page => page.locator('#resultCount').textContent();
const bannerText = page => page.locator('#statusBanner').textContent();

async function withWidget(options, run) {
  const widget = await openWidget(options);
  try {
    await run(widget);
  } finally {
    await widget.context.close();
  }
}

// ===== Affichage nominal =====

test('affiche les contacts éligibles, avec le badge établissement (Etablissement2) de chaque carte', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, DEFAULT_CARD_NAMES.length);
    assert.deepEqual(await cardNames(page), DEFAULT_CARD_NAMES);
    assert.equal(await resultCount(page), '4 contacts');
    assert.deepEqual(
      await page.locator('.contact-card .etablissement-tag').allTextContents(),
      ['CHU', 'CHU', 'Institut Bergonié', 'CHU'],
      'chaque carte porte son établissement'
    );
    assert.equal(await page.locator('#statusBanner').isHidden(), true, 'aucun bandeau quand tout va bien');
    assert.deepEqual(await Promise.all(logs.errors), []);
    assert.equal((await page.evaluate(() => window.__gristReady)).requiredAccess, 'full', 'cohérent avec manifest.yml');
  }));

test('exclut les contacts non éligibles : établissement « autres », non validé, sans Etablissement2, hors périmètre, sans nom', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const names = (await cardNames(page)).join('|');
    for (const hidden of ['Carla', 'Dan', 'Eve', 'Fred', 'Bob']) {
      assert.ok(!names.includes(hidden), `${hidden} ne doit pas apparaître`);
    }
  }));

test('affiche le contenu des cartes : initiales, fonction, téléphone formaté, tags', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = page.locator('.contact-card').first();
    assert.equal(await ana.locator('.avatar').textContent(), 'AM');
    assert.equal(await ana.locator('.fonction').textContent(), 'Pharmacienne');
    assert.equal(await ana.locator('.tel').textContent(), '☎ 05 56 78 90 12', 'le 0 initial perdu par le type Numeric est rétabli');
    assert.equal(await ana.locator('.email').getAttribute('href'), 'mailto:ana.martin@chu-bordeaux.fr');
    const tagsByGroup = await ana.locator('.tag-group').evaluateAll(groups =>
      groups.map(group => [group.querySelector('.tag-group-title').textContent,
        [...group.querySelectorAll('.tag')].map(tag => tag.textContent)]));
    assert.deepEqual(tagsByGroup, [
      ['Instances', ['CME']],
      ['Actions', ['Vaccination']],
      ['Compétences', ['oncologie']],
      ['Communautés', ['Réseau douleur']],
      ['Rôle PUI', ['Référent qualité']]
    ]);
    assert.equal(await ana.locator('.tag-static').count(), 1, 'le tag Rôle PUI n\'est pas cliquable');

    const hugo = page.locator('.contact-card').nth(3);
    assert.equal(await hugo.locator('.tel.visible').count(), 0, 'pas de ligne téléphone vide');
    assert.equal(await hugo.locator('.email.visible').count(), 0, 'pas de ligne email vide');
    assert.equal(await hugo.locator('.card-tags').locator('.tag').count(), 0, 'id 999 introuvable : aucun tag fantôme');
  }));

test('affiche en texte brut un prénom contenant du HTML (aucune injection)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('.contact-card .name').nth(1).textContent(), `${HOSTILE_FIRST_NAME} Hostile`);
    assert.equal(await page.locator('#cardsGrid img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  }));

test('ne crée un lien mailto que pour une adresse sans paramètre injectable', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const gina = page.locator('.contact-card').nth(2);
    assert.equal(await gina.locator('.email').textContent(), 'gina@bergonie.fr?cc=intrus@example.fr');
    assert.equal(await gina.locator('.email').getAttribute('href'), null, 'adresse douteuse : texte sans lien');
  }));

// ===== Interrupteurs, recherche, filtres =====

test('Partenaires révèle les contacts partenaires ; Réinitialiser ne touche pas aux interrupteurs', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    assert.ok((await cardNames(page)).includes('Bob Durand'));

    await page.click('[data-scope="fondateur"]');
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Bob Durand']);

    await page.click('#resetFilters');
    assert.equal(await cardCount(page), 1, 'le choix Partenaires seuls survit à « Réinitialiser »');
  }));

test('la recherche ignore casse et accents, et se vide avec Réinitialiser', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.fill('#searchInput', 'BERGONIE');
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Gina Bergonié']);
    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await page.inputValue('#searchInput'), '');
  }));

test('cliquer un tag de carte coche le filtre, met à jour le menu et le badge ; Réinitialiser le décoche', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('.contact-card').first().locator('.tag-instances').click();
    await waitForCards(page, 1);
    const filter = page.locator('.filter[data-filter-key="instances"]');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    await filter.locator('.filter-button').click();
    assert.equal(await filter.locator('.filter-option').first().locator('input').isChecked(), true);

    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await page.locator('.filter-count:not([hidden])').count(), 0);
  }));

test('le filtre Compétences retrouve une compétence saisie à la main malgré la casse', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const filter = page.locator('.filter[data-filter-key="competences"]');
    await filter.locator('.filter-button').click();
    await filter.locator('.filter-option', { hasText: 'Oncologie' }).locator('input').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);
  }));

test('chaque option de menu affiche le nombre de cartes qu\'elle donnerait', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const counts = () => page.locator('.filter[data-filter-key="instances"] .filter-option').evaluateAll(options =>
      Object.fromEntries(options.map(option => [option.querySelector('.option-label').textContent,
        option.querySelector('.option-count').textContent])));
    assert.deepEqual(await counts(), { CME: '1', COVIRIS: '0' }, 'Bob (COVIRIS) est masqué par défaut');
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    assert.deepEqual(await counts(), { CME: '2', COVIRIS: '1' });
  }));

test('la recherche interne d\'un menu ignore les accents', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const filter = page.locator('.filter[data-filter-key="communautes"]');
    await filter.locator('.filter-button').click();
    await filter.locator('.filter-search-input').fill('reseau');
    assert.equal(await filter.locator('.filter-option', { hasText: 'Réseau douleur' }).isVisible(), true);
    assert.equal(await filter.locator('.filter-option', { hasText: 'Soins palliatifs' }).isVisible(), false);
  }));

test('le menu Établissement ne propose pas un établissement non validé', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const labels = await page.locator('.filter[data-filter-key="etablissement"] .option-label').allTextContents();
    assert.ok(labels.includes('CHU') && labels.includes('Institut Bergonié'));
    assert.ok(!labels.includes('INSERM'));
  }));

// ===== Pannes : jamais un faux « 0 contact » silencieux =====

test('panne de lecture d\'Etablissements au démarrage : message explicite, pas de « 0 contact » trompeur', { skip }, () =>
  withWidget({ failTables: ['Etablissements'] }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Etablissements/);
    assert.equal(await resultCount(page), 'Chargement impossible');
    assert.equal(await cardCount(page), 0);
  }));

test('panne de lecture d\'Annuaire au démarrage : message explicite', { skip }, () =>
  withWidget({ failTables: ['Annuaire'] }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Annuaire/);
    assert.equal(await resultCount(page), 'Chargement impossible');
  }));

test('panne après un chargement réussi : les cartes restent, le bandeau apparaît puis disparaît au retour à la normale', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.evaluate(() => { window.__failTables = ['Etablissements']; });
    await reload(page);
    await waitForBanner(page);
    assert.equal(await cardCount(page), 4, 'on ne vide pas l\'affichage sur une panne passagère');
    assert.equal(await resultCount(page), '4 contacts');

    await page.evaluate(() => { window.__failTables = []; });
    await reload(page);
    await waitForBanner(page, false);
    assert.equal(await cardCount(page), 4);
  }));

test('table de référence illisible : données partielles signalées, filtres et menus conservés', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const filter = page.locator('.filter[data-filter-key="actions"]');
    await filter.locator('.filter-button').click();
    await filter.locator('.filter-option', { hasText: 'Vaccination' }).locator('input').check();
    await waitForCards(page, 1);

    await page.evaluate(() => { window.__failTables = ['Actions']; });
    await reload(page);
    await waitForBanner(page);
    assert.match(await bannerText(page), /Actions/);
    assert.equal(await cardCount(page), 1, 'la sélection Vaccination n\'est pas effacée par la panne');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    assert.equal(await filter.locator('.filter-option', { hasText: 'Vaccination' }).count(), 1, 'le menu garde ses options');
  }));

test('acronymes en double aux statuts contradictoires : leurs contacts sont masqués et le problème est signalé', { skip }, () => {
  const tables = sampleTables();
  // Deuxième ligne « CHU » non validée : ambigu, donc on ne montre rien.
  tables.Etablissements.id.push(6);
  tables.Etablissements.acronyme.push('CHU');
  tables.Etablissements.nom_complet.push('CHU (doublon)');
  tables.Etablissements.fondateur.push(true);
  tables.Etablissements.partenaire.push(false);
  tables.Etablissements.autres.push(false);
  tables.Etablissements.ok_pour_apparaitre.push(false);
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /CHU/);
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Gina Bergonié'], 'seuls les contacts d\'un établissement sans ambiguïté restent');
  });
});

test('colonne Etablissement2 absente d\'Annuaire : erreur explicite au lieu de « 0 contact »', { skip }, () => {
  const tables = sampleTables();
  delete tables.Annuaire.Etablissement2;
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Etablissement2/);
    assert.equal(await resultCount(page), 'Chargement impossible');
  });
});

test('Etablissement2 vide pour tous les contacts : le bandeau le dit', { skip }, () => {
  const tables = sampleTables();
  tables.Annuaire.Etablissement2 = tables.Annuaire.Etablissement2.map(() => '');
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Etablissement2/);
    assert.equal(await cardCount(page), 0);
  });
});

test('contacts sans Etablissement2 : diagnostic console par identifiant, sans adresse email', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const diagnostic = (await Promise.all(logs.warnings)).find(line => line.includes('[ETABLISSEMENT]'));
    assert.ok(diagnostic, 'avertissement présent');
    assert.ok(!diagnostic.includes('@'), 'aucune adresse email dans la console');
    assert.match(diagnostic, /\[5\]/, 'l\'identifiant de ligne d\'Eve (5) permet de la retrouver dans Grist');
  }));
