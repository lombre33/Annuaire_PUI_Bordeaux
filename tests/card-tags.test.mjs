// Les pastilles d'une carte (1.31.0, audit UI/UX U35 et U22) : un groupe de plus de cinq valeurs n'en montre que quatre, les autres
// sont derrière « +N » ; et les pastilles d'une carte ne sont plus qu'un seul arrêt de tabulation, que les flèches parcourent, avec un
// lien d'évitement « Aller aux résultats » avant tout le reste. Chaque test échoue sur le code de la 1.30.0, sauf les gardes qui disent
// ce qui ne change pas (la carte de relecture, un groupe de cinq, la souris).
//
// Les tests chargent le vrai index.html dans Chromium (optionnel : voir TESTING.md). Ana, la dernière carte de la grille, porte des listes
// longues (withLongTagLists, tests/fixtures.mjs) : 9 compétences, 6 actions, 5 communautés et une instance.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiddenLabels, selectedValues } from '../filters.js';
import { sampleTables, withClones, withLongTagLists } from './fixtures.mjs';
import { accessibilityTree, accessibleNode } from './support/accessibility-tree.mjs';
import { gridCard, skip, waitForCards, withWidget } from './support/browser.mjs';

const ANA = 'Ana Martin';
const group = (card, title) => card.locator('.tag-group', { has: card.page().locator('.tag-group-title', { hasText: title }) });
const visibleTags = group => group.locator('.tag:not([hidden]):not(.tag-more)').allTextContents();
const moreButton = group => group.locator('.tag-more');

// Les pastilles que le plafond cache dans un groupe : dans la page, mais pas à l'écran.
const hiddenCount = group => group.locator('.tag[hidden]').count();

const names = (word, from, to) => Array.from({ length: to - from + 1 }, (_, index) => `${word} ${from + index}`);

// ===== U35 : le plafond, sans navigateur =====

test('hiddenLabels cache ce qui dépasse quatre pastilles, sauf quand il n\'en dépasse qu\'une, et garde visible ce que les filtres désignent (audit U35)', () => {
  const labels = names('Valeur', 1, 9);
  assert.deepEqual(hiddenLabels([], undefined), []);
  assert.deepEqual(hiddenLabels(names('Valeur', 1, 4), undefined), [], 'quatre : tout est visible');
  assert.deepEqual(hiddenLabels(names('Valeur', 1, 5), undefined), [], 'cinq : cacher une seule pastille derrière « +1 » n\'y gagnerait rien');
  assert.deepEqual(hiddenLabels(names('Valeur', 1, 6), undefined), ['Valeur 5', 'Valeur 6'], 'six : deux cachées');
  assert.deepEqual(hiddenLabels(labels, undefined), names('Valeur', 5, 9), 'neuf : cinq cachées, les quatre premières visibles, dans l\'ordre de la fiche');

  // Une valeur que les filtres désignent reste visible, dans les mêmes termes que les filtres (casse et accents ignorés).
  assert.deepEqual(hiddenLabels(labels, new Set(['valeur 7'])), ['Valeur 5', 'Valeur 6', 'Valeur 8', 'Valeur 9']);
  assert.deepEqual(hiddenLabels(names('Valeur', 1, 6), new Set(['valeur 5'])), [], 'si une seule reste cachée, « +1 » n\'a plus de raison d\'être : tout est montré');
  assert.deepEqual(hiddenLabels(names('Valeur', 1, 6), new Set(['valeur 5', 'valeur 6'])), []);
  assert.deepEqual(hiddenLabels(labels, new Set(['valeur 1'])), names('Valeur', 5, 9), 'une valeur déjà visible ne change rien');
  assert.deepEqual(hiddenLabels(labels, new Set(names('valeur', 5, 9))), [], 'tout ce qui était caché est désigné : rien à cacher');
});

test('selectedValues donne, par catégorie, les valeurs que les filtres actifs désignent, normalisées, et rien pour une catégorie sans sélection (audit U35)', () => {
  const active = { instances: new Set(['CME', 'Comité Éthique']), actions: new Set(), competences: new Set(['Hématologie']) };
  const selected = selectedValues(active);
  assert.deepEqual(Object.keys(selected).sort(), ['competences', 'instances']);
  assert.deepEqual([...selected.instances].sort(), ['cme', 'comite ethique']);
  assert.deepEqual([...selected.competences], ['hematologie']);
  assert.deepEqual(selectedValues({}), {});
});

