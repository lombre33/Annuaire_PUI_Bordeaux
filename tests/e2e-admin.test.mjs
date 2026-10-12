// Test navigateur de la fenêtre des administrateurs : lire les demandes, les valider,
// les refuser, en valider plusieurs d'un coup, et ce qui est (et n'est pas) écrit dans
// Grist. Même principe que tests/e2e.test.mjs (voir tests/support/browser.mjs) ; la
// fenêtre « Modifier mon profil » est dans tests/e2e-profile.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withIdentity, withRequests, withSchema, addRequest, HOSTILE_FIRST_NAME, ANA_EMAIL, BOB_EMAIL, IRIS_EMAIL, ADMIN_EMAIL
} from './fixtures.mjs';
import { skip, withWidget, waitForCards, cardNames } from './support/browser.mjs';

// Un document complet : identité, demandes et métadonnées de colonnes.
const world = () => withRequests(withSchema(withIdentity()));

const HOSTILE_EMAIL = 'hostile@chu-bordeaux.fr';
const JULES_EMAIL = 'jules@chu-bordeaux.fr';
const DAN_EMAIL = 'dan@inserm.fr';

// Trois demandes à traiter, de trois fiches : Ana (CHU), Bob (UBM) et Iris (CHU). Les
// personnes qui les ont déposées ne sont pas administratrices ici : l'administrateur
// connecté est ADMIN_EMAIL, qui n'a pas de fiche dans BDD.
function seeded() {
  const tables = world();
  const ana = addRequest(tables, {
    person: 1, author: ANA_EMAIL, message: 'Nouvelle fonction.',
    champs: {
      Fonction: { avant: 'Pharmacienne', apres: 'Cheffe de service' },
      numero_de_telephone: { avant: '0556789012', apres: '0556000099' }
    }
  });
  const bob = addRequest(tables, {
    person: 2, author: BOB_EMAIL,
    champs: { Fonction: { avant: 'Chargé de mission', apres: 'Chef de projet' } }
  });
  const iris = addRequest(tables, {
    person: 11, author: IRIS_EMAIL,
    champs: {
      numero_de_telephone: { avant: '', apres: '0556000011' },
      Taches: { ajout: [{ id: 1, label: 'Relecture' }], retrait: [] }
    }
  });
  return { tables, ana, bob, iris };
}

const adminButton = page => page.locator('.account-admin');
const dialog = page => page.locator('#adminDialog');
const requestCards = page => dialog(page).locator('.req');
const card = (page, id) => dialog(page).locator(`.req[data-request-id="${id}"]`);
const adminStatus = page => dialog(page).locator('[data-admin-status]');
const tabPending = page => dialog(page).locator('#adminTabPending');
const tabDone = page => dialog(page).locator('#adminTabDone');
const bulkButton = page => dialog(page).locator('[data-admin-bulk]');
const grist = page => page.evaluate(() => window.__fake.calls);
const writesTo = async (page, table) => (await grist(page)).filter(call => call.table === table);
const rowText = async node => (await node.innerText()).replace(/\s+/g, ' ').trim();
const namesOf = page => requestCards(page).locator('.req-name').allTextContents();
const buttonOf = (page, id, name) => card(page, id).getByRole('button', { name, exact: true });
const isOpen = page => dialog(page).evaluate(node => node.open);
const byNumber = (a, b) => a - b;

// Ouvre la fenêtre et attend que les demandes soient affichées.
async function openAdmin(page) {
  await waitForCards(page, 4);
  await adminButton(page).waitFor();
  await adminButton(page).click();
  await dialog(page).waitFor();
  await page.waitForFunction(() => /\(\d+\)/.test(document.getElementById('adminTabPending').textContent));
}

const waitStatus = (page, text) =>
  page.waitForFunction(expected => document.querySelector('[data-admin-status]').textContent === expected, text);

// ===== Qui voit quoi =====

test('un compte qui n\'est pas administrateur ne voit jamais le bouton des demandes, même quand il y en a', { skip }, () => {
  const { tables } = seeded();
  return withWidget({ tables, user: BOB_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar:not([hidden])').waitFor();
    await page.locator('.account-edit').waitFor();
    assert.equal(await adminButton(page).isHidden(), true);
  });
});

test('l\'administrateur voit combien de demandes l\'attendent, et un libellé simple quand il n\'y en a aucune', { skip }, async () => {
  const { tables } = seeded();
  await withWidget({ tables, user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await adminButton(page).waitFor();
    assert.equal(await adminButton(page).textContent(), '3 demandes à valider');
    assert.equal(await adminButton(page).getAttribute('data-zero'), 'false');
    assert.deepEqual(await Promise.all(logs.errors), []);
  });

  const single = world();
  addRequest(single, { person: 2, author: BOB_EMAIL, champs: { Fonction: { avant: 'Chargé de mission', apres: 'Chef' } } });
  await withWidget({ tables: single, user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await adminButton(page).waitFor();
    assert.equal(await adminButton(page).textContent(), '1 demande à valider');
  });

  await withWidget({ tables: world(), user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await adminButton(page).waitFor();
    assert.equal(await adminButton(page).textContent(), 'Demandes de modification');
    assert.equal(await adminButton(page).getAttribute('data-zero'), 'true');
  });
});

test('une administratrice sans fiche dans BDD ne voit que les demandes : ni interrupteur ni modification de fiche', { skip }, () =>
  withWidget({ tables: seeded().tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await adminButton(page).waitFor();
    assert.equal(await page.locator('.account-name').textContent(), 'Administration');
    assert.equal(await page.locator('.presence-switch').isHidden(), true);
    assert.equal(await page.locator('.account-avatar').isHidden(), true);
    assert.equal(await page.locator('.account-edit').isHidden(), true);
  }));

