// Test navigateur de la mise en page de l'habillage : charge le vrai index.html dans
// Chromium à plusieurs largeurs de cadre, avec le jeu « chargé » de la mise en page
// (tests/fixtures-responsive.mjs) complété de logos de formes variées,
// et vérifie ce que voit l'utilisateur : l'en-tête (titre, compteur, financeurs), les
// logos sur les cartes, le bandeau des fondateurs en bas. Rien ne dépasse du cadre, les
// logos restent dans leur case quelle que soit leur forme, le bandeau se replie.
//
// Les seuils sont ceux de style.css (860 et 1180px pour l'en-tête, 1320px pour la légende des
// financeurs, 560px de large utile pour le bandeau, 600px pour le téléphone). Les contrôles ne dépendent pas de la police
// installée : des positions relatives, des dépassements, et des tailles bornées par les
// constantes de constants.js.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md). Sans lui les
// scénarios navigateur sont ignorés et `node --test` reste vert.

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { crowdedTables, crowdedBranding, crowdedIdentity } from './fixtures-responsive.mjs';
import { TALL_FILE, WIDE_FILE, UNSIZED_FILE } from './support/fake-attachments.mjs';
import {
  WIDTHS, assertBadgeInCorner, assertNameBesideAvatar, assertNoHorizontalOverflow, atEachWidth, cardGeometry, layoutWidgets,
  measureNamesAgainstBadges, skip
} from './support/layout.mjs';
import { BAND_LOGO, CARD_LOGO } from '../constants.js';
import { logoSize } from '../branding.js';

const ACRONYMS = crowdedTables().Etablissements.acronyme; // l'ordre du bandeau : celui de la table

// Attend que tous les logos soient affichés : ceux des cartes ne se chargent qu'en
// approchant de l'écran, on les demande tous pour que la mise en page soit complète.
async function settle(page) {
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => { image.loading = 'eager'; }));
  // Un logo de carte se montre dès qu'il est chargé, mais sa lecture (`data-logo`) peut le recadrer et le redimensionner juste après.
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.logo-img')];
    return images.length > 0 && images.every(image => image.classList.contains('loaded')
      && (image.dataset.fit === 'trimmed' ? image.dataset.logo === 'sized' : !image.closest('.etablissement-tag') || image.dataset.logo !== undefined));
  });
}

const { withWidget } = layoutWidgets({
  tables: crowdedBranding,
  ready: async (page, { user = null, waitLogos = true }) => {
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length > 0);
    if (user) await page.waitForFunction(() => !document.getElementById('accountBar').hidden);
    if (waitLogos) await settle(page);
  }
});

// Les rectangles { left, right, top, bottom, width, height } des éléments d'un sélecteur.
const rects = (page, selector) => page.locator(selector).evaluateAll(elements => elements.map(element => {
  const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
  return { left, right, top, bottom, width, height };
}));
const rectOf = async (page, selector) => (await rects(page, selector))[0];

// Largeur utile du bandeau : celle que mesure la règle @container de style.css.
const bandContent = page => page.locator('#foundersBand').evaluate(element => {
  const style = getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
});

const centerX = box => (box.left + box.right) / 2;
const centerY = box => (box.top + box.bottom) / 2;

// ===== Rien ne dépasse du cadre =====

test('avec les logos, aucun défilement horizontal du téléphone (320px) au grand écran (1920px)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, WIDTHS, width => assertNoHorizontalOverflow(page, width));
  }));

// ===== En-tête : titre, compteur, financeurs =====