// ===== U35 : le plafond, dans la page =====

test('Ana a neuf compétences et six actions : quatre pastilles par groupe et « +5 », « +2 » ; ses cinq communautés restent toutes visibles (audit U35)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const card = gridCard(page, 'Ana');
    const competences = group(card, 'Compétences');
    assert.deepEqual(await visibleTags(competences), names('Compétence', 1, 4));
    assert.equal(await hiddenCount(competences), 5, 'cinq pastilles dans la page, cachées');
    assert.equal(await moreButton(competences).textContent(), '+5 autres valeurs : Compétences');

    const actions = group(card, 'Actions');
    assert.deepEqual(await visibleTags(actions), names('Action', 1, 4));
    assert.equal(await hiddenCount(actions), 2);
    assert.match(await moreButton(actions).textContent(), /^\+2/);

    const communautes = group(card, 'Communautés');
    assert.deepEqual(await visibleTags(communautes), names('Communauté', 1, 5), 'cinq : cacher une seule pastille derrière « +1 » n\'y gagnerait rien');
    assert.equal(await moreButton(communautes).count(), 0);
    assert.equal(await hiddenCount(communautes), 0);

    // Une pastille cachée n'est pas à l'écran, et la carte est plus courte que sans plafond.
    assert.equal(await competences.locator('.tag[hidden]').first().isVisible(), false);
    assert.equal(await moreButton(competences).isVisible(), true);
    assert.ok((await moreButton(competences).boundingBox()).width < 70, '« +5 » montre son nombre seulement : la suite de son nom n\'est pas à l\'écran');
    assert.equal(await group(card, 'Instances').locator('.tag-more').count(), 0, 'une instance : rien à cacher');
  }));

test('« +N » montre les autres pastilles, le focus va à la première montrée, « Moins » les cache de nouveau (audit U35)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const competences = group(gridCard(page, 'Ana'), 'Compétences');
    const more = moreButton(competences);
    assert.equal(await more.getAttribute('aria-expanded'), 'false');

    await more.click();
    assert.deepEqual(await visibleTags(competences), names('Compétence', 1, 9));
    assert.equal(await more.getAttribute('aria-expanded'), 'true');
    assert.equal((await more.textContent()).startsWith('Moins'), true);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Compétence 5', 'le focus suit la première pastille montrée');

    await more.click();
    assert.deepEqual(await visibleTags(competences), names('Compétence', 1, 4));
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    assert.equal((await more.textContent()).startsWith('+5'), true);
    assert.equal(await hiddenCount(competences), 5);
    assert.equal(await page.evaluate(() => document.activeElement.className.includes('tag-more')), true, 'refermer garde le focus sur le bouton');
  }));

test('le nom de « +N » commence par le texte écrit et dit de quel groupe il s\'agit ; il annonce s\'il est déplié (audit U35)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    let tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'button', '+5 autres valeurs : Compétences')?.expanded, false);
    assert.equal(accessibleNode(tree, 'button', '+2 autres valeurs : Actions')?.expanded, false);

    await moreButton(group(gridCard(page, 'Ana'), 'Compétences')).click();
    tree = await accessibilityTree(page);
    assert.equal(accessibleNode(tree, 'button', 'Moins de valeurs : Compétences')?.expanded, true);
    assert.equal(accessibleNode(tree, 'button', '+5 autres valeurs : Compétences'), undefined);
    assert.equal(accessibleNode(tree, 'button', '+2 autres valeurs : Actions')?.expanded, false, 'l\'autre groupe reste replié');
    assert.ok(accessibleNode(tree, 'button', 'Compétence 9'), 'une pastille montrée se lit');
  }));

