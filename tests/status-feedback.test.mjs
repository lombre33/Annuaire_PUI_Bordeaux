// Le bandeau d'état et l'écran « Aucun contact » (1.35.0, audit UI/UX U30) : des messages en clair, un bouton « Réessayer » quand
// l'annuaire ne se charge pas, et un écran vide qui dit pourquoi il est vide (annuaire sans contact, interrupteurs éteints, résultats
// derrière l'autre interrupteur, recherche sans résultat). Chaque test échoue sur le code de la 1.34.0, sauf les gardes qui disent ce qui ne change pas.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md).

import { test } from 'node:test';
import assert, { plain } from './support/assert.mjs';
import { createEmptyFilterState, describeEmptyResults } from '../filters.js';
import { loadDirectory } from '../grist-data.js';
import { createFakeGrist } from './support/fake-grist.js';
import { quiet } from './support/logs.mjs';
import { sampleTables } from './fixtures.mjs';
import { resultCount, skip, waitForBanner, waitForCards, withWidget } from './support/browser.mjs';

const FOUNDERS = { fondateur: true, partenaire: false };
const PARTNERS = { fondateur: false, partenaire: true };
const BOTH = { fondateur: true, partenaire: true };
const NEITHER = { fondateur: false, partenaire: false };

const directory = async () => (await loadDirectory(createFakeGrist({ tables: sampleTables() }).docApi, { log: quiet })).contacts;
const none = createEmptyFilterState();

// ===== describeEmptyResults : la cause de l'écran vide =====

test('describeEmptyResults : un annuaire sans contact ne parle ni de recherche ni de filtres (audit U30, cas a)', async () => {
  assert.deepEqual(describeEmptyResults([], none, '', FOUNDERS),
    { title: 'Aucun contact à afficher', text: 'L\'annuaire ne contient aucun contact pour le moment.' });
  assert.deepEqual(describeEmptyResults([], none, 'zzz', NEITHER).title, 'Aucun contact à afficher', 'même avec une recherche ou les interrupteurs éteints');
});

test('describeEmptyResults : les deux interrupteurs éteints, l\'écran le dit au lieu de parler de recherche (audit U30, cas c)', async () => {
  const view = describeEmptyResults(await directory(), none, '', NEITHER);
  assert.deepEqual(view, {
    title: 'Aucun contact affiché',
    text: 'Ni « Fondateurs » ni « Partenaires » n\'est activé : activez-en un pour voir des contacts.'
  });
});

test('describeEmptyResults : des résultats derrière l\'autre interrupteur, l\'écran dit lequel activer et combien (audit U30)', async () => {
  const contacts = await directory();
  assert.deepEqual(describeEmptyResults(contacts, none, 'bob', FOUNDERS), {
    title: 'Aucun contact trouvé',
    text: 'Parmi les fondateurs, aucun contact ne correspond. Activez « Partenaires » pour voir 1 résultat.'
  });
  // Dans l'autre sens, et au pluriel : sans recherche, les quatre fondateurs sont derrière « Fondateurs ».
  assert.deepEqual(describeEmptyResults(contacts, none, '', PARTNERS), {
    title: 'Aucun contact trouvé',
    text: 'Parmi les partenaires, aucun contact ne correspond. Activez « Fondateurs » pour voir 5 résultats.'
  });
});

test('describeEmptyResults : une recherche qui ne donne rien, même avec les deux interrupteurs, garde la phrase d\'avant (garde)', async () => {
  const contacts = await directory();
  const expected = { title: 'Aucun contact trouvé', text: 'Modifiez votre recherche ou réinitialisez les filtres.' };
  assert.deepEqual(describeEmptyResults(contacts, none, 'zzzzz', BOTH), expected);
  assert.deepEqual(describeEmptyResults(contacts, none, 'zzzzz', FOUNDERS), expected, 'rien non plus derrière l\'autre interrupteur');
});

