// Test navigateur de l'habillage : charge le vrai index.html dans Chromium, avec un Grist
// simulé dont les pièces jointes (logos) sont servies par tests/support/fake-attachments.mjs,
// et vérifie ce que voit l'utilisateur : le logo sur les cartes (ou le nom à défaut), les
// financeurs fixes en haut, le bandeau des fondateurs en bas, et les repli quand Grist ne
// donne pas les fichiers.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md). Sans lui ces
// tests sont ignorés et `node --test` reste vert.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withBranding, withIdentity, withSchema, HOSTILE_FIRST_NAME, ANA_EMAIL } from './fixtures.mjs';
import { FAKE_ATTACHMENTS_URL } from './support/fake-grist.js';
import { MISSING_FILE, BROKEN_FILE, PADDED_FILE } from './support/fake-attachments.mjs';
import { skip, reload, waitForCards, withWidget as withWidgetOn } from './support/browser.mjs';
import { CARD_LOGO, PUI_URL, VERSION } from '../constants.js';
import { ANALYSIS_TIMEOUT_MS, FIT_GATE_MS } from '../branding-ui.js';

// Sans autre précision, un document complété de logos (GRIST_SETUP.md).
const withWidget = (options, run) => withWidgetOn({ tables: withBranding(), ...options }, run);

const waitForLogos = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.logo-img.loaded').length >= expected, count);
const tokenRequests = page => page.evaluate(() => window.__fake.tokenRequests);
// L'étiquette d'établissement de la carte d'une personne, retrouvée par son nom affiché : les
// cartes sont triées par nom de famille, leur position ne désigne personne.
const badgeOf = (page, name) => page.locator('.contact-card')
  .filter({ has: page.locator('.name', { hasText: name }) }).locator('.etablissement-tag');
const logoUrl = id => `${FAKE_ATTACHMENTS_URL}/attachments/${id}/download?auth=fake-token`;

// Ce que le navigateur consigne tout seul pour un fichier introuvable n'est pas une erreur du widget.
const errorsOf = async logs => (await Promise.all(logs.errors)).filter(text => !/Failed to load resource/.test(text));
const warningsOf = async (logs, pattern) => (await Promise.all(logs.warnings)).filter(text => pattern.test(text));

// Ce qu'affiche chaque case d'une liste : le texte alternatif de son logo, ou son texte.
const entriesOf = (page, selector) => page.locator(selector).evaluateAll(items =>
  items.map(item => item.querySelector('img')?.alt ?? item.textContent.trim()));

// ===== Cartes =====

test('une carte montre le logo de son établissement, seul : ni nom dessous ni pastille', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const badge = badgeOf(page, 'Ana Martin'); // CHU
    await badge.locator('img.loaded').waitFor();
    assert.equal(await badge.evaluate(element => element.classList.contains('has-logo')), true);
    assert.equal(await badge.locator('img').getAttribute('src'), logoUrl(11), 'le fichier 11 est le logo du CHU');
    assert.equal(await badge.locator('img').getAttribute('alt'), 'CHU');
    assert.equal(await badge.getAttribute('title'), 'CHU de Bordeaux', 'le nom complet au survol');
    assert.equal((await badge.textContent()).trim(), '', 'le nom ne s\'affiche pas quand il y a un logo');
    assert.deepEqual(await errorsOf(logs), []);
  }));

test('un établissement sans logo garde la pastille texte, et les autres cartes leur logo', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const gina = badgeOf(page, 'Gina Bergonié'); // Institut Bergonié : pas de logo
    assert.equal(await gina.evaluate(element => element.classList.contains('has-logo')), false);
    assert.equal(await gina.locator('img').count(), 0);
    assert.equal(await gina.textContent(), 'Institut Bergonié');
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 3, 'les trois cartes du CHU');
  }));

test('cliquer le logo filtre sur l\'établissement, comme la pastille', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    await badgeOf(page, 'Ana Martin').click();
    await waitForCards(page, 3);
    const filter = page.locator('.filter[data-filter-key="etablissement"]');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    await badgeOf(page, 'Ana Martin').click();
    await waitForCards(page, 4);
  }));

