// La lecture du Markdown de la fenêtre « Documentation » (markdown.js) : ce qu'elle comprend, ce qu'elle refuse de laisser passer
// (aucune balise hors de sa liste, aucun attribut hors de la sienne), et, surtout, qu'elle lit chaque document du dépôt sans rien
// perdre : un titre, un lien ou une image qu'elle ne saurait pas lire se verrait ici avant de se voir dans le widget.
// L'affichage est essayé dans un navigateur (tests/docs-viewer.test.mjs).

import { test } from 'node:test';
import assert from './support/assert.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENTS, parseInline, parseMarkdown, plainText, slugify } from '../markdown.js';
import { DOC_PAGES, resolveImage, resolveLink } from '../docs-source.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blocksOf = markdown => parseMarkdown(markdown).blocks;
const first = markdown => blocksOf(markdown)[0];
const inline = markdown => parseInline(markdown);
const types = nodes => nodes.map(node => node.type);

// ===== En ligne =====

test('l\'emphase : gras, italique, barré, et le code en ligne ne se lit pas', () => {
  assert.deepEqual(inline('un **gras** et *italique* et _autre_ et ~~barré~~'), [
    { type: 'text', text: 'un ' }, { type: 'strong', children: [{ type: 'text', text: 'gras' }] },
    { type: 'text', text: ' et ' }, { type: 'em', children: [{ type: 'text', text: 'italique' }] },
    { type: 'text', text: ' et ' }, { type: 'em', children: [{ type: 'text', text: 'autre' }] },
    { type: 'text', text: ' et ' }, { type: 'del', children: [{ type: 'text', text: 'barré' }] }
  ]);
  assert.deepEqual(inline('`a **b** c`'), [{ type: 'code', text: 'a **b** c' }]);
  assert.deepEqual(inline('``a ` b``'), [{ type: 'code', text: 'a ` b' }]);
  assert.deepEqual(inline('**gras _imbriqué_**')[0].children.map(node => node.type), ['text', 'em']);
});

test('l\'emphase ne s\'ouvre pas où elle n\'a pas lieu : multiplication, snake_case, astérisque seul, espace après le signe', () => {
  for (const text of ['2 * 3 * 4', 'un_nom_de_variable', 'a * b', '** pas du gras', 'fin *', 'nom_de_colonne et autre_chose']) {
    assert.deepEqual(types(inline(text)), ['text'], text);
    assert.equal(plainText(inline(text)), text);
  }
});

test('un échappement donne le caractère lui-même ; une barre oblique inverse en fin de ligne est un saut de ligne', () => {
  assert.equal(plainText(inline('\\*pas italique\\* et \\[pas un lien\\] et \\\\')), '*pas italique* et [pas un lien] et \\');
  assert.deepEqual(types(inline('\\*x\\*')), ['text']);
  assert.deepEqual(types(inline('ligne\\\nsuite')), ['text', 'break', 'text']);
});

test('deux espaces en fin de ligne font un saut de ligne ; un simple retour à la ligne fait une espace', () => {
  assert.deepEqual(inline('un  \ndeux'), [{ type: 'text', text: 'un' }, { type: 'break' }, { type: 'text', text: 'deux' }]);
  assert.deepEqual(inline('un\ndeux'), [{ type: 'text', text: 'un deux' }]);
});

test('les liens et les images : titre, parenthèses dans l\'adresse, image dans un lien, adresse entre chevrons', () => {
  assert.deepEqual(inline('[texte](docs/a.md#b "le titre")'), [{ type: 'link', href: 'docs/a.md#b', title: 'le titre', children: [{ type: 'text', text: 'texte' }] }]);
  assert.equal(inline('[x](a_(b).md)')[0].href, 'a_(b).md');
  assert.deepEqual(inline('![alt **gras**](img/x.png)'), [{ type: 'image', src: 'img/x.png', alt: 'alt gras', title: '' }]);
  const badge = inline('[![Tests](a.svg)](https://example.org/x)')[0];
  assert.equal(badge.type, 'link');
  assert.deepEqual(badge.children, [{ type: 'image', src: 'a.svg', alt: 'Tests', title: '' }]);
  assert.equal(inline('[x](<un fichier.md>)')[0].href, 'un fichier.md');
  assert.deepEqual(inline('<https://example.org/page>'), [{ type: 'link', href: 'https://example.org/page', title: '', children: [{ type: 'text', text: 'https://example.org/page' }] }]);
});