// ===== Dans la page =====

const emptyView = page => page.evaluate(() => ({
  shown: !document.getElementById('emptyState').hidden,
  title: document.querySelector('#emptyState .empty-title').textContent,
  text: document.querySelector('#emptyState .empty-text').textContent
}));
const scopeButton = (page, scope) => page.locator(`.scope-btn[data-scope="${scope}"]`);
const search = async (page, term) => { await page.fill('#searchInput', term); };
const banner = page => ({
  text: page.locator('#statusBanner .status-text'),
  button: page.locator('#statusBanner .status-action')
});

test('personne n\'a accepté d\'apparaître : le bandeau et l\'écran vide disent la même chose, sans « Modifiez votre recherche » (audit U30, cas a)', { skip }, () => {
  const tables = sampleTables();
  tables.BDD.Accepte_apparaitre = tables.BDD.Accepte_apparaitre.map(() => false);
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForBanner(page);
    assert.equal(await banner(page).text.textContent(), 'Personne n\'a encore accepté d\'apparaître dans l\'annuaire.');
    assert.equal(await banner(page).button.isHidden(), true, 'rien à réessayer : les données sont lues');
    assert.deepEqual(await emptyView(page), { shown: true, title: 'Aucun contact à afficher', text: 'L\'annuaire ne contient aucun contact pour le moment.' });
    assert.ok((await Promise.all(logs.warnings)).some(line => /^\[GRIST\] Personne n'a accepté d'apparaître : Accepte_apparaitre/.test(plain(line))),
      'le nom de la colonne et le geste sont dans la console');
  });
});

test('les deux interrupteurs éteints : l\'écran vide dit d\'en activer un, et « Réinitialiser » ne prétend pas y changer quelque chose (audit U30, cas c)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await scopeButton(page, 'fondateur').click();
    await page.waitForFunction(() => !document.getElementById('emptyState').hidden);
    assert.deepEqual(await emptyView(page), {
      shown: true,
      title: 'Aucun contact affiché',
      text: 'Ni « Fondateurs » ni « Partenaires » n\'est activé : activez-en un pour voir des contacts.'
    });
    assert.equal(await page.locator('#resetFilters').getAttribute('aria-disabled'), 'true', 'rien à réinitialiser : ni recherche ni filtre');
    await scopeButton(page, 'partenaire').click();
    await waitForCards(page, 1);
    assert.equal((await emptyView(page)).shown, false);
  }));

test('une recherche qui n\'aboutit que chez les partenaires : l\'écran vide dit d\'activer « Partenaires » (audit U30)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await search(page, 'bob');
    await page.waitForFunction(() => !document.getElementById('emptyState').hidden);
    assert.deepEqual(await emptyView(page), {
      shown: true,
      title: 'Aucun contact trouvé',
      text: 'Parmi les fondateurs, aucun contact ne correspond. Activez « Partenaires » pour voir 1 résultat.'
    });
    await scopeButton(page, 'partenaire').click();
    await waitForCards(page, 1);
    assert.equal((await emptyView(page)).shown, false, 'le conseil se suit : le résultat est là');
  }));

test('une recherche sans aucun résultat garde l\'écran d\'avant, mot pour mot (garde)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await search(page, 'zzzzz');
    await page.waitForFunction(() => !document.getElementById('emptyState').hidden);
    assert.deepEqual(await emptyView(page), { shown: true, title: 'Aucun contact trouvé', text: 'Modifiez votre recherche ou réinitialisez les filtres.' });
  }));

// ===== « Réessayer » =====