test('le logo est un bouton qu\'on atteint au clavier, nommé par l\'établissement', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const badge = badgeOf(page, 'Ana Martin');
    assert.equal(await badge.evaluate(element => element.tagName), 'BUTTON');
    await badge.focus();
    await page.keyboard.press('Enter');
    await waitForCards(page, 3);
  }));

test('une pièce jointe n\'est demandée à Grist qu\'avec un jeton en lecture seule, obtenu une seule fois pour toutes les images', { skip }, () =>
  withWidget({}, async ({ page, files }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 4); // 3 cartes, 1 logo de fondateur
    assert.deepEqual(await tokenRequests(page), [{ readOnly: true }]);
    assert.deepEqual(Object.keys(files.hits), ['11'], 'un téléchargement par fichier, pas un de plus');
    assert.ok(files.tokens.length >= 1 && files.tokens.every(token => token === 'fake-token'));
  }));

test('les logos des cartes, du bandeau et de l\'en-tête s\'affichent sans attendre l\'écran (leur fichier est déjà chargé), aucun ne dit d\'où il vient', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 4);
    const attribute = (selector, name) => page.locator(selector).evaluateAll((images, property) => images.map(image => image[property]), name);
    // Un logo d'établissement est chargé à part, une fois (branding-ui.js, preloadLogo) : la carte qui le montre n'a plus rien à
    // attendre, et un `lazy` ne ferait que retarder une image déjà en mémoire (les photos de profil, elles, restent `lazy`).
    assert.deepEqual(await attribute('.etablissement-tag img', 'loading'), ['eager', 'eager', 'eager']);
    assert.deepEqual(await attribute('#bandLogos img', 'loading'), ['eager']);
    const policies = await attribute('.logo-img', 'referrerPolicy');
    assert.equal(policies.length, 4);
    assert.ok(policies.every(policy => policy === 'no-referrer'), 'l\'adresse du widget n\'est pas envoyée au serveur de Grist');
  }));

test('sans aucun logo dans le document, Grist n\'est jamais sollicité pour un jeton', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await tokenRequests(page), []);
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['Institut Bergonié', 'CHU', 'CHU', 'CHU']);
    assert.deepEqual(await errorsOf(logs), []);
    assert.deepEqual(await warningsOf(logs, /LOGOS|Financeurs|logo/i), []);
  }));

// ===== Financeurs, en haut =====

// Les financeurs sont les deux images de la maquette, fixes dans le dépôt (assets/) : aucune table de
// Grist, aucun jeton, et le document n'a rien à contenir pour qu'ils s'affichent.
test('les financeurs s\'affichent dans tous les documents : le visuel de la maquette, sa légende, sans jeton ni message', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#funders').isVisible(), true);
    assert.equal(await page.locator('#funders .funders-label').textContent(), 'Projet financé par l\'État dans le cadre de France 2030');
    const image = page.locator('#funders img.funders-img');
    assert.equal(await image.getAttribute('alt'), 'République française, ANR, Bpifrance, France 2030');
    assert.equal(await image.getAttribute('src'), 'assets/financeurs.png');
    await page.waitForFunction(() => document.querySelector('#funders img').naturalWidth > 0);
    assert.equal(await image.evaluate(element => element.getBoundingClientRect().height), 36, 'la hauteur de la maquette');
    assert.equal(await image.evaluate(element => getComputedStyle(element).filter), 'none', 'l\'image est déjà grise : aucun filtre');
    assert.deepEqual(await tokenRequests(page), []);
    assert.deepEqual(await errorsOf(logs), []);
    assert.deepEqual(await warningsOf(logs, /LOGOS|Financeurs|logo/i), []);
  }));

test('une table Financeurs restée dans le document ne change rien : les financeurs sont ceux du dépôt', { skip }, () => {
  const tables = withBranding();
  tables.Financeurs = { id: [1], nom: [HOSTILE_FIRST_NAME], logo: [['L', 21]], ordre: [1] };
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#funders img').count(), 1);
    assert.equal(await page.locator('#funders img').getAttribute('src'), 'assets/financeurs.png');
    assert.equal(await page.locator('#funders').textContent().then(text => text.includes(HOSTILE_FIRST_NAME)), false);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  });
});

// ===== Bandeau des fondateurs, en bas =====

