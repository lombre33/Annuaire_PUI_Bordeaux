// Test navigateur de la fenêtre « Modifier mon profil » : ce que voit la personne, ce
// qu'elle peut envoyer, et ce qui est (et n'est pas) écrit dans Grist. Même principe que
// tests/e2e.test.mjs (voir tests/support/browser.mjs) ; la validation par un
// administrateur est dans tests/e2e-admin.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleTables, withIdentity, withRequests, withSchema, addRequest, HOSTILE_FIRST_NAME, ANA_EMAIL, BOB_EMAIL
} from './fixtures.mjs';
import { skip, withWidget, waitForCards } from './support/browser.mjs';

// Un document complet : identité, demandes et métadonnées de colonnes.
const world = () => withRequests(withSchema(withIdentity()));

const HOSTILE_EMAIL = 'hostile@chu-bordeaux.fr';

const editButton = page => page.locator('.account-edit');
const dialog = page => page.locator('#profileDialog');
const grist = page => page.evaluate(() => window.__fake.calls);
const writesTo = async (page, table) => (await grist(page)).filter(call => call.table === table);
const summary = page => dialog(page).locator('.dlg-summary').textContent();
const sendButton = page => dialog(page).getByRole('button', { name: /Envoyer pour validation|Envoi en cours/ });
const recapRows = page => dialog(page).locator('.recap .diff-row');
const pick = (page, label) => dialog(page).locator('.pick', { hasText: label });

async function openEditor(page) {
  await waitForCards(page, 4);
  await editButton(page).waitFor();
  await editButton(page).click();
  await dialog(page).waitFor();
}

// Le texte d'une ligne du récapitulatif, sans le bruit des espaces.
const rowText = async row => (await row.innerText()).replace(/\s+/g, ' ').trim();

// ===== Quand la modification n'est pas proposée =====

test('sans la table des demandes, aucun bouton de modification, la console explique, rien n\'est écrit en plus', { skip }, () =>
  withWidget({ tables: withIdentity(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar:not([hidden])').waitFor();
    assert.equal(await editButton(page).isHidden(), true);
    assert.equal(await page.locator('.account-admin').isHidden(), true, 'même une administratrice : rien à valider sans table');
    await page.waitForFunction(() => window.__fake.calls.length === 2);
    assert.deepEqual((await grist(page)).map(call => [call.action, call.table]),
      [['AddRecord', 'Annuaire_Sonde'], ['RemoveRecord', 'Annuaire_Sonde']]);
    const warning = (await Promise.all(logs.warnings)).find(line => line.includes('[DEMANDES]'));
    assert.match(warning, /Annuaire_Demandes.*GRIST_SETUP\.md/);
  }));

test('un compte Lecteur n\'a ni bandeau ni bouton, et rien n\'est lu dans les demandes', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL, readOnly: true }, async ({ page }) => {
    await waitForCards(page, 4);
    assert.equal(await page.locator('#accountBar').isHidden(), true);
    assert.deepEqual(await grist(page), []);
  }));

test('deux fiches pour la même adresse : le bandeau reste, mais aucune modification n\'est proposée', { skip }, () => {
  const tables = world();
  tables.BDD.email[1] = ANA_EMAIL.toUpperCase(); // Bob a la même adresse qu'Ana
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.locator('#accountBar:not([hidden])').waitFor();
    await page.waitForFunction(() => window.__fake.calls.length >= 2);
    assert.equal(await editButton(page).isHidden(), true);
    const warning = (await Promise.all(logs.warnings)).find(line => line.includes('[IDENTITE]') && line.includes('même adresse'));
    assert.match(warning, /modification de fiche n'est pas proposée/);
  });
});

test('une personne dont l\'adresse n\'est pas dans BDD n\'a pas de bouton de modification', { skip }, () =>
  withWidget({ tables: world(), user: 'inconnu@example.fr' }, async ({ page }) => {
    await waitForCards(page, 4);
    await page.waitForFunction(() => window.__fake.calls.length >= 2);
    assert.equal(await editButton(page).isHidden(), true);
    assert.equal(await page.locator('#accountBar').isHidden(), true);
  }));

