// Test navigateur du menu Actions rangé par groupe : charge le vrai index.html dans Chromium,
// avec le faux document Grist de tests/support/fake-grist.js, et vérifie ce que voit la
// personne. Depuis la 1.37.0 les « tâches » de la table Taches s'appellent « Actions » à l'écran (demande d'Antoine du
// 16 novembre 2026), et le bouton « Actions » d'avant (la colonne BDD.Actions) n'existe plus. Le menu est celui des
// compétences rangées par domaine (e2e.test.mjs) : une case par groupe d'actions (« Action 1 : Vaccination »), qui coche
// toutes ses actions, un bouton qui déplie le détail, une recherche qui trouve un groupe comme une action. Ce fichier
// vérifie que les actions s'en servent bien, et que le menu Compétences n'en est pas changé.
//
// Aucune colonne ne relie une action à son groupe : le numéro avant le point du libellé de l'action
// (« 1.2 Rappel vaccinal ») est celui de son groupe (« Action 1 : Vaccination »).
//
// Avec withTaskActions (tests/fixtures.mjs), périmètre par défaut ; Bob est partenaire :
//   Action 1 : Vaccination  → 1.1 Relecture (Ana), 1.2 Rappel vaccinal (Gina)
//   Action 2 : Audit        → 2.1 Inspection (Ana, Bob)
//   Sans action             → Veille (Hugo), une tâche sans numéro
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { unrankableTaskTables, withTaskActions, withIdentity, ANA_EMAIL } from './fixtures.mjs';
import { skip, reload, until, waitForCards, cardNames, gridCard, openOwn, withWidget } from './support/browser.mjs';
import { assertKeyboardWalk, groupedMenu, optionCounts } from './support/grouped-menu.mjs';

const tasks = groupedMenu('taches');
const skills = groupedMenu('competences');

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

// Les lignes que le widget écrit dans la console : le texte seulement.
const consoleLines = async logs => (await Promise.all([...logs.warnings, ...logs.infos]));

// ===== Le menu : des actions repliées, « Sans action » en dernier =====

test('la barre compte sept boutons : le menu Actions est celui des tâches, ses groupes n\'ont pas de bouton, et il n\'y a plus de bouton Actions à plat (1.37.0)', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await page.locator('.filter-button > span:nth-child(2)').allTextContents(),
      ['Actions', 'Communautés', 'GT', 'Compétences', 'Instances', 'Établissement', 'Rôle dans le PUI']);
    assert.equal(await page.locator('.filter[data-filter-key="macroTaches"]').count(), 0);
    assert.equal(await page.locator('.filter[data-filter-key="actions"]').count(), 0, 'l\'ancien filtre Actions (la colonne BDD.Actions) a disparu');
    assert.equal(await tasks.filter(page).locator('.filter-button').getAttribute('data-filter-key') ?? 'taches', 'taches');
    assert.match(await tasks.filter(page).locator('.filter-button').getAttribute('title'), /action/);
    assert.equal(await tasks.search(page).getAttribute('placeholder'), 'Action ou tâche…');
    assert.equal(await tasks.search(page).getAttribute('aria-label'), 'Rechercher dans Actions');
  }));

test('le menu Actions range les actions par groupe, repliés, « Sans action » en dernier, avec le nombre de cartes de chacun', { skip }, () =>
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
    await gridCard(page, BOB).locator('.etablissement-tag').click(); // Établissement : UBM
    await waitForCards(page, 1);
    assert.deepEqual(await tasks.groupCounts(page), { [VACCINATION]: '0', [AUDIT]: '1', [NONE]: '0' }, 'un autre filtre s\'applique aux actions');
  }));

