// Construction du DOM des cartes de contact (et de la bulle du rôle dans une tâche), sans logique métier. Les menus de filtres sont dans
// filter-menus.js.

import { ETABLISSEMENT_TABLE, TAG_GROUPS, FILTERS } from './constants.js';
import { displayName, formatPhone, labelsOf, mailtoHref, normalize, ownValue, refId, shownEmail } from './grist-data.js';
import { el, isFocusVisible } from './dom.js';
import { createLogoImage, fitCardLogo } from './branding-ui.js';
import { createAvatar } from './avatar-ui.js';
import { avatarIdOf } from './attachments.js';

// Catégories qui ont un menu : seules leurs bulles de carte sont cliquables.
const FILTERABLE_KEYS = new Set(FILTERS.map(filter => filter.key));

// Le rôle dans le PUI n'est pas une section du bas de la carte : c'est un texte à droite de la ligne de l'e-mail,
// hors de la colonne du logo.
const ROLE_GROUP = TAG_GROUPS.find(group => group.key === 'role');

// ===== Cartes de contact =====

// Affiche une ligne facultative de la carte, masquée par le CSS sans la classe `visible`.
function reveal(element, text) {
  element.textContent = text;
  element.classList.add('visible');
}

export function initials(contact) {
  return `${(contact.prenom || '').charAt(0)}${(contact.nom || '').charAt(0)}`.toUpperCase() || '?';
}

// ----- Repères de la carte « Après » d'une relecture (maquette v5) -----
// Ce qui est modifié se voit (un contour, une couleur, un trait) mais se dit aussi : une
// pastille écrite pour une ligne de texte, un mot réservé aux lecteurs d'écran pour un tag.

// La pastille écrite d'une ligne ou d'un badge (« modifié », « ajouté », « supprimé »).
function pill(word, gone = false) {
  return el('span', gone ? 'mk-pill mk-pill-del' : 'mk-pill', word);
}

function spoken(element, word) {
  element.append(el('span', 'sr-only', ` (${word})`));
}

// Une ligne de texte de la carte de relecture qui a changé (marque `{ before, after }`
// de preview.js) : la nouvelle valeur en relief (« ajouté » si la ligne était vide, sinon
// « modifié »), ou l'ancienne barrée si la ligne a été vidée (« supprimé »).
function showTextChange(element, mark, format = value => value) {
  element.classList.add('visible');
  if (mark.after) element.replaceChildren(el('span', 'mk', format(mark.after)), ' ', pill(mark.before ? 'modifié' : 'ajouté'));
  else element.replaceChildren(el('span', 'mk-gone', format(mark.before)), ' ', pill('supprimé', true));
}

// Le badge de l'établissement d'une carte « Après » dont l'établissement a changé : un
// anneau le repère et la pastille se lit dessous, dans la colonne de droite de la carte.
function markEtablissement(badge, mark) {
  badge.classList.add('rv-ring');
  let column = badge.closest('.etab-col');
  if (!column) {
    column = el('div', 'etab-col');
    badge.replaceWith(column);
    column.append(badge);
  }
  column.append(pill(mark.before ? 'modifié' : 'ajouté'));
}

// L'établissement d'une carte : son logo seul quand Grist en a un, sinon son nom dans
// une pastille. `logo` : { attachment, name, attachments } (voir buildCard), ou null.
// Si le logo ne se charge pas, le nom reprend sa place.
// Dit dans la console, une seule fois par fichier, qu'un logo ne s'est pas chargé : la ligne d'Etablissements et le numéro de la
// pièce jointe, jamais son adresse (elle porte le jeton) ni un nom. Quand c'est Grist qui ne le donne pas, le premier message dit
// aussi la cause la plus probable et son remède : le jeton qui affiche les fichiers est en lecture seule, donc compté comme un
// Lecteur du document, et une colonne `logo` qu'une règle d'accès ne laisse lire qu'aux Éditeurs lui est fermée (13 octobre 2026,
// chez Antoine : seize logos refusés, rien à voir avec le code). Les suivants le renvoient au premier, pour ne pas le répéter seize fois.
const logosWarned = new Set();
let accessRemedyGiven = false;
function warnLogoFailed(logo, cause) {
  if (logosWarned.has(logo.attachment)) return;
  logosWarned.add(logo.attachment);
  let why;
  if (cause === 'late') {
    why = 'la demande n\'a pas abouti à temps (Grist trop lent, ou le navigateur l\'a annulée)';
  } else if (accessRemedyGiven) {
    why = 'Grist ne l\'a pas donné (même cause probable que plus haut)';
  } else {
    accessRemedyGiven = true;
    why = 'Grist ne l\'a pas donné. Cause probable : une règle d\'accès. Le jeton qui sert à afficher les pièces jointes est en lecture seule, '
      + `donc compté comme un Lecteur du document : la colonne logo de la table ${ETABLISSEMENT_TABLE} doit être lisible par les Lecteurs, les Éditeurs et les propriétaires `
      + '(GRIST_SETUP.md, étape 5). Autres causes : fichier supprimé, jeton refusé';
  }
  console.warn(`[LOGOS] Le logo de la ligne ${logo.row} d'${ETABLISSEMENT_TABLE} (pièce jointe ${logo.attachment}) ne se charge pas : ${why}. `
    + 'Le sigle est affiché à la place.');
}

