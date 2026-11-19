// Qui lit quoi dans la fenêtre « Documentation » (1.45.3) : un administrateur lit tous les documents (tests/docs-viewer.test.mjs) ; toute
// autre personne (un membre, un responsable d'établissement, un visiteur sans compte, une identité qu'on n'a pas pu lire) ne voit que le
// guide utilisateur : pas de barre de documents, pas de lien vers un autre document, aucune requête pour un autre fichier, et nulle part
// « Ouvrir sur GitHub ». C'est un choix d'affichage, pas une protection : les fichiers restent publiés (docs/securite.md).
// Optionnel (voir TESTING.md) : sans Playwright, ces tests sont ignorés.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { ANONYMOUS_EMAIL } from '../constants.js';
import { ADMIN_EMAIL, BOB_EMAIL, withIdentity, withSchema, withValidation } from './fixtures.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';

const DIALOG = '#docDialog';
const GUIDE = 'Guide utilisateur';

// Un annuaire fermé (1.45.0 : seuls les membres le voient) : les personnes qui n'y sont pas lisent l'écran réservé, pas les cartes.
const closedDirectory = () => withValidation(withSchema(withIdentity()));
const gateShown = page => page.locator('#gatePanel:not([hidden])').waitFor();

// Les trois cas où la personne n'est pas administratrice pour le widget : un membre identifié (Bob, responsable de l'UBM), un visiteur sans
// compte (l'écran réservé et la fenêtre de connexion, qu'on referme pour atteindre le bouton), et un document ouvert en lecture seule
// (identity.js : l'identité n'est pas lue, le widget ne suppose rien, même avec l'adresse d'un administrateur).
const nonAdmins = [
  ['un membre qui n\'administre pas', () => ({ tables: withIdentity(), user: BOB_EMAIL }), page => waitForCards(page, 4)],
  ['un visiteur sans compte', () => ({ tables: closedDirectory(), user: ANONYMOUS_EMAIL }), async page => {
    await gateShown(page);
    await page.locator('#acces[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#acces[open]').waitFor({ state: 'detached' }).catch(() => {});
  }],
  ['un document ouvert en lecture seule (identité non lue, même avec l\'adresse d\'un administrateur)', () => ({ tables: closedDirectory(), user: ADMIN_EMAIL, readOnly: true }), gateShown]
];

// Les adresses des fichiers que la page demande pendant que la fenêtre s'ouvre et que l'on parcourt le guide.
const trackRequests = page => {
  const seen = [];
  page.on('request', request => seen.push(new URL(request.url()).pathname));
  return seen;
};

for (const [who, options, ready] of nonAdmins) {
  test(`${who} : la fenêtre ne montre que le guide utilisateur, sans barre de documents ni lien vers GitHub`, { skip }, () =>
    withWidget(options(), async ({ page, context }) => {
      await ready(page);
      const seen = trackRequests(page);
      const popups = [];
      context.on('page', popup => popups.push(popup));
      await page.locator('#docLink').click();
      await page.locator(`${DIALOG} .md`).waitFor();
      assert.equal(await page.locator(`${DIALOG} .dlg-sub`).textContent(), GUIDE, 'la fenêtre s\'ouvre sur le guide, pas sur la présentation');
      assert.match(await page.locator(`${DIALOG} .md-h1`).first().textContent(), /^Guide utilisateur/)
      assert.equal(await page.locator(`${DIALOG} .doc-nav`).isVisible(), false, 'un seul document : pas de barre');
      assert.equal(await page.locator(`${DIALOG} .doc-tab`).count(), 1);
      assert.equal(await page.locator(`${DIALOG} .doc-status`).textContent(), `${GUIDE} affiché`);
      assert.equal(await page.locator(`${DIALOG} .dlg-foot a`).count(), 0, 'aucun lien vers GitHub');
      assert.deepEqual(await page.locator(`${DIALOG} .dlg-foot button`).allTextContents(), ['← Retour', 'Fermer']);
      assert.equal(await page.locator(`${DIALOG} .notice-ko`).count(), 0);
      // Dans le guide, un lien vers un autre document n'est pas un lien : seuls ceux qui restent dans le guide ouvrent quelque chose.
      const docLinks = await page.locator(`${DIALOG} a.md-doc-link[data-doc]`).evaluateAll(links => links.map(link => link.dataset.doc));
      assert.deepEqual([...new Set(docLinks)], [], 'aucun lien du guide ne mène à un autre document');
      assert.equal(await page.locator(`${DIALOG} a`).evaluateAll(links => links.filter(link => link.getAttribute('href') !== '#' && !/^https:\/\//.test(link.getAttribute('href'))).length), 0);
      // Au clavier et à la souris, rien d'autre ne s'ouvre ; et la page n'a demandé que le guide (et ses images).
      const documents = seen.filter(file => file.endsWith('.md'));
      assert.deepEqual([...new Set(documents)], ['/docs/utilisateurs.md'], 'un seul document demandé : le guide');
      assert.equal(popups.length, 0);
    }));
}

test('un non-administrateur dont le guide ne se charge pas : le message ne parle pas de GitHub et n\'en propose rien', { skip }, () =>
  withWidget({ tables: withIdentity(), user: BOB_EMAIL }, async ({ page, context }) => {
    await context.route('**/docs/utilisateurs.md', route => route.fulfill({ status: 404, body: 'Not found' }));
    await waitForCards(page, 4);
    await page.locator('#docLink').click();
    const failure = page.locator(`${DIALOG} .doc-fail`);
    await failure.waitFor();
    assert.match(await failure.locator('.notice-ko').textContent(), /pas disponible dans cette fenêtre\.$/);
    assert.doesNotMatch(await failure.textContent(), /GitHub/);
    assert.equal(await failure.locator('a').count(), 0);
    assert.equal(await page.locator(`${DIALOG} a`).count(), 0, 'aucun lien dans la fenêtre');
  }));
