// Lecture du Markdown de la documentation (README.md, docs/*.md…) pour la fenêtre « Documentation » : un texte entre, un arbre de
// blocs en sort. Aucun DOM ici, et rien n'est jamais du HTML : l'arbre ne porte que du texte et des éléments d'une liste fermée
// (ELEMENTS), avec quelques attributs choisis (ATTRIBUTES). Tout le reste, une balise inconnue, un script, un attribut `onclick`,
// reste du texte, que markdown-dom.js affiche par textContent. L'affichage de l'arbre est dans markdown-dom.js.
//
// Ce n'est pas CommonMark en entier, c'est ce que la documentation du dépôt emploie (tests/markdown.test.mjs lit tous ses
// fichiers) : titres « # », paragraphes, listes (imbriquées, numérotées, cases à cocher), citations, tableaux, blocs de code
// avec ou sans langage, filet, emphase (** * _ ~~), code en ligne, liens, images, échappements, sauts de ligne, et les balises
// HTML que le README emploie pour sa mise en page (images en tableau, <br>, <sub>, <b>…).
//
// Blocs : { type: 'heading', level, id, children } · { type: 'paragraph', children } · { type: 'code', lang, text } ·
//   { type: 'quote', blocks } · { type: 'list', ordered, start, loose, items: [{ checked, blocks }] } ·
//   { type: 'table', align, head: [children], rows: [[children]] } · { type: 'rule' } · { type: 'html', children }
// En ligne : { type: 'text', text } · { type: 'code', text } · { type: 'em' | 'strong' | 'del', children } ·
//   { type: 'link', href, title, children } · { type: 'image', src, alt, title } · { type: 'break' } ·
//   { type: 'element', tag, attrs, children }

// Les balises HTML admises (README.md : tableaux d'images, <br>, <sub>, <b>, <a>, <img>, <p align="center">…). Une autre est
// montrée comme du texte.
export const ELEMENTS = new Set(['a', 'b', 'strong', 'i', 'em', 'sub', 'sup', 'kbd', 'code', 'small', 'span', 'br', 'img', 'p', 'div',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'details', 'summary', 'ul', 'ol', 'li']);

// Les attributs que l'arbre garde, par balise ; tout autre est jeté. L'adresse d'un lien ou d'une image n'est jamais lue ici :
// c'est markdown-dom.js, par les fonctions que lui donne la fenêtre, qui décide si elle est suivie.
const ATTRIBUTES = {
  a: ['href'],
  img: ['src', 'alt', 'title'],
  td: ['colspan', 'rowspan', 'align'],
  th: ['colspan', 'rowspan', 'align'],
  p: ['align'],
  div: ['align'],
  details: ['open']
};

