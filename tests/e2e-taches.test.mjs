// Test navigateur du menu Tâches rangé par action : charge le vrai index.html dans Chromium,
// avec le faux document Grist de tests/support/fake-grist.js, et vérifie ce que voit la
// personne. Le menu est celui des compétences rangées par domaine (e2e.test.mjs) : une case
// par action, qui coche toutes ses tâches, un bouton qui déplie le détail, une recherche qui
// trouve une action comme une tâche. Ce fichier vérifie que les tâches s'en servent bien, et
// que ni le filtre Actions ni le menu Compétences n'en sont changés.
//
// Aucune colonne ne relie une tâche à son action : le numéro avant le point du libellé de la
// tâche (« 1.2 Rappel vaccinal ») est celui de l'action (« Action 1 : Vaccination »).
//
// Avec withTaskActions (tests/fixtures.mjs), périmètre par défaut ; Bob est partenaire :
//   Action 1 : Vaccination  → 1.1 Relecture (Ana), 1.2 Rappel vaccinal (Gina)
//   Action 2 : Audit        → 2.1 Inspection (Ana, Bob)
//   Sans action             → Veille (Hugo), une tâche sans numéro
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTaskActions, withIdentity, ANA_EMAIL } from './fixtures.mjs';
import { skip, reload, waitForCards, cardNames, withWidget } from './support/browser.mjs';
import { groupedMenu, optionCounts } from './support/grouped-menu.mjs';

const tasks = groupedMenu('taches');
const skills = groupedMenu('competences');
const actionsFilter = page => page.locator('.filter[data-filter-key="actions"]');

const VACCINATION = 'Action 1 : Vaccination';
const AUDIT = 'Action 2 : Audit';
const NONE = 'Sans action';
const RELECTURE = '1.1 Relecture';
const RAPPEL = '1.2 Rappel vaccinal';
const INSPECTION = '2.1 Inspection';
const VEILLE = 'Veille';
const ANA = 'Ana Martin';
const BOB = 'Bob Durand';
const GINA = 'Gina Bergonié';
const HUGO = 'Hugo Bernard';

const COUNTS = { [VACCINATION]: '2', [AUDIT]: '1', [NONE]: '1' };

// Les cartes sont triées par nom de famille (Bergonié, Bernard, Durand, Martin) : une carte se
// retrouve par le nom qu'elle affiche, pas par sa place.
const cardOf = (page, name) => page.locator('.contact-card').filter({ has: page.locator('.name', { hasText: name }) });

// Les lignes que le widget écrit dans la console : le texte seulement.
const consoleLines = async logs => (await Promise.all([...logs.warnings, ...logs.infos]));

// ===== Le menu : des actions repliées, « Sans action » en dernier =====

test('la barre garde sept boutons : les actions rangent le menu Tâches sans avoir le leur, et le filtre Actions ne change pas', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await page.locator('.filter-button > span:nth-child(2)').allTextContents(),
      ['Actions', 'Tâches', 'Communautés', 'GT', 'Compétences', 'Instances', 'Établissement']);
    assert.equal(await page.locator('.filter[data-filter-key="macroTaches"]').count(), 0);
    assert.match(await tasks.filter(page).locator('.filter-button').getAttribute('title'), /action/);
    assert.equal(await tasks.search(page).getAttribute('placeholder'), 'Action ou tâche…');

    assert.equal(await actionsFilter(page).locator('.filter-group').count(), 0, 'le filtre Actions reste à plat');
    assert.deepEqual(await actionsFilter(page).locator('.filter-option .option-label').allTextContents(), [VACCINATION, AUDIT]);
    assert.equal(await actionsFilter(page).locator('.filter-search-input').getAttribute('placeholder'), 'Rechercher dans Actions…');
    assert.equal(await actionsFilter(page).locator('.filter-button').getAttribute('title'), null);
  }));

