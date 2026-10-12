// Test navigateur de la mise en page : charge le vrai index.html dans Chromium à
// plusieurs largeurs de cadre, avec une API Grist simulée et un jeu de données
// chargé (tests/fixtures-responsive.mjs : noms, e-mails et tags très longs).
//
// Le widget est un cadre Grist : sa largeur est celle du panneau qui le porte,
// d'un téléphone (320px) à un grand écran (1900px et plus). On vérifie ce que voit
// l'utilisateur : rien ne dépasse du cadre, la grille se replie, la barre d'outils
// s'empile, les menus de filtres restent entiers, les cibles tactiles sont assez
// grandes, et le bureau garde sa mise en page de départ.
//
// Les seuils (600, 840 et 1400px) sont ceux de style.css ; chaque paire de largeurs
// voisine (599/600, 839/840, 1399/1400) encadre l'un d'eux. Les contrôles ne
// dépendent pas de la police installée : des positions relatives, des dépassements,
// des tailles minimales de cible tactile, et pour le nom une hauteur bornée par la
// taille du texte (deux lignes au plus).
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md). Sans lui
// les scénarios navigateur sont ignorés et `node --test` reste vert.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crowdedTables, crowdedTablesByAction } from './fixtures-responsive.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const GRIST_API_URL = 'https://docs.getgrist.com/grist-plugin-api.js';

// Remplace grist-plugin-api.js (même simulateur que e2e.test.mjs).
const GRIST_MOCK = `
window.grist = {
  ready() {},
  onRecords(callback) { window.__triggerRecords = callback; setTimeout(callback, 0); },
  docApi: {
    async fetchTable(name) {
      if (window.__failTables.includes(name)) throw new Error('Grist indisponible : ' + name);
      if (!window.__tables[name]) throw new Error('Table inconnue : ' + name);
      return JSON.parse(JSON.stringify(window.__tables[name]));
    }
  }
};`;

// Largeurs de cadre testées : un téléphone étroit, les largeurs courantes, et de part
// et d'autre de chaque seuil de style.css.
const WIDTHS = [320, 360, 414, 599, 600, 768, 839, 840, 1024, 1279, 1280, 1399, 1400, 1480, 1920];
const HEIGHT = 900;

async function startBrowser() {
  try {
    const { chromium } = await import('playwright');
    // Playwright masque les barres de défilement ; dans Grist elles retirent 15px à la
    // largeur utile, c'est le cas le plus serré : on les garde.
    return await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      ignoreDefaultArgs: ['--hide-scrollbars']
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
    response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    response.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Le jeu de données ne contient que des coordonnées inventées (règle de docs/securite.md),
// comme celui de docs/demo : ce contrôle n'a pas besoin du navigateur.
test('le jeu de données de la mise en page ne contient que des coordonnées fictives', () => {
  const tables = crowdedTables();
  const emails = JSON.stringify(tables).match(/[\w.+-]+@[\w.-]+/g) ?? [];
  assert.ok(emails.length > 0, 'Aucune adresse trouvée : ce test ne vérifie plus rien.');
  assert.deepEqual(emails.filter(email => !email.endsWith('.example')), [], 'Adresses hors du domaine réservé .example (RFC 2606).');
  // Numérique dans Grist : le 0 initial est perdu, 0 = non renseigné.
  const phones = tables.BDD.numero_de_telephone.filter(Boolean).map(value => String(value).padStart(10, '0'));
  assert.ok(phones.length > 0, 'Aucun numéro trouvé : ce test ne vérifie plus rien.');
  assert.deepEqual(phones.filter(phone => !/^0(?:53649|63998)\d{4}$/.test(phone)), [],
    'Numéros hors des plages réservées à la fiction, 05 36 49 xx xx et 06 39 98 xx xx (ARCEP, décision n° 2018-0881).');
});

const browser = await startBrowser();
const server = browser ? await startStaticServer() : null;
const baseUrl = server ? `http://127.0.0.1:${server.address().port}` : '';
const skip = browser ? false : 'Playwright/Chromium indisponible (voir TESTING.md)';

// En CI (REQUIRE_E2E=1), un navigateur absent est un échec, pas un « tout vert »
// sur des tests ignorés.
if (!browser && process.env.REQUIRE_E2E) {
  test('le navigateur de test de la mise en page est disponible', () =>
    assert.fail('Playwright/Chromium introuvable alors que REQUIRE_E2E est défini'));
}

after(async () => {
  await browser?.close();
  server?.close();
});

async function openWidget({ width = 1480, touch = false, tables = crowdedTables(), failTables = [] } = {}) {
  // Un écran tactile (pointer: coarse) : c'est ce qui déclenche les règles « doigt ».
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    ...(touch ? { hasTouch: true, isMobile: true } : {})
  });
  // Hermétique : seul le serveur local et l'API Grist simulée répondent.
  await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
  await context.route(GRIST_API_URL, route => route.fulfill({ contentType: 'text/javascript', body: GRIST_MOCK }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ tables, failTables }) => {
    window.__tables = tables;
    window.__failTables = failTables;
  }, { tables, failTables });
  await page.goto(`${baseUrl}/index.html`);
  await page.waitForFunction(() =>
    document.querySelectorAll('.contact-card').length > 0 || !document.getElementById('statusBanner').hidden);
  return { page, context, errors };
}

