// Ce que le menu Compétences AFFICHE sous l'onglet « C.U.R.I.E », avec le document tel qu'il est (1.41.1). Retour d'Antoine du 16 novembre 2026 :
// « il faut clairement revoir les tests unitaires et avoir des contrôles d'UI, regarde ce qui s'affiche quand on clique sur l'onglet C.U.R.I.E ».
// En 1.38.0, les tests passaient et le menu montrait « — aucune correspondance — » en tête, puis des titres « 0 », « 3 », « 13 », dans un cadre
// d'onglets plus lourd que le reste du menu : les tests avaient des données imaginées (« Groupe C ») et contrôlaient ce que le code faisait, pas ce
// que la personne voit. Ici : les valeurs du vrai document (withCurieCodes, tests/fixtures.mjs), et des contrôles sur le menu rendu
// (tests/support/menu-checks.mjs). La mécanique des onglets (clavier, sélection partagée, nombres) est dans tests/e2e-curie.test.mjs.
// Charge le vrai index.html dans Chromium avec le faux document Grist (optionnel : voir TESTING.md).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { sampleTables, withCurie, withCurieCodes } from './fixtures.mjs';
import { cardNames, skip, waitForCards, withWidget } from './support/browser.mjs';
import { groupedMenu } from './support/grouped-menu.mjs';
import { assertReadableMenu, framesAboveSearch, menuLabels } from './support/menu-checks.mjs';

const skills = groupedMenu('competences');
const menu = skills.filter;
const tab = (page, grouping) => menu(page).locator(`.view-tab[data-grouping="${grouping}"]`);

// ===== Les titres =====

