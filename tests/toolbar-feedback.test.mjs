// Les menus de filtre, le compteur et « Réinitialiser » (1.34.0, audit UI/UX U37, U27 et U36). Chaque test échoue sur le code de la
// 1.33.0, sauf les gardes qui disent ce qui ne change pas.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md). 30 contacts (crowdedTables) : le menu Établissement
// a dix-sept cases, de quoi défiler ; le menu Compétences est rangé par domaine.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { CATEGORIES } from '../constants.js';
import { contactCountText } from '../grist-data.js';
import { countInScope } from '../filters.js';
import { crowdedTables, crowdedTablesByAction } from './fixtures-responsive.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { resultCount, skip, waitForCards, withWidget } from './support/browser.mjs';

const filter = (page, key) => page.locator(`.filter[data-filter-key="${key}"]`);
async function openMenu(page, key) {
  await filter(page, key).locator('.filter-button').click();
  return filter(page, key).locator('.filter-menu');
}

// ===== U37 : la recherche d'un menu long reste en haut =====

test('la recherche d\'un menu long reste en haut quand la liste défile, et recouvre les cases qui passent dessous (audit U37)', { skip }, () =>
  withWidget({ tables: crowdedTables() }, async ({ page }) => {
    await waitForCards(page, 30);
    for (const key of ['etablissement', 'competences']) {
      const menu = await openMenu(page, key);
      assert.ok(await menu.evaluate(element => element.scrollHeight - element.clientHeight) > 100, `le menu ${key} défile`);
      await menu.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const seen = await menu.evaluate(element => {
        const frame = element.getBoundingClientRect();
        const head = element.querySelector('.filter-menu-head').getBoundingClientRect();
        const search = element.querySelector('.filter-search-input');
        const box = search.getBoundingClientRect();
        const at = (x, y) => document.elementFromPoint(x, y);
        return {
          position: getComputedStyle(element.querySelector('.filter-menu-head')).position,
          background: getComputedStyle(element.querySelector('.filter-menu-head')).backgroundColor,
          offset: Math.round(box.top - frame.top),
          onTop: at(box.left + box.width / 2, box.top + box.height / 2) === search,
          // Au-dessus et au-dessous du champ, la marge de l'en-tête est opaque : aucune case n'y passe.
          aboveIsHead: at(box.left + 6, box.top - 3).closest('.filter-menu-head') !== null,
          belowIsHead: at(box.left + 6, box.bottom + 3).closest('.filter-menu-head') !== null,
          headTop: Math.round(head.top - frame.top)
        };
      });
      assert.equal(seen.position, 'sticky', key);
      assert.equal(seen.background, 'rgb(255, 255, 255)', `${key} : l'en-tête est opaque, les cases ne se voient pas à travers`);
      assert.ok(seen.offset >= 0 && seen.offset <= 12, `${key} : le champ est resté en haut du menu (à ${seen.offset} px du bord)`);
      assert.equal(seen.onTop, true, `${key} : le champ n'est pas recouvert par les cases`);
      assert.equal(seen.aboveIsHead && seen.belowIsHead, true, `${key} : la marge autour du champ est opaque`);
      assert.ok(seen.headTop <= 3, `${key} : l'en-tête touche le bord haut du menu (sous sa bordure de 3 px), pas de bande où les cases défilent`);
      await page.keyboard.press('Escape');
    }
  }));

// Où est la case qui a le focus (la case elle-même, pas sa ligne), par rapport à la recherche collante et au bas du menu.
const placeOfFocusedOption = page => page.evaluate(() => {
  const menuBox = document.querySelector('.filter.open .filter-menu').getBoundingClientRect();
  const head = document.querySelector('.filter.open .filter-menu-head').getBoundingClientRect();
  const box = document.activeElement.getBoundingClientRect();
  return { optionTop: box.top, headBottom: head.bottom, optionBottom: box.bottom, menuBottom: menuBox.bottom };
});

// L'anneau de focus déborde de 4 px (2 px de trait, 2 px d'écart) : il ne doit pas non plus passer sous la recherche.
const FOCUS_RING = 4;