test('le bandeau du bas liste les fondateurs validés dans l\'ordre de ordre_bandeau, logo ou nom', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#foundersBand').isVisible(), true);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU'],
      'Bergonié (ordre 1, sans logo : son nom) puis CHU (ordre 2) ; INSERM n\'a pas validé sa présence, UBM est partenaire');
    assert.equal(await page.locator('#bandLogos li').nth(1).locator('img').getAttribute('src'), logoUrl(11));
    assert.equal(await page.locator('#bandLogos li').nth(1).getAttribute('title'), 'CHU de Bordeaux');
  }));

test('le logo de France 2030 ferme le bandeau, avec la phrase de financement et le lien vers le projet', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#bandRoundel img').getAttribute('src'), 'assets/france-2030.png', 'l\'image fixe du dépôt');
    assert.equal(await page.locator('#bandRoundel img').getAttribute('alt'), 'France 2030');
    assert.equal(await page.locator('#bandRoundel img').evaluate(element => getComputedStyle(element).filter), 'none', 'le rond garde ses couleurs');
    assert.equal(await page.locator('.band-sentence').textContent(),
      'Le Pôle universitaire d\'innovation Bordeaux est un projet financé par l\'État dans le cadre de France 2030.');
    const link = page.locator('#bandLink');
    assert.equal(await link.getAttribute('href'), PUI_URL);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
  }));

test('sans logo dans le document, le bandeau garde les noms des fondateurs, dans l\'ordre de la table', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['CHU', 'Institut Bergonié']);
    assert.equal(await page.locator('#bandLogos img').count(), 0);
    assert.equal(await page.locator('#bandRoundel img').count(), 1, 'le rond France 2030 est une image du dépôt : il ne dépend d\'aucun logo');
  }));

test('sans aucun fondateur dans Etablissements, le bandeau disparaît à la lecture suivante, les financeurs restent', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.getElementById('foundersBand').hidden);
    // Plus de fondateur : les contacts ne sont plus éligibles non plus (fondateur ou partenaire).
    await page.evaluate(() => { window.__tables.Etablissements.fondateur = window.__tables.Etablissements.fondateur.map(() => false); });
    await reload(page);
    await waitForCards(page, 0);
    await page.waitForFunction(() => document.getElementById('foundersBand').hidden);
    assert.equal(await page.locator('#bandLogos li').count(), 0);
    assert.equal(await page.locator('#funders').isVisible(), true);
  }));

test('un fondateur qui retire sa présence (ok_pour_apparaitre) disparaît du bandeau à la lecture suivante', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => { window.__tables.Etablissements.ok_pour_apparaitre[0] = false; });
    await reload(page);
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos li').length === 1);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié']);
  }));

// ===== Quand Grist ne donne pas les fichiers =====

test('si Grist refuse le jeton, les logos laissent la place aux noms, une seule demande et un seul avertissement', { skip }, () =>
  withWidget({ accessToken: null }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo') && !document.querySelector('.logo-holder img'));
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['Institut Bergonié', 'CHU', 'CHU', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.equal(await page.locator('#funders img').getAttribute('src'), 'assets/financeurs.png', 'les financeurs fixes ne dépendent pas de Grist');
    assert.equal(await page.locator('#bandRoundel img').getAttribute('src'), 'assets/france-2030.png');
    assert.equal((await tokenRequests(page)).length, 1);
    assert.equal((await warningsOf(logs, /\[LOGOS\]/)).length, 1);
    assert.deepEqual(await errorsOf(logs), []);
    // L'annuaire, lui, marche : le filtre par établissement aussi.
    await badgeOf(page, 'Ana Martin').click();
    await waitForCards(page, 3);
  }));

