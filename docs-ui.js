// La fenêtre « Documentation » (index.html : #docDialog) : les documents du dépôt (docs-source.js) lus dans le widget, sans
// quitter l'annuaire ni passer par l'interface de GitHub. Une barre de documents en haut, le document en dessous, « Retour » et
// « Ouvrir sur GitHub » en bas. Le Markdown est lu par markdown.js et dessiné par markdown-dom.js ; ici, la navigation (les liens
// d'un document ouvrent l'autre, les ancres font défiler), l'attente et la panne (un message, et la page de GitHub à la place).

import { el, button, notice } from './dom.js';
import { createDialogShell } from './dialog-shell.js';
import { parseMarkdown } from './markdown.js';
import { ID_PREFIX, renderMarkdown } from './markdown-dom.js';
import { DOC_PAGES, DocError, fetchDocument, pageOf, resolveImage, resolveLink } from './docs-source.js';

// Ce que dit la fenêtre quand un document n'a pas pu être lu : `retry` est vrai quand réessayer peut aider (le réseau, pas un
// fichier qui manque).
function describeFailure(error, hasGithub) {
  const reason = error instanceof DocError ? error.reason : 'network';
  const github = hasGithub ? ' Il se lit sur GitHub.' : '';
  if (reason === 'network') return { text: `Le document n'a pas pu être chargé : la connexion est interrompue ou trop lente.${github}`, retry: true };
  if (reason === 'size') return { text: `Ce document est trop gros pour s'afficher ici.${github}`, retry: false };
  return { text: `Ce document n'est pas disponible dans cette fenêtre.${github}`, retry: false };
}

// Le texte lu en Markdown. Un document que la lecture ne peut pas suivre (une imbrication démesurée) est dit indisponible, pas
// « interrompu » : ce n'est pas le réseau qui a manqué.
function readMarkdown(text) {
  try {
    return parseMarkdown(text);
  } catch {
    throw new DocError('unreadable');
  }
}

