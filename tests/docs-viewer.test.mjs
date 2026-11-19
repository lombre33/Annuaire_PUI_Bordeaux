// La fenêtre « Documentation » (docs-ui.js, markdown-dom.js) dans Chromium, sur le vrai index.html et les vrais documents du dépôt :
// elle s'ouvre sur la présentation, montre chaque document sans en perdre un titre, suit les liens d'un document à l'autre, dit sa
// panne et la page de GitHub à la place, et ne laisse rien de ce qu'un document pourrait contenir s'exécuter, se charger ou se saisir.
// Optionnel (voir TESTING.md) : sans Playwright, ces tests sont ignorés.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_URL } from '../constants.js';
import { DOC_PAGES } from '../docs-source.js';
import { parseMarkdown } from '../markdown.js';
import { sampleTables } from './fixtures.mjs';
import { focusReturnsTo, skip, until, waitForCards, withWidget } from './support/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const MARKDOWN = { contentType: 'text/markdown; charset=utf-8' };
const DIALOG = '#docDialog';

async function openDocs(page) {
  await waitForCards(page, 4);
  await page.locator('#docLink').click();
  await page.locator(`${DIALOG} .md`).waitFor();
}

const subtitle = page => page.locator(`${DIALOG} .dlg-sub`).textContent();
const tab = (page, label) => page.locator(`${DIALOG} .doc-tab`, { hasText: label });
const showsDocument = (page, label) => page.waitForFunction(
  wanted => document.querySelector('#docDialog .dlg-sub').textContent === wanted && document.querySelector('#docDialog .md'), label
);
const body = page => page.locator(`${DIALOG} .doc-body`);

test('le bouton « Documentation » ouvre la fenêtre sur la présentation, sans changer d\'onglet ni de page', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    await waitForCards(page, 4);
    const popups = [];
    context.on('page', popup => popups.push(popup));
    assert.equal(await page.locator(DIALOG).evaluate(dialog => dialog.open), false, 'fermée au départ');
    await page.locator('#docLink').click();
    await page.locator(`${DIALOG} .md`).waitFor();
    assert.equal(await page.locator(DIALOG).evaluate(dialog => dialog.open), true);
    assert.equal(await page.locator(`${DIALOG} h2`).textContent(), 'Documentation');
    assert.equal(await subtitle(page), 'Présentation');
    assert.equal(await page.locator(DIALOG).getAttribute('aria-labelledby'), 'docTitle');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'docTitle', 'le titre est lu d\'abord');
    assert.equal(await page.locator(`${DIALOG} .md-h1`).first().textContent(), 'Annuaire PUI Bordeaux');
    assert.equal(await page.locator(`${DIALOG} .md-h1`).first().evaluate(heading => heading.tagName), 'H3', 'le titre du document passe sous celui de la fenêtre');
    assert.deepEqual(await page.locator(`${DIALOG} .doc-tab`).allTextContents(), DOC_PAGES.map(item => item.label));
    assert.equal(await page.locator(`${DIALOG} .doc-tab[aria-current="page"]`).textContent(), 'Présentation');
    assert.equal(await page.locator(`${DIALOG} .doc-status`).textContent(), 'Présentation affiché', 'annoncé aux lecteurs d\'écran');
    assert.equal(await page.locator(`${DIALOG} .notice-ko`).count(), 0);
    assert.equal(await page.locator(`${DIALOG} .dlg-foot button`, { hasText: 'Retour' }).isVisible(), false, 'rien où retourner');
    assert.equal(popups.length, 0, 'aucun nouvel onglet');
    assert.equal(page.url().includes('github.com'), false);
    const github = page.locator(`${DIALOG} .dlg-foot a`);
    assert.equal(await github.getAttribute('href'), DOCS_URL, 'la page de GitHub reste proposée, à côté');
    assert.equal(await github.getAttribute('target'), '_blank');
    assert.equal(await github.getAttribute('rel'), 'noopener noreferrer');
  }));

