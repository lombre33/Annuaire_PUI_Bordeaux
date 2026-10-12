// Ce que la vue administrateur montre parmi les demandes : filtrer, paginer, choisir
// celles qu'un seul geste peut valider. Aucun accès au DOM ni à Grist (admin-ui.js
// dessine, main.js agit).
//
// Les listes peuvent devenir longues (l'historique grossit avec le temps) : seules les
// demandes affichées sont décrites en détail, et le nom normalisé d'une personne est
// calculé une fois (`person(id).search`), pas à chaque frappe.

import { compareLabels, normalize } from './grist-data.js';

// Nombre de demandes montrées d'un coup avant « Afficher la suite ».
export const PAGE_SIZE = 50;

// `person(id)` renvoie { name, etablissement, search? } ou null (fiche introuvable).
const searchKey = who => who?.search ?? normalize(who?.name || '');

// Les demandes dont la personne correspond à la recherche (nom, sans tenir compte de la
// casse ni des accents) et à l'établissement choisi ('' : tous).
export function filterRequests(requests, { query = '', etablissement = '' } = {}, person) {
  const term = normalize(query);
  if (!term && !etablissement) return requests;
  return requests.filter(request => {
    const who = person(request.personId);
    if (etablissement && (who?.etablissement || '') !== etablissement) return false;
    return !term || searchKey(who).includes(term);
  });
}

// Les établissements des personnes concernées, sans doublon, pour le menu de filtre.
export function etablissementsOf(requests, person) {
  const labels = new Set();
  requests.forEach(request => {
    const label = person(request.personId)?.etablissement;
    if (label) labels.add(label);
  });
  return [...labels].sort(compareLabels);
}

// Les `shown` premières demandes, et combien restent.
export function pageOf(requests, shown) {
  return { items: requests.slice(0, shown), rest: Math.max(0, requests.length - shown) };
}

// Les demandes qu'un seul geste peut valider : celles qui passent tous les contrôles ET
// dont la fiche n'a pas bougé depuis. Une demande qui mérite un coup d'œil (avertissement)
// se traite à part, une par une.
export function bulkTargets(requests, describe) {
  return requests.filter(request => {
    const description = describe(request);
    return description.canValidate && description.warnings.length === 0;
  }).map(request => request.id);
}
