// Outils communs des tests navigateur (tests/e2e*.test.mjs) : le harnais de tests/support/harness.mjs (un serveur statique pour
// le vrai index.html, Chromium (Playwright) et l'API Grist simulée qui sert les données de tests/fixtures.mjs) et les attentes que
// ces tests partagent. Chaque fichier de test importe ce module : il lance son propre navigateur.
//
// Optionnel : nécessite Playwright (npm install --no-save playwright puis
// npx playwright install chromium). Sans lui ces tests sont ignorés et
// `node --test` reste vert. CHROMIUM_PATH désigne un Chromium déjà installé.

import assert from 'node:assert/strict';
import { assertNoCspViolation, createHarness, layoutSettled } from './harness.mjs';

// openWidget(options), assertNoCspViolation(widget), layoutSettled(page) : voir tests/support/harness.mjs.
export { assertNoCspViolation, layoutSettled };
export const { skip, openWidget, withWidget } = await createHarness();

// Rejoue un onRecords (comme une édition dans Grist) et attend la fin du debounce.
export async function reload(page) {
  await page.evaluate(() => window.__triggerRecords());
}

// Change la fonction d'une personne « dans Grist » (ligne `row` de BDD), rejoue onRecords et attend que sa carte la montre : l'annuaire
// a bien été relu.
export async function changeFonction(page, { row, name, fonction }) {
  await page.evaluate(([index, value]) => { window.__tables.BDD.Fonction[index] = value; }, [row, fonction]);
  await reload(page);
  await until(async () => (await gridCard(page, name).locator('.fonction').textContent()) === fonction,
    `l'annuaire n'a pas été relu : la carte de ${name} garde son ancienne fonction`);
}

// Attend qu'une condition (asynchrone) devienne vraie, 5 s au plus ; sinon le test échoue avec `message`.
export async function until(condition, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(message);
}

// Le focus revient à l'élément voulu (sélecteur CSS) : l'événement « close » d'une fenêtre qui le rend est envoyé après qu'elle a
// cessé d'être ouverte, d'où l'attente.
export const focusReturnsTo = (page, selector) => page.waitForFunction(
  wanted => document.activeElement?.matches(wanted), selector, { timeout: 3000 }
);

export const cardCount = page => page.locator('.contact-card').count();
export const waitForCards = (page, count) =>
  page.waitForFunction(expected => document.querySelectorAll('.contact-card').length === expected, count);
export const waitForBanner = (page, visible = true) =>
  page.waitForFunction(expected => !document.getElementById('statusBanner').hidden === expected, visible);
export const cardNames = page => page.locator('.contact-card .name').allTextContents();
export const resultCount = page => page.locator('#resultCount').textContent();
export const bannerText = page => page.locator('#statusBanner').textContent();
export const toast = page => page.locator('#toast');
// La carte d'une personne dans la grille de l'annuaire (le nom suffit à la trouver).
export const gridCard = (page, name) => page.locator('#cardsGrid .contact-card').filter({ has: page.locator('.name', { hasText: name }) });
// Ouvre sa propre fiche par le bouton du bandeau « Ma présence » (`cards` : les cartes que l'annuaire montre d'abord).
export async function openOwn(page, cards = 4) {
  await waitForCards(page, cards);
  const button = page.locator('#accountBar .account-edit');
  await button.waitFor();
  await button.click();
  await page.locator('#profileDialog').waitFor();
}
// Les boutons « Modifier » apparaissent quand l'identité est lue : on les attend.
export const waitForEditButtons = (page, count) => page.waitForFunction(
  expected => document.querySelectorAll('#cardsGrid .card-actions:not([hidden]) .card-edit').length === expected, count
);

// Le widget a lu l'identité de la personne connectée : sa sonde (la ligne qu'il ajoute à la table Annuaire_Sonde) s'est retirée.
export const probeRemoved = page => page.waitForFunction(
  () => window.__fake.calls.some(call => call.table === 'Annuaire_Sonde' && call.action === 'RemoveRecord')
);

// Ce que le faux Grist a reçu : les actions envoyées pour BDD (écrites ou refusées), une cellule de BDD telle qu'elle est maintenant,
// les demandes de jeton d'accès.
export const bddCalls = page => page.evaluate(() => window.__fake.calls.filter(call => call.table === 'BDD'));
export const bddCell = (page, column, index = 0) => page.evaluate(([name, at]) => window.__tables.BDD[name][at], [column, index]);
export const tokenRequests = page => page.evaluate(() => window.__fake.tokenRequests);

// Ni le jeton d'accès ni l'adresse du document ne s'écrivent dans la console de la page (`logs` : ceux du harnais).
export async function assertNoSecretLogged(logs, label) {
  const logged = (await Promise.all([...logs.warnings, ...logs.errors])).join('\n');
  assert.ok(!logged.includes('fake-token'), `${label} : le jeton n'est jamais écrit dans la console`);
  assert.ok(!logged.includes('docs.getgrist.com/api/docs/fake-doc'), `${label} : ni l'adresse du document`);
}

// Le pied d'une fenêtre (`.dlg-foot`) : le résumé n'impose aucune largeur, il partage la ligne des
// boutons dès que son texte et les boutons tiennent ensemble (comme sur la maquette), et passe au-dessus
// sinon. On mesure la largeur naturelle du texte et des boutons avec la police du poste, puis on règle
// la largeur de l'écran juste au-dessus (tout tient : une seule ligne) et juste en dessous (deux lignes) :
// le contrôle ne dépend donc pas de la police. `selector` : la fenêtre (« #etabDialog »).
export async function assertFooterWraps(page, selector, { height = 844 } = {}) {
  const natural = await page.evaluate(dialog => {
    const foot = document.querySelector(`${dialog} .dlg-foot`);
    const range = document.createRange();
    range.selectNodeContents(foot.querySelector('.dlg-summary'));
    const style = getComputedStyle(foot);
    return {
      text: range.getBoundingClientRect().width,
      actions: foot.querySelector('.dlg-actions').getBoundingClientRect().width,
      gap: parseFloat(style.columnGap) || 0,
      padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    };
  }, selector);
  const together = Math.ceil(natural.padding + natural.text + natural.gap + natural.actions);
  assert.ok(together + 2 <= 560, `${selector} : le résumé et les boutons (${together} px) tiennent dans une fenêtre pleine largeur`);
  const rows = async width => {
    await page.setViewportSize({ width, height });
    return page.evaluate(dialog => {
      const foot = document.querySelector(`${dialog} .dlg-foot`);
      const summary = foot.querySelector('.dlg-summary').getBoundingClientRect();
      const actions = foot.querySelector('.dlg-actions').getBoundingClientRect();
      return { summaryMiddle: summary.top + summary.height / 2, summaryBottom: summary.bottom, actionsTop: actions.top, actionsBottom: actions.bottom };
    }, selector);
  };

  const fits = await rows(Math.max(320, together + 2));
  assert.ok(fits.summaryMiddle >= fits.actionsTop && fits.summaryMiddle <= fits.actionsBottom,
    `${selector} : à ${together + 2} px, le résumé est sur la ligne des boutons`);
  if (together - 30 >= 320) {
    const wraps = await rows(together - 30);
    assert.ok(wraps.summaryBottom <= wraps.actionsTop + 1, `${selector} : à ${together - 30} px, le résumé passe au-dessus des boutons`);
  }
}
