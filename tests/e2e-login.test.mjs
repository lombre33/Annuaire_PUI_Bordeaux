// La fenêtre de connexion d'un visiteur sans compte (1.44.0 : login.js, login-ui.js, identity.js ; refaite à l'identique de celle de l'agenda
// partagé en 1.45.1 : tests/login-window.test.mjs en garde le dessin) dans Chromium (optionnel : voir TESTING.md), sur une API Grist simulée. Depuis la 1.45.0 l'annuaire n'est plus public : un visiteur sans compte lit l'écran
// « Annuaire réservé » (gate.js) et aucune carte ; seule une personne que Grist dit sans compte (l'adresse anonyme de tous les visiteurs
// d'un lien public, ou la ligne de la sonde refusée par une règle d'accès) voit la fenêtre, une fois, et le bouton « Se connecter » de
// l'en-tête. Le lien de la fenêtre mène à la page de connexion
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

const DIALOG = '#acces';
const isOpen = page => page.locator(DIALOG).evaluate(dialog => dialog.open);
const anonymous = (options = {}) => ({ tables: withIdentity(), user: ANONYMOUS_EMAIL, ...options });
// L'écran « Annuaire réservé » du visiteur sans compte : l'annuaire lui-même n'est pas dessiné.
const waitForClosedDirectory = page => page.locator('#gatePanel[data-kind="anonymous"]').waitFor();

test('un visiteur sans compte lit « Annuaire réservé », puis la fenêtre de l\'agenda partagé : trois étapes, qui mène à la connexion de Grist, retour sur le document en singlePage', { skip }, () =>
  withWidget(anonymous(), async ({ page, logs }) => {
    await waitForClosedDirectory(page);
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator('#acces-titre').textContent(), 'Connectez-vous pour accéder à l’annuaire');
    assert.equal(await page.locator(`${DIALOG} .acces__sur`).textContent(), 'Annuaire réservé aux membres');
    assert.equal(await page.locator(`${DIALOG}`).getAttribute('aria-labelledby'), 'acces-titre');
    assert.match(await page.locator(`${DIALOG} .acces__intro`).textContent(), /c’est le même compte que Resana, via ProConnect/);
    // Trois étapes numérotées, chacune avec son dessin étiqueté.
    assert.deepEqual(await page.locator(`${DIALOG} .acces__etapes h3`).allTextContents(),
      ['Cliquez sur « Se connecter »', 'Choisissez ProConnect', 'Revenez ici et retrouvez votre fiche']);
    assert.deepEqual(await page.locator(`${DIALOG} .acces__num`).allTextContents(), ['1', '2', '3']);
    assert.equal(await page.locator(`${DIALOG} .acces__etapes figure svg[role="img"][aria-label]`).count(), 3);
    assert.equal(await page.locator(`${DIALOG} .acces__texte p`).first().textContent(), 'Le bouton est en bas de cette fenêtre.');
    const link = page.locator(`${DIALOG} a.acces__bouton`);
    assert.equal(await link.textContent(), 'Se connecter');
    assert.equal(await link.getAttribute('href'), LOGIN_TO_DOCUMENT);
    assert.equal(await link.getAttribute('target'), '_top', 'la page entière de Grist change, pas le cadre du widget');
    assert.match(await link.getAttribute('rel'), /noopener/);
    assert.deepEqual(await page.locator(`${DIALOG} .acces__actions > *`).allTextContents(), ['Continuer sans me connecter', 'Se connecter']);
    assert.match(await page.locator(`${DIALOG} .acces__note`).textContent(), /domaine est celui d’un établissement du PUI/);
    // L'annuaire est fermé (1.45.0) : aucune carte, pas de bandeau « Ma présence », pas de bouton de modification, la place du bandeau est rendue.
    assert.equal(await page.locator('.contact-card').count(), 0);
    assert.equal(await page.locator('#resultCount').textContent(), 'Connexion requise');
    assert.equal(await page.locator('#accountBar').isHidden(), true);
    assert.equal(await page.locator('.card-edit:visible').count(), 0);
    assert.equal(await page.locator('.account-bar[data-pending]').evaluate(room => room.hidden), true);
    // Le bouton de l'en-tête est, comme dans l'agenda, un lien direct vers la connexion de Grist.
    const header = page.locator('#loginLink');
    assert.equal(await header.isVisible(), true, 'le lien de l\'en-tête est là');
    assert.equal(await header.getAttribute('href'), LOGIN_TO_DOCUMENT);
    assert.equal(await header.getAttribute('target'), '_top');
    assert.equal(await page.locator('#loginOpen').isHidden(), true, 'le repli sans adresse n\'est pas proposé');
    assert.deepEqual(logs.pageErrors, []);
  }));