function fillEtablissement(badge, label, onToggle, logo) {
  if (!label) return;
  if (onToggle) badge.addEventListener('click', () => onToggle('etablissement', label));
  else badge.disabled = true;
  if (!logo) {
    reveal(badge, label);
    return;
  }
  // `with-logo` donne au logo, plus haut que la pastille, la place des deux rangées du nom
  // et de la fonction (style.css) : sa hauteur ne décentre pas le nom par rapport à l'avatar.
  const body = badge.closest('.card-body');
  const showName = cause => {
    if (cause === 'file' || cause === 'late') warnLogoFailed(logo, cause);
    badge.classList.remove('has-logo');
    body?.classList.remove('with-logo');
    badge.replaceChildren();
    reveal(badge, label);
  };
  badge.classList.add('visible', 'has-logo');
  body?.classList.add('with-logo');
  badge.title = logo.name;
  const onLoad = (image, show) => fitCardLogo(image, logo.attachment, show);
  badge.append(createLogoImage(logo.attachments, logo.attachment, label, showName, { preload: true, onLoad }));
}

// Sans `onToggle` (carte de relecture), l'adresse est du texte : un clic ne doit pas
// ouvrir un message depuis une fenêtre de relecture.
function fillEmail(link, email, linked) {
  if (!email) return;
  reveal(link, email);
  const href = linked ? mailtoHref(email) : '';
  if (href) link.href = href;
}

// Le rôle de la personne dans une tâche (taskRolesOf dans grist-data.js), écrit dans l'étiquette de la tâche : les
// lecteurs d'écran le lisent avec elle, la bulle d'attachTagNotes le montre au survol et au clavier, et sur un écran
// qui ne survole pas (téléphone) style.css l'affiche sous le nom de la tâche. Masqué à l'écran sinon.
const roleNote = roles => `${roles.length > 1 ? 'Rôles' : 'Rôle'} : ${roles.join(', ')}`;

// Un tag d'une catégorie sans filtre serait fait de <span> non cliquables : un bouton qui ne
// filtre rien induirait en erreur. Il en va de même sans `onToggle` (carte de relecture).
function buildTag(group, value, onToggle, isNew, roles) {
  const filterable = Boolean(onToggle) && FILTERABLE_KEYS.has(group.key);
  const tag = document.createElement(filterable ? 'button' : 'span');
  if (filterable) tag.type = 'button';
  tag.className = filterable ? `tag tag-${group.key}` : `tag tag-${group.key} tag-static`;
  tag.style.backgroundColor = group.color;
  tag.textContent = value;
  if (roles?.length) {
    tag.classList.add('has-note');
    tag.append(' ', el('span', 'tag-note', roleNote(roles)));
  }
  if (filterable) tag.addEventListener('click', () => onToggle(group.key, value));
  if (isNew) {
    tag.classList.add('tag-add');
    spoken(tag, 'ajouté');
  }
  return tag;
}

// Un tag retiré, montré barré dans la carte « Après » : ce qui a disparu se voit aussi. Il
// perd la couleur de sa catégorie, le rouge pâle de « retiré » la remplace.
function buildRemovedTag(group, value) {
  const tag = buildTag(group, value, null, false);
  tag.style.backgroundColor = '';
  tag.classList.add('tag-del');
  spoken(tag, 'retiré');
  return tag;
}

