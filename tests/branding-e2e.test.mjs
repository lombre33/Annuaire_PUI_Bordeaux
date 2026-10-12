// Test navigateur de l'habillage : charge le vrai index.html dans Chromium, avec un Grist
// simulé dont les pièces jointes (logos) sont servies par tests/support/fake-attachments.mjs,
// et vérifie ce que voit l'utilisateur : le logo sur les cartes (ou le nom à défaut), les
// financeurs en haut, le bandeau des fondateurs en bas, et les repli quand Grist ne donne
// pas les fichiers.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md). Sans lui ces
// tests sont ignorés et `node --test` reste vert.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables, withBranding, withIdentity, withSchema, HOSTILE_FIRST_NAME, ANA_EMAIL } from './fixtures.mjs';
import { FAKE_ATTACHMENTS_URL } from './support/fake-grist.js';
import { MISSING_FILE, BROKEN_FILE } from './support/fake-attachments.mjs';
import { skip, reload, waitForCards, withWidget as withWidgetOn } from './support/browser.mjs';
import { PUI_URL } from '../constants.js';

// Sans autre précision, un document complété de logos (GRIST_SETUP.md) et de financeurs.
const withWidget = (options, run) => withWidgetOn({ tables: withBranding(), ...options }, run);

const waitForLogos = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.logo-img.loaded').length >= expected, count);
const tokenRequests = page => page.evaluate(() => window.__fake.tokenRequests);
const badgeOf = (page, index) => page.locator('.contact-card').nth(index).locator('.etablissement-tag');
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
    const badge = badgeOf(page, 0); // Ana, CHU
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
    const gina = badgeOf(page, 2); // Institut Bergonié : pas de logo
    assert.equal(await gina.evaluate(element => element.classList.contains('has-logo')), false);
    assert.equal(await gina.locator('img').count(), 0);
    assert.equal(await gina.textContent(), 'Institut Bergonié');
    assert.equal(await page.locator('.contact-card .etablissement-tag.has-logo').count(), 3, 'les trois cartes du CHU');
  }));

test('cliquer le logo filtre sur l\'établissement, comme la pastille', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    await badgeOf(page, 0).click();
    await waitForCards(page, 3);
    const filter = page.locator('.filter[data-filter-key="etablissement"]');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    await badgeOf(page, 0).click();
    await waitForCards(page, 4);
  }));

test('le logo est un bouton qu\'on atteint au clavier, nommé par l\'établissement', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 1);
    const badge = badgeOf(page, 0);
    assert.equal(await badge.evaluate(element => element.tagName), 'BUTTON');
    await badge.focus();
    await page.keyboard.press('Enter');
    await waitForCards(page, 3);
  }));

test('une pièce jointe n\'est demandée à Grist qu\'avec un jeton en lecture seule, obtenu une seule fois pour toutes les images', { skip }, () =>
  withWidget({}, async ({ page, files }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 8); // 3 cartes, 1 logo de fondateur, 3 financeurs, le rond France 2030
    assert.deepEqual(await tokenRequests(page), [{ readOnly: true }]);
    assert.deepEqual(Object.keys(files.hits).sort(), ['11', '21', '22', '23'], 'un téléchargement par fichier, pas un de plus');
    assert.ok(files.tokens.length >= 4 && files.tokens.every(token => token === 'fake-token'));
  }));

test('les logos des cartes se chargent à l\'approche de l\'écran, ceux de l\'en-tête et du bandeau tout de suite, aucun ne dit d\'où il vient', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 8);
    const attribute = (selector, name) => page.locator(selector).evaluateAll((images, property) => images.map(image => image[property]), name);
    assert.deepEqual(await attribute('.etablissement-tag img', 'loading'), ['lazy', 'lazy', 'lazy']);
    assert.deepEqual(await attribute('#fundersLogos img, #bandLogos img, #bandRoundel img', 'loading'), Array(5).fill('eager'));
    const policies = await attribute('.logo-img', 'referrerPolicy');
    assert.equal(policies.length, 8);
    assert.ok(policies.every(policy => policy === 'no-referrer'), 'l\'adresse du widget n\'est pas envoyée au serveur de Grist');
  }));

test('sans aucun logo ni financeur dans le document, Grist n\'est jamais sollicité pour un jeton', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await tokenRequests(page), []);
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.deepEqual(await errorsOf(logs), []);
    assert.deepEqual(await warningsOf(logs, /LOGOS|Financeurs|logo/i), []);
  }));

// ===== Financeurs, en haut =====

test('les financeurs s\'affichent dans l\'ordre de la table, un logo chacun et le nom à défaut', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#funders').isVisible(), true);
    assert.deepEqual(await entriesOf(page, '#fundersLogos li'), ['République française', 'ANR', 'Bpifrance', 'France 2030'],
      'Bpifrance n\'a pas de logo : son nom prend sa place');
    assert.equal(await page.locator('#fundersLogos li').nth(0).locator('img').getAttribute('src'), logoUrl(21));
    assert.equal(await page.locator('#funders .funders-label').textContent(), 'Projet financé par l\'État dans le cadre de France 2030');
  }));

