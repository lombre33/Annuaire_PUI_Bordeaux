// Les menus de filtre pour le clavier et pour un lecteur d'écran (1.30.0, audit UI/UX U15, U16 et U17) : ce que chaque bouton annonce,
// comment on referme un menu sans la souris, et où va le focus quand la page redessine ce qui le portait. Chaque test échoue sur le
// code de la 1.29.3, sauf deux gardes qui disent ce qui ne change pas : la souris, et le focus de la recherche.
//
// Les noms, descriptions et états viennent de l'arbre d'accessibilité que calcule le navigateur (tests/support/accessibility-tree.mjs),
// pas du seul HTML : c'est cet arbre que lit un lecteur d'écran.
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withClones } from './fixtures.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { changeFonction, gridCard, reload, skip, waitForCards, withWidget } from './support/browser.mjs';

// Le filtre de clé `key` (data-filter-key : actions, competences, instances…), son bouton et son menu.
const filter = (page, key) => page.locator(`.filter[data-filter-key="${key}"]`);
const button = (page, key) => filter(page, key).locator('.filter-button');
const option = (page, key, value) => filter(page, key).locator(`.filter-option[data-value="${value}"] input`);

// Le contrôle qui a le focus : sa balise, son texte, la valeur de l'option de menu ou la clé du filtre qui le porte, et s'il est dans la grille.
const focusedControl = page => page.evaluate(() => {
  const element = document.activeElement;
  return {
    tag: element.tagName,
    id: element.id,
    classes: element.className,
    text: element.textContent.trim(),
    option: element.closest('.filter-option')?.dataset.value ?? null,
    filter: element.closest('.filter')?.dataset.filterKey ?? null,
    inGrid: Boolean(element.closest('#cardsGrid'))
  };
});

const openFilters = page => page.locator('.filter.open').evaluateAll(wrappers => wrappers.map(wrapper => wrapper.dataset.filterKey));

// Met le focus du clavier sur `locator` (c'est celui-là que la page rend à la grille redessinée ; à la souris, elle ne change rien).
async function focusByKeyboard(locator) {
  await locator.focus();
  assert.equal(await locator.evaluate(element => element.matches(':focus-visible')), true, 'le focus est celui du clavier');
}

// Le contrôle qui a le focus est tout entier dans la fenêtre : le focus ne reste pas hors de l'écran.
const focusIsOnScreen = page => page.evaluate(() => {
  const box = document.activeElement.getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth;
});

// ===== U15 : ce que le lecteur d'écran annonce =====

test('chaque bouton de filtre annonce s\'il est ouvert et désigne son menu, un groupe de cases qui porte son nom ; le chevron ne se lit pas (audit U15)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const wiring = await page.locator('.filter').evaluateAll(wrappers => wrappers.map(wrapper => {
      const toggle = wrapper.querySelector('.filter-button');
      const menu = document.getElementById(toggle.getAttribute('aria-controls'));
      return {
        label: toggle.querySelector('.filter-name').textContent,
        expanded: toggle.getAttribute('aria-expanded'),
        menuIsItsOwn: menu?.parentElement === wrapper && menu.classList.contains('filter-menu'),
        menuRole: menu?.getAttribute('role'),
        menuName: menu?.getAttribute('aria-label'),
        chevronHidden: toggle.querySelector('.chevron').getAttribute('aria-hidden'),
        popup: toggle.hasAttribute('aria-haspopup')
      };
    }));
    assert.ok(wiring.length >= 8, `les huit filtres sont là (${wiring.length})`);
    for (const { label, expanded, menuIsItsOwn, menuRole, menuName, chevronHidden, popup } of wiring) {
      assert.deepEqual({ expanded, menuIsItsOwn, menuRole, menuName, chevronHidden, popup },
        { expanded: 'false', menuIsItsOwn: true, menuRole: 'group', menuName: label, chevronHidden: 'true', popup: false }, label);
    }

    // Ce que le navigateur en fait : « Instances » est un bouton replié, puis déplié ; son menu est un groupe de même nom.
    let tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'button', 'Instances')?.expanded, false);
    await button(page, 'instances').click();
    tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'button', 'Instances')?.expanded, true, 'déplié une fois ouvert');
    assert.ok(accessibleNode(tree, 'group', 'Instances'), 'le menu ouvert est un groupe nommé « Instances »');
    assert.equal(accessibleNode(tree, 'button', 'Actions')?.expanded, false, 'les autres restent repliés');

    // Un autre menu s'ouvre : le premier se replie et le dit ; un second clic sur son bouton le replie aussi. Le premier clic est celui
    // que `click()` envoie, sans déplacer le focus : comme dans Safari, où un bouton ne prend pas le focus au clic (sinon c'est la
    // sortie du focus qui referme le premier menu).
    await button(page, 'actions').evaluate(element => element.click());
    assert.deepEqual(await openFilters(page), ['actions']);
    assert.equal(await button(page, 'instances').getAttribute('aria-expanded'), 'false');
    assert.equal(await button(page, 'actions').getAttribute('aria-expanded'), 'true');
    await button(page, 'actions').click();
    assert.deepEqual(await openFilters(page), []);
    assert.equal(await button(page, 'actions').getAttribute('aria-expanded'), 'false');
  }));