test('en-tête : financeurs sous le titre sous 860px, à sa droite de 860 à 1179px, au centre dès 1180px', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 414, 599, 600, 768, 859, 860, 1024, 1179, 1180, 1200, 1319, 1320, 1400, 1480, 1920], async width => {
      const header = await rectOf(page, '.page-header');
      const title = await rectOf(page, '.page-title');
      const funders = await rectOf(page, '#funders');
      const message = `à ${width}px`;
      assert.ok(funders.width > 0 && funders.height > 0, `${message} : les financeurs s'affichent`);
      assert.ok(funders.left >= header.left - 0.5 && funders.right <= header.right + 0.5, `${message} : les financeurs tiennent dans l'en-tête`);
      if (width < 860) {
        assert.ok(funders.top >= title.bottom - 0.5, `${message} : les financeurs passent sous le titre`);
        assert.ok(Math.abs(funders.left - title.left) <= 1, `${message} : alignés à gauche, comme le titre`);
      } else {
        assert.ok(funders.left >= title.right + 12, `${message} : les financeurs sont à droite du titre, sans le toucher`);
        assert.ok(funders.top < title.bottom && title.top < funders.bottom, `${message} : sur la bande du titre`);
      }
      if (width >= 860 && width < 1180) {
        assert.ok(Math.abs(funders.right - header.right) <= 1, `${message} : calés à droite de l'en-tête`);
        assert.ok(Math.abs(funders.top - header.top) <= 1, `${message} : en haut de l'en-tête`);
      }
      if (width >= 1180) {
        assert.ok(Math.abs(centerX(funders) - centerX(header)) <= 1,
          `${message} : financeurs au centre (décalés de ${Math.round(centerX(funders) - centerX(header))}px)`);
      }
      // Entre 1180 et 1319px, la légende est trop large pour garder les financeurs au centre : elle
      // n'est plus qu'un texte pour les lecteurs d'écran (toujours dans la page).
      const label = await page.locator('.funders-label').evaluate(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, text: element.textContent.trim() };
      });
      assert.equal(label.text, 'Projet financé par l\'État dans le cadre de France 2030', `${message} : la légende reste dans la page`);
      if (width >= 1180 && width < 1320) assert.ok(label.width <= 2, `${message} : la légende est cachée (${Math.round(label.width)}px)`);
      else assert.ok(label.width > 40, `${message} : la légende s'affiche (${Math.round(label.width)}px)`);
    });
  }));

// « Ma présence » : la personne connectée (ici Camille, ligne 2 de BDD) a sa zone dans l'en-tête.
const CAMILLE = 'contact1@bordeaux.example';

test('en-tête avec « Ma présence » : un seul bandeau dès 1180px, titre, financeurs au centre, profil à droite', { skip }, () =>
  withWidget({ tables: crowdedIdentity(crowdedBranding(), CAMILLE), user: CAMILLE }, async ({ page }) => {
    await atEachWidth(page, [1180, 1200, 1319, 1320, 1400, 1480, 1920], async width => {
      const header = await rectOf(page, '.page-header');
      const title = await rectOf(page, '.page-title');
      const funders = await rectOf(page, '#funders');
      const account = await rectOf(page, '#accountBar');
      const message = `à ${width}px`;
      assert.ok(account.left >= funders.right + 12, `${message} : le profil est à droite des financeurs`);
      assert.ok(Math.abs(account.right - header.right) <= 1, `${message} : calé à droite de l'en-tête`);
      assert.ok(funders.right <= account.left && title.right <= funders.left, `${message} : titre, financeurs, profil dans l'ordre, sans se toucher`);
      assert.ok(Math.abs(centerX(funders) - centerX(header)) <= 1, `${message} : financeurs toujours au centre`);
      // Un seul bandeau : le profil ne rend pas l'en-tête plus haut que le titre.
      assert.ok(account.top >= header.top - 0.5 && account.bottom <= title.bottom + 12, `${message} : le profil tient dans la hauteur du titre`);
      assert.ok(header.height <= title.height + 12, `${message} : l'en-tête fait ${Math.round(header.height)}px de haut, le titre ${Math.round(title.height)}px`);
    });
  }));

