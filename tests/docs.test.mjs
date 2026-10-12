// Garde-fous de la documentation : elle ne doit pas se périmer en silence.
//   1. Les liens et images de README.md et docs/*.md mènent à un fichier et à un
//      titre qui existent ; aucune image de docs/images n'est orpheline ; chaque
//      image a un texte alternatif.
//   2. Les fichiers et les fonctions cités entre accents graves existent encore.
//   3. Le jeu de données fictif de docs/demo est lu sans incident par le vrai
//      loadDirectory(), donne le nombre de cartes annoncé et reste fictif.
//   4. Le serveur de démonstration ne sert que les fichiers du widget, et permet de
//      se connecter comme une personne fictive : le bandeau « Ma présence » dit
//      alors ce que le guide annonce, et l'interrupteur fait ce que le guide promet.
//   5. Les documents suivent le code : nombre et noms des filtres dans le guide
//      utilisateur (le README reste générique : les filtres pourraient devenir
//      personnalisables), vocabulaire du PUI, modules, tables et colonnes de libellé.
//   6. La page de sécurité décrit fidèlement le code : méthodes de l'API Grist
//      employées, aucun réseau, aucun stockage, aucun HTML injecté ; et aucune page
//      ne présente le widget comme étant « en lecture seule ».
// Un échec dit quoi corriger : la documentation (docs/maintenance.md, « Maintenir
// la documentation ») ou le jeu fictif (docs/developpeurs.md, « Données et
// captures de démonstration »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, FILTERS } from '../constants.js';
import { loadDirectory } from '../grist-data.js';
import { createEmptyFilterState, filterContacts } from '../filters.js';
import { readIdentity } from '../identity.js';
import { describePresence, describeHiddenFiche, setPresence, explainWriteError } from '../presence.js';
import { rightsFor, profileFormModel, draftOf } from '../profile.js';
import { prepareReview, saveProfile } from '../profile-save.js';
import { tablesFictives, CARTES_ATTENDUES, PERSONNES_DEMO } from '../docs/demo/donnees-fictives.mjs';
import { startDemoServer } from '../docs/demo/serveur-demo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Chemins du dépôt écrits avec « / », comme dans les liens Markdown.
const DOC_FILES = ['README.md', ...fs.readdirSync(path.join(ROOT, 'docs'))
  .filter(name => name.endsWith('.md')).sort().map(name => `docs/${name}`)];

// ===== Lecture du Markdown =====

const CODE_BLOCK = /^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm;
const withoutCodeBlocks = markdown => markdown.replace(CODE_BLOCK, '');
const withoutCode = markdown => withoutCodeBlocks(markdown).replace(/`[^`\n]*`/g, '');

// Cibles des liens et images Markdown, et des attributs src/href du HTML du README.
function linkTargets(markdown) {
  const text = withoutCode(markdown);
  return [
    ...[...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)].map(match => match[1]),
    ...[...text.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1])
  ];
}

const isExternal = target => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target);

// Identifiants de titre comme GitHub les fabrique : minuscules, ponctuation retirée,
// espaces en tirets, suffixe -1, -2… pour les titres en double.
const plainText = title => title.replace(/`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*/g, '');
const slugify = title => plainText(title).toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');

