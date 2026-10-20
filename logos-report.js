// Le bilan des logos dans la console : quelques secondes après le dernier dessin des cartes, une ligne dit combien de logos Grist a
// donnés et combien s'affichent. Rien ne s'exécute à l'import.

import { logoStats } from './branding-ui.js';

// Les logos sont un habillage dont l'échec se voit mal : sans logo, la carte montre le sigle, ou rien. Quelques secondes après
// le dernier dessin des cartes (et encore un peu plus tard, pour un logo qui n'arrive jamais), la console dit en une ligne
// combien de logos Grist a donnés et combien s'affichent, sans adresse ni jeton : de quoi comprendre un logo manquant sans
// l'ouvrir. Une ligne par changement du bilan, pas une par rendu.
const LOGO_REPORT_DELAYS_MS = [6000, 15000];

function browserLabel() {
  const agent = globalThis.navigator?.userAgent ?? '';
  const named = /(Firefox|Edg|Chrome)\/(\d+)/.exec(agent);
  const safari = /Version\/(\d+)/.exec(agent);
  const name = named ? (named[1] === 'Edg' ? 'Edge' : named[1]) : safari ? 'Safari' : '';
  return name ? `${name} ${(named ?? safari).at(-1)}${/Mobi|Android/.test(agent) ? ' mobile' : ''}` : 'navigateur inconnu';
}

// `attachments` : les pièces jointes du document (attachments.js), dont on lit les compteurs. Renvoie la fonction à appeler après
// chaque dessin des cartes.
export function createLogoReport(attachments) {
  let rendered = 0; // combien de fois les cartes ont été redessinées depuis le chargement
  let reportedBalance = '';
  let reportTimers = [];

  function report() {
    const stats = logoStats(attachments);
    if (stats.asked === 0) return;
    const shown = selector => ({ loaded: document.querySelectorAll(`${selector}.loaded`).length, all: document.querySelectorAll(selector).length });
    const cards = shown('#cardsGrid .etablissement-tag .logo-img');
    const band = shown('#bandLogos .logo-img');
    const problems = stats.refused + stats.late + stats.token + stats.pending;
    const balance = `${stats.loaded} logo${stats.loaded > 1 ? 's' : ''} chargé${stats.loaded > 1 ? 's' : ''} sur ${stats.asked}`
      + (problems ? ` (${stats.refused} refusé${stats.refused > 1 ? 's' : ''}, ${stats.late} sans réponse, ${stats.token} sans jeton, ${stats.pending} en attente)` : '')
      + ` ; affichés : ${cards.loaded}/${cards.all} sur les cartes, ${band.loaded}/${band.all} dans le bandeau`;
    if (balance === reportedBalance) return;
    reportedBalance = balance;
    const token = attachments.stats();
    const line = `[LOGOS] Bilan : ${balance} ; cartes redessinées ${rendered} fois ; jetons demandés à Grist ${token.requested} (${token.failed} en échec) ; ${browserLabel()}.`;
    (problems || cards.loaded < cards.all || band.loaded < band.all ? console.warn : console.info)(line);
  }

  return function cardsRedrawn() {
    rendered += 1;
    reportTimers.forEach(clearTimeout);
    reportTimers = LOGO_REPORT_DELAYS_MS.map(delay => setTimeout(report, delay));
  };
}
