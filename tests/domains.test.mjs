import { test } from 'node:test';
import assert from './support/assert.mjs';
import { cleanDomain, domainMatches, domainsOf, emailDomain, etablissementsForEmail } from '../domains.js';
import { DOMAIN_COLUMN } from './fixtures.mjs';

// ===== domains : les domaines d'adresse que les établissements autorisent (1.45.0) =====

const rows = (...domains) => domains.map((domain, index) => ({ id: index + 1, [DOMAIN_COLUMN]: domain }));

test('cleanDomain reduces what a person typed to a domain, and rejects what is not one', () => {
  assert.equal(cleanDomain('u-bordeaux.example'), 'u-bordeaux.example');
  assert.equal(cleanDomain('  @U-Bordeaux.EXAMPLE '), 'u-bordeaux.example');
  assert.equal(cleanDomain('https://www.u-bordeaux.example/accueil?x=1#top'), 'u-bordeaux.example');
  assert.equal(cleanDomain('*.chu-bordeaux.example'), 'chu-bordeaux.example');
  assert.equal(cleanDomain('mailto:contact@u-bordeaux.example'), '', 'une adresse complète n\'est pas un domaine');
  assert.equal(cleanDomain('chu-bordeaux.example.'), 'chu-bordeaux.example');
  for (const junk of ['', null, undefined, 'n/a', 'sans objet', 'bordeaux', '-x.example', 'a..example', 'a b.example', 42]) assert.equal(cleanDomain(junk), '', `${junk} n'est pas un domaine`);
});

test('domainsOf reads one or several domains from a text or a list cell, without duplicates or junk', () => {
  assert.deepEqual(domainsOf('u-bordeaux.example'), ['u-bordeaux.example']);
  assert.deepEqual(domainsOf('u-bordeaux.example, etu.u-bordeaux.example ; u-bordeaux.example\nchu-bordeaux.example | n/a'), ['u-bordeaux.example', 'etu.u-bordeaux.example', 'chu-bordeaux.example']);
  assert.deepEqual(domainsOf(['L', 'inserm.example', '@Inserm.example', 'bergonie.example']), ['inserm.example', 'bergonie.example']);
  assert.deepEqual(domainsOf(['L']), []);
  assert.deepEqual(domainsOf(''), []);
  assert.deepEqual(domainsOf(null), []);
  assert.deepEqual(domainsOf(undefined), []);
});

test('emailDomain gives the lowercase domain of an address, and nothing for what is not an address', () => {
  assert.equal(emailDomain('Zoe.Nouvelle@CHU-Bordeaux.EXAMPLE'), 'chu-bordeaux.example');
  assert.equal(emailDomain('  a@b.example  '), 'b.example');
  assert.equal(emailDomain('a@b@c.example'), 'c.example', 'le dernier @ sépare le domaine');
  for (const junk of ['', 'sans-arobase', '@b.example', 'a@', null, undefined]) assert.equal(emailDomain(junk), '');
});

test('domainMatches accepts the domain itself and its subdomains, never a longer name that merely ends the same way', () => {
  const listed = ['u-bordeaux.example'];
  assert.equal(domainMatches('u-bordeaux.example', listed), true);
  assert.equal(domainMatches('etu.u-bordeaux.example', listed), true);
  assert.equal(domainMatches('a.b.u-bordeaux.example', listed), true);
  assert.equal(domainMatches('mon-u-bordeaux.example', listed), false, 'sans point, ce n\'est pas un sous-domaine');
  assert.equal(domainMatches('bordeaux.example', listed), false, 'un domaine parent ne suffit pas');
  assert.equal(domainMatches('u-bordeaux.example.evil.example', listed), false);
  assert.equal(domainMatches('', listed), false);
  assert.equal(domainMatches('u-bordeaux.example', []), false);
});

test('etablissementsForEmail lists the établissements whose domain is the one of the address', () => {
  const found = etablissementsForEmail('Zoe@etu.chu-bordeaux.example', rows('chu-bordeaux.example', 'u-bordeaux.example', '', 'chu-bordeaux.example, inserm.example'));
  assert.deepEqual(found, { readable: true, ids: [1, 4], domain: 'etu.chu-bordeaux.example' });
  const none = etablissementsForEmail('zoe@webmail.example', rows('chu-bordeaux.example'));
  assert.deepEqual(none, { readable: true, ids: [], domain: 'webmail.example' });
});

test('etablissementsForEmail is closed by default: no column, no row or no address means no établissement', () => {
  assert.deepEqual(etablissementsForEmail('a@chu-bordeaux.example', [{ id: 1 }, { id: 2 }]), { readable: false, ids: [], domain: 'chu-bordeaux.example' });
  assert.equal(etablissementsForEmail('a@chu-bordeaux.example', []).readable, false, 'une table vide ne dit pas si la colonne existe');
  assert.equal(etablissementsForEmail('a@chu-bordeaux.example', null).readable, false);
  assert.deepEqual(etablissementsForEmail('', rows('chu-bordeaux.example')), { readable: true, ids: [], domain: '' });
  assert.deepEqual(etablissementsForEmail('pas-une-adresse', rows('chu-bordeaux.example')).ids, []);
  assert.deepEqual(etablissementsForEmail('a@chu-bordeaux.example', rows('n/a', '', null)).ids, [], 'un domaine illisible n\'autorise personne');
});
