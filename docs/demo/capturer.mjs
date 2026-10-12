// Régénère les captures d'écran de docs/images/ à partir du vrai widget et des
// données fictives (donnees-fictives.mjs) : rien de réel n'apparaît dessus.
//
//   npm install --no-save playwright      (une fois ; pas une dépendance du projet)
//   npx playwright install chromium       (ou CHROMIUM_PATH=/chemin/vers/chromium)
//   node docs/demo/capturer.mjs                          (toutes les captures)
//   node docs/demo/capturer.mjs apercu partenaires       (seulement les captures dont le nom commence ainsi)
//   node docs/demo/capturer.mjs --sortie=/tmp/essai      (dans un autre dossier que docs/images)
//
// À relancer, puis à committer, après toute modification de l'interface.
// Chaque capture est précédée d'une vérification (nombre de cartes, logos chargés,
// bandeau, boutons « Modifier », étape de la fenêtre de modification) : si le widget
// n'affiche pas ce qui est attendu, le script échoue au lieu de photographier un
// écran faux.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoServer } from './serveur-demo.mjs';
import { CARTES_ATTENDUES, HABILLAGE_ATTENDU, PERSONNES_AVEC_PHOTO, PERSONNES_DEMO } from './donnees-fictives.mjs';
import { visageSvg } from './portraits-fictifs.mjs';

const DOSSIER_IMAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'images');
const LARGEUR = 1440; // un écran de PC : à partir de 1400 px, la mise en page est celle de départ (style.css)
const HAUTEUR_FENETRE = 2200; // grande : chaque capture est rognée sur ce qui l'intéresse (voir `zone`)
const FACTEUR_ECHELLE = 1.5; // captures nettes sur écran à haute densité sans alourdir le dépôt
const MARGE = 28; // espace gardé sous l'élément qui borne la capture
const MARGE_RANGEE = 8; // plus petite que l'écart entre deux rangées de cartes (14 px) : la rangée suivante ne déborde pas sur la capture
const MARGE_ENTETE = 12; // sous l'en-tête : moins que l'écart qui le sépare de la barre de recherche, qui ne déborde donc pas sur la capture
const HAUTEUR_FENETRE_MODIFICATION = 1000; // la fenêtre de modification mesure au plus 900 px (dialogs.css) : elle tient en entier à l'écran
const MARGE_FENETRE = 12; // fond assombri gardé autour de la fenêtre de modification
const HAUTEUR_FENETRE_RELECTURE = 1250; // la relecture, sans le plafond de 900 px de la fenêtre (voir la scène), mesure environ 1 030 px
const HAUTEUR_CONFIRMATION = 900; // le message de confirmation est fixé en bas de l'écran : la capture garde l'écran entier
const HAUTEUR_FENETRE_PHOTO = 1000; // l'agrandissement d'une photo tient dans moins de 700 px : une fenêtre de la hauteur de celle de modification suffit
const HAUTEUR_FENETRE_LEGENDE = 3600; // la carte de la légende est loin dans la liste (cartes triées par nom, hautes de 520 px) : elle doit tenir dans la fenêtre pour que les repères, fixés à l'écran, la suivent

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright est introuvable. Installez-le sans l\'ajouter au projet :\n'
    + '  npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

// Les logos sont des images que le widget demande à Grist : une capture prise trop tôt montrerait
// des cadres vides ou à demi transparents (un logo apparaît en fondu). On attend que chaque logo
// soit chargé et pleinement visible (ou remplacé par le nom de l'établissement quand Grist refuse
// le fichier), sauf ceux des cartes hors de l'écran, que le navigateur ne charge pas avant d'en
// approcher (loading="lazy") : au-dessus de l'écran comme au-dessous, si la page a défilé.
const attendreLogos = page =>
  page.waitForFunction(() => [...document.querySelectorAll('img.logo-img')]
    .filter(image => {
      const boite = image.getBoundingClientRect();
      return image.loading === 'eager' || (boite.bottom > 0 && boite.top < window.innerHeight);
    })
    .every(image => image.classList.contains('loaded') && getComputedStyle(image).opacity === '1'), null, { timeout: 10_000 });
const attendreCartes = async (page, nombre) => {
  await page.waitForFunction(attendu => document.querySelectorAll('.contact-card').length === attendu, nombre, { timeout: 10_000 });
  await attendreLogos(page);
};
const attendreBandeau = page =>
  page.waitForFunction(() => !document.getElementById('statusBanner').hidden, null, { timeout: 10_000 });
// Le bandeau « Ma présence » est affiché, dit `extrait` et n'a plus de message passager à
// l'écran (« Enregistrement… » après un clic). L'annonce d'une réussite (data-tone="done") est
// réservée aux lecteurs d'écran : elle ne se voit pas, donc ne compte pas.
const attendrePresence = (page, extrait) =>
  page.waitForFunction(attendu => {
    const bandeau = document.getElementById('accountBar');
    const message = bandeau.querySelector('.account-status');
    return !bandeau.hidden && bandeau.querySelector('.account-detail').textContent.includes(attendu)
      && (message.textContent === '' || message.dataset.tone === 'done');
  }, extrait, { timeout: 10_000 });
const filtre = (page, cle) => page.locator(`.filter[data-filter-key="${cle}"]`);
const carteDe = (page, nom) => page.locator('.contact-card', { has: page.locator('.name', { hasText: new RegExp(`^${nom}$`) }) });

// Ouvre le menu, coche l'option, puis le referme comme le ferait un utilisateur
// (un clic ailleurs) : un menu resté ouvert masquerait le bouton suivant.
async function cocher(page, cle, libelle) {
  const menu = filtre(page, cle);
  await menu.locator('.filter-button').click();
  await menu.locator('.filter-option', { hasText: libelle }).locator('input').check();
  await page.mouse.click(5, 5);
}

// Les menus Compétences (par domaine) et Tâches (par action) rangent leurs valeurs par groupe :
// une case par groupe, qui coche toutes ses valeurs, et une flèche qui en déplie le détail.
const rubrique = (page, cle, nom) => filtre(page, cle).locator(`.filter-group[data-value="${nom}"]`);
const nomsDesRubriques = (page, cle) => filtre(page, cle).locator('.group-head .option-label').allTextContents();
// Ce que le menu montre vraiment : une ligne repliée ou masquée n'a plus de boîte à l'écran.
const visibles = (page, cle, selecteur) => filtre(page, cle).locator(selecteur).evaluateAll(lignes =>
  lignes.filter(ligne => ligne.getClientRects().length > 0).map(ligne => ligne.dataset.value));

// ===== Modifier une fiche =====

