// Test navigateur de bout en bout : charge le vrai index.html (main.js,
// render.js, style.css) dans Chromium, avec une API Grist simulée qui sert les
// données de tests/fixtures.mjs, et vérifie ce que voit l'utilisateur :
// nombre de contacts, badge établissement (BDD.Etablissement), filtres, pannes.
//
// Limite assumée : le simulateur ne remplace pas un vrai document Grist (voir
// TESTING.md) ; il garantit que le câblage et le rendu réels réagissent bien
// aux encodages Grist connus et aux pannes de lecture.
//
// Optionnel : nécessite Playwright (npm install --no-save playwright puis
// npx playwright install chromium). Sans lui ces tests sont ignorés et
// `node --test` reste vert. CHROMIUM_PATH désigne un Chromium déjà installé.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleTables, withoutOptionalColumns, withIdentity, DEFAULT_CARD_NAMES, HOSTILE_FIRST_NAME, ANA_EMAIL, BOB_EMAIL, IRIS_EMAIL, ADMIN_EMAIL
} from './fixtures.mjs';
import {
  skip, reload, cardCount, waitForCards, waitForBanner, cardNames, resultCount, bannerText, withWidget
} from './support/browser.mjs';
import { groupedMenu, optionCounts } from './support/grouped-menu.mjs';

// ===== Affichage nominal =====

test('affiche les contacts éligibles, avec le badge établissement (Etablissement) de chaque carte', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, DEFAULT_CARD_NAMES.length);
    assert.deepEqual(await cardNames(page), DEFAULT_CARD_NAMES);
    assert.equal(await resultCount(page), '4 contacts');
    assert.deepEqual(
      await page.locator('.contact-card .etablissement-tag').allTextContents(),
      ['CHU', 'CHU', 'Institut Bergonié', 'CHU'],
      'chaque carte porte son établissement'
    );
    assert.equal(await page.locator('#statusBanner').isHidden(), true, 'aucun bandeau quand tout va bien');
    assert.deepEqual(await Promise.all(logs.errors), []);
    assert.equal((await page.evaluate(() => window.__gristReady)).requiredAccess, 'full', 'cohérent avec manifest.yml');
  }));

test('exclut les contacts non éligibles : établissement « autres », non validé, sans Etablissement, hors périmètre, sans nom', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const names = (await cardNames(page)).join('|');
    for (const hidden of ['Carla', 'Dan', 'Eve', 'Fred', 'Bob']) {
      assert.ok(!names.includes(hidden), `${hidden} ne doit pas apparaître`);
    }
  }));

test('une personne qui n\'a pas accepté d\'apparaître n\'a pas de carte, même avec l\'interrupteur Partenaires', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('.scope-btn[data-scope="partenaire"]').click();
    await waitForCards(page, 5);
    const names = (await cardNames(page)).join('|');
    for (const hidden of ['Iris', 'Jules']) assert.ok(!names.includes(hidden), `${hidden} n'a pas accepté : pas de carte`);
    assert.equal(await page.locator('#statusBanner').isHidden(), true, 'des refus individuels ne sont pas une anomalie');
  }));

test('cocher Accepte_apparaitre dans Grist fait apparaître la personne au rechargement suivant, la décocher la retire', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.evaluate(() => { window.__tables.BDD.Accepte_apparaitre[10] = true; });
    await reload(page);
    await waitForCards(page, 5);
    assert.ok((await cardNames(page)).includes('Iris Refus'));
    assert.equal(await resultCount(page), '5 contacts');
    await page.evaluate(() => { window.__tables.BDD.Accepte_apparaitre[10] = false; });
    await reload(page);
    await waitForCards(page, 4);
    assert.ok(!(await cardNames(page)).includes('Iris Refus'));
  }));

test('personne n\'a accepté d\'apparaître : le bandeau le dit au lieu de laisser un « 0 contact » muet', { skip }, () => {
  const tables = sampleTables();
  tables.BDD.Accepte_apparaitre = tables.BDD.Accepte_apparaitre.map(() => false);
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Personne n'a accepté d'apparaître/);
    assert.match(await bannerText(page), /Accepte_apparaitre/);
    assert.equal(await cardCount(page), 0);
    assert.equal(await resultCount(page), '0 contact');
  });
});

test('colonne Accepte_apparaitre absente de BDD : erreur explicite, jamais l\'annuaire de tout le monde', { skip }, () => {
  const tables = sampleTables();
  delete tables.BDD.Accepte_apparaitre;
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Accepte_apparaitre/);
    assert.equal(await cardCount(page), 0, 'dans le doute, personne n\'est affiché');
    assert.equal(await resultCount(page), 'Chargement impossible');
  });
});

test('affiche le contenu des cartes : initiales, fonction, e-mail, téléphone, tags (libellés corrigés) et rôle PUI', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const ana = page.locator('.contact-card').first();
    assert.equal(await ana.locator('.avatar').textContent(), 'AM');
    assert.equal(await ana.locator('.fonction').textContent(), 'Pharmacienne');
    assert.equal(await ana.locator('.email').getAttribute('href'), 'mailto:ana.martin@chu-bordeaux.fr');
    const tagsByGroup = await ana.locator('.tag-group').evaluateAll(groups =>
      groups.map(group => [group.querySelector('.tag-group-title').textContent,
        [...group.querySelectorAll('.tag')].map(tag => tag.textContent)]));
    assert.deepEqual(tagsByGroup, [
      ['Instances', ['CME']],
      ['Actions', ['Vaccination']],
      ['Compétences', ['Oncologie', 'Hématologie']],
      ['Communautés', ['Réseau douleur']],
      ['Rôle PUI', ['Référent qualité']]
    ]);
    assert.equal(await ana.locator('.tel').textContent(), '☎ 05 56 78 90 12', 'le 0 initial perdu par le type Numeric est rétabli');
    assert.equal(await ana.locator('.tag-static').count(), 1, 'le tag Rôle PUI n\'est pas cliquable');

    const hugo = page.locator('.contact-card').nth(3);
    assert.equal(await hugo.locator('.email.visible').count(), 0, 'pas de ligne email vide');
    assert.equal(await hugo.locator('.card-tags').locator('.tag').count(), 0, 'id 999 introuvable : aucun tag fantôme');
  }));