test('au clavier, la case qu\'on atteint n\'est pas cachée par la recherche collante, même quand elle passe à moitié dessous (audit U37, WCAG 2.4.11)', { skip }, () =>
  withWidget({ tables: crowdedTables() }, async ({ page }) => {
    await waitForCards(page, 30);
    const menu = await openMenu(page, 'etablissement');

    // Une case à moitié sous la recherche : le focus la ramène en vue entière, au-dessous d'elle (scroll-padding-top).
    await menu.evaluate(element => {
      const option = element.querySelectorAll('.filter-option')[8];
      const head = element.querySelector('.filter-menu-head');
      element.scrollTop += option.getBoundingClientRect().top - head.getBoundingClientRect().bottom + 12;
    });
    await menu.locator('.filter-option').nth(8).locator('input').focus();
    const half = await placeOfFocusedOption(page);
    assert.ok(half.optionTop >= half.headBottom + FOCUS_RING, `la case est sous la recherche : ${half.optionTop} contre ${half.headBottom}`);

    // Et en remontant à la touche Maj+Tab depuis la dernière case.
    await menu.locator('.filter-search-input').focus();
    for (let step = 0; step < 17; step += 1) await page.keyboard.press('Tab');
    for (let step = 0; step < 9; step += 1) await page.keyboard.press('Shift+Tab');
    const up = await placeOfFocusedOption(page);
    assert.ok(up.optionTop >= up.headBottom + FOCUS_RING, `la case est sous la recherche : ${up.optionTop} contre ${up.headBottom}`);
    assert.ok(up.optionBottom + FOCUS_RING <= up.menuBottom + 0.5, 'et dans le menu');
  }));

// ===== U27 : l'aide d'un menu rangé par groupe est écrite dans le menu =====

test('un menu rangé par groupe écrit son aide, lue avec le menu, et la cache pendant une recherche (audit U27)', { skip }, () =>
  withWidget({ tables: crowdedTablesByAction() }, async ({ page }) => {
    await waitForCards(page, 30);
    for (const [key, category] of [['competences', CATEGORIES.macro], ['taches', CATEGORIES.macroTaches]]) {
      const menu = await openMenu(page, key);
      const help = menu.locator('.filter-help');
      assert.equal(await help.textContent(), category.hint, `${key} : l'aide qui n'était que l'infobulle du bouton`);
      assert.equal(await help.isVisible(), true, `${key} : visible à l'écran`);
      assert.equal(await menu.getAttribute('aria-describedby'), await help.getAttribute('id'), `${key} : la description du menu`);
      const tree = await accessibilityTree(page);
      assert.equal(accessibleNode(tree, 'group', CATEGORIES[key].label)?.description, category.hint, `${key} : lue par un lecteur d'écran`);

      await menu.locator('.filter-search-input').fill('a');
      assert.equal(await help.isVisible(), false, `${key} : l'aide s'efface pendant la recherche, qui a besoin de la place`);
      await menu.locator('.filter-search-input').fill('');
      assert.equal(await help.isVisible(), true, `${key} : elle revient avec la recherche vidée`);
      await page.keyboard.press('Escape');
    }
  }));

test('un menu à plat n\'a pas de ligne d\'aide, et le bouton d\'un menu rangé garde son infobulle (audit U27, garde)', { skip }, () =>
  withWidget({ tables: crowdedTables() }, async ({ page }) => {
    await waitForCards(page, 30);
    for (const key of ['instances', 'etablissement', 'gt']) {
      assert.equal(await filter(page, key).locator('.filter-help').count(), 0, key);
      assert.equal(await filter(page, key).locator('.filter-menu').getAttribute('aria-describedby'), null, key);
    }
    assert.equal(await filter(page, 'competences').locator('.filter-button').getAttribute('title'), CATEGORIES.macro.hint);
  }));

// ===== U36 : « N sur M » et « Réinitialiser » grisé =====

test('contactCountText dit « N contacts », ou « N sur M contacts » quand des contacts de l\'annuaire ne s\'affichent pas (audit U36)', () => {
  assert.equal(contactCountText(4, 4), '4 contacts');
  assert.equal(contactCountText(1, 1), '1 contact');
  assert.equal(contactCountText(0, 0), '0 contact');
  assert.equal(contactCountText(1, 245), '1 sur 245 contacts');
  assert.equal(contactCountText(0, 245), '0 sur 245 contacts');
  assert.equal(contactCountText(1234, 45000), '1 234 sur 45 000 contacts', 'les milliers à la française');
});

test('countInScope compte ce que les interrupteurs Fondateurs/Partenaires laissent voir, sans recherche ni filtre (audit U36)', () => {
  const contacts = [
    { etablissement_fondateur: true, etablissement_partenaire: false },
    { etablissement_fondateur: true, etablissement_partenaire: false },
    { etablissement_fondateur: false, etablissement_partenaire: true },
    { etablissement_fondateur: false, etablissement_partenaire: false }
  ];
  assert.equal(countInScope(contacts, { fondateur: true, partenaire: false }), 2);
  assert.equal(countInScope(contacts, { fondateur: false, partenaire: true }), 1);
  assert.equal(countInScope(contacts, { fondateur: true, partenaire: true }), 3);
  assert.equal(countInScope(contacts, { fondateur: false, partenaire: false }), 0, 'deux interrupteurs éteints : rien à voir');
  assert.equal(countInScope(contacts, undefined), 4, 'sans interrupteurs, aucune restriction');
});

