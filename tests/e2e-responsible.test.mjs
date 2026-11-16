// Test navigateur de « Responsable de » (1.40.0) : charge le vrai index.html dans Chromium, avec le faux document Grist de
// tests/support/fake-grist.js, et vérifie ce que voit la personne. Chaque personne coche, dans sa fenêtre « Modifier mon profil », les actions
// dont elle est responsable (colonne BDD.Taches_responsable) ; sa carte l'écrit alors dans le rôle « Responsable de l'action 1.1 », et le widget
// crée la colonne quand elle manque (par un administrateur seulement : Grist ne laisse pas les autres changer la structure).
//
// Avec withTaskActions (tests/fixtures.mjs) : Ana a 1.1 Relecture et 2.1 Inspection, Bob 2.1 Inspection. Avec withResponsibleColumn, Ana est
// responsable de 1.1 Relecture.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert, { plain } from './support/assert.mjs';
import { ADMIN_EMAIL, ANA_EMAIL, BOB_EMAIL, withIdentity, withResponsibleColumn, withTaskActions } from './fixtures.mjs';
import { bddCell, gridCard, openOwn, skip, structureCalls, until, waitForCards, waitForEditButtons, withWidget } from './support/browser.mjs';
import { FITS, dialogFit, profileDialogPage, unnamedControls } from './support/dialog-page.mjs';

const { dialog, press, summary, column, review, closed, headingIs } = profileDialogPage();

const ROLE = 'Responsable d’une action';
const withColumn = () => withIdentity(withResponsibleColumn());
const withoutColumn = () => withIdentity(withTaskActions());

const block = page => dialog(page).locator('.grp-responsible');
const rows = page => block(page).locator('.resp-row:not([hidden])');
const rowOf = (page, label) => block(page).locator('.resp-row').filter({ hasText: new RegExp(`^${label}$`) });
const boxOf = (page, label) => rowOf(page, label).locator('input');
const picker = (page, label) => dialog(page).locator('.grp').filter({ has: page.locator('.grp-title', { hasText: new RegExp(`^${label}$`) }) });
const chip = (page, group, label) => picker(page, group).locator('.pick', { hasText: new RegExp(`^${label}$`) });
const rolePills = (scope) => scope.locator('.tag-group').filter({ has: scope.page().locator('.tag-group-title', { hasText: /^Rôle dans le PUI$/ }) }).locator('.tag');
// Les demandes de colonne que Grist a reçues, acceptées ou refusées (`ok`).
const addColumnCalls = structureCalls;
const consoleLines = async logs => plain((await Promise.all([...logs.warnings, ...logs.infos])).join('\n'));

// ===== La carte : le rôle écrit avec les actions =====

test('la carte de la personne responsable écrit « Responsable de l\'action 1.1 » dans son rôle, après « Membre d\'une action »', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = gridCard(page, 'Ana Martin');
    assert.deepEqual(await rolePills(ana).allTextContents(), ['Référent qualité', 'Membre d’une action', 'Responsable de l’action 1.1']);
    const gina = gridCard(page, 'Gina Bergonié');
    assert.deepEqual(await rolePills(gina).allTextContents(), ['Membre d’une action'], 'Gina a une action et n\'en a coché aucune comme responsabilité');
  }));

test('cliquer « Responsable de l\'action 1.1 » filtre le rôle « Responsable d\'une action », que le menu propose avec son nombre de cartes', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await rolePills(gridCard(page, 'Ana Martin')).filter({ hasText: 'Responsable de l’action 1.1' }).click();
    await waitForCards(page, 1);
    const filter = page.locator('.filter[data-filter-key="role"]');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    await filter.locator('.filter-button').click();
    const option = filter.locator('.filter-option').filter({ hasText: ROLE });
    assert.equal(await option.locator('input').isChecked(), true, 'le menu porte le rôle, pas le texte de la pastille');
    assert.equal(await option.locator('.option-count').textContent(), '1');
    assert.deepEqual(await filter.locator('.filter-option .option-label').allTextContents(), [ROLE, 'Membre d’une action', 'Référent qualité'], 'l\'option cochée est en tête du menu');
  }));

test('plusieurs actions : « Responsable des actions 1.1, 2.1 », et le menu du rôle compte la personne une seule fois', { skip }, () =>
  withWidget({ tables: withIdentity(withResponsibleColumn(withTaskActions(), { 1: ['L', 1, 3] })), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await rolePills(gridCard(page, 'Ana Martin')).allTextContents(), ['Référent qualité', 'Membre d’une action', 'Responsable des actions 1.1, 2.1']);
  }));

// ===== La fenêtre de profil : une case par action choisie =====

