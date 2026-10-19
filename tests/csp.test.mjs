// Garde-fous de la politique de sécurité de contenu (CSP) de index.html (1.29.1) : ce que la page a le droit de charger, d'exécuter
// ou de contacter. Ces tests lisent la balise telle qu'elle est écrite ; tests/e2e-csp.test.mjs vérifie dans un vrai navigateur
// qu'elle refuse bien ce qu'elle dit refuser, et le harnais des tests navigateur (tests/support/harness.mjs) fait échouer tout
// scénario dont la page enfreint sa propre politique.
//
//   1. La balise est unique, dans l'en-tête, avant toute ressource.
//   2. Tout est fermé par défaut ; aucune source n'est un joker ; 'unsafe-inline' ne sert qu'aux styles.
//   3. Les scripts autorisés sont ceux du dépôt et ceux que la page charge d'un autre site : changer l'adresse de l'API Grist
//      sans changer la politique (ou l'inverse) casserait le widget en production, d'où ce test.
//   4. La page et le code n'emploient rien que la politique refuserait (script, gestionnaire ou style en ligne, formulaire, cadre).
//   5. docs/securite.md recopie la politique.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIDGET_SOURCES, withoutComments } from './support/widget-sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const HTML = read('index.html');
const MARKUP = HTML.replace(/<!--[\s\S]*?-->/g, ''); // la page sans ses commentaires, qui parlent de script, de formulaire...
const POLICY_TAG = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/gi;
const METAS = [...HTML.matchAll(POLICY_TAG)];
const POLICY_TEXT = METAS[0]?.[1] ?? '';

// { directive : [sources] }
const policy = Object.fromEntries(POLICY_TEXT.split(';').map(part => part.trim().split(/\s+/)).filter(([name]) => name)
  .map(([name, ...sources]) => [name.toLowerCase(), sources]));

const squeeze = text => text.replace(/\s+/g, ' ').trim();

