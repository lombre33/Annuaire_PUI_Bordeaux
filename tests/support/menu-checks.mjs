// Les contrôles d'interface des menus de filtre (1.41.1) : ce que la personne VOIT dans un menu ouvert, vérifié sur le menu rendu, pas sur
// les données qui l'ont produit. La 1.38.0 passait ses tests et montrait un « — aucune correspondance — » en tête de l'onglet C.U.R.I.E, puis
// des titres « 0 », « 3 », « 13 » : ses tests lisaient des données et des libellés que j'avais imaginés, et personne ne regardait le menu.
// Sans effet de bord : ce module ne lance pas de navigateur.

import assert from './assert.mjs';
import { isNoMatch } from '../../grist-data.js';

// Les libellés du menu ouvert de la clé `key` (data-filter-key) : ses groupes (cases de groupe) et ses valeurs (cases de détail, replié ou
// non : elles sont dans la page). `filter` : le locator du filtre.
export async function menuLabels(filter) {
  return filter.evaluate(element => {
    const texts = selector => [...element.querySelectorAll(selector)].map(label => label.textContent.trim());
    return { groups: texts('.group-head .option-label'), options: texts('.filter-option .option-label') };
  });
}

// Un menu lisible : aucun libellé vide, aucun libellé qui ne soit qu'un nombre (un titre « 13 » ne dit rien à personne), aucun qui dise « rien »
// (« — aucune correspondance — », « 0 », « n/a » : ce n'est pas un choix), aucun qui commence ou finisse par un tiret, et un groupe n'apparaît
// qu'une fois. Une valeur peut figurer sous deux groupes (la même compétence sous deux domaines) mais pas deux fois sous le même.
export function assertReadableMenu({ groups, options }, where) {
  [...groups, ...options].forEach(label => {
    assert.ok(label !== '', `${where} : un libellé est vide`);
    assert.ok(!/^\d+$/.test(label), `${where} : « ${label} » n'est qu'un nombre, il ne dit pas ce qu'il désigne`);
    assert.ok(!isNoMatch(label), `${where} : « ${label} » dit « rien » : ce n'est pas un choix à montrer`);
    assert.ok(!/^[-–—]|[-–—]$/.test(label), `${where} : « ${label} » commence ou finit par un tiret`);
  });
  assert.equal(new Set(groups).size, groups.length, `${where} : un groupe est montré deux fois (${groups.join(', ')})`);
}

// Les cadres que dessine la partie de l'en-tête d'un menu qui précède le champ de recherche (les onglets) : un élément a un cadre quand il a un
// contour sur l'un de ses côtés autre que le bas (le bas est un trait, pas un cadre), une ombre, un fond ou des angles arrondis. Le menu a déjà
// le sien, et la recherche le sien : les onglets, eux, se reconnaissent à un trait (1.41.1, « l'onglet dans l'onglet dans l'onglet »).
export async function framesAboveSearch(filter) {
  return filter.evaluate(element => {
    const head = element.querySelector('.filter-menu-head');
    const search = head.querySelector('.filter-search-input');
    const above = [...head.querySelectorAll('*')].filter(node => !search.contains(node) && !node.contains(search)
      && (node.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING));
    const framed = node => {
      const style = getComputedStyle(node);
      const side = name => parseFloat(style[`border${name}Width`]) > 0 && style[`border${name}Style`] !== 'none';
      const painted = !/^(?:rgba\(0, 0, 0, 0\)|transparent)$/.test(style.backgroundColor);
      return side('Top') || side('Left') || side('Right') || style.boxShadow !== 'none' || painted || parseFloat(style.borderTopLeftRadius) > 0;
    };
    return above.filter(framed).map(node => `${node.tagName.toLowerCase()}.${node.className}`);
  });
}
