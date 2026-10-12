import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageError, checkImageFile, fitWithin, megabytes, prepareImage, squareCrop } from '../image-prep.js';
import { IMAGE_RULES } from '../constants.js';

// ===== image-prep : ce qui se décide avant de dessiner (le dessin lui-même est essayé dans
// Chromium, tests/e2e-etablissement.test.mjs) =====

const fileOf = (size, type, name = 'logo') => new File([new Uint8Array(size)], name, { type });

test('megabytes writes a size in French, rounded up so that it never equals a limit it exceeds', () => {
  assert.equal(megabytes(1024 * 1024), '1 Mo');
  assert.equal(megabytes(2 * 1024 * 1024), '2 Mo');
  assert.equal(megabytes(1024 * 1024 + 1), '1,1 Mo', 'un octet de trop ne s’écrit pas « 1 Mo »');
  assert.equal(megabytes(1100 * 1000), '1,1 Mo');
  assert.equal(megabytes(1.5 * 1024 * 1024), '1,5 Mo');
  assert.equal(megabytes(10), '0,1 Mo');
});

test('checkImageFile accepts the formats and the weight the rules allow', () => {
  for (const type of IMAGE_RULES.logo.types) assert.equal(checkImageFile(fileOf(1000, type)), '', type);
  assert.equal(checkImageFile(fileOf(IMAGE_RULES.logo.maxBytes, 'image/png')), '', 'exactement la limite');
});

test('checkImageFile refuses another format, naming the accepted ones', () => {
  const message = 'Ce fichier n’est pas une image acceptée : choisissez un fichier PNG, JPG, WebP ou SVG.';
  for (const type of ['image/gif', 'application/pdf', 'text/html', 'image/x-icon', '']) {
    assert.equal(checkImageFile(fileOf(1000, type)), message, type || '(sans type)');
  }
  assert.equal(checkImageFile(undefined), message);
  assert.equal(checkImageFile(null), message);
  assert.equal(checkImageFile(fileOf(1000, 'image/gif'), { types: ['image/png', 'image/jpeg'], maxBytes: 10 }),
    'Ce fichier n’est pas une image acceptée : choisissez un fichier PNG ou JPG.');
});

test('checkImageFile refuses an empty file and one that is too heavy, with its size', () => {
  assert.equal(checkImageFile(fileOf(0, 'image/png')), 'Ce fichier est vide : choisissez-en un autre.');
  assert.equal(checkImageFile(fileOf(IMAGE_RULES.logo.maxBytes + 1, 'image/png')),
    'Cette image pèse 1,1 Mo : choisissez-en une de 1 Mo au plus.');
  assert.equal(checkImageFile(fileOf(3 * 1024 * 1024, 'image/jpeg'), { types: ['image/jpeg'], maxBytes: 2 * 1024 * 1024 }),
    'Cette image pèse 3 Mo : choisissez-en une de 2 Mo au plus.');
});

test('fitWithin shrinks to the longest side, keeps the proportions, and enlarges only on request', () => {
  assert.deepEqual(fitWithin(960, 320, 480), { width: 480, height: 160 });
  assert.deepEqual(fitWithin(320, 960, 480), { width: 160, height: 480 });
  assert.deepEqual(fitWithin(300, 100, 480), { width: 300, height: 100 }, 'un petit logo n’est pas agrandi');
  assert.deepEqual(fitWithin(300, 100, 480, { upscale: true }), { width: 480, height: 160 }, 'un SVG se dessine à la taille voulue');
  assert.deepEqual(fitWithin(480, 480, 480), { width: 480, height: 480 });
  assert.deepEqual(fitWithin(1, 4000, 480), { width: 1, height: 480 }, 'jamais moins d’un pixel');
  assert.deepEqual(fitWithin(0, 0, 480), { width: 0, height: 0 });
});

test('prepareImage refuses a bad file before reading or drawing anything', async () => {
  const refused = async file => {
    try {
      await prepareImage(file);
    } catch (error) {
      assert.ok(error instanceof ImageError);
      return error.message;
    }
    return assert.fail('devait être refusé');
  };
  assert.match(await refused(fileOf(10, 'application/pdf')), /pas une image acceptée/);
  assert.match(await refused(fileOf(IMAGE_RULES.logo.maxBytes + 1, 'image/png')), /pèse 1,1 Mo/);
  assert.match(await refused(fileOf(0, 'image/png')), /vide/);
});