test('en-tête avec « Ma présence » : sous les financeurs à droite de 860 à 1179px, pleine largeur sous 860px', { skip }, () =>
  withWidget({ tables: crowdedIdentity(crowdedBranding(), CAMILLE), user: CAMILLE }, async ({ page }) => {
    await atEachWidth(page, [320, 360, 600, 768, 859, 860, 1024, 1179], async width => {
      const header = await rectOf(page, '.page-header');
      const title = await rectOf(page, '.page-title');
      const funders = await rectOf(page, '#funders');
      const account = await rectOf(page, '#accountBar');
      const message = `à ${width}px`;
      assert.ok(account.top >= funders.bottom - 0.5, `${message} : le profil est sous les financeurs`);
      assert.ok(account.left >= header.left - 0.5 && account.right <= header.right + 0.5, `${message} : le profil tient dans l'en-tête`);
      if (width < 860) {
        assert.ok(account.top >= title.bottom - 0.5, `${message} : le profil est sous le titre`);
        assert.ok(Math.abs(account.left - header.left) <= 1 && Math.abs(account.right - header.right) <= 1, `${message} : sur toute la largeur`);
      } else {
        assert.ok(account.left >= title.right + 12, `${message} : le profil est à droite du titre`);
        assert.ok(Math.abs(account.right - header.right) <= 1, `${message} : calé à droite de l'en-tête`);
      }
      // Le bouton « Modifier mon profil » et l'interrupteur restent à portée : dans le cadre, jamais coupés.
      const controls = await rects(page, '#accountBar .presence-switch, #accountBar .account-edit');
      assert.equal(controls.length, 2, `${message} : l'interrupteur et le bouton sont affichés`);
      controls.forEach(control => assert.ok(control.left >= header.left - 0.5 && control.right <= header.right + 0.5, `${message} : un bouton du profil sort de l'en-tête`));
    });
  }));

test('financeurs : le visuel de la maquette à sa hauteur (36px, 29px sur téléphone), la légende à sa gauche dès 600px', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 599, 600, 768, 1024, 1480], async width => {
      const message = `à ${width}px`;
      const image = await rectOf(page, '#funders img');
      const label = await rectOf(page, '.funders-label');
      assert.ok(Math.abs(image.height - (width <= 599 ? 29 : 36)) <= 0.5, `${message} : le visuel fait ${Math.round(image.height)}px de haut`);
      assert.ok(Math.abs(image.width / image.height - 487 / 80) <= 0.05, `${message} : proportions du fichier (${Math.round(image.width)}x${Math.round(image.height)})`);
      if (width >= 600) assert.ok(label.right <= image.left + 0.5, `${message} : la légende est à gauche du visuel`);
      else assert.ok(label.bottom <= image.top + 0.5, `${message} : la légende est au-dessus du visuel`);
    });
  }));

// ===== Cartes =====

// Trois cartes aux textes courts, comme compactTables() de responsive.test.mjs, pour que
// la géométrie ne dépende pas de la police : toutes dans le premier établissement (son logo).
function compactBranding() {
  const tables = crowdedBranding(crowdedTables(3));
  Object.assign(tables.BDD, {
    prenom: ['Léa', 'Paul', 'Anne'],
    nom: ['Roux', 'Petit', 'Durand'],
    Fonction: ['', 'Ingénieur', ''],
    Etablissement: [1, 1, 1]
  });
  return tables;
}

test('à 1480px avec logos : trois colonnes, logo dans le coin haut droit comme la pastille, nom centré sur l\'avatar', { skip }, () =>
  withWidget({ width: 1480, tables: compactBranding() }, async ({ page }) => {
    const card = await cardGeometry(page, { logo: true });
    assert.equal(card.columns, 3);
    assertBadgeInCorner(card, 'logo');
    assert.ok(card.imageFromBadgeRight >= 0 && card.imageFromBadgeRight <= 6, `l'image est calée à droite de son cadre (${card.imageFromBadgeRight}px)`);
    assert.ok(card.image.width <= 240.5 && card.image.height <= 64.5, `le logo fait ${Math.round(card.image.width)}x${Math.round(card.image.height)}px`);
    assert.ok(card.image.height >= 14, `le logo reste lisible (${Math.round(card.image.height)}px de haut)`);
    assertNameBesideAvatar(card);
  }));

// Les logos ont des formes différentes (de 1,2 à 6 fois plus larges que hauts dans ces fichiers) : sur une carte,
// tous ont la même surface visuelle (CARD_LOGO, logoSize), répartie selon leurs proportions, à l'échelle que
// donne la place de la carte (style.css, requêtes de conteneur : 70 % sur une carte étroite, 85 % dès 330px de
// large, 100 % dès 380px). Seul un logo que la largeur ou la hauteur maximale borne est plus petit.
const LOGO_SCALES = [{ from: 380, scale: 1 }, { from: 330, scale: 0.85 }, { from: 0, scale: 0.7 }];