function buildTagGroup(group, labels, onToggle, change, roles) {
  const section = document.createElement('section');
  section.className = 'tag-group';

  const title = document.createElement('h3');
  title.className = 'tag-group-title';
  title.textContent = group.label;
  title.style.color = group.color;

  const added = new Set((change?.added ?? []).map(normalize));
  const values = document.createElement('div');
  values.className = 'tag-group-values';
  values.append(
    ...labels.map(value => {
      const key = normalize(value);
      return buildTag(group, value, onToggle, added.has(key), ownValue(roles, key));
    }),
    ...(change?.removed ?? []).map(value => buildRemovedTag(group, value))
  );

  section.append(title, values);
  return section;
}

// Le rôle dans le PUI : du texte, comme la fonction (ni pastille ni fond), qui filtre comme les autres tags. Il est à droite
// de la ligne de l'e-mail (style.css) et ne la fait jamais passer à la ligne : trop long pour la place que l'e-mail lui
// laisse, il est coupé par une ellipse, et `title` donne le rôle entier au survol. Il n'est pas dans la colonne du logo
// (sa hauteur écarterait le nom de l'avatar). Sur la carte « Après » d'une relecture, un rôle ajouté porte son contour,
// un rôle retiré reste barré (`change` : { added, removed }).
function fillRole(details, contact, onToggle, change) {
  const added = new Set((change?.added ?? []).map(normalize));
  const tags = [
    ...labelsOf(contact, ROLE_GROUP.key).map(value => roleTag(buildTag(ROLE_GROUP, value, onToggle, added.has(normalize(value))), value)),
    ...(change?.removed ?? []).map(value => roleTag(buildRemovedTag(ROLE_GROUP, value), value))
  ];
  if (tags.length === 0) return;
  const line = el('div', 'role-col');
  line.append(...tags);
  // Juste après l'e-mail : l'ordre de lecture et de tabulation est celui de l'écran (l'e-mail, son rôle, puis le téléphone).
  details.querySelector('.email').after(line);
  details.classList.add('has-role');
}

// Un tag de rôle sans la couleur de sa catégorie, son texte dans un bloc à lui (c'est lui que style.css coupe par une
// ellipse : un bouton n'en fait pas partout) et le rôle entier en infobulle.
function roleTag(tag, value) {
  tag.style.backgroundColor = '';
  tag.classList.add('role-tag');
  tag.title = value;
  tag.firstChild.replaceWith(el('span', 'role-text', value));
  return tag;
}

function fillTags(container, contact, onToggle, changes) {
  TAG_GROUPS.filter(group => group !== ROLE_GROUP).forEach(group => {
    const labels = labelsOf(contact, group.key);
    const change = changes?.[group.key];
    if (labels.length > 0 || change?.removed.length > 0) {
      // Le rôle dans une tâche ne se lit que dans l'annuaire, pas sur une carte de relecture (sans `onToggle`).
      const roles = onToggle && group.key === 'taches' ? contact.taskRoles : null;
      container.appendChild(buildTagGroup(group, labels, onToggle, change, roles));
    }
  });
}

// La ligne d'actions d'une carte que la personne connectée peut modifier (voir
// rightsFor() dans profile.js) : « Votre fiche » sur la sienne, et le bouton. Le clic
// est écouté une seule fois par main.js, sur la grille.
function fillActions(box, contact, rights) {
  box.hidden = false;
  box.querySelector('.own-flag').hidden = rights !== 'own';
  const edit = box.querySelector('.card-edit');
  edit.dataset.rowId = String(contact.id);
  edit.textContent = rights === 'admin' ? '✎ Modifier la fiche' : '✎ Modifier';
  edit.title = rights === 'admin' ? `Modifier la fiche de ${displayName(contact)} (mode admin)` : 'Modifier ma fiche';
  edit.setAttribute('aria-label', `Modifier la fiche de ${displayName(contact)}`);
}

// Le bouton « Modifier » d'un responsable, sous le logo (ou le sigle) de son établissement : il ouvre la
// fiche de l'établissement. Le clic est écouté une seule fois par main.js, sur la grille.
function fillEtablissementEdit(box, etablissementId, contactId, label) {
  const edit = el('button', 'etab-edit', '✎ Modifier');
  edit.type = 'button';
  edit.dataset.etabId = String(etablissementId);
  edit.dataset.rowId = String(contactId);
  edit.title = `Modifier la fiche de l’établissement : ${label}`;
  edit.setAttribute('aria-label', `Modifier l’établissement ${label}`);
  edit.setAttribute('aria-haspopup', 'dialog');
  box.append(edit);
}

// La photo que montre la carte : celle que la personne vient de choisir (la carte « après » d'une
// relecture, `avatarUrl`, voir withAvatarChange dans preview.js), sinon celle que Grist garde.
const photoOf = contact => (contact.avatarUrl ? { url: contact.avatarUrl } : avatarIdOf(contact.Avatar));