test('une administratrice qui a aussi sa fiche voit les deux boutons, et sa propre demande est signalée', { skip }, () => {
  const { tables, ana } = seeded();
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await adminButton(page).waitFor();
    await page.locator('.account-edit').waitFor();
    assert.equal(await page.locator('.presence-switch').isVisible(), true);
    await adminButton(page).click();
    await dialog(page).waitFor();
    await card(page, ana).waitFor();
    assert.equal(await card(page, ana).locator('.badge-self').textContent(), 'Votre demande');
    assert.equal(await requestCards(page).locator('.badge-self').count(), 1, 'les demandes des autres ne portent pas ce signe');
  });
});

// ===== Lire les demandes =====

test('la fenêtre liste les demandes à valider, les plus anciennes d\'abord, avec leur détail', { skip }, () => {
  const { tables, ana, bob, iris } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await openAdmin(page);
    assert.equal(await dialog(page).getAttribute('aria-labelledby'), 'adminTitle');
    assert.equal(await tabPending(page).textContent(), 'À valider (3)');
    assert.equal(await tabDone(page).textContent(), 'Traitées (0)');
    assert.equal(await tabPending(page).getAttribute('aria-selected'), 'true');
    assert.deepEqual(await namesOf(page), ['Ana Martin', 'Bob Durand', 'Iris Refus']);
    assert.equal(await requestCards(page).first().getAttribute('data-request-id'), String(ana));

    assert.equal(await card(page, ana).locator('.req-sub').textContent(), 'CHU');
    assert.equal(await card(page, bob).locator('.req-sub').textContent(), 'UBM');
    assert.equal(await card(page, ana).locator('.avatar').textContent(), 'AM');
    assert.match(await card(page, ana).locator('.req-meta').textContent(), /^Demande du \d+ \S+ · 2 champs · par ana\.martin@chu-bordeaux\.fr$/);
    assert.match(await card(page, bob).locator('.req-meta').textContent(), /^Demande du \d+ \S+ · 1 champ · par bob@u-bordeaux-montaigne\.fr$/);
    assert.equal(await card(page, ana).locator('.req-msg-label').textContent(), 'Message de la personne');
    assert.match(await card(page, ana).locator('.req-msg').textContent(), /Nouvelle fonction\.$/);
    assert.equal(await card(page, bob).locator('.req-msg').count(), 0, 'pas de mot : pas de citation');

    const lines = card(page, ana).locator('.diff-row');
    assert.equal(await lines.count(), 2);
    assert.equal(await rowText(lines.nth(0)), 'Fonction Pharmacienne → Cheffe de service');
    assert.equal(await rowText(lines.nth(1)), 'Téléphone 05 56 78 90 12 → 05 56 00 00 99');
    assert.equal(await rowText(card(page, iris).locator('.diff-row').nth(0)), 'Téléphone non renseigné → 05 56 00 00 11');
    assert.equal(await rowText(card(page, iris).locator('.diff-row').nth(1)), 'Tâches + ajouté : Relecture');

    for (const id of [ana, bob, iris]) {
      assert.equal(await buttonOf(page, id, 'Valider').isEnabled(), true);
      assert.equal(await buttonOf(page, id, 'Refuser').isEnabled(), true);
    }
    assert.equal(await dialog(page).locator('.notice').count(), 0, 'aucune alerte sur des demandes saines');
    assert.deepEqual(await writesTo(page, 'BDD'), [], 'ouvrir la fenêtre n\'écrit rien');
    assert.deepEqual(await writesTo(page, 'Annuaire_Demandes'), []);
    assert.deepEqual(await Promise.all(logs.errors), []);
  });
});

test('Échap ferme la fenêtre ; rouverte, elle repart de zéro', { skip }, () =>
  withWidget({ tables: seeded().tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await dialog(page).locator('[data-admin-search]').fill('bob');
    assert.deepEqual(await namesOf(page), ['Bob Durand']);
    // Dans un champ de recherche, Chromium utilise le premier Échap pour effacer la saisie :
    // on sort du champ pour tester la fenêtre elle-même.
    await dialog(page).locator('#adminPanel').focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('adminDialog').open);

    await adminButton(page).click();
    await dialog(page).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('#adminDialog .req').length === 3);
    assert.equal(await dialog(page).locator('[data-admin-search]').inputValue(), '');
  }));

// ===== Valider =====