test('chaque document s\'ouvre dans la fenêtre : tous ses titres, rien d\'exécutable, rien qui déborde', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await openDocs(page);
    for (const { path: file, label } of DOC_PAGES) {
      await tab(page, label).click();
      await showsDocument(page, label);
      const expected = parseMarkdown(source(file)).headings.map(heading => heading.text);
      const shown = await page.locator(`${DIALOG} .md-h`).evaluateAll(headings => headings.map(heading => heading.textContent));
      assert.deepEqual(shown, expected, `${label} : les titres du fichier sont tous là, dans l'ordre`);
      const found = await page.evaluate(() => {
        const root = document.querySelector('#docDialog .doc-body');
        return {
          forbidden: [...root.querySelectorAll('script, style, iframe, frame, object, embed, form, input, button, select, textarea, link, meta, base, svg, video, audio')].map(node => node.tagName),
          handlers: [...root.querySelectorAll('*')].flatMap(node => [...node.attributes].map(attribute => attribute.name).filter(name => /^on/i.test(name))),
          badLinks: [...root.querySelectorAll('a')].map(link => link.getAttribute('href')).filter(href => href !== '#' && !/^https:\/\//.test(href)),
          overflow: root.scrollWidth - root.clientWidth,
          unnamedImages: [...root.querySelectorAll('img')].filter(image => !image.alt.trim()).length,
          ids: [...root.querySelectorAll('[id]')].filter(node => !node.id.startsWith('doc-')).map(node => node.id)
        };
      });
      assert.deepEqual(found.forbidden, [], `${label} : aucune balise exécutable ou de saisie`);
      assert.deepEqual(found.handlers, [], `${label} : aucun gestionnaire d'événement`);
      assert.deepEqual(found.badLinks, [], `${label} : un lien est « # » (géré par la fenêtre) ou une adresse https`);
      assert.ok(found.overflow <= 1, `${label} : le document ne déborde pas de la fenêtre (${found.overflow} px)`);
      assert.equal(found.unnamedImages, 0, `${label} : chaque image a son texte de remplacement`);
      assert.deepEqual(found.ids, [], `${label} : les identifiants de titre ont tous le préfixe doc-`);
      assert.equal(await page.locator(`${DIALOG} .notice-ko`).count(), 0, `${label} : aucune panne`);
    }
    assert.deepEqual(logs.pageErrors, []);
  }));

test('la barre change de document, « Retour » revient au précédent, au même endroit', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    await body(page).evaluate(element => { element.scrollTop = 600; });
    const before = await body(page).evaluate(element => element.scrollTop);
    assert.ok(before > 300, 'la présentation est assez longue pour défiler');
    await tab(page, 'Guide utilisateur').click();
    await showsDocument(page, 'Guide utilisateur');
    assert.equal(await page.locator(`${DIALOG} .doc-tab[aria-current="page"]`).textContent(), 'Guide utilisateur');
    assert.equal(await tab(page, 'Guide utilisateur').evaluate(button => document.activeElement === button), true, 'le focus reste sur la barre');
    assert.equal(await body(page).evaluate(element => element.scrollTop), 0, 'un document s\'ouvre en haut');
    const back = page.locator(`${DIALOG} .dlg-foot button`, { hasText: 'Retour' });
    assert.equal(await back.isVisible(), true);
    await back.click();
    await showsDocument(page, 'Présentation');
    assert.equal(await page.locator(`${DIALOG} .doc-tab[aria-current="page"]`).textContent(), 'Présentation');
    await until(async () => Math.abs((await body(page).evaluate(element => element.scrollTop)) - before) <= 2, 'Retour doit rendre le défilement d\'où l\'on est parti');
    assert.equal(await back.isVisible(), false, 'plus rien où retourner');
  }));

test('un lien d\'un document ouvre l\'autre dans la fenêtre, à son titre, et « Retour » ramène à la page de départ', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    const link = page.locator(`${DIALOG} a.md-doc-link[data-doc="docs/utilisateurs.md"][data-anchor="lire-une-carte"]`).first();
    await link.scrollIntoViewIfNeeded();
    const before = await body(page).evaluate(element => element.scrollTop);
    await link.click();
    await showsDocument(page, 'Guide utilisateur');
    assert.equal(await page.locator(`${DIALOG} .doc-tab[aria-current="page"]`).textContent(), 'Guide utilisateur');
    const heading = page.locator(`${DIALOG} #doc-lire-une-carte`);
    assert.equal(await heading.evaluate(element => document.activeElement === element), true, 'le focus est sur le titre visé');
    const [bodyBox, headingBox] = await Promise.all([body(page).boundingBox(), heading.boundingBox()]);
    assert.ok(headingBox.y >= bodyBox.y - 2 && headingBox.y < bodyBox.y + 120, `le titre est en haut de la fenêtre (${Math.round(headingBox.y - bodyBox.y)} px sous le bord)`);
    assert.equal(page.url().includes('#'), false, 'l\'adresse de la page du widget ne change pas');
    await page.locator(`${DIALOG} .dlg-foot button`, { hasText: 'Retour' }).click();
    await showsDocument(page, 'Présentation');
    await until(async () => Math.abs((await body(page).evaluate(element => element.scrollTop)) - before) <= 2, 'retour au même endroit de la présentation');
  }));

