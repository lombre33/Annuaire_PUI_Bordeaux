// Test navigateur de la modification d'une fiche : charge le vrai index.html dans
// Chromium, avec le faux document Grist de tests/support/fake-grist.js, et vérifie ce
// que voit et obtient la personne : qui a un bouton « Modifier », le formulaire, la
// relecture (la carte avant et la carte après, ce qui change repéré), l'écriture en une
// seule action Grist, les refus, les conflits et l'accessibilité de la fenêtre.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withIdentity, withSchema, HOSTILE_FIRST_NAME, ANA_EMAIL, IRIS_EMAIL, ADMIN_EMAIL } from './fixtures.mjs';
import { skip, reload, waitForCards, withWidget } from './support/browser.mjs';

// ===== Outils =====

// Ana est connectée avec son adresse, administratrice dans ACL : elle peut modifier toutes
// les fiches. Ici elle n'administre pas : elle ne peut modifier que la sienne.
function memberTables() {
  const tables = withIdentity();
  tables.ACL.admin[0] = false;
  return tables;
}

// Une deuxième ligne de BDD avec la même adresse qu'Ana.
function withDuplicate(tables) {
  Object.keys(tables.BDD).forEach(column => {
    tables.BDD[column].push(column === 'id' ? 13 : structuredClone(tables.BDD[column][0]));
  });
  tables.BDD.prenom[12] = 'Ana-Doublon';
  return tables;
}

// Le téléphone est une colonne de texte, comme dans un document où elle n'est pas numérique.
function textPhoneTables() {
  const tables = withSchema(memberTables(), { phoneType: 'Text' });
  tables.BDD.numero_de_telephone = tables.BDD.numero_de_telephone.map(value => (value ? '05 56 78 90 12' : ''));
  return tables;
}

// Douze compétences de plus : la liste est assez longue pour proposer une recherche.
function manyCompetences() {
  const tables = memberTables();
  for (let n = 5; n <= 16; n += 1) {
    tables.Competences.id.push(n);
    tables.Competences.Competences.push(`Technique ${n}`);
    tables.Competences.Competences_corrigees.push('');
    tables.Competences.Macro_competences.push(n <= 10 ? 'Technique' : 'Gestion');
  }
  return tables;
}

const gridCard = (page, name) => page.locator('#cardsGrid .contact-card').filter({ has: page.locator('.name', { hasText: name }) });
const dialog = page => page.locator('#profileDialog');
const isOpen = page => page.evaluate(() => document.getElementById('profileDialog').open);
const heading = page => page.locator('#profileTitle');
const headingIs = (page, expected) =>
  page.waitForFunction(value => document.getElementById('profileTitle').textContent === value, expected);
const focusedId = page => page.evaluate(() => document.activeElement.id);
const closed = page => page.waitForFunction(() => !document.getElementById('profileDialog').open);
// Le focus revient à l'élément voulu (sélecteur CSS) : l'événement « close » qui le rend est
// envoyé après que la fenêtre a cessé d'être ouverte, d'où l'attente.
const focusReturnsTo = (page, selector) => page.waitForFunction(
  wanted => document.activeElement?.matches(wanted), selector, { timeout: 3000 }
);
const press = (page, name) => dialog(page).getByRole('button', { name, exact: true });
const closeSaved = page => dialog(page).locator('.dlg-foot').getByRole('button', { name: 'Fermer', exact: true });
const field = (page, key) => page.locator(`#profile-${key}`);
const picker = (page, label) => dialog(page).locator('.grp').filter({ has: page.locator('.grp-title', { hasText: new RegExp(`^${label}$`) }) });
const chip = (page, group, label) => picker(page, group).locator('.pick', { hasText: new RegExp(`^${label}$`) });
const isPressed = async (page, group, label) => (await chip(page, group, label).getAttribute('aria-pressed')) === 'true';
const summary = page => dialog(page).locator('.dlg-summary').textContent();
const alertText = page => dialog(page).locator('.dlg-alert [role="alert"]').textContent();
const notices = page => dialog(page).locator('.notice');

// Les actions que le widget a envoyées à Grist pour BDD (écrites ou refusées).
const bddCalls = page => page.evaluate(() => window.__fake.calls.filter(call => call.table === 'BDD'));
const bddCell = (page, column, index = 0) => page.evaluate(([name, at]) => window.__tables.BDD[name][at], [column, index]);

// Les boutons « Modifier » apparaissent quand l'identité est lue : on les attend.
const waitForEditButtons = (page, count) => page.waitForFunction(
  expected => document.querySelectorAll('#cardsGrid .card-actions:not([hidden]) .card-edit').length === expected, count
);

async function until(condition, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

// Le « mode admin » du bandeau : un interrupteur réservé aux administrateurs, éteint au départ.
const adminToggle = page => page.locator('#accountBar .account-admin');
const adminStrip = page => page.locator('#adminStrip');
const isAdminMode = async page => (await adminToggle(page).getAttribute('aria-pressed')) === 'true';

// Allume le mode admin et attend que les boutons « Modifier » des cartes soient là.
async function enableAdminMode(page, buttons = 4) {
  await waitForCards(page, 4);
  await adminToggle(page).waitFor();
  await adminToggle(page).click();
  await waitForEditButtons(page, buttons);
}

// Ouvre sa propre fiche par le bandeau « Ma présence ».
async function openOwn(page, cards = 4) {
  await waitForCards(page, cards);
  const button = page.locator('#accountBar .account-edit');
  await button.waitFor();
  await button.click();
  await dialog(page).waitFor();
}

// Les changements d'Ana utilisés par la plupart des scénarios : une fonction, une instance
// remplacée, une compétence ajoutée.
async function changeAna(page) {
  await field(page, 'Fonction').fill('Cheffe de service');
  await chip(page, 'Instances', 'CME').click();
  await chip(page, 'Instances', 'COVIRIS').click();
  await chip(page, 'Compétences', 'Pharmacovigilance').click();
}

async function review(page) {
  await press(page, 'Relire mes modifications').click();
  await headingIs(page, 'Relire vos modifications');
}

// ===== Qui voit un bouton « Modifier » =====

test('une personne ne voit « Modifier » que sur sa propre fiche, marquée « Votre fiche »', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await waitForEditButtons(page, 1);
    const mine = gridCard(page, 'Ana Martin');
    assert.equal(await mine.locator('.card-edit').isVisible(), true);
    assert.equal(await mine.locator('.card-edit').getAttribute('aria-label'), 'Modifier la fiche de Ana Martin');
    assert.equal(await mine.locator('.own-flag').textContent(), 'Votre fiche');
    assert.equal(await gridCard(page, 'Gina').locator('.card-actions').isHidden(), true);
    assert.equal(await gridCard(page, 'Hugo').locator('.card-actions').isHidden(), true);
    assert.equal(await page.locator('#accountBar .account-edit').textContent(), 'Modifier mon profil');
    assert.equal(await isOpen(page), false, 'la fenêtre reste fermée tant qu\'on ne la demande pas');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('une administratrice ne modifie que sa fiche tant que le mode admin est éteint, et toutes une fois allumé', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await waitForEditButtons(page, 1);
    assert.equal(await adminToggle(page).textContent(), 'Mode admin');
    assert.equal(await isAdminMode(page), false, 'éteint au départ');
    assert.equal(await adminStrip(page).isHidden(), true);
    assert.equal(await gridCard(page, 'Hugo Bernard').locator('.card-actions').isHidden(), true, 'rien sur la fiche d\'un autre');
    assert.equal(await gridCard(page, 'Ana Martin').locator('.card-edit').textContent(), '✎ Modifier');

    await adminToggle(page).click();
    await waitForEditButtons(page, 4);
    assert.equal(await isAdminMode(page), true);
    assert.equal(await adminStrip(page).isVisible(), true);
    assert.match(await adminStrip(page).textContent(), /^Mode admin : un bouton « Modifier la fiche » apparaît sur chaque carte\./);
    assert.equal(await gridCard(page, 'Hugo Bernard').locator('.card-edit').textContent(), '✎ Modifier la fiche');
    assert.equal(await gridCard(page, 'Hugo Bernard').locator('.card-edit').getAttribute('aria-label'), 'Modifier la fiche de Hugo Bernard');
    assert.equal(await gridCard(page, 'Ana Martin').locator('.card-edit').textContent(), '✎ Modifier', 'sa propre carte garde son libellé');
    assert.equal(await page.locator('#cardsGrid .own-flag:visible').count(), 1);
    assert.equal(await gridCard(page, 'Ana Martin').locator('.own-flag').isVisible(), true);

    await adminToggle(page).click();
    await waitForEditButtons(page, 1);
    assert.equal(await isAdminMode(page), false, 'on l\'éteint comme on l\'a allumé');
    assert.equal(await adminStrip(page).isHidden(), true);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le mode admin s\'allume au clavier, annonce son état, et garde le focus quand les cartes sont redessinées', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForEditButtons(page, 1);
    assert.equal(await adminToggle(page).evaluate(node => node.tagName), 'BUTTON', 'un vrai bouton : Entrée et Espace l\'actionnent');
    await adminToggle(page).focus();
    await page.keyboard.press('Enter');
    await waitForEditButtons(page, 4);
    assert.equal(await adminToggle(page).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'account-admin', 'le focus ne bouge pas');
    await page.keyboard.press('Space');
    await waitForEditButtons(page, 1);
    assert.equal(await adminToggle(page).getAttribute('aria-pressed'), 'false');
    assert.equal(await adminToggle(page).getAttribute('title'), 'Mode admin : modifier la fiche de n\'importe quelle personne');
  }));