// Le repère de la photo sur la carte « Après » : un anneau vert, ou rouge pour une photo retirée, et
// la pastille écrite sous la fonction (`marks.avatar` : { before, after }, voir withAvatarChange).
function markAvatar(avatar, identity, { before, after }) {
  const gone = after === 'remove';
  avatar.classList.add(gone ? 'rv-ring-del' : 'rv-ring');
  const note = el('p', 'rv-note');
  note.append(pill(gone ? 'photo retirée' : before > 0 ? 'photo modifiée' : 'photo ajoutée', gone));
  identity.append(note);
}

// L'avatar de la carte. Sans photo, les initiales du gabarit ; avec elle, un avatar neuf (photo sous les initiales
// jusqu'à son chargement). Dans la grille la photo s'agrandit au clic ; sur une carte de relecture (sans `onToggle`)
// rien n'est cliquable.
function fillAvatar(card, contact, onToggle, { marks, logos, etablissement }) {
  let avatar = card.querySelector('.avatar');
  const photo = photoOf(contact);
  if (photo) {
    const zoom = onToggle
      ? { name: displayName(contact), detail: [contact.Fonction, etablissement?.name || contact.etablissement_label].filter(Boolean).join(' · ') }
      : null;
    const withPhoto = createAvatar({ initials: initials(contact), photo, attachments: logos?.attachments, zoom });
    avatar.replaceWith(withPhoto);
    avatar = withPhoto;
  } else {
    avatar.textContent = initials(contact);
  }
  if (marks?.avatar) markAvatar(avatar, card.querySelector('.identity'), marks.avatar);
}

function fillName(name, contact, marks) {
  if (marks?.texts.name) {
    // Dans un seul <span> : le nom est une boîte à plusieurs lignes (style.css) qui rangerait
    // sinon le repère, le blanc et la pastille les uns sous les autres.
    const line = el('span');
    line.append(el('span', 'mk', displayName(contact)), ' ', pill('modifié'));
    name.replaceChildren(line);
  } else {
    name.textContent = displayName(contact);
  }
}

// Les lignes de texte de la carte : fonction, établissement (pastille ou logo), e-mail, téléphone. `marks.texts`
// repère celles qu'une relecture change.
function fillTexts(card, contact, onToggle, { marks, logos, etablissement }) {
  const fonction = card.querySelector('.fonction');
  if (marks?.texts.fonction) showTextChange(fonction, marks.texts.fonction);
  else if (contact.Fonction) reveal(fonction, contact.Fonction);

  const badge = card.querySelector('.etablissement-tag');
  fillEtablissement(badge, contact.etablissement_label, onToggle,
    etablissement?.logo ? { attachment: etablissement.logo, name: etablissement.name, row: etablissement.id, attachments: logos.attachments } : null);
  if (marks?.texts.etab?.after) markEtablissement(badge, marks.texts.etab);
  const email = card.querySelector('.email');
  if (marks?.texts.email) showTextChange(email, marks.texts.email);
  else fillEmail(email, shownEmail(contact), Boolean(onToggle));

  const tel = card.querySelector('.tel');
  const phone = formatPhone(contact.numero_de_telephone);
  if (marks?.texts.tel) showTextChange(tel, marks.texts.tel, value => `☎ ${value}`);
  else if (phone) reveal(tel, `☎ ${phone}`);
}

// `view` : { rights } pour la grille ('own', 'admin' ou rien), { marks } pour une
// carte de relecture (voir renderPreviewCard), { logos } de quoi montrer le logo de
// l'établissement : { attachments, logoFor(contact) } (attachments.js, branding.js) ;
// sans eux la carte garde la pastille texte et les initiales (une photo de Grist demande aussi
// `attachments`).
function buildCard(template, contact, onToggle, view = {}) {
  const { rights = null, marks = null, logos = null, etabRights = null } = view;
  const card = template.content.cloneNode(true);
  if (contact.id !== undefined) card.firstElementChild.dataset.contactId = String(contact.id);
  const shown = { marks, logos, etablissement: logoOf(logos, contact) };

  fillAvatar(card, contact, onToggle, shown);
  fillName(card.querySelector('.name'), contact, marks);
  fillTexts(card, contact, onToggle, shown);
  fillRole(card.querySelector('.details'), contact, onToggle, marks?.tags.role);
  fillTags(card.querySelector('.card-tags'), contact, onToggle, marks?.tags);
  if (rights) fillActions(card.querySelector('.card-actions'), contact, rights);
  // Fermé par défaut : seul un établissement dont la personne est responsable (et dont la carte
  // porte la référence) montre le bouton.
  const etablissementId = editableEtablissement(contact, etabRights);
  if (etablissementId) fillEtablissementEdit(card.querySelector('.etab-actions'), etablissementId, contact.id, contact.etablissement_label);
  return card;
}