test('un lien vers un titre du même document fait défiler jusqu\'à lui, et « Retour » revient où l\'on lisait', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    await tab(page, 'Guide utilisateur').click();
    await showsDocument(page, 'Guide utilisateur');
    const link = page.locator(`${DIALOG} a.md-doc-link:not([data-doc])[data-anchor="lire-une-carte"]`).first();
    assert.ok(await link.count(), 'le sommaire du guide a un lien vers « Lire une carte »');
    await link.click();
    const heading = page.locator(`${DIALOG} #doc-lire-une-carte`);
    await until(async () => (await heading.boundingBox()).y < (await body(page).boundingBox()).y + 120, 'le titre doit monter en haut de la fenêtre');
    assert.equal(await heading.evaluate(element => document.activeElement === element), true);
    assert.equal(await subtitle(page), 'Guide utilisateur', 'même document');
    await page.locator(`${DIALOG} .dlg-foot button`, { hasText: 'Retour' }).click();
    await until(async () => (await body(page).evaluate(element => element.scrollTop)) === 0, 'retour au sommaire, en haut');
  }));

test('les liens vers un autre site s\'ouvrent dans un autre onglet sans transmettre la page ; les autres adresses ne sont pas des liens', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    const external = await page.locator(`${DIALOG} a.md-ext`).evaluateAll(links => links.map(link => ({ href: link.href, target: link.target, rel: link.rel, hidden: link.querySelector('.sr-only')?.textContent })));
    assert.ok(external.length >= 1, 'la présentation renvoie à une page web');
    for (const link of external) {
      assert.match(link.href, /^https:\/\//);
      assert.equal(link.target, '_blank');
      assert.match(link.rel, /\bnoopener\b/);
      assert.match(link.rel, /\bnoreferrer\b/);
      assert.match(link.hidden, /nouvel onglet/, 'les lecteurs d\'écran savent qu\'il ouvre un autre onglet');
    }
    assert.equal(await page.locator(`${DIALOG} a:not(.md-ext):not(.md-doc-link):not(.btn)`).count(), 0, 'pas d\'autre sorte de lien dans un document');
  }));

test('les images sont celles du dépôt ; une image d\'un autre site n\'est pas chargée : on lit son texte', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    const hosts = new Set();
    page.on('request', request => hosts.add(new URL(request.url()).hostname));
    await openDocs(page);
    const image = page.locator(`${DIALOG} img.md-img`).first();
    await image.scrollIntoViewIfNeeded();
    await until(() => image.evaluate(element => element.complete && element.naturalWidth > 0), 'la première capture doit se charger');
    assert.match(await image.getAttribute('src'), /\/docs\/images\/apercu\.png$/);
    assert.equal(await page.locator(`${DIALOG} img.md-img`).evaluateAll(images => images.filter(element => !element.src.startsWith(location.origin)).length), 0, 'aucune image d\'un autre serveur');
    assert.ok((await page.locator(`${DIALOG} .md-img-alt`).allTextContents()).includes('Tests'), 'la pastille de GitHub se lit par son texte');
    assert.deepEqual([...hosts].filter(host => host !== '127.0.0.1'), [], 'aucune requête vers un autre serveur que celui du widget : ni pastille de GitHub, ni image extérieure');
  }));

