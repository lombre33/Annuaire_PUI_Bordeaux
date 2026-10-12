// Test navigateur de la fiche d'un établissement : charge le vrai index.html dans Chromium, avec le
// faux document Grist de tests/support/fake-grist.js et ses pièces jointes
// (tests/support/fake-attachments.mjs, qui reçoit aussi les envois de logos), et vérifie ce que voit
// et obtient un responsable : où se trouvent les boutons, le contenu de la fenêtre, chaque
// enregistrement (nom, visibilité, responsables, logo), les refus, les conflits et l'accessibilité.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withBranding, withIdentity, ANA_EMAIL, BOB_EMAIL, ADMIN_EMAIL, IRIS_EMAIL, HOSTILE_FIRST_NAME } from './fixtures.mjs';
import { assertFooterWraps, skip, waitForCards, withWidget } from './support/browser.mjs';
import { FIRST_UPLOAD_ID } from './support/fake-attachments.mjs';

// ===== Outils =====

// Le document de départ : Ana est administratrice et responsable du CHU (ACL ligne 1), Bob est
// responsable de l'UBM sans être administrateur, ADMIN_EMAIL est administrateur sans établissement.
// Par défaut l'annuaire montre Ana, Hostile, Hugo (CHU) et Gina (Bergonié).
function world(edit = () => {}) {
  const tables = withIdentity(withBranding(sampleTables()));
  edit(tables);
  return tables;
}

// Ana n'administre pas : elle ne fait que la fiche du CHU.
const memberAna = tables => { tables.ACL.admin[0] = false; };

const dlg = page => page.locator('#etabDialog');
const shortcut = page => page.locator('#accountBar .account-etab');
const cardButtons = page => page.locator('#cardsGrid .etab-edit');
const field = (page, selector) => dlg(page).locator(selector);
const nameInput = page => page.locator('#etabName');
const visibleBox = page => page.locator('#etabVisible');
const press = (page, name) => dlg(page).getByRole('button', { name, exact: true });
const save = page => press(page, 'Enregistrer');
const summary = page => dlg(page).locator('.dlg-summary').textContent();
const alertText = page => dlg(page).locator('.dlg-alert').textContent();
const toast = page => page.locator('#toast');
const isOpen = page => page.evaluate(() => document.getElementById('etabDialog').open);
const closed = page => page.waitForFunction(() => !document.getElementById('etabDialog').open);
const rows = page => dlg(page).locator('.es-resp');
const rowFor = (page, email) => dlg(page).locator(`.es-resp[data-mail="${email}"]`);
const focusReturnsTo = (page, selector) => page.waitForFunction(
  wanted => document.activeElement?.matches(wanted), selector, { timeout: 3000 }
);

// Les actions que le widget a envoyées à Grist pour Etablissements et ACL (écrites ou refusées).
// Le numéro d'une ligne ajoutée est celui que le faux Grist invente (il réutilise un numéro libéré) :
// il n'est pas gardé.
const writes = page => page.evaluate(() => window.__fake.calls
  .filter(call => ['Etablissements', 'ACL'].includes(call.table))
  .map(({ action, table, rowId, values, ok }) => (action === 'AddRecord'
    ? { action, table, values, ok }
    : { action, table, rowId, values, ok })));
const tableOf = (page, name) => page.evaluate(table => structuredClone(window.__tables[table]), name);
const tokenRequests = page => page.evaluate(() => window.__fake.tokenRequests);
const aclRowOf = (acl, email) => acl.email.indexOf(email);
// Les boutons « Modifier » de l'édition d'une fiche (mode admin) sont posés quand l'identité est lue.
const waitForEditButtons = (page, count) => page.waitForFunction(
  expected => document.querySelectorAll('#cardsGrid .card-actions:not([hidden]) .card-edit').length === expected, count
);

// Ouvre la fenêtre par le raccourci du bandeau et attend la fin de la lecture de la fiche.
async function openFromBar(page, cards = 4) {
  await waitForCards(page, cards);
  await shortcut(page).waitFor();
  await shortcut(page).click();
  await nameInput(page).waitFor();
}

// Une image dessinée par le navigateur, sous forme d'octets (png, jpeg ou webp).
async function image(page, { width = 900, height = 300, type = 'image/png' } = {}) {
  const base64 = await page.evaluate(([w, h, mime]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    context.fillStyle = '#c0392b';
    context.fillRect(0, 0, w, h);
    context.fillStyle = '#f1c40f';
    context.fillRect(w / 4, h / 4, w / 2, h / 2);
    return canvas.toDataURL(mime, 0.9).split(',')[1];
  }, [width, height, type]);
  return Buffer.from(base64, 'base64');
}