// ===== Ouvrir la fenêtre =====

test('la fenêtre montre la fiche telle qu\'elle est, son identité verrouillée, et rien à envoyer', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openEditor(page);
    assert.equal(await dialog(page).locator('.ident-name').textContent(), 'Ana Martin');
    assert.equal(await dialog(page).locator('.ident-mail').textContent(), ANA_EMAIL);
    assert.match(await dialog(page).locator('.ident-lock').textContent(), /Verrouillé : l'e-mail et l'établissement/);
    assert.equal(await dialog(page).locator('.ident .req-pill').textContent(), 'CHU');

    assert.equal(await page.inputValue('#profile-prenom'), 'Ana');
    assert.equal(await page.inputValue('#profile-nom'), 'Martin');
    assert.equal(await page.inputValue('#profile-Fonction'), 'Pharmacienne');
    assert.equal(await page.inputValue('#profile-numero_de_telephone'), '05 56 78 90 12', 'le 0 perdu par le type Numeric est rétabli');
    assert.equal(await page.locator('#profile-Role_dans_le_PUI option:checked').textContent(), 'Référent qualité');

    assert.equal(await pick(page, 'Oncologie').getAttribute('aria-pressed'), 'true');
    assert.equal(await pick(page, 'Hématologie').getAttribute('aria-pressed'), 'true');
    assert.equal(await pick(page, 'Pharmacovigilance').getAttribute('aria-pressed'), 'false');
    assert.equal(await pick(page, 'Relecture').getAttribute('aria-pressed'), 'false');

    assert.equal(await summary(page), 'Aucune modification');
    assert.equal(await sendButton(page).isDisabled(), true);
    assert.equal(await dialog(page).locator('.recap').isHidden(), true);
    assert.equal(await dialog(page).getAttribute('aria-labelledby'), 'profileTitle');
    assert.deepEqual(await Promise.all(logs.errors), []);
  }));

test('la fenêtre n\'offre jamais l\'e-mail, l\'établissement, le périmètre ni l\'accord d\'apparaître', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    const fields = await dialog(page).locator('input, select, textarea').evaluateAll(nodes => nodes.map(node => node.id).filter(Boolean));
    assert.deepEqual(fields, [
      'profile-prenom', 'profile-nom', 'profile-Fonction', 'profile-numero_de_telephone', 'profile-Role_dans_le_PUI', 'profile-message'
    ]);
    assert.equal(await dialog(page).getByText('Établissement', { exact: true }).count(), 0);
  }));

// ===== Préparer et envoyer une demande =====