// Régression du 13/10/2026 : après la 1.21.4 (le logo demandé en CORS pour lire ses pixels), les logos ont disparu des cartes
// chez Antoine, et les 1.25.2 et 1.26.1 n'ont pas suffi à les rendre. Le logo qu'on voit est une image ordinaire, sans CORS ;
// ses pixels se lisent à part, sur une adresse distincte, et ne conditionnent jamais son affichage : quand la lecture réussit,
// le logo est recadré et prend la surface des autres, sinon il se montre quand même, dans sa case de 104 x 42 px (1.27.2).
const BOX = { width: 104, height: 42 };
const cardLogos = page => page.locator('.contact-card .etablissement-tag.has-logo img').evaluateAll(images => images.map(image => ({
  shown: image.classList.contains('loaded') && image.getBoundingClientRect().width > 0,
  width: image.getBoundingClientRect().width,
  height: image.getBoundingClientRect().height,
  copy: image.src.startsWith('data:image/png;base64,'),
  cors: image.hasAttribute('crossorigin'),
  sized: image.classList.contains('sized'),
  fitted: image.parentElement.classList.contains('fitted'),
  state: image.dataset.logo ?? null,
  w: Number(image.style.getPropertyValue('--w')),
  h: Number(image.style.getPropertyValue('--h'))
})));
// Attend que les trois logos du CHU soient montrés et que leur lecture soit finie (`data-logo`).
const logosSettled = (page, state, timeout) => page.waitForFunction(expected => {
  const images = [...document.querySelectorAll('.contact-card .etablissement-tag.has-logo img')];
  return images.length === 3 && images.every(image => image.classList.contains('loaded') && image.dataset.logo === expected);
}, state, { timeout });

test('une carte recadre le logo posé dans un grand carré transparent et lui donne la surface des autres', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', PADDED_FILE];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await logosSettled(page, 'sized');
    const logos = await cardLogos(page);
    assert.deepEqual(logos.map(logo => logo.shown), [true, true, true]);
    assert.deepEqual(logos.map(logo => logo.copy), [true, true, true], 'l\'image montrée est la copie recadrée');
    assert.deepEqual(logos.map(logo => logo.cors), [false, false, false], 'l\'image qu\'on voit n\'est jamais demandée en CORS');
    assert.deepEqual(logos.map(logo => logo.fitted), [true, true, true]);
    logos.forEach(logo => {
      assert.ok(Math.abs(logo.w * logo.h - CARD_LOGO.area) <= 0.02 * CARD_LOGO.area, `surface : ${logo.w}x${logo.h}`);
      assert.ok(Math.abs(logo.width / logo.height - 400 / 140) < 0.25, `proportions du logo : ${logo.width}x${logo.height}`);
    });
    assert.deepEqual(await errorsOf(logs), []);
    assert.deepEqual(await warningsOf(logs, /\[LOGOS\]/), [], 'Grist donne les pixels : rien à signaler');
  });
});

test('la lecture des pixels d\'un logo se fait sur une adresse à part : l\'image affichée n\'est jamais demandée en CORS', { skip }, () =>
  withWidget({}, async ({ page, files }) => {
    await waitForCards(page, 4);
    await logosSettled(page, 'sized');
    assert.ok(files.requests.some(request => request.crossOrigin), 'la lecture a bien été tentée en CORS');
    assert.ok(files.requests.some(request => !request.crossOrigin), 'l\'image affichée est une demande ordinaire');
    assert.ok(files.requests.every(request => request.crossOrigin === request.probe), 'seule la lecture des pixels demande du CORS, à son adresse');
  }));

