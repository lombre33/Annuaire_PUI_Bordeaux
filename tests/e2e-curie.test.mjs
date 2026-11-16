// Test navigateur des onglets du menu Compétences (1.38.0, point 2 des retours d'Antoine du 2026-11-16) : « Classique » (les domaines,
// comme avant) et « C.U.R.I.E » (les groupes de la colonne facultative `referenciel_C_U_R_I_E` de la table Competences), en haut du menu,
// juste au-dessus de la recherche. Charge le vrai index.html dans Chromium avec le faux document Grist (optionnel : voir TESTING.md).
//
// Avec withCurie (tests/fixtures.mjs), périmètre par défaut (Bob est partenaire) :
//   Classique      → Cancérologie : Oncologie, Hématologie (Ana) ; Pharmacie : Pharmacovigilance (Bob) ; Autres : Divers (Gina)
//   C.U.R.I.E      → « Compétences en gestion de projet. » : Oncologie (Ana) ; « Connaissance de l’écosystème d’innovation. » : Hématologie (Ana), Pharmacovigilance (Bob) ; Divers (Gina) n'a pas de correspondance : absente
// Les mêmes quatre compétences, rangées de deux façons : un groupe C.U.R.I.E coupe un domaine en deux, et la sélection ne change pas d'un
// onglet à l'autre. Les valeurs de la colonne sont celles du vrai document (des numéros, « — aucune correspondance — »), pas des noms que
// j'aurais imaginés : c'est ce qui manquait en 1.38.0, où le menu montrait des numéros nus. Ce que le menu AFFICHE, avec le document tel
// qu'il est, est dans tests/e2e-curie-affichage.test.mjs.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { CURIE, sampleTables, withCurie } from './fixtures.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { skip, cardCount, cardNames, waitForCards, withWidget } from './support/browser.mjs';
import { groupedMenu, optionCounts } from './support/grouped-menu.mjs';

const skills = groupedMenu('competences');
const menu = skills.filter;
const tab = (page, grouping) => menu(page).locator(`.view-tab[data-grouping="${grouping}"]`);
const tabNames = page => menu(page).locator('.view-tab').allTextContents();
const shownTab = page => menu(page).locator('.view-tab[aria-selected="true"]').allTextContents();
const focused = page => page.evaluate(() => {
  const element = document.activeElement;
  return { role: element.getAttribute('role'), text: element.textContent.trim(), className: element.className, selected: element.getAttribute('aria-selected') };
});

const DOMAINS = ['Cancérologie', 'Pharmacie', 'Autres'];
// Les groupes sont les libellés des lignes 3 et 13 de la table du référentiel (tests/fixtures.mjs), pas leurs numéros (1.43.1).
const PROJET = CURIE.projet;
const INNOVATION = CURIE.innovation;
const GROUPS = [PROJET, INNOVATION];

// ===== Les onglets =====

