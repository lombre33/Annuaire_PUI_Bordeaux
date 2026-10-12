// Accessibilité du widget : noms accessibles, anneau de focus au clavier et contrastes
// (WCAG 2.2 AA). Les mesures viennent de l'audit UI/UX (constats U13, U14 et U19) ; chaque
// test ci-dessous échoue sur le code d'avant leur correction.
//
// Les tests de contraste et de feuille de style ne demandent aucun navigateur ; les
// autres chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../constants.js';
import { sampleTables, withIdentity, ANA_EMAIL } from './fixtures.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';
import { parseColor, contrastRatio, WHITE } from './support/contrast.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readCss = name => fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ===== Contrastes (sans navigateur) =====

test('contrastRatio : valeurs de référence de la norme WCAG', () => {
  assert.equal(contrastRatio('#000', '#fff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#fff', '#fff').toFixed(2), '1.00');
  // Le violet du widget sur blanc : 5,4:1 (calcul à la main : (1,05)/(0,1442+0,05)).
  assert.equal(contrastRatio('#6257d9', '#fff').toFixed(1), '5.4');
  // Une couleur translucide se pose d'abord sur son fond : 50 % de noir sur blanc = gris 127,5 → 3,98:1.
  assert.equal(contrastRatio('rgba(0, 0, 0, 0.5)', '#fff').toFixed(2), '3.98');
  assert.deepEqual(parseColor('rgb(98, 87, 217)'), [98, 87, 217, 1]);
  assert.deepEqual(parseColor('rgba(98 87 217 / 0.5)'), [98, 87, 217, 0.5]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
});

// ===== Feuilles de style (sans navigateur) =====

// Un `outline: 0` ou `outline: none` retire l'anneau de focus du navigateur : permis seulement
// là où un autre élément porte l'anneau, ou là où le focus n'est pas sur un contrôle.
const OUTLINE_REMOVED_ALLOWED = {
  // Le champ de recherche n'a pas de bordure : l'anneau est dessiné autour du cadre entier.
  '.search-box input': '.search-box:focus-within',
  // Le titre de la fenêtre reçoit le focus pour être annoncé : ce n'est pas un contrôle.
  '.dlg-head h2:focus': null
};

function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.replace(/\s+/g, ' ').trim(),
    body
  }));
}

test('aucune règle ne supprime l’anneau de focus sans le remplacer (WCAG 2.4.7)', () => {
  const rules = ['style.css', 'dialogs.css'].flatMap(name => cssRules(readCss(name)));
  const removed = rules.filter(({ body }) => /(^|[;\s])outline(-style)?\s*:\s*(0|none)\b/.test(body)).map(rule => rule.selector);
  const unexpected = removed.filter(selector => !(selector in OUTLINE_REMOVED_ALLOWED));
  assert.deepEqual(unexpected, [], 'ces règles retirent l’anneau de focus : en poser un autre, ou les déclarer ici avec leur raison');
  for (const [selector, replacement] of Object.entries(OUTLINE_REMOVED_ALLOWED)) {
    if (!replacement) continue;
    const rule = rules.find(candidate => candidate.selector === replacement);
    assert.ok(rule && /outline:\s*2px solid/.test(rule.body), `${selector} : la règle de remplacement ${replacement} manque`);
  }
});

// ===== Couleurs de catégorie et lien e-mail (sans navigateur) =====

// Texte courant : 4,5:1 au moins, quelle que soit sa taille (WCAG 1.4.3) ; les pastilles sont à
// 8,5 px. Avant leur correction (audit U19), les cinq couleurs de catégorie les plus claires
// faisaient de 2,16:1 (Tâches) à 3,56:1 (Communautés), et le lien e-mail 3,30:1.
const MIN_TEXT_CONTRAST = 4.5;

test('chaque couleur de catégorie garde 4,5:1 avec le blanc : pastille à texte blanc, titre de groupe sur fond blanc (WCAG 1.4.3)', () => {
  const tooPale = Object.entries(CATEGORIES)
    .map(([key, { color }]) => ({ key, color, ratio: contrastRatio(color, WHITE) }))
    .filter(({ ratio }) => ratio < MIN_TEXT_CONTRAST)
    .map(({ key, color, ratio }) => `${key} ${color} : ${ratio.toFixed(2)}:1`);
  assert.deepEqual(tooPale, [], 'couleurs à foncer à teinte constante (constants.js) pour atteindre 4,5:1');
});

