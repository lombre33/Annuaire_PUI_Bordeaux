// Test navigateur de l'envoi d'un fichier à Grist depuis la page du widget, qui est d'une AUTRE origine que
// Grist (GitHub Pages d'un côté, grist.numerique.gouv.fr de l'autre). Contre un vrai serveur HTTP
// (tests/support/grist-rest-server.mjs), c'est Chromium qui applique CORS : ce que les autres tests, où un faux
// répond sans réseau, ne peuvent pas montrer. Il rejoue la panne signalée par Antoine le 13 octobre 2026 en
// envoyant une photo depuis l'ordinateur (« L'envoi du fichier à Grist a échoué : le navigateur n'a pas pu
// joindre le serveur, ou l'a refusé ») : sans l'en-tête `X-Requested-With`, Grist répond 401 sans en-têtes CORS
// et le navigateur ne montre au widget qu'une panne de réseau.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skip, withWidget } from './support/browser.mjs';
import { FIRST_ID, startGristRest } from './support/grist-rest-server.mjs';

async function withGrist(run) {
  const grist = await startGristRest();
  try {
    await run(grist);
  } finally {
    await grist.close();
  }
}

// Le vrai upload.js, dans la page du widget : il demande le jeton en écriture au faux docApi, qui répond avec
// l'adresse du serveur de ce test, puis envoie le fichier par `fetch`.
const uploadFromPage = page => page.evaluate(async () => {
  const { uploadAttachment } = await import('/upload.js');
  try {
    return { id: await uploadAttachment(window.grist.docApi, { blob: new Blob(['photo'], { type: 'image/jpeg' }), name: 'photo.jpg' }) };
  } catch (error) {
    return { error: error.name, message: error.message };
  }
});

test('l\'envoi d\'une photo à un Grist d\'une autre origine aboutit : l\'en-tête que Grist exige part, sans cookie ni adresse de page, et la réponse est lue', { skip }, () =>
  withGrist(grist => withWidget({ accessToken: grist.accessToken }, async ({ page }) => {
    const outcome = await uploadFromPage(page);
    assert.deepEqual(outcome, { id: FIRST_ID }, 'l\'identifiant de la pièce jointe revient au widget');

    const posts = grist.requests.filter(request => request.method === 'POST');
    assert.equal(posts.length, 1, 'un seul envoi');
    const [post] = posts;
    assert.equal(post.path, '/api/docs/fake-doc/attachments');
    assert.equal(post.token, grist.token);
    assert.equal(post.requestedWith, 'XMLHttpRequest', 'l\'en-tête que Grist exige d\'un jeton d\'accès');
    assert.equal(post.status, 200);
    assert.deepEqual(post.file, { field: 'upload', fileName: 'photo.jpg', contentType: 'image/jpeg', size: 'photo'.length });
    assert.notEqual(post.origin, grist.origin, 'la page n\'est pas de l\'origine de Grist : CORS s\'applique');
    assert.equal(post.origin, new URL(page.url()).origin);
    assert.equal(post.cookie, null);
    assert.equal(post.referer, null);
  })));

test('sans cet en-tête, la même requête échoue comme chez Antoine : Grist répond 401 sans en-têtes CORS et le navigateur ne montre qu\'une panne de réseau', { skip }, () =>
  withGrist(grist => withWidget({ accessToken: grist.accessToken }, async ({ page }) => {
    // La requête d'avant la 1.21.5, telle quelle.
    const outcome = await page.evaluate(async ({ baseUrl, token }) => {
      const form = new FormData();
      form.append('upload', new Blob(['photo'], { type: 'image/jpeg' }), 'photo.jpg');
      try {
        const response = await fetch(`${baseUrl}/attachments?auth=${encodeURIComponent(token)}`, {
          method: 'POST', body: form, credentials: 'omit', referrerPolicy: 'no-referrer'
        });
        return { status: response.status };
      } catch (error) {
        return { error: error.name };
      }
    }, grist.accessToken);
    assert.deepEqual(outcome, { error: 'TypeError' }, 'le navigateur ne rend pas le 401 : fetch échoue');
    const [post] = grist.requests;
    assert.equal(post.method, 'POST', 'pas de vérification préalable : une requête simple');
    assert.equal(post.requestedWith, null);
    assert.equal(post.status, 401, 'Grist a bien répondu, mais sans que le navigateur la montre');
    assert.equal(post.file, null, 'et n\'a rien enregistré');
  })));
