// Test navigateur des aides de tests/support/ : refusent-elles ce qu'elles doivent refuser ? Les tests navigateur ont mis leurs
// contrôles communs dans ces aides (tests/support/browser.mjs, dialog-page.mjs, grouped-menu.mjs) ; si l'une devenait trop
// indulgente, tous les tests qui s'en servent resteraient verts sans plus rien vérifier. Chaque cas donne donc à une aide une page
// volontairement fautive et attend son refus, après avoir vérifié qu'elle accepte la page saine.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANA_EMAIL, withIdentity } from './fixtures.mjs';
import { assertNoCspViolation, assertNoSecretLogged, layoutSettled, openOwn, skip, until, waitForCards, withWidget } from './support/browser.mjs';
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

test('assertNoCspViolation : une page saine passe, un script en ligne que la politique refuse est repéré', { skip }, () =>
  withWidget({}, async widget => {
    await waitForCards(widget.page, 4);
    await assertNoCspViolation(widget);
    await widget.page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__ran = true';
      document.head.append(script);
    });
    await until(() => widget.logs.cspViolations.length > 0, 'le navigateur a signalé le script refusé');
    await assert.rejects(assertNoCspViolation(widget), /politique de sécurité de contenu/);
    widget.logs.cspViolations.length = 0; // refus voulu : withWidget ne doit pas l'échouer
  }));

test('withWidget : un scénario dont la page enfreint sa politique de sécurité de contenu échoue, même si le scénario ne le regarde pas', { skip }, () =>
  assert.rejects(withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.evaluate(() => { new Image().src = 'http://evil.example/p.png'; });
    await until(() => logs.cspViolations.length > 0, 'le navigateur a signalé l\'image refusée');
  }), /politique de sécurité de contenu/));

// Une page dont la hauteur change à chaque image pendant `count` images, comme le bas d'une grille de cartes dont le navigateur
// corrige les hauteurs estimées : `window.__grow(count)`, jouée dans la page.
const installGrowth = page => page.evaluate(() => {
  window.__grow = count => {
    const spacer = document.createElement('div');
    document.getElementById('cardsGrid').before(spacer);
    let drawn = 0;
    const next = () => {
      spacer.style.height = `${(drawn += 1) * 7}px`;
      if (drawn < count) requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  };
});
const pageHeight = page => page.evaluate(() => document.documentElement.scrollHeight);
const framesLater = (page, count) => page.evaluate(frames => new Promise(resolve => {
  const wait = left => (left === 0 ? resolve() : requestAnimationFrame(() => wait(left - 1)));
  wait(frames);
}), count);

test('layoutSettled : attend qu\'une page qui bouge se pose, et refuse une page qui ne se pose jamais', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await installGrowth(page);
    const before = await pageHeight(page);
    await page.evaluate(() => window.__grow(30));
    await layoutSettled(page);
    const settled = await pageHeight(page);
    assert.ok(settled >= before + 200, `la page a fini de grandir (${before} → ${settled} px)`);
    await framesLater(page, 10);
    assert.equal(await pageHeight(page), settled, 'une fois posée, la page ne bouge plus');
    // Une page qui bouge à chaque image ne se pose jamais : on le dit au lieu de laisser mesurer n'importe quand.
    await page.evaluate(() => {
      let flip = 0;
      const flicker = () => {
        document.getElementById('cardsGrid').style.marginTop = `${44 + (flip++ % 2) * 10}px`;
        requestAnimationFrame(flicker);
      };
      requestAnimationFrame(flicker);
    });
    await assert.rejects(layoutSettled(page, { timeout: 300 }), /ne se pose pas/);
  }));

test('page.setViewportSize : le harnais ne rend la main qu\'une fois la mise en page posée', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await installGrowth(page);
    // Le navigateur ajuste la page pendant une vingtaine d'images après chaque changement de largeur.
    await page.evaluate(() => window.addEventListener('resize', () => window.__grow(20)));
    const before = await pageHeight(page);
    await page.setViewportSize({ width: 700, height: 800 });
    const settled = await pageHeight(page);
    assert.ok(settled >= before + 100, `la page a fini de s'ajuster (${before} → ${settled} px)`);
    await framesLater(page, 10);
    assert.equal(await pageHeight(page), settled, 'la mise en page est posée dès le retour de setViewportSize');
  }));