test('le nom d\'un bouton de filtre dit combien de valeurs sont choisies, en toutes lettres, et celui d\'une case n\'est que son libellé (audit U15)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await button(page, 'instances').click();
    const names = async () => (await accessibilityTree(page)).filter(node => node.role === 'button' && /^Instances\b/.test(node.name)).map(node => node.name);
    assert.deepEqual(await names(), ['Instances']);

    await option(page, 'instances', 'CME').check();
    assert.deepEqual(await names(), ['Instances (1 sélectionné)']);
    await option(page, 'instances', 'COVIRIS').check();
    assert.deepEqual(await names(), ['Instances (2 sélectionnés)']);
    // Le badge visible garde son chiffre nu ; son rôle est d'être vu, c'est le nom du bouton qui est lu.
    assert.equal(await button(page, 'instances').locator('.filter-count').textContent(), '2');

    // La case se lit « CME », puis son nombre de fiches en description : le nombre n'est plus collé au libellé.
    const tree = await accessibilityTree(page);
    assert.deepEqual(['CME', 'COVIRIS'].map(value => ({ ...accessibleNode(tree, 'checkbox', value) }).description), ['1', '0']);
    assert.equal(accessibleNode(tree, 'checkbox', 'CME 1'), undefined, 'le nombre ne fait plus partie du nom');

    await option(page, 'instances', 'CME').uncheck();
    await option(page, 'instances', 'COVIRIS').uncheck();
    assert.deepEqual(await names(), ['Instances']);
  }));

test('dans un menu à domaines, la case d\'un domaine est nommée par son libellé et décrite par son nombre de fiches (audit U15)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await button(page, 'competences').click();
    const tree = await accessibilityTree(page);
    const domain = accessibleNode(tree, 'checkbox', 'Cancérologie');
    assert.ok(domain, 'la case du domaine est nommée par son libellé');
    assert.equal(domain.description, '1', 'Ana est la seule à porter une compétence du domaine');
    assert.equal(tree.filter(node => node.role === 'checkbox' && /\d$/.test(node.name)).length, 0, 'aucune case n\'a un nombre au bout de son nom');
  }));

// ===== U16 : refermer un menu au clavier =====

test('Échap referme le menu ouvert et rend le focus à son bouton, que le focus soit dans la recherche ou sur une case (audit U16)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    for (const target of [filter(page, 'instances').locator('.filter-search-input'), option(page, 'instances', 'CME')]) {
      await button(page, 'instances').click();
      assert.deepEqual(await openFilters(page), ['instances']);
      await target.focus();
      await page.keyboard.press('Escape');
      assert.deepEqual(await openFilters(page), [], 'le menu est refermé');
      assert.equal(await button(page, 'instances').getAttribute('aria-expanded'), 'false');
      assert.equal((await focusedControl(page)).classes.includes('filter-button'), true, 'le focus est revenu au bouton du menu');
    }
  }));

test('Échap ne touche à rien quand aucun menu n\'est ouvert, et le texte tapé dans la recherche d\'un menu reste quand Échap le referme (audit U16)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    // La touche arrive jusqu'au document sans avoir été retenue : rien ne l'a prise pour elle.
    await page.evaluate(() => {
      window.__escapes = [];
      document.addEventListener('keydown', event => { if (event.key === 'Escape') window.__escapes.push(event.defaultPrevented); });
    });
    await button(page, 'instances').focus();
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => window.__escapes), [false], 'menu fermé : Échap n\'est pas retenu');

    await button(page, 'instances').click();
    const search = filter(page, 'instances').locator('.filter-search-input');
    await search.fill('COV');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => window.__escapes), [false, true], 'menu ouvert : Échap est retenu par le menu');
    assert.deepEqual(await openFilters(page), []);
    await button(page, 'instances').click();
    assert.equal(await search.inputValue(), 'COV', 'la recherche du menu garde ce qu\'on y avait tapé');
  }));