test('un document hostile ne s\'exécute pas, ne charge rien et ne perturbe pas le widget', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context, logs }) => {
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await context.route('**/README.md', route => route.fulfill({
      ...MARKDOWN,
      body: [
        '# toolbar', '', '## cardsGrid', '',
        '<script>window.__pwned = 1</script>', '',
        'avant <img src="https://evil.example/a.png" onerror="window.__pwned = 2"> après', '',
        '[js](javascript:window.__pwned=3) [data](data:text/html,<script>window.__pwned=9</script>) [mail](mailto:x@example.org) [http](http://example.org/)', '',
        '<a href="javascript:window.__pwned=4" onclick="window.__pwned=5" style="position:fixed">piège</a>', '',
        '![pixel](https://evil.example/pixel.png) ![donnée](data:image/png;base64,AAAA) ![js](javascript:alert(1))', '',
        '<iframe src="https://evil.example/cadre"></iframe>', '', '<style>body { display: none }</style>', '',
        '<form action="https://evil.example/envoi"><input name="x"><button>Envoyer</button></form>', '',
        '<svg onload="window.__pwned = 6"><script>window.__pwned = 7</script></svg>', '',
        '<div style="position:fixed;inset:0" onclick="window.__pwned = 8">couvre tout</div>', '',
        '[sûr](https://example.org/page)', '', '[ailleurs](../../../etc/passwd) [dépôt](constants.js)'
      ].join('\n')
    }));
    await openDocs(page);
    const state = await page.evaluate(() => {
      const root = document.querySelector('#docDialog .doc-body');
      return {
        pwned: window.__pwned ?? null,
        forbidden: root.querySelectorAll('script, style, iframe, object, embed, form, input, button, svg').length,
        handlers: [...root.querySelectorAll('*')].flatMap(node => [...node.attributes].map(attribute => attribute.name)).filter(name => /^on|^style$/i.test(name)),
        anchors: [...root.querySelectorAll('a')].map(link => link.getAttribute('href')),
        images: root.querySelectorAll('img').length,
        text: root.textContent,
        toolbarIsWidgets: document.getElementById('toolbar')?.getAttribute('aria-label'),
        gridIsWidgets: document.getElementById('cardsGrid')?.getAttribute('aria-label'),
        headingIds: [...root.querySelectorAll('.md-h')].map(heading => heading.id),
        bodyDisplay: getComputedStyle(document.body).display
      };
    });
    assert.equal(state.pwned, null, 'rien ne s\'est exécuté');
    assert.equal(state.forbidden, 0, 'ni script, ni style, ni cadre, ni formulaire');
    assert.deepEqual(state.handlers, [], 'ni gestionnaire d\'événement, ni style en ligne');
    assert.deepEqual(state.anchors.filter(href => href !== '#'), ['https://example.org/page'], 'un seul vrai lien : la page https');
    assert.equal(state.images, 0, 'aucune image : ni l\'adresse extérieure, ni data:, ni javascript:');
    for (const shown of ['<script>window.__pwned = 1</script>', '<iframe src="https://evil.example/cadre"></iframe>', '<style>body { display: none }</style>', '<form action="https://evil.example/envoi">', '<svg onload="window.__pwned = 6">']) {
      assert.ok(state.text.includes(shown), `le texte « ${shown} » est montré tel quel`);
    }
    for (const label of ['js', 'data', 'mail', 'http', 'ailleurs', 'dépôt', 'piège', 'couvre tout']) assert.ok(state.text.includes(label), `le texte « ${label} » reste lisible, sans lien`);
    assert.deepEqual(state.headingIds, ['doc-toolbar', 'doc-cardsgrid'], 'un titre qui a le nom d\'un élément du widget n\'en prend pas l\'identifiant');
    assert.equal(state.toolbarIsWidgets, 'Recherche et filtres', 'le widget garde son #toolbar');
    assert.equal(state.gridIsWidgets, 'Contacts', 'et sa grille');
    assert.notEqual(state.bodyDisplay, 'none');
    assert.deepEqual(requested.filter(url => !new URL(url).hostname.match(/^(127\.0\.0\.1|docs\.getgrist\.com)$/)), [], 'aucune requête vers un autre site');
    assert.deepEqual(logs.pageErrors, []);
  }));