// Le brouillon de Camille Rousseau, saisi comme le ferait la personne : une fonction
// modifiée, une action et une compétence ajoutées, une autre action et une autre
// compétence retirées. Le formulaire (modifier-fiche-formulaire.png) puis la relecture
// (modifier-fiche-relecture.png) le montrent : les deux captures racontent la même histoire.
const BROUILLON = {
  fonction: 'Responsable de l\'innovation',
  listes: [
    { groupe: 'Actions', ajout: 'Action 3: Formation à l\'innovation', retrait: 'Action 6: Recherche de financements' },
    { groupe: 'Compétences', ajout: 'Intelligence artificielle', retrait: 'Gestion de projet' }
  ]
};
const CHAMPS_MODIFIES = 1 + BROUILLON.listes.length; // la fonction et les deux listes

const echapper = texte => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fenetre = page => page.locator('#profileDialog');
const fenetreEtab = page => page.locator('#etabDialog');
const groupe = (page, titre) =>
  fenetre(page).locator('.grp').filter({ has: page.locator('.grp-title', { hasText: new RegExp(`^${echapper(titre)}$`) }) });
const pastille = (page, titre, libelle) =>
  groupe(page, titre).locator('.pick', { hasText: new RegExp(`^${echapper(libelle)}$`) });

// Une vérification qui ne se règle pas en attendant : le script s'arrête sur un écran faux.
function exiger(condition, message) {
  if (!condition) throw new Error(`Écran inattendu : ${message}`);
}

// ===== L'habillage : logos des financeurs, des fondateurs et des cartes =====

// Ce que la page montre de l'habillage, lu dans le DOM : le logo chargé de chaque emplacement
// (son texte alternatif ou l'infobulle de l'établissement), ou « texte : … » quand le nom
// remplace le logo.
const lireHabillage = page => page.evaluate(() => {
  const emplacement = (item, nom) => (item.querySelector('img.loaded') ? nom : `texte : ${item.textContent}`);
  return {
    financeurs: [...document.querySelectorAll('#fundersLogos .funder')].map(item => emplacement(item, item.querySelector('img')?.alt)),
    bandeau: [...document.querySelectorAll('#bandLogos .band-item')].map(item => emplacement(item, item.title)),
    rond: [...document.querySelectorAll('#bandRoundel img.loaded')].length,
    cartesAvecLogo: document.querySelectorAll('.contact-card .etablissement-tag.has-logo').length,
    cartesSansLogo: document.querySelectorAll('.contact-card .etablissement-tag.visible:not(.has-logo)').length
  };
});

// Les logos sont affichés comme le jeu de démonstration les décrit : les financeurs et les
// fondateurs dans leur ordre, le rond du bandeau, un logo sur chaque carte sauf `sansLogo`.
async function exigerHabillage(page, { cartes, sansLogo = 0 }) {
  const habillage = await lireHabillage(page);
  exiger(JSON.stringify(habillage.financeurs) === JSON.stringify(HABILLAGE_ATTENDU.financeurs),
    `les financeurs sont « ${habillage.financeurs.join(' | ')} »`);
  exiger(JSON.stringify(habillage.bandeau) === JSON.stringify(HABILLAGE_ATTENDU.bandeau),
    `le bandeau des fondateurs est « ${habillage.bandeau.join(' | ')} »`);
  exiger(habillage.rond === 1, 'le rond qui ferme le bandeau est absent');
  exiger(habillage.cartesSansLogo === sansLogo && habillage.cartesAvecLogo === cartes - sansLogo,
    `${habillage.cartesAvecLogo} cartes ont un logo et ${habillage.cartesSansLogo} le nom de l'établissement, au lieu de ${cartes - sansLogo} et ${sansLogo}`);
}

// Le bandeau propose « Modifier mon profil » et la carte de la personne, la seule à avoir
// un bouton, porte « Votre fiche » et « ✎ Modifier ». Les cartes étant triées par nom, la sienne
// n'est pas forcément sur la première rangée.
const attendreBoutonsModifier = (page, nom) =>
  page.waitForFunction(attendu => {
    const bouton = document.querySelector('#accountBar .account-edit');
    const cartes = [...document.querySelectorAll('.contact-card')];
    const avecBouton = cartes.filter(carte => !carte.querySelector('.card-actions').hidden);
    if (!bouton || bouton.hidden || bouton.textContent !== 'Modifier mon profil' || avecBouton.length !== 1) return false;
    const [carte] = avecBouton;
    return carte.querySelector('.name').textContent === attendu
      && !carte.querySelector('.own-flag').hidden && carte.querySelector('.own-flag').textContent === 'Votre fiche'
      && carte.querySelector('.card-edit').textContent === '✎ Modifier';
  }, nom, { timeout: 10_000 });

// La fenêtre est ouverte sur l'étape qui porte ce titre (« Modifier mon profil », « Relire avant de valider »).
const attendreEtape = (page, titre) =>
  page.waitForFunction(attendu => document.getElementById('profileDialog').open
    && document.getElementById('profileTitle').textContent === attendu, titre, { timeout: 10_000 });

// Un administrateur allume le « mode admin » du bandeau : chaque carte a son bouton « Modifier ».
async function allumerModeAdmin(page) {
  await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
  await page.locator('#accountBar .account-admin').waitFor();
  await page.click('#accountBar .account-admin');
  await page.waitForFunction(attendu => document.querySelectorAll('.card-actions:not([hidden]) .card-edit').length === attendu,
    CARTES_ATTENDUES.fondateurs, { timeout: 10_000 });
}

// Ouvre la fenêtre par le bouton du bandeau, comme le ferait la personne.
async function ouvrirMonProfil(page) {
  await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
  await attendreBoutonsModifier(page, 'Camille Rousseau');
  await page.click('#accountBar .account-edit');
  await attendreEtape(page, 'Modifier mon profil');
}

// Saisit le brouillon dans le formulaire, puis revient en haut de la fenêtre : une pastille
// de la liste des compétences, tout en bas, fait défiler le formulaire pour être cliquée.
async function saisirBrouillon(page) {
  await page.fill('#profile-Fonction', BROUILLON.fonction);
  for (const { groupe: titre, ajout, retrait } of BROUILLON.listes) {
    await pastille(page, titre, ajout).click();
    await pastille(page, titre, retrait).click();
  }
  await page.evaluate(() => {
    document.activeElement.blur(); // pas de contour de saisie sur la capture
    document.querySelector('#profileDialog .dlg-body').scrollTop = 0;
  });
}

// ===== La photo de profil (colonne Avatar de BDD, 1.18.0) =====

// Les cartes de la grille dont l'avatar montre une photo, dans l'ordre (les cartes sont triées par nom).
const cartesAvecPhoto = page => page.evaluate(() =>
  [...document.querySelectorAll('#cardsGrid .contact-card')]
    .filter(carte => carte.querySelector('.avatar.has-photo'))
    .map(carte => carte.querySelector('.name').textContent));

