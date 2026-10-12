// Ce que montre une photo : seules deux sources existent (voir avatar-ui.js). Le DOM lui-même est
// essayé dans un navigateur (tests/e2e-avatar.test.mjs) ; ici, la règle qui décide d'où une photo peut venir.
import test from 'node:test';
import assert from 'node:assert/strict';

import { photoSource } from '../avatar-ui.js';

test('photoSource: the id of an attachment of Grist is a source', () => {
  assert.deepEqual(photoSource(501), { id: 501 });
  assert.deepEqual(photoSource(1), { id: 1 });
});

test('photoSource: no photo, whatever the empty form: nothing is shown', () => {
  for (const nothing of [0, -1, 1.5, NaN, Infinity, null, undefined, '', '501', [], [501], true, {}, { id: 501 }]) {
    assert.equal(photoSource(nothing), null, `${JSON.stringify(nothing)}`);
  }
});

test('photoSource: the only local image is an address made by the browser itself (blob:), never a foreign address', () => {
  assert.deepEqual(photoSource({ url: 'blob:http://127.0.0.1:8123/6f0c1b5e-1d5e-4a43-a0a6-0b7a8d4d7a11' }), { url: 'blob:http://127.0.0.1:8123/6f0c1b5e-1d5e-4a43-a0a6-0b7a8d4d7a11' });
  for (const foreign of [
    'https://example.org/visage.png', 'http://127.0.0.1/visage.png', '//example.org/visage.png', '/visage.png', 'visage.png',
    'data:image/png;base64,iVBORw0KGgo=', 'javascript:alert(1)', 'file:///etc/passwd', ' blob:http://127.0.0.1/x', 'BLOB:http://127.0.0.1/x'
  ]) {
    assert.equal(photoSource({ url: foreign }), null, foreign);
  }
  for (const odd of [{ url: 5 }, { url: null }, { url: ['blob:x'] }, { url: { toString: () => 'blob:x' } }, 'blob:http://127.0.0.1/x']) {
    assert.equal(photoSource(odd), null, JSON.stringify(odd));
  }
});
