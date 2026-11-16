// D'où la fenêtre « Documentation » lit ses documents (docs-source.js) : la liste des documents, où mène chaque lien, d'où vient chaque
// image, et la seule requête réseau de la fenêtre, un GET d'un fichier de cette liste vers la même origine que le widget.

import { test, mock } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_PAGES, DocError, fetchDocument, fileUrl, pageOf, resolveImage, resolveLink } from '../docs-source.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://exemple.test/Widget/index.html';

// ===== La liste des documents =====

test('DOC_PAGES : des fichiers Markdown du dépôt qui existent, sans doublon, le premier est la présentation', () => {
  assert.ok(DOC_PAGES.length >= 5);
  assert.equal(DOC_PAGES[0].path, 'README.md', 'la fenêtre s\'ouvre sur la présentation');
  assert.equal(new Set(DOC_PAGES.map(page => page.path)).size, DOC_PAGES.length);
  assert.equal(new Set(DOC_PAGES.map(page => page.label)).size, DOC_PAGES.length, 'deux documents ne portent pas le même nom');
  for (const { path: file, label } of DOC_PAGES) {
    assert.match(file, /^[A-Za-z0-9_][\w./-]*\.md$/, `${file} : un chemin du dépôt vers un fichier .md`);
    assert.ok(!file.includes('..') && !file.includes('//'), file);
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} n'existe pas : le retirer de DOC_PAGES (docs-source.js) ou le rétablir`);
    assert.ok(label.trim() && label.length <= 24, `${file} : un nom court`);
  }
});

test('chaque document de docs/ et chaque document de la racine cité par le README est dans la fenêtre, sauf ceux qui n\'ont rien à y faire', () => {
  // Ce qui n'est pas lu dans la fenêtre : la règle de sécurité de GitHub (SECURITY.md) et le numéro de version (VERSION.md).
  const left = new Set(['SECURITY.md', 'VERSION.md']);
  const inWindow = new Set(DOC_PAGES.map(page => page.path));
  const missing = fs.readdirSync(path.join(ROOT, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`).filter(file => !inWindow.has(file));
  assert.deepEqual(missing, [], 'Un document de docs/ manque à DOC_PAGES (docs-source.js) : la fenêtre ne le montre pas.');
  const rootDocs = fs.readdirSync(ROOT).filter(name => name.endsWith('.md') && !left.has(name));
  assert.deepEqual(rootDocs.filter(name => !inWindow.has(name)), [], 'Un document de la racine manque à DOC_PAGES (ou à la liste de ceux qu\'on laisse dehors, ici).');
});

test('pageOf ne connaît que les documents de la liste, au chemin exact', () => {
  assert.equal(pageOf('docs/securite.md').label, 'Sécurité');
  for (const other of ['', 'securite.md', './README.md', 'docs/../README.md', '/README.md', 'README.md?x=1', 'README.md#a', 'readme.md', 'constants.js', 'https://exemple.test/README.md']) {
    assert.equal(pageOf(other), null, other);
  }
});

// ===== Les liens =====

test('un lien du document : ancre, autre document (avec son ancre), page https ; tout le reste n\'est pas un lien', () => {
  assert.deepEqual(resolveLink('README.md', '#ce-que-fait-le-widget'), { kind: 'anchor', anchor: 'ce-que-fait-le-widget' });
  assert.deepEqual(resolveLink('README.md', '#ma-pr%C3%A9sence'), { kind: 'anchor', anchor: 'ma-présence' }, 'une ancre encodée est décodée');
  assert.deepEqual(resolveLink('README.md', 'docs/utilisateurs.md#lire-une-carte'), { kind: 'doc', page: 'docs/utilisateurs.md', anchor: 'lire-une-carte' });
  assert.deepEqual(resolveLink('README.md', 'docs/securite.md'), { kind: 'doc', page: 'docs/securite.md', anchor: '' });
  assert.deepEqual(resolveLink('docs/utilisateurs.md', '../README.md#installer-dans-grist'), { kind: 'doc', page: 'README.md', anchor: 'installer-dans-grist' });
  assert.deepEqual(resolveLink('docs/utilisateurs.md', 'securite.md'), { kind: 'doc', page: 'docs/securite.md', anchor: '' });
  assert.deepEqual(resolveLink('docs/utilisateurs.md', './securite.md#a'), { kind: 'doc', page: 'docs/securite.md', anchor: 'a' });
  assert.deepEqual(resolveLink('docs/maintenance.md', '../GRIST_SETUP.md'), { kind: 'doc', page: 'GRIST_SETUP.md', anchor: '' });
  assert.deepEqual(resolveLink('README.md', ' https://example.org/a b '.trim().replace(' ', '%20')), { kind: 'external', href: 'https://example.org/a%20b' });
  assert.deepEqual(resolveLink('README.md', 'HTTPS://Example.org/x'), { kind: 'external', href: 'https://example.org/x' });
});

test('une adresse qui n\'est pas à suivre n\'est pas un lien : autre protocole, fichier hors liste, chemin qui sort du dépôt', () => {
  for (const href of [
    'javascript:alert(1)', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd',
    'http://example.org/page', 'mailto:quelquun@example.org', 'tel:x', 'blob:https://exemple.test/x', '//example.org/page', 'ftp://example.org/x',
    '/README.md', '\\README.md', '..\\README.md', '../README.md', '../../etc/passwd', 'docs/../../README.md', 'constants.js', 'docs/images/apercu.png',
    'grist_structure.txt', 'LICENSE', 'VERSION.md', 'SECURITY.md', 'docs/inconnu.md', 'https:', 'https://', '', '   '
  ]) {
    const result = resolveLink('README.md', href);
    assert.equal(result.kind, 'none', `« ${href} » ne mène nulle part`);
  }
  assert.equal(resolveLink('docs/utilisateurs.md', '../../README.md').kind, 'none', 'un chemin qui remonte hors du dépôt');
});

// ===== Les images =====

test('une image du document : un fichier image du dépôt, jamais une adresse extérieure', () => {
  assert.equal(resolveImage('README.md', 'docs/images/apercu.png', BASE), 'https://exemple.test/Widget/docs/images/apercu.png');
  assert.equal(resolveImage('docs/utilisateurs.md', 'images/recherche.png', BASE), 'https://exemple.test/Widget/docs/images/recherche.png');
  assert.equal(resolveImage('docs/utilisateurs.md', '../docs/images/recherche.png?v=2#x', BASE), 'https://exemple.test/Widget/docs/images/recherche.png');
  assert.equal(resolveImage('README.md', 'assets/logo.SVG', BASE), 'https://exemple.test/Widget/assets/logo.SVG');
  for (const src of [
    'https://img.shields.io/badge/x-y-green', 'http://example.org/a.png', '//example.org/a.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)',
    'blob:https://exemple.test/x', '/docs/images/apercu.png', '../x.png', 'docs/../../x.png', 'docs/images/', 'docs/page.md', 'script.js', 'x.png.exe', 'a.png/b', '']) {
    assert.equal(resolveImage('README.md', src, BASE), null, `« ${src} » n'est pas chargée`);
  }
});

test('fileUrl : toujours sur l\'origine de la page du widget', () => {
  assert.equal(fileUrl('docs/securite.md', BASE), 'https://exemple.test/Widget/docs/securite.md');
  assert.equal(fileUrl('README.md', 'https://exemple.test/Widget/index.html?a=1#b'), 'https://exemple.test/Widget/README.md');
  assert.equal(fileUrl('README.md', 'http://127.0.0.1:8123/index.html'), 'http://127.0.0.1:8123/README.md');
  assert.throws(() => fileUrl('//example.org/x.md', BASE), DocError);
  assert.throws(() => fileUrl('https://example.org/x.md', BASE), DocError);
});

// ===== La requête =====

const reply = (body, init = {}) => ({ ok: init.ok ?? true, status: init.status ?? 200, text: async () => body });

test('fetchDocument : un GET du fichier, sans cookie, sans l\'adresse de la page, vers l\'origine du widget', async () => {
  for (const { path: file } of DOC_PAGES) {
    const calls = [];
    const text = await fetchDocument(file, { base: BASE, fetchImpl: async (...args) => { calls.push(args); return reply('# Titre'); } });
    assert.equal(text, '# Titre');
    assert.equal(calls.length, 1, 'une seule requête par document');
    const [url, options] = calls[0];
    assert.equal(url, `https://exemple.test/Widget/${file}`);
    assert.equal(new URL(url).origin, new URL(BASE).origin);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit', 'aucun cookie');
    assert.equal(options.referrerPolicy, 'no-referrer', 'l\'adresse de la page n\'est pas transmise');
    assert.equal(options.redirect, 'error', 'pas de redirection vers un autre serveur');
    assert.ok(options.signal instanceof AbortSignal, 'un délai maximal');
    assert.equal(options.body, undefined);
    assert.deepEqual(Object.keys(options).sort(), ['credentials', 'method', 'redirect', 'referrerPolicy', 'signal']);
  }
});

test('fetchDocument ne demande que les documents de la liste : tout autre chemin est refusé avant toute requête', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return reply('x'); };
  for (const bad of ['', 'constants.js', '../README.md', 'docs/../README.md', '/README.md', '//example.org/x.md', 'https://example.org/README.md', 'README.md?x=1', 'README.md#a',
    'docs/inconnu.md', 'readme.md', null, undefined, 5, {}, ['README.md']]) {
    await assert.rejects(() => fetchDocument(bad, { base: BASE, fetchImpl }), error => error instanceof DocError && error.reason === 'unknown', String(bad));
  }
  assert.equal(calls, 0, 'aucune requête n\'est partie');
});