test('un filtre garde visible la valeur qu\'il désigne même au-delà du plafond, et la carte reprend son plafond quand le filtre part (audit U35)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const competences = () => group(gridCard(page, 'Ana'), 'Compétences');
    await moreButton(competences()).click();
    await competences().locator('.tag', { hasText: /^Compétence 8$/ }).click(); // filtre « Compétences : Compétence 8 »
    await waitForCards(page, 1);

    assert.deepEqual(await visibleTags(competences()), [...names('Compétence', 1, 4), 'Compétence 8'], 'la valeur choisie est là, à sa place');
    assert.match(await moreButton(competences()).textContent(), /^\+4/, 'les quatre autres restent derrière « +4 »');
    assert.equal(await hiddenCount(competences()), 4);

    await page.locator('#resetFilters').click();
    await waitForCards(page, 4);
    assert.deepEqual(await visibleTags(competences()), names('Compétence', 1, 4));
    assert.match(await moreButton(competences()).textContent(), /^\+5/);

    // Six actions dont deux cachées : en choisir une, il n'en reste qu'une derrière le bouton, donc le groupe est montré en entier.
    const actions = () => group(gridCard(page, 'Ana'), 'Actions');
    await moreButton(actions()).click();
    await actions().locator('.tag', { hasText: /^Action 6$/ }).click();
    await waitForCards(page, 1);
    assert.deepEqual(await visibleTags(actions()), names('Action', 1, 6), 'un seul « +1 » ne se justifie pas : les six sont là');
    assert.equal(await moreButton(actions()).count(), 0);
  }));

test('si le filtre qui gardait une pastille visible part pendant que le focus y est, le focus va au compteur : la pastille est de nouveau cachée (audit U35 et U17)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = () => gridCard(page, 'Ana');
    await moreButton(group(ana(), 'Compétences')).click();
    await group(ana(), 'Compétences').locator('.tag', { hasText: /^Compétence 8$/ }).focus();
    await page.keyboard.press('Enter'); // filtre « Compétence 8 » : la pastille est gardée visible
    await page.waitForFunction(() => document.getElementById('resultCount').textContent === '1 contact');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Compétence 8', 'la pastille choisie garde le focus');

    await page.keyboard.press('Enter'); // le filtre part : la pastille retourne derrière « +5 »
    await page.waitForFunction(() => document.getElementById('resultCount').textContent === '4 contacts');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resultCount', 'le focus n\'est pas resté sur une pastille cachée, où il se perdrait');
  }));

test('renderCards refait la carte dont une pastille cachée devient visible, et seulement celle-là (audit U35)', { skip }, () =>
  withWidget({ tables: withLongTagLists(), user: null }, async ({ page }) => {
    await waitForCards(page, 4);
    const result = await page.evaluate(async () => {
      const { renderCards } = await import('/render.js');
      const { loadDirectory } = await import('/grist-data.js');
      const { createEmptyFilterState } = await import('/filters.js');
      const { contacts } = await loadDirectory(window.grist.docApi, {});
      const template = document.getElementById('cardTemplate');
      const grid = document.createElement('div');
      // Les mêmes fonctions à chaque dessin : un `onToggle` neuf serait déjà un ingrédient qui change.
      const onToggle = () => {};
      const rightsOf = () => null;
      const draw = filters => {
        renderCards(grid, template, contacts, onToggle, rightsOf, null, null, filters);
        return [...grid.children];
      };
      const rebuiltBy = filters => {
        const before = draw(null);
        return draw(filters).filter((card, index) => card !== before[index]).length;
      };
      const withValue = (key, value) => ({ ...createEmptyFilterState(), [key]: new Set([value]) });
      // D'une valeur cachée gardée visible à une autre, autant de pastilles cachées dans les deux cas : la carte change quand même.
      const changedBy = (from, to) => {
        const before = draw(from);
        return draw(to).filter((card, index) => card !== before[index]).length;
      };
      return {
        sansFiltre: rebuiltBy(null),
        valeurDejaVisible: rebuiltBy(withValue('competences', 'Compétence 1')),
        valeurCachee: rebuiltBy(withValue('competences', 'Compétence 8')),
        autreCategorie: rebuiltBy(withValue('instances', 'CME')),
        autreValeurCachee: changedBy(withValue('competences', 'Compétence 8'), withValue('competences', 'Compétence 7'))
      };
    });
    assert.deepEqual(result, { sansFiltre: 0, valeurDejaVisible: 0, valeurCachee: 1, autreCategorie: 0, autreValeurCachee: 1 });
  }));