test('cartes : tous les logos ont la même surface visuelle, à leurs proportions, dans les bornes de CARD_LOGO', { skip }, () =>
  withWidget({ tables: crowdedBranding() }, async ({ page }) => {
    const scales = new Set();
    await atEachWidth(page, [320, 600, 840, 1024, 1150, 1280, 1480], async width => {
      const logos = await page.locator('.contact-card').evaluateAll((cards, steps) => cards.map(card => {
        const image = card.querySelector('.etablissement-tag img');
        const box = image.getBoundingClientRect();
        // La largeur de la carte hors bordures : celle que mesurent les requêtes de conteneur.
        const { scale } = steps.find(candidate => card.clientWidth >= candidate.from);
        return { alt: image.alt, sized: image.classList.contains('sized'), fitted: image.parentElement.classList.contains('fitted'),
          width: box.width / scale, height: box.height / scale, ratio: image.naturalWidth / image.naturalHeight, scale };
      }), LOGO_SCALES);
      assert.ok(logos.length >= 12, `à ${width}px : assez de cartes pour comparer (${logos.length})`);
      let equal = 0;
      logos.forEach(({ alt, sized, fitted, width: w, height: h, ratio, scale }) => {
        const message = `à ${width}px, ${alt}`;
        scales.add(scale);
        assert.ok(sized && fitted, `${message} : le logo n'a pas reçu sa taille`);
        const expected = logoSize(ratio, CARD_LOGO);
        assert.ok(Math.abs(w - expected.width) <= 0.6 && Math.abs(h - expected.height) <= 0.6,
          `${message} : ${w.toFixed(1)}x${h.toFixed(1)}px au lieu de ${expected.width.toFixed(1)}x${expected.height.toFixed(1)}`);
        assert.ok(w <= CARD_LOGO.maxWidth + 0.6 && h <= CARD_LOGO.maxHeight + 0.6, `${message} : plus grand que les bornes (${w.toFixed(1)}x${h.toFixed(1)}px)`);
        if (Math.abs(w * h - CARD_LOGO.area) <= 0.04 * CARD_LOGO.area) equal++;
      });
      // Le test n'est pas vide : la plupart des formes ont bien la surface visée.
      assert.ok(equal >= logos.length / 2, `à ${width}px : ${equal}/${logos.length} logos seulement ont la surface visée`);
    });
    assert.deepEqual([...scales].sort(), [0.7, 0.85, 1], 'les trois échelles de carte sont toutes essayées');
  }));