const chooseFile = (page, file) => page.locator('#etabLogoFile').setInputFiles(file);
const png = async (page, options) => ({ name: 'mon-logo-prive.png', mimeType: 'image/png', buffer: await image(page, options) });
const dimensionsOf = bytes => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function until(condition, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

// ===== Où sont les boutons =====

test('une responsable voit « Modifier » sous le logo des cartes de son établissement et « Mon établissement » dans le bandeau', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await shortcut(page).waitFor();
    assert.equal(await shortcut(page).textContent(), 'Mon établissement');
    assert.equal(await shortcut(page).getAttribute('aria-haspopup'), 'dialog');
    await page.waitForFunction(() => document.querySelectorAll('.etab-edit').length === 3);
    const owners = await cardButtons(page).evaluateAll(nodes => nodes.map(node => node.closest('.contact-card').querySelector('.name').textContent));
    assert.deepEqual(owners, ['Hugo Bernard', `${HOSTILE_FIRST_NAME} Hostile`, 'Ana Martin'], 'les cartes du CHU (triées par nom de famille), pas celle de Gina (Bergonié)');
    const first = cardButtons(page).first();
    assert.equal(await first.textContent(), '✎ Modifier');
    assert.equal(await first.getAttribute('aria-label'), 'Modifier l’établissement CHU');
    assert.equal(await first.getAttribute('title'), 'Modifier la fiche de l’établissement : CHU');
    assert.equal(await first.evaluate(node => node.parentElement.className), 'etab-actions', 'sous le logo, dans la colonne de l’établissement');
    assert.equal(await isOpen(page), false, 'la fenêtre reste fermée tant qu’on ne la demande pas');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('personne d’autre n’a de bouton d’établissement : ni une personne sans droit, ni un administrateur sans établissement', { skip }, async () => {
  const cases = [
    ['une personne qui n’est responsable de rien', { user: IRIS_EMAIL }],
    ['un administrateur sans établissement, même en mode admin', { user: ADMIN_EMAIL, adminMode: true }],
    ['un compte anonyme', { user: null }],
    ['un compte Lecteur', { user: ANA_EMAIL, readOnly: true }],
    ['une adresse inconnue de l’annuaire et d’ACL', { user: 'inconnu@exemple.fr' }]
  ];
  for (const [who, { adminMode, ...options }] of cases) {
    await withWidget({ tables: world(), ...options }, async ({ page, logs }) => {
      await waitForCards(page, 4);
      if (adminMode) {
        await page.locator('#accountBar .account-admin').click();
        await waitForEditButtons(page, 4);
      } else {
        await page.waitForTimeout(300); // l'identité arrive après les cartes
      }
      assert.equal(await cardButtons(page).count(), 0, who);
      assert.equal(await shortcut(page).isHidden(), true, who);
      assert.deepEqual(await Promise.all(logs.errors), [], who);
    });
  }
});

test('un bouton « Modifier » forcé à la main sur la carte d’un établissement dont on n’est pas responsable n’ouvre rien', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => document.querySelectorAll('.etab-edit').length === 3);
    await page.evaluate(() => {
      // Ana est responsable du CHU, pas de l’UBM (2) : un bouton posé là par la console ne doit rien ouvrir.
      const forged = document.createElement('button');
      forged.className = 'etab-edit';
      forged.dataset.etabId = '2';
      forged.dataset.rowId = '1';
      document.querySelector('#cardsGrid .contact-card').append(forged);
      forged.click();
    });
    await page.waitForTimeout(300);
    assert.equal(await isOpen(page), false, 'la fenêtre reste fermée');
    assert.equal(await dlg(page).locator('#etabName').count(), 0, 'et la fiche de l’UBM n’a pas été chargée dans la fenêtre');
    assert.deepEqual(await writes(page), []);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('un responsable qui n’est pas administrateur trouve ses boutons sur les cartes de son établissement partenaire', { skip }, () =>
  withWidget({ tables: world(), user: BOB_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await shortcut(page).waitFor();
    assert.equal(await cardButtons(page).count(), 0, 'l’UBM est partenaire : sa carte n’est là que si l’on affiche les partenaires');
    await page.locator('.scope-btn[data-scope="partenaire"]').click();
    await waitForCards(page, 5);
    assert.equal(await cardButtons(page).count(), 1);
    assert.equal(await cardButtons(page).getAttribute('aria-label'), 'Modifier l’établissement UBM');
    await cardButtons(page).click();
    await nameInput(page).waitFor();
    assert.equal(await nameInput(page).inputValue(), 'Université Bordeaux Montaigne');
  }));

test('un établissement masqué n’a plus de carte, donc plus de bouton sous un logo : le bandeau reste le chemin vers sa fiche', { skip }, () =>
  withWidget({ tables: world(tables => { tables.Etablissements.ok_pour_apparaitre[0] = false; }), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 1);
    await shortcut(page).waitFor();
    assert.equal(await cardButtons(page).count(), 0, 'aucune carte du CHU');
    await shortcut(page).click();
    await nameInput(page).waitFor();
    assert.equal(await visibleBox(page).isChecked(), false);
    assert.equal(await dlg(page).locator('#etabVisibleNote').isVisible(), true, 'décochée, la case dit ce qu’il en est');
    assert.equal(await dlg(page).locator('#etabVisibleNote').textContent(), 'Cet établissement est masqué de l’annuaire : aucune de ses fiches n’y apparaît.');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('une responsable qui n’a pas de fiche dans l’annuaire a quand même le raccourci vers son établissement', { skip }, () =>
  withWidget({ tables: world(tables => { tables.BDD.email[0] = 'autre.adresse@exemple.fr'; }), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await shortcut(page).waitFor();
    assert.match(await page.locator('#accountBar .account-name').textContent(), /Administrateur/);
    assert.equal(await page.locator('#accountBar .account-edit').isHidden(), true, 'pas de fiche à modifier');
    assert.equal(await page.locator('#accountBar .presence-switch').isHidden(), true);
    await shortcut(page).click();
    await nameInput(page).waitFor();
    assert.equal(await nameInput(page).inputValue(), 'CHU de Bordeaux');
    assert.equal(await dlg(page).locator('.es-resp .es-tag-you').count(), 1);
  }));

test('une personne responsable de plusieurs établissements choisit d’abord celui dont elle ouvre la fiche', { skip }, () =>
  withWidget({
    tables: world(tables => {
      tables.ACL.id.push(4);
      tables.ACL.email.push(ANA_EMAIL);
      tables.ACL.Responsable_de_l_Etablissement.push(2);
      tables.ACL.admin.push(false);
    }),
    user: ANA_EMAIL
  }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await shortcut(page).waitFor();
    await shortcut(page).click();
    await dlg(page).locator('.es-choice').first().waitFor();
    assert.equal(await dlg(page).locator('#etabTitle').textContent(), 'Mon établissement');
    assert.deepEqual(await dlg(page).locator('.es-choice-name').allTextContents(), ['CHU', 'UBM']);
    assert.deepEqual(await dlg(page).locator('.es-choice-full').allTextContents(), ['CHU de Bordeaux', 'Université Bordeaux Montaigne']);
    await dlg(page).locator('.es-choice[data-etab-id="2"]').click();
    await nameInput(page).waitFor();
    assert.equal(await dlg(page).locator('#etabTitle').textContent(), 'Fiche de l’établissement : UBM');
    assert.equal(await nameInput(page).inputValue(), 'Université Bordeaux Montaigne');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

// ===== Ce que montre la fenêtre =====

test('la fenêtre montre le logo, le sigle et le statut en lecture seule, le nom, la visibilité et les responsables, comme la maquette', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    assert.equal(await dlg(page).locator('#etabTitle').textContent(), 'Fiche de l’établissement : CHU');
    assert.equal(await dlg(page).locator('.dlg-sub').textContent(), 'Vos modifications s’enregistrent tout de suite, sans validation ni relecture.');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'etabTitle', 'le titre est annoncé à l’ouverture');

    assert.equal(await field(page, '.es-logo-title').textContent(), 'Logo');
    assert.equal(await field(page, '.es-logo-help').textContent(),
      'Il apparaît sur les cartes de l’établissement et dans le bandeau du bas. PNG, JPG, WebP ou SVG, 1 Mo au maximum, ramené à 480 px de large.');
    assert.deepEqual(await field(page, '.es-logo-actions .btn').allTextContents(), ['Remplacer le logo', 'Retirer le logo']);
    await field(page, '.es-tile img.logo-img').waitFor();
    assert.equal(await field(page, '.es-tile img.logo-img').getAttribute('alt'), 'Logo de CHU de Bordeaux');

    const sigle = dlg(page).getByLabel('Sigle');
    assert.equal(await sigle.inputValue(), 'CHU');
    assert.equal(await sigle.getAttribute('readonly'), '');
    assert.equal(await dlg(page).getByLabel('Statut').inputValue(), 'Fondateur du PUI');
    assert.equal(await dlg(page).getByLabel('Statut').getAttribute('readonly'), '');
    assert.deepEqual(await dlg(page).locator('.fld-hint').allTextContents(),
      ['Il sert de filtre sur les cartes : il ne se change pas ici.', 'Géré par l’équipe du PUI.']);
    assert.equal(await dlg(page).getByLabel('Nom complet').inputValue(), 'CHU de Bordeaux');

    assert.equal(await visibleBox(page).isChecked(), true);
    assert.equal(await dlg(page).locator('.es-chk-label').textContent(), 'Établissement visible dans l’annuaire');
    assert.equal(await dlg(page).locator('.es-chk-sub').textContent(),
      'Décoché, aucune fiche de cet établissement n’apparaît, même celles des personnes qui ont accepté d’apparaître.');
    assert.equal(await dlg(page).locator('#etabVisibleNote').isHidden(), true);

    assert.equal(await dlg(page).locator('.es-sec-title').textContent(), 'Responsables de l’établissement');
    assert.equal(await dlg(page).locator('.es-sec-help').textContent(), 'Ils peuvent modifier cette fiche et en nommer d’autres, sans passer par un administrateur.');
    assert.equal(await rows(page).count(), 1);
    assert.equal(await rows(page).locator('.es-resp-name').textContent(), 'Ana Martinvous');
    assert.equal(await rows(page).locator('.es-resp-mail').textContent(), ANA_EMAIL);
    assert.equal(await rows(page).getByRole('button').getAttribute('aria-label'), 'Retirer Ana Martin');
    assert.deepEqual(await dlg(page).locator('.es-add select option').allTextContents(), ['Choisir une personne', `${HOSTILE_FIRST_NAME} Hostile`],
      'les personnes de l’établissement que l’annuaire montre, sans les responsables');
    assert.equal(await dlg(page).locator('.es-add input').getAttribute('placeholder'), 'ou une autre adresse e-mail');

    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await save(page).isDisabled(), true);
    assert.equal(await press(page, 'Annuler').isDisabled(), false);
    assert.equal(await page.evaluate(() => window.__xss), undefined, 'un prénom hostile n’est jamais lu comme du HTML');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('un établissement sans logo propose d’en ajouter un et montre son sigle en pastille', { skip }, () =>
  withWidget({ tables: world(tables => { tables.Etablissements.logo[0] = ['L']; }), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    assert.equal(await field(page, '.es-tile .et-pill').textContent(), 'CHU');
    assert.deepEqual(await field(page, '.es-logo-actions .btn:visible').allTextContents(), ['Ajouter un logo']);
    assert.equal(await field(page, '.es-logo-help').textContent(),
      'Sans logo, les cartes affichent le sigle de l’établissement et le bandeau du bas son nom. PNG, JPG, WebP ou SVG, 1 Mo au maximum.');
  }));

test('sans colonne « logo » dans Etablissements, la fenêtre le dit et ne propose pas de logo', { skip }, () =>
  withWidget({ tables: world(tables => { delete tables.Etablissements.logo; delete tables.Etablissements.ordre_bandeau; }), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    assert.match(await field(page, '.es-logo-help').textContent(), /la colonne « logo » n’existe pas dans la table Etablissements \(GRIST_SETUP\.md, étape 5\)/);
    assert.equal(await field(page, '.es-logo-actions').count(), 0);
    assert.equal(await field(page, '#etabLogoFile').count(), 0);
    assert.equal(await field(page, '.es-tile .et-pill').textContent(), 'CHU');
    await nameInput(page).fill('Autre nom');
    assert.equal(await save(page).isEnabled(), true, 'le reste de la fiche se modifie');
  }));

test('si la table ACL ne peut pas être lue, la fiche s’ouvre sans la liste des responsables, qu’elle ne modifie pas', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await shortcut(page).waitFor();
    await page.evaluate(() => { window.__failTables = ['ACL']; });
    await shortcut(page).click();
    await nameInput(page).waitFor();
    assert.match(await dlg(page).locator('.es-sec .notice').textContent(), /La liste des responsables n’a pas pu être lue/);
    assert.equal(await rows(page).count(), 0);
    assert.equal(await dlg(page).locator('.es-add').count(), 0);
    await visibleBox(page).uncheck();
    assert.equal(await summary(page), '1 modification : visibilité');
    assert.equal(await save(page).isEnabled(), true);
    assert.match((await Promise.all(logs.warnings)).join('\n'), /La table ACL ne peut pas être lue/);
  }));

test('une fiche qui ne peut pas être lue dans Grist s’annonce par une phrase, avec de quoi fermer la fenêtre', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await shortcut(page).waitFor();
    await page.evaluate(() => { window.__failTables = ['Etablissements']; });
    await shortcut(page).click();
    await dlg(page).locator('.dlg-body .notice').waitFor();
    assert.match(await dlg(page).locator('.dlg-body .notice').textContent(), /La fiche de l’établissement n’a pas pu être relue dans Grist : rien n’a été modifié/);
    assert.equal(await dlg(page).locator('.dlg-body .notice').getAttribute('role'), 'alert');
    assert.equal(await nameInput(page).count(), 0);
    await press(page, 'Fermer').click();
    await closed(page);
    await focusReturnsTo(page, '#accountBar .account-etab');
  }));

// ===== Nom et visibilité =====

test('un nouveau nom s’enregistre en une seule action Grist, la fenêtre se ferme et un message le confirme', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    await nameInput(page).fill('  CHU de Bordeaux — Pellegrin ');
    assert.equal(await summary(page), '1 modification : nom');
    assert.equal(await save(page).isEnabled(), true);
    await save(page).click();
    await closed(page);
    await toast(page).waitFor({ state: 'visible' });
    assert.equal(await toast(page).textContent(), 'La fiche de CHU est enregistrée.');
    assert.equal(await page.locator('#toastLive').textContent(), 'La fiche de CHU est enregistrée.');
    assert.deepEqual(await writes(page), [
      { action: 'UpdateRecord', table: 'Etablissements', rowId: 1, values: { nom_complet: 'CHU de Bordeaux — Pellegrin' }, ok: true }
    ]);
    await focusReturnsTo(page, '#accountBar .account-etab');
    await shortcut(page).click();
    await nameInput(page).waitFor();
    assert.equal(await nameInput(page).inputValue(), 'CHU de Bordeaux — Pellegrin', 'la fiche rouverte montre ce que Grist a gardé');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('un nom vide ou qu’un tableur lirait comme une formule est refusé champ par champ, sans rien écrire', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await nameInput(page).fill('   ');
    await dlg(page).locator('#etabName-error').waitFor({ state: 'visible' });
    assert.equal(await dlg(page).locator('#etabName-error').textContent(), 'Indiquez le nom complet de l’établissement.');
    assert.equal(await nameInput(page).getAttribute('aria-invalid'), 'true');
    assert.equal(await nameInput(page).getAttribute('aria-describedby'), 'etabName-error');
    assert.equal(await summary(page), 'Indiquez le nom complet de l’établissement');
    assert.equal(await save(page).isDisabled(), true);
    await nameInput(page).fill('=SOMME(A1:A2)');
    assert.equal(await dlg(page).locator('#etabName-error').textContent(), 'Ne peut pas commencer par = + - ou @.');
    assert.equal(await summary(page), 'Corrigez le nom');
    assert.equal(await save(page).isDisabled(), true);
    await nameInput(page).fill('CHU de Bordeaux');
    assert.equal(await dlg(page).locator('#etabName-error').isHidden(), true);
    assert.equal(await nameInput(page).getAttribute('aria-invalid'), 'false');
    assert.equal(await summary(page), 'Aucune modification', 'revenir au nom d’origine, ce n’est rien changer');
    assert.deepEqual(await writes(page), []);
  }));

