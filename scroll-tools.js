// Le haut de la page quand on a défilé (1.31.0, audit UI/UX U34) : avec des centaines de fiches, la page fait des dizaines de milliers
// de pixels de haut, et ni la barre d'outils ni le compteur ne restent à l'écran. Dès que la place de la barre d'outils est passée,
// une pastille fixe donne le nombre de contacts et un bouton « Haut de page » ; la barre d'outils elle-même reste en haut quand
// elle tient sans trop prendre de place (style.css). Rien ne s'exécute à l'import.

// `sentinel` : un repère sans hauteur, posé juste avant la barre d'outils (sa place dans la page) ; `tools` : la pastille (le compteur
// `count` et le bouton `toTop`) ; `home` : où le focus va quand on remonte (le compteur de contacts, qui est en haut de page).
// Renvoie { setCount(texte) }, que la page appelle à chaque dessin des cartes.
export function createScrollTools({ sentinel, toolbar, tools, count, toTop, home }) {
  // Défilé : la place de la barre d'outils est au-dessus de l'écran.
  new IntersectionObserver(([entry]) => {
    const scrolled = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    tools.hidden = !scrolled;
    document.body.classList.toggle('scrolled', scrolled);
  }).observe(sentinel);

  // Une barre d'outils fixe recouvre le haut de l'écran : ce qu'on y amène au clavier doit s'arrêter dessous (style.css, scroll-padding-top).
  new ResizeObserver(() => document.documentElement.style.setProperty('--toolbar-height', `${toolbar.offsetHeight}px`)).observe(toolbar);

  // Le haut de la page, pas seulement le compteur : sans `preventScroll`, le focus ferait défiler jusqu'à lui et non jusqu'en haut.
  toTop.addEventListener('click', () => {
    window.scrollTo(0, 0);
    home.focus({ preventScroll: true });
  });

  return { setCount: text => { count.textContent = text; } };
}
