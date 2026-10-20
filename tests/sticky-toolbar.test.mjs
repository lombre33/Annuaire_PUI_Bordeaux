// La barre d'outils fixe et la pastille « Haut de page » (1.31.0, audit UI/UX U34) : avec des centaines de fiches, la page fait des dizaines
// de milliers de pixels de haut, et la recherche, les filtres et le compteur sortaient de l'écran dès le premier défilement. Chaque test
// échoue sur le code de la 1.30.0, sauf les gardes qui disent ce qui ne change pas (le haut de la page, une fenêtre étroite ou basse).
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md). 44 cartes (withClones) : la page défile.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withClones } from './fixtures.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { resultCount, skip, waitForCards, withWidget } from './support/browser.mjs';
import { contrastRatio, parseColor } from './support/contrast.mjs';

const CARDS = 44;
const tables = () => withClones(sampleTables(), 40);

// La barre d'outils vue de l'écran : son bord haut et son bord bas, dans la fenêtre.
const toolbarBox = page => page.locator('#toolbar').evaluate(element => {
  const { top, bottom } = element.getBoundingClientRect();
  return { top: Math.round(top), bottom: Math.round(bottom), position: getComputedStyle(element).position };
});
const toolsHidden = page => page.locator('#scrollTools').evaluate(element => element.hidden);

// Fait défiler la page de `y` pixels puis attend que la page ait vu le défilement (la pastille se montre ou se cache).
async function scrollTo(page, y) {
  await page.evaluate(top => window.scrollTo(0, top), y);
  await page.waitForFunction(expected => document.getElementById('scrollTools').hidden === expected, y === 0);
}

// Ouvre la page à la taille voulue, avec les 44 cartes.
const withSize = (width, height, run) => withWidget({ tables: tables() }, async context => {
  await context.page.setViewportSize({ width, height });
  await waitForCards(context.page, CARDS);
  await run(context);
});

// ===== La barre d'outils reste en haut =====

test('à partir de 1180 px de large, la barre d\'outils reste en haut de l\'écran quand la page défile, et ses contrôles répondent (audit U34)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    assert.ok((await toolbarBox(page)).top > 100, 'en haut de la page, elle est à sa place, sous l\'en-tête');
    await scrollTo(page, 2000);
    const box = await toolbarBox(page);
    assert.deepEqual({ top: box.top, position: box.position }, { top: 0, position: 'sticky' });
    assert.ok(box.bottom > 60 && box.bottom <= 140, `deux rangées de contrôles au plus : ${box.bottom} px`);

    // Elle est au-dessus des cartes : le champ de recherche reçoit les clics et la frappe, sans que la page remonte.
    const hit = await page.locator('#searchInput').evaluate(input => {
      const { left, top, width, height } = input.getBoundingClientRect();
      return document.elementFromPoint(left + width / 2, top + height / 2) === input;
    });
    assert.equal(hit, true, 'le champ de recherche n\'est pas recouvert par les cartes');
    await page.locator('#searchInput').fill('Copie');
    await page.waitForFunction(() => document.getElementById('resultCount').textContent === '40 contacts');
    assert.equal((await toolbarBox(page)).top, 0, 'toujours en haut après la recherche');
    assert.ok(await page.evaluate(() => window.scrollY) > 0, 'la page n\'est pas remontée');

    // Un menu s'ouvre sous la barre fixe et passe devant les cartes.
    await page.locator('.filter-button', { hasText: 'Instances' }).click();
    const menuOnTop = await page.locator('.filter.open .filter-option').first().evaluate(option => {
      const { left, top, width, height } = option.getBoundingClientRect();
      return option.contains(document.elementFromPoint(left + width / 2, top + height / 2));
    });
    assert.equal(menuOnTop, true, 'le menu est devant les cartes');
  }));

test('plus étroite que 1180 px, ou dans un cadre moins haut que 560 px, la barre d\'outils défile avec la page : elle y prendrait trop de place (audit U34, garde)', { skip }, async () => {
  for (const [width, height] of [[1100, 800], [768, 900], [390, 844], [1280, 500]]) {
    await withSize(width, height, async ({ page }) => {
      await scrollTo(page, 2000);
      const box = await toolbarBox(page);
      assert.equal(box.position, 'static', `${width}×${height}`);
      assert.ok(box.top < 0, `${width}×${height} : la barre est sortie de l'écran (${box.top})`);
    });
  }
});