test('le numéro de la page de l\'annuaire, donné dans l\'adresse du widget (?page=7), est celui du retour', { skip }, () =>
  withWidget(anonymous({ search: 'page=7' }), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.acces__bouton`).getAttribute('href'), LOGIN_TO_PAGE_7);
  }));

test('un numéro de page qui n\'en est pas un est ignoré : retour sur le document', { skip }, () =>
  withWidget(anonymous({ search: 'page=7/../x' }), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.acces__bouton`).getAttribute('href'), LOGIN_TO_DOCUMENT);
  }));

test('le clic sur « Se connecter » change la page entière, dans le même onglet', { skip }, () =>
  withWidget(anonymous({ search: 'page=7' }), async ({ page, context }) => {
    await page.route('https://docs.getgrist.com/login**', route => route.fulfill({ contentType: 'text/html', body: '<title>Connexion Grist</title><p>page de connexion</p>' }));
    await page.locator(`${DIALOG}[open]`).waitFor();
    const opened = [];
    context.on('page', popup => opened.push(popup.url()));
    await Promise.all([page.waitForURL(LOGIN_TO_PAGE_7), page.locator(`${DIALOG} a.acces__bouton`).click()]);
    assert.deepEqual(opened, [], 'aucun nouvel onglet');
    assert.equal(await page.title(), 'Connexion Grist');
  }));

test('la fenêtre ne s\'impose qu\'une fois : « Continuer sans me connecter », Échap ou un clic à côté la ferment, et rien ne la rouvre', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.getByRole('button', { name: 'Continuer sans me connecter' }).click();
    assert.equal(await isOpen(page), false);
    // Une édition dans Grist (l'annuaire est relu) ne la rouvre pas d'elle-même.
    await page.evaluate(() => window.__triggerRecords());
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#loginOpen').isHidden(), true, 'avec une adresse de connexion, le lien de l\'en-tête mène à la connexion : il n\'y a rien à rouvrir');
    assert.equal(await isOpen(page), false, 'fermée, elle reste fermée');
    assert.equal(await page.locator('#gatePanel h2').textContent(), 'Annuaire réservé', 'l\'écran réservé se lit derrière');
    assert.equal(await page.locator('#resultCount').textContent(), 'Connexion requise');
  }));

test('Échap ferme la fenêtre, un clic à côté de la carte aussi ; un clic dans la carte ne la ferme pas', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.locator(`${DIALOG} .acces__intro`).click();
    assert.equal(await isOpen(page), true, 'un clic dans la carte ne la ferme pas');
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), false, 'Échap la ferme');
  }));

test('un clic sur le fond autour de la carte ferme la fenêtre', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.mouse.click(4, 4);
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('.contact-card').count(), 0, 'le visiteur n\'a aucune carte');
  }));

test('le lien de l\'en-tête mène à la connexion dans le même onglet, sans passer par la fenêtre', { skip }, () =>
  withWidget(anonymous({ search: 'page=7' }), async ({ page, context }) => {
    await page.route('https://docs.getgrist.com/login**', route => route.fulfill({ contentType: 'text/html', body: '<title>Connexion Grist</title><p>page de connexion</p>' }));
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.keyboard.press('Escape');
    const opened = [];
    context.on('page', popup => opened.push(popup.url()));
    await Promise.all([page.waitForURL(LOGIN_TO_PAGE_7), page.locator('#loginLink').click()]);
    assert.deepEqual(opened, [], 'aucun nouvel onglet');
  }));

test('si Grist refuse la ligne de la sonde (règle `user.IsLoggedIn`), la personne est prise pour un visiteur sans compte', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, denyWrites: ['Annuaire_Sonde'] }, async ({ page, logs }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.acces__bouton`).getAttribute('href'), LOGIN_TO_DOCUMENT);
    assert.match(await page.locator(`${DIALOG} .acces__note`).textContent(), /Votre adresse professionnelle doit figurer dans l’annuaire/);
    const warnings = await Promise.all(logs.warnings);
    assert.ok(warnings.some(line => /\[IDENTITE\] Grist refuse la ligne de Annuaire_Sonde/.test(line)), 'la console dit pourquoi');
  }));

test('un visiteur à qui les règles cachent la sonde et ferment la structure (le jeu complet de GRIST_SETUP.md) voit lui aussi la fenêtre', { skip }, () =>
  withWidget({ tables: sampleTables(), user: ANONYMOUS_EMAIL, denyWrites: ['Annuaire_Sonde'] }, async ({ page, logs }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a.acces__bouton`).getAttribute('href'), LOGIN_TO_DOCUMENT);
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
    await page.locator('#gatePanel[data-kind="readonly"]').waitFor(); // 1.45.2 : fermé, mais sans fenêtre de connexion
    await page.waitForTimeout(400);
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('#loginLink').isHidden(), true);
  }));

