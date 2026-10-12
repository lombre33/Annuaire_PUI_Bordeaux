// Régénère les captures d'écran de docs/images/ à partir du vrai widget et des
// données fictives (donnees-fictives.mjs) : rien de réel n'apparaît dessus.
//
//   npm install --no-save playwright      (une fois ; pas une dépendance du projet)
//   npx playwright install chromium       (ou CHROMIUM_PATH=/chemin/vers/chromium)
//   node docs/demo/capturer.mjs
//
// À relancer, puis à committer, après toute modification de l'interface.
// Chaque capture est précédée d'une vérification (nombre de cartes, bandeau,
// boutons « Modifier », étape de la fenêtre de modification) : si le widget
// n'affiche pas ce qui est attendu, le script échoue au lieu de photographier un
// écran faux.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoServer } from './serveur-demo.mjs';
import { CARTES_ATTENDUES, PERSONNES_DEMO } from './donnees-fictives.mjs';

const DOSSIER_IMAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'images');
const LARGEUR = 1440; // un écran de PC : à partir de 1400 px, la mise en page est celle de départ (style.css)
const HAUTEUR_FENETRE = 2200; // grande : chaque capture est rognée sur ce qui l'intéresse (voir `zone`)
const FACTEUR_ECHELLE = 1.5; // captures nettes sur écran à haute densité sans alourdir le dépôt
const MARGE = 28; // espace gardé sous l'élément qui borne la capture
const MARGE_RANGEE = 8; // plus petite que l'écart entre deux rangées de cartes (14 px) : la rangée suivante ne déborde pas sur la capture
const HAUTEUR_FENETRE_MODIFICATION = 1000; // la fenêtre de modification mesure au plus 900 px (dialogs.css) : elle tient en entier à l'écran
const MARGE_FENETRE = 12; // fond assombri gardé autour de la fenêtre de modification

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
// Le bandeau « Ma présence » est affiché, dit `extrait` et n'a plus de message
// passager (« Enregistrement… » après un clic).
const attendrePresence = (page, extrait) =>
  page.waitForFunction(attendu => {
    const bandeau = document.getElementById('accountBar');
    return !bandeau.hidden && bandeau.querySelector('.account-detail').textContent.includes(attendu)
      && bandeau.querySelector('.account-status').textContent === '';
  }, extrait, { timeout: 10_000 });
const filtre = (page, cle) => page.locator(`.filter[data-filter-key="${cle}"]`);

// Ouvre le menu, coche l'option, puis le referme comme le ferait un utilisateur
// (un clic ailleurs) : un menu resté ouvert masquerait le bouton suivant.
async function cocher(page, cle, libelle) {
  const menu = filtre(page, cle);
  await menu.locator('.filter-button').click();
  await menu.locator('.filter-option', { hasText: libelle }).locator('input').check();
  await page.mouse.click(5, 5);
}

// Le menu Compétences range ses compétences par domaine : une case par domaine, qui coche
// toutes ses compétences, et une flèche qui en déplie le détail.
const domaine = (page, nom) => filtre(page, 'competences').locator(`.filter-group[data-value="${nom}"]`);
const nomsDesDomaines = page => filtre(page, 'competences').locator('.group-head .option-label').allTextContents();
// Ce que le menu montre vraiment : une ligne repliée ou masquée n'a plus de boîte à l'écran.
const visibles = (page, selecteur) => filtre(page, 'competences').locator(selecteur).evaluateAll(lignes =>
  lignes.filter(ligne => ligne.getClientRects().length > 0).map(ligne => ligne.dataset.value));

// ===== Modifier une fiche =====

// Le brouillon de Camille Rousseau, saisi comme le ferait la personne : une fonction
// modifiée, une action et une compétence ajoutées, une autre action et une autre
// compétence retirées. Le formulaire (modifier-fiche-formulaire.png) puis la relecture
// (modifier-fiche-relecture.png) le montrent : les deux captures racontent la même histoire.
const BROUILLON = {
  fonction: 'Responsable de l\'innovation',
  listes: [
    { groupe: 'Actions', ajout: 'Formation à l\'innovation', retrait: 'Recherche de financements' },
    { groupe: 'Compétences', ajout: 'Intelligence artificielle', retrait: 'Gestion de projet' }
  ]
};
const CHAMPS_MODIFIES = 1 + BROUILLON.listes.length; // la fonction et les deux listes

