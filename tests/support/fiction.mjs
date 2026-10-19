// Le jeu de données d'un test ne contient que des coordonnées inventées (docs/securite.md) : des adresses du domaine réservé
// .example (RFC 2606) et des numéros des plages que l'ARCEP réserve à la fiction. `tables` : les tables de BDD, comme Grist les rend.

import assert from 'node:assert/strict';

// 05 36 49 xx xx et 06 39 98 xx xx (ARCEP, décision n° 2018-0881), en dix chiffres.
const FICTION_PHONE = /^0(?:53649|63998)\d{4}$/;

export function assertFictionalContacts(tables) {
  const emails = JSON.stringify(tables).match(/[\w.+-]+@[\w.-]+/g) ?? [];
  assert.ok(emails.length > 0, 'Aucune adresse trouvée : ce test ne vérifie plus rien.');
  assert.deepEqual(emails.filter(email => !email.endsWith('.example')), [],
    'Adresses hors du domaine réservé .example (RFC 2606) : jamais de vraie adresse dans le dépôt.');

  // Numérique dans Grist : le 0 initial est perdu, 0 = non renseigné.
  const phones = tables.BDD.numero_de_telephone.filter(Boolean).map(value => String(value).padStart(10, '0'));
  assert.ok(phones.length > 0, 'Aucun numéro trouvé : ce test ne vérifie plus rien.');
  assert.deepEqual(phones.filter(phone => !FICTION_PHONE.test(phone)), [],
    'Numéros hors des plages réservées à la fiction, 05 36 49 xx xx et 06 39 98 xx xx (ARCEP, décision n° 2018-0881).');
}

// ===== Tout texte =====

// Une adresse d'un domaine réservé à la fiction (RFC 2606) : .example, .test, .invalid, .localhost, example.com, example.org, example.net.
const FICTION_DOMAIN = /(?:\.(?:example|test|invalid|localhost)|@example\.(?:com|org|net))$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// Un numéro français écrit à la main : 0 et neuf chiffres, ou +33 ou 0033 et neuf chiffres, groupés (espace, point, tiret) ou non, et
// qu'une lettre colle ou non à la suite (« 05 36 49 90 12x » : une saisie fautive d'un test garde la tête d'un vrai numéro).
const PHONE = /(?:\+33|0033|\b0)\s?[1-9](?:[ .-]?\d{2}){4}(?!\d)/g;

// Tout texte n'écrit pas une adresse en clair : une expression régulière échappe ses points, un modèle de texte y insère des valeurs
// (« ${n} »). On les lit comme l'adresse qu'ils décrivent : le point sans son échappement, la valeur en une lettre.
const readable = text => text.replace(/\\+\./g, '.').replace(/\$\{[^}]*\}/g, 'x');

// « +33 5 36 49 90 12 » et « 0033 5 36 49 90 12 » s'écrivent 0536499012 en dix chiffres.
const tenDigits = phone => phone.replace(/\D/g, '').replace(/^(?:33|0033)/, '0');

// Les adresses et les numéros d'un texte qui pourraient être ceux d'une vraie personne : une adresse hors des domaines réservés à la
// fiction, un numéro français hors des plages que l'ARCEP y réserve.
export function realLookingCoordinates(text) {
  const plain = readable(text);
  const emails = (plain.match(EMAIL) ?? []).filter(email => !FICTION_DOMAIN.test(email));
  const phones = (plain.match(PHONE) ?? []).filter(phone => !FICTION_PHONE.test(tenDigits(phone)));
  return [...emails, ...phones];
}
