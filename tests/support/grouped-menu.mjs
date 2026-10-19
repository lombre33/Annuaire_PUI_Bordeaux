// Les aides des tests navigateur pour un menu de filtre rangé par groupe : les compétences
// par domaine, les tâches par action. Un « groupe » est un domaine ou une action (une case,
// un nombre de cartes, un bouton de dépli) ; un « élément » est une valeur de son détail (une
// compétence, une tâche). Sans effet de bord : ce module ne lance pas de navigateur.

import assert from 'node:assert/strict';

// { libellé → nombre de cartes } des éléments d'un menu, d'un groupe (`filter` est un locator).
export const optionCounts = filter => filter.locator('.filter-option').evaluateAll(options =>
  Object.fromEntries(options.map(option => [option.querySelector('.option-label').textContent,
    option.querySelector('.option-count').textContent])));

// Le menu se parcourt au clavier, sans souris : Entrée l'ouvre, Tab va à la recherche puis à la case du groupe `group` (Espace la
// coche : il reste `cardsAfterTick` cartes), au bouton de dépli (Entrée le déplie et l'annonce), puis à la première valeur du détail,
// `firstItem`, que la case du groupe a cochée. `menu` : groupedMenu(clé du filtre).
export async function assertKeyboardWalk(page, menu, { group, cardsAfterTick, firstItem }) {
  const active = read => page.evaluate(read);
  await menu.filter(page).locator('.filter-button').focus();
  await page.keyboard.press('Enter'); // ouvre le menu
  await page.keyboard.press('Tab');
  assert.equal(await active(() => document.activeElement.className), 'filter-search-input');
  await page.keyboard.press('Tab');
  assert.equal(await active(() => document.activeElement.closest('.filter-group')?.dataset.value), group);
  await page.keyboard.press('Space'); // la case du groupe
  await page.waitForFunction(expected => document.querySelectorAll('.contact-card').length === expected, cardsAfterTick);
  await page.keyboard.press('Tab');
  assert.equal(await active(() => document.activeElement.className), 'group-toggle', 'puis le bouton de dépli');
  await page.keyboard.press('Enter');
  assert.equal(await active(() => document.activeElement.getAttribute('aria-expanded')), 'true');
  assert.equal(await active(() => document.activeElement.getAttribute('aria-label')), `Détail de ${group}`);
  await page.keyboard.press('Tab');
  assert.equal(await active(() => document.activeElement.closest('.filter-option')?.dataset.value), firstItem, 'les valeurs dépliées suivent');
  assert.equal(await active(() => document.activeElement.checked), true);
}

// `key` : la clé du filtre (data-filter-key) dont on veut les aides.
export function groupedMenu(key) {
  const filter = page => page.locator(`.filter[data-filter-key="${key}"]`);
  const group = (page, label) => filter(page).locator(`.filter-group[data-value="${label}"]`);
  return {
    filter,
    group,
    box: (page, label) => group(page, label).locator('.group-option input'),
    toggle: (page, label) => group(page, label).locator('.group-toggle'),
    item: (page, label) => filter(page).locator('.filter-option', { hasText: label }),
    open: page => filter(page).locator('.filter-button').click(),
    search: page => filter(page).locator('.filter-search-input'),
    badge: page => filter(page).locator('.filter-count'),
    groupCounts: page => filter(page).locator('.group-head').evaluateAll(heads =>
      Object.fromEntries(heads.map(head => [head.querySelector('.option-label').textContent,
        head.querySelector('.option-count').textContent]))),
    groupNames: page => filter(page).locator('.group-head .option-label').allTextContents(),
    visibleGroups: page => filter(page).locator('.filter-group').evaluateAll(groups =>
      groups.filter(group => !group.hidden).map(group => group.dataset.value)),
    visibleItems: page => filter(page).locator('.filter-option').evaluateAll(options =>
      options.filter(option => option.getClientRects().length > 0).map(option => option.dataset.value))
  };
}
