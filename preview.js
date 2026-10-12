// La carte « avant » et la carte « après » d'une modification, et ce qui les distingue.
// Aucun accès au DOM ici : render.js dessine les deux cartes, d'après les repères
// que ce module calcule.
//
// La carte « après » n'est pas une simulation : c'est la ligne de BDD avec les valeurs
// qui vont être écrites, enrichie par le même enrich() que l'annuaire. Elle montre donc
// exactement ce que l'annuaire affichera une fois la fiche enregistrée.

import { TAG_GROUPS } from './constants.js';
import { displayName, enrich, formatPhone, labelsOf, normalize, shownEmail, text } from './grist-data.js';

// Les lignes de texte d'une carte qui peuvent changer, et comment on les lit.
const TEXT_PARTS = {
  name: displayName,
  etab: contact => text(contact.etablissement_label),
  fonction: contact => text(contact.Fonction),
  email: shownEmail,
  tel: contact => formatPhone(contact.numero_de_telephone)
};

// Ce qui diffère entre deux cartes : { texts, tags }.
//   texts  { name | etab | fonction | email | tel → { before, after } } pour chaque ligne modifiée
//   tags   { catégorie → { added, removed } } (des libellés) pour chaque catégorie de
//          tags modifiée. Comparés à la casse et aux accents près, comme partout dans
//          le widget : un libellé écrit autrement n'est pas un ajout.
export function diffContacts(before, after) {
  const texts = {};
  Object.entries(TEXT_PARTS).forEach(([part, read]) => {
    const was = read(before);
    const now = read(after);
    if (was !== now) texts[part] = { before: was, after: now };
  });

  const tags = {};
  TAG_GROUPS.forEach(({ key }) => {
    const was = labelsOf(before, key);
    const now = labelsOf(after, key);
    const wasKeys = new Set(was.map(normalize));
    const nowKeys = new Set(now.map(normalize));
    const added = now.filter(label => !wasKeys.has(normalize(label)));
    const removed = was.filter(label => !nowKeys.has(normalize(label)));
    if (added.length > 0 || removed.length > 0) tags[key] = { added, removed };
  });
  return { texts, tags };
}

// Il y a quelque chose à montrer.
export const hasMarks = marks => Object.keys(marks.texts).length + Object.keys(marks.tags).length > 0;

// { before, after, marks } pour la ligne `row` à laquelle on applique `values` (la
// forme de buildRowUpdate : les cellules telles que Grist les stockera).
export function previewOf(row, values, referenceMaps, etabFlags) {
  const before = enrich(row, referenceMaps, etabFlags);
  const after = enrich({ ...row, ...values }, referenceMaps, etabFlags);
  return { before, after, marks: diffContacts(before, after) };
}