test('une carte sans téléphone ni rôle PUI n\'affiche aucune ligne vide', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const gina = page.locator('.contact-card').nth(2);
    assert.equal(await gina.locator('.tel.visible').count(), 0);
    assert.equal(await gina.locator('.tag-static').count(), 0);
  }));

test('s\'affiche sans erreur si BDD n\'a pas les colonnes facultatives téléphone et rôle PUI', { skip }, () =>
  withWidget({ tables: withoutOptionalColumns(sampleTables()) }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const ana = page.locator('.contact-card').first();
    assert.equal(await ana.locator('.tel.visible').count(), 0);
    assert.equal(await ana.locator('.tag-static').count(), 0);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('affiche en texte brut un prénom contenant du HTML (aucune injection)', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('.contact-card .name').nth(1).textContent(), `${HOSTILE_FIRST_NAME} Hostile`);
    assert.equal(await page.locator('#cardsGrid img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  }));

test('ne crée un lien mailto que pour une adresse sans paramètre injectable', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const gina = page.locator('.contact-card').nth(2);
    assert.equal(await gina.locator('.email').textContent(), 'gina@bergonie.fr?cc=intrus@example.fr');
    assert.equal(await gina.locator('.email').getAttribute('href'), null, 'adresse douteuse : texte sans lien');
  }));

// ===== Interrupteurs, recherche, filtres =====

test('Partenaires révèle les contacts partenaires ; Réinitialiser ne touche pas aux interrupteurs', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    assert.ok((await cardNames(page)).includes('Bob Durand'));

    await page.click('[data-scope="fondateur"]');
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Bob Durand']);

    await page.click('#resetFilters');
    assert.equal(await cardCount(page), 1, 'le choix Partenaires seuls survit à « Réinitialiser »');
  }));

test('la recherche ignore casse et accents, et se vide avec Réinitialiser', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.fill('#searchInput', 'BERGONIE');
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Gina Bergonié']);
    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await page.inputValue('#searchInput'), '');
  }));

test('cliquer un tag de carte coche le filtre, met à jour le menu et le badge ; Réinitialiser le décoche', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('.contact-card').first().locator('.tag-instances').click();
    await waitForCards(page, 1);
    const filter = page.locator('.filter[data-filter-key="instances"]');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    await filter.locator('.filter-button').click();
    assert.equal(await filter.locator('.filter-option').first().locator('input').isChecked(), true);

    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await page.locator('.filter-count:not([hidden])').count(), 0);
  }));

// ===== Compétences et domaines : un seul menu =====
// Les domaines (compétences macro) sont les groupes du menu Compétences : une case par
// domaine, qui coche toutes ses compétences, un bouton qui déplie le détail, et une
// recherche qui trouve un domaine comme une compétence. Avec ces données (voir
// fixtures.mjs) : Cancérologie (Oncologie, Hématologie : Ana), Pharmacie (Pharmacovigilance :
// Bob, partenaire) et Autres (Divers : Gina, la compétence que Macro_competences ne classe pas).

const skills = groupedMenu('competences');
const skillsFilter = skills.filter;
const domain = skills.group;
const domainBox = skills.box;
const skill = skills.item;
const openSkills = skills.open;
const domainCounts = skills.groupCounts;
const domainNames = skills.groupNames;
const visibleDomains = skills.visibleGroups;
const visibleSkills = skills.visibleItems;
const badge = skills.badge;

test('le filtre Compétences propose le libellé corrigé de la table Competences et filtre dessus', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await skillsFilter(page).locator('.filter-option .option-label').allTextContents(),
      ['Hématologie', 'Oncologie', 'Pharmacovigilance', 'Divers'], 'libellés corrigés ou bruts, jamais les deux');
    await openSkills(page);
    await domain(page, 'Cancérologie').locator('.group-toggle').click();
    await skill(page, 'Oncologie').locator('input').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);
  }));

test('la barre de filtres compte sept boutons : « Domaines » n\'a plus le sien, ses domaines rangent le menu Compétences', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await page.locator('.filter-button > span:nth-child(2)').allTextContents(),
      ['Actions', 'Tâches', 'Communautés', 'GT', 'Compétences', 'Instances', 'Établissement']);
    assert.equal(await page.locator('.filter[data-filter-key="macro"]').count(), 0);
    assert.match(await skillsFilter(page).locator('.filter-button').getAttribute('title'), /domaine/);
    assert.equal(await skillsFilter(page).locator('.filter-search-input').getAttribute('placeholder'), 'Domaine ou compétence…');
  }));

test('le menu Compétences range les compétences par domaine, repliés, « Autres » en dernier, avec le nombre de cartes de chacun', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Pharmacie', 'Autres'],
      '« cancérologie » et « Cancérologie » ne font qu\'un domaine ; la compétence sans domaine est sous « Autres », en dernier');
    assert.deepEqual(await domainCounts(page), { Cancérologie: '1', Pharmacie: '0', Autres: '1' },
      'Ana compte une fois malgré ses deux compétences ; Bob (Pharmacie) est masqué par défaut');
    assert.deepEqual(await visibleDomains(page), ['Cancérologie', 'Pharmacie', 'Autres']);
    assert.deepEqual(await visibleSkills(page), [], 'le détail est replié au départ');
    assert.equal(await page.locator('.group-toggle[aria-expanded="true"]').count(), 0);
    assert.equal(await skillsFilter(page).locator('.filter-group.open').count(), 0);
    assert.equal(await skillsFilter(page).locator('.filter-menu').evaluate(menu => getComputedStyle(menu).display), 'block');
  }));

