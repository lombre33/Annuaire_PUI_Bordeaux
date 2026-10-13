// Test navigateur de la mise en page de l'habillage : charge le vrai index.html dans
// Chromium à plusieurs largeurs de cadre, avec le jeu « chargé » de la mise en page
// (tests/fixtures-responsive.mjs) complété de logos de formes variées,
// et vérifie ce que voit l'utilisateur : l'en-tête (titre, compteur, financeurs), les
// logos sur les cartes, le bandeau des fondateurs en bas. Rien ne dépasse du cadre, les
// logos restent dans leur case quelle que soit leur forme, le bandeau se replie.
//
// Les seuils sont ceux de style.css (860 et 1180px pour l'en-tête, 1320px pour la légende des
// financeurs, 560px de large utile pour le bandeau, 600px pour le téléphone). Les contrôles ne dépendent pas de la police
// installée : des positions relatives, des dépassements, et des tailles bornées par les
// constantes de constants.js.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md). Sans lui les
// scénarios navigateur sont ignorés et `node --test` reste vert.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crowdedTables, crowdedBranding, crowdedIdentity } from './fixtures-responsive.mjs';
import { routeAttachments, TALL_FILE, WIDE_FILE, UNSIZED_FILE } from './support/fake-attachments.mjs';
import { BAND_LOGO } from '../constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const GRIST_API_URL = 'https://docs.getgrist.com/grist-plugin-api.js';

const FAKE_GRIST = fs.readFileSync(path.join(ROOT, 'tests/support/fake-grist.js'), 'utf8').replace(/^export /gm, '');
const GRIST_MOCK = `${FAKE_GRIST}
window.__fake = createFakeGrist({ tables: () => window.__tables, user: () => window.__user });
window.grist = {
  ready() {},
  onRecords(callback) { window.__triggerRecords = callback; setTimeout(callback, 0); },
  docApi: window.__fake.docApi
};`;

const WIDTHS = [320, 360, 414, 599, 600, 768, 839, 840, 1024, 1279, 1280, 1399, 1400, 1480, 1920];
const HEIGHT = 900;
const ACRONYMS = crowdedTables().Etablissements.acronyme; // l'ordre du bandeau : celui de la table

async function startBrowser() {
  try {
    const { chromium } = await import('playwright');
    // Les barres de défilement retirent 15px à la largeur utile dans Grist : on les garde.
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

const browser = await startBrowser();
const server = browser ? await startStaticServer() : null;
const baseUrl = server ? `http://127.0.0.1:${server.address().port}` : '';
const skip = browser ? false : 'Playwright/Chromium indisponible (voir TESTING.md)';

if (!browser && process.env.REQUIRE_E2E) {
  test('le navigateur de test de la mise en page de l\'habillage est disponible', () =>
    assert.fail('Playwright/Chromium introuvable alors que REQUIRE_E2E est défini'));
}

after(async () => {
  await browser?.close();
  server?.close();
});

// Attend que tous les logos soient affichés : ceux des cartes ne se chargent qu'en
// approchant de l'écran, on les demande tous pour que la mise en page soit complète.
async function settle(page) {
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; }));
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.logo-img')];
    return images.length > 0 && images.every(image => image.classList.contains('loaded'));
  });
}

