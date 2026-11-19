// L'annuaire est fermé par défaut (1.45.2 : gate.js, main.js) dans Chromium (optionnel : voir TESTING.md), sur une API Grist simulée. Antoine,
// 19 novembre 2026 : une personne connectée que le widget n'avait pas reconnue voyait l'annuaire, sans « Créer ma fiche ». Une personne que le widget
// n'a pas identifiée (sonde illisible, cadre en lecture seule, identité qui ne vient pas, `BDD` sans colonne `email`, annuaire refusé par Grist) ne
// voit plus que l'écran qui dit pourquoi ; une personne reconnue, avec une fiche, voit l'annuaire. Rien de cela n'a été essayé dans le Grist
// d'Antoine (TESTING.md, section 32).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import { ANONYMOUS_EMAIL } from '../constants.js';
import { ANA_EMAIL, withIdentity, withValidation } from './fixtures.mjs';
import { skip, until, waitForCards, withWidget } from './support/browser.mjs';

// Une personne dont la fiche est dans l'annuaire sans être administrateur ni responsable : seule l'identité la fait entrer (ni `ACL` ni sonde ne l'ouvrent).
const CARLA = 'carla@clinique.example';
const gate = page => page.locator('#gatePanel');
const cards = page => page.locator('#cardsGrid .contact-card');
const waitForGate = (page, kind) => page.locator(`#gatePanel[data-kind="${kind}"]`).waitFor();

// Ce que la personne lit, et rien d'autre : pas de carte, ni recherche ni filtres, ni bandeau, une grille vide dans la page.
async function assertClosed(page, { title }) {
  assert.equal(await gate(page).locator('h2').textContent(), title);
  assert.equal(await gate(page).locator('.gate-action').isHidden(), true, 'aucun bouton : le widget ne sait pas qui est la personne');
  assert.equal(await cards(page).count(), 0);
  assert.equal(await page.locator('#toolbar').isHidden(), true);
  assert.equal(await page.locator('#accountBar').isHidden(), true);
  assert.equal(await page.evaluate(() => document.getElementById('cardsGrid').textContent.trim()), '', 'même cachée, la grille est vide');
}

const consoleLines = async logs => (await Promise.all([...logs.warnings, ...logs.infos])).join('\n');

test('avant que l\'identité soit lue, l\'écran dit « Vérification de votre accès » et aucune carte n\'est dessinée ; elle lue, l\'annuaire s\'ouvre', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, holdReads: true }, async ({ page }) => {
    await waitForGate(page, 'checking');
    await assertClosed(page, { title: 'Vérification de votre accès' });
    assert.equal(await page.locator('#resultCount').textContent(), 'Vérification…');
    assert.equal(await gate(page).getAttribute('aria-busy'), 'true');
    await page.evaluate(() => window.__releaseReads());
    await waitForCards(page, 4);
    assert.equal(await gate(page).isHidden(), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('gated')), false);
  }));

test('une personne connectée dont la sonde est illisible n\'est pas reconnue : « Compte non reconnu », jamais l\'annuaire', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, failTables: ['Annuaire_Sonde'] }, async ({ page, logs }) => {
    await waitForGate(page, 'unidentified');
    await assertClosed(page, { title: 'Compte non reconnu' });
    assert.match(await gate(page).locator('.gate-text').innerText(), /n’a pas pu lire quel est votre compte/);
    assert.equal(await page.locator('#resultCount').textContent(), 'Annuaire réservé');
    const lines = await consoleLines(logs);
    assert.match(lines, /\[IDENTITE\] L'annuaire n'est pas montré à cette personne \(unidentified ; identité : lecture impossible/, 'la console dit pourquoi');
    assert.ok(!lines.includes('@'), 'aucune adresse dans la console');
    assert.deepEqual(await Promise.all(logs.pageErrors), []);
  }));

test('un compte dont le cadre est en lecture seule ne peut pas être vérifié : « Compte en lecture seule », jamais l\'annuaire', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, readOnly: true }, async ({ page }) => {
    await waitForGate(page, 'readonly');
    await assertClosed(page, { title: 'Compte en lecture seule' });
    assert.match(await gate(page).locator('.gate-text').innerText(), /lecture seule pour votre compte/);
  }));

