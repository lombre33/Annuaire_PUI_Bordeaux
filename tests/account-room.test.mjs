// Le bandeau « Ma présence » garde sa place (1.35.0, audit UI/UX U50). La personne connectée n'est connue qu'après une écriture dans la
// table-sonde ; quand elle arrive après les cartes, le bandeau les repoussait (jusqu'à 172 px sur un téléphone). Il leur réserve
// maintenant sa place dès le départ avec une copie grisée de lui-même (account-ui.js). Chaque test échoue sur le code de la 1.34.0, sauf les
// gardes qui disent ce qui ne change pas (un compte Lecteur n'a jamais de bandeau, donc rien à réserver).
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md). La sonde est ralentie (`delay`) : l'identité arrive
// bien après les cartes, comme dans un Grist lent.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { sampleTables, ANA_EMAIL } from './fixtures.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { skip, waitForBanner, waitForCards, withWidget } from './support/browser.mjs';

const SLOW_PROBE = 2500;
const WIDTHS = [320, 390, 600, 860, 1024, 1280];
const VIEWPORT = width => ({ viewport: { width, height: 900 } });

// Ce que la page montre du bandeau : le vrai (#accountBar) ou la copie grisée qui garde sa place, leur hauteur (0 : pas à l'écran), et
// où est la première carte.
const placeOfBar = page => page.evaluate(() => {
  const height = element => (element && !element.hidden ? Math.round(element.getBoundingClientRect().height) : 0);
  const card = document.querySelector('.contact-card');
  return {
    real: height(document.getElementById('accountBar')),
    room: height(document.querySelector('.account-bar[data-pending]')),
    top: card ? Math.round(card.getBoundingClientRect().top + window.scrollY) : null,
    copies: document.querySelectorAll('.account-bar').length
  };
});

const barArrived = page => page.waitForFunction(() => !document.getElementById('accountBar').hidden);
const resizeTo = (page, width) => page.setViewportSize({ width, height: 900 });

test('la première carte ne bouge pas quand le bandeau arrive après elle, à toutes les largeurs (audit U50)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, delay: SLOW_PROBE, contextOptions: VIEWPORT(1280) }, async ({ page }) => {
    await waitForCards(page, 4);
    const waiting = {};
    for (const width of WIDTHS) {
      await resizeTo(page, width);
      waiting[width] = await placeOfBar(page);
      assert.equal(waiting[width].real, 0, `${width} px : le vrai bandeau n'est pas encore là`);
      assert.ok(waiting[width].room >= 70, `${width} px : la copie grisée tient la place (${waiting[width].room} px)`);
    }
    await barArrived(page);
    for (const width of WIDTHS) {
      await resizeTo(page, width);
      const arrived = await placeOfBar(page);
      assert.equal(arrived.room, 0, `${width} px : la copie a disparu`);
      assert.equal(arrived.real, waiting[width].room, `${width} px : la copie a la hauteur du vrai bandeau`);
      assert.equal(arrived.top, waiting[width].top, `${width} px : la première carte est restée où elle était`);
    }
  }));

test('la copie qui garde la place n\'est ni lue ni atteignable, et le bandeau n\'est jamais en double (audit U50)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, delay: SLOW_PROBE }, async ({ page }) => {
    await waitForCards(page, 4);
    const room = await page.evaluate(() => {
      const copy = document.querySelector('.account-bar[data-pending]');
      return {
        id: copy.id,
        hiddenFromReaders: copy.getAttribute('aria-hidden'),
        label: copy.getAttribute('aria-label'),
        inert: copy.inert,
        reachable: [...copy.querySelectorAll('button')].filter(button => { button.focus(); return document.activeElement === button; }).length,
        text: copy.textContent.trim()
      };
    });
    assert.deepEqual({ ...room, text: '' }, { id: '', hiddenFromReaders: 'true', label: null, inert: true, reachable: 0, text: '' });

    const tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'switch', 'Apparaître dans l\'annuaire'), undefined, 'un lecteur d\'écran ne voit pas l\'interrupteur de la copie');
    assert.equal(accessibleNode(tree, 'button', 'Modifier mon profil'), undefined, 'ni son bouton');
    assert.equal(tree.filter(node => node.role === 'region' && /présence/i.test(node.name)).length, 0, 'ni une région « Ma présence » : le vrai bandeau n\'est pas encore là');

    await barArrived(page);
    const after = await accessibilityTree(page);
    assert.equal(after.filter(node => node.role === 'switch').length, 1, 'une fois le bandeau arrivé, un seul interrupteur');
    assert.equal(after.filter(node => node.role === 'region' && /présence/i.test(node.name)).length, 1, 'et une seule région « Ma présence »');
  }));

test('un compte Lecteur n\'a jamais de bandeau : rien n\'est réservé, rien ne s\'affiche puis disparaît (garde)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, readOnly: true, delay: SLOW_PROBE, contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await waitForCards(page, 4);
    const before = await placeOfBar(page);
    assert.deepEqual({ real: before.real, room: before.room, copies: before.copies }, { real: 0, room: 0, copies: 1 }, 'ni bandeau ni copie');
    await page.waitForTimeout(400);
    assert.deepEqual(await placeOfBar(page), before, 'et rien ne bouge ensuite');
  }));

test('si personne n\'est identifié, la place réservée est rendue (audit U50) et le bandeau ne paraît pas', { skip }, () =>
  withWidget({ tables: sampleTables(), user: null, delay: 700, contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await waitForCards(page, 4);
    const waiting = await placeOfBar(page);
    assert.ok(waiting.room > 0, 'en attendant l\'identité, la place est tenue');
    await page.waitForFunction(() => document.querySelector('.account-bar[data-pending]').hidden);
    const settled = await placeOfBar(page);
    assert.deepEqual({ real: settled.real, room: settled.room }, { real: 0, room: 0 }, 'compte anonyme : pas de bandeau, pas de place gardée');
  }));

test('si l\'annuaire ne se charge pas, la place du bandeau n\'est pas gardée sous le message d\'erreur (audit U50)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, failTables: ['BDD'], contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await waitForBanner(page);
    await page.waitForTimeout(300); // l'identité, lue à part, a le temps d'arriver
    const settled = await placeOfBar(page);
    assert.deepEqual({ real: settled.real, room: settled.room }, { real: 0, room: 0 });
  }));