async function openWidget({ width = 1480, touch = false, tables = crowdedBranding(), user = null, waitLogos = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    ...(touch ? { hasTouch: true, isMobile: true } : {})
  });
  await context.route(url => !['127.0.0.1', 'docs.getgrist.com'].includes(url.hostname), route => route.abort());
  await context.route(GRIST_API_URL, route => route.fulfill({ contentType: 'text/javascript', body: GRIST_MOCK }));
  await routeAttachments(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(value => { window.__tables = value.tables; window.__user = value.user; }, { tables, user: user && { email: user } });
  await page.goto(`${baseUrl}/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('.contact-card').length > 0);
  if (user) await page.waitForFunction(() => !document.getElementById('accountBar').hidden);
  if (waitLogos) await settle(page);
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

const resize = (page, width) => page.setViewportSize({ width, height: HEIGHT });

async function atEachWidth(page, widths, check) {
  for (const width of widths) {
    await resize(page, width);
    await check(width);
  }
}

// Les rectangles { left, right, top, bottom, width, height } des éléments d'un sélecteur.
const rects = (page, selector) => page.locator(selector).evaluateAll(elements => elements.map(element => {
  const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
  return { left, right, top, bottom, width, height };
}));
const rectOf = async (page, selector) => (await rects(page, selector))[0];

// Largeur utile du bandeau : celle que mesure la règle @container de style.css.
const bandContent = page => page.locator('#foundersBand').evaluate(element => {
  const style = getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
});

const centerX = box => (box.left + box.right) / 2;
const centerY = box => (box.top + box.bottom) / 2;

// ===== Rien ne dépasse du cadre =====

test('avec les logos, aucun défilement horizontal du téléphone (320px) au grand écran (1920px)', { skip }, () =>
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

// ===== En-tête : titre, compteur, financeurs =====

test('en-tête : financeurs sous le titre sous 860px, à sa droite de 860 à 1179px, au centre dès 1180px', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 414, 599, 600, 768, 859, 860, 1024, 1179, 1180, 1200, 1319, 1320, 1400, 1480, 1920], async width => {
      const header = await rectOf(page, '.page-header');
      const title = await rectOf(page, '.page-title');
      const funders = await rectOf(page, '#funders');
      const message = `à ${width}px`;
      assert.ok(funders.width > 0 && funders.height > 0, `${message} : les financeurs s'affichent`);
      assert.ok(funders.left >= header.left - 0.5 && funders.right <= header.right + 0.5, `${message} : les financeurs tiennent dans l'en-tête`);
      if (width < 860) {
        assert.ok(funders.top >= title.bottom - 0.5, `${message} : les financeurs passent sous le titre`);
        assert.ok(Math.abs(funders.left - title.left) <= 1, `${message} : alignés à gauche, comme le titre`);
      } else {
        assert.ok(funders.left >= title.right + 12, `${message} : les financeurs sont à droite du titre, sans le toucher`);
        assert.ok(funders.top < title.bottom && title.top < funders.bottom, `${message} : sur la bande du titre`);
      }
      if (width >= 860 && width < 1180) {
        assert.ok(Math.abs(funders.right - header.right) <= 1, `${message} : calés à droite de l'en-tête`);
        assert.ok(Math.abs(funders.top - header.top) <= 1, `${message} : en haut de l'en-tête`);
      }
      if (width >= 1180) {
        assert.ok(Math.abs(centerX(funders) - centerX(header)) <= 1,
          `${message} : financeurs au centre (décalés de ${Math.round(centerX(funders) - centerX(header))}px)`);
      }
      // Entre 1180 et 1319px, la légende est trop large pour garder les financeurs au centre : elle
      // n'est plus qu'un texte pour les lecteurs d'écran (toujours dans la page).
      const label = await page.locator('.funders-label').evaluate(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, text: element.textContent.trim() };
      });
      assert.equal(label.text, 'Projet financé par l\'État dans le cadre de France 2030', `${message} : la légende reste dans la page`);
      if (width >= 1180 && width < 1320) assert.ok(label.width <= 2, `${message} : la légende est cachée (${Math.round(label.width)}px)`);
      else assert.ok(label.width > 40, `${message} : la légende s'affiche (${Math.round(label.width)}px)`);
    });
  }));

// « Ma présence » : la personne connectée (ici Camille, ligne 2 de BDD) a sa zone dans l'en-tête.
const CAMILLE = 'contact1@bordeaux.example';

test('en-tête avec « Ma présence » : un seul bandeau dès 1180px, titre, financeurs au centre, profil à droite', { skip }, () =>
  withWidget({ tables: crowdedIdentity(crowdedBranding(), CAMILLE), user: CAMILLE }, async ({ page }) => {
    await atEachWidth(page, [1180, 1200, 1319, 1320, 1400, 1480, 1920], async width => {
      const header = await rectOf(page, '.page-header');
      const title = await rectOf(page, '.page-title');
      const funders = await rectOf(page, '#funders');
      const account = await rectOf(page, '#accountBar');
      const message = `à ${width}px`;
      assert.ok(account.left >= funders.right + 12, `${message} : le profil est à droite des financeurs`);
      assert.ok(Math.abs(account.right - header.right) <= 1, `${message} : calé à droite de l'en-tête`);
      assert.ok(funders.right <= account.left && title.right <= funders.left, `${message} : titre, financeurs, profil dans l'ordre, sans se toucher`);
      assert.ok(Math.abs(centerX(funders) - centerX(header)) <= 1, `${message} : financeurs toujours au centre`);
      // Un seul bandeau : le profil ne rend pas l'en-tête plus haut que le titre.
      assert.ok(account.top >= header.top - 0.5 && account.bottom <= title.bottom + 12, `${message} : le profil tient dans la hauteur du titre`);
      assert.ok(header.height <= title.height + 12, `${message} : l'en-tête fait ${Math.round(header.height)}px de haut, le titre ${Math.round(title.height)}px`);
    });
  }));

test('en-tête avec « Ma présence » : sous les financeurs à droite de 860 à 1179px, pleine largeur sous 860px', { skip }, () =>
  withWidget({ tables: crowdedIdentity(crowdedBranding(), CAMILLE), user: CAMILLE }, async ({ page }) => {
    await atEachWidth(page, [320, 360, 600, 768, 859, 860, 1024, 1179], async width => {
      const header = await rectOf(page, '.page-header');
      const title = await rectOf(page, '.page-title');
      const funders = await rectOf(page, '#funders');
      const account = await rectOf(page, '#accountBar');
      const message = `à ${width}px`;
      assert.ok(account.top >= funders.bottom - 0.5, `${message} : le profil est sous les financeurs`);
      assert.ok(account.left >= header.left - 0.5 && account.right <= header.right + 0.5, `${message} : le profil tient dans l'en-tête`);
      if (width < 860) {
        assert.ok(account.top >= title.bottom - 0.5, `${message} : le profil est sous le titre`);
        assert.ok(Math.abs(account.left - header.left) <= 1 && Math.abs(account.right - header.right) <= 1, `${message} : sur toute la largeur`);
      } else {
        assert.ok(account.left >= title.right + 12, `${message} : le profil est à droite du titre`);
        assert.ok(Math.abs(account.right - header.right) <= 1, `${message} : calé à droite de l'en-tête`);
      }
      // Le bouton « Modifier mon profil » et l'interrupteur restent à portée : dans le cadre, jamais coupés.
      const controls = await rects(page, '#accountBar .presence-switch, #accountBar .account-edit');
      assert.equal(controls.length, 2, `${message} : l'interrupteur et le bouton sont affichés`);
      controls.forEach(control => assert.ok(control.left >= header.left - 0.5 && control.right <= header.right + 0.5, `${message} : un bouton du profil sort de l'en-tête`));
    });
  }));

