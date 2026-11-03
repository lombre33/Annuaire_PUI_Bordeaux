// Le bord des champs se voit (1.36.0, audit UI/UX U25, WCAG 1.4.11 « contraste non textuel », 3:1). Le bord du champ de recherche faisait
// 1,23:1 sur blanc, celui des boutons de filtre, des champs et des listes déroulantes des fenêtres aussi : on ne reconnaissait un champ
// vide qu'à son fond (1,06:1). Ils prennent maintenant `--field-line` (#7d879c, 3,6:1 sur blanc). L'interrupteur Fondateurs/Partenaires
// dit son état par un contour du bouton allumé. Les filets, les cartes et les cadres, que rien n'oblige à voir, gardent `--line`.
//
//   1. Ce que style.css et dialogs.css déclarent (sans navigateur).
//   2. Ce que la page affiche : les bords calculés par le navigateur, à la souris et sur un écran tactile (Chromium, optionnel).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { sampleTables, withIdentity, ANA_EMAIL } from './fixtures.mjs';
import { skip, openOwn, waitForCards, withWidget } from './support/browser.mjs';
import { blend, contrastRatio, parseColor } from './support/contrast.mjs';
import { cssValue, readCss } from './support/css.mjs';

const STYLE = readCss('style.css');
const DIALOGS = readCss('dialogs.css');
const MIN_CONTRAST = 3;
const FIELD_BACKGROUND = '#f7f8fc';
const WASH = '#f4f6fb'; // le fond de la page, sous la barre d'outils translucide

// Les contrôles dont le bord est ce qui les fait reconnaître : leur sélecteur, et la feuille qui les déclare.
const FIELDS = [
  ['.search-box', STYLE], ['.filter-button', STYLE], ['.filter-search-input', STYLE], ['.scope-toggle', STYLE],
  ['.fld input', DIALOGS], ['.fld select', DIALOGS], ['.dd-trigger', DIALOGS], ['.pick-search', DIALOGS], ['.es-add > input', DIALOGS]
];

// ===== 1. Les déclarations =====

