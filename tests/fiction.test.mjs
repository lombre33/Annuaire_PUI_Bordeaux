// Aucune coordonnée qui pourrait être celle d'une vraie personne dans le dépôt public (docs/securite.md, « Données dans le dépôt ») :
// ni dans les jeux de données des tests, ni dans un texte du dépôt (code, tests, documentation). Le journal des versions
// (CHANGELOG.md) cite des messages d'autrefois : il n'est pas relu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables } from './fixtures.mjs';
import { assertFictionalContacts, realLookingCoordinates } from './support/fiction.mjs';
import { REPOSITORY_TEXTS } from './support/widget-sources.mjs';

// Ces exemples sont assemblés ici pour que ce fichier ne contienne pas lui-même ce qu'il cherche.
const realEmail = ['ana.martin', 'chu-bordeaux.fr'].join('@');
const pairs = ['56', '78', '90', '12'];
const realPhones = [`05 ${pairs.join(' ')}`, `+33 5 ${pairs.join(' ')}`, `0033 5 ${pairs.join(' ')}`, `05${pairs.join('')}`, `05.${pairs.join('.')}`, `05-${pairs.join('-')}`];
const fictionalEmails = ['ana.martin@chu-bordeaux.example', 'zoe@example.test', 'x@example.com', 'ANA@CHU.EXAMPLE'];
const fictionalPhones = ['05 36 49 90 12', '+33 5 36 49 90 12', '0033 5 36 49 90 12', '0536499012', '05.36.49.90.12', '06 39 98 01 02'];

test('le jeu de données des tests unitaires et navigateur ne contient que des coordonnées fictives', () => assertFictionalContacts(sampleTables()));

test('assertFictionalContacts refuse un jeu de données qui contient une adresse ou un numéro qui pourrait être réel', () => {
  const dataset = (email, phone) => ({ BDD: { email: [email], numero_de_telephone: [phone] } });
  const realNumber = Number(['556', '789', '012'].join('')); // numérique dans Grist : le 0 initial est perdu
  assert.doesNotThrow(() => assertFictionalContacts(dataset(fictionalEmails[0], 536499012)));
  assert.throws(() => assertFictionalContacts(dataset(realEmail, 536499012)), /domaine réservé/);
  assert.throws(() => assertFictionalContacts(dataset(fictionalEmails[0], realNumber)), /plages réservées/);
});

test('realLookingCoordinates repère une adresse et un numéro qui pourraient être réels, et laisse passer ceux de la fiction', () => {
  assert.deepEqual(realLookingCoordinates([realEmail, ...realPhones].join(', ')), [realEmail, ...realPhones]);
  assert.deepEqual(realLookingCoordinates([...fictionalEmails, ...fictionalPhones].join(', ')), []);
  assert.deepEqual(realLookingCoordinates('Version 1.29.2 du 2026-10-19, 4 500 contacts, 05 36 49 xx xx'), [], 'ni une date, ni un nombre, ni une plage');
});

test('realLookingCoordinates lit aussi une expression régulière, un modèle de texte et un numéro suivi d\'une lettre : trois formes qu\'une première passe avait laissées', () => {
  const regex = ['ana.martin', String.raw`chu-bordeaux\.fr`].join('@'); // dans une expression régulière, les points sont échappés
  const template = ['p${index}', 'e${owner}.' + 'fr'].join('@'); // un modèle de texte : la valeur s'y insère entre accolades
  const fictionalTemplate = ['p${index}', 'e${owner}.example'].join('@');
  assert.deepEqual(realLookingCoordinates(regex), [realEmail]);
  assert.deepEqual(realLookingCoordinates(template), [['px', 'ex.fr'].join('@')], 'la valeur insérée est lue comme une lettre');
  assert.deepEqual(realLookingCoordinates(fictionalTemplate), []);
  assert.deepEqual(realLookingCoordinates(`05${pairs.join('')}x`), [`05${pairs.join('')}`], 'un numéro que sa fin collée à une lettre ne met pas à l\'abri');
  assert.deepEqual(realLookingCoordinates(String.raw`05\.${pairs.join(String.raw`\.`)}`), [`05.${pairs.join('.')}`]);
});

test('aucun texte du dépôt ne contient d\'adresse ni de numéro qui pourrait être réel : .example pour les adresses, 05 36 49 xx xx ou 06 39 98 xx xx pour les numéros', () => {
  const texts = REPOSITORY_TEXTS();
  assert.ok(texts.length > 80, `le dépôt est parcouru (${texts.length} fichiers)`);
  assert.ok(texts.some(({ name }) => name === 'docs/securite.md') && texts.some(({ name }) => name === 'tests/fixtures.mjs'), 'la documentation et les tests en font partie');
  assert.ok(!texts.some(({ name }) => name === 'CHANGELOG.md'), 'le journal des versions, non');
  const found = texts.flatMap(({ name, code }) => realLookingCoordinates(code).map(item => `${name} : ${item}`));
  assert.deepEqual(found, []);
});