test('financeurs : le visuel de la maquette à sa hauteur (36px, 29px sur téléphone), la légende à sa gauche dès 600px', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 599, 600, 768, 1024, 1480], async width => {
      const message = `à ${width}px`;
      const image = await rectOf(page, '#funders img');
      const label = await rectOf(page, '.funders-label');
      assert.ok(Math.abs(image.height - (width <= 599 ? 29 : 36)) <= 0.5, `${message} : le visuel fait ${Math.round(image.height)}px de haut`);
      assert.ok(Math.abs(image.width / image.height - 487 / 80) <= 0.05, `${message} : proportions du fichier (${Math.round(image.width)}x${Math.round(image.height)})`);
      if (width >= 600) assert.ok(label.right <= image.left + 0.5, `${message} : la légende est à gauche du visuel`);
      else assert.ok(label.bottom <= image.top + 0.5, `${message} : la légende est au-dessus du visuel`);
    });
  }));

// ===== Cartes =====

// Trois cartes aux textes courts, comme compactTables() de responsive.test.mjs, pour que
// la géométrie ne dépende pas de la police : toutes dans le premier établissement (son logo).
function compactBranding() {
  const tables = crowdedBranding(crowdedTables(3));
  Object.assign(tables.BDD, {
    prenom: ['Léa', 'Paul', 'Anne'],
    nom: ['Roux', 'Petit', 'Durand'],
    Fonction: ['', 'Ingénieur', ''],
    Etablissement: [1, 1, 1]
  });
  return tables;
}

const cardGeometry = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.contact-card')];
  const centerOf = element => {
    const { top, bottom } = element.getBoundingClientRect();
    return (top + bottom) / 2;
  };
  const first = cards[0];
  const second = cards[1];
  const box = first.getBoundingClientRect();
  const badge = first.querySelector('.etablissement-tag.visible').getBoundingClientRect();
  const image = first.querySelector('.etablissement-tag img').getBoundingClientRect();
  const nameAndFunction = card => {
    const name = card.querySelector('.name').getBoundingClientRect();
    const role = card.querySelector('.fonction').getBoundingClientRect();
    return (name.top + role.bottom) / 2 - centerOf(card.querySelector('.avatar'));
  };
  return {
    columns: new Set(cards.map(card => Math.round(card.getBoundingClientRect().left))).size,
    badgeFromRight: box.right - badge.right,
    badgeFromTop: badge.top - box.top,
    imageFromBadgeRight: badge.right - image.right,
    image: { width: image.width, height: image.height },
    nameVsAvatar: centerOf(first.querySelector('.name')) - centerOf(first.querySelector('.avatar')),
    nameAndFunctionVsAvatar: nameAndFunction(second)
  };
});

test('à 1480px avec logos : trois colonnes, logo dans le coin haut droit comme la pastille, nom centré sur l\'avatar', { skip }, () =>
  withWidget({ width: 1480, tables: compactBranding() }, async ({ page }) => {
    const card = await cardGeometry(page);
    assert.equal(card.columns, 3);
    assert.ok(card.badgeFromRight >= 9 && card.badgeFromRight <= 13, `logo à ${card.badgeFromRight}px du bord droit`);
    assert.ok(card.badgeFromTop >= 12 && card.badgeFromTop <= 16, `logo à ${card.badgeFromTop}px du haut`);
    assert.ok(card.imageFromBadgeRight >= 0 && card.imageFromBadgeRight <= 6, `l'image est calée à droite de son cadre (${card.imageFromBadgeRight}px)`);
    assert.ok(card.image.width <= 240.5 && card.image.height <= 64.5, `le logo fait ${Math.round(card.image.width)}x${Math.round(card.image.height)}px`);
    assert.ok(card.image.height >= 14, `le logo reste lisible (${Math.round(card.image.height)}px de haut)`);
    assert.ok(Math.abs(card.nameVsAvatar) <= 2, `nom décalé de ${card.nameVsAvatar}px par rapport à l'avatar`);
    assert.ok(Math.abs(card.nameAndFunctionVsAvatar) <= 3, `nom et fonction décalés de ${card.nameAndFunctionVsAvatar}px par rapport à l'avatar`);
  }));

