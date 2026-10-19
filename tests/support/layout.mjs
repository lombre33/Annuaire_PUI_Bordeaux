// Outils communs des tests de mise en page (tests/responsive.test.mjs, tests/branding-layout.test.mjs) : le harnais des tests
// navigateur (tests/support/harness.mjs), mais avec les barres de défilement que Playwright masque d'ordinaire (dans Grist elles
// retirent 15 px à la largeur utile : c'est le cas le plus serré), un cadre dont on choisit la largeur, et les mesures que les
// deux fichiers prennent sur les cartes.
//
// Optionnel, comme tests/support/browser.mjs : nécessite Playwright (voir TESTING.md). Sans lui les scénarios navigateur sont
// ignorés et `node --test` reste vert.

import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';

const harness = await createHarness({ keepScrollbars: true });
export const { skip } = harness;

// Largeurs de cadre testées : un téléphone étroit, les largeurs courantes, et de part et d'autre de chaque seuil de style.css.
export const WIDTHS = [320, 360, 414, 599, 600, 768, 839, 840, 1024, 1279, 1280, 1399, 1400, 1480, 1920];
export const HEIGHT = 900;

// `defaults` : { tables, ready } ; `tables()` donne le jeu de données de départ, `ready(page, options)` attend que la page soit
// prête (les cartes sont là). Renvoie { openWidget, withWidget } : le cadre fait `width` px de large, avec un écran tactile
// (pointer: coarse, ce qui déclenche les règles « doigt ») si `touch`. Les autres options sont celles de
// tests/support/harness.mjs ; `withWidget(options, run)` vérifie en plus que la page n'a levé aucune exception.
export function layoutWidgets({ tables: defaultTables, ready }) {
  async function openWidget({ width = 1480, touch = false, tables = defaultTables(), ...options } = {}) {
    const widget = await harness.openWidget({
      ...options,
      tables,
      contextOptions: { viewport: { width, height: HEIGHT }, ...(touch ? { hasTouch: true, isMobile: true } : {}) }
    });
    await ready(widget.page, options);
    return widget;
  }

  async function withWidget(options, run) {
    const widget = await openWidget(options);
    try {
      await run(widget);
      assert.deepEqual(widget.logs.pageErrors, [], 'aucune erreur JavaScript dans la page');
    } finally {
      await widget.context.close();
    }
  }

  return { openWidget, withWidget };
}

// Redimensionne le cadre, comme quand on élargit ou resserre le panneau dans Grist.
export const resize = (page, width) => page.setViewportSize({ width, height: HEIGHT });

// Pour chaque largeur de la liste, le même contrôle sur la même page : une erreur nomme la largeur fautive.
export async function atEachWidth(page, widths, check) {
  for (const width of widths) {
    await resize(page, width);
    await check(width);
  }
}

// Rien ne dépasse du cadre, ni sur le côté de la page ni en dehors d'elle.
export async function assertNoHorizontalOverflow(page, width) {
  const { client, scroll, outside } = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const outside = [...document.querySelectorAll('body *')]
      .filter(element => element.getClientRects().length > 0)
      .filter(element => {
        const { left, right } = element.getBoundingClientRect();
        return right > client + 0.5 || left < -0.5;
      })
      .map(element => `${element.tagName.toLowerCase()}.${element.className}`);
    return { client, scroll: document.documentElement.scrollWidth, outside: outside.slice(0, 5) };
  });
  assert.ok(scroll <= client, `à ${width}px, la page déborde de ${scroll - client}px`);
  assert.deepEqual(outside, [], `à ${width}px, des éléments sortent du cadre`);
}

// ===== Les cartes =====