test('valider une demande écrit la fiche et le statut en une seule action, et l\'annuaire se met à jour', { skip }, () => {
  const { tables, ana, bob, iris } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await openAdmin(page);
    assert.equal(await page.locator('.contact-card .fonction').first().textContent(), 'Pharmacienne');
    const before = Date.now() / 1000;
    await buttonOf(page, ana, 'Valider').click();
    await waitStatus(page, 'Demande validée.');

    assert.deepEqual(await namesOf(page), ['Bob Durand', 'Iris Refus']);
    assert.equal(await tabPending(page).textContent(), 'À valider (2)');
    assert.equal(await tabDone(page).textContent(), 'Traitées (1)');
    assert.equal(await adminButton(page).textContent(), '2 demandes à valider', 'le bouton du bandeau suit');

    const bdd = await writesTo(page, 'BDD');
    assert.deepEqual(bdd.map(call => [call.action, call.rowId, call.values]),
      [['UpdateRecord', 1, { Fonction: 'Cheffe de service', numero_de_telephone: 556000099 }]],
      'seules les deux colonnes demandées, le téléphone dans la forme de sa colonne (Numeric)');
    const demandes = await writesTo(page, 'Annuaire_Demandes');
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].rowId, ana);
    assert.equal(demandes[0].values.Statut, 'validee');
    assert.equal(demandes[0].values.Traitee_par, ADMIN_EMAIL);
    assert.equal(demandes[0].values.Motif_refus, '');
    assert.ok(demandes[0].values.Traitee_le >= before - 1 && demandes[0].values.Traitee_le <= Date.now() / 1000 + 1);
    assert.ok(demandes.every(call => call.ok) && bdd.every(call => call.ok));

    // L'annuaire montre ce que Grist contient maintenant.
    await page.waitForFunction(() => document.querySelector('.contact-card .fonction').textContent === 'Cheffe de service');
    assert.equal(await page.locator('.contact-card .tel').first().textContent(), '☎ 05 56 00 00 99');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[0]), 'Cheffe de service');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chargé de mission', 'les autres fiches ne bougent pas');

    // Les autres demandes sont intactes.
    assert.equal(await buttonOf(page, bob, 'Valider').isEnabled(), true);
    assert.equal(await buttonOf(page, iris, 'Valider').isEnabled(), true);
    assert.deepEqual(await Promise.all(logs.errors), []);

    await tabDone(page).click();
    const done = requestCards(page);
    assert.equal(await done.count(), 1);
    assert.equal(await done.first().locator('.badge-ok').textContent(), 'Validée');
    assert.match(await done.first().locator('.req-meta').textContent(), /^par admin@chu-bordeaux\.fr, le \d+ \S+$/);
  });
});

test('valider une demande qui ajoute une valeur à une liste conserve les valeurs que la fiche a déjà', { skip }, () => {
  const tables = world();
  tables.BDD.Taches[10] = ['L', 1]; // Iris a déjà « Relecture » : rien à dupliquer
  tables.BDD.Communautes[10] = ['L', 2];
  tables.Taches.id.push(2);
  tables.Taches.Taches.push('Audit');
  tables.Taches.Taches_corrige.push('');
  tables.Taches.Taches_role.push('');
  const older = addRequest(tables, { person: 11, author: IRIS_EMAIL, champs: { Taches: { ajout: [{ id: 1, label: 'Relecture' }], retrait: [] } } });
  const newer = addRequest(tables, {
    person: 11, author: IRIS_EMAIL,
    champs: { Taches: { ajout: [{ id: 1, label: 'Relecture' }, { id: 2, label: 'Audit' }], retrait: [] } }
  });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    // La demande la plus récente remplace l'ancienne de la même personne.
    assert.equal(await requestCards(page).count(), 1);
    assert.equal(await card(page, older).count(), 0);
    await buttonOf(page, newer, 'Valider').click();
    await waitStatus(page, 'Demande validée.');
    assert.deepEqual(await page.evaluate(() => window.__tables.BDD.Taches[10]), ['L', 1, 2]);
    assert.deepEqual(await page.evaluate(() => window.__tables.BDD.Communautes[10]), ['L', 2], 'les autres listes ne bougent pas');
    const [bdd] = await writesTo(page, 'BDD');
    assert.deepEqual(Object.keys(bdd.values), ['Taches']);
  });
});

test('valider la demande la plus récente d\'une personne clôt, dans la même action, celles qu\'elle avait déposées avant', { skip }, () => {
  const tables = world();
  const older = addRequest(tables, { person: 12, author: JULES_EMAIL, champs: { Fonction: { avant: '', apres: 'Premier essai' } } });
  const newer = addRequest(tables, { person: 12, author: JULES_EMAIL, champs: { Fonction: { avant: '', apres: 'Second essai' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.equal(await tabPending(page).textContent(), 'À valider (1)', 'une personne a au plus une demande à traiter');
    assert.equal(await tabDone(page).textContent(), 'Traitées (1)');
    assert.equal(await card(page, older).count(), 0);
    await buttonOf(page, newer, 'Valider').click();
    await waitStatus(page, 'Demande validée.');

    assert.deepEqual((await grist(page)).filter(call => call.table !== 'Annuaire_Sonde').map(call => [call.action, call.table, call.rowId]),
      [['UpdateRecord', 'BDD', 12], ['UpdateRecord', 'Annuaire_Demandes', newer], ['UpdateRecord', 'Annuaire_Demandes', older]]);
    assert.deepEqual(await page.evaluate(() => window.__tables.Annuaire_Demandes.Statut), ['remplacee', 'validee']);
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[11]), 'Second essai');

    await tabDone(page).click();
    assert.equal(await requestCards(page).count(), 2);
    assert.deepEqual(await requestCards(page).locator('.badge').allTextContents(), ['Validée', 'Remplacée']);
  });
});