test('le menu Tâches range les tâches par action, repliées, « Sans action » en dernier, avec le nombre de cartes de chacune', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    assert.deepEqual(await tasks.groupNames(page), [VACCINATION, AUDIT, NONE],
      'les actions dans l\'ordre de leur numéro ; la tâche sans numéro est sous « Sans action », en dernier');
    assert.deepEqual(await tasks.groupCounts(page), COUNTS,
      'Ana compte une fois pour chaque action ; Bob (Action 2) est masqué par défaut');
    assert.deepEqual(await tasks.visibleGroups(page), [VACCINATION, AUDIT, NONE]);
    assert.deepEqual(await tasks.visibleItems(page), [], 'le détail est replié au départ');
    assert.equal(await tasks.filter(page).locator('.filter-group.open').count(), 0);
    assert.equal(await tasks.filter(page).locator('.filter-menu').evaluate(menu => getComputedStyle(menu).display), 'block');
  }));

test('déplier une action montre ses tâches et leur nombre de cartes, la replier les cache, et le menu reste ouvert', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    const toggle = tasks.toggle(page, VACCINATION);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await tasks.visibleItems(page), [RELECTURE, RAPPEL], 'celles de cette action seulement, dans l\'ordre de leur numéro');
    assert.deepEqual(await optionCounts(tasks.group(page, VACCINATION)), { [RELECTURE]: '1', [RAPPEL]: '1' });
    assert.equal(await tasks.filter(page).evaluate(filter => filter.classList.contains('open')), true, 'cliquer dans le menu ne le referme pas');

    await tasks.toggle(page, NONE).click();
    assert.deepEqual(await tasks.visibleItems(page), [RELECTURE, RAPPEL, VEILLE], 'deux actions dépliées ensemble');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await tasks.visibleItems(page), [VEILLE]);
  }));

// ===== Cocher : une action entière, une tâche, les deux =====

test('cocher une action coche toutes ses tâches : ses cartes, un badge à 1, et la case se décoche d\'un clic', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.box(page, VACCINATION).check();
    await waitForCards(page, 2);
    assert.deepEqual(await cardNames(page), [GINA, ANA]);
    assert.equal(await tasks.badge(page).textContent(), '1', 'une action : « 1 », pas « 2 » comme ses deux tâches');
    assert.equal(await tasks.box(page, VACCINATION).isChecked(), true);
    assert.equal(await tasks.box(page, VACCINATION).evaluate(box => box.indeterminate), false);
    assert.equal(await tasks.filter(page).locator('.filter-option input:checked').count(), 2, 'ses deux tâches sont cochées');
    assert.equal(await tasks.box(page, AUDIT).isChecked(), false);
    assert.equal(await actionsFilter(page).locator('input:checked').count(), 0, 'le filtre Actions n\'est pas touché');
    assert.equal(await tasks.filter(page).evaluate(filter => filter.classList.contains('open')), true);

    await tasks.box(page, VACCINATION).uncheck();
    await waitForCards(page, 4);
    assert.equal(await tasks.badge(page).isHidden(), true);
    assert.equal(await tasks.filter(page).locator('.filter-option input:checked').count(), 0);
  }));

test('cocher une seule tâche rend la case de son action partielle ; un clic sur cette case complète l\'action', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.toggle(page, VACCINATION).click();
    await tasks.item(page, 'Relecture').locator('input').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), [ANA]);
    assert.equal(await tasks.badge(page).textContent(), '1');
    assert.equal(await tasks.box(page, VACCINATION).evaluate(box => box.indeterminate), true, 'case partielle');
    assert.equal(await tasks.box(page, VACCINATION).isChecked(), false);

    await tasks.box(page, VACCINATION).click(); // une case partielle se complète
    await waitForCards(page, 2);
    assert.equal(await tasks.box(page, VACCINATION).isChecked(), true);
    assert.equal(await tasks.box(page, VACCINATION).evaluate(box => box.indeterminate), false);
    assert.equal(await tasks.badge(page).textContent(), '1', 'l\'action entière compte pour 1');

    await tasks.item(page, 'Rappel vaccinal').locator('input').uncheck();
    await waitForCards(page, 1);
    assert.equal(await tasks.box(page, VACCINATION).evaluate(box => box.indeterminate), true, 'décocher une tâche rend la case partielle');
    assert.equal(await tasks.badge(page).textContent(), '1', 'une tâche restante');
  }));

