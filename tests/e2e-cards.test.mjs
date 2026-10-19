// Test navigateur des cartes de l'annuaire à grande échelle : les cartes que renderCards() garde d'un dessin à l'autre (render.js) et
// celles que le navigateur n'affiche qu'à l'approche de l'écran (content-visibility, style.css). Un annuaire de plusieurs milliers de
// fiches se redessinait en plusieurs secondes à chaque lettre tapée ; ces deux dispositifs le ramènent à une fraction de seconde, à
// condition de ne rien changer pour les personnes : une carte gardée doit montrer ce que la carte reconstruite montrerait, et le clavier
// doit atteindre toutes les cartes.
//
// Optionnel : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANA_EMAIL, sampleTables, withBranding, withClones, withIdentity } from './fixtures.mjs';
import { cardCount, changeFonction, gridCard, openOwn, skip, until, waitForCards, waitForEditButtons, withWidget } from './support/browser.mjs';
import { profileDialogPage } from './support/dialog-page.mjs';

const { review } = profileDialogPage();

// 4 cartes de départ (Ana, Hostile, Gina, Hugo) et 60 « Copie n » : de quoi remplir bien plus d'un écran.
const CLONES = 60;
const ALL_CARDS = 4 + CLONES;
const crowd = () => withClones(sampleTables(), CLONES);
const crowdWithAna = () => withIdentity(crowd());

// Une carte reconstruite est un autre élément : celle qui garde sa marque est celle qu'on avait.
const markCards = page => page.evaluate(() => {
  document.querySelectorAll('.contact-card').forEach((card, index) => { card.__mark = index; });
});
const marks = page => page.evaluate(() => [...document.querySelectorAll('.contact-card')].map(card => card.__mark ?? null));
const kept = list => list.filter(mark => mark !== null);

test('chercher puis effacer la recherche rend les mêmes cartes, sans les reconstruire', { skip }, () =>
  withWidget({ tables: crowd(), user: null }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    await markCards(page);
    const before = await marks(page);
    assert.equal(before.length, ALL_CARDS);

    await page.fill('#searchInput', 'Copie 1');
    await until(async () => (await cardCount(page)) < ALL_CARDS, 'la recherche a retiré des cartes');
    const searched = await marks(page);
    assert.ok(searched.length > 0 && searched.length < ALL_CARDS);
    assert.equal(kept(searched).length, searched.length, 'les cartes qui restent sont celles de tout à l\'heure');

    await page.fill('#searchInput', '');
    await waitForCards(page, ALL_CARDS);
    assert.deepEqual(await marks(page), before, 'les mêmes cartes, dans le même ordre');
  }));

test('un filtre, l\'interrupteur Partenaires et « Réinitialiser » réutilisent aussi les cartes', { skip }, () =>
  withWidget({ tables: crowd(), user: null }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    await markCards(page);
    await page.locator('.scope-btn[data-scope="partenaire"]').click();
    await waitForCards(page, ALL_CARDS + 1); // Bob, de l'UBM, partenaire
    assert.equal(kept(await marks(page)).length, ALL_CARDS, 'Bob est neuf, les autres sont gardées');
    await markCards(page);

    const instances = page.locator('.filter[data-filter-key="instances"]');
    await instances.locator('.filter-button').click();
    await instances.locator('.filter-option', { hasText: 'CME' }).locator('input').check();
    await until(async () => (await cardCount(page)) < ALL_CARDS, 'le filtre a retiré des cartes');
    assert.equal(kept(await marks(page)).length, await cardCount(page), 'seules des cartes gardées');

    await page.click('#resetFilters');
    await waitForCards(page, ALL_CARDS + 1);
    assert.equal(kept(await marks(page)).length, ALL_CARDS + 1, 'toutes les cartes, y compris celles qu\'un filtre avait retirées');
  }));

test('une relecture de Grist reconstruit toutes les cartes : elles montrent les données nouvelles', { skip }, () =>
  withWidget({ tables: crowd(), user: null }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    await markCards(page);
    await changeFonction(page, { row: 0, name: 'Ana', fonction: 'Cheffe de pôle' });
    assert.deepEqual(kept(await marks(page)), [], 'aucune carte n\'a survécu à la relecture : les contacts sont neufs');
  }));

