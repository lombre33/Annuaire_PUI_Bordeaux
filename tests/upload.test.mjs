import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UploadError, uploadAttachment } from '../upload.js';
import { PHOTO_UPLOAD_HINT } from '../profile-save.js';
import { createFakeGrist, FAKE_ATTACHMENTS_URL } from './support/fake-grist.js';

// ===== upload : l'envoi d'un fichier dans les pièces jointes du document (la seule requête réseau
// du widget). Grist et le réseau sont simulés ; l'envoi réel est essayé dans Chromium
// (tests/e2e-etablissement.test.mjs). =====

const FILE = { blob: new Blob(['contenu'], { type: 'image/png' }), name: 'logo.png' };

const recordingLog = () => {
  const lines = [];
  return { lines, warn: (...args) => lines.push(args.map(String).join(' ')), info: (...args) => lines.push(args.map(String).join(' ')), error: (...args) => lines.push(args.map(String).join(' ')) };
};

// Un « fetch » qui répond ce qu'on lui dit et se souvient de la requête.
function answering(...answers) {
  const requests = [];
  const queue = [...answers];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (typeof next === 'function') return next(options);
    return next;
  };
  return { fetchImpl, requests };
}
const ok = ids => ({ ok: true, status: 200, json: async () => ids });
const status = code => ({ ok: false, status: code, json: async () => ({}) });

const send = (docApi, { fetchImpl, ...options }, file = FILE, more = {}) => uploadAttachment(docApi, file, { fetchImpl, log: recordingLog(), ...options, ...more });
const rejection = async promise => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UploadError, `une UploadError, pas ${error}`);
    return error;
  }
  return assert.fail('devait être refusé');
};

test('uploadAttachment asks Grist for a write token, posts the file as multipart and returns the attachment id', async () => {
  const fake = createFakeGrist({});
  const server = answering(ok([2001]));
  const id = await send(fake.docApi, server);
  assert.equal(id, 2001);
  assert.deepEqual(fake.tokenRequests, [{ readOnly: false }], 'un jeton en écriture, demandé pour cet envoi');
  const [{ url, options }] = server.requests;
  assert.equal(url, `${FAKE_ATTACHMENTS_URL}/attachments?auth=fake-token`);
  assert.equal(options.method, 'POST');
  assert.ok(options.body instanceof FormData);
  const sent = options.body.get('upload');
  assert.equal(sent.name, 'logo.png');
  assert.equal(sent.type, 'image/png');
  assert.equal(await sent.text(), 'contenu');
  assert.deepEqual([...options.body.keys()], ['upload']);
});

test('uploadAttachment sends the X-Requested-With header Grist requires of an access token, and no Content-Type of its own', async () => {
  const server = answering(ok([7]));
  await send(createFakeGrist({}).docApi, server);
  const { headers } = server.requests[0].options;
  assert.deepEqual(headers, { 'X-Requested-With': 'XMLHttpRequest' }, 'sans lui, Grist répond 401 sans en-têtes CORS et le navigateur ne montre qu\'une panne de réseau');
  assert.ok(!Object.keys(headers).some(name => name.toLowerCase() === 'content-type'), 'le navigateur écrit lui-même le Content-Type du multipart, avec sa limite');
});

test('uploadAttachment sends no cookie and no referrer, and gives up after a delay', async () => {
  const server = answering(ok([5]));
  await send(createFakeGrist({}).docApi, server);
  const { options } = server.requests[0];
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.ok(options.signal instanceof AbortSignal, 'une requête qui ne répond jamais finit par être abandonnée');
});

test('uploadAttachment never keeps the write token: each upload asks for its own', async () => {
  const fake = createFakeGrist({});
  const server = answering(ok([1]), ok([2]));
  await send(fake.docApi, server);
  await send(fake.docApi, server);
  assert.equal(fake.tokenRequests.length, 2);
  assert.ok(fake.tokenRequests.every(request => request.readOnly === false));
});

