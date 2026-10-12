// Pièces jointes de Grist (logos des établissements et des financeurs, plus tard les
// avatars). Une colonne « Pièces jointes » contient une liste d'identifiants
// ['L', 12, 13] ; le fichier se télécharge avec un jeton d'accès en lecture seule que
// Grist délivre au widget (docApi.getAccessToken). Rien ici ne touche le DOM : les
// images sont construites par branding-ui.js.

// Durée de validité supposée quand Grist n'en annonce pas.
const DEFAULT_TTL_MS = 5 * 60 * 1000;
// Le jeton est redemandé un peu avant son expiration. Tant qu'il ne change pas, les
// adresses des images restent identiques et le navigateur les garde en cache.
const RENEW_MARGIN_MS = 30 * 1000;
// Après un échec, pas de nouvelle demande avant ce délai : un Grist qui refuse ne doit
// pas être sollicité à chaque affichage.
const RETRY_AFTER_FAILURE_MS = 30 * 1000;
// Un jeton obtenu depuis moins longtemps n'est pas redemandé sur la seule foi d'une image
// en erreur (fichier supprimé, format illisible) : chaque erreur coûterait une demande.
const MIN_FORCED_REFRESH_MS = 10 * 1000;
// Une demande qui ne reçoit jamais de réponse ne doit pas laisser les logos en attente.
const TOKEN_TIMEOUT_MS = 8 * 1000;

// Identifiants des fichiers d'une cellule « Pièces jointes » : ['L', 12, 13], un
// identifiant seul, ou vide (null, 0, ['L']). Tout ce qui n'est pas un entier positif
// est ignoré, le marqueur 'L' compris.
export function attachmentIds(cell) {
  const items = Array.isArray(cell) ? cell : [cell];
  return items.filter(item => Number.isInteger(item) && item > 0);
}

// Réponse de docApi.getAccessToken : { token, baseUrl, ttlMsecs }. null si elle est
// inutilisable (pas de jeton, adresse qui n'est pas une adresse web, adresse déjà
// munie de paramètres où l'on ne peut pas ajouter un chemin).
export function readTokenInfo(raw) {
  if (!raw || typeof raw.token !== 'string' || raw.token === '') return null;
  let base;
  try {
    base = new URL(String(raw.baseUrl));
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(base.protocol) || base.search || base.hash) return null;
  const ttl = Number(raw.ttlMsecs);
  return { token: raw.token, baseUrl: base.href.replace(/\/+$/, ''), ttl: ttl > 0 ? ttl : DEFAULT_TTL_MS };
}

// Adresse de téléchargement d'un fichier, à poser dans une balise <img>.
function attachmentUrl(info, id) {
  return `${info.baseUrl}/attachments/${id}/download?auth=${encodeURIComponent(info.token)}`;
}

function withTimeout(promise, milliseconds) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`pas de réponse de Grist en ${milliseconds} ms`)), milliseconds);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

// Fournit les adresses des pièces jointes du document. `now` et `timeout` ne changent
// que dans les tests.
//   url(id)            adresse du fichier avec le jeton détenu ; null sans jeton valable
//   ready()            true quand un jeton valable est détenu (il est demandé au besoin) ;
//                      false si Grist n'en donne pas : l'appelant affiche alors le texte
//   refresh(failedUrl) une image est en erreur : true si un autre jeton peut être essayé
//                      (le jeton a changé depuis, ou il a pu être redemandé), false si
//                      l'erreur ne vient pas du jeton
export function createAttachments(docApi, { now = Date.now, timeout = TOKEN_TIMEOUT_MS, log = console } = {}) {
  let info = null; // { token, baseUrl, expiresAt }
  let pending = null;
  let lastFailure = -Infinity;
  let lastFetch = -Infinity;
  let warned = false;

  // Une seule demande à la fois : cent images en erreur le même instant n'en font qu'une.
  function request() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const raw = await withTimeout(Promise.resolve().then(() => docApi.getAccessToken({ readOnly: true })), timeout);
        const read = readTokenInfo(raw);
        if (!read) throw new Error('réponse de Grist inattendue');
        info = { token: read.token, baseUrl: read.baseUrl, expiresAt: now() + read.ttl };
        lastFetch = now();
        warned = false;
        return true;
      } catch (error) {
        lastFailure = now();
        if (!warned) {
          warned = true;
          log.warn('[LOGOS] Jeton d\'accès aux pièces jointes indisponible : les logos sont remplacés par le texte.', error);
        }
        return false;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  const stillValid = () => info !== null && now() < info.expiresAt;

  return {
    url(id) {
      return stillValid() ? attachmentUrl(info, id) : null;
    },

    async ready() {
      if (info !== null && now() < info.expiresAt - RENEW_MARGIN_MS) return true;
      if (!pending && now() - lastFailure < RETRY_AFTER_FAILURE_MS) return stillValid();
      const obtained = await request();
      return obtained || stillValid();
    },

    async refresh(failedUrl = '') {
      // L'adresse en erreur portait un jeton plus ancien que celui qu'on détient : réessayer suffit.
      if (stillValid() && !failedUrl.includes(`auth=${encodeURIComponent(info.token)}`)) return true;
      if (!pending && now() - lastFetch < MIN_FORCED_REFRESH_MS) return false;
      return request();
    }
  };
}