test('ce qui ressemble à un lien sans en être un reste du texte', () => {
  for (const text of ['[pas fermé', '[texte] (espace)', '[a](non fermé', '![alt', 'a ![b] c']) {
    assert.ok(!types(inline(text)).includes('link') && !types(inline(text)).includes('image'), text);
    assert.equal(plainText(inline(text)).replace(/\s+/g, ' '), text.replace(/\s+/g, ' '), `rien ne se perd : ${text}`);
  }
});

test('les entités courantes sont lues, les autres restent telles quelles', () => {
  assert.equal(plainText(inline('a &amp; b &lt;c&gt; &quot;d&quot; &#233; &#x41; &nbsp;e')), 'a & b <c> "d" é A  e');
  assert.equal(plainText(inline('&bogus; &#99999999; &amp')), '&bogus; &#99999999; &amp');
});

// ===== HTML : une liste fermée =====

test('le HTML admis : les balises du README se lisent, avec leurs attributs utiles seulement', () => {
  const [node] = inline('<a href="docs/x.md#y" onclick="alert(1)" style="color:red" class="c">lien</a>');
  assert.deepEqual(node, { type: 'element', tag: 'a', attrs: { href: 'docs/x.md#y' }, children: [{ type: 'text', text: 'lien' }] });
  const [image] = inline('<img src="a.png" alt="une image" width="100%" onerror="alert(1)" title="t">');
  assert.deepEqual(image, { type: 'element', tag: 'img', attrs: { src: 'a.png', alt: 'une image', title: 't' }, children: [] });
  assert.deepEqual(types(inline('a<br>b<br/>c')), ['text', 'break', 'text', 'break', 'text']);
  assert.deepEqual(inline('<sub><b>x</b> y</sub>')[0].children.map(node => node.type), ['element', 'text']);
  const cell = inline('<td colspan="2" align="center" width="50%" bgcolor="red">c</td>')[0];
  assert.deepEqual(cell.attrs, { colspan: '2', align: 'center' });
  assert.deepEqual(inline('<details open><summary>s</summary>d</details>')[0].attrs, { open: '' });
});

test('une balise hors de la liste n\'est pas du HTML : elle reste du texte, avec tout ce qu\'elle contient', () => {
  for (const [source, shown] of [
    ['<script>alert(1)</script>', '<script>alert(1)</script>'],
    ['<iframe src="https://example.org"></iframe>', '<iframe src="https://example.org"></iframe>'],
    ['<style>p{display:none}</style>', '<style>p{display:none}</style>'],
    ['<img/src=x onerror=alert(1)>', '<img/src=x onerror=alert(1)>'],
    ['<form action="x"><input name="a"></form>', '<form action="x"><input name="a"></form>'],
    ['<svg onload=alert(1)>', '<svg onload=alert(1)>'],
    ['<adresse>', '<adresse>'],
    ['a <b et c', 'a <b et c']
  ]) {
    const nodes = inline(source);
    assert.ok(nodes.every(node => node.type !== 'element'), `${source} : aucun élément`);
    assert.equal(plainText(nodes), shown, `${source} : le texte est montré tel quel`);
  }
});

test('ELEMENTS ne contient aucune balise qui exécute, charge, saisit ou encadre', () => {
  const dangerous = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'option',
    'base', 'link', 'meta', 'svg', 'math', 'video', 'audio', 'source', 'track', 'canvas', 'dialog', 'template', 'slot', 'noscript', 'portal', 'title', 'head', 'body', 'html'];
  assert.deepEqual(dangerous.filter(tag => ELEMENTS.has(tag)), []);
  assert.deepEqual([...ELEMENTS].filter(tag => !/^[a-z]+$/.test(tag)), []);
});

test('une ouverture sans fermeture, une fermeture sans ouverture et un commentaire ne montrent rien', () => {
  assert.deepEqual(inline('avant <div align="center"> après'), [{ type: 'text', text: 'avant  après' }]);
  assert.equal(plainText(inline('avant </div> après')), 'avant  après');
  assert.equal(plainText(inline('a <!-- caché --> b')), 'a  b');
  assert.deepEqual(blocksOf('<!-- un commentaire\nsur deux lignes -->\n\ntexte').map(block => block.type), ['paragraph']);
});

// ===== Blocs =====