test('au chargement, la page est celle d\'avant : le repère de défilement ne prend aucune place entre l\'en-tête et la barre d\'outils (audit U34, garde)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    const gap = await page.evaluate(() => {
      const header = document.querySelector('.page-header');
      const toolbar = document.getElementById('toolbar');
      return {
        between: Math.round(toolbar.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
        margin: parseFloat(getComputedStyle(header).marginBottom),
        hiddenFromReaders: document.getElementById('toolbarSentinel').getAttribute('aria-hidden')
      };
    });
    assert.deepEqual(gap, { between: gap.margin, margin: 24, hiddenFromReaders: 'true' });
    assert.equal(await toolsHidden(page), true, 'pas de pastille en haut de page');
    assert.equal(await page.evaluate(() => document.body.classList.contains('scrolled')), false);
  }));

test('dans un cadre moins haut que l\'en-tête, la barre d\'outils est sous le bas du cadre sans que la page soit défilée : pas de pastille (audit U34, garde)', { skip }, () =>
  withSize(1280, 120, async ({ page }) => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok((await toolbarBox(page)).top > 120, 'le repère est sous le cadre');
    assert.equal(await toolsHidden(page), true, 'sous le cadre ne veut pas dire au-dessus : la page n\'a pas défilé');
    assert.equal(await page.evaluate(() => document.body.classList.contains('scrolled')), false);
  }));

test('la barre d\'outils fixe est opaque une fois la page défilée, et garde son fond translucide en haut de page (audit U34)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    const background = () => page.locator('#toolbar').evaluate(element => getComputedStyle(element).backgroundColor);
    assert.match(await background(), /^rgba\(255, 255, 255, 0\.8\d*\)$/, 'en haut : comme sur la maquette');
    await scrollTo(page, 2000);
    assert.equal(await background(), 'rgb(255, 255, 255)', 'défilée : les cartes qui passent dessous ne se lisent pas à travers');
  }));

// ===== Ce que le clavier amène en vue s'arrête sous la barre fixe =====

test('ce que le clavier amène en vue s\'arrête sous la barre d\'outils fixe, qui dit sa hauteur à la feuille de style (audit U34, WCAG 2.4.11)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    const measured = () => page.evaluate(() => ({
      variable: getComputedStyle(document.documentElement).getPropertyValue('--toolbar-height'),
      toolbar: `${document.getElementById('toolbar').offsetHeight}px`,
      padding: getComputedStyle(document.documentElement).scrollPaddingTop
    }));
    const { variable, toolbar, padding } = await measured();
    assert.equal(variable, toolbar, 'la hauteur de la barre est celle que la feuille de style utilise');
    assert.equal(padding, `${parseFloat(toolbar) + 12}px`);

    // On remonte au clavier de carte en carte, par la fin de la page : chaque contrôle atteint reste sous la barre.
    await scrollTo(page, 3000);
    const tops = [];
    await page.evaluate(() => { document.querySelectorAll('.contact-card')[12].querySelector('a.email').focus(); });
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press('Shift+Tab');
      tops.push(await page.evaluate(() => Math.round(document.activeElement.getBoundingClientRect().top)));
    }
    const bar = (await toolbarBox(page)).bottom;
    assert.ok(tops.every(top => top >= bar), `un contrôle est resté sous la barre (bas de la barre : ${bar} px ; hauts : ${tops})`);
  }));

test('plus étroite que 1180 px, la feuille de style ne réserve aucune place sous la barre : elle ne couvre rien (audit U34, garde)', { skip }, () =>
  withSize(1100, 800, async ({ page }) => {
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop), 'auto');
  }));

// ===== La pastille « N contacts · Haut de page » =====