test('un document qui manque : le message dit pourquoi, la page de GitHub est proposée, les autres documents s\'ouvrent toujours', { skip: skip || !DOCS_URL }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    await context.route('**/README.md', route => route.fulfill({ status: 404, body: 'Not found' }));
    await waitForCards(page, 4);
    await page.locator('#docLink').click();
    const failure = page.locator(`${DIALOG} .doc-fail`);
    await failure.waitFor();
    assert.equal(await failure.locator('.notice-ko').getAttribute('role'), 'alert');
    assert.match(await failure.locator('.notice-ko').textContent(), /pas disponible dans cette fenêtre.*GitHub/);
    assert.equal(await failure.locator('a').getAttribute('href'), DOCS_URL);
    assert.equal(await failure.locator('button', { hasText: 'Réessayer' }).count(), 0, 'réessayer ne servirait à rien : le fichier n\'est pas publié');
    await tab(page, 'Sécurité').click();
    await showsDocument(page, 'Sécurité');
    assert.equal(await page.locator(`${DIALOG} .doc-fail`).count(), 0, 'un autre document s\'ouvre');
  }));

test('une coupure du réseau : « Réessayer » relit le document', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    let reachable = false;
    await context.route('**/README.md', route => (reachable ? route.fulfill({ ...MARKDOWN, body: '# Revenu\n\ntexte' }) : route.abort()));
    await waitForCards(page, 4);
    await page.locator('#docLink').click();
    await page.locator(`${DIALOG} .doc-fail`).waitFor();
    assert.match(await page.locator(`${DIALOG} .notice-ko`).textContent(), /connexion est interrompue ou trop lente/);
    reachable = true;
    await page.locator(`${DIALOG} .doc-fail button`, { hasText: 'Réessayer' }).click();
    await page.locator(`${DIALOG} .md-h1`, { hasText: 'Revenu' }).waitFor();
    assert.equal(await page.locator(`${DIALOG} .doc-fail`).count(), 0);
  }));

test('un document lent : l\'attente est dite, et la réponse qui arrive après un autre choix est ignorée', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await context.route('**/docs/securite.md', async route => {
      await gate;
      await route.fulfill({ ...MARKDOWN, body: '# Réponse tardive\n\ntexte' });
    });
    await openDocs(page);
    await tab(page, 'Sécurité').click();
    assert.equal(await page.locator(`${DIALOG} .notice-pending`).textContent(), 'Chargement du document…');
    await tab(page, 'Maintenance').click();
    await showsDocument(page, 'Maintenance');
    release();
    await page.waitForTimeout(300);
    assert.equal(await subtitle(page), 'Maintenance');
    assert.equal(await page.locator(`${DIALOG} .doc-tab[aria-current="page"]`).textContent(), 'Maintenance');
    assert.equal(await page.locator(`${DIALOG} .md-h`, { hasText: 'Réponse tardive' }).count(), 0, 'la réponse tardive n\'a pas remplacé le document choisi ensuite');
  }));

test('Échap ferme la fenêtre et rend le focus au bouton ; elle se rouvre sur la présentation, sans rien de l\'ouverture précédente', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    await tab(page, 'Sécurité').click();
    await showsDocument(page, 'Sécurité');
    await page.keyboard.press('Escape');
    await focusReturnsTo(page, '#docLink');
    assert.equal(await page.locator(DIALOG).evaluate(dialog => dialog.open), false);
    assert.equal(await body(page).evaluate(element => element.children.length), 0, 'fermée, elle ne garde rien d\'affiché');
    await page.locator('#docLink').click();
    await page.locator(`${DIALOG} .md`).waitFor();
    assert.equal(await subtitle(page), 'Présentation');
    await page.locator(`${DIALOG} [data-close]`).click();
    await focusReturnsTo(page, '#docLink');
    await page.locator('#docLink').click();
    await page.locator(`${DIALOG} .dlg-foot button`, { hasText: 'Fermer' }).click();
    await focusReturnsTo(page, '#docLink');
  }));

test('au clavier : Entrée sur un document de la barre l\'ouvre, le focus y reste ; les tableaux et les codes qui défilent se parcourent au clavier', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    await tab(page, 'Développeurs').focus();
    await page.keyboard.press('Enter');
    await showsDocument(page, 'Développeurs');
    assert.equal(await tab(page, 'Développeurs').evaluate(button => document.activeElement === button), true);
    const regions = await page.locator(`${DIALOG} .md-scroll`).evaluateAll(nodes => nodes.map(node => [node.tabIndex, node.getAttribute('role'), node.getAttribute('aria-label')]));
    assert.ok(regions.length >= 5);
    assert.deepEqual([...new Set(regions.map(region => region.join('|')))], ['0|region|Tableau']);
    const codes = await page.locator(`${DIALOG} pre.md-code`).evaluateAll(nodes => nodes.map(node => node.tabIndex));
    assert.ok(codes.length >= 3);
    assert.deepEqual([...new Set(codes)], [0]);
  }));