test('le mode admin reste allumé quand l\'annuaire est relu après une modification dans Grist', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await enableAdminMode(page);
    await page.evaluate(() => { window.__tables.BDD.Fonction[9] = 'Directeur'; });
    await reload(page);
    await until(async () => (await gridCard(page, 'Hugo Bernard').locator('.fonction').textContent()) === 'Directeur', 'l\'annuaire n\'a pas été relu');
    assert.equal(await isAdminMode(page), true);
    await waitForEditButtons(page, 4);
    assert.equal(await adminStrip(page).isVisible(), true);
  }));

test('un administrateur qui n\'a pas de fiche a un bandeau sans interrupteur de présence, et le mode admin pour modifier celles des autres', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await adminToggle(page).waitFor();
    assert.equal(await page.locator('#accountBar').isVisible(), true);
    assert.equal(await page.locator('#accountBar .account-name').textContent(), 'Administrateur');
    assert.match(await page.locator('#accountBar .account-detail').textContent(), new RegExp(`^Connecté avec ${ADMIN_EMAIL.replace('.', '\\.')} : cette adresse ne figure pas dans l'annuaire, vous n'avez donc pas de fiche à modifier`));
    assert.equal(await page.locator('#accountBar .presence-switch').isHidden(), true, 'pas de fiche, pas de choix de présence');
    assert.equal(await page.locator('#accountBar .account-edit').isHidden(), true);
    assert.equal(await page.locator('#cardsGrid .card-actions:not([hidden])').count(), 0, 'rien à modifier tant que le mode est éteint');

    await adminToggle(page).click();
    await waitForEditButtons(page, 4);
    assert.equal(await page.locator('#cardsGrid .own-flag:visible').count(), 0);
    assert.ok(!JSON.stringify(await Promise.all([...logs.warnings, ...logs.infos])).includes('@'), 'aucune adresse dans la console');
  }));

for (const [who, options] of [
  ['un membre', { tables: memberTables(), user: ANA_EMAIL }],
  ['une personne dont la fiche est masquée', { tables: withIdentity(), user: IRIS_EMAIL }],
  ['une personne que ni BDD ni ACL ne connaissent', { tables: withIdentity(), user: 'inconnu@example.fr' }]
]) {
  test(`${who} ne voit jamais « Mode admin », et ne peut pas l'allumer en forçant le bouton`, { skip }, () =>
    withWidget(options, async ({ page }) => {
      await waitForCards(page, 4);
      await page.waitForFunction(() => window.__fake.calls.some(call => call.table === 'Annuaire_Sonde' && call.action === 'RemoveRecord'));
      await page.locator('#accountBar:not([hidden])').waitFor();
      assert.equal(await adminToggle(page).isHidden(), true);
      await page.evaluate(() => {
        const button = document.querySelector('#accountBar .account-admin');
        button.hidden = false;
        button.click();
      });
      assert.equal(await adminStrip(page).isHidden(), true, 'le verrou d\'interface tient ; Grist reste la vraie protection');
      assert.equal(await page.locator('#cardsGrid .card-edit:visible').filter({ hasText: 'Modifier la fiche' }).count(), 0);
      assert.equal(await page.locator('#cardsGrid .card-actions:not([hidden]) .card-edit').count(), options.user === ANA_EMAIL ? 1 : 0);
    }));
}

test('un administrateur dont le mode est éteint n\'ouvre rien en forçant un bouton « Modifier » sur la fiche d\'un autre', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForEditButtons(page, 1);
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('#cardsGrid .contact-card')].find(candidate => candidate.textContent.includes('Gina'));
      const box = card.querySelector('.card-actions');
      box.hidden = false;
      const button = box.querySelector('.card-edit');
      button.dataset.rowId = '9';
      button.click();
    });
    assert.equal(await isOpen(page), false);
  }));

const settled = {
  probeRemoved: page => page.waitForFunction(() => window.__fake.calls.some(call => call.table === 'Annuaire_Sonde' && call.action === 'RemoveRecord')),
  warned: (page, logs) => until(() => logs.warnings.length > 0, 'l\'avertissement sur l\'identité n\'est pas venu'),
  immediately: async () => {}
};

for (const [who, options, wait] of [
  ['un compte anonyme', { tables: withIdentity(), user: null }, settled.probeRemoved],
  ['une adresse que ni BDD ni ACL ne connaissent', { tables: withIdentity(), user: 'inconnu@example.fr' }, settled.probeRemoved],
  ['un compte Lecteur', { tables: withIdentity(), user: ANA_EMAIL, readOnly: true }, settled.immediately],
  ['un document sans table-sonde', { tables: sampleTables(), user: ANA_EMAIL }, settled.warned]
]) {
  test(`${who} : aucun bouton « Modifier », nulle part`, { skip }, () =>
    withWidget(options, async ({ page, logs }) => {
      await waitForCards(page, 4);
      await wait(page, logs);
      assert.equal(await page.locator('#cardsGrid .card-actions:not([hidden])').count(), 0);
      assert.equal(await page.locator('#accountBar .account-edit').isHidden(), true);
      assert.equal(await isOpen(page), false);
    }));
}

test('deux fiches pour la même adresse : chacune a son bouton, le bandeau ne propose pas « Modifier mon profil »', { skip }, () =>
  withWidget({ tables: withDuplicate(memberTables()), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 5);
    await waitForEditButtons(page, 2);
    assert.equal(await page.locator('#accountBar').isVisible(), true, 'l\'interrupteur de présence reste proposé');
    assert.equal(await page.locator('#accountBar .account-edit').isHidden(), true, 'on ne sait pas laquelle ouvrir');
    assert.equal(await page.locator('#cardsGrid .own-flag:visible').count(), 2);
    assert.equal((await Promise.all(logs.warnings)).filter(line => line.includes('2 lignes de BDD portent la même adresse')).length, 1);
  }));

test('un bouton « Modifier » forcé dans le DOM sur une fiche qui n\'est pas à soi n\'ouvre rien', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForEditButtons(page, 1);
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('#cardsGrid .contact-card')].find(candidate => candidate.textContent.includes('Gina'));
      const box = card.querySelector('.card-actions');
      box.hidden = false;
      const button = box.querySelector('.card-edit');
      button.dataset.rowId = '9'; // la fiche de Gina
      button.click();
    });
    assert.equal(await isOpen(page), false, 'le verrou d\'interface tient ; Grist reste la vraie protection');
  }));

// ===== Le formulaire =====

