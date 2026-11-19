// Le bandeau « Ma présence » garde sa place (1.35.0, audit UI/UX U50). La personne connectée n'est connue qu'après une écriture dans la
// table-sonde ; quand elle arrivait après les cartes, le bandeau les repoussait (jusqu'à 172 px sur un téléphone). Il leur réservait donc sa
// place dès le départ avec une copie grisée de lui-même (account-ui.js). Depuis la 1.45.2 l'annuaire est fermé tant que l'identité n'est pas
// lue : les cartes et le bandeau arrivent ensemble, et la copie grisée ne se montre plus sous l'écran d'attente (gate.js).
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

test('l\'annuaire est fermé tant que l\'identité n\'est pas lue : ni carte, ni bandeau, ni place réservée ; puis la carte et le bandeau arrivent ensemble et rien ne bouge (audit U50)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, delay: SLOW_PROBE, contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await page.locator('#gatePanel[data-kind="checking"]').waitFor();
    const waiting = await placeOfBar(page);
    assert.deepEqual({ real: waiting.real, room: waiting.room, top: waiting.top }, { real: 0, room: 0, top: null }, 'sous « Vérification de votre accès » : aucune carte, aucun bandeau, aucune copie grisée');
    await barArrived(page);
    await waitForCards(page, 4);
    const arrived = await placeOfBar(page);
    assert.ok(arrived.real >= 70, 'le vrai bandeau est là');
    assert.equal(arrived.room, 0);
    await page.waitForTimeout(400);
    assert.deepEqual(await placeOfBar(page), arrived, 'et rien ne bouge ensuite');
  }));

test('pendant l\'attente, un lecteur d\'écran ne trouve ni interrupteur ni région « Ma présence » ; le bandeau arrivé n\'est jamais en double (audit U50)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, delay: SLOW_PROBE }, async ({ page }) => {
    await page.locator('#gatePanel[data-kind="checking"]').waitFor();
    const tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'switch', 'Apparaître dans l\'annuaire'), undefined, 'pas d\'interrupteur');
    assert.equal(accessibleNode(tree, 'button', 'Modifier mon profil'), undefined, 'ni son bouton');
    assert.equal(tree.filter(node => node.role === 'region' && /présence/i.test(node.name)).length, 0, 'ni une région « Ma présence » : le vrai bandeau n\'est pas encore là');

    await barArrived(page);
    const after = await accessibilityTree(page);
    assert.equal(after.filter(node => node.role === 'switch').length, 1, 'une fois le bandeau arrivé, un seul interrupteur');
    assert.equal(after.filter(node => node.role === 'region' && /présence/i.test(node.name)).length, 1, 'et une seule région « Ma présence »');
  }));

test('un compte Lecteur n\'a jamais de bandeau et lit « Compte en lecture seule » : rien n\'est réservé, rien ne s\'affiche puis disparaît', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, readOnly: true, delay: SLOW_PROBE, contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await page.locator('#gatePanel[data-kind="readonly"]').waitFor();
    const before = await placeOfBar(page);
    assert.deepEqual({ real: before.real, room: before.room, top: before.top }, { real: 0, room: 0, top: null }, 'ni bandeau ni copie, ni carte');
    await page.waitForTimeout(400);
    assert.deepEqual(await placeOfBar(page), before, 'et rien ne bouge ensuite');
  }));

test('si personne n\'est identifié, la place réservée est rendue (audit U50), le bandeau ne paraît pas et l\'annuaire reste fermé', { skip }, () =>
  withWidget({ tables: sampleTables(), user: null, delay: 700, contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await page.locator('#gatePanel[data-kind="unidentified"]').waitFor();
    const settled = await placeOfBar(page);
    assert.deepEqual({ real: settled.real, room: settled.room, top: settled.top }, { real: 0, room: 0, top: null }, 'compte non reconnu : pas de bandeau, pas de place gardée, pas de carte');
  }));

test('si l\'annuaire ne se charge pas, la place du bandeau n\'est pas gardée sous le message d\'erreur (audit U50)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANA_EMAIL, failTables: ['BDD'], contextOptions: VIEWPORT(390) }, async ({ page }) => {
    await waitForBanner(page);
    await page.waitForTimeout(300); // l'identité, lue à part, a le temps d'arriver
    const settled = await placeOfBar(page);
    assert.deepEqual({ real: settled.real, room: settled.room }, { real: 0, room: 0 });
  }));
