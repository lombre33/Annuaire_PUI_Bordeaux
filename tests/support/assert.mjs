// Le `assert` des tests : celui de Node (`node:assert/strict`), mais un texte se compare à un autre sans tenir compte de l'espace insécable.
// Le widget écrit une espace insécable (U+00A0) devant « : ; ? ! », dans « » et, fine (U+202F), entre les milliers (tests/typography.test.mjs
// le garde dans le code) ; un test qui cite un message l'écrit comme on le tape, avec une espace ordinaire, et la comparaison les confond.
// Elle ne confond rien d'autre : une espace en trop ou en moins reste une différence. `plain(texte)` rend la même lecture aux tests qui
// comparent autrement qu'avec `assert` (un `includes`, une attente dans la page).

import strict from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const NON_BREAKING = /[\u00a0\u202f]/g;

// Un texte lu sans espace insécable ; tout autre valeur est rendue telle quelle (une comparaison d'identité ne doit rien copier).
const scalar = value => (typeof value === 'string' ? value.replace(NON_BREAKING, ' ') : value);

// Une structure lue de même, en profondeur : les textes d'un tableau ou d'un objet simple. Une instance de classe, un Blob, un Map restent tels quels.
export function plain(value, seen = new WeakSet()) {
  if (typeof value === 'string') return scalar(value);
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map(item => plain(item, seen));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  seen.add(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item, seen)]));
}

const same = name => (actual, expected, message) => strict[name](scalar(actual), scalar(expected), message);
const deep = name => (actual, expected, message) => strict[name](plain(actual), plain(expected), message);

// Ce qu'une erreur doit dire (`throws`, `rejects`) : une expression régulière lit le texte de l'erreur, un objet compare ses propriétés (un
// texte ou une expression régulière pour chacune) ; une classe ou une fonction passent telles quelles.
function tolerant(validator) {
  if (validator instanceof RegExp) return error => validator.test(plain(String(error)));
  if (validator && typeof validator === 'object') {
    return error => Object.entries(validator).every(([key, expected]) => (expected instanceof RegExp
      ? expected.test(plain(String(error?.[key])))
      : isDeepStrictEqual(plain(error?.[key]), plain(expected))));
  }
  return validator;
}

const assert = (value, message) => strict(value, message);
Object.assign(assert, strict, {
  equal: same('equal'),
  notEqual: same('notEqual'),
  strictEqual: same('strictEqual'),
  notStrictEqual: same('notStrictEqual'),
  deepEqual: deep('deepEqual'),
  notDeepEqual: deep('notDeepEqual'),
  deepStrictEqual: deep('deepStrictEqual'),
  notDeepStrictEqual: deep('notDeepStrictEqual'),
  match: (text, pattern, message) => strict.match(scalar(text), pattern, message),
  doesNotMatch: (text, pattern, message) => strict.doesNotMatch(scalar(text), pattern, message),
  throws: (fn, validator, message) => strict.throws(fn, tolerant(validator), message),
  rejects: (promise, validator, message) => strict.rejects(promise, tolerant(validator), message)
});

export default assert;
