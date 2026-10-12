// Test navigateur de la photo de profil : charge le vrai index.html dans Chromium, avec le faux document
// Grist de tests/support/fake-grist.js et ses pièces jointes (tests/support/fake-attachments.mjs : les
// portraits à télécharger, et le serveur qui reçoit les envois), et vérifie ce que voit et obtient la
// personne : la photo qui remplace les initiales (cartes, bandeau « Ma présence », fenêtres), la fenêtre
// qui l'agrandit, le choix d'une photo (redessinée en JPEG carré de 256 px, sans métadonnées), la
// relecture avant / après, l'envoi puis l'écriture, les refus, les conflits et l'accessibilité.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withAvatars, withBranding, withIdentity, withSchema, ANA_EMAIL, IRIS_EMAIL, HOSTILE_FIRST_NAME } from './fixtures.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';
import { FIRST_UPLOAD_ID, MISSING_FILE } from './support/fake-attachments.mjs';

// ===== Outils =====

// Ana (photo 501) est administratrice dans ACL ; ici elle n'administre pas, sauf avec `admin`. Hostile
// a pour photo un fichier qui n'est pas une image (998), Hugo une cellule vide et les autres une liste vide.
function world({ admin = false, schema = true, edit = () => {} } = {}) {
  const tables = withIdentity(withAvatars());
  if (!admin) tables.ACL.admin[0] = false;
  const full = schema ? withSchema(tables) : tables;
  edit(full);
  return full;
}

const HOSTILE = `${HOSTILE_FIRST_NAME} Hostile`;
const gridCard = (page, name) => page.locator('#cardsGrid .contact-card').filter({ has: page.locator('.name', { hasText: name }) });
const avatarOf = (page, name) => gridCard(page, name).locator('.avatar');
const dialog = page => page.locator('#profileDialog');
const viewer = page => page.locator('#photoDialog');
const press = (page, name) => dialog(page).getByRole('button', { name, exact: true });
const heading = page => page.locator('#profileTitle');
const headingIs = (page, expected) => page.waitForFunction(value => document.getElementById('profileTitle').textContent === value, expected);
const closed = page => page.waitForFunction(() => !document.getElementById('profileDialog').open);
const viewerClosed = page => page.waitForFunction(() => !document.getElementById('photoDialog').open);
const summary = page => dialog(page).locator('.dlg-summary').textContent();
const notices = page => dialog(page).locator('.notice');
const alertText = page => dialog(page).locator('.dlg-alert [role="alert"]').textContent();
const toast = page => page.locator('#toast');
const column = (page, tone) => dialog(page).locator(`.rv-col-${tone}`);
const photoField = page => dialog(page).locator('.photo-field');
const photoError = page => dialog(page).locator('#profilePhotoError');
const activeIs = (page, selector) => page.waitForFunction(wanted => document.activeElement?.matches(wanted), selector, { timeout: 3000 });
const bddCalls = page => page.evaluate(() => window.__fake.calls.filter(call => call.table === 'BDD'));
const bddCell = (page, columnName, index = 0) => page.evaluate(([name, at]) => window.__tables.BDD[name][at], [columnName, index]);
const tokenRequests = page => page.evaluate(() => window.__fake.tokenRequests);
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

// Une avatar montre sa photo : la classe qui cache les initiales, et une image chargée (pas un cadre vide).
const showsPhoto = locator => locator.evaluate(node => node.classList.contains('has-photo') && node.querySelector('img')?.naturalWidth > 0);
const photoSrc = locator => locator.locator('img').first().getAttribute('src');
const waitForPhoto = async (locator, message = 'la photo se charge') => until(() => showsPhoto(locator).catch(() => false), message);
// Un avatar de la grille avec le numéro de sa pièce jointe : « …/attachments/501/download?auth=… ».
const isAttachment = (src, id) => new RegExp(`/attachments/${id}/download\\?auth=`).test(src ?? '');

async function openOwn(page, cards = 4) {
  await waitForCards(page, cards);
  const button = page.locator('#accountBar .account-edit');
  await button.waitFor();
  await button.click();
  await dialog(page).waitFor();
  await photoField(page).waitFor();
}

async function review(page) {
  await press(page, 'Relire mes modifications').click();
  await headingIs(page, 'Relire avant de valider');
}

// Allume le mode admin et ouvre la fiche d'une autre personne.
async function openOfOther(page, name) {
  await waitForCards(page, 4);
  await page.locator('#accountBar .account-admin').waitFor();
  await page.locator('#accountBar .account-admin').click();
  await waitForEditButtons(page, 4);
  await gridCard(page, name).locator('.card-edit').click();
  await dialog(page).waitFor();
  await photoField(page).waitFor();
}

// ----- Les images -----

// Trois bandes verticales (rouge, vert, bleu), dessinées par le navigateur, sous forme d'octets.
async function bands(page, { width = 600, height = 400, type = 'image/png' } = {}) {
  const base64 = await page.evaluate(([w, h, mime]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    ['#ff0000', '#00ff00', '#0000ff'].forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(Math.floor((w * index) / 3), 0, Math.ceil(w / 3), h);
    });
    return canvas.toDataURL(mime, 0.95).split(',')[1];
  }, [width, height, type]);
  return Buffer.from(base64, 'base64');
}

const chooseFile = (page, file) => page.locator('#profilePhotoFile').setInputFiles(file);
const photoFile = async (page, options = {}) => ({
  name: 'ma-photo-privee.png', mimeType: options.type ?? 'image/png', buffer: await bands(page, options)
});

// Le côté d'un JPEG, lu dans son premier marqueur « début de trame ».
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  return null;
}

