// Test navigateur des aides de tests/support/ : refusent-elles ce qu'elles doivent refuser ? Les tests navigateur ont mis leurs
// contrôles communs dans ces aides (tests/support/browser.mjs, dialog-page.mjs, grouped-menu.mjs) ; si l'une devenait trop
// indulgente, tous les tests qui s'en servent resteraient verts sans plus rien vérifier. Chaque cas donne donc à une aide une page
// volontairement fautive et attend son refus, après avoir vérifié qu'elle accepte la page saine.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANA_EMAIL, withIdentity } from './fixtures.mjs';
import { assertNoSecretLogged, openOwn, skip, until, waitForCards, withWidget } from './support/browser.mjs';
import { FITS, assertTabStaysInDialog, dialogFit, profileDialogPage, spillOf, unnamedControls } from './support/dialog-page.mjs';
import { assertKeyboardWalk, groupedMenu } from './support/grouped-menu.mjs';

const { dialog } = profileDialogPage();

// Ana n'administre pas : elle ne modifie que sa fiche, par le bandeau « Ma présence ».
function ordinaryMember() {
  const tables = withIdentity();
  tables.ACL.admin[0] = false;
  return tables;
}

const withOwnProfile = run => withWidget({ tables: ordinaryMember(), user: ANA_EMAIL }, async widget => {
  await openOwn(widget.page);
  await run(widget);
});

// Ajoute `html` au corps de la fenêtre de modification.
const appendToBody = (page, html) => page.evaluate(markup => {
  document.querySelector('#profileDialog .dlg-body').insertAdjacentHTML('beforeend', markup);
}, html);

test('unnamedControls : aucun contrôle sans nom dans la fenêtre saine, un bouton vide est repéré', { skip }, () =>
  withOwnProfile(async ({ page }) => {
    assert.deepEqual(await unnamedControls(dialog(page)), []);
    await appendToBody(page, '<button></button>');
    assert.equal((await unnamedControls(dialog(page))).length, 1);
  }));

test('dialogFit : la fenêtre saine tient dans l\'écran, un élément qui la dépasse est repéré', { skip }, () =>
  withOwnProfile(async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    assert.deepEqual(await dialogFit(page, '#profileDialog'), FITS);
    await appendToBody(page, '<div style="width:3000px;height:10px"></div>');
    const fit = await dialogFit(page, '#profileDialog');
    assert.notDeepEqual(fit, FITS);
    assert.ok(fit.outside.length > 0 || fit.bodyOverflow > 0, JSON.stringify(fit));
  }));

test('dialogFit : une fenêtre qui descend sous le bas de l\'écran est repérée', { skip }, () =>
  withOwnProfile(async ({ page }) => {
    assert.equal((await dialogFit(page, '#profileDialog')).inside, true);
    await page.evaluate(() => { document.getElementById('profileDialog').style.marginTop = '2000px'; });
    assert.equal((await dialogFit(page, '#profileDialog')).inside, false);
  }));

test('spillOf : une carte saine ne perd rien, un enfant qui sort de son cadre est repéré', { skip }, () =>
  withWidget({ tables: ordinaryMember(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const card = page.locator('#cardsGrid .contact-card').first();
    assert.deepEqual(await spillOf(card), []);
    await card.evaluate(element => {
      const intruder = document.createElement('i');
      intruder.className = 'intrus';
      intruder.style.cssText = 'position:absolute;left:-300px;width:10px;height:10px';
      element.append(intruder);
    });
    assert.deepEqual(await spillOf(card), ['intrus']);
  }));

test('assertTabStaysInDialog : la fenêtre modale garde le focus, une fenêtre qui ne l\'est pas le laisse sortir', { skip }, () =>
  withOwnProfile(async ({ page }) => {
    await assertTabStaysInDialog(page, 'profileDialog', 40);
    await page.evaluate(() => {
      const element = document.getElementById('profileDialog');
      element.close();
      element.show(); // ouverte, mais plus modale : la page derrière reprend le focus
    });
    await page.locator('#searchInput').focus();
    await assert.rejects(assertTabStaysInDialog(page, 'profileDialog', 40));
  }));

test('assertNoSecretLogged : une console propre passe, le jeton ou l\'adresse du document y sont refusés', { skip }, async () => {
  await withWidget({ tables: ordinaryMember(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await assertNoSecretLogged(logs, 'console propre');
    await page.evaluate(() => console.error('le jeton fake-token-123 est là'));
    await until(() => logs.errors.length > 0, 'la console a reçu le message');
    await assert.rejects(assertNoSecretLogged(logs, 'jeton'));
  });
  await withWidget({ tables: ordinaryMember(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.evaluate(() => console.warn('https://docs.getgrist.com/api/docs/fake-doc/attachments'));
    await until(() => logs.warnings.length > 0, 'la console a reçu le message');
    await assert.rejects(assertNoSecretLogged(logs, 'adresse du document'));
  });
});

test('assertKeyboardWalk : le parcours du bon groupe passe, celui d\'un autre groupe ou d\'une autre valeur est refusé', { skip }, async () => {
  const skills = groupedMenu('competences');
  const walk = (group, firstItem) => withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await assertKeyboardWalk(page, skills, { group, cardsAfterTick: 1, firstItem });
  });
  await walk('Cancérologie', 'Hématologie');
  await assert.rejects(walk('Pharmacie', 'Hématologie'));
  await assert.rejects(walk('Cancérologie', 'Oncologie'));
});
