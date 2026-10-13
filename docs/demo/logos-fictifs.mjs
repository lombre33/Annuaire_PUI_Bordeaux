// Logos 100 % fictifs de la démonstration (voir donnees-fictives.mjs et serveur-demo.mjs) :
// des dessins inventés pour les établissements imaginaires, jamais le logo d'une vraie
// structure. Chaque logo est un petit SVG dessiné ici, aux proportions différentes (large,
// carré, haut), comme le sont les vrais : de quoi montrer comment le widget leur donne la
// même hauteur sur les cartes.
//
// Les textes ont une largeur imposée (textLength, mesurée avec la police Inter) : le logo
// garde ses proportions quelle que soit la police disponible sur la machine qui régénère les
// captures.
//
// Un vrai document Grist stocke ces fichiers dans des colonnes « Pièces jointes » ; ici
// chaque dessin a un numéro de pièce jointe (IDS_LOGOS) que le serveur de démonstration
// sert à la place de Grist.

const POLICE = 'Inter, Arial, Helvetica, sans-serif';

const echapper = texte => texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = (largeur, hauteur, contenu) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">${contenu}</svg>`;

// Un texte posé à (x, y), de `largeur` imposée.
const texte = (contenu, x, y, taille, graisse, couleur, largeur) =>
  `<text x="${x}" y="${y}" font-family="${POLICE}" font-size="${taille}" font-weight="${graisse}" fill="${couleur}"`
  + ` textLength="${largeur}" lengthAdjust="spacingAndGlyphs">${echapper(contenu)}</text>`;

const points = liste => liste.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// Étoile à `branches` pointes (rayon extérieur, puis rayon intérieur).
function etoile(cx, cy, rayonExterieur, rayonInterieur, branches = 5) {
  return points(Array.from({ length: 2 * branches }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / branches;
    const rayon = index % 2 ? rayonInterieur : rayonExterieur;
    return [cx + rayon * Math.cos(angle), cy + rayon * Math.sin(angle)];
  }));
}

// Hexagone, pointe en haut.
const hexagone = (cx, cy, rayon) => etoile(cx, cy, rayon, rayon, 3);

// ===== Établissements =====

const chd = svg(150, 48,
  '<rect x="2" y="2" width="44" height="44" rx="10" fill="#0e7c86"/>'
  + '<path d="M22 11h4v11h11v4H26v11h-4V26H11v-4h11z" fill="#fff"/>'
  + texte('CH DÉMO', 56, 23, 17, 800, '#0e7c86', 81)
  + texte('Centre Hospitalier', 56, 38, 10.5, 500, '#4a6b70', 91));

const udd = svg(174, 60,
  '<circle cx="30" cy="30" r="27" fill="none" stroke="#1d3f8f" stroke-width="3"/>'
  + `<polygon points="${etoile(30, 31, 15, 6.5)}" fill="#1d3f8f"/>`
  + texte('UNIVERSITÉ', 68, 29, 15, 800, '#1d3f8f', 91)
  + texte('de Démonstration', 68, 46, 12, 500, '#1d3f8f', 102));

const isd = svg(138, 44,
  '<rect x="2" y="22" width="8" height="20" rx="2" fill="#2e8b57"/>'
  + '<rect x="13" y="12" width="8" height="30" rx="2" fill="#3fae6c"/>'
  + '<rect x="24" y="2" width="8" height="40" rx="2" fill="#7bc88f"/>'
  + texte('Institut', 42, 20, 16, 800, '#2e8b57', 57)
  + texte('Santé Démo', 42, 38, 16, 500, '#2e8b57', 93));

// Un emblème carré : le plus compact de la série.
const edd = svg(84, 84,
  '<rect x="2" y="2" width="80" height="80" rx="14" fill="#e8742a"/>'
  + texte('ÉCOLE', 24, 34, 11, 600, '#ffffff', 36)
  + texte('EDD', 15.3, 62, 26, 800, '#ffffff', 53.4));

const ind = svg(164, 52,
  `<polygon points="${hexagone(26, 26, 23)}" fill="#6b3fa0"/>`
  + `<polygon points="${hexagone(26, 26, 11)}" fill="none" stroke="#ffffff" stroke-width="3"/>`
  + texte('Institut National', 58, 24, 13, 700, '#6b3fa0', 101)
  + texte('de Démonstration', 58, 41, 12, 500, '#6b3fa0', 102));

const asd = svg(164, 54,
  '<path d="M4 46C4 22 22 6 46 6C46 30 32 48 4 46Z" fill="#5a8f29"/>'
  + '<path d="M10 40C20 30 30 22 40 12" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>'
  + texte('AgroSciences', 56, 26, 15, 800, '#3f6b1c', 104)
  + texte('Démo', 56, 43, 15, 500, '#3f6b1c', 42));

// Un logo en hauteur : le plus étroit de la série.
const ptd = svg(70, 80,
  '<circle cx="35" cy="28" r="25" fill="none" stroke="#b3203a" stroke-width="6" stroke-dasharray="7 5.6"/>'
  + '<circle cx="35" cy="28" r="17" fill="none" stroke="#b3203a" stroke-width="4"/>'
  + '<circle cx="35" cy="28" r="7" fill="#b3203a"/>'
  + texte('PTD', 17.5, 73, 17, 800, '#b3203a', 35));

// Une bannière : le plus large de la série.
const mnd = svg(168, 40,
  texte('MÉTROPOLE DÉMO', 3, 19, 17, 800, '#2b5876', 162)
  + '<path d="M3 31q9-8 18 0t18 0t18 0t18 0t18 0t18 0t18 0t18 0t18 0" fill="none" stroke="#2b5876" stroke-width="2.5" stroke-linecap="round"/>');

const clex = svg(118, 46,
  '<path d="M23 42C6 30 3 17 11 10C17 5 23 9 23 14C23 9 29 5 35 10C43 17 40 30 23 42Z" fill="#d6336c"/>'
  + texte('Clinique', 52, 21, 15, 800, '#b02a5b', 62)
  + texte('Exemple', 52, 38, 15, 500, '#b02a5b', 61));

// Fondation Exemple : fondatrice qui n'a pas validé sa présence, son logo ne s'affiche donc nulle part.
const fdx = svg(126, 44,
  '<circle cx="22" cy="22" r="19" fill="#c58b00"/>'
  + `<polygon points="${points([[22, 8], [34, 22], [22, 36], [10, 22]])}" fill="#ffffff"/>`
  + texte('Fondation', 48, 20, 15, 800, '#8a6200', 74)
  + texte('Exemple', 48, 37, 15, 500, '#8a6200', 61));

// Dans l'ordre : le numéro de pièce jointe d'un dessin est sa position + 101.
const FICHIERS = [
  ['CHD', chd], ['UDD', udd], ['ISD', isd], ['EDD', edd], ['IND', ind], ['ASD', asd], ['PTD', ptd], ['MND', mnd],
  ['CLEX', clex], ['FDX', fdx]
];
const PREMIER_NUMERO = 101;

// { acronyme de l'établissement → numéro de pièce jointe }.
export const IDS_LOGOS = Object.fromEntries(FICHIERS.map(([cle], index) => [cle, PREMIER_NUMERO + index]));

// Le SVG de la pièce jointe `id`, ou null si ce numéro n'existe pas.
export function pieceJointe(id) {
  return FICHIERS[id - PREMIER_NUMERO]?.[1] ?? null;
}