test('déplier un domaine montre ses compétences et leur nombre de cartes, le replier les cache, et le menu reste ouvert', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    const toggle = domain(page, 'Cancérologie').locator('.group-toggle');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await visibleSkills(page), ['Hématologie', 'Oncologie'], 'celles de ce domaine seulement, dans l\'ordre alphabétique');
    assert.deepEqual(await optionCounts(domain(page, 'Cancérologie')), { Hématologie: '1', Oncologie: '1' });
    assert.equal(await skillsFilter(page).evaluate(filter => filter.classList.contains('open')), true, 'cliquer dans le menu ne le referme pas');

    // Deux domaines peuvent être dépliés ensemble.
    await domain(page, 'Autres').locator('.group-toggle').click();
    assert.deepEqual(await visibleSkills(page), ['Hématologie', 'Oncologie', 'Divers']);

    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await visibleSkills(page), ['Divers']);
    assert.equal(await toggle.getAttribute('aria-controls'), await domain(page, 'Cancérologie').locator('.group-options').getAttribute('id'),
      'le bouton désigne la liste qu\'il déplie');
  }));

test('cocher un domaine coche toutes ses compétences : ses cartes, un badge à 1, et la case se décoche d\'un clic', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domainBox(page, 'Cancérologie').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);
    assert.equal(await badge(page).textContent(), '1', 'un domaine : « 1 », pas « 2 » comme ses deux compétences');
    assert.equal(await domainBox(page, 'Cancérologie').isChecked(), true);
    assert.equal(await domainBox(page, 'Cancérologie').evaluate(box => box.indeterminate), false);
    assert.equal(await skillsFilter(page).locator('.filter-option input:checked').count(), 2, 'ses deux compétences sont cochées');
    assert.equal(await skillsFilter(page).evaluate(filter => filter.classList.contains('open')), true);
    assert.equal(await domain(page, 'Cancérologie').locator('.filter-option.checked').count(), 2);
    const head = domain(page, 'Cancérologie').locator('.group-head');
    assert.deepEqual(await head.evaluate(element => [element.classList.contains('checked'), element.classList.contains('partial')]), [true, false], 'le fond d\'un domaine entier est marqué, pas celui d\'un domaine partiel');

    await domainBox(page, 'Cancérologie').uncheck();
    await waitForCards(page, 4);
    assert.equal(await badge(page).isHidden(), true);
    assert.equal(await skillsFilter(page).locator('.filter-option input:checked').count(), 0);
  }));

test('cocher une seule compétence rend la case de son domaine partielle ; un clic sur cette case complète le domaine', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domain(page, 'Cancérologie').locator('.group-toggle').click();
    await skill(page, 'Oncologie').locator('input').check();
    await waitForCards(page, 1);
    assert.equal(await badge(page).textContent(), '1');
    assert.equal(await domainBox(page, 'Cancérologie').evaluate(box => box.indeterminate), true, 'case partielle');
    assert.equal(await domainBox(page, 'Cancérologie').isChecked(), false);
    assert.equal(await domain(page, 'Cancérologie').locator('.group-head').evaluate(head => head.classList.contains('partial')), true);

    await domainBox(page, 'Cancérologie').click(); // une case partielle se complète
    assert.equal(await domainBox(page, 'Cancérologie').isChecked(), true);
    assert.equal(await domainBox(page, 'Cancérologie').evaluate(box => box.indeterminate), false);
    assert.equal(await badge(page).textContent(), '1', 'le domaine entier compte pour 1');

    await skill(page, 'Hématologie').locator('input').uncheck();
    assert.equal(await domainBox(page, 'Cancérologie').evaluate(box => box.indeterminate), true, 'décocher une compétence rend la case partielle');
    assert.equal(await badge(page).textContent(), '1', 'une compétence restante');
    await skill(page, 'Oncologie').locator('input').uncheck();
    assert.equal(await domainBox(page, 'Cancérologie').evaluate(box => box.indeterminate || box.checked), false);
    assert.equal(await badge(page).isHidden(), true);
    await waitForCards(page, 4);
  }));

test('les domaines et les compétences s\'additionnent (OU) dans le menu, et le tout se cumule (ET) avec les autres filtres', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domainBox(page, 'Autres').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Gina Bergonié']);
    await domain(page, 'Cancérologie').locator('.group-toggle').click();
    await skill(page, 'Oncologie').locator('input').check();
    await waitForCards(page, 2);
    assert.deepEqual(await cardNames(page), ['Ana Martin', 'Gina Bergonié'], 'OU entre un domaine et une compétence d\'un autre domaine');
    assert.equal(await badge(page).textContent(), '2');

    await page.mouse.click(5, 5);
    await page.locator('.contact-card').first().locator('.tag-instances').click(); // Instances : CME, que seule Ana a
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin'], 'ET avec un autre filtre');
  }));

test('les nombres des domaines tiennent compte de l\'interrupteur Partenaires et des autres filtres, pas des compétences cochées', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await domainCounts(page), { Cancérologie: '1', Pharmacie: '0', Autres: '1' });
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    assert.deepEqual(await domainCounts(page), { Cancérologie: '1', Pharmacie: '1', Autres: '1' }, 'Bob, partenaire, compte pour Pharmacie');

    await openSkills(page);
    await domainBox(page, 'Pharmacie').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Bob Durand']);
    assert.deepEqual(await domainCounts(page), { Cancérologie: '1', Pharmacie: '1', Autres: '1' },
      'cocher Pharmacie ne vide pas le nombre des autres domaines : ce nombre dit ce que donnerait chaque case');
    assert.deepEqual(await optionCounts(skillsFilter(page)), { Hématologie: '1', Oncologie: '1', Pharmacovigilance: '1', Divers: '1' });

    await page.locator('.contact-card').first().locator('.etablissement-tag').click(); // Établissement : UBM
    await waitForCards(page, 1);
    assert.deepEqual(await domainCounts(page), { Cancérologie: '0', Pharmacie: '1', Autres: '0' }, 'un autre filtre s\'applique aux domaines');
  }));

