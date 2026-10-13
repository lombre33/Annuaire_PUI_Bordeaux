// Test navigateur du chargement des logos à part (branding-ui.js, preloadLogo). Contexte : le 13 octobre 2026, Antoine ne voyait plus
// aucun logo dans Firefox, et sa console listait seize demandes `NS_BINDING_ABORTED`, une par logo. Firefox annule la demande d'une
// image que le document retire avant la fin de son chargement ; l'annuaire redessine toutes ses cartes à chaque lecture de Grist, à
// chaque filtre et à l'arrivée de l'identité : si Grist répond moins vite que ces redessins, aucun logo n'arrive jamais. Chromium
// n'annule pas, et Firefox n'est pas installé ici : ces tests reproduisent donc la cause (une image retirée du document pendant son
// chargement) et ce qui s'en suit (une demande perdue, une demande sans réponse), avec un Grist que le test retient, fait échouer ou taire.
//
// Optionnel, comme les autres tests navigateur : sans Playwright ils sont ignorés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withBranding, withIdentity, ANA_EMAIL } from './fixtures.mjs';
import { MISSING_FILE } from './support/fake-attachments.mjs';
import { skip, reload, waitForCards, withWidget as withWidgetOn } from './support/browser.mjs';
import { SEARCH_DELAY_MS, VERSION } from '../constants.js';

const withWidget = (options, run) => withWidgetOn({ tables: withBranding(), ...options }, run);

// Ce que Firefox annule : une image de logo qui a une adresse mais pas fini de charger quand le document la retire. Le script la
// compte au moment du retrait (`window.__lostLogos` : le texte alternatif de chacune).
const WATCH_REMOVALS = `
window.__lostLogos = [];
new MutationObserver(records => records.forEach(record => record.removedNodes.forEach(node => {
  if (node.nodeType !== 1) return;
  const images = node.matches('img') ? [node] : [...node.querySelectorAll('img')];
  images.forEach(image => {
    if (image.classList.contains('logo-img') && image.getAttribute('src') && !image.complete) window.__lostLogos.push(image.alt);
  });
}))).observe(document, { childList: true, subtree: true });
`;
const lostLogos = page => page.evaluate(() => window.__lostLogos);

// Seize fondateurs, chacun avec son logo et trois personnes : le jeu d'Antoine (seize demandes annulées dans sa console).
const FOUNDERS = 16;
function sixteenFounders() {
  const base = withIdentity(sampleTables());
  const ids = Array.from({ length: FOUNDERS }, (_, index) => index + 1);
  base.Etablissements = {
    id: ids,
    acronyme: ids.map(id => `E${id}`),
    nom_complet: ids.map(id => `Etablissement ${id}`),
    fondateur: ids.map(() => true),
    partenaire: ids.map(() => false),
    autres: ids.map(() => false),
    ok_pour_apparaitre: ids.map(() => true),
    logo: ids.map(id => ['L', id]),
    ordre_bandeau: ids
  };
  const owners = ids.flatMap(id => [id, id, id]);
  const column = value => owners.map((_, index) => (typeof value === 'function' ? value(index) : value));
  base.BDD = {
    id: column(index => index + 1),
    prenom: column(index => `Prenom${index}`),
    nom: column(index => `Nom${String(index).padStart(3, '0')}`),
    email: column(index => `p${index}@e${owners[index]}.fr`),
    Fonction: column('Chargé de mission'),
    Etablissement: owners,
    Instances: column(() => ['L']),
    Actions: column(() => ['L']),
    GT: column(() => ['L']),
    Communautes: column(() => ['L']),
    Taches: column(() => ['L']),
    Competences: column(() => ['L']),
    perimetre: column(() => ['L', 1]),
    numero_de_telephone: column(0),
    Role_dans_le_PUI: column(0),
    Accepte_apparaitre: column(true)
  };
  return base;
}
const CARDS = FOUNDERS * 3;
const LOGOS_SHOWN = CARDS + FOUNDERS; // un logo sur chaque carte, un dans le bandeau pour chaque fondateur