test('les actions et les tâches s\'additionnent (OU), et le tout se cumule (ET) avec les autres filtres, le menu Compétences compris', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.box(page, NONE).check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), [HUGO]);
    await tasks.toggle(page, VACCINATION).click();
    await tasks.item(page, 'Rappel vaccinal').locator('input').check();
    await waitForCards(page, 2);
    assert.deepEqual(await cardNames(page), [GINA, HUGO], 'OU entre une action et une tâche d\'une autre action');
    assert.equal(await tasks.badge(page).textContent(), '2');

    await page.mouse.click(5, 5);
    await page.locator('.contact-card', { hasText: 'Gina' }).locator('.tag-competences').click(); // Compétences : Divers
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), [GINA], 'ET avec le menu Compétences');
  }));

test('le filtre Actions reste un filtre à part, qui se cumule (ET) avec le menu Tâches sans que l\'un coche l\'autre', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.box(page, VACCINATION).check(); // les tâches de l'action 1 : Ana et Gina
    await waitForCards(page, 2);
    await page.mouse.click(5, 5);

    await actionsFilter(page).locator('.filter-button').click();
    await actionsFilter(page).locator('.filter-option', { hasText: 'Vaccination' }).locator('input').check(); // la fiche d'Ana
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), [ANA], 'ET entre le filtre Actions et le menu Tâches');
    assert.equal(await actionsFilter(page).locator('.filter-count').textContent(), '1');
    assert.equal(await tasks.badge(page).textContent(), '1');
    assert.equal(await tasks.box(page, VACCINATION).isChecked(), true, 'cocher l\'action d\'une fiche ne décoche pas les tâches de l\'action');
  }));

// ===== Les nombres, la recherche, les tags =====

test('les nombres des actions tiennent compte de l\'interrupteur Partenaires et des autres filtres, pas des tâches cochées', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await tasks.groupCounts(page), COUNTS);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    const withPartners = { [VACCINATION]: '2', [AUDIT]: '2', [NONE]: '1' };
    assert.deepEqual(await tasks.groupCounts(page), withPartners, 'Bob, partenaire, compte pour l\'action 2');

    await tasks.open(page);
    await tasks.box(page, AUDIT).check();
    await waitForCards(page, 2);
    assert.deepEqual(await cardNames(page), [BOB, ANA]);
    assert.deepEqual(await tasks.groupCounts(page), withPartners,
      'cocher l\'action 2 ne vide pas le nombre des autres actions : ce nombre dit ce que donnerait chaque case');

    // Le menu ouvert recouvrirait la carte de Bob, la première depuis que les cartes sont triées par nom.
    await page.mouse.click(5, 5);
    await cardOf(page, BOB).locator('.etablissement-tag').click(); // Établissement : UBM
    await waitForCards(page, 1);
    assert.deepEqual(await tasks.groupCounts(page), { [VACCINATION]: '0', [AUDIT]: '1', [NONE]: '0' }, 'un autre filtre s\'applique aux actions');
  }));

test('la recherche du menu Tâches trouve une action, une tâche ou un numéro, sans tenir compte des accents ni de la casse', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    const search = tasks.search(page);

    await search.fill('VACCIN'); // le nom d'une action : elle garde toutes ses tâches
    assert.deepEqual(await tasks.visibleGroups(page), [VACCINATION]);
    assert.deepEqual(await tasks.visibleItems(page), [RELECTURE, RAPPEL], 'l\'action trouvée est dépliée, avec tout son détail');

    await search.fill('rappel'); // le nom d'une tâche : son action la situe, seule elle reste
    assert.deepEqual(await tasks.visibleGroups(page), [VACCINATION]);
    assert.deepEqual(await tasks.visibleItems(page), [RAPPEL]);

    await search.fill('2.1'); // le numéro d'une tâche
    assert.deepEqual(await tasks.visibleGroups(page), [AUDIT]);
    assert.deepEqual(await tasks.visibleItems(page), [INSPECTION]);

    await search.fill('action 2'); // le numéro d'une action : toutes ses tâches
    assert.deepEqual(await tasks.visibleGroups(page), [AUDIT]);
    assert.deepEqual(await tasks.visibleItems(page), [INSPECTION]);

    await search.fill('SANS ACTION'); // le groupe de repli se trouve comme les autres
    assert.deepEqual(await tasks.visibleGroups(page), [NONE]);
    assert.deepEqual(await tasks.visibleItems(page), [VEILLE]);

    await search.fill('zzz');
    assert.deepEqual(await tasks.visibleGroups(page), []);

    await search.fill('');
    assert.deepEqual(await tasks.visibleGroups(page), [VACCINATION, AUDIT, NONE]);
    assert.deepEqual(await tasks.visibleItems(page), [], 'sans recherche, chaque action retrouve son état : toutes repliées');
    assert.equal(await tasks.badge(page).isHidden(), true, 'chercher ne coche rien');
    assert.equal((await cardNames(page)).length, 4);
  }));

