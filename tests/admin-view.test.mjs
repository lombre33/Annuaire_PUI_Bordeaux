import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, filterRequests, etablissementsOf, pageOf, bulkTargets } from '../admin-view.js';

// ===== admin-view : filtrer, paginer et choisir ce qu'un seul geste peut valider =====

const people = {
  1: { name: 'Ana Martin', etablissement: 'CHU', search: 'ana martin' },
  2: { name: 'Bob Durand', etablissement: 'UBM' }, // sans clé de recherche mémorisée : calculée à la volée
  3: { name: 'Gina Bergonié', etablissement: 'Institut Bergonié', search: 'gina bergonie' },
  4: { name: 'Zoé Sansétablissement', etablissement: '' },
  5: { name: 'Éric Émile', etablissement: 'chu' }
};
const person = id => people[id] ?? null;
const request = (id, personId) => ({ id, personId });
const ids = requests => requests.map(entry => entry.id);

const all = [request(10, 1), request(11, 2), request(12, 3), request(13, 4), request(14, 99), request(15, 5)];

test('filterRequests returns the very same list when there is nothing to filter on', () => {
  assert.equal(filterRequests(all, {}, person), all);
  assert.equal(filterRequests(all, { query: '', etablissement: '' }, person), all);
  assert.equal(filterRequests(all, { query: '   ' }, person), all, 'des espaces ne sont pas une recherche');
  assert.equal(filterRequests(all, undefined, person), all);
});

test('filterRequests searches the name of the person, ignoring case and accents', () => {
  assert.deepEqual(ids(filterRequests(all, { query: 'martin' }, person)), [10]);
  assert.deepEqual(ids(filterRequests(all, { query: 'DURAND' }, person)), [11], 'clé calculée quand elle n\'est pas mémorisée');
  assert.deepEqual(ids(filterRequests(all, { query: 'bergonie' }, person)), [12]);
  assert.deepEqual(ids(filterRequests(all, { query: 'Bergonié' }, person)), [12]);
  assert.deepEqual(ids(filterRequests(all, { query: 'zoe' }, person)), [13]);
  assert.deepEqual(ids(filterRequests(all, { query: 'eric emile' }, person)), [15]);
  assert.deepEqual(ids(filterRequests(all, { query: 'zzz' }, person)), []);
});

test('filterRequests matches a part of the name anywhere in it', () => {
  assert.deepEqual(ids(filterRequests(all, { query: 'an' }, person)), [10, 11, 13], 'Ana, Durand, Sansétablissement');
  assert.deepEqual(ids(filterRequests(all, { query: 'ana m' }, person)), [10]);
});

test('filterRequests keeps only the people of the chosen establishment, exactly as written', () => {
  assert.deepEqual(ids(filterRequests(all, { etablissement: 'CHU' }, person)), [10]);
  assert.deepEqual(ids(filterRequests(all, { etablissement: 'chu' }, person)), [15], 'le libellé est celui du menu, pas une recherche');
  assert.deepEqual(ids(filterRequests(all, { etablissement: 'Institut Bergonié' }, person)), [12]);
  assert.deepEqual(ids(filterRequests(all, { etablissement: 'Inconnu' }, person)), []);
});

test('filterRequests combines the name and the establishment', () => {
  assert.deepEqual(ids(filterRequests(all, { query: 'ana', etablissement: 'CHU' }, person)), [10]);
  assert.deepEqual(ids(filterRequests(all, { query: 'bob', etablissement: 'CHU' }, person)), []);
});

test('filterRequests drops a request whose person cannot be found as soon as a filter is set, and only then', () => {
  assert.ok(ids(filterRequests(all, {}, person)).includes(14));
  assert.ok(!ids(filterRequests(all, { query: 'a' }, person)).includes(14));
  assert.ok(!ids(filterRequests(all, { etablissement: 'CHU' }, person)).includes(14));
});

test('filterRequests does not look people up when there is no filter, and once per request when there is one', () => {
  let lookups = 0;
  const counting = id => { lookups += 1; return person(id); };
  filterRequests(all, {}, counting);
  assert.equal(lookups, 0);
  filterRequests(all, { query: 'ana', etablissement: 'CHU' }, counting);
  assert.ok(lookups <= all.length, `${lookups} recherches pour ${all.length} demandes`);
});

test('etablissementsOf lists each establishment once, sorted like the French alphabet, skipping unknown or empty ones', () => {
  assert.deepEqual(etablissementsOf(all, person), ['chu', 'CHU', 'Institut Bergonié', 'UBM']);
  assert.deepEqual(etablissementsOf([], person), []);
  assert.deepEqual(etablissementsOf([request(1, 99), request(2, 4)], person), []);
  assert.deepEqual(etablissementsOf([request(1, 1), request(2, 1), request(3, 1)], person), ['CHU']);
});

test('pageOf shows the first requests and counts the rest', () => {
  const list = Array.from({ length: 120 }, (_, index) => request(index + 1, 1));
  const first = pageOf(list, PAGE_SIZE);
  assert.equal(first.items.length, 50);
  assert.equal(first.rest, 70);
  assert.equal(first.items[0].id, 1);
  assert.equal(first.items.at(-1).id, 50);
  assert.deepEqual({ items: pageOf(list, 100).items.length, rest: pageOf(list, 100).rest }, { items: 100, rest: 20 });
  assert.deepEqual({ items: pageOf(list, 500).items.length, rest: pageOf(list, 500).rest }, { items: 120, rest: 0 });
  assert.deepEqual(pageOf([], PAGE_SIZE), { items: [], rest: 0 });
});

test('the first page holds 50 requests, so that thousands of them never reach the page at once', () => {
  assert.equal(PAGE_SIZE, 50);
});

test('bulkTargets keeps the requests that pass every check and whose person has not changed, in order', () => {
  const descriptions = {
    10: { canValidate: true, warnings: [] },
    11: { canValidate: true, warnings: ['Fonction : la fiche a changé depuis la demande (valeur actuelle : X).'] },
    12: { canValidate: false, warnings: [] },
    13: { canValidate: true, warnings: [] },
    14: { canValidate: false, warnings: ['x'] }
  };
  const describe = entry => descriptions[entry.id];
  assert.deepEqual(bulkTargets(all.slice(0, 5), describe), [10, 13]);
  assert.deepEqual(bulkTargets([], describe), []);
});

test('bulkTargets describes each request once', () => {
  const seen = [];
  bulkTargets(all, entry => {
    seen.push(entry.id);
    return { canValidate: false, warnings: [] };
  });
  assert.deepEqual(seen, [10, 11, 12, 13, 14, 15]);
});
