// Ce que la page annonce et ce qu'elle montre avant que l'annuaire soit là (1.30.0, audit UI/UX U18, U28 et U29) : une seule zone
// vivante, le compteur ; « Chargement… » tant que Grist n'a pas répondu ; une phrase quand le script de l'API de Grist ne se
// charge pas. Chaque test échoue sur le code de la 1.29.3.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md). `holdReads` retient les lectures de Grist
// jusqu'à `window.__releaseReads()` ; `apiBlocked` empêche le script de l'API de se charger (tests/support/harness.mjs).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { SEARCH_DELAY_MS } from '../constants.js';
import { sampleTables } from './fixtures.mjs';
import { accessibilityTree } from './support/accessibility-tree.mjs';
import { bannerText, resultCount, skip, waitForBanner, waitForCards, withWidget } from './support/browser.mjs';

// L'état de la page que ces tests lisent : le compteur, la grille (occupée ?), « Aucun contact trouvé » et le bandeau d'état.
const pageState = page => page.evaluate(() => ({
  counter: document.getElementById('resultCount').textContent,
  busy: document.getElementById('cardsGrid').getAttribute('aria-busy'),
  cards: document.querySelectorAll('.contact-card').length,
  emptyShown: !document.getElementById('emptyState').hidden,
  bannerShown: !document.getElementById('statusBanner').hidden
}));

// ===== U18 : une seule zone vivante =====

test('le compteur de contacts est la seule zone vivante : la grille ne l\'est plus, et le compteur donne le résultat d\'une recherche (audit U18)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await page.evaluate(() => ({
      gridLive: document.getElementById('cardsGrid').hasAttribute('aria-live'),
      counterRole: document.getElementById('resultCount').getAttribute('role')
    })), { gridLive: false, counterRole: 'status' });

    // Ce que le navigateur annonce : toute zone vivante de la page est un « status » (le compteur, le message de confirmation) ;
    // une grille vivante annoncerait chaque carte à chaque recherche.
    const live = (await accessibilityTree(page)).filter(node => node.live && node.live !== 'off');
    assert.ok(live.length >= 1, 'le compteur est une zone vivante');
    assert.deepEqual([...new Set(live.map(node => node.role))], ['status']);

    await page.getByRole('searchbox').fill('Ana');
    await waitForCards(page, 1);
    assert.equal(await resultCount(page), '1 sur 4 contacts', 'la zone vivante dit le résultat, et ce que la recherche écarte');
  }));

// ===== U28 : l'état de chargement =====

test('tant que Grist n\'a pas répondu, la page dit « Vérification… » (écran d\'attente, occupé) et rien d\'autre : ni recherche ni carte ; l\'annuaire s\'ouvre à l\'arrivée de la lecture (audit U28)', { skip }, () =>
  withWidget({ tables: sampleTables(), holdReads: true }, async ({ page }) => {
    assert.deepEqual(await pageState(page), { counter: 'Vérification…', busy: null, cards: 0, emptyShown: false, bannerShown: false });
    // Fermé par défaut (1.45.2) : l'attente est l'écran « Vérification de votre accès », que le navigateur annonce occupé, et la recherche n'est pas proposée.
    assert.deepEqual(await page.evaluate(() => ({ kind: document.getElementById('gatePanel').dataset.kind, busy: document.getElementById('gatePanel').getAttribute('aria-busy') })),
      { kind: 'checking', busy: 'true' });
    assert.equal(await page.getByRole('searchbox').count(), 0, 'la recherche n\'est pas proposée tant que l\'annuaire est fermé');

    await page.evaluate(() => window.__releaseReads());
    await waitForCards(page, 4);
    assert.deepEqual(await pageState(page), { counter: '4 contacts', busy: null, cards: 4, emptyShown: false, bannerShown: false });
    assert.equal(await page.getByRole('searchbox').count(), 1);
  }));

test('si la première lecture de Grist échoue, la page le dit au lieu de rester en attente, et ne se fait pas passer pour un annuaire vide (audit U28)', { skip }, () =>
  withWidget({ tables: sampleTables(), failTables: ['BDD'] }, async ({ page }) => {
    await waitForBanner(page);
    assert.deepEqual(await pageState(page), { counter: 'Chargement impossible', busy: null, cards: 0, emptyShown: false, bannerShown: true });
    assert.match(await bannerText(page), /Impossible de charger l'annuaire depuis Grist/);
    assert.equal(await page.getByRole('searchbox').count(), 0, 'pas de recherche à taper : « Aucun contact trouvé » ne paraît pas sous le message d\'erreur');
    await page.waitForTimeout(SEARCH_DELAY_MS + 300);
    assert.deepEqual(await pageState(page), { counter: 'Chargement impossible', busy: null, cards: 0, emptyShown: false, bannerShown: true });
  }));

// ===== U29 : le script de l'API de Grist ne se charge pas =====

test('si le script de l\'API de Grist ne se charge pas, la page dit pourquoi et ce qu\'on peut faire, au lieu de rester sur un compteur vide (audit U29)', { skip }, () =>
  withWidget({ tables: sampleTables(), apiBlocked: true }, async ({ page, logs }) => {
    await waitForBanner(page);
    assert.deepEqual(await pageState(page), { counter: 'Chargement impossible', busy: null, cards: 0, emptyShown: false, bannerShown: true });
    const banner = await bannerText(page);
    assert.match(banner, /Impossible de joindre Grist/);
    assert.match(banner, /docs\.getgrist\.com/, 'le message nomme le script qui manque');
    assert.match(banner, /recharge/i, 'et dit quoi faire');
    assert.equal(await page.locator('#statusBanner .status-text').getAttribute('role'), 'alert', 'le message est annoncé tout de suite');
    // La console garde la cause, une seule fois : le widget s'arrête là, sans enchaîner d'autres erreurs.
    assert.deepEqual(logs.pageErrors, ['[GRIST] window.grist est absent : le script de l\'API de Grist (docs.getgrist.com) ne s\'est pas chargé.']);
  }));