// Les logos ont des formes différentes (de 1,2 à 6 fois plus larges que hauts dans ces fichiers) : sur une carte,
// tous tiennent dans la même case de 104 x 42 px (style.css, 1.26.1), à l'échelle que donne la place de la carte
// (requêtes de conteneur : 70 % sur une carte étroite, 85 % dès 330px de large, 100 % dès 380px). Le widget ne lit plus
// leurs pixels : la case est la même pour tous, et un logo plus large ou plus haut s'y réduit (object-fit: contain).
const LOGO_SCALES = [{ from: 380, scale: 1 }, { from: 330, scale: 0.85 }, { from: 0, scale: 0.7 }];
const CARD_LOGO_BOX = { width: 104, height: 42 };

test('cartes : chaque logo tient dans la même case de 104 x 42 px, à l\'échelle de la carte, quelles que soient ses proportions', { skip }, () =>
  withWidget({ tables: crowdedBranding() }, async ({ page }) => {
    const scales = new Set();
    await atEachWidth(page, [320, 600, 840, 1024, 1150, 1280, 1480], async width => {
      const logos = await page.locator('.contact-card').evaluateAll((cards, steps) => cards.map(card => {
        const image = card.querySelector('.etablissement-tag img');
        const box = image.getBoundingClientRect();
        // La largeur de la carte hors bordures : celle que mesurent les requêtes de conteneur.
        const { scale } = steps.find(candidate => card.clientWidth >= candidate.from);
        return { alt: image.alt, shown: image.classList.contains('loaded'), sized: image.classList.contains('sized'),
          width: box.width / scale, height: box.height / scale, ratio: image.naturalWidth / image.naturalHeight, scale };
      }), LOGO_SCALES);
      assert.ok(logos.length >= 12, `à ${width}px : assez de cartes pour comparer (${logos.length})`);
      logos.forEach(({ alt, shown, sized, width: w, height: h, scale }) => {
        const message = `à ${width}px, ${alt}`;
        scales.add(scale);
        assert.ok(shown, `${message} : le logo ne se voit pas`);
        assert.ok(!sized, `${message} : la taille du logo ne se calcule plus`);
        assert.ok(Math.abs(w - CARD_LOGO_BOX.width) <= 0.6 && Math.abs(h - CARD_LOGO_BOX.height) <= 0.6,
          `${message} : ${w.toFixed(1)}x${h.toFixed(1)}px au lieu de ${CARD_LOGO_BOX.width}x${CARD_LOGO_BOX.height}`);
      });
      // Le test n'est pas vide : les logos n'ont pas tous la même forme.
      const ratios = logos.map(logo => logo.ratio);
      assert.ok(Math.max(...ratios) / Math.min(...ratios) >= 2, `à ${width}px : des logos de formes différentes (${ratios.map(r => r.toFixed(1))})`);
    });
    assert.deepEqual([...scales].sort(), [0.7, 0.85, 1], 'les trois échelles de carte sont toutes essayées');
  }));

test('sur téléphone avec logos, le nom reste centré sur l\'avatar et le logo dans le coin de la carte', { skip }, () =>
  withWidget({ width: 360, tables: compactBranding() }, async ({ page }) => {
    const card = await cardGeometry(page);
    assert.ok(card.badgeFromRight >= 9 && card.badgeFromRight <= 13, `logo à ${card.badgeFromRight}px du bord droit`);
    assert.ok(card.badgeFromTop >= 12 && card.badgeFromTop <= 16, `logo à ${card.badgeFromTop}px du haut`);
    assert.ok(Math.abs(card.nameAndFunctionVsAvatar) <= 3, `nom et fonction décalés de ${card.nameAndFunctionVsAvatar}px par rapport à l'avatar`);
  }));

test('le nom et la fonction ne passent jamais sous le logo de l\'établissement, le nom tient sur deux lignes au plus', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 600, 768, 840, 1024, 1280, 1480], async width => {
      const { checked, withLogo, overlapping, tooTall, outside } = await page.evaluate(() => {
        let checked = 0;
        let withLogo = 0;
        const overlapping = [];
        const tooTall = [];
        const outside = [];
        document.querySelectorAll('.contact-card').forEach(card => {
          const nameElement = card.querySelector('.name');
          const name = nameElement.getBoundingClientRect();
          if (name.height > 2.7 * parseFloat(getComputedStyle(nameElement).fontSize)) tooTall.push(nameElement.textContent);
          const badge = card.querySelector('.etablissement-tag.visible');
          if (!badge) return;
          checked++;
          if (badge.classList.contains('has-logo')) withLogo++;
          const box = badge.getBoundingClientRect();
          if (name.right > box.left + 0.5) overlapping.push(nameElement.textContent);
          // La fonction, elle, ne passe pas sous le logo non plus.
          const role = card.querySelector('.fonction');
          if (role.getClientRects().length > 0 && role.getBoundingClientRect().right > box.left + 0.5
              && role.getBoundingClientRect().top < box.bottom - 0.5) overlapping.push(role.textContent);
          const image = badge.querySelector('img')?.getBoundingClientRect();
          if (image && (image.left < box.left - 0.5 || image.right > box.right + 0.5 || image.top < box.top - 0.5 || image.bottom > box.bottom + 0.5)) {
            outside.push(nameElement.textContent);
          }
        });
        return { checked, withLogo, overlapping, tooTall, outside };
      });
      assert.ok(checked > 0 && withLogo === checked, `à ${width}px, toutes les cartes affichent un logo (${withLogo}/${checked})`);
      assert.deepEqual(overlapping, [], `à ${width}px, le logo recouvre le nom`);
      assert.deepEqual(tooTall, [], `à ${width}px, un nom s'étend sur plus de deux lignes`);
      assert.deepEqual(outside, [], `à ${width}px, un logo sort de son cadre`);
    });
  }));