async function withWidget(options, run) {
  const widget = await openWidget(options);
  try {
    await run(widget);
    assert.deepEqual(widget.errors, [], 'aucune erreur JavaScript dans la page');
  } finally {
    await widget.context.close();
  }
}

// Redimensionne le cadre, comme quand on élargit ou resserre le panneau dans Grist.
const resize = (page, width) => page.setViewportSize({ width, height: HEIGHT });

// Pour chaque largeur de la liste, le même contrôle sur la même page : une erreur
// nomme la largeur fautive.
async function atEachWidth(page, widths, check) {
  for (const width of widths) {
    await resize(page, width);
    await check(width);
  }
}

// Fermer les menus ouverts : le widget les referme au clic dans le document.
const closeMenus = page => page.evaluate(() =>
  document.querySelectorAll('.filter.open').forEach(filter => filter.classList.remove('open')));

// ===== Ce qui ne doit jamais dépasser du cadre =====

test('aucun défilement horizontal, du téléphone (320px) au grand écran (1920px)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, WIDTHS, async width => {
      const { client, scroll, outside } = await page.evaluate(() => {
        const client = document.documentElement.clientWidth;
        const outside = [...document.querySelectorAll('body *')]
          .filter(element => element.getClientRects().length > 0)
          .filter(element => {
            const { left, right } = element.getBoundingClientRect();
            return right > client + 0.5 || left < -0.5;
          })
          .map(element => `${element.tagName.toLowerCase()}.${element.className}`);
        return { client, scroll: document.documentElement.scrollWidth, outside: outside.slice(0, 5) };
      });
      assert.ok(scroll <= client, `à ${width}px, la page déborde de ${scroll - client}px`);
      assert.deepEqual(outside, [], `à ${width}px, des éléments sortent du cadre`);
    });
  }));

test('le texte des cartes reste dans sa carte, même sans point de coupure (nom, e-mail)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 768, 1024, 1280, 1480], async width => {
      const leaks = await page.evaluate(() => {
        const found = [];
        document.querySelectorAll('.contact-card').forEach(card => {
          const box = card.getBoundingClientRect();
          // Un bloc dont le texte est plus large que lui : coupé par la carte, donc illisible.
          card.querySelectorAll('.name, .fonction, .detail-row, .tag, .tag-group-title').forEach(element => {
            if (element.scrollWidth > element.clientWidth + 1) found.push(`${element.className} : « ${element.textContent.slice(0, 30)} »`);
          });
          card.querySelectorAll('*').forEach(element => {
            const { left, right } = element.getBoundingClientRect();
            if (element.getClientRects().length > 0 && (right > box.right + 0.5 || left < box.left - 0.5)) {
              found.push(`hors de la carte : ${element.className}`);
            }
          });
        });
        return [...new Set(found)].slice(0, 5);
      });
      assert.deepEqual(leaks, [], `à ${width}px, du texte déborde de sa carte`);
    });
  }));

test('le nom ne passe jamais sous le badge de l\'établissement et tient sur deux lignes au plus', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 600, 768, 840, 1024, 1280, 1480], async width => {
      const { checked, overlapping, tooTall } = await page.evaluate(() => {
        let checked = 0;
        const overlapping = [];
        const tooTall = [];
        document.querySelectorAll('.contact-card').forEach(card => {
          const nameElement = card.querySelector('.name');
          const name = nameElement.getBoundingClientRect();
          // Deux lignes font au plus 2,7 fois le corps du texte ; trois lignes, plus de 3,3 fois.
          if (name.height > 2.7 * parseFloat(getComputedStyle(nameElement).fontSize)) tooTall.push(nameElement.textContent);
          const badge = card.querySelector('.etablissement-tag.visible');
          if (!badge) return;
          checked++;
          if (name.right > badge.getBoundingClientRect().left + 0.5) overlapping.push(nameElement.textContent);
        });
        return { checked, overlapping, tooTall };
      });
      assert.ok(checked > 0, 'des cartes portent un badge établissement');
      assert.deepEqual(overlapping, [], `à ${width}px, le badge recouvre le nom`);
      assert.deepEqual(tooTall, [], `à ${width}px, un nom s'étend sur plus de deux lignes`);
    });
  }));