// Un logo placé au milieu d'un grand carré transparent paraissait minuscule à côté d'un logo coupé au ras : le widget
// recadre l'encre du logo (fitCardLogo) avant d'en tirer la taille. Ici des logos dessinés à la demande : deux ont des
// marges (de formes différentes), un autre n'en a pas, un dernier a un fond coloré qui fait partie du logo.
test('logos des cartes : les marges transparentes sont retirées, et les logos ont la même surface malgré leurs marges', { skip }, () =>
  withWidget({}, async ({ page }) => {
    const logos = await page.evaluate(async () => {
      const { fitCardLogo } = await import('/branding-ui.js');
      const draw = (width, height, rects) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        rects.forEach(([color, ...rect]) => {
          context.fillStyle = color;
          context.fillRect(...rect);
        });
        return canvas.toDataURL('image/png');
      };
      const cases = {
        wideInSquare: draw(800, 800, [['#123b6b', 200, 330, 400, 140]]),
        wideInBanner: draw(1200, 300, [['#7a1f3d', 400, 100, 360, 100]]),
        square: draw(300, 300, [['#1d6b3a', 100, 100, 100, 100]]),
        tight: draw(200, 100, [['#444', 0, 0, 200, 100]]),
        badge: draw(200, 100, [['#147c72', 0, 0, 200, 100], ['#ffffff', 60, 30, 80, 40]])
      };
      const results = {};
      let id = 5000;
      for (const [name, url] of Object.entries(cases)) {
        const holder = document.createElement('button');
        holder.className = 'etablissement-tag';
        const image = new Image();
        image.className = 'logo-img';
        image.src = url;
        await image.decode();
        holder.append(image);
        document.body.append(holder);
        const key = ++id;
        // Comme createLogoImage : chaque chargement de l'image rappelle fitCardLogo, qui la montre (`show`) quand elle
        // est à sa taille ; un logo recadré est remplacé par sa copie, dont le chargement rappelle fitCardLogo.
        await new Promise(show => {
          image.addEventListener('load', () => fitCardLogo(image, key, show));
          fitCardLogo(image, key, show);
        });
        const copied = image.dataset.fit === 'trimmed';
        results[name] = {
          copied,
          natural: [image.naturalWidth, image.naturalHeight],
          w: Number(image.style.getPropertyValue('--w')),
          h: Number(image.style.getPropertyValue('--h')),
          sized: image.classList.contains('sized'),
          fitted: holder.classList.contains('fitted')
        };
      }
      return results;
    });
    const near = (value, expected, tolerance) => Math.abs(value - expected) <= tolerance;
    // 400x140 dans un carré de 800 : 2,86 ; 360x100 dans une bannière : 3,6 ; 100x100 dans un carré de 300 : 1.
    assert.equal(logos.wideInSquare.copied, true);
    assert.ok(near(logos.wideInSquare.natural[0] / logos.wideInSquare.natural[1], 400 / 140, 0.25), `proportions du logo large : ${logos.wideInSquare.natural}`);
    assert.ok(logos.wideInSquare.natural[0] < 450 && logos.wideInSquare.natural[1] < 180, `marges retirées : ${logos.wideInSquare.natural}`);
    assert.equal(logos.wideInBanner.copied, true);
    assert.ok(near(logos.wideInBanner.natural[0] / logos.wideInBanner.natural[1], 3.6, 0.35), `proportions de la bannière : ${logos.wideInBanner.natural}`);
    assert.equal(logos.square.copied, true);
    assert.ok(near(logos.square.natural[0] / logos.square.natural[1], 1, 0.1), `proportions du carré : ${logos.square.natural}`);
    // Rien à retirer : l'image reste celle du fichier, ainsi que quand le fond est une couleur (il fait partie du logo).
    assert.equal(logos.tight.copied, false);
    assert.deepEqual(logos.tight.natural, [200, 100]);
    assert.equal(logos.badge.copied, false);
    assert.deepEqual(logos.badge.natural, [200, 100]);
    // Tous ont reçu leur taille, de même surface (le carré tient dans la hauteur maximale, les autres dans la largeur).
    Object.entries(logos).forEach(([name, logo]) => {
      assert.ok(logo.sized && logo.fitted, `${name} : taille donnée`);
      assert.ok(near(logo.w * logo.h, CARD_LOGO.area, 0.02 * CARD_LOGO.area) || logo.w >= CARD_LOGO.maxWidth - 0.1 || logo.h >= CARD_LOGO.maxHeight - 0.1,
        `${name} : ${logo.w}x${logo.h}`);
    });
    assert.ok(near(logos.wideInSquare.w * logos.wideInSquare.h, CARD_LOGO.area, 0.02 * CARD_LOGO.area), 'logo large : surface visée');
    assert.ok(near(logos.square.w * logos.square.h, CARD_LOGO.area, 0.02 * CARD_LOGO.area) || logos.square.h >= CARD_LOGO.maxHeight - 0.1, 'carré : surface visée ou hauteur maximale');
  }));

test('sur téléphone avec logos, le nom reste centré sur l\'avatar et le logo dans le coin de la carte', { skip }, () =>
  withWidget({ width: 360, tables: compactBranding() }, async ({ page }) => {
    const card = await cardGeometry(page, { logo: true });
    assertBadgeInCorner(card, 'logo');
    assertNameBesideAvatar(card, { alone: false });
  }));

test('le nom et la fonction ne passent jamais sous le logo de l\'établissement, le nom tient sur deux lignes au plus', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 600, 768, 840, 1024, 1280, 1480], async width => {
      const { checked, withLogo, overlapping, tooTall, outside } = await measureNamesAgainstBadges(page, { logo: true });
      assert.ok(checked > 0 && withLogo === checked, `à ${width}px, toutes les cartes affichent un logo (${withLogo}/${checked})`);
      assert.deepEqual(overlapping, [], `à ${width}px, le logo recouvre le nom`);
      assert.deepEqual(tooTall, [], `à ${width}px, un nom s'étend sur plus de deux lignes`);
      assert.deepEqual(outside, [], `à ${width}px, un logo sort de son cadre`);
    });
  }));