// Le rôle dans le PUI (1.26.2) : du texte comme la fonction, sans pastille ni fond, à droite de la ligne de l'e-mail. Il ne
// la fait jamais passer à la ligne ni grandir la carte : trop long, il est coupé par une ellipse (le rôle entier en
// infobulle) ; quand l'e-mail ne lui laisse que quelques lettres, il disparaît. Rôle court dans la boucle, pour que
// le contrôle ne dépende pas de la police.
const withShortRole = tables => {
  tables.Role_Dans_le_PUI.Role = ['Référent qualité'];
  return tables;
};

const MIN_ROLE_PX = 44; // style.css : sous cette largeur utile (@container), le rôle disparaît

const roleCards = page => page.evaluate(() => [...document.querySelectorAll('.contact-card')]
  .filter(card => card.querySelector('.role-tag'))
  .map(card => {
    const box = element => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    const measure = () => ({
      height: card.getBoundingClientRect().height,
      nameTop: card.querySelector('.name').getBoundingClientRect().top,
      emailHeight: card.querySelector('.email.visible')?.getBoundingClientRect().height ?? 0
    });
    const withRole = measure();
    const column = card.querySelector('.role-col');
    column.style.display = 'none';
    const without = measure();
    column.style.display = '';
    const tag = card.querySelector('.role-tag');
    const text = card.querySelector('.role-text');
    const email = card.querySelector('.email.visible');
    const look = (element, ...properties) => Object.fromEntries(properties.map(name => [name, getComputedStyle(element)[name]]));
    return {
      name: card.querySelector('.name').textContent,
      card: box(card),
      details: box(card.querySelector('.details')),
      column: { ...box(column), usable: parseFloat(getComputedStyle(column).width) - parseFloat(getComputedStyle(column).paddingLeft) },
      tag: box(tag),
      text: box(text),
      email: email && box(email),
      shown: getComputedStyle(tag).display !== 'none',
      title: tag.title,
      label: text.textContent,
      truncated: text.scrollWidth > text.clientWidth + 1,
      grown: withRole.height - without.height,
      nameMoved: withRole.nameTop - without.nameTop,
      emailGrown: withRole.emailHeight - without.emailHeight,
      inColumnOfLogo: Boolean(card.querySelector('.etab-col .role-tag')),
      tagLook: look(tag, 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'borderTopWidth'),
      fonctionLook: look(card.querySelector('.fonction'), 'color', 'fontSize', 'fontWeight')
    };
  }));

for (const [label, tables, waitLogos] of [['avec logos', withShortRole(crowdedBranding()), true], ['avec le sigle seul', withShortRole(crowdedTables()), false]]) {
  test(`le rôle est du texte à droite de la ligne de l'e-mail, sans fond, et ne change ni l'e-mail ni la carte (${label})`, { skip }, () =>
    withWidget({ tables, waitLogos }, async ({ page }) => {
      const seen = { shown: 0, hidden: 0 };
      await atEachWidth(page, [320, 360, 414, 600, 768, 840, 1280, 1640, 1920], async width => {
        const cards = await roleCards(page);
        assert.ok(cards.length > 0, `à ${width}px, des cartes portent un rôle`);
        cards.forEach(card => {
          const message = `à ${width}px, ${card.name} (carte de ${Math.round(card.card.width)}px)`;
          assert.equal(card.inColumnOfLogo, false, `${message} : le rôle n'est pas dans la colonne du logo`);
          assert.ok(Math.abs(card.grown) <= 1, `${message} : le rôle agrandit la carte de ${Math.round(card.grown)}px`);
          assert.ok(Math.abs(card.nameMoved) <= 1, `${message} : le rôle déplace le nom de ${Math.round(card.nameMoved)}px`);
          assert.ok(Math.abs(card.emailGrown) <= 0.5, `${message} : le rôle fait passer l'e-mail à la ligne`);
          if (!card.shown) {
            // Disparu : l'e-mail ne lui laissait que quelques lettres, pas de quoi lire un mot.
            seen.hidden++;
            assert.ok(card.column.usable <= MIN_ROLE_PX + 0.5, `${message} : le rôle a disparu alors qu'il avait ${Math.round(card.column.usable)}px`);
            return;
          }
          seen.shown++;
          assert.ok(card.column.usable > MIN_ROLE_PX - 0.5, `${message} : le rôle reste affiché dans ${Math.round(card.column.usable)}px`);
          // Sur la ligne de l'e-mail : à sa droite, à sa hauteur, sans passer à la ligne.
          assert.ok(card.text.height < 1.6 * parseFloat(card.tagLook.fontSize), `${message} : le rôle tient sur une seule ligne`);
          if (card.email) {
            assert.ok(card.text.left >= card.email.right - 0.5, `${message} : le rôle est à droite de l'e-mail`);
            const gap = Math.abs((card.text.top + card.text.bottom) / 2 - (card.email.top + card.email.bottom) / 2);
            assert.ok(gap <= 2, `${message} : le rôle est à ${Math.round(gap)}px de la ligne de l'e-mail`);
          }
          assert.ok(card.text.right <= card.details.right + 0.5 && card.text.left >= card.details.left - 0.5, `${message} : le rôle reste dans la carte`);
          assert.ok(Math.abs(card.tag.right - card.details.right) <= 1, `${message} : le rôle est aligné à droite de la ligne`);
          // Le style de la fonction : même couleur, même corps, même graisse ; ni fond, ni bordure.
          assert.equal(card.tagLook.backgroundColor, 'rgba(0, 0, 0, 0)', `${message} : le rôle n'a pas de fond`);
          assert.equal(card.tagLook.borderTopWidth, '0px', `${message} : le rôle n'a pas de bordure`);
          assert.equal(card.tagLook.color, card.fonctionLook.color, `${message} : couleur de la fonction`);
          assert.equal(card.tagLook.fontSize, card.fonctionLook.fontSize, `${message} : corps de la fonction`);
          assert.equal(card.tagLook.fontWeight, card.fonctionLook.fontWeight, `${message} : graisse de la fonction`);
          assert.equal(card.title, card.label, `${message} : le rôle entier est en infobulle`);
        });
      });
      assert.ok(seen.shown > 0, `le rôle s'affiche (${JSON.stringify(seen)})`);
    }));
}

