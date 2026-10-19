import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadThenRecheck } from '../save-upload.js';

// ===== save-upload : envoyer le fichier d'une modification puis relire l'état de la fiche, avant d'écrire (commun à
// profile-save.js et à etablissement-save.js, dont les tests couvrent le détail de chaque enregistrement). =====

class SaveError extends Error {
  constructor(message, cause, { leftover = null } = {}) {
    super(message, { cause });
    this.name = 'SaveError';
    this.leftover = leftover;
  }
}
class UploadFault extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadError';
  }
}

const FILE = { blob: 'octets', name: 'logo.png' };
const FALLBACK = 'La modification n’a pas pu être enregistrée.';
const CONSOLE_LINE = '[TEST] envoi impossible :';

function setup({ upload, recheck } = {}) {
  const calls = [];
  const lines = [];
  const options = {
    upload: upload ?? (async file => { calls.push(['upload', file]); return 77; }),
    recheck: recheck ?? (async () => { calls.push(['recheck']); return { status: 'ready' }; }),
    ErrorClass: SaveError,
    fallback: FALLBACK,
    consoleLine: CONSOLE_LINE,
    log: { error: (...args) => lines.push(args) }
  };
  return { calls, lines, options };
}

test('uploadThenRecheck envoie le fichier, relit l\'état ensuite, et rend l\'identifiant et l\'état', async () => {
  const { calls, options } = setup();
  const result = await uploadThenRecheck(FILE, options);
  assert.deepEqual(result, { attachmentId: 77, state: { status: 'ready' } });
  assert.deepEqual(calls, [['upload', FILE], ['recheck']], 'l\'envoi d\'abord, la relecture après');
});

test('uploadThenRecheck rend la phrase d\'un UploadError telle quelle, sans rien écrire dans la console, et ne relit rien', async () => {
  const fault = new UploadFault('Grist a refusé le fichier : il est trop volumineux.');
  const { calls, lines, options } = setup({ upload: async () => { throw fault; } });
  await assert.rejects(uploadThenRecheck(FILE, options), error => {
    assert.ok(error instanceof SaveError);
    assert.equal(error.message, fault.message);
    assert.equal(error.cause, fault, 'l\'erreur d\'origine est gardée');
    assert.equal(error.leftover, null, 'rien n\'a été envoyé : rien ne traîne');
    return true;
  });
  assert.deepEqual(lines, []);
  assert.deepEqual(calls, [], 'pas de relecture après un envoi raté');
});

test('uploadThenRecheck dit la phrase de repli pour toute autre erreur, garde la cause dans la console et jamais son texte', async () => {
  const fault = new Error('boom 500 pour ana.martin@chu-bordeaux.fr');
  const { lines, options } = setup({ upload: async () => { throw fault; } });
  await assert.rejects(uploadThenRecheck(FILE, options), error => {
    assert.ok(error instanceof SaveError);
    assert.equal(error.message, FALLBACK);
    assert.doesNotMatch(error.message, /boom/);
    assert.equal(error.cause, fault);
    return true;
  });
  assert.deepEqual(lines, [[CONSOLE_LINE, fault]], 'la ligne de console de l\'appelant, avec la cause');
});

test('uploadThenRecheck marque le fichier envoyé comme resté dans Grist quand la relecture refuse l\'enregistrement', async () => {
  const refusal = new SaveError('Cet établissement n’existe plus dans Grist : rien n’a été modifié.');
  const { options } = setup({ recheck: async () => { throw refusal; } });
  await assert.rejects(uploadThenRecheck(FILE, options), error => {
    assert.equal(error, refusal, 'la même erreur, complétée');
    assert.equal(error.leftover, 77);
    return true;
  });
});

test('uploadThenRecheck laisse passer une erreur imprévue de la relecture, sans lui poser d\'identifiant', async () => {
  const unexpected = new TypeError('inattendu');
  const { options } = setup({ recheck: async () => { throw unexpected; } });
  await assert.rejects(uploadThenRecheck(FILE, options), error => {
    assert.equal(error, unexpected);
    assert.equal('leftover' in error, false);
    return true;
  });
});
