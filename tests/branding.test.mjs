import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBranding, logoForContact, logoSize, inkBounds, hasInk } from '../branding.js';
import { BAND_LOGO } from '../constants.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { sampleTables, withBranding } from './fixtures.mjs';

// ===== buildBranding : logos des cartes et bandeau des fondateurs =====

const quiet = { info() {}, warn() {} };

// Lignes lues comme le fait loadDirectory (colonnes → lignes).
function brandingOf(tables) {
  return buildBranding({ etablissementRows: tableToRows(tables.Etablissements) });
}

test('the founders band lists the validated founders in the order of ordre_bandeau', () => {
  const { founders } = brandingOf(withBranding());
  assert.deepEqual(founders.map(f => f.label), ['Institut Bergonié', 'CHU'],
    'Bergonié (ordre 1) avant CHU (ordre 2) ; INSERM n\'a pas validé sa présence, UBM est partenaire, Clinique « autres »');
  assert.deepEqual(founders.map(f => f.logo), [null, 11]);
});

test('a founder shows its full name as the tooltip, its acronym as the label, and falls back on the full name', () => {
  const { founders } = brandingOf(withBranding());
  assert.deepEqual(founders.map(f => [f.label, f.name]), [
    ['Institut Bergonié', 'Institut Bergonié'],
    ['CHU', 'CHU de Bordeaux']
  ]);
});

test('founders without a valid order come after the numbered ones, in the order of the table', () => {
  const tables = withBranding();
  tables.Etablissements.fondateur = [true, true, true, true, true];
  tables.Etablissements.ok_pour_apparaitre = [true, true, true, true, true];
  tables.Etablissements.ordre_bandeau = [0, null, 'trois', -1, 2];
  const { founders } = brandingOf(tables);
  assert.deepEqual(founders.map(f => f.label), ['Institut Bergonié', 'CHU', 'UBM', 'Clinique', 'INSERM'],
    'ordre 2 d\'abord ; puis 0, vide, texte et négatif comptent comme « pas de numéro », dans l\'ordre de la table');
});

test('two founders with the same order keep the order of the table', () => {
  const tables = withBranding();
  tables.Etablissements.fondateur = [true, true, true, true, true];
  tables.Etablissements.ok_pour_apparaitre = [true, true, true, true, true];
  tables.Etablissements.ordre_bandeau = [3, 3, 3, 3, 3];
  assert.deepEqual(brandingOf(tables).founders.map(f => f.id), [1, 2, 3, 4, 5]);
});

test('without the logo and order columns the founders are still listed, as text, in the order of the table', () => {
  const { founders } = brandingOf(sampleTables());
  assert.deepEqual(founders.map(f => [f.label, f.logo]), [['CHU', null], ['Institut Bergonié', null]]);
});

test('a founder keeps its first logo when a cell holds several files', () => {
  const tables = withBranding();
  tables.Etablissements.logo[0] = ['L', 31, 32];
  assert.equal(brandingOf(tables).founders.find(f => f.label === 'CHU').logo, 31);
});

test('a logo cell that holds anything but file ids gives no logo', () => {
  for (const cell of ['logo.png', 'https://exemple.example/logo.png', ['L', 'x'], 0, {}, true]) {
    const tables = withBranding();
    tables.Etablissements.logo[0] = cell;
    assert.equal(brandingOf(tables).founders.find(f => f.label === 'CHU').logo, null, JSON.stringify(cell));
  }
});

test('an establishment without any name never reaches the band', () => {
  const tables = withBranding();
  tables.Etablissements.fondateur = [true, true, true, true, true];
  tables.Etablissements.ok_pour_apparaitre = [true, true, true, true, true];
  tables.Etablissements.acronyme[0] = '';
  tables.Etablissements.nom_complet[0] = '  ';
  assert.ok(!brandingOf(tables).founders.some(f => f.id === 1));
});

// ===== le logo de la carte d'un contact =====