test('la demande remplacée se lit « Remplacée par une demande plus récente » dans les demandes traitées', { skip }, () => {
  const tables = world();
  const older = addRequest(tables, { person: 12, author: JULES_EMAIL, champs: { Fonction: { avant: '', apres: 'Premier essai' } } });
  addRequest(tables, { person: 12, author: JULES_EMAIL, champs: { Fonction: { avant: '', apres: 'Second essai' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await tabDone(page).click();
    assert.equal(await card(page, older).locator('.badge').textContent(), 'Remplacée');
    assert.equal(await card(page, older).locator('.req-meta').textContent(), 'Remplacée par une demande plus récente de la même personne.');
    assert.equal(await card(page, older).getByRole('button').count(), 0, 'une demande traitée n\'a plus de bouton');
  });
});

test('une fiche modifiée depuis la demande est signalée, mais la demande peut être validée', { skip }, () => {
  const tables = world();
  const stale = addRequest(tables, { person: 2, author: BOB_EMAIL, champs: { Fonction: { avant: 'Ancien poste', apres: 'Chef de projet' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.equal(await card(page, stale).locator('.notice-pending').textContent(),
      'Fonction : la fiche a changé depuis la demande (valeur actuelle : Chargé de mission).');
    assert.equal(await buttonOf(page, stale, 'Valider').isEnabled(), true);
    await buttonOf(page, stale, 'Valider').click();
    await waitStatus(page, 'Demande validée.');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chef de projet');
  });
});

// ===== Refuser =====

test('refuser demande un motif facultatif, n\'écrit que la demande et laisse la fiche intacte', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await openAdmin(page);
    await buttonOf(page, bob, 'Refuser').click();
    const reason = card(page, bob).locator('textarea');
    assert.equal(await page.evaluate(() => document.activeElement.id), `admin-reason-${bob}`, 'le champ du motif a le focus');
    assert.equal(await card(page, bob).getByRole('button', { name: 'Valider', exact: true }).count(), 0, 'plus de bouton Valider pendant le refus');
    assert.match(await card(page, bob).locator('.reason label').textContent(), /Motif du refus \(facultatif, visible par la personne\)/);

    await reason.fill('Trop vague.');
    await buttonOf(page, bob, 'Confirmer le refus').click();
    await waitStatus(page, 'Demande refusée.');

    assert.deepEqual(await writesTo(page, 'BDD'), [], 'un refus ne touche jamais à la fiche');
    const demandes = await writesTo(page, 'Annuaire_Demandes');
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].rowId, bob);
    assert.deepEqual({ ...demandes[0].values, Traitee_le: typeof demandes[0].values.Traitee_le },
      { Statut: 'refusee', Motif_refus: 'Trop vague.', Traitee_par: ADMIN_EMAIL, Traitee_le: 'number' });
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chargé de mission');
    assert.equal(await tabPending(page).textContent(), 'À valider (2)');
    assert.deepEqual(await Promise.all(logs.errors), []);

    await tabDone(page).click();
    assert.equal(await card(page, bob).locator('.badge-ko').textContent(), 'Refusée');
    assert.match(await card(page, bob).locator('.req-meta').textContent(), /^par admin@chu-bordeaux\.fr, le \d+ \S+ : « Trop vague\. »$/);
  });
});

test('annuler un refus n\'écrit rien et le motif tapé est conservé', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await buttonOf(page, bob, 'Refuser').click();
    await card(page, bob).locator('textarea').fill('brouillon');
    await card(page, bob).locator('.reason-actions').getByRole('button', { name: 'Annuler', exact: true }).click();
    assert.equal(await buttonOf(page, bob, 'Valider').isEnabled(), true);
    assert.equal(await card(page, bob).locator('textarea').count(), 0);
    await buttonOf(page, bob, 'Refuser').click();
    assert.equal(await card(page, bob).locator('textarea').inputValue(), 'brouillon');
    assert.deepEqual((await grist(page)).filter(call => call.table !== 'Annuaire_Sonde'), []);
  });
});

test('un refus sans motif s\'enregistre avec un motif vide', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await buttonOf(page, bob, 'Refuser').click();
    await buttonOf(page, bob, 'Confirmer le refus').click();
    await waitStatus(page, 'Demande refusée.');
    assert.equal((await writesTo(page, 'Annuaire_Demandes'))[0].values.Motif_refus, '');
    await tabDone(page).click();
    assert.match(await card(page, bob).locator('.req-meta').textContent(), /^par admin@chu-bordeaux\.fr, le \d+ \S+$/);
  });
});

// ===== Les demandes qu'on ne peut que refuser =====

test('une demande déposée sous une autre adresse que celle de la fiche ne peut être que refusée', { skip }, () => {
  const tables = world();
  const forged = addRequest(tables, {
    person: 2, author: 'intrus@example.fr',
    champs: { Fonction: { avant: 'Chargé de mission', apres: 'Directeur' } }
  });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.match(await card(page, forged).locator('.notice-ko').textContent(),
      /^Cette demande ne peut pas être validée : la demande a été déposée avec une autre adresse que celle de la fiche\. Elle peut être refusée\.$/);
    assert.equal(await buttonOf(page, forged, 'Valider').isDisabled(), true);
    assert.equal(await buttonOf(page, forged, 'Refuser').isEnabled(), true);
    await buttonOf(page, forged, 'Valider').click({ force: true, timeout: 500 }).catch(() => {});
    assert.deepEqual(await writesTo(page, 'BDD'), []);
    assert.deepEqual(await writesTo(page, 'Annuaire_Demandes'), []);

    await buttonOf(page, forged, 'Refuser').click();
    await buttonOf(page, forged, 'Confirmer le refus').click();
    await waitStatus(page, 'Demande refusée.');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chargé de mission');
  });
});

