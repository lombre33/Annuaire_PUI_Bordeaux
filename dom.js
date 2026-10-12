// Petits outils partagés par les fenêtres (profile-ui.js, admin-ui.js). Rien ne
// s'exécute à l'import : les fonctions qui touchent au DOM ne sont appelées que
// par les écrans.

// Un élément avec sa classe et son texte. Le texte passe toujours par textContent :
// ce qui vient de Grist (un nom, une fonction, un motif) n'est jamais lu comme du HTML.
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// « 1 champ », « 3 champs ».
export const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

// La dernière date que le calendrier de JavaScript sait écrire, en secondes depuis 1970.
const MAX_SECONDS = 8.64e12;

// « 12 oct. » pour une date Grist (secondes depuis 1970) ; '' si ce n'est pas une date.
// Une cellule de Grist peut contenir n'importe quoi : un nombre hors du calendrier ne
// doit pas faire échouer l'écran qui l'affiche.
export function formatDate(seconds) {
  const value = typeof seconds === 'number' || typeof seconds === 'string' ? Number(seconds) : NaN;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_SECONDS) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(value * 1000);
}