test('logoForContact finds the logo through the establishment row id that BDD carries', () => {
  const branding = brandingOf(withBranding());
  assert.deepEqual(logoForContact(branding, { Etablissement: 1 }), { logo: 11, name: 'CHU de Bordeaux' });
  assert.deepEqual(logoForContact(branding, { Etablissement: ['R', 'Etablissements', 2] }), { logo: 12, name: 'Université Bordeaux Montaigne' });
});

test('logoForContact finds the logo through the label when Grist already resolved the reference to text', () => {
  const branding = brandingOf(withBranding());
  assert.deepEqual(logoForContact(branding, { Etablissement: 'CHU' }), { logo: 11, name: 'CHU de Bordeaux' });
  assert.deepEqual(logoForContact(branding, { Etablissement: 'Institut Bergonié' }), { logo: null, name: 'Institut Bergonié' });
});

test('logoForContact answers the establishment without a logo, and nothing for an unknown one', () => {
  const branding = brandingOf(withBranding());
  assert.equal(logoForContact(branding, { Etablissement: 3 }).logo, null, 'Clinique n\'a pas de logo');
  assert.equal(logoForContact(branding, { Etablissement: 999 }), null);
  assert.equal(logoForContact(branding, { Etablissement: 0 }), null);
  assert.equal(logoForContact(branding, { Etablissement: null }), null);
  assert.equal(logoForContact(branding, { Etablissement: 'Inconnu' }), null);
});

test('with two establishments of the same label, the one that has a logo serves the cards resolved by label', () => {
  const tables = withBranding();
  tables.Etablissements.id.push(6);
  tables.Etablissements.acronyme.push('CHU');
  tables.Etablissements.nom_complet.push('CHU (doublon)');
  tables.Etablissements.fondateur.push(true);
  tables.Etablissements.partenaire.push(false);
  tables.Etablissements.autres.push(false);
  tables.Etablissements.ok_pour_apparaitre.push(true);
  tables.Etablissements.logo.push(null);
  tables.Etablissements.ordre_bandeau.push(0);
  const branding = brandingOf(tables);
  assert.equal(logoForContact(branding, { Etablissement: 'CHU' }).logo, 11);
  assert.equal(logoForContact(branding, { Etablissement: 6 }).logo, null, 'par identifiant, chaque ligne garde le sien');
});

test('logoForContact uses the enriched label when the row id is not among the rows read', () => {
  const branding = brandingOf(withBranding());
  assert.equal(logoForContact(branding, { Etablissement: 777, etablissement_label: 'UBM' }).logo, 12);
});

// ===== les financeurs : deux images fixes du dépôt, jamais lues dans Grist =====

const FUNDER_IMAGES = [
  { file: 'assets/financeurs.png', width: 487, height: 80 },
  { file: 'assets/france-2030.png', width: 136, height: 134 }
];