test('chaque demande illisible ou piégée dit pourquoi elle ne peut pas être validée, sans rien appliquer', { skip }, () => {
  const tables = world();
  const noAuthor = addRequest(tables, { person: 3, author: '', champs: { Fonction: { avant: '', apres: 'X' } } });
  const badJson = addRequest(tables, { person: 4, author: DAN_EMAIL, changements: 'pas du json {' });
  const forbiddenField = addRequest(tables, {
    person: 5, author: 'eve@example.fr', changements: JSON.stringify({ v: 1, champs: { email: { avant: 'a', apres: 'b' } } })
  });
  const unknownRole = addRequest(tables, {
    person: 7, author: 'fred@chu-bordeaux.fr',
    champs: { Role_dans_le_PUI: { avant: { id: 0, label: '' }, apres: { id: 99, label: 'Pirate' } } }
  });
  const formula = addRequest(tables, { person: 9, author: 'gina@bergonie.fr?cc=intrus@example.fr', champs: { Fonction: { avant: 'Directrice', apres: '=HYPERLINK("http://x")' } } });
  const lostPerson = addRequest(tables, { person: 999, author: 'fantome@example.fr', champs: { Fonction: { avant: '', apres: 'X' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    const reasonOf = async id => (await card(page, id).locator('.notice-ko').textContent()).replace(/^Cette demande ne peut pas être validée : /, '').replace(/\. Elle peut être refusée\.$/, '');
    assert.equal(await reasonOf(noAuthor), 'l\'auteur de la demande n\'est pas enregistré : la colonne Email de la table des demandes doit avoir la formule user.Email');
    assert.equal(await reasonOf(badJson), 'la demande est illisible (ce n\'est pas du JSON valide)');
    assert.equal(await reasonOf(forbiddenField), 'champ non modifiable dans une demande : « email »');
    assert.equal(await reasonOf(unknownRole), 'Rôle PUI : valeur inconnue');
    assert.match(await reasonOf(formula), /Fonction : .*commencer par/);
    assert.equal(await reasonOf(lostPerson), 'la fiche concernée est introuvable (supprimée ?)');
    assert.equal(await card(page, lostPerson).locator('.req-name').textContent(), 'Fiche introuvable');
    assert.equal(await card(page, lostPerson).locator('.req-sub').textContent(), 'Établissement inconnu');
    assert.equal(await card(page, badJson).locator('.none').textContent(), 'Le détail de cette demande est illisible.');

    for (const id of [noAuthor, badJson, forbiddenField, unknownRole, formula, lostPerson]) {
      assert.equal(await buttonOf(page, id, 'Valider').isDisabled(), true, `demande ${id}`);
      assert.equal(await buttonOf(page, id, 'Refuser').isEnabled(), true, `demande ${id}`);
    }
    assert.equal(await bulkButton(page).isHidden(), true, 'rien à valider en lot');
    assert.deepEqual(await writesTo(page, 'BDD'), []);
  });
});

test('une demande sans la fiche concernée ne casse pas la liste des autres', { skip }, () => {
  const { tables, bob } = seeded();
  addRequest(tables, { person: 999, author: 'fantome@example.fr', champs: { Fonction: { avant: '', apres: 'X' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await openAdmin(page);
    assert.equal(await requestCards(page).count(), 4);
    assert.equal(await buttonOf(page, bob, 'Valider').isEnabled(), true);
    assert.deepEqual(await Promise.all(logs.errors), []);
  });
});

test('les textes d\'une demande s\'affichent en texte brut dans la fenêtre (aucune injection)', { skip }, () => {
  const tables = world();
  const hostileMessage = '<img src=x onerror="window.__xss=2">';
  const request = addRequest(tables, {
    person: 6, author: HOSTILE_EMAIL, message: hostileMessage,
    champs: { Fonction: { avant: '', apres: '<b onmouseover="window.__xss=3">gras</b>' } }
  });
  addRequest(tables, {
    person: 6, author: HOSTILE_EMAIL, status: 'refusee', by: 'admin@chu-bordeaux.fr', decidedAt: 1760100000,
    reason: '<script>window.__xss=4</script>', champs: { Fonction: { avant: '', apres: 'x' } }
  });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.equal(await card(page, request).locator('.req-name').textContent(), `${HOSTILE_FIRST_NAME} Hostile`);
    assert.ok((await card(page, request).locator('.req-msg').textContent()).endsWith(hostileMessage));
    assert.equal(await card(page, request).locator('ins').textContent(), '<b onmouseover="window.__xss=3">gras</b>');
    await tabDone(page).click();
    assert.match(await requestCards(page).locator('.req-meta').first().textContent(), /<script>window\.__xss=4<\/script>/);
    assert.equal(await dialog(page).locator('img, script, b').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  });
});

// ===== Tout valider =====

test('« Tout valider » demande une confirmation, puis valide les demandes sûres et laisse celles à examiner', { skip }, () => {
  const { tables, ana, bob, iris } = seeded();
  const stale = addRequest(tables, { person: 12, author: JULES_EMAIL, champs: { Fonction: { avant: 'Autrefois', apres: 'Maintenant' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page, logs }) => {
    await openAdmin(page);
    assert.equal(await bulkButton(page).textContent(), 'Tout valider (3)');
    assert.equal(await bulkButton(page).getAttribute('title'), '1 demande(s) à examiner une par une ne sont pas comprises.');
    assert.equal(await dialog(page).locator('[data-admin-bulk-cancel]').isHidden(), true);

    await bulkButton(page).click(); // premier clic : confirmation
    assert.equal(await bulkButton(page).textContent(), 'Confirmer : valider 3 demandes');
    assert.equal(await dialog(page).locator('[data-admin-bulk-cancel]').isVisible(), true);
    assert.deepEqual(await writesTo(page, 'BDD'), [], 'rien n\'est écrit avant la confirmation');

    await dialog(page).locator('[data-admin-bulk-cancel]').click();
    assert.equal(await bulkButton(page).textContent(), 'Tout valider (3)');
    assert.deepEqual(await writesTo(page, 'BDD'), []);

    await bulkButton(page).click();
    await bulkButton(page).click();
    await waitStatus(page, '3 demandes validées.');
    assert.equal(await adminStatus(page).getAttribute('data-tone'), 'info');
    assert.deepEqual(await namesOf(page), ['Jules Sansreponse'], 'seule la demande à examiner reste');
    assert.equal(await card(page, stale).locator('.notice-pending').count(), 1);
    assert.equal(await tabPending(page).textContent(), 'À valider (1)');
    assert.equal(await tabDone(page).textContent(), 'Traitées (3)');
    assert.equal(await bulkButton(page).isHidden(), true);
    assert.equal(await adminButton(page).textContent(), '1 demande à valider');

    const bdd = await writesTo(page, 'BDD');
    assert.deepEqual(bdd.map(call => call.rowId).sort(byNumber), [1, 2, 11]);
    assert.deepEqual((await writesTo(page, 'Annuaire_Demandes')).map(call => call.rowId).sort(byNumber), [ana, bob, iris].sort(byNumber));
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[11]), '', 'la fiche de Jules n\'a pas bougé');
    assert.deepEqual(await Promise.all(logs.errors), []);
  });
});

test('« Tout valider » n\'apparaît que s\'il y a au moins deux demandes sûres', { skip }, () => {
  const tables = world();
  addRequest(tables, { person: 2, author: BOB_EMAIL, champs: { Fonction: { avant: 'Chargé de mission', apres: 'Chef' } } });
  addRequest(tables, { person: 11, author: IRIS_EMAIL, champs: { Fonction: { avant: '', apres: 'Cheffe' } } });
  addRequest(tables, { person: 3, author: 'intrus@example.fr', champs: { Fonction: { avant: '', apres: 'Pirate' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.equal(await bulkButton(page).textContent(), 'Tout valider (2)', 'la demande piégée n\'est pas comprise');
    await dialog(page).locator('[data-admin-search]').fill('bob');
    assert.equal(await bulkButton(page).isHidden(), true, 'une seule demande sûre à l\'écran : traitée à la main');
    await dialog(page).locator('[data-admin-search]').fill('');
    assert.equal(await bulkButton(page).isVisible(), true);
    await tabDone(page).click();
    assert.equal(await bulkButton(page).isHidden(), true, 'jamais sur les demandes déjà traitées');
  });
});

test('« Tout valider » ne valide que les demandes affichées par la recherche', { skip }, () => {
  const { tables } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await dialog(page).locator('[data-admin-etab]').selectOption('CHU');
    assert.deepEqual(await namesOf(page), ['Ana Martin', 'Iris Refus']);
    assert.equal(await bulkButton(page).textContent(), 'Tout valider (2)');
    await bulkButton(page).click();
    await bulkButton(page).click();
    await waitStatus(page, '2 demandes validées.');
    assert.deepEqual((await writesTo(page, 'BDD')).map(call => call.rowId).sort(byNumber), [1, 11]);
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chargé de mission', 'Bob, hors de la sélection, attend toujours');
    assert.equal(await tabPending(page).textContent(), 'À valider (1)');
  });
});

test('« Tout valider » : une fiche protégée fait échouer sa demande seule, les autres sont validées', { skip }, () => {
  const { tables, iris } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL, denyRows: { BDD: [11] } }, async ({ page, logs }) => {
    await openAdmin(page);
    await bulkButton(page).click();
    await bulkButton(page).click();
    await waitStatus(page, '2 demandes validées, 1 à revoir.');
    assert.equal(await adminStatus(page).getAttribute('data-tone'), 'error');
    assert.deepEqual(await namesOf(page), ['Iris Refus']);
    assert.equal(await card(page, iris).locator('[role="alert"]').textContent(), 'Grist a refusé la validation : vos droits ne le permettent pas.');
    assert.equal(await buttonOf(page, iris, 'Valider').isEnabled(), true, 'on peut réessayer ou refuser');
    assert.equal(await page.evaluate(() => window.__tables.Annuaire_Demandes.Statut[2]), 'en_attente');
    assert.equal(await page.evaluate(() => window.__tables.BDD.numero_de_telephone[10]), 0, 'rien n\'est écrit à moitié');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chef de projet');
    assert.ok((await Promise.all(logs.errors)).some(line => line.includes('[DEMANDES] Validation impossible')));
  });
});

