// L'annuaire fermé aux personnes qui n'y sont pas, et les fiches créées que les administrateurs valident (1.45.0 : gate.js, gate-ui.js,
// requests.js, requests-ui.js, profile-save.js) dans Chromium (optionnel : voir TESTING.md), sur une API Grist simulée. Le lien du document est
// public avec accès éditeur : ce que le widget montre à chaque profil, la demande de fiche d'une personne dont le domaine est celui d'un établissement,
// la pastille et la fenêtre des administrateurs. Ce que Grist refuse vraiment, ce sont ses règles d'accès (GRIST_SETUP.md) : rien de cela n'a été
// essayé dans le Grist d'Antoine (TESTING.md, section 31).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { ANONYMOUS_EMAIL } from '../constants.js';
import { ADMIN_EMAIL, ANA_EMAIL, NEW_EMAIL, sampleTables, withIdentity, withRequest, withSchema, withValidation } from './fixtures.mjs';
import { bddCalls, skip, structureCalls, toast, until, waitForCards, withWidget } from './support/browser.mjs';
import { dialogPage, profileDialogPage } from './support/dialog-page.mjs';

const profile = profileDialogPage();
const requests = dialogPage('requestsDialog', 'requestsTitle');
const field = (page, key) => page.locator(`#profile-${key}`);
const listOf = (page, key) => page.locator(`#profile-${key}-list`);
const gate = page => page.locator('#gatePanel');
const shownOptions = (page, key) => listOf(page, key).locator('.dd-option:not([hidden])').allTextContents();
const cards = page => page.locator('#cardsGrid .contact-card');

// Le document d'un annuaire fermé : les tables de l'exemple avec la colonne de validation et les domaines des établissements.
const closedDirectory = () => withValidation(withSchema(withIdentity()));
const asNewcomer = (extra = {}) => ({ tables: closedDirectory(), user: NEW_EMAIL, ...extra });

async function waitForGate(page, kind) {
  await page.locator(`#gatePanel[data-kind="${kind}"]`).waitFor();
}

// ===== L'écran d'une personne qui n'est pas dans l'annuaire =====

test('une personne sans fiche dont l\'adresse est celle d\'un établissement ne voit ni cartes ni filtres : un écran lui propose de créer sa fiche', { skip }, () =>
  withWidget(asNewcomer(), async ({ page, logs }) => {
    await waitForGate(page, 'create');
    assert.equal(await gate(page).locator('h2').textContent(), 'Vous n’êtes pas encore dans l’annuaire');
    assert.match(await gate(page).locator('.gate-text').innerText(), /@chu-bordeaux\.example\) correspond à un établissement du PUI/);
    assert.equal(await gate(page).locator('.gate-action').textContent(), 'Créer ma fiche');
    assert.equal(await cards(page).count(), 0, 'aucune carte n\'est dessinée');
    assert.equal(await page.locator('#toolbar').isHidden(), true, 'ni recherche ni filtres');
    assert.equal(await page.locator('#resultCount').textContent(), 'Annuaire réservé');
    assert.equal(await page.locator('#accountBar').isHidden(), true, 'l\'écran dit déjà où la personne en est');
    assert.equal(await page.evaluate(() => document.getElementById('cardsGrid').textContent.trim()), '', 'même cachée, la grille est vide : rien à lire dans la page');
    assert.deepEqual(await Promise.all(logs.pageErrors), []);
    assert.ok(!JSON.stringify(await Promise.all([...logs.warnings, ...logs.infos])).includes('@'), 'aucune adresse dans la console');
  }));

test('une personne dont l\'adresse n\'est celle d\'aucun établissement lit que l\'annuaire lui est réservé, sans bouton', { skip }, () =>
  withWidget(asNewcomer({ user: 'zoe@webmail.example' }), async ({ page }) => {
    await waitForGate(page, 'denied');
    assert.equal(await gate(page).locator('h2').textContent(), 'Annuaire réservé');
    assert.match(await gate(page).locator('.gate-text').innerText(), /@webmail\.example\) ne correspond à aucun établissement du PUI/);
    assert.equal(await gate(page).locator('.gate-action').isHidden(), true);
    assert.equal(await cards(page).count(), 0);
    assert.equal(await page.locator('#accountBar').isHidden(), true);
  }));