test('« Modifier mon profil » ouvre le formulaire avec les valeurs de la fiche, sans rien écrire', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.equal(await heading(page).textContent(), 'Modifier mon profil');
    assert.equal(await focusedId(page), 'profileTitle', 'le lecteur d\'écran entend le titre de l\'étape');
    assert.match(await dialog(page).locator('.dlg-sub').textContent(), /vous relirez votre carte avant et après/);

    assert.equal(await dialog(page).locator('.ident-name').textContent(), 'Ana Martin');
    assert.equal(await dialog(page).locator('.ident-mail').textContent(), ANA_EMAIL);
    assert.equal(await dialog(page).locator('.pill').textContent(), 'CHU');
    assert.match(await dialog(page).locator('.ident-lock').textContent(), /^Verrouillé : l'e-mail et l'établissement sont liés à votre compte/);
    assert.equal(await dialog(page).locator('input[type="email"], #profile-email, #profile-Etablissement').count(), 0, 'ni adresse ni établissement à modifier');

    assert.equal(await field(page, 'prenom').inputValue(), 'Ana');
    assert.equal(await field(page, 'nom').inputValue(), 'Martin');
    assert.equal(await field(page, 'Fonction').inputValue(), 'Pharmacienne');
    assert.equal(await field(page, 'numero_de_telephone').inputValue(), '05 56 78 90 12');
    assert.equal(await field(page, 'Role_dans_le_PUI').evaluate(select => select.selectedOptions[0].textContent), 'Référent qualité');

    assert.deepEqual(await dialog(page).locator('.grp-title').allTextContents(),
      ['Instances', 'Actions', 'GT', 'Compétences', 'Communautés', 'Tâches']);
    assert.equal(await isPressed(page, 'Instances', 'CME'), true);
    assert.equal(await isPressed(page, 'Instances', 'COVIRIS'), false);
    assert.equal(await isPressed(page, 'Compétences', 'Oncologie'), true);
    assert.equal(await isPressed(page, 'Compétences', 'Hématologie'), true);
    assert.equal(await isPressed(page, 'Compétences', 'Pharmacovigilance'), false);
    assert.equal(await picker(page, 'Compétences').locator('.grp-count').textContent(), '2 sélectionnés');
    assert.deepEqual(await picker(page, 'Compétences').locator('.subgrp-title').allTextContents(), ['Cancérologie', 'Pharmacie', 'Autres'],
      'les compétences sont rangées par domaine, le détail reste disponible');

    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await press(page, 'Relire mes modifications').isDisabled(), true);
    assert.deepEqual(await bddCalls(page), []);
  }));

test('une saisie refusée est signalée sous son champ et ne laisse pas passer à la relecture', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    const phoneError = page.locator('#profile-numero_de_telephone-error');
    await field(page, 'numero_de_telephone').fill('12');
    assert.equal(await phoneError.textContent(), 'un numéro français à 10 chiffres est attendu (05 56 78 90 12).');
    assert.equal(await field(page, 'numero_de_telephone').getAttribute('aria-invalid'), 'true');
    assert.equal(await summary(page), 'Corrigez les champs signalés');
    assert.equal(await press(page, 'Relire mes modifications').isDisabled(), true);

    await field(page, 'numero_de_telephone').fill('05 56 78 90 12');
    assert.equal(await phoneError.isHidden(), true);
    assert.equal(await summary(page), 'Aucune modification');

    await field(page, 'Fonction').fill('=1+1');
    assert.equal(await page.locator('#profile-Fonction-error').textContent(), 'ne peut pas commencer par = + - ou @.');
    await field(page, 'Fonction').fill('x'.repeat(201));
    assert.equal(await page.locator('#profile-Fonction-error').textContent(), '200 caractères au plus.');
    await field(page, 'Fonction').fill('Cheffe');
    assert.equal(await page.locator('#profile-Fonction-error').isHidden(), true);
    assert.equal(await press(page, 'Relire mes modifications').isEnabled(), true);

    await field(page, 'prenom').fill('');
    await field(page, 'nom').fill('');
    assert.equal(await page.locator('#profile-prenom-error').textContent(), 'Indiquez au moins un prénom ou un nom.');
    assert.equal(await page.locator('#profile-nom-error').textContent(), 'Indiquez au moins un prénom ou un nom.');
    assert.equal(await press(page, 'Relire mes modifications').isDisabled(), true);
    assert.deepEqual(await bddCalls(page), []);
  }));

test('le numéro saisi sans espaces est remis en forme en quittant le champ', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'numero_de_telephone').fill('0556789013');
    await field(page, 'numero_de_telephone').blur();
    assert.equal(await field(page, 'numero_de_telephone').inputValue(), '05 56 78 90 13');
    assert.equal(await summary(page), '1 champ modifié');
  }));

test('la recherche d\'une liste longue ne retire rien de la sélection, et masque les domaines vides', { skip }, () =>
  withWidget({ tables: manyCompetences(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    const search = picker(page, 'Compétences').locator('input.pick-search');
    assert.equal(await search.count(), 1, 'au-delà de douze valeurs, une recherche est proposée');
    assert.equal(await picker(page, 'Instances').locator('input.pick-search').count(), 0);
    await search.fill('technique 7');
    assert.deepEqual(await picker(page, 'Compétences').locator('.pick:not([hidden])').allTextContents(), ['Technique 7']);
    assert.deepEqual(await picker(page, 'Compétences').locator('.subgrp:not([hidden]) .subgrp-title').allTextContents(), ['Technique']);
    await chip(page, 'Compétences', 'Technique 7').click();
    await search.fill('');
    assert.equal(await picker(page, 'Compétences').locator('.pick[hidden]').count(), 0);
    assert.equal(await isPressed(page, 'Compétences', 'Oncologie'), true, 'la sélection de départ est intacte');
    assert.equal(await picker(page, 'Compétences').locator('.grp-count').textContent(), '3 sélectionnés');
  }));

test('Échap prévient avant d\'abandonner des modifications, puis ferme ; sans modification il ferme tout de suite', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await page.keyboard.press('Escape');
    await closed(page);

    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), true, 'des modifications sont en cours : la fenêtre reste ouverte');
    const hint = dialog(page).locator('.dlg-hint');
    assert.equal(await hint.isVisible(), true);
    assert.equal(await hint.textContent(), 'Des modifications ne sont pas enregistrées. Appuyez encore sur Échap pour les abandonner.');

    // Une nouvelle saisie annule l'avertissement : il ne vaut que pour l'état présent.
    await field(page, 'Fonction').press('End');
    await page.keyboard.type('!');
    assert.equal(await hint.isHidden(), true);
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), true);
    assert.equal(await hint.isVisible(), true);

    await page.keyboard.press('Escape');
    await closed(page);
    assert.deepEqual(await bddCalls(page), [], 'abandonner n\'écrit rien');
    assert.equal(await bddCell(page, 'Fonction'), 'Pharmacienne');
    await focusReturnsTo(page, '#accountBar .account-edit'); // le bouton qui a ouvert la fenêtre
  }));

test('« Annuler » et la croix ferment sans rien écrire, et la fenêtre rouverte repart de la fiche', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await press(page, 'Annuler').click();
    await closed(page);
    await openOwn(page);
    assert.equal(await field(page, 'Fonction').inputValue(), 'Pharmacienne', 'le brouillon abandonné n\'est pas gardé');
    await dialog(page).locator('[data-close]').click();
    await closed(page);
    assert.deepEqual(await bddCalls(page), []);
  }));

test('une mise à jour du document pendant la saisie ne ferme pas la fenêtre et ne touche pas au brouillon', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await page.evaluate(() => { window.__tables.BDD.Fonction[2] = 'Une autre modification'; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('#cardsGrid .contact-card') !== null);
    assert.equal(await isOpen(page), true);
    assert.equal(await field(page, 'Fonction').inputValue(), 'Cheffe');
    assert.equal(await summary(page), '1 champ modifié');
  }));

// ===== La relecture : la carte avant, la carte après =====