// ===== La grille et la barre d'outils se replient =====

const expectedColumns = width => (width <= 599 ? 1 : width <= 839 ? 2 : 3);

test('les cartes passent de trois colonnes à deux (sous 840px) puis une (sous 600px)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, WIDTHS, async width => {
      const columns = await page.evaluate(() =>
        new Set([...document.querySelectorAll('.contact-card')].map(card => Math.round(card.getBoundingClientRect().left))).size);
      assert.equal(columns, expectedColumns(width), `à ${width}px`);
    });
  }));

test('barre d\'outils : sur une rangée dès 1400px, filtres sous la recherche en dessous, tout empilé sous 600px', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, WIDTHS, async width => {
      const box = await page.evaluate(() => {
        const rect = selector => {
          const { top, bottom, left, right } = document.querySelector(selector).getBoundingClientRect();
          return { top, bottom, left, right };
        };
        return { search: rect('.search-box'), filters: rect('.filters-container'), scope: rect('.scope-toggle'), reset: rect('.reset-button') };
      });
      const { search, filters, scope, reset } = box;
      const message = `à ${width}px`;
      if (width >= 1400) {
        // La recherche à gauche, les filtres à sa droite, sur la même bande.
        assert.ok(filters.left >= search.right - 0.5, `${message} : les filtres sont à droite de la recherche`);
        assert.ok(filters.top < search.bottom && search.top < filters.bottom, `${message} : même bande`);
      } else {
        assert.ok(filters.top >= search.bottom - 0.5, `${message} : les filtres passent sous la recherche`);
      }
      if (width >= 600 && width < 1400) {
        // Recherche, interrupteurs et réinitialisation partagent la première rangée.
        assert.ok(scope.bottom <= filters.top + 0.5 && reset.bottom <= filters.top + 0.5, `${message} : interrupteurs au-dessus des filtres`);
        assert.ok(Math.abs(scope.top - search.top) < 1, `${message} : interrupteurs à hauteur de la recherche`);
        assert.ok(search.right - search.left <= 420.5, `${message} : la recherche reste raisonnable (${Math.round(search.right - search.left)}px)`);
      }
      if (width < 600) {
        // Tout s'empile : recherche, filtres, puis interrupteurs et réinitialisation.
        assert.ok(scope.top >= filters.bottom - 0.5, `${message} : interrupteurs sous les filtres`);
        assert.ok(reset.top >= filters.bottom - 0.5, `${message} : réinitialisation sous les filtres`);
        assert.ok(search.right - search.left >= (width - 15) * 0.8, `${message} : la recherche prend toute la largeur`);
      }
    });
  }));

// Les rangées de la barre d'outils, de haut en bas, avec les bords gauche et droit
// de sa place utile : les éléments à la même hauteur forment une rangée.
const toolbarRows = page => page.evaluate(() => {
  const toolbar = document.querySelector('.toolbar');
  const style = getComputedStyle(toolbar);
  const frame = toolbar.getBoundingClientRect();
  const inner = {
    left: frame.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
    right: frame.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
  };
  const items = [...toolbar.querySelectorAll('.search-box, .filter, .scope-toggle, .reset-button')]
    .map(element => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { name: element.className, left, right, middle: (top + bottom) / 2 };
    })
    .sort((a, b) => a.middle - b.middle);
  const rows = [];
  for (const item of items) {
    const row = rows.at(-1);
    if (row && item.middle - row.middle < 10) row.items.push(item);
    else rows.push({ middle: item.middle, items: [item] });
  }
  return {
    inner,
    rows: rows.map(row => ({
      left: Math.min(...row.items.map(item => item.left)),
      right: Math.max(...row.items.map(item => item.right)),
      names: row.items.map(item => item.name).join(' + ')
    }))
  };
});