const fenetrePhoto = page => page.locator('#photoDialog');

// Le fichier que Camille Rousseau choisit : le premier visage inventé qu'aucune carte de l'annuaire n'a,
// dessiné en PNG de 600 x 600 px par le navigateur dans une feuille à part (pas dans le widget), comme le
// donnerait un appareil photo.
async function fichierPhoto(page) {
  const feuille = await page.context().newPage();
  try {
    const base64 = await feuille.evaluate(async dessin => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dessin)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      canvas.getContext('2d').drawImage(image, 0, 0, 600, 600);
      return canvas.toDataURL('image/png').split(',')[1];
    }, visageSvg(PERSONNES_AVEC_PHOTO.length));
    return { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
  } finally {
    await feuille.close();
  }
}

// Camille choisit sa photo : le widget la recadre en carré de 256 px et l'aperçu la montre à la place
// des initiales ; seule modification du brouillon.
async function choisirPhoto(page) {
  await page.locator('#profilePhotoFile').setInputFiles(await fichierPhoto(page));
  await page.waitForFunction(() => {
    const aperçu = document.querySelector('#profileDialog .photo-preview .avatar');
    return aperçu?.classList.contains('has-photo') && document.querySelector('#profileDialog .photo-status').textContent === '';
  }, null, { timeout: 10_000 });
  await page.evaluate(() => {
    document.activeElement.blur(); // pas de contour de saisie sur la capture
    document.querySelector('#profileDialog .dlg-body').scrollTop = 0;
  });
}

// ===== Zones de capture : pleine largeur, du haut de la page jusqu'à... =====

const enPleineLargeur = (bas, marge = MARGE) => ({ x: 0, y: 0, width: LARGEUR, height: Math.ceil(bas + marge) });

// ...le bas d'un élément (`marge` : espace gardé dessous, MARGE_RANGEE quand un autre
// bloc suit de près et ne doit pas déborder sur la capture).
const jusquAu = (selecteur, marge = MARGE) => async page =>
  enPleineLargeur(await page.evaluate(
    cible => document.querySelector(cible).getBoundingClientRect().bottom, selecteur), marge);

// ...le bas de la n-ième rangée de cartes (les cartes d'une rangée ont le même haut).
const jusquALaRangee = rangees => async page =>
  enPleineLargeur(await page.evaluate(nombre => {
    const boites = [...document.querySelectorAll('.contact-card')].map(carte => carte.getBoundingClientRect());
    const hauts = [...new Set(boites.map(boite => Math.round(boite.top)))].sort((a, b) => a - b).slice(0, nombre);
    return Math.max(...boites.filter(boite => hauts.includes(Math.round(boite.top))).map(boite => boite.bottom));
  }, rangees), MARGE_RANGEE);

// ...ou : un élément, sur toute la largeur de la page, avec un peu de marge au-dessus et au-dessous
// (coordonnées de la page entière : la scène demande `pagePleine`).
const autourDe = (selecteur, marge = MARGE) => async page => {
  const { haut, bas } = await page.evaluate(cible => {
    const boite = document.querySelector(cible).getBoundingClientRect();
    return { haut: boite.top + window.scrollY, bas: boite.bottom + window.scrollY };
  }, selecteur);
  const debut = Math.max(0, Math.floor(haut - marge));
  return { x: 0, y: debut, width: LARGEUR, height: Math.ceil(bas + marge) - debut };
};

// ...ou : la fenêtre de modification d'une fiche, avec un peu du fond assombri autour.
const autourDeLaFenetre = async page => {
  const boite = await fenetre(page).boundingBox();
  return { x: boite.x - MARGE_FENETRE, y: boite.y - MARGE_FENETRE, width: boite.width + 2 * MARGE_FENETRE, height: boite.height + 2 * MARGE_FENETRE };
};

// ...ou : la fenêtre qui agrandit une photo, cadrée de la même façon.
const autourDeLaPhoto = async page => {
  const boite = await fenetrePhoto(page).boundingBox();
  return { x: boite.x - MARGE_FENETRE, y: boite.y - MARGE_FENETRE, width: boite.width + 2 * MARGE_FENETRE, height: boite.height + 2 * MARGE_FENETRE };
};

// ...ou : la fiche d'un établissement, cadrée de la même façon.
const autourDeLaFicheEtab = async page => {
  const boite = await fenetreEtab(page).boundingBox();
  return { x: boite.x - MARGE_FENETRE, y: boite.y - MARGE_FENETRE, width: boite.width + 2 * MARGE_FENETRE, height: boite.height + 2 * MARGE_FENETRE };
};

// ===== Légende numérotée d'une carte =====

// Repères posés à côté de chaque élément expliqué dans docs/utilisateurs.md.
// `texte` : on mesure le texte et non la boîte (qui s'étire sur toute la largeur) ;
// `dernier` : on prend le dernier élément qui correspond au sélecteur.
const REPERES = [
  { numero: 1, selecteur: '.avatar', placement: 'coin' },
  { numero: 2, selecteur: '.name', texte: true },
  { numero: 3, selecteur: '.fonction', texte: true },
  { numero: 4, selecteur: '.etablissement-tag .logo-img', placement: 'gauche' },
  { numero: 5, selecteur: '.email', texte: true },
  { numero: 6, selecteur: '.tel', texte: true },
  { numero: 7, selecteur: '.tag-group-title', texte: true },
  { numero: 8, selecteur: '.tag-instances', dernier: true },
  { numero: 9, selecteur: '.tag-static' }
];

// Les pastilles sont ajoutées à la page le temps de la capture seulement :
// le widget lui-même n'est pas modifié.
async function poserReperes(page, nom) {
  await page.evaluate(({ reperes, nom }) => {
    const carte = [...document.querySelectorAll('.contact-card')].find(autre => autre.querySelector('.name').textContent === nom);
    reperes.forEach(({ numero, selecteur, texte, dernier, placement = 'droite' }) => {
      const cibles = carte.querySelectorAll(selecteur);
      const cible = dernier ? cibles[cibles.length - 1] : cibles[0];
      const zone = document.createRange();
      if (texte) zone.selectNodeContents(cible);
      const boite = texte ? zone.getBoundingClientRect() : cible.getBoundingClientRect();
      const taille = 18;
      const positions = {
        droite: [boite.right + 6, boite.top + boite.height / 2 - taille / 2],
        gauche: [boite.left - taille - 6, boite.top + boite.height / 2 - taille / 2],
        coin: [boite.right - taille / 2 - 2, boite.bottom - taille / 2 - 2]
      };
      const [gauche, haut] = positions[placement];
      const repere = document.createElement('div');
      repere.textContent = String(numero);
      repere.style.cssText = `position:fixed;z-index:99;left:${gauche}px;top:${haut}px;width:${taille}px;height:${taille}px;`
        + 'border-radius:50%;background:#6257d9;color:#fff;box-shadow:0 0 0 2px #fff;pointer-events:none;'
        + 'font:700 11px/18px Inter,system-ui,sans-serif;text-align:center;';
      document.body.appendChild(repere);
    });
  }, { reperes: REPERES, nom });
}