test('sans la colonne des domaines dans Etablissements, le widget ne peut pas trancher et l\'annuaire reste fermé', { skip }, () => {
  const tables = closedDirectory();
  delete tables.Etablissements[Object.keys(tables.Etablissements).find(column => !['id', 'acronyme', 'nom_complet', 'fondateur', 'partenaire', 'autres', 'ok_pour_apparaitre'].includes(column))];
  return withWidget({ tables, user: NEW_EMAIL }, async ({ page }) => {
    await waitForGate(page, 'unverifiable');
    assert.equal(await gate(page).locator('h2').textContent(), 'Vérification impossible');
    assert.equal(await gate(page).locator('.gate-action').isHidden(), true);
    assert.equal(await cards(page).count(), 0);
  });
});

test('la fiche d\'une personne qui n\'administre pas, en attente : l\'écran « demande en attente » ; validée par un administrateur, l\'annuaire s\'ouvre', { skip }, () => {
  const tables = withValidation(withSchema(withIdentity()), { pending: { 11: true } });
  tables.BDD.Accepte_apparaitre[10] = true; // Iris a accepté d'apparaître
  return withWidget({ tables, user: 'iris@chu-bordeaux.example' }, async ({ page }) => {
    await waitForGate(page, 'pending');
    assert.equal(await gate(page).locator('h2').textContent(), 'Votre demande est en attente');
    assert.equal(await page.locator('#resultCount').textContent(), 'Demande en attente');
    assert.equal(await cards(page).count(), 0);
    assert.equal(await gate(page).locator('.gate-action').isHidden(), true, 'une seule demande : pas de deuxième');
    assert.equal(await page.locator('#accountBar').isHidden(), true);
    // Un administrateur valide la demande : l'annuaire se relit (onRecords) et s'ouvre.
    await page.evaluate(() => { window.__tables.BDD.En_attente_validation[10] = false; window.__triggerRecords(); });
    await waitForCards(page, 5);
    assert.equal(await gate(page).isHidden(), true);
    assert.equal(await page.locator('#toolbar').isVisible(), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('gated')), false);
    await page.locator('#accountBar:not([hidden])').waitFor();
  });
});

test('un visiteur sans compte ne voit pas l\'annuaire : l\'écran réservé et la fenêtre de connexion', { skip }, () =>
  withWidget({ tables: closedDirectory(), user: ANONYMOUS_EMAIL }, async ({ page }) => {
    await waitForGate(page, 'anonymous');
    assert.equal(await page.locator('#resultCount').textContent(), 'Connexion requise');
    assert.equal(await cards(page).count(), 0);
    await page.locator('#acces[open]').waitFor();
    assert.equal(await page.locator('#loginLink').isVisible(), true);
  }));

test('un membre dont la fiche est validée voit l\'annuaire, sans écran ni changement', { skip }, () => {
  const tables = closedDirectory();
  tables.ACL.admin[0] = false;
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await gate(page).isHidden(), true);
    assert.equal(await page.locator('#toolbar').isVisible(), true);
  });
});

// ===== Demander sa fiche =====