// Un Grist qui ne donne pas les pixels d'un logo (CORS refusé) ne cache ni ne retarde jamais un logo : il se montre aussitôt,
// tel quel, dans la case de style.css, sans rien recadrer.
test('un Grist qui refuse les demandes CORS : les logos s\'affichent quand même, aussitôt, tels quels dans leur case', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', PADDED_FILE];
  return withWidget({ tables, downloadCors: false }, async ({ page, logs, files }) => {
    await waitForCards(page, 4);
    await logosSettled(page, 'box', 2500);
    const logos = await cardLogos(page);
    assert.deepEqual(logos.map(logo => logo.shown), [true, true, true], 'les trois logos du CHU se voient');
    assert.deepEqual(logos.map(logo => logo.copy), [false, false, false], 'ni lus ni recadrés : le fichier lui-même');
    assert.deepEqual(logos.map(logo => logo.cors), [false, false, false]);
    assert.deepEqual(logos.map(logo => logo.sized), [false, false, false]);
    assert.ok(logos.every(logo => logo.width <= BOX.width + 0.5 && logo.height <= BOX.height + 0.5 && logo.height > 0
      && Math.abs(logo.width / logo.height - BOX.width / BOX.height) < 0.05), `dans la case : ${JSON.stringify(logos[0])}`);
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo.fitted').count(), 0);
    assert.ok(files.requests.some(request => request.crossOrigin && request.probe), 'la lecture a été tentée, à son adresse');
    assert.deepEqual(await errorsOf(logs), []);
    // La console dit une seule fois pourquoi les logos ne sont pas égalisés, sans adresse ni jeton.
    const warnings = await warningsOf(logs, /\[LOGOS\]/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /pixels d'un logo ne se lisent pas \(Grist ne donne pas les pièces jointes en CORS/);
    assert.doesNotMatch(warnings[0], /fake-token|auth=|\/attachments\//);
  });
});

test('un Grist qui laisse la lecture sans réponse : les logos se montrent après un court délai, sans attendre la fin de la lecture', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', PADDED_FILE];
  return withWidget({ tables, downloadCors: 'hang' }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    // Montrés bien avant l'abandon de la lecture (ANALYSIS_TIMEOUT_MS) : seul FIT_GATE_MS les a retenus.
    await page.waitForFunction(() => document.querySelectorAll('.contact-card .etablissement-tag.has-logo img.loaded').length === 3,
      undefined, { timeout: ANALYSIS_TIMEOUT_MS - 500 });
    assert.ok(FIT_GATE_MS < ANALYSIS_TIMEOUT_MS / 2);
    const early = await cardLogos(page);
    assert.deepEqual(early.map(logo => logo.shown), [true, true, true]);
    assert.ok(early.every(logo => logo.width <= BOX.width + 0.5 && logo.height <= BOX.height + 0.5 && logo.height > 0), `dans la case : ${JSON.stringify(early[0])}`);
    // La lecture abandonnée, rien ne change : les logos restent tels quels.
    await logosSettled(page, 'box', ANALYSIS_TIMEOUT_MS + 3000);
    assert.deepEqual((await cardLogos(page)).map(logo => [logo.shown, logo.copy, logo.sized]), [[true, false, false], [true, false, false], [true, false, false]]);
    assert.deepEqual(await errorsOf(logs), []);
    assert.match((await warningsOf(logs, /\[LOGOS\]/)).join('\n'), /pas répondu à temps/);
  });
});

test('la console dit la version et ce que Grist donne des logos, une seule fois', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    await reload(page);
    await reload(page);
    await waitForCards(page, 4);
    const lines = (await Promise.all(logs.infos)).filter(text => /\[LOGOS\]/.test(text));
    assert.equal(lines.length, 1, 'la même ligne n\'est pas répétée à chaque lecture de Grist');
    assert.match(lines[0], new RegExp(`^\\[LOGOS\\] Version ${VERSION.replace(/\./g, '\\.')} : \\d+ établissements? lus? dans Etablissements, [1-9]\\d* avec un logo dans la colonne logo\\.$`));
  }));

test('aucun logo dans Etablissements : la console le dit, la carte garde le sigle', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const lines = (await Promise.all(logs.infos)).filter(text => /\[LOGOS\]/.test(text));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /0 avec un logo dans la colonne logo \(aucun : les cartes montrent le sigle\)\.$/);
  }));

test('un logo que Grist ne donne pas : la console le dit une fois par fichier, sans adresse', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card .etablissement-tag')]
      .filter(badge => badge.textContent.trim() === 'CHU').length === 3);
    const warnings = await warningsOf(logs, /\[LOGOS\] Le logo de/);
    assert.equal(warnings.length, 1, 'trois cartes du CHU, un seul message');
    assert.match(warnings[0], new RegExp(`^\\[LOGOS\\] Le logo de la ligne \\d+ d'Etablissements \\(pièce jointe ${MISSING_FILE}\\) ne se charge pas`));
    assert.doesNotMatch(warnings[0], /CHU/, 'un numéro de ligne, pas un nom');
    assert.doesNotMatch(warnings[0], /fake-token|auth=|\/attachments\//);
  });
});

test('un fichier supprimé dans Grist : la pastille texte reprend sa place, sans redemander de jeton', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo')
      || [...document.querySelectorAll('.etablissement-tag.has-logo')].every(badge => badge.textContent.trim() === '' && badge.querySelector('img.loaded')));
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card .etablissement-tag')]
      .filter(badge => badge.textContent.trim() === 'CHU').length === 3);
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 0);
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['Institut Bergonié', 'CHU', 'CHU', 'CHU']);
    assert.equal((await tokenRequests(page)).length, 1, 'un fichier absent n\'est pas un jeton périmé');
    assert.deepEqual(await errorsOf(logs), []);
    await badgeOf(page, 'Ana Martin').click();
    await waitForCards(page, 3);
  });
});