test('barre d\'outils : sous 600px chaque rangée va d\'un bord à l\'autre, de 600 à 1399px la première aussi', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 414, 599, 600, 768, 1024, 1399], async width => {
      const { inner, rows } = await toolbarRows(page);
      // Sous 600px tout est étiré ; au-dessus, seules les rangées de filtres ont un bord droit libre.
      const flushRows = width < 600 ? rows : rows.slice(0, 1);
      rows.forEach((row, index) => {
        assert.ok(Math.abs(row.left - inner.left) <= 1, `à ${width}px, la rangée ${index + 1} (${row.names}) commence à ${Math.round(row.left)}px`);
      });
      flushRows.forEach((row, index) => {
        assert.ok(Math.abs(row.right - inner.right) <= 1,
          `à ${width}px, la rangée ${index + 1} (${row.names}) s'arrête à ${Math.round(row.right)}px au lieu de ${Math.round(inner.right)}px`);
      });
      if (width >= 600) return;

      // Dans sa boîte étirée, chaque bouton prend toute la place : un filtre, les deux interrupteurs.
      const gaps = await page.evaluate(() => {
        const toggle = document.querySelector('.scope-toggle').getBoundingClientRect();
        const [first, second] = [...document.querySelectorAll('.scope-btn')].map(button => button.getBoundingClientRect());
        return {
          filters: [...document.querySelectorAll('.filter')].map(filter =>
            filter.getBoundingClientRect().width - filter.querySelector('.filter-button').getBoundingClientRect().width),
          scopeWidths: Math.abs(first.width - second.width),
          scopeRight: toggle.right - second.right
        };
      });
      assert.ok(gaps.filters.every(gap => Math.abs(gap) <= 1), `à ${width}px, un bouton de filtre n'emplit pas sa place`);
      assert.ok(gaps.scopeWidths <= 1, `à ${width}px, Fondateurs et Partenaires n'ont pas la même largeur`);
      assert.ok(gaps.scopeRight <= 6, `à ${width}px, Partenaires laisse ${Math.round(gaps.scopeRight)}px libres dans l'interrupteur`);
    });
  }));

// ===== Les menus de filtres restent entiers =====

test('chaque menu de filtre s\'ouvre en entier dans le cadre, de 280px à 1920px', { skip }, () =>
  withWidget({}, async ({ page }) => {
    const filters = await page.locator('.filter').count();
    assert.equal(filters, 7, 'les 7 filtres du widget');
    // 280px : un panneau Grist plus étroit que le plus petit téléphone, le menu se réduit alors à lui.
    await atEachWidth(page, [280, 320, 360, 414, 600, 768, 1024, 1280, 1480, 1920], async width => {
      for (let index = 0; index < filters; index++) {
        await closeMenus(page);
        const filter = page.locator('.filter').nth(index);
        await filter.locator('.filter-button').click();
        const { left, right, shown, client, below } = await filter.locator('.filter-menu').evaluate(menu => {
          const { left, right, top } = menu.getBoundingClientRect();
          return {
            left,
            right,
            shown: getComputedStyle(menu).display !== 'none',
            client: document.documentElement.clientWidth,
            below: top - menu.parentElement.querySelector('.filter-button').getBoundingClientRect().bottom
          };
        });
        const name = await filter.locator('.filter-button').textContent();
        assert.ok(shown, `à ${width}px, le menu « ${name.trim()} » s'ouvre`);
        assert.ok(below >= 5 && below <= 7, `à ${width}px, le menu « ${name.trim()} » s'ouvre à ${Math.round(below)}px sous son bouton`);
        assert.ok(left >= -0.5, `à ${width}px, le menu « ${name.trim()} » sort à gauche (${Math.round(left)}px)`);
        assert.ok(right <= client + 0.5, `à ${width}px, le menu « ${name.trim()} » sort à droite (${Math.round(right)}px pour ${client}px)`);
      }
      await closeMenus(page);
    });
  }));