// La couleur dominante (rouge, vert ou bleu) de l'image aux points donnés : on la redessine dans une
// page vierge, à part de celle du widget.
async function colorsAt(page, bytes, points, type = 'image/jpeg') {
  const scratch = await page.context().newPage();
  try {
    const found = await scratch.evaluate(async ([base64, spots, mime]) => {
      const image = new Image();
      image.src = `data:${mime};base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return spots.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3)));
    }, [bytes.toString('base64'), points, type]);
    return found.map(([r, g, b]) => (r > 180 && g < 90 && b < 90 ? 'rouge' : g > 180 && r < 90 && b < 90 ? 'vert' : b > 180 && r < 90 && g < 90 ? 'bleu' : `${r},${g},${b}`));
  } finally {
    await scratch.close();
  }
}

// Insère après le début d'un JPEG un segment « Exif » : l'orientation demandée et une fausse position GPS.
function withExif(jpeg, orientation) {
  const tiff = Buffer.concat([
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]), // gros-boutiste, premier répertoire à l'octet 8
    Buffer.from([0x00, 0x01]),
    Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00]), // tag 0x0112 : orientation
    Buffer.from([0x00, 0x00, 0x00, 0x00])
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, Buffer.from('GPS 44.8378N 0.5792W', 'latin1')]);
  const size = payload.length + 2;
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, size >> 8, size & 0xff]), payload, jpeg.subarray(2)]);
}

// ===== La photo sur les cartes =====

test('la photo de Grist remplace les initiales sur la carte ; sans photo, avec un fichier illisible ou une cellule vide, ce sont les initiales', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs, files }) => {
    await waitForCards(page, 4);
    const ana = avatarOf(page, 'Ana Martin');
    await waitForPhoto(ana);
    assert.equal(await ana.evaluate(node => node.tagName), 'BUTTON', 'une photo s\'agrandit : c\'est un bouton');
    assert.equal(await ana.getAttribute('aria-label'), 'Agrandir la photo de Ana Martin');
    assert.equal(await ana.getAttribute('title'), 'Agrandir la photo');
    assert.equal(await ana.getAttribute('type'), 'button');
    assert.ok(isAttachment(await photoSrc(ana), 501));
    assert.equal(await ana.locator('img').getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await ana.locator('img').getAttribute('alt'), '', 'décorative : le bouton porte le nom');
    assert.equal(await ana.evaluate(node => getComputedStyle(node).color), 'rgba(0, 0, 0, 0)', 'les initiales sont cachées derrière la photo');
    const box = await ana.boundingBox();
    const image = await ana.locator('img').boundingBox();
    assert.ok(Math.abs(image.width - box.width) < 1 && Math.abs(image.height - box.height) < 1, 'la photo remplit le rond');
    assert.ok(Math.abs(box.width - box.height) < 0.5, 'le rond reste rond');

    // Hostile : le fichier n'est pas une image. Hugo : cellule vide. Gina : liste vide.
    await until(async () => (await avatarOf(page, HOSTILE).evaluate(node => node.tagName)) === 'DIV', 'un fichier illisible redonne les initiales');
    for (const [name, letters] of [[HOSTILE, '<H'], ['Hugo Bernard', 'HB'], ['Gina', 'GB']]) {
      const avatar = avatarOf(page, name);
      assert.equal(await avatar.evaluate(node => node.tagName), 'DIV', name);
      assert.equal(await avatar.textContent(), letters, name);
      assert.equal(await avatar.getAttribute('aria-hidden'), 'true', `${name} : un rond d'initiales n'est pas annoncé`);
      assert.equal(await avatar.locator('img').count(), 0, name);
      assert.equal(await avatar.evaluate(node => node.classList.contains('has-photo')), false, name);
    }
    assert.deepEqual(Object.keys(files.hits).sort(), ['501', '998'], 'seuls les fichiers de photos affichées sont demandés');
    assert.ok(files.hits[998] <= 2, 'un fichier illisible n\'est pas redemandé sans fin');
    assert.deepEqual(await tokenRequests(page), [{ readOnly: true }], 'les photos se lisent avec un jeton en lecture seule');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('une photo supprimée de Grist (404) ou qui n\'est pas une image ne laisse ni cadre cassé ni bouton', { skip }, () =>
  withWidget({ tables: world({ edit: tables => { tables.BDD.Avatar[0] = ['L', MISSING_FILE]; } }), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await until(async () => (await avatarOf(page, 'Ana Martin').evaluate(node => node.tagName)) === 'DIV', 'les initiales reviennent');
    const ana = avatarOf(page, 'Ana Martin');
    assert.equal(await ana.textContent(), 'AM');
    assert.equal(await ana.locator('img').count(), 0, 'plus d\'image cassée');
    assert.equal(await gridCard(page, 'Ana Martin').locator('button.avatar-zoom').count(), 0);
  }));

test('un document sans colonne Avatar s\'affiche comme avant, avec les initiales et sans erreur', { skip }, () =>
  withWidget({ tables: withIdentity(sampleTables()), user: ANA_EMAIL }, async ({ page, logs, files }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#cardsGrid .avatar').count(), 4);
    assert.equal(await page.locator('#cardsGrid button.avatar').count(), 0);
    assert.deepEqual((await page.locator('#cardsGrid .avatar').allTextContents()).sort(), ['<H', 'AM', 'GB', 'HB']);
    assert.deepEqual(files.hits, {}, 'aucune pièce jointe demandée');
    await page.locator('#accountBar .account-edit').waitFor();
    await page.locator('#accountBar .account-edit').click();
    await dialog(page).waitFor();
    assert.equal(await dialog(page).locator('.photo-field').count(), 0, 'pas de colonne : le formulaire n\'offre pas de photo');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le bandeau « Ma présence » montre la photo de la personne connectée, ou ses initiales', { skip }, async () => {
  await withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const avatar = page.locator('#accountBar .account-avatar');
    await avatar.waitFor();
    await waitForPhoto(avatar, 'la photo du bandeau se charge');
    assert.ok(isAttachment(await photoSrc(avatar), 501));
    assert.equal(await avatar.evaluate(node => node.tagName), 'DIV', 'rien à agrandir dans le bandeau');
  });
  // Iris n'apparaît pas dans l'annuaire mais a une fiche, sans photo.
  await withWidget({ tables: world(), user: IRIS_EMAIL }, async ({ page, files }) => {
    await waitForCards(page, 4);
    const avatar = page.locator('#accountBar .account-avatar');
    await avatar.waitFor();
    assert.equal(await avatar.textContent(), 'IR');
    assert.equal(await avatar.locator('img').count(), 0);
    assert.deepEqual(Object.keys(files.hits).sort(), ['501', '998'], 'les seules photos demandées sont celles des cartes : le bandeau d\'Iris n\'en demande aucune');
  });
});

// ===== La fenêtre qui agrandit la photo =====

test('un clic sur la photo d\'une carte l\'agrandit avec le nom, la fonction et l\'établissement ; chaque geste la referme', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const ana = avatarOf(page, 'Ana Martin');
    await waitForPhoto(ana);
    const count = await page.locator('#resultCount').textContent();
    assert.equal(await viewer(page).evaluate(node => node.open), false, 'fermée tant qu\'on ne la demande pas');

    await ana.click();
    await viewer(page).locator('img.photo-img.loaded').waitFor();
    assert.equal(await viewer(page).evaluate(node => node.matches(':modal')), true);
    assert.equal(await viewer(page).getAttribute('aria-labelledby'), 'photoCaption');
    assert.ok(isAttachment(await viewer(page).locator('img').getAttribute('src'), 501));
    assert.equal(await viewer(page).locator('img').getAttribute('alt'), 'Photo de Ana Martin');
    assert.equal(await viewer(page).locator('#photoCaption').evaluate(node => node.firstChild.textContent), 'Ana Martin');
    assert.equal(await viewer(page).locator('#photoCaption small').textContent(), 'Pharmacienne · CHU de Bordeaux');
    assert.equal(await page.evaluate(() => document.getElementById('photoDialog').contains(document.activeElement)), true, 'le focus entre dans la fenêtre');
    assert.equal(await page.locator('#resultCount').textContent(), count, 'agrandir une photo ne filtre rien');
    const box = await viewer(page).locator('img').boundingBox();
    assert.ok(Math.abs(box.width - box.height) < 1 && box.width > 200, `la photo est carrée et grande (${Math.round(box.width)} px)`);

    // Échap, la croix, un clic sur la photo et un clic à côté ferment la fenêtre et rendent le focus au rond.
    await page.keyboard.press('Escape');
    await viewerClosed(page);
    await activeIs(page, '.contact-card .avatar-zoom');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Agrandir la photo de Ana Martin');
    assert.equal(await viewer(page).locator('.photo-stage').evaluate(node => node.childElementCount), 0, 'l\'image est retirée à la fermeture');

    await ana.click();
    await viewer(page).locator('img.photo-img').waitFor();
    await viewer(page).getByRole('button', { name: 'Fermer la photo' }).click();
    await viewerClosed(page);

    await ana.click();
    await viewer(page).locator('img.photo-img.loaded').waitFor();
    await viewer(page).locator('img').click();
    await viewerClosed(page);

    await ana.click();
    await viewer(page).locator('img.photo-img').waitFor();
    await page.mouse.click(4, 4);
    await viewerClosed(page);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la photo s\'agrandit aussi au clavier, par Entrée et par Espace', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    // Les cartes sont redessinées quand l'identité arrive (le bouton « Modifier » de la carte d'Ana) : on
    // attend ce moment avant de donner le focus, qu'un redessin ferait perdre.
    await waitForEditButtons(page, 1);
    const ana = avatarOf(page, 'Ana Martin');
    await waitForPhoto(ana);
    for (const key of ['Enter', 'Space']) {
      await ana.focus();
      await activeIs(page, '.avatar-zoom');
      await page.keyboard.press(key);
      await viewer(page).locator('img.photo-img').waitFor();
      assert.equal(await viewer(page).evaluate(node => node.open), true, key);
      await page.keyboard.press('Escape');
      await viewerClosed(page);
    }
  }));

test('la légende d\'une carte sans fonction ne garde que l\'établissement, sans point médian orphelin', { skip }, () =>
  withWidget({ tables: world({ edit: tables => { tables.BDD.Avatar[tables.BDD.id.indexOf(10)] = ['L', 503]; tables.BDD.Avatar[0] = ['L', 504]; } }), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const hugo = avatarOf(page, 'Hugo Bernard');
    await waitForPhoto(hugo);
    await hugo.click();
    await viewer(page).locator('img.photo-img').waitFor();
    assert.equal(await viewer(page).locator('#photoCaption small').textContent(), 'CHU de Bordeaux', 'pas de fonction : pas de point médian orphelin');
    await page.keyboard.press('Escape');
    await viewerClosed(page);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la fenêtre d\'agrandissement dit quand la photo ne peut pas être chargée, sans image cassée', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const outcome = await page.evaluate(async () => {
      const { createPhotoViewer } = await import('./avatar-ui.js');
      const dialog = document.createElement('dialog');
      dialog.innerHTML = '<button type="button" data-close>x</button><div class="photo-stage"></div><p class="photo-cap"></p>';
      document.body.append(dialog);
      // Des pièces jointes dont l'adresse mène à un fichier introuvable.
      const attachments = { url: id => `${location.origin}/introuvable/${id}.jpg`, ready: async () => true, refresh: async () => false };
      const tool = createPhotoViewer(dialog, attachments);
      tool.open({ photo: 7, name: 'Zoé', detail: 'Pharmacienne' });
      await new Promise(resolve => setTimeout(resolve, 600));
      const result = {
        open: dialog.open,
        failure: dialog.querySelector('.photo-fail')?.textContent ?? null,
        images: dialog.querySelectorAll('img').length,
        caption: dialog.querySelector('.photo-cap').textContent
      };
      dialog.close();
      dialog.remove();
      return result;
    });
    assert.deepEqual(outcome, { open: true, failure: 'La photo n’a pas pu être chargée.', images: 0, caption: 'ZoéPharmacienne' });
  }));

// ===== Le formulaire =====

test('le formulaire offre la photo en premier : la photo actuelle, deux boutons, l\'aide, et rien n\'est écrit à l\'ouverture', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files, logs }) => {
    await openOwn(page);
    assert.deepEqual(await dialog(page).locator('.dlg-body > *').evaluateAll(nodes => nodes.map(node => node.className.split(' ')[0]).filter(Boolean).slice(0, 3)),
      ['dlg-alert', 'ident', 'photo-field'], 'la photo vient juste après l\'identité, avant les champs');
    const field = photoField(page);
    assert.equal(await field.locator('.photo-title').textContent(), 'Photo de profil');
    assert.equal(await field.locator('.photo-help').textContent(),
      'Elle remplace les initiales sur la carte et s’agrandit au clic. JPG, PNG ou WebP, 2 Mo au maximum, recadrée en carré.');
    const preview = field.locator('.photo-preview .avatar');
    await waitForPhoto(preview);
    assert.ok(isAttachment(await photoSrc(preview), 501));
    assert.equal(await field.getByRole('button', { name: 'Changer la photo', exact: true }).isVisible(), true);
    assert.equal(await field.getByRole('button', { name: 'Retirer la photo', exact: true }).isVisible(), true);
    assert.equal(await field.getByRole('button', { name: 'Ajouter une photo', exact: true }).count(), 0);
    const input = page.locator('#profilePhotoFile');
    assert.equal(await input.getAttribute('accept'), 'image/jpeg,image/png,image/webp', 'pas de SVG pour une photo');
    assert.equal(await input.getAttribute('aria-describedby'), 'profilePhotoHelp profilePhotoError');
    assert.equal(await input.isHidden(), true, 'le champ de fichier est caché : les boutons le déclenchent');
    assert.equal(await photoError(page).isHidden(), true);
    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await press(page, 'Relire mes modifications').isDisabled(), true);
    assert.equal(await dialog(page).locator('.ident .avatar img').count(), 1, 'le bloc d\'identité montre aussi la photo');
    assert.deepEqual(await bddCalls(page), []);
    assert.equal(files.uploads.length, 0);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('une personne sans photo voit « Ajouter une photo » et pas de bouton pour retirer', { skip }, async () => {
  await withWidget({ tables: world({ admin: true }), user: ANA_EMAIL }, async ({ page }) => {
    await openOfOther(page, 'Hugo Bernard');
    assert.equal(await heading(page).textContent(), 'Modifier la fiche de Hugo Bernard');
    const field = photoField(page);
    assert.equal(await field.getByRole('button', { name: 'Ajouter une photo', exact: true }).isVisible(), true);
    assert.equal(await field.getByRole('button', { name: 'Retirer la photo', exact: true }).isHidden(), true);
    assert.equal(await field.locator('.photo-preview .avatar').textContent(), 'HB', 'les initiales, comme sur sa carte');
    assert.equal(await field.locator('.photo-preview img').count(), 0);
  });
});

// ===== Choisir une photo =====

test('une photo choisie est recadrée au centre en carré, redessinée en JPEG de 256 px, relue avant / après, envoyée puis écrite en une seule action', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files, logs }) => {
    await openOwn(page);
    await waitForPhoto(photoField(page).locator('.photo-preview .avatar'));
    await chooseFile(page, await photoFile(page, { width: 600, height: 400 }));
    const preview = photoField(page).locator('.photo-preview .avatar');
    await preview.locator('img[src^="blob:"]').waitFor();
    await waitForPhoto(preview);
    assert.equal(await summary(page), '1 champ modifié');
    assert.equal(await press(page, 'Relire mes modifications').isEnabled(), true);
    assert.equal(await photoError(page).isHidden(), true);
    assert.equal(await photoField(page).locator('.photo-status').textContent(), '', 'plus de « Préparation de l\'image »');
    assert.equal(files.uploads.length, 0, 'rien n\'est envoyé avant « Valider »');
    assert.deepEqual(await bddCalls(page), []);
    // « Ce qui va changer » : la photo actuelle puis la nouvelle.
    const row = dialog(page).locator('.recap .diff-row');
    assert.equal(await row.locator('.diff-label').textContent(), 'Photo de profil');
    assert.deepEqual(await row.locator('.thumb').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Agrandir : Photo actuelle', 'Agrandir : Nouvelle photo']);

    await review(page);
    const before = column(page, 'before').locator('.contact-card');
    const after = column(page, 'after').locator('.contact-card');
    await waitForPhoto(before.locator('.avatar'));
    await waitForPhoto(after.locator('.avatar'));
    assert.ok(isAttachment(await photoSrc(before.locator('.avatar')), 501), 'avant : la photo de Grist');
    assert.match(await photoSrc(after.locator('.avatar')), /^blob:/, 'après : la photo qu\'on vient de préparer');
    assert.equal(await before.locator('.rv-ring, .rv-ring-del, .rv-note').count(), 0, 'rien n\'est repéré sur la carte « Avant »');
    assert.equal(await after.locator('.avatar').evaluate(node => node.classList.contains('rv-ring')), true, 'anneau vert sur la photo qui change');
    assert.equal(await after.locator('.rv-note .mk-pill').textContent(), 'photo modifiée');
    assert.equal(await after.locator('button.avatar').count(), 0, 'les cartes de la relecture ne sont pas cliquables');
    assert.equal(await after.locator('.mk-pill').count(), 1);
    assert.equal(await summary(page), '1 champ modifié');
    assert.equal(await dialog(page).locator('.recap .diff-label').textContent(), 'Photo de profil');

    // La miniature de la nouvelle photo s'agrandit ; Échap ne ferme que la photo, pas la relecture.
    await dialog(page).getByRole('button', { name: 'Agrandir : Nouvelle photo' }).click();
    await viewer(page).locator('img.photo-img.loaded').waitFor();
    assert.match(await viewer(page).locator('img').getAttribute('src'), /^blob:/);
    assert.equal(await viewer(page).locator('#photoCaption').evaluate(node => node.firstChild.textContent), 'Ana Martin');
    assert.equal(await viewer(page).locator('#photoCaption small').textContent(), 'Nouvelle photo');
    await page.keyboard.press('Escape');
    await viewerClosed(page);
    assert.equal(await dialog(page).evaluate(node => node.open), true, 'la relecture reste ouverte');
    assert.equal(await heading(page).textContent(), 'Relire avant de valider');

    await press(page, 'Valider').click();
    await closed(page);
    await toast(page).waitFor({ state: 'visible' });
    assert.equal(await toast(page).textContent(), 'Vos modifications sont enregistrées.');

    // L'envoi : un JPEG carré de 256 px, avec un jeton en écriture, sans cookie ni adresse de la page.
    assert.equal(files.uploads.length, 1);
    const [upload] = files.uploads;
    assert.equal(upload.method, 'POST');
    assert.equal(upload.field, 'upload');
    assert.equal(upload.contentType, 'image/jpeg');
    assert.equal(upload.fileName, 'photo-de-profil.jpg', 'le nom du fichier d\'origine n\'est pas envoyé');
    assert.deepEqual(jpegSize(upload.bytes), { width: 256, height: 256 }, 'recadré en carré, ramené à 256 px');
    assert.ok(upload.bytes.length < 200 * 1024, `une photo légère (${upload.bytes.length} octets)`);
    assert.ok(!upload.bytes.toString('latin1').includes('ma-photo-privee'), 'le nom d\'origine n\'est pas dans l\'image');
    assert.deepEqual(await colorsAt(page, upload.bytes, [[20, 128], [128, 128], [235, 128]]), ['rouge', 'vert', 'bleu'],
      'le centre de l\'image est gardé : 100 px de chaque côté sont coupés sur 600');
    assert.equal(upload.token, 'fake-token');
    assert.equal(upload.cookie, null);
    assert.equal(upload.referrer, null);
    assert.equal((await tokenRequests(page)).filter(request => request.readOnly === false).length, 1, 'un seul jeton en écriture');

    assert.deepEqual(await bddCalls(page), [{
      action: 'UpdateRecord', table: 'BDD', rowId: 1, ok: true, values: { Avatar: ['L', FIRST_UPLOAD_ID] }
    }]);
    assert.deepEqual(await bddCell(page, 'Avatar'), ['L', FIRST_UPLOAD_ID]);
    assert.equal(await bddCell(page, 'email'), ANA_EMAIL, 'l\'adresse n\'est jamais écrite');

    // La carte de l'annuaire et le bandeau montrent la nouvelle photo, téléchargée depuis Grist.
    const ana = avatarOf(page, 'Ana Martin');
    await until(async () => isAttachment(await photoSrc(ana).catch(() => ''), FIRST_UPLOAD_ID), 'la carte montre la nouvelle photo');
    await waitForPhoto(ana);
    await until(async () => isAttachment(await photoSrc(page.locator('#accountBar .account-avatar')).catch(() => ''), FIRST_UPLOAD_ID), 'le bandeau aussi');
    assert.ok(files.hits[FIRST_UPLOAD_ID] > 0);

    // La fenêtre rouverte part de la photo enregistrée.
    await openOwn(page);
    const reopened = photoField(page).locator('.photo-preview .avatar');
    await waitForPhoto(reopened);
    assert.ok(isAttachment(await photoSrc(reopened), FIRST_UPLOAD_ID));
    assert.equal(await summary(page), 'Aucune modification');
    assert.deepEqual(await Promise.all(logs.errors), []);
    const logged = JSON.stringify(await Promise.all([...logs.warnings, ...logs.infos, ...logs.errors]));
    assert.ok(!logged.includes('@') && !logged.includes('fake-token'), 'ni adresse ni jeton dans la console');
  }));

test('une photo de téléphone est remise à l\'endroit, sans ses métadonnées : l\'orientation est appliquée et la position GPS ne part pas', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    // 600 x 400 de bandes verticales, marquées « à tourner d'un quart de tour » : à l'écran, 400 x 600 de bandes horizontales.
    const jpeg = withExif(await bands(page, { width: 600, height: 400, type: 'image/jpeg' }), 6);
    assert.ok(jpeg.toString('latin1').includes('GPS 44.8378N'));
    await chooseFile(page, { name: 'IMG_0001.JPG', mimeType: 'image/jpeg', buffer: jpeg });
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await review(page);
    await press(page, 'Valider').click();
    await closed(page);
    const [upload] = files.uploads;
    assert.deepEqual(jpegSize(upload.bytes), { width: 256, height: 256 });
    assert.ok(!upload.bytes.toString('latin1').includes('Exif'), 'aucun bloc Exif dans ce qui part');
    assert.ok(!upload.bytes.toString('latin1').includes('GPS 44'), 'aucune position GPS dans ce qui part');
    assert.deepEqual(await colorsAt(page, upload.bytes, [[128, 20], [128, 128], [128, 235], [20, 128], [235, 128]]),
      ['rouge', 'vert', 'bleu', 'vert', 'vert'], 'redressée : le haut est rouge, le milieu vert, le bas bleu');
  }));

test('un JPG et un WebP sont acceptés comme un PNG, et une photo plus petite que 256 px garde sa taille', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    const sizes = [];
    for (const [type, name, width, height] of [['image/jpeg', 'a.jpg', 1000, 500], ['image/webp', 'b.webp', 300, 300], ['image/png', 'c.png', 120, 80]]) {
      await chooseFile(page, { name, mimeType: type, buffer: await bands(page, { width, height, type }) });
      await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
      assert.equal(await photoError(page).isHidden(), true, type);
      await review(page);
      await press(page, 'Valider').click();
      await closed(page);
      const upload = files.uploads.at(-1);
      assert.equal(upload.contentType, 'image/jpeg', `${type} est ré-encodé en JPEG`);
      sizes.push(jpegSize(upload.bytes));
      await openOwn(page);
    }
    assert.deepEqual(sizes, [{ width: 256, height: 256 }, { width: 256, height: 256 }, { width: 80, height: 80 }]);
  }));

test('un PNG transparent est posé sur du blanc : jamais de fond noir derrière un JPEG', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    const transparent = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ff0000';
      context.fillRect(40, 40, 20, 20);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await chooseFile(page, { name: 'detouree.png', mimeType: 'image/png', buffer: Buffer.from(transparent, 'base64') });
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await review(page);
    await press(page, 'Valider').click();
    await closed(page);
    const scratch = await page.context().newPage();
    const corner = await scratch.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(5, 5, 1, 1).data.slice(0, 3));
    }, files.uploads[0].bytes.toString('base64'));
    await scratch.close();
    assert.ok(corner.every(value => value > 240), `blanc, pas noir (${corner})`);
  }));

test('un fichier refusé avant l\'envoi (format, poids, contenu illisible) ne change rien et dit pourquoi ; un bon fichier efface le message', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    const error = photoError(page);
    const expectError = async (file, message, label) => {
      await chooseFile(page, file);
      await until(async () => (await error.textContent()) === message, `${label} : « ${message} » (obtenu : « ${await error.textContent()} »)`);
      assert.equal(await error.isVisible(), true, label);
      assert.equal(await error.getAttribute('class'), 'fld-err', label);
      assert.equal(await summary(page), 'Aucune modification', `${label} : rien n'a changé`);
      assert.equal(await press(page, 'Relire mes modifications').isDisabled(), true, label);
    };
    await expectError({ name: 'moi.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
      'Ce fichier n’est pas une image acceptée : choisissez un fichier JPG, PNG ou WebP.', 'GIF');
    await expectError({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__svgxss=1"/>') },
      'Ce fichier n’est pas une image acceptée : choisissez un fichier JPG, PNG ou WebP.', 'SVG (il peut porter un script)');
    await expectError({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
      'Ce fichier n’est pas une image acceptée : choisissez un fichier JPG, PNG ou WebP.', 'PDF');
    await expectError({ name: 'gros.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(3 * 1024 * 1024) },
      'Cette image pèse 3 Mo : choisissez-en une de 2 Mo au plus.', 'trop lourd');
    await expectError({ name: 'vide.png', mimeType: 'image/png', buffer: Buffer.alloc(0) },
      'Ce fichier est vide : choisissez-en un autre.', 'vide');
    await expectError({ name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('ceci n’est pas une image') },
      'Cette image n’a pas pu être lue : choisissez un autre fichier.', 'illisible');
    assert.equal(await page.evaluate(() => window.__svgxss), undefined, 'aucun script de SVG n\'a tourné');
    assert.equal(files.uploads.length, 0);
    assert.deepEqual(await bddCalls(page), []);

    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    assert.equal(await error.isHidden(), true, 'un bon fichier efface le message');
    assert.equal(await summary(page), '1 champ modifié');
    // Un mauvais fichier ensuite garde la photo déjà choisie.
    await chooseFile(page, { name: 'moi.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await until(async () => (await error.isVisible()), 'le message revient');
    assert.equal(await summary(page), '1 champ modifié', 'la photo choisie reste');
    assert.equal(await photoField(page).locator('.photo-preview img[src^="blob:"]').count(), 1);
  }));

test('pendant que l\'image se prépare, les boutons de la photo et « Relire » attendent, sans perdre le focus du clavier', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    // L'écoute du sélecteur de fichier est branchée bien avant l'appui : une touche, plus rapide qu'un clic
    // (qui attend d'abord que le bouton soit prêt), peut arriver avant que le navigateur intercepte la
    // boîte, et l'événement est alors perdu (dans la suite complète, près d'une fois sur deux).
    const chooserOpened = new Promise(resolve => page.once('filechooser', resolve));
    await page.evaluate(() => {
      window.__seen = [];
      const field = document.querySelector('#profileDialog .photo-field');
      new MutationObserver(() => {
        window.__seen.push({
          status: field.querySelector('.photo-status').textContent,
          busy: [...field.querySelectorAll('.photo-actions .btn')].map(button => button.getAttribute('aria-disabled')),
          review: [...document.querySelectorAll('#profileDialog .dlg-actions .btn-primary')].map(button => button.disabled)
        });
      }).observe(field.closest('.dlg-body').parentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    });
    const change = photoField(page).getByRole('button', { name: 'Changer la photo', exact: true });
    await change.focus();
    await page.keyboard.press('Enter');
    const chooser = await Promise.race([
      chooserOpened,
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('le sélecteur de fichier ne s\'est pas ouvert')), 10000).unref())
    ]);
    assert.equal(chooser.isMultiple(), false);
    // Un grand fichier, pour que la préparation dure.
    await chooser.setFiles(await photoFile(page, { width: 5000, height: 3000 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    const seen = await page.evaluate(() => window.__seen);
    assert.ok(seen.some(state => state.status === 'Préparation de l’image…' && state.busy.every(value => value === 'true') && state.review[0] === true),
      'pendant la préparation : message, boutons aria-disabled et « Relire » désactivé');
    assert.deepEqual(seen.at(-1).busy, [null, null], 'ensuite tout redevient actif');
    assert.equal(seen.at(-1).status, '');
    assert.equal(await photoField(page).locator('.photo-status').getAttribute('role'), 'status');
    // Le focus est resté sur le bouton, qui n'a jamais été « disabled ».
    await activeIs(page, '.photo-actions .btn');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Changer la photo');
    assert.equal(await press(page, 'Relire mes modifications').isEnabled(), true);
  }));

// ===== Retirer une photo =====

test('« Retirer la photo » rend les initiales, se relit en rouge, n\'envoie rien et écrit une cellule vide', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files, logs }) => {
    await openOwn(page);
    const field = photoField(page);
    await waitForPhoto(field.locator('.photo-preview .avatar'));
    await field.getByRole('button', { name: 'Retirer la photo', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await field.locator('.photo-preview .avatar').textContent(), 'AM');
    assert.equal(await field.locator('.photo-preview img').count(), 0);
    assert.equal(await field.getByRole('button', { name: 'Ajouter une photo', exact: true }).isVisible(), true);
    assert.equal(await field.getByRole('button', { name: 'Retirer la photo', exact: true }).isHidden(), true);
    await activeIs(page, '.photo-actions .btn');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Ajouter une photo', 'le focus passe au bouton qui reste');
    assert.equal(await summary(page), '1 champ modifié');
    const row = dialog(page).locator('.recap .diff-row');
    assert.equal(await row.locator('.diff-label').textContent(), 'Photo de profil');
    assert.equal(await row.locator('.thumb').count(), 1, 'seule la photo actuelle a une miniature');
    assert.equal(await row.locator('.none').textContent(), 'photo retirée');

    await review(page);
    const after = column(page, 'after').locator('.contact-card');
    assert.equal(await after.locator('.avatar').evaluate(node => node.classList.contains('rv-ring-del')), true, 'anneau rouge');
    assert.equal(await after.locator('.avatar').evaluate(node => node.classList.contains('rv-ring')), false);
    assert.equal(await after.locator('.avatar').textContent(), 'AM');
    assert.equal(await after.locator('.avatar img').count(), 0);
    assert.equal(await after.locator('.rv-note .mk-pill').textContent(), 'photo retirée');
    await waitForPhoto(column(page, 'before').locator('.contact-card .avatar'));

    await press(page, 'Valider').click();
    await closed(page);
    assert.equal(files.uploads.length, 0, 'retirer n\'envoie rien');
    assert.deepEqual(await bddCalls(page), [{ action: 'UpdateRecord', table: 'BDD', rowId: 1, ok: true, values: { Avatar: ['L'] } }]);
    await until(async () => (await avatarOf(page, 'Ana Martin').evaluate(node => node.tagName)) === 'DIV', 'la carte revient aux initiales');
    assert.equal(await avatarOf(page, 'Ana Martin').textContent(), 'AM');
    await until(async () => (await page.locator('#accountBar .account-avatar img').count()) === 0, 'le bandeau aussi');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('choisir une photo puis la retirer revient à ne rien changer pour qui n\'en avait pas', { skip }, async () => {
  await withWidget({ tables: world({ admin: true }), user: ANA_EMAIL }, async ({ page }) => {
    await openOfOther(page, 'Hugo Bernard');
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    const blob = await photoSrc(photoField(page).locator('.photo-preview .avatar'));
    assert.equal(await summary(page), '1 champ modifié');
    await photoField(page).getByRole('button', { name: 'Retirer la photo', exact: true }).click();
    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await press(page, 'Relire les modifications').isDisabled(), true);
    assert.equal(await page.evaluate(url => fetch(url).then(() => 'chargée', () => 'libérée'), blob), 'libérée', 'l\'image abandonnée est libérée');
  });
});

// ===== Une administratrice change la photo d'une autre personne =====

test('une administratrice ajoute une première photo à la fiche de quelqu\'un d\'autre : pastille « photo ajoutée », seule cette ligne est écrite', { skip }, () =>
  withWidget({ tables: world({ admin: true }), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOfOther(page, 'Hugo Bernard');
    await chooseFile(page, await photoFile(page, { width: 400, height: 800 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    const row = dialog(page).locator('.recap .diff-row');
    assert.equal(await row.locator('.none').first().textContent(), 'aucune photo');
    assert.equal(await row.locator('.thumb').count(), 1);
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire avant de valider');
    const after = column(page, 'after').locator('.contact-card');
    assert.equal(await after.locator('.rv-note .mk-pill').textContent(), 'photo ajoutée');
    assert.equal(await after.locator('.avatar').evaluate(node => node.classList.contains('rv-ring')), true);
    assert.equal(await column(page, 'before').locator('.contact-card .avatar').textContent(), 'HB');
    await press(page, 'Valider').click();
    await closed(page);
    await toast(page).waitFor({ state: 'visible' });
    assert.equal(await toast(page).textContent(), 'La fiche de Hugo Bernard est enregistrée.');
    assert.deepEqual(await bddCalls(page), [{ action: 'UpdateRecord', table: 'BDD', rowId: 10, ok: true, values: { Avatar: ['L', FIRST_UPLOAD_ID] } }]);
    assert.deepEqual(jpegSize(files.uploads[0].bytes), { width: 256, height: 256 });
    assert.deepEqual(await colorsAt(page, files.uploads[0].bytes, [[128, 20], [128, 235]]).then(found => found.map(color => typeof color)), ['string', 'string']);
    const hugo = avatarOf(page, 'Hugo Bernard');
    await until(async () => (await hugo.evaluate(node => node.tagName)) === 'BUTTON', 'la carte de Hugo montre sa photo');
    await waitForPhoto(hugo);
    assert.equal(await bddCell(page, 'Avatar', 0).then(cell => cell[1]), 501, 'la photo d\'Ana n\'a pas bougé');
  }));

test('une administratrice retire une photo illisible : la miniature de la photo actuelle le dit', { skip }, () =>
  withWidget({ tables: world({ admin: true }), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOfOther(page, HOSTILE);
    const field = photoField(page);
    // Le fichier de Hostile n'est pas une image : les initiales, mais la photo existe dans la fiche.
    assert.equal(await field.getByRole('button', { name: 'Retirer la photo', exact: true }).isVisible(), true);
    await until(async () => (await field.locator('.photo-preview img').count()) === 0, 'les initiales reviennent');
    await field.getByRole('button', { name: 'Retirer la photo', exact: true }).click();
    const none = dialog(page).locator('.recap .diff-row .none');
    await none.first().waitFor();
    await until(async () => (await none.allTextContents()).includes('photo illisible'), 'la miniature illisible est remplacée par un mot');
    assert.deepEqual(await none.allTextContents(), ['photo illisible', 'photo retirée']);
    await press(page, 'Relire les modifications').click();
    await headingIs(page, 'Relire avant de valider');
    await press(page, 'Valider').click();
    await closed(page);
    assert.deepEqual((await bddCalls(page)).map(call => [call.rowId, call.values]), [[6, { Avatar: ['L'] }]]);
    assert.equal(files.uploads.length, 0);
  }));

// ===== Les échecs d'un envoi =====

const FAILED_UPLOADS = [
  ['denied', /vos droits ne permettent pas d’ajouter une pièce jointe/],
  ['too-large', /il est trop volumineux/],
  ['error', /Grist a refusé le fichier \(erreur 500\)\. Réessayez ; contactez un administrateur si le problème persiste\./],
  ['bad-answer', /n’a pas confirmé l’envoi du fichier\. Réessayez ; contactez un administrateur si le problème persiste\./],
  ['unreachable', /le navigateur n’a pas pu joindre le serveur, ou l’a refusé\. Contactez un administrateur si le problème persiste\./]
];

test('un envoi que Grist refuse ou qui échoue laisse la relecture ouverte, la photo choisie, et rien d\'écrit ; réessayer fonctionne', { skip }, async () => {
  for (const [mode, expected] of FAILED_UPLOADS) {
    await withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files, logs }) => {
      files.upload.mode = mode;
      await openOwn(page);
      await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
      await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
      await review(page);
      await press(page, 'Valider').click();
      await dialog(page).locator('.dlg-alert [role="alert"]').waitFor();
      assert.match(await alertText(page), expected, mode);
      assert.equal(await dialog(page).evaluate(node => node.open), true, mode);
      assert.equal(await heading(page).textContent(), 'Relire avant de valider', mode);
      assert.equal(await press(page, 'Valider').isEnabled(), true, 'on peut réessayer');
      assert.equal(await press(page, 'Valider').textContent(), 'Valider');
      assert.deepEqual(await bddCalls(page), [], `${mode} : rien n'est écrit`);
      assert.equal(files.uploads.length, 1);
      assert.doesNotMatch(await alertText(page), /fichier de la nouvelle photo, déjà envoyé/, `${mode} : rien n'est resté dans Grist`);
      const logged = (await Promise.all([...logs.warnings, ...logs.errors])).join('\n');
      assert.ok(!logged.includes('fake-token'), `${mode} : le jeton n'est jamais écrit dans la console`);
      assert.ok(!logged.includes('docs.getgrist.com/api/docs/fake-doc'), `${mode} : ni l'adresse du document`);

      files.upload.mode = 'ok';
      await press(page, 'Valider').click();
      await closed(page);
      assert.equal(files.uploads.length, 2, 'le second essai part et réussit');
      assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ Avatar: ['L', FIRST_UPLOAD_ID] }]);
    });
  }
});

test('un serveur de pièces jointes sans en-têtes CORS fait échouer l\'envoi proprement, avec le conseil de la photo', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    files.upload.cors = false;
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await review(page);
    await press(page, 'Valider').click();
    await dialog(page).locator('.dlg-alert [role="alert"]').waitFor();
    const message = await alertText(page);
    assert.match(message, /le navigateur n’a pas pu joindre le serveur, ou l’a refusé\. Contactez un administrateur si le problème persiste\./);
    assert.doesNotMatch(message, /GRIST_SETUP/, 'le conseil du logo (déposer le fichier dans Grist) ne vaut pas pour une photo');
    assert.deepEqual(await bddCalls(page), []);
  }));