test('un tag de carte coche la tâche, et à l\'ouverture suivante son action passe devant', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('.contact-card', { hasText: 'Hugo' }).locator('.tag-taches').click(); // Veille
    await waitForCards(page, 1);
    assert.equal(await tasks.badge(page).textContent(), '1');
    assert.equal(await tasks.box(page, NONE).isChecked(), true, 'Veille est la seule tâche de son groupe : l\'action est complète');

    await tasks.open(page);
    assert.deepEqual(await tasks.groupNames(page), [NONE, VACCINATION, AUDIT], 'l\'action qui contient une coche passe devant');
    assert.equal(await tasks.group(page, NONE).evaluate(group => group.classList.contains('open')), false,
      'une action complète reste repliée : sa case dit tout');
  }));

test('Réinitialiser décoche les actions, referme le détail et vide la recherche du menu Tâches', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.box(page, AUDIT).check();
    await tasks.toggle(page, AUDIT).click();
    await tasks.search(page).fill('insp');
    await waitForCards(page, 1);

    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await tasks.badge(page).isHidden(), true);
    assert.equal(await tasks.search(page).inputValue(), '');
    await tasks.open(page);
    assert.deepEqual(await tasks.visibleGroups(page), [VACCINATION, AUDIT, NONE]);
    assert.deepEqual(await tasks.visibleItems(page), [], 'toutes les actions sont repliées');
    assert.equal(await tasks.filter(page).locator('input:checked, input:indeterminate').count(), 0);
  }));

// ===== Les données changent dans Grist =====

test('une modification dans Grist (une action renommée, renumérotée, une tâche renumérotée) met le menu à jour, et la sélection suit la tâche tant que son libellé ne change pas', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    await tasks.open(page);
    await tasks.toggle(page, AUDIT).click();
    await tasks.item(page, 'Inspection').locator('input').check();
    await waitForCards(page, 2);
    assert.deepEqual(await cardNames(page), [BOB, ANA]);

    const RENAMED = 'Action 2 : Contrôle';
    await page.evaluate(label => { window.__tables.Actions.Actions[1] = label; }, RENAMED);
    await reload(page);
    await page.waitForFunction(label => document.querySelector(`.filter-group[data-value="${label}"]`), RENAMED);
    assert.deepEqual(await tasks.groupNames(page), [VACCINATION, RENAMED, NONE], 'l\'action renommée');
    assert.equal(await tasks.badge(page).textContent(), '1', 'la tâche cochée l\'est toujours');
    assert.deepEqual(await cardNames(page), [BOB, ANA]);

    // Le numéro de l'action change, celui de la tâche non : « 2.1 Inspection » n'a plus d'action.
    await page.evaluate(() => { window.__tables.Actions.Actions[1] = 'Action 3 : Contrôle'; });
    await reload(page);
    await page.waitForFunction(label => !document.querySelector(`.filter-group[data-value="${label}"]`), RENAMED);
    assert.deepEqual(await tasks.groupNames(page), [VACCINATION, NONE], 'plus de tâche dans l\'action 2 : plus de groupe');
    assert.equal(await tasks.item(page, 'Inspection').locator('input').isChecked(), true, 'reclassée sous « Sans action », toujours cochée');
    assert.equal(await tasks.group(page, NONE).locator('.filter-option', { hasText: 'Inspection' }).count(), 1);
    assert.deepEqual(await cardNames(page), [BOB, ANA]);

    // Le libellé de la tâche change : comme pour tout libellé renommé dans Grist, la coche tombe.
    await page.evaluate(() => { window.__tables.Taches.Taches_corrige[2] = '1.3 Inspection'; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('.filter-group[data-value="Action 1 : Vaccination"] .filter-option[data-value="1.3 Inspection"]'));
    assert.deepEqual(await tasks.groupNames(page), [VACCINATION, NONE]);
    assert.equal(await tasks.group(page, VACCINATION).locator('.filter-option', { hasText: 'Inspection' }).count(), 1, 'rangée sous l\'action 1');
    assert.equal(await tasks.badge(page).isHidden(), true, 'l\'ancien libellé n\'existe plus : la sélection est retirée, pas bloquée sur 0 carte');
    await waitForCards(page, 5);
  }));