test('un menu n\'est décalé que s\'il déborderait, et revient en place quand le cadre s\'élargit', { skip }, () =>
  withWidget({ width: 360 }, async ({ page }) => {
    // Le filtre le plus à droite du cadre étroit : celui dont le menu déborderait. Ce n'est
    // pas toujours le dernier de la barre, qui peut tenir seul sur sa rangée.
    const rightmost = await page.evaluate(() => {
      const lefts = [...document.querySelectorAll('.filter')].map(filter => filter.getBoundingClientRect().left);
      return lefts.indexOf(Math.max(...lefts));
    });
    const last = page.locator('.filter').nth(rightmost);
    const menuLeft = () => last.locator('.filter-menu').evaluate(menu => menu.style.left);

    // Dans un cadre étroit, ce filtre (au bord droit) est décalé vers la gauche.
    await last.locator('.filter-button').click();
    assert.match(await menuLeft(), /^-\d+(\.\d+)?px$/, 'menu décalé vers la gauche à 360px');
    // Il garde une marge de 8px avec le bord du cadre.
    const edgeGap = await last.locator('.filter-menu').evaluate(menu => document.documentElement.clientWidth - menu.getBoundingClientRect().right);
    assert.ok(Math.abs(edgeGap - 8) < 1, `le menu décalé garde ${Math.round(edgeGap)}px avec le bord du cadre, pas 8px`);

    // Dans un cadre large, le même menu s'ouvre sous son bouton, sans décalage.
    await resize(page, 1480);
    await closeMenus(page);
    await last.locator('.filter-button').click();
    assert.equal(await menuLeft(), '', 'menu non décalé à 1480px');
    const aligned = await last.evaluate(filter =>
      Math.abs(filter.querySelector('.filter-menu').getBoundingClientRect().left - filter.querySelector('.filter-button').getBoundingClientRect().left));
    assert.ok(aligned < 1, 'le menu reste sous son bouton');
  }));

// Les menus rangés par groupe (Compétences par domaine, Tâches par action) : le jeu de données a
// des libellés longs et un sans point de coupure (50 caractères).
const openedMenu = async (page, key) => {
  await closeMenus(page);
  const filter = page.locator(`.filter[data-filter-key="${key}"]`);
  await filter.locator('.filter-button').click();
  return filter;
};
const openedSkills = page => openedMenu(page, 'competences');

// Déplie tous les groupes d'un menu, puis dit ce qui en sort : défilement horizontal, et
// éléments dont le bord droit dépasse la zone utile du menu.
async function expandedMenuReport(filter) {
  await filter.locator('.group-toggle').evaluateAll(buttons => buttons.forEach(button => {
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
  }));
  return filter.locator('.filter-menu').evaluate(menu => {
    // Le bord droit de la zone utile du menu : sans sa bordure ni sa barre de défilement.
    const clientRight = menu.getBoundingClientRect().left + menu.clientLeft + menu.clientWidth;
    const inside = selector => [...menu.querySelectorAll(selector)]
      .filter(element => element.getClientRects().length > 0)
      .filter(element => element.getBoundingClientRect().right > clientRight + 0.5);
    return {
      scrollWidth: menu.scrollWidth,
      clientWidth: menu.clientWidth,
      groups: menu.querySelectorAll('.filter-group').length,
      shownItems: [...menu.querySelectorAll('.filter-option')].filter(option => option.getClientRects().length > 0).length,
      outside: ['.group-toggle', '.option-count', '.option-label'].flatMap(selector => inside(selector).map(element => selector))
    };
  });
}

test('le menu Compétences, tout déplié, tient dans son cadre étroit : libellés longs à la ligne, nombres et boutons dans le menu', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [280, 320, 360, 414, 768], async width => {
      const report = await expandedMenuReport(await openedSkills(page));
      assert.equal(report.groups, 9, 'neuf domaines');
      assert.equal(report.shownItems, 13, 'toutes les compétences, une fois dépliées');
      assert.ok(report.scrollWidth <= report.clientWidth, `à ${width}px, le menu défile horizontalement (${report.scrollWidth}px pour ${report.clientWidth}px)`);
      assert.deepEqual(report.outside, [], `à ${width}px, des éléments du menu sortent à droite`);
      await closeMenus(page);
    });
  }));

test('le menu Tâches, rangé par action et tout déplié, tient dans son cadre étroit : actions et tâches longues à la ligne, nombres et boutons dans le menu', { skip }, () =>
  withWidget({ tables: crowdedTablesByAction() }, async ({ page }) => {
    await atEachWidth(page, [280, 320, 360, 414, 768], async width => {
      const report = await expandedMenuReport(await openedMenu(page, 'taches'));
      assert.equal(report.groups, 7, 'six actions et « Sans action »');
      assert.equal(report.shownItems, 12, 'toutes les tâches, une fois dépliées');
      assert.ok(report.scrollWidth <= report.clientWidth, `à ${width}px, le menu défile horizontalement (${report.scrollWidth}px pour ${report.clientWidth}px)`);
      assert.deepEqual(report.outside, [], `à ${width}px, des éléments du menu sortent à droite`);
      await closeMenus(page);
    });
  }));