const echapper = texte => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fenetre = page => page.locator('#profileDialog');
const groupe = (page, titre) =>
  fenetre(page).locator('.grp').filter({ has: page.locator('.grp-title', { hasText: new RegExp(`^${echapper(titre)}$`) }) });
const pastille = (page, titre, libelle) =>
  groupe(page, titre).locator('.pick', { hasText: new RegExp(`^${echapper(libelle)}$`) });

// Une vérification qui ne se règle pas en attendant : le script s'arrête sur un écran faux.
function exiger(condition, message) {
  if (!condition) throw new Error(`Écran inattendu : ${message}`);
}

// Le bandeau propose « Modifier mon profil » et la carte de la personne, la seule à avoir
// un bouton, porte « Votre fiche » et « ✎ Modifier » ; elle figure sur la première rangée.
const attendreBoutonsModifier = (page, nom) =>
  page.waitForFunction(attendu => {
    const bouton = document.querySelector('#accountBar .account-edit');
    const cartes = [...document.querySelectorAll('.contact-card')];
    const avecBouton = cartes.filter(carte => !carte.querySelector('.card-actions').hidden);
    if (!bouton || bouton.hidden || bouton.textContent !== 'Modifier mon profil' || avecBouton.length !== 1) return false;
    const [carte] = avecBouton;
    const premierRang = Math.min(...cartes.map(autre => Math.round(autre.getBoundingClientRect().top)));
    return carte.querySelector('.name').textContent === attendu
      && !carte.querySelector('.own-flag').hidden && carte.querySelector('.own-flag').textContent === 'Votre fiche'
      && carte.querySelector('.card-edit').textContent === '✎ Modifier'
      && Math.round(carte.getBoundingClientRect().top) === premierRang;
  }, nom, { timeout: 10_000 });

// La fenêtre est ouverte sur l'étape qui porte ce titre (« Modifier mon profil », « Relire vos modifications »).
const attendreEtape = (page, titre) =>
  page.waitForFunction(attendu => document.getElementById('profileDialog').open
    && document.getElementById('profileTitle').textContent === attendu, titre, { timeout: 10_000 });

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