function anchorsOf(file) {
  const seen = new Map();
  const anchors = new Set();
  for (const [, title] of withoutCodeBlocks(read(file)).matchAll(/^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    const base = slugify(title);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

// Fichier visé par un lien, relatif à la racine du dépôt (chemin « / »), sans ancre.
const resolveTarget = (file, target) =>
  target.startsWith('#') ? file : path.posix.normalize(path.posix.join(path.posix.dirname(file), target.split('#')[0]));

// ===== 1. Liens et images =====

test('les liens et images de la documentation mènent à un fichier et à un titre qui existent', () => {
  const problems = [];
  DOC_FILES.forEach(file => {
    linkTargets(read(file)).filter(target => !isExternal(target)).forEach(target => {
      const targetFile = resolveTarget(file, target);
      if (!fs.existsSync(path.join(ROOT, targetFile))) {
        problems.push(`${file} : « ${target} » ne mène à aucun fichier`);
        return;
      }
      const anchor = target.includes('#') ? decodeURIComponent(target.split('#')[1]) : '';
      if (anchor && targetFile.endsWith('.md') && !anchorsOf(targetFile).has(anchor)) {
        problems.push(`${file} : « ${target} » pointe vers un titre absent de ${targetFile}`);
      }
    });
  });
  assert.deepEqual(problems, [], 'Corrigez ces liens, ou le titre / le fichier qu\'ils visent.');
});

test('chaque image de docs/images est utilisée par la documentation', () => {
  const used = new Set(DOC_FILES.flatMap(file =>
    linkTargets(read(file)).filter(target => !isExternal(target)).map(target => resolveTarget(file, target))));
  const orphans = fs.readdirSync(path.join(ROOT, 'docs', 'images')).filter(name => !used.has(`docs/images/${name}`));
  assert.deepEqual(orphans, [], 'Images de docs/images citées nulle part : à utiliser, ou à supprimer (et à retirer de docs/demo/capturer.mjs).');
});

test('chaque image de la documentation a un texte alternatif', () => {
  const problems = [];
  DOC_FILES.forEach(file => {
    const text = withoutCode(read(file));
    [...text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)].forEach(([, alt, source]) => {
      if (!alt.trim()) problems.push(`${file} : l'image ${source} n'a pas de texte alternatif`);
    });
    [...text.matchAll(/<img\b[^>]*>/gi)].forEach(([tag]) => {
      if (!(tag.match(/\balt="([^"]*)"/i)?.[1] ?? '').trim()) problems.push(`${file} : ${tag.slice(0, 70)}… n'a pas de texte alternatif`);
    });
  });
  assert.deepEqual(problems, [], 'Décrivez chaque image en une phrase (attribut alt, ou texte entre crochets).');
});

// ===== 2. Fichiers et fonctions cités =====

const SOURCE_FILES = [
  ...fs.readdirSync(ROOT).filter(name => name.endsWith('.js')),
  ...fs.readdirSync(path.join(ROOT, 'docs', 'demo')).map(name => `docs/demo/${name}`)
];

// Cités par la documentation mais fournis par Grist ou par le navigateur, pas par ce dépôt.
const EXTERNAL_NAMES = new Set(['fetchTable', 'listTables', 'applyUserActions', 'onRecords', 'ready', 'showModal', 'grist-plugin-api.js']);

const FUNCTION_REFERENCE = /^([A-Za-z_$][\w$]*)\(\)$/;
const FILE_REFERENCE = /^[\w./-]+\.(?:js|mjs|css|html|yml|md|txt|png)$/;

test('les fichiers et les fonctions cités dans la documentation existent encore', () => {
  const sources = SOURCE_FILES.map(read).join('\n');
  // Une fonction, une classe, une constante qui en porte une, ou une méthode d'objet (account-ui.js).
  const isDefined = name => new RegExp(`\\b(?:function|class)\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\s*=|^\\s+(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`, 'm').test(sources);
  const problems = [];
  DOC_FILES.forEach(file => {
    const spans = new Set([...withoutCodeBlocks(read(file)).matchAll(/`([^`\n]+)`/g)].map(match => match[1]));
    spans.forEach(span => {
      const functionName = span.match(FUNCTION_REFERENCE)?.[1];
      if (EXTERNAL_NAMES.has(functionName ?? span)) return;
      if (functionName && !isDefined(functionName)) problems.push(`${file} : la fonction ${span} n'existe plus`);
      if (FILE_REFERENCE.test(span) && !fs.existsSync(path.join(ROOT, span))) problems.push(`${file} : le fichier ${span} n'existe pas`);
    });
  });
  assert.deepEqual(problems, [], 'Mettez la documentation à jour (docs/maintenance.md, « Maintenir la documentation »).');
});

// ===== 3. Jeu de données fictif =====

const SILENT_LOG = { info() {}, warn() {} };

function fakeDocApi(tables) {
  return {
    async fetchTable(name) {
      if (!tables[name]) throw new Error(`Table inconnue : ${name}`);
      return structuredClone(tables[name]);
    }
  };
}

test('le jeu de données fictif est lu sans incident par le vrai loadDirectory() et donne les cartes annoncées', async () => {
  const { contacts, issues } = await loadDirectory(fakeDocApi(tablesFictives()), { log: SILENT_LOG });
  assert.deepEqual(issues, [],
    'Le widget signale un problème sur le jeu fictif : la structure Grist a-t-elle changé ? Adaptez docs/demo/donnees-fictives.mjs.');
  const displayed = scope => filterContacts(contacts, createEmptyFilterState(), '', scope).length;
  assert.equal(displayed({ fondateur: true, partenaire: false }), CARTES_ATTENDUES.fondateurs);
  assert.equal(displayed({ fondateur: true, partenaire: true }), CARTES_ATTENDUES.fondateursEtPartenaires);
  // Le guide cite le compteur de la capture d'ensemble : il doit rester celui du jeu fictif.
  assert.ok(read('docs/utilisateurs.md').includes(`« ${CARTES_ATTENDUES.fondateurs} contacts »`),
    `docs/utilisateurs.md doit citer « ${CARTES_ATTENDUES.fondateurs} contacts » (capture apercu.png) : régénérez les captures et le guide.`);
});

test('le jeu de données fictif ne contient que des coordonnées fictives', () => {
  const tables = tablesFictives();
  const emails = JSON.stringify(tables).match(/[\w.+-]+@[\w.-]+/g) ?? [];
  assert.ok(emails.length > 0, 'Aucune adresse trouvée : ce test ne vérifie plus rien.');
  assert.deepEqual(emails.filter(email => !email.endsWith('.example')), [],
    'Adresses hors du domaine réservé .example (RFC 2606) : jamais de vraie adresse dans le dépôt.');

  // Numeric dans Grist : le 0 initial est perdu, 0 = non renseigné.
  const phones = tables.BDD.numero_de_telephone.filter(Boolean).map(value => String(value).padStart(10, '0'));
  assert.ok(phones.length > 0, 'Aucun numéro trouvé : ce test ne vérifie plus rien.');
  assert.deepEqual(phones.filter(phone => !/^0(?:53649|63998)\d{4}$/.test(phone)), [],
    'Numéros hors des plages réservées à la fiction, 05 36 49 xx xx et 06 39 98 xx xx (ARCEP, décision n° 2018-0881).');
});

// ===== 4. Serveur de démonstration =====

test('le serveur de démonstration sert le widget avec l\'API Grist simulée, et rien d\'autre', async () => {
  const { server, url } = await startDemoServer();
  try {
    const page = await (await fetch(`${url}/`)).text();
    assert.match(page, /<script src="\/__grist-simule\.js"><\/script>/, 'L\'API Grist simulée doit remplacer grist-plugin-api.js.');
    assert.doesNotMatch(page, /docs\.getgrist\.com/, 'Aucun script externe ne doit être chargé par la démonstration.');
    assert.equal((await fetch(`${url}/__grist-simule.js`)).status, 200);
    assert.equal((await fetch(`${url}/main.js`)).status, 200);

    // L'historique Git et les documents restent inaccessibles.
    for (const forbidden of ['/.git/HEAD', '/README.md', '/grist_structure.txt']) {
      assert.equal((await fetch(`${url}${forbidden}`)).status, 404, `${forbidden} ne doit pas être servi`);
    }

    // Un fichier d'un type servi, mais hors du dépôt : seul le contrôle du dossier le protège.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-hors-depot-'));
    try {
      const secret = path.join(outside, 'secret.js');
      fs.writeFileSync(secret, '// hors du dépôt');
      const climbing = path.relative(ROOT, secret).split(path.sep).map(encodeURIComponent).join('%2f');
      assert.equal((await fetch(`${url}/${climbing}`)).status, 404, 'Un chemin qui remonte hors du dépôt ne doit pas être servi.');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
});

// Se connecter comme une personne fictive : ?connecte=adresse. On exécute le script que
// le serveur de démonstration sert à la place de grist-plugin-api.js, comme le ferait
// une page ouverte avec cette adresse, puis on le fait parler au vrai code du widget.

const QUIET_LOG = { info() {}, warn() {}, error() {} };

let demoScript;
async function openDemoPage(search = '') {
  if (!demoScript) {
    const { server, url } = await startDemoServer();
    try {
      demoScript = await (await fetch(`${url}/__grist-simule.js`)).text();
    } finally {
      server.close();
      server.closeAllConnections?.();
    }
  }
  const page = { URLSearchParams, structuredClone, setTimeout, location: { search } };
  page.window = page;
  vm.runInNewContext(demoScript, page);
  return page;
}

const demoDirectory = page => loadDirectory(page.grist.docApi, { log: QUIET_LOG });
const founders = contacts => filterContacts(contacts, createEmptyFilterState(), '', { fondateur: true, partenaire: false });

test('la démonstration connecte la personne passée dans l\'adresse (?connecte=) et laisse la table-sonde vide', async () => {
  for (const [role, email] of Object.entries(PERSONNES_DEMO)) {
    const page = await openDemoPage(`?connecte=${email}`);
    const identity = await readIdentity(page.grist.docApi, { log: QUIET_LOG });
    assert.equal(identity.status, 'ready', `${role} : ${identity.reason}`);
    assert.equal(identity.email, email);
    assert.equal(identity.admin, role === 'administrateur', `${role} : le droit d'administrateur vient de la table ACL`);
    await new Promise(resolve => setTimeout(resolve, 0)); // le widget n'attend pas la suppression de la ligne de la sonde
    assert.equal((await page.grist.docApi.fetchTable('Annuaire_Sonde')).id.length, 0, `${role} : la ligne de la sonde doit être supprimée`);
  }
});

test('sans ?connecte=, la démonstration est un compte anonyme : personne n\'est identifié', async () => {
  const identity = await readIdentity((await openDemoPage('')).grist.docApi, { log: QUIET_LOG });
  assert.equal(identity.status, 'unavailable');
});

test('pour chaque personne de démonstration, le bandeau « Ma présence » dit ce que le guide utilisateur annonce', async () => {
  const guide = read('docs/utilisateurs.md');
  const expectedTone = { visible: 'ok', partenaire: 'ok', refus: 'off', masquee: 'warn', administrateur: 'ok' };
  assert.deepEqual(Object.keys(PERSONNES_DEMO).sort(), Object.keys(expectedTone).sort(), 'Une personne de démonstration est à décrire ici.');
  for (const [role, email] of Object.entries(PERSONNES_DEMO)) {
    const { people } = await demoDirectory(await openDemoPage());
    const persons = people.findByEmail(email);
    assert.equal(persons.length, 1, `${role} : une seule fiche doit porter ${email}`);
    const { tone, message } = describePresence(persons);
    assert.equal(tone, expectedTone[role], role);
    assert.ok(guide.includes(message), `Le guide utilisateur doit citer le message de « ${role} » : ${message}`);
  }
});

test('le guide utilisateur cite les autres messages de « Ma présence » : raisons de masquage, fiches multiples, erreurs d\'écriture', () => {
  const guide = read('docs/utilisateurs.md');
  const status = overrides => ({ accepted: true, visible: false, named: true, inScope: true, etablissement: 'ok', partnerOnly: false, ...overrides });
  const alone = overrides => describePresence([{ status: status(overrides) }]).message;
  const reasons = [{ named: false }, { inScope: false }, { etablissement: 'missing' }, { etablissement: 'unknown' },
    { etablissement: 'not_validated' }, { etablissement: 'not_eligible' }]
    .map(overrides => alone(overrides).match(/masquée : (.+)\. Contactez/)?.[1]);
  assert.ok(reasons.every(Boolean), 'presence.js ne donne plus la raison du masquage sous la forme attendue : adaptez ce test et le guide.');

  const two = statuses => describePresence(statuses.map(item => ({ status: status(item) }))).message;
  const messages = [
    ...reasons,
    ...two([{ accepted: true, visible: true }, { accepted: false }]).split(/(?<=\.) /),
    ...two([{ accepted: true, visible: true }, { accepted: true, visible: true }]).split(/(?<=\.) /),
    explainWriteError(new Error('Blocked by table update access rules')),
    explainWriteError(new Error('Cannot modify a formula column')),
    explainWriteError(new Error('boom'))
  ];
  const missing = messages.filter(message => !guide.includes(message));
  assert.deepEqual(missing, [], 'Citez ces messages dans la section « Ma présence » de docs/utilisateurs.md.');

  // Messages de main.js, qui ne sont pas exportés : le guide et le code doivent dire la même chose.
  const main = read('main.js');
  ['Enregistrement…', 'Modification enregistrée ; l\'annuaire n\'a pas pu être rechargé.'].forEach(message => {
    assert.ok(main.includes(message.replaceAll('\'', '\\\'')), `main.js ne dit plus « ${message} » : adaptez le guide utilisateur.`);
    assert.ok(guide.includes(message), `Le guide utilisateur doit citer « ${message} ».`);
  });
});

test('dans la démonstration, un clic sur l\'interrupteur retire la personne de l\'annuaire, et la personne qui avait refusé peut y apparaître', async () => {
  const email = PERSONNES_DEMO.visible;
  const page = await openDemoPage(`?connecte=${email}`);
  let directory = await demoDirectory(page);
  assert.equal(founders(directory.contacts).length, CARTES_ATTENDUES.fondateurs);

  await setPresence(page.grist.docApi, directory.people.findByEmail(email), false, { log: QUIET_LOG });
  directory = await demoDirectory(page);
  assert.equal(founders(directory.contacts).length, CARTES_ATTENDUES.fondateurs - 1, 'une carte de moins : celle de la personne qui s\'est retirée');
  assert.equal(describePresence(directory.people.findByEmail(email)).message, 'Vous n\'apparaissez pas dans l\'annuaire.');

  const refus = PERSONNES_DEMO.refus;
  await setPresence(page.grist.docApi, directory.people.findByEmail(refus), true, { log: QUIET_LOG });
  directory = await demoDirectory(page);
  assert.equal(founders(directory.contacts).length, CARTES_ATTENDUES.fondateurs, 'la personne qui avait refusé est revenue, l\'autre est partie');
  assert.equal(describePresence(directory.people.findByEmail(refus)).tone, 'ok');
});

test('?refus=BDD simule une règle d\'accès : l\'écriture est refusée, avec un message en français, et rien ne change', async () => {
  const email = PERSONNES_DEMO.visible;
  const page = await openDemoPage(`?connecte=${email}&refus=BDD`);
  const { people } = await demoDirectory(page);
  await assert.rejects(setPresence(page.grist.docApi, people.findByEmail(email), false, { log: QUIET_LOG }),
    error => error.name === 'PresenceError' && /Grist a refusé la modification/.test(error.message));
  assert.equal(describePresence((await demoDirectory(page)).people.findByEmail(email)).tone, 'ok', 'la personne est toujours visible');
});

// Modifier sa fiche (1.12.0) : la personne de démonstration change sa fonction, comme le
// guide le raconte. Les écritures reçues par le faux document sont dans __demo.actions.
const bddWrites = page => page.__demo.actions.filter(call => call.table === 'BDD' && call.ok);

async function openProfileDemo(email) {
  const page = await openDemoPage(`?connecte=${email}`);
  const directory = await demoDirectory(page);
  const identity = await readIdentity(page.grist.docApi, { log: QUIET_LOG });
  const [mine] = directory.people.findByEmail(email);
  const options = { referenceMaps: directory.referenceMaps, etabFlags: directory.etabFlags, log: QUIET_LOG };
  const draft = draftOf(profileFormModel(mine.row, directory.referenceMaps));
  return { page, directory, identity, mine, options, draft };
}

test('dans la démonstration, chacun ne peut modifier que sa fiche, et un administrateur toutes les fiches', async () => {
  const { identity, directory, mine } = await openProfileDemo(PERSONNES_DEMO.visible);
  const other = directory.people.findByEmail(PERSONNES_DEMO.partenaire)[0];
  assert.equal(rightsFor(identity)(mine.row), 'own', 'sa propre fiche');
  assert.equal(rightsFor(identity)(other.row), null, 'la fiche d\'une autre personne : aucun droit');
  assert.equal(rightsFor({ status: 'viewer', email: '', admin: false })(mine.row), null, 'un compte Lecteur ne modifie rien');

  const admin = await openProfileDemo(PERSONNES_DEMO.administrateur);
  assert.equal(admin.identity.admin, true);
  assert.equal(rightsFor(admin.identity)(other.row), null, 'un administrateur ne modifie que sa fiche tant que le « Mode admin » est éteint');
  assert.equal(rightsFor(admin.identity, { adminMode: true })(other.row), 'admin', 'avec le « Mode admin », un administrateur modifie la fiche de tout le monde');
  assert.equal(rightsFor(admin.identity)(admin.mine.row), 'own');
  assert.equal(rightsFor(admin.identity, { adminMode: true })(admin.mine.row), 'own', 'sa propre fiche reste la sienne, mode admin ou non');
});

test('dans la démonstration, la relecture n\'écrit rien, puis une seule action ne change que la colonne modifiée', async () => {
  const { page, mine, options, draft } = await openProfileDemo(PERSONNES_DEMO.visible);
  draft.Fonction = 'Directrice du numérique';

  const review = await prepareReview(page.grist.docApi, mine.row, draft, options);
  assert.deepEqual(review.lines.map(line => line.label), ['Fonction'], 'la liste « Ce qui change » ne montre que la fonction');
  assert.equal(bddWrites(page).length, 0, 'la relecture n\'écrit rien dans Grist');

  const result = await saveProfile(page.grist.docApi, review, { log: QUIET_LOG });
  assert.equal(result.status, 'saved');
  const writes = bddWrites(page);
  assert.equal(writes.length, 1, 'une seule action Grist');
  assert.equal(writes[0].action, 'UpdateRecord');
  assert.equal(writes[0].rowId, mine.row.id, 'sur la seule fiche de la personne');
  assert.deepEqual(Object.keys(writes[0].values), ['Fonction'], 'et seule la colonne modifiée est envoyée');

  const { contacts } = await demoDirectory(page);
  assert.ok(contacts.some(contact => contact.Fonction === 'Directrice du numérique'), 'la carte montre la nouvelle fonction');
});

test('dans la démonstration, une fiche modifiée entre-temps par quelqu\'un d\'autre n\'est pas écrasée', async () => {
  const { page, mine, options, draft } = await openProfileDemo(PERSONNES_DEMO.visible);
  draft.Fonction = 'Directrice du numérique';
  const review = await prepareReview(page.grist.docApi, mine.row, draft, options);

  await page.grist.docApi.applyUserActions([['UpdateRecord', 'BDD', mine.row.id, { Fonction: 'Changée par un autre' }]]);
  const result = await saveProfile(page.grist.docApi, review, { log: QUIET_LOG });
  assert.equal(result.status, 'changed', 'rien n\'est écrit : la personne relit d\'abord ce que Grist contient');
  assert.equal(bddWrites(page).length, 1, 'seule l\'écriture de l\'autre personne a eu lieu');
  assert.equal(result.row.Fonction, 'Changée par un autre');
});

test('?refus=BDD : la modification de fiche est refusée avec un message en français, et rien ne change', async () => {
  const email = PERSONNES_DEMO.visible;
  const page = await openDemoPage(`?connecte=${email}&refus=BDD`);
  const directory = await demoDirectory(page);
  const [mine] = directory.people.findByEmail(email);
  const draft = draftOf(profileFormModel(mine.row, directory.referenceMaps));
  draft.Fonction = 'Directrice du numérique';
  const review = await prepareReview(page.grist.docApi, mine.row, draft, { referenceMaps: directory.referenceMaps, etabFlags: directory.etabFlags, log: QUIET_LOG });
  await assert.rejects(saveProfile(page.grist.docApi, review, { log: QUIET_LOG }),
    error => error.name === 'ProfileSaveError' && /Grist a refusé la modification/.test(error.message));
  assert.equal(bddWrites(page).length, 0);
});

// Les messages que la fenêtre de modification dit à la personne sont cités tels quels dans
// le guide : chaque citation « … » de la section (ou ses morceaux, quand une partie
// variable est remplacée par …) doit figurer mot pour mot dans le code du widget.
const widgetCode = () => fs.readdirSync(ROOT).filter(name => name.endsWith('.js') || name === 'index.html')
  .map(name => read(name)).join('\n')
  .replace(/['`]\s*\+\s*['`]/g, '')   // une phrase écrite en plusieurs morceaux
  .replaceAll('\\\'', '\'');

test('les messages cités dans « Modifier ma fiche » sont ceux du code', () => {
  const guide = read('docs/utilisateurs.md');
  const start = guide.indexOf('\n## Modifier ma fiche');
  assert.ok(start >= 0, 'Le guide utilisateur doit avoir une section « Modifier ma fiche ».');
  const end = guide.indexOf('\n## ', start + 1);
  const section = guide.slice(start, end);

  // Messages composés à l'exécution : on les demande à la fonction qui les compose.
  const hidden = overrides => ({ accepted: true, visible: false, named: true, inScope: true, etablissement: 'not_validated', ...overrides });
  const composed = [describeHiddenFiche(hidden({}), { own: true }), describeHiddenFiche(hidden({}), { own: false })];
  composed.forEach(message => assert.ok(section.includes(message), `Le guide doit citer : ${message}`));

  const code = widgetCode();
  const known = fragment => code.includes(fragment) || code.includes(fragment.replace(/\.$/, '')) // le point final est ajouté à l'affichage
    || composed.includes(fragment) || /^\d+ champs? modifiés?$/.test(fragment);
  const fragments = [...section.matchAll(/«\s?([^»]+?)\s?»/g)]
    .flatMap(match => match[1].split(/…|\.\.\./))
    .map(fragment => fragment.trim())
    .filter(fragment => fragment.length >= 15 && fragment !== 'qui a changé quoi');
  assert.ok(fragments.length >= 15, 'Ce test ne vérifie plus assez de messages : la section a-t-elle changé de forme ?');
  assert.deepEqual(fragments.filter(fragment => !known(fragment)), [],
    'Ces citations du guide ne figurent pas dans le code : recopiez le message tel qu\'il s\'affiche.');
});

test('les personnes fictives citées dans le guide sont masquées, ou visibles, pour la raison qu\'il donne', async () => {
  const guide = read('docs/utilisateurs.md');
  const { contacts, people } = await demoDirectory(await openDemoPage());
  const bdd = tablesFictives().BDD;
  const statusOf = name => {
    const index = bdd.prenom.findIndex((prenom, row) => `${prenom} ${bdd.nom[row]}` === name);
    assert.ok(index >= 0, `${name} n'existe pas dans le jeu de démonstration`);
    return people.findByEmail(bdd.email[index])[0].status;
  };
  const reasons = {
    'Sarah Colin': status => status.accepted && status.etablissement === 'not_validated',
    'Gabriel Noël': status => status.etablissement === 'not_eligible',
    'Alice Bertin': status => status.etablissement === 'missing',
    'Victor Lambert': status => !status.inScope,
    'Lucas Mercier': status => !status.accepted
  };
  Object.entries(reasons).forEach(([name, because]) => {
    assert.ok(guide.includes(name), `Le guide utilisateur doit citer ${name}.`);
    const status = statusOf(name);
    assert.ok(!status.visible && because(status), `${name} : la raison donnée par le guide n'est plus celle du jeu fictif`);
  });
  const names = new Set(founders(contacts).map(contact => `${contact.prenom} ${contact.nom}`));
  assert.ok(guide.includes('Clara Dubois') && statusOf('Clara Dubois').partnerOnly && !names.has('Clara Dubois'),
    'Clara Dubois est d\'un établissement partenaire : visible seulement avec l\'interrupteur Partenaires');
});

// ===== 5. Cohérence avec le code =====

const NUMBER_WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];

const FILTER_COUNT = /\b(zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze) filtres(?=\*{0,2}\s*[:,.;)])/gi;

test('le guide utilisateur annonce le bon nombre de filtres', () => {
  const mentions = [...read('docs/utilisateurs.md').matchAll(FILTER_COUNT)];
  const problems = mentions
    .filter(([, word]) => NUMBER_WORDS.indexOf(word.toLowerCase()) !== FILTERS.length)
    .map(([, word]) => `« ${word} filtres », alors que le widget en propose ${FILTERS.length}`);
  assert.ok(mentions.length > 0, 'Aucune mention du nombre de filtres : ce test ne vérifie plus rien.');
  assert.deepEqual(problems, [], 'Corrigez le nombre de filtres dans le guide utilisateur.');
});

test('le guide utilisateur présente chaque filtre', () => {
  const guide = read('docs/utilisateurs.md');
  const missing = FILTERS.map(filter => filter.label).filter(label => !guide.includes(label));
  assert.deepEqual(missing, [], 'Ajoutez ces filtres au guide utilisateur (« Découvrir l\'écran », « Filtrer »).');
});

// Demande d'Antoine : dans une V2 les filtres seront peut-être personnalisables, donc le
// README ne dit ni combien il y en a ni lesquels. Le détail vit dans docs/utilisateurs.md.
test('le README reste générique : ni nombre de filtres, ni liste de leurs noms', () => {
  const readme = read('README.md');
  const counts = [...readme.matchAll(FILTER_COUNT)].map(([mention]) => `« ${mention} »`);
  const lists = readme.split('\n')
    .filter(line => FILTERS.filter(({ label }) => new RegExp(`(?<![\\p{L}])${label}(?![\\p{L}])`, 'u').test(line)).length >= 3)
    .map(line => `« ${line.trim().slice(0, 60)}… »`);
  assert.deepEqual([...counts, ...lists], [],
    'Le README ne nomme ni ne compte les filtres (ils pourraient devenir personnalisables) : renvoyez au guide utilisateur.');
});

test('le guide utilisateur définit le vocabulaire du PUI (GT, fondateur, partenaire, « autres »)', () => {
  const lexique = read('docs/utilisateurs.md').split(/^## /m).find(part => part.startsWith('Lexique du PUI')) ?? '';
  const missing = ['PUI', 'GT', 'fondateur', 'partenaire', 'autres'].filter(word => !lexique.toLowerCase().includes(word.toLowerCase()));
  assert.deepEqual(missing, [], 'Ces mots doivent être définis dans la section « Lexique du PUI » de docs/utilisateurs.md.');
});

// Demande d'Antoine : la page de maintenance dit ce qui se passe quand les personnes
// partent et qu'il n'y a plus d'administrateur, avec les éléments à prévoir et les
// bonnes pratiques.
test('la page de maintenance a un chapitre de continuité (départs, absence d\'administrateur)', () => {
  const chapter = read('docs/maintenance.md').split(/^## /m).find(part => part.startsWith('Continuité')) ?? '';
  const missing = ['propriétaire', 'sauvegarde', 'suppléant', 'fiche de continuité', 'bonnes pratiques', 'GitHub', 'Grist']
    .filter(word => !chapter.toLowerCase().includes(word.toLowerCase()));
  assert.deepEqual(missing, [], 'Le chapitre « Continuité » de docs/maintenance.md doit rester : départs, absence d\'administrateur, éléments à prévoir, bonnes pratiques.');
});

test('la documentation développeur cite chaque module du widget', () => {
  const guide = read('docs/developpeurs.md');
  const missing = fs.readdirSync(ROOT).filter(name => name.endsWith('.js')).filter(name => !guide.includes(`\`${name}\``));
  assert.deepEqual(missing, [], 'Décrivez ces modules dans docs/developpeurs.md (« Organisation du code »).');
});

test('la page de maintenance donne la table et les colonnes de libellé de chaque filtre à liste', () => {
  const page = read('docs/maintenance.md');
  const names = Object.values(CATEGORIES)
    .filter(category => category.column)
    .flatMap(({ table, field }) => [table, ...[].concat(field)]);
  const missing = [...new Set(names)].filter(name => !page.includes(`\`${name}\``));
  assert.deepEqual(missing, [], 'Ajoutez ces noms à docs/maintenance.md (« Opérations courantes dans Grist »).');
});

// ===== 6. La page de sécurité décrit fidèlement le code =====

const WIDGET_SOURCES = () => fs.readdirSync(ROOT).filter(name => name.endsWith('.js')).map(name => ({ name, code: read(name) }));

// docs/securite.md affirme : peu de méthodes de l'API de Grist, aucune requête réseau,
// aucun stockage dans le navigateur, aucun texte de Grist inséré comme HTML, un seul
// script externe. Ces affirmations sont vraies tant que ce test passe.
test('la page de sécurité décrit fidèlement le code : méthodes de l\'API Grist, aucun réseau, aucun stockage, aucun HTML injecté', () => {
  const sources = WIDGET_SOURCES();
  const used = new Set(sources.flatMap(({ code }) => [...code.matchAll(/\b(?:grist|docApi)\.([A-Za-z_$][\w$]*)/g)].map(match => match[1])));
  used.delete('docApi'); // `grist.docApi` est l'objet qui porte les méthodes, pas une méthode
  const cited = ['ready', 'onRecords', 'fetchTable', 'listTables', 'applyUserActions'];
  assert.deepEqual([...used].sort(), [...cited].sort(),
    'Le code emploie d\'autres méthodes de l\'API Grist que celles de docs/securite.md (« Ce que le widget lit, écrit et envoie ») : revoyez cette page, puis ce test.');
  const security = read('docs/securite.md');
  assert.deepEqual(cited.filter(name => !security.includes(`\`${name}\``)), [], 'docs/securite.md doit citer chacune de ces méthodes entre accents graves.');

  const banned = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|\beval\s*\(|new Function|insertAdjacentHTML|outerHTML|document\.write/;
  assert.deepEqual(sources.filter(({ code }) => banned.test(code)).map(({ name }) => name), [],
    'Ces fichiers emploient une API réseau, de stockage ou d\'injection de HTML que docs/securite.md dit absente.');
  const injected = sources.flatMap(({ name, code }) => [...code.matchAll(/\.innerHTML\s*=\s*([^\n]*)/g)]
    .filter(([, value]) => value.trim().replace(/;$/, '') !== '\'\'').map(([line]) => `${name} : ${line}`));
  assert.deepEqual(injected, [], 'innerHTML ne sert qu\'à vider un conteneur : tout texte venu de Grist passe par textContent.');

  const external = [...read('index.html').matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(external, ['https://docs.getgrist.com/grist-plugin-api.js'], 'index.html ne doit charger que le script de l\'API Grist.');
  assert.doesNotMatch(read('style.css'), /@import|url\(\s*["']?https?:/, 'style.css ne doit rien charger d\'externe.');
});

// Le widget écrit (la sonde, le choix de présence) : une page qui le dit « en lecture seule »
// serait fausse, et c'est l'erreur la plus facile à laisser traîner après une évolution.
test('aucune page ne présente le widget comme étant en lecture seule', () => {
  const claims = [
    /\b(?:le widget|l'annuaire|il)\s+(?:est|reste|fonctionne)\s+(?:\*\*)?en\s+(?:\*\*)?lecture seule/i,
    /\bn'(?:\*\*)?écrit(?:\*\*)?\s+rien\s+dans\s+(?:grist|le document)\b/i,
    /\bne fait que lire\b/i
  ];
  const problems = DOC_FILES.flatMap(file => withoutCodeBlocks(read(file)).split('\n')
    .filter(line => claims.some(claim => claim.test(line)))
    .map(line => `${file} : « ${line.trim().slice(0, 90)}… »`));
  assert.deepEqual(problems, [],
    'Le widget écrit dans le document Grist (ligne de la sonde, choix de présence) : corrigez ces phrases (docs/securite.md, « Ce que le widget lit, écrit et envoie »).');
});