test('écran tactile : dans le menu Compétences, la case d\'un domaine et son bouton de dépli sont assez grands pour un doigt', { skip }, () =>
  withWidget({ width: 414, touch: true }, async ({ page }) => {
    const filter = await openedSkills(page);
    const sizes = await filter.locator('.filter-menu').evaluate(menu => {
      const size = selector => menu.querySelector(selector).getBoundingClientRect();
      return {
        domainHeight: size('.group-option').height,
        toggleWidth: size('.group-toggle').width,
        toggleHeight: size('.group-toggle').height,
        checkbox: size('.group-option input').width,
        optionFont: getComputedStyle(menu.querySelector('.group-option')).fontSize,
        width: menu.getBoundingClientRect().width
      };
    });
    assert.ok(sizes.domainHeight >= 44, `la ligne d'un domaine fait ${sizes.domainHeight}px de haut`);
    assert.ok(sizes.toggleWidth >= 28 && sizes.toggleHeight >= 28, `le bouton de dépli fait ${sizes.toggleWidth}×${sizes.toggleHeight}px`);
    assert.ok(sizes.checkbox >= 18, `la case d'un domaine fait ${sizes.checkbox}px`);
    assert.equal(sizes.optionFont, '14px', 'comme une option de menu');
    assert.ok(sizes.width >= 320, `le menu fait ${sizes.width}px de large`);
    // Déplier un domaine garde les compétences à portée de doigt.
    await filter.locator('.group-toggle').first().tap();
    const skill = await filter.locator('.filter-option').first().boundingBox();
    assert.ok(skill.height >= 44, `une compétence fait ${skill.height}px de haut`);
  }));

test('le survol colore la ligne d\'un domaine à la souris, et ne reste pas collé au tactile', { skip }, async () => {
  const backgroundAfterHover = async options => {
    let background;
    await withWidget(options, async ({ page }) => {
      const filter = await openedSkills(page);
      const domain = filter.locator('.group-option').first();
      await domain.hover();
      background = await domain.evaluate(element => getComputedStyle(element).backgroundColor);
    });
    return background;
  };
  assert.equal(await backgroundAfterHover({ width: 1480 }), 'rgb(241, 240, 255)', 'souris : survol coloré');
  assert.equal(await backgroundAfterHover({ width: 414, touch: true }), 'rgba(0, 0, 0, 0)', 'tactile : rien ne reste coloré');
});

// ===== Écran tactile et petits écrans =====

test('écran tactile : cibles d\'au moins 28px, champs à 16px (iOS zoomerait en dessous)', { skip }, () =>
  withWidget({ width: 414, touch: true }, async ({ page }) => {
    await atEachWidth(page, [414, 820, 1180], async width => {
      const { smallTargets, searchFont, emailHeight } = await page.evaluate(() => {
        const heights = selector => [...document.querySelectorAll(selector)].map(element => element.getBoundingClientRect().height);
        return {
          smallTargets: [...heights('button.tag'), ...heights('.etablissement-tag.visible')].filter(height => height < 27.5).length,
          searchFont: getComputedStyle(document.getElementById('searchInput')).fontSize,
          emailHeight: Math.min(...heights('a.email.visible'))
        };
      });
      assert.equal(smallTargets, 0, `à ${width}px, des tags ou badges font moins de 28px de haut`);
      assert.equal(searchFont, '16px', `à ${width}px, le champ de recherche`);
      assert.ok(emailHeight >= 24, `à ${width}px, le lien e-mail fait ${emailHeight}px de haut`);

      await closeMenus(page);
      await page.locator('.filter').first().locator('.filter-button').click();
      const menu = await page.locator('.filter').first().locator('.filter-menu').evaluate(element => {
        const size = selector => element.querySelector(selector).getBoundingClientRect();
        return {
          searchFont: getComputedStyle(element.querySelector('.filter-search-input')).fontSize,
          searchHeight: size('.filter-search-input').height,
          optionHeight: size('.filter-option').height,
          checkbox: size('.filter-option input').width,
          width: element.getBoundingClientRect().width
        };
      });
      assert.equal(menu.searchFont, '16px', `à ${width}px, la recherche du menu`);
      assert.ok(menu.searchHeight >= 40, `à ${width}px, la recherche du menu fait ${menu.searchHeight}px de haut`);
      assert.ok(menu.optionHeight >= 44, `à ${width}px, une option de menu fait ${menu.optionHeight}px de haut`);
      assert.ok(menu.checkbox >= 18, `à ${width}px, une case à cocher fait ${menu.checkbox}px`);
      assert.ok(menu.width >= 320, `à ${width}px, le menu fait ${menu.width}px de large`);
      await closeMenus(page);
    });
  }));