test('la carte de relecture d\'une modification montre toutes les pastilles, sans plafond ni « +N » ni barre d\'outils (audit U35, garde)', { skip }, () =>
  withWidget({ tables: withLongTagLists(), user: null }, async ({ page }) => {
    await waitForCards(page, 4);
    const preview = await page.evaluate(async () => {
      const { renderPreviewCard } = await import('/render.js');
      const { loadDirectory } = await import('/grist-data.js');
      const { contacts } = await loadDirectory(window.grist.docApi, {});
      const ana = contacts.find(contact => contact.prenom === 'Ana');
      const card = renderPreviewCard(document.getElementById('cardTemplate'), ana).firstElementChild;
      return {
        tags: card.querySelectorAll('.card-tags .tag').length,
        hidden: card.querySelectorAll('.tag[hidden]').length,
        more: card.querySelectorAll('.tag-more').length,
        toolbar: card.querySelector('.card-tags').getAttribute('role'),
        focusable: card.querySelectorAll('.card-tags [tabindex]').length
      };
    });
    assert.deepEqual(preview, { tags: 21, hidden: 0, more: 0, toolbar: null, focusable: 0 });
  }));

// ===== U22 : un arrêt de tabulation par carte =====

// Les pastilles d'une carte atteintes à la tabulation : celles dont le tabindex n'est pas -1.
const tabbablePills = card => card.locator('.card-tags button.tag:not([tabindex="-1"])');

test('les pastilles d\'une carte forment une barre d\'outils nommée, avec un seul arrêt de tabulation : la première (audit U22)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    for (const name of ['Gina', 'Hugo', 'Ana']) {
      const card = gridCard(page, name);
      assert.equal(await tabbablePills(card).count(), name === 'Hugo' ? 0 : 1, `${name} : un seul arrêt de tabulation parmi ses pastilles`);
    }
    assert.equal(await gridCard(page, 'Hugo').locator('.card-tags').getAttribute('role'), null, 'une carte sans pastille n\'a pas de barre d\'outils vide');
    const ana = gridCard(page, 'Ana');
    assert.equal(await ana.locator('.card-tags').getAttribute('role'), 'toolbar');
    assert.equal(await ana.locator('.card-tags').getAttribute('aria-label'), `Filtrer par une valeur de la fiche de ${ANA}`);
    assert.equal(await tabbablePills(ana).first().textContent(), 'CME', 'le premier arrêt est la première pastille');
    assert.ok(await ana.locator('.card-tags button.tag').count() > 15, 'les autres pastilles existent, hors de la tabulation');

    // Ce que le navigateur en fait : une barre d'outils nommée qui contient les boutons.
    const tree = await accessibilityTree(page);
    assert.ok(accessibleNode(tree, 'toolbar', `Filtrer par une valeur de la fiche de ${ANA}`));
    assert.ok(accessibleNode(tree, 'button', 'Compétence 3'));
  }));

test('à la tabulation, on traverse une carte en peu d\'arrêts : l\'établissement, l\'e-mail, une seule pastille (audit U22)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.setViewportSize({ width: 1280, height: 2400 });
    // Depuis le premier contrôle de la carte d'Ana, on avance jusqu'à sortir de la carte, en comptant les arrêts.
    await gridCard(page, 'Ana').locator('.etablissement-tag').focus();
    let stops = 1;
    for (; stops < 40; stops += 1) {
      await page.keyboard.press('Tab');
      if (!(await page.evaluate(() => document.activeElement.closest('.contact-card')?.querySelector('.name')?.textContent.includes('Ana')))) break;
    }
    assert.ok(stops <= 6, `${stops} arrêts dans la carte d'Ana (21 pastilles, dont 2 « +N », et son badge, son e-mail) : au plus 6`);
  }));