test('décocher la visibilité dit ce qui va disparaître, et l’enregistrer retire les cartes de l’annuaire', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    await visibleBox(page).uncheck();
    assert.equal(await dlg(page).locator('#etabVisibleNote').isVisible(), true);
    assert.equal(await dlg(page).locator('#etabVisibleNote').textContent(), 'Les 3 fiches de cet établissement seront masquées de l’annuaire, y compris la vôtre.');
    assert.equal(await dlg(page).locator('#etabVisibleNote').getAttribute('role'), 'status');
    assert.equal(await summary(page), '1 modification : visibilité');
    await visibleBox(page).check();
    assert.equal(await dlg(page).locator('#etabVisibleNote').isHidden(), true);
    await visibleBox(page).uncheck();
    await save(page).click();
    await closed(page);
    await waitForCards(page, 1);
    assert.equal(await toast(page).textContent(), 'La fiche de CHU est enregistrée.');
    assert.deepEqual(await writes(page), [
      { action: 'UpdateRecord', table: 'Etablissements', rowId: 1, values: { ok_pour_apparaitre: false }, ok: true }
    ]);
    assert.equal(await cardButtons(page).count(), 0, 'plus de carte du CHU, plus de bouton');
    await focusReturnsTo(page, '#accountBar .account-etab');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le message de visibilité s’accorde au nombre de fiches et ne parle de « la vôtre » que si c’est vrai', { skip }, async () => {
  await withWidget({ tables: world(tables => { tables.BDD.Accepte_apparaitre[0] = false; }), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 3);
    await shortcut(page).click();
    await nameInput(page).waitFor();
    await visibleBox(page).uncheck();
    assert.equal(await dlg(page).locator('#etabVisibleNote').textContent(), 'Les 2 fiches de cet établissement seront masquées de l’annuaire.', 'Ana n’y figure pas');
  });
  await withWidget({
    tables: world(tables => {
      tables.BDD.Accepte_apparaitre[0] = false;
      tables.BDD.Accepte_apparaitre[5] = false;
    }),
    user: ANA_EMAIL
  }, async ({ page }) => {
    await waitForCards(page, 2);
    await shortcut(page).click();
    await nameInput(page).waitFor();
    await visibleBox(page).uncheck();
    assert.equal(await dlg(page).locator('#etabVisibleNote').textContent(), 'La fiche de cet établissement sera masquée de l’annuaire.');
  });
});