// La maquette validée par Antoine montre les financeurs en gris, discrets, et le rond de France 2030
// du bandeau du bas en couleurs : la même pièce jointe sert aux deux, la feuille de style désature
// seulement celle du haut.
test('les logos des financeurs sont en niveaux de gris en haut de page, le rond du bandeau du bas garde ses couleurs', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    const filterOf = selector => page.locator(selector).first().evaluate(image => getComputedStyle(image).filter);
    assert.equal(await filterOf('#fundersLogos img'), 'grayscale(1)');
    assert.equal(await filterOf('#bandRoundel img'), 'none');
    assert.equal(await filterOf('#bandLogos img'), 'none');
    assert.equal(await filterOf('.contact-card .etablissement-tag img'), 'none');
  }));

test('sans table Financeurs, l\'en-tête n\'a pas de financeurs et rien n\'est signalé', { skip }, () => {
  const tables = withBranding();
  delete tables.Financeurs;
  return withWidget({ tables }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#funders').isHidden(), true);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.deepEqual(await errorsOf(logs), []);
  });
});

test('un nom de financeur contenant du HTML s\'affiche en texte brut', { skip }, () => {
  const tables = withBranding();
  tables.Financeurs.nom[3] = HOSTILE_FIRST_NAME;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    assert.equal(await page.locator('#fundersLogos .funder-name').textContent(), HOSTILE_FIRST_NAME);
    assert.equal(await page.locator('#fundersLogos [src="x"]').count(), 0);
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
    assert.equal(await page.locator('#bandRoundel img').getAttribute('src'), logoUrl(23));
    assert.equal(await page.locator('#bandRoundel img').getAttribute('alt'), 'France 2030');
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
    assert.equal(await page.locator('#foundersBand img').count(), 0);
    assert.equal(await page.locator('#bandRoundel').textContent(), '');
  }));

test('sans aucun fondateur dans Etablissements, le bandeau n\'est pas affiché, les financeurs si', { skip }, () => {
  const tables = withBranding();
  // Plus de fondateur : les contacts ne sont plus éligibles non plus (fondateur ou partenaire).
  tables.Etablissements.fondateur = tables.Etablissements.fondateur.map(() => false);
  return withWidget({ tables }, async ({ page }) => {
    await page.waitForFunction(() => !document.getElementById('funders').hidden);
    assert.equal(await page.locator('#foundersBand').isHidden(), true);
    assert.equal(await page.locator('#bandLogos li').count(), 0);
  });
});

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
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#fundersLogos li'), ['République française', 'ANR', 'Bpifrance', 'France 2030']);
    assert.equal(await page.locator('#bandRoundel').textContent(), 'France 2030');
    assert.equal((await tokenRequests(page)).length, 1);
    assert.equal((await warningsOf(logs, /\[LOGOS\]/)).length, 1);
    assert.deepEqual(await errorsOf(logs), []);
    // L'annuaire, lui, marche : le filtre par établissement aussi.
    await badgeOf(page, 0).click();
    await waitForCards(page, 3);
  }));

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
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.equal((await tokenRequests(page)).length, 1, 'un fichier absent n\'est pas un jeton périmé');
    assert.deepEqual(await errorsOf(logs), []);
    await badgeOf(page, 0).click();
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
    await waitForLogos(page, 4); // les 3 financeurs et le rond : les logos du CHU, absents, ont laissé place au nom
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

test('une version de Grist sans getAccessToken s\'affiche avec les noms, sans erreur', { skip }, () =>
  withWidget({ withoutMethods: ['getAccessToken'] }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => !document.querySelector('.etablissement-tag.has-logo'));
    assert.deepEqual(await page.locator('.contact-card .etablissement-tag').allTextContents(), ['CHU', 'CHU', 'Institut Bergonié', 'CHU']);
    assert.deepEqual(await entriesOf(page, '#bandLogos li'), ['Institut Bergonié', 'CHU']);
    assert.deepEqual(await errorsOf(logs), []);
  }));

// ===== Mises à jour =====

test('une lecture de Grist qui ne change aucun logo ne reconstruit ni le bandeau ni les financeurs', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => {
      document.querySelector('#bandLogos li').dataset.kept = 'oui';
      document.querySelector('#fundersLogos li').dataset.kept = 'oui';
    });
    await page.evaluate(() => { window.__tables.BDD.Fonction[0] = 'Cheffe de projet'; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('.contact-card .fonction').textContent === 'Cheffe de projet');
    assert.equal(await page.locator('#bandLogos li').first().getAttribute('data-kept'), 'oui');
    assert.equal(await page.locator('#fundersLogos li').first().getAttribute('data-kept'), 'oui');
  }));

test('changer un logo dans Grist change l\'image du bandeau et des cartes à la lecture suivante', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForLogos(page, 3);
    await page.evaluate(() => { window.__tables.Etablissements.logo[0] = ['L', 31]; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('#bandLogos li:nth-child(2) img')?.src.includes('/attachments/31/'));
    await badgeOf(page, 0).locator('img.loaded').waitFor();
    assert.equal(await badgeOf(page, 0).locator('img').getAttribute('src'), logoUrl(31));
  }));

test('ajouter la table Financeurs dans Grist fait apparaître les financeurs sans recharger la page', { skip }, () => {
  const tables = withBranding();
  const financeurs = tables.Financeurs;
  delete tables.Financeurs;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#funders').isHidden(), true);
    await page.evaluate(value => { window.__tables.Financeurs = value; }, financeurs);
    await reload(page);
    await page.waitForFunction(() => !document.getElementById('funders').hidden);
    assert.equal(await page.locator('#fundersLogos li').count(), 4);
  });
});

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