test('--field-line fait 3:1 au moins avec blanc, avec le fond des champs et avec le fond de la page', () => {
  const token = /--field-line:\s*(#[0-9a-f]{6})/i.exec(STYLE)?.[1];
  assert.ok(token, '--field-line est déclarée sur :root, dans style.css : dialogs.css la lit aussi');
  for (const [label, background] of [['blanc', '#fff'], ['le fond des champs', FIELD_BACKGROUND], ['le fond de la page', WASH]]) {
    const ratio = contrastRatio(token, background);
    assert.ok(ratio >= MIN_CONTRAST, `${token} sur ${label} : ${ratio.toFixed(2)}:1, ${MIN_CONTRAST}:1 exigés`);
  }
});

test('le champ de recherche, les boutons de filtre, l\'interrupteur et les champs des fenêtres ont le bord --field-line', () => {
  const wrong = FIELDS.filter(([selector, css]) => cssValue(css, selector, 'border') !== '1px solid var(--field-line)').map(([selector]) => selector);
  assert.deepEqual(wrong, [], 'ces contrôles gardent un bord à 1,2:1 : un champ vide ne se reconnaît plus');
});

test('sur un écran tactile, un bouton de filtre refermé garde son bord foncé (le survol y reste collé)', () => {
  assert.equal(cssValue(STYLE, '.filter:not(.open) .filter-button:hover', 'border-color'), 'var(--field-line)');
});

test('le bouton allumé de l\'interrupteur a un contour violet à 3:1 au moins avec le blanc du bouton et le fond du boîtier', () => {
  const shadow = cssValue(STYLE, '.scope-btn.active', 'box-shadow');
  const ring = /^inset 0 0 0 1\.5px (#[0-9a-f]{6})/i.exec(shadow ?? '')?.[1];
  assert.ok(ring, `un contour intérieur de 1,5 px (box-shadow : ${shadow})`);
  for (const [label, background] of [['le bouton blanc', '#fff'], ['le boîtier', FIELD_BACKGROUND]]) {
    assert.ok(contrastRatio(ring, background) >= MIN_CONTRAST, `${ring} sur ${label} : ${contrastRatio(ring, background).toFixed(2)}:1`);
  }
});

test('les cartes, les filets et les cadres gardent leur bord clair : seuls les contrôles s\'assombrissent (garde)', () => {
  assert.equal(cssValue(STYLE, '.contact-card', 'border'), '1px solid #e8eaf2');
  assert.equal(cssValue(STYLE, '.card-tags', 'border-top'), '1px solid var(--line)');
  assert.equal(cssValue(STYLE, '.filter-menu', 'border'), '1px solid var(--line)');
  assert.equal(cssValue(DIALOGS, '.dlg-head', 'border-bottom'), '1px solid var(--line)');
  assert.match(STYLE, /--line:\s*#e4e8f0/);
});

// ===== 2. Ce que la page affiche =====

// Le bord calculé de `selector`, et ses fonds : celui du contrôle et celui qui l'entoure (un fond translucide est posé sur `outside`).
const bordersOf = (page, selector) => page.evaluate(wanted => {
  const element = document.querySelector(wanted);
  const style = getComputedStyle(element);
  const parent = getComputedStyle(element.parentElement);
  return { border: style.borderTopColor, width: style.borderTopWidth, inside: style.backgroundColor, outside: parent.backgroundColor };
}, selector);

// Le contraste d'un bord avec ce qu'il y a de part et d'autre (le fond du contrôle, transparent ou non, tombe sur celui du dessous).
function ratiosOf({ border, inside, outside }, below = '#fff') {
  const outer = blend(parseColor(outside), parseColor(below));
  const inner = blend(parseColor(inside), outer);
  return { outside: contrastRatio(parseColor(border), outer), inside: contrastRatio(parseColor(border), inner) };
}

test('dans la page : le champ de recherche, un bouton de filtre et l\'interrupteur ont un bord à 3:1 au moins avec leur fond et avec celui de la barre', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    for (const selector of ['.search-box', '.filter-button', '.scope-toggle']) {
      const seen = await bordersOf(page, selector);
      assert.equal(seen.width, '1px', selector);
      const { outside, inside } = ratiosOf(seen, WASH);
      assert.ok(outside >= MIN_CONTRAST && inside >= MIN_CONTRAST, `${selector} : ${outside.toFixed(2)}:1 dehors, ${inside.toFixed(2)}:1 dedans`);
    }
    // Le bouton allumé : le contour violet, 1,5 px, à l'intérieur du bouton.
    assert.match(await page.locator('.scope-btn.active').first().evaluate(button => getComputedStyle(button).boxShadow), /inset/);
    assert.equal(await page.locator('.scope-btn:not(.active)').first().evaluate(button => getComputedStyle(button).boxShadow), 'none', 'le bouton éteint n\'en a pas');
  }));

test('dans la page : la recherche d\'un menu de filtre a le même bord', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('.filter-button', { hasText: 'Compétences' }).click();
    const seen = await bordersOf(page, '.filter.open .filter-search-input');
    const { outside, inside } = ratiosOf(seen);
    assert.ok(outside >= MIN_CONTRAST && inside >= MIN_CONTRAST, `${outside.toFixed(2)}:1 dehors, ${inside.toFixed(2)}:1 dedans`);
  }));

test('dans la page : les champs et la liste déroulante de la fenêtre de modification ont le même bord', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    for (const selector of ['#profileDialog .fld input', '#profileDialog .dd-trigger']) {
      const { outside, inside } = ratiosOf(await bordersOf(page, selector));
      assert.ok(outside >= MIN_CONTRAST && inside >= MIN_CONTRAST, `${selector} : ${outside.toFixed(2)}:1 dehors, ${inside.toFixed(2)}:1 dedans`);
    }
  }));

test('sur un écran tactile, le bouton de filtre refermé garde son bord foncé', { skip }, () =>
  withWidget({ tables: sampleTables(), contextOptions: { hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } } }, async ({ page }) => {
    await waitForCards(page, 4);
    const button = page.locator('.filter-button').first();
    await button.tap();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.filter.open'));
    const { outside, inside } = ratiosOf(await bordersOf(page, '.filter-button'), WASH);
    assert.ok(outside >= MIN_CONTRAST && inside >= MIN_CONTRAST, `${outside.toFixed(2)}:1 dehors, ${inside.toFixed(2)}:1 dedans`);
  }));