test('avec la colonne C.U.R.I.E, le menu Compétences a deux onglets juste au-dessus de la recherche, « Classique » montré, et dessous rien n\'a changé', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    const bar = menu(page).locator('.view-tabs');
    assert.equal(await bar.getAttribute('role'), 'tablist');
    assert.equal(await bar.getAttribute('aria-label'), 'Rangement des compétences');
    assert.deepEqual(await tabNames(page), ['Classique', 'C.U.R.I.E'], '« Classique » à gauche : celui par lequel le menu s\'ouvre');
    assert.deepEqual(await shownTab(page), ['Classique']);

    const place = await menu(page).evaluate(filter => {
      const tabs = filter.querySelector('.view-tabs');
      const search = filter.querySelector('.filter-search-input');
      return {
        gap: search.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom,
        sameHead: tabs.parentElement === search.parentElement && tabs.parentElement.classList.contains('filter-menu-head'),
        tabsFirst: tabs.nextElementSibling === search
      };
    });
    assert.ok(place.gap >= 0 && place.gap <= 12, `les onglets sont juste au-dessus du champ de recherche (${place.gap} px)`);
    assert.equal(place.sameHead && place.tabsFirst, true, 'dans l\'en-tête collant, avec la recherche : ils restent en vue quand la liste défile');

    assert.deepEqual(await skills.groupNames(page), DOMAINS, 'le menu est celui d\'avant');
    assert.deepEqual(await skills.groupCounts(page), { Cancérologie: '1', Pharmacie: '0', Autres: '1' });
    assert.equal(await skills.search(page).getAttribute('placeholder'), 'Domaine ou compétence…');
    assert.match(await menu(page).locator('.filter-button').getAttribute('title'), /domaine/);

    const panel = menu(page).locator('.filter-groups');
    assert.equal(await panel.getAttribute('role'), 'tabpanel');
    assert.equal(await panel.getAttribute('aria-labelledby'), await tab(page, 'macro').getAttribute('id'), 'le panneau est nommé par l\'onglet montré');
    assert.equal(await tab(page, 'macro').getAttribute('aria-controls'), await panel.getAttribute('id'));
    assert.deepEqual(await Promise.all(['macro', 'curie'].map(grouping => tab(page, grouping).getAttribute('tabindex'))), ['0', '-1'],
      'un seul onglet dans l\'ordre de tabulation');
    assert.equal(await page.locator('.view-tabs').count(), 1, 'les autres menus n\'ont pas d\'onglets');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('les onglets sont ce qu\'un lecteur d\'écran lit : une liste d\'onglets nommée, dont l\'onglet montré est sélectionné', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    const tree = await accessibilityTree(page);
    assert.ok(accessibleNode(tree, 'tablist', 'Rangement des compétences'), 'la liste d\'onglets a un nom');
    assert.equal(accessibleNode(tree, 'tab', 'Classique')?.selected, true);
    assert.equal(accessibleNode(tree, 'tab', 'C.U.R.I.E')?.selected, false);
    await tab(page, 'curie').click();
    const after = await accessibilityTree(page);
    assert.equal(accessibleNode(after, 'tab', 'Classique')?.selected, false);
    assert.equal(accessibleNode(after, 'tab', 'C.U.R.I.E')?.selected, true);
    assert.ok(accessibleNode(after, 'tabpanel', 'C.U.R.I.E'), 'le panneau porte le nom de l\'onglet montré');
  }));

test('un clic sur « C.U.R.I.E » range les mêmes compétences par groupe, avec leur nombre de cartes, leur aide et leur recherche ; « Classique » ramène les domaines', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    assert.deepEqual(await shownTab(page), ['C.U.R.I.E']);
    assert.deepEqual(await skills.groupNames(page), GROUPS, 'dans l\'ordre des numéros, et rien pour « — aucune correspondance — »');
    assert.deepEqual(await skills.groupCounts(page), { [PROJET]: '1', [INNOVATION]: '1' },
      'Ana compte une fois pour chaque groupe ; Bob (groupe « innovation ») est masqué par défaut');
    assert.equal(await menu(page).locator('.filter-group').count(), 2, 'les domaines ne restent pas dans le menu : un onglet ne double pas les cases');
    assert.equal(await menu(page).locator('.filter-option').count(), 3, 'les trois compétences que C.U.R.I.E classe, chacune dans son groupe');
    assert.equal(await skills.search(page).getAttribute('placeholder'), 'Groupe ou compétence…');
    assert.match(await menu(page).locator('.filter-help').textContent(), /C\.U\.R\.I\.E/);
    assert.match(await menu(page).locator('.filter-button').getAttribute('title'), /C\.U\.R\.I\.E/, 'l\'infobulle du bouton suit l\'onglet');
    assert.equal(await menu(page).evaluate(filter => filter.classList.contains('open')), true, 'changer d\'onglet ne ferme pas le menu');
    assert.equal(await menu(page).locator('.filter-menu').getAttribute('data-grouping'), 'curie');
    assert.equal(await menu(page).locator('.filter-groups').getAttribute('aria-labelledby'), await tab(page, 'curie').getAttribute('id'));
    assert.deepEqual(await Promise.all(['macro', 'curie'].map(grouping => tab(page, grouping).getAttribute('tabindex'))), ['-1', '0']);

    await skills.toggle(page, INNOVATION).click();
    assert.deepEqual(await skills.visibleItems(page), ['Hématologie', 'Pharmacovigilance']);
    assert.deepEqual(await optionCounts(skills.group(page, INNOVATION)), { Hématologie: '1', Pharmacovigilance: '0' });

    await tab(page, 'macro').click();
    assert.deepEqual(await shownTab(page), ['Classique']);
    assert.deepEqual(await skills.groupNames(page), DOMAINS);
    assert.deepEqual(await skills.groupCounts(page), { Cancérologie: '1', Pharmacie: '0', Autres: '1' });
    assert.equal(await menu(page).locator('.filter-group').count(), 3);
    assert.equal(await skills.search(page).getAttribute('placeholder'), 'Domaine ou compétence…');
    assert.match(await menu(page).locator('.filter-button').getAttribute('title'), /domaine/);
    assert.equal(await cardCount(page), 4, 'changer d\'onglet ne filtre rien');
  }));