// Un e-mail qui prend presque toute la ligne (ou plus : il passe alors à la ligne, comme avant le rôle) ne laisse au rôle
// que quelques lettres : il disparaît plutôt que de s'afficher en miette, et l'e-mail ne bouge pas.
test('un e-mail très long ne laisse pas de place au rôle : il disparaît, sans faire passer l\'e-mail à la ligne', { skip }, () => {
  const tables = withShortRole(crowdedTables());
  tables.BDD.email = tables.BDD.email.map(() => 'prenom.nom-de-famille.tres-long@service-recherche-et-innovation.universite-de-bordeaux.fr');
  return withWidget({ tables, waitLogos: false }, async ({ page }) => {
    await atEachWidth(page, [320, 414, 600, 1280, 1920], async width => {
      const cards = await roleCards(page);
      assert.ok(cards.length > 0, `à ${width}px, des cartes portent un rôle`);
      cards.forEach(card => {
        const message = `à ${width}px, ${card.name}`;
        assert.equal(card.shown, false, `${message} : le rôle devrait avoir disparu (${Math.round(card.column.usable)}px de place)`);
        assert.ok(card.column.usable <= MIN_ROLE_PX + 0.5, `${message} : ${Math.round(card.column.usable)}px de place pour un rôle disparu`);
        assert.ok(Math.abs(card.grown) <= 1 && Math.abs(card.emailGrown) <= 0.5, `${message} : le rôle disparu agrandit la carte`);
      });
    });
  });
});

// Un rôle trop long pour la place que l'e-mail lui laisse est coupé par une ellipse : c'est le seul texte de carte coupé
// exprès (les autres passent à la ligne), le rôle entier est en infobulle, et la ligne de l'e-mail reste une ligne.
test('un rôle trop long est coupé par une ellipse, le rôle entier est en infobulle, la carte ne grandit pas', { skip }, () => {
  const tables = crowdedTables();
  const longRole = 'Référent innovation et valorisation de la recherche clinique et translationnelle';
  tables.Role_Dans_le_PUI.Role = [longRole];
  return withWidget({ tables, waitLogos: false }, async ({ page }) => {
    let truncatedSeen = 0;
    // Des largeurs où la carte a la place d'un rôle avec toutes les polices (les cartes de 600 px sont à deux colonnes, de 270 px).
    await atEachWidth(page, [360, 414, 1280, 1640], async width => {
      const cards = (await roleCards(page)).filter(card => card.shown);
      assert.ok(cards.length > 0, `à ${width}px, des rôles sont affichés`);
      cards.forEach(card => {
        const message = `à ${width}px, ${card.name}`;
        assert.equal(card.title, longRole, `${message} : le rôle entier est en infobulle`);
        assert.ok(card.text.height < 1.6 * parseFloat(card.tagLook.fontSize), `${message} : le rôle tient sur une seule ligne`);
        assert.ok(Math.abs(card.grown) <= 1 && Math.abs(card.emailGrown) <= 0.5, `${message} : le rôle grandit la carte ou la ligne de l'e-mail`);
        assert.equal(card.truncated, true, `${message} : ce rôle, plus long que la ligne, n'est pas coupé`);
        truncatedSeen++;
      });
    });
    assert.ok(truncatedSeen > 0);
    const ellipsis = await page.locator('.role-text').first().evaluate(text => getComputedStyle(text).textOverflow);
    assert.equal(ellipsis, 'ellipsis', 'le rôle coupé se termine par « … »');
  });
});

