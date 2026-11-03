// Ce que la page donne sur le papier (1.36.0, audit UI/UX U11). Elle n'avait aucune règle d'impression : 3 à 4 pages avec la barre d'outils
// (recherche, filtres, interrupteurs), des cartes coupées en deux entre deux pages et, sans « graphiques d'arrière-plan » (le réglage par
// défaut des navigateurs), des pastilles, des initiales et des badges au texte blanc sur du blanc. Sur le papier : ni commande, ni fond ;
// une carte reste entière sur sa page ; tout texte d'une carte se lit sur le blanc du papier.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md) et le passent en média « print » (emulateMedia) :
// ils lisent les styles que le navigateur calcule pour le papier, et un test imprime la page en PDF.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { crowdedTables } from './fixtures-responsive.mjs';
import { sampleTables, withIdentity, ANA_EMAIL } from './fixtures.mjs';
import { skip, waitForCards, waitForEditButtons, withWidget } from './support/browser.mjs';
import { contrastRatio, parseColor } from './support/contrast.mjs';

const MIN_TEXT_CONTRAST = 4.5;
const WHITE_PAPER = '#fff';

// Ce que la page montre à l'écran puis sur le papier : `shown(selector)` dit si un élément au moins est affiché.
const shown = (page, selector) => page.evaluate(wanted => [...document.querySelectorAll(wanted)].some(element => element.getClientRects().length > 0), selector);
const onPaper = page => page.emulateMedia({ media: 'print' });
const onScreen = page => page.emulateMedia({ media: 'screen' });

// Les commandes n'ont rien à faire sur le papier : les contrôles de l'en-tête, de la barre d'outils, des cartes et la pastille « Haut de page ».
const CONTROLS = ['.toolbar', '.account-bar', '.card-actions', '.scroll-tools', '.skip-link', '.admin-strip'];

test('sur le papier : ni barre d\'outils, ni « Ma présence », ni boutons « Modifier », ni lien d\'évitement ; à l\'écran ils sont là', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForEditButtons(page, 1);
    await page.waitForFunction(() => !document.getElementById('accountBar').hidden);
    for (const selector of ['.toolbar', '.account-bar', '.card-actions']) assert.equal(await shown(page, selector), true, `${selector} à l'écran`);
    await onPaper(page);
    for (const selector of CONTROLS) assert.equal(await shown(page, selector), false, `${selector} sur le papier`);
    assert.equal(await shown(page, '.contact-card'), true, 'les cartes restent');
    assert.equal(await shown(page, '.page-title'), true, 'et le titre');
    await onScreen(page);
    assert.equal(await shown(page, '.toolbar'), true, 'revenu à l\'écran, la barre d\'outils est de retour');
  }));

test('sur le papier : une carte ne se coupe pas entre deux pages, est dessinée en entier, sans ombre ni fond de page', { skip }, () =>
  withWidget({ tables: crowdedTables(40) }, async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length >= 10);
    await onPaper(page);
    const looks = await page.evaluate(() => {
      const card = document.querySelector('#cardsGrid .contact-card');
      const style = getComputedStyle(card);
      return {
        breakInside: style.breakInside, contentVisibility: style.contentVisibility, shadow: style.boxShadow,
        page: getComputedStyle(document.body).backgroundImage, cardBorder: style.borderTopColor
      };
    });
    assert.deepEqual({ ...looks, cardBorder: undefined }, { breakInside: 'avoid', contentVisibility: 'visible', shadow: 'none', page: 'none', cardBorder: undefined });
    assert.ok(contrastRatio(parseColor(looks.cardBorder), WHITE_PAPER) >= 3, `le bord d'une carte se voit sur le papier (${looks.cardBorder})`);
  }));

test('sur le papier, sans graphiques d\'arrière-plan, tout texte d\'une carte se lit sur le blanc : pastilles, initiales, badges, liens', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await onPaper(page);
    const texts = await page.evaluate(() => [...document.querySelectorAll('.contact-card *')]
      .filter(element => element.getClientRects().length > 0 && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()))
      .map(element => ({ label: `${element.className} « ${element.textContent.trim().slice(0, 20)} »`, color: getComputedStyle(element).color })));
    assert.ok(texts.length > 30, `assez de textes mesurés (${texts.length})`);
    const unreadable = texts.map(({ label, color }) => ({ label, ratio: contrastRatio(parseColor(color), WHITE_PAPER) }))
      .filter(({ ratio }) => ratio < MIN_TEXT_CONTRAST).map(({ label, ratio }) => `${label} : ${ratio.toFixed(2)}:1`);
    assert.deepEqual(unreadable, [], 'ces textes seraient illisibles sans fond (blanc sur blanc)');
  }));

test('sur le papier : les pastilles, les initiales et les badges d\'établissement ont un bord ; le rôle PUI reste un texte', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await onPaper(page);
    const borders = await page.evaluate(() => Object.fromEntries(['.tag:not(.role-tag)', '.avatar', '.etablissement-tag.visible:not(.has-logo)', '.role-tag']
      .map(selector => {
        const element = document.querySelector(`.contact-card ${selector}`);
        return [selector, element ? [getComputedStyle(element).borderTopWidth, getComputedStyle(element).backgroundColor] : null];
      })));
    assert.deepEqual(borders, {
      '.tag:not(.role-tag)': ['1px', 'rgb(255, 255, 255)'],
      '.avatar': ['1px', 'rgb(255, 255, 255)'],
      '.etablissement-tag.visible:not(.has-logo)': ['1px', 'rgb(255, 255, 255)'],
      '.role-tag': borders['.role-tag'] // le rôle : pas de bord (s'il y en a un dans ces données)
    });
    if (borders['.role-tag']) assert.equal(borders['.role-tag'][0], '0px');
  }));

// Un PDF commence par `%PDF` et liste ses pages (`/Type /Page`) : de quoi vérifier, sans lecteur de PDF, que la page s'imprime en
// plusieurs pages.
const pagesOf = pdf => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

test('la page s\'imprime en PDF, A4 portrait et paysage, en plusieurs pages et sans erreur', { skip }, () =>
  withWidget({ tables: crowdedTables(40) }, async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length >= 10);
    const portrait = await page.pdf({ format: 'A4' });
    const landscape = await page.pdf({ format: 'A4', landscape: true });
    assert.equal(portrait.subarray(0, 4).toString('latin1'), '%PDF');
    assert.ok(pagesOf(portrait) > 1 && pagesOf(landscape) > 1, `portrait ${pagesOf(portrait)} pages, paysage ${pagesOf(landscape)} pages`);
    assert.equal(landscape.subarray(0, 4).toString('latin1'), '%PDF');
  }));