test('le récapitulatif suit la saisie, et l\'envoi dépose une demande sans toucher à la fiche', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page, logs }) => {
    await openEditor(page);
    await page.fill('#profile-Fonction', 'Cheffe de service');
    await page.fill('#profile-numero_de_telephone', '0556112233');
    await page.locator('#profile-numero_de_telephone').blur();
    assert.equal(await page.inputValue('#profile-numero_de_telephone'), '05 56 11 22 33', 'un numéro valide est remis en forme');
    await pick(page, 'Oncologie').click();
    await pick(page, 'Relecture').click();
    await page.fill('#profile-message', '  Changement de poste.  ');

    assert.equal(await recapRows(page).count(), 4);
    assert.equal(await rowText(recapRows(page).nth(0)), 'Fonction Pharmacienne → Cheffe de service');
    assert.equal(await rowText(recapRows(page).nth(1)), 'Téléphone 05 56 78 90 12 → 05 56 11 22 33');
    assert.equal(await rowText(recapRows(page).nth(2)), 'Compétences − retiré : Oncologie');
    assert.equal(await rowText(recapRows(page).nth(3)), 'Tâches + ajouté : Relecture');
    assert.equal(await summary(page), '4 champs modifiés');
    assert.equal(await dialog(page).locator('.grp', { hasText: 'Compétences' }).locator('.grp-count').textContent(), '1 sélectionné');
    assert.equal(await sendButton(page).isDisabled(), false);

    await sendButton(page).click();
    await dialog(page).locator('.sent').waitFor();
    assert.match(await dialog(page).locator('.sent h3').textContent(), /Demande envoyée/);
    assert.match(await dialog(page).locator('.sent-msg').textContent(), /« Changement de poste\. »/);
    assert.equal(await dialog(page).locator('.sent .diff-row').count(), 4, 'ce qui a été envoyé est rappelé');

    const writes = await writesTo(page, 'Annuaire_Demandes');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].action, 'AddRecord');
    const { values } = writes[0];
    assert.deepEqual(Object.keys(values).sort(), ['Changements', 'Message', 'Personne', 'Resume', 'Statut'],
      'Date et Email ne sont jamais écrits par le widget : Grist les remplit');
    assert.equal(values.Personne, 1);
    assert.equal(values.Statut, 'en_attente');
    assert.equal(values.Message, 'Changement de poste.');
    assert.deepEqual(JSON.parse(values.Changements), {
      v: 1,
      champs: {
        Fonction: { avant: 'Pharmacienne', apres: 'Cheffe de service' },
        numero_de_telephone: { avant: '0556789012', apres: '0556112233' },
        Competences: { ajout: [], retrait: [{ id: 1, label: 'Oncologie' }] },
        Taches: { ajout: [{ id: 1, label: 'Relecture' }], retrait: [] }
      }
    });
    assert.match(values.Resume, /Fonction : « Pharmacienne » → « Cheffe de service »/);
    assert.deepEqual(await writesTo(page, 'BDD'), [], 'la fiche ne change qu\'après la validation');
    assert.equal(await page.evaluate(() => window.__tables.BDD.Fonction[0]), 'Pharmacienne');
    // Grist a rempli l'auteur et la date, à la création de la ligne.
    assert.deepEqual(await page.evaluate(() => window.__tables.Annuaire_Demandes.Email), [ANA_EMAIL]);
    assert.deepEqual(await Promise.all(logs.errors), []);

    // Fermée la fenêtre, le bouton signale la demande en attente.
    await dialog(page).getByRole('button', { name: 'Fermer', exact: true }).last().click();
    await page.waitForFunction(() => !document.getElementById('profileDialog').open);
    assert.equal(await page.locator('.account-dot').isVisible(), true);
    assert.equal(await editButton(page).getAttribute('title'), 'Une demande est en attente de validation');
  }));

test('retirer le rôle PUI se lit « supprimé » dans le récapitulatif et s\'envoie comme une référence vide', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    await page.selectOption('#profile-Role_dans_le_PUI', '0');
    assert.equal(await rowText(recapRows(page).nth(0)), 'Rôle PUI Référent qualité → supprimé');
    await sendButton(page).click();
    await dialog(page).locator('.sent').waitFor();
    const [write] = await writesTo(page, 'Annuaire_Demandes');
    assert.deepEqual(JSON.parse(write.values.Changements).champs.Role_dans_le_PUI,
      { avant: { id: 1, label: 'Référent qualité' }, apres: { id: 0, label: '' } });
  }));

test('un numéro de téléphone mal écrit est signalé sous le champ, et rien ne part', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    await page.fill('#profile-numero_de_telephone', '123');
    const error = dialog(page).locator('#profile-numero_de_telephone-error');
    assert.match(await error.textContent(), /numéro français à 10 chiffres/);
    assert.equal(await page.locator('#profile-numero_de_telephone').getAttribute('aria-invalid'), 'true');
    assert.equal(await summary(page), 'Corrigez les champs signalés');
    assert.equal(await sendButton(page).isDisabled(), true);

    await page.fill('#profile-numero_de_telephone', '+33 5 56 11 22 33');
    assert.equal(await error.isHidden(), true);
    assert.equal(await page.locator('#profile-numero_de_telephone').getAttribute('aria-invalid'), 'false');
    assert.equal(await sendButton(page).isDisabled(), false);
    assert.deepEqual(await writesTo(page, 'Annuaire_Demandes'), []);
  }));