test('l\'annuaire ne se charge pas : le bandeau dit quoi, offre « Réessayer », et le bouton travaille, garde le focus si l\'essai échoue (audit U30, cas b)', { skip }, () =>
  withWidget({ failTables: ['BDD'] }, async ({ page }) => {
    await waitForBanner(page);
    const { text, button } = banner(page);
    assert.equal(await text.textContent(),
      'Impossible de charger l\'annuaire depuis Grist (table « BDD » illisible). Cliquez sur « Réessayer » ; si le problème persiste, '
      + 'prévenez la personne qui gère l\'annuaire (le détail est dans la console du navigateur).');
    assert.equal(await text.getAttribute('role'), 'alert', 'le message est une alerte, annoncée tout de suite');
    assert.equal(await page.locator('#statusBanner').getAttribute('role'), null, 'et pas le bouton : changer son étiquette ne relit pas le message');
    assert.equal(await button.textContent(), 'Réessayer');
    assert.equal(await button.isVisible(), true);
    assert.equal(await resultCount(page), 'Chargement impossible');

    // Un essai lent : le bouton le dit et ne répond plus, sans quitter le focus.
    await page.evaluate(() => { window.__readGate = new Promise(resolve => { window.__openGate = resolve; }); });
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#statusBanner .status-action').textContent === 'Nouvelle tentative…');
    assert.equal(await button.getAttribute('aria-disabled'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#statusBanner .status-action')), true, 'le focus reste sur le bouton');

    // L'essai échoue : le message le dit, le bouton redevient « Réessayer » et garde le focus (c'est le même élément).
    await page.evaluate(() => window.__openGate());
    await page.waitForFunction(() => document.querySelector('#statusBanner .status-text').textContent.includes('La nouvelle tentative a échoué.'));
    assert.match(await text.textContent(), /\(table « BDD » illisible\)\. La nouvelle tentative a échoué\. Cliquez sur « Réessayer »/);
    assert.equal(await button.textContent(), 'Réessayer');
    assert.equal(await button.getAttribute('aria-disabled'), null);
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#statusBanner .status-action')), true, 'toujours sur le bouton');

    // Grist répond de nouveau : l'annuaire apparaît, le bandeau part avec son bouton, le focus passe au compteur.
    await page.evaluate(() => { window.__readGate = null; window.__failTables = []; });
    await button.click();
    await waitForCards(page, 4);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.equal(await resultCount(page), '4 contacts');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resultCount', 'le focus ne se perd pas avec le bouton');

    // Une panne plus tard n'est pas « une nouvelle tentative qui échoue », et les cartes déjà affichées restent.
    await page.evaluate(() => { window.__failTables = ['BDD']; window.__triggerRecords(); });
    await waitForBanner(page);
    assert.doesNotMatch(await text.textContent(), /nouvelle tentative/);
    assert.equal(await button.isVisible(), true, 'le bouton est là aussi');
    assert.equal(await page.locator('.contact-card').count(), 4, 'les cartes restent');
  }));

test('le script de l\'API de Grist ne se charge pas : le bandeau offre « Recharger la page », qui recharge (audit U30)', { skip }, () =>
  withWidget({ apiBlocked: true }, async ({ page }) => {
    await waitForBanner(page);
    const { button } = banner(page);
    assert.equal(await button.textContent(), 'Recharger la page');
    await page.evaluate(() => { window.__marker = 'avant'; });
    await Promise.all([page.waitForNavigation(), button.click()]);
    assert.equal(await page.evaluate(() => window.__marker), undefined, 'la page a été rechargée');
    await waitForBanner(page);
    assert.equal(await banner(page).button.textContent(), 'Recharger la page', 'et, sans l\'API, le bandeau revient');
  }));

test('un message du bandeau qui n\'est pas une panne de chargement n\'offre aucun bouton (garde)', { skip }, () =>
  withWidget({ failTables: ['Actions'] }, async ({ page }) => { // une table de libellés illisible : l'annuaire s'affiche, le bandeau prévient
    await waitForCards(page, 4);
    await waitForBanner(page);
    assert.match(await banner(page).text.textContent(), /Tables illisibles \(Actions\)/);
    assert.equal(await banner(page).button.isHidden(), true);
  }));
