// Garde-fous de la documentation : elle ne doit pas se périmer en silence.
//   1. Les liens et images de README.md et docs/*.md mènent à un fichier et à un
//      titre qui existent ; aucune image de docs/images n'est orpheline.
//   2. Les fichiers et les fonctions cités entre accents graves existent encore.
//   3. Le jeu de données fictif de docs/demo est lu sans incident par le vrai
//      loadDirectory(), donne le nombre de cartes annoncé et reste fictif.
//   4. Le serveur de démonstration ne sert que les fichiers du widget.
//   5. Les documents suivent le code : nombre et noms des filtres, modules,
//      tables et colonnes de libellé.
// Un échec dit quoi corriger : la documentation (docs/maintenance.md, « Maintenir
// la documentation ») ou le jeu fictif (docs/developpeurs.md, « Données et
// captures de démonstration »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, FILTERS } from '../constants.js';
import { loadDirectory } from '../grist-data.js';
import { createEmptyFilterState, filterContacts } from '../filters.js';
import { tablesFictives, CARTES_ATTENDUES } from '../docs/demo/donnees-fictives.mjs';
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

// ===== 2. Fichiers et fonctions cités =====

const SOURCE_FILES = [
  ...fs.readdirSync(ROOT).filter(name => name.endsWith('.js')),
  ...fs.readdirSync(path.join(ROOT, 'docs', 'demo')).map(name => `docs/demo/${name}`)
];

// Cités par la documentation mais fournis par Grist, pas par ce dépôt.
const EXTERNAL_NAMES = new Set(['fetchTable', 'grist-plugin-api.js']);

const FUNCTION_REFERENCE = /^([A-Za-z_$][\w$]*)\(\)$/;
const FILE_REFERENCE = /^[\w./-]+\.(?:js|mjs|css|html|yml|md|txt|png)$/;

test('les fichiers et les fonctions cités dans la documentation existent encore', () => {
  const sources = SOURCE_FILES.map(read).join('\n');
  const isDefined = name => new RegExp(`\\b(?:function|class)\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\s*=`).test(sources);
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

// ===== 5. Cohérence avec le code =====

const NUMBER_WORDS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];

test('les documents annoncent le bon nombre de filtres', () => {
  const problems = [];
  let mentions = 0;
  ['README.md', 'docs/utilisateurs.md'].forEach(file => {
    for (const [, word] of read(file).matchAll(/\b(zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze) filtres(?=\*{0,2}\s*[:,.;)])/gi)) {
      mentions++;
      if (NUMBER_WORDS.indexOf(word.toLowerCase()) !== FILTERS.length) {
        problems.push(`${file} : « ${word} filtres », alors que le widget en propose ${FILTERS.length}`);
      }
    }
  });
  assert.ok(mentions > 0, 'Aucune mention du nombre de filtres : ce test ne vérifie plus rien.');
  assert.deepEqual(problems, [], 'Corrigez le nombre de filtres dans le README et le guide utilisateur.');
});

test('le guide utilisateur présente chaque filtre', () => {
  const guide = read('docs/utilisateurs.md');
  const missing = FILTERS.map(filter => filter.label).filter(label => !guide.includes(label));
  assert.deepEqual(missing, [], 'Ajoutez ces filtres au guide utilisateur (« Découvrir l\'écran », « Filtrer »).');
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