test('une fiche ne peut pas se retrouver sans prénom ni nom', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    await page.fill('#profile-prenom', '');
    assert.equal(await sendButton(page).isDisabled(), false, 'un prénom en moins reste possible : le nom demeure');
    await page.fill('#profile-nom', '   ');
    assert.match(await dialog(page).locator('#profile-nom-error').textContent(), /au moins un prénom ou un nom/);
    assert.match(await dialog(page).locator('#profile-prenom-error').textContent(), /au moins un prénom ou un nom/);
    assert.equal(await sendButton(page).isDisabled(), true);
    await page.fill('#profile-nom', 'Martin-Durand');
    assert.equal(await sendButton(page).isDisabled(), false);
    assert.equal(await recapRows(page).count(), 2);
  }));

test('un texte qui commencerait comme une formule de tableur est refusé, un HTML saisi reste du texte', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    await page.fill('#profile-Fonction', '=HYPERLINK("http://x")');
    assert.match(await dialog(page).locator('#profile-Fonction-error').textContent(), /ne peut pas commencer par = \+ - ou @/);
    assert.equal(await sendButton(page).isDisabled(), true);

    const html = '<img src=x onerror="window.__xss=1">';
    await page.fill('#profile-Fonction', 'Cheffe');
    await page.fill('#profile-message', html);
    await sendButton(page).click();
    await dialog(page).locator('.sent').waitFor();
    assert.equal(await dialog(page).locator('.sent-msg').textContent(), `Votre mot à l'administrateur : « ${html} »`);
    assert.equal(await dialog(page).locator('.sent img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal((await writesTo(page, 'Annuaire_Demandes'))[0].values.Message, html, 'enregistré tel quel, comme du texte');
  }));

test('les données de la fiche s\'affichent en texte brut dans la fenêtre (aucune injection)', { skip }, () =>
  withWidget({ tables: world(), user: HOSTILE_EMAIL }, async ({ page }) => {
    await openEditor(page);
    assert.equal(await dialog(page).locator('.ident-name').textContent(), `${HOSTILE_FIRST_NAME} Hostile`);
    assert.equal(await page.inputValue('#profile-prenom'), HOSTILE_FIRST_NAME);
    assert.equal(await dialog(page).locator('img').count(), 0);
    assert.equal(await page.evaluate(() => window.__xss), undefined);
  }));

// ===== Reprendre une demande, lire une décision =====

test('une demande en attente se reprend là où elle en était, et l\'envoyer de nouveau la complète', { skip }, () => {
  const tables = world();
  addRequest(tables, {
    person: 1, author: ANA_EMAIL, message: 'Bonjour',
    champs: { Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' } }
  });
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await waitForCards(page, 4);
    await editButton(page).waitFor();
    assert.equal(await page.locator('.account-dot').isVisible(), true, 'la demande qui attend se voit dès le bandeau');
    await editButton(page).click();
    await dialog(page).waitFor();
    assert.match(await dialog(page).locator('.notice-pending').textContent(), /Une demande du .* est en attente de validation\. Vous la modifiez ici/);
    assert.equal(await page.inputValue('#profile-Fonction'), 'Cheffe');
    assert.equal(await page.inputValue('#profile-message'), 'Bonjour');
    assert.equal(await summary(page), '1 champ modifié');
    assert.equal(await sendButton(page).isDisabled(), false);

    // Rien de nouveau : Échap ferme sans avertir.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('profileDialog').open);

    await editButton(page).click();
    await dialog(page).waitFor();
    await page.fill('#profile-numero_de_telephone', '05 56 11 22 33');
    assert.equal(await summary(page), '2 champs modifiés');
    await sendButton(page).click();
    await dialog(page).locator('.sent').waitFor();
    const [write] = await writesTo(page, 'Annuaire_Demandes');
    assert.deepEqual(Object.keys(JSON.parse(write.values.Changements).champs).sort(), ['Fonction', 'numero_de_telephone'],
      'la nouvelle demande reprend la précédente et la complète');
    assert.equal(write.values.Message, 'Bonjour');
  });
});