test('la tabulation qui sort du menu le referme, vers l\'avant comme vers l\'arrière ; elle reste ouverte tant que le focus est dans le menu (audit U16)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await button(page, 'instances').click();
    const search = filter(page, 'instances').locator('.filter-search-input');
    await search.focus();
    await page.keyboard.press('Tab'); // CME
    await page.keyboard.press('Tab'); // COVIRIS : la dernière case
    assert.equal((await focusedControl(page)).option, 'COVIRIS');
    assert.deepEqual(await openFilters(page), ['instances'], 'dans le menu, il reste ouvert');

    await page.keyboard.press('Tab');
    assert.deepEqual(await openFilters(page), [], 'sorti du menu par l\'avant, il est refermé');
    assert.equal((await focusedControl(page)).filter, 'etablissement', 'le focus est au filtre suivant');

    // Vers l'arrière : de la recherche, Maj+Tab revient au bouton du menu (toujours dans le filtre), puis sort du filtre.
    await button(page, 'instances').click();
    await search.focus();
    await page.keyboard.press('Shift+Tab');
    assert.ok((await focusedControl(page)).classes.includes('filter-button'));
    assert.deepEqual(await openFilters(page), ['instances'], 'revenu à son bouton, le menu reste ouvert');
    await page.keyboard.press('Shift+Tab');
    assert.deepEqual(await openFilters(page), [], 'sorti du filtre par l\'arrière, le menu est refermé');
  }));

test('à la souris, un menu ne se referme pas quand le focus part sans destination ; un clic ailleurs le referme toujours (audit U16)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await button(page, 'instances').click();
    // Ni un clic dans le menu, ni un focus perdu (une autre fenêtre, une marge de la page) ne le referment.
    await filter(page, 'instances').locator('.filter-search-input').click();
    await page.evaluate(() => document.activeElement.blur());
    assert.deepEqual(await openFilters(page), ['instances'], 'focus perdu : le menu reste ouvert');
    await option(page, 'instances', 'CME').click();
    assert.deepEqual(await openFilters(page), ['instances'], 'une case cochée à la souris : il reste ouvert');

    await page.locator('.subtitle').click();
    assert.deepEqual(await openFilters(page), [], 'un clic ailleurs le referme');
    assert.equal(await button(page, 'instances').getAttribute('aria-expanded'), 'false', 'et le bouton le dit');
  }));

// ===== U17 : le focus survit au dessin de la grille =====

// La pastille d'action de la carte d'Ana, un bouton qui filtre sur « Vaccination ».
const pillOfAna = page => gridCard(page, 'Ana').locator('button.tag', { hasText: 'Vaccination' });

test('au clavier, activer une pastille de carte garde le focus sur elle quand la grille se redessine (audit U17)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await pillOfAna(page).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 1);
    assert.deepEqual(await focusedControl(page), { ...await focusedControl(page), tag: 'BUTTON', text: 'Vaccination', inGrid: true },
      'le focus est resté sur la pastille, dans la grille, et non revenu à la page');
    // Une deuxième activation retire le filtre : les quatre cartes reviennent et le focus est toujours sur la pastille.
    await page.keyboard.press('Enter');
    await waitForCards(page, 4);
    assert.equal((await focusedControl(page)).text, 'Vaccination');
    assert.equal((await focusedControl(page)).inGrid, true);
  }));

test('à la souris, rien ne change : cliquer une pastille filtre la liste, et le focus n\'est pas rendu à la grille (audit U17)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await pillOfAna(page).click();
    await waitForCards(page, 1);
    assert.equal((await focusedControl(page)).inGrid, false, 'le focus de la souris reste à la page, comme avant la 1.30.0');
  }));

test('quand la carte est refaite par une relecture de Grist, le focus passe au même contrôle de la nouvelle carte, et reste à l\'écran (audit U17)', { skip }, () =>
  withWidget({ tables: withClones(sampleTables(), 40) }, async ({ page }) => {
    await waitForCards(page, 44);
    await page.setViewportSize({ width: 1280, height: 800 });
    const before = await pillOfAna(page).elementHandle();
    await focusByKeyboard(pillOfAna(page));
    // Ana est la dernière carte : la page a défilé jusqu'à elle.
    const scrolled = await page.evaluate(() => window.scrollY);
    assert.ok(scrolled > 800, `la carte est loin du haut (${scrolled} px)`);
    await changeFonction(page, { row: 0, name: 'Ana', fonction: 'Cheffe de service' });
    assert.equal(await before.evaluate(element => element.isConnected), false, 'la carte d\'Ana a bien été refaite (sinon ce test ne prouve rien)');
    assert.deepEqual(await focusedControl(page), { ...await focusedControl(page), tag: 'BUTTON', text: 'Vaccination', inGrid: true });
    assert.equal(await page.evaluate(() => document.activeElement.closest('.contact-card').querySelector('.fonction').textContent), 'Cheffe de service');
    assert.equal(await focusIsOnScreen(page), true, 'le contrôle qui a le focus est à l\'écran');
  }));