test('les droits de la personne connectée : seules les cartes dont les droits changent sont reconstruites', { skip }, () =>
  withWidget({ tables: crowdWithAna(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    await waitForEditButtons(page, 1); // le sien
    await markCards(page);
    const anaIndex = (await page.locator('.contact-card .name').allTextContents()).findIndex(name => name.includes('Ana'));

    await page.locator('#accountBar .account-admin').click(); // mode admin : « Modifier la fiche » sur toutes les autres
    await waitForEditButtons(page, ALL_CARDS);
    let now = await marks(page);
    assert.equal(now[anaIndex], anaIndex, 'la carte d\'Ana (« Votre fiche » avant, après) est gardée');
    assert.equal(kept(now).length, 1, 'les 63 autres ont changé de droits : reconstruites avec leur bouton');

    await page.locator('#accountBar .account-admin').click(); // mode admin éteint
    await waitForEditButtons(page, 1);
    now = await marks(page);
    assert.equal(now[anaIndex], anaIndex, 'celle d\'Ana est toujours la même');
    assert.equal(kept(now).length, 1, 'les autres, de nouveau reconstruites, sans bouton');
  }));

test('une identité qui arrive après les cartes : seules les cartes concernées sont refaites, avec le bouton de l\'établissement', { skip }, () =>
  // Une écriture lente (celle de la sonde) retarde l'identité de la personne : les cartes sont déjà dessinées quand elle arrive.
  withWidget({ tables: crowdWithAna(), user: ANA_EMAIL, delay: 1200 }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    const buttons = page.locator('#cardsGrid .etab-edit');
    assert.equal(await buttons.count(), 0, 'l\'identité n\'est pas encore arrivée : aucun bouton sous les logos');
    await markCards(page);
    const ginaIndex = (await page.locator('.contact-card .name').allTextContents()).findIndex(name => name.includes('Gina'));

    // Ana est responsable du CHU : « ✎ Modifier » sous le logo des 63 cartes du CHU, pas sous celui de Gina (Bergonié).
    await until(async () => (await buttons.count()) === ALL_CARDS - 1, 'le bouton de l\'établissement apparaît sur les cartes déjà dessinées');
    const now = await marks(page);
    assert.equal(now[ginaIndex], ginaIndex, 'la carte de Gina, dont rien ne change, est gardée');
    assert.equal(kept(now).length, 1, 'les 63 cartes du CHU sont refaites avec leur bouton');
  }));

test('renderCards reconstruit une carte dès que l\'un de ses ingrédients change (gabarit, onToggle, droits, jeton, logo, droit sur l\'établissement), et seulement alors', { skip }, () =>
  withWidget({ tables: withBranding(sampleTables()), user: null }, async ({ page }) => {
    await waitForCards(page, 4);
    // On appelle renderCards() avec les modules de la page, sur une grille à part, et on compte les cartes qui ne sont plus celles du
    // dessin précédent. Un geste du widget ne change pas ces ingrédients sans changer aussi le contact : c'est le contrat de
    // renderCards() qu'on garde ici, pour que la liste de cardFor() ne s'amenuise pas sans qu'un test le dise.
    const { rebuilt, expected } = await page.evaluate(async () => {
      const { renderCards } = await import('/render.js');
      const { loadDirectory, refId } = await import('/grist-data.js');
      const { createAttachments } = await import('/attachments.js');
      const { buildBranding, logoForContact } = await import('/branding.js');
      const { contacts, etablissementRows } = await loadDirectory(window.grist.docApi, {});
      const branding = buildBranding({ etablissementRows });
      const attachments = createAttachments(window.grist.docApi);
      const template = document.getElementById('cardTemplate');
      const grid = document.createElement('div');
      const logoFor = contact => logoForContact(branding, contact);
      const start = { template, onToggle: () => {}, rightsOf: () => null, logos: { attachments, logoFor }, etabRights: () => false };
      const draw = change => {
        const view = { ...start, ...change };
        renderCards(grid, view.template, contacts, view.onToggle, view.rightsOf, view.logos, view.etabRights);
        return [...grid.children];
      };
      // Le dessin de départ, puis le dessin modifié : combien de cartes sont neuves.
      const rebuiltBy = change => {
        const before = draw({});
        return draw(change).filter((card, index) => card !== before[index]).length;
      };
      return {
        rebuilt: {
          rien: rebuiltBy({}),
          gabarit: rebuiltBy({ template: template.cloneNode(true) }),
          onToggle: rebuiltBy({ onToggle: () => {} }),
          droits: rebuiltBy({ rightsOf: () => 'own' }),
          jeton: rebuiltBy({ logos: { attachments: createAttachments(window.grist.docApi), logoFor } }),
          logo: rebuiltBy({ logos: { attachments, logoFor: () => null } }),
          etablissement: rebuiltBy({ etabRights: () => true })
        },
        expected: {
          toutes: contacts.length,
          avecLogo: contacts.filter(contact => logoForContact(branding, contact)).length,
          avecEtablissement: contacts.filter(contact => contact.etablissement_label && refId(contact.Etablissement)).length
        }
      };
    });
    assert.ok(expected.avecLogo > 0, 'le jeu de données a des cartes dont l\'établissement a un logo');
    assert.ok(expected.avecEtablissement > 0, 'le jeu de données a des cartes qui portent un établissement');
    assert.deepEqual(rebuilt, {
      rien: 0,
      gabarit: expected.toutes,
      onToggle: expected.toutes,
      droits: expected.toutes,
      jeton: expected.toutes,
      logo: expected.avecLogo,
      etablissement: expected.avecEtablissement
    });
  }));