test('la dernière décision se lit en tête de la fenêtre : refusée avec son motif, ou validée', { skip }, async () => {
  const refused = world();
  addRequest(refused, {
    person: 1, author: ANA_EMAIL, status: 'refusee', by: 'admin@chu-bordeaux.fr', decidedAt: 1760100000, reason: 'Trop vague.',
    champs: { Fonction: { avant: 'Pharmacienne', apres: 'X' } }
  });
  await withWidget({ tables: refused, user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    assert.match(await dialog(page).locator('.notice-ko').textContent(), /Votre dernière demande \(.*\) a été refusée : « Trop vague\. »/);
    assert.equal(await dialog(page).locator('.notice-pending').count(), 0);
  });

  const accepted = world();
  addRequest(accepted, {
    person: 1, author: ANA_EMAIL, status: 'validee', by: 'admin@chu-bordeaux.fr', decidedAt: 1760100000,
    champs: { Fonction: { avant: 'Pharmacienne', apres: 'Cheffe' } }
  });
  await withWidget({ tables: accepted, user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    assert.match(await dialog(page).locator('.notice-ok').textContent(), /Votre dernière demande \(.*\) a été validée\./);
    assert.equal(await page.locator('.account-dot').isHidden(), true, 'plus de demande en attente');
  });
});

test('la demande d\'une autre personne n\'apparaît pas dans la fenêtre', { skip }, () => {
  const tables = world();
  addRequest(tables, { person: 2, author: BOB_EMAIL, champs: { Fonction: { avant: 'Chargé de mission', apres: 'Chef' } } });
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    assert.equal(await dialog(page).locator('.notice').count(), 0);
    assert.equal(await page.locator('.account-dot').isHidden(), true);
    assert.equal(await page.inputValue('#profile-Fonction'), 'Pharmacienne');
  });
});

// ===== Pannes =====

test('une écriture refusée par Grist s\'explique dans la fenêtre, le brouillon reste, un nouvel essai aboutit', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL, denyWrites: ['Annuaire_Demandes'] }, async ({ page }) => {
    await openEditor(page);
    await page.fill('#profile-Fonction', 'Cheffe');
    await sendButton(page).click();
    const alert = dialog(page).locator('.dlg-alert [role="alert"]');
    await alert.waitFor();
    assert.match(await alert.textContent(), /Grist a refusé l'envoi de la demande/);
    assert.equal(await page.inputValue('#profile-Fonction'), 'Cheffe', 'le brouillon est conservé');
    assert.equal(await sendButton(page).isDisabled(), false);
    assert.equal(await dialog(page).locator('.sent').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.__tables.Annuaire_Demandes.id), []);

    await page.evaluate(() => { window.__denyWrites = []; });
    await sendButton(page).click();
    await dialog(page).locator('.sent').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__tables.Annuaire_Demandes.id), [1]);
  }));

test('pendant l\'envoi la fenêtre se fige : un double clic ne dépose qu\'une demande', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL, delay: 300 }, async ({ page }) => {
    await openEditor(page);
    await page.fill('#profile-Fonction', 'Cheffe');
    const button = sendButton(page);
    await button.click();
    assert.equal(await button.textContent(), 'Envoi en cours…');
    assert.equal(await page.locator('#profile-Fonction').isDisabled(), true);
    assert.equal(await dialog(page).locator('.dlg-x').isDisabled(), true, 'la croix est inactive pendant l\'envoi');
    assert.equal(await dialog(page).getByRole('button', { name: 'Annuler', exact: true }).isDisabled(), true);
    await button.click({ force: true, timeout: 500 }).catch(() => {});
    await page.keyboard.press('Escape');
    assert.equal(await dialog(page).evaluate(node => node.open), true, 'Échap ne ferme pas la fenêtre pendant l\'envoi');
    await dialog(page).locator('.sent').waitFor();
    assert.equal((await writesTo(page, 'Annuaire_Demandes')).length, 1);
    assert.equal(await dialog(page).locator('.dlg-x').isEnabled(), true, 'la demande est partie : on peut fermer');
    await dialog(page).locator('.dlg-x').click();
    await page.waitForFunction(() => !document.getElementById('profileDialog').open);
  }));

