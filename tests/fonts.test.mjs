// La police Inter est embarquée (1.36.0, audit UI/UX U41). Elle était la première de la pile `font-family` sans être chargée nulle part :
// le rendu dépendait de sa présence sur le poste, et un poste sans elle retombait sur la police du système, aux lettres plus larges ou
// plus étroites, donc avec d'autres retours à la ligne que ceux qu'on avait mesurés. Quatre fichiers (assets/fonts : un sous-ensemble
// latin de chaque graisse, 21 Ko environ) sont déclarés par style.css, préchargés par index.html et permis par la politique de sécurité
// de contenu (`font-src 'self'`).
//
//   1. Les déclarations : style.css, les fichiers, le préchargement, la politique, la licence (sans navigateur).
//   2. Dans la page : les quatre graisses se chargent, et ce sont elles qui dessinent le texte (Chromium, optionnel : voir TESTING.md).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleTables } from './fixtures.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Les graisses que la feuille de style demande sont 400 (le texte), 600, 650, 700, 750 et 800 : quatre fichiers, la graisse 700 étant déclarée
// de 650 à 750 pour que 650 et 750 y tombent (sans cela, 750 passerait à 800 : la règle des polices du web va vers le plus gras).
const WEIGHTS = [400, 600, 700, 800];
const DECLARED_WEIGHTS = ['400', '600', '650 750', '800'];
const FILES = WEIGHTS.map(weight => `assets/fonts/inter-${weight}.woff2`);
// Un sous-ensemble latin pèse 21 Ko ; la police entière, plus de 300 Ko par graisse : ce plafond garde la page légère.
const MAX_FILE_BYTES = 30_000;