test('« Responsable de » est sous les actions : une case par action de la personne, cochée pour celles dont elle est responsable', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.equal(await block(page).count(), 1);
    assert.equal(await block(page).locator('.grp-title').textContent(), 'Responsable de');
    assert.equal(await block(page).getAttribute('role'), 'group');
    assert.equal(await block(page).getAttribute('aria-labelledby'), 'profile-Taches_responsable-title');
    assert.deepEqual(await rows(page).allTextContents(), ['1.1 Relecture', '2.1 Inspection'], 'seulement les actions d\'Ana');
    assert.equal(await boxOf(page, '1.1 Relecture').isChecked(), true);
    assert.equal(await boxOf(page, '2.1 Inspection').isChecked(), false);
    assert.equal(await block(page).locator('.grp-count').textContent(), '1 sélectionnée');
    assert.match(plain(await block(page).locator('.fld-hint').textContent()), /Cochez les actions dont vous êtes responsable/);
    const position = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('#profileDialog .grp')].map(group => group.querySelector('.grp-title').textContent);
      return groups;
    });
    assert.deepEqual(position.slice(-2), ['Actions', 'Responsable de'], 'juste sous la liste des actions');
  }));

test('cocher une action de plus : une modification, la carte « Après » écrit « Responsable des actions 1.1, 2.1 » et repère la pastille', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await boxOf(page, '2.1 Inspection').check();
    assert.equal(await block(page).locator('.grp-count').textContent(), '2 sélectionnées');
    assert.equal(await summary(page), '1 champ modifié');
    await review(page);
    const after = column(page, 'after');
    assert.deepEqual(await rolePills(after).allTextContents(),
      ['Référent qualité', 'Membre d’une action', 'Responsable des actions 1.1, 2.1 (ajouté)', 'Responsable de l’action 1.1 (retiré)'],
      'les textes que lit un lecteur d\'écran disent ce qui est ajouté et ce qui est retiré');
    assert.equal(await rolePills(after).filter({ hasText: 'Responsable des actions 1.1, 2.1' }).evaluate(tag => tag.classList.contains('tag-add')), true, 'la nouvelle pastille est repérée');
    assert.equal(await rolePills(after).filter({ hasText: 'Responsable de l’action 1.1' }).evaluate(tag => tag.classList.contains('tag-del')), true, 'l\'ancienne est barrée');
    assert.deepEqual(await rolePills(column(page, 'before')).allTextContents(), ['Référent qualité', 'Membre d’une action', 'Responsable de l’action 1.1']);
    await press(page, 'Valider').click();
    await closed(page);
    assert.deepEqual(await bddCell(page, 'Taches_responsable', 0), ['L', 1, 3]);
    assert.deepEqual(await bddCell(page, 'Taches', 0), ['L', 1, 3], 'les actions ne bougent pas');
    await until(async () => (await rolePills(gridCard(page, 'Ana Martin')).allTextContents()).includes('Responsable des actions 1.1, 2.1'),
      'la carte n\'a pas relu la fiche');
  }));

test('décocher une action de la liste la retire aussi de « Responsable de » : sa case disparaît, les deux listes se relisent et s\'enregistrent ensemble', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await chip(page, 'Actions', '1.1 Relecture').click();
    assert.deepEqual(await rows(page).allTextContents(), ['2.1 Inspection'], 'l\'action décochée n\'a plus de case');
    assert.equal(await block(page).locator('.grp-count').textContent(), '0 sélectionnée');
    assert.equal(await summary(page), '2 champs modifiés');
    await chip(page, 'Actions', '1.1 Relecture').click(); // on la reprend : la case revient décochée
    assert.deepEqual(await rows(page).allTextContents(), ['1.1 Relecture', '2.1 Inspection']);
    assert.equal(await boxOf(page, '1.1 Relecture').isChecked(), false, 'une action reprise n\'est plus une responsabilité');
    await chip(page, 'Actions', '1.1 Relecture').click();
    await review(page);
    assert.deepEqual(await rolePills(column(page, 'after')).allTextContents(), ['Référent qualité', 'Membre d’une action', 'Responsable de l’action 1.1 (retiré)']);
    await press(page, 'Valider').click();
    await closed(page);
    assert.deepEqual(await bddCell(page, 'Taches', 0), ['L', 3]);
    assert.deepEqual(await bddCell(page, 'Taches_responsable', 0), ['L']);
    await until(async () => (await rolePills(gridCard(page, 'Ana Martin')).allTextContents()).join('|') === 'Référent qualité|Membre d’une action',
      'la carte ne montre plus la responsabilité');
  }));

test('sans aucune action, « Responsable de » n\'est pas montré ; il revient avec la première action choisie', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await chip(page, 'Actions', '1.1 Relecture').click();
    await chip(page, 'Actions', '2.1 Inspection').click();
    assert.equal(await block(page).isHidden(), true);
    await chip(page, 'Actions', '1.2 Rappel vaccinal').click();
    assert.equal(await block(page).isVisible(), true);
    assert.deepEqual(await rows(page).allTextContents(), ['1.2 Rappel vaccinal']);
    assert.equal(await boxOf(page, '1.2 Rappel vaccinal').isChecked(), false);
  }));

