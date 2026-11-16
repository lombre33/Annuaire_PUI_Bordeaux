// Ce qu'un lecteur d'écran entend d'une carte de contact (1.33.0, audit UI/UX U23 et U24) : un article nommé par la personne, des
// groupes de pastilles nommés et non des titres, une grille nommée, et aucun glyphe décoratif dans les noms. Chaque test échoue sur
// le code de la 1.32.0.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md) et lisent l'arbre d'accessibilité que le
// navigateur calcule (tests/support/accessibility-tree.mjs).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { DEFAULT_CARD_NAMES, sampleTables } from './fixtures.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';

// ===== U23 : le plan de la page et les repères =====

test('chaque carte est un article nommé par la personne, la grille est une zone nommée « Contacts » (audit U23)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const tree = await accessibilityTree(page);
    assert.deepEqual(tree.filter(node => node.role === 'article').map(node => node.name), DEFAULT_CARD_NAMES,
      'un article par carte, nommé par la personne');
    assert.ok(accessibleNode(tree, 'region', 'Contacts'), 'la grille est un repère nommé, où mène le lien « Aller aux résultats »');
  }));

test('les identifiants qui nomment les cartes sont uniques et chaque carte pointe sur son propre nom', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const cards = await page.evaluate(() => [...document.querySelectorAll('.contact-card')].map(card => ({
      labelledby: card.getAttribute('aria-labelledby'),
      ownName: card.querySelector('.name').id
    })));
    assert.ok(cards.every(card => card.labelledby && card.labelledby === card.ownName), 'chaque carte pointe sur son propre nom');
    assert.equal(new Set(cards.map(card => card.ownName)).size, cards.length, 'aucun identifiant en double');
  }));

test('une carte n\'ajoute aucun titre au plan de la page : ses groupes de pastilles sont des groupes nommés (audit U23)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const tree = await accessibilityTree(page);
    const headings = tree.filter(node => node.role === 'heading');
    assert.deepEqual([...new Set(headings.map(node => node.level))].sort(), [1, 2],
      'un titre de niveau 1, puis le nom de chaque carte (niveau 2) : plus de niveau 3');
    assert.equal(headings.filter(node => node.level === 2).length, 4);
    // Ana porte une pastille de quatre catégories : quatre groupes, nommés comme le titre qu'on voit à l'écran.
    const groups = await page.locator('.contact-card', { hasText: 'Ana Martin' }).evaluate(card =>
      [...card.querySelectorAll('.tag-group')].map(group => ({
        role: group.getAttribute('role'),
        name: group.getAttribute('aria-label'),
        title: group.querySelector('.tag-group-title').textContent,
        titleHidden: group.querySelector('.tag-group-title').getAttribute('aria-hidden')
      })));
    assert.deepEqual(groups.map(group => group.name), ['Instances', 'Actions', 'Compétences', 'Communautés']);
    assert.ok(groups.every(group => group.role === 'group' && group.name === group.title && group.titleHidden === 'true'),
      'le nom du groupe est celui du titre, que le lecteur d\'écran n\'entend pas deux fois');
    assert.ok(accessibleNode(tree, 'group', 'Compétences'), 'le navigateur expose bien des groupes nommés');
  }));

// ===== U24 : les glyphes décoratifs =====

test('le glyphe ☎ n\'entre dans aucun nom ni texte lu, et ✦ (état vide) est masqué (audit U24)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const tree = await accessibilityTree(page);
    assert.deepEqual(tree.filter(node => /[☎✦✓]/.test(node.name)).map(node => `${node.role} « ${node.name} »`), [],
      'aucun nœud de l\'arbre d\'accessibilité ne porte un glyphe dans son nom');
    assert.equal(await page.locator('.contact-card .tel .glyph').first().getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.empty-mark').getAttribute('aria-hidden'), 'true');
  }));