test('les flèches gauche et droite passent d\'une pastille à l\'autre, sautent celles que le plafond cache, et la dernière pastille touchée devient l\'arrêt de la carte (audit U22)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = gridCard(page, 'Ana');
    const focused = () => page.evaluate(() => document.activeElement.firstChild.textContent);
    await tabbablePills(ana).first().focus();
    assert.equal(await focused(), 'CME');

    // Dans l'ordre de la carte : l'instance, quatre actions puis « +2 », quatre compétences puis « +5 », cinq communautés.
    const path = ['CME', ...names('Action', 1, 4), '+2', ...names('Compétence', 1, 4), '+5', ...names('Communauté', 1, 5)];
    const seen = ['CME'];
    for (let step = 1; step < path.length; step += 1) {
      await page.keyboard.press('ArrowRight');
      seen.push(await focused());
    }
    assert.deepEqual(seen, path);
    await page.keyboard.press('ArrowRight');
    assert.equal(await focused(), 'Communauté 5', 'au bout, la flèche reste sur la dernière pastille');
    assert.equal(await tabbablePills(ana).count(), 1);
    assert.equal(await tabbablePills(ana).first().textContent(), 'Communauté 5', 'la dernière pastille touchée est l\'arrêt de la carte');

    await page.keyboard.press('ArrowLeft');
    assert.equal(await focused(), 'Communauté 4');
    for (let step = 0; step < 30; step += 1) await page.keyboard.press('ArrowLeft');
    assert.equal(await focused(), 'CME', 'au début, la flèche reste sur la première pastille');
  }));

test('Tab sort de la barre d\'outils de la carte pour la carte suivante et Maj+Tab y revient à la dernière pastille touchée ; une flèche avec une touche de commande ne la parcourt pas (audit U22)', { skip }, () =>
  // « Copie 1 » est la première carte de la grille (tri par nom) et copie Ana : mêmes listes longues, une carte derrière elle.
  withWidget({ tables: withClones(withLongTagLists(), 1) }, async ({ page }) => {
    await waitForCards(page, 5);
    await page.setViewportSize({ width: 1280, height: 2400 });
    const copy = gridCard(page, 'Copie 1');
    await tabbablePills(copy).first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const focusedPill = () => page.evaluate(() => document.activeElement.firstChild.textContent);
    assert.equal(await focusedPill(), 'Action 2');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.contact-card').querySelector('.name').textContent), 'Gina Bergonié', 'Tab passe à la carte suivante');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focusedPill(), 'Action 2', 'Maj+Tab revient à la pastille touchée en dernier');

    for (const combination of ['Shift+ArrowRight', 'Control+ArrowRight', 'Alt+ArrowRight', 'Meta+ArrowRight']) await page.keyboard.press(combination);
    assert.equal(await focusedPill(), 'Action 2', 'les flèches avec Maj, Ctrl, Alt (précédent, suivant du navigateur) ou Méta ne parcourent pas les pastilles');

    // Les flèches ne font pas défiler la page quand elles parcourent les pastilles.
    const prevented = await page.evaluate(() => new Promise(resolve => {
      window.addEventListener('keydown', event => resolve(event.defaultPrevented), { once: true });
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    }));
    assert.equal(prevented, true);
  }));

test('une flèche sur le rôle d\'une carte, qui n\'est pas dans la barre de pastilles, ne fait rien : ni déplacement du focus, ni erreur (audit U22, garde)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const role = gridCard(page, 'Ana').locator('.role-col button.tag');
    assert.equal(await role.count(), 1, 'Ana porte un rôle');
    await role.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('role-tag')), true, 'le focus est resté sur le rôle');
    assert.deepEqual(logs.pageErrors, []);
  }));

test('Entrée sur une pastille filtre, et le focus reste dans la barre d\'outils de la carte, sur la pastille qu\'il avait (audit U22 et U17)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = () => gridCard(page, 'Ana');
    await tabbablePills(ana()).first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter'); // « Action 2 » : filtre Actions
    await page.waitForFunction(() => document.getElementById('resultCount').textContent === '1 contact');
    assert.equal(await page.evaluate(() => document.activeElement.firstChild.textContent), 'Action 2', 'le focus est resté sur la pastille');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('.card-tags[role="toolbar"]'))), true);
    assert.equal(await tabbablePills(ana()).count(), 1);
    assert.equal(await tabbablePills(ana()).first().textContent(), 'Action 2', 'et c\'est toujours l\'arrêt de la carte');
  }));

