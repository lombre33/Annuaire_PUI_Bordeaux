// Le jeu de données d'un test ne contient que des coordonnées inventées (docs/securite.md) : des adresses du domaine réservé
// .example (RFC 2606) et des numéros des plages que l'ARCEP réserve à la fiction. `tables` : les tables de BDD, comme Grist les rend.

import assert from 'node:assert/strict';

export function assertFictionalContacts(tables) {
  const emails = JSON.stringify(tables).match(/[\w.+-]+@[\w.-]+/g) ?? [];
  assert.ok(emails.length > 0, 'Aucune adresse trouvée : ce test ne vérifie plus rien.');
  assert.deepEqual(emails.filter(email => !email.endsWith('.example')), [],
    'Adresses hors du domaine réservé .example (RFC 2606) : jamais de vraie adresse dans le dépôt.');

  // Numérique dans Grist : le 0 initial est perdu, 0 = non renseigné.
  const phones = tables.BDD.numero_de_telephone.filter(Boolean).map(value => String(value).padStart(10, '0'));
  assert.ok(phones.length > 0, 'Aucun numéro trouvé : ce test ne vérifie plus rien.');
  assert.deepEqual(phones.filter(phone => !/^0(?:53649|63998)\d{4}$/.test(phone)), [],
    'Numéros hors des plages réservées à la fiction, 05 36 49 xx xx et 06 39 98 xx xx (ARCEP, décision n° 2018-0881).');
}