// Les scripts que la page charge d'un autre site (leur origine), puis ceux du dépôt.
const scriptSources = [...MARKUP.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
const foreignScriptOrigins = scriptSources.filter(src => /^(?:https?:)?\/\//.test(src)).map(src => new URL(src, 'https://x').origin);

// ===== 1. La balise =====

test('index.html déclare une seule politique de sécurité de contenu, dans l\'en-tête, avant toute ressource', () => {
  assert.equal(METAS.length, 1, 'une seule balise <meta http-equiv="Content-Security-Policy"> (le navigateur les cumule : la plus stricte de chaque directive l\'emporte)');
  const tagAt = HTML.search(POLICY_TAG);
  assert.ok(tagAt > HTML.indexOf('<head>') && tagAt < HTML.indexOf('</head>'), 'la balise est dans l\'en-tête : ailleurs, le navigateur l\'ignore');
  const firstResource = MARKUP.search(/<(?:link|script|img|style)\b/);
  assert.ok(MARKUP.search(POLICY_TAG) < firstResource, 'la balise précède toute ressource : une ressource qui la précède échappe à la politique');
  assert.ok(Object.keys(policy).length >= 7, 'la politique déclare ses directives');
});

test('une balise ne porte ni frame-ancestors, ni report-uri, ni report-to, ni sandbox : le navigateur les y ignorerait', () => {
  const ignored = ['frame-ancestors', 'report-uri', 'report-to', 'sandbox'].filter(name => name in policy);
  assert.deepEqual(ignored, [], 'ces directives ne fonctionnent que dans un en-tête HTTP, que GitHub Pages ne permet pas de régler : les écrire ferait croire à une protection absente');
});

// ===== 2. Fermée par défaut =====

test('tout est fermé par défaut, et les objets, la balise base et les formulaires le sont aussi', () => {
  for (const name of ['default-src', 'object-src', 'base-uri', 'form-action']) {
    assert.deepEqual(policy[name], ['\'none\''], `${name} 'none'`);
  }
});

test('aucune directive n\'accepte tout (*), et \'unsafe-inline\' ne sert qu\'aux styles', () => {
  for (const [name, sources] of Object.entries(policy)) {
    assert.ok(!sources.includes('*'), `${name} : pas de joker`);
    assert.ok(!sources.includes('\'unsafe-inline\'') || name === 'style-src', `${name} : 'unsafe-inline' ne se justifie que pour style-src (l'API de Grist ajoute une balise style)`);
  }
});

test('les images et les requêtes ne vont qu\'en https, vers le dépôt ou vers la boucle locale : jamais en http vers un autre site', () => {
  const loopback = /^http:\/\/(?:127\.0\.0\.1|localhost):\*$/;
  for (const name of ['img-src', 'connect-src']) {
    const plaintext = policy[name].filter(source => /^http:/.test(source) && !loopback.test(source));
    assert.deepEqual(plaintext, [], `${name} : le http en clair n'est admis que pour la boucle locale (un Grist de test)`);
    // https: tout entier (l'instance Grist du document n'est pas connue d'avance), ou l'adresse de l'instance une fois connue.
    assert.ok(policy[name].some(source => source === 'https:' || /^https:\/\/[^*]/.test(source)), `${name} : les pièces jointes viennent de l'instance Grist du document, en https`);
  }
  assert.deepEqual(['data:', 'blob:'].filter(scheme => !policy['img-src'].includes(scheme)), [], 'img-src : les aperçus et les copies de logos sont des images data: et blob:');
  assert.ok(!policy['connect-src'].some(source => /^(?:data|blob|ws|wss):/.test(source)), 'connect-src : ni data:, ni blob:, ni websocket');
});

// ===== 3. Les scripts =====

test('script-src : le dépôt et l\'origine de chaque script externe de la page, rien d\'autre ; la page ne charge ni ne contient de script en ligne', () => {
  const allowed = policy['script-src'].filter(source => source !== '\'self\'' && source !== '\'unsafe-eval\'');
  assert.deepEqual(allowed.sort(), [...new Set(foreignScriptOrigins)].sort(),
    'script-src doit nommer exactement l\'origine de chaque <script src="https://…"> de index.html : sans elle le script est refusé, avec une autre l\'origine est ouverte pour rien');
  assert.ok(policy['script-src'].includes('\'self\''), 'script-src : les modules du dépôt');
  assert.deepEqual(MARKUP.match(/<script\b(?![^>]*\bsrc=)[^>]*>/g) ?? [], [], 'aucun script en ligne dans index.html : la politique le refuserait');
  assert.ok(scriptSources.includes('main.js'), 'le script du widget est celui du dépôt');
});

// ===== 4. La page et le code n'emploient rien que la politique refuse =====

test('index.html n\'a ni gestionnaire d\'événement, ni adresse javascript:, ni formulaire, cadre, objet ou balise base', () => {
  assert.deepEqual(MARKUP.match(/<[a-z][^>]*\son[a-z]+\s*=/gi) ?? [], [], 'un gestionnaire en ligne (onclick=...) est refusé par script-src');
  assert.doesNotMatch(MARKUP, /javascript:/i, 'une adresse javascript: est refusée par script-src');
  assert.deepEqual(MARKUP.match(/<(?:form|iframe|frame|object|embed|base)\b/gi) ?? [], [], 'form-action, frame-src, object-src et base-uri sont fermés');
});

test('le code du widget ne fabrique ni script, ni cadre, ni formulaire, ni gestionnaire en ligne, et n\'évalue aucun texte', () => {
  // eval et new Function sont déjà interdits par tests/docs.test.mjs : 'unsafe-eval' ne vaut que pour l'API de Grist, qu'on
  // pourra peut-être retirer sans toucher au widget.
  const forbidden = [
    [/createElement\(\s*['"`](?:script|iframe|frame|object|embed|form|base)['"`]/, 'une balise que la politique refuse'],
    [/\.srcdoc\b/, 'le contenu d\'un cadre'],
    [/javascript:/i, 'une adresse javascript:'],
    [/setAttribute\(\s*['"`]on/i, 'un gestionnaire en ligne'],
    [/\bset(?:Timeout|Interval)\(\s*['"`]/, 'une minuterie qui évalue un texte'],
    [/new\s+Worker\(|new\s+SharedWorker\(|serviceWorker/, 'un travailleur (worker-src est fermé)']
  ];
  const found = WIDGET_SOURCES().flatMap(({ name, code }) => forbidden
    .filter(([pattern]) => pattern.test(withoutComments(code))).map(([, why]) => `${name} : ${why}`));
  assert.deepEqual(found, []);
});

// ===== 5. La documentation =====

test('docs/securite.md recopie la politique de index.html telle qu\'elle est écrite', () => {
  assert.ok(squeeze(read('docs/securite.md')).includes(squeeze(POLICY_TEXT)),
    'docs/securite.md (« Politique de sécurité de contenu ») doit donner la politique de index.html mot pour mot : revoyez la page, puis ce test.');
});