test('la recherche du menu Compétences trouve un domaine comme une compétence, sans tenir compte des accents ni de la casse', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    const search = skillsFilter(page).locator('.filter-search-input');

    await search.fill('CANCERO'); // le nom d'un domaine : il garde toutes ses compétences
    assert.deepEqual(await visibleDomains(page), ['Cancérologie']);
    assert.deepEqual(await visibleSkills(page), ['Hématologie', 'Oncologie'], 'le domaine trouvé est déplié, avec tout son détail');

    await search.fill('hemato'); // le nom d'une compétence : son domaine la situe, seule elle reste
    assert.deepEqual(await visibleDomains(page), ['Cancérologie']);
    assert.deepEqual(await visibleSkills(page), ['Hématologie']);

    await search.fill('divers'); // une compétence du groupe « Autres »
    assert.deepEqual(await visibleDomains(page), ['Autres']);
    assert.deepEqual(await visibleSkills(page), ['Divers']);

    await search.fill('zzz');
    assert.deepEqual(await visibleDomains(page), []);

    await search.fill('');
    assert.deepEqual(await visibleDomains(page), ['Cancérologie', 'Pharmacie', 'Autres']);
    assert.deepEqual(await visibleSkills(page), [], 'sans recherche, chaque domaine retrouve son état : tous repliés');
    assert.equal(await badge(page).isHidden(), true, 'chercher ne coche rien');
    assert.equal(await cardCount(page), 4);
  }));

test('pendant une recherche tout est déplié, sans le bouton de dépli ; en l\'effaçant, un domaine déplié à la main le reste', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domain(page, 'Autres').locator('.group-toggle').click(); // déplié à la main
    const search = skillsFilter(page).locator('.filter-search-input');
    await search.fill('o');
    assert.equal(await skillsFilter(page).locator('.filter-menu').evaluate(menu => menu.classList.contains('searching')), true);
    assert.equal(await domain(page, 'Cancérologie').locator('.group-toggle').isVisible(), false, 'le bouton ne sert plus pendant la recherche');
    assert.ok((await visibleSkills(page)).includes('Oncologie'), 'un domaine replié s\'ouvre pour montrer ce qui correspond');
    await search.fill('');
    assert.deepEqual(await visibleSkills(page), ['Divers'], 'seul le domaine déplié à la main l\'est encore');
    assert.equal(await domain(page, 'Cancérologie').locator('.group-toggle').isVisible(), true);
  }));

test('un tag de carte coche la compétence, et à l\'ouverture suivante son domaine passe devant', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    await page.locator('.contact-card', { hasText: 'Bob Durand' }).locator('.tag-competences').click();
    await waitForCards(page, 1);
    assert.equal(await badge(page).textContent(), '1');
    assert.equal(await domainBox(page, 'Pharmacie').isChecked(), true, 'Pharmacovigilance est la seule compétence de son domaine : le domaine est complet');

    await openSkills(page);
    assert.deepEqual(await domainNames(page), ['Pharmacie', 'Cancérologie', 'Autres'], 'le domaine qui contient une coche passe devant');
    assert.equal(await domain(page, 'Pharmacie').evaluate(group => group.classList.contains('open')), false, 'un domaine complet reste replié : sa case dit tout');

    // Une carte qui n'a plus de coche : à l'ouverture suivante, l'ordre d'origine revient.
    await domainBox(page, 'Pharmacie').uncheck();
    await waitForCards(page, 5);
    await page.mouse.click(5, 5);
    await openSkills(page);
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Pharmacie', 'Autres']);
  }));

test('rien ne bouge pendant qu\'on coche ; à la réouverture, un domaine coché en partie est déplié et ses compétences cochées passent devant', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domain(page, 'Cancérologie').locator('.group-toggle').click();
    await skill(page, 'Oncologie').locator('input').check();
    await waitForCards(page, 1);
    assert.deepEqual(await visibleSkills(page), ['Hématologie', 'Oncologie'], 'la compétence qu\'on vient de cocher reste sous les yeux');
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Pharmacie', 'Autres']);

    await domainBox(page, 'Autres').check(); // un domaine complet
    await domain(page, 'Cancérologie').locator('.group-toggle').click(); // replié à la main
    await page.mouse.click(5, 5);
    assert.equal(await skillsFilter(page).evaluate(filter => filter.classList.contains('open')), false, 'un clic dehors referme le menu');

    await openSkills(page);
    assert.equal(await domain(page, 'Cancérologie').locator('.group-toggle').getAttribute('aria-expanded'), 'true', 'coché en partie : déplié pour montrer lesquelles');
    assert.deepEqual(await visibleSkills(page), ['Oncologie', 'Hématologie'], 'la compétence cochée passe devant l\'autre');
    assert.equal(await domain(page, 'Autres').locator('.group-toggle').getAttribute('aria-expanded'), 'false', 'un domaine complet reste replié');
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Autres', 'Pharmacie'], 'les domaines cochés d\'abord, chacun à sa place d\'origine');
  }));

test('une compétence décochée retrouve sa place alphabétique à la réouverture suivante, comme dans les autres menus', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domain(page, 'Cancérologie').locator('.group-toggle').click();
    assert.deepEqual(await visibleSkills(page), ['Hématologie', 'Oncologie']);
    await skill(page, 'Oncologie').locator('input').check();
    await page.mouse.click(5, 5);
    await openSkills(page);
    assert.deepEqual(await visibleSkills(page), ['Oncologie', 'Hématologie'], 'cochée : en tête');

    await skill(page, 'Oncologie').locator('input').uncheck();
    assert.deepEqual(await visibleSkills(page), ['Oncologie', 'Hématologie'], 'rien ne bouge pendant qu\'on décoche');
    await page.mouse.click(5, 5);
    await openSkills(page);
    assert.deepEqual(await visibleSkills(page), ['Hématologie', 'Oncologie'], 'décochée : de retour à sa place alphabétique');
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Pharmacie', 'Autres']);
  }));