// ===== Chercher, filtrer, parcourir =====

test('la recherche ignore casse et accents, le filtre d\'établissement liste ceux des demandes affichées', { skip }, () => {
  const { tables } = seeded();
  addRequest(tables, { person: 9, author: 'gina@bergonie.fr?cc=intrus@example.fr', champs: { Fonction: { avant: 'Directrice', apres: 'Directrice générale' } } });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    const search = dialog(page).locator('[data-admin-search]');
    const etab = dialog(page).locator('[data-admin-etab]');
    assert.deepEqual(await etab.locator('option').allTextContents(), ['Tous les établissements', 'CHU', 'Institut Bergonié', 'UBM']);

    await search.fill('DURAND');
    assert.deepEqual(await namesOf(page), ['Bob Durand']);
    await search.fill('bergonie');
    assert.deepEqual(await namesOf(page), ['Gina Bergonié'], 'sans accent ni majuscule');
    await search.fill('zzz');
    assert.equal(await dialog(page).locator('.empty-admin').textContent(), 'Aucune demande ne correspond à cette recherche.');
    assert.equal(await requestCards(page).count(), 0);
    await search.fill('');

    await etab.selectOption('CHU');
    assert.deepEqual(await namesOf(page), ['Ana Martin', 'Iris Refus']);
    await search.fill('iris');
    assert.deepEqual(await namesOf(page), ['Iris Refus'], 'recherche et établissement se cumulent');
    await etab.selectOption('UBM');
    assert.equal(await requestCards(page).count(), 0);
    await etab.selectOption('');
    await search.fill('');
    assert.equal(await requestCards(page).count(), 4);
  });
});

