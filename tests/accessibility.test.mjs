// Accessibilité du widget : noms accessibles, anneau de focus au clavier et contrastes
// (WCAG 2.2 AA). Les mesures viennent de l'audit UI/UX (constats U08, U13, U14, U19, U20 et U47 à U49) ;
// chaque test ci-dessous échoue sur le code d'avant leur correction.
//
// Les tests de contraste et de feuille de style ne demandent aucun navigateur ; les
// autres chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../constants.js';
import { sampleTables, withIdentity, ANA_EMAIL, IRIS_EMAIL } from './fixtures.mjs';
import { skip, waitForCards, withWidget } from './support/browser.mjs';
import { parseColor, blend, contrastRatio, WHITE } from './support/contrast.mjs';
import { measureCards } from './support/card-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readCss = name => fs.readFileSync(path.join(ROOT, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ===== Contrastes (sans navigateur) =====

test('contrastRatio : valeurs de référence de la norme WCAG', () => {
  assert.equal(contrastRatio('#000', '#fff').toFixed(2), '21.00');
  assert.equal(contrastRatio('#fff', '#fff').toFixed(2), '1.00');
  // Le violet du widget sur blanc : 5,4:1 (calcul à la main : (1,05)/(0,1442+0,05)).
  assert.equal(contrastRatio('#6257d9', '#fff').toFixed(1), '5.4');
  // Une couleur translucide se pose d'abord sur son fond : 50 % de noir sur blanc = gris 127,5 → 3,98:1.
  assert.equal(contrastRatio('rgba(0, 0, 0, 0.5)', '#fff').toFixed(2), '3.98');
  assert.deepEqual(parseColor('rgb(98, 87, 217)'), [98, 87, 217, 1]);
  assert.deepEqual(parseColor('rgba(98 87 217 / 0.5)'), [98, 87, 217, 0.5]);
  assert.deepEqual(parseColor('#fff'), [255, 255, 255, 1]);
});

// ===== Feuilles de style (sans navigateur) =====

// Un `outline: 0` ou `outline: none` retire l'anneau de focus du navigateur : permis seulement
// là où un autre élément porte l'anneau, ou là où le focus n'est pas sur un contrôle.
const OUTLINE_REMOVED_ALLOWED = {
  // Le champ de recherche n'a pas de bordure : l'anneau est dessiné autour du cadre entier.
  '.search-box input': '.search-box:focus-within',
  // Le titre de la fenêtre reçoit le focus pour être annoncé : ce n'est pas un contrôle.
  '.dlg-head h2:focus': null
};

function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.replace(/\s+/g, ' ').trim(),
    body
  }));
}

test('aucune règle ne supprime l’anneau de focus sans le remplacer (WCAG 2.4.7)', () => {
  const rules = ['style.css', 'dialogs.css'].flatMap(name => cssRules(readCss(name)));
  const removed = rules.filter(({ body }) => /(^|[;\s])outline(-style)?\s*:\s*(0|none)\b/.test(body)).map(rule => rule.selector);
  const unexpected = removed.filter(selector => !(selector in OUTLINE_REMOVED_ALLOWED));
  assert.deepEqual(unexpected, [], 'ces règles retirent l’anneau de focus : en poser un autre, ou les déclarer ici avec leur raison');
  for (const [selector, replacement] of Object.entries(OUTLINE_REMOVED_ALLOWED)) {
    if (!replacement) continue;
    const rule = rules.find(candidate => candidate.selector === replacement);
    assert.ok(rule && /outline:\s*2px solid/.test(rule.body), `${selector} : la règle de remplacement ${replacement} manque`);
  }
});

// ===== Couleurs de catégorie et lien e-mail (sans navigateur) =====

// Texte courant : 4,5:1 au moins, quelle que soit sa taille (WCAG 1.4.3) ; les pastilles sont à
// 8,5 px. Avant leur correction (audit U19), les cinq couleurs de catégorie les plus claires
// faisaient de 2,16:1 (Tâches) à 3,56:1 (Communautés), et le lien e-mail 3,30:1.
const MIN_TEXT_CONTRAST = 4.5;