// docs/securite.md : le jeton ouvre le document en lecture pour quelques minutes, le widget
// ne le laisse donc dans aucune trace (le navigateur, lui, consigne l'adresse d'une image
// introuvable : c'est hors de son contrôle).
test('ni le jeton ni l\'adresse d\'un logo ne passent par la console du widget, même quand un fichier manque', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card .etablissement-tag')]
      .filter(badge => badge.textContent.trim() === 'CHU').length === 3);
    assert.ok((await tokenRequests(page)).length >= 1, 'le test doit avoir exercé le jeton');
    const everything = (await Promise.all([...logs.errors, ...logs.warnings, ...logs.infos])).join('\n');
    assert.doesNotMatch(everything, /fake-token|auth=|\/attachments\//);
  });
});

test('un fichier qui n\'est pas une image : le nom reprend sa place dans le bandeau comme sur les cartes', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', BROKEN_FILE];
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos li .band-name').length === 2);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.equal(await page.locator('#bandLogos img').count(), 0);
  });
});

// Une image en erreur est retentée une fois avec un jeton renouvelé, pas davantage : même quand
// Grist donne un autre jeton à chaque demande, un fichier qui ne se charge jamais ne fait pas
// boucler le navigateur. Une adresse « data: » qui n'est pas une image est une erreur certaine,
// sans réseau.
test('un logo en erreur n\'est retenté qu\'une fois, même si Grist donne un autre jeton à chaque demande', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const counts = await page.evaluate(async () => {
      const { createLogoImage } = await import('./branding-ui.js');
      const seen = { urls: 0, refreshes: 0, failures: 0 };
      const attachments = {
        url: () => `data:text/plain,essai ${++seen.urls}`,
        refresh: async () => { seen.refreshes += 1; return true; },
        ready: async () => true
      };
      createLogoImage(attachments, 7, 'Logo', () => { seen.failures += 1; }, { eager: true });
      await new Promise(resolve => setTimeout(resolve, 600));
      return seen;
    });
    assert.deepEqual(counts, { urls: 2, refreshes: 1, failures: 1 });
  }));

// Rien de ce que fait onLoad (la lecture des pixels d'un logo de carte, fitCardLogo) ne doit cacher un logo pour de bon :
// qu'il plante ou qu'il oublie d'appeler `show`, le logo se montre.
test('un onLoad qui plante ou qui oublie show ne cache jamais un logo', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const shown = await page.evaluate(async () => {
      const { createLogoImage } = await import('./branding-ui.js');
      const attachments = { url: () => 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%225%22/%3E', refresh: async () => false, ready: async () => true };
      const make = onLoad => createLogoImage(attachments, 7, 'Logo', () => {}, { eager: true, onLoad, holdLimit: 300 });
      const throwing = make(() => { throw new Error('boom'); });
      const forgetful = make(() => false);
      document.body.append(throwing, forgetful);
      await new Promise(resolve => setTimeout(resolve, 100));
      const early = [throwing, forgetful].map(image => image.classList.contains('loaded'));
      await new Promise(resolve => setTimeout(resolve, 500));
      return { early, late: [throwing, forgetful].map(image => image.classList.contains('loaded')) };
    });
    assert.deepEqual(shown, { early: [true, false], late: [true, true] });
    assert.equal((await Promise.all(logs.errors)).filter(text => /\[LOGOS\] Erreur en préparant un logo/.test(text)).length, 1);
  }));

test('une version de Grist sans getAccessToken s\'affiche avec les noms, sans erreur', { skip }, () =>
  withWidget({ withoutMethods: ['getAccessToken'] }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo'));
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['Institut Bergonié', 'CHU', 'CHU', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.deepEqual(await errorsOf(logs), []);
  }));

// ===== Mises à jour =====

test('une lecture de Grist qui ne change aucun logo ne reconstruit pas le bandeau', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => { document.querySelector('#bandLogos li').dataset.kept = 'oui'; });
    await page.evaluate(() => { window.__tables.BDD.Fonction[0] = 'Cheffe de projet'; });
    await reload(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card')].some(card =>
      card.querySelector('.name').textContent === 'Ana Martin' && card.querySelector('.fonction').textContent === 'Cheffe de projet'));
    assert.equal(await page.locator('#bandLogos li').first().getAttribute('data-kept'), 'oui');
  }));