// ===== Responsables =====

test('on nomme un responsable par son adresse, la ligne est ajoutée à ACL sans toucher au droit d’administrateur', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    await dlg(page).locator('.es-add input').fill('  Claire.Moreau@CHU-Bordeaux.fr ');
    await press(page, 'Nommer').click();
    assert.equal(await rows(page).count(), 2);
    const added = rowFor(page, 'claire.moreau@chu-bordeaux.fr');
    assert.equal(await added.getAttribute('data-state'), 'added');
    assert.equal(await added.locator('.es-resp-name').textContent(), 'Adresse sans fiche dans l’annuaireajouté');
    assert.equal(await added.getByRole('button').getAttribute('aria-label'), 'Retirer claire.moreau@chu-bordeaux.fr');
    assert.equal(await dlg(page).locator('.es-add input').inputValue(), '', 'le champ est vidé');
    assert.equal(await summary(page), '1 modification : responsables');
    await save(page).click();
    await closed(page);
    assert.deepEqual(await writes(page), [
      { action: 'AddRecord', table: 'ACL', values: { email: 'claire.moreau@chu-bordeaux.fr', Responsable_de_l_Etablissement: 1 }, ok: true }
    ]);
    const acl = await tableOf(page, 'ACL');
    assert.equal(acl.admin[aclRowOf(acl, 'claire.moreau@chu-bordeaux.fr')], null, 'la nouvelle ligne ne donne aucun droit d’administrateur');
    assert.equal(acl.admin[0], true, 'Ana reste administratrice');
    await shortcut(page).click();
    await nameInput(page).waitFor();
    assert.equal(await rows(page).count(), 2, 'la fiche rouverte liste les deux responsables');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('nommer l’adresse d’une personne dont la fiche est masquée de l’annuaire ne dévoile pas son nom', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    await dlg(page).locator('.es-add input').fill(IRIS_EMAIL);
    await press(page, 'Nommer').click();
    const added = rowFor(page, IRIS_EMAIL);
    assert.equal(await added.locator('.es-resp-name').textContent(), 'Fiche masquée de l’annuaireajouté', 'Iris a refusé d’apparaître : on dit qu’elle existe, pas qui elle est');
    assert.equal(await added.locator('.avatar').textContent(), '@');
    assert.ok(!(await dlg(page).textContent()).includes('Iris'), 'son prénom n’est nulle part dans la fenêtre');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('on nomme une personne de l’établissement depuis la liste, son nom s’affiche sans être lu comme du HTML', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await dlg(page).locator('.es-add select').selectOption({ label: `${HOSTILE_FIRST_NAME} Hostile` });
    assert.equal(await dlg(page).locator('.es-add input').isDisabled(), true, 'la liste et l’adresse ne se cumulent pas');
    await press(page, 'Nommer').click();
    const added = rowFor(page, 'hostile@chu-bordeaux.fr');
    assert.equal(await added.locator('.es-resp-name').textContent(), `${HOSTILE_FIRST_NAME} Hostileajouté`);
    assert.equal(await added.locator('.avatar').textContent(), '<H');
    assert.equal(await dlg(page).locator('img[src="x"]').count(), 0, 'aucune balise n’est née du prénom');
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.deepEqual(await dlg(page).locator('.es-add select option').allTextContents(), ['Aucune autre personne']);
    assert.equal(await dlg(page).locator('.es-add select').isDisabled(), true);
    assert.equal(await dlg(page).locator('.es-add input').isDisabled(), false);
  }));

test('nommer sans rien choisir, avec une adresse invalide ou une personne déjà responsable dit pourquoi', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    const input = dlg(page).locator('.es-add input');
    const problem = dlg(page).locator('.es-add ~ .fld-err');
    await press(page, 'Nommer').click();
    assert.equal(await problem.textContent(), 'Choisissez une personne ou saisissez une adresse e-mail.');
    assert.equal(await problem.getAttribute('role'), 'alert');
    await input.fill('pas une adresse');
    await press(page, 'Nommer').click();
    assert.equal(await problem.textContent(), 'Indiquez une adresse e-mail valide.');
    await input.fill(ANA_EMAIL.toUpperCase());
    await press(page, 'Nommer').click();
    assert.equal(await problem.textContent(), 'Cette personne est déjà responsable.');
    assert.equal(await rows(page).count(), 1, 'rien n’a été ajouté');
    await input.fill('suivante@exemple.fr');
    await input.press('Enter');
    assert.equal(await rows(page).count(), 2, 'la touche Entrée nomme aussi');
    assert.equal(await problem.isHidden(), true, 'le message disparaît dès qu’une adresse est acceptée');
    assert.deepEqual(await writes(page), []);
  }));

test('retirer puis rétablir un responsable, ou retirer une adresse qu’on vient d’ajouter, ne laisse aucune trace', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    const own = rowFor(page, ANA_EMAIL);
    await own.getByRole('button', { name: 'Retirer Ana Martin' }).click();
    assert.equal(await own.getAttribute('data-state'), 'removed');
    assert.equal(await own.locator('.es-tag-gone').textContent(), 'retiré');
    assert.equal(await own.getByRole('button').textContent(), 'Rétablir');
    assert.equal(await own.getByRole('button').getAttribute('aria-label'), 'Rétablir Ana Martin');
    await own.getByRole('button', { name: 'Rétablir Ana Martin' }).click();
    assert.equal(await own.getAttribute('data-state'), 'kept');
    await dlg(page).locator('.es-add input').fill('provisoire@exemple.fr');
    await press(page, 'Nommer').click();
    await rowFor(page, 'provisoire@exemple.fr').getByRole('button').click();
    assert.equal(await rows(page).count(), 1);
    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await save(page).isDisabled(), true);
  }));

test('un établissement garde toujours un responsable : retirer le dernier est refusé et dit pourquoi', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    const minimum = dlg(page).locator('.es-sec > .es-err').first();
    assert.equal(await minimum.isHidden(), true);
    await rowFor(page, ANA_EMAIL).getByRole('button').click();
    assert.equal(await minimum.isVisible(), true);
    assert.equal(await minimum.textContent(), 'Un établissement doit garder au moins un responsable.');
    assert.equal(await summary(page), 'Gardez au moins un responsable');
    assert.equal(await save(page).isDisabled(), true);
    await dlg(page).locator('.es-add input').fill('relais@exemple.fr');
    await press(page, 'Nommer').click();
    assert.equal(await minimum.isHidden(), true, 'un autre responsable suffit');
    assert.equal(await save(page).isEnabled(), true);
    assert.deepEqual(await writes(page), []);
  }));