test('quand une action est complète et que Grist renomme une action, le menu est reconstruit : elle reste cochée et le badge compte toujours un', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.box(page, VACCINATION).check();
    await waitForCards(page, 2);

    const RENAMED = 'Action 2 : Contrôle';
    await page.evaluate(label => { window.__tables.Actions.Actions[1] = label; }, RENAMED);
    await reload(page);
    await page.waitForFunction(label => document.querySelector(`.filter-group[data-value="${label}"]`), RENAMED);
    assert.equal(await tasks.badge(page).textContent(), '1');
    assert.equal(await tasks.box(page, VACCINATION).isChecked(), true);
    assert.deepEqual(await cardNames(page), [GINA, ANA]);
  }));

// ===== Sans numéro, le menu reste à plat =====

const FLAT_TASKS = [INSPECTION, RAPPEL, RELECTURE, VEILLE].sort((a, b) => a.localeCompare(b, 'fr-FR', { numeric: true }));

// Les trois façons de ne rien pouvoir ranger : aucune action numérotée, aucune tâche numérotée,
// aucun numéro en commun.
function unrankableTables() {
  const unnumberedActions = withTaskActions();
  unnumberedActions.Actions.Actions = ['Vaccination', 'Audit'];
  const unnumberedTasks = withTaskActions();
  unnumberedTasks.Taches.Taches = ['Relecture', 'Rappel vaccinal', 'Inspection', 'Veille'];
  unnumberedTasks.Taches.Taches_corrige = ['', '', '', ''];
  const noCommonNumber = withTaskActions();
  noCommonNumber.Taches.Taches = ['7.1 Relecture', '7.2 Rappel vaccinal', '8.1 Inspection', '8.2 Veille'];
  noCommonNumber.Taches.Taches_corrige = ['', '', '', ''];
  return { 'aucune action numérotée': unnumberedActions, 'aucune tâche numérotée': unnumberedTasks, 'aucun numéro en commun': noCommonNumber };
}

for (const [name, tables] of Object.entries(unrankableTables())) {
  test(`${name} : le menu Tâches reste à plat, sans bandeau ni texte d'action, et la console dit pourquoi`, { skip }, () =>
    withWidget({ tables }, async ({ page, logs }) => {
      await waitForCards(page, 4);
      assert.equal(await page.locator('#statusBanner').isHidden(), true, 'ce n\'est pas une anomalie : pas de bandeau');
      assert.equal(await tasks.filter(page).locator('.filter-group').count(), 0, 'pas de faux groupe « Sans action » pour tout le monde');
      assert.equal(await tasks.filter(page).locator('.filter-option').count(), 4, 'les quatre tâches, à plat');
      assert.equal(await tasks.search(page).getAttribute('placeholder'), 'Rechercher dans Tâches…');
      assert.equal(await tasks.filter(page).locator('.filter-button').getAttribute('title'), null, 'aucune action à cocher : pas d\'infobulle qui en parle');

      await tasks.open(page);
      await tasks.item(page, 'Relecture').locator('input').check();
      await waitForCards(page, 1);
      assert.deepEqual(await cardNames(page), [ANA]);
      assert.equal(await tasks.badge(page).textContent(), '1');
      assert.equal(await skills.filter(page).locator('.filter-group').count(), 3, 'le menu Compétences reste rangé par domaine');
      assert.deepEqual(await Promise.all(logs.errors), []);
      assert.ok((await consoleLines(logs)).some(line => line.includes('Taches') && line.includes('le menu reste à plat')), 'la console le dit');
    }));
}