test('Réinitialiser décoche les domaines, referme le détail et vide la recherche du menu', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domainBox(page, 'Cancérologie').check();
    await domain(page, 'Cancérologie').locator('.group-toggle').click();
    await skillsFilter(page).locator('.filter-search-input').fill('onco');
    await waitForCards(page, 1);

    await page.click('#resetFilters');
    await waitForCards(page, 4);
    assert.equal(await badge(page).isHidden(), true);
    assert.equal(await skillsFilter(page).locator('.filter-search-input').inputValue(), '');
    await openSkills(page);
    assert.deepEqual(await visibleDomains(page), ['Cancérologie', 'Pharmacie', 'Autres']);
    assert.deepEqual(await visibleSkills(page), [], 'tous les domaines sont repliés');
    assert.equal(await skillsFilter(page).locator('input:checked, input:indeterminate').count(), 0);
  }));

test('une modification dans Grist (un domaine renommé, une compétence reclassée) met le menu à jour sans perdre la sélection', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    await openSkills(page);
    await skill(page, 'Pharmacovigilance').evaluate(option => option.closest('.filter-group').querySelector('.group-toggle').click());
    await skill(page, 'Pharmacovigilance').locator('input').check();
    await waitForCards(page, 1);

    await page.evaluate(() => { window.__tables.Competences.Macro_competences[2] = 'Pharmacologie'; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('.filter-group[data-value="Pharmacologie"]'));
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Pharmacologie', 'Autres'], 'le domaine renommé');
    assert.equal(await badge(page).textContent(), '1', 'la compétence cochée l\'est toujours');
    assert.deepEqual(await cardNames(page), ['Bob Durand']);

    await page.evaluate(() => { window.__tables.Competences.Macro_competences[2] = ''; });
    await reload(page);
    await page.waitForFunction(() => !document.querySelector('.filter-group[data-value="Pharmacologie"]'));
    assert.deepEqual(await domainNames(page), ['Cancérologie', 'Autres'], 'plus de compétence classée Pharmacologie : plus de groupe');
    assert.equal(await skill(page, 'Pharmacovigilance').locator('input').isChecked(), true, 'reclassée sous « Autres », toujours cochée');
    assert.equal(await domain(page, 'Autres').locator('.filter-option', { hasText: 'Pharmacovigilance' }).count(), 1);
    assert.deepEqual(await cardNames(page), ['Bob Durand']);
  }));

test('quand Grist change un libellé, les menus sont reconstruits : un domaine coché en entier reste coché et le badge compte toujours un', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await openSkills(page);
    await domainBox(page, 'Cancérologie').check();
    await waitForCards(page, 1);
    assert.equal(await badge(page).textContent(), '1');

    await page.evaluate(() => { window.__tables.Competences.Macro_competences[2] = 'Pharmacologie'; });
    await reload(page);
    await page.waitForFunction(() => document.querySelector('.filter-group[data-value="Pharmacologie"]'));
    assert.equal(await badge(page).textContent(), '1', 'un domaine entier compte pour un, aussi quand le menu est reconstruit');
    assert.equal(await domainBox(page, 'Cancérologie').isChecked(), true);
    assert.equal(await domain(page, 'Cancérologie').locator('.group-head').evaluate(head => head.classList.contains('checked')), true);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);
  }));

test('sans colonne Macro_competences : le bandeau le dit, le menu Compétences reste plat et fonctionne', { skip }, () => {
  const tables = sampleTables();
  delete tables.Competences.Macro_competences;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForBanner(page);
    assert.match(await bannerText(page), /Competences \(Macro_competences\)/);
    assert.equal(await skillsFilter(page).locator('.filter-group').count(), 0, 'pas de faux domaine « Autres » pour tout le monde');
    assert.equal(await skillsFilter(page).locator('.filter-option').count(), 4, 'les quatre compétences, à plat');
    await openSkills(page);
    await skill(page, 'Oncologie').locator('input').check();
    await waitForCards(page, 1);
    assert.deepEqual(await cardNames(page), ['Ana Martin']);
    assert.equal(await badge(page).textContent(), '1');
    assert.equal(await skillsFilter(page).locator('.filter-search-input').getAttribute('placeholder'), 'Rechercher dans Compétences…',
      'plus de domaine à chercher : le champ n\'en parle plus');
    assert.equal(await skillsFilter(page).locator('.filter-button').getAttribute('title'), null, 'ni l\'infobulle sur les domaines à cocher');
  });
});

test('le menu Compétences reste utilisable au clavier : cases et boutons atteignables, état de dépli annoncé', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await skillsFilter(page).locator('.filter-button').focus();
    await page.keyboard.press('Enter'); // ouvre le menu
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'filter-search-input');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.filter-group')?.dataset.value), 'Cancérologie');
    await page.keyboard.press('Space'); // la case du domaine
    await waitForCards(page, 1);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'group-toggle', 'puis le bouton de dépli');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-expanded')), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Détail de Cancérologie');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.filter-option')?.dataset.value), 'Hématologie', 'les compétences dépliées suivent');
    assert.equal(await page.evaluate(() => document.activeElement.checked), true);
  }));

test('chaque option de menu affiche le nombre de cartes qu\'elle donnerait', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const counts = () => page.locator('.filter[data-filter-key="instances"] .filter-option').evaluateAll(options =>
      Object.fromEntries(options.map(option => [option.querySelector('.option-label').textContent,
        option.querySelector('.option-count').textContent])));
    assert.deepEqual(await counts(), { CME: '1', COVIRIS: '0' }, 'Bob (COVIRIS) est masqué par défaut');
    await page.click('[data-scope="partenaire"]');
    await waitForCards(page, 5);
    assert.deepEqual(await counts(), { CME: '2', COVIRIS: '1' });
  }));

test('la recherche interne d\'un menu ignore les accents', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const filter = page.locator('.filter[data-filter-key="communautes"]');
    await filter.locator('.filter-button').click();
    await filter.locator('.filter-search-input').fill('reseau');
    assert.equal(await filter.locator('.filter-option', { hasText: 'Réseau douleur' }).isVisible(), true);
    assert.equal(await filter.locator('.filter-option', { hasText: 'Soins palliatifs' }).isVisible(), false);
  }));