test('la relecture montre la carte avant et la carte après, ce qui change est repéré, et rien n\'est écrit', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openOwn(page);
    await changeAna(page);
    assert.equal(await summary(page), '3 champs modifiés');
    await review(page);
    assert.equal(await focusedId(page), 'profileTitle');
    assert.match(await dialog(page).locator('.dlg-sub').textContent(), /Rien n'est enregistré avant « Valider »/);

    const before = dialog(page).locator('.preview-before .contact-card');
    const after = dialog(page).locator('.preview-after .contact-card');
    assert.equal(await dialog(page).locator('.preview-before .preview-label').textContent(), 'Avant');
    assert.equal(await dialog(page).locator('.preview-before .preview-note').textContent(), 'telle qu\'elle est aujourd\'hui');
    assert.equal(await dialog(page).locator('.preview-after .preview-label').textContent(), 'Après');
    assert.equal(await dialog(page).locator('.preview-after .preview-note').textContent(), 'telle qu\'elle sera');
    assert.equal(await notices(page).count(), 0, 'Ana figure dans l\'annuaire : rien à signaler');

    // Avant : la carte de l'annuaire, sans aucun repère.
    assert.equal(await before.locator('.name').textContent(), 'Ana Martin');
    assert.equal(await before.locator('.fonction').textContent(), 'Pharmacienne');
    assert.deepEqual(await before.locator('.tag').allTextContents(), ['CME', 'Vaccination', 'Oncologie', 'Hématologie', 'Réseau douleur', 'Référent qualité']);
    assert.equal(await before.locator('.mark-new, .mark-gone').count(), 0);

    // Après : ce qui change se voit (classe, pastille écrite pour un texte, « + » pour un tag)
    // et se dit (texte pour les lecteurs d'écran).
    assert.equal(await after.locator('.fonction.mark-new').textContent(), 'Cheffe de service modifié');
    assert.equal(await after.locator('.fonction .mk-pill').isVisible(), true);
    assert.equal(await after.locator('.mk-pill').count(), 1, 'une seule ligne de texte a changé');
    assert.deepEqual(await after.locator('.tag.mark-new').allTextContents(), ['COVIRIS (ajouté)', 'Pharmacovigilance (ajouté)']);
    assert.deepEqual(await after.locator('.tag.mark-gone').allTextContents(), ['CME (retiré)']);
    assert.equal(await after.locator('.name.mark-new, .tel.mark-new, .mark-new .email').count(), 0, 'ce qui ne change pas n\'est pas repéré');
    assert.deepEqual(await after.locator('.tag:not(.mark-new):not(.mark-gone)').allTextContents(),
      ['Vaccination', 'Oncologie', 'Hématologie', 'Réseau douleur', 'Référent qualité']);

    // Les deux cartes sont des aperçus : rien n'y est cliquable.
    for (const card of [before, after]) {
      assert.equal(await card.locator('a.email').getAttribute('href'), null);
      assert.equal(await card.locator('.etablissement-tag').isDisabled(), true);
      assert.equal(await card.locator('button.tag').count(), 0);
      assert.equal(await card.locator('.card-actions').isHidden(), true);
    }

    // La légende et le détail.
    assert.deepEqual(await dialog(page).locator('.legend-key').allTextContents(),
      ['Ajouté ou modifié : en vert, avec une pastille ou un «\u00a0+\u00a0»', 'Retiré : barré en rouge']);
    assert.deepEqual(await dialog(page).locator('.recap .diff-label').allTextContents(), ['Fonction', 'Instances', 'Compétences']);
    const first = dialog(page).locator('.recap .diff-row').first();
    assert.equal(await first.locator('del').textContent(), 'Pharmacienne');
    assert.equal(await first.locator('ins').textContent(), 'Cheffe de service');
    assert.match(await dialog(page).locator('.recap .chg-add').first().textContent(), /COVIRIS/);
    assert.match(await dialog(page).locator('.recap .chg-del').first().textContent(), /CME/);
    assert.equal(await summary(page), '3 champs modifiés');

    // Sur grand écran, avant et après sont côte à côte.
    const left = await dialog(page).locator('.preview-before').boundingBox();
    const right = await dialog(page).locator('.preview-after').boundingBox();
    assert.ok(right.x > left.x + left.width - 1, 'avant à gauche, après à droite');
    assert.ok(Math.abs(right.y - left.y) < 4);

    // Rien n'est écrit, et l'annuaire derrière la fenêtre n'a pas bougé.
    assert.deepEqual(await bddCalls(page), []);
    assert.equal(await gridCard(page, 'Ana Martin').locator('.fonction').textContent(), 'Pharmacienne');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('« Retour » ramène au formulaire avec le brouillon intact, puis on relit à nouveau', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await changeAna(page);
    await review(page);
    await press(page, 'Retour').click();
    await headingIs(page, 'Modifier mon profil');
    assert.equal(await focusedId(page), 'profileTitle');
    assert.equal(await field(page, 'Fonction').inputValue(), 'Cheffe de service');
    assert.equal(await isPressed(page, 'Instances', 'CME'), false);
    assert.equal(await isPressed(page, 'Instances', 'COVIRIS'), true);
    assert.equal(await isPressed(page, 'Compétences', 'Pharmacovigilance'), true);
    assert.equal(await summary(page), '3 champs modifiés');
    await field(page, 'Fonction').fill('Directrice');
    await review(page);
    assert.match(await dialog(page).locator('.preview-after .fonction').textContent(), /^Directrice/);
    assert.deepEqual(await bddCalls(page), []);
  }));

test('une relecture qui changerait tout en rien (les valeurs d\'origine remises) n\'est pas proposée', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await chip(page, 'Instances', 'COVIRIS').click();
    await field(page, 'Fonction').fill('Pharmacienne');
    await chip(page, 'Instances', 'COVIRIS').click();
    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await press(page, 'Relire mes modifications').isDisabled(), true);
  }));

// ===== Valider : l'écriture =====

test('« Valider » écrit en une seule action Grist, confirme, puis l\'annuaire et le formulaire montrent la fiche à jour', { skip }, () =>
  withWidget({ tables: withSchema(memberTables()), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openOwn(page);
    await changeAna(page);
    await review(page);
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');

    assert.deepEqual(await bddCalls(page), [{
      action: 'UpdateRecord', table: 'BDD', rowId: 1, ok: true,
      values: { Fonction: 'Cheffe de service', Instances: ['L', 3], Competences: ['L', 1, 2, 3] }
    }]);
    assert.equal(await dialog(page).locator('.sent h3').textContent(), 'Vos modifications sont enregistrées');
    assert.equal(await dialog(page).locator('.sent p').textContent(), 'Elles s\'appliquent tout de suite dans Grist, sans validation.');
    assert.equal(await dialog(page).locator('.sent .recap-title').textContent(), 'Ce qui a changé');
    assert.equal(await dialog(page).locator('.sent .diff-row').count(), 3);
    assert.equal(await notices(page).count(), 0, 'Grist a tout gardé : aucun avertissement');
    assert.equal(await focusedId(page), 'profileTitle');

    // L'annuaire derrière la fenêtre a été relu.
    await until(async () => (await gridCard(page, 'Ana Martin').locator('.fonction').textContent()) === 'Cheffe de service',
      'la carte de l\'annuaire n\'a pas été mise à jour');
    assert.deepEqual(await gridCard(page, 'Ana Martin').locator('.tag').allTextContents(),
      ['COVIRIS', 'Vaccination', 'Oncologie', 'Hématologie', 'Pharmacovigilance', 'Réseau douleur', 'Référent qualité']);

    await closeSaved(page).click();
    await closed(page);
    await waitForCards(page, 4);
    await focusReturnsTo(page, '#accountBar .account-edit');

    // La fenêtre rouverte montre la fiche enregistrée.
    await openOwn(page);
    assert.equal(await field(page, 'Fonction').inputValue(), 'Cheffe de service');
    assert.equal(await isPressed(page, 'Instances', 'COVIRIS'), true);
    assert.equal(await isPressed(page, 'Instances', 'CME'), false);
    assert.equal(await summary(page), 'Aucune modification');

    // Les colonnes que le widget ne modifie jamais n'ont pas bougé.
    assert.equal(await bddCell(page, 'email'), ANA_EMAIL);
    assert.equal(await bddCell(page, 'Accepte_apparaitre'), true);
    assert.deepEqual(await bddCell(page, 'perimetre'), ['L', 1]);
    assert.equal(await bddCell(page, 'Etablissement'), 1);

    // La console ne dit rien de la personne.
    assert.deepEqual(await Promise.all(logs.errors), []);
    // Seule l'alerte du jeu d'exemple (Eve n'a pas d'établissement) : rien de la modification.
    assert.deepEqual((await Promise.all(logs.warnings)).filter(line => !line.startsWith('[ETABLISSEMENT]')), []);
    assert.ok(!JSON.stringify(await Promise.all([...logs.warnings, ...logs.infos])).includes('@'), 'aucune adresse dans la console');
  }));