test('se retirer soi-même prévient qu’on perdra l’accès, puis les boutons disparaissent sans que le droit d’administrateur soit perdu', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    const warning = dlg(page).locator('#etabSelfNote');
    assert.equal(await warning.isHidden(), true);
    await dlg(page).locator('.es-add input').fill('relais@exemple.fr');
    await press(page, 'Nommer').click();
    await rowFor(page, ANA_EMAIL).getByRole('button').click();
    assert.equal(await warning.isVisible(), true);
    assert.equal(await warning.textContent(), 'Vous retirez votre propre accès : une fois enregistré, vous ne pourrez plus modifier cette fiche.');
    await save(page).click();
    await closed(page);
    assert.deepEqual(await writes(page), [
      { action: 'UpdateRecord', table: 'ACL', rowId: 1, values: { Responsable_de_l_Etablissement: 0 }, ok: true },
      { action: 'AddRecord', table: 'ACL', values: { email: 'relais@exemple.fr', Responsable_de_l_Etablissement: 1 }, ok: true }
    ]);
    const acl = await tableOf(page, 'ACL');
    assert.equal(acl.admin[0], true, 'la ligne d’Ana est gardée : elle reste administratrice');
    await shortcut(page).waitFor({ state: 'hidden' });
    assert.equal(await cardButtons(page).count(), 0, 'ni bouton sous les logos');
    assert.equal(await page.locator('#accountBar .account-admin').isVisible(), true, 'le mode admin est toujours là');
    await focusReturnsTo(page, '#searchInput');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('retirer un responsable ordinaire supprime sa ligne d’ACL', { skip }, () =>
  withWidget({ tables: world(), user: BOB_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await dlg(page).locator('.es-add input').fill('relais@exemple.fr');
    await press(page, 'Nommer').click();
    await rowFor(page, BOB_EMAIL).getByRole('button').click();
    await save(page).click();
    await closed(page);
    assert.deepEqual(await writes(page), [
      { action: 'RemoveRecord', table: 'ACL', rowId: 3, values: {}, ok: true },
      { action: 'AddRecord', table: 'ACL', values: { email: 'relais@exemple.fr', Responsable_de_l_Etablissement: 2 }, ok: true }
    ]);
    const acl = await tableOf(page, 'ACL');
    assert.deepEqual(acl.email.slice().sort(), [ADMIN_EMAIL, 'Ana.Martin@CHU-Bordeaux.fr', 'relais@exemple.fr'].sort(), 'la ligne de Bob a disparu');
  }));

// ===== Le logo =====

test('un nouveau logo est redessiné en PNG de 480 px, envoyé avec un jeton en écriture, puis référencé dans la même action que le reste', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files, logs }) => {
    await openFromBar(page);
    assert.deepEqual(await tokenRequests(page), [{ readOnly: true }], 'avant tout envoi, le widget ne demande que la lecture');
    await chooseFile(page, await png(page, { width: 960, height: 320 }));
    await field(page, '.es-tile img[src^="blob:"]').waitFor();
    assert.equal(await field(page, '.es-tile img').getAttribute('alt'), 'Nouveau logo de CHU de Bordeaux');
    assert.equal(await summary(page), '1 modification : logo');
    assert.equal(files.uploads.length, 0, 'rien n’est envoyé avant « Enregistrer »');
    await nameInput(page).fill('CHU nouveau nom');
    assert.equal(await summary(page), '2 modifications : logo, nom');
    await save(page).click();
    await closed(page);

    assert.equal(files.uploads.length, 1);
    const [upload] = files.uploads;
    assert.equal(upload.method, 'POST');
    assert.equal(upload.field, 'upload');
    assert.equal(upload.contentType, 'image/png');
    assert.equal(upload.fileName, 'logo.png', 'le nom du fichier d’origine n’est pas envoyé');
    assert.ok(upload.bytes.subarray(0, 8).equals(PNG_SIGNATURE), 'un vrai PNG');
    assert.deepEqual(dimensionsOf(upload.bytes), { width: 480, height: 160 }, 'ramené à 480 px, proportions gardées');
    assert.ok(upload.bytes.length < 1024 * 1024);
    assert.equal(upload.token, 'fake-token');
    assert.equal(upload.cookie, null, 'aucun cookie');
    assert.equal(upload.referrer, null, 'l’adresse de la page n’est pas envoyée');
    assert.equal((await tokenRequests(page)).filter(request => request.readOnly === false).length, 1, 'un seul jeton en écriture, demandé pour cet envoi');

    assert.deepEqual(await writes(page), [
      { action: 'UpdateRecord', table: 'Etablissements', rowId: 1, values: { logo: ['L', FIRST_UPLOAD_ID], nom_complet: 'CHU nouveau nom' }, ok: true }
    ]);
    assert.equal(await toast(page).textContent(), 'La fiche de CHU est enregistrée.');
    await until(() => files.hits[FIRST_UPLOAD_ID] > 0, 'les cartes téléchargent le nouveau logo');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le bouton « Remplacer le logo » ouvre le sélecteur de fichiers du navigateur, limité aux formats acceptés', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    assert.equal(await page.locator('#etabLogoFile').getAttribute('accept'), 'image/png,image/jpeg,image/webp,image/svg+xml');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), press(page, 'Remplacer le logo').click()]);
    assert.equal(chooser.isMultiple(), false);
    await chooser.setFiles(await png(page, { width: 100, height: 50 }));
    await field(page, '.es-tile img[src^="blob:"]').waitFor();
    assert.equal(await summary(page), '1 modification : logo');
  }));

test('un logo plus petit que 480 px garde sa taille ; un JPG et un WebP sont envoyés en PNG', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    const sizes = [];
    for (const [type, mimeType, name] of [['image/jpeg', 'image/jpeg', 'a.jpg'], ['image/webp', 'image/webp', 'b.webp'], ['image/png', 'image/png', 'c.png']]) {
      await chooseFile(page, { name, mimeType, buffer: await image(page, { width: 300, height: 100, type }) });
      await field(page, '.es-tile img[src^="blob:"]').waitFor();
      await save(page).click();
      await closed(page);
      sizes.push(dimensionsOf(files.uploads.at(-1).bytes));
      assert.equal(files.uploads.at(-1).contentType, 'image/png', `${mimeType} est ré-encodé`);
      assert.ok(files.uploads.at(-1).bytes.subarray(0, 8).equals(PNG_SIGNATURE));
      await shortcut(page).click();
      await nameInput(page).waitFor();
    }
    assert.deepEqual(sizes, [{ width: 300, height: 100 }, { width: 300, height: 100 }, { width: 300, height: 100 }]);
  }));

test('un SVG est dessiné à 480 px puis envoyé en PNG : son script ne part jamais', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40" onload="window.__svgxss=1">'
      + '<script>window.__svgxss=2</script><rect width="120" height="40" fill="#2c7a7b"/>'
      + '<image href="https://tracker.example/pixel.png" width="10" height="10"/></svg>';
    await chooseFile(page, { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
    await field(page, '.es-tile img[src^="blob:"]').waitFor();
    await save(page).click();
    await closed(page);
    const [upload] = files.uploads;
    assert.equal(upload.contentType, 'image/png');
    assert.ok(upload.bytes.subarray(0, 8).equals(PNG_SIGNATURE));
    assert.deepEqual(dimensionsOf(upload.bytes), { width: 480, height: 160 }, 'un SVG se dessine à la taille voulue, sans perte');
    assert.ok(!upload.bytes.toString('latin1').includes('<script'), 'aucun script dans ce qui est envoyé');
    assert.equal(await page.evaluate(() => window.__svgxss), undefined, 'et aucun n’a tourné');
  }));

