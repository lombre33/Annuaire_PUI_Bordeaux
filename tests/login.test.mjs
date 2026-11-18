import { test } from 'node:test';
import assert from './support/assert.mjs';
import { findLoginUrl, loginUrl, pageNumberOf } from '../login.js';

// ===== La page de connexion de Grist, avec retour sur la page de l'annuaire (1.44.0) =====
// Même méthode que le widget « agenda partagé » : `<hôte>[/o/<équipe>]/login?next=<page du document>`. Vérifié dans un vrai Grist (1.7.22) :
// `/login?next=/<document>/x/p/<page>?style=singlePage` ; Grist remplace « x » par le nom de la page et garde le style ; un `next` sans page
// (`/<document>?style=singlePage`) mène à la première page du document, style gardé.

const NEXT = target => encodeURIComponent(target);

function recordingLog() {
  const log = { warnings: [], warn: (...args) => log.warnings.push(args) };
  return log;
}

test('pageNumberOf lit le numéro de page de l\'adresse du widget, et rien d\'autre qu\'un nombre', () => {
  assert.equal(pageNumberOf('?page=7'), '7');
  assert.equal(pageNumberOf('?access=full&page=12&readonly=false'), '12');
  assert.equal(pageNumberOf('page=7'), '7', 'sans le point d\'interrogation');
  for (const search of ['', '?', '?page=', '?page=abc', '?page=7/../x', '?page=-1', '?page=1.5', '?page=1234567', '?page=%2F%2Fevil.example', '?page=7%0A', '?pages=7', undefined, null]) {
    assert.equal(pageNumberOf(search), '', JSON.stringify(search));
  }
});

test('loginUrl : la page de connexion de Grist, retour sur la page de l\'annuaire en style singlePage', () => {
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: '7' }),
    `https://grist.example/login?next=${NEXT('/AbCdEf123/x/p/7?style=singlePage')}`);
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: '7' }),
    'https://grist.example/login?next=%2FAbCdEf123%2Fx%2Fp%2F7%3Fstyle%3DsinglePage');
});

test('loginUrl : sans numéro de page, retour sur le document (sa première page), style gardé', () => {
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123'), 'https://grist.example/login?next=%2FAbCdEf123%3Fstyle%3DsinglePage');
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: '' }), 'https://grist.example/login?next=%2FAbCdEf123%3Fstyle%3DsinglePage');
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: 'abc' }), 'https://grist.example/login?next=%2FAbCdEf123%3Fstyle%3DsinglePage', 'un numéro invalide est ignoré');
});

test('loginUrl : l\'équipe du document (/o/équipe) reste dans l\'adresse de connexion, pas dans la page de retour (Grist l\'y ajoute)', () => {
  assert.equal(loginUrl('https://grist.example/o/pui/api/docs/AbCdEf123', { page: '7' }),
    'https://grist.example/o/pui/login?next=%2FAbCdEf123%2Fx%2Fp%2F7%3Fstyle%3DsinglePage');
});

test('loginUrl : une adresse avec une barre finale, un port, un identifiant de copie', () => {
  assert.equal(loginUrl('http://127.0.0.1:8484/api/docs/AbCdEf123/', { page: '3' }), 'http://127.0.0.1:8484/login?next=%2FAbCdEf123%2Fx%2Fp%2F3%3Fstyle%3DsinglePage');
  assert.equal(loginUrl('https://grist.example/api/docs/AbC~dEf', { page: '3' }), 'https://grist.example/login?next=%2FAbC~dEf%2Fx%2Fp%2F3%3Fstyle%3DsinglePage');
});

test('loginUrl : le style de retour se règle, et vide Grist ramène à la page sans style', () => {
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: '7', style: '' }), 'https://grist.example/login?next=%2FAbCdEf123%2Fx%2Fp%2F7');
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: '7', style: 'light' }), 'https://grist.example/login?next=%2FAbCdEf123%2Fx%2Fp%2F7%3Fstyle%3Dlight');
  assert.equal(loginUrl('https://grist.example/api/docs/AbCdEf123', { page: '7', style: 'a&b=c#d' }), 'https://grist.example/login?next=%2FAbCdEf123%2Fx%2Fp%2F7%3Fstyle%3Da%2526b%253Dc%2523d', 'le style est encodé : il ne peut pas ajouter de paramètre');
});

test('loginUrl : une adresse inattendue ne donne aucun lien (jamais d\'adresse construite de travers)', () => {
  for (const address of [
    '', undefined, null, 'pas une adresse', 'https://grist.example/', 'https://grist.example/api/docs/', 'https://grist.example/api/docs/a/b',
    'https://grist.example/docs/AbCdEf123', 'javascript:alert(1)', 'ftp://grist.example/api/docs/AbCdEf123', 'data:text/html,x',
    'https://grist.example/api/docs/Ab%2FCd', 'https://grist.example/api/docs/Ab Cd'
  ]) {
    assert.equal(loginUrl(address, { page: '7' }), '', String(address));
  }
});

test('findLoginUrl : demande à Grist l\'adresse de l\'API du document, un jeton en lecture seule, et construit le lien', async () => {
  const requests = [];
  const docApi = { getAccessToken: async options => { requests.push(options); return { token: 'jeton', baseUrl: 'https://grist.example/o/pui/api/docs/AbCdEf123', ttlMsecs: 60000 }; } };
  const url = await findLoginUrl(docApi, { search: '?page=7', log: recordingLog() });
  assert.equal(url, 'https://grist.example/o/pui/login?next=%2FAbCdEf123%2Fx%2Fp%2F7%3Fstyle%3DsinglePage');
  assert.deepEqual(requests, [{ readOnly: true }]);
  assert.ok(!url.includes('jeton'), 'le jeton ne sort pas du widget');
});

test('findLoginUrl : un refus de Grist, une vieille version sans getAccessToken ou une adresse inattendue donnent une adresse vide, jamais une exception', async () => {
  const log = recordingLog();
  assert.equal(await findLoginUrl({ getAccessToken: async () => { throw new Error('Access token refused'); } }, { log }), '');
  assert.match(log.warnings[0][0], /\[CONNEXION\] adresse de connexion introuvable : Access token refused/);
  assert.equal(await findLoginUrl({}, { log }), '', 'Grist sans getAccessToken');
  assert.equal(await findLoginUrl({ getAccessToken: async () => null }, { log }), '', 'réponse vide');
  assert.equal(await findLoginUrl({ getAccessToken: async () => ({ baseUrl: 'https://grist.example/pas-une-api' }) }, { log }), '');
  assert.match(log.warnings.at(-1)[0], /forme attendue/);
  assert.ok(!JSON.stringify(log.warnings).includes('@'), 'aucune adresse dans la console');
});
