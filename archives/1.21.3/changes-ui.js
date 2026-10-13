// La liste des changements d'une fiche, sous les deux cartes de la relecture : une
// ligne par champ, l'ancienne valeur barrée puis la nouvelle, ou les valeurs ajoutées
// et retirées d'une liste, ou la photo avant et après. DOM seulement ; `lines` vient de
// describeChanges() (profile.js).

import { CATEGORIES, PROFILE_FIELDS } from './constants.js';
import { el } from './dom.js';

// Seules les listes ont une couleur de catégorie : un repère de la couleur de l'Établissement
// ou du Rôle ne distinguerait rien.
const CATEGORY_OF = new Map(PROFILE_FIELDS.filter(field => field.kind === 'list').map(field => [field.key, field.category]));

// Un signe visible (+ ou −) et, pour un lecteur d'écran, le mot qui le dit.
function listChange(kind, sign, spoken, label) {
  const chip = el('span', `chg chg-${kind}`);
  const mark = el('span', '', `${sign} `);
  mark.setAttribute('aria-hidden', 'true');
  chip.append(mark, el('span', 'sr-only', `${spoken} : `), label);
  return chip;
}

// La photo de profil se lit en images : la photo actuelle puis la nouvelle (ou un mot quand il n'y en a
// pas). `thumb(côté, ligne)` donne la miniature de 'before' ou 'after' (un bouton qui l'agrandit), ou null.
function photoValues(line, thumb) {
  const none = text => el('span', 'none', text);
  return [
    thumb?.('before', line) ?? none(line.before > 0 ? 'photo actuelle' : 'aucune photo'),
    el('span', '', '→'),
    thumb?.('after', line) ?? none(line.after === 'remove' ? 'photo retirée' : 'nouvelle photo')
  ];
}

// `thumb` (facultatif) : voir photoValues. Sans lui, la ligne de la photo ne dit que des mots.
export function renderChangeList(lines, thumb = null) {
  const list = el('ul', 'diff');
  lines.forEach(line => {
    const row = el('li', 'diff-row');
    const category = CATEGORY_OF.get(line.key);
    if (category) row.style.setProperty('--c', CATEGORIES[category].color);
    row.append(el('span', 'diff-label', line.label));

    const value = el('span', 'diff-val');
    if (line.kind === 'list') {
      line.added.forEach(label => value.append(listChange('add', '+', 'ajouté', label)));
      line.removed.forEach(label => value.append(listChange('del', '−', 'retiré', label)));
    } else if (line.kind === 'image') {
      value.append(...photoValues(line, thumb));
    } else {
      value.append(
        line.before ? el('del', '', line.before) : el('span', 'none', 'non renseigné'),
        el('span', '', '→'),
        line.after ? el('ins', '', line.after) : el('span', 'none', 'supprimé')
      );
    }
    row.append(value);
    list.append(row);
  });
  return list;
}