test('quand la carte qui avait le focus disparaît, le focus passe au compteur de contacts, où la liste commence (audit U17)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await focusByKeyboard(pillOfAna(page));
    await page.evaluate(() => { window.__tables.BDD.Accepte_apparaitre[0] = false; });
    await reload(page);
    await waitForCards(page, 3);
    assert.deepEqual(await focusedControl(page), { ...await focusedControl(page), id: 'resultCount', inGrid: false });
    // Le compteur n'est pas un contrôle : pas d'anneau de focus à l'écran, et il n'entre pas dans la tabulation.
    assert.equal(await page.evaluate(() => {
      const counter = document.getElementById('resultCount');
      return [getComputedStyle(counter).outlineStyle, counter.getAttribute('tabindex')].join(' ');
    }), 'none -1');
  }));

test('au clavier, cocher une case de menu la fait passer en tête sans que le focus la quitte (audit U17)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await button(page, 'instances').click();
    await option(page, 'instances', 'COVIRIS').focus();
    await page.keyboard.press('Space');
    const values = () => filter(page, 'instances').locator('.filter-option').evaluateAll(options => options.map(element => element.dataset.value));
    assert.deepEqual(await values(), ['COVIRIS', 'CME'], 'la case cochée passe en tête');
    assert.deepEqual(await page.evaluate(() => [document.activeElement.type, document.activeElement.closest('.filter-option').dataset.value]), ['checkbox', 'COVIRIS'],
      'le focus est resté sur la case, à sa nouvelle place');
    assert.deepEqual(await openFilters(page), ['instances'], 'le menu est resté ouvert');
    await page.keyboard.press('Space');
    assert.equal(await option(page, 'instances', 'COVIRIS').isChecked(), false, 'la touche Espace agit encore sur cette case');
  }));

// Le document avec `extra` instances de plus (« Instance 01 », « Instance 02 »…) : de quoi faire défiler le menu Instances, qui en montre une dizaine.
function withManyInstances(tables, extra) {
  const copy = structuredClone(tables);
  for (let n = 1; n <= extra; n += 1) {
    copy.INSTANCES.id.push(3 + n);
    copy.INSTANCES.Instances.push(`Instance ${n}`);
    copy.INSTANCES.Instances_Corrigees.push(`Instance ${String(n).padStart(2, '0')}`);
  }
  return copy;
}

// La case est tout entière dans la partie visible du menu (qui défile).
const optionInView = (page, key, value) => option(page, key, value).evaluate((input, selector) => {
  const box = input.getBoundingClientRect();
  const menu = input.closest(selector).getBoundingClientRect();
  return box.top >= menu.top && box.bottom <= menu.bottom;
}, '.filter-menu');
const menuScroll = (page, key) => filter(page, key).locator('.filter-menu').evaluate(menu => menu.scrollTop);

test('dans un menu long, une case cochée au clavier passe en tête et le menu défile jusqu\'à elle ; à la souris, la liste reste où elle est (audit U17)', { skip }, () =>
  withWidget({ tables: withManyInstances(sampleTables(), 30) }, async ({ page }) => {
    await waitForCards(page, 4);
    const last = option(page, 'instances', 'Instance 30');
    const menu = filter(page, 'instances').locator('.filter-menu');

    await button(page, 'instances').focus();
    await page.keyboard.press('Enter');
    await focusByKeyboard(last);
    assert.ok(await menuScroll(page, 'instances') > 200, 'le menu a défilé jusqu\'à la dernière case');
    await page.keyboard.press('Space');
    assert.deepEqual(await filter(page, 'instances').locator('.filter-option').first().getAttribute('data-value'), 'Instance 30', 'la case cochée passe en tête');
    assert.equal((await focusedControl(page)).option, 'Instance 30', 'le focus l\'a suivie');
    assert.equal(await optionInView(page, 'instances', 'Instance 30'), true, 'et le menu a défilé pour la montrer');

    // À la souris : la case cochée passe en tête, mais la liste ne bouge pas sous le doigt.
    await last.uncheck();
    await menu.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const resting = await menuScroll(page, 'instances');
    await option(page, 'instances', 'Instance 29').click();
    assert.equal(await option(page, 'instances', 'Instance 29').isChecked(), true);
    assert.equal(await menuScroll(page, 'instances'), resting, 'la liste n\'a pas défilé');
  }));

test('taper dans la recherche ne lui prend pas le focus quand la grille se redessine (audit U17)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.getByRole('searchbox').click();
    await page.keyboard.type('Ana');
    await waitForCards(page, 1);
    assert.equal((await focusedControl(page)).id, 'searchInput');
  }));
