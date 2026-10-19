// Prépare l'image qu'une personne a choisie (le logo de son établissement, sa photo de profil) avant
// son envoi à Grist (upload.js). Le fichier choisi n'est JAMAIS envoyé tel quel : il est lu, dessiné
// dans un canvas à une taille raisonnable (recadré en carré pour une photo de profil), puis ré-encodé
// en PNG (logo) ou en JPEG (photo). Ce qui part est donc toujours une image de pixels, sans
// métadonnées, sans script (un SVG peut en contenir) et de taille bornée, quel que soit le fichier
// d'origine. Rien n'est lu ni écrit ailleurs ; le DOM n'est touché que par un canvas
// qui n'est jamais ajouté à la page.
//
// Les règles (formats, poids, taille) sont dans constants.js (IMAGE_RULES).

import { IMAGE_RULES } from './constants.js';

// Erreur dont le message est une phrase française destinée à la personne.
export class ImageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'ImageError';
  }
}

const MEGABYTE = 1024 * 1024;
// Au-delà, décoder l'image saturerait la mémoire de l'onglet : 40 millions de pixels (8 000 x 5 000).
const MAX_PIXELS = 40 * 1000 * 1000;

const TYPE_NAMES = { 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP', 'image/svg+xml': 'SVG' };

// « 1,4 Mo » : un chiffre après la virgule, arrondi vers le haut (un fichier de 1,02 Mo ne se dit pas
// « 1 Mo » devant une limite de 1 Mo), le point décimal à la française.
export const megabytes = bytes => `${String(Math.ceil((bytes / MEGABYTE) * 10 - 1e-9) / 10).replace('.', ',')} Mo`;

const FAILURES = {
  unreadable: 'Cette image n’a pas pu être lue : choisissez un autre fichier.',
  noSize: 'Cette image n’a pas de dimensions lisibles : choisissez un autre fichier.',
  empty: 'Ce fichier est vide : choisissez-en un autre.',
  huge: 'Cette image est beaucoup trop grande : choisissez-en une plus petite.'
};

// Pourquoi le fichier choisi est refusé avant même d'être lu, ou '' s'il convient.
export function checkImageFile(file, rules = IMAGE_RULES.logo) {
  if (!file || !rules.types.includes(file.type)) {
    const names = rules.types.map(type => TYPE_NAMES[type] ?? type);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} ou ${names.at(-1)}` : names[0];
    return `Ce fichier n’est pas une image acceptée : choisissez un fichier ${list}.`;
  }
  if (file.size === 0) return FAILURES.empty;
  if (file.size > rules.maxBytes) return `Cette image pèse ${megabytes(file.size)} : choisissez-en une de ${megabytes(rules.maxBytes)} au plus.`;
  return '';
}

// La taille dessinée : l'image tient dans un carré de `maxSide` pixels, à ses proportions. Une
// image plus petite garde sa taille, sauf si `upscale` (un SVG se dessine à la taille voulue sans
// perdre en netteté).
export function fitWithin(width, height, maxSide, { upscale = false } = {}) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 0, height: 0 };
  const scale = upscale ? maxSide / longest : Math.min(1, maxSide / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Le carré découpé au centre d'une image : { x, y, side } dans l'image d'origine, et `size`, le côté
// dessiné : au plus `maxSide`, jamais plus que le carré d'origine (une petite photo n'est pas agrandie).
export function squareCrop(width, height, maxSide) {
  const side = Math.min(width, height);
  if (!(side > 0)) return { x: 0, y: 0, side: 0, size: 0 };
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side, size: Math.min(side, maxSide) };
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('lecture impossible'));
    reader.readAsDataURL(file);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image illisible'));
    image.src = url;
  });
}

// Lit et décode le fichier : l'image, si ses dimensions sont lisibles et raisonnables. Lève une ImageError.
async function decode(file) {
  let image;
  try {
    image = await loadImage(await readAsDataUrl(file));
  } catch (error) {
    throw new ImageError(FAILURES.unreadable, error);
  }
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new ImageError(FAILURES.noSize);
  if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new ImageError(FAILURES.huge);
  return image;
}

// Redessine l'image à la taille voulue dans un canvas : { canvas, width, height }. Lève une ImageError.
function draw(image, file, rules, doc) {
  const crop = rules.square ? squareCrop(image.naturalWidth, image.naturalHeight, rules.maxSide) : null;
  const { width, height } = crop
    ? { width: crop.size, height: crop.size }
    : fitWithin(image.naturalWidth, image.naturalHeight, rules.maxSide, { upscale: file.type === 'image/svg+xml' });
  const canvas = (doc ?? document).createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageError(FAILURES.unreadable);
  if (rules.output === 'image/jpeg') {
    // Un JPEG n'a pas de transparence : un fond noir remplacerait celle d'un PNG ou d'un WebP.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
  }
  if (crop) context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, width, height);
  else context.drawImage(image, 0, 0, width, height);
  return { canvas, width, height };
}

// Lit le fichier, le redessine et renvoie { blob, name, width, height } : une image prête à envoyer
// (le format et le nom viennent de `rules`). Lève une ImageError. `doc` ne change que dans les tests.
export async function prepareImage(file, rules = IMAGE_RULES.logo, { doc } = {}) {
  const fault = checkImageFile(file, rules);
  if (fault) throw new ImageError(fault);

  const { canvas, width, height } = draw(await decode(file), file, rules, doc);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, rules.output ?? 'image/png', rules.quality));
  if (!blob) throw new ImageError(FAILURES.unreadable);
  if (blob.size > rules.maxBytes) {
    throw new ImageError(`Une fois redessinée, cette image pèse ${megabytes(blob.size)} : choisissez-en une plus simple, de ${megabytes(rules.maxBytes)} au plus.`);
  }
  return { blob, name: rules.name ?? 'image.png', width, height };
}