test('le menu Établissement ne propose pas un établissement non validé', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const labels = await page.locator('.filter[data-filter-key="etablissement"] .option-label').allTextContents();
    assert.ok(labels.includes('CHU') && labels.includes('Institut Bergonié'));
    assert.ok(!labels.includes('INSERM'));
  }));

// ===== Pannes : jamais un faux « 0 contact » silencieux =====

test('panne de lecture d\'Etablissements au démarrage : message explicite, pas de « 0 contact » trompeur', { skip }, () =>
  withWidget({ failTables: ['Etablissements'] }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Etablissements/);
    assert.equal(await resultCount(page), 'Chargement impossible');
    assert.equal(await cardCount(page), 0);
  }));

test('panne de lecture de BDD au démarrage : message explicite', { skip }, () =>
  withWidget({ failTables: ['BDD'] }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /BDD/);
    assert.equal(await resultCount(page), 'Chargement impossible');
  }));

test('panne après un chargement réussi : les cartes restent, le bandeau apparaît puis disparaît au retour à la normale', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    await page.evaluate(() => { window.__failTables = ['Etablissements']; });
    await reload(page);
    await waitForBanner(page);
    assert.equal(await cardCount(page), 4, 'on ne vide pas l\'affichage sur une panne passagère');
    assert.equal(await resultCount(page), '4 contacts');

    await page.evaluate(() => { window.__failTables = []; });
    await reload(page);
    await waitForBanner(page, false);
    assert.equal(await cardCount(page), 4);
  }));

test('table de référence illisible : données partielles signalées, filtres et menus conservés', { skip }, () =>
  withWidget({}, async ({ page }) => {
    await waitForCards(page, 4);
    const filter = page.locator('.filter[data-filter-key="actions"]');
    await filter.locator('.filter-button').click();
    await filter.locator('.filter-option', { hasText: 'Vaccination' }).locator('input').check();
    await waitForCards(page, 1);

    await page.evaluate(() => { window.__failTables = ['Actions']; });
    await reload(page);
    await waitForBanner(page);
    assert.match(await bannerText(page), /Actions/);
    assert.equal(await cardCount(page), 1, 'la sélection Vaccination n\'est pas effacée par la panne');
    assert.equal(await filter.locator('.filter-count').textContent(), '1');
    assert.equal(await filter.locator('.filter-option', { hasText: 'Vaccination' }).count(), 1, 'le menu garde ses options');
  }));

test('acronymes en double : chaque contact garde le statut de sa propre ligne d\'Etablissements, sans bandeau', { skip }, () => {
  const tables = sampleTables();
  // Deuxième ligne « CHU » non validée, mais aucun contact n'y est rattaché.
  tables.Etablissements.id.push(6);
  tables.Etablissements.acronyme.push('CHU');
  tables.Etablissements.nom_complet.push('CHU (doublon)');
  tables.Etablissements.fondateur.push(true);
  tables.Etablissements.partenaire.push(false);
  tables.Etablissements.autres.push(false);
  tables.Etablissements.ok_pour_apparaitre.push(false);
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.deepEqual(await cardNames(page), DEFAULT_CARD_NAMES);
    assert.equal(await page.locator('#statusBanner').isHidden(), true);
  });
});

test('colonne Etablissement absente de BDD : erreur explicite au lieu de « 0 contact »', { skip }, () => {
  const tables = sampleTables();
  delete tables.BDD.Etablissement;
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Etablissement/);
    assert.equal(await resultCount(page), 'Chargement impossible');
  });
});

test('colonne de visibilité absente d\'Etablissements : erreur explicite au lieu de « 0 contact »', { skip }, () => {
  const tables = sampleTables();
  delete tables.Etablissements.ok_pour_apparaitre;
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /ok_pour_apparaitre/);
    assert.equal(await resultCount(page), 'Chargement impossible');
  });
});

test('colonne de libellé introuvable dans une table de référence : le bandeau le dit, les cartes restent', { skip }, () => {
  const tables = sampleTables();
  delete tables.Actions.Actions;
  delete tables.Actions.Actions_corrigees;
  return withWidget({ tables }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForBanner(page);
    assert.match(await bannerText(page), /Actions \(Actions_corrigees ou Actions\)/);
    assert.equal(await page.locator('.filter[data-filter-key="actions"] .filter-option').count(), 0, 'le menu Actions n\'a aucune option');
    assert.ok(await page.locator('.filter[data-filter-key="instances"] .filter-option').count() > 0, 'les autres menus restent');
    assert.equal(await page.locator('.contact-card').first().locator('.tag-group-title', { hasText: 'Instances' }).count(), 1);
  });
});

test('Etablissement vide pour tous les contacts : le bandeau le dit', { skip }, () => {
  const tables = sampleTables();
  tables.BDD.Etablissement = tables.BDD.Etablissement.map(() => 0);
  return withWidget({ tables }, async ({ page }) => {
    await waitForBanner(page);
    assert.match(await bannerText(page), /Etablissement est vide/);
    assert.equal(await cardCount(page), 0);
  });
});

test('contacts sans Etablissement : diagnostic console par identifiant, sans adresse email', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    const diagnostic = (await Promise.all(logs.warnings)).find(line => line.includes('[ETABLISSEMENT]'));
    assert.ok(diagnostic, 'avertissement présent');
    assert.ok(!diagnostic.includes('@'), 'aucune adresse email dans la console');
    assert.match(diagnostic, /\[5\]/, 'l\'identifiant de ligne d\'Eve (5) permet de la retrouver dans Grist');
  }));

// ===== Ma présence : identité de la personne connectée et interrupteur =====

const accountBar = page => page.locator('#accountBar');
const presenceSwitch = page => page.locator('#accountBar .presence-switch');
const waitForAccountBar = (page, visible = true) =>
  page.waitForFunction(expected => !document.getElementById('accountBar').hidden === expected, visible);