// Le logo et le nom de l'établissement d'un contact (`logos.logoFor`), ou rien sans de quoi les montrer.
function logoOf(logos, contact) {
  return logos?.attachments && logos.logoFor?.(contact);
}

// L'identifiant de l'établissement du contact quand la personne connectée en est responsable (`etabRights`), sinon rien.
function editableEtablissement(contact, etabRights) {
  const id = refId(contact.Etablissement);
  return etabRights && id && contact.etablissement_label && etabRights(id) ? id : null;
}

// ----- Cartes gardées d'un dessin à l'autre -----

// Filtrer, chercher ou allumer un interrupteur redessine la grille, mais une carte ne dépend que de son contact, de ce que la
// personne connectée peut en faire et du logo de son établissement : rien de ce que le dessin change. Les construire de
// nouveau coûtait l'essentiel du temps (plus de 5 secondes pour 4 500 cartes) ; elles sont donc gardées, par contact, et
// reviennent telles quelles. Une relecture de Grist produit de nouveaux contacts, donc de nouvelles cartes : rien ne se périme.
// Ce qui peut changer sans nouveau contact (les droits de la personne connectée, le mode admin, le gabarit) est rangé avec la
// carte, et une carte dont l'un de ces éléments a changé est reconstruite.
const cardCache = new WeakMap(); // contact → { ingredients, card }

const sameIngredients = (a, b) => a.every((value, index) => value === b[index]);

function cardFor(contact, template, onToggle, { rightsOf, logos, etabRights }) {
  const rights = rightsOf(contact);
  const ingredients = [template, onToggle, rights, logos?.attachments, logoOf(logos, contact), editableEtablissement(contact, etabRights)];
  const kept = cardCache.get(contact);
  if (kept && sameIngredients(kept.ingredients, ingredients)) return kept.card;
  const card = buildCard(template, contact, onToggle, { rights, logos, etabRights }).firstElementChild;
  cardCache.set(contact, { ingredients, card });
  return card;
}

// `rightsOf(contact)` (facultatif) dit ce que la personne connectée peut faire de la
// fiche : 'own', 'admin' ou rien. `logos` (facultatif) : de quoi montrer le logo de
// l'établissement, voir buildCard. `etabRights(identifiant)` (facultatif) : vrai pour un
// établissement dont la personne est responsable (etablissementRightsFor).
export function renderCards(grid, template, contacts, onToggle, rightsOf = () => null, logos = null, etabRights = null) {
  const view = { rightsOf, logos, etabRights };
  // Un fragment plutôt que des arguments : des dizaines de milliers de cartes étalées en arguments dépasseraient la pile.
  const cards = document.createDocumentFragment();
  contacts.forEach(contact => cards.appendChild(cardFor(contact, template, onToggle, view)));
  grid.replaceChildren(cards);
}

// ----- Le focus d'une carte survit au dessin de la grille -----

// Redessiner la grille retire ses cartes de la page, même celles qu'on y remet telles quelles (cartes gardées, plus haut) : le
// navigateur renvoie alors le focus à la page, et le clavier repart du haut. Pour qui navigue au clavier (le focus est celui du
// clavier, l'anneau se voit), keepFocus() joue `redraw`, puis rend le focus à ce qui l'avait dans la grille : le même contrôle quand sa
// carte est gardée, son équivalent (même fiche, même nom) quand elle a été refaite, sinon `fallback` (le compteur, où la liste
// commence). Le focus défile jusqu'à ce qui le reçoit : le contrôle ne reste jamais hors de l'écran. À la souris, rien ne change.
const CARD_CONTROLS = 'a[href], button, input, select, textarea, [tabindex]';
const controlKey = control => [control.tagName, control.className, control.getAttribute('aria-label'), control.title, control.textContent.trim()].join('|');

function equivalentControl(grid, { contactId, key }) {
  const card = contactId ? grid.querySelector(`.contact-card[data-contact-id="${contactId}"]`) : null;
  return card ? [...card.querySelectorAll(CARD_CONTROLS)].find(control => controlKey(control) === key) : null;
}