// ...ou : la fenêtre de modification d'une fiche, avec un peu du fond assombri autour.
const autourDeLaFenetre = async page => {
  const boite = await fenetre(page).boundingBox();
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
// vérifiée par `preparer`, zone rognée (par défaut toute la fenêtre) et, si elle doit
// différer de HAUTEUR_FENETRE, hauteur de la fenêtre du navigateur (`hauteur`).
const SCENES = [
  {
    fichier: 'apercu.png', zone: jusquALaRangee(2),
    preparer: page => attendreCartes(page, CARTES_ATTENDUES.fondateurs)
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
      await domaine(page, 'Recherche clinique').locator('.group-option input').check();
      const sante = domaine(page, 'Santé numérique et données');
      await sante.locator('.group-toggle').click();
      await sante.locator('.filter-option', { hasText: 'Open science' }).locator('input').check();
      await attendreCartes(page, 3);
      await page.mouse.click(5, 5);
      await menu.locator('.filter-button').click();
      const noms = await nomsDesDomaines(page);
      exiger(noms[0] === 'Recherche clinique' && noms[1] === 'Santé numérique et données',
        `les domaines cochés ne passent pas devant : ${noms.join(', ')}`);
      exiger(await domaine(page, 'Recherche clinique').getAttribute('data-state') === 'all', '« Recherche clinique » n\'est pas coché en entier');
      exiger(await domaine(page, 'Santé numérique et données').getAttribute('data-state') === 'some', '« Santé numérique et données » n\'est pas coché en partie');
      exiger((await visibles(page, '.filter-option')).join() === 'Open science,Intelligence artificielle,Santé numérique',
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
      exiger((await visibles(page, '.filter-group')).join() === 'Santé numérique et données', 'la recherche ne garde pas ce seul domaine');
      exiger((await visibles(page, '.filter-option')).length === 3, 'la recherche ne montre pas les trois compétences du domaine');
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
    fichier: 'ma-presence.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, zone: jusquAu('#accountBar', MARGE_RANGEE),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await attendrePresence(page, 'Vous apparaissez dans l\'annuaire.');
    }
  },
  {
    // Un clic sur l'interrupteur : la personne disparaît de l'annuaire, le compteur perd une carte.
    fichier: 'ma-presence-retiree.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, zone: jusquAu('#accountBar', MARGE_RANGEE),
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
    fichier: 'ma-presence-masquee.png', requete: `?connecte=${PERSONNES_DEMO.masquee}`, zone: jusquAu('#accountBar', MARGE_RANGEE),
    async preparer(page) {
      await attendreCartes(page, CARTES_ATTENDUES.fondateurs);
      await attendrePresence(page, 'reste masquée : votre établissement n\'a pas encore été validé');
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
  },
  {
    // L'annuaire vu par Camille Rousseau : « Modifier mon profil » dans le bandeau, et sur sa
    // carte (la première) « Votre fiche » et « ✎ Modifier ». Aucune autre carte n'a de bouton.
    fichier: 'modifier-fiche-bouton.png', requete: `?connecte=${PERSONNES_DEMO.visible}`, zone: jusquALaRangee(1),
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
    // La relecture : la carte « Avant » telle quelle, la carte « Après » avec ce qui change repéré
    // (pastille « modifié » sur la fonction, « + » et barré sur les tags), et la liste « Ce qui change ».
    fichier: 'modifier-fiche-relecture.png', requete: `?connecte=${PERSONNES_DEMO.visible}`,
    hauteur: HAUTEUR_FENETRE_MODIFICATION, zone: autourDeLaFenetre,
    async preparer(page) {
      await ouvrirMonProfil(page);
      await saisirBrouillon(page);
      await fenetre(page).getByRole('button', { name: 'Relire mes modifications', exact: true }).click();
      await attendreEtape(page, 'Relire vos modifications');
      const compter = selecteur => fenetre(page).locator(selecteur).count();
      exiger(await fenetre(page).locator('.preview-before .preview-label').textContent() === 'Avant', 'pas de carte « Avant »');
      exiger(await fenetre(page).locator('.preview-after .preview-label').textContent() === 'Après', 'pas de carte « Après »');
      exiger(await compter('.preview-before .mk-pill, .preview-before .mark-new, .preview-before .mark-gone') === 0, 'la carte « Avant » porte des repères');
      exiger(await compter('.preview-after .fonction.mark-new .mk-pill') === 1, 'la fonction modifiée n\'est pas repérée sur la carte « Après »');
      exiger(await compter('.preview-after .tag.mark-new') === BROUILLON.listes.length, 'les tags ajoutés ne sont pas tous repérés');
      exiger(await compter('.preview-after .tag.mark-gone') === BROUILLON.listes.length, 'les tags retirés ne sont pas tous repérés');
      exiger(await fenetre(page).locator('.recap-title').textContent() === 'Ce qui change', 'pas de liste « Ce qui change »');
      exiger(await compter('.recap .diff-row') === CHAMPS_MODIFIES, 'la liste « Ce qui change » n\'a pas une ligne par champ modifié');
      exiger(await fenetre(page).locator('.dlg-summary').textContent() === `${CHAMPS_MODIFIES} champs modifiés`, 'le pied ne résume pas les changements');
      // Rien de coupé : la relecture entière tient dans la fenêtre, sans défilement.
      exiger(await page.evaluate(() => {
        const corps = document.querySelector('#profileDialog .dlg-body');
        return corps.scrollHeight - corps.clientHeight <= 1;
      }), 'la relecture est plus haute que la fenêtre : une partie serait coupée');
      exiger(await fenetre(page).getByRole('button', { name: 'Valider', exact: true }).isEnabled(), '« Valider » n\'est pas cliquable');
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
    if (scene.hauteur) await page.setViewportSize({ width: LARGEUR, height: scene.hauteur });
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