// `dialog` : le <dialog> de index.html. `externalUrl` : la page de la documentation sur GitHub (DOCS_URL), proposée en bas et quand
// un document ne peut pas être lu ; vide, rien n'est proposé. `readPage` : comment un document est lu (fetchDocument ; les tests en
// donnent un autre). Renvoie { open }.
export function createDocViewer(dialog, { externalUrl = '', readPage = fetchDocument } = {}) {
  const shell = createDialogShell(dialog, { isSaving: () => false, hasUnsaved: () => false });
  const nav = dialog.querySelector('.doc-nav');
  const status = dialog.querySelector('.doc-status');
  const parsed = new Map(); // chemin → { blocks } : un document lu n'est ni relu ni relu en Markdown
  const trail = []; // les vues que « Retour » rend : { path, top }
  let current = null;
  let sequence = 0; // la dernière demande : une réponse qui arrive après une autre demande est ignorée

  const tabs = new Map(DOC_PAGES.map(page => {
    const tab = button(page.label, 'doc-tab', () => show(page.path, { focus: 'keep' }));
    return [page.path, tab];
  }));
  const list = el('ul', 'doc-tabs');
  tabs.forEach(tab => {
    const item = document.createElement('li');
    item.append(tab);
    list.append(item);
  });
  nav.replaceChildren(list);

  const back = button('← Retour', 'btn', () => goBack());
  back.hidden = true;
  const close = button('Fermer', 'btn btn-primary', () => shell.close());
  const actions = [back];
  if (externalUrl) actions.push(githubLink(externalUrl, 'Ouvrir sur GitHub', 'btn'));
  actions.push(close);
  shell.showActions(...actions);

  function githubLink(href, label, className) {
    const link = el('a', className, label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(el('span', 'sr-only', ' (s\'ouvre dans un nouvel onglet)'));
    return link;
  }

  function markCurrent(path) {
    tabs.forEach((tab, tabPath) => {
      if (tabPath === path) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    back.hidden = trail.length === 0;
    shell.setHeading('Documentation', pageOf(path).label);
  }

  // Le titre de `anchor` dans le document ouvert, ou null.
  const headingOf = anchor => [...shell.body.querySelectorAll('.md-h')].find(heading => heading.id === ID_PREFIX + anchor) ?? null;

  function jumpTo(anchor) {
    const heading = headingOf(anchor);
    if (!heading) return false;
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
    return true;
  }

  function showFailure(path, error) {
    const { text, retry } = describeFailure(error, Boolean(externalUrl));
    const box = el('div', 'doc-fail');
    box.append(notice('ko', text, 'alert'));
    const row = el('div', 'doc-fail-actions');
    if (retry) row.append(button('Réessayer', 'btn btn-primary', () => show(path, { focus: 'keep', record: false })));
    if (externalUrl) row.append(githubLink(externalUrl, 'Ouvrir la documentation sur GitHub', 'btn'));
    if (row.children.length) box.append(row);
    shell.body.replaceChildren(box);
    status.textContent = text;
  }

  // Montre `path`. `anchor` : le titre où arriver ; `top` : le défilement à rendre (Retour) ; `record` : garder la vue qu'on quitte
  // pour « Retour » ; `focus` : 'content' met le focus sur le document (un lien l'a remplacé), 'keep' le laisse (la barre).
  async function show(path, { anchor = '', top = 0, record = true, focus = 'content' } = {}) {
    const mine = ++sequence;
    if (record && current !== null && !(path === current && !anchor)) trail.push({ path: current, top: shell.body.scrollTop });
    current = path;
    markCurrent(path);
    if (!parsed.has(path)) {
      shell.body.replaceChildren(notice('pending', 'Chargement du document…', 'status'));
      try {
        parsed.set(path, readMarkdown(await readPage(path)));
      } catch (error) {
        if (mine === sequence) showFailure(path, error);
        return;
      }
      if (mine !== sequence) return;
    }
    const article = renderMarkdown(parsed.get(path).blocks, {
      resolveLink: href => resolveLink(path, href),
      resolveImage: source => resolveImage(path, source)
    });
    shell.body.replaceChildren(article);
    back.hidden = trail.length === 0;
    status.textContent = `${pageOf(path).label} affiché`;
    shell.body.scrollTop = top;
    if (anchor && jumpTo(anchor)) return;
    if (focus === 'content') {
      const first = article.querySelector('.md-h');
      if (first) first.focus({ preventScroll: true });
      else shell.announceStep();
    }
  }

  function goBack() {
    const previous = trail.pop();
    if (!previous) return;
    if (previous.path === current) {
      shell.body.scrollTop = previous.top;
      back.hidden = trail.length === 0;
      return;
    }
    show(previous.path, { top: previous.top, record: false });
  }

  // Un lien d'un document : un autre document s'ouvre dans la fenêtre, une ancre fait défiler jusqu'à son titre.
  shell.body.addEventListener('click', event => {
    const link = event.target.closest('a.md-doc-link');
    if (!link) return;
    event.preventDefault();
    const { doc, anchor } = link.dataset;
    if (doc && doc !== current) {
      show(doc, { anchor });
    } else if (anchor && headingOf(anchor)) {
      trail.push({ path: current, top: shell.body.scrollTop });
      back.hidden = false;
      jumpTo(anchor);
    }
  });

  // La fenêtre fermée ne garde rien d'affiché : à la réouverture, elle repart du premier document.
  dialog.addEventListener('close', () => {
    sequence++;
    current = null;
    trail.length = 0;
    shell.body.replaceChildren();
    status.textContent = '';
    back.hidden = true;
  });

  return {
    // `target` : { page, anchor } pour ouvrir un document à un titre (un message du widget qui cite la documentation, dom.js) ; sans
    // lui, la première page. La fenêtre s'ouvre par-dessus celle qui est ouverte (une fenêtre de saisie), qui la retrouve à la fermeture.
    open({ page, anchor = '' } = {}) {
      if (dialog.open) return;
      dialog.showModal();
      shell.announceStep(); // le titre est lu d'abord ; le document, quand il arrive, ne prend pas le focus
      show(pageOf(page) ? page : DOC_PAGES[0].path, { anchor, focus: 'keep' });
    }
  };
}