test('la demande de fiche : l\'établissement se choisit parmi ceux du domaine, la relecture dit qu\'un administrateur valide, la ligne est écrite « en attente »', { skip }, () =>
  withWidget(asNewcomer(), async ({ page, logs }) => {
    await waitForGate(page, 'create');
    await gate(page).locator('.gate-action').click();
    await profile.dialog(page).waitFor();
    assert.equal(await profile.heading(page).textContent(), 'Créer ma fiche');
    assert.match(await profile.dialog(page).locator('.dlg-sub').textContent(), /un administrateur la valide, et elle n’apparaît dans l’annuaire qu’ensuite/);
    await field(page, 'prenom').fill('Zoé');
    await field(page, 'nom').fill('Nouvelle');
    await field(page, 'Etablissement').click();
    assert.deepEqual(await shownOptions(page, 'Etablissement'), ['CHU'], 'seul l\'établissement dont le domaine est celui de l\'adresse');
    await listOf(page, 'Etablissement').locator('.dd-option').filter({ hasText: /^CHU$/ }).click();
    assert.match(await profile.dialog(page).locator('.es-chk-sub').textContent(), /reste masquée, même validée, jusqu’à ce que vous activiez l’interrupteur/);
    await profile.press(page, 'Relire ma fiche').click();
    await profile.headingIs(page, 'Relire avant d’envoyer');
    assert.match(await profile.dialog(page).locator('.dlg-sub').textContent(), /une fois votre demande validée par un administrateur/);
    assert.match(await profile.notices(page).first().textContent(), /sera envoyée à un administrateur, qui doit la valider/);
    assert.deepEqual(await bddCalls(page), [], 'la relecture n\'écrit rien');
    await profile.press(page, 'Envoyer ma demande').click();
    await profile.closed(page);
    await toast(page).waitFor({ state: 'visible' });
    assert.equal(await toast(page).textContent(), 'Votre demande est envoyée : un administrateur doit valider votre fiche, qui apparaîtra ensuite dans l’annuaire. Revenez plus tard.');

    assert.deepEqual(await bddCalls(page), [{
      action: 'AddRecord', table: 'BDD', rowId: 13, ok: true,
      values: { email: NEW_EMAIL, En_attente_validation: true, Accepte_apparaitre: true, prenom: 'Zoé', nom: 'Nouvelle', Etablissement: 1 }
    }]);
    // L'écran devient « demande en attente » ; la demande n'est dans aucune carte ; le focus ne se perd pas.
    await waitForGate(page, 'pending');
    assert.equal(await cards(page).count(), 0);
    assert.equal(await gate(page).locator('.gate-action').isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resultCount');
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.deepEqual(await Promise.all(logs.errors), []);
    assert.ok(!JSON.stringify(await Promise.all([...logs.warnings, ...logs.infos])).includes('@'), 'aucune adresse dans la console');
  }));

test('la demande n\'est écrite que si l\'adresse a encore droit à l\'établissement : un domaine changé entre-temps la refuse', { skip }, () =>
  withWidget(asNewcomer(), async ({ page }) => {
    await waitForGate(page, 'create');
    await gate(page).locator('.gate-action').click();
    await profile.dialog(page).waitFor();
    await field(page, 'prenom').fill('Zoé');
    await field(page, 'Etablissement').click();
    await listOf(page, 'Etablissement').locator('.dd-option').filter({ hasText: /^CHU$/ }).click();
    await profile.press(page, 'Relire ma fiche').click();
    await profile.headingIs(page, 'Relire avant d’envoyer');
    await page.evaluate(() => { window.__tables.Etablissements[Object.keys(window.__tables.Etablissements).at(-1)][0] = 'autre.example'; });
    await profile.press(page, 'Envoyer ma demande').click();
    await profile.alert(page).waitFor();
    assert.match(await profile.alertText(page), /ne correspond à aucun établissement/);
    assert.deepEqual(await bddCalls(page), []);
    assert.equal(await profile.isOpen(page), true);
  }));

test('un administrateur sans fiche crée la sienne sans domaine ni validation : « Publier ma fiche », la ligne n\'est pas en attente', { skip }, () =>
  withWidget({ tables: closedDirectory(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-create').click();
    await profile.dialog(page).waitFor();
    assert.match(await profile.dialog(page).locator('.dlg-sub').textContent(), /elle est ajoutée tout de suite, sans validation/);
    await field(page, 'prenom').fill('Dir');
    await field(page, 'Etablissement').click();
    assert.deepEqual(await shownOptions(page, 'Etablissement'), ['CHU', 'INSERM', 'Institut Bergonié', 'UBM'], 'tous les établissements, sans restriction de domaine');
    await listOf(page, 'Etablissement').locator('.dd-option').filter({ hasText: /^INSERM$/ }).click();
    await profile.press(page, 'Relire ma fiche').click();
    await profile.headingIs(page, 'Relire avant de publier');
    await profile.press(page, 'Publier ma fiche').click();
    await profile.closed(page);
    assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ email: ADMIN_EMAIL, Accepte_apparaitre: true, prenom: 'Dir', Etablissement: 4 }]);
  }));

// ===== Les administrateurs : la pastille et la fenêtre des demandes =====

const withTwoRequests = () => withRequest(withRequest(closedDirectory(), {
  email: 'zoe@chu-bordeaux.example', prenom: 'Zoé', nom: 'Nouvelle', Etablissement: 1, Fonction: 'Pharmacienne', Accepte_apparaitre: true
}), { email: 'leo@chu-bordeaux.example', prenom: 'Léo', nom: 'Voisin', Etablissement: 2, Accepte_apparaitre: true });

