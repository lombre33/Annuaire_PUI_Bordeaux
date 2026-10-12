// Mesure, sur la page rendue, ce que l'audit UI/UX a relevé sur les cartes : la taille du texte
// (constat U20 : 91 % des caractères sous 12px, 8,5px pour les pastilles et les titres de
// groupe) et la hauteur des cibles à la souris (constat U08 : pastilles de 16px de haut, sous les
// 24px de la norme WCAG 2.5.8). Sont mesurés les éléments affichés d'une carte : tout élément
// qui porte lui-même du texte ; toute pastille, tout badge d'établissement, tout bouton
// « Modifier » (de la personne, ou de l'établissement sous son logo). La largeur n'est pas mesurée : une étiquette de plus d'une lettre entre deux marges
// de 9px dépasse 24px de large (sondé : aucune étiquette des jeux de test n'est plus étroite, même sans marge).
// La norme laisse aussi une cible de moins de 24px quand elle est isolée : un cercle de 24px centré
// sur elle ne touche aucune autre cible ni le cercle d'une autre petite cible (`crowdedSmall`). Le lien
// e-mail des cartes (15px de haut) ne tient que par là.
// `page` : une page Playwright sur le widget.

export const MIN_TEXT_PX = 12;
export const MIN_TARGET_PX = 24;

export const measureCards = page => page.evaluate(({ minText, minTarget }) => {
  const shown = element => element.getClientRects().length > 0;
  const label = element => `${element.className} « ${element.textContent.trim().slice(0, 24)} »`;
  const texts = [...document.querySelectorAll('.contact-card *')].filter(element => shown(element)
    && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
  const targets = [...document.querySelectorAll('.contact-card .tag, .contact-card .etablissement-tag, .contact-card .card-edit, .contact-card .etab-edit')].filter(shown);
  // Toutes les cibles de la page, pour mesurer l'isolement des petites cibles des cartes.
  const pointerTargets = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter(element => shown(element) && getComputedStyle(element).visibility !== 'hidden')
    .map(element => ({ element, box: element.getBoundingClientRect() }));
  const isSmall = ({ box }) => box.width < minTarget - 0.5 || box.height < minTarget - 0.5;
  const centerOf = ({ box }) => [box.left + box.width / 2, box.top + box.height / 2];
  const radius = minTarget / 2;
  const isCrowded = target => {
    const [x, y] = centerOf(target);
    return pointerTargets.some(other => {
      if (other === target) return false;
      if (isSmall(other)) {
        const [otherX, otherY] = centerOf(other);
        return Math.hypot(x - otherX, y - otherY) < minTarget; // les deux cercles se touchent
      }
      const dx = Math.max(other.box.left - x, 0, x - other.box.right);
      const dy = Math.max(other.box.top - y, 0, y - other.box.bottom);
      return Math.hypot(dx, dy) < radius; // le cercle touche l'autre cible
    });
  };
  return {
    texts: texts.length,
    targets: targets.length,
    smallText: texts.filter(element => parseFloat(getComputedStyle(element).fontSize) < minText)
      .map(element => `${label(element)} ${getComputedStyle(element).fontSize}`),
    // 23,5 : une demi-marge pour l'arrondi des rectangles.
    shortTargets: targets.filter(element => element.getBoundingClientRect().height < minTarget - 0.5)
      .map(element => `${label(element)} ${element.getBoundingClientRect().height.toFixed(1)}px`),
    smallTargets: pointerTargets.filter(target => target.element.closest('.contact-card') && isSmall(target)).length,
    crowdedSmall: pointerTargets.filter(target => target.element.closest('.contact-card') && isSmall(target) && isCrowded(target))
      .map(({ element, box }) => `${label(element)} ${box.width.toFixed(0)}×${box.height.toFixed(0)}px`)
  };
}, { minText: MIN_TEXT_PX, minTarget: MIN_TARGET_PX });