test('un jeton d\'écriture refusé par Grist arrête l\'enregistrement sans rien envoyer', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await review(page);
    await page.evaluate(() => {
      const original = window.__fake.docApi.getAccessToken;
      window.__fake.docApi.getAccessToken = request => (request?.readOnly === false ? Promise.reject(new Error('Access token refused')) : original(request));
    });
    await press(page, 'Valider').click();
    await dialog(page).locator('.dlg-alert [role="alert"]').waitFor();
    assert.match(await alertText(page), /Grist n’a pas donné au widget l’autorisation d’envoyer un fichier\. Contactez un administrateur si le problème persiste\./);
    assert.equal(files.uploads.length, 0);
    assert.deepEqual(await bddCalls(page), []);
  }));

test('si l\'envoi réussit mais que Grist refuse ensuite l\'écriture, la phrase dit où est resté le fichier', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await review(page);
    await page.evaluate(() => { window.__denyWrites = ['BDD']; });
    await press(page, 'Valider').click();
    await dialog(page).locator('.dlg-alert [role="alert"]').waitFor();
    const message = await alertText(page);
    assert.match(message, /Grist a refusé la modification : vos droits ne permettent pas de changer cette fiche/);
    assert.match(message, /Le fichier de la nouvelle photo, déjà envoyé à Grist, reste dans les pièces jointes du document sans servir\./);
    assert.equal(files.uploads.length, 1);
    assert.equal((await bddCell(page, 'Avatar'))[1], 501, 'la photo de la fiche n\'a pas changé');
    assert.equal(await heading(page).textContent(), 'Relire avant de valider');
  }));