// ===== Une seule sélection, deux rangements =====

test('la sélection est la même dans les deux onglets : un groupe C.U.R.I.E coché montre ses compétences cochées et un domaine à moitié coché, le badge compte comme l\'onglet', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    await skills.box(page, INNOVATION).check(); // Hématologie et Pharmacovigilance
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin'], 'Bob, qui a Pharmacovigilance, est un partenaire : masqué par défaut');
    assert.equal(await skills.badge(page).textContent(), '1', 'un groupe entier compte pour 1, comme un domaine');

    await tab(page, 'macro').click();
    assert.equal(await skills.badge(page).textContent(), '2', 'Hématologie, et le domaine Pharmacie, entier à lui seul');
    assert.equal(await skills.box(page, 'Cancérologie').evaluate(box => box.indeterminate), true, 'le domaine est à moitié coché');
    assert.equal(await skills.box(page, 'Pharmacie').isChecked(), true);
    assert.equal(await skills.box(page, 'Autres').isChecked(), false);
    assert.equal(await skills.toggle(page, 'Cancérologie').getAttribute('aria-expanded'), 'true', 'à moitié coché : déplié pour montrer lesquelles');
    assert.equal(await skills.item(page, 'Hématologie').locator('input').isChecked(), true);
    assert.equal(await skills.item(page, 'Oncologie').locator('input').isChecked(), false);
    assert.equal(await cardCount(page), 1, 'les cartes ne bougent pas : la sélection est la même');
    assert.equal(await menu(page).locator('.filter-button').getAttribute('aria-label'), 'Compétences (2 sélectionnés)', 'le nom du bouton dit le nombre');

    await skills.item(page, 'Oncologie').locator('input').check();
    await tab(page, 'curie').click();
    assert.equal(await skills.box(page, PROJET).isChecked(), true);
    assert.equal(await skills.box(page, INNOVATION).isChecked(), true);
    assert.equal(await skills.badge(page).textContent(), '2', 'deux groupes entiers');
    assert.equal(await menu(page).locator('.filter-button').getAttribute('aria-label'), 'Compétences (2 sélectionnés)');

    await skills.box(page, INNOVATION).uncheck();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin'], 'Oncologie reste cochée');
    await tab(page, 'macro').click();
    assert.equal(await skills.box(page, 'Cancérologie').evaluate(box => box.indeterminate), true, 'Hématologie décochée : le domaine n\'a plus qu\'Oncologie');
    assert.equal(await skills.box(page, 'Pharmacie').isChecked(), false);
  }));

test('les nombres des groupes C.U.R.I.E tiennent compte de l\'interrupteur Partenaires et des autres filtres, pas des compétences cochées', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    await page.mouse.click(5, 5);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    assert.deepEqual(await skills.groupCounts(page), { [PROJET]: '1', [INNOVATION]: '2' }, 'Bob, partenaire, compte pour le groupe « innovation »');

    await skills.open(page);
    await skills.box(page, PROJET).check();
    await waitForCards(page, 1);
    assert.deepEqual(await skills.groupCounts(page), { [PROJET]: '1', [INNOVATION]: '2' },
      'cocher un groupe ne vide pas le nombre des autres : ce nombre dit ce que donnerait chaque case');
    await page.mouse.click(5, 5);
    await page.locator('.contact-card').first().locator('.etablissement-tag').click(); // Établissement : CHU
    await waitForCards(page, 1);
    assert.deepEqual(await skills.groupCounts(page), { [PROJET]: '1', [INNOVATION]: '1' }, 'un autre filtre s\'applique aux groupes');
  }));