// Chaque scène : fichier produit, adresse à ouvrir (`requete`), mise en situation
// vérifiée par `preparer`, zone rognée (par défaut toute la fenêtre) et, si elle doit
// différer de HAUTEUR_FENETRE, hauteur de la fenêtre du navigateur (`hauteur`).
// `pagePleine` : la zone se mesure sur la page entière (le bas de la page, hors de la fenêtre).
const SCENES = [
  {
    fichier: 'apercu.png', zone: jusquALaRangee(2),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await exigerHabillage(page, { cartes: CARTES_ATTENDUES.fondateurs });
    }
  },
  {
    // Le bas de la page : les logos des fondateurs dans l'ordre de la colonne ordre_bandeau, le rond
    // des financeurs, et la phrase qui renvoie à la page du PUI.
    fichier: 'bandeau-fondateurs.png', pagePleine: true, zone: autourDe('#foundersBand'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await exigerHabillage(page, { cartes: CARTES_ATTENDUES.fondateurs });
      exiger(await page.locator('#bandLink').getAttribute('href') !== null, 'le lien du bandeau ne mène nulle part');
    }
  },
  {
    // Grist ne donne pas le jeton d'accès aux pièces jointes : les noms remplacent les logos partout.
    fichier: 'sans-logos.png', requete: '?sanslogos', zone: jusquALaRangee(1),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      const habillage = await lireHabillage(page);
      exiger(habillage.financeurs.length === HABILLAGE_ATTENDU.financeurs.length && habillage.financeurs.every(nom => nom.startsWith('texte : ')),
        'les financeurs ne sont pas écrits en toutes lettres');
      exiger(habillage.bandeau.length === HABILLAGE_ATTENDU.bandeau.length && habillage.bandeau.every(nom => nom.startsWith('texte : ')),
        'les fondateurs du bandeau ne sont pas écrits en toutes lettres');
      exiger(habillage.cartesAvecLogo === 0 && habillage.cartesSansLogo === CARTES_ATTENDUES.fondateurs,
        'toutes les cartes doivent porter le nom de l\'établissement');
      exiger(await page.evaluate(() => window.__demo.demandesJeton.length) >= 1, 'le widget n\'a pas demandé de jeton');
    }
  },
  {
    // Un menu à plat : champ de recherche, cases à cocher et, à droite, le nombre de cartes.
    fichier: 'filtre-menu.png', zone: jusquAu('.filter.open .filter-menu'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await filtre(page, 'instances').locator('.filter-button').click();
    }
  },
  {
    // Le menu Compétences, rouvert : « Recherche clinique » est coché en entier, « Santé numérique
    // et données » en partie (Open science seule) ; ce qui est coché passe devant et le groupe
    // partiel est déplié.
    fichier: 'filtre-competences.png', zone: jusquAu('.filter.open .filter-menu'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      const menu = filtre(page, 'competences');
      await menu.locator('.filter-button').click();
      await rubrique(page, 'competences', 'Recherche clinique').locator('.group-option input').check();
      const sante = rubrique(page, 'competences', 'Santé numérique et données');
      await sante.locator('.group-toggle').click();
      await sante.locator('.filter-option', { hasText: 'Open science' }).locator('input').check();
      await attendreCartes(page, 3);
      await page.mouse.click(5, 5);
      await menu.locator('.filter-button').click();
      const noms = await nomsDesRubriques(page, 'competences');
      exiger(noms[0] === 'Recherche clinique' && noms[1] === 'Santé numérique et données',
        `les domaines cochés ne passent pas devant : ${noms.join(', ')}`);
      exiger(await rubrique(page, 'competences', 'Recherche clinique').getAttribute('data-state') === 'all', '« Recherche clinique » n\'est pas coché en entier');
      exiger(await rubrique(page, 'competences', 'Santé numérique et données').getAttribute('data-state') === 'some', '« Santé numérique et données » n\'est pas coché en partie');
      exiger((await visibles(page, 'competences', '.filter-option')).join() === 'Open science,Intelligence artificielle,Santé numérique',
        'le détail du domaine partiel n\'est pas déplié, la compétence cochée en tête');
      exiger(await menu.locator('.filter-count').textContent() === '2', 'le bouton ne compte pas un domaine et une compétence');
    }
  },
  {
    // La recherche du menu trouve un domaine comme une compétence : « sante » donne le domaine
    // « Santé numérique et données », avec toutes ses compétences.
    fichier: 'filtre-competences-recherche.png', zone: jusquAu('.filter.open .filter-menu'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      const menu = filtre(page, 'competences');
      await menu.locator('.filter-button').click();
      await menu.locator('.filter-search-input').fill('sante');
      exiger((await visibles(page, 'competences', '.filter-group')).join() === 'Santé numérique et données', 'la recherche ne garde pas ce seul domaine');
      exiger((await visibles(page, 'competences', '.filter-option')).length === 3, 'la recherche ne montre pas les trois compétences du domaine');
    }
  },
  {
    // Le menu Tâches, rangé par action (le numéro d'une tâche est celui de son action) : l'action 2
    // est cochée en entier, l'action 1 en partie (« 1.1 Animation de réseau » seule) ; les deux
    // passent devant et l'action partielle est dépliée. « Sans action » reste en dernier.
    fichier: 'filtre-taches.png', zone: jusquAu('.filter.open .filter-menu'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      const menu = filtre(page, 'taches');
      await menu.locator('.filter-button').click();
      await rubrique(page, 'taches', 'Action 2: Maturation de projets').locator('.group-option input').check();
      const valorisation = rubrique(page, 'taches', 'Action 1: Valorisation de la recherche');
      await valorisation.locator('.group-toggle').click();
      await valorisation.locator('.filter-option', { hasText: '1.1 Animation de réseau' }).locator('input').check();
      await attendreCartes(page, 9);
      await page.mouse.click(5, 5);
      await menu.locator('.filter-button').click();
      const noms = await nomsDesRubriques(page, 'taches');
      exiger(noms.join() === 'Action 1: Valorisation de la recherche,Action 2: Maturation de projets,'
        + 'Action 3: Formation à l\'innovation,Action 4: Veille et propriété intellectuelle,Sans action',
        `les actions cochées ne passent pas devant, « Sans action » n'est pas en dernier : ${noms.join(', ')}`);
      exiger(await rubrique(page, 'taches', 'Action 2: Maturation de projets').getAttribute('data-state') === 'all', 'l\'action 2 n\'est pas cochée en entier');
      exiger(await valorisation.getAttribute('data-state') === 'some', 'l\'action 1 n\'est pas cochée en partie');
      exiger((await visibles(page, 'taches', '.filter-option')).join() === '1.1 Animation de réseau,1.2 Organisation d\'événements',
        'le détail de l\'action partielle n\'est pas déplié, la tâche cochée en tête');
      exiger(await menu.locator('.filter-count').textContent() === '2', 'le bouton ne compte pas une action et une tâche');
    }
  },
  {
    fichier: 'filtres-combines.png', zone: jusquALaRangee(1),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await cocher(page, 'communautes', 'Santé numérique');
      await cocher(page, 'etablissement', 'CHD');
      await attendreCartes(page, 3);
    }
  },
  {
    fichier: 'recherche.png', zone: jusquALaRangee(1),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await page.fill('#searchInput', 'elise'); // trouve « Élise » : la recherche ignore accents et casse
      await attendreCartes(page, 1);
    }
  },
  {
    fichier: 'partenaires.png', zone: jusquALaRangee(2),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await page.click('[data-scope="partenaire"]');
      await attendreCartes(page, CARTES_ATTENDUES.fondateursEtPartenaires);
      await page.click('[data-scope="fondateur"]');
      const partenaires = CARTES_ATTENDUES.fondateursEtPartenaires - CARTES_ATTENDUES.fondateurs;
      await attendreCartes(page, partenaires);
      // Un établissement partenaire sans logo garde son nom écrit sur ses cartes.
      await exigerHabillage(page, { cartes: partenaires, sansLogo: HABILLAGE_ATTENDU.cartesPartenairesSansLogo });
    }
  },
  {
    fichier: 'etat-vide.png', zone: jusquAu('#emptyState'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await page.fill('#searchInput', 'zzz');
      await attendreCartes(page, 0);
    }
  },
  {
    fichier: 'bandeau-panne.png', requete: '?panne=Etablissements', zone: jusquAu('#statusBanner'),
    preparer: attendreBandeau
  },
  {
    fichier: 'bandeau-donnees-partielles.png', zone: jusquALaRangee(1),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      // Une panne après un premier chargement réussi : les cartes restent affichées.
      await page.evaluate(() => {
        window.__demo.tablesIllisibles = ['Actions'];
        window.__demo.rappelOnRecords();
      });
      await attendreBandeau(page);
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
    }
  },
  {
    fichier: 'ma-presence.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, zone: jusquAu('.page-header', MARGE_ENTETE),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await attendrePresence(page, 'Vous apparaissez dans l\'annuaire.');
    }
  },
  {
    // Un clic sur l'interrupteur : la personne disparaît de l'annuaire, le compteur perd une carte.
    fichier: 'ma-presence-retiree.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, zone: jusquAu('.page-header', MARGE_ENTETE),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await attendrePresence(page, 'Vous apparaissez dans l\'annuaire.');
      await page.click('.presence-switch');
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs - 1);
      await attendrePresence(page, 'Vous n\'apparaissez pas dans l\'annuaire.');
    }
  },
  {
    // Accord donné, mais fondateur non validé : la fiche reste masquée, et le bandeau dit pourquoi.
    fichier: 'ma-presence-masquee.png', requete: `?connecte=${PERSONNES_DEMO.masquee}`, zone: jusquAu('.page-header', MARGE_ENTETE),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await attendrePresence(page, 'reste masquée : votre établissement n\'a pas encore été validé');
    }
  },
  {
    // La carte de Camille Rousseau, qui porte les neuf éléments légendés (les cartes sont triées par nom).
    fichier: 'carte-anatomie.png', hauteur: HAUTEUR_FENETRE_LEGENDE,
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await poserReperes(page, 'Camille Rousseau');
    },
    async zone(page) {
      const boite = await carteDe(page, 'Camille Rousseau').boundingBox();
      return { x: boite.x - 24, y: boite.y - 14, width: boite.width + 48, height: boite.height + 28 };
    }
  },
  {
    // La rangée de la carte de Camille Rousseau, qui porte « Votre fiche » et « ✎ Modifier » ; l'autre
    // carte de la rangée n'a pas de bouton. Les cartes sont triées par nom : la sienne est sur la dernière
    // rangée. Le bouton « Modifier mon profil » du bandeau est celui de ma-presence.png.
    fichier: 'modifier-fiche-bouton.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, pagePleine: true,
    zone: autourDe('.contact-card:has(.own-flag:not([hidden]))', MARGE_RANGEE),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await attendrePresence(page, 'Vous apparaissez dans l\'annuaire.');
      await attendreBoutonsModifier(page, 'Camille Rousseau');
    }
  },
  {
    // La fenêtre ouverte sur le formulaire, avec le brouillon saisi : le pied dit combien de champs
    // changent et « Relire mes modifications » est devenu cliquable.
    fichier: 'modifier-fiche-formulaire.png', requete: `?connecte=${PERSONNES_DEMO.visible}`,
    hauteur: HAUTEUR_FENETRE_MODIFICATION, zone: autourDeLaFenetre,
    async preparer(page) {
      await ouvrirMonProfil(page);
      await saisirBrouillon(page);
      const resume = await fenetre(page).locator('.dlg-summary').textContent();
      exiger(resume === `${CHAMPS_MODIFIES} champs modifiés`, `le pied de la fenêtre dit « ${resume} »`);
      exiger(await page.locator('#profile-Fonction').inputValue() === BROUILLON.fonction, 'la fonction saisie n\'est pas dans le champ');
      for (const { groupe: titre, ajout, retrait } of BROUILLON.listes) {
        exiger(await pastille(page, titre, ajout).getAttribute('aria-pressed') === 'true', `« ${ajout} » n'est pas coché`);
        exiger(await pastille(page, titre, retrait).getAttribute('aria-pressed') === 'false', `« ${retrait} » est resté coché`);
      }
      exiger(await fenetre(page).getByRole('button', { name: 'Relire mes modifications', exact: true }).isEnabled(), '« Relire mes modifications » est grisé');
      exiger(await page.evaluate(() => document.querySelector('#profileDialog .dlg-body').scrollTop) === 0, 'le formulaire n\'est pas en haut');
      exiger(await fenetre(page).locator('.ident-name').textContent() === 'Camille Rousseau', 'la fenêtre n\'est pas celle de Camille Rousseau');
    }
  },
  {
    // La relecture : la légende des repères, la carte « Avant » telle quelle, la carte « Après » avec
    // ce qui change repéré (pastille « modifié » sur la fonction, « + » et barré sur les tags), et le
    // « Détail des changements ».
    fichier: 'modifier-fiche-relecture.png', requete: `?connecte=${PERSONNES_DEMO.visible}`,
    hauteur: HAUTEUR_FENETRE_RELECTURE, zone: autourDeLaFenetre,
    async preparer(page) {
      await ouvrirMonProfil(page);
      await saisirBrouillon(page);
      await fenetre(page).getByRole('button', { name: 'Relire mes modifications', exact: true }).click();
      await attendreEtape(page, 'Relire avant de valider');
      // Depuis que le texte des cartes fait 12 px (1.17.1), la relecture dépasse de quelques dizaines de pixels le
      // plafond de la fenêtre (900 px, dialogs.css) : sur un écran réel, son corps défile. Pour la photographier en
      // entier, on lève le plafond le temps de la capture seulement (pas avant : le formulaire, lui, est bien plus
      // long qu'une fenêtre) ; le widget lui-même n'est pas modifié.
      await page.addStyleTag({ content: '.dlg { max-height: none; }' });
      const compter = selecteur => fenetre(page).locator(selecteur).count();
      exiger(await fenetre(page).locator('#review-before-title').evaluate(titre => titre.firstChild.textContent) === 'Avant', 'pas de carte « Avant »');
      exiger(await fenetre(page).locator('#review-after-title').evaluate(titre => titre.firstChild.textContent) === 'Après', 'pas de carte « Après »');
      exiger(await compter('.rv-col-before .mk, .rv-col-before .mk-gone, .rv-col-before .mk-pill, .rv-col-before .tag-add, .rv-col-before .tag-del') === 0, 'la carte « Avant » porte des repères');
      exiger(await compter('.rv-col-after .fonction .mk-pill') === 1, 'la fonction modifiée n\'est pas repérée sur la carte « Après »');
      exiger(await compter('.rv-col-after .tag-add') === BROUILLON.listes.length, 'les tags ajoutés ne sont pas tous repérés');
      exiger(await compter('.rv-col-after .tag-del') === BROUILLON.listes.length, 'les tags retirés ne sont pas tous repérés');
      exiger(await compter('.rv-legend .lg-add, .rv-legend .lg-del') === 2, 'la légende des repères manque');
      exiger(await fenetre(page).locator('.recap-title').textContent() === 'Détail des changements', 'pas de « Détail des changements »');
      exiger(await compter('.recap .diff-row') === CHAMPS_MODIFIES, 'le détail n\'a pas une ligne par champ modifié');
      exiger(await fenetre(page).locator('.dlg-summary').textContent() === `${CHAMPS_MODIFIES} champs modifiés`, 'le pied ne résume pas les changements');
      // Rien de coupé : la relecture entière tient dans la fenêtre, sans défilement.
      exiger(await page.evaluate(() => {
        const corps = document.querySelector('#profileDialog .dlg-body');
        return corps.scrollHeight - corps.clientHeight <= 1;
      }), 'la relecture est plus haute que la fenêtre : une partie serait coupée');
      exiger(await fenetre(page).getByRole('button', { name: 'Valider', exact: true }).isEnabled(), '« Valider » n\'est pas cliquable');
    }
  },
  {
    // Après « Valider » : la fenêtre se ferme, la carte de l'annuaire est à jour et un message le confirme.
    // Il est posé en bas de l'écran (fixe) : la capture garde l'écran entier.
    fichier: 'modifier-fiche-confirmation.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, hauteur: HAUTEUR_CONFIRMATION,
    async preparer(page) {
      await ouvrirMonProfil(page);
      await saisirBrouillon(page);
      await fenetre(page).getByRole('button', { name: 'Relire mes modifications', exact: true }).click();
      await attendreEtape(page, 'Relire avant de valider');
      await fenetre(page).getByRole('button', { name: 'Valider', exact: true }).click();
      await page.waitForFunction(() => !document.getElementById('profileDialog').open && !document.getElementById('toast').hidden, null, { timeout: 10_000 });
      exiger(await page.locator('#toast').textContent() === 'Vos modifications sont enregistrées.', 'le message de confirmation n\'est pas celui attendu');
      await page.waitForFunction(attendu => [...document.querySelectorAll('.contact-card .fonction')].some(ligne => ligne.textContent === attendu),
        BROUILLON.fonction, { timeout: 10_000 });
      // Les cartes sont triées par nom : celle de Camille Rousseau est sur la dernière rangée. La page
      // descend jusqu'à elle, comme le ferait la personne pour vérifier sa fiche ; le message, lui, est
      // fixé en bas de l'écran.
      await carteDe(page, 'Camille Rousseau').evaluate(carte => carte.scrollIntoView({ block: 'center' }));
      await attendreLogos(page);
      exiger(await carteDe(page, 'Camille Rousseau').locator('.fonction').textContent() === BROUILLON.fonction, 'la carte de la personne n\'a pas sa nouvelle fonction');
      exiger(await carteDe(page, 'Camille Rousseau').isVisible() && !(await page.locator('#toast').isHidden()), 'la carte et le message ne sont pas à l\'écran ensemble');
    }
  },
  {
    // Le « mode admin » d'un administrateur (case admin de la table ACL), allumé : un bandeau l'annonce
    // et chaque carte a son bouton « ✎ Modifier la fiche » (la sienne garde « ✎ Modifier »).
    fichier: 'mode-admin.png', requete: `?connecte=${PERSONNES_DEMO.administrateur}`, zone: jusquALaRangee(1),
    async preparer(page) {
      await allumerModeAdmin(page);
      exiger(await page.locator('#adminStrip').isVisible(), 'le bandeau « Mode admin » n\'est pas affiché');
      exiger(await page.locator('.card-actions:not([hidden]) .own-flag:not([hidden])').count() === 1, 'seule la carte de l\'administrateur porte « Votre fiche »');
      exiger(await page.locator('.card-edit', { hasText: 'Modifier la fiche' }).count() === CARTES_ATTENDUES.fondateurs - 1, 'les autres cartes n\'ont pas « Modifier la fiche »');
    }
  },
  {
    // L'administrateur ouvre la fiche d'une autre personne : l'e-mail et l'établissement se modifient.
    fichier: 'modifier-fiche-admin.png', requete: `?connecte=${PERSONNES_DEMO.administrateur}`,
    hauteur: HAUTEUR_FENETRE_MODIFICATION, zone: autourDeLaFenetre,
    async preparer(page) {
      await allumerModeAdmin(page);
      await page.locator('.contact-card', { hasText: 'Camille Rousseau' }).locator('.card-edit').click();
      await attendreEtape(page, 'Modifier la fiche de Camille Rousseau');
      exiger(await page.locator('#profile-email').isVisible() && await page.locator('#profile-Etablissement').isVisible(), 'l\'e-mail et l\'établissement ne sont pas modifiables');
      exiger(await fenetre(page).locator('.ident-lock').count() === 0, 'la fenêtre d\'un administrateur ne verrouille rien');
      await page.evaluate(() => document.activeElement.blur());
    }
  },
  {
    // Léa Fontaine, responsable du CHD, ouvre la fiche de son établissement par « Mon établissement » :
    // le logo qu'elle peut remplacer ou retirer, le sigle et le statut qu'on ne change pas ici, le nom
    // complet, la case de visibilité, les deux responsables (elle et Sofia Almeida) et le bloc pour en
    // nommer un autre. Rien n'a changé : « Enregistrer » est grisé.
    fichier: 'fiche-etablissement.png', requete: `?connecte=${PERSONNES_DEMO.responsable}`,
    hauteur: HAUTEUR_FENETRE_MODIFICATION, zone: autourDeLaFicheEtab,
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await page.locator('#accountBar .account-etab').waitFor();
      await page.click('#accountBar .account-etab');
      await page.waitForFunction(() => document.getElementById('etabDialog').open
        && document.getElementById('etabTitle').textContent === 'Fiche de l’établissement : CHD'
        && document.querySelectorAll('#etabDialog .es-resp').length > 0, null, { timeout: 10_000 });
      // Le logo de l'établissement est chargé (la capture ne montre pas un cadre vide) ; aucun contour de saisie.
      await page.waitForFunction(() => {
        const logo = document.querySelector('#etabDialog .es-tile img');
        return logo !== null && logo.complete && logo.naturalWidth > 0 && getComputedStyle(logo).opacity === '1';
      }, null, { timeout: 10_000 });
      await page.evaluate(() => document.activeElement.blur());

      const boutons = await fenetreEtab(page).locator('.es-logo-actions button').allTextContents();
      exiger(boutons.join('|') === 'Remplacer le logo|Retirer le logo', `les boutons du logo sont « ${boutons.join(' | ')} »`);
      exiger(await fenetreEtab(page).locator('#etabAcronym').inputValue() === 'CHD' && await fenetreEtab(page).locator('#etabAcronym').evaluate(champ => champ.readOnly),
        'le sigle n\'est pas affiché en lecture seule');
      exiger(await fenetreEtab(page).locator('#etabStatus').evaluate(champ => champ.readOnly && champ.value === 'Fondateur du PUI'),
        'le statut n\'est pas affiché en lecture seule');
      exiger(await fenetreEtab(page).locator('#etabName').inputValue() === 'Centre Hospitalier de Démonstration', 'le nom complet n\'est pas celui du CHD');
      exiger(await fenetreEtab(page).locator('#etabVisible').isChecked(), 'la case « Établissement visible dans l\'annuaire » n\'est pas cochée');
      const responsables = await fenetreEtab(page).locator('.es-resp').evaluateAll(lignes => lignes.map(ligne => ({
        nom: ligne.querySelector('.es-resp-name').firstChild.textContent, vous: ligne.querySelector('.es-tag-you') !== null,
        bouton: ligne.querySelector('button').textContent
      })));
      exiger(JSON.stringify(responsables) === JSON.stringify([
        { nom: 'Sofia Almeida', vous: false, bouton: 'Retirer' }, { nom: 'Léa Fontaine', vous: true, bouton: 'Retirer' }
      ]), `les responsables sont ${JSON.stringify(responsables)}`);
      exiger(await fenetreEtab(page).locator('.es-add button').textContent() === 'Nommer', 'le bloc pour nommer un responsable manque');
      exiger(await fenetreEtab(page).locator('.dlg-summary').textContent() === 'Aucune modification', 'le pied ne dit pas « Aucune modification »');
      exiger(await fenetreEtab(page).getByRole('button', { name: 'Enregistrer', exact: true }).isDisabled(), '« Enregistrer » n\'est pas grisé');
      exiger(await fenetreEtab(page).getByRole('button', { name: 'Annuler', exact: true }).isEnabled(), '« Annuler » n\'est pas cliquable');
      // Rien de coupé : la fiche entière tient dans la fenêtre, sans défilement.
      exiger(await page.evaluate(() => {
        const corps = document.querySelector('#etabDialog .dlg-body');
        return corps.scrollHeight - corps.clientHeight <= 1;
      }), 'la fiche est plus haute que la fenêtre : une partie serait coupée');
    }
  },
  {
    // Avec la colonne Avatar de BDD (?photos), la photo remplace les initiales : Sofia Almeida, Mehdi Bensaïd et
    // Julien Garnier en ont une, Romain Delmas, Léa Fontaine et Paul Girard gardent leurs initiales.
    fichier: 'photo-profil-cartes.png', requete: '?photos', zone: jusquALaRangee(2),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      const avecPhoto = (await cartesAvecPhoto(page)).slice(0, 3).join();
      exiger(avecPhoto === 'Sofia Almeida,Mehdi Bensaïd,Julien Garnier',
        `les premières photos sont celles de « ${avecPhoto} » au lieu de Sofia Almeida, Mehdi Bensaïd et Julien Garnier`);
      for (const nom of ['Romain Delmas', 'Léa Fontaine', 'Paul Girard']) {
        exiger(await carteDe(page, nom).locator('.avatar:not(.has-photo)').count() === 1, `la carte de ${nom} devrait garder ses initiales`);
      }
      exiger(await carteDe(page, 'Sofia Almeida').locator('button.avatar-zoom').getAttribute('aria-label') === 'Agrandir la photo de Sofia Almeida',
        'la photo de Sofia Almeida n\'est pas un bouton qui l\'agrandit');
    }
  },
  {
    // Un clic sur la photo de Sofia Almeida l'agrandit, avec son nom, sa fonction et son établissement.
    fichier: 'photo-profil-agrandie.png', requete: '?photos', hauteur: HAUTEUR_FENETRE_PHOTO, zone: autourDeLaPhoto,
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await carteDe(page, 'Sofia Almeida').locator('button.avatar-zoom').click();
      await page.waitForFunction(() => {
        const photo = document.querySelector('#photoDialog .photo-img');
        return document.getElementById('photoDialog').open && photo !== null && photo.classList.contains('loaded')
          && getComputedStyle(photo).opacity === '1' && photo.naturalWidth > 0;
      }, null, { timeout: 10_000 });
      exiger(await fenetrePhoto(page).locator('.photo-cap').evaluate(legende => legende.firstChild.textContent) === 'Sofia Almeida', 'la légende ne dit pas le nom de la personne');
      exiger(await fenetrePhoto(page).locator('.photo-cap small').textContent() === 'Directrice de la recherche clinique · Centre Hospitalier de Démonstration',
        'la légende ne dit pas la fonction et l\'établissement');
      exiger(await fenetrePhoto(page).locator('.dlg-x').getAttribute('aria-label') === 'Fermer la photo', 'la croix de la fenêtre n\'est pas « Fermer la photo »');
      await page.evaluate(() => document.activeElement.blur());
    }
  },
  {
    // « Modifier mon profil » de Camille Rousseau, qui n'a pas de photo : elle en a choisi une. L'aperçu la montre, les
    // boutons deviennent « Changer la photo » et « Retirer la photo », et le pied compte la photo comme un champ modifié.
    fichier: 'photo-profil-formulaire.png', requete: `?photos&connecte=${PERSONNES_DEMO.visible}`,
    hauteur: HAUTEUR_FENETRE_MODIFICATION, zone: autourDeLaFenetre,
    async preparer(page) {
      await ouvrirMonProfil(page);
      exiger(await fenetre(page).locator('.photo-title').textContent() === 'Photo de profil', 'la carte « Photo de profil » manque');
      exiger((await fenetre(page).locator('.photo-actions button:visible').allTextContents()).join() === 'Ajouter une photo',
        'sans photo, seul « Ajouter une photo » devrait être proposé');
      await choisirPhoto(page);
      exiger((await fenetre(page).locator('.photo-actions button:visible').allTextContents()).join() === 'Changer la photo,Retirer la photo',
        'les boutons ne sont pas « Changer la photo » et « Retirer la photo »');
      exiger(await fenetre(page).locator('.dlg-summary').textContent() === '1 champ modifié', 'le pied ne compte pas la photo comme un champ modifié');
      exiger(await fenetre(page).getByRole('button', { name: 'Relire mes modifications', exact: true }).isEnabled(), '« Relire mes modifications » est grisé');
    }
  },
  {
    // La relecture : la carte « Après » a l'anneau vert autour de la photo et la pastille « photo ajoutée », la carte « Avant »
    // garde ses initiales, et le détail montre la photo avant (aucune) et après.
    fichier: 'photo-profil-relecture.png', requete: `?photos&connecte=${PERSONNES_DEMO.visible}`,
    hauteur: HAUTEUR_FENETRE_RELECTURE, zone: autourDeLaFenetre,
    async preparer(page) {
      await ouvrirMonProfil(page);
      await choisirPhoto(page);
      await fenetre(page).getByRole('button', { name: 'Relire mes modifications', exact: true }).click();
      await attendreEtape(page, 'Relire avant de valider');
      await page.addStyleTag({ content: '.dlg { max-height: none; }' }); // voir modifier-fiche-relecture.png
      await page.waitForFunction(() => {
        const photo = document.querySelector('#profileDialog .rv-col-after .avatar-img');
        const miniature = document.querySelector('#profileDialog .recap .thumb img');
        return photo?.classList.contains('loaded') && miniature?.classList.contains('loaded');
      }, null, { timeout: 10_000 });
      const compter = selecteur => fenetre(page).locator(selecteur).count();
      exiger(await compter('.rv-col-after .avatar.rv-ring.has-photo') === 1, 'la photo de la carte « Après » n\'a pas son anneau vert');
      exiger(await fenetre(page).locator('.rv-col-after .rv-note .mk-pill').textContent() === 'photo ajoutée', 'la pastille « photo ajoutée » manque');
      exiger(await compter('.rv-col-before .avatar.has-photo') === 0 && await compter('.rv-col-before .rv-ring, .rv-col-before .rv-note') === 0,
        'la carte « Avant » devrait garder ses initiales, sans repère');
      exiger(await compter('.recap .diff-row') === 1 && await fenetre(page).locator('.recap .diff-label').textContent() === 'Photo de profil',
        'le détail n\'a pas la seule ligne « Photo de profil »');
      exiger(await fenetre(page).locator('.recap .diff-val .none').textContent() === 'aucune photo' && await compter('.recap .thumb') === 1,
        'le détail ne montre pas « aucune photo » puis la nouvelle photo');
      exiger(await fenetre(page).locator('.dlg-summary').textContent() === '1 champ modifié', 'le pied ne résume pas le changement');
      exiger(await fenetre(page).getByRole('button', { name: 'Valider', exact: true }).isEnabled(), '« Valider » n\'est pas cliquable');
      await page.evaluate(() => document.activeElement.blur());
    }
  }
];

