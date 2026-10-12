// La liste des changements d'une fiche, sous les deux cartes de la relecture : une
// ligne par champ, l'ancienne valeur barrée puis la nouvelle, ou les valeurs ajoutées
// et retirées d'une liste. DOM seulement ; `lines` vient de describeChanges() (profile.js).

import { CATEGORIES, PROFILE_FIELDS } from './constants.js';
import { el } from './dom.js';

const CATEGORY_OF = new Map(PROFILE_FIELDS.map(field => [field.key, field.category]));

// Un signe visible (+ ou −) et, pour un lecteur d'écran, le mot qui le dit.
function listChange(kind, sign, spoken, label) {
  const chip = el('span', `chg chg-${kind}`);
  const mark = el('span', '', `${sign} `);
  mark.setAttribute('aria-hidden', 'true');
  chip.append(mark, el('span', 'sr-only', `${spoken} : `), label);
  return chip;
}

export function renderChangeList(lines) {
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