test('les titres : niveau, identifiant comme GitHub, doublons numérotés', () => {
  const { blocks, headings } = parseMarkdown('# Un titre\n\n## Ça marche : « bien » !\n\n## Ça marche : « bien » !\n\n### `code` et [lien](x.md)\n\n#pas-un-titre\n\n####### sept');
  assert.deepEqual(blocks.filter(block => block.type === 'heading').map(({ level, id }) => [level, id]), [
    [1, 'un-titre'], [2, 'ça-marche---bien--'], [2, 'ça-marche---bien---1'], [3, 'code-et-lien']
  ]);
  assert.deepEqual(headings.map(heading => heading.text), ['Un titre', 'Ça marche : « bien » !', 'Ça marche : « bien » !', 'code et lien']);
  assert.equal(blocks.filter(block => block.type === 'paragraph').length, 2, '« #pas-un-titre » et sept dièses sont des paragraphes');
  assert.equal(first('# Titre avec fermeture ##').children[0].text, 'Titre avec fermeture');
  assert.equal(slugify('Ma présence : apparaître ou non'), 'ma-présence--apparaître-ou-non');
});

test('les listes : puces, numéros, début, imbrication, suite paresseuse, cases à cocher, liste aérée', () => {
  const nested = first('- un\n  - deux\n    - trois\n- quatre');
  assert.equal(nested.type, 'list');
  assert.equal(nested.items.length, 2);
  assert.equal(nested.items[0].blocks[1].items[0].blocks[1].items[0].blocks[0].children[0].text, 'trois');

  const numbered = first('3. trois\n4. quatre');
  assert.deepEqual([numbered.ordered, numbered.start, numbered.items.length], [true, 3, 2]);

  assert.equal(first('- une ligne\ncontinue ici\n- autre').items[0].blocks[0].children[0].text, 'une ligne continue ici');

  const tasks = first('- [ ] à faire\n- [x] fait\n- [X] fait aussi\n- normal');
  assert.deepEqual(tasks.items.map(item => item.checked), [false, true, true, null]);
  assert.equal(tasks.items[0].blocks[0].children[0].text, 'à faire');

  assert.equal(first('- a\n- b').loose, false);
  assert.equal(first('- a\n\n- b').loose, true);
  assert.equal(blocksOf('- a\n\n  suite de a\n- b').length, 1, 'un élément à plusieurs paragraphes reste dans sa liste');

  assert.deepEqual(blocksOf('1. a\n2. b\n\n- c').map(block => block.type), ['list', 'list'], 'numérotée puis à puces : deux listes');
});

test('une liste ne prend pas une ligne qui n\'en est pas une : « 2026. » en début de ligne, un tiret collé, un astérisque de gras', () => {
  assert.deepEqual(blocksOf('un texte\n2026. une année\nencore').map(block => block.type), ['paragraph']);
  assert.deepEqual(blocksOf('-pas une liste').map(block => block.type), ['paragraph']);
  assert.deepEqual(blocksOf('**gras** au début').map(block => block.type), ['paragraph']);
  assert.deepEqual(blocksOf('un texte\n- puis une liste').map(block => block.type), ['paragraph', 'list'], 'une puce interrompt un paragraphe');
});

test('les blocs de code : langage, tildes, indentation d\'un élément de liste, bloc jamais refermé', () => {
  assert.deepEqual(first('```bash\nnpm test\n```'), { type: 'code', lang: 'bash', text: 'npm test' });
  assert.deepEqual(first('~~~\na\n```\nb\n~~~'), { type: 'code', lang: '', text: 'a\n```\nb' });
  assert.deepEqual(first('````\n```\ndedans\n```\n````'), { type: 'code', lang: '', text: '```\ndedans\n```' });
  assert.equal(first('```\njamais refermé\nsuite').text, 'jamais refermé\nsuite');
  const inItem = first('1. une étape\n\n   ```bash\n   npm test\n   ```\n2. suite');
  assert.deepEqual(inItem.items[0].blocks[1], { type: 'code', lang: 'bash', text: 'npm test' });
  assert.equal(first('```\n# pas un titre\n- pas une liste\n```').text, '# pas un titre\n- pas une liste');
});

