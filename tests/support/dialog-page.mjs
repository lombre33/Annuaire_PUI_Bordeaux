// Ce que les tests navigateur des fenêtres de modification (tests/e2e-profile.test.mjs, e2e-avatar.test.mjs,
// e2e-etablissement.test.mjs) lisent chacun de la même façon : les repères d'une fenêtre que le widget ouvre
// (#profileDialog, #etabDialog) et les contrôles d'accessibilité et de mise en page qui valent pour toutes. Les fonctions
// reçoivent la `page` du harnais (tests/support/browser.mjs).

import assert from 'node:assert/strict';

// Les repères de la fenêtre dont le <dialog> a pour identifiant `id` et le titre `titleId`.
export function dialogPage(id, titleId) {
  const dialog = page => page.locator(`#${id}`);
  const alert = page => dialog(page).locator('.dlg-alert [role="alert"]');
  const press = (page, name) => dialog(page).getByRole('button', { name, exact: true });
  return {
    dialog,
    press,
    alert,
    alertText: page => alert(page).textContent(),
    heading: page => page.locator(`#${titleId}`),
    headingIs: (page, expected) => page.waitForFunction(([wanted, value]) => document.getElementById(wanted).textContent === value, [titleId, expected]),
    summary: page => dialog(page).locator('.dlg-summary').textContent(),
    notices: page => dialog(page).locator('.notice'),
    isOpen: page => page.evaluate(wanted => document.getElementById(wanted).open, id),
    // « Fermée » veut dire aussi que l'événement « close » est passé : Chromium l'envoie à l'image suivante, pas dans la tâche
    // qui ferme la fenêtre, et c'est lui qui la vide. Un test rapide qui la rouvre ou la compte aussitôt la verrait vidée par
    // cet événement en retard.
    closed: page => page.waitForFunction(wanted => {
      const element = document.getElementById(wanted);
      return !element.open && element.querySelector('.dlg-body').childElementCount === 0;
    }, id)
  };
}

// La fenêtre « Modifier la fiche » (#profileDialog), que lisent e2e-profile et e2e-avatar : en plus de ses repères, les colonnes
// de la relecture et le passage à la relecture.
export function profileDialogPage() {
  const base = dialogPage('profileDialog', 'profileTitle');
  return {
    ...base,
    // Les colonnes de la relecture : « Avant » (`before`) et « Après » (`after`).
    column: (page, tone) => base.dialog(page).locator(`.rv-col-${tone}`),
    async review(page) {
      await base.press(page, 'Relire mes modifications').click();
      await base.headingIs(page, 'Relire avant de valider');
    }
  };
}

// Tabulation : le focus ne se pose jamais sur un contrôle de la page derrière (elle est inerte) ; au bout de la fenêtre il sort
// vers le navigateur, c'est-à-dire sur <body>.
export async function assertTabStaysInDialog(page, id, steps) {
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(wanted => {
      const active = document.activeElement;
      return document.getElementById(wanted).contains(active) ? 'fenêtre' : active === document.body ? 'body' : active.outerHTML.slice(0, 60);
    }, id);
    assert.ok(['fenêtre', 'body'].includes(where), `le focus est tombé sur ${where} à la tabulation ${step + 1}`);
  }
}

// Les contrôles de la fenêtre `dialog` (un locator) qui n'ont ni étiquette, ni aria-label, ni texte : la liste doit être vide.
export const unnamedControls = dialog => dialog.locator('input, select, button').evaluateAll(controls => controls
  .filter(control => !(control.labels?.length || control.getAttribute('aria-label') || control.textContent.trim()))
  .map(control => control.outerHTML.slice(0, 80)));

// Ce que mesure dialogFit() quand tout tient : la fenêtre est dans l'écran, rien ne défile de côté, rien ne sort d'elle.
export const FITS = { inside: true, bodyOverflow: 0, pageOverflow: 0, outside: [] };

// La fenêtre `selector` tient-elle dans le cadre ? `inside` : elle ne sort pas de l'écran ; `bodyOverflow` : son corps ne défile pas
// de côté (0 sans corps, comme la fenêtre d'agrandissement d'une photo) ; `pageOverflow` : la page non plus ; `outside` : les
// éléments qui sortent d'elle (boutons du pied compris), sans les textes réservés aux lecteurs d'écran.
export const dialogFit = (page, selector) => page.evaluate(wanted => {
  const dialog = document.querySelector(wanted);
  const box = dialog.getBoundingClientRect();
  const body = dialog.querySelector('.dlg-body');
  const outside = [...dialog.querySelectorAll('*')].filter(node => {
    const at = node.getBoundingClientRect();
    return at.width > 0 && !node.closest('.sr-only') && (at.right > box.right + 0.5 || at.left < box.left - 0.5);
  }).map(node => `${node.tagName}.${String(node.className).slice(0, 30)}`);
  return {
    inside: box.left >= 0 && box.right <= window.innerWidth + 0.5 && box.bottom <= window.innerHeight + 0.5,
    bodyOverflow: body ? body.scrollWidth - body.clientWidth : 0,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    outside
  };
}, selector);

// Les éléments d'une carte (un locator) qui sortent de son cadre : la liste doit être vide.
export const spillOf = card => card.evaluate(element => {
  const frame = element.getBoundingClientRect();
  return [...element.querySelectorAll('*')].filter(node => {
    const at = node.getBoundingClientRect();
    return at.width > 0 && (at.right > frame.right + 0.5 || at.left < frame.left - 0.5);
  }).map(node => node.className || node.tagName);
});