test('les cases se parcourent au clavier, ont un nom, et la fenêtre tient dans son cadre à 320 px comme à 1 200 px', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.deepEqual(await unnamedControls(dialog(page)), [], 'chaque case a un nom : celui de son action');
    await boxOf(page, '2.1 Inspection').focus();
    await page.keyboard.press('Space');
    assert.equal(await boxOf(page, '2.1 Inspection').isChecked(), true);
    for (const width of [320, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      assert.deepEqual(await dialogFit(page, '#profileDialog'), FITS, `à ${width}px`);
    }
    const heights = await rows(page).evaluateAll(list => list.map(row => row.getBoundingClientRect().height));
    assert.ok(heights.every(height => height >= 24), `chaque case se vise (${heights.join(', ')} px)`);
  }));

test('une administratrice qui modifie la fiche de Gina coche ses actions : l\'aide parle de « cette personne »', { skip }, () =>
  withWidget({ tables: withColumn(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-admin').waitFor();
    await page.locator('#accountBar .account-admin').click();
    await waitForEditButtons(page, 4);
    await gridCard(page, 'Gina Bergonié').locator('.card-edit').click();
    await page.locator('#profileDialog').waitFor();
    assert.match(plain(await block(page).locator('.fld-hint').textContent()), /dont cette personne est responsable/);
    assert.deepEqual(await rows(page).allTextContents(), ['1.2 Rappel vaccinal']);
    await boxOf(page, '1.2 Rappel vaccinal').check();
    await press(page, 'Relire les modifications').click(); // l'administratrice relit « les » modifications, pas « mes » modifications
    await headingIs(page, 'Relire avant de valider');
    await press(page, 'Valider').click();
    await closed(page);
    assert.deepEqual(await bddCell(page, 'Taches_responsable', 8), ['L', 2], 'la ligne de Gina, pas celle de l\'administratrice');
    assert.deepEqual(await bddCell(page, 'Taches_responsable', 0), ['L', 1]);
  }));

// ===== La colonne : créée par un administrateur, sinon la case n'est pas proposée =====

test('une administratrice qui ouvre l\'annuaire sans la colonne la fait créer : une seule fois, vide, avec la case dans sa fenêtre et un mot dans la console', { skip }, () =>
  withWidget({ tables: withoutColumn(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => 'Taches_responsable' in window.__tables.BDD);
    assert.deepEqual(await addColumnCalls(page), [{
      action: 'AddColumn', table: 'BDD', rowId: 'Taches_responsable', values: { type: 'RefList:Taches', isFormula: false }, ok: true
    }]);
    assert.ok((await page.evaluate(() => window.__tables.BDD.Taches_responsable)).every(cell => cell === null));
    await until(async () => (await consoleLines(logs)).includes('[SCHEMA] colonne « Taches_responsable » absente de BDD'), 'la console ne dit pas la création');
    await openOwn(page);
    assert.deepEqual(await rows(page).allTextContents(), ['1.1 Relecture', '2.1 Inspection'], 'la case est là, rien n\'est coché');
    assert.equal(await boxOf(page, '1.1 Relecture').isChecked(), false);
    assert.equal((await addColumnCalls(page)).length, 1, 'une seule demande');
  }));

test('quelqu\'un qui n\'est pas administrateur ne fait rien créer : pas de demande à Grist, pas de case', { skip }, () =>
  withWidget({ tables: withoutColumn(), user: BOB_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-edit').waitFor();
    assert.deepEqual(await addColumnCalls(page), []);
    await openOwn(page);
    assert.equal(await block(page).count(), 0);
  }));

test('l\'administratrice dont Grist refuse de changer la structure : une phrase dans la console, pas de case, l\'annuaire et le profil restent comme avant', { skip }, () =>
  withWidget({ tables: withoutColumn(), user: ANA_EMAIL, denyStructure: true }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await until(async () => (await consoleLines(logs)).includes('Grist n\'a pas permis de la créer'), 'la console ne dit pas le refus');
    const text = await consoleLines(logs);
    assert.match(text, /\[SCHEMA\] la colonne « Taches_responsable » manque dans BDD/);
    assert.match(text, /la case « Responsable de » du profil n'est pas proposée/);
    assert.deepEqual((await addColumnCalls(page)).map(call => call.ok), [false], 'une seule demande, refusée');
    assert.equal(await page.evaluate(() => 'Taches_responsable' in window.__tables.BDD), false);
    await openOwn(page);
    assert.equal(await block(page).count(), 0);
    assert.deepEqual(await rolePills(gridCard(page, 'Ana Martin')).allTextContents(), ['Référent qualité', 'Membre d’une action'].slice(0, 2));
    assert.equal(logs.pageErrors.length, 0);
  }));

test('un document sans action ne reçoit pas la colonne : rien à y cocher', { skip }, () => {
  const tables = withIdentity();
  tables.Taches = { id: [], Taches: [], Taches_corrige: [], Taches_role: [] };
  tables.BDD.Taches = tables.BDD.id.map(() => ['L']);
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-edit').waitFor();
    assert.deepEqual(await addColumnCalls(page), []);
  });
});

test('l\'administrateur sans fiche (aucune ligne de BDD à son adresse) fait aussi créer la colonne', { skip }, () =>
  withWidget({ tables: withoutColumn(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => 'Taches_responsable' in window.__tables.BDD);
    assert.equal((await addColumnCalls(page)).length, 1);
  }));