test('le survol colore filtre, option de menu et interrupteur à la souris, et ne reste pas collé au tactile', { skip }, async () => {
  const colorsAfterHover = async options => {
    let colors;
    await withWidget(options, async ({ page }) => {
      const style = (locator, property) => locator.evaluate((element, name) => getComputedStyle(element)[name], property);
      const button = page.locator('.filter-button').first();
      await button.hover();
      const filterBorder = await style(button, 'borderTopColor');
      await button.click(); // ouvre le menu, pour survoler l'une de ses options
      const option = page.locator('.filter').first().locator('.filter-option:not(.checked)').first();
      await option.hover();
      const optionBackground = await style(option, 'backgroundColor');
      await closeMenus(page); // le menu ouvert recouvre l'interrupteur
      const scope = page.locator('.scope-btn:not(.active)');
      await scope.hover();
      colors = { filterBorder, optionBackground, scopeText: await style(scope, 'color') };
    });
    return colors;
  };
  assert.deepEqual(await colorsAfterHover({ width: 1480 }),
    { filterBorder: 'rgb(98, 87, 217)', optionBackground: 'rgb(241, 240, 255)', scopeText: 'rgb(68, 58, 175)' }, 'souris : survol coloré');
  assert.deepEqual(await colorsAfterHover({ width: 414, touch: true }),
    { filterBorder: 'rgb(228, 232, 240)', optionBackground: 'rgba(0, 0, 0, 0)', scopeText: 'rgb(104, 115, 138)' }, 'tactile : rien ne reste coloré');
});

test('les textes ne grossissent que sous 600px ou au tactile : le bureau garde ses tailles', { skip }, () =>
  withWidget({}, async ({ page }) => {
    const sizes = () => page.evaluate(() => {
      const font = selector => getComputedStyle(document.querySelector(selector)).fontSize;
      return { tag: font('.tag'), name: font('.name'), email: font('.email.visible'), search: font('#searchInput'), title: font('h1') };
    });
    await atEachWidth(page, [600, 768, 1024, 1480], async width => {
      assert.deepEqual(await sizes(), { tag: '8.5px', name: '14px', email: '10.5px', search: '13px', title: '34px' }, `à ${width}px, souris`);
    });
    // Sous 600px sans écran tactile : texte de carte plus grand, titre plus petit, champ de recherche inchangé.
    await atEachWidth(page, [320, 360, 599], async width => {
      assert.deepEqual(await sizes(), { tag: '11px', name: '15px', email: '12px', search: '13px', title: '28px' }, `à ${width}px, souris`);
    });
  }));

test('le compteur de résultats reste à côté du titre quand il y a la place, passe dessous sinon au lieu de le comprimer', { skip }, () =>
  withWidget({ width: 1480 }, async ({ page }) => {
    await atEachWidth(page, [320, 360, 414, 600, 768, 1024, 1480], async width => {
      const { line, h1, count } = await page.evaluate(() => {
        const rect = selector => {
          const { left, right, top, bottom, width, height } = document.querySelector(selector).getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        };
        return { line: rect('.title-line'), h1: rect('h1'), count: rect('#resultCount') };
      });
      const message = `à ${width}px`;
      // Selon la police, le titre et le compteur tiennent ou non côte à côte (écart de 14px) : dans les deux cas,
      // le titre garde sa ligne et le compteur ne le recouvre jamais.
      assert.ok(h1.height <= 1.5 * 34, `${message} : le titre tient sur une ligne (${Math.round(h1.height)}px de haut)`);
      if (h1.width + 14 + count.width <= line.width + 0.5) {
        assert.ok(count.left >= h1.right + 8, `${message} : le compteur est à droite du titre`);
        assert.ok(Math.abs((count.top + count.bottom) / 2 - (h1.top + h1.bottom) / 2) <= 12, `${message} : sur la ligne du titre`);
      } else {
        assert.ok(count.top >= h1.bottom - 0.5, `${message} : le compteur passe sous le titre`);
        assert.ok(Math.abs(count.left - line.left) <= 1, `${message} : aligné à gauche, comme le titre`);
      }
      assert.ok(count.right <= line.right + 0.5, `${message} : le compteur reste dans l'en-tête`);
    });
    // À 1480px il y a de la place : la phrase de départ de ce test reste vraie sur grand écran.
    await resize(page, 1480);
    const wide = await page.evaluate(() => {
      const h1 = document.querySelector('h1').getBoundingClientRect();
      return { sameLine: document.getElementById('resultCount').getBoundingClientRect().left >= h1.right };
    });
    assert.equal(wide.sameLine, true, 'à 1480px, le compteur est à droite du titre');
  }));