test('un fichier refusé avant l’envoi (format, poids, contenu illisible) ne change rien et dit pourquoi', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    const error = dlg(page).locator('#etabLogoError');
    await chooseFile(page, { name: 'logo.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    assert.equal(await error.textContent(), 'Ce fichier n’est pas une image acceptée : choisissez un fichier PNG, JPG, WebP ou SVG.');
    await chooseFile(page, { name: 'gros.png', mimeType: 'image/png', buffer: Buffer.alloc(1024 * 1024 + 1) });
    assert.equal(await error.textContent(), 'Cette image pèse 1,1 Mo : choisissez-en une de 1 Mo au plus.');
    await chooseFile(page, { name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci n’est pas une image') });
    await dlg(page).locator('#etabLogoError:has-text("n’a pas pu être lue")').waitFor();
    assert.equal(await error.textContent(), 'Cette image n’a pas pu être lue : choisissez un autre fichier.');
    await chooseFile(page, { name: 'vide.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    assert.equal(await error.textContent(), 'Ce fichier est vide : choisissez-en un autre.');
    assert.equal(await error.getAttribute('class'), 'fld-err');
    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await save(page).isDisabled(), true);
    assert.equal(files.uploads.length, 0);
    assert.deepEqual(await writes(page), []);
    await chooseFile(page, await png(page, { width: 100, height: 100 }));
    await field(page, '.es-tile img[src^="blob:"]').waitFor();
    assert.equal(await error.isHidden(), true, 'un bon fichier efface le message');
  }));

test('une image aux dimensions démesurées, ou trop lourde une fois redessinée, est refusée avant tout envoi', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const outcomes = await page.evaluate(async () => {
      const { prepareImage } = await import('./image-prep.js');
      const attempt = async (file, rules) => {
        try {
          const prepared = await prepareImage(file, rules);
          return { width: prepared.width, height: prepared.height, type: prepared.blob.type };
        } catch (error) {
          return { refused: error.message, kind: error.name };
        }
      };
      const svg = (width, height) => new File([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`], 'grand.svg', { type: 'image/svg+xml' });
      // Du bruit : un JPEG de peu d’octets qui, redessiné en PNG, est incompressible.
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext('2d');
      const noise = context.createImageData(480, 480);
      for (let offset = 0; offset < noise.data.length; offset += 65536) {
        crypto.getRandomValues(noise.data.subarray(offset, Math.min(offset + 65536, noise.data.length)));
      }
      for (let i = 3; i < noise.data.length; i += 4) noise.data[i] = 255;
      context.putImageData(noise, 0, 0);
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.3));
      const heavy = new File([jpeg], 'bruit.jpg', { type: 'image/jpeg' });
      return {
        boundary: await attempt(svg(8000, 5000)),
        tooManyPixels: await attempt(svg(8001, 5000)),
        enormous: await attempt(svg(20000, 20000)),
        jpegBytes: jpeg.size,
        heavyAfterRedraw: await attempt(heavy, { types: ['image/jpeg'], maxBytes: jpeg.size + 1024, maxSide: 480 })
      };
    });
    assert.deepEqual(outcomes.boundary, { width: 480, height: 300, type: 'image/png' }, '40 millions de pixels pile passent, ramenés à 480 px');
    const huge = { refused: 'Cette image est beaucoup trop grande : choisissez-en une plus petite.', kind: 'ImageError' };
    assert.deepEqual(outcomes.tooManyPixels, huge, 'un pixel de plus que la limite');
    assert.deepEqual(outcomes.enormous, huge);
    assert.match(outcomes.heavyAfterRedraw.refused, /^Une fois redessinée, cette image pèse \d,\d Mo : choisissez-en une plus simple, de \d,\d Mo au plus\.$/,
      `un JPEG de ${outcomes.jpegBytes} octets devient un PNG plus lourd que la limite : ${JSON.stringify(outcomes.heavyAfterRedraw)}`);
    assert.deepEqual(await writes(page), []);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('« Retirer le logo » vide la cellule : les cartes reprennent le sigle', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    await press(page, 'Retirer le logo').click();
    assert.equal(await field(page, '.es-tile .et-pill').textContent(), 'CHU');
    assert.deepEqual(await field(page, '.es-logo-actions .btn:visible').allTextContents(), ['Ajouter un logo']);
    assert.equal(await summary(page), '1 modification : logo');
    await save(page).click();
    await closed(page);
    assert.deepEqual(await writes(page), [{ action: 'UpdateRecord', table: 'Etablissements', rowId: 1, values: { logo: ['L'] }, ok: true }]);
    assert.equal(files.uploads.length, 0, 'retirer n’envoie rien');
    await page.waitForFunction(() => document.querySelector('#cardsGrid .etablissement-tag.visible:not(.has-logo)') !== null);
  }));

test('choisir un logo puis « Retirer le logo » abandonne le choix ; sur un établissement sans logo, rien à retirer', { skip }, () =>
  withWidget({ tables: world(tables => { tables.Etablissements.logo[0] = ['L']; }), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    await chooseFile(page, await png(page, { width: 200, height: 80 }));
    await field(page, '.es-tile img[src^="blob:"]').waitFor();
    assert.equal(await summary(page), '1 modification : logo');
    await press(page, 'Retirer le logo').click();
    assert.equal(await summary(page), 'Aucune modification', 'pas de logo dans Grist : « retirer » revient à ne rien changer');
    assert.equal(await field(page, '.es-tile .et-pill').textContent(), 'CHU');
    assert.equal(files.uploads.length, 0);
  }));

// ===== Les échecs d'un envoi =====

const FAILED_UPLOADS = [
  ['denied', /vos droits ne permettent pas d’ajouter une pièce jointe/],
  ['too-large', /il est trop volumineux/],
  ['error', /Grist a refusé le fichier \(erreur 500\)/],
  ['bad-answer', /n’a pas confirmé l’envoi du fichier/],
  ['unreachable', /le navigateur n’a pas pu joindre le serveur, ou l’a refusé/]
];

test('un envoi que Grist refuse ou qui échoue laisse la fenêtre ouverte, la saisie intacte, et rien d’écrit', { skip }, async () => {
  for (const [mode, expected] of FAILED_UPLOADS) {
    await withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files, logs }) => {
      files.upload.mode = mode;
      await openFromBar(page);
      await chooseFile(page, await png(page));
      await nameInput(page).fill('Nom en attente');
      await save(page).click();
      await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
      assert.match(await alertText(page), expected, mode);
      assert.equal(await isOpen(page), true, mode);
      assert.equal(await nameInput(page).inputValue(), 'Nom en attente', 'la saisie est gardée');
      assert.equal(await field(page, '.es-tile img[src^="blob:"]').count(), 1, 'et le logo choisi aussi');
      assert.equal(await save(page).isEnabled(), true, 'on peut réessayer');
      assert.equal(await save(page).textContent(), 'Enregistrer');
      assert.deepEqual(await writes(page), [], `${mode} : rien n’est écrit, pas même le nom`);
      assert.equal(files.uploads.length, 1);
      const logged = (await Promise.all([...logs.warnings, ...logs.errors])).join('\n');
      assert.ok(!logged.includes('fake-token'), `${mode} : le jeton n’est jamais écrit dans la console`);
      assert.ok(!logged.includes('docs.getgrist.com/api/docs/fake-doc'), `${mode} : ni l’adresse du document`);
      files.upload.mode = 'ok';
      await save(page).click();
      await closed(page);
      assert.equal(files.uploads.length, 2, 'le second essai part et réussit');
      assert.equal((await writes(page))[0].values.logo[1], FIRST_UPLOAD_ID);
    });
  }
});

test('un serveur de pièces jointes sans en-têtes CORS fait échouer l’envoi proprement, avec la marche à suivre', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    files.upload.cors = false;
    await openFromBar(page);
    await chooseFile(page, await png(page));
    await save(page).click();
    await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /le navigateur n’a pas pu joindre le serveur, ou l’a refusé\. Déposez le fichier directement dans Grist \(voir GRIST_SETUP\.md\)/);
    assert.equal(files.uploads[0].id, FIRST_UPLOAD_ID, 'le serveur a pourtant gardé le fichier : le widget ne peut pas le savoir');
    assert.deepEqual(await writes(page), [], 'et rien n’est écrit dans le document');
    assert.equal(await isOpen(page), true);
  }));

test('un jeton d’écriture refusé par Grist arrête l’enregistrement sans rien envoyer', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    await chooseFile(page, await png(page));
    await page.evaluate(() => {
      const original = window.__fake.docApi.getAccessToken;
      window.__fake.docApi.getAccessToken = request => (request?.readOnly === false ? Promise.reject(new Error('Access token refused')) : original(request));
    });
    await save(page).click();
    await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /Grist n’a pas donné au widget l’autorisation d’envoyer un fichier/);
    assert.equal(files.uploads.length, 0);
    assert.deepEqual(await writes(page), []);
  }));

test('si l’envoi réussit mais que Grist refuse ensuite l’écriture, la phrase dit où est resté le fichier', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openFromBar(page);
    await chooseFile(page, await png(page));
    await page.evaluate(() => { window.__denyWrites = ['Etablissements']; });
    await save(page).click();
    await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
    const message = await alertText(page);
    assert.match(message, /Grist a refusé la modification : vos droits ne permettent pas/);
    assert.match(message, /Le fichier du nouveau logo, déjà envoyé à Grist, reste dans les pièces jointes du document sans servir\./);
    assert.equal(files.uploads.length, 1);
  }));

// ===== Refus, conflits =====

test('un refus de Grist (règle d’accès) ne laisse rien à moitié écrit : ni le nom ni les responsables', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await nameInput(page).fill('Nom refusé');
    await dlg(page).locator('.es-add input').fill('relais@exemple.fr');
    await press(page, 'Nommer').click();
    await page.evaluate(() => { window.__denyWrites = ['ACL']; });
    await save(page).click();
    await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /Grist a refusé la modification : vos droits ne permettent pas de changer cet établissement ou la liste de ses responsables\. Contactez un administrateur\./);
    assert.equal(await isOpen(page), true);
    assert.equal(await nameInput(page).inputValue(), 'Nom refusé');
    assert.equal((await tableOf(page, 'Etablissements')).nom_complet[0], 'CHU de Bordeaux');
    assert.equal((await tableOf(page, 'ACL')).id.length, 3);
    assert.equal(await dlg(page).locator('.dlg-alert [role="alert"]').getAttribute('role'), 'alert');
  }));

test('une colonne à formule refusée par Grist est expliquée avec la marche à suivre', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await visibleBox(page).uncheck();
    await page.evaluate(() => {
      window.__fake.docApi.applyUserActions = async () => { throw new Error('Cannot modify formula column ok_pour_apparaitre'); };
    });
    await save(page).click();
    await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /colonne à formule : elle ne peut pas être modifiée depuis le widget\. Voir GRIST_SETUP\.md\./);
  }));

test('si la fiche a changé dans Grist pendant que la fenêtre était ouverte, rien n’est écrit : la saisie est gardée et la personne relit', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openFromBar(page);
    await nameInput(page).fill('Ma version du nom');
    await visibleBox(page).uncheck();
    await page.evaluate(() => { window.__tables.Etablissements.nom_complet[0] = 'CHU (changé ailleurs)'; });
    await save(page).click();
    await dlg(page).locator('.dlg-alert .notice').waitFor();
    assert.equal(await dlg(page).locator('.dlg-alert .notice').textContent(),
      'La fiche a changé dans Grist pendant que la fenêtre était ouverte (nom). Ce que vous avez saisi est conservé : relisez-le, puis enregistrez à nouveau.');
    assert.equal(await isOpen(page), true);
    assert.equal(await nameInput(page).inputValue(), 'Ma version du nom');
    assert.equal(await visibleBox(page).isChecked(), false);
    assert.deepEqual(await writes(page), [], 'rien n’a été écrit');
    assert.equal(await summary(page), '2 modifications : nom, visibilité');

    await save(page).click();
    await closed(page);
    assert.deepEqual(await writes(page), [
      { action: 'UpdateRecord', table: 'Etablissements', rowId: 1, values: { nom_complet: 'Ma version du nom', ok_pour_apparaitre: false }, ok: true }
    ]);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('si quelqu’un d’autre a déjà fait le même changement, il n’y a plus rien à enregistrer et la fenêtre le dit', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await visibleBox(page).uncheck();
    await page.evaluate(() => { window.__tables.Etablissements.ok_pour_apparaitre[0] = false; });
    await save(page).click();
    await dlg(page).locator('.dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /Ces modifications sont déjà dans la fiche de l’établissement : il n’y a rien à enregistrer/);
    assert.deepEqual(await writes(page), []);
  }));

test('une liste de responsables modifiée ailleurs est reprise : ce qu’un autre a nommé reste', { skip }, () =>
  withWidget({ tables: world(), user: BOB_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await dlg(page).locator('.es-add input').fill('moi@exemple.fr');
    await press(page, 'Nommer').click();
    await page.evaluate(() => {
      const acl = window.__tables.ACL;
      acl.id.push(10);
      acl.email.push('autre.responsable@exemple.fr');
      acl.Responsable_de_l_Etablissement.push(2);
      acl.admin.push(false);
    });
    await save(page).click();
    await closed(page);
    assert.deepEqual(await writes(page), [
      { action: 'AddRecord', table: 'ACL', values: { email: 'moi@exemple.fr', Responsable_de_l_Etablissement: 2 }, ok: true }
    ], 'seule la nomination faite dans la fenêtre est écrite : la ligne d’un autre n’est pas touchée');
    const acl = await tableOf(page, 'ACL');
    const names = acl.email.filter((_, index) => acl.Responsable_de_l_Etablissement[index] === 2).sort();
    assert.deepEqual(names, [BOB_EMAIL, 'autre.responsable@exemple.fr', 'moi@exemple.fr'].sort());
  }));

// ===== Fenêtre : clavier, focus, abandon =====

test('Échap prévient avant d’abandonner des modifications, le second appui ferme, et le focus revient au bouton d’origine', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await cardButtons(page).first().waitFor();
    // Les cartes sont triées par nom : la première qui porte un bouton n'est pas forcément celle d'Ana.
    const rowId = await cardButtons(page).first().getAttribute('data-row-id');
    const sameButton = `#cardsGrid .etab-edit[data-row-id="${rowId}"]`;
    await cardButtons(page).first().click();
    await nameInput(page).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'etabTitle');
    await page.keyboard.press('Escape');
    await closed(page);
    await focusReturnsTo(page, sameButton);

    await cardButtons(page).first().click();
    await nameInput(page).waitFor();
    await nameInput(page).fill('Brouillon');
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), true, 'le premier appui prévient seulement');
    assert.equal(await dlg(page).locator('.dlg-hint').isVisible(), true);
    assert.equal(await dlg(page).locator('.dlg-hint').textContent(), 'Des modifications ne sont pas enregistrées. Appuyez encore sur Échap pour les abandonner.');
    await nameInput(page).fill('Brouillon 2');
    assert.equal(await dlg(page).locator('.dlg-hint').isHidden(), true, 'toute modification annule l’avertissement');
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), true);
    await page.keyboard.press('Escape');
    await closed(page);
    await focusReturnsTo(page, sameButton);
    assert.deepEqual(await writes(page), []);
    assert.equal(await page.locator('#toast').isHidden(), true);
  }));