test('écran tactile : le logo de l\'établissement est une cible d\'au moins 28px', { skip }, () =>
  withWidget({ width: 414, touch: true }, async ({ page }) => {
    await atEachWidth(page, [414, 820], async width => {
      const small = await page.locator('.etablissement-tag.visible').evaluateAll(badges =>
        badges.map(badge => badge.getBoundingClientRect()).filter(box => box.height < 27.5 || box.width < 27.5).length);
      assert.equal(small, 0, `à ${width}px, des logos d'établissement font moins de 28px`);
    });
  }));

// ===== Bandeau des fondateurs, en bas =====

// Les cases du bandeau : { cell, image } pour chaque fondateur, dans l'ordre du document.
const bandItems = page => page.locator('#bandLogos li').evaluateAll(items => items.map(item => {
  const rect = element => {
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  };
  const image = item.querySelector('img');
  return { cell: rect(item), image: image && rect(image), sized: image?.classList.contains('sized') ?? false, alt: image?.alt ?? null };
}));

test('bandeau : tout en bas, les fondateurs dans l\'ordre de la table, huit par rangée puis quatre sous 560px de large', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 414, 599, 600, 768, 840, 1024, 1280, 1400, 1480, 1920], async width => {
      const message = `à ${width}px`;
      const band = await rectOf(page, '#foundersBand');
      const lastCard = (await rects(page, '.contact-card')).at(-1);
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      assert.ok(band.top >= lastCard.bottom + 20, `${message} : le bandeau est sous la dernière carte`);
      assert.ok(band.bottom <= documentHeight, `${message} : le bandeau est dans la page`);

      const items = await bandItems(page);
      assert.deepEqual(items.map(item => item.alt), ACRONYMS, `${message} : dans l'ordre de la table`);

      const columns = (await bandContent(page)) >= 560 ? 8 : 4;
      const firstRow = items.filter(item => Math.abs(item.cell.top - items[0].cell.top) < 1).length;
      assert.equal(firstRow, columns, `${message} : ${columns} fondateurs par rangée`);
      const rows = new Set(items.map(item => Math.round(item.cell.top))).size;
      assert.equal(rows, Math.ceil(items.length / columns), `${message} : ${Math.ceil(items.length / columns)} rangées`);

      items.forEach((item, index) => {
        const { cell, image } = item;
        const name = `${message}, ${ACRONYMS[index]}`;
        assert.ok(Math.abs(cell.width - items[0].cell.width) <= 1, `${name} : cases de même largeur`);
        assert.ok(item.sized, `${name} : taille calculée d'après ses proportions`);
        assert.ok(image.left >= cell.left - 0.5 && image.right <= cell.right + 0.5, `${name} : le logo reste dans sa case (largeur)`);
        assert.ok(image.top >= cell.top - 0.5 && image.bottom <= cell.bottom + 0.5, `${name} : le logo reste dans sa case (hauteur)`);
        assert.ok(Math.abs(centerX(image) - centerX(cell)) <= 1 && Math.abs(centerY(image) - centerY(cell)) <= 1, `${name} : centré dans sa case`);
        assert.ok(image.height >= 8 && image.width >= 20, `${name} : lisible (${Math.round(image.width)}x${Math.round(image.height)})`);
      });
      // Même poids visuel : la surface des logos varie peu, quelle que soit leur forme.
      const areas = items.map(item => item.image.width * item.image.height);
      assert.ok(Math.max(...areas) / Math.min(...areas) <= 3, `${message} : poids visuel des logos trop inégal`);
    });
  }));

test('bandeau : le logo France 2030 à droite des logos, ou centré dessous sous 560px, la phrase centrée en dernier', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 414, 599, 600, 768, 1024, 1480], async width => {
      const message = `à ${width}px`;
      const band = await rectOf(page, '#foundersBand');
      const main = await rectOf(page, '.band-main');
      const roundel = await rectOf(page, '#bandRoundel img');
      const sentence = await rectOf(page, '.band-sentence');
      const content = await bandContent(page);
      if (content >= 560) {
        assert.ok(roundel.left >= main.right - 0.5, `${message} : le logo France 2030 est à droite des logos`);
        assert.ok(Math.abs(centerY(roundel) - centerY(main)) <= 2, `${message} : à mi-hauteur des logos`);
        assert.ok(roundel.width <= 121 && roundel.width >= 60, `${message} : ${Math.round(roundel.width)}px de large`);
      } else {
        assert.ok(roundel.top >= main.bottom - 0.5, `${message} : le logo France 2030 passe sous les logos`);
        assert.ok(Math.abs(centerX(roundel) - centerX(band)) <= 1, `${message} : centré`);
        assert.ok(roundel.width <= 89 && roundel.width >= 60, `${message} : ${Math.round(roundel.width)}px de large`);
      }
      assert.ok(sentence.top >= Math.max(main.bottom, roundel.bottom) - 0.5, `${message} : la phrase est sous les logos`);
      assert.ok(Math.abs(centerX(sentence) - centerX(band)) <= 1.5, `${message} : la phrase est centrée`);
      assert.ok(sentence.left >= band.left && sentence.right <= band.right, `${message} : la phrase tient dans le bandeau`);
    });
  }));

// ===== Des logos de toutes formes =====