test('une rafale d\'éditions dans Grist n\'entraîne qu\'une relecture, 250 ms après la dernière, et les cartes montrent la donnée de la fin', { skip }, () =>
  withWidget({ tables: crowd(), user: null }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    const reads = () => page.evaluate(() => window.__bddReads);
    await page.evaluate(() => {
      window.__bddReads = 0;
      const { docApi } = window.grist;
      const fetchTable = docApi.fetchTable.bind(docApi);
      docApi.fetchTable = name => { if (name === 'BDD') window.__bddReads += 1; return fetchTable(name); };
    });
    // Cinq éditions à la suite : le prénom d'Ana change à chacune.
    await page.evaluate(() => {
      ['Anna', 'Anne', 'Annie', 'Annick', 'Anaïs'].forEach(first => {
        window.__tables.BDD.prenom[0] = first;
        window.__triggerRecords();
      });
    });
    await page.waitForTimeout(120);
    assert.equal(await reads(), 0, 'rien n\'est lu tant que 250 ms ne se sont pas écoulées depuis la dernière édition');
    await until(async () => (await gridCard(page, 'Anaïs').count()) === 1, 'la carte montre la dernière valeur');
    await page.waitForTimeout(400);
    assert.equal(await reads(), 1, 'cinq éditions, une seule lecture de BDD');
  }));

test('les cartes hors de l\'écran sont différées par le navigateur, celles de l\'écran ne le sont pas', { skip }, () =>
  withWidget({ tables: crowd(), user: null }, async ({ page }) => {
    await waitForCards(page, ALL_CARDS);
    // Ce que le navigateur diffère, c'est l'intérieur de la carte : la carte, elle, a sa place dans la grille.
    const skipped = index => page.locator('.contact-card').nth(index).evaluate(card =>
      !card.querySelector('.name').checkVisibility({ contentVisibilityAuto: true }));
    assert.equal(await page.locator('.contact-card').first().evaluate(card => getComputedStyle(card).contentVisibility), 'auto');
    assert.equal(await skipped(0), false, 'la première carte est à l\'écran');
    assert.equal(await skipped(ALL_CARDS - 1), true, 'la dernière carte est loin sous l\'écran : le navigateur ne la dessine pas encore');
    await page.locator('.contact-card').last().scrollIntoViewIfNeeded();
    await until(async () => !(await skipped(ALL_CARDS - 1)), 'la dernière carte est dessinée quand on y arrive');
  }));

test('les deux cartes de la relecture ne sont pas différées : la colonne « Avant » a sa vraie hauteur dès la première image', { skip }, () =>
  withWidget({ tables: crowdWithAna(), user: ANA_EMAIL }, async ({ page }) => {
    await openOwn(page, ALL_CARDS);
    await page.locator('#profile-prenom').fill('Anaïs');
    // La hauteur de la colonne « Avant » à chaque image dès qu'elle existe : une carte différée y aurait paru à sa hauteur estimée
    // (480 px) avant de reprendre la vraie.
    await page.evaluate(() => {
      window.__heights = [];
      const sample = () => {
        const column = document.querySelector('#profileDialog .rv-col-before');
        if (column) window.__heights.push(Math.round(column.getBoundingClientRect().height));
        if (window.__heights.length < 12) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await review(page);
    await until(async () => (await page.evaluate(() => window.__heights.length)) >= 12, 'douze images relevées');
    const heights = await page.evaluate(() => window.__heights);
    assert.equal(new Set(heights).size, 1, `la colonne « Avant » ne change pas de hauteur (${heights.join(', ')} px)`);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#profileDialog .rv-card')].map(card => getComputedStyle(card).contentVisibility)),
      ['visible', 'visible'], 'les cartes de la relecture sont toujours dessinées');
    assert.equal(await page.locator('#cardsGrid .contact-card').first().evaluate(card => getComputedStyle(card).contentVisibility), 'auto',
      'celles de la grille, non');
  }));

test('au clavier, Tab atteint toutes les cartes, celles que le navigateur différait comprises', { skip, timeout: 120000 }, () =>
  withWidget({ tables: withClones(sampleTables(), 30), user: null }, async ({ page }) => {
    const total = 4 + 30;
    await waitForCards(page, total);
    // Chaque carte a au moins un contrôle au clavier : son établissement est un bouton.
    const everyCard = [...Array(total).keys()];
    await page.locator('.contact-card').first().locator('.etablissement-tag').focus();
    const visited = new Set([0]);
    for (let presses = 0; presses < total * 12 && visited.size < total; presses += 1) {
      await page.keyboard.press('Tab');
      const index = await page.evaluate(() => {
        const card = document.activeElement?.closest('.contact-card');
        return card ? [...document.querySelectorAll('.contact-card')].indexOf(card) : -1;
      });
      if (index === -1) break; // le focus a quitté la grille
      visited.add(index);
    }
    assert.deepEqual([...visited].sort((a, b) => a - b), everyCard, 'le clavier est passé par chaque carte');
    const last = page.locator('.contact-card').last();
    assert.ok(await last.evaluate(card => card.querySelector('.name').checkVisibility({ contentVisibilityAuto: true })),
      'la dernière carte, atteinte au clavier, est dessinée');
  }));