const isSwitchOn = async page => (await presenceSwitch(page).getAttribute('aria-checked')) === 'true';
const accountMessage = page => page.locator('#accountBar .account-detail').textContent();
const accountStatus = page => page.locator('#accountBar .account-status').textContent();
const grist = page => page.evaluate(() => window.__fake.calls);
const writesTo = async (page, table) => (await grist(page)).filter(call => call.table === table);
const identityLogs = async logs => (await Promise.all([...logs.warnings, ...logs.infos])).filter(line => line.includes('[IDENTITE]'));

// Pas de table-sonde : personne n'est identifié, l'annuaire s'affiche comme avant.
test('sans table-sonde (Annuaire_Sonde) personne n\'est identifié : pas de bandeau, annuaire intact, aucune écriture', { skip }, () =>
  withWidget({ user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => window.__fake.calls !== undefined);
    assert.equal(await accountBar(page).isHidden(), true);
    assert.deepEqual(await grist(page), [], 'rien n\'est écrit dans le document');
    const warning = (await Promise.all(logs.warnings)).find(line => line.includes('[IDENTITE]'));
    assert.match(warning, /Annuaire_Sonde.*GRIST_SETUP\.md/);
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('compte Lecteur (?readonly=true) : pas de bandeau et aucune tentative d\'écriture', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, readOnly: true }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await accountBar(page).isHidden(), true);
    assert.deepEqual(await grist(page), [], 'un Lecteur ne peut rien écrire : le widget n\'essaie pas');
  }));

test('une personne identifiée qui apparaît voit son nom, sa situation et l\'interrupteur allumé', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await waitForAccountBar(page);
    assert.equal(await accountBar(page).locator('.account-name').textContent(), 'Ana Martin');
    assert.equal(await accountBar(page).locator('.account-avatar').textContent(), 'AM');
    assert.equal(await accountMessage(page), 'Vous apparaissez dans l\'annuaire.');
    assert.equal(await isSwitchOn(page), true);
    assert.equal(await presenceSwitch(page).getAttribute('role'), 'switch');
    assert.equal(await accountStatus(page), '');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('l\'identification laisse le document propre : la ligne de la sonde est retirée, rien d\'autre n\'est écrit', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForAccountBar(page);
    await page.waitForFunction(() => window.__fake.calls.some(call => call.action === 'RemoveRecord'));
    assert.deepEqual((await grist(page)).map(call => [call.action, call.table]),
      [['AddRecord', 'Annuaire_Sonde'], ['RemoveRecord', 'Annuaire_Sonde']]);
    assert.deepEqual(await page.evaluate(() => window.__tables.Annuaire_Sonde.id), []);
  }));

test('l\'adresse d\'une personne n\'est jamais écrite dans la console', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForAccountBar(page);
    const lines = await identityLogs(logs);
    assert.ok(lines.length > 0, 'l\'identification est journalisée');
    assert.ok(lines.every(line => !line.includes('@')));
  }));

test('l\'interrupteur fait apparaître puis disparaître la personne, en écrivant seulement Accepte_apparaitre de sa ligne', { skip }, () =>
  withWidget({ tables: withIdentity(), user: IRIS_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await waitForAccountBar(page);
    assert.equal(await isSwitchOn(page), false);
    assert.equal(await accountMessage(page), 'Vous n\'apparaissez pas dans l\'annuaire.');
    assert.ok(!(await cardNames(page)).includes('Iris Refus'));

    await presenceSwitch(page).click();
    await waitForCards(page, 5);
    assert.ok((await cardNames(page)).includes('Iris Refus'), 'sa carte apparaît sans rechargement manuel');
    assert.equal(await isSwitchOn(page), true);
    assert.equal(await accountMessage(page), 'Vous apparaissez dans l\'annuaire.');
    assert.equal(await accountStatus(page), '');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Accepte_apparaitre[10]), true);

    await presenceSwitch(page).click();
    await waitForCards(page, 4);
    assert.equal(await isSwitchOn(page), false);
    assert.equal(await page.evaluate(() => window.__tables.BDD.Accepte_apparaitre[10]), false);

    assert.deepEqual((await writesTo(page, 'BDD')).map(call => [call.action, call.rowId, call.values]),
      [['UpdateRecord', 11, { Accepte_apparaitre: true }], ['UpdateRecord', 11, { Accepte_apparaitre: false }]],
      'seule la case de la ligne d\'Iris est écrite, deux fois');
  }));

test('une personne qui n\'a jamais répondu (case vide) est invitée comme les autres, et un clic coche la case', { skip }, () =>
  withWidget({ tables: withIdentity(), user: 'jules@chu-bordeaux.fr' }, async ({ page }) => {
    await waitForAccountBar(page);
    assert.equal(await isSwitchOn(page), false);
    await presenceSwitch(page).click();
    await waitForCards(page, 5);
    assert.strictEqual(await page.evaluate(() => window.__tables.BDD.Accepte_apparaitre[11]), true);
  }));

test('l\'interrupteur se range pendant l\'écriture : un double clic n\'écrit qu\'une fois', { skip }, () =>
  withWidget({ tables: withIdentity(), user: IRIS_EMAIL, delay: 150 }, async ({ page }) => {
    await waitForAccountBar(page);
    await presenceSwitch(page).dblclick();
    await waitForCards(page, 5);
    assert.equal((await writesTo(page, 'BDD')).length, 1);
    assert.equal(await isSwitchOn(page), true);
    assert.equal(await presenceSwitch(page).isEnabled(), true, 'l\'interrupteur redevient utilisable');
  }));