test('un administrateur voit le nombre de demandes en pastille sur « Mode admin » même éteint, et aucune demande n\'est une carte', { skip }, () =>
  withWidget({ tables: withTwoRequests(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const admin = page.locator('#accountBar .account-admin');
    await admin.waitFor();
    assert.equal(await admin.locator('.account-badge').textContent(), '2');
    assert.equal(await admin.getAttribute('aria-label'), 'Mode admin, 2 demandes de fiche à valider');
    assert.equal(await admin.getAttribute('aria-pressed'), 'false', 'le mode classique est resté le mode classique');
    assert.equal(await page.locator('#accountBar .account-requests').isHidden(), true, 'le bouton des demandes attend le mode admin');
    assert.equal(await cards(page).filter({ hasText: 'Zoé' }).count(), 0);
    assert.equal(await cards(page).count(), 4);
  }));

test('sans demande, ni pastille ni fiche à valider : le mode admin offre quand même le bouton, qui dit qu\'il n\'y en a pas', { skip }, () =>
  withWidget({ tables: closedDirectory(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const admin = page.locator('#accountBar .account-admin');
    await admin.waitFor();
    assert.equal(await admin.locator('.account-badge').isHidden(), true);
    assert.equal(await admin.getAttribute('aria-label'), null);
    await admin.click();
    const button = page.locator('#accountBar .account-requests');
    assert.equal(await button.textContent(), 'Demandes à valider');
    await button.click();
    await requests.dialog(page).waitFor();
    assert.equal(await page.locator('#requestsDialog .dlg-sub').textContent(), 'Aucune demande en attente');
    assert.match(await page.locator('#requestsDialog .rq-empty').textContent(), /aucune demande à valider/);
  }));

test('en mode admin, la fenêtre liste les demandes avec l\'avis sur le domaine ; « Valider » écrit la case seule, la pastille et la liste se mettent à jour', { skip }, () =>
  withWidget({ tables: withTwoRequests(), user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-admin').click();
    const open = page.locator('#accountBar .account-requests');
    assert.equal(await open.textContent(), 'Demandes à valider (2)');
    await open.click();
    await requests.dialog(page).waitFor();
    assert.equal(await requests.heading(page).evaluate(title => document.activeElement === title), true, 'le titre est lu d\'abord');
    assert.equal(await page.locator('#requestsDialog .dlg-sub').textContent(), '2 demandes en attente');
    const items = page.locator('#requestsDialog .rq-item');
    assert.equal(await items.count(), 2);
    assert.equal(await items.nth(0).locator('.rq-name').textContent(), 'Zoé Nouvelle');
    assert.equal(await items.nth(0).locator('.rq-mail').textContent(), 'zoe@chu-bordeaux.example');
    assert.equal(await items.nth(0).locator('.rq-meta').textContent(), 'CHU · Pharmacienne');
    assert.equal(await items.nth(0).locator('.rq-domain').getAttribute('data-tone'), 'ok');
    assert.equal(await items.nth(1).locator('.rq-domain').getAttribute('data-tone'), 'warn', 'Léo écrit du CHU mais demande l\'UBM');
    assert.match(await items.nth(1).locator('.rq-domain').textContent(), /n’est pas celui de l’établissement choisi/);

    await items.nth(0).getByRole('button', { name: 'Valider', exact: true }).click();
    await page.locator('#requestsDialog .rq-done').waitFor();
    assert.equal(await page.locator('#requestsDialog .rq-done').textContent(), 'La fiche de Zoé Nouvelle est validée.');
    assert.deepEqual((await bddCalls(page)).map(({ action, rowId, values }) => ({ action, rowId, values })),
      [{ action: 'UpdateRecord', rowId: 13, values: { En_attente_validation: false } }]);
    assert.equal(await page.locator('#requestsDialog .dlg-sub').textContent(), '1 demande en attente');
    assert.equal(await page.locator('#requestsDialog .rq-item').count(), 1);
    await waitForCards(page, 5); // Zoé avait accepté d'apparaître : sa fiche validée entre dans l'annuaire
    assert.equal(await page.locator('#accountBar .account-badge').textContent(), '1');
    assert.equal(await open.textContent(), 'Demandes à valider (1)');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('« Refuser » demande une confirmation, puis supprime la demande, et elle seule', { skip }, () =>
  withWidget({ tables: withTwoRequests(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-admin').click();
    await page.locator('#accountBar .account-requests').click();
    await requests.dialog(page).waitFor();
    const second = page.locator('#requestsDialog .rq-item').nth(1);
    await second.getByRole('button', { name: 'Refuser', exact: true }).click();
    assert.match(await second.locator('.rq-confirm').textContent(), /Refuser supprime la demande de BDD/);
    assert.deepEqual(await bddCalls(page), [], 'rien n\'est écrit avant la confirmation');
    await second.getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(await page.locator('#requestsDialog .rq-confirm').count(), 0);
    assert.deepEqual(await bddCalls(page), []);

    await second.getByRole('button', { name: 'Refuser', exact: true }).click();
    await second.getByRole('button', { name: 'Confirmer le refus', exact: true }).click();
    await page.locator('#requestsDialog .rq-done').waitFor();
    assert.equal(await page.locator('#requestsDialog .rq-done').textContent(), 'La demande de Léo Voisin est refusée et supprimée.');
    assert.deepEqual((await bddCalls(page)).map(({ action, rowId }) => ({ action, rowId })), [{ action: 'RemoveRecord', rowId: 14 }]);
    assert.equal(await page.evaluate(() => window.__tables.BDD.email.includes('leo@chu-bordeaux.example')), false);
    assert.equal(await page.locator('#requestsDialog .rq-item').count(), 1);
    await page.keyboard.press('Escape');
    await requests.closed(page);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'account-requests', 'le focus revient au bouton qui a ouvert la fenêtre');
  }));

test('une demande traitée entre-temps par un autre administrateur n\'est pas écrite deux fois, et la fenêtre le dit', { skip }, () =>
  withWidget({ tables: withTwoRequests(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-admin').click();
    await page.locator('#accountBar .account-requests').click();
    await requests.dialog(page).waitFor();
    await page.evaluate(() => { window.__tables.BDD.En_attente_validation[12] = false; }); // un autre administrateur a validé Zoé
    await page.locator('#requestsDialog .rq-item').nth(0).getByRole('button', { name: 'Valider', exact: true }).click();
    await page.locator('#requestsDialog .rq-done').waitFor();
    assert.match(await page.locator('#requestsDialog .rq-done').textContent(), /n'était plus à traiter : un autre administrateur s'en est occupé/);
    assert.deepEqual(await bddCalls(page), []);
  }));

test('si Grist refuse l\'écriture, la fenêtre le dit sous la demande et rien ne change', { skip }, () =>
  withWidget({ tables: withTwoRequests(), user: ADMIN_EMAIL, denyWrites: ['BDD'] }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-admin').click();
    await page.locator('#accountBar .account-requests').click();
    await requests.dialog(page).waitFor();
    await page.locator('#requestsDialog .rq-item').nth(0).getByRole('button', { name: 'Valider', exact: true }).click();
    await page.locator('#requestsDialog .rq-item .notice').waitFor();
    assert.match(await page.locator('#requestsDialog .rq-item .notice').textContent(), /Grist a refusé : vos droits ne permettent pas de traiter cette demande/);
    assert.equal(await page.locator('#requestsDialog .rq-item').count(), 2);
    assert.equal(await page.evaluate(() => window.__tables.BDD.En_attente_validation[12]), true);
  }));

// ===== La colonne de validation =====

test('un administrateur qui ouvre un document sans la colonne « En_attente_validation » la crée, une fois, et l\'annuaire est relu', { skip }, () =>
  withWidget({ tables: withSchema(withIdentity()), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await until(async () => (await structureCalls(page)).some(call => call.rowId === 'En_attente_validation'), 'la colonne n\'est pas créée');
    assert.deepEqual((await structureCalls(page)).filter(call => call.rowId === 'En_attente_validation').map(call => [call.action, call.values]),
      [['AddColumn', { type: 'Bool', isFormula: false }]]);
    assert.equal(await page.evaluate(() => 'En_attente_validation' in window.__tables.BDD), true);
  }));

test('une personne qui n\'administre pas ne crée aucune colonne, et sans la colonne la demande est refusée sans rien écrire', { skip }, () =>
  withWidget({ tables: withValidationButNoColumn(), user: NEW_EMAIL }, async ({ page }) => {
    await waitForGate(page, 'create');
    assert.deepEqual(await structureCalls(page), []);
    await gate(page).locator('.gate-action').click();
    await profile.dialog(page).waitFor();
    await field(page, 'prenom').fill('Zoé');
    await field(page, 'Etablissement').click();
    await listOf(page, 'Etablissement').locator('.dd-option').filter({ hasText: /^CHU$/ }).click();
    await profile.press(page, 'Relire ma fiche').click();
    await profile.alert(page).waitFor();
    assert.match(await profile.alertText(page), /BDD n'a pas de colonne\s«\sEn_attente_validation\s»/);
    assert.deepEqual(await bddCalls(page), []);
  }));

function withValidationButNoColumn() {
  const tables = closedDirectory();
  delete tables.BDD.En_attente_validation;
  return tables;
}

test('sans les tables de validation (document d\'avant la 1.45.0), l\'annuaire se lit comme avant pour un membre', { skip }, () => {
  const tables = withIdentity(sampleTables());
  tables.ACL.admin[0] = false;
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await gate(page).isHidden(), true);
  });
});
