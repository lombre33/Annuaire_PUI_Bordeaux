// Les illustrations de la fenêtre de connexion (login-ui.js) : les mêmes dessins que la fenêtre du widget « agenda partagé » (trois étapes,
// dessinées et non capturées : une capture dépendrait de l'habillage de Grist). Reprises telles quelles (viewBox 320 × 120, mêmes formes, mêmes
// couleurs), sauf la troisième, `record`, qui montre les boutons de l'annuaire à la place de « Présent » et « À confirmer ». Elles se bâtissent
// par le DOM (createElementNS) : aucun HTML n'est construit dans le widget (tests/docs.test.mjs). `__SERVICE__` et `__REFERENCE__` sont
// remplacés par le service de connexion et le service que les gens connaissent déjà (constants.js).

const SVG_NS = 'http://www.w3.org/2000/svg';

const ART = {
  button: {
    label: 'Page Grist : le bouton « Se connecter » est en haut à droite',
    shapes: [
      ['rect', { x: 1, y: 1, width: 318, height: 118, rx: 10, fill: '#fff', stroke: '#e5dce3', 'stroke-width': 2 }],
      ['path', { d: 'M1 11a10 10 0 0 1 10-10h298a10 10 0 0 1 10 10v24H1z', fill: '#f4f0f3' }],
      ['rect', { x: 14, y: 13, width: 60, height: 9, rx: 4.5, fill: '#d9cfd7' }],
      ['rect', { x: 82, y: 13, width: 40, height: 9, rx: 4.5, fill: '#e8e0e6' }],
      ['rect', { x: 218, y: 8, width: 90, height: 22, rx: 11, fill: '#b9348b' }],
      ['text', { x: 263, y: 23, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, 'Se connecter'],
      ['rect', { x: 213, y: 3, width: 100, height: 32, rx: 16, fill: 'none', stroke: '#ffcc00', 'stroke-width': 3.5 }],
      ['path', { d: 'M150 78C190 78 232 66 256 44', fill: 'none', stroke: '#3b1c13', 'stroke-width': 3, 'stroke-linecap': 'round' }],
      ['path', { d: 'M247 43l10-1-3 10', fill: 'none', stroke: '#3b1c13', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
      ['text', { x: 22, y: 84, 'font-family': 'Georgia, serif', 'font-size': 13, fill: '#3b1c13' }, 'En haut à droite'],
      ['rect', { x: 22, y: 96, width: 190, height: 8, rx: 4, fill: '#efe9ee' }],
    ]
  },
  hereButton: {
    label: 'Cette fenêtre : le bouton « Se connecter » est en bas à droite',
    shapes: [
      ['rect', { x: 1, y: 1, width: 318, height: 118, rx: 10, fill: '#fff', stroke: '#e5dce3', 'stroke-width': 2 }],
      ['rect', { x: 1, y: 1, width: 318, height: 8, rx: 4, fill: '#b9348b' }],
      ['rect', { x: 18, y: 22, width: 150, height: 10, rx: 5, fill: '#3b1c13' }],
      ['rect', { x: 18, y: 42, width: 240, height: 7, rx: 3.5, fill: '#d9cfd7' }],
      ['rect', { x: 18, y: 56, width: 200, height: 7, rx: 3.5, fill: '#efe9ee' }],
      ['rect', { x: 198, y: 80, width: 106, height: 28, rx: 14, fill: '#b9348b' }],
      ['text', { x: 251, y: 98, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 12, 'font-weight': 700, fill: '#fff' }, 'Se connecter'],
      ['rect', { x: 193, y: 75, width: 116, height: 38, rx: 19, fill: 'none', stroke: '#ffcc00', 'stroke-width': 3.5 }],
      ['text', { x: 22, y: 98, 'font-family': 'Georgia, serif', 'font-size': 13, fill: '#3b1c13' }, 'Juste ici'],
      ['path', { d: 'M78 94C108 94 150 94 184 94', fill: 'none', stroke: '#3b1c13', 'stroke-width': 3, 'stroke-linecap': 'round' }],
      ['path', { d: 'M175 87l10 7-10 7', fill: 'none', stroke: '#3b1c13', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ]
  },
  service: {
    label: 'Page de connexion : le bouton « S’identifier avec __SERVICE__ »',
    shapes: [
      ['rect', { x: 1, y: 1, width: 318, height: 118, rx: 10, fill: '#fff', stroke: '#e5dce3', 'stroke-width': 2 }],
      ['text', { x: 160, y: 30, 'text-anchor': 'middle', 'font-family': 'Georgia, serif', 'font-size': 14, 'font-weight': 700, fill: '#3b1c13' }, 'Connexion'],
      ['rect', { x: 42, y: 44, width: 236, height: 38, rx: 6, fill: '#000091' }],
      ['text', { x: 160, y: 68, 'text-anchor': 'middle', 'font-family': 'Arial, sans-serif', 'font-size': 13, 'font-weight': 700, fill: '#fff' }, 'S’identifier avec __SERVICE__'],
      ['rect', { x: 37, y: 39, width: 246, height: 48, rx: 10, fill: 'none', stroke: '#ffcc00', 'stroke-width': 3.5 }],
      ['text', { x: 160, y: 106, 'text-anchor': 'middle', 'font-family': 'Georgia, serif', 'font-size': 11, fill: '#615961' }, 'Comme pour __REFERENCE__'],
    ]
  },
  record: {
    label: 'L’annuaire vous reconnaît : les boutons « Modifier ma fiche » et « Créer ma fiche » apparaissent',
    shapes: [
      ['rect', { x: 1, y: 1, width: 318, height: 118, rx: 10, fill: '#fff', stroke: '#e5dce3', 'stroke-width': 2 }],
      ['rect', { x: 16, y: 16, width: 170, height: 11, rx: 5.5, fill: '#3b1c13' }],
      ['rect', { x: 16, y: 34, width: 120, height: 8, rx: 4, fill: '#d9cfd7' }],
      ['rect', { x: 16, y: 54, width: 130, height: 8, rx: 4, fill: '#efe9ee' }],
      ['rect', { x: 16, y: 78, width: 156, height: 28, rx: 14, fill: '#b9348b' }],
      ['text', { x: 94, y: 97, 'text-anchor': 'middle', 'font-family': 'Georgia, serif', 'font-size': 12, 'font-weight': 700, fill: '#fff' }, '✎ Modifier ma fiche'],
      ['rect', { x: 182, y: 78, width: 122, height: 28, rx: 14, fill: '#fff', stroke: '#b9348b', 'stroke-width': 2 }],
      ['text', { x: 243, y: 97, 'text-anchor': 'middle', 'font-family': 'Georgia, serif', 'font-size': 12, 'font-weight': 700, fill: '#b9348b' }, '+ Créer ma fiche'],
      ['rect', { x: 11, y: 73, width: 166, height: 38, rx: 19, fill: 'none', stroke: '#ffcc00', 'stroke-width': 3.5 }],
    ]
  }
};

// Le dessin `key` : un <svg role="img"> étiqueté, prêt à être posé dans un <figure>.
export function illustration(key, { service, reference }) {
  const { label, shapes } = ART[key];
  const fill = text => text.replaceAll('__SERVICE__', service).replaceAll('__REFERENCE__', reference);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 120');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', fill(label));
  for (const [tag, attributes, text] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, fill(String(value)));
    if (text) shape.textContent = fill(text);
    svg.append(shape);
  }
  return svg;
}