// Le rôle dans le PUI est une section de pastilles comme les autres, la première de la carte (1.39.0) : il n'est plus du texte à droite de la
// ligne de l'e-mail (1.27.1 à 1.36.0), donc il ne touche ni l'e-mail, ni le nom, ni la colonne du logo. Un rôle très long passe à la ligne dans sa
// pastille (`overflow-wrap`) : il ne fait dépasser ni la carte ni la page, à aucune largeur.
const withLongRole = tables => {
  tables.Role_Dans_le_PUI.Role = ['Référent innovation et valorisation de la recherche clinique et translationnelle'];
  return tables;
};

const roleLayout = page => page.evaluate(() => [...document.querySelectorAll('.contact-card')]
  .filter(card => card.querySelector('.tag-role'))
  .map(card => {
    const box = element => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    const group = card.querySelector('.card-tags .tag-group');
    return {
      name: card.querySelector('.name').textContent,
      card: box(card),
      firstGroup: group.getAttribute('aria-label'),
      pills: [...group.querySelectorAll('.tag-role')].map(box),
      onEmailLine: card.querySelectorAll('.details .tag-role, .role-col, .role-text, .role-tag').length
    };
  }));

for (const [label, tables, waitLogos] of [['avec logos', withLongRole(crowdedBranding()), true], ['avec le sigle seul', withLongRole(crowdedTables()), false]]) {
  test(`le rôle dans le PUI est la première section de pastilles de la carte et reste dans la carte, même très long (${label})`, { skip }, () =>
    withWidget({ tables, waitLogos }, async ({ page }) => {
      await atEachWidth(page, [320, 360, 414, 600, 768, 840, 1280, 1640, 1920], async width => {
        await assertNoHorizontalOverflow(page, width);
        const cards = await roleLayout(page);
        assert.ok(cards.length > 0, `à ${width}px, des cartes portent un rôle`);
        cards.forEach(card => {
          const message = `à ${width}px, ${card.name}`;
          assert.equal(card.firstGroup, 'Rôle dans le PUI', `${message} : le rôle ouvre les pastilles`);
          assert.equal(card.onEmailLine, 0, `${message} : plus de rôle sur la ligne de l'e-mail`);
          card.pills.forEach(pill => assert.ok(pill.left >= card.card.left - 0.5 && pill.right <= card.card.right + 0.5,
            `${message} : la pastille du rôle dépasse de la carte (${Math.round(pill.left)}–${Math.round(pill.right)} pour ${Math.round(card.card.left)}–${Math.round(card.card.right)})`));
        });
      });
    }));
}

test('écran tactile : le logo de l\'établissement est une cible d\'au moins 28px', { skip }, () =>
  withWidget({ width: 414, touch: true }, async ({ page }) => {
    await atEachWidth(page, [414, 820], async width => {
      const small = await page.locator('.etablissement-tag.visible').evaluateAll(badges =>
        badges.map(badge => badge.getBoundingClientRect()).filter(box => box.height < 27.5 || box.width < 27.5).length);
      assert.equal(small, 0, `à ${width}px, des logos d'établissement font moins de 28px`);
    });
  }));

// ===== Bandeau des fondateurs, en bas =====

// Les cases du bandeau : { cell, image } pour chaque fondateur, dans l'ordre du document.
const bandItems = page => page.locator('#bandLogos li').evaluateAll(items => items.map(item => {
  const rect = element => {
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  };
  const image = item.querySelector('img');
  return { cell: rect(item), image: image && rect(image), sized: image?.classList.contains('sized') ?? false, alt: image?.alt ?? null };
}));