test('les tableaux : en-tête, alignement, cellules complétées, barre échappée, mise en forme dans une cellule', () => {
  const table = first('| Nom | Valeur | Autre |\n|:---|---:|:---:|\n| `a\\|b` | **gras** |\n| 2 | x | y | z |');
  assert.equal(table.type, 'table');
  assert.deepEqual(table.align, ['left', 'right', 'center']);
  assert.deepEqual(table.head.map(cell => plainText(cell)), ['Nom', 'Valeur', 'Autre']);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0].map(cell => plainText(cell)), ['a|b', 'gras', '']);
  assert.deepEqual(table.rows[1].map(cell => plainText(cell)), ['2', 'x', 'y'], 'une cellule en trop est ignorée');
  assert.deepEqual(blocksOf('a | b\n--|--\n1 | 2').map(block => block.type), ['table'], 'sans barres aux extrémités');
  assert.deepEqual(blocksOf('une | barre\npas de séparateur').map(block => block.type), ['paragraph']);
  assert.deepEqual(blocksOf('| a | b |\n|---|\n| 1 | 2 |').map(block => block.type), ['paragraph'], 'séparateur de la mauvaise largeur : pas un tableau');
});

test('citation, filet, bloc HTML : un bloc HTML s\'arrête à la ligne vide, et Markdown reprend ensuite', () => {
  const quote = first('> une **citation**\n> sur deux lignes\n\nsuite');
  assert.equal(quote.type, 'quote');
  assert.equal(plainText(quote.blocks[0].children), 'une citation sur deux lignes');
  assert.deepEqual(blocksOf('a\n\n---\n\nb').map(block => block.type), ['paragraph', 'rule', 'paragraph']);
  assert.deepEqual(blocksOf('* * *').map(block => block.type), ['rule']);

  const blocks = blocksOf('<div align="center">\n\n# Titre\n\ntexte\n\n</div>');
  assert.deepEqual(blocks.map(block => block.type), ['heading', 'paragraph'], 'le <div> sans fermeture et le </div> seul ne montrent rien');
  const table = first('<table>\n  <tr>\n    <td><img src="a.png" alt="A"><br><sub><b>x</b> y</sub></td>\n  </tr>\n</table>');
  assert.equal(table.type, 'html');
  assert.equal(table.children[0].tag, 'table');
});

test('rien ne se perd à la lecture : le texte d\'un paragraphe ordinaire revient entier', () => {
  const sentence = 'Le widget lit Grist (BDD, Etablissements) : « élise marchetti » — 2 + 2 = 4 ; a/b, c.d, e-f ! 100 % ?';
  assert.equal(plainText(first(sentence).children), sentence);
});

// ===== Les documents du dépôt =====

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = file => fs.existsSync(path.join(ROOT, file));

// Tous les nœuds d'un document, en ligne comme en bloc.
function walk(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    for (const child of [node.children, node.blocks, node.head, ...(node.rows ?? []), ...(node.items ?? []).map(item => item.blocks)]) {
      if (Array.isArray(child)) walk(Array.isArray(child[0]) ? child.flat() : child, visit);
    }
  }
}

const parsed = new Map(DOC_PAGES.map(page => [page.path, parseMarkdown(read(page.path))]));

