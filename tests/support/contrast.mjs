// Contrastes de couleur (WCAG 2.x), pour les tests d'accessibilité : lit les couleurs
// calculées par le navigateur (`rgb(…)` ou `rgba(…)`), compose une couleur translucide
// sur son fond, et donne le rapport de contraste (1:1 à 21:1). Seuils : 4,5:1 pour un
// texte courant (1.4.3), 3:1 pour un gros texte ou un élément d'interface (1.4.11).

export const WHITE = [255, 255, 255, 1];

// « rgb(98, 87, 217) », « rgba(0, 0, 0, 0.5) » ou « #6257d9 » → [r, g, b, alpha].
export function parseColor(value) {
  const text = String(value).trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    const [r, g, b, a] = [0, 2, 4, 6].map(i => (digits.length > i ? parseInt(digits.slice(i, i + 2), 16) : 255));
    return [r, g, b, a / 255];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (!rgb) throw new Error(`Couleur illisible : ${value}`);
  const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

// Compose `top` (éventuellement translucide) sur `bottom`, opaque.
export function blend(top, bottom = WHITE) {
  const alpha = top[3];
  return [0, 1, 2].map(i => top[i] * alpha + bottom[i] * (1 - alpha)).concat(1);
}

export function luminance([r, g, b]) {
  const linear = channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

// Rapport de contraste entre deux couleurs ; une couleur translucide est d'abord posée sur
// `background` (blanc par défaut).
export function contrastRatio(foreground, background) {
  const bg = blend(typeof background === 'string' ? parseColor(background) : background);
  const fg = blend(typeof foreground === 'string' ? parseColor(foreground) : foreground, bg);
  const [light, dark] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
