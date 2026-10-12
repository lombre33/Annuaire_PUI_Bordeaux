// Visages 100 % fictifs, pour la démonstration (serveur-demo.mjs) et les tests navigateur
// (tests/support/fake-attachments.mjs) : de simples dessins inventés, jamais la photo d'une vraie
// personne. Ce sont les mêmes que ceux de la maquette validée, plus un septième pour les
// captures qui choisissent une photo. Chaque visage est un petit SVG de 256 x 256 px, comme le
// serait la photo de profil que le widget envoie à Grist (carrée, 256 px).
//
// Un vrai document Grist stocke les photos dans la colonne « Pièces jointes » Avatar de BDD ; ici
// chaque visage a un numéro de pièce jointe (PREMIER_PORTRAIT + son rang) que le serveur de
// démonstration sert à la place de Grist.

// { fond, peau, haut, cheveux, longs }
const VISAGES = [
  { bg: '#dbeafe', skin: '#f2c9a0', shirt: '#6257d9', hair: '#3b2a20', long: false },
  { bg: '#fde7d9', skin: '#c68a62', shirt: '#1ba99a', hair: '#1b1b1f', long: true },
  { bg: '#e8e6ff', skin: '#f5d3b3', shirt: '#d85b9d', hair: '#8a5a2b', long: true },
  { bg: '#dff5ef', skin: '#8d5a3b', shirt: '#172033', hair: '#141414', long: false },
  { bg: '#fff3d6', skin: '#ecbf97', shirt: '#f28a54', hair: '#d9a441', long: false },
  { bg: '#e9ecf5', skin: '#d9a581', shirt: '#4f8ee8', hair: '#5b3a29', long: true },
  { bg: '#e3f4f1', skin: '#e0b08a', shirt: '#2a8f8f', hair: '#7a4a2b', long: true }
];

export const NOMBRE_VISAGES = VISAGES.length;

// Le SVG du visage de rang `rang` (0, 1, 2… ; au-delà du dernier, on recommence au premier).
export function visageSvg(rang) {
  const { bg, skin, shirt, hair, long } = VISAGES[((rang % VISAGES.length) + VISAGES.length) % VISAGES.length];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 120 120">'
    + `<rect width="120" height="120" fill="${bg}"/>`
    + (long ? `<ellipse cx="60" cy="58" rx="25" ry="31" fill="${hair}"/>` : '')
    + `<path d="M16 120c2-26 22-38 44-38s42 12 44 38z" fill="${shirt}"/><rect x="52" y="64" width="16" height="22" rx="7" fill="${skin}"/>`
    + `<ellipse cx="60" cy="52" rx="18" ry="21" fill="${skin}"/><path d="M41 50c-1-17 9-27 20-27 13 0 21 9 19 27-4-7-10-11-19-11s-15 4-20 11z" fill="${hair}"/></svg>`;
}

// Numéro de pièce jointe du premier visage dans la démonstration : les logos fictifs ont les numéros 101 à
// 114 et les fichiers envoyés pendant la démonstration commencent à 5 000.
export const PREMIER_PORTRAIT = 201;

// Le SVG de la pièce jointe `id` de la démonstration, ou null si ce n'est pas un visage.
export function portraitFictif(id) {
  const rang = id - PREMIER_PORTRAIT;
  return rang >= 0 && rang < VISAGES.length ? visageSvg(rang) : null;
}