test('à la souris, cliquer une pastille la fait devenir l\'arrêt de la carte et rien d\'autre ne change (audit U22, garde)', { skip }, () =>
  withWidget({ tables: withLongTagLists() }, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = gridCard(page, 'Ana');
    await group(ana, 'Communautés').locator('.tag', { hasText: /^Communauté 3$/ }).click();
    await page.locator('#resetFilters').click();
    await waitForCards(page, 4);
    assert.equal(await tabbablePills(gridCard(page, 'Ana')).count(), 1);
    assert.equal(await tabbablePills(gridCard(page, 'Ana')).first().textContent(), 'Communauté 3', 'la pastille cliquée est l\'arrêt de la carte');
  }));

// ===== U22 : le lien d'évitement =====

test('le lien « Aller aux résultats » est le premier arrêt de la page, caché jusqu\'au focus, et mène à la première carte (audit U22)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    const link = page.locator('.skip-link');
    const box = () => link.evaluate(element => { const { top, bottom, left, right } = element.getBoundingClientRect(); return { top, bottom, left, right }; });
    assert.ok((await box()).bottom <= 0, 'hors de l\'écran tant qu\'il n\'a pas le focus');

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link', 'la tabulation y arrive en premier');
    assert.equal(await link.textContent(), 'Aller aux résultats');
    const shown = await box();
    assert.ok(shown.top >= 0 && shown.left >= 0 && shown.bottom > shown.top, `à l'écran une fois focalisé : ${JSON.stringify(shown)}`);

    await page.keyboard.press('Enter');
    const where = await page.evaluate(() => ({
      card: document.activeElement.closest('.contact-card')?.querySelector('.name').textContent,
      badge: document.activeElement.classList.contains('etablissement-tag'),
      hash: location.hash
    }));
    // Le premier contrôle que la tabulation atteint dans la première carte (son bouton « Modifier », caché, n'en est pas un).
    assert.deepEqual(where, { card: 'Gina Bergonié', badge: true, hash: '' }, 'le focus est au premier arrêt de la première carte, sans changer l\'adresse');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.contact-card')?.querySelector('.name').textContent), 'Gina Bergonié', 'et la tabulation continue dans la carte');
  }));

test('focusFirstResult va au premier contrôle que la tabulation atteint : ni un contrôle caché ni une pastille hors tabulation, et de carte en carte (audit U22)', { skip }, () =>
  withWidget({ tables: sampleTables(), user: null }, async ({ page }) => {
    await waitForCards(page, 4);
    const landed = await page.evaluate(async () => {
      const { focusFirstResult } = await import('/render.js');
      const landOn = (...cards) => {
        const grid = document.createElement('div');
        grid.innerHTML = cards.map(html => `<article>${html}</article>`).join('');
        document.body.append(grid);
        focusFirstResult(grid, document.getElementById('resultCount'));
        const { id } = document.activeElement;
        grid.remove();
        return id;
      };
      return {
        caché: landOn('<div hidden><button id="modifier">✎ Modifier</button></div><button id="badge">CHU</button>'),
        horsTabulation: landOn('<button id="pastille" tabindex="-1">CME</button><button id="suivant">Haut</button>'),
        lien: landOn('<a id="mail" href="#mail">mail</a>'),
        carteSuivante: landOn('<p>aucun contrôle</p>', '<button id="deuxieme">CHU</button>'),
        aucun: landOn('<p>aucun contrôle</p>')
      };
    });
    assert.deepEqual(landed, { caché: 'badge', horsTabulation: 'suivant', lien: 'mail', carteSuivante: 'deuxieme', aucun: 'resultCount' });
  }));

test('sans carte à montrer, le lien d\'évitement amène le focus au compteur (audit U22)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.getByRole('searchbox').fill('introuvable');
    await page.waitForFunction(() => document.querySelectorAll('.contact-card').length === 0);
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'resultCount');
  }));

test('le lien d\'évitement n\'apparaît pas à l\'impression (audit U22)', { skip }, () =>
  withWidget({ tables: sampleTables() }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.skip-link').evaluate(element => getComputedStyle(element).display), 'none');
  }));