// ===== La photo de profil : carrée, en JPEG, 256 px, 2 Mo au plus =====

test('the avatar rules ask for a square JPEG of 256 px at most, from a JPG, PNG or WebP of 2 Mo at most', () => {
  const rules = IMAGE_RULES.avatar;
  assert.deepEqual(rules.types, ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(rules.maxBytes, 2 * 1024 * 1024);
  assert.equal(rules.maxSide, 256);
  assert.equal(rules.square, true);
  assert.equal(rules.output, 'image/jpeg');
  assert.ok(rules.quality > 0 && rules.quality <= 1);
  assert.equal(rules.name, 'photo-de-profil.jpg');
  assert.equal(IMAGE_RULES.logo.output, 'image/png', 'le logo reste un PNG');
  assert.equal(IMAGE_RULES.logo.name, 'logo.png');
  assert.equal(IMAGE_RULES.logo.square, undefined, 'un logo garde ses proportions');
});

test('checkImageFile applies the avatar rules: no SVG (it can carry a script), 2 Mo at most', () => {
  const rules = IMAGE_RULES.avatar;
  for (const type of rules.types) assert.equal(checkImageFile(fileOf(1000, type, 'moi'), rules), '', type);
  assert.equal(checkImageFile(fileOf(rules.maxBytes, 'image/jpeg'), rules), '', 'exactement la limite');
  assert.equal(checkImageFile(fileOf(1000, 'image/svg+xml'), rules),
    'Ce fichier n’est pas une image acceptée : choisissez un fichier JPG, PNG ou WebP.');
  assert.equal(checkImageFile(fileOf(1000, 'image/gif'), rules),
    'Ce fichier n’est pas une image acceptée : choisissez un fichier JPG, PNG ou WebP.');
  assert.equal(checkImageFile(fileOf(rules.maxBytes + 1, 'image/png'), rules),
    'Cette image pèse 2,1 Mo : choisissez-en une de 2 Mo au plus.');
  assert.equal(checkImageFile(fileOf(0, 'image/png'), rules), 'Ce fichier est vide : choisissez-en un autre.');
});

test('squareCrop cuts the centre square and never enlarges a small photo', () => {
  assert.deepEqual(squareCrop(600, 400, 256), { x: 100, y: 0, side: 400, size: 256 }, 'paysage : les côtés sont coupés');
  assert.deepEqual(squareCrop(400, 600, 256), { x: 0, y: 100, side: 400, size: 256 }, 'portrait : le haut et le bas sont coupés');
  assert.deepEqual(squareCrop(500, 500, 256), { x: 0, y: 0, side: 500, size: 256 }, 'déjà carrée');
  assert.deepEqual(squareCrop(120, 80, 256), { x: 20, y: 0, side: 80, size: 80 }, 'une petite photo garde sa taille');
  assert.deepEqual(squareCrop(5, 4001, 256), { x: 0, y: 1998, side: 5, size: 5 });
  assert.deepEqual(squareCrop(601, 400, 256), { x: 100, y: 0, side: 400, size: 256 }, 'un reste impair est arrondi vers le bas');
  assert.deepEqual(squareCrop(0, 0, 256), { x: 0, y: 0, side: 0, size: 0 });
  assert.deepEqual(squareCrop(300, 0, 256), { x: 0, y: 0, side: 0, size: 0 });
});

test('prepareImage with the avatar rules refuses a bad file before drawing anything', async () => {
  const refused = async file => {
    try {
      await prepareImage(file, IMAGE_RULES.avatar);
    } catch (error) {
      assert.ok(error instanceof ImageError);
      return error.message;
    }
    return assert.fail('devait être refusé');
  };
  assert.match(await refused(fileOf(10, 'image/svg+xml')), /JPG, PNG ou WebP/);
  assert.match(await refused(fileOf(IMAGE_RULES.avatar.maxBytes + 1, 'image/jpeg')), /pèse 2,1 Mo/);
  assert.match(await refused(fileOf(0, 'image/png')), /vide/);
});