test('le focus revient au bouton de la fiche modifiée, même quand les cartes ont été redessinées', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await enableAdminMode(page);
    const hugo = gridCard(page, 'Hugo Bernard').locator('.card-edit');
    await hugo.focus();
    await page.keyboard.press('Enter');
    await dialog(page).waitFor();
    await field(page, 'Fonction').fill('Directeur');
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire les modifications de Hugo Bernard');
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    await closeSaved(page).click();
    await closed(page);
    await focusReturnsTo(page, '#cardsGrid .card-edit[data-row-id="10"]'); // la carte de Hugo, redessinée
  }));

test('une administratrice modifie la fiche de quelqu\'un d\'autre : la fenêtre le dit, et seule cette fiche est écrite', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await enableAdminMode(page);
    await gridCard(page, 'Hugo Bernard').locator('.card-edit').click();
    await dialog(page).waitFor();
    assert.equal(await heading(page).textContent(), 'Modifier la fiche de Hugo Bernard');
    assert.match(await dialog(page).locator('.dlg-sub').textContent(), /en tant qu'administrateur/);
    assert.equal(await dialog(page).locator('.ident-name').textContent(), 'Hugo Bernard');
    assert.equal(await dialog(page).locator('.ident-lock').count(), 0, 'l\'administrateur peut changer l\'e-mail et l\'établissement : rien n\'est verrouillé');

    await field(page, 'Fonction').fill('Directeur');
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire les modifications de Hugo Bernard');
    assert.match(await dialog(page).locator('.preview-after .fonction').textContent(), /^Directeur/);
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.equal(await dialog(page).locator('.sent h3').textContent(), 'La fiche de Hugo Bernard est enregistrée');

    assert.deepEqual(await bddCalls(page), [{ action: 'UpdateRecord', table: 'BDD', rowId: 10, ok: true, values: { Fonction: 'Directeur' } }]);
    assert.deepEqual(await bddCell(page, 'Instances', 9), ['L', 999], 'la valeur que le formulaire ne montre pas est conservée');
    await until(async () => (await gridCard(page, 'Hugo Bernard').locator('.fonction').textContent()) === 'Directeur', 'la carte n\'a pas été mise à jour');
  }));

test('sa propre fiche garde le titre « Modifier mon profil », même pour une administratrice en mode admin', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await enableAdminMode(page);
    await gridCard(page, 'Ana Martin').locator('.card-edit').click();
    await dialog(page).waitFor();
    assert.equal(await heading(page).textContent(), 'Modifier mon profil');
    assert.equal(await press(page, 'Relire mes modifications').count(), 1);
  }));

// ===== L'administrateur change aussi l'e-mail et l'établissement d'une autre personne =====

// Allume le mode admin, puis ouvre la fiche de la personne dont la carte porte `name`.
async function openOther(page, name) {
  await enableAdminMode(page);
  await gridCard(page, name).locator('.card-edit').click();
  await dialog(page).waitFor();
}

const selectedLabel = page => field(page, 'Etablissement').evaluate(select => select.selectedOptions[0].textContent);

test('un administrateur voit l\'e-mail et l\'établissement d\'une autre personne comme des champs à modifier, une personne ne les voit pas', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await openOther(page, 'Hostile');
    assert.equal(await field(page, 'email').getAttribute('type'), 'email');
    assert.equal(await field(page, 'email').inputValue(), 'hostile@chu-bordeaux.fr');
    assert.equal(await selectedLabel(page), 'CHU');
    assert.deepEqual(await field(page, 'Etablissement').locator('option').allTextContents(), ['CHU', 'Clinique', 'INSERM', 'Institut Bergonié', 'UBM'],
      'tous les établissements, sans option vide : celui d\'une personne ne se vide pas');
    assert.equal(await dialog(page).locator('.ident-lock').count(), 0, 'rien n\'est verrouillé pour un administrateur');
    assert.match(await dialog(page).locator('#profile-email-hint').textContent(), /Ses droits d'administrateur ou de responsable, déclarés dans la table ACL/);
    assert.match(await field(page, 'email').getAttribute('aria-describedby'), /profile-email-error profile-email-hint/);
    assert.equal(await summary(page), 'Aucune modification');
    assert.deepEqual(await bddCalls(page), []);
  });
  // Sa propre fiche, même pour un administrateur en mode admin : verrouillée.
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await enableAdminMode(page);
    await gridCard(page, 'Ana Martin').locator('.card-edit').click();
    await dialog(page).waitFor();
    assert.equal(await field(page, 'email').count(), 0);
    assert.equal(await field(page, 'Etablissement').count(), 0);
    assert.match(await dialog(page).locator('.ident-lock').textContent(), /liés à votre compte/);
  });
  await withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.equal(await field(page, 'email').count(), 0);
    assert.equal(await field(page, 'Etablissement').count(), 0);
    assert.match(await dialog(page).locator('.ident-lock').textContent(), /liés à votre compte/);
  });
});

test('le nouvel e-mail et le nouvel établissement se voient sur la carte après et dans le détail, et s\'écrivent en une seule action', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openOther(page, 'Hugo Bernard'); // pas d'adresse, au CHU
    assert.equal(await field(page, 'email').inputValue(), '');
    await field(page, 'email').fill('  Hugo.Bernard@CHU-Bordeaux.fr ');
    await field(page, 'Etablissement').selectOption({ label: 'Institut Bergonié' });
    assert.equal(await summary(page), '2 champs modifiés');
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire les modifications de Hugo Bernard');
    assert.equal(await notices(page).count(), 0, 'il reste dans l\'annuaire : rien à signaler');

    const before = dialog(page).locator('.preview-before .contact-card');
    const after = dialog(page).locator('.preview-after .contact-card');
    assert.equal(await before.locator('.etablissement-tag').textContent(), 'CHU');
    assert.equal(await before.locator('a.email').isHidden(), true, 'Hugo n\'avait pas d\'adresse');
    assert.equal(await after.locator('.etablissement-tag.mark-new').textContent(), 'Institut Bergonié modifié');
    assert.equal(await after.locator('a.email.mark-new').textContent(), 'hugo.bernard@chu-bordeaux.fr ajouté');
    assert.equal(await after.locator('a.email').getAttribute('href'), null, 'un aperçu n\'est pas cliquable');
    assert.equal(await after.locator('.etablissement-tag').isDisabled(), true);
    // Le badge repéré reste lisible (texte blanc sur fond sombre : le vert pâle des lignes de
    // texte l'effacerait) et sa pastille n'est pas tronquée avec le nom de l'établissement.
    assert.deepEqual(await after.locator('.etablissement-tag').evaluate(badge => {
      const style = getComputedStyle(badge);
      const pill = badge.querySelector('.mk-pill').getBoundingClientRect();
      const frame = badge.getBoundingClientRect();
      return {
        color: style.color,
        background: style.backgroundColor,
        pillInside: pill.left >= frame.left - 0.5 && pill.right <= frame.right + 0.5 && pill.bottom <= frame.bottom + 0.5,
        clipped: badge.scrollWidth > badge.clientWidth + 1
      };
    }), { color: 'rgb(255, 255, 255)', background: 'rgb(20, 124, 114)', pillInside: true, clipped: false });
    assert.equal(await before.locator('.mk-pill').count(), 0);
    assert.deepEqual(await dialog(page).locator('.recap .diff-label').allTextContents(), ['E-mail', 'Établissement']);
    const rows = dialog(page).locator('.recap .diff-row');
    assert.equal(await rows.nth(0).locator('.none').first().textContent(), 'non renseigné');
    assert.equal(await rows.nth(0).locator('ins').textContent(), 'hugo.bernard@chu-bordeaux.fr');
    assert.equal(await rows.nth(1).locator('del').textContent(), 'CHU');
    assert.equal(await rows.nth(1).locator('ins').textContent(), 'Institut Bergonié');
    assert.deepEqual(await bddCalls(page), [], 'la relecture n\'écrit rien');

    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.deepEqual(await bddCalls(page), [{
      action: 'UpdateRecord', table: 'BDD', rowId: 10, ok: true, values: { email: 'hugo.bernard@chu-bordeaux.fr', Etablissement: 5 }
    }]);
    assert.deepEqual(await bddCell(page, 'Instances', 9), ['L', 999], 'ce que la fenêtre ne montre pas est conservé');
    await until(async () => (await gridCard(page, 'Hugo Bernard').locator('.etablissement-tag').textContent()) === 'Institut Bergonié', 'la carte n\'a pas été mise à jour');
    assert.equal(await gridCard(page, 'Hugo Bernard').locator('a.email').textContent(), 'hugo.bernard@chu-bordeaux.fr');
    assert.equal(await gridCard(page, 'Hugo Bernard').locator('a.email').getAttribute('href'), 'mailto:hugo.bernard@chu-bordeaux.fr');
    assert.equal(await dialog(page).locator('.recap .diff-label').count(), 2, 'la confirmation rappelle ce qui a changé');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('déplacer une personne dans un établissement qui n\'a pas validé sa présence la retire de l\'annuaire, et la relecture le dit d\'abord', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await openOther(page, 'Hugo Bernard');
    await field(page, 'Etablissement').selectOption({ label: 'INSERM' });
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire les modifications de Hugo Bernard');
    assert.deepEqual(await notices(page).allTextContents(), [
      'Cette fiche reste masquée de l\'annuaire : son établissement n\'a pas encore été validé.'
    ]);
    assert.equal(await dialog(page).locator('.preview-after .etablissement-tag').textContent(), 'INSERM modifié');
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ Etablissement: 4 }]);
    await waitForCards(page, 3);
    assert.equal(await gridCard(page, 'Hugo Bernard').count(), 0, 'la carte a quitté l\'annuaire');
  }));

