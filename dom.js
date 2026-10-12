// Petit outil partagé par les fenêtres (profile-ui.js, changes-ui.js). Rien ne
// s'exécute à l'import : la fonction qui touche au DOM n'est appelée que par les écrans.

// Un élément avec sa classe et son texte. Le texte passe toujours par textContent :
// ce qui vient de Grist (un nom, une fonction) n'est jamais lu comme du HTML.
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
