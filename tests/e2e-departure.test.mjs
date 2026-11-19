// Le départ d'un·e collègue (1.46.0, simplifié en 1.46.1 : departure.js, departure-save.js, departure-ui.js, etablissement-form.js) dans Chromium
// (optionnel : voir TESTING.md), sur une API Grist simulée : le responsable d'un établissement ouvre la fenêtre depuis « Mon établissement », choisit qui part
// et qui reprend ses valeurs, relit l'avant / après, confirme ; la fiche est DÉSACTIVÉE (sa case `Accepte_apparaitre` est décochée, aucune colonne de plus),
// jamais supprimée ; il peut la réactiver (la case est recochée).
// Ce que Grist refuse vraiment, ce sont ses règles d'accès (GRIST_SETUP.md) : rien de cela n'a été essayé dans le Grist d'Antoine (TESTING.md, section 33).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { ANA_EMAIL, BOB_EMAIL, departureTables, withSchema, withValidation, HOSTILE_FIRST_NAME } from './fixtures.mjs';
import { bddCalls, skip, structureCalls, toast, until, waitForCards, withWidget } from './support/browser.mjs';
import { dialogPage } from './support/dialog-page.mjs';

const etab = dialogPage('etabDialog', 'etabTitle');
const depart = dialogPage('departDialog', 'departTitle');
const dlg = depart.dialog;
// Le titre de la fenêtre vaut `expected` (l'espace insécable du widget devant « ? » se lit comme une espace).
const headingIs = (page, expected) => page.waitForFunction(wanted => document.getElementById('departTitle').textContent.replace(/[\u00a0\u202f]/g, ' ') === wanted, expected);
const cardNames = page => page.locator('#cardsGrid .contact-card .name').allTextContents();

// Le document de départ de tests/fixtures.mjs : Ana (administratrice et responsable du CHU) est connectée ; Hugo (10) quitte le CHU et Ana reprend ses valeurs.
// Hugo porte, en plus de l'exemple : le GT « GT qualité » et la communauté « Soins palliatifs ». Ana a déjà la compétence Hématologie, les actions 1.1 et 2.1,
// la communauté « Réseau douleur » et l'instance CME.
function world(edit = () => {}) {
  const tables = withValidation(withSchema(departureTables()));
  const at = id => tables.BDD.id.indexOf(id);
  tables.BDD.GT[at(10)] = ['L', 1];
  tables.BDD.Communautes[at(10)] = ['L', 1];
  edit(tables);
  return tables;
}

// Ouvre « Mon établissement » puis la fenêtre du départ, et attend la liste des personnes.
async function openDeparture(page, cards = 4) {
  await waitForCards(page, cards);
  await page.locator('#accountBar .account-etab').click();
  await page.locator('#etabName').waitFor();
  await etab.press(page, 'Un·e collègue quitte l’établissement…').click();
  await dlg(page).locator('#departPeopleTitle').waitFor();
}

const reactivate = (page, name = 'Hugo Bernard') => dlg(page).getByRole('button', { name: `Réactiver la fiche de ${name}` });
const departButton = (page, name) => depart.press(page, `Départ de ${name}`);
const recipient = page => page.locator('#departRecipient');
const recipientOptions = page => page.locator('#departRecipient-list .dd-option').allTextContents();
const checkbox = (page, key) => dlg(page).locator(`input[data-group="${key}"]`);
// Les personnes de l'établissement (la section « Personnes de l'établissement »), pas les fiches qui n'apparaissent pas plus bas.
const goneNames = page => dlg(page).locator('[data-state="removed"] .es-resp-name').allTextContents();
const rowsOf = page => dlg(page).locator('section[aria-labelledby="departPeopleTitle"] .dp-person');
const group = (page, key) => dlg(page).locator(`.dp-group[data-group="${key}"]`);
const groupLines = async (page, key) => ({
  count: await group(page, key).locator('.dp-group-count').textContent(),
  lines: await group(page, key).locator('.dp-group-line').allTextContents()
});
const values = (page, column, id = 1) => page.evaluate(([name, rowId]) => window.__tables.BDD[name][window.__tables.BDD.id.indexOf(rowId)], [column, id]);
const updates = page => bddCalls(page).then(calls => calls.filter(call => call.action === 'UpdateRecord'));