test('bandeau : tout en bas, les fondateurs dans l\'ordre de la table, huit par rangée puis quatre sous 560px de large', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 360, 414, 599, 600, 768, 840, 1024, 1280, 1400, 1480, 1920], async width => {
      const message = `à ${width}px`;
      const band = await rectOf(page, '#foundersBand');
      const lastCard = (await rects(page, '.contact-card')).at(-1);
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      assert.ok(band.top >= lastCard.bottom + 20, `${message} : le bandeau est sous la dernière carte`);
      assert.ok(band.bottom <= documentHeight, `${message} : le bandeau est dans la page`);

      const items = await bandItems(page);
      assert.deepEqual(items.map(item => item.alt), ACRONYMS, `${message} : dans l'ordre de la table`);

      const columns = (await bandContent(page)) >= 560 ? 8 : 4;
      const firstRow = items.filter(item => Math.abs(item.cell.top - items[0].cell.top) < 1).length;
      assert.equal(firstRow, columns, `${message} : ${columns} fondateurs par rangée`);
      const rows = new Set(items.map(item => Math.round(item.cell.top))).size;
      assert.equal(rows, Math.ceil(items.length / columns), `${message} : ${Math.ceil(items.length / columns)} rangées`);

      items.forEach((item, index) => {
        const { cell, image } = item;
        const name = `${message}, ${ACRONYMS[index]}`;
        assert.ok(Math.abs(cell.width - items[0].cell.width) <= 1, `${name} : cases de même largeur`);
        assert.ok(item.sized, `${name} : taille calculée d'après ses proportions`);
        assert.ok(image.left >= cell.left - 0.5 && image.right <= cell.right + 0.5, `${name} : le logo reste dans sa case (largeur)`);
        assert.ok(image.top >= cell.top - 0.5 && image.bottom <= cell.bottom + 0.5, `${name} : le logo reste dans sa case (hauteur)`);
        assert.ok(Math.abs(centerX(image) - centerX(cell)) <= 1 && Math.abs(centerY(image) - centerY(cell)) <= 1, `${name} : centré dans sa case`);
        assert.ok(image.height >= 8 && image.width >= 20, `${name} : lisible (${Math.round(image.width)}x${Math.round(image.height)})`);
      });
      // Même poids visuel : la surface des logos varie peu, quelle que soit leur forme.
      const areas = items.map(item => item.image.width * item.image.height);
      assert.ok(Math.max(...areas) / Math.min(...areas) <= 3, `${message} : poids visuel des logos trop inégal`);
    });
  }));

test('bandeau : le logo France 2030 à droite des logos, ou centré dessous sous 560px, la phrase centrée en dernier', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await atEachWidth(page, [320, 414, 599, 600, 768, 1024, 1480], async width => {
      const message = `à ${width}px`;
      const band = await rectOf(page, '#foundersBand');
      const main = await rectOf(page, '.band-main');
      const roundel = await rectOf(page, '#bandRoundel img');
      const sentence = await rectOf(page, '.band-sentence');
      const content = await bandContent(page);
      if (content >= 560) {
        assert.ok(roundel.left >= main.right - 0.5, `${message} : le logo France 2030 est à droite des logos`);
        assert.ok(Math.abs(centerY(roundel) - centerY(main)) <= 2, `${message} : à mi-hauteur des logos`);
        assert.ok(roundel.width <= 121 && roundel.width >= 60, `${message} : ${Math.round(roundel.width)}px de large`);
      } else {
        assert.ok(roundel.top >= main.bottom - 0.5, `${message} : le logo France 2030 passe sous les logos`);
        assert.ok(Math.abs(centerX(roundel) - centerX(band)) <= 1, `${message} : centré`);
        assert.ok(roundel.width <= 89 && roundel.width >= 60, `${message} : ${Math.round(roundel.width)}px de large`);
      }
      assert.ok(sentence.top >= Math.max(main.bottom, roundel.bottom) - 0.5, `${message} : la phrase est sous les logos`);
      assert.ok(Math.abs(centerX(sentence) - centerX(band)) <= 1.5, `${message} : la phrase est centrée`);
      assert.ok(sentence.left >= band.left && sentence.right <= band.right, `${message} : la phrase tient dans le bandeau`);
    });
  }));

// ===== Des logos de toutes formes =====

// Un logo en hauteur, une bannière très large et un SVG sans dimensions, à la place des
// trois premiers fondateurs.
function extremeBranding() {
  const tables = crowdedBranding();
  tables.Etablissements.logo[0] = ['L', TALL_FILE];
  tables.Etablissements.logo[1] = ['L', WIDE_FILE];
  tables.Etablissements.logo[2] = ['L', UNSIZED_FILE];
  return tables;
}

