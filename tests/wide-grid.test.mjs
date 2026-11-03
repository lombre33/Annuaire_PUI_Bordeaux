// Les grands écrans montrent plus de cartes (1.36.0, audit UI/UX U12). Jusque-là la page s'arrêtait à 1 480 px et la grille à 3 colonnes
// de 484 px : à 1 920 px, 220 px de marge de chaque côté ; à 2 560 px, 540 px. À partir de 1 670 px la page s'élargit jusqu'à 2 200 px et
// la grille compte autant de colonnes que de cartes de 390 px (la largeur d'une carte à 1 280 px) y tiennent : 4, puis 5. En dessous
// de 1 670 px rien ne change.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md), avec les barres de défilement que le cadre de
// Grist retire à la largeur utile (15 px : le cas le plus serré, tests/support/layout.mjs).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { crowdedTables } from './fixtures-responsive.mjs';
import { assertNoHorizontalOverflow, atEachWidth, layoutWidgets, skip } from './support/layout.mjs';

const { withWidget } = layoutWidgets({
  tables: () => crowdedTables(40),
  ready: page => page.waitForFunction(() => document.querySelectorAll('.contact-card').length >= 10)
});

const MIN_CARD = 390;
const OLD_SHELL = 1480;
const NEW_SHELL = 2200;

const gridAt = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#cardsGrid .contact-card')];
  const widths = cards.map(card => card.getBoundingClientRect().width);
  return {
    cards: cards.length,
    columns: new Set(cards.map(card => Math.round(card.getBoundingClientRect().left))).size,
    narrowest: Math.min(...widths),
    widest: Math.max(...widths),
    shell: document.querySelector('.widget-shell').getBoundingClientRect().width
  };
});

test('jusqu\'à 1 669 px, la grille garde ses trois colonnes de 484 px au plus et la page ses 1 480 px (garde)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [1024, 1280, 1400, 1480, 1600, 1669], async width => {
      const grid = await gridAt(page);
      assert.equal(grid.columns, 3, `${width} px`);
      assert.ok(grid.shell <= OLD_SHELL, `${width} px : page de ${grid.shell} px`);
      assert.ok(grid.widest <= 485, `${width} px : carte de ${grid.widest.toFixed(0)} px`);
    });
  }));

test('au-delà de 1 670 px la grille passe à 4 colonnes, puis à 5, de cartes de 390 px au moins et pas plus larges qu\'avant', { skip }, () =>
  withWidget({}, async ({ page }) => {
    // Largeur du cadre, colonnes attendues : 4 cartes de 390 px tiennent à 1 685 px (barre de défilement comprise), 5 à 2 090 px.
    const expected = [[1700, 4], [1920, 4], [2060, 4], [2100, 5], [2560, 5], [3440, 5]];
    await atEachWidth(page, expected.map(([width]) => width), async width => {
      const grid = await gridAt(page);
      const [, columns] = expected.find(([wanted]) => wanted === width);
      assert.ok(grid.cards >= 10, `${width} px : assez de cartes pour remplir les colonnes (${grid.cards})`);
      assert.equal(grid.columns, columns, `${width} px`);
      assert.ok(grid.narrowest >= MIN_CARD - 0.5, `${width} px : carte de ${grid.narrowest.toFixed(1)} px, ${MIN_CARD} px au moins`);
      assert.ok(grid.widest <= 520, `${width} px : carte de ${grid.widest.toFixed(1)} px, plus large que les 484 px d'avant`);
      assert.ok(grid.shell <= NEW_SHELL + 0.5, `${width} px : page de ${grid.shell} px, ${NEW_SHELL} px au plus (la page ne s'étire pas à l'infini)`);
    });
  }));

test('de 1 670 px à 3 440 px, rien ne dépasse du cadre et la page garde ses marges', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [1670, 1684, 1685, 1920, 2560, 3440], async width => {
      await assertNoHorizontalOverflow(page, width);
      const { shell } = await gridAt(page);
      assert.ok(shell < width, `${width} px : la page (${shell} px) laisse ses marges`);
    });
  }));