async function chooseRecipient(page, name) {
  await recipient(page).click();
  await page.locator('#departRecipient-list').getByRole('option', { name, exact: true }).click();
}

// ===== La fenêtre =====

test('un responsable trouve le départ dans « Mon établissement » ; la fenêtre liste ses collègues, sans « Départ » pour lui-même', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openDeparture(page);
    assert.equal(await etab.dialog(page).locator('#etabDepartTitle').textContent(), 'Départ d’un·e collègue');
    assert.equal(await depart.dialog(page).evaluate(node => node.open), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'departTitle', 'le titre est annoncé à l’ouverture');
    assert.equal(await depart.heading(page).textContent(), 'Départ d’un·e collègue');
    assert.equal(await rowsOf(page).count(), 3);
    assert.deepEqual(await rowsOf(page).locator('.es-resp-name').allTextContents(), [`${HOSTILE_FIRST_NAME} Hostile`, 'Ana Martinvous', 'Hugo Bernard']);
    assert.equal(await rowsOf(page).filter({ hasText: 'Ana Martin' }).getByRole('button').count(), 0, 'on ne désactive pas sa propre fiche');
    assert.equal(await departButton(page, 'Hugo Bernard').textContent(), 'Départ…');
    // Iris a refusé d'apparaître et Jules n'a pas répondu : leurs fiches n'apparaissent pas, la case ne dit pas pourquoi.
    assert.equal(await dlg(page).locator('#departGoneTitle').textContent(), 'Fiches qui n’apparaissent pas (2)');
    assert.deepEqual(await goneNames(page), ['Iris Refus', 'Jules Sansreponse']);
    assert.equal(await dlg(page).locator('.notice').count(), 0, 'rien à signaler');
    assert.deepEqual(await updates(page), [], 'ouvrir n’écrit rien');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('personne d’autre qu’un responsable n’a le départ : ni le raccourci du bandeau ni la section dans « Mon établissement »', { skip }, () =>
  withWidget({ tables: world(), user: 'hostile@chu-bordeaux.example' }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForTimeout(300); // l'identité arrive après les cartes
    assert.equal(await page.locator('#accountBar .account-etab').count() === 0 || await page.locator('#accountBar .account-etab').isHidden(), true, 'Hostile n’est responsable de rien');
    assert.equal(await page.locator('#etabDepartTitle').count(), 0);
    assert.equal(await page.locator('#departDialog').evaluate(node => node.open), false);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

// ===== Un départ avec transfert =====

test('départ de Hugo, ses valeurs reprises par Ana : avant / après relus, une seule écriture, la fiche désactivée et non supprimée', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openDeparture(page);
    const tablesBefore = await page.evaluate(() => structuredClone(window.__tables.BDD));
    await departButton(page, 'Hugo Bernard').click();
    assert.equal(await depart.heading(page).textContent(), 'Départ de Hugo Bernard');

    // Sans personne choisie, rien ne se coche.
    assert.equal(await recipient(page).textContent(), 'Ne rien transférer');
    assert.deepEqual(await recipientOptions(page), ['Ne rien transférer', `${HOSTILE_FIRST_NAME} Hostile`, 'Ana Martin'], 'ni Hugo lui-même, ni une fiche d’un autre établissement');
    for (const key of ['instances', 'gt', 'competences', 'communautes', 'taches', 'role']) assert.equal(await checkbox(page, key).isDisabled(), true, key);
    assert.deepEqual(await dlg(page).locator('.dp-check').allTextContents(), ['Instances', 'GT', 'Compétences', 'Communautés', 'Actions', 'Rôle dans le PUI']);

    await chooseRecipient(page, 'Ana Martin');
    assert.equal(await recipient(page).textContent(), 'Ana Martin');
    for (const [key, on] of [['instances', true], ['gt', true], ['competences', true], ['communautes', true], ['taches', true], ['role', false]]) {
      assert.equal(await checkbox(page, key).isDisabled(), false, key);
      assert.equal(await checkbox(page, key).isChecked(), on, `${key} : le rôle est personnel, il ne se coche pas de lui-même`);
    }
    await depart.press(page, 'Continuer').click();

    // L'écran de confirmation dit ce que Ana avait AVANT et aura APRÈS, rubrique par rubrique.
    await headingIs(page, 'Désactiver la fiche de Hugo Bernard ?');
    assert.match(await dlg(page).locator('.notice').first().innerText(), /n’apparaîtra plus dans l’annuaire\s: sa case «\sApparaître dans l’annuaire\s» sera décochée\. Elle reste dans Grist\s: rien n’est supprimé, et vous pouvez la réactiver\./);
    assert.equal(await dlg(page).locator('#departTransferTitle').textContent(), 'Valeurs recopiées sur la fiche de Ana Martin');
    assert.deepEqual(await groupLines(page, 'instances'), { count: 'Avant 1 valeur → après 1 valeur', lines: ['Rien à transférer : la fiche n’en a aucune.'] });
    assert.deepEqual(await groupLines(page, 'gt'), { count: 'Avant 0 valeur → après 1 valeur', lines: ['Ajoutées : GT qualité'] });
    assert.deepEqual(await groupLines(page, 'competences'), { count: 'Avant 2 valeurs → après 2 valeurs', lines: ['Tout y est déjà : rien n’est ajouté.'] });
    assert.deepEqual(await groupLines(page, 'communautes'), { count: 'Avant 1 valeur → après 2 valeurs', lines: ['Ajoutées : Soins palliatifs'] });
    assert.deepEqual(await groupLines(page, 'taches'), { count: 'Avant 2 valeurs → après 3 valeurs', lines: ['Ajoutées : Veille'] });
    assert.equal(await group(page, 'role').count(), 0, 'le rôle n’était pas coché');
    assert.deepEqual(await updates(page), [], 'tant qu’on n’a pas confirmé, rien n’est écrit');
    assert.equal(await depart.press(page, 'Désactiver la fiche').getAttribute('class'), 'btn btn-danger');

    await depart.press(page, 'Désactiver la fiche').click();
    await dlg(page).locator('.rq-done').waitFor();
    assert.equal(await dlg(page).locator('.rq-done').textContent(), 'La fiche de Hugo Bernard est désactivée, et 3 valeurs ont été recopiées sur la fiche de Ana Martin.');

    // Une seule action Grist : les valeurs d'Ana, puis la désactivation de Hugo. Rien n'est supprimé ni créé.
    const calls = await bddCalls(page);
    assert.deepEqual(calls.map(call => [call.action, call.rowId, call.values, call.ok]), [
      ['UpdateRecord', 1, { GT: ['L', 1], Communautes: ['L', 2, 1], Taches: ['L', 1, 3, 4] }, true],
      ['UpdateRecord', 10, { Accepte_apparaitre: false }, true]
    ]);
    assert.deepEqual(await structureCalls(page), [], 'aucune colonne n’est ajoutée au document');
    const tablesAfter = await page.evaluate(() => structuredClone(window.__tables.BDD));
    assert.equal('Fiche_desactivee' in tablesAfter, false, 'et il n’existe pas de colonne de plus pour le départ');
    assert.equal(tablesAfter.id.length, tablesBefore.id.length, 'la fiche reste dans BDD');
    assert.deepEqual(tablesAfter.Etablissement, tablesBefore.Etablissement, 'les établissements des fiches n’ont pas bougé');
    assert.equal(await values(page, 'Accepte_apparaitre', 10), false);
    Object.keys(tablesBefore).filter(key => key !== 'Accepte_apparaitre').forEach(key => assert.deepEqual(tablesAfter[key][tablesAfter.id.indexOf(10)], tablesBefore[key][tablesBefore.id.indexOf(10)], `Hugo : ${key}`));
    assert.deepEqual(await values(page, 'Competences', 10), ['L', 2], 'Hugo garde ses propres valeurs : la fiche désactivée reste telle qu’elle était');
    assert.deepEqual(await values(page, 'GT', 10), ['L', 1]);

    // La liste se redessine : Hugo n'est plus une personne de l'établissement, il est avec les fiches qui n'apparaissent pas.
    assert.deepEqual(await rowsOf(page).locator('.es-resp-name').allTextContents(), [`${HOSTILE_FIRST_NAME} Hostile`, 'Ana Martinvous']);
    assert.equal(await dlg(page).locator('#departGoneTitle').textContent(), 'Fiches qui n’apparaissent pas (3)');
    assert.deepEqual(await goneNames(page), ['Hugo Bernard', 'Iris Refus', 'Jules Sansreponse']);
    assert.equal(await reactivate(page).count(), 1);

    // L'annuaire derrière : un contact de moins, les autres inchangés.
    await depart.press(page, 'Fermer').click();
    await depart.closed(page);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Un·e collègue quitte l’établissement…', 'le focus revient au bouton qui a ouvert la fenêtre');
    await etab.press(page, 'Annuler').click();
    await waitForCards(page, 3);
    assert.deepEqual((await cardNames(page)).sort(), ['Ana Martin', 'Gina Bergonié', `${HOSTILE_FIRST_NAME} Hostile`].sort());
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('départ sans transfert : « Ne rien transférer » décoche la case de la fiche et rien d’autre', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openDeparture(page);
    await departButton(page, 'Hugo Bernard').click();
    await depart.press(page, 'Continuer').click();
    await headingIs(page, 'Désactiver la fiche de Hugo Bernard ?');
    assert.equal(await dlg(page).locator('.rq-lead').textContent(), 'Aucune valeur n’est transférée.');
    await depart.press(page, 'Désactiver la fiche').click();
    await dlg(page).locator('.rq-done').waitFor();
    assert.equal(await dlg(page).locator('.rq-done').textContent(), 'La fiche de Hugo Bernard est désactivée.');
    assert.deepEqual((await bddCalls(page)).map(call => [call.action, call.rowId, call.values]), [['UpdateRecord', 10, { Accepte_apparaitre: false }]]);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le rôle se coche à la main, « Retour » garde le choix, et « Annuler » à l’écran de confirmation n’écrit rien', { skip }, () =>
  withWidget({ tables: world(tables => { tables.BDD.Role_dans_le_PUI[tables.BDD.id.indexOf(10)] = ['L', 1]; tables.BDD.Role_dans_le_PUI[0] = ['L']; }), user: ANA_EMAIL }, async ({ page }) => {
    await openDeparture(page);
    await departButton(page, 'Hugo Bernard').click();
    await chooseRecipient(page, 'Ana Martin');
    await checkbox(page, 'role').check();
    await checkbox(page, 'gt').uncheck();
    await depart.press(page, 'Continuer').click();
    await headingIs(page, 'Désactiver la fiche de Hugo Bernard ?');
    assert.deepEqual(await groupLines(page, 'role'), { count: 'Avant 0 valeur → après 1 valeur', lines: ['Ajoutées : Référent qualité'] });
    assert.equal(await group(page, 'gt').count(), 0, 'une rubrique décochée n’est pas dans la confirmation');
    await depart.press(page, 'Retour').click();
    assert.equal(await recipient(page).textContent(), 'Ana Martin', 'le choix de la personne est gardé');
    assert.equal(await checkbox(page, 'role').isChecked(), true);
    assert.equal(await checkbox(page, 'gt').isChecked(), false);
    await depart.press(page, 'Retour').click();
    await dlg(page).locator('#departPeopleTitle').waitFor();
    assert.deepEqual(await updates(page), []);
  }));

// ===== La réactivation =====

test('une fiche désactivée se réactive après confirmation : la case est recochée, la personne revient dans l’annuaire, et ce qui a été transféré y reste', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openDeparture(page);
    await departButton(page, 'Hugo Bernard').click();
    await chooseRecipient(page, 'Ana Martin');
    await depart.press(page, 'Continuer').click();
    await depart.press(page, 'Désactiver la fiche').click();
    await dlg(page).locator('#departGoneTitle').waitFor();

    await reactivate(page).click();
    assert.equal(await depart.press(page, 'Confirmer la réactivation').count(), 1, 'une confirmation avant d’écrire');
    assert.match(await dlg(page).locator('.dp-consent').innerText(), /^Cela coche «\sApparaître dans l’annuaire\s» sur sa fiche\s: ne le faites que si la personne vous a donné son accord\.$/);
    assert.equal(await values(page, 'Accepte_apparaitre', 10), false);
    await depart.press(page, 'Annuler').click();
    assert.equal(await values(page, 'Accepte_apparaitre', 10), false, 'annuler ne réactive rien');
    assert.equal(await dlg(page).locator('.dp-consent').count(), 0);

    await reactivate(page).click();
    await depart.press(page, 'Confirmer la réactivation').click();
    await dlg(page).locator('.rq-done').waitFor();
    assert.equal(await dlg(page).locator('.rq-done').textContent(), 'La fiche de Hugo Bernard est réactivée.');
    assert.equal(await dlg(page).locator('#departGoneTitle').textContent(), 'Fiches qui n’apparaissent pas (2)');
    assert.equal(await values(page, 'Accepte_apparaitre', 10), true);
    assert.deepEqual(await values(page, 'Taches', 1), ['L', 1, 3, 4], 'les valeurs recopiées sur Ana restent');
    assert.equal(await rowsOf(page).count(), 3);
    await depart.press(page, 'Fermer').click();
    await etab.press(page, 'Annuler').click();
    await waitForCards(page, 4);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('Grist refuse la réactivation : le message se lit sous la personne, et rien n’est recoché', { skip }, () =>
  withWidget({ tables: world(tables => { tables.BDD.Accepte_apparaitre[tables.BDD.id.indexOf(10)] = false; }), user: ANA_EMAIL }, async ({ page }) => {
    await openDeparture(page, 3);
    await reactivate(page).click();
    await page.evaluate(() => { window.__denyRows = { BDD: [10] }; });
    await depart.press(page, 'Confirmer la réactivation').click();
    const item = dlg(page).locator('[data-state="removed"]', { hasText: 'Hugo Bernard' });
    await item.locator('.notice').waitFor();
    assert.match(await item.locator('.notice').innerText(), /Grist a refusé la modification/);
    assert.equal(await values(page, 'Accepte_apparaitre', 10), false);
  }));

test('une fiche masquée depuis Grist ou par un autre responsable est proposée à la réactivation dès que l’annuaire est relu', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openDeparture(page);
    assert.equal(await rowsOf(page).count(), 3);
    await page.evaluate(() => { window.__tables.BDD.Accepte_apparaitre[window.__tables.BDD.id.indexOf(6)] = false; window.__triggerRecords(); });
    await until(async () => (await dlg(page).locator('#departGoneTitle').textContent()) === 'Fiches qui n’apparaissent pas (3)', 'la liste n’a pas été relue');
    assert.equal(await rowsOf(page).count(), 2, 'deux personnes qui apparaissent');
    assert.equal(await dlg(page).locator('[data-state="removed"]').count(), 3, 'et les trois autres plus bas');
  }));

// ===== Ce que Grist refuse, ce qui a changé, ce qui manque =====

test('Grist refuse l’écriture : le message le dit, rien n’est changé, et le responsable peut recommencer', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openDeparture(page);
    await departButton(page, 'Hugo Bernard').click();
    await chooseRecipient(page, 'Ana Martin');
    await depart.press(page, 'Continuer').click();
    await headingIs(page, 'Désactiver la fiche de Hugo Bernard ?');
    await page.evaluate(() => { window.__denyRows = { BDD: [10] }; });
    await depart.press(page, 'Désactiver la fiche').click();
    await headingIs(page, 'Départ de Hugo Bernard');
    assert.match(await dlg(page).locator('.notice').innerText(), /Grist a refusé la modification : vos droits ne permettent pas de désactiver cette fiche/);
    assert.equal(await values(page, 'Accepte_apparaitre', 10), true);
    assert.deepEqual(await values(page, 'Taches', 1), ['L', 1, 3], 'ni les valeurs d’Ana n’ont été écrites : tout ou rien');
    assert.equal(await recipient(page).textContent(), 'Ana Martin', 'le choix est gardé pour recommencer');
    assert.ok((await Promise.all(logs.errors)).some(line => /\[DEPART\] écriture impossible/.test(line)), 'la console dit pourquoi');

    await page.evaluate(() => { window.__denyRows = {}; });
    await depart.press(page, 'Continuer').click();
    await depart.press(page, 'Désactiver la fiche').click();
    await dlg(page).locator('.rq-done').waitFor();
    assert.equal(await values(page, 'Accepte_apparaitre', 10), false);
  }));

test('si l’une des deux fiches a changé dans Grist pendant la relecture, rien n’est écrit et le responsable relit', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openDeparture(page);
    await departButton(page, 'Hugo Bernard').click();
    await chooseRecipient(page, 'Ana Martin');
    await depart.press(page, 'Continuer').click();
    await headingIs(page, 'Désactiver la fiche de Hugo Bernard ?');
    await page.evaluate(() => { window.__tables.BDD.Taches[0] = ['L', 1, 3, 2]; }); // quelqu'un modifie la fiche d'Ana dans Grist, sans que le widget le sache
    await depart.press(page, 'Désactiver la fiche').click();
    await headingIs(page, 'Départ de Hugo Bernard');
    assert.match(await dlg(page).locator('.notice').innerText(), /L’une des deux fiches a changé dans Grist pendant que vous relisiez : rien n’a été écrit/);
    assert.deepEqual(await updates(page), []);
    await depart.press(page, 'Continuer').click();
    await headingIs(page, 'Désactiver la fiche de Hugo Bernard ?');
    assert.deepEqual(await groupLines(page, 'taches'), { count: 'Avant 3 valeurs → après 4 valeurs', lines: ['Ajoutées : Veille'] });
    await depart.press(page, 'Désactiver la fiche').click();
    await dlg(page).locator('.rq-done').waitFor();
    assert.deepEqual(await values(page, 'Taches', 1), ['L', 1, 3, 2, 4]);
  }));