// Le dix-septième établissement n'est plus que partenaire : son contact reste caché tant que « Partenaires » est éteint.
function withPartnerOnlyEtablissement() {
  const tables = crowdedTables();
  const last = tables.Etablissements.id.length - 1;
  tables.Etablissements.fondateur[last] = false;
  tables.Etablissements.partenaire[last] = true;
  return tables;
}

test('le compteur dit combien de contacts la recherche et les filtres écartent ; les interrupteurs Fondateurs/Partenaires changent l\'ensemble dont il part (audit U36)', { skip }, () =>
  withWidget({ tables: withPartnerOnlyEtablissement() }, async ({ page }) => {
    await waitForCards(page, 29);
    assert.equal(await resultCount(page), '29 contacts', 'sans recherche ni filtre, la vue d\'arrivée reste « N contacts » comme dans la maquette');

    await page.locator('.scope-btn[data-scope="partenaire"]').click();
    await waitForCards(page, 30);
    assert.equal(await resultCount(page), '30 contacts', 'un interrupteur ne compte pas parmi les contacts écartés');

    await page.locator('#searchInput').fill('Dupont');
    await page.waitForFunction(() => /^\d+ sur 30 contacts$/.test(document.getElementById('resultCount').textContent));
    const shown = await page.locator('.contact-card').count();
    assert.ok(shown > 0 && shown < 30);
    assert.equal(await resultCount(page), `${shown} sur 30 contacts`);
    assert.equal(await page.locator('#scrollCount').textContent(), `${shown} sur 30 contacts`, 'la pastille « Haut de page » dit la même chose');

    await page.locator('.scope-btn[data-scope="partenaire"]').click(); // la recherche reste : le total suit l'interrupteur
    await page.waitForFunction(() => /^\d+ sur 29 contacts$/.test(document.getElementById('resultCount').textContent));

    await page.locator('#searchInput').fill('Zzz');
    await page.waitForFunction(() => document.getElementById('resultCount').textContent === '0 sur 29 contacts');
  }));

const reset = page => page.locator('#resetFilters');
const resetIsGrey = async page => (await reset(page).getAttribute('aria-disabled')) === 'true';

test('« Réinitialiser » est grisé au repos, s\'allume à la première lettre ou à la première case, et se grise une fois les filtres retirés (audit U36)', { skip }, () =>
  withWidget({ tables: crowdedTables() }, async ({ page }) => {
    await waitForCards(page, 30);
    assert.equal(await resetIsGrey(page), true, 'au chargement, rien à réinitialiser');
    assert.equal(accessibleNode(await accessibilityTree(page), 'button', 'Réinitialiser')?.disabled, true, 'un lecteur d\'écran le dit indisponible');

    // La frappe compte tout de suite, avant que la recherche soit appliquée (200 ms).
    await page.locator('#searchInput').pressSequentially('D');
    assert.equal(await resetIsGrey(page), false, 'dès la première lettre');
    await page.locator('#searchInput').fill('');
    assert.equal(await resetIsGrey(page), true, 'la recherche vidée');

    const menu = await openMenu(page, 'etablissement');
    await menu.locator('.filter-option').first().click();
    assert.equal(await resetIsGrey(page), false, 'une case cochée');
    await page.keyboard.press('Escape');

    // Au clavier : Entrée réinitialise, le bouton se grise et garde le focus (un bouton désactivé le perdrait).
    await reset(page).focus();
    await page.keyboard.press('Enter');
    await waitForCards(page, 30);
    assert.equal(await resetIsGrey(page), true, 'une fois réinitialisé');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'resetFilters', 'le focus est resté sur le bouton');
    assert.equal(await page.locator('.filter-count:not([hidden])').count(), 0, 'plus aucun filtre coché');
  }));

test('« Réinitialiser » grisé ne fait rien, et les interrupteurs Fondateurs/Partenaires ne l\'allument pas (audit U36, garde)', { skip }, () =>
  withWidget({ tables: withPartnerOnlyEtablissement() }, async ({ page }) => {
    await waitForCards(page, 29);
    await page.locator('.scope-btn[data-scope="partenaire"]').click();
    await waitForCards(page, 30);
    assert.equal(await resetIsGrey(page), true, 'un interrupteur n\'est pas un filtre : « Réinitialiser » n\'y touche pas');
    await reset(page).click({ force: true }); // Playwright tient un bouton `aria-disabled` pour désactivé : le clic est forcé
    assert.equal(await page.locator('.scope-btn[data-scope="partenaire"]').getAttribute('aria-pressed'), 'true', 'et le clic grisé ne les remet pas à zéro');
    assert.equal(await page.locator('.contact-card').count(), 30);
  }));
