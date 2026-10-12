// Petits outils partagés par les fenêtres (profile-ui.js, etablissement-ui.js, changes-ui.js). Rien
// ne s'exécute à l'import : les fonctions qui touchent au DOM ne sont appelées que par les écrans.

// Un élément avec sa classe et son texte. Le texte passe toujours par textContent :
// ce qui vient de Grist (un nom, une fonction) n'est jamais lu comme du HTML.
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// Un bouton (type « button » : jamais un envoi de formulaire) avec son texte et, s'il y en a un, son
// action au clic.
export function button(label, className, onClick) {
  const node = el('button', className, label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

// Un encadré de message : `kind` 'pending' (à lire), 'ko' (échec) ; `role` 'status' ou 'alert' pour
// que les lecteurs d'écran l'annoncent.
export function notice(kind, text, role) {
  const box = el('div', `notice notice-${kind}`);
  if (role) box.setAttribute('role', role);
  box.append(el('p', '', text));
  return box;
}
