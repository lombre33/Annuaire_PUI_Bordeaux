// Test navigateur du rôle dans une tâche : charge le vrai index.html dans Chromium, avec le faux document
// Grist de tests/support/fake-grist.js, et vérifie ce que voient la souris, le clavier et le toucher.
//
// Avec withTaskRoles (tests/support/task-role-tables.mjs), cartes par défaut :
//   Ana    1.1 Relecture  → « Rôle : Pilote »
//   Hugo   1.1 Relecture  → « Rôles : Contributeur, Observateur » (deux lignes brutes sous la même étiquette)
//   Gina   2.1 Inspection → aucun rôle, donc aucune bulle
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTaskRoles } from './support/task-role-tables.mjs';
import { gridCard, skip, waitForCards, withWidget } from './support/browser.mjs';

const taskOf = (page, name) => gridCard(page, name).locator('.tag-taches');
const tip = page => page.locator('.tag-tip');
const tipShown = page => page.waitForFunction(() => !document.querySelector('.tag-tip').hidden);
const tipGone = page => page.waitForFunction(() => document.querySelector('.tag-tip').hidden);

// Hugo porte deux lignes brutes de la même tâche : l'étiquette dit leurs deux rôles.
function tables() {
  const copy = withTaskRoles();
  copy.BDD.Taches[9] = ['L', 2, 3];
  return copy;
}

const geometry = locator => locator.evaluate(element => {
  const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
});

test('une étiquette de tâche écrit le rôle de la personne, lu sur ses propres lignes, et rien quand il n\'y en a pas', { skip }, () =>
  withWidget({ tables: tables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await taskOf(page, 'Ana').locator('.tag-note').textContent(), 'Rôle : Pilote');
    assert.equal(await taskOf(page, 'Hugo').locator('.tag-note').textContent(), 'Rôles : Contributeur, Observateur');
    assert.equal(await taskOf(page, 'Gina').locator('.tag-note').count(), 0, 'pas de rôle : pas de note');
    assert.equal(await taskOf(page, 'Gina').textContent(), '2.1 Inspection', 'l\'étiquette d\'une tâche sans rôle ne change pas');
    assert.equal(await taskOf(page, 'Gina').evaluate(tag => tag.classList.contains('has-note')), false);
    // Un lecteur d'écran lit le rôle avec la tâche ; à l'écran il reste hors de vue (une case de 1 px) tant qu'on ne survole pas.
    assert.equal(await gridCard(page, 'Ana').getByRole('button', { name: '1.1 Relecture Rôle : Pilote' }).count(), 1);
    const note = await geometry(taskOf(page, 'Ana').locator('.tag-note'));
    assert.ok(note.width <= 1 && note.height <= 1, 'la note n\'est pas visible à l\'écran');
    assert.equal(await tip(page).count(), 1);
    assert.equal(await tip(page).isHidden(), true, 'la bulle est fermée au départ');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la souris sur la tâche ouvre une bulle au-dessus qui dit le rôle, et la referme en la quittant', { skip }, () =>
  withWidget({ tables: tables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const tag = taskOf(page, 'Ana');
    await tag.hover();
    await tipShown(page);
    assert.equal(await tip(page).textContent(), 'Rôle : Pilote');
    const bubble = await geometry(tip(page));
    const label = await tag.evaluate(element => {
      const { left, top, width } = element.getBoundingClientRect();
      return { left, top, width };
    });
    assert.ok(bubble.bottom <= label.top, 'la bulle est au-dessus de l\'étiquette');
    assert.ok(bubble.left >= 0 && bubble.right <= (await page.evaluate(() => innerWidth)), 'la bulle reste dans le cadre');
    assert.equal(await tip(page).getAttribute('aria-hidden'), 'true', 'le lecteur d\'écran a déjà lu le rôle avec la tâche');

    await taskOf(page, 'Hugo').hover();
    await page.waitForFunction(() => document.querySelector('.tag-tip').textContent === 'Rôles : Contributeur, Observateur');
    await page.mouse.move(0, 0);
    await tipGone(page);
    await taskOf(page, 'Gina').hover();
    await page.waitForTimeout(250);
    assert.equal(await tip(page).isHidden(), true, 'une tâche sans rôle n\'ouvre aucune bulle');
  }));

test('le clavier sur la tâche ouvre la même bulle, Échap la ferme sans quitter l\'étiquette, et une recherche qui redessine les cartes l\'efface', { skip }, () =>
  withWidget({ tables: tables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const tag = taskOf(page, 'Ana');
    await tag.focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await tip(page).isHidden(), true, 'ailleurs, pas de bulle');
    await page.keyboard.press('Tab');
    assert.equal(await tag.evaluate(element => element === document.activeElement), true);
    await tipShown(page);
    assert.equal(await tip(page).textContent(), 'Rôle : Pilote');

    await page.keyboard.press('Escape');
    await tipGone(page);
    assert.equal(await tag.evaluate(element => element === document.activeElement), true, 'le focus reste sur la tâche');

    await tag.hover();
    await tipShown(page);
    await page.fill('#searchInput', 'Martin');
    await waitForCards(page, 1);
    await tipGone(page);
  }));

test('sur un écran tactile, sans survol, le rôle s\'écrit sous le nom de la tâche et aucune bulle ne s\'ouvre', { skip }, () =>
  withWidget({ tables: tables(), contextOptions: { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } } }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.evaluate(() => matchMedia('(hover: none)').matches), true);
    const tag = taskOf(page, 'Ana');
    const box = await tag.evaluate(element => {
      const note = element.querySelector('.tag-note').getBoundingClientRect();
      const label = element.getBoundingClientRect();
      return { noteTop: note.top, noteHeight: note.height, noteWidth: note.width, top: label.top, bottom: label.bottom, left: label.left, right: label.right, noteLeft: note.left, noteRight: note.right };
    });
    assert.ok(box.noteHeight >= 12 && box.noteWidth > 40, 'le rôle est écrit, pas caché');
    assert.ok(box.noteTop >= box.top + 14, 'sous la première ligne de l\'étiquette');
    assert.ok(box.noteLeft >= box.left && box.noteRight <= box.right && box.noteTop + box.noteHeight <= box.bottom, 'et dans l\'étiquette');
    await tag.hover();
    await page.waitForTimeout(250);
    assert.equal(await tip(page).isHidden(), true);
    assert.equal(await taskOf(page, 'Gina').locator('.tag-note').count(), 0);
  }));

test('une tâche qui porte le nom d\'une propriété d\'objet (« constructor ») s\'écrit comme les autres, sans rôle ni erreur', { skip }, () => {
  const copy = tables();
  copy.Taches.Taches_corrige[3] = 'constructor'; // la tâche de Gina, qui n\'a pas de rôle
  return withWidget({ tables: copy }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await taskOf(page, 'Gina').textContent(), 'constructor');
    assert.equal(await taskOf(page, 'Gina').locator('.tag-note').count(), 0, 'pas de rôle : pas de note');
    assert.equal(await taskOf(page, 'Ana').locator('.tag-note').textContent(), 'Rôle : Pilote', 'les autres cartes gardent leur rôle');
    assert.deepEqual(await Promise.all(logs.errors), []);
  });
});