test('chaque document de la fenêtre se lit, vite, et chacun de ses titres de la source est dans l\'arbre', () => {
  const started = performance.now();
  for (const { path: file } of DOC_PAGES) parseMarkdown(read(file));
  assert.ok(performance.now() - started < 1500, 'tous les documents se lisent en moins d\'une seconde et demie');
  const problems = [];
  for (const [file, { headings }] of parsed) {
    const source = read(file).replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '');
    const atx = [...source.matchAll(/^ {0,3}#{1,6}[ \t]+\S/gm)].length;
    if (headings.length !== atx) problems.push(`${file} : ${atx} titres dans la source, ${headings.length} lus`);
  }
  assert.deepEqual(problems, [], 'markdown.js perd ou invente des titres.');
});

test('aucun document ne montre une balise HTML qu\'il voulait en HTML : ni <div>, ni <table>, ni <img>, ni <br> restés en texte', () => {
  const problems = [];
  for (const [file, { blocks }] of parsed) {
    walk(blocks, node => {
      if (node.type === 'text' && /<\/?(?:div|p|table|tr|td|th|img|br|sub|b|a|details|summary)\b/i.test(node.text)) problems.push(`${file} : « ${node.text.slice(0, 60)} »`);
    });
  }
  assert.deepEqual(problems, [], 'Une balise de mise en page reste du texte : markdown.js doit la lire, ou le document la reformuler.');
});

test('chaque lien d\'un document mène quelque part : un autre document ouvert dans la fenêtre à un titre qui existe, une page https, ou du texte', () => {
  const problems = [];
  let internal = 0;
  for (const [file, { blocks }] of parsed) {
    walk(blocks, node => {
      const href = node.type === 'link' ? node.href : node.type === 'element' && node.tag === 'a' ? node.attrs.href ?? '' : null;
      if (href === null) return;
      const target = resolveLink(file, href);
      if (target.kind === 'external') assert.match(target.href, /^https:\/\//);
      if (target.kind !== 'doc' && target.kind !== 'anchor') return;
      internal++;
      const page = target.kind === 'doc' ? target.page : file;
      if (target.anchor && !parsed.get(page).headings.some(heading => heading.id === target.anchor)) problems.push(`${file} : « ${href} » : aucun titre « ${target.anchor} » dans ${page}`);
    });
  }
  assert.ok(internal > 300, `les documents se renvoient les uns aux autres (${internal} liens lus)`);
  assert.deepEqual(problems, [], 'Un lien interne pointe vers un titre qui n\'existe plus.');
});

test('chaque image d\'un document est un fichier du dépôt qui existe, ou une image d\'un autre site que la fenêtre ne charge pas', () => {
  const problems = [];
  let local = 0;
  for (const [file, { blocks }] of parsed) {
    walk(blocks, node => {
      const src = node.type === 'image' ? node.src : node.type === 'element' && node.tag === 'img' ? node.attrs.src ?? '' : null;
      if (src === null) return;
      const url = resolveImage(file, src, 'https://exemple.test/widget/index.html');
      if (url === null) {
        if (!/^https:\/\//.test(src)) problems.push(`${file} : l'image « ${src} » n'est ni un fichier du dépôt ni une adresse https`);
        return;
      }
      local++;
      const repoPath = decodeURIComponent(new URL(url).pathname.replace('/widget/', ''));
      if (!exists(repoPath)) problems.push(`${file} : l'image « ${src} » n'existe pas (${repoPath})`);
    });
  }
  assert.ok(local >= 30, `les documents montrent leurs captures (${local} images lues)`);
  assert.deepEqual(problems, []);
});

test('aucun lien ni aucune image d\'un document ne prend un autre protocole que https (javascript:, data:, http:, file:, mailto:)', () => {
  const bad = [];
  for (const [file, { blocks }] of parsed) {
    walk(blocks, node => {
      const address = node.type === 'link' ? node.href : node.type === 'image' ? node.src : node.type === 'element' ? node.attrs.href ?? node.attrs.src : undefined;
      if (typeof address === 'string' && /^(?!https:\/\/)[a-z][a-z0-9+.-]*:/i.test(address.trim())) bad.push(`${file} : ${address}`);
    });
  }
  assert.deepEqual(bad, []);
});

// ===== Robustesse =====

test('un texte hostile ou démesuré se lit sans erreur et sans attendre : séries de délimiteurs, balises ouvertes, imbrications', () => {
  const hostile = {
    stars: '*'.repeat(20000), unclosed: '*a '.repeat(2000), brackets: '[a'.repeat(2000), parens: '[a](b'.repeat(1500), tags: '<b>'.repeat(1500),
    backticks: '`a'.repeat(5000), bangs: '![a'.repeat(1500), underscores: '_a '.repeat(2000), quotes: '> '.repeat(400) + 'x',
    list: Array.from({ length: 150 }, (_, depth) => `${' '.repeat(depth * 2)}- x`).join('\n'), long: 'mot '.repeat(50000),
    controls: '\u0000\u0001  ￾\ud800 texte', mixed: '<a href="x">'.repeat(300) + '</a>'.repeat(300)
  };
  for (const [name, text] of Object.entries(hostile)) {
    const started = performance.now();
    assert.doesNotThrow(() => parseMarkdown(text), name);
    assert.ok(performance.now() - started < 1500, `${name} : plus d'une seconde et demie`);
  }
});

test('le texte vide, les fins de ligne de Windows et les tabulations ne gênent pas', () => {
  assert.deepEqual(blocksOf(''), []);
  assert.deepEqual(blocksOf('\n\n  \n'), []);
  assert.equal(plainText(first('un\r\ndeux\r\n').children), 'un deux');
  const tabbed = first('-\tun\n\t- deux');
  assert.equal(tabbed.type, 'list');
});
