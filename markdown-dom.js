// L'arbre de markdown.js en éléments du DOM, pour la fenêtre « Documentation ». Tout texte passe par un nœud de texte (jamais
// innerHTML) ; une balise vient d'une liste fermée (ELEMENTS) et une adresse n'est suivie que si la fenêtre le permet : c'est
// `resolveLink` et `resolveImage`, que lui donne docs-ui.js, qui décident où mène un lien et d'où vient une image.
//
//   resolveLink(adresse)   → { kind: 'doc', page, anchor }   un autre document de la documentation (ouvert dans la fenêtre)
//                          | { kind: 'anchor', anchor }      un titre du document ouvert
//                          | { kind: 'external', href }      une page web (autre onglet, sans transmettre la page)
//                          | { kind: 'none' }                tout le reste : du texte, sans lien
//   resolveImage(adresse)  → l'adresse à charger, ou null : le texte de remplacement s'affiche à la place

import { ELEMENTS } from './markdown.js';
import { el } from './dom.js';

// Les titres du document passent sous celui de la fenêtre (<h2>) : « # » devient <h3>.
const HEADING_SHIFT = 2;
// Le préfixe des identifiants de titre : aucun ne doit rencontrer celui d'un élément du widget (un titre « Toolbar »).
export const ID_PREFIX = 'doc-';
const TABLE_PARTS = new Set(['table', 'thead', 'tbody', 'tr']);
const ALIGNS = new Set(['left', 'center', 'right']);

const textOf = text => document.createTextNode(text);

function sizeAttribute(value) {
  const size = Number(value);
  return Number.isInteger(size) && size > 1 && size <= 20 ? String(size) : null;
}

// L'image d'une adresse que la fenêtre accepte ; sinon, ce qu'on peut lire à sa place (le texte de remplacement). Une image qui
// ne se charge pas (page non publiée) devient ce même texte.
function renderImage(src, alt, title, context) {
  const url = context.resolveImage(src);
  const missing = () => {
    if (!alt) return textOf(''); // une image sans texte de remplacement qui ne vient pas ne laisse rien
    const note = el('span', 'md-img-alt', alt);
    if (title) note.title = title;
    return note;
  };
  if (!url) return missing();
  const image = document.createElement('img');
  image.className = 'md-img';
  image.src = url;
  image.alt = alt;
  if (title) image.title = title;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => image.replaceWith(missing()), { once: true });
  return image;
}

function renderLink(href, title, children, context) {
  const target = context.resolveLink(href);
  if (target.kind === 'none') {
    const plain = el('span', 'md-nolink');
    plain.append(...children);
    return plain;
  }
  const link = document.createElement('a');
  if (title) link.title = title;
  link.append(...children);
  if (target.kind === 'external') {
    link.href = target.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'md-ext';
    link.append(el('span', 'sr-only', ' (s\'ouvre dans un nouvel onglet)'));
    return link;
  }
  // Une page de la documentation : le clic est géré par la fenêtre (docs-ui.js), qui lit ces deux attributs.
  link.href = '#';
  link.className = 'md-doc-link';
  link.dataset.anchor = target.anchor ?? '';
  if (target.kind === 'doc') link.dataset.doc = target.page;
  return link;
}

function renderElement(node, context) {
  const { tag, attrs } = node;
  if (!ELEMENTS.has(tag)) return textOf('');
  const children = renderInline(node.children, context, TABLE_PARTS.has(tag));
  if (tag === 'a') return renderLink(attrs.href ?? '', '', children, context);
  if (tag === 'img') return renderImage(attrs.src ?? '', attrs.alt ?? '', attrs.title ?? '', context);
  const element = document.createElement(tag);
  element.append(...children);
  if (ALIGNS.has((attrs.align ?? '').toLowerCase())) element.classList.add(`md-align-${attrs.align.toLowerCase()}`);
  if (tag === 'td' || tag === 'th') {
    const colspan = sizeAttribute(attrs.colspan);
    const rowspan = sizeAttribute(attrs.rowspan);
    if (colspan) element.colSpan = Number(colspan);
    if (rowspan) element.rowSpan = Number(rowspan);
  }
  if (tag === 'details' && 'open' in attrs) element.open = true;
  if (tag !== 'table') return element;
  const wrapper = el('div', 'md-scroll md-scroll-plain');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Tableau');
  element.className = 'md-table md-table-html';
  wrapper.append(element);
  return wrapper;
}

