// Envoi d'un fichier (l'image d'un logo, la photo d'un profil) dans les pièces jointes du
// document Grist. C'est la SEULE requête réseau que le code du widget émet : tout le reste passe
// par l'API du widget de Grist (docApi) ou par des balises <img> (logos, photos).
//
// Comment : l'API du widget n'a pas de méthode d'envoi. Le widget demande donc à Grist un jeton
// d'accès en lecture ET écriture (`docApi.getAccessToken({ readOnly: false })`), puis envoie le
// fichier à l'API REST du document (`POST <adresse>/attachments?auth=<jeton>`, en multipart), qui
// répond par l'identifiant de la pièce jointe. L'écriture dans la cellule (`['L', identifiant]`)
// est ensuite une action Grist ordinaire (etablissement-save.js, profile-save.js).
//
// L'en-tête `X-Requested-With` est INDISPENSABLE (1.21.5). Pour toute requête qui écrit
// dans le document et que seul le jeton authentifie, Grist exige cet en-tête (ou un corps JSON, impossible
// pour un fichier), sinon il répond 401 AVANT d'ajouter ses en-têtes CORS (Authorizer.ts, `addRequestUser`,
// puis FlexServer.ts, `trustOriginHandler`) : le navigateur cache alors ce 401 au widget, dont `fetch`
// échoue comme sur une panne de réseau (« le navigateur n'a pas pu joindre le serveur »). Avec l'en-tête, le
// navigateur envoie d'abord une requête de vérification (OPTIONS), que Grist accepte de toute origine tant
// qu'aucun cookie ne l'accompagne. Pas de Content-Type écrit ici : le navigateur pose le sien, avec la
// limite du multipart. Rejoué dans Chromium contre un vrai serveur : tests/e2e-upload-cors.test.mjs.
//
// Ce qui limite l'exposition du jeton d'écriture :
//   - il n'est demandé qu'au moment d'un envoi voulu par la personne (« Enregistrer » ou « Valider »
//     avec une image choisie), jamais au chargement ; contrairement au jeton de lecture des logos
//     (attachments.js), il n'est PAS gardé : il sert une fois et disparaît avec la fonction ;
//   - il ne va qu'à l'adresse que Grist indique, en https (http seulement pour le poste local) ;
//   - la requête n'envoie ni cookie (`credentials: 'omit'`) ni l'adresse de la page
//     (`referrerPolicy: 'no-referrer'`), et s'arrête au bout de 30 secondes ;
//   - ni le jeton ni l'adresse ne figurent dans les messages ni dans la console.
//
// Cet envoi n'a pas pu être essayé dans un vrai document Grist (les tests simulent la réponse de
// Grist) : tout échec devient une phrase qui dit quoi faire, sans rien écrire dans le document.

import { readTokenInfo } from './attachments.js';

const TIMEOUT_MS = 30 * 1000;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Erreur dont le message est une phrase française destinée à la personne ; l'erreur d'origine
// reste dans `cause` et dans la console.
export class UploadError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'UploadError';
  }
}

// Ce que la personne peut faire quand l'envoi échoue : pour un logo, déposer le fichier dans Grist ;
// pour une photo de profil (`hint` de l'appelant), prévenir un administrateur.
const BY_HAND = 'Déposez le fichier directement dans Grist (voir GRIST_SETUP.md).';

const lowerFirst = text => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

const failuresFor = hint => ({
  token: `Grist n’a pas donné au widget l’autorisation d’envoyer un fichier. ${hint}`,
  address: `Grist a indiqué une adresse d’envoi que le widget n’accepte pas. ${hint}`,
  network: `L’envoi du fichier à Grist a échoué : le navigateur n’a pas pu joindre le serveur, ou l’a refusé. ${hint}`,
  timeout: `Grist n’a pas répondu à temps à l’envoi du fichier. Réessayez ; ${lowerFirst(hint)}`,
  denied: 'Grist a refusé le fichier : vos droits ne permettent pas d’ajouter une pièce jointe au document. Contactez un administrateur.',
  tooLarge: 'Grist a refusé le fichier : il est trop volumineux.',
  response: `Grist n’a pas confirmé l’envoi du fichier. Réessayez ; ${lowerFirst(hint)}`,
  failedWith: status => `Grist a refusé le fichier (erreur ${status}). Réessayez ; ${lowerFirst(hint)}`
});

// L'adresse d'envoi est celle que Grist a donnée pour le jeton : https, ou le poste local pour la
// démonstration et les tests.
function trusted(baseUrl) {
  const { protocol, hostname } = new URL(baseUrl);
  return protocol === 'https:' || (protocol === 'http:' && LOCAL_HOSTS.includes(hostname));
}

// `file` : { blob, name }. Renvoie l'identifiant de la pièce jointe créée. Lève une UploadError.
// `hint` : la phrase qui dit quoi faire quand l'envoi échoue (celle du logo par défaut). `fetchImpl`
// et `timeout` ne changent que dans les tests.
export async function uploadAttachment(docApi, file, { hint = BY_HAND, fetchImpl = globalThis.fetch, timeout = TIMEOUT_MS, log = console } = {}) {
  const FAILURES = failuresFor(hint);
  let raw;
  try {
    raw = await docApi.getAccessToken({ readOnly: false });
  } catch (error) {
    log.warn('[ENVOI] Jeton d\'écriture refusé par Grist :', error?.message || error);
    throw new UploadError(FAILURES.token, error);
  }
  const info = readTokenInfo(raw);
  if (!info) throw new UploadError(FAILURES.token);
  if (!trusted(info.baseUrl)) throw new UploadError(FAILURES.address);

  const form = new FormData();
  form.append('upload', file.blob, file.name);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetchImpl(`${info.baseUrl}/attachments?auth=${encodeURIComponent(info.token)}`, {
      method: 'POST',
      body: form,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal
    });
  } catch (error) {
    log.warn('[ENVOI] Requête d\'envoi impossible :', error?.name === 'AbortError' ? 'délai dépassé' : (error?.name || 'erreur'));
    throw new UploadError(error?.name === 'AbortError' ? FAILURES.timeout : FAILURES.network, error);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    log.warn(`[ENVOI] Grist a répondu ${response.status} à l'envoi du fichier.`);
    if (response.status === 401 || response.status === 403) throw new UploadError(FAILURES.denied);
    if (response.status === 413) throw new UploadError(FAILURES.tooLarge);
    throw new UploadError(FAILURES.failedWith(response.status));
  }
  let ids;
  try {
    ids = await response.json();
  } catch (error) {
    throw new UploadError(FAILURES.response, error);
  }
  const id = Array.isArray(ids) ? ids[0] : null;
  if (!Number.isSafeInteger(id) || id <= 0) throw new UploadError(FAILURES.response);
  return id;
}
