import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentIds, avatarIdOf, createAttachments } from '../attachments.js';
import { createFakeGrist, FAKE_ATTACHMENTS_URL } from './support/fake-grist.js';

// ===== attachmentIds : les fichiers d'une cellule « Pièces jointes » =====

test('attachmentIds reads the ids of a Grist list cell and ignores the list marker', () => {
  assert.deepEqual(attachmentIds(['L', 12, 13]), [12, 13]);
  assert.deepEqual(attachmentIds(12), [12], 'un identifiant seul');
});

test('attachmentIds returns nothing for an empty or unexpected cell', () => {
  for (const cell of [null, undefined, 0, '', ['L'], [], ['L', 0], 'logo.png', ['L', 'x'], ['L', -3], ['L', 1.5], {}, true]) {
    assert.deepEqual(attachmentIds(cell), [], JSON.stringify(cell));
  }
});

test('attachmentIds keeps only whole positive numbers from a mixed list', () => {
  assert.deepEqual(attachmentIds(['L', 5, 'x', null, 0, 7]), [5, 7]);
});

// ===== avatarIdOf : la photo de profil d'une cellule Avatar =====

test('avatarIdOf gives the first attachment of the cell, and 0 when the person has no photo', () => {
  assert.equal(avatarIdOf(['L', 501]), 501);
  assert.equal(avatarIdOf(['L', 7, 8]), 7, 'plusieurs pièces jointes : on montre la première');
  assert.equal(avatarIdOf(['L', 'x', 9]), 9);
  for (const cell of [null, undefined, 0, '', ['L'], [], ['L', 0], ['L', -1], 'photo.jpg', {}]) {
    assert.equal(avatarIdOf(cell), 0, JSON.stringify(cell));
  }
});

// ===== createAttachments : jeton, adresses, renouvellement =====

function quietLog() {
  const log = { warnings: [], warn: (...args) => log.warnings.push(args) };
  return log;
}

// Une horloge que le test fait avancer, et un faux document dont le jeton change à
// chaque demande (« jeton-1 », « jeton-2 »…) pour reconnaître lequel sert.
function setup({ ttlMsecs = 600000, accessToken, timeout } = {}) {
  const clock = { time: 1_000_000 };
  const log = quietLog();
  let counter = 0;
  const fake = createFakeGrist({
    accessToken: accessToken === undefined ? () => ({ token: `jeton-${++counter}`, baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs }) : accessToken
  });
  const attachments = createAttachments(fake.docApi, { now: () => clock.time, log, ...(timeout && { timeout }) });
  return { clock, log, fake, attachments, requests: () => fake.tokenRequests.length };
}

const MINUTE = 60 * 1000;

test('an address is built from the token Grist delivers, asking for a read-only token', async () => {
  const { attachments, fake } = setup();
  assert.equal(attachments.url(7), null, 'pas de jeton avant la première demande');
  assert.equal(await attachments.ready(), true);
  assert.equal(attachments.url(7), `${FAKE_ATTACHMENTS_URL}/attachments/7/download?auth=jeton-1`);
  assert.deepEqual(fake.tokenRequests, [{ readOnly: true }], 'jamais plus que la lecture');
});

test('the token is requested once and reused, so image addresses stay the same', async () => {
  const { attachments, clock, requests } = setup();
  await attachments.ready();
  const first = attachments.url(7);
  clock.time += 5 * MINUTE;
  assert.equal(await attachments.ready(), true);
  assert.equal(attachments.url(7), first);
  assert.equal(requests(), 1);
});

test('a token is renewed shortly before it expires, not after', async () => {
  const { attachments, clock, requests } = setup({ ttlMsecs: 10 * MINUTE });
  await attachments.ready();
  clock.time += 10 * MINUTE - 31 * 1000;
  await attachments.ready();
  assert.equal(requests(), 1, 'encore 31 s de marge : pas de nouvelle demande');
  clock.time += 2 * 1000;
  assert.equal(await attachments.ready(), true);
  assert.equal(requests(), 2);
  assert.match(attachments.url(7), /auth=jeton-2$/);
});