test('si la fiche change pendant l\'envoi de la photo, rien n\'est écrit : la relecture montre la fiche d\'aujourd\'hui et dit où est le fichier', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    files.upload.delay = 500;
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await review(page);
    await waitForPhoto(column(page, 'before').locator('.contact-card .avatar'));
    await press(page, 'Valider').click();
    await until(() => files.uploads.length === 1, 'l\'envoi a commencé');
    // Pendant que la photo part, quelqu'un d'autre change celle de la fiche.
    await page.evaluate(() => { window.__tables.BDD.Avatar[0] = ['L', 502]; });
    await page.waitForFunction(() => document.querySelector('#profileDialog .notice') !== null);
    assert.equal(await notices(page).first().textContent(),
      'La fiche a changé dans Grist pendant la relecture. Relisez ce qui suit, puis validez à nouveau. '
      + 'Le fichier de la nouvelle photo, déjà envoyé à Grist, reste dans les pièces jointes du document sans servir.');
    assert.equal(await heading(page).textContent(), 'Relire avant de valider');
    assert.deepEqual(await bddCalls(page), [], 'la première validation n\'a rien écrit');
    assert.equal((await bddCell(page, 'Avatar'))[1], 502);
    await waitForPhoto(column(page, 'before').locator('.contact-card .avatar'));
    assert.ok(isAttachment(await photoSrc(column(page, 'before').locator('.contact-card .avatar')), 502), 'avant : la photo d\'aujourd\'hui');
    assert.equal(await column(page, 'after').locator('.rv-note .mk-pill').textContent(), 'photo modifiée');

    files.upload.delay = 0;
    await press(page, 'Valider').click();
    await closed(page);
    assert.equal(files.uploads.length, 2);
    assert.deepEqual((await bddCalls(page)).map(call => call.values), [{ Avatar: ['L', FIRST_UPLOAD_ID + 1] }]);
  }));

