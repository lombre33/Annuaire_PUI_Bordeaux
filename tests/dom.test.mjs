import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural, formatDate } from '../dom.js';

// ===== dom : les deux petits outils qui ne touchent pas au DOM =====

// Les dates s'écrivent dans le fuseau du navigateur : on fixe le fuseau pour que le test
// dise la même chose partout.
process.env.TZ = 'UTC';

test('plural adds the s from two, never to zero or one', () => {
  assert.equal(plural(0, 'champ'), '0 champ');
  assert.equal(plural(1, 'champ'), '1 champ');
  assert.equal(plural(2, 'champ'), '2 champs');
  assert.equal(plural(12, 'demande'), '12 demandes');
});

test('formatDate writes a Grist date (seconds since 1970) as the day and the month, in French', () => {
  assert.equal(formatDate(1760100000), '10 oct.');
  assert.equal(formatDate('1760100000'), '10 oct.', 'Grist rend parfois un nombre en texte');
  assert.equal(formatDate(1760100000.7), '10 oct.', 'une date Grist porte des fractions de seconde');
  assert.equal(formatDate(1767225600), '1 janv.');
});

test('formatDate says nothing for what is not a date, instead of failing or writing a wrong one', () => {
  for (const value of [undefined, null, '', '  ', 'bientôt', NaN, 0, -1, -1760100000, Infinity, -Infinity, {}, [], [1760100000], true, false, () => 1]) {
    assert.equal(formatDate(value), '', String(typeof value === 'function' ? 'function' : JSON.stringify(value) ?? value));
  }
});

test('formatDate does not throw on a number the calendar cannot hold, such as one a hostile row could carry', () => {
  assert.equal(formatDate(1e20), '');
  assert.equal(formatDate(Number.MAX_SAFE_INTEGER), '');
  assert.equal(formatDate(8.64e12 + 1), '');
  assert.notEqual(formatDate(8.64e12), '', 'la dernière date que le calendrier sait écrire');
});