test('les demandes illisibles : le bouton reste, mais la fenêtre ne s\'ouvre pas sur un état inconnu', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL, failTables: ['Annuaire_Demandes'] }, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await editButton(page).waitFor();
    await editButton(page).click();
    const status = page.locator('#accountBar .account-status');
    await page.waitForFunction(() => document.querySelector('#accountBar .account-status').textContent !== '');
    assert.match(await status.textContent(), /Vos demandes n'ont pas pu être lues/);
    assert.equal(await status.getAttribute('data-tone'), 'error');
    assert.equal(await dialog(page).evaluate(node => node.open), false);
    assert.ok((await Promise.all(logs.errors)).some(line => line.includes('[DEMANDES] Lecture impossible')));
  }));

// ===== Échap, recherche dans les pastilles =====

test('Échap prévient avant d\'abandonner des changements non envoyés, puis ferme', { skip }, () =>
  withWidget({ tables: world(), user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    await page.keyboard.press('Escape'); // rien à perdre : la fenêtre se ferme
    await page.waitForFunction(() => !document.getElementById('profileDialog').open);

    await editButton(page).click();
    await dialog(page).waitFor();
    await page.locator('#profile-Fonction').click();
    await page.keyboard.type(' (par intérim)');
    await page.keyboard.press('Escape');
    const hint = dialog(page).locator('.dlg-hint');
    assert.equal(await dialog(page).evaluate(node => node.open), true, 'le premier Échap ne ferme pas');
    assert.match(await hint.textContent(), /Appuyez encore sur Échap/);
    assert.equal(await hint.isVisible(), true);

    await page.keyboard.type('!'); // une nouvelle saisie efface l'avertissement
    assert.equal(await hint.isHidden(), true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog(page).evaluate(node => node.open), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('profileDialog').open);
    assert.deepEqual(await writesTo(page, 'Annuaire_Demandes'), [], 'rien n\'a été envoyé');

    // Rouverte, la fenêtre repart de la fiche : le brouillon abandonné ne revient pas.
    await editButton(page).click();
    await dialog(page).waitFor();
    assert.equal(await page.inputValue('#profile-Fonction'), 'Pharmacienne');

    // Un mot tapé pour l'administrateur est aussi un travail qu'on ne perd pas par mégarde.
    await page.fill('#profile-message', 'Un mot');
    await page.keyboard.press('Escape');
    assert.equal(await dialog(page).evaluate(node => node.open), true);
    assert.match(await hint.textContent(), /Appuyez encore sur Échap/);
  }));

test('les compétences se présentent par domaine, avec une recherche qui ignore casse et accents', { skip }, () => {
  const tables = world();
  for (let id = 5; id <= 18; id += 1) {
    tables.Competences.id.push(id);
    tables.Competences.Competences.push(`Compétence ${id}`);
    tables.Competences.Competences_corrigees.push('');
    tables.Competences.Macro_competences.push('Gestion');
  }
  return withWidget({ tables, user: ANA_EMAIL }, async ({ page }) => {
    await openEditor(page);
    const group = dialog(page).locator('.grp', { hasText: 'Compétences' }).first();
    assert.deepEqual(await group.locator('.subgrp-title').allTextContents(), ['Cancérologie', 'Gestion', 'Pharmacie', 'Autres'],
      'domaines par ordre alphabétique, « Autres » en dernier');
    assert.equal(await group.locator('.pick').count(), 18);
    assert.equal(await group.locator('.grp-count').textContent(), '2 sélectionnés');
    // Les listes courtes n'ont pas de recherche.
    assert.equal(await dialog(page).locator('.pick-search').count(), 1);

    const search = group.locator('.pick-search');
    await search.fill('HEMATO');
    assert.deepEqual(await group.locator('.pick:visible').allTextContents(), ['Hématologie']);
    assert.deepEqual(await group.locator('.subgrp:visible .subgrp-title').allTextContents(), ['Cancérologie'], 'les domaines sans résultat disparaissent');
    await search.fill('xyz');
    assert.equal(await group.locator('.pick:visible').count(), 0);
    await search.fill('');
    assert.equal(await group.locator('.pick:visible').count(), 18);

    await pick(page, 'Compétence 7').click();
    assert.equal(await group.locator('.grp-count').textContent(), '3 sélectionnés');
    assert.equal(await rowText(recapRows(page).nth(0)), 'Compétences + ajouté : Compétence 7');
  });
});