test('chaque couleur de catégorie garde 4,5:1 avec le blanc : pastille à texte blanc, titre de groupe sur fond blanc (WCAG 1.4.3)', () => {
  const tooPale = Object.entries(CATEGORIES)
    .map(([key, { color }]) => ({ key, color, ratio: contrastRatio(color, WHITE) }))
    .filter(({ ratio }) => ratio < MIN_TEXT_CONTRAST)
    .map(({ key, color, ratio }) => `${key} ${color} : ${ratio.toFixed(2)}:1`);
  assert.deepEqual(tooPale, [], 'couleurs à foncer à teinte constante (constants.js) pour atteindre 4,5:1');
});

test('le lien e-mail d’une carte garde 4,5:1 sur le fond blanc de la carte (WCAG 1.4.3)', () => {
  const css = readCss('style.css');
  const rule = cssRules(css).find(candidate => candidate.selector === '.email');
  const variable = /(?:^|[;\s])color:\s*var\((--[\w-]+)\)/.exec(rule?.body ?? '')?.[1];
  assert.ok(variable, 'la couleur de `.email` vient d’une variable de :root');
  const color = new RegExp(`${variable}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(css)?.[1];
  assert.ok(color, `${variable} est déclarée en hexadécimal dans :root`);
  const ratio = contrastRatio(color, WHITE);
  assert.ok(ratio >= MIN_TEXT_CONTRAST, `${variable} ${color} : ${ratio.toFixed(2)}:1 au lieu de 4,5:1`);
});

// ===== Interrupteur de présence (sans navigateur) =====

// L'état de l'interrupteur « Apparaître dans l'annuaire » ne tient qu'à sa piste et à son curseur (le
// texte du bouton ne change pas) : 3:1 au moins avec leur fond (WCAG 1.4.11). Avant leur correction
// (audit U48), la piste éteinte faisait 1,56:1 avec le fond du bouton et son curseur 1,66:1, la piste
// allumée 2,75:1 et son curseur 2,92:1.
const MIN_INTERFACE_CONTRAST = 3;

// Le fond en hexadécimal que style.css donne à `selector` (la première règle qui en pose un, donc
// pas celle du mode contraste forcé, qui vient après et n'emploie que des couleurs système).
function cssBackground(selector) {
  const rule = cssRules(readCss('style.css')).find(candidate => candidate.selector === selector
    && /(?:^|[;\s])background(?:-color)?:\s*#/.test(candidate.body));
  const value = /(?:^|[;\s])background(?:-color)?:\s*(#[0-9a-f]{3,8})\b/i.exec(rule?.body ?? '')?.[1];
  assert.ok(value, `${selector} : un fond en hexadécimal dans style.css`);
  return value;
}

test('la piste et le curseur de l’interrupteur de présence gardent 3:1 avec leur fond, éteint et allumé (WCAG 1.4.11)', () => {
  const button = cssBackground('.presence-switch');
  const thumb = cssBackground('.presence-thumb');
  const offTrack = cssBackground('.presence-track');
  const onTrack = cssBackground('.presence-switch[aria-checked="true"] .presence-track');
  const tooWeak = Object.entries({
    'piste éteinte sur le bouton': [offTrack, button],
    'curseur sur la piste éteinte': [thumb, offTrack],
    'piste allumée sur le bouton': [onTrack, button],
    'curseur sur la piste allumée': [thumb, onTrack]
  })
    .map(([label, [foreground, background]]) => ({ label, ratio: contrastRatio(foreground, background) }))
    .filter(({ ratio }) => ratio < MIN_INTERFACE_CONTRAST)
    .map(({ label, ratio }) => `${label} : ${ratio.toFixed(2)}:1`);
  assert.deepEqual(tooWeak, [], 'foncer la piste (style.css) pour atteindre 3:1');
});

// ===== Navigateur =====

// Les contrôles qui ont un rôle à nom obligatoire (4.1.2) dans l'arbre d'accessibilité.
const NAMED_ROLES = 'button|link|checkbox|switch|radio|searchbox|textbox|combobox|spinbutton|slider|menuitem|tab|option';

// Lignes de l'instantané d'accessibilité (`- searchbox "Nom" [états]`) sans nom entre guillemets.
function unnamedControls(snapshot) {
  return snapshot.split('\n')
    .map(line => new RegExp(`^\\s*- (${NAMED_ROLES})\\b(.*)$`).exec(line))
    .filter(match => match && !match[2].startsWith(' "'))
    .map(match => match[0].trim());
}

test('le champ de recherche a un nom accessible qui reprend son libellé visible (WCAG 4.1.2, 2.5.3)', { skip }, async () => {
  await withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const box = page.getByRole('searchbox');
    assert.equal(await box.count(), 1);
    const placeholder = await box.getAttribute('placeholder');
    const name = 'Rechercher par nom ou prénom';
    assert.equal(await page.getByRole('searchbox', { name, exact: true }).count(), 1, 'le champ est nommé par son rôle');
    // Le texte visible (l'invite, sans ses points de suspension) doit faire partie du nom.
    assert.ok(name.includes(placeholder.replace(/…$/, '').trim()), 'le nom contient le texte affiché dans le champ');
  });
});

test('aucun contrôle de la page n’est sans nom accessible, menu fermé ou ouvert (WCAG 4.1.2)', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(unnamedControls(await page.locator('body').ariaSnapshot()), [], 'page au repos');
    // Un menu ouvert montre sa recherche, ses cases et le détail d'un domaine.
    await page.locator('.filter-button', { hasText: 'Compétences' }).click();
    await page.locator('.filter.open .group-toggle').first().click();
    const snapshot = await page.locator('body').ariaSnapshot();
    assert.ok(snapshot.includes('textbox "Rechercher dans Compétences"'), 'la recherche du menu est nommée');
    assert.deepEqual(unnamedControls(snapshot), [], 'menu ouvert');
  });
});

// Les arrêts de tabulation, dans l'ordre : l'élément, son rectangle dans la page, le style de son
// anneau (celui du cadre pour le champ de recherche, qui n'a pas de bordure) et une capture de
// son voisinage avec le focus. La fenêtre est assez haute pour que la page ne défile pas : les
// coordonnées d'écran sont celles de la page. `from` : le sélecteur d'où partir (par défaut,
// le début de la page). Le curseur de saisie, qui clignote, est rendu transparent : sans cela
// il suffirait à différencier deux captures d'un champ sans anneau.
const MARGIN = 16;
async function tabStops(page, { limit = 80, from = null } = {}) {
  await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.__tabSeen = new WeakSet();
  });
  if (from) await page.locator(from).focus();
  const stops = [];
  for (let n = 0; n < limit; n += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(margin => {
      const element = document.activeElement;
      if (!element || element === document.body || window.__tabSeen.has(element)) return null;
      window.__tabSeen.add(element);
      const owner = element.matches('.search-box input') ? element.closest('.search-box') : element;
      const style = getComputedStyle(owner);
      const rect = owner.getBoundingClientRect();
      const x = Math.max(0, Math.floor(rect.left) - margin);
      const y = Math.max(0, Math.floor(rect.top) - margin);
      return {
        label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 40) || element.id || element.tagName,
        inMenu: Boolean(element.closest('.filter-menu')),
        ring: { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor },
        clip: { x, y, width: Math.ceil(rect.right) + margin - x, height: Math.ceil(rect.bottom) + margin - y }
      };
    }, MARGIN);
    if (!stop) break;
    stops.push({ ...stop, focused: await page.screenshot({ clip: stop.clip }) });
  }
  // Le même voisinage sans le focus : la différence est l'indicateur de focus.
  await page.evaluate(() => document.activeElement?.blur());
  for (const stop of stops) stop.rest = await page.screenshot({ clip: stop.clip });
  return stops;
}

function assertFocusRings(stops, expectedLabels) {
  for (const label of expectedLabels) {
    assert.ok(stops.some(stop => stop.label.includes(label)), `« ${label} » doit être atteint à la tabulation`);
  }
  for (const stop of stops) {
    assert.ok(!stop.focused.equals(stop.rest), `${stop.label} : rien n’indique le focus à l’écran`);
    assert.equal(stop.ring.style, 'solid', `${stop.label} : anneau plein`);
    assert.ok(stop.ring.width >= 2, `${stop.label} : anneau d’au moins 2 px (${stop.ring.width} px)`);
    // 3:1 au moins contre le fond le plus sombre où il se pose (le dégradé violet pâle de la page).
    const ratio = contrastRatio(parseColor(stop.ring.color), '#ebe9ff');
    assert.ok(ratio >= 3, `${stop.label} : anneau de contraste ${ratio.toFixed(2)}:1 au lieu de 3:1`);
  }
}

test('chaque contrôle atteint à la tabulation a un anneau de focus visible et homogène (WCAG 2.4.7, 1.4.11)', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2400 });
    await waitForCards(page, 4);
    const stops = await tabStops(page);
    assert.ok(stops.length >= 15, `au moins 15 arrêts de tabulation (${stops.length})`);
    assertFocusRings(stops, ['Rechercher par nom ou prénom', 'Actions', 'Fondateurs', 'Réinitialiser', 'CME', 'Modifier mon profil']);
  });
});

test('le menu ouvert a aussi un anneau de focus visible : recherche, cases et flèches de détail', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 2400 });
    await waitForCards(page, 4);
    await page.locator('.filter-button', { hasText: 'Compétences' }).click();
    await page.locator('.filter.open .group-toggle').first().click();
    const stops = (await tabStops(page, { limit: 12, from: '.filter.open .filter-button' })).filter(stop => stop.inMenu);
    assert.ok(stops.length >= 5, `la recherche, des cases de domaine et de compétence, des flèches (${stops.length})`);
    assertFocusRings(stops, ['Rechercher dans Compétences', 'Détail de']);
  });
});

// Le texte d'un élément de la page rendue : sa couleur, et le premier fond opaque qui le porte
// (le sien, ou celui de la carte). C'est ce que voit la personne, après les règles de style et
// les couleurs posées par render.js.
const renderedText = (page, selector) => page.locator(selector).evaluateAll(elements => elements.map(element => {
  const style = getComputedStyle(element);
  let background = style.backgroundColor;
  for (let node = element.parentElement; node && /^(rgba\(.*, 0\)|transparent)$/.test(background); node = node.parentElement) {
    background = getComputedStyle(node).backgroundColor;
  }
  return { label: element.textContent.trim(), classes: element.className, color: style.color, background, size: style.fontSize };
}));

test('pastilles, titres de groupe et lien e-mail d’une carte gardent 4,5:1 sur la page rendue (WCAG 1.4.3)', { skip }, async () => {
  const tables = sampleTables();
  // Ana porte une pastille de chaque catégorie : GT et Tâches sont vides dans le jeu de base.
  tables.BDD.GT[0] = ['L', 1];
  tables.BDD.Taches[0] = ['L', 1];
  await withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    const pills = await renderedText(page, '.contact-card .tag');
    const titles = await renderedText(page, '.contact-card .tag-group-title');
    const links = await renderedText(page, '.contact-card a.email');
    const categories = new Set(pills.map(pill => /\btag-(\w+)/.exec(pill.classes)?.[1]));
    for (const key of ['actions', 'communautes', 'gt', 'instances', 'taches']) {
      assert.ok(categories.has(key), `une pastille « ${key} » est mesurée (sinon le test ne prouve rien pour elle)`);
    }
    assert.ok(titles.length >= 7 && links.length >= 1, `titres et liens mesurés (${titles.length}, ${links.length})`);
    const tooPale = [...pills, ...titles, ...links]
      .map(item => ({ ...item, ratio: contrastRatio(parseColor(item.color), parseColor(item.background)) }))
      .filter(item => item.ratio < MIN_TEXT_CONTRAST)
      .map(item => `${item.classes} « ${item.label} » ${item.size} : ${item.ratio.toFixed(2)}:1`);
    assert.deepEqual(tooPale, []);
  });
});

// ===== Interrupteur de présence (navigateur) =====

// Les couleurs et les rectangles de la piste et du curseur, une fois leurs transitions terminées
// (sans cela on lirait une couleur à mi-chemin entre l'ancien état et le nouveau).
async function switchLook(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('#accountBar .presence-track, #accountBar .presence-thumb')]
    .every(element => element.getAnimations().length === 0));
  return page.evaluate(() => {
    const button = document.querySelector('#accountBar .presence-switch');
    const track = button.querySelector('.presence-track');
    const thumb = button.querySelector('.presence-thumb');
    const [buttonStyle, trackStyle, thumbStyle] = [button, track, thumb].map(element => getComputedStyle(element));
    const box = element => { const { left, top, right, bottom } = element.getBoundingClientRect(); return { left, top, right, bottom }; };
    return {
      checked: button.getAttribute('aria-checked') === 'true',
      button: buttonStyle.backgroundColor,
      track: trackStyle.backgroundColor,
      border: { width: parseFloat(trackStyle.borderTopWidth), style: trackStyle.borderTopStyle, color: trackStyle.borderTopColor },
      thumb: thumbStyle.backgroundColor,
      trackBox: box(track),
      thumbBox: box(thumb)
    };
  });
}

// L'interrupteur éteint (Iris n'a pas accepté d'apparaître) puis allumé (Ana apparaît), tel que le
// rend la page sous les préférences d'affichage `media` (emulateMedia).
async function switchLooks(media = {}) {
  const looks = [];
  for (const user of [IRIS_EMAIL, ANA_EMAIL]) {
    await withWidget({ tables: withIdentity(), user }, async ({ page }) => {
      await waitForCards(page, 4);
      await page.waitForFunction(() => !document.getElementById('accountBar').hidden);
      await page.emulateMedia(media);
      looks.push(await switchLook(page));
    });
  }
  return looks;
}

test('sur la page rendue, la piste et le curseur gardent 3:1 avec leur fond, éteint et allumé (WCAG 1.4.11)', { skip }, async () => {
  const looks = await switchLooks();
  assert.deepEqual(looks.map(look => look.checked), [false, true], 'les deux états sont mesurés');
  const tooWeak = looks.flatMap(({ checked, button, track, thumb }) => {
    const state = checked ? 'allumé' : 'éteint';
    return [
      { label: `${state} : piste sur le bouton`, ratio: contrastRatio(track, button) },
      { label: `${state} : curseur sur la piste`, ratio: contrastRatio(thumb, track) }
    ];
  }).filter(({ ratio }) => ratio < MIN_INTERFACE_CONTRAST).map(({ label, ratio }) => `${label} ${ratio.toFixed(2)}:1`);
  assert.deepEqual(tooWeak, []);
});

// Le mode contraste élevé impose ses couleurs : un fond de piste et de curseur posés en hexadécimal
// y deviennent tous deux « Canvas », la bordure et l'ombre disparaissent, et l'interrupteur n'est
// plus qu'un rectangle vide (audit U49). Chromium émule le mode avec la palette claire par défaut.
test('en contraste forcé, l’interrupteur garde un contour, un curseur visible et un état lisible (WCAG 1.4.11)', { skip }, async () => {
  const looks = await switchLooks({ forcedColors: 'active' });
  assert.deepEqual(looks.map(look => look.checked), [false, true]);
  // Une couleur système translucide se pose sur le fond du bouton, comme à l'écran.
  const opaque = (color, backdrop) => blend(parseColor(color), blend(parseColor(backdrop)));
  const problems = [];
  for (const { checked, button, track, border, thumb, trackBox, thumbBox } of looks) {
    const state = checked ? 'allumé' : 'éteint';
    const fill = opaque(track, button);
    const outline = opaque(border.color, button);
    if (border.style === 'none' || border.width < 1) problems.push(`${state} : la piste n’a pas de bordure`);
    if (contrastRatio(outline, opaque(button, button)) < MIN_INTERFACE_CONTRAST) problems.push(`${state} : contour de la piste trop proche du bouton`);
    if (contrastRatio(opaque(thumb, button), fill) < MIN_INTERFACE_CONTRAST) problems.push(`${state} : curseur confondu avec la piste`);
    // Le curseur reste centré dans la piste, bordure comprise (2 px de chaque côté, pas 3 puis 1).
    const gaps = [thumbBox.top - trackBox.top, trackBox.bottom - thumbBox.bottom, thumbBox.left - trackBox.left, trackBox.right - thumbBox.right];
    const end = checked ? gaps[3] : gaps[2];
    if (Math.abs(gaps[0] - gaps[1]) > 0.5 || Math.abs(gaps[0] - end) > 0.5) problems.push(`${state} : curseur décentré (${gaps.map(gap => gap.toFixed(1)).join(', ')} px)`);
  }
  const [off, on] = looks;
  if (off.track === on.track) problems.push('la piste a la même couleur éteinte et allumée');
  assert.deepEqual(problems, []);
});

test('avec « réduire les animations », la piste et le curseur changent sans transition (WCAG 2.3.3)', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: IRIS_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    const durations = () => page.evaluate(() => ['.presence-track', '.presence-thumb']
      .map(selector => getComputedStyle(document.querySelector(selector)).transitionDuration));
    assert.deepEqual(await durations(), ['0.15s', '0.15s'], 'sans préférence, le curseur glisse (sinon ce test ne prouve rien)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.deepEqual(await durations(), ['0s', '0s']);
  });
});

// ===== Taille du texte et des cibles de la carte de la personne connectée =====

// « Votre fiche » et les boutons « Modifier » (celui de la personne, celui de l'établissement dont elle
// est responsable, sous son logo) n'apparaissent que pour la personne connectée (le jeu de test de la
// mise en page, tests/responsive.test.mjs, n'a pas d'identité) : même mesure que pour les autres
// éléments des cartes, 12px de texte au moins et 24px de haut pour les boutons. Le lien e-mail, qui
// n'a pas 24px de haut, doit rester assez loin d'eux (WCAG 2.5.8).
test('sur la carte de la personne connectée, « Votre fiche » et les boutons « Modifier » font 12px et 24px de haut au moins, et le lien e-mail reste à l’écart (audit U08, U20)', { skip }, async () => {
  await withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('.contact-card .card-actions:not([hidden]) .card-edit').waitFor();
    await page.locator('.contact-card .etab-edit').first().waitFor();
    for (const width of [320, 600, 1480]) {
      await page.setViewportSize({ width, height: 1200 });
      const { smallText, shortTargets, smallTargets, crowdedSmall } = await measureCards(page);
      const own = await page.locator('.contact-card .own-flag:visible, .contact-card .card-edit:visible, .contact-card .etab-edit:visible').count();
      assert.ok(own >= 3, `à ${width}px, « Votre fiche », « Modifier » et le « Modifier » de l’établissement sont affichés et mesurés (${own})`);
      assert.ok(smallTargets >= 1, `à ${width}px, un lien e-mail est mesuré (${smallTargets})`);
      assert.deepEqual([...new Set(smallText)], [], `à ${width}px, du texte de carte sous 12px`);
      assert.deepEqual([...new Set(shortTargets)], [], `à ${width}px, des boutons ou pastilles sous 24px de haut`);
      assert.deepEqual([...new Set(crowdedSmall)], [], `à ${width}px, un lien e-mail trop près d’une autre cible`);
    }
  });
});
