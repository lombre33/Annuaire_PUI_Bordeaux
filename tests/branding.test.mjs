import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBranding, logoForContact, logoSize } from '../branding.js';
import { BAND_LOGO, FUNDER_LOGO, CARD_LOGO } from '../constants.js';
import { loadDirectory, tableToRows } from '../grist-data.js';
import { sampleTables, withBranding } from './fixtures.mjs';

// ===== buildBranding : logos, bandeau des fondateurs, financeurs =====

const quiet = { info() {}, warn() {} };

// Lignes lues comme le fait loadDirectory (colonnes → lignes).
function brandingOf(tables) {
  return buildBranding({
    etablissementRows: tableToRows(tables.Etablissements),
    financeurRows: tables.Financeurs ? tableToRows(tables.Financeurs) : null
  });
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

// ===== les financeurs =====

test('the funders come in the order of the ordre column', () => {
  const { funders } = brandingOf(withBranding());
  assert.deepEqual(funders.map(f => f.name), ['République française', 'ANR', 'Bpifrance', 'France 2030']);
  assert.deepEqual(funders.map(f => f.logo), [21, 22, null, 23]);
});

test('the roundel of the band is the funder named France 2030, whatever the case and accents', () => {
  for (const name of ['France 2030', 'FRANCE 2030', ' france 2030 ']) {
    const tables = withBranding();
    tables.Financeurs.nom[2] = name;
    assert.equal(brandingOf(tables).roundel?.logo, 23, JSON.stringify(name));
  }
  const tables = withBranding();
  tables.Financeurs.nom[2] = 'France 2040';
  assert.equal(brandingOf(tables).roundel, null);
});

test('without the Financeurs table there are no funders and no roundel, and nothing fails', () => {
  const branding = brandingOf(sampleTables());
  assert.deepEqual(branding.funders, []);
  assert.equal(branding.roundel, null);
  assert.deepEqual(buildBranding().funders, []);
  assert.deepEqual(buildBranding({ financeurRows: null, etablissementRows: [] }).founders, []);
});

test('a funder with neither name nor logo is ignored; a funder with only a logo is kept', () => {
  const tables = withBranding();
  tables.Financeurs.id.push(5, 6);
  tables.Financeurs.nom.push('', '   ');
  tables.Financeurs.logo.push(null, ['L', 24]);
  tables.Financeurs.ordre.push(0, 0);
  const { funders } = brandingOf(tables);
  assert.equal(funders.length, 5);
  assert.deepEqual(funders.at(-1), { id: 6, name: '', logo: 24, order: Infinity });
});

test('names and files are carried as plain data, never interpreted', () => {
  const tables = withBranding();
  tables.Financeurs.nom[0] = '<img src=x onerror="window.__xss=1">';
  const branding = brandingOf(tables);
  assert.equal(branding.funders[0].name, '<img src=x onerror="window.__xss=1">');
});

// ===== la signature : ne reconstruire les logos que s'ils ont changé =====

test('the signature stays the same while nothing visible changes, and changes when a logo, a name or the order does', () => {
  const base = brandingOf(withBranding()).signature;
  assert.equal(brandingOf(withBranding()).signature, base);

  const otherPerson = withBranding();
  otherPerson.BDD.Fonction[0] = 'Cheffe de projet';
  assert.equal(brandingOf(otherPerson).signature, base, 'une fiche de contact n\'a rien à voir avec les logos');

  const changes = {
    'logo d\'un fondateur': t => { t.Etablissements.logo[0] = ['L', 99]; },
    'ordre du bandeau': t => { t.Etablissements.ordre_bandeau = [1, 0, 0, 0, 2]; },
    'nom d\'un fondateur': t => { t.Etablissements.nom_complet[0] = 'CHU Pellegrin'; },
    'logo d\'un financeur': t => { t.Financeurs.logo[0] = ['L', 98]; },
    'nom d\'un financeur': t => { t.Financeurs.nom[1] = 'Agence nationale'; },
    'établissement devenu fondateur': t => { t.Etablissements.fondateur[1] = true; }
  };
  for (const [name, change] of Object.entries(changes)) {
    const tables = withBranding();
    change(tables);
    assert.notEqual(brandingOf(tables).signature, base, name);
  }
});

// ===== loadDirectory fournit les lignes dont l'habillage a besoin =====

function docApiOf(tables, { failing = [] } = {}) {
  const calls = {};
  return {
    calls,
    async fetchTable(name) {
      calls[name] = (calls[name] || 0) + 1;
      if (failing.includes(name)) throw new Error(`échec ${name}`);
      if (!tables[name]) throw new Error(`Table inconnue : ${name}`);
      return structuredClone(tables[name]);
    }
  };
}

test('loadDirectory returns the Etablissements and Financeurs rows the branding needs, from a single read each', async () => {
  const docApi = docApiOf(withBranding());
  const directory = await loadDirectory(docApi, { log: quiet });
  assert.equal(directory.etablissementRows.length, 5);
  assert.equal(directory.etablissementRows[0].logo.join(), 'L,11');
  assert.deepEqual(directory.financeurRows.map(row => row.nom), ['République française', 'ANR', 'France 2030', 'Bpifrance']);
  assert.equal(docApi.calls.Etablissements, 1);
  assert.equal(docApi.calls.Financeurs, 1);
  assert.deepEqual(directory.issues, []);
});

test('a document without the Financeurs table loads exactly as before: no banner message, no warning', async () => {
  const warnings = [];
  const directory = await loadDirectory(docApiOf(sampleTables()), { log: { info() {}, warn: (...args) => warnings.push(args) } });
  assert.equal(directory.financeurRows, null);
  assert.deepEqual(directory.issues, []);
  assert.deepEqual(warnings.filter(args => /Financeurs/.test(JSON.stringify(args))), [], 'rien dans la console sur la table absente');
  assert.equal(directory.contacts.length, 5);
});

test('an unreadable Financeurs table costs nothing: the directory loads, the funders are simply missing', async () => {
  const directory = await loadDirectory(docApiOf(withBranding(), { failing: ['Financeurs'] }), { log: quiet });
  assert.equal(directory.financeurRows, null);
  assert.deepEqual(directory.issues, []);
  assert.equal(directory.contacts.length, 5);
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
  for (const limits of [BAND_LOGO, FUNDER_LOGO, CARD_LOGO]) {
    for (const ratio of [0.01, 0.1, 0.3, 0.5, 1, 1.2, 2, 2.875, 4, 6, 10, 100]) {
      const box = logoSize(ratio, limits);
      assert.ok(box.width <= limits.maxWidth + 1e-9 && box.height <= limits.maxHeight + 1e-9, `ratio ${ratio}: ${box.width} x ${box.height}`);
      assert.ok(Math.abs(box.width / box.height - ratio) < 1e-6 * Math.max(1, ratio), `ratio ${ratio} conservé`);
    }
  }
});

test('logoSize: on a card the logo fits the 92 x 32 box at its own proportions', () => {
  assert.deepEqual(logoSize(1, CARD_LOGO), { width: 32, height: 32 });
  assert.deepEqual(logoSize(2.4, CARD_LOGO), { width: 76.8, height: 32 });
  assert.equal(logoSize(92 / 32, CARD_LOGO).width, 92);
  const wide = logoSize(5, CARD_LOGO);
  assert.equal(wide.width, 92);
  assert.ok(Math.abs(wide.height - 18.4) < 1e-9);
});

test('logoSize: the optical weights of the funders stay close, from the roundel to the flat banner', () => {
  const areas = [1, 1.5, 2, 3, 4].map(ratio => area(logoSize(ratio, FUNDER_LOGO)));
  assert.ok(Math.max(...areas) / Math.min(...areas) < 1.6, areas.map(Math.round).join(' '));
});