test('la recherche du menu Actions trouve un groupe, une action ou un numéro, sans tenir compte des accents ni de la casse', { skip }, () =>
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

test('une pastille de carte coche l\'action, et à l\'ouverture suivante son groupe passe devant', { skip }, () =>
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

test('Réinitialiser décoche les groupes, referme le détail et vide la recherche du menu Actions', { skip }, () =>
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

for (const [name, tables] of Object.entries(unrankableTaskTables())) {
  test(`${name} : le menu Actions reste à plat, sans bandeau ni texte de groupe, et la console dit pourquoi`, { skip }, () =>
    withWidget({ tables }, async ({ page, logs }) => {
      await waitForCards(page, 4);
      assert.equal(await page.locator('#statusBanner').isHidden(), true, 'ce n\'est pas une anomalie : pas de bandeau');
      assert.equal(await tasks.filter(page).locator('.filter-group').count(), 0, 'pas de faux groupe « Sans action » pour tout le monde');
      assert.equal(await tasks.filter(page).locator('.filter-option').count(), 4, 'les quatre tâches, à plat');
      assert.equal(await tasks.search(page).getAttribute('placeholder'), 'Rechercher dans Actions…');
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

test('sans action ni groupe numéroté, comme dans la base de départ, le menu Actions est à plat et sans bandeau', { skip }, () =>
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

test('le menu Actions se range aussi quand les libellés sont écrits « T1.1 » et « Action 1: », sans espace avant les deux-points', { skip }, () => {
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

test('la carte range les actions par numéro, une rangée par action du groupe, sans bandeau ni groupe sur la carte (1.37.0)', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    const tagsByGroup = await gridCard(page, ANA).locator('.tag-group').evaluateAll(groups =>
      groups.map(group => [group.querySelector('.tag-group-title').textContent,
        [...group.querySelectorAll('.tag')].map(tag => tag.textContent)]));
    assert.deepEqual(tagsByGroup.filter(([title]) => title === 'Actions'), [['Actions', [RELECTURE, INSPECTION]]],
      'la carte garde le détail des actions, pas le nom de leur groupe');
    assert.equal(tagsByGroup.some(([title]) => title === 'Tâches'), false, 'plus de section « Tâches »');
    assert.equal(tagsByGroup.flatMap(([, tags]) => tags).includes('Vaccination'), false, 'la colonne BDD.Actions n\'est plus lue');
    // Une rangée par numéro d'action : « 1.1 » sur la première, « 2.1 » sur la suivante.
    const rows = await gridCard(page, ANA).locator('.tag-group[aria-label="Actions"] .tag-row')
      .evaluateAll(lines => lines.map(line => [...line.querySelectorAll('.tag')].map(tag => tag.textContent)));
    assert.deepEqual(rows, [[RELECTURE], [INSPECTION]], 'une rangée par numéro d\'action');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('une rangée de la carte réunit les actions du même numéro (1.2 et 1.3), les actions sans numéro font la dernière rangée', { skip }, () => {
  const tables = withTaskActions();
  tables.Taches = {
    id: [1, 2, 3, 4, 5],
    Taches: ['1.2 Rappel', '1.3 Relance', '3.5 Bilan', 'Veille', '1.1 Cadrage'],
    Taches_corrige: ['', '', '', '', ''],
    Taches_role: ['', '', '', '', '']
  };
  tables.BDD.Taches[0] = ['L', 4, 3, 2, 1, 5]; // Ana, dans le désordre
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    const rows = await gridCard(page, ANA).locator('.tag-group[aria-label="Actions"] .tag-row')
      .evaluateAll(lines => lines.map(line => [...line.querySelectorAll('.tag')].map(tag => tag.textContent)));
    assert.deepEqual(rows, [['1.1 Cadrage', '1.2 Rappel', '1.3 Relance'], ['3.5 Bilan'], ['Veille']]);
    const layout = await gridCard(page, ANA).locator('.tag-group[aria-label="Actions"] .tag-group-values').evaluate(values => ({
      direction: getComputedStyle(values).flexDirection, rows: [...values.children].map(row => row.getBoundingClientRect().top)
    }));
    assert.equal(layout.direction, 'column', 'les rangées s\'empilent : un retour à la ligne à chaque nouveau numéro');
    assert.deepEqual(layout.rows, [...layout.rows].sort((a, b) => a - b));
    assert.equal(new Set(layout.rows).size, 3, 'trois lignes distinctes');
  });
});

test('« Membre d\'une action » suit les actions : une personne qui en a une le lit après son rôle choisi, une personne sans action ne l\'a pas', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    const roles = name => gridCard(page, name).locator('.tag-group[aria-label="Rôle dans le PUI"] .tag').allTextContents();
    const sections = name => gridCard(page, name).locator('.tag-group[aria-label="Actions"]').count();
    assert.deepEqual([await roles(ANA), await sections(ANA)], [['Référent qualité', 'Membre d’une action'], 1], 'Ana : son rôle, puis celui que ses actions lui donnent');
    assert.deepEqual([await roles(GINA), await sections(GINA)], [['Membre d’une action'], 1], 'Gina : une action, pas de rôle choisi');
    assert.deepEqual([await roles(HUGO), await sections(HUGO)], [['Membre d’une action'], 1], 'Hugo : sa seule action n\'a pas de numéro, c\'en est bien une');
    assert.deepEqual([await roles('Hostile'), await sections('Hostile')], [[], 0], 'sans action ni rôle : ni section Rôle, ni section Actions');

    // Il se retire de lui-même avec la dernière action, sans que personne n'écrive dans Grist.
    await page.evaluate(() => { window.__tables.BDD.Taches[8] = ['L']; });
    await reload(page);
    await until(async () => (await sections(GINA)) === 0, 'l\'annuaire n\'a pas été relu : Gina garde son action');
    assert.deepEqual([await roles(GINA), await sections(GINA)], [[], 0], 'plus d\'action : plus de rôle calculé');
  }));

test('le filtre Rôle dans le PUI propose « Membre d\'une action », même quand la table des rôles ne l\'a pas, et il garde les personnes qui ont une action', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    const role = page.locator('.filter[data-filter-key="role"]');
    await role.locator('.filter-button').click();
    assert.deepEqual(await role.locator('.filter-option .option-label').allTextContents(), ['Membre d’une action', 'Référent qualité']);
    assert.deepEqual(await role.locator('.filter-option .option-count').allTextContents(), ['3', '1'], 'Ana, Gina et Hugo ; Ana');
    await role.locator('.filter-option', { hasText: 'Membre d’une action' }).locator('input').check();
    await waitForCards(page, 3);
    assert.deepEqual(await cardNames(page), [GINA, HUGO, ANA]);
    await page.mouse.click(5, 5);
    await gridCard(page, HUGO).locator('.tag-group[aria-label="Rôle dans le PUI"] .tag').click(); // la pastille se décoche d'un clic
    await waitForCards(page, 4);
  }));

// ===== Deux menus rangés par groupe dans la même barre =====

test('les menus Actions et Compétences sont indépendants : un seul ouvert à la fois, un badge chacun, des listes qui ne se confondent pas', { skip }, () =>
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

test('le menu Actions reste utilisable au clavier : cases et boutons atteignables, état de dépli annoncé', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await assertKeyboardWalk(page, tasks, { group: VACCINATION, cardsAfterTick: 2, firstItem: RELECTURE });
  }));

// Les lignes de l'instantané d'accessibilité (`- checkbox "Nom" [états]`) dont le rôle exige un
// nom (WCAG 4.1.2) et qui n'en ont pas : le même contrôle que tests/accessibility.test.mjs fait
// sur le menu Compétences.
const NAMED_ROLES = 'button|link|checkbox|switch|radio|searchbox|textbox|combobox|menuitem|option';
const unnamedControls = snapshot => snapshot.split('\n')
  .map(line => new RegExp(`^\\s*- (${NAMED_ROLES})\\b(.*)$`).exec(line))
  .filter(match => match && !match[2].startsWith(' "'))
  .map(match => match[0].trim());

test('le menu Actions ouvert n\'a aucun contrôle sans nom : recherche, case de groupe, flèche de détail, actions', { skip }, () =>
  withWidget({ tables: withTaskActions() }, async ({ page }) => {
    await waitForCards(page, 4);
    await tasks.open(page);
    await tasks.toggle(page, VACCINATION).click();
    const snapshot = await tasks.filter(page).locator('.filter-menu').ariaSnapshot();
    assert.ok(snapshot.includes('textbox "Rechercher dans Actions"'), 'la recherche du menu est nommée');
    assert.ok(snapshot.includes(`button "Détail de ${VACCINATION}" [expanded]`), 'la flèche d\'une action dépliée porte son nom et son état');
    assert.ok(snapshot.includes(`button "Détail de ${AUDIT}"`), 'celle d\'une action repliée aussi');
    assert.ok(snapshot.includes(`checkbox "${RELECTURE}"`), 'une tâche dépliée est une case nommée par son libellé, sans le nombre de fiches (1.30.0)');
    assert.deepEqual(unnamedControls(snapshot), []);
  }));

// ===== Le formulaire de profil range aussi les tâches par action =====

const profilePicker = (page, label) => page.locator('#profileDialog .grp')
  .filter({ has: page.locator('.grp-title', { hasText: new RegExp(`^${label}$`) }) });

test('le formulaire de profil range les actions par groupe, comme le menu, et n\'a plus la liste des actions d\'avant', { skip }, () => {
  const tables = withIdentity(withTaskActions());
  tables.ACL.admin[0] = false;
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.deepEqual(await profilePicker(page, 'Actions').locator('.subgrp-title').allTextContents(), [VACCINATION, AUDIT, NONE]);
    const pressed = await profilePicker(page, 'Actions').locator('.pick').evaluateAll(chips =>
      chips.map(chip => [chip.textContent, chip.getAttribute('aria-pressed')]));
    assert.deepEqual(pressed, [[RELECTURE, 'true'], [RAPPEL, 'false'], [INSPECTION, 'true'], [VEILLE, 'false']],
      'les actions d\'Ana sont cochées, rangées par groupe');
    assert.equal(await page.locator('#profileDialog .grp-title', { hasText: /^Actions$/ }).count(), 1, 'une seule liste « Actions » : celle des tâches');
    assert.equal(await page.locator('#profileDialog .grp-title', { hasText: /^Tâches$/ }).count(), 0, 'plus de liste « Tâches »');
  });
});

test('le formulaire de profil garde les actions à plat quand aucune n\'est rattachée à un groupe', { skip }, () => {
  const tables = withIdentity();
  tables.ACL.admin[0] = false;
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.equal(await profilePicker(page, 'Actions').locator('.subgrp').count(), 0);
    assert.deepEqual(await profilePicker(page, 'Actions').locator('.pick').allTextContents(), ['Relecture']);
  });
});