test('un e-mail refusé est signalé sous son champ : mal formé, déjà pris, vidé ; un établissement ne se vide pas', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await openOther(page, 'Hostile');
    const emailError = page.locator('#profile-email-error');
    const relire = press(page, 'Relire les modifications');
    await field(page, 'email').fill('hostile@');
    assert.match(await emailError.textContent(), /^cette adresse n'est pas valide \(nom@exemple\.fr\)\.$/);
    assert.equal(await field(page, 'email').getAttribute('aria-invalid'), 'true');
    assert.equal(await summary(page), 'Corrigez les champs signalés');
    assert.equal(await relire.isDisabled(), true);

    await field(page, 'email').fill('ANA.Martin@chu-bordeaux.fr');
    assert.equal(await emailError.textContent(), 'cette adresse est déjà celle d\'une autre fiche.');
    assert.equal(await relire.isDisabled(), true);

    await field(page, 'email').fill('   ');
    assert.equal(await emailError.textContent(), 'indiquez une adresse e-mail.');
    assert.equal(await relire.isDisabled(), true);

    await field(page, 'email').fill('=cmd@chu.fr');
    assert.equal(await emailError.textContent(), 'ne peut pas commencer par = + - ou @.');

    await field(page, 'email').fill('hostile.nouveau@chu-bordeaux.fr');
    assert.equal(await emailError.isHidden(), true);
    assert.equal(await field(page, 'email').getAttribute('aria-invalid'), 'false');
    assert.equal(await relire.isEnabled(), true);
    // Revenir à l'adresse d'origine, écrite autrement, n'est pas une modification.
    await field(page, 'email').fill('HOSTILE@chu-bordeaux.fr');
    assert.equal(await summary(page), 'Aucune modification');
    assert.deepEqual(await bddCalls(page), []);
  }));

test('une adresse prise par une autre fiche pendant la relecture n\'est pas écrite : la fenêtre le dit et reste sur la relecture', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await openOther(page, 'Hugo Bernard');
    await field(page, 'email').fill('convoite@exemple.fr');
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire les modifications de Hugo Bernard');
    await page.evaluate(() => { window.__tables.BDD.email[3] = 'Convoite@Exemple.fr'; }); // Dan, hors de la vue
    await press(page, 'Valider').click();
    await page.locator('#profileDialog .dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /Cette adresse e-mail est maintenant celle d'une autre fiche : rien n'a été modifié\./);
    assert.equal(await heading(page).textContent(), 'Relire les modifications de Hugo Bernard');
    assert.deepEqual(await bddCalls(page), []);
    assert.equal(await bddCell(page, 'email', 9), '');
    // On peut revenir à la fiche et en choisir une autre.
    await press(page, 'Retour').click();
    await headingIs(page, 'Modifier la fiche de Hugo Bernard');
    assert.equal(await field(page, 'email').inputValue(), 'convoite@exemple.fr', 'le brouillon est intact');
  }));

for (const width of [280, 360]) {
  test(`dans un cadre de ${width} px, le formulaire d'un administrateur et sa relecture de l'e-mail et de l'établissement tiennent dans l'écran`, { skip }, () =>
    withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 });
      await openOther(page, 'Hostile');
      const fits = () => page.evaluate(() => {
        const dialog = document.getElementById('profileDialog');
        const box = dialog.getBoundingClientRect();
        const outside = [...dialog.querySelectorAll('*')].filter(node => {
          const at = node.getBoundingClientRect();
          return at.width > 0 && !node.closest('.sr-only') && (at.right > box.right + 0.5 || at.left < box.left - 0.5);
        }).map(node => `${node.tagName}.${String(node.className).slice(0, 30)}`);
        return { inside: box.left >= 0 && box.right <= window.innerWidth + 0.5, pageOverflow: document.documentElement.scrollWidth - window.innerWidth, outside };
      });
      const FITS = { inside: true, pageOverflow: 0, outside: [] };
      assert.deepEqual(await fits(), FITS);
      await field(page, 'email').fill('une.adresse.assez.longue.pour.mettre.la.mise.en.page.a.l.epreuve@laboratoire-de-recherche-bordeaux.example.fr');
      await field(page, 'Etablissement').selectOption({ label: 'Institut Bergonié' });
      assert.deepEqual(await fits(), FITS);
      await press(page, 'Relire les modifications').click();
      await headingIs(page, 'Relire les modifications de Hostile'.replace('Hostile', `${HOSTILE_FIRST_NAME} Hostile`));
      assert.deepEqual(await fits(), FITS);
      const spill = await dialog(page).locator('.preview-after .contact-card').evaluate(card => {
        const frame = card.getBoundingClientRect();
        return [...card.querySelectorAll('*')].filter(node => {
          const at = node.getBoundingClientRect();
          return at.width > 0 && (at.right > frame.right + 0.5 || at.left < frame.left - 0.5);
        }).map(node => node.className || node.tagName);
      });
      assert.deepEqual(spill, [], 'rien ne sort de la carte « Après »');
    }));
}

test('une personne qui n\'apparaît pas dans l\'annuaire modifie quand même sa fiche depuis le bandeau', { skip }, () =>
  withWidget({ tables: withIdentity(), user: IRIS_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Ingénieure');
    await review(page);
    assert.equal(await dialog(page).locator('.preview-before .name').textContent(), 'Iris Refus');
    assert.deepEqual(await notices(page).allTextContents(), [
      'Votre fiche est masquée de l\'annuaire : vous n\'avez pas accepté d\'apparaître (interrupteur « Apparaître dans l\'annuaire » en haut de page).'
    ]);
    assert.equal(await notices(page).first().getAttribute('role'), 'status');
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.deepEqual((await bddCalls(page)).map(call => [call.action, call.rowId, call.values]), [['UpdateRecord', 11, { Fonction: 'Ingénieure' }]]);
    assert.equal(await bddCell(page, 'Accepte_apparaitre', 10), false, 'modifier sa fiche ne change pas son choix de présence');
    await closeSaved(page).click();
    await waitForCards(page, 4);
  }));