test('le lien e-mail d’une carte garde 4,5:1 sur le fond blanc de la carte (WCAG 1.4.3)', () => {
  const css = readCss('style.css');
  const rule = cssRules(css).find(candidate => candidate.selector === '.email');
  const variable = /(?:^|[;\s])color:\s*var\((--[\w-]+)\)/.exec(rule?.body ?? '')?.[1];
  assert.ok(variable, 'la couleur de `.email` vient d’une variable de :root');
  const color = new RegExp(`${variable}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(css)?.[1];
  assert.ok(color, `${variable} est déclarée en hexadécimal dans :root`);
  const ratio = contrastRatio(color, WHITE);
  assert.ok(ratio >= MIN_TEXT_CONTRAST, `${variable} ${color} : ${ratio.toFixed(2)}:1 au lieu de 4,5:1`);
});

// ===== Navigateur =====

// Les contrôles qui ont un rôle à nom obligatoire (4.1.2) dans l'arbre d'accessibilité.
const NAMED_ROLES = 'button|link|checkbox|switch|radio|searchbox|textbox|combobox|spinbutton|slider|menuitem|tab|option';

// Lignes de l'instantané d'accessibilité (`- searchbox "Nom" [états]`) sans nom entre guillemets.
function unnamedControls(snapshot) {
  return snapshot.split('\n')
    .map(line => new RegExp(`^\\s*- (${NAMED_ROLES})\\b(.*)$`).exec(line))
    .filter(match => match && !match[2].startsWith(' "'))
    .map(match => match[0].trim());
}

test('le champ de recherche a un nom accessible qui reprend son libellé visible (WCAG 4.1.2, 2.5.3)', { skip }, async () => {
  await withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const box = page.getByRole('searchbox');
    assert.equal(await box.count(), 1);
    const placeholder = await box.getAttribute('placeholder');
    const name = 'Rechercher par nom ou prénom';
    assert.equal(await page.getByRole('searchbox', { name, exact: true }).count(), 1, 'le champ est nommé par son rôle');
    // Le texte visible (l'invite, sans ses points de suspension) doit faire partie du nom.
    assert.ok(name.includes(placeholder.replace(/…$/, '').trim()), 'le nom contient le texte affiché dans le champ');
  });
});

test('aucun contrôle de la page n’est sans nom accessible, menu fermé ou ouvert (WCAG 4.1.2)', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(unnamedControls(await page.locator('body').ariaSnapshot()), [], 'page au repos');
    // Un menu ouvert montre sa recherche, ses cases et le détail d'un domaine.
    await page.locator('.filter-button', { hasText: 'Compétences' }).click();
    await page.locator('.filter.open .group-toggle').first().click();
    const snapshot = await page.locator('body').ariaSnapshot();
    assert.ok(snapshot.includes('textbox "Rechercher dans Compétences"'), 'la recherche du menu est nommée');
    assert.deepEqual(unnamedControls(snapshot), [], 'menu ouvert');
  });
});

// Les arrêts de tabulation, dans l'ordre : l'élément, son rectangle dans la page, le style de son
// anneau (celui du cadre pour le champ de recherche, qui n'a pas de bordure) et une capture de
// son voisinage avec le focus. La fenêtre est assez haute pour que la page ne défile pas : les
// coordonnées d'écran sont celles de la page. `from` : le sélecteur d'où partir (par défaut,
// le début de la page). Le curseur de saisie, qui clignote, est rendu transparent : sans cela
// il suffirait à différencier deux captures d'un champ sans anneau.
const MARGIN = 16;
async function tabStops(page, { limit = 80, from = null } = {}) {
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.__tabSeen = new WeakSet();
  });
  if (from) await page.locator(from).focus();
  const stops = [];
  for (let n = 0; n < limit; n += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(margin => {
      const element = document.activeElement;
      if (!element || element === document.body || window.__tabSeen.has(element)) return null;
      window.__tabSeen.add(element);
      const owner = element.matches('.search-box input') ? element.closest('.search-box') : element;
      const style = getComputedStyle(owner);
      const rect = owner.getBoundingClientRect();
      const x = Math.max(0, Math.floor(rect.left) - margin);
      const y = Math.max(0, Math.floor(rect.top) - margin);
      return {
        label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 40) || element.id || element.tagName,
        inMenu: Boolean(element.closest('.filter-menu')),
        ring: { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor },
        clip: { x, y, width: Math.ceil(rect.right) + margin - x, height: Math.ceil(rect.bottom) + margin - y }
      };
    }, MARGIN);
    if (!stop) break;
    stops.push({ ...stop, focused: await page.screenshot({ clip: stop.clip }) });
  }
  // Le même voisinage sans le focus : la différence est l'indicateur de focus.
  await page.evaluate(() => document.activeElement?.blur());
  for (const stop of stops) stop.rest = await page.screenshot({ clip: stop.clip });
  return stops;
}

function assertFocusRings(stops, expectedLabels) {
  for (const label of expectedLabels) {
    assert.ok(stops.some(stop => stop.label.includes(label)), `« ${label} » doit être atteint à la tabulation`);
  }
  for (const stop of stops) {
    assert.ok(!stop.focused.equals(stop.rest), `${stop.label} : rien n’indique le focus à l’écran`);
    assert.equal(stop.ring.style, 'solid', `${stop.label} : anneau plein`);
    assert.ok(stop.ring.width >= 2, `${stop.label} : anneau d’au moins 2 px (${stop.ring.width} px)`);
    // 3:1 au moins contre le fond le plus sombre où il se pose (le dégradé violet pâle de la page).
    const ratio = contrastRatio(parseColor(stop.ring.color), '#ebe9ff');
    assert.ok(ratio >= 3, `${stop.label} : anneau de contraste ${ratio.toFixed(2)}:1 au lieu de 3:1`);
  }
}

test('chaque contrôle atteint à la tabulation a un anneau de focus visible et homogène (WCAG 2.4.7, 1.4.11)', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2400 });
    await waitForCards(page, 4);
    const stops = await tabStops(page);
    assert.ok(stops.length >= 15, `au moins 15 arrêts de tabulation (${stops.length})`);
    assertFocusRings(stops, ['Rechercher par nom ou prénom', 'Actions', 'Fondateurs', 'Réinitialiser', 'CME', 'Modifier mon profil']);
  });
});

test('le menu ouvert a aussi un anneau de focus visible : recherche, cases et flèches de détail', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2400 });
    await waitForCards(page, 4);
    await page.locator('.filter-button', { hasText: 'Compétences' }).click();
    await page.locator('.filter.open .group-toggle').first().click();
    const stops = (await tabStops(page, { limit: 12, from: '.filter.open .filter-button' })).filter(stop => stop.inMenu);
    assert.ok(stops.length >= 5, `la recherche, des cases de domaine et de compétence, des flèches (${stops.length})`);
    assertFocusRings(stops, ['Rechercher dans Compétences', 'Détail de']);
  });
});

// Le texte d'un élément de la page rendue : sa couleur, et le premier fond opaque qui le porte
// (le sien, ou celui de la carte). C'est ce que voit la personne, après les règles de style et
// les couleurs posées par render.js.
const renderedText = (page, selector) => page.locator(selector).evaluateAll(elements => elements.map(element => {
  const style = getComputedStyle(element);
  let background = style.backgroundColor;
  for (let node = element.parentElement; node && /^(rgba\(.*, 0\)|transparent)$/.test(background); node = node.parentElement) {
    background = getComputedStyle(node).backgroundColor;
  }
  return { label: element.textContent.trim(), classes: element.className, color: style.color, background, size: style.fontSize };
}));

test('pastilles, titres de groupe et lien e-mail d’une carte gardent 4,5:1 sur la page rendue (WCAG 1.4.3)', { skip }, async () => {
  const tables = sampleTables();
  // Ana porte une pastille de chaque catégorie : GT et Tâches sont vides dans le jeu de base.
  tables.BDD.GT[0] = ['L', 1];
  tables.BDD.Taches[0] = ['L', 1];
  await withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    const pills = await renderedText(page, '.contact-card .tag');
    const titles = await renderedText(page, '.contact-card .tag-group-title');
    const links = await renderedText(page, '.contact-card a.email');
    const categories = new Set(pills.map(pill => /\btag-(\w+)/.exec(pill.classes)?.[1]));
    for (const key of ['actions', 'communautes', 'gt', 'instances', 'taches']) {
      assert.ok(categories.has(key), `une pastille « ${key} » est mesurée (sinon le test ne prouve rien pour elle)`);
    }
    assert.ok(titles.length >= 7 && links.length >= 1, `titres et liens mesurés (${titles.length}, ${links.length})`);
    const tooPale = [...pills, ...titles, ...links]
      .map(item => ({ ...item, ratio: contrastRatio(parseColor(item.color), parseColor(item.background)) }))
      .filter(item => item.ratio < MIN_TEXT_CONTRAST)
      .map(item => `${item.classes} « ${item.label} » ${item.size} : ${item.ratio.toFixed(2)}:1`);
    assert.deepEqual(tooPale, []);
  });
});