test('fetchDocument dit pourquoi un document manque : le serveur ne l\'a pas, le réseau a coupé, il est trop gros', async () => {
  await assert.rejects(() => fetchDocument('README.md', { base: BASE, fetchImpl: async () => reply('', { ok: false, status: 404 }) }),
    error => error instanceof DocError && error.reason === 'http' && error.status === 404);
  await assert.rejects(() => fetchDocument('README.md', { base: BASE, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    error => error instanceof DocError && error.reason === 'network');
  await assert.rejects(() => fetchDocument('README.md', { base: BASE, fetchImpl: async () => ({ ok: true, status: 200, text: async () => { throw new Error('flux coupé'); } }) }),
    error => error instanceof DocError && error.reason === 'network');
  await assert.rejects(() => fetchDocument('README.md', { base: BASE, fetchImpl: async () => reply('x'.repeat(2_000_001)) }),
    error => error instanceof DocError && error.reason === 'size');
  assert.equal((await fetchDocument('README.md', { base: BASE, fetchImpl: async () => reply('x'.repeat(2_000_000)) })).length, 2_000_000, 'la limite est de deux millions de caractères');
});

test('fetchDocument abandonne au bout de vingt secondes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const waiting = fetchDocument('README.md', {
      base: BASE,
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('abandon', 'AbortError'))))
    });
    mock.timers.tick(19_999);
    let settled = false;
    waiting.catch(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false, 'avant vingt secondes, on attend encore');
    mock.timers.tick(1);
    await assert.rejects(waiting, error => error instanceof DocError && error.reason === 'network');
  } finally {
    mock.timers.reset();
  }
});
