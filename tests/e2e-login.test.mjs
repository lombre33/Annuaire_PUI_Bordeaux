// La fenêtre « Se connecter à Grist » d'un visiteur sans compte (1.44.0 : login.js, login-ui.js, identity.js) dans Chromium (optionnel :
// voir TESTING.md), sur une API Grist simulée. L'annuaire reste public : les cartes s'affichent pour tout le monde ; seule une personne
// que Grist dit sans compte (l'adresse anonyme de tous les visiteurs d'un lien public, ou la ligne de la sonde refusée par une règle
// d'accès) voit la fenêtre, une fois, et le bouton « Se connecter » de l'en-tête. Le lien de la fenêtre mène à la page de connexion
// de Grist et revient sur la page de l'annuaire en style singlePage ; ce que fait vraiment le Grist de l'instance n'est pas essayé ici
// (TESTING.md, section 28).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { ANONYMOUS_EMAIL } from '../constants.js';
import { ANA_EMAIL, sampleTables, withIdentity } from './fixtures.mjs';
import { skip, until, waitForCards, withWidget } from './support/browser.mjs';

// L'adresse de l'API du faux document (tests/support/fake-grist.js, FAKE_ATTACHMENTS_URL) : https://docs.getgrist.com/api/docs/fake-doc.
const LOGIN_TO_DOCUMENT = 'https://docs.getgrist.com/login?next=%2Ffake-doc%3Fstyle%3DsinglePage';
const LOGIN_TO_PAGE_7 = 'https://docs.getgrist.com/login?next=%2Ffake-doc%2Fx%2Fp%2F7%3Fstyle%3DsinglePage';

const DIALOG = '#loginDialog';
const isOpen = page => page.locator(DIALOG).evaluate(dialog => dialog.open);
const anonymous = (options = {}) => ({ tables: withIdentity(), user: ANONYMOUS_EMAIL, ...options });

test('un visiteur sans compte voit l\'annuaire, puis une fenêtre qui mène à la connexion de Grist, retour sur le document en singlePage', { skip }, () =>
  withWidget(anonymous(), async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator('#loginTitle').textContent(), 'Se connecter à Grist');
    assert.equal(await page.locator(`${DIALOG} .dlg-sub`).textContent(), 'Un compte Grist est nécessaire pour modifier une fiche.');
    assert.equal(await page.locator('#loginTitle').evaluate(title => document.activeElement === title), true, 'le titre est lu d\'abord');
    const link = page.locator(`${DIALOG} a.btn-primary`);
    assert.equal(await link.textContent(), 'Se connecter');
    assert.equal(await link.getAttribute('href'), LOGIN_TO_DOCUMENT);
    assert.equal(await link.getAttribute('target'), '_top', 'la page entière de Grist change, pas le cadre du widget');
    assert.match(await link.getAttribute('rel'), /noopener/);
    assert.match(await page.locator(`${DIALOG} .dlg-body`).innerText(), /connectez-vous à Grist[\s\S]*une fois connecté\(e\), vous revenez ici/);
    assert.deepEqual(await page.locator(`${DIALOG} .dlg-foot .btn`).allTextContents(), ['Continuer sans me connecter', 'Se connecter']);
    // L'annuaire, lui, n'a rien perdu : pas de bandeau « Ma présence », pas de bouton de modification, la place du bandeau est rendue.
    assert.equal(await page.locator('#accountBar').isHidden(), true);
    assert.equal(await page.locator('.card-edit:visible').count(), 0);
    assert.equal(await page.locator('.account-bar[data-pending]').evaluate(room => room.hidden), true);
    assert.equal(await page.locator('#loginLink').isVisible(), true, 'le bouton de l\'en-tête est là');
    assert.deepEqual(logs.pageErrors, []);
  }));

test('le numéro de la page de l\'annuaire, donné dans l\'adresse du widget (?page=7), est celui du retour', { skip }, () =>
  withWidget(anonymous({ search: 'page=7' }), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.btn-primary`).getAttribute('href'), LOGIN_TO_PAGE_7);
  }));

test('un numéro de page qui n\'en est pas un est ignoré : retour sur le document', { skip }, () =>
  withWidget(anonymous({ search: 'page=7/../x' }), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.btn-primary`).getAttribute('href'), LOGIN_TO_DOCUMENT);
  }));

test('le clic sur « Se connecter » change la page entière, dans le même onglet', { skip }, () =>
  withWidget(anonymous({ search: 'page=7' }), async ({ page, context }) => {
    await page.route('https://docs.getgrist.com/login**', route => route.fulfill({ contentType: 'text/html', body: '<title>Connexion Grist</title><p>page de connexion</p>' }));
    await page.locator(`${DIALOG}[open]`).waitFor();
    const opened = [];
    context.on('page', popup => opened.push(popup.url()));
    await Promise.all([page.waitForURL(LOGIN_TO_PAGE_7), page.locator(`${DIALOG} a.btn-primary`).click()]);
    assert.deepEqual(opened, [], 'aucun nouvel onglet');
    assert.equal(await page.title(), 'Connexion Grist');
  }));