test('un tag de carte coche la compétence dans l\'onglet montré, et à l\'ouverture suivante son groupe passe devant', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    await page.mouse.click(5, 5);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    await page.locator('.contact-card', { hasText: 'Bob Durand' }).locator('.tag-competences').click(); // Pharmacovigilance
    await waitForCards(page, 1);
    assert.equal(await skills.badge(page).textContent(), '1');
    assert.equal(await skills.box(page, INNOVATION).evaluate(box => box.indeterminate), true, 'Pharmacovigilance est l\'une des deux compétences du groupe');
    assert.equal(await skills.box(page, INNOVATION).isChecked(), false);

    await skills.open(page);
    assert.deepEqual(await skills.groupNames(page), [INNOVATION, PROJET], 'le groupe qui contient une coche passe devant');
    assert.equal(await skills.toggle(page, INNOVATION).getAttribute('aria-expanded'), 'true', 'à moitié coché : déplié pour montrer laquelle');
    assert.deepEqual(await skills.visibleItems(page), ['Pharmacovigilance', 'Hématologie'], 'la compétence cochée passe devant l\'autre');
  }));

// ===== La recherche, le clavier, la mémoire du menu =====

test('la recherche déjà tapée s\'applique à l\'autre onglet : un groupe qui correspond garde toutes ses compétences, un autre seulement celles qui correspondent', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    const search = skills.search(page);
    await search.fill('hemato');
    assert.deepEqual(await skills.visibleGroups(page), ['Cancérologie']);
    assert.deepEqual(await skills.visibleItems(page), ['Hématologie']);

    await tab(page, 'curie').click();
    assert.equal(await search.inputValue(), 'hemato', 'ce qui est tapé reste dans le champ');
    assert.deepEqual(await skills.visibleGroups(page), [INNOVATION]);
    assert.deepEqual(await skills.visibleItems(page), ['Hématologie'], 'le groupe situe la compétence, seule elle reste');
    assert.equal(await menu(page).locator('.filter-menu').evaluate(element => element.classList.contains('searching')), true);

    await search.fill('gestion de projet'); // le nom d'un groupe : il garde toutes ses compétences
    assert.deepEqual(await skills.visibleGroups(page), [PROJET]);
    assert.deepEqual(await skills.visibleItems(page), ['Oncologie']);

    await tab(page, 'macro').click();
    assert.deepEqual(await skills.visibleGroups(page), [], 'aucun domaine ni compétence ne s\'appelle ainsi');

    await search.fill('');
    assert.deepEqual(await skills.visibleGroups(page), DOMAINS);
    assert.deepEqual(await skills.visibleItems(page), [], 'sans recherche, chaque domaine retrouve son état : tous repliés');
    assert.equal(await skills.badge(page).isHidden(), true, 'chercher ou changer d\'onglet ne coche rien');
    assert.equal(await cardCount(page), 4);
  }));

test('au clavier, les flèches, Début et Fin passent d\'un onglet à l\'autre et le montrent ; Tab quitte les onglets pour la recherche, puis les groupes', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await menu(page).locator('.filter-button').focus();
    await page.keyboard.press('Enter'); // ouvre le menu
    await page.keyboard.press('Tab');
    assert.deepEqual(await focused(page), { role: 'tab', text: 'Classique', className: 'view-tab', selected: 'true' }, 'le focus arrive sur l\'onglet montré, avant la recherche');

    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await focused(page), { role: 'tab', text: 'C.U.R.I.E', className: 'view-tab', selected: 'true' }, 'la flèche montre l\'onglet en même temps qu\'elle y va');
    assert.deepEqual(await skills.groupNames(page), GROUPS);
    await page.keyboard.press('ArrowRight');
    assert.equal((await focused(page)).text, 'Classique', 'après le dernier onglet, le premier');
    await page.keyboard.press('ArrowLeft');
    assert.equal((await focused(page)).text, 'C.U.R.I.E', 'avant le premier, le dernier');
    await page.keyboard.press('Home');
    assert.deepEqual([(await focused(page)).text, await skills.groupNames(page)], ['Classique', DOMAINS]);
    await page.keyboard.press('End');
    assert.deepEqual([(await focused(page)).text, await skills.groupNames(page)], ['C.U.R.I.E', GROUPS]);
    assert.deepEqual(await Promise.all(['macro', 'curie'].map(grouping => tab(page, grouping).getAttribute('tabindex'))), ['-1', '0']);

    await page.keyboard.press('Tab');
    assert.equal((await focused(page)).className, 'filter-search-input', 'l\'autre onglet n\'est pas dans l\'ordre de tabulation');
    await page.keyboard.press('Shift+Tab');
    assert.deepEqual([(await focused(page)).role, (await focused(page)).text], ['tab', 'C.U.R.I.E'], 'Maj+Tab revient à l\'onglet montré');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.filter-group')?.dataset.value), PROJET, 'puis la case du premier groupe de l\'onglet');
    await page.keyboard.press('Space');
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);
  }));