test('uploadAttachment encodes the token in the address', async () => {
  const fake = createFakeGrist({ accessToken: { token: 'a b&c=d/é', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: 1000 } });
  const server = answering(ok([1]));
  await send(fake.docApi, server);
  assert.equal(server.requests[0].url, `${FAKE_ATTACHMENTS_URL}/attachments?auth=${encodeURIComponent('a b&c=d/é')}`);
});

test('uploadAttachment sends nothing when Grist refuses the token or answers something unusable', async () => {
  for (const accessToken of [null, { baseUrl: FAKE_ATTACHMENTS_URL }, { token: '', baseUrl: FAKE_ATTACHMENTS_URL }, { token: 'x', baseUrl: 'pas une adresse' }]) {
    const fake = createFakeGrist({ accessToken });
    const server = answering(ok([1]));
    const error = await rejection(send(fake.docApi, server));
    assert.match(error.message, /n’a pas donné au widget l’autorisation d’envoyer un fichier/, JSON.stringify(accessToken));
    assert.equal(server.requests.length, 0);
  }
});

test('uploadAttachment sends nothing to an address that is neither https nor the local machine', async () => {
  for (const baseUrl of ['http://docs.getgrist.com/api/docs/x', 'ftp://example.com/x', 'http://127.0.0.1.evil.example/api/docs/x']) {
    const fake = createFakeGrist({ accessToken: { token: 'secret', baseUrl, ttlMsecs: 1000 } });
    const server = answering(ok([1]));
    const error = await rejection(send(fake.docApi, server));
    assert.match(error.message, /adresse d’envoi que le widget n’accepte pas|n’a pas donné au widget/, baseUrl);
    assert.equal(server.requests.length, 0, `rien n’est envoyé à ${baseUrl}`);
  }
  for (const baseUrl of ['http://localhost:8484/api/docs/x', 'http://127.0.0.1:8484/api/docs/x', 'http://[::1]:8484/api/docs/x']) {
    const fake = createFakeGrist({ accessToken: { token: 'secret', baseUrl, ttlMsecs: 1000 } });
    const server = answering(ok([1]));
    assert.equal(await send(fake.docApi, server), 1, `le poste local reste permis (${baseUrl})`);
  }
});

test('uploadAttachment tells a refusal for rights, size or anything else, in French', async () => {
  const cases = [
    [401, /vos droits ne permettent pas d’ajouter une pièce jointe/],
    [403, /vos droits ne permettent pas d’ajouter une pièce jointe/],
    [413, /il est trop volumineux/],
    [500, /\(erreur 500\).*Réessayez ; déposez le fichier directement dans Grist/],
    [404, /\(erreur 404\)/]
  ];
  for (const [code, expected] of cases) {
    const error = await rejection(send(createFakeGrist({}).docApi, answering(status(code))));
    assert.match(error.message, expected, String(code));
  }
});

test('uploadAttachment refuses an answer that does not name the new attachment', async () => {
  for (const body of [{}, [], [0], [-1], ['7'], [1.5], null, 'ok', [null]]) {
    const error = await rejection(send(createFakeGrist({}).docApi, answering({ ok: true, status: 200, json: async () => body })));
    assert.match(error.message, /n’a pas confirmé l’envoi du fichier/, JSON.stringify(body));
  }
  const unreadable = await rejection(send(createFakeGrist({}).docApi, answering({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } })));
  assert.match(unreadable.message, /n’a pas confirmé l’envoi du fichier/);
  assert.ok(unreadable.cause instanceof SyntaxError);
});