test('the funders band and the France 2030 roundel are the mockup\'s two images, fixed in index.html', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const { file, width, height } of FUNDER_IMAGES) {
    const png = fs.readFileSync(new URL(`../${file}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', `${file} est un PNG`);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, height], `${file} : les dimensions de la maquette`);
    assert.ok(html.includes(`src="${file}"`), `index.html affiche ${file}`);
  }
  assert.match(html, /<div id="funders" class="funders">/, 'le bandeau des financeurs n\'est jamais masqué');
  assert.ok(html.includes('alt="République française, ANR, Bpifrance, France 2030"'));
  assert.ok(html.includes('alt="France 2030"'));
  assert.ok(html.includes('Projet financé par l\'État dans le cadre de France 2030'));
});

test('the branding no longer carries funders: a Financeurs table in the document changes nothing', () => {
  const tables = withBranding();
  const before = brandingOf(tables);
  tables.Financeurs = { id: [1], nom: ['Autre financeur'], logo: [['L', 99]], ordre: [1] };
  const branding = brandingOf(tables);
  assert.deepEqual(Object.keys(branding).sort(), ['founders', 'logos', 'signature']);
  assert.equal(branding.signature, before.signature);
  assert.deepEqual(buildBranding().founders, []);
});

// ===== la signature : ne reconstruire les logos que s'ils ont changé =====

test('the signature stays the same while nothing visible changes, and changes when a logo or a name of the band, or its order, does', () => {
  const base = brandingOf(withBranding()).signature;
  assert.equal(brandingOf(withBranding()).signature, base);

  const otherPerson = withBranding();
  otherPerson.BDD.Fonction[0] = 'Cheffe de projet';
  assert.equal(brandingOf(otherPerson).signature, base, 'une fiche de contact n\'a rien à voir avec les logos');

  const changes = {
    'logo d\'un fondateur': t => { t.Etablissements.logo[0] = ['L', 99]; },
    'ordre du bandeau': t => { t.Etablissements.ordre_bandeau = [1, 0, 0, 0, 2]; },
    'nom d\'un fondateur': t => { t.Etablissements.nom_complet[0] = 'CHU Pellegrin'; },
    'établissement devenu fondateur': t => { t.Etablissements.fondateur[1] = true; }
  };
  for (const [name, change] of Object.entries(changes)) {
    const tables = withBranding();
    change(tables);
    assert.notEqual(brandingOf(tables).signature, base, name);
  }
});

// ===== loadDirectory fournit les lignes dont l'habillage a besoin =====

function docApiOf(tables) {
  const calls = {};
  return {
    calls,
    async fetchTable(name) {
      calls[name] = (calls[name] || 0) + 1;
      if (!tables[name]) throw new Error(`Table inconnue : ${name}`);
      return structuredClone(tables[name]);
    }
  };
}

test('loadDirectory returns the Etablissements rows the branding needs, from a single read, and never reads a Financeurs table', async () => {
  const tables = withBranding();
  tables.Financeurs = { id: [1], nom: ['Autre financeur'], logo: [['L', 99]], ordre: [1] };
  const docApi = docApiOf(tables);
  const directory = await loadDirectory(docApi, { log: quiet });
  assert.equal(directory.etablissementRows.length, 5);
  assert.equal(directory.etablissementRows[0].logo.join(), 'L,11');
  assert.equal(docApi.calls.Etablissements, 1);
  assert.equal(docApi.calls.Financeurs, undefined, 'les financeurs ne se lisent plus dans Grist');
  assert.ok(!('financeurRows' in directory));
  assert.deepEqual(directory.issues, []);
});

test('the logo and order columns are optional: their absence is not reported', async () => {
  const directory = await loadDirectory(docApiOf(sampleTables()), { log: quiet });
  assert.deepEqual(directory.issues, []);
  assert.ok(!('logo' in directory.etablissementRows[0]));
});

// ===== logoSize : le même poids visuel pour des logos de formes différentes =====

const area = ({ width, height }) => width * height;

test('logoSize: an unknown or absurd ratio gives no size, so the stylesheet bounds the image', () => {
  [0, -1, NaN, Infinity, undefined, null].forEach(ratio => assert.equal(logoSize(ratio, BAND_LOGO), null, String(ratio)));
});

test('logoSize: logos of different shapes get the target area while they are inside the bounds', () => {
  [1, 1.5, 2, 2.4, 3].forEach(ratio => {
    const box = logoSize(ratio, BAND_LOGO);
    assert.ok(Math.abs(box.width / box.height - ratio) < 1e-9, 'les proportions sont celles du fichier');
    assert.ok(Math.abs(area(box) - BAND_LOGO.area) < 1e-6 || box.height === BAND_LOGO.maxHeight || box.width === BAND_LOGO.maxWidth, `ratio ${ratio}`);
  });
  assert.ok(Math.abs(area(logoSize(2, BAND_LOGO)) - BAND_LOGO.area) < 1e-6);
});

test('logoSize: a tall logo is capped in height and a banner in width, keeping their proportions', () => {
  const tall = logoSize(1 / 3, BAND_LOGO);
  assert.equal(tall.height, BAND_LOGO.maxHeight);
  assert.ok(Math.abs(tall.width - BAND_LOGO.maxHeight / 3) < 1e-9);
  const banner = logoSize(10, BAND_LOGO);
  assert.equal(banner.width, BAND_LOGO.maxWidth);
  assert.ok(Math.abs(banner.height - BAND_LOGO.maxWidth / 10) < 1e-9);
});

test('logoSize: never beyond the bounds, whatever the ratio', () => {
  for (const ratio of [0.01, 0.1, 0.3, 0.5, 1, 1.2, 2, 2.875, 4, 6, 10, 100]) {
    const box = logoSize(ratio, BAND_LOGO);
    assert.ok(box.width <= BAND_LOGO.maxWidth + 1e-9 && box.height <= BAND_LOGO.maxHeight + 1e-9, `ratio ${ratio}: ${box.width} x ${box.height}`);
    assert.ok(Math.abs(box.width / box.height - ratio) < 1e-6 * Math.max(1, ratio), `ratio ${ratio} conservé`);
  }
});

// Les pixels d'une image de `width` x `height` : transparente (ou blanche), avec des rectangles de couleur.
function pixelsOf(width, height, { background = [0, 0, 0, 0], rects = [] }) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(background, i * 4);
  for (const { x, y, w, h, color } of rects) {
    for (let row = y; row < y + h; row++) for (let column = x; column < x + w; column++) pixels.set(color, (row * width + column) * 4);
  }
  return pixels;
}

test('hasInk : une copie recadrée qui ne contient plus rien (canvas vidé par le navigateur) n\'est pas utilisée', () => {
  const ink = { x: 2, y: 2, w: 3, h: 3, color: [20, 60, 110, 255] };
  assert.equal(hasInk(pixelsOf(10, 10, { rects: [ink] })), true, 'un pixel coloré suffit');
  assert.equal(hasInk(pixelsOf(10, 10, { background: [255, 255, 255, 255], rects: [ink] })), true, 'sur fond blanc');
  assert.equal(hasInk(pixelsOf(10, 10, {})), false, 'transparente');
  assert.equal(hasInk(pixelsOf(10, 10, { background: [255, 255, 255, 255] })), false, 'blanche');
  assert.equal(hasInk(pixelsOf(10, 10, { background: [250, 250, 248, 255] })), false, 'presque blanche');
  assert.equal(hasInk(new Uint8ClampedArray(0)), false, 'sans pixels');
});

test('inkBounds : le cadre de l\'encre d\'un logo, sans ses marges transparentes ou blanches', () => {
  const ink = { x: 30, y: 40, w: 50, h: 20, color: [20, 60, 110, 255] };
  assert.deepEqual(inkBounds(pixelsOf(200, 100, { rects: [ink] }), 200, 100), { x: 30, y: 40, width: 50, height: 20 }, 'fond transparent');
  assert.deepEqual(inkBounds(pixelsOf(200, 100, { background: [255, 255, 255, 255], rects: [ink] }), 200, 100), { x: 30, y: 40, width: 50, height: 20 }, 'fond blanc d\'un JPEG');
  assert.deepEqual(inkBounds(pixelsOf(200, 100, { background: [250, 250, 248, 255], rects: [ink] }), 200, 100), { x: 30, y: 40, width: 50, height: 20 }, 'blanc légèrement bruité');
  assert.deepEqual(inkBounds(pixelsOf(200, 100, { rects: [{ x: 0, y: 30, w: 200, h: 40, color: [20, 60, 110, 255] }] }), 200, 100), { x: 0, y: 30, width: 200, height: 40 }, 'une bannière qui touche les bords');
  assert.equal(inkBounds(pixelsOf(200, 100, { rects: [{ x: 0, y: 0, w: 200, h: 100, color: [20, 60, 110, 255] }] }), 200, 100), null, 'une image pleine : rien à retirer');
  assert.equal(inkBounds(pixelsOf(200, 100, { background: [20, 120, 114, 255], rects: [ink] }), 200, 100), null, 'un fond coloré fait partie du logo');
  assert.equal(inkBounds(pixelsOf(200, 100, {}), 200, 100), null, 'image vide');
  assert.equal(inkBounds(new Uint8ClampedArray(8), 200, 100), null, 'pixels manquants');
});
