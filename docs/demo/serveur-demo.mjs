// Serveur de démonstration : sert le vrai widget (index.html, main.js...) avec
// une API Grist simulée qui répond avec les données fictives de
// donnees-fictives.mjs. Ni document Grist ni réseau nécessaires.
//
//   node docs/demo/serveur-demo.mjs          puis http://127.0.0.1:8080
//   http://127.0.0.1:8080/?panne=Actions     simule une table de référence illisible
//   http://127.0.0.1:8080/?connecte=camille.rousseau@chd.example
//                                            ouvre le widget comme cette personne : le
//                                            bandeau « Ma présence » apparaît et son
//                                            interrupteur écrit dans le jeu de données
//                                            (en mémoire, rechargez pour repartir de zéro)
//   ...&refus=BDD                            simule une règle d'accès qui refuse d'écrire
//                                            dans BDD (liste de tables séparées par des virgules)
//   ...&readonly=true                        ouvre le widget comme un compte Lecteur
//   PORT=9000 node docs/demo/serveur-demo.mjs
//
// index.html n'est pas dupliqué : il est lu dans le dépôt à chaque requête et
// seule la balise qui charge grist-plugin-api.js est remplacée par le
// simulateur. Le widget tourne donc tel qu'il est en production.
//
// Le simulateur est le faux document Grist des tests (tests/support/fake-grist.js) :
// une seule simulation de l'API à maintenir, que les tests et la démonstration
// partagent. Ses adresses de démonstration sont dans PERSONNES_DEMO
// (donnees-fictives.mjs).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tablesFictives } from './donnees-fictives.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_SIMULATEUR = '/__grist-simule.js';
const BALISE_API_GRIST = /<script\s+src="[^"]*grist-plugin-api\.js"\s*><\/script>/;

// Seuls ces types sont servis : le dossier .git et les fichiers sans extension
// restent inaccessibles.
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

// Le texte du faux Grist des tests, `export` retiré : ce fichier ne doit rien
// importer, il est inséré tel quel dans la page.
function fauxGrist() {
  return fs.readFileSync(path.join(RACINE, 'tests', 'support', 'fake-grist.js'), 'utf8').replace(/^export /gm, '');
}

// Remplace grist-plugin-api.js. `window.__demo` permet aux captures de simuler
// une panne en cours de session (tablesIllisibles) puis de rejouer un
// onRecords (rappelOnRecords), comme le fait Grist après une édition.
// `utilisateur` est la personne connectée (?connecte=), null pour un compte
// anonyme ; `actions` liste les écritures reçues par le faux document.
function scriptApiSimulee(tables) {
  const donnees = JSON.stringify(tables).replaceAll('<', '\\u003c');
  return `(() => {
  ${fauxGrist()}
  const tables = ${donnees};
  const adresse = new URLSearchParams(location.search);
  const liste = nom => (adresse.get(nom) || '').split(',').filter(Boolean);
  const demo = window.__demo = {
    tablesIllisibles: liste('panne'),
    ecrituresRefusees: liste('refus'),
    utilisateur: adresse.get('connecte') ? { email: adresse.get('connecte') } : null,
    rappelOnRecords: null,
    acces: null,
    actions: null
  };
  const faux = createFakeGrist({
    tables: () => tables,
    failTables: () => demo.tablesIllisibles,
    denyWrites: () => demo.ecrituresRefusees,
    user: () => demo.utilisateur
  });
  demo.actions = faux.calls;
  window.grist = {
    ready(options) { demo.acces = options && options.requiredAccess; },
    onRecords(rappel) { demo.rappelOnRecords = rappel; setTimeout(rappel, 0); },
    docApi: faux.docApi
  };
})();`;
}

function pageAvecSimulateur() {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  if (!BALISE_API_GRIST.test(html)) {
    throw new Error('index.html ne charge plus grist-plugin-api.js par une balise <script src="…">'
      + ' : adaptez BALISE_API_GRIST dans docs/demo/serveur-demo.mjs.');
  }
  return html.replace(BALISE_API_GRIST, `<script src="${URL_SIMULATEUR}"></script>`);
}

export function startDemoServer({ port = 0, tables = tablesFictives() } = {}) {
  const server = http.createServer((requete, reponse) => {
    try {
      const { pathname } = new URL(requete.url, 'http://x');
      if (pathname === URL_SIMULATEUR) {
        reponse.writeHead(200, { 'content-type': TYPES['.js'] }).end(scriptApiSimulee(tables));
        return;
      }
      if (pathname === '/' || pathname === '/index.html') {
        reponse.writeHead(200, { 'content-type': TYPES['.html'] }).end(pageAvecSimulateur());
        return;
      }
      const fichier = path.join(RACINE, decodeURIComponent(pathname));
      const type = TYPES[path.extname(fichier)];
      if (!type || !fichier.startsWith(RACINE + path.sep) || !fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) {
        reponse.writeHead(404).end();
        return;
      }
      reponse.writeHead(200, { 'content-type': type }).end(fs.readFileSync(fichier));
    } catch (erreur) {
      reponse.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(erreur.message));
    }
  });
  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await startDemoServer({ port: Number(process.env.PORT) || 8080 });
  console.log(`Widget avec données fictives : ${url}  (Ctrl+C pour arrêter)`);
}
