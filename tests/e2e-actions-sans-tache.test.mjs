// Test navigateur des actions que la carte montre sans tâche (1.41.0) : charge le vrai index.html dans Chromium, avec le faux document Grist de
// tests/support/fake-grist.js. Retour d'Antoine du 16 novembre 2026, après le retrait de la 1.39.0 en production : « ceux qui avaient des Actions,
// la catégorie Actions a disparu » et, sous « Tâches », une pastille « [0,14,21,30] ». Comportement voulu : la macro-catégorie « Actions », les
// tâches en dessous, une ligne par numéro d'action, et pour ceux qui n'ont que des actions, les actions.
//
// Données : withHeldActions (tests/fixtures.mjs). Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { withHeldActions } from './fixtures.mjs';
import { skip, waitForCards, gridCard, withWidget } from './support/browser.mjs';
import { groupedMenu } from './support/grouped-menu.mjs';

const tasks = groupedMenu('taches');

const rowsOf = (page, name) => gridCard(page, name).locator('.tag-group[aria-label="Actions"] .tag-row')
  .evaluateAll(lines => lines.map(line => [...line.querySelectorAll('.tag')].map(tag => tag.textContent)));

test('une personne qui n\'a que des actions les voit sur sa carte, sans bouton ; celle qui a les tâches de ses actions ne voit que ses tâches', { skip }, () =>
  withWidget({ tables: withHeldActions() }, async ({ page, logs }) => {
    await waitForCards(page, 5);
    assert.deepEqual(await rowsOf(page, 'Ana Martin'), [['1.1 Relecture'], ['2.1 Inspection']], 'Ana : ses actions 1 et 2 portent le numéro de ses tâches');
    assert.deepEqual(await rowsOf(page, 'Bob Durand'), [['Action 2 : Audit']], 'Bob : aucune tâche, son action');
    assert.deepEqual(await rowsOf(page, 'Hugo Bernard'), [['Action 1 : Vaccination'], ['Veille']], 'Hugo : l\'action sans tâche de son numéro, puis la tâche sans numéro');
    // Une action sans tâche n'est pas un bouton : le menu Actions cherche des tâches, elle n'y a pas d'entrée.
    const bob = gridCard(page, 'Bob Durand').locator('.tag-group[aria-label="Actions"] .tag');
    assert.deepEqual(await bob.evaluateAll(tags => tags.map(tag => tag.tagName)), ['SPAN']);
    assert.equal(await bob.first().evaluate(tag => tag.classList.contains('tag-static')), true);
    const ana = gridCard(page, 'Ana Martin').locator('.tag-group[aria-label="Actions"] .tag');
    assert.deepEqual(await ana.evaluateAll(tags => tags.map(tag => tag.tagName)), ['BUTTON', 'BUTTON'], 'une tâche reste un bouton de filtre');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('une action sans numéro s\'affiche toujours, dans la dernière rangée, et la cellule de tâches gardée en texte se lit comme des numéros de ligne', { skip }, () =>
  withWidget({ tables: withHeldActions() }, async ({ page }) => {
    await waitForCards(page, 5);
    // Gina : BDD.Taches vaut « [0,2] » : la tâche 2 (« 1.2 Rappel vaccinal »), le 0 ignoré ; l'action « Axe Outils » n'a pas de numéro.
    assert.deepEqual(await rowsOf(page, 'Gina Bergonié'), [['1.2 Rappel vaccinal'], ['Axe Outils']]);
    const texts = await page.locator('#cardsGrid .tag').allTextContents();
    assert.equal(texts.some(text => /\[0|\b0,\s*2\b/.test(text)), false, 'jamais les numéros en pastille');
  }));

test('les actions sans tâche changent le rôle calculé et rien d\'autre : ni le filtre Actions, ni le nombre de cartes, ni la console en erreur', { skip }, () =>
  withWidget({ tables: withHeldActions() }, async ({ page, logs }) => {
    await waitForCards(page, 5);
    // « Membre d'une action » : toute personne qui a une action, tâche ou non (Bob et Hugo n'ont que des actions sans tâche de ce numéro).
    const roles = async name => gridCard(page, name).locator('.tag-group[aria-label="Rôle dans le PUI"] .tag').allTextContents();
    assert.deepEqual(await roles('Bob Durand'), ['Membre d’une action']);
    assert.deepEqual(await roles('Hugo Bernard'), ['Membre d’une action']);
    // Le filtre Actions cherche des tâches : cocher « Action 2 : Audit » ne trouve pas Bob, qui n'a que l'action (limite assumée, voir la documentation).
    await tasks.open(page);
    await tasks.box(page, 'Action 2 : Audit').check();
    await page.waitForFunction(() => document.querySelectorAll('#cardsGrid .contact-card').length === 1);
    assert.deepEqual(await page.locator('#cardsGrid .contact-card .name').allTextContents(), ['Ana Martin']);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la console dit où sont les cellules gardées en texte (identifiants de ligne, jamais un nom) et combien de cartes montrent une action sans tâche', { skip }, () =>
  withWidget({ tables: withHeldActions() }, async ({ page, logs }) => {
    await waitForCards(page, 5);
    const warnings = (await Promise.all(logs.warnings)).map(String);
    const lines = warnings.filter(line => line.startsWith('[LISTES]'));
    assert.equal(lines.length, 1, warnings.join('\n'));
    assert.match(lines[0], /BDD\.Taches : 1 cellule\(s\)/);
    assert.match(lines[0], /\[0,2\]/);
    assert.match(lines[0], /identifiants de ligne : 9\b/);
    assert.doesNotMatch(lines[0], /Bergonié|Gina|gina@/, 'jamais un nom ni une adresse');
    const infos = (await Promise.all(logs.infos)).map(String);
    assert.equal(infos.some(line => /^\[REFS\] 3 contact\(s\) affichable\(s\) ont une action/.test(line)), true, infos.join('\n'));
  }));