test('un autre geste que les flèches ne change pas d\'onglet : Entrée et Espace sur un onglet le montrent comme un clic, une touche quelconque n\'y touche pas', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await menu(page).locator('.filter-button').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('a');
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await shownTab(page), ['Classique']);
    assert.equal((await focused(page)).text, 'Classique');
    await tab(page, 'curie').focus();
    await page.keyboard.press('Enter'); // activer le bouton : comme un clic
    assert.deepEqual(await shownTab(page), ['C.U.R.I.E']);
    await tab(page, 'macro').focus();
    await page.keyboard.press('Space');
    assert.deepEqual(await shownTab(page), ['Classique']);
  }));

test('un menu reconstruit s\'ouvre sur l\'onglet que la personne avait choisi, et sans la sélection effacée par « Réinitialiser »', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    await tab(page, 'curie').click();
    await skills.box(page, PROJET).check();
    await waitForCards(page, 1);
    await page.mouse.click(5, 5);

    await page.click('#resetFilters'); // reconstruit les menus
    await waitForCards(page, 4);
    assert.match(await menu(page).locator('.filter-button').getAttribute('title'), /C\.U\.R\.I\.E/, 'l\'infobulle du bouton est celle de l\'onglet');
    await skills.open(page);
    assert.deepEqual(await shownTab(page), ['C.U.R.I.E'], 'le menu reconstruit revient sur le même onglet, pas sur le premier');
    assert.deepEqual(await skills.groupNames(page), GROUPS);
    assert.equal(await skills.badge(page).isHidden(), true);
    assert.equal(await skills.box(page, PROJET).isChecked(), false);

    await tab(page, 'macro').click();
    await page.mouse.click(5, 5);
    await page.click('[data-scope="partenaire"]'); // reconstruit les menus : la liste des établissements change
    await waitForCards(page, 5);
    await skills.open(page);
    assert.deepEqual(await shownTab(page), ['Classique'], 'le dernier choix est celui qu\'on retrouve');
    assert.deepEqual(await skills.groupCounts(page), { Cancérologie: '1', Pharmacie: '1', Autres: '1' });
  }));

// ===== Sans C.U.R.I.E, le menu est celui d'avant =====

// Les lignes que le widget écrit dans la console : le texte seulement.
const consoleLines = logs => Promise.all([...logs.warnings, ...logs.infos]);

test('sans la colonne referenciel_C_U_R_I_E, le menu Compétences n\'a pas d\'onglets : ni bandeau, ni avertissement, une ligne dans la console', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    assert.equal(await page.locator('.view-tabs, .view-tab, [role="tablist"], [role="tab"], [role="tabpanel"]').count(), 0);
    assert.equal(await menu(page).locator('.filter-menu').evaluate(element => element.classList.contains('has-tabs')), false);
    assert.deepEqual(await skills.groupNames(page), DOMAINS);
    assert.equal(await skills.search(page).getAttribute('placeholder'), 'Domaine ou compétence…');
    assert.equal(await page.locator('#statusBanner').isHidden(), true, 'une colonne facultative n\'est pas une anomalie');
    const lines = await consoleLines(logs);
    assert.ok(!(await Promise.all(logs.warnings)).some(line => /C_U_R_I_E|C\.U\.R\.I\.E/.test(line)), 'aucun avertissement');
    assert.ok(lines.some(line => line.includes('referenciel_C_U_R_I_E')), 'mais la console dit pourquoi il n\'y a pas d\'onglet');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la colonne referenciel_C_U_R_I_E laissée vide ne donne pas d\'onglets non plus : un groupe unique avec toutes les compétences n\'aiderait personne', { skip }, () => {
  const tables = withCurie();
  tables.Competences.referenciel_C_U_R_I_E = ['', '', '', ''];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    assert.equal(await page.locator('.view-tab').count(), 0);
    assert.deepEqual(await skills.groupNames(page), DOMAINS);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.ok((await consoleLines(logs)).some(line => line.includes('referenciel_C_U_R_I_E') && line.includes('vide')), 'la console dit que la colonne est vide');
  });
});