test('l\'établissement choisi se désélectionne seul quand plus aucune demande ne le concerne', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await dialog(page).locator('[data-admin-etab]').selectOption('UBM');
    assert.deepEqual(await namesOf(page), ['Bob Durand']);
    await buttonOf(page, bob, 'Valider').click();
    await waitStatus(page, 'Demande validée.');
    assert.equal(await dialog(page).locator('[data-admin-etab]').inputValue(), '', 'plus personne à l\'UBM : le filtre se vide');
    assert.deepEqual(await namesOf(page), ['Ana Martin', 'Iris Refus']);
  });
});

test('les onglets se parcourent aux flèches et gardent leur sélection à jour', { skip }, () =>
  withWidget({ tables: seeded().tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await tabPending(page).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tabDone(page).getAttribute('aria-selected'), 'true');
    assert.equal(await tabPending(page).getAttribute('aria-selected'), 'false');
    assert.equal(await dialog(page).locator('#adminPanel').getAttribute('aria-labelledby'), 'adminTabDone');
    assert.equal(await dialog(page).locator('.empty-admin').textContent(), 'Aucune demande traitée.');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'adminTabDone');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tabPending(page).getAttribute('aria-selected'), 'true');
    assert.equal(await requestCards(page).count(), 3);
  }));

test('l\'historique montre qui a traité quoi, le plus récent d\'abord', { skip }, () => {
  const tables = world();
  const accepted = addRequest(tables, {
    person: 2, author: BOB_EMAIL, status: 'validee', by: 'admin@chu-bordeaux.fr', decidedAt: 1760100000,
    champs: { Fonction: { avant: 'a', apres: 'b' } }
  });
  const refused = addRequest(tables, {
    person: 1, author: ANA_EMAIL, status: 'refusee', by: 'autre.admin@chu-bordeaux.fr', decidedAt: 1760200000, reason: 'Pas maintenant.',
    champs: { Fonction: { avant: 'a', apres: 'b' } }
  });
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.equal(await tabPending(page).textContent(), 'À valider (0)');
    assert.equal(await dialog(page).locator('.empty-admin').textContent(), 'Aucune demande à valider.');
    await tabDone(page).click();
    assert.equal(await tabDone(page).textContent(), 'Traitées (2)');
    assert.deepEqual(await requestCards(page).evaluateAll(nodes => nodes.map(node => node.dataset.requestId)), [String(refused), String(accepted)]);
    assert.equal(await card(page, refused).locator('.badge-ko').textContent(), 'Refusée');
    assert.match(await card(page, refused).locator('.req-meta').textContent(), /^par autre\.admin@chu-bordeaux\.fr, le \d+ \S+ : « Pas maintenant\. »$/);
    assert.equal(await card(page, accepted).locator('.badge-ok').textContent(), 'Validée');
    assert.equal(await card(page, accepted).locator('.req-name').textContent(), 'Bob Durand');
  });
});

test('un grand historique ne dessine que les 50 premières demandes, la suite se demande', { skip }, () => {
  const tables = world();
  for (let index = 0; index < 3000; index += 1) {
    addRequest(tables, {
      person: 2, author: BOB_EMAIL, status: 'refusee', by: 'admin@chu-bordeaux.fr', decidedAt: 1760100000 + index,
      champs: { Fonction: { avant: 'a', apres: `b${index}` } }
    });
  }
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await tabDone(page).click();
    assert.equal(await tabDone(page).textContent(), 'Traitées (3000)');
    assert.equal(await requestCards(page).count(), 50, 'seules 50 cartes sont dessinées');
    const more = dialog(page).getByRole('button', { name: /^Afficher les 50 suivantes \(2950 restantes\)$/ });
    await more.click();
    assert.equal(await requestCards(page).count(), 100);
    await dialog(page).locator('[data-admin-search]').fill('bob');
    assert.equal(await requestCards(page).count(), 50, 'une nouvelle recherche revient à la première page');
  });
});

// ===== Actualiser, pannes, écritures lentes =====

test('« Actualiser » relit les demandes déposées entre-temps, et le bouton du bandeau suit', { skip }, () => {
  const { tables } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    assert.equal(await requestCards(page).count(), 3);
    await page.evaluate(() => {
      const table = window.__tables.Annuaire_Demandes;
      const row = {
        id: 4, Date: 1760900000, Email: 'jules@chu-bordeaux.fr', Personne: 12, Statut: 'en_attente',
        Changements: JSON.stringify({ v: 1, champs: { Fonction: { avant: '', apres: 'Nouvelle' } } }),
        Resume: '', Message: '', Traitee_par: '', Traitee_le: null, Motif_refus: ''
      };
      Object.entries(row).forEach(([column, value]) => table[column].push(value));
    });
    assert.equal(await requestCards(page).count(), 3, 'rien ne bouge tant qu\'on n\'actualise pas');
    await dialog(page).locator('[data-admin-refresh]').click();
    await page.waitForFunction(() => document.querySelectorAll('#adminDialog .req').length === 4);
    assert.equal(await tabPending(page).textContent(), 'À valider (4)');
    assert.equal(await adminButton(page).textContent(), '4 demandes à valider');
    assert.equal(await dialog(page).locator('[data-admin-refresh]').textContent(), 'Actualiser');
  });
});