// ===== États particuliers =====

test('à 320px, le bandeau d\'erreur et l\'état vide tiennent dans le cadre', { skip }, async () => {
  await withWidget({ width: 320, failTables: ['Actions'] }, async ({ page }) => {
    assert.equal(await page.locator('#statusBanner').isVisible(), true, 'le bandeau d\'erreur s\'affiche');
    const banner = await page.locator('#statusBanner').boundingBox();
    const client = await page.evaluate(() => document.documentElement.clientWidth);
    assert.ok(banner.x >= 0 && banner.x + banner.width <= client + 0.5, 'le bandeau tient dans le cadre');
  });
  await withWidget({ width: 320 }, async ({ page }) => {
    await page.locator('#searchInput').fill('zzzz');
    await page.waitForFunction(() => !document.getElementById('emptyState').hidden);
    const { client, scroll } = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth
    }));
    assert.ok(scroll <= client, 'l\'état vide ne fait pas défiler horizontalement');
  });
});

// ===== Géométrie d'une carte =====

// Trois cartes aux textes courts, pour que la géométrie ne dépende pas de la police : la
// deuxième seule a une fonction, sur une ligne. (Avec un nom sur deux lignes, le bloc
// nom et fonction dépasse l'avatar, qui reste alors en haut.)
function compactTables() {
  const tables = crowdedTables(3);
  Object.assign(tables.BDD, {
    prenom: ['Léa', 'Paul', 'Anne'],
    nom: ['Roux', 'Petit', 'Durand'],
    Fonction: ['', 'Ingénieur', ''],
    Etablissement: [1, 1, 1]
  });
  return tables;
}

// Position du badge dans le coin de la carte, et du nom (avec la fonction) en face de l'avatar.
const cardGeometry = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.contact-card')];
  const centerY = element => {
    const { top, bottom } = element.getBoundingClientRect();
    return (top + bottom) / 2;
  };
  const first = cards[0]; // sans fonction (compactTables)
  const second = cards[1]; // avec une fonction sur une ligne
  const box = first.getBoundingClientRect();
  const badge = first.querySelector('.etablissement-tag.visible').getBoundingClientRect();
  const nameAndFunction = card => {
    const name = card.querySelector('.name').getBoundingClientRect();
    const role = card.querySelector('.fonction').getBoundingClientRect();
    return (name.top + role.bottom) / 2 - centerY(card.querySelector('.avatar'));
  };
  return {
    columns: new Set(cards.map(card => Math.round(card.getBoundingClientRect().left))).size,
    badgeFromRight: box.right - badge.right,
    badgeFromTop: badge.top - box.top,
    nameVsAvatar: centerY(first.querySelector('.name')) - centerY(first.querySelector('.avatar')),
    nameAndFunctionVsAvatar: nameAndFunction(second)
  };
});

test('à 1480px : trois colonnes, badge établissement dans le coin haut droit, nom centré sur l\'avatar', { skip }, () =>
  withWidget({ width: 1480, tables: compactTables() }, async ({ page }) => {
    const card = await cardGeometry(page);
    assert.equal(card.columns, 3);
    assert.ok(card.badgeFromRight >= 9 && card.badgeFromRight <= 13, `badge à ${card.badgeFromRight}px du bord droit`);
    assert.ok(card.badgeFromTop >= 12 && card.badgeFromTop <= 16, `badge à ${card.badgeFromTop}px du haut`);
    assert.ok(Math.abs(card.nameVsAvatar) <= 2, `nom décalé de ${card.nameVsAvatar}px par rapport à l'avatar`);
    assert.ok(Math.abs(card.nameAndFunctionVsAvatar) <= 3, `nom et fonction décalés de ${card.nameAndFunctionVsAvatar}px par rapport à l'avatar`);
  }));

test('sur téléphone, le nom reste centré sur l\'avatar et le badge dans le coin de la carte', { skip }, () =>
  withWidget({ width: 360, tables: compactTables() }, async ({ page }) => {
    const card = await cardGeometry(page);
    assert.ok(card.badgeFromRight >= 9 && card.badgeFromRight <= 13, `badge à ${card.badgeFromRight}px du bord droit`);
    assert.ok(card.badgeFromTop >= 12 && card.badgeFromTop <= 16, `badge à ${card.badgeFromTop}px du haut`);
    assert.ok(Math.abs(card.nameAndFunctionVsAvatar) <= 3, `nom et fonction décalés de ${card.nameAndFunctionVsAvatar}px par rapport à l'avatar`);
  }));