function renderNode(node, context) {
  switch (node.type) {
    case 'text': return textOf(node.text);
    case 'code': return el('code', '', node.text);
    case 'break': return document.createElement('br');
    case 'image': return renderImage(node.src, node.alt, node.title, context);
    case 'link': return renderLink(node.href, node.title, renderInline(node.children, context), context);
    case 'element': return renderElement(node, context);
    default: {
      // em, strong, del
      const element = document.createElement(node.type);
      element.append(...renderInline(node.children, context));
      return element;
    }
  }
}

// `skipSpace` : le contenu d'un tableau HTML, où les retours à la ligne entre deux balises ne sont pas du texte.
function renderInline(nodes, context, skipSpace = false) {
  return nodes.filter(node => !(skipSpace && node.type === 'text' && node.text.trim() === '')).map(node => renderNode(node, context));
}

function renderList(block, context) {
  const list = document.createElement(block.ordered ? 'ol' : 'ul');
  list.className = block.loose ? 'md-list md-loose' : 'md-list';
  if (block.ordered && block.start !== 1) list.start = block.start;
  block.items.forEach(item => {
    const entry = document.createElement('li');
    if (item.checked !== null) {
      // Une case de TESTING.md : dessinée, avec sa valeur dite aux lecteurs d'écran ; elle ne se coche pas.
      entry.className = 'md-task';
      const box = el('span', 'md-box', item.checked ? '☑' : '☐');
      box.setAttribute('aria-hidden', 'true');
      const content = el('div', 'md-task-body');
      content.append(el('span', 'sr-only', item.checked ? 'Case cochée. ' : 'Case à cocher. '), ...renderBlocks(item.blocks, context));
      entry.append(box, content);
    } else {
      entry.append(...renderBlocks(item.blocks, context));
    }
    list.append(entry);
  });
  return list;
}

function renderCell(tag, children, align, context) {
  const cell = document.createElement(tag);
  if (tag === 'th') cell.scope = 'col';
  if (align) cell.classList.add(`md-align-${align}`);
  cell.append(...renderInline(children, context));
  return cell;
}

function renderTable(block, context) {
  const wrapper = el('div', 'md-scroll');
  wrapper.tabIndex = 0; // un tableau large défile : le clavier doit pouvoir le faire
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Tableau');
  const table = el('table', 'md-table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  block.head.forEach((cell, column) => headRow.append(renderCell('th', cell, block.align[column], context)));
  head.append(headRow);
  const body = document.createElement('tbody');
  block.rows.forEach(cells => {
    const row = document.createElement('tr');
    cells.forEach((cell, column) => row.append(renderCell('td', cell, block.align[column], context)));
    body.append(row);
  });
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function renderCode(block) {
  const pre = el('pre', 'md-code');
  pre.tabIndex = 0; // un code large défile : le clavier doit pouvoir le faire
  pre.append(el('code', '', block.text));
  if (block.lang !== 'mermaid') return pre;
  // Un schéma Mermaid se dessine sur GitHub ; ici, sa source, repliée : lisible, sans rien charger pour la dessiner.
  const details = el('details', 'md-diagram');
  details.append(el('summary', '', 'Schéma : voir sa source (GitHub le dessine)'), pre);
  return details;
}

function renderBlock(block, context) {
  switch (block.type) {
    case 'heading': {
      const heading = document.createElement(`h${Math.min(block.level + HEADING_SHIFT, 6)}`);
      heading.className = `md-h md-h${block.level}`;
      heading.id = ID_PREFIX + block.id;
      heading.tabIndex = -1; // un lien du document y met le focus
      heading.append(...renderInline(block.children, context));
      return heading;
    }
    case 'paragraph': {
      const paragraph = document.createElement('p');
      paragraph.append(...renderInline(block.children, context));
      return paragraph;
    }
    case 'code': return renderCode(block);
    case 'quote': {
      const quote = document.createElement('blockquote');
      quote.append(...renderBlocks(block.blocks, context));
      return quote;
    }
    case 'list': return renderList(block, context);
    case 'table': return renderTable(block, context);
    case 'rule': return document.createElement('hr');
    default: {
      const html = el('div', 'md-html');
      html.append(...renderInline(block.children, context));
      return html;
    }
  }
}

function renderBlocks(blocks, context) {
  return blocks.map(block => renderBlock(block, context));
}

// Un document (`parseMarkdown(...).blocks`) en un bloc <div class="md"> à poser dans la fenêtre.
export function renderMarkdown(blocks, { resolveLink, resolveImage }) {
  const root = el('div', 'md');
  root.append(...renderBlocks(blocks, { resolveLink, resolveImage }));
  return root;
}