test('si la photo a changé dans Grist avant la relecture, la fenêtre le dit', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    await page.evaluate(() => { window.__tables.BDD.Avatar[0] = ['L', 502]; });
    await review(page);
    assert.match(await notices(page).first().textContent(), /ont changé dans Grist depuis l'ouverture de la fenêtre : Photo de profil\./);
  }));

// ===== Fermer, abandonner =====

test('abandonner une photo choisie : Échap prévient puis ferme, l\'image est libérée et la fenêtre rouverte repart de la photo de Grist', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, files }) => {
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    const blob = await photoSrc(photoField(page).locator('.photo-preview .avatar'));
    await page.keyboard.press('Escape');
    assert.equal(await dialog(page).evaluate(node => node.open), true, 'le premier appui prévient');
    assert.equal(await dialog(page).locator('.dlg-hint').isVisible(), true);
    await page.keyboard.press('Escape');
    await closed(page);
    await until(async () => (await page.evaluate(url => fetch(url).then(() => 'chargée', () => 'libérée'), blob)) === 'libérée', 'l\'image abandonnée est libérée');
    assert.equal(files.uploads.length, 0);
    assert.deepEqual(await bddCalls(page), []);
    await openOwn(page);
    assert.equal(await summary(page), 'Aucune modification');
    assert.ok(isAttachment(await photoSrc(photoField(page).locator('.photo-preview .avatar')), 501));
  }));