test('sans la colonne des domaines, C.U.R.I.E ne devient pas tout le menu : il laisse des compétences de côté, le menu reste à plat avec toutes les compétences', { skip }, () => {
  const tables = withCurie();
  delete tables.Competences.Macro_competences;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await skills.open(page);
    assert.equal(await page.locator('.view-tab').count(), 0, 'un onglet seul ne choisit rien');
    assert.equal(await menu(page).locator('.filter-group').count(), 0, 'pas de groupes : un menu rangé par C.U.R.I.E seul perdrait Divers');
    assert.deepEqual(await menu(page).locator('.filter-option .option-label').allTextContents(),
      ['Divers', 'Hématologie', 'Oncologie', 'Pharmacovigilance'], 'les quatre compétences, dont celle que C.U.R.I.E ne classe pas');
    await menu(page).locator('.filter-option', { hasText: 'Divers' }).locator('input').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Gina Bergonié'], 'et on peut la cocher');
  });
});

test('le menu Actions et les autres n\'ont pas d\'onglets, même avec la colonne C.U.R.I.E', { skip }, () =>
  withWidget({ tables: withCurie() }, async ({ page }) => {
    await waitForCards(page, 4);
    for (const key of ['taches', 'communautes', 'gt', 'instances', 'etablissement', 'role']) {
      assert.equal(await page.locator(`.filter[data-filter-key="${key}"] .view-tabs`).count(), 0, key);
    }
    assert.equal(await page.locator('.filter[data-filter-key="curie"]').count(), 0, 'pas de bouton de filtre « C.U.R.I.E » de plus');
    assert.deepEqual(await page.locator('.filter-button > span:nth-child(2)').allTextContents(),
      ['Actions', 'Communautés', 'GT', 'Compétences', 'Instances', 'Établissement', 'Rôle dans le PUI']);
    assert.equal(await page.locator('.contact-card .tag-curie, .tag-group-title:has-text("C.U.R.I.E")').count(), 0, 'aucune pastille de plus sur les cartes');
  }));

// ===== La mise en page =====

for (const [width, touch] of [[280, false], [320, false], [390, true], [1200, false]]) {
  test(`à ${width}px${touch ? ' au doigt' : ''}, les onglets tiennent dans le menu, lisibles, assez grands, et l'en-tête collant a la hauteur que la feuille de style réserve`, { skip }, () =>
    withWidget({
      tables: withCurie(),
      contextOptions: { viewport: { width, height: 800 }, ...(touch ? { hasTouch: true, isMobile: true } : {}) }
    }, async ({ page }) => {
      await waitForCards(page, 4);
      await skills.open(page);
      const seen = await menu(page).evaluate(filter => {
        const box = element => element.getBoundingClientRect();
        const dialog = filter.querySelector('.filter-menu');
        const head = filter.querySelector('.filter-menu-head');
        const bar = filter.querySelector('.view-tabs');
        return {
          menu: { left: box(dialog).left, right: box(dialog).right },
          bar: { left: box(bar).left, right: box(bar).right },
          tabs: [...filter.querySelectorAll('.view-tab')].map(element => ({
            left: box(element).left, right: box(element).right, height: box(element).height, clipped: element.scrollWidth > element.clientWidth
          })),
          headHeight: box(head).height,
          reserved: parseFloat(getComputedStyle(dialog).getPropertyValue('--menu-head')),
          viewport: document.documentElement.clientWidth
        };
      });
      assert.ok(seen.menu.left >= -0.5 && seen.menu.right <= seen.viewport + 0.5, `le menu tient dans le cadre : ${seen.menu.left} à ${seen.menu.right} sur ${seen.viewport}`);
      seen.tabs.forEach(item => {
        assert.ok(item.left >= seen.bar.left - 0.5 && item.right <= seen.bar.right + 0.5, 'un onglet ne sort pas de sa barre');
        assert.equal(item.clipped, false, 'le texte d\'un onglet n\'est pas coupé');
        assert.ok(item.height >= (touch ? 40 : 24), `un onglet fait ${item.height}px de haut`);
      });
      assert.ok(Math.abs(seen.headHeight - seen.reserved) <= 1.5, `l'en-tête fait ${seen.headHeight}px, la feuille de style en réserve ${seen.reserved}px (--menu-head)`);
    }));
}