// Pour chaque carte, ce que les deux fichiers de mise en page contrôlent : le nom ne passe pas sous le badge de l'établissement
// (la pastille, ou son logo : alors la fonction non plus), il tient sur deux lignes au plus et, avec `logo`, l'image du logo reste
// dans son cadre. Renvoie { checked, withLogo, overlapping, tooTall, outside } : les cartes qui ont un badge, celles qui ont un
// logo, et les noms fautifs.
export const measureNamesAgainstBadges = (page, { logo = false } = {}) => page.evaluate(wantsLogo => {
  let checked = 0;
  let withLogo = 0;
  const overlapping = [];
  const tooTall = [];
  const outside = [];
  document.querySelectorAll('.contact-card').forEach(card => {
    const nameElement = card.querySelector('.name');
    const name = nameElement.getBoundingClientRect();
    // Deux lignes font au plus 2,7 fois le corps du texte ; trois lignes, plus de 3,3 fois.
    if (name.height > 2.7 * parseFloat(getComputedStyle(nameElement).fontSize)) tooTall.push(nameElement.textContent);
    const badge = card.querySelector('.etablissement-tag.visible');
    if (!badge) return;
    checked++;
    if (badge.classList.contains('has-logo')) withLogo++;
    const box = badge.getBoundingClientRect();
    if (name.right > box.left + 0.5) overlapping.push(nameElement.textContent);
    if (!wantsLogo) return;
    // La fonction, elle, ne passe pas sous le logo non plus.
    const role = card.querySelector('.fonction');
    if (role.getClientRects().length > 0 && role.getBoundingClientRect().right > box.left + 0.5
        && role.getBoundingClientRect().top < box.bottom - 0.5) overlapping.push(role.textContent);
    const image = badge.querySelector('img')?.getBoundingClientRect();
    if (image && (image.left < box.left - 0.5 || image.right > box.right + 0.5 || image.top < box.top - 0.5 || image.bottom > box.bottom + 0.5)) {
      outside.push(nameElement.textContent);
    }
  });
  return { checked, withLogo, overlapping, tooTall, outside };
}, logo);

// Où est le badge de l'établissement dans le coin de la première carte (sans fonction) et le nom, avec la fonction de la deuxième
// (sur une ligne), face à l'avatar. Avec `logo`, où est aussi l'image du logo dans le cadre du badge.
export const cardGeometry = (page, { logo = false } = {}) => page.evaluate(wantsLogo => {
  const cards = [...document.querySelectorAll('.contact-card')];
  const centerY = element => {
    const { top, bottom } = element.getBoundingClientRect();
    return (top + bottom) / 2;
  };
  const first = cards[0];
  const second = cards[1];
  const box = first.getBoundingClientRect();
  const badge = first.querySelector('.etablissement-tag.visible').getBoundingClientRect();
  const nameAndFunction = card => {
    const name = card.querySelector('.name').getBoundingClientRect();
    const role = card.querySelector('.fonction').getBoundingClientRect();
    return (name.top + role.bottom) / 2 - centerY(card.querySelector('.avatar'));
  };
  const geometry = {
    columns: new Set(cards.map(card => Math.round(card.getBoundingClientRect().left))).size,
    badgeFromRight: box.right - badge.right,
    badgeFromTop: badge.top - box.top,
    nameVsAvatar: centerY(first.querySelector('.name')) - centerY(first.querySelector('.avatar')),
    nameAndFunctionVsAvatar: nameAndFunction(second)
  };
  if (wantsLogo) {
    const image = first.querySelector('.etablissement-tag img').getBoundingClientRect();
    geometry.imageFromBadgeRight = badge.right - image.right;
    geometry.image = { width: image.width, height: image.height };
  }
  return geometry;
}, logo);

// Le badge est dans le coin haut droit de la carte. `thing` : « badge » (la pastille) ou « logo ».
export function assertBadgeInCorner(card, thing) {
  assert.ok(card.badgeFromRight >= 9 && card.badgeFromRight <= 13, `${thing} à ${card.badgeFromRight}px du bord droit`);
  assert.ok(card.badgeFromTop >= 12 && card.badgeFromTop <= 16, `${thing} à ${card.badgeFromTop}px du haut`);
}

// Le nom et la fonction sont en face de l'avatar ; le nom seul aussi (`alone`) quand la première carte n'a pas de fonction.
export function assertNameBesideAvatar(card, { alone = true } = {}) {
  if (alone) assert.ok(Math.abs(card.nameVsAvatar) <= 2, `nom décalé de ${card.nameVsAvatar}px par rapport à l'avatar`);
  assert.ok(Math.abs(card.nameAndFunctionVsAvatar) <= 3, `nom et fonction décalés de ${card.nameAndFunctionVsAvatar}px par rapport à l'avatar`);
}