test('un responsable qui est aussi sur la liste des responsables de l’établissement est prévenu de le retirer', { skip }, () =>
  withWidget({ tables: world(tables => { tables.ACL.id.push(4); tables.ACL.email.push('hugo@chu-bordeaux.example'); tables.ACL.Responsable_de_l_Etablissement.push(1); tables.ACL.admin.push(false); tables.BDD.email[tables.BDD.id.indexOf(10)] = 'hugo@chu-bordeaux.example'; }), user: ANA_EMAIL }, async ({ page }) => {
    await openDeparture(page);
    await departButton(page, 'Hugo Bernard').click();
    assert.match(await dlg(page).locator('.notice').innerText(), /Cette personne est aussi responsable de l’établissement : pensez à la retirer de la liste des responsables/);
  }));

test('un administrateur qui ouvre l’annuaire n’ajoute aucune colonne pour le départ : la 1.46.0 en créait une, la 1.46.1 non', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForTimeout(400); // les colonnes se tentent après le chargement de l'annuaire
    assert.deepEqual(await structureCalls(page), []);
    assert.equal(await page.evaluate(() => 'Fiche_desactivee' in window.__tables.BDD), false);
    await openDeparture(page);
    assert.equal(await departButton(page, 'Hugo Bernard').count(), 1, 'le départ se propose sans rien de plus que les colonnes de la fiche');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

// ===== La personne qui est partie =====

test('une personne partie qui se connecte encore est une personne qui n’a pas accepté d’apparaître : aucun écran à part, et elle ne figure plus dans les cartes', { skip }, () =>
  withWidget({ tables: world(tables => { tables.BDD.Accepte_apparaitre[tables.BDD.id.indexOf(6)] = false; }), user: 'hostile@chu-bordeaux.example' }, async ({ page, logs }) => {
    await waitForCards(page, 3);
    assert.equal(await page.locator('#gatePanel[data-kind="deactivated"]').count(), 0, 'plus d’écran « fiche désactivée » : la case suffit');
    assert.equal(await page.locator('#gatePanel').isHidden(), true);
    assert.equal((await cardNames(page)).some(name => /Hostile/.test(name)), false);
    assert.equal(await page.locator('#accountBar .presence-switch').getAttribute('aria-checked'), 'false', 'son interrupteur est éteint');
    assert.deepEqual(await Promise.all(logs.pageErrors), []);
  }));

test('le responsable d’un autre établissement ne voit ni les collègues ni les fiches masquées du CHU', { skip }, () =>
  withWidget({ tables: world(tables => { tables.BDD.Accepte_apparaitre[tables.BDD.id.indexOf(6)] = false; }), user: BOB_EMAIL }, async ({ page }) => {
    await waitForCards(page, 3);
    await page.locator('#accountBar .account-etab').click();
    await page.locator('#etabName').waitFor();
    assert.equal(await page.locator('#etabName').inputValue(), 'Université Bordeaux Montaigne');
    await etab.press(page, 'Un·e collègue quitte l’établissement…').click();
    await dlg(page).locator('#departPeopleTitle').waitFor();
    assert.deepEqual(await rowsOf(page).locator('.es-resp-name').allTextContents(), ['Bob Durandvous'], 'seulement les personnes de l’UBM');
    assert.equal(await dlg(page).locator('#departGoneTitle').count(), 0, 'les fiches masquées du CHU ne sont pas les siennes à réactiver');
    assert.equal(await toast(page).isHidden(), true);
  }));