export function keepFocus(grid, fallback, redraw) {
  const control = grid.contains(document.activeElement) && isFocusVisible(document.activeElement) ? document.activeElement : null;
  const where = control && { contactId: control.closest('.contact-card')?.dataset.contactId, key: controlKey(control) };
  redraw();
  if (!control || grid.contains(document.activeElement)) return;
  (control.isConnected ? control : equivalentControl(grid, where) ?? fallback).focus();
}

// Une carte pour la relecture d'une modification : même gabarit et mêmes classes que
// dans l'annuaire, mais rien n'y est cliquable. `marks` (preview.js) repère dans la
// carte « après » ce qui a changé ; sans lui, c'est la carte « avant ».
export function renderPreviewCard(template, contact, marks = null, logos = null) {
  const card = buildCard(template, contact, null, { marks, logos });
  card.querySelector('.contact-card').classList.add('rv-card');
  return card;
}

// ===== Bulle du rôle dans une tâche =====

// Au survol d'une étiquette de tâche, ou quand le clavier s'y pose, une bulle dit le rôle de la personne dans la tâche
// (le texte de `.tag-note`, voir buildTag). Une seule bulle pour toute la grille, posée sur <body> : une carte coupe
// ce qui la dépasse. Sur un écran qui ne survole pas (téléphone) elle ne sert pas : style.css écrit le rôle sous le
// nom de la tâche. Échap la ferme et elle reste tant que la souris est sur l'étiquette ou sur elle (WCAG 1.4.13).
const TIP_GAP = 6;
const TIP_MARGIN = 8;
const TIP_HIDE_DELAY_MS = 150;

export function attachTagNotes(grid) {
  const tip = el('div', 'tag-tip');
  tip.hidden = true;
  // Le rôle fait déjà partie du nom de l'étiquette pour un lecteur d'écran : la bulle ne le répète pas.
  tip.setAttribute('aria-hidden', 'true');
  document.body.append(tip);
  let timer = 0;
  let anchor = null; // l'étiquette de la bulle ouverte et l'endroit où elle était

  const hide = () => {
    clearTimeout(timer);
    anchor = null;
    tip.hidden = true;
  };
  const hideSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, TIP_HIDE_DELAY_MS);
  };
  const show = tag => {
    clearTimeout(timer);
    const note = tag.querySelector('.tag-note')?.textContent;
    if (!note || window.matchMedia('(hover: none)').matches) return;
    tip.textContent = note;
    // Mesurée au coin du cadre, où rien ne la serre : sa largeur ne dépend pas de l'endroit où on la pose.
    tip.style.left = '0px';
    tip.style.top = '0px';
    tip.hidden = false;
    const { left: tagLeft, top: tagTop, width, bottom } = tag.getBoundingClientRect();
    const left = Math.min(Math.max(TIP_MARGIN, tagLeft + (width - tip.offsetWidth) / 2), window.innerWidth - tip.offsetWidth - TIP_MARGIN);
    const above = tagTop - tip.offsetHeight - TIP_GAP;
    tip.style.left = `${left}px`;
    tip.style.top = `${above >= TIP_MARGIN ? above : bottom + TIP_GAP}px`;
    anchor = { tag, left: tagLeft, top: tagTop };
  };
  const tagOf = event => event.target.closest?.('.tag.has-note');
  // Le défilement ou le redimensionnement du cadre déplace l'étiquette : la bulle, fixe, ne la suivrait pas.
  const followOrHide = () => {
    if (!anchor) return;
    const { left, top } = anchor.tag.getBoundingClientRect();
    if (left !== anchor.left || top !== anchor.top) hide();
  };

  grid.addEventListener('mouseover', event => {
    const tag = tagOf(event);
    if (tag) show(tag);
  });
  grid.addEventListener('mouseout', event => {
    if (tagOf(event)) hideSoon();
  });
  grid.addEventListener('focusin', event => {
    const tag = tagOf(event);
    if (tag?.matches(':focus-visible')) show(tag);
  });
  grid.addEventListener('focusout', event => {
    if (tagOf(event)) hide();
  });
  tip.addEventListener('mouseenter', () => clearTimeout(timer));
  tip.addEventListener('mouseleave', hideSoon);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  window.addEventListener('scroll', followOrHide, true);
  window.addEventListener('resize', followOrHide);
  // Les cartes redessinées (un filtre, une recherche) emportent l'étiquette sans qu'aucun événement de souris
  // ne le dise : la bulle s'efface.
  new MutationObserver(hide).observe(grid, { childList: true });
}
