// Régénère les captures d'écran de docs/images/ à partir du vrai widget et des
// données fictives (donnees-fictives.mjs) : rien de réel n'apparaît dessus.
//
//   npm install --no-save playwright      (une fois ; pas une dépendance du projet)
//   npx playwright install chromium       (ou CHROMIUM_PATH=/chemin/vers/chromium)
//   node docs/demo/capturer.mjs
//
// À relancer, puis à committer, après toute modification de l'interface.
// Chaque capture est précédée d'une vérification (nombre de cartes, bandeau) :
// si le widget n'affiche pas ce qui est attendu, le script échoue au lieu de
// photographier un écran faux.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoServer } from './serveur-demo.mjs';
import { CARTES_ATTENDUES } from './donnees-fictives.mjs';

const DOSSIER_IMAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'images');
const LARGEUR = 1440; // un écran de PC : à partir de 1400 px, la mise en page est celle de départ (style.css)
const HAUTEUR_FENETRE = 2200; // grande : chaque capture est rognée sur ce qui l'intéresse (voir `zone`)
const FACTEUR_ECHELLE = 1.5; // captures nettes sur écran à haute densité sans alourdir le dépôt
const MARGE = 28; // espace gardé sous l'élément qui borne la capture
const MARGE_RANGEE = 8; // plus petite que l'écart entre deux rangées de cartes (14 px) : la rangée suivante ne déborde pas sur la capture

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright est introuvable. Installez-le sans l\'ajouter au projet :\n'
    + '  npm install --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const attendreCartes = (page, nombre) =>
  page.waitForFunction(attendu => document.querySelectorAll('.contact-card').length === attendu, nombre, { timeout: 10_000 });
const attendreBandeau = page =>
  page.waitForFunction(() => !document.getElementById('statusBanner').hidden, null, { timeout: 10_000 });
const filtre = (page, cle) => page.locator(`.filter[data-filter-key="${cle}"]`);

// Ouvre le menu, coche l'option, puis le referme comme le ferait un utilisateur
// (un clic ailleurs) : un menu resté ouvert masquerait le bouton suivant.
async function cocher(page, cle, libelle) {
  const menu = filtre(page, cle);
  await menu.locator('.filter-button').click();
  await menu.locator('.filter-option', { hasText: libelle }).locator('input').check();
  await page.mouse.click(5, 5);
}

// ===== Zones de capture : pleine largeur, du haut de la page jusqu'à... =====

const enPleineLargeur = (bas, marge = MARGE) => ({ x: 0, y: 0, width: LARGEUR, height: Math.ceil(bas + marge) });

// ...le bas d'un élément.
const jusquAu = selecteur => async page =>
  enPleineLargeur(await page.evaluate(
    cible => document.querySelector(cible).getBoundingClientRect().bottom, selecteur));

// ...le bas de la n-ième rangée de cartes (les cartes d'une rangée ont le même haut).
const jusquALaRangee = rangees => async page =>
  enPleineLargeur(await page.evaluate(nombre => {
    const boites = [...document.querySelectorAll('.contact-card')].map(carte => carte.getBoundingClientRect());
    const hauts = [...new Set(boites.map(boite => Math.round(boite.top)))].sort((a, b) => a - b).slice(0, nombre);
    return Math.max(...boites.filter(boite => hauts.includes(Math.round(boite.top))).map(boite => boite.bottom));
  }, rangees), MARGE_RANGEE);

// ===== Légende numérotée d'une carte =====

// Repères posés à côté de chaque élément expliqué dans docs/utilisateurs.md.
// `texte` : on mesure le texte et non la boîte (qui s'étire sur toute la largeur) ;
// `dernier` : on prend le dernier élément qui correspond au sélecteur.
const REPERES = [
  { numero: 1, selecteur: '.avatar', placement: 'coin' },
  { numero: 2, selecteur: '.name', texte: true },
  { numero: 3, selecteur: '.fonction', texte: true },
  { numero: 4, selecteur: '.etablissement-tag', placement: 'gauche' },
  { numero: 5, selecteur: '.email', texte: true },
  { numero: 6, selecteur: '.tel', texte: true },
  { numero: 7, selecteur: '.tag-group-title', texte: true },
  { numero: 8, selecteur: '.tag-instances', dernier: true },
  { numero: 9, selecteur: '.tag-static' }
];

// Les pastilles sont ajoutées à la page le temps de la capture seulement :
// le widget lui-même n'est pas modifié.
async function poserReperes(page) {
  await page.evaluate(reperes => {
    const carte = document.querySelector('.contact-card');
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
  }, REPERES);
}

// Chaque scène : fichier produit, adresse à ouvrir (`requete`), mise en situation
// vérifiée par `preparer`, et zone rognée (par défaut toute la fenêtre).
const SCENES = [
  {
    fichier: 'apercu.png', zone: jusquALaRangee(2),
    preparer: page => attendreCartes(page, CARTES_ATTENDUES.fondateurs)
  },
  {
    fichier: 'filtre-menu.png', zone: jusquAu('.filter.open .filter-menu'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await filtre(page, 'macro').locator('.filter-button').click();
    }
  },
  {
    fichier: 'filtre-domaines.png', zone: jusquAu('.filter.open .filter-menu'),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await cocher(page, 'macro', 'Recherche clinique');
      await attendreCartes(page, 2);
      // Le détail reste filtrable : les compteurs du menu « Compétences » tiennent compte du domaine.
      await filtre(page, 'competences').locator('.filter-button').click();
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
      await attendreCartes(page, CARTES_ATTENDUES.fondateursEtPartenaires - CARTES_ATTENDUES.fondateurs);
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
    fichier: 'carte-anatomie.png',
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await poserReperes(page);
    },
    async zone(page) {
      const boite = await page.locator('.contact-card').first().boundingBox();
      return { x: boite.x - 24, y: boite.y - 14, width: boite.width + 48, height: boite.height + 28 };
    }
  }
];

const { server, url } = await startDemoServer();
const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
fs.mkdirSync(DOSSIER_IMAGES, { recursive: true });

try {
  const contexte = await navigateur.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR_FENETRE }, deviceScaleFactor: FACTEUR_ECHELLE, locale: 'fr-FR'
  });
  // Hermétique : seules les requêtes vers le serveur local passent.
  await contexte.route(adresse => adresse.hostname !== '127.0.0.1', route => route.abort());

  for (const scene of SCENES) {
    const page = await contexte.newPage();
    await page.goto(`${url}/${scene.requete ?? ''}`);
    await scene.preparer(page);
    await page.mouse.move(0, 0); // pas de survol parasite sur la capture
    const fichier = path.join(DOSSIER_IMAGES, scene.fichier);
    await page.screenshot({ path: fichier, clip: scene.zone ? await scene.zone(page) : undefined });
    await page.close();
    console.log(`${path.relative(process.cwd(), fichier)}  ${(fs.statSync(fichier).size / 1024).toFixed(0)} Ko`);
  }
} finally {
  await navigateur.close();
  server.close();
}