test('la fenêtre ne s\'impose qu\'une fois : « Continuer sans me connecter » la ferme, le bouton de l\'en-tête la rouvre', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.getByRole('button', { name: 'Continuer sans me connecter' }).click();
    assert.equal(await isOpen(page), false);
    // Une édition dans Grist (l'annuaire est relu) ne la rouvre pas d'elle-même.
    await page.evaluate(() => window.__triggerRecords());
    await page.waitForTimeout(400);
    assert.equal(await isOpen(page), false, 'fermée, elle reste fermée');
    await page.locator('#loginLink').click();
    assert.equal(await isOpen(page), true);
    assert.equal(await page.locator(`${DIALOG} a.btn-primary`).getAttribute('href'), LOGIN_TO_DOCUMENT);
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), false, 'Échap la ferme');
    await until(() => page.locator('#loginLink').evaluate(link => document.activeElement === link), 'le focus revient au bouton de l\'en-tête');
  }));

test('la croix ferme la fenêtre, et l\'annuaire se lit derrière sans rien de caché', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.getByRole('button', { name: 'Fermer la fenêtre' }).click();
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('.contact-card').count(), 4);
    assert.equal(await page.locator('#resultCount').textContent(), '4 contacts');
  }));

test('si Grist refuse la ligne de la sonde (règle `user.IsLoggedIn`), la personne est prise pour un visiteur sans compte', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, denyWrites: ['Annuaire_Sonde'] }, async ({ page, logs }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.btn-primary`).getAttribute('href'), LOGIN_TO_DOCUMENT);
    assert.match(await page.locator(`${DIALOG} .login-note`).textContent(), /déjà connecté\(e\), prévenez un administrateur/);
    const warnings = await Promise.all(logs.warnings);
    assert.ok(warnings.some(line => /\[IDENTITE\] Grist refuse la ligne de Annuaire_Sonde/.test(line)), 'la console dit pourquoi');
  }));

test('un visiteur à qui les règles cachent la sonde et ferment la structure (le jeu complet de GRIST_SETUP.md) voit lui aussi la fenêtre', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANONYMOUS_EMAIL, denyWrites: ['Annuaire_Sonde'] }, async ({ page, logs }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.btn-primary`).getAttribute('href'), LOGIN_TO_DOCUMENT);
    const warnings = await Promise.all(logs.warnings);
    assert.ok(warnings.some(line => /\[IDENTITE\] table\s.\sAnnuaire_Sonde\s. introuvable/.test(line)), 'la console dit pourquoi');
    assert.equal(await page.locator('#accountBar').isHidden(), true);
  }));

test('une personne connectée n\'a ni fenêtre ni bouton « Se connecter »', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar:not([hidden])').waitFor();
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('#loginLink').isHidden(), true);
  }));

test('un compte Lecteur (cadre en lecture seule) n\'a pas non plus de fenêtre : Grist ne dit pas s\'il est connecté', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANONYMOUS_EMAIL, readOnly: true }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForTimeout(400);
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('#loginLink').isHidden(), true);
  }));

test('une identité introuvable pour une autre raison (sonde illisible) ne fait pas passer la personne pour un visiteur', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, failTables: ['Annuaire_Sonde'] }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForTimeout(400);
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('#loginLink').isHidden(), true);
  }));

test('si Grist ne donne pas l\'adresse de l\'API, la fenêtre explique la connexion sans lien et la console le dit', { skip }, () =>
  withWidget(anonymous({ accessToken: null }), async ({ page, logs }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a`).count(), 0, 'pas de lien');
    assert.match(await page.locator(`${DIALOG} .dlg-body`).innerText(), /ne trouve pas l'adresse de la page de connexion/);
    assert.deepEqual(await page.locator(`${DIALOG} .dlg-foot .btn`).allTextContents(), ['Fermer']);
    const warnings = await Promise.all(logs.warnings);
    assert.ok(warnings.some(line => /^\[CONNEXION\] adresse de connexion introuvable/.test(line)));
    await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
    assert.equal(await isOpen(page), false);
  }));

test('le bouton de l\'en-tête ne s\'imprime pas', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.getByRole('button', { name: 'Continuer sans me connecter' }).click();
    assert.equal(await page.locator('#loginLink').isVisible(), true, 'à l\'écran');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#loginLink').isVisible(), false, 'sur le papier');
  }));

test('un index.html ancien, sans la fenêtre (cache de GitHub Pages : dix minutes), ne gêne pas le code neuf', { skip }, () =>
  withWidget(anonymous({
    // La page est lue avant le module : l'observateur retire la fenêtre et le bouton dès que l'analyseur les pose.
    initScript: () => new MutationObserver(() => {
      document.getElementById('loginDialog')?.remove();
      document.getElementById('loginLink')?.remove();
    }).observe(document, { childList: true, subtree: true })
  }), async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(DIALOG).count(), 0);
    assert.deepEqual(logs.pageErrors, [], 'l\'annuaire se lit comme avant');
  }));

test('LOGIN_AUTO_OPEN faux : la fenêtre n\'est proposée que par le bouton de l\'en-tête', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.route('**/constants.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('export const LOGIN_AUTO_OPEN = true;', 'export const LOGIN_AUTO_OPEN = false;') });
    });
    await page.reload();
    await waitForCards(page, 4);
    await page.locator('#loginLink:not([hidden])').waitFor();
    assert.equal(await isOpen(page), false, 'rien ne s\'impose');
    await page.locator('#loginLink').click();
    assert.equal(await isOpen(page), true);
  }));