test('« Annuler » et le bouton de fermeture ferment sans rien écrire ; le focus revient au raccourci du bandeau', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await nameInput(page).fill('Abandonné');
    await press(page, 'Annuler').click();
    await closed(page);
    await focusReturnsTo(page, '#accountBar .account-etab');
    await shortcut(page).click();
    await nameInput(page).waitFor();
    assert.equal(await nameInput(page).inputValue(), 'CHU de Bordeaux', 'la fenêtre rouverte repart de la fiche de Grist');
    await dlg(page).getByRole('button', { name: 'Fermer la fenêtre' }).click();
    await closed(page);
    assert.deepEqual(await writes(page), []);
  }));

test('pendant l’enregistrement la fenêtre se verrouille, et un double clic n’écrit qu’une fois', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    await visibleBox(page).uncheck();
    await page.evaluate(() => { window.__delay = 400; }); // une écriture lente, seulement à partir d'ici
    const primary = dlg(page).locator('.dlg-foot .btn-primary'); // « Enregistrer », qui change de texte
    await save(page).dblclick();
    assert.equal(await primary.textContent(), 'Enregistrement…');
    assert.equal(await primary.getAttribute('aria-busy'), 'true');
    assert.equal(await primary.isDisabled(), true);
    assert.equal(await press(page, 'Annuler').isDisabled(), true);
    assert.equal(await dlg(page).getByRole('button', { name: 'Fermer la fenêtre' }).isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), true, 'Échap ne ferme pas pendant l’écriture');
    await closed(page);
    assert.equal((await writes(page)).length, 1, 'une seule écriture malgré le double clic');
  }));