test('a token past its expiry is never used to build an address', async () => {
  const { attachments, clock } = setup({ ttlMsecs: MINUTE });
  await attachments.ready();
  clock.time += MINUTE + 1;
  assert.equal(attachments.url(7), null);
});

test('simultaneous requests share one call to Grist', async () => {
  const { attachments, requests } = setup();
  const answers = await Promise.all(Array.from({ length: 50 }, () => attachments.ready()));
  assert.ok(answers.every(answer => answer === true));
  assert.equal(requests(), 1);
});

test('without ttlMsecs the token is assumed valid for five minutes', async () => {
  const { attachments, clock } = setup({ accessToken: { token: 't', baseUrl: FAKE_ATTACHMENTS_URL } });
  await attachments.ready();
  clock.time += 4 * MINUTE;
  assert.ok(attachments.url(1));
  clock.time += 2 * MINUTE;
  assert.equal(attachments.url(1), null);
});

test('a token with special characters is encoded in the address', async () => {
  const { attachments } = setup({ accessToken: { token: 'a b&c=d/é', baseUrl: `${FAKE_ATTACHMENTS_URL}/`, ttlMsecs: MINUTE } });
  await attachments.ready();
  assert.equal(attachments.url(3), `${FAKE_ATTACHMENTS_URL}/attachments/3/download?auth=a%20b%26c%3Dd%2F%C3%A9`);
});

test('Grist refusing a token leaves the logos to the text, and says so once', async () => {
  const { attachments, log, requests } = setup({ accessToken: null });
  assert.equal(await attachments.ready(), false);
  assert.equal(attachments.url(7), null);
  assert.equal(requests(), 1);
  assert.equal(log.warnings.length, 1);
  assert.match(String(log.warnings[0][0]), /^\[LOGOS\]/);
});

test('after a refusal Grist is not asked again for thirty seconds, then asked again', async () => {
  let refuse = true;
  const { attachments, clock, requests } = setup({ accessToken: () => (refuse ? null : { token: 'ok', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: MINUTE }) });
  assert.equal(await attachments.ready(), false);
  for (let i = 0; i < 20; i++) assert.equal(await attachments.ready(), false);
  assert.equal(requests(), 1, 'vingt affichages de plus, aucune demande de plus');
  refuse = false;
  clock.time += 31 * 1000;
  assert.equal(await attachments.ready(), true);
  assert.equal(requests(), 2);
  assert.match(attachments.url(1), /auth=ok$/);
});

test('a failed renewal keeps serving the token that is still valid', async () => {
  let refuse = false;
  const { attachments, clock } = setup({ ttlMsecs: 10 * MINUTE, accessToken: () => (refuse ? null : { token: 'premier', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: 10 * MINUTE }) });
  await attachments.ready();
  refuse = true;
  clock.time += 10 * MINUTE - 10 * 1000;
  assert.equal(await attachments.ready(), true, 'le jeton vaut encore dix secondes');
  assert.match(attachments.url(1), /auth=premier$/);
});

test('answers Grist should never give are refused instead of building a broken address', async () => {
  const bad = [
    undefined, null, {}, { token: '', baseUrl: FAKE_ATTACHMENTS_URL }, { token: 5, baseUrl: FAKE_ATTACHMENTS_URL },
    { token: 't' }, { token: 't', baseUrl: 'pas une adresse' }, { token: 't', baseUrl: 'javascript:alert(1)' },
    { token: 't', baseUrl: 'ftp://exemple.example/doc' }, { token: 't', baseUrl: `${FAKE_ATTACHMENTS_URL}?x=1` },
    { token: 't', baseUrl: `${FAKE_ATTACHMENTS_URL}#x` }
  ];
  for (const answer of bad) {
    const log = quietLog();
    const attachments = createAttachments({ getAccessToken: async () => answer }, { log });
    assert.equal(await attachments.ready(), false, String(JSON.stringify(answer)));
    assert.equal(attachments.url(1), null, String(JSON.stringify(answer)));
    assert.equal(log.warnings.length, 1);
  }
});