test('demandes illisibles à l\'ouverture : la fenêtre le dit, et « Actualiser » reprend quand Grist répond', { skip }, () =>
  withWidget({ tables: seeded().tables, user: ADMIN_EMAIL, failTables: ['Annuaire_Demandes'] }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await adminButton(page).waitFor();
    assert.equal(await adminButton(page).textContent(), 'Demandes de modification', 'on ne peut pas compter ce qu\'on ne lit pas');
    await adminButton(page).click();
    await dialog(page).waitFor();
    await dialog(page).locator('.empty-admin:has-text("n\'ont pas pu être lues")').waitFor();
    assert.equal(await dialog(page).locator('.empty-admin').textContent(), 'Les demandes n\'ont pas pu être lues. Réessayez avec « Actualiser ».');
    assert.equal(await requestCards(page).count(), 0);
    assert.ok((await Promise.all(logs.errors)).some(line => line.includes('[DEMANDES] Lecture impossible')));

    await page.evaluate(() => { window.__failTables = []; });
    await dialog(page).locator('[data-admin-refresh]').click();
    await page.waitForFunction(() => document.querySelectorAll('#adminDialog .req').length === 3);
    assert.equal(await tabPending(page).textContent(), 'À valider (3)');
  }));

test('« Actualiser » qui échoue garde l\'écran en place et l\'explique', { skip }, () =>
  withWidget({ tables: seeded().tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await page.evaluate(() => { window.__failTables = ['Annuaire_Demandes']; });
    await dialog(page).locator('[data-admin-refresh]').click();
    await waitStatus(page, 'Les demandes n\'ont pas pu être lues. Réessayez avec « Actualiser ».');
    assert.equal(await adminStatus(page).getAttribute('data-tone'), 'error');
    assert.equal(await requestCards(page).count(), 3, 'les demandes déjà affichées restent');
  }));

test('une écriture refusée par Grist s\'affiche sur la demande, rien ne change, un nouvel essai aboutit', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL, denyWrites: ['BDD'] }, async ({ page }) => {
    await openAdmin(page);
    await buttonOf(page, bob, 'Valider').click();
    const alert = card(page, bob).locator('[role="alert"]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), 'Grist a refusé la validation : vos droits ne le permettent pas.');
    assert.equal(await adminStatus(page).isHidden(), true, 'pas de « Demande validée » mensonger');
    assert.equal(await buttonOf(page, bob, 'Valider').isEnabled(), true);
    assert.equal(await page.evaluate(() => window.__tables.Annuaire_Demandes.Statut[1]), 'en_attente');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chargé de mission');

    await page.evaluate(() => { window.__denyWrites = []; });
    await buttonOf(page, bob, 'Valider').click();
    await waitStatus(page, 'Demande validée.');
    assert.equal(await card(page, bob).count(), 0);
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[1]), 'Chef de projet');
  });
});

test('un refus que Grist n\'accepte pas se lit sur la demande, qui reste à traiter', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL, denyWrites: ['Annuaire_Demandes'] }, async ({ page }) => {
    await openAdmin(page);
    await buttonOf(page, bob, 'Refuser').click();
    await card(page, bob).locator('textarea').fill('Non.');
    await buttonOf(page, bob, 'Confirmer le refus').click();
    const alert = card(page, bob).locator('[role="alert"]');
    await alert.waitFor();
    assert.equal(await alert.textContent(), 'Les règles d\'accès de Grist ne permettent pas d\'enregistrer ce refus.');
    assert.equal(await card(page, bob).locator('textarea').inputValue(), 'Non.', 'le motif tapé n\'est pas perdu');
    assert.equal(await page.evaluate(() => window.__tables.Annuaire_Demandes.Statut[1]), 'en_attente');
  });
});

test('pendant une validation lente, la fenêtre ne se ferme pas et un double clic n\'écrit qu\'une fois', { skip }, () => {
  const { tables, bob } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL, delay: 300 }, async ({ page }) => {
    await openAdmin(page);
    const validate = card(page, bob).getByRole('button', { name: /^Valid/ });
    await validate.click();
    assert.equal(await validate.textContent(), 'Validation…');
    assert.equal(await validate.isDisabled(), true);
    await validate.click({ force: true, timeout: 300 }).catch(() => {});
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), true, 'Échap ne ferme pas la fenêtre au milieu d\'une écriture');
    await waitStatus(page, 'Demande validée.');
    assert.equal((await writesTo(page, 'Annuaire_Demandes')).length, 1);
    assert.equal((await writesTo(page, 'BDD')).length, 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('adminDialog').open);
  });
});

test('une administratrice peut aussi lire l\'annuaire pendant que la fenêtre est ouverte : les cartes se mettent à jour', { skip }, () => {
  const { tables, ana } = seeded();
  return withWidget({ tables, user: ADMIN_EMAIL }, async ({ page }) => {
    await openAdmin(page);
    await buttonOf(page, ana, 'Valider').click();
    await waitStatus(page, 'Demande validée.');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('adminDialog').open);
    assert.equal((await cardNames(page))[0], 'Ana Martin');
    assert.equal(await page.locator('.contact-card .fonction').first().textContent(), 'Cheffe de service');
    assert.equal(await page.locator('.contact-card .tel').first().textContent(), '☎ 05 56 00 00 99');
  });
});