test('une table BDD sans colonne « email » pour ce compte ne laisse retrouver personne : « Vérification impossible », jamais l\'annuaire', { skip }, () => {
  const tables = withIdentity();
  delete tables.BDD.email;
  return withWidget({ tables, user: CARLA }, async ({ page }) => {
    await waitForGate(page, 'noemail');
    await assertClosed(page, { title: 'Vérification impossible' });
    assert.match(await gate(page).locator('.gate-text').innerText(), /n’a pas de colonne « email » lisible pour votre compte/);
  });
});

test('un compte reconnu à qui une règle d\'accès refuse l\'annuaire lit « Annuaire illisible » en plus du bandeau d\'erreur, jamais un écran qui attend', { skip }, () =>
  withWidget({ tables: withIdentity(), user: CARLA, denyReads: ['BDD'] }, async ({ page }) => {
    await waitForGate(page, 'unreadable');
    await assertClosed(page, { title: 'Annuaire illisible' });
    assert.equal(await page.locator('#statusBanner').isHidden(), false, 'le bandeau d\'erreur reste là, avec « Réessayer »');
  }));

test('une panne de lecture (et non un refus) lit « Annuaire momentanément illisible » et « Chargement impossible », avec « Réessayer »', { skip }, () =>
  withWidget({ tables: withIdentity(), user: CARLA, failTables: ['BDD'] }, async ({ page }) => {
    await waitForGate(page, 'loadfailed');
    await assertClosed(page, { title: 'Annuaire momentanément illisible' });
    assert.equal(await page.locator('#resultCount').textContent(), 'Chargement impossible');
    assert.equal(await page.locator('#statusBanner').isHidden(), false, 'le bandeau d\'erreur reste là, avec « Réessayer »');
  }));

test('une identité que Grist ne rend jamais ne laisse pas l\'écran d\'attente pour toujours : « Compte non reconnu », puis l\'annuaire si elle arrive', { skip }, () =>
  withWidget({
    tables: withIdentity(),
    user: ANA_EMAIL,
    holdReads: true,
    // Le délai du widget (IDENTITY_WAIT_MS, 20 s) est ramené à 50 ms dans la page : le test ne l'attend pas.
    initScript: () => {
      const real = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...rest) => real(callback, delay === 20000 ? 50 : delay, ...rest);
    }
  }, async ({ page, logs }) => {
    await waitForGate(page, 'unidentified');
    await assertClosed(page, { title: 'Compte non reconnu' });
    assert.match(await consoleLines(logs), /identité : Grist n'a pas répondu à temps/);
    await page.evaluate(() => window.__releaseReads());
    await waitForCards(page, 4);
    assert.equal(await gate(page).isHidden(), true, 'l\'identité arrivée en retard remplace l\'écran');
  }));

test('une personne reconnue, avec sa fiche validée, voit l\'annuaire et son bandeau', { skip }, () =>
  withWidget({ tables: withValidation(withIdentity()), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await gate(page).isHidden(), true);
    await until(async () => !(await page.locator('#accountBar').isHidden()));
  }));

test('un compte à qui la règle par défaut refuse la liste des tables est quand même reconnu : il voit l\'annuaire (la sonde est essayée directement)', { skip }, () =>
  withWidget({ tables: withIdentity(), user: CARLA, denyListTables: true }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    assert.equal(await gate(page).isHidden(), true);
    await until(async () => !(await page.locator('#accountBar').isHidden()));
    assert.match(await consoleLines(logs), /la liste des tables est illisible pour ce compte/);
  }));

test('un visiteur sans compte ne lit pas l\'annuaire : ni lecture inutile, ni bandeau d\'erreur derrière la fenêtre de connexion', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANONYMOUS_EMAIL, failTables: ['BDD', 'Etablissements'] }, async ({ page, logs }) => {
    await waitForGate(page, 'anonymous');
    await page.locator('#acces[open]').waitFor();
    await page.waitForTimeout(500); // laisse passer une lecture éventuelle
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.equal(await cards(page).count(), 0);
    assert.equal(await page.locator('#resultCount').textContent(), 'Connexion requise');
  }));