test('uploadAttachment tells a network failure, a CORS refusal and a timeout apart from a refusal', async () => {
  const network = await rejection(send(createFakeGrist({}).docApi, answering(() => { throw new TypeError('Failed to fetch'); })));
  assert.match(network.message, /le navigateur n’a pas pu joindre le serveur, ou l’a refusé/);
  assert.ok(network.cause instanceof TypeError);

  const hangs = answering(options => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const slow = await rejection(send(createFakeGrist({}).docApi, { ...hangs, timeout: 20 }));
  assert.match(slow.message, /n’a pas répondu à temps/);
});

test('uploadAttachment never writes the token or the address to the console', async () => {
  const log = recordingLog();
  const fake = createFakeGrist({ accessToken: { token: 'jeton-secret-123', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: 1000 } });
  for (const answer of [status(500), status(403), () => { throw new TypeError('Failed to fetch https://docs.getgrist.com/x?auth=jeton-secret-123'); }]) {
    await rejection(uploadAttachment(fake.docApi, FILE, { fetchImpl: answering(answer).fetchImpl, log }));
  }
  const refused = createFakeGrist({ accessToken: null });
  await rejection(uploadAttachment(refused.docApi, FILE, { fetchImpl: answering(ok([1])).fetchImpl, log }));
  assert.ok(log.lines.length > 0);
  const everything = log.lines.join('\n');
  assert.ok(!everything.includes('jeton-secret-123'), 'le jeton ne passe jamais dans la console');
  assert.ok(!everything.includes('docs.getgrist.com'), 'ni l’adresse du document');
});

// ===== La phrase qui dit quoi faire : pour une photo de profil, prévenir un administrateur =====

test('uploadAttachment says what to do with the hint of the caller: a profile photo asks for an administrator, not for a hand-made upload', async () => {
  const hint = PHOTO_UPLOAD_HINT;
  assert.match(hint, /administrateur/);
  const refusedToken = await rejection(send(createFakeGrist({ accessToken: null }).docApi, answering(ok([1])), FILE, { hint }));
  assert.match(refusedToken.message, /n’a pas donné au widget l’autorisation d’envoyer un fichier\. Contactez un administrateur si le problème persiste\.$/);

  const unreachable = await rejection(send(createFakeGrist({}).docApi, answering(() => { throw new TypeError('Failed to fetch'); }), FILE, { hint }));
  assert.match(unreachable.message, /le navigateur n’a pas pu joindre le serveur, ou l’a refusé\. Contactez un administrateur/);

  const failed = await rejection(send(createFakeGrist({}).docApi, answering(status(500)), FILE, { hint }));
  assert.match(failed.message, /\(erreur 500\)\. Réessayez ; contactez un administrateur si le problème persiste\.$/, 'la phrase suit « Réessayez ; », en minuscule');

  const unconfirmed = await rejection(send(createFakeGrist({}).docApi, answering(ok([])), FILE, { hint }));
  assert.match(unconfirmed.message, /Réessayez ; contactez un administrateur/);

  const hangs = answering(options => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const slow = await rejection(send(createFakeGrist({}).docApi, { ...hangs, timeout: 20 }, FILE, { hint }));
  assert.match(slow.message, /n’a pas répondu à temps à l’envoi du fichier\. Réessayez ; contactez un administrateur/);

  for (const message of [refusedToken, unreachable, failed, unconfirmed, slow].map(error => error.message)) {
    assert.ok(!message.includes('GRIST_SETUP'), `aucune mention du dépôt manuel dans « ${message} »`);
  }
});

test('uploadAttachment keeps the hand-made upload hint for a logo, and the refusals that name no hint', async () => {
  const failed = await rejection(send(createFakeGrist({}).docApi, answering(status(500))));
  assert.match(failed.message, /Réessayez ; déposez le fichier directement dans Grist \(voir GRIST_SETUP\.md\)\.$/);
  for (const [code, expected] of [[403, /Contactez un administrateur\.$/], [413, /il est trop volumineux\.$/]]) {
    const withHint = await rejection(send(createFakeGrist({}).docApi, answering(status(code)), FILE, { hint: PHOTO_UPLOAD_HINT }));
    const without = await rejection(send(createFakeGrist({}).docApi, answering(status(code))));
    assert.equal(withHint.message, without.message, `${code} : le même texte avec ou sans phrase`);
    assert.match(withHint.message, expected);
  }
});