test('un logo très haut, une bannière très large ou un SVG sans dimensions restent dans leur case', { skip }, () =>
  withWidget({ tables: extremeBranding() }, async ({ page }) => {
    await atEachWidth(page, [320, 768, 1480], async width => {
      const message = `à ${width}px`;
      const items = await bandItems(page);
      items.slice(0, 3).forEach(({ cell, image }, index) => {
        const name = `${message}, fondateur ${index + 1}`;
        assert.ok(image.left >= cell.left - 0.5 && image.right <= cell.right + 0.5, `${name} : reste dans sa case (largeur)`);
        assert.ok(image.top >= cell.top - 0.5 && image.bottom <= cell.bottom + 0.5, `${name} : reste dans sa case (hauteur)`);
        // Une bannière de 10 pour 1 est très fine sur un téléphone : visible, pas forcément confortable.
        assert.ok(image.height >= 4 && image.width >= 8, `${name} : visible (${Math.round(image.width)}x${Math.round(image.height)})`);
      });
      // Les proportions du fichier sont respectées : 40x120, 300x30 et 100x50.
      const expected = [40 / 120, 300 / 30, 100 / 50];
      items.slice(0, 3).forEach(({ image }, index) => {
        const ratio = image.width / image.height;
        assert.ok(Math.abs(ratio / expected[index] - 1) <= 0.15, `${message}, fondateur ${index + 1} : proportions déformées (${ratio.toFixed(2)} au lieu de ${expected[index].toFixed(2)})`);
      });

      const cards = await page.locator('.etablissement-tag img').evaluateAll(images => images.map(image => {
        const { width, height } = image.getBoundingClientRect();
        // Ce qui se voit : l'image tient dans sa case (object-fit: contain), à ses proportions.
        const ratio = image.naturalWidth / image.naturalHeight;
        return { alt: image.alt, width, height, shown: { width: Math.min(width, height * ratio), height: Math.min(height, width / ratio) } };
      }));
      assert.ok(cards.every(({ width, height }) => width <= 240.5 && height <= 64.5 && height >= 4), `${message} : logos des cartes bornés`);
      // Même sur une carte, le logo en hauteur, la bannière et le SVG sans dimensions gardent leurs proportions.
      const expectedRatios = { UB: 40 / 120, 'Bordeaux INP': 300 / 30, BSA: 100 / 50 };
      Object.entries(expectedRatios).forEach(([alt, expectedRatio]) => {
        const logo = cards.find(card => card.alt === alt);
        assert.ok(logo, `${message} : le logo de ${alt} s'affiche sur une carte`);
        assert.ok(Math.abs(logo.shown.width / logo.shown.height / expectedRatio - 1) <= 0.15,
          `${message}, carte ${alt} : proportions déformées (${(logo.shown.width / logo.shown.height).toFixed(2)} au lieu de ${expectedRatio.toFixed(2)})`);
      });
      // Les bornes du bandeau sont en millièmes de la largeur du bloc de logos (1 014 = huit colonnes).
      const main = await rectOf(page, '.band-main');
      const unit = main.width / 1014 * (8 / ((await bandContent(page)) >= 560 ? 8 : 4));
      items.forEach(({ image }, index) => {
        assert.ok(image.width <= BAND_LOGO.maxWidth * unit + 0.5 && image.height <= BAND_LOGO.maxHeight * unit + 0.5,
          `${message}, fondateur ${index + 1} : ${Math.round(image.width)}x${Math.round(image.height)} dépasse les bornes`);
      });
    });
  }));

// ===== Sans logo, les noms prennent la place =====

function namesOnly() {
  const tables = crowdedBranding();
  tables.Etablissements.logo = tables.Etablissements.id.map(() => null);
  return tables;
}

test('sans aucun logo, les noms des fondateurs restent dans leur case', { skip }, () =>
  withWidget({ tables: namesOnly(), waitLogos: false }, async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos .band-name').length > 0);
    await atEachWidth(page, [320, 360, 414, 600, 768, 1024, 1480], async width => {
      const message = `à ${width}px`;
      assert.equal(await page.locator('img.logo-img').count(), 0, `${message} : aucune image`);
      const overflowing = await page.evaluate(() => [...document.querySelectorAll('.band-name')]
        .filter(name => name.scrollWidth > name.clientWidth + 1 || name.getBoundingClientRect().right > name.parentElement.getBoundingClientRect().right + 1)
        .map(name => name.textContent));
      assert.deepEqual(overflowing, [], `${message} : un nom dépasse de sa case`);
      const names = await page.locator('#bandLogos .band-name').allTextContents();
      assert.deepEqual(names, ACRONYMS, `${message} : les noms des fondateurs, dans l'ordre`);
      const { client, scroll } = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(scroll <= client, `${message} : la page déborde de ${scroll - client}px`);
    });
  }));