test('écriture refusée par les règles d\'accès de Grist : message clair, rien ne change, l\'interrupteur reste utilisable', { skip }, () =>
  withWidget({ tables: withIdentity(), user: IRIS_EMAIL, denyWrites: ['BDD'] }, async ({ page, logs }) => {
    await waitForAccountBar(page);
    await presenceSwitch(page).click();
    await page.waitForFunction(() => document.querySelector('#accountBar .account-status').textContent !== '');
    assert.match(await accountStatus(page), /^Grist a refusé la modification/);
    assert.equal(await page.locator('#accountBar .account-status').getAttribute('data-tone'), 'error');
    assert.equal(await isSwitchOn(page), false, 'l\'interrupteur montre l\'état réel, pas le souhait');
    assert.equal(await cardCount(page), 4);
    assert.equal(await page.evaluate(() => window.__tables.BDD.Accepte_apparaitre[10]), false);
    assert.equal(await presenceSwitch(page).isEnabled(), true);
    assert.ok((await Promise.all(logs.errors)).some(line => line.includes('[PRESENCE]')), 'le détail est dans la console');
  }));

test('après une erreur, un nouvel essai réussi efface le message d\'erreur', { skip }, () =>
  withWidget({ tables: withIdentity(), user: IRIS_EMAIL, denyWrites: ['BDD'] }, async ({ page }) => {
    await waitForAccountBar(page);
    await presenceSwitch(page).click();
    await page.waitForFunction(() => document.querySelector('#accountBar .account-status').textContent !== '');
    await page.evaluate(() => { window.__denyWrites = []; });
    await presenceSwitch(page).click();
    await waitForCards(page, 5);
    assert.equal(await accountStatus(page), '');
    assert.equal(await isSwitchOn(page), true);
  }));

test('une personne identifiée sans fiche dans BDD voit une mention sans interrupteur, et la console dit pourquoi sans citer d\'adresse', { skip }, () =>
  withWidget({ tables: withIdentity(), user: 'inconnu@example.fr' }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => window.__fake.calls.some(call => call.action === 'RemoveRecord'));
    await accountBar(page).waitFor();
    assert.equal(await accountBar(page).locator('.account-name').textContent(), 'Compte absent de l\'annuaire');
    assert.equal(await accountBar(page).locator('.account-avatar').textContent(), '?');
    assert.equal(await accountBar(page).locator('.account-detail').textContent(),
      'Connecté avec inconnu@example.fr : cette adresse ne figure pas dans l\'annuaire, il n\'y a donc pas de fiche à modifier.');
    assert.equal(await presenceSwitch(page).isHidden(), true, 'aucune fiche, aucun choix de présence');
    assert.equal(await accountBar(page).locator('.account-edit').isHidden(), true);
    assert.equal(await accountBar(page).locator('.account-admin').isHidden(), true);
    const warning = (await identityLogs(logs)).find(line => line.includes('Aucune ligne de BDD'));
    assert.ok(warning, 'avertissement présent');
    assert.ok(!warning.includes('@'));
  }));

test('BDD sans colonne email : le bandeau accuse la configuration, la console l\'explique, annuaire intact', { skip }, () => {
  const tables = withIdentity();
  delete tables.BDD.email;
  return withWidget({ tables, user: BOB_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => window.__fake.calls.some(call => call.action === 'RemoveRecord'));
    await accountBar(page).waitFor();
    assert.equal(await accountBar(page).locator('.account-name').textContent(), 'Fiche introuvable');
    assert.equal(await accountBar(page).locator('.account-detail').textContent(),
      'Le widget ne peut pas retrouver votre fiche : la colonne « email » n\'existe pas dans BDD. Contactez un administrateur.');
    assert.equal(await presenceSwitch(page).isHidden(), true);
    assert.ok((await identityLogs(logs)).some(line => line.includes('colonne « email »')));
    assert.deepEqual(await Promise.all(logs.errors), []);
  });
});

test('un partenaire apprend qu\'il faut l\'interrupteur Partenaires pour le voir', { skip }, () =>
  withWidget({ tables: withIdentity(), user: BOB_EMAIL }, async ({ page }) => {
    await waitForAccountBar(page);
    assert.match(await accountMessage(page), /visible avec l'interrupteur « Partenaires »/);
    assert.equal(await isSwitchOn(page), true);
    assert.ok(!(await cardNames(page)).includes('Bob Durand'));
  }));

test('une personne qui a accepté mais reste masquée en apprend la raison', { skip }, () =>
  withWidget({ tables: withIdentity(), user: 'dan@inserm.fr' }, async ({ page }) => {
    await waitForAccountBar(page);
    assert.equal(await isSwitchOn(page), true, 'elle a bien accepté');
    assert.match(await accountMessage(page), /votre établissement n'a pas encore été validé/);
    assert.equal(await page.locator('#accountBar .account-detail').getAttribute('data-tone'), 'warn');
  }));

test('le nom d\'une personne s\'affiche en texte brut dans le bandeau (aucune injection)', { skip }, () =>
  withWidget({ tables: withIdentity(), user: 'hostile@chu-bordeaux.fr' }, async ({ page }) => {
    await waitForAccountBar(page);
    assert.equal(await accountBar(page).locator('.account-name').textContent(), `${HOSTILE_FIRST_NAME} Hostile`);
    assert.equal(await accountBar(page).locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  }));

test('une panne de la table-sonde n\'empêche jamais l\'annuaire de s\'afficher', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL, failTables: ['Annuaire_Sonde'] }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => window.__fake.calls.some(call => call.action === 'RemoveRecord'));
    assert.equal(await accountBar(page).isHidden(), true);
    assert.equal(await page.locator('#statusBanner').isHidden(), true, 'pas de bandeau d\'erreur pour une identité introuvable');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('le bandeau suit les modifications faites dans Grist : l\'accord retiré à la main éteint l\'interrupteur', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page }) => {
    await waitForAccountBar(page);
    assert.equal(await isSwitchOn(page), true);
    await page.evaluate(() => { window.__tables.BDD.Accepte_apparaitre[0] = false; });
    await reload(page);
    await waitForCards(page, 3);
    await page.waitForFunction(() => document.querySelector('.presence-switch').getAttribute('aria-checked') === 'false');
    assert.equal(await accountMessage(page), 'Vous n\'apparaissez pas dans l\'annuaire.');
  }));