test('sans action ni tâche numérotée, comme dans la base de départ, le menu Tâches est à plat et sans bandeau', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.equal(await tasks.filter(page).locator('.filter-group').count(), 0);
    assert.deepEqual(await tasks.filter(page).locator('.filter-option .option-label').allTextContents(), ['Relecture']);
  }));

test('les tâches à plat gardent l\'ordre des numéros : 1.2 avant 1.10', { skip }, () => {
  const tables = withTaskActions();
  tables.Actions.Actions = ['Vaccination', 'Audit']; // rien à ranger : le menu reste à plat
  tables.Taches = {
    id: [1, 2, 3], Taches: ['1.10 Clôture', '1.2 Suivi', '1.1 Cadrage'], Taches_corrige: ['', '', ''], Taches_role: ['', '', '']
  };
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await tasks.filter(page).locator('.filter-option .option-label').allTextContents(), ['1.1 Cadrage', '1.2 Suivi', '1.10 Clôture']);
  });
});

test('le menu Tâches se range aussi quand les libellés sont écrits « T1.1 » et « Action 1: », sans espace avant les deux-points', { skip }, () => {
  const tables = withTaskActions();
  tables.Actions.Actions = ['Action 1: Vaccination', 'Action 2: Audit'];
  tables.Taches.Taches = ['T1.1 Relecture', 'T1.2 rappel vaccinal', 'Tâche 2.1 : Inspection', 'Veille'];
  tables.Taches.Taches_corrige = ['', '', '', ''];
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    assert.deepEqual(await tasks.groupNames(page), ['Action 1: Vaccination', 'Action 2: Audit', NONE]);
    assert.deepEqual(await tasks.groupCounts(page), { 'Action 1: Vaccination': '2', 'Action 2: Audit': '1', [NONE]: '1' });
  });
});

test('le rangement des tâches ne change rien d\'autre : mêmes cartes, mêmes tags (le détail des tâches, pas les actions), aucun bandeau', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    const tagsByGroup = await cardOf(page, ANA).locator('.tag-group').evaluateAll(groups =>
      groups.map(group => [group.querySelector('.tag-group-title').textContent,
        [...group.querySelectorAll('.tag')].map(tag => tag.textContent)]));
    assert.deepEqual(tagsByGroup.filter(([title]) => title === 'Tâches'), [['Tâches', [RELECTURE, INSPECTION]]],
      'la carte garde le détail des tâches, pas les actions');
    assert.deepEqual(tagsByGroup.filter(([title]) => title === 'Actions'), [['Actions', [VACCINATION]]], 'les actions de la fiche (BDD.Actions) y sont toujours');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

// ===== Deux menus rangés par groupe dans la même barre =====

test('les menus Tâches et Compétences sont indépendants : un seul ouvert à la fois, un badge chacun, des listes qui ne se confondent pas', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await skills.open(page);
    assert.equal(await tasks.filter(page).evaluate(filter => filter.classList.contains('open')), false, 'un seul menu ouvert à la fois');
    assert.equal(await skills.filter(page).evaluate(filter => filter.classList.contains('open')), true);

    await skills.box(page, 'Cancérologie').check(); // Ana
    await waitForCards(page, 1);
    await tasks.open(page);
    await tasks.box(page, VACCINATION).check(); // Ana et Gina : seule Ana a les deux
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), [ANA]);
    assert.equal(await skills.badge(page).textContent(), '1');
    assert.equal(await tasks.badge(page).textContent(), '1');

    const controlled = await page.locator('.group-toggle').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-controls')));
    assert.equal(controlled.length, 6, 'trois domaines et trois actions');
    assert.equal(new Set(controlled).size, controlled.length, 'chaque bouton désigne sa propre liste');
    for (const id of controlled) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `la liste ${id} existe`);

    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await page.locator('.filter-count:not([hidden])').count(), 0);
    assert.equal(await page.locator('.filter-group input:checked, .filter-group input:indeterminate').count(), 0);
  }));