const CSS = read('style.css');
const MARKUP = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
const declarations = body => Object.fromEntries([...body.matchAll(/([a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
const FACES = [...CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => declarations(body));

// ===== 1. Les déclarations =====

test('style.css déclare Inter en quatre graisses, depuis le dépôt, avec `swap` : le texte s\'affiche tout de suite, puis passe à Inter', () => {
  assert.deepEqual(FACES.map(face => face['font-weight']), DECLARED_WEIGHTS, 'une déclaration par graisse, de la plus fine à la plus grasse');
  FACES.forEach((face, index) => {
    assert.equal(face['font-family'], 'Inter');
    assert.equal(face['font-style'], 'normal');
    assert.equal(face['font-display'], 'swap', 'avec `block` le texte resterait invisible tant que la police n\'est pas là');
    assert.equal(face.src, `url("${FILES[index]}") format("woff2")`, 'le fichier du dépôt, jamais celui d\'un autre site');
  });
});

test('la pile de polices commence toujours par Inter, suivie de celle du système (le texte reste lisible tant que le fichier arrive)', () => {
  assert.match(CSS, /body \{[^}]*font-family:\s*Inter,\s*system-ui,/);
});

test('les quatre fichiers existent, sont de vrais WOFF2 et restent des sous-ensembles légers', () => {
  for (const file of FILES) {
    const bytes = fs.readFileSync(path.join(ROOT, file));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file} : un fichier WOFF2`);
    assert.ok(bytes.length > 5_000 && bytes.length < MAX_FILE_BYTES, `${file} : ${bytes.length} octets, entre 5 Ko et ${MAX_FILE_BYTES / 1000} Ko (la police entière est dix fois plus lourde)`);
  }
});

test('index.html fait précharger exactement ces quatre fichiers, en police et en CORS', () => {
  const tags = [...MARKUP.matchAll(/<link\s[^>]*rel="preload"[^>]*>/g)].map(match => match[0]);
  assert.deepEqual(tags.map(tag => /href="([^"]+)"/.exec(tag)?.[1]).sort(), FILES,
    'la liste de préchargement et les @font-face de style.css nomment les mêmes fichiers : un fichier préchargé et jamais employé est une demande perdue');
  for (const tag of tags) {
    assert.match(tag, /\sas="font"/);
    assert.match(tag, /\stype="font\/woff2"/);
    assert.match(tag, /\scrossorigin(?:\s|>)/, 'une police se demande toujours en CORS : sans `crossorigin`, le fichier préchargé ne serait pas réutilisé et serait demandé deux fois');
  }
});

test('la politique de sécurité de contenu permet les polices du dépôt, et seulement elles', () => {
  const policy = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(read('index.html'))[1];
  const sources = /(?:^|;)\s*font-src\s+([^;]*)/.exec(policy)?.[1].trim().split(/\s+/);
  assert.deepEqual(sources, ['\'self\''], 'font-src \'self\' : ni joker, ni autre site (une police est une donnée que le navigateur interprète)');
});

test('la licence de la police (SIL OFL 1.1) accompagne les fichiers, avec la mention de droits d\'auteur', () => {
  const license = read('assets/fonts/LICENSE.txt');
  assert.match(license, /^Copyright 2016 The Inter Project Authors/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(license, /PERMISSION & CONDITIONS/);
  assert.match(read('assets/fonts/LISEZ-MOI.md'), /Inter 4\.0/, 'la provenance des fichiers est écrite à côté d\'eux');
});

// ===== 2. Dans la page =====

// Les polices que le navigateur emploie vraiment pour dessiner le texte de l'élément `selector` (protocole de débogage de Chromium) :
// { nom de la police: vrai pour une police du site, faux pour une police installée sur le poste }. Le nom est celui que la police se
// donne (« Inter », « Inter SemiBold »...), pas celui de la déclaration.
async function platformFonts(page, context, selector) {
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const { root } = await session.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
  await session.detach();
  return Object.fromEntries(fonts.map(font => [font.familyName, font.isCustomFont]));
}

// Toutes les polices employées sont des fichiers du site (Inter, d'une graisse ou d'une autre), aucune une police installée ou de secours.
const assertOnlySiteInter = (fonts, where) => {
  const names = Object.keys(fonts);
  assert.ok(names.length > 0 && names.every(name => /^Inter\b/.test(name) && fonts[name] === true), `${where} : ${JSON.stringify(fonts)}`);
};

test('dans la page, les quatre graisses sont chargées', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await page.evaluate(() => [...document.fonts].map(face => `${face.family} ${face.weight} ${face.status}`)),
      WEIGHTS.map(weight => `Inter ${weight === 700 ? '650 750' : weight} loaded`));
  }));

test('650, 700 et 750 se dessinent avec la même graisse, 600 et 800 chacune avec la leur : l\'aspect mesuré de la feuille de style ne change pas', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const widths = await page.evaluate(() => Object.fromEntries([400, 600, 650, 700, 750, 800].map(weight => {
      const probe = document.createElement('span');
      probe.style.cssText = `position: absolute; visibility: hidden; white-space: nowrap; font: ${weight} 20px Inter`;
      probe.textContent = 'Mathématiques et compétences numériques';
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return [weight, Math.round(width * 100) / 100];
    })));
    assert.equal(widths[650], widths[700]);
    assert.equal(widths[750], widths[700], 'les libellés des filtres (750) gardent la graisse 700 : à 800 ils s\'élargiraient d\'un pixel ou deux et pousseraient leurs voisins');
    assert.ok(widths[400] < widths[600] && widths[600] < widths[700] && widths[700] < widths[800], JSON.stringify(widths));
  }));

test('le titre, les noms, les fonctions et les libellés des filtres sont dessinés par la police du site, jamais par une police installée ou de secours', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, context }) => {
    await waitForCards(page, 4);
    for (const selector of ['.page-title', '.contact-card .name', '.contact-card .fonction', '.filter-name', '#resultCount']) {
      assertOnlySiteInter(await platformFonts(page, context, selector), selector);
    }
  }));

test('tout le français est dans le sous-ensemble : lettres accentuées, ligatures, guillemets, apostrophe, points de suspension, tirets, flèche, coche', { skip }, () =>
  withWidget({}, async ({ page, context }) => {
    await waitForCards(page, 4);
    const repertoire = 'àâäçéèêëîïôöùûüÿœæ ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ « texte » l’été… 12–14 — 3 € 100 % n° 5 · × − → ↑ ✓ łđß';
    await page.evaluate(text => {
      const probe = document.createElement('p');
      probe.id = 'fontProbe';
      probe.style.fontWeight = '700';
      probe.textContent = text;
      document.body.append(probe);
    }, repertoire);
    assertOnlySiteInter(await platformFonts(page, context, '#fontProbe'), 'aucun de ces caractères ne passe par une police de secours');
  }));