test('changer un logo dans Grist change l\'image du bandeau et des cartes à la lecture suivante', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => { window.__tables.Etablissements.logo[0] = ['L', 31]; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('#bandLogos li:nth-child(2) img')?.src.includes('/attachments/31/'));
    await badgeOf(page, 'Ana Martin').locator('img.loaded').waitFor();
    assert.equal(await badgeOf(page, 'Ana Martin').locator('img').getAttribute('src'), logoUrl(31));
  }));

// ===== Relecture d'une modification =====

test('la relecture avant/après montre le logo de l\'établissement sur les deux cartes, sans rien de cliquable', { skip }, () =>
  withWidget({ tables: withSchema(withIdentity(withBranding())), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-edit').click();
    const dialog = page.locator('#profileDialog');
    await dialog.waitFor();
    await dialog.locator('#profile-Fonction').fill('Cheffe de service');
    await dialog.getByRole('button', { name: 'Relire mes modifications', exact: true }).click();
    for (const side of ['.rv-col-before', '.rv-col-after']) {
      const badge = dialog.locator(`${side} .etablissement-tag`);
      await badge.locator('img.loaded').waitFor();
      assert.equal(await badge.locator('img').getAttribute('src'), logoUrl(11), `${side} : le logo du CHU`);
      assert.equal(await badge.isDisabled(), true, `${side} : le logo n'est pas cliquable dans la relecture`);
    }
  }));

// Dans la maquette validée, le bloc d'identité de la fenêtre de modification porte à droite le logo
// de l'établissement de la fiche (son nom en pastille quand Grist n'a pas de logo pour lui).
test('la fenêtre de modification montre le logo de l\'établissement dans son bloc d\'identité, et le nom en pastille sans logo', { skip }, () =>
  withWidget({ tables: withSchema(withIdentity(withBranding())), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-edit').click();
    const dialog = page.locator('#profileDialog');
    await dialog.waitFor();
    const logo = dialog.locator('.ident .et-logo');
    await logo.locator('img.loaded').waitFor();
    assert.equal(await logo.locator('img').getAttribute('src'), logoUrl(11), 'le fichier 11 est le logo du CHU');
    assert.equal(await logo.locator('img').getAttribute('alt'), 'CHU');
    assert.equal(await logo.getAttribute('title'), 'CHU de Bordeaux', 'le nom complet au survol');
    assert.equal(await dialog.locator('.ident .et-pill').count(), 0, 'le logo remplace la pastille');
    assert.equal(await logo.evaluate(element => element.closest('button, a') === null), true, 'rien de cliquable');
    await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
    // Une administratrice ouvre la fiche de Gina (Institut Bergonié, sans logo) : la pastille.
    await page.locator('#accountBar .account-admin').click();
    await page.locator('.contact-card', { hasText: 'Gina' }).locator('.card-edit').click();
    await dialog.locator('.ident .et-pill').waitFor();
    assert.equal(await dialog.locator('.ident .et-pill').textContent(), 'Institut Bergonié');
    assert.equal(await dialog.locator('.ident .et-logo').count(), 0);
  }));

test('si le fichier du logo manque, le bloc d\'identité de la fenêtre garde le nom de l\'établissement', { skip }, () => {
  const tables = withSchema(withIdentity(withBranding()));
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar .account-edit').click();
    const dialog = page.locator('#profileDialog');
    await dialog.waitFor();
    await dialog.locator('.ident .et-pill').waitFor();
    assert.equal(await dialog.locator('.ident .et-pill').textContent(), 'CHU');
    assert.equal(await dialog.locator('.ident .et-logo').count(), 0);
    assert.deepEqual(await errorsOf(logs), []);
  });
});

// ===== Un logo ne casse jamais l'annuaire =====

test('l\'annuaire fonctionne pendant que les logos se chargent : recherche et filtres répondent', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.fill('#searchInput', 'bergonie');
    await waitForCards(page, 1);
    assert.equal(await page.locator('.contact-card .etablissement-tag').textContent(), 'Institut Bergonié');
    await page.click('#resetFilters');
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
  }));