test('le menu Tâches reste utilisable au clavier : cases et boutons atteignables, état de dépli annoncé', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.filter(page).locator('.filter-button').focus();
    await page.keyboard.press('Enter'); // ouvre le menu
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'filter-search-input');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.filter-group')?.dataset.value), VACCINATION);
    await page.keyboard.press('Space'); // la case de l'action
    await waitForCards(page, 2);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'group-toggle', 'puis le bouton de dépli');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-expanded')), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), `Détail de ${VACCINATION}`);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.filter-option')?.dataset.value), RELECTURE, 'les tâches dépliées suivent');
    assert.equal(await page.evaluate(() => document.activeElement.checked), true);
  }));

// Les lignes de l'instantané d'accessibilité (`- checkbox "Nom" [états]`) dont le rôle exige un
// nom (WCAG 4.1.2) et qui n'en ont pas : le même contrôle que tests/accessibility.test.mjs fait
// sur le menu Compétences.
const NAMED_ROLES = 'button|link|checkbox|switch|radio|searchbox|textbox|combobox|menuitem|option';
const unnamedControls = snapshot => snapshot.split('\n')
  .map(line => new RegExp(`^\\s*- (${NAMED_ROLES})\\b(.*)$`).exec(line))
  .filter(match => match && !match[2].startsWith(' "'))
  .map(match => match[0].trim());

test('le menu Tâches ouvert n\'a aucun contrôle sans nom : recherche, case d\'action, flèche de détail, tâches', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.toggle(page, VACCINATION).click();
    const snapshot = await tasks.filter(page).locator('.filter-menu').ariaSnapshot();
    assert.ok(snapshot.includes('textbox "Rechercher dans Tâches"'), 'la recherche du menu est nommée');
    assert.ok(snapshot.includes(`button "Détail de ${VACCINATION}" [expanded]`), 'la flèche d\'une action dépliée porte son nom et son état');
    assert.ok(snapshot.includes(`button "Détail de ${AUDIT}"`), 'celle d\'une action repliée aussi');
    assert.ok(snapshot.includes(`checkbox "${RELECTURE} 1"`), 'une tâche dépliée est une case nommée');
    assert.deepEqual(unnamedControls(snapshot), []);
  }));

// ===== Le formulaire de profil range aussi les tâches par action =====

// Ana n'administre pas : elle ne modifie que sa fiche, par le bandeau « Ma présence ».
async function openOwnProfile(page) {
  await waitForCards(page, 4);
  const button = page.locator('#accountBar .account-edit');
  await button.waitFor();
  await button.click();
  await page.locator('#profileDialog').waitFor();
}

const profilePicker = (page, label) => page.locator('#profileDialog .grp')
  .filter({ has: page.locator('.grp-title', { hasText: new RegExp(`^${label}$`) }) });

test('le formulaire de profil range les tâches par action, comme le menu, et laisse la liste des actions à plat', { skip }, () => {
  const tables = withIdentity(withTaskActions());
  tables.ACL.admin[0] = false;
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await openOwnProfile(page);
    assert.deepEqual(await profilePicker(page, 'Tâches').locator('.subgrp-title').allTextContents(), [VACCINATION, AUDIT, NONE]);
    const pressed = await profilePicker(page, 'Tâches').locator('.pick').evaluateAll(chips =>
      chips.map(chip => [chip.textContent, chip.getAttribute('aria-pressed')]));
    assert.deepEqual(pressed, [[RELECTURE, 'true'], [RAPPEL, 'false'], [INSPECTION, 'true'], [VEILLE, 'false']],
      'les tâches d\'Ana sont cochées, rangées par action');
    assert.equal(await profilePicker(page, 'Actions').locator('.subgrp').count(), 0, 'la liste des actions reste à plat');
  });
});

test('le formulaire de profil garde les tâches à plat quand aucune n\'est rattachée à une action', { skip }, () => {
  const tables = withIdentity();
  tables.ACL.admin[0] = false;
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await openOwnProfile(page);
    assert.equal(await profilePicker(page, 'Tâches').locator('.subgrp').count(), 0);
    assert.deepEqual(await profilePicker(page, 'Tâches').locator('.pick').allTextContents(), ['Relecture']);
  });
});