for (const [type, tables, written] of [
  ['numérique', withSchema(memberTables()), 556789013],
  ['de texte', textPhoneTables(), '05 56 78 90 13']
]) {
  test(`le téléphone s'écrit dans la forme de sa colonne (${type}) et s'affiche pareil`, { skip }, () =>
    withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
      await openOwn(page);
      assert.equal(await field(page, 'numero_de_telephone').inputValue(), '05 56 78 90 12');
      await field(page, 'numero_de_telephone').fill('0556789013');
      await field(page, 'numero_de_telephone').blur();
      await review(page);
      assert.equal(await dialog(page).locator('.preview-before .tel').textContent(), '☎ 05 56 78 90 12');
      assert.match(await dialog(page).locator('.preview-after .tel.mark-new').textContent(), /^☎ 05 56 78 90 13/);
      await press(page, 'Valider').click();
      await headingIs(page, 'Fiche enregistrée');
      assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ numero_de_telephone: written }]);
      await until(async () => (await gridCard(page, 'Ana Martin').locator('.tel').textContent()) === '☎ 05 56 78 90 13', 'le numéro n\'a pas été mis à jour');
    }));
}

test('vider le téléphone barre l\'ancien numéro dans la carte après, et écrit une cellule vide', { skip }, () =>
  withWidget({ tables: withSchema(memberTables()), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'numero_de_telephone').fill('');
    await review(page);
    assert.match(await dialog(page).locator('.preview-after .tel.mark-gone').textContent(), /^☎ 05 56 78 90 12 supprimé$/);
    assert.equal(await dialog(page).locator('.preview-after .tel .mk-pill-del').textContent(), 'supprimé');
    assert.equal(await dialog(page).locator('.recap .diff-row .none').textContent(), 'supprimé');
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ numero_de_telephone: null }]);
    await until(async () => (await gridCard(page, 'Ana Martin').locator('.tel').textContent()) === '', 'le numéro n\'a pas disparu de la carte');
  }));

test('changer le rôle ou le nom se voit sur la carte après, et le retirer barre l\'ancien', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'prenom').fill('Anna');
    await field(page, 'Role_dans_le_PUI').selectOption('0');
    await review(page);
    const after = dialog(page).locator('.preview-after .contact-card');
    assert.match(await after.locator('.name.mark-new').textContent(), /^Anna Martin modifié$/);
    assert.deepEqual(await after.locator('.tag.mark-gone').allTextContents(), ['Référent qualité (retiré)']);
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ prenom: 'Anna', Role_dans_le_PUI: 0 }]);
    await until(async () => (await page.locator('#cardsGrid .name').allTextContents()).includes('Anna Martin'), 'le prénom n\'a pas été mis à jour');
  }));

test('la relecture dit pourquoi une fiche acceptée reste hors de l\'annuaire : son établissement n\'est pas validé', { skip }, () =>
  withWidget({ tables: withIdentity(), user: 'dan@inserm.fr' }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Chargé de projet');
    await review(page);
    assert.deepEqual(await notices(page).allTextContents(), [
      'Votre fiche reste masquée de l\'annuaire : votre établissement n\'a pas encore été validé.'
    ]);
    await press(page, 'Retour').click();
    await headingIs(page, 'Modifier mon profil');
    assert.equal(await notices(page).count(), 0, 'l\'avis ne vaut que pour la relecture');
  }));

test('une ligne ajoutée porte la pastille « ajouté », sur la carte après seulement', { skip }, () =>
  withWidget({ tables: withIdentity(), user: 'bob@u-bordeaux-montaigne.fr' }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'numero_de_telephone').fill('0556789014');
    await field(page, 'prenom').fill('Robert');
    await review(page);
    const after = dialog(page).locator('.preview-after .contact-card');
    assert.equal(await after.locator('.tel.mark-new').textContent(), '☎ 05 56 78 90 14 ajouté');
    assert.equal(await after.locator('.name.mark-new').textContent(), 'Robert Durand modifié');
    assert.equal(await dialog(page).locator('.preview-before .mk-pill').count(), 0, 'la carte avant n\'a aucun repère');
    assert.equal(await notices(page).count(), 0, 'Bob est partenaire, validé : sa fiche figure dans l\'annuaire');
  }));

// ===== Les refus, les conflits, les lenteurs =====

for (const [rule, options] of [
  ['une règle d\'accès sur la table', { denyWrites: ['BDD'] }],
  ['une règle d\'accès sur la ligne', { denyRows: { BDD: [1] } }]
]) {
  test(`Grist refuse l'écriture (${rule}) : message clair, la relecture reste ouverte, rien ne change`, { skip }, () =>
    withWidget({ tables: memberTables(), user: ANA_EMAIL, ...options }, async ({ page, logs }) => {
      await openOwn(page);
      await field(page, 'Fonction').fill('Cheffe');
      await review(page);
      await press(page, 'Valider').click();
      await page.locator('#profileDialog .dlg-alert [role="alert"]').waitFor();
      assert.match(await alertText(page), /^Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche/);
      assert.equal(await heading(page).textContent(), 'Relire vos modifications');
      assert.equal(await press(page, 'Valider').isEnabled(), true, 'on peut réessayer');
      assert.equal(await dialog(page).locator('[data-close]').isEnabled(), true);
      assert.deepEqual((await bddCalls(page)).map(call => call.ok), [false]);
      assert.equal(await bddCell(page, 'Fonction'), 'Pharmacienne');
      assert.ok((await Promise.all(logs.errors)).some(line => line.includes('[PROFIL] écriture impossible')), 'la cause reste dans la console');

      // Le brouillon est intact.
      await press(page, 'Retour').click();
      assert.equal(await field(page, 'Fonction').inputValue(), 'Cheffe');
    }));
}

test('si la fiche change dans Grist pendant la relecture, rien n\'est écrit : on relit ce qui s\'y trouve, puis on valide', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe de service');
    await review(page);
    assert.equal(await dialog(page).locator('.preview-before .fonction').textContent(), 'Pharmacienne');

    // Quelqu'un d'autre change la fonction pendant que la personne relit.
    await page.evaluate(() => { window.__tables.BDD.Fonction[0] = 'Directrice'; });
    await press(page, 'Valider').click();
    await page.waitForFunction(() => document.querySelector('#profileDialog .notice') !== null);
    assert.match(await notices(page).first().textContent(), /^La fiche a changé dans Grist pendant la relecture\. Relisez ce qui suit, puis validez à nouveau\./);
    assert.equal(await heading(page).textContent(), 'Relire vos modifications');
    assert.equal(await dialog(page).locator('.preview-before .fonction').textContent(), 'Directrice', 'la carte avant est celle d\'aujourd\'hui');
    assert.deepEqual(await bddCalls(page), [], 'la première validation n\'a rien écrit');
    assert.equal(await bddCell(page, 'Fonction'), 'Directrice');

    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ Fonction: 'Cheffe de service' }]);
  }));

test('ce qu\'un autre a changé dans une autre colonne pendant la relecture n\'est pas écrasé', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'numero_de_telephone').fill('0556789013');
    await review(page);
    await page.evaluate(() => { window.__tables.BDD.Fonction[0] = 'Directrice'; });
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.equal(await notices(page).count(), 0);
    assert.equal(await bddCell(page, 'Fonction'), 'Directrice');
    assert.equal(await bddCell(page, 'numero_de_telephone'), 556789013);
  }));

test('si les champs modifiés ont changé dans Grist avant la relecture, la fenêtre le dit', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe de service');
    await page.evaluate(() => { window.__tables.BDD.Fonction[0] = 'Directrice'; });
    await review(page);
    assert.match(await notices(page).first().textContent(), /ont changé dans Grist depuis l'ouverture de la fenêtre : Fonction\./);
    assert.equal(await dialog(page).locator('.preview-before .fonction').textContent(), 'Directrice');
    assert.deepEqual(await dialog(page).locator('.recap .diff-row del').allTextContents(), ['Directrice']);
  }));