const VOID = new Set(['br', 'img']);
// Les balises qui ouvrent un bloc HTML (jusqu'à la ligne vide), comme dans CommonMark.
const BLOCK_TAGS = new Set(['div', 'p', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'details', 'summary', 'ul', 'ol', 'li']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
const ENTITY = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-z]{2,6});/;
const TAG = /^<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z_:][-\w:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/;
const ATTRIBUTE = /([A-Za-z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const AUTOLINK = /^<(https?:\/\/[^\s<>]+)>/;
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const SPECIAL = /[\\`<!\[*_~&\n]/g;

const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ ]?/;
const LIST_MARKER = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const HTML_BLOCK = /^ {0,3}<\/?([a-zA-Z][a-zA-Z0-9]*)[\s/>]/;
const TABLE_SEPARATOR = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const isBlank = line => line.trim() === '';
const indentOf = line => line.length - line.trimStart().length;

// ===== En ligne =====

// L'identifiant d'un titre comme GitHub le fabrique : minuscules, ponctuation retirée, espaces en tirets (tests/docs.test.mjs
// garde les liens de la documentation d'accord avec cette règle).
export function slugify(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '').replace(/ /g, '-');
}

// Le texte brut d'un morceau d'arbre : ce qu'on lit, sans la mise en forme (le titre d'une section, son identifiant).
export function plainText(nodes) {
  return nodes.map(node => {
    if (node.type === 'text' || node.type === 'code') return node.text;
    if (node.type === 'image') return node.alt;
    return node.children ? plainText(node.children) : '';
  }).join('');
}

function parseAttributes(source, tag) {
  const allowed = ATTRIBUTES[tag] ?? [];
  const attrs = {};
  for (const [, rawName, double, single, bare] of source.matchAll(ATTRIBUTE)) {
    const name = rawName.toLowerCase();
    if (allowed.includes(name)) attrs[name] = double ?? single ?? bare ?? '';
  }
  return attrs;
}

// La balise qui commence en `index`, ou null : { closing, tag, attrs, selfClosing, length }.
function tagAt(text, index) {
  const match = TAG.exec(text.slice(index, index + 2000));
  if (!match) return null;
  const tag = match[2].toLowerCase();
  return { closing: match[1] === '/', tag, source: match[3], selfClosing: match[4] === '/', length: match[0].length };
}

// Où finit la balise `tag` ouverte avant `from` : { start, end } de sa balise fermante (les mêmes balises imbriquées comptent), ou null.
function closingTag(text, from, tag) {
  let depth = 1;
  let index = text.indexOf('<', from);
  while (index !== -1) {
    const found = tagAt(text, index);
    if (found && found.tag === tag && !found.selfClosing) {
      depth += found.closing ? -1 : 1;
      if (depth === 0) return { start: index, end: index + found.length };
    }
    index = text.indexOf('<', index + (found ? found.length : 1));
  }
  return null;
}

// Le texte entre accents graves qui commence en `index` : { text, end }, ou null (la série de accents n'est pas refermée).
function codeSpanAt(text, index) {
  let run = 1;
  while (text[index + run] === '`') run++;
  let search = index + run;
  while (true) {
    const open = text.indexOf('`', search);
    if (open === -1) return null;
    let length = 1;
    while (text[open + length] === '`') length++;
    if (length === run) {
      let inner = text.slice(index + run, open).replace(/\n/g, ' ');
      if (inner.length > 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim() !== '') inner = inner.slice(1, -1);
      return { text: inner, end: open + length };
    }
    search = open + length;
  }
}

// La fin du crochet fermant qui répond au `[` de `index`, ou -1 : les crochets s'imbriquent, un échappement ou un code ne comptent pas.
function bracketEnd(text, index) {
  let depth = 0;
  for (let k = index; k < text.length; k++) {
    const char = text[k];
    if (char === '\\') k++;
    else if (char === '`') k = (codeSpanAt(text, k)?.end ?? k + 1) - 1;
    else if (char === '[') depth++;
    else if (char === ']' && --depth === 0) return k;
  }
  return -1;
}

// « (adresse "titre") » qui commence en `index` : { href, title, end } (`end` : après la parenthèse fermante), ou null.
function destinationAt(text, index) {
  let k = index + 1;
  while (text[k] === ' ' || text[k] === '\n') k++;
  let href = '';
  if (text[k] === '<') {
    const close = text.indexOf('>', k);
    if (close === -1 || text.slice(k, close).includes('\n')) return null;
    href = text.slice(k + 1, close);
    k = close + 1;
  } else {
    let depth = 0;
    const begin = k;
    for (; k < text.length && !/\s/.test(text[k]); k++) {
      if (text[k] === '\\') k++;
      else if (text[k] === '(') depth++;
      else if (text[k] === ')' && depth-- === 0) break;
    }
    if (depth > 0) return null;
    href = text.slice(begin, k).replace(/\\([!-/:-@[-`{-~])/g, '$1');
  }
  while (text[k] === ' ' || text[k] === '\n') k++;
  let title = '';
  const opener = text[k];
  if (opener === '"' || opener === '\'' || opener === '(') {
    const closer = opener === '(' ? ')' : opener;
    const close = text.indexOf(closer, k + 1);
    if (close === -1) return null;
    title = text.slice(k + 1, close);
    k = close + 1;
    while (text[k] === ' ' || text[k] === '\n') k++;
  }
  return text[k] === ')' ? { href, title, end: k + 1 } : null;
}

// Où se referme l'emphase ouverte avant `from` par `delimiter` répété `count` fois : l'index du premier délimiteur qui la ferme,
// ou -1. Un échappement et un code en ligne sont sautés ; un délimiteur précédé d'une espace ne ferme rien ; pour « _ », un mot
// qui continue (snake_case) non plus.
function emphasisEnd(text, from, delimiter, count) {
  for (let k = from; k < text.length; k++) {
    const char = text[k];
    if (char === '\\') k++;
    else if (char === '`') k = (codeSpanAt(text, k)?.end ?? k + 1) - 1;
    else if (char === delimiter) {
      let run = 1;
      while (text[k + run] === delimiter) run++;
      const next = text[k + run];
      const closes = run === count && k > from && !/\s/.test(text[k - 1]) && (delimiter !== '_' || !next || !/[\p{L}\p{N}]/u.test(next));
      if (closes) return k;
      k += run - 1;
    }
  }
  return -1;
}

function emphasisAt(text, index) {
  const char = text[index];
  let count = 1;
  while (text[index + count] === char) count++;
  const after = text[index + count];
  if (count > 3 || (char === '~' && count !== 2) || !after || /\s/.test(after)) return null;
  if (char === '_' && index > 0 && /[\p{L}\p{N}]/u.test(text[index - 1])) return null;
  const close = emphasisEnd(text, index + count, char, count);
  if (close === -1) return null;
  const children = parseInline(text.slice(index + count, close));
  let node = { type: char === '~' ? 'del' : count === 2 ? 'strong' : 'em', children };
  if (count === 3) node = { type: 'em', children: [{ type: 'strong', children }] };
  return { node, end: close + count };
}

function linkAt(text, index) {
  const image = text[index] === '!';
  const open = image ? index + 1 : index;
  const close = bracketEnd(text, open);
  if (close === -1 || text[close + 1] !== '(') return null;
  const target = destinationAt(text, close + 1);
  if (!target) return null;
  const label = text.slice(open + 1, close);
  const node = image
    ? { type: 'image', src: target.href, alt: plainText(parseInline(label)), title: target.title }
    : { type: 'link', href: target.href, title: target.title, children: parseInline(label) };
  return { node, end: target.end };
}

// Une balise HTML : l'élément (avec tout ce qu'elle contient), ou rien. Une balise inconnue n'est pas du HTML ici : elle reste du texte.
function elementAt(text, index) {
  const found = tagAt(text, index);
  if (!found || !ELEMENTS.has(found.tag)) return null;
  if (found.closing) return { node: null, end: index + found.length }; // une fermeture sans ouverture : ignorée
  const attrs = parseAttributes(found.source, found.tag);
  const end = index + found.length;
  if (VOID.has(found.tag) || found.selfClosing) {
    return { node: found.tag === 'br' ? { type: 'break' } : { type: 'element', tag: found.tag, attrs, children: [] }, end };
  }
  const closing = closingTag(text, end, found.tag);
  if (!closing) return { node: null, end }; // une ouverture sans fermeture (le <div> d'un README) : ignorée
  return { node: { type: 'element', tag: found.tag, attrs, children: parseInline(text.slice(end, closing.start)) }, end: closing.end };
}

function entityAt(text, index) {
  const match = ENTITY.exec(text.slice(index, index + 12));
  if (!match) return null;
  const name = match[1];
  let value;
  if (name[0] === '#') {
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    value = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : null;
  } else {
    value = ENTITIES[name] ?? null;
  }
  return value === null ? null : { text: value, end: index + match[0].length };
}

// Le Markdown d'une ligne ou d'un paragraphe en nœuds. Ce qu'une syntaxe ne reconnaît pas reste du texte, jamais une erreur.
export function parseInline(text) {
  const out = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };
  const push = (node, end) => {
    if (node) {
      flush();
      out.push(node);
    }
    return end;
  };

  let index = 0;
  while (index < text.length) {
    SPECIAL.lastIndex = index;
    const found = SPECIAL.exec(text);
    const next = found ? found.index : text.length;
    buffer += text.slice(index, next);
    index = next;
    if (index >= text.length) break;
    const char = text[index];
    let handled = null;

    if (char === '\n') {
      // Deux espaces (ou une barre oblique inverse) avant la fin de ligne : saut de ligne ; sinon une espace.
      const trimmed = buffer.replace(/ +$/, '');
      const hard = buffer.length - trimmed.length >= 2;
      buffer = trimmed;
      if (hard) push({ type: 'break' }, index + 1);
      else buffer += ' ';
      index++;
      while (text[index] === ' ') index++;
      continue;
    }
    if (char === '\\') {
      if (text[index + 1] === '\n') {
        index = push({ type: 'break' }, index + 2);
        while (text[index] === ' ') index++;
        continue;
      }
      if (text[index + 1] && PUNCTUATION.test(text[index + 1])) {
        buffer += text[index + 1];
        index += 2;
        continue;
      }
    } else if (char === '`') {
      handled = codeSpanAt(text, index);
      if (handled) {
        index = push({ type: 'code', text: handled.text }, handled.end);
        continue;
      }
      let run = 1;
      while (text[index + run] === '`') run++;
      buffer += text.slice(index, index + run);
      index += run;
      continue;
    } else if (char === '<') {
      if (text.startsWith('<!--', index)) {
        const close = text.indexOf('-->', index + 4);
        if (close !== -1) {
          index = close + 3;
          continue;
        }
      }
      const auto = AUTOLINK.exec(text.slice(index, index + 2000));
      if (auto) {
        index = push({ type: 'link', href: auto[1], title: '', children: [{ type: 'text', text: auto[1] }] }, index + auto[0].length);
        continue;
      }
      handled = elementAt(text, index);
      if (handled) {
        index = push(handled.node, handled.end);
        continue;
      }
    } else if (char === '!' || char === '[') {
      if (char === '[' || text[index + 1] === '[') {
        handled = linkAt(text, index);
        if (handled) {
          index = push(handled.node, handled.end);
          continue;
        }
      }
    } else if (char === '*' || char === '_' || char === '~') {
      handled = emphasisAt(text, index);
      if (handled) {
        index = push(handled.node, handled.end);
        continue;
      }
      let run = 1;
      while (text[index + run] === char) run++;
      buffer += text.slice(index, index + run);
      index += run;
      continue;
    } else if (char === '&') {
      handled = entityAt(text, index);
      if (handled) {
        buffer += handled.text;
        index = handled.end;
        continue;
      }
    }
    buffer += char;
    index++;
  }
  flush();
  return out;
}

// ===== Blocs =====

// Les identifiants de titre d'un document : un titre qui en répète un autre prend -1, -2… comme sur GitHub.
function createSlugger() {
  const seen = new Map();
  return title => {
    const base = slugify(title);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function listMarker(line) {
  const match = LIST_MARKER.exec(line);
  if (!match) return null;
  const marker = match[2];
  const ordered = /\d/.test(marker[0]);
  const rest = line.slice(match[0].length);
  // De un à quatre espaces après le marqueur : le contenu commence là ; au-delà (ou rien), une seule compte.
  const gap = rest.trim() === '' || match[3].length > 4 ? 1 : match[3].length;
  const contentIndent = match[1].length + marker.length + gap;
  return { ordered, delimiter: ordered ? marker.slice(-1) : marker, number: ordered ? parseInt(marker, 10) : 0, contentIndent, text: line.slice(contentIndent) };
}

function htmlBlockStart(line) {
  const match = HTML_BLOCK.exec(line);
  return Boolean(match && BLOCK_TAGS.has(match[1].toLowerCase()));
}

const isTableStart = (lines, index) => index + 1 < lines.length && lines[index].includes('|') && lines[index + 1].includes('|')
  && TABLE_SEPARATOR.test(lines[index + 1]) && splitRow(lines[index]).length === splitRow(lines[index + 1]).length;

// Une ligne qui ouvre un bloc : elle interrompt un paragraphe et n'est pas la suite paresseuse d'un élément de liste ou d'une citation.
function startsBlock(lines, index) {
  const line = lines[index];
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || htmlBlockStart(line) || line.trimStart().startsWith('<!--')) return true;
  // Un élément de liste interrompt un paragraphe s'il n'est pas vide et, numéroté, s'il commence à 1 (« 2026. » n'est pas une liste).
  const marker = listMarker(line);
  if (marker) return marker.text.trim() !== '' && !(marker.ordered && marker.number !== 1);
  return isTableStart(lines, index);
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let cell = '';
  for (let k = 0; k < row.length; k++) {
    if (row[k] === '\\' && row[k + 1] === '|') {
      cell += '|'; // une barre échappée est une barre de la cellule (même dans un code), pas une séparation
      k++;
    } else if (row[k] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += row[k];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function alignOf(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
}

function readFence(lines, start) {
  const open = FENCE.exec(lines[start]);
  const mark = open[2];
  const code = [];
  let i = start + 1;
  while (i < lines.length) {
    const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines[i]);
    if (close && close[1][0] === mark[0] && close[1].length >= mark.length) {
      i++;
      break;
    }
    code.push(open[1].length ? lines[i].replace(new RegExp(`^ {0,${open[1].length}}`), '') : lines[i]);
    i++;
  }
  return { block: { type: 'code', lang: open[3], text: code.join('\n') }, next: i };
}

function readQuote(lines, start, slugger) {
  const inner = [];
  let i = start;
  while (i < lines.length) {
    if (QUOTE.test(lines[i])) inner.push(lines[i].replace(QUOTE, ''));
    else if (!isBlank(lines[i]) && !isBlank(inner[inner.length - 1] ?? '') && !startsBlock(lines, i)) inner.push(lines[i]); // suite paresseuse
    else break;
    i++;
  }
  return { block: { type: 'quote', blocks: parseBlocks(inner, slugger) }, next: i };
}

function readTable(lines, start) {
  const head = splitRow(lines[start]);
  const align = splitRow(lines[start + 1]).map(alignOf);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) {
    const cells = splitRow(lines[i]);
    rows.push(head.map((_, column) => parseInline(cells[column] ?? '')));
    i++;
  }
  return { block: { type: 'table', align, head: head.map(parseInline), rows }, next: i };
}

function readHtml(lines, start) {
  const html = [];
  let i = start;
  while (i < lines.length && !isBlank(lines[i])) html.push(lines[i++].trim());
  const children = parseInline(html.join('\n'));
  // Une balise fermante seule (le </div> qui répond à un <div> d'un bloc précédent) ne montre rien.
  return { block: children.length ? { type: 'html', children } : null, next: i };
}

function readComment(lines, start) {
  let i = start;
  while (i < lines.length && !lines[i].includes('-->')) i++;
  return i + 1;
}

// Une ligne qui ne continue pas l'élément de liste où elle tombe sans être indentée comme lui (« suite paresseuse » d'un paragraphe).
const continuesItem = (lines, index, itemLines) => !isBlank(itemLines[itemLines.length - 1]) && !startsBlock(lines, index)
  && !FENCE.test(itemLines[itemLines.length - 1]);

function readItem(lines, start, marker) {
  const itemLines = [marker.text];
  let i = start + 1;
  let blanks = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      blanks++;
    } else if (indentOf(line) >= marker.contentIndent) {
      for (; blanks > 0; blanks--) itemLines.push('');
      itemLines.push(line.slice(marker.contentIndent));
    } else if (blanks === 0 && !listMarker(line) && continuesItem(lines, i, itemLines)) {
      itemLines.push(line.trim());
    } else {
      break;
    }
    i++;
  }
  return { itemLines, next: i, blankAfter: blanks > 0 };
}

function readList(lines, start, slugger) {
  const first = listMarker(lines[start]);
  const items = [];
  let loose = false;
  let i = start;
  while (i < lines.length) {
    const marker = listMarker(lines[i]);
    if (!marker || marker.ordered !== first.ordered || RULE.test(lines[i])) break;
    const { itemLines, next, blankAfter } = readItem(lines, i, marker);
    let content = itemLines;
    let checked = null;
    const box = /^\[([ xX])\][ \t]+/.exec(content[0]);
    if (box) {
      checked = box[1] !== ' ';
      content = [content[0].slice(box[0].length), ...content.slice(1)];
    }
    items.push({ checked, blocks: parseBlocks(content, slugger) });
    // Une ligne vide entre deux éléments d'une même liste l'« aère » : plus d'espace entre ses éléments.
    if (blankAfter && next < lines.length && listMarker(lines[next])) loose = true;
    i = next;
  }
  return { block: { type: 'list', ordered: first.ordered, start: first.number, loose, items }, next: i };
}

function readParagraph(lines, start) {
  const text = [lines[start].replace(/^[ \t]+/, '')];
  let i = start + 1;
  while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) text.push(lines[i++].replace(/^[ \t]+/, ''));
  return { block: { type: 'paragraph', children: parseInline(text.join('\n').replace(/[ \t]+$/, '')) }, next: i };
}

function readHeading(line, slugger) {
  const [, hashes, content = ''] = HEADING.exec(line);
  const children = parseInline(content.trim());
  return { type: 'heading', level: hashes.length, id: slugger(plainText(children)), children };
}

// Les blocs de `lines`, dans l'ordre. `slugger` est partagé avec les blocs imbriqués (listes, citations) : les titres d'un document
// reçoivent leurs identifiants dans l'ordre où on les lit.
function parseBlocks(lines, slugger) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let read = null;
    if (isBlank(line)) {
      i++;
      continue;
    }
    if (FENCE.test(line)) read = readFence(lines, i);
    else if (HEADING.test(line)) {
      blocks.push(readHeading(line, slugger));
      i++;
      continue;
    } else if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    } else if (QUOTE.test(line)) read = readQuote(lines, i, slugger);
    else if (line.trimStart().startsWith('<!--')) {
      i = readComment(lines, i);
      continue;
    } else if (listMarker(line)) read = readList(lines, i, slugger);
    else if (htmlBlockStart(line)) read = readHtml(lines, i);
    else if (isTableStart(lines, i)) read = readTable(lines, i);
    else read = readParagraph(lines, i);
    if (read.block) blocks.push(read.block);
    i = read.next;
  }
  return blocks;
}

// Le Markdown d'un document : { blocks, headings } (`headings` : [{ level, id, text }], dans l'ordre, de quoi trouver une section).
export function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').replace(/^\t+/gm, tabs => '    '.repeat(tabs.length)).split('\n');
  const blocks = parseBlocks(lines, createSlugger());
  const headings = [];
  const collect = list => list.forEach(block => {
    if (block.type === 'heading') headings.push({ level: block.level, id: block.id, text: plainText(block.children) });
    else if (block.type === 'quote') collect(block.blocks);
    else if (block.type === 'list') block.items.forEach(item => collect(item.blocks));
  });
  collect(blocks);
  return { blocks, headings };
}