test('chaque contrôle de la fenêtre a un nom accessible précis, et Tab les parcourt dans l’ordre de la page', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openFromBar(page);
    assert.equal(await dlg(page).getAttribute('aria-labelledby'), 'etabTitle');
    const named = [
      ['button', 'Fermer la fenêtre'], ['button', 'Remplacer le logo'], ['button', 'Retirer le logo'],
      ['textbox', 'Sigle'], ['textbox', 'Statut'], ['textbox', 'Nom complet'],
      ['checkbox', 'Établissement visible dans l’annuaire'],
      ['button', 'Retirer Ana Martin'], ['combobox', 'Nommer une personne de l’établissement'],
      ['textbox', 'Adresse e-mail du nouveau responsable'], ['button', 'Nommer'],
      ['button', 'Annuler'], ['button', 'Enregistrer']
    ];
    for (const [role, name] of named) {
      assert.equal(await dlg(page).getByRole(role, { name, exact: true }).count(), 1, `${role} « ${name} »`);
    }
    assert.equal(await dlg(page).locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').count(), 0, 'aucun tabindex positif');
    assert.equal(await field(page, '#etabAcronym').getAttribute('aria-describedby'), 'etabAcronym-hint');
    assert.equal(await visibleBox(page).getAttribute('aria-describedby'), 'etabVisibleSub');
    await visibleBox(page).uncheck();
    assert.equal(await visibleBox(page).getAttribute('aria-describedby'), 'etabVisibleSub etabVisibleNote', 'décochée, la case est aussi décrite par son avertissement');
    await visibleBox(page).check();

    // La fenêtre s'ouvre sur son titre ; Tab passe ensuite d'un contrôle au suivant.
    await page.evaluate(() => document.getElementById('etabTitle').focus());
    const order = [];
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()));
    }
    assert.deepEqual(order, [
      'Fermer la fenêtre', 'Remplacer le logo', 'Retirer le logo', 'etabAcronym', 'etabStatus', 'etabName', 'etabVisible', 'Retirer Ana Martin'
    ]);
  }));

// ===== Mise en page =====

test('la fenêtre et le bandeau tiennent sans défilement horizontal du téléphone au grand écran, y compris avec trois boutons', { skip }, async () => {
  for (const width of [320, 390, 560, 768, 860, 1000, 1280]) {
    await withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await waitForCards(page, 4);
      await shortcut(page).waitFor();
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok((await overflow()) <= 0, `${width} px : la page ne déborde pas`);
      const barBox = await page.locator('#accountBar').boundingBox();
      if (width >= 860) {
        // Ana est administratrice, responsable et a une fiche : avec l'interrupteur, cela fait trois
        // boutons dans la colonne de droite, soit trois rangées de 36 px et leurs intervalles, pas une de plus.
        assert.ok(barBox.height <= 3 * 36 + 2 * 8 + 12, `${width} px : le bandeau tient sur trois rangées (${Math.round(barBox.height)} px)`);
      }
      const buttons = await page.locator('#accountBar button:visible').evaluateAll(nodes => nodes.map(node => {
        const { x, y, width: w, height: h, right } = node.getBoundingClientRect();
        return { name: node.textContent.trim().slice(0, 24), x, y, w, h, right };
      }));
      for (const button of buttons) {
        assert.ok(button.right <= (barBox.x + barBox.width) + 1, `${width} px : « ${button.name} » ne dépasse pas du bandeau`);
      }
      const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      for (let i = 0; i < buttons.length; i += 1) {
        for (let j = i + 1; j < buttons.length; j += 1) {
          assert.ok(!rectsOverlap(buttons[i], buttons[j]), `${width} px : « ${buttons[i].name} » et « ${buttons[j].name} » ne se chevauchent pas`);
        }
      }
      await shortcut(page).click();
      await nameInput(page).waitFor();
      await dlg(page).locator('.es-resp').first().waitFor();
      const box = await dlg(page).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 0.5, `${width} px : la fenêtre tient dans l’écran`);
      assert.ok(await dlg(page).locator('.dlg-body').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${width} px : pas de défilement horizontal dans la fenêtre`);
      const footer = await dlg(page).locator('.dlg-foot').boundingBox();
      assert.ok(footer.y + footer.height <= 900 + 0.5, `${width} px : le pied de fenêtre reste visible`);
    });
  }
});

test('le résumé du pied de la fenêtre partage la ligne des boutons dès que tout tient, et passe au-dessus sinon', { skip }, () =>
  withWidget({ tables: world(memberAna), user: ANA_EMAIL }, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFromBar(page);
    assert.equal(await summary(page), 'Aucune modification');
    await assertFooterWraps(page, '#etabDialog');
  }));

test('le bouton « Modifier » de l’établissement ne touche ni le logo ni les autres éléments de la carte', { skip }, async () => {
  for (const width of [1280, 390, 320]) {
    await withWidget({ tables: world(memberAna), user: ANA_EMAIL }, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await waitForCards(page, 4);
      await cardButtons(page).first().waitFor();
      const geometry = await page.evaluate(() => {
        const card = document.querySelector('#cardsGrid .etab-edit').closest('.contact-card');
        const box = selector => {
          const node = card.querySelector(selector);
          const { x, y, width: w, height: h } = node.getBoundingClientRect();
          return { x, y, w, h, hidden: node.offsetParent === null };
        };
        return { button: box('.etab-edit'), tag: box('.etablissement-tag'), identity: box('.identity'), actions: box('.card-actions') };
      });
      const overlapsWith = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      for (const other of ['tag', 'identity', 'actions']) {
        if (geometry[other].hidden) continue;
        assert.ok(!overlapsWith(geometry.button, geometry[other]), `${width} px : le bouton ne recouvre pas ${other}`);
      }
      assert.ok(geometry.button.y >= geometry.tag.y + geometry.tag.h - 1, `${width} px : le bouton est sous le logo`);
    });
  }
});

test('le widget ne contacte que le serveur local, l’API Grist simulée et ses pièces jointes, même quand un logo est envoyé', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    const hosts = new Set();
    page.on('request', request => hosts.add(new URL(request.url()).host));
    await openFromBar(page);
    await chooseFile(page, await png(page));
    await save(page).click();
    await closed(page);
    assert.equal(files.uploads.length, 1);
    const unexpected = [...hosts].filter(host => !host.startsWith('127.0.0.1') && host !== 'docs.getgrist.com');
    assert.deepEqual(unexpected, []);
  }));