test('si la fiche a été supprimée pendant la relecture, la fenêtre le dit et n\'écrit rien', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await review(page);
    await page.evaluate(() => {
      const table = window.__tables.BDD;
      const at = table.id.indexOf(1);
      Object.keys(table).forEach(column => table[column].splice(at, 1));
    });
    await press(page, 'Valider').click();
    await page.locator('#profileDialog .dlg-alert [role="alert"]').waitFor();
    assert.equal(await alertText(page), 'Cette fiche n\'existe plus dans Grist : rien n\'a été modifié.');
    assert.deepEqual(await bddCalls(page), []);
  }));

test('si Grist ne répond pas pour la relecture, la fenêtre reste sur le formulaire avec son brouillon', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await page.evaluate(() => { window.__failTables = ['BDD']; });
    await press(page, 'Relire mes modifications').click();
    await page.locator('#profileDialog .dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /^La fiche n'a pas pu être relue dans Grist : rien n'a été modifié\./);
    assert.equal(await heading(page).textContent(), 'Modifier mon profil');
    assert.equal(await field(page, 'Fonction').inputValue(), 'Cheffe');
    assert.equal(await press(page, 'Relire mes modifications').isEnabled(), true);
    await page.evaluate(() => { window.__failTables = []; });
    await review(page);
    assert.deepEqual(await notices(page).count(), 0);
  }));

test('un double clic sur « Valider » n\'écrit qu\'une fois, et la fenêtre ne se ferme pas pendant l\'écriture', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL, delay: 300 }, async ({ page }) => {
    await openOwn(page);
    await field(page, 'Fonction').fill('Cheffe');
    await review(page);
    await press(page, 'Valider').dblclick();
    assert.equal(await press(page, 'Enregistrement…').isDisabled(), true);
    assert.equal(await dialog(page).locator('[data-close]').isDisabled(), true);
    assert.equal(await press(page, 'Retour').isDisabled(), true);
    // Ni Échap (même répété : le navigateur ne laisse pas annuler « cancel » indéfiniment), ni une
    // demande de fermeture venue d'ailleurs (le bouton « retour » d'Android) ne ferme la fenêtre.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const prevented = await page.evaluate(() => [1, 2, 3].map(() => !document.getElementById('profileDialog').dispatchEvent(new Event('cancel', { cancelable: true }))));
    assert.deepEqual(prevented, [true, true, true]);
    assert.equal(await isOpen(page), true, 'Échap ne ferme pas la fenêtre pendant l\'enregistrement');
    await headingIs(page, 'Fiche enregistrée');
    assert.equal((await bddCalls(page)).length, 1);
    assert.equal(await dialog(page).locator('[data-close]').isEnabled(), true);
    await page.keyboard.press('Escape');
    await closed(page);
  }));

// ===== Sécurité et accessibilité =====

test('un prénom piégé reste du texte dans la fenêtre : titre, cartes de relecture et confirmation', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await enableAdminMode(page);
    const hostileName = `${HOSTILE_FIRST_NAME} Hostile`;
    await gridCard(page, 'Hostile').locator('.card-edit').click();
    await dialog(page).waitFor();
    assert.equal(await heading(page).textContent(), `Modifier la fiche de ${hostileName}`);
    assert.equal(await dialog(page).locator('.ident-name').textContent(), hostileName);
    await field(page, 'Fonction').fill('Test');
    await press(page, 'Relire les modifications').click();
    await headingIs(page, `Relire les modifications de ${hostileName}`);
    assert.equal(await dialog(page).locator('.preview-after .name').textContent(), hostileName);
    await press(page, 'Valider').click();
    await headingIs(page, 'Fiche enregistrée');
    assert.equal(await dialog(page).locator('.sent h3').textContent(), `La fiche de ${hostileName} est enregistrée`);
    assert.equal(await dialog(page).locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'aucun script de la fiche ne s\'est exécuté');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la fenêtre est une vraie boîte de dialogue : nommée, modale, et le reste de la page est inerte', { skip }, () =>
  withWidget({ tables: memberTables(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    assert.equal(await dialog(page).getAttribute('aria-labelledby'), 'profileTitle');
    assert.equal(await page.evaluate(() => document.getElementById('profileDialog').matches(':modal')), true);
    // Tabulation : le focus ne se pose jamais sur un contrôle de la page derrière (elle est
    // inerte) ; au bout de la fenêtre il sort vers le navigateur, c'est-à-dire sur <body>.
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        return document.getElementById('profileDialog').contains(active) ? 'fenêtre' : active === document.body ? 'body' : active.outerHTML.slice(0, 60);
      });
      assert.ok(['fenêtre', 'body'].includes(where), `le focus est tombé sur ${where} à la tabulation ${step + 1}`);
    }
    // Chaque contrôle a un nom : étiquette ou texte.
    const unnamed = await dialog(page).locator('input, select, button').evaluateAll(controls => controls
      .filter(control => !(control.labels?.length || control.getAttribute('aria-label') || control.textContent.trim()))
      .map(control => control.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, []);
  }));

// Le cadre d'un widget Grist peut être très étroit : la fenêtre doit y tenir sans défilement
// horizontal, jusque dans la relecture la plus chargée (avis, pastilles, listes de tags).
for (const width of [280, 320, 360]) {
  test(`dans un cadre de ${width} px, la fenêtre tient dans l'écran et la relecture empile la carte avant sous la carte après`, { skip }, () =>
    withWidget({ tables: withIdentity(), user: 'dan@inserm.fr' }, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 });
      await waitForCards(page, 4);
      await page.locator('#accountBar .account-edit').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'le bandeau « Ma présence » tient dans le cadre');
      await openOwn(page);
      // La page ne défile pas de côté, la fenêtre tient dans l'écran, et aucun de ses éléments
      // (boutons du pied compris) n'en sort.
      const fits = () => page.evaluate(() => {
        const dialog = document.getElementById('profileDialog');
        const box = dialog.getBoundingClientRect();
        const body = dialog.querySelector('.dlg-body');
        const outside = [...dialog.querySelectorAll('*')].filter(node => {
          const at = node.getBoundingClientRect();
          return at.width > 0 && !node.closest('.sr-only') && (at.right > box.right + 0.5 || at.left < box.left - 0.5);
        }).map(node => `${node.tagName}.${String(node.className).slice(0, 30)}`);
        return {
          inside: box.left >= 0 && box.right <= window.innerWidth + 0.5,
          bodyOverflow: body.scrollWidth - body.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          outside
        };
      });
      const FITS = { inside: true, bodyOverflow: 0, pageOverflow: 0, outside: [] };
      assert.deepEqual(await fits(), FITS);
      await field(page, 'Fonction').fill('Chargé de projet transversal des instances et des groupes de travail');
      await field(page, 'prenom').fill('Daniel');
      await chip(page, 'Instances', 'CME').click();
      await review(page);
      assert.equal(await notices(page).count(), 1, 'l\'avis « fiche masquée » est dans la relecture');
      assert.equal(await dialog(page).locator('.preview-after .mk-pill').count(), 2, 'deux lignes de texte ont changé : le nom et la fonction');
      assert.deepEqual(await fits(), FITS);
      const before = await dialog(page).locator('.preview-before').boundingBox();
      const after = await dialog(page).locator('.preview-after').boundingBox();
      assert.ok(after.y >= before.y + before.height - 1, 'les deux cartes sont l\'une sous l\'autre');
      assert.ok(Math.abs(after.x - before.x) < 2);
      // Rien ne déborde de la carte « Après » : ni la pastille, ni le texte, ni les tags.
      const cardBox = await dialog(page).locator('.preview-after .contact-card').boundingBox();
      const spill = await dialog(page).locator('.preview-after .contact-card').evaluate(card => {
        const frame = card.getBoundingClientRect();
        return [...card.querySelectorAll('*')].filter(node => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && (box.right > frame.right + 0.5 || box.left < frame.left - 0.5);
        }).map(node => node.className || node.tagName);
      });
      assert.deepEqual(spill, [], `rien ne sort de la carte (largeur ${Math.round(cardBox.width)} px)`);
      // Les boutons du pied restent accessibles sans défiler la fenêtre entière.
      const validate = await press(page, 'Valider').boundingBox();
      assert.ok(validate.y + validate.height <= 640 + 0.5, 'le bouton « Valider » est visible');
    }));
}
