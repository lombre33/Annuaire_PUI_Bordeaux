// D'où la fenêtre « Documentation » lit ses documents, et où mène chaque lien qu'ils contiennent (docs-ui.js l'affiche, markdown.js
// et markdown-dom.js les mettent en forme).
//
// Les documents sont les fichiers Markdown du dépôt, que GitHub Pages publie avec le widget : l'adresse de chacun est celle de la
// page du widget (document.baseURI) suivie du chemin du fichier, tel que DOC_PAGES le liste. C'est la SEULE requête réseau du widget
// avec l'envoi d'un fichier (upload.js) ; elle ne part qu'à l'ouverture de la fenêtre, jamais au chargement de l'annuaire, et rien
// d'autre qu'un fichier de DOC_PAGES ne peut être demandé (docs/securite.md, « Les documents de la fenêtre Documentation »).
// Le dépôt qui publie le widget doit donc publier aussi ces fichiers ; sinon la fenêtre dit qu'elle ne les a pas, et propose la page
// de DOCS_URL (constants.js), la seule adresse à changer quand le dépôt déménage.

// Les documents montrés, dans l'ordre de leur barre (le premier est celui qui s'ouvre). `path` : le chemin du fichier depuis la
// racine du dépôt ; `label` : son nom dans la fenêtre. Un lien d'un document vers un fichier qui n'est pas dans cette liste n'est pas
// un lien (du texte) ; un fichier qui n'existe plus doit être retiré d'ici : tests/docs-source.test.mjs le vérifie.
export const DOC_PAGES = [
  { path: 'README.md', label: 'Présentation' },
  { path: 'docs/utilisateurs.md', label: 'Guide utilisateur' },
  { path: 'GRIST_SETUP.md', label: 'Installation' },
  { path: 'docs/securite.md', label: 'Sécurité' },
  { path: 'docs/maintenance.md', label: 'Maintenance' },
  { path: 'docs/developpeurs.md', label: 'Développeurs' },
  { path: 'TESTING.md', label: 'Essais' },
  { path: 'specs.md', label: 'Cahier des charges' },
  { path: 'CHANGELOG.md', label: 'Historique' }
];

// Un document plus gros que cela (en caractères) n'est pas lu : le plus grand en fait aujourd'hui trois cent mille.
const MAX_DOC_CHARS = 2_000_000;
// Au-delà, le document est jugé injoignable.
const DOC_TIMEOUT_MS = 20_000;
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|svg)$/i;

export const pageOf = path => DOC_PAGES.find(page => page.path === path) ?? null;

// Pourquoi un document n'a pas pu être lu : `reason` 'unknown' (pas dans DOC_PAGES), 'http' (le serveur ne l'a pas : `status`),
// 'size' (trop gros), 'network' (pas de réponse ou délai dépassé), 'unreadable' (reçu, mais docs-ui.js n'a pas pu le lire).
export class DocError extends Error {
  constructor(reason, status = 0) {
    super(`document illisible : ${reason}${status ? ` (${status})` : ''}`);
    this.name = 'DocError';
    this.reason = reason;
    this.status = status;
  }
}

const decode = text => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// Un chemin relatif résolu depuis le dossier du document `from`, ou null s'il sort du dépôt, ou s'il n'est pas relatif (une
// adresse avec un protocole, un « // », un chemin absolu).
function resolveRelative(from, target) {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.includes('\\')) return null;
  const segments = from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else if (part !== '.' && part !== '') {
      segments.push(part);
    }
  }
  return segments.join('/');
}

// Où mène un lien du document `from` : voir markdown-dom.js. Une page web : en https seulement ; un document de DOC_PAGES : ouvert
// dans la fenêtre ; une ancre : un titre du document ; tout le reste (un fichier du dépôt qui n'est pas un document, un lien mailto:,
// javascript:, data:, http:) n'est pas un lien.
export function resolveLink(from, href) {
  const target = href.trim();
  if (target.startsWith('#')) return { kind: 'anchor', anchor: decode(target.slice(1)) };
  if (/^https:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      return url.hostname ? { kind: 'external', href: url.href } : { kind: 'none' };
    } catch {
      return { kind: 'none' };
    }
  }
  const [file, ...rest] = target.split('#');
  const path = resolveRelative(from, file);
  const page = path === null ? null : pageOf(path);
  return page ? { kind: 'doc', page: page.path, anchor: decode(rest.join('#')) } : { kind: 'none' };
}

// L'adresse d'un fichier du dépôt (un document, une image), depuis la page du widget.
export function fileUrl(path, base = document.baseURI) {
  const url = new URL(path, base);
  if (url.origin !== new URL(base).origin) throw new DocError('unknown');
  return url.href;
}

// L'adresse d'une image d'un document, ou null : un fichier image du dépôt seulement (jamais une adresse extérieure : les images
// d'un document ne font émettre aucune requête vers un autre serveur ; les pastilles de GitHub du README s'y lisent par leur texte).
export function resolveImage(from, src, base = document.baseURI) {
  const path = resolveRelative(from, src.trim().split(/[?#]/)[0]);
  return path !== null && IMAGE_EXTENSIONS.test(path) ? fileUrl(path, base) : null;
}

// Le texte d'un document. La requête : un GET, sans cookie, sans l'adresse de la page, vers un fichier de DOC_PAGES de la même
// origine que le widget ; elle est coupée au bout de DOC_TIMEOUT_MS.
export async function fetchDocument(path, { base = document.baseURI, fetchImpl = fetch } = {}) {
  if (!pageOf(path)) throw new DocError('unknown');
  const url = fileUrl(path, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOC_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new DocError('http', response.status);
    const text = await response.text();
    if (text.length > MAX_DOC_CHARS) throw new DocError('size');
    return text;
  } catch (error) {
    throw error instanceof DocError ? error : new DocError('network');
  } finally {
    clearTimeout(timer);
  }
}