// Sans argument, toutes les captures sont refaites ; avec des débuts de noms de fichiers, seulement
// celles dont le nom commence ainsi ; `--sortie=<dossier>` les écrit ailleurs que dans docs/images
// (pour comparer sans rien écraser).
const arguments_ = process.argv.slice(2);
const dossierSortie = path.resolve(arguments_.find(argument => argument.startsWith('--sortie='))?.slice('--sortie='.length) ?? DOSSIER_IMAGES);
const demandees = arguments_.filter(argument => !argument.startsWith('--'));
const inconnues = demandees.filter(nom => !SCENES.some(scene => scene.fichier.startsWith(nom)));
if (inconnues.length > 0) {
  console.error(`Capture inconnue : ${inconnues.join(', ')}. Captures possibles : ${SCENES.map(scene => scene.fichier).join(', ')}.`);
  process.exit(1);
}

const { server, url } = await startDemoServer();
const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
fs.mkdirSync(dossierSortie, { recursive: true });

try {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR_FENETRE }, deviceScaleFactor: FACTEUR_ECHELLE, locale: 'fr-FR'
  });
  // Hermétique : seules les requêtes vers le serveur local passent.
  await contexte.route(adresse => adresse.hostname !== '127.0.0.1', route => route.abort());

  for (const scene of SCENES.filter(autre => demandees.length === 0 || demandees.some(nom => autre.fichier.startsWith(nom)))) {
    const page = await contexte.newPage();
    if (scene.hauteur) await page.setViewportSize({ width: LARGEUR, height: scene.hauteur });
    await page.goto(`${url}/${scene.requete ?? ''}`);
    await scene.preparer(page);
    await page.mouse.move(0, 0); // pas de survol parasite sur la capture
    const fichier = path.join(dossierSortie, scene.fichier);
    await page.screenshot({ path: fichier, clip: scene.zone ? await scene.zone(page) : undefined, fullPage: scene.pagePleine });
    await page.close();
    console.log(`${path.relative(process.cwd(), fichier)}  ${(fs.statSync(fichier).size / 1024).toFixed(0)} Ko`);
  }
} finally {
  await navigateur.close();
  server.close();
}