const warningsOf = async (logs, pattern) => (await Promise.all(logs.warnings)).filter(text => pattern.test(text));
const errorsOf = async logs => (await Promise.all(logs.errors)).filter(text => !/Failed to load resource/.test(text));
const allShown = count => page => page.waitForFunction(expected => document.querySelectorAll('.logo-img.loaded').length >= expected, count, { timeout: 20000 });

// Attend qu'une ligne de la console corresponde, et la rend.
async function consoleLine(list, pattern, timeout = 15000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = (await Promise.all(list)).find(text => pattern.test(text));
    if (found) return found;
    if (Date.now() > deadline) assert.fail(`aucune ligne de la console ne correspond à ${pattern}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// ===== Les redessins ne coûtent pas un logo =====

test('Grist tarde et l\'annuaire se redessine : aucune image de logo n\'est retirée en cours de chargement, et chaque logo n\'est demandé qu\'une fois', { skip }, () =>
  withWidgetOn({ tables: sixteenFounders(), user: ANA_EMAIL, downloadHold: true, initScript: WATCH_REMOVALS }, async ({ page, files, logs }) => {
    await waitForCards(page, CARDS);
    // Des lectures de Grist, comme à chaque édition du document, et une recherche qui garde toutes les cartes puis son effacement :
    // autant de redessins complets des cartes.
    for (let round = 0; round < 3; round += 1) {
      await reload(page);
      await waitForCards(page, CARDS);
    }
    for (const term of ['Prenom', '']) {
      await page.fill('#searchInput', term);
      await page.waitForTimeout(SEARCH_DELAY_MS + 150);
      await waitForCards(page, CARDS);
    }

    // Chaque image retirée alors qu'elle charge est une demande que Firefox annule (NS_BINDING_ABORTED) : il ne doit y en avoir aucune.
    assert.deepEqual(await lostLogos(page), [], 'aucune image n\'a été retirée du document pendant son chargement');
    assert.equal(await page.locator('.logo-img[src]').count(), 0, 'tant que Grist n\'a rien donné, aucune image de logo n\'a d\'adresse : il n\'y a rien à annuler');
    assert.deepEqual(files.requests.map(request => request.id).sort((a, b) => a - b), Array.from({ length: FOUNDERS }, (_, index) => index + 1),
      'une demande par logo, quel que soit le nombre de cartes, de rendus et d\'endroits qui le montrent');
    assert.ok(files.requests.every(request => !request.crossOrigin && !request.probe), 'ni lecture des pixels ni CORS tant que le logo n\'est pas chargé');

    files.release();
    await allShown(LOGOS_SHOWN)(page);
    assert.deepEqual(await errorsOf(logs), []);
    assert.deepEqual(await warningsOf(logs, /\[LOGOS\] Le logo/), []);
  }));

// ===== Une demande perdue, une demande sans réponse =====

test('la première demande de chaque logo est annulée par le navigateur : les logos s\'affichent quand même, sans avertissement', { skip }, () =>
  withWidget({ downloadFirst: 'abort' }, async ({ page, files, logs }) => {
    await waitForCards(page, 4);
    await allShown(4)(page);
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 3);
    assert.ok(files.requests.some(request => request.id === 11 && !request.answered), 'la demande perdue a bien eu lieu');
    assert.deepEqual(await warningsOf(logs, /\[LOGOS\] Le logo/), []);
    assert.deepEqual(await errorsOf(logs), []);
  }));

test('la première demande d\'un logo reste sans réponse : une autre est faite, et les logos s\'affichent sans avertissement', { skip }, () =>
  withWidget({ downloadFirst: 'hang' }, async ({ page, files, logs }) => {
    await waitForCards(page, 4);
    await allShown(4)(page); // après PRELOAD_LIMIT_MS (5 s)
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 3);
    const lost = files.requests.filter(request => request.id === 11 && !request.answered);
    assert.equal(lost.length, 1, 'une seule demande est restée sans réponse');
    assert.deepEqual(await warningsOf(logs, /\[LOGOS\] Le logo/), []);
    assert.deepEqual(await errorsOf(logs), []);
  }));

test('un logo chargé qui ne se charge plus sur la carte laisse la place au sigle après huit secondes, avec un seul avertissement', { skip }, () =>
  withWidget({ downloadAgain: 'hang' }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    // Le fichier a été reçu une fois (le chargement à part) : les images qui le montrent attendent en vain. Aucune ne reste invisible pour de bon.
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card .etablissement-tag')]
      .filter(badge => badge.textContent.trim() === 'CHU').length === 3, undefined, { timeout: 20000 });
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['Institut Bergonié', 'CHU', 'CHU', 'CHU']);
    await page.waitForFunction(() => document.querySelectorAll('#bandLogos li .band-name').length === 2, undefined, { timeout: 20000 });
    const warnings = await warningsOf(logs, /\[LOGOS\] Le logo/);
    assert.equal(warnings.length, 1, 'trois cartes du CHU, un seul message');
    assert.match(warnings[0], /^\[LOGOS\] Le logo de la ligne \d+ d'Etablissements \(pièce jointe 11\) ne se charge pas : la demande n'a pas abouti à temps/);
    assert.doesNotMatch(warnings[0], /fake-token|auth=|\/attachments\//);
    assert.deepEqual(await errorsOf(logs), []);
  }));

test('un fichier supprimé n\'est pas redemandé sans fin : trois essais au plus, puis le sigle, même si l\'annuaire se redessine', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables }, async ({ page, files }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => [...document.querySelectorAll('.contact-card .etablissement-tag')]
      .filter(badge => badge.textContent.trim() === 'CHU').length === 3);
    const asked = () => files.requests.filter(request => request.id === MISSING_FILE).length;
    assert.ok(asked() >= 1 && asked() <= 3, `${asked()} demandes`);
    const before = asked();
    for (let round = 0; round < 3; round += 1) {
      await reload(page);
      await waitForCards(page, 4);
    }
    assert.equal(asked(), before, 'un logo refusé n\'est pas redemandé à chaque redessin');
  });
});

// ===== Ce que la console et la page disent =====

test('la console fait le bilan des logos : combien Grist en a donné, combien s\'affichent, combien de redessins, combien de jetons', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await allShown(4)(page);
    const line = await consoleLine(logs.infos, /^\[LOGOS\] Bilan/);
    assert.match(line, /^\[LOGOS\] Bilan : 1 logo chargé sur 1 ; affichés : 3\/3 sur les cartes, 1\/1 dans le bandeau ; cartes redessinées [1-9]\d* fois ; jetons demandés à Grist 1 \(0 en échec\) ; \w+ \d+\.$/);
    assert.doesNotMatch(line, /fake-token|auth=|\/attachments\/|CHU|http/);
    assert.deepEqual(await warningsOf(logs, /\[LOGOS\] Bilan/), [], 'tout va bien : une information, pas un avertissement');
  }));

test('un logo que Grist ne donne pas : le bilan de la console est un avertissement qui compte les refus', { skip }, () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', MISSING_FILE];
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const line = await consoleLine(logs.warnings, /^\[LOGOS\] Bilan/);
    assert.match(line, /^\[LOGOS\] Bilan : 0 logo chargé sur 1 \(1 refusé, 0 sans réponse, 0 sans jeton, 0 en attente\) ; affichés : 0\/0 sur les cartes, 0\/0 dans le bandeau ;/);
    assert.doesNotMatch(line, /fake-token|auth=|\/attachments\/|CHU|http/);
  });
});

test('la version qui s\'exécute est écrite en bas de la page, de quoi savoir laquelle on a sous les yeux malgré le cache', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const note = page.locator('.page-footer #versionNote');
    assert.equal(await note.textContent(), `Version ${VERSION}`);
    assert.equal(await note.isVisible(), true);
    assert.ok((await note.evaluate(element => parseFloat(getComputedStyle(element).fontSize))) >= 11, 'discrète mais lisible');
  }));