test('a request Grist never answers gives up after the timeout', async () => {
  const log = quietLog();
  const attachments = createAttachments({ getAccessToken: () => new Promise(() => {}) }, { timeout: 20, log });
  assert.equal(await attachments.ready(), false);
  assert.equal(log.warnings.length, 1);
});

test('a docApi that throws at once is handled like a refusal', async () => {
  const log = quietLog();
  const attachments = createAttachments({ getAccessToken() { throw new Error('boom'); } }, { log });
  assert.equal(await attachments.ready(), false);
  assert.equal(attachments.url(1), null);
});

test('a docApi without getAccessToken (an old Grist) leaves the logos to the text', async () => {
  const log = quietLog();
  const attachments = createAttachments({}, { log });
  assert.equal(await attachments.ready(), false);
  assert.equal(log.warnings.length, 1);
});

// ===== refresh : une image n'a pas pu être chargée =====

test('refresh asks for a new token when the failing address carries the current one', async () => {
  const { attachments, clock, requests } = setup();
  await attachments.ready();
  const failed = attachments.url(7);
  clock.time += 11 * 1000;
  assert.equal(await attachments.refresh(failed), true);
  assert.equal(requests(), 2);
  assert.match(attachments.url(7), /auth=jeton-2$/);
});

test('refresh does not ask again when another image already obtained a newer token', async () => {
  const { attachments, clock, requests } = setup();
  await attachments.ready();
  const old = attachments.url(7);
  clock.time += 11 * 1000;
  await attachments.refresh(old); // la première image en erreur renouvelle le jeton
  assert.equal(await attachments.refresh(old), true, 'la deuxième peut réessayer avec le nouveau');
  assert.equal(requests(), 2);
});

test('a hundred images failing at once cost a single new token', async () => {
  const { attachments, clock, requests } = setup();
  await attachments.ready();
  const failed = attachments.url(7);
  clock.time += 11 * 1000;
  await Promise.all(Array.from({ length: 100 }, () => attachments.refresh(failed)));
  assert.equal(requests(), 2);
});

test('refresh does not blame the token for a failure right after getting it: a deleted file must not cost a request each time', async () => {
  const { attachments, requests } = setup();
  await attachments.ready();
  assert.equal(await attachments.refresh(attachments.url(7)), false);
  assert.equal(requests(), 1);
});

test('refresh gets a token when none is held, for instance after it expired', async () => {
  const { attachments, clock, requests } = setup({ ttlMsecs: MINUTE });
  await attachments.ready();
  const failed = attachments.url(7);
  clock.time += 2 * MINUTE;
  assert.equal(await attachments.refresh(failed), true);
  assert.equal(requests(), 2);
});

test('refresh reports false when Grist refuses the new token', async () => {
  let refuse = false;
  const { attachments, clock } = setup({ ttlMsecs: MINUTE, accessToken: () => (refuse ? null : { token: 'a', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: MINUTE }) });
  await attachments.ready();
  const failed = attachments.url(7);
  refuse = true;
  clock.time += 2 * MINUTE;
  assert.equal(await attachments.refresh(failed), false);
});

// ===== stats : de quoi dire en une ligne de console ce que Grist a donné =====

test('stats counts the requests made to Grist and how many failed, and never gives the token', async () => {
  let refuse = false;
  const { attachments, clock } = setup({ ttlMsecs: MINUTE, accessToken: () => (refuse ? null : { token: 'jeton-secret', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: MINUTE }) });
  assert.deepEqual(attachments.stats(), { requested: 0, failed: 0 });
  await Promise.all(Array.from({ length: 20 }, () => attachments.ready()));
  assert.deepEqual(attachments.stats(), { requested: 1, failed: 0 }, 'vingt images, une demande');
  refuse = true;
  clock.time += 2 * MINUTE;
  assert.equal(await attachments.ready(), false);
  assert.deepEqual(attachments.stats(), { requested: 2, failed: 1 });
  assert.doesNotMatch(JSON.stringify(attachments.stats()), /jeton-secret/);
  attachments.stats().requested = 99;
  assert.equal(attachments.stats().requested, 2, 'une copie : la modifier ne change pas le compte');
});