test('une identité introuvable pour une autre raison (sonde illisible) ne fait pas passer la personne pour un visiteur', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, failTables: ['Annuaire_Sonde'] }, async ({ page }) => {
    await page.locator('#gatePanel[data-kind="unidentified"]').waitFor(); // 1.45.2 : fermé (« Compte non reconnu »), mais sans fenêtre de connexion
    await page.waitForTimeout(400);
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('#loginLink').isHidden(), true);
  }));

test('si Grist ne donne pas l\'adresse de l\'API, la fenêtre explique la connexion sans lien (le bouton est en haut à droite de la page), la console le dit, et l\'en-tête la rouvre', { skip }, () =>
  withWidget(anonymous({ accessToken: null }), async ({ page, logs }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    assert.equal(await page.locator(`${DIALOG} a`).count(), 0, 'pas de lien');
    assert.equal(await page.locator(`${DIALOG} .acces__texte p`).first().textContent(), 'Le bouton se trouve en haut à droite de cette page.');
    assert.deepEqual(await page.locator(`${DIALOG} .acces__actions > *`).allTextContents(), ['J’ai compris']);
    const warnings = await Promise.all(logs.warnings);
    assert.ok(warnings.some(line => /^\[CONNEXION\] adresse de connexion introuvable/.test(line)));
    await page.getByRole('button', { name: 'J’ai compris' }).click();
    assert.equal(await isOpen(page), false);
    assert.equal(await page.locator('#loginLink').isHidden(), true, 'sans adresse, pas de lien');
    await page.locator('#loginOpen').click();
    assert.equal(await isOpen(page), true, 'le repli rouvre la fenêtre');
    await page.keyboard.press('Escape');
    await until(() => page.locator('#loginOpen').evaluate(button => document.activeElement === button), 'le focus revient au bouton de l\'en-tête');
  }));

test('le lien de l\'en-tête ne s\'imprime pas, et la fenêtre non plus', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await waitForClosedDirectory(page);
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.getByRole('button', { name: 'Continuer sans me connecter' }).click();
    assert.equal(await page.locator('#loginLink').isVisible(), true, 'à l\'écran');
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#loginLink').isVisible(), false, 'sur le papier');
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.getElementById('acces').showModal());
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator(DIALOG).isVisible(), false, 'une fenêtre ouverte ne se met pas sur le papier');
  }));

test('un index.html ancien, sans la fenêtre (cache de GitHub Pages : dix minutes), ne gêne pas le code neuf', { skip }, () =>
  withWidget(anonymous({
    // La page est lue avant le module : l'observateur retire la fenêtre et le lien dès que l'analyseur les pose.
    initScript: () => new MutationObserver(() => {
      document.getElementById('acces')?.remove();
      document.getElementById('loginLink')?.remove();
      document.getElementById('loginOpen')?.remove();
    }).observe(document, { childList: true, subtree: true })
  }), async ({ page, logs }) => {
    await waitForClosedDirectory(page);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(DIALOG).count(), 0);
    assert.deepEqual(logs.pageErrors, [], 'l\'écran réservé se lit comme sans la fenêtre');
  }));

test('LOGIN_AUTO_OPEN faux : la fenêtre ne s\'ouvre jamais seule, le lien de l\'en-tête mène à la connexion', { skip }, () =>
  withWidget(anonymous(), async ({ page }) => {
    await page.locator(`${DIALOG}[open]`).waitFor();
    await page.route('**/constants.js', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('export const LOGIN_AUTO_OPEN = true;', 'export const LOGIN_AUTO_OPEN = false;') });
    });
    await page.reload();
    await waitForClosedDirectory(page);
    await page.locator('#loginLink:not([hidden])').waitFor();
    assert.equal(await isOpen(page), false, 'rien ne s\'impose');
    assert.equal(await page.locator('#loginLink').getAttribute('href'), LOGIN_TO_DOCUMENT);
  }));