test('sous « C.U.R.I.E », le menu ne montre que des groupes qu\'une personne comprend : « N° 3 », « N° 13 », jamais « — aucune correspondance — » ni « 0 »', { skip }, () =>
  withWidget({ tables: withCurieCodes() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    const labels = await menuLabels(menu(page));
    assert.deepEqual(labels.groups, ['N° 3', 'N° 7', 'N° 12', 'N° 13'], 'dans l\'ordre des numéros : 3, 7, 12, 13, pas 12, 13, 3, 7');
    assert.deepEqual(await skills.groupCounts(page), { 'N° 3': '2', 'N° 7': '0', 'N° 12': '0', 'N° 13': '1' },
      'Ana et Gina ont une compétence « 3 », Ana une « 13 » ; Bob, partenaire, porte la « 7 » : masqué par défaut');
    assertReadableMenu(labels, 'l\'onglet C.U.R.I.E');
    assert.deepEqual(labels.options, [
      'Compétence 7', 'Compétence 8', 'Compétence 9', // N° 3
      'Compétence 12', 'Compétence 13', // N° 7
      'Compétence 14', // N° 12
      'Compétence 10', 'Compétence 11' // N° 13
    ], 'les compétences que C.U.R.I.E classe, groupe par groupe : les 1 à 6 (« — aucune correspondance — » et « 0 ») ne sont pas sous cet onglet');
    const everything = await menu(page).locator('.filter-menu').innerText();
    assert.ok(!/aucune correspondance|Hors C\.U\.R\.I\.E|undefined|null/i.test(everything), 'nulle part dans le menu');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le premier groupe de l\'onglet est le premier numéro, pas le signe du vide : « — aucune correspondance — » ne passe devant (comme avant) ni derrière', { skip }, () =>
  withWidget({ tables: withCurieCodes() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    const names = await skills.groupNames(page);
    assert.equal(names[0], 'N° 3');
    assert.equal(names.at(-1), 'N° 13');
    assert.equal(names.length, 4, 'quatre groupes : rien d\'autre, ni en haut ni en bas');
  }));

test('une compétence sans correspondance C.U.R.I.E reste sous « Classique », et ses personnes se retrouvent', { skip }, () =>
  withWidget({ tables: withCurieCodes() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    const classic = await menuLabels(menu(page));
    assert.deepEqual(classic.groups, ['Cancérologie', 'Pharmacie', 'Autres']);
    assert.equal(classic.options.length, 14, 'les quatorze compétences, celles que C.U.R.I.E classe et les autres');
    assert.ok(classic.options.includes('Compétence 1'), '« — aucune correspondance — »');
    assert.ok(classic.options.includes('Compétence 5'), '« 0 »');
    await skills.toggle(page, 'Cancérologie').click();
    await menu(page).locator('.filter-option[data-value="Compétence 1"] input').check(); // Ana : sa compétence 1 n'a pas de correspondance C.U.R.I.E
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);

    await tab(page, 'curie').click();
    assert.equal(await skills.badge(page).textContent(), '1', 'la sélection suit d\'un onglet à l\'autre, même quand sa compétence n\'est pas rangée sous le second');
    assert.equal(await skills.badge(page).isVisible(), true);
    assert.equal(await menu(page).locator('.filter-button').getAttribute('aria-label'), 'Compétences (1 sélectionné)');
    assert.deepEqual(await cardNames(page), ['Ana Martin'], 'changer d\'onglet ne change pas le filtre');
  }));

test('chaque menu de filtre est lisible, l\'onglet C.U.R.I.E compris : ni libellé vide, ni nombre nu, ni « rien », ni doublon', { skip }, () =>
  withWidget({ tables: withCurieCodes() }, async ({ page }) => {
    await waitForCards(page, 4);
    const keys = await page.locator('.filter').evaluateAll(filters => filters.map(filter => filter.dataset.filterKey));
    assert.ok(keys.includes('competences') && keys.length >= 5, `les menus de la barre de filtres (${keys.join(', ')}) : un menu de moins ne doit pas passer inaperçu`);
    for (const key of keys) {
      const filter = groupedMenu(key).filter(page);
      await filter.locator('.filter-button').click();
      assertReadableMenu(await menuLabels(filter), `le menu « ${key} »`);
      if (key === 'competences') {
        await tab(page, 'curie').click();
        assertReadableMenu(await menuLabels(filter), 'le menu « competences », onglet C.U.R.I.E');
      }
      await page.mouse.click(5, 5);
    }
  }));

// ===== Des onglets légers =====

for (const [width, touch] of [[1100, false], [390, true]]) {
  test(`à ${width}px${touch ? ' au doigt' : ''}, les onglets n'ont aucun cadre : un trait sous l'onglet montré, un filet sous la barre, et le menu garde le sien`, { skip }, () =>
    withWidget({
      tables: withCurie(),
      contextOptions: { viewport: { width, height: 800 }, ...(touch ? { hasTouch: true, isMobile: true } : {}) }
    }, async ({ page }) => {
      await waitForCards(page, 4);
      await skills.open(page);
      assert.deepEqual(await framesAboveSearch(menu(page)), [],
        'au-dessus de la recherche, ni contour, ni ombre, ni fond, ni angle arrondi : le menu et la recherche ont déjà le leur (1.38.0 : trois cadres emboîtés)');

      const look = await menu(page).evaluate(filter => {
        const style = element => getComputedStyle(element);
        const bar = filter.querySelector('.view-tabs');
        const [shown, other] = ['aria-selected="true"', 'aria-selected="false"'].map(state => filter.querySelector(`.view-tab[${state}]`));
        const underline = tab => ({ width: style(tab).borderBottomWidth, color: style(tab).borderBottomColor, text: style(tab).color });
        return {
          bar: { height: bar.getBoundingClientRect().height, rule: style(bar).borderBottomWidth, gap: style(bar).columnGap },
          shown: underline(shown),
          other: underline(other)
        };
      });
      assert.equal(look.shown.width, '2px', 'un trait de 2 px sous l\'onglet montré');
      assert.notEqual(look.shown.color, look.other.color, 'l\'autre onglet n\'a pas de trait');
      assert.match(look.other.color, /^rgba\(0, 0, 0, 0\)$|^transparent$/);
      assert.equal(look.bar.rule, '1px', 'un filet sous la barre');
      assert.ok(look.bar.height <= (touch ? 40 : 30) + 0.5, `la barre est basse : ${look.bar.height}px (1.38.0 : 38 px, avec son cadre)`);
      assert.notEqual(look.shown.text, look.other.text, 'le texte de l\'onglet montré se distingue aussi, sans dépendre du trait');
    }));
}

test('l\'onglet montré se reconnaît à son trait et à sa couleur, dans l\'un et l\'autre sens : le trait suit l\'onglet qu\'on choisit', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    const underlined = () => menu(page).locator('.view-tab').evaluateAll(tabs =>
      tabs.filter(element => getComputedStyle(element).borderBottomColor !== 'rgba(0, 0, 0, 0)').map(element => element.textContent));
    assert.deepEqual(await underlined(), ['Classique']);
    await tab(page, 'curie').click();
    assert.deepEqual(await underlined(), ['C.U.R.I.E']);
    await tab(page, 'macro').click();
    assert.deepEqual(await underlined(), ['Classique']);
  }));

// ===== Une colonne qui ne dit rien =====

test('une colonne qui ne contient que « — aucune correspondance — », « 0 » ou rien ne donne pas d\'onglet : le menu reste celui d\'avant', { skip }, () => {
  const tables = withCurie(sampleTables());
  tables.Competences.referenciel_C_U_R_I_E = ['— aucune correspondance —', '0', '', 'N/A'];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    assert.equal(await page.locator('.view-tab').count(), 0, 'un rangement qui ne range rien n\'est pas un onglet');
    assert.deepEqual(await skills.groupNames(page), ['Cancérologie', 'Pharmacie', 'Autres']);
    assert.equal(await page.locator('#statusBanner').isHidden(), true, 'ni bandeau');
    const warnings = await Promise.all(logs.warnings);
    assert.ok(!warnings.some(line => /C_U_R_I_E|C\.U\.R\.I\.E/.test(line)), 'ni avertissement');
  });
});