test('une fois la barre d\'outils passée, une pastille donne le nombre de contacts et un bouton « Haut de page » ; il remonte et rend le focus au compteur (audit U34)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    assert.equal(await toolsHidden(page), true);
    await scrollTo(page, 1500);
    assert.equal(await toolsHidden(page), false);
    assert.equal(await page.evaluate(() => document.body.classList.contains('scrolled')), true);
    assert.equal(await page.locator('#scrollCount').textContent(), `${CARDS} contacts`);
    assert.equal(await page.locator('#scrollCount').textContent(), await resultCount(page), 'le même nombre que le compteur du haut');

    // Elle suit le compteur : une recherche la met à jour.
    await page.locator('#searchInput').fill('Copie');
    await page.waitForFunction(() => document.getElementById('resultCount').textContent === '40 contacts');
    assert.equal(await page.locator('#scrollCount').textContent(), '40 contacts');

    // Elle est fixe, en bas à droite de l'écran, et ne recouvre pas toute la page.
    const place = await page.locator('#scrollTools').evaluate(element => {
      const { right, bottom, width, height } = element.getBoundingClientRect();
      return { right: window.innerWidth - right, bottom: window.innerHeight - bottom, small: width < 320 && height < 60, position: getComputedStyle(element).position };
    });
    assert.deepEqual(place, { right: 16, bottom: 16, small: true, position: 'fixed' });

    await page.getByRole('button', { name: 'Haut de page' }).click();
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resultCount', 'le focus est en haut, sur le compteur');
    await page.waitForFunction(() => document.getElementById('scrollTools').hidden);
    assert.equal(await page.evaluate(() => document.body.classList.contains('scrolled')), false);
  }));

test('le nombre de contacts et le bouton de la pastille gardent 4,5:1 (WCAG 1.4.3, audit U34)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    await scrollTo(page, 1500);
    const looks = await page.evaluate(() => ['#scrollCount', '#toTop'].map(selector => {
      const { color, backgroundColor } = getComputedStyle(document.querySelector(selector));
      return { selector, color, backgroundColor };
    }));
    const ratios = looks.map(({ selector, color, backgroundColor }) => `${selector} ${contrastRatio(parseColor(color), parseColor(backgroundColor)).toFixed(1)}:1`);
    assert.deepEqual(looks.filter(({ color, backgroundColor }) => contrastRatio(parseColor(color), parseColor(backgroundColor)) < 4.5).map(({ selector }) => selector), [], ratios.join(', '));
  }));

test('sur un téléphone, la barre d\'outils défile mais la pastille reste : le nombre de contacts et le retour en haut sont à portée de pouce (audit U34)', { skip }, () =>
  withSize(390, 844, async ({ page }) => {
    await scrollTo(page, 2500);
    assert.equal(await toolsHidden(page), false);
    const place = await page.locator('#scrollTools').evaluate(element => {
      const { right, bottom, left } = element.getBoundingClientRect();
      return { right: window.innerWidth - right, bottom: window.innerHeight - bottom, insideScreen: left >= 0 };
    });
    assert.deepEqual(place, { right: 12, bottom: 12, insideScreen: true });
  }));

test('ce que la pastille donne aux lecteurs d\'écran : un seul bouton nommé « Haut de page », le compteur répété n\'est pas lu (audit U34)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    let tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'button', 'Haut de page'), undefined, 'caché en haut de page : absent de l\'arbre');
    const liveRegions = tree.filter(node => node.role === 'status').length;
    await scrollTo(page, 1500);
    tree = await accessibilityTree(page);
    assert.ok(accessibleNode(tree, 'button', 'Haut de page'), 'le nom ne contient que le texte : la flèche ne se lit pas');
    assert.equal(tree.filter(node => node.role === 'status').length, liveRegions, 'la pastille n\'ajoute pas de zone vivante : le compteur du haut reste la seule qui annonce le résultat');
    assert.equal(tree.filter(node => node.role === 'StaticText' && node.name === `${CARDS} contacts`).length, 1, 'le nombre de contacts se lit une fois : la copie de la pastille est cachée aux lecteurs d\'écran');
    assert.equal(await page.locator('#scrollCount').getAttribute('aria-hidden'), 'true');
  }));

test('à l\'impression, la pastille n\'apparaît pas (audit U34)', { skip }, () =>
  withSize(1280, 800, async ({ page }) => {
    await scrollTo(page, 1500);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#scrollTools').evaluate(element => getComputedStyle(element).display), 'none');
  }));