test('le schéma Mermaid se lit par sa source, repliée, sans rien charger pour le dessiner', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    await tab(page, 'Développeurs').click();
    await showsDocument(page, 'Développeurs');
    const diagram = page.locator(`${DIALOG} details.md-diagram`).first();
    assert.equal(await diagram.evaluate(element => element.open), false, 'repliée');
    assert.match(await diagram.locator('summary').textContent(), /Schéma/);
    assert.match(await diagram.locator('pre').textContent(), /graph|flowchart|sequenceDiagram|classDiagram|stateDiagram/);
  }));

test('le plus long document s\'affiche vite et sans une page de milliers d\'éléments', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await openDocs(page);
    const started = Date.now();
    await tab(page, 'Historique').click();
    await showsDocument(page, 'Historique');
    const elapsed = Date.now() - started;
    const nodes = await page.locator(`${DIALOG} .md *`).count();
    assert.ok(elapsed < 4000, `le journal des versions s'affiche en ${elapsed} ms`);
    assert.ok(nodes < 15000, `${nodes} éléments`);
  }));

test('dans le cadre sandbox de Grist, sans allow-same-origin (origine opaque), les documents se chargent aussi', { skip }, () =>
  withWidget({}, async ({ page, context }) => {
    const origin = new URL(page.url()).origin;
    const outer = await context.newPage();
    await outer.addInitScript(values => Object.assign(window, values),
      { __tables: sampleTables(), __failTables: [], __user: { email: sampleTables().BDD.email.find(Boolean) }, __denyWrites: [], __denyRows: {}, __delay: 0 });
    await outer.setContent(`<iframe sandbox="allow-scripts allow-forms allow-popups" src="${origin}/index.html"></iframe>`);
    const frame = await (await outer.waitForSelector('iframe')).contentFrame();
    await waitForCards(frame, 4);
    assert.equal(await frame.evaluate(() => window.origin), 'null', 'le cadre est bien sandboxé : son origine est opaque');
    await frame.locator('#docLink').click();
    await frame.locator(`${DIALOG} .md-h1`, { hasText: 'Annuaire PUI Bordeaux' }).waitFor();
    assert.equal(await frame.locator(`${DIALOG} .notice-ko`).count(), 0);
    await frame.locator(`${DIALOG} .doc-tab`, { hasText: 'Sécurité' }).click();
    await frame.waitForFunction(() => document.querySelector('#docDialog .dlg-sub').textContent === 'Sécurité' && document.querySelector('#docDialog .md'));
  }));

test('sur un téléphone, la fenêtre prend tout l\'écran, la barre des documents défile, le pied reste visible', { skip }, () =>
  withWidget({ tables: sampleTables(), contextOptions: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true } }, async ({ page }) => {
    await openDocs(page);
    const box = await page.locator(DIALOG).boundingBox();
    assert.deepEqual([Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)], [0, 0, 360, 640]);
    const tabs = await page.locator(`${DIALOG} .doc-tabs`).evaluate(list => ({ scrolls: list.scrollWidth > list.clientWidth, rows: new Set([...list.children].map(item => item.getBoundingClientRect().top)).size }));
    assert.deepEqual(tabs, { scrolls: true, rows: 1 }, 'une seule rangée, qui défile');
    await tab(page, 'Guide utilisateur').click();
    await showsDocument(page, 'Guide utilisateur');
    assert.ok(await body(page).evaluate(element => element.scrollWidth - element.clientWidth <= 1), 'le document ne déborde pas à l\'horizontale');
    for (const button of await page.locator(`${DIALOG} .dlg-foot .btn`).all()) {
      const buttonBox = await button.boundingBox();
      assert.ok(buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= 360 && buttonBox.y + buttonBox.height <= 640, 'les boutons du pied sont dans l\'écran');
      assert.ok(buttonBox.height >= 36, `assez haut pour le doigt (${buttonBox.height} px)`);
    }
  }));