// ===== Les autres fenêtres =====

test('la liste des responsables de la fiche d\'établissement montre la photo des personnes que l\'annuaire montre', { skip }, () =>
  withWidget({ tables: withIdentity(withBranding(withAvatars())), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const shortcut = page.locator('#accountBar .account-etab');
    await shortcut.waitFor();
    await shortcut.click();
    const rows = page.locator('#etabDialog .es-resp');
    await rows.first().waitFor();
    const ana = rows.filter({ hasText: 'Ana Martin' }).locator('.avatar');
    await waitForPhoto(ana);
    assert.ok(isAttachment(await photoSrc(ana), 501));
    assert.equal(await ana.evaluate(node => node.tagName), 'DIV', 'rien à agrandir ici');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

// ===== Petits écrans et accessibilité =====

for (const width of [280, 320, 390]) {
  test(`dans un cadre de ${width} px, le formulaire, la relecture et la fenêtre d'agrandissement tiennent dans l'écran`, { skip }, () =>
    withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await openOwn(page);
      const fits = selector => page.evaluate(wanted => {
        const dialogBox = document.querySelector(wanted);
        const box = dialogBox.getBoundingClientRect();
        const outside = [...dialogBox.querySelectorAll('*')].filter(node => {
          const at = node.getBoundingClientRect();
          return at.width > 0 && !node.closest('.sr-only') && (at.right > box.right + 0.5 || at.left < box.left - 0.5);
        }).map(node => `${node.tagName}.${String(node.className).slice(0, 30)}`);
        return {
          inside: box.left >= 0 && box.right <= window.innerWidth + 0.5 && box.bottom <= window.innerHeight + 0.5,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          outside
        };
      }, selector);
      const FITS = { inside: true, pageOverflow: 0, outside: [] };
      await waitForPhoto(photoField(page).locator('.photo-preview .avatar'));
      assert.deepEqual(await fits('#profileDialog'), FITS, 'formulaire');
      const preview = await photoField(page).locator('.photo-preview .avatar').boundingBox();
      const actions = await photoField(page).locator('.photo-actions').boundingBox();
      assert.ok(actions.y >= preview.y + preview.height - 1 || actions.x >= preview.x + preview.width - 1, 'les boutons ne passent pas sous la photo');
      for (const name of ['Changer la photo', 'Retirer la photo']) {
        const button = await photoField(page).getByRole('button', { name, exact: true }).boundingBox();
        assert.ok(button.height >= 32, `${name} : une cible assez haute (${button.height} px)`);
      }

      await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
      await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
      await review(page);
      await waitForPhoto(column(page, 'after').locator('.contact-card .avatar'));
      assert.deepEqual(await fits('#profileDialog'), FITS, 'relecture');
      const spill = await column(page, 'after').locator('.contact-card').evaluate(card => {
        const frame = card.getBoundingClientRect();
        return [...card.querySelectorAll('*')].filter(node => {
          const at = node.getBoundingClientRect();
          return at.width > 0 && (at.right > frame.right + 0.5 || at.left < frame.left - 0.5);
        }).map(node => node.className || node.tagName);
      });
      assert.deepEqual(spill, [], 'rien ne sort de la carte « Après » : ni l\'anneau ni la pastille');
      const validate = await press(page, 'Valider').boundingBox();
      assert.ok(validate.y + validate.height <= 700 + 0.5, '« Valider » est visible');

      await dialog(page).getByRole('button', { name: 'Agrandir : Nouvelle photo' }).click();
      await viewer(page).locator('img.photo-img.loaded').waitFor();
      assert.deepEqual(await fits('#photoDialog'), FITS, 'photo agrandie');
      const hugs = await page.evaluate(() => {
        const box = document.querySelector('#photoDialog').getBoundingClientRect();
        const parts = ['.photo-stage', '.photo-cap'].map(part => document.querySelector(`#photoDialog ${part}`).getBoundingClientRect().height);
        return { empty: box.height - parts[0] - parts[1], offset: box.top - (window.innerHeight - box.height) / 2 };
      });
      assert.ok(hugs.empty < 2, `la fenêtre épouse la photo et sa légende, sans blanc dessous (${Math.round(hugs.empty)} px de trop)`);
      assert.ok(Math.abs(hugs.offset) < 2, `et reste au milieu de l'écran (décalée de ${Math.round(hugs.offset)} px)`);
      const photo = await viewer(page).locator('img').boundingBox();
      assert.ok(photo.width >= Math.min(200, width - 60), `la photo reste grande (${Math.round(photo.width)} px)`);
      assert.ok(Math.abs(photo.width - photo.height) < 1);
      const close = await viewer(page).getByRole('button', { name: 'Fermer la photo' }).boundingBox();
      assert.ok(close.width >= 32 && close.height >= 32, `la croix se touche du doigt (${close.width} x ${close.height} px, comme celle des autres fenêtres)`);
      await page.keyboard.press('Escape');
      await viewerClosed(page);
    }));
}

test('chaque contrôle de la photo a un nom, et le focus ne sort jamais de la fenêtre modale', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page);
    await chooseFile(page, await photoFile(page, { width: 300, height: 300 }));
    await photoField(page).locator('.photo-preview img[src^="blob:"]').waitFor();
    const unnamed = await dialog(page).locator('input, select, button').evaluateAll(controls => controls
      .filter(control => !(control.labels?.length || control.getAttribute('aria-label') || control.textContent.trim()))
      .map(control => control.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, []);
    // Le fichier n'a pas d'étiquette visible mais porte l'aide et le message d'erreur.
    assert.equal(await page.locator('#profilePhotoHelp').count(), 1);
    assert.equal(await page.locator('#profilePhotoError').count(), 1);
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        return document.getElementById('profileDialog').contains(active) ? 'fenêtre' : active === document.body ? 'body' : active.outerHTML.slice(0, 60);
      });
      assert.ok(['fenêtre', 'body'].includes(where), `le focus est tombé sur ${where} à la tabulation ${step + 1}`);
    }
    // Les photos de la grille sont des boutons nommés ; les ronds d'initiales sont ignorés des lecteurs d'écran.
    await closeAll(page);
    const unnamedCards = await page.locator('#cardsGrid button.avatar').evaluateAll(buttons => buttons
      .filter(button => !button.getAttribute('aria-label')).map(button => button.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamedCards, []);
    assert.equal(await page.locator('#cardsGrid div.avatar:not([aria-hidden="true"])').count(), 0);
  }));

async function closeAll(page) {
  if (await dialog(page).evaluate(node => node.open)) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await closed(page);
  }
}