// Un logo en hauteur, une bannière très large et un SVG sans dimensions, à la place des
// trois premiers fondateurs.
function extremeBranding() {
  const tables = crowdedBranding();
  tables.Etablissements.logo[0] = ['L', TALL_FILE];
  tables.Etablissements.logo[1] = ['L', WIDE_FILE];
  tables.Etablissements.logo[2] = ['L', UNSIZED_FILE];
  return tables;
}

test('un logo très haut, une bannière très large ou un SVG sans dimensions restent dans leur case', { skip }, () =>
  withWidget({ tables: extremeBranding() }, async ({ page }) => {
    await atEachWidth(page, [320, 768, 1480], async width => {
      const message = `à ${width}px`;
      const items = await bandItems(page);
      items.slice(0, 3).forEach(({ cell, image }, index) => {
        const name = `${message}, fondateur ${index + 1}`;
        assert.ok(image.left >= cell.left - 0.5 && image.right <= cell.right + 0.5, `${name} : reste dans sa case (largeur)`);
        assert.ok(image.top >= cell.top - 0.5 && image.bottom <= cell.bottom + 0.5, `${name} : reste dans sa case (hauteur)`);
        // Une bannière de 10 pour 1 est très fine sur un téléphone : visible, pas forcément confortable.
        assert.ok(image.height >= 4 && image.width >= 8, `${name} : visible (${Math.round(image.width)}x${Math.round(image.height)})`);
      });
      // Les proportions du fichier sont respectées : 40x120, 300x30 et 100x50.
      const expected = [40 / 120, 300 / 30, 100 / 50];
      items.slice(0, 3).forEach(({ image }, index) => {
        const ratio = image.width / image.height;
        assert.ok(Math.abs(ratio / expected[index] - 1) <= 0.15, `${message}, fondateur ${index + 1} : proportions déformées (${ratio.toFixed(2)} au lieu de ${expected[index].toFixed(2)})`);
      });

      const cards = await page.locator('.etablissement-tag img').evaluateAll(images => images.map(image => {
        const { width, height } = image.getBoundingClientRect();
        // Ce qui se voit : l'image tient dans sa case (object-fit: contain), à ses proportions.
        const ratio = image.naturalWidth / image.naturalHeight;
        return { alt: image.alt, width, height, shown: { width: Math.min(width, height * ratio), height: Math.min(height, width / ratio) } };
      }));
      assert.ok(cards.every(({ width, height }) => width <= 240.5 && height <= 64.5 && height >= 4), `${message} : logos des cartes bornés`);
      // Même sur une carte, le logo en hauteur, la bannière et le SVG sans dimensions gardent leurs proportions.
      const expectedRatios = { UB: 40 / 120, 'Bordeaux INP': 300 / 30, BSA: 100 / 50 };
      Object.entries(expectedRatios).forEach(([alt, expectedRatio]) => {
        const logo = cards.find(card => card.alt === alt);
        assert.ok(logo, `${message} : le logo de ${alt} s'affiche sur une carte`);
        assert.ok(Math.abs(logo.shown.width / logo.shown.height / expectedRatio - 1) <= 0.15,
          `${message}, carte ${alt} : proportions déformées (${(logo.shown.width / logo.shown.height).toFixed(2)} au lieu de ${expectedRatio.toFixed(2)})`);
      });
      // Les bornes du bandeau sont en millièmes de la largeur du bloc de logos (1 014 = huit colonnes).
      const main = await rectOf(page, '.band-main');
      const unit = main.width / 1014 * (8 / ((await bandContent(page)) >= 560 ? 8 : 4));
      items.forEach(({ image }, index) => {
        assert.ok(image.width <= BAND_LOGO.maxWidth * unit + 0.5 && image.height <= BAND_LOGO.maxHeight * unit + 0.5,
          `${message}, fondateur ${index + 1} : ${Math.round(image.width)}x${Math.round(image.height)} dépasse les bornes`);
      });
    });
  }));

// ===== Sans logo, les noms prennent la place =====

function namesOnly() {
  const tables = crowdedBranding();
  tables.Etablissements.logo = tables.Etablissements.id.map(() => null);
  return tables;
}

test('sans aucun logo, les noms des fondateurs restent dans leur case', { skip }, () =>
  withWidget({ tables: namesOnly(), waitLogos: false }, async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos .band-name').length > 0);
    await atEachWidth(page, [320, 360, 414, 600, 768, 1024, 1480], async width => {
      const message = `à ${width}px`;
      assert.equal(await page.locator('img.logo-img').count(), 0, `${message} : aucune image`);
      const overflowing = await page.evaluate(() => [...document.querySelectorAll('.band-name')]
        .filter(name => name.scrollWidth > name.clientWidth + 1 || name.getBoundingClientRect().right > name.parentElement.getBoundingClientRect().right + 1)
        .map(name => name.textContent));
      assert.deepEqual(overflowing, [], `${message} : un nom dépasse de sa case`);
      const names = await page.locator('#bandLogos .band-name').allTextContents();
      assert.deepEqual(names, ACRONYMS, `${message} : les noms des fondateurs, dans l'ordre`);
      const { client, scroll } = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(scroll <= client, `${message} : la page déborde de ${scroll - client}px`);
    });
  }));
