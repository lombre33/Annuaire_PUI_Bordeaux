import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrich, loadDirectory } from '../grist-data.js';
import { withTaskRoles } from './support/task-role-tables.mjs';

// ===== Le rôle de la personne dans une tâche (colonne Taches_role) =====
// Plusieurs lignes brutes de Taches ont le même libellé corrigé (une par rôle, par exemple) : le rôle d'une
// personne se lit sur les lignes brutes que BDD.Taches lui désigne, pas sur le libellé corrigé qui les confond.

function fakeDocApi(tables, failing = []) {
  return {
    fetchTable: name => (failing.includes(name) ? Promise.reject(new Error(`échec ${name}`)) : Promise.resolve(structuredClone(tables[name])))
  };
}

const silentLog = () => {
  const log = { warnings: [], infos: [], warn: (...args) => log.warnings.push(args), info: (...args) => log.infos.push(args) };
  return log;
};
// Les avertissements qui parlent de la table des tâches (le jeu de test en a d'autres, sans rapport).
const aboutTasks = log => log.warnings.filter(([line]) => /Taches/.test(line));

test('loadDirectory gives a person the roles of her own raw rows, not those the corrected label shares with other rows', async () => {
  const log = silentLog();
  const { contacts, referenceMaps, issues } = await loadDirectory(fakeDocApi(withTaskRoles()), { log });
  assert.deepEqual(referenceMaps.tachesRole, { 1: 'Pilote', 2: 'Contributeur', 3: 'Observateur', 6: 'Fantôme' }, 'les lignes sans rôle sont absentes, le rôle est rogné');
  const byName = Object.fromEntries(contacts.map(c => [c.nom, c]));
  assert.deepEqual(byName.Martin.labels.taches, ['1.1 Relecture']);
  assert.deepEqual(byName.Martin.taskRoles, { '1.1 relecture': ['Pilote'] }, 'Ana n\'a que la ligne « pilote » : pas le rôle des autres lignes de la même tâche');
  assert.deepEqual(byName.Durand.labels.taches, ['1.1 Relecture'], 'une seule étiquette pour ses deux lignes');
  assert.deepEqual(byName.Durand.taskRoles, { '1.1 relecture': ['Contributeur', 'Observateur'] }, 'toutes les lignes de Bob sous cette étiquette');
  assert.deepEqual(byName['Bergonié'].taskRoles, {}, 'une tâche sans rôle n\'en montre pas');
  assert.deepEqual(byName.Bernard.labels.taches, ['Veille']);
  assert.deepEqual(byName.Bernard.taskRoles, {}, 'le rôle d\'une ligne sans libellé corrigé, qu\'on n\'affiche pas, ne s\'affiche pas non plus');
  assert.deepEqual(byName.Hostile.taskRoles, {}, 'aucune tâche');
  assert.deepEqual(issues, [], 'Taches_role est une colonne facultative');
  assert.deepEqual(aboutTasks(log), []);
});

test('loadDirectory shows no role, and says nothing, when Taches has no Taches_role column', async () => {
  const tables = withTaskRoles();
  delete tables.Taches.Taches_role;
  const log = silentLog();
  const { contacts, referenceMaps, issues } = await loadDirectory(fakeDocApi(tables), { log });
  assert.deepEqual(referenceMaps.tachesRole, {});
  assert.ok(contacts.length > 0 && contacts.every(c => Object.keys(c.taskRoles).length === 0));
  assert.deepEqual(issues, []);
  assert.deepEqual(aboutTasks(log), []);
});

test('loadDirectory keeps the previous roles when the Taches table cannot be read', async () => {
  const previousMaps = { taches: { 1: '1.1 Relecture' }, tachesRole: { 1: 'Pilote' } };
  const { referenceMaps } = await loadDirectory(fakeDocApi(withTaskRoles(), ['Taches']), { log: silentLog(), previousMaps });
  assert.deepEqual(referenceMaps.tachesRole, { 1: 'Pilote' });
  assert.deepEqual((await loadDirectory(fakeDocApi(withTaskRoles(), ['Taches']), { log: silentLog() })).referenceMaps.tachesRole, {});
});

test('enrich reads roles on row ids only, whatever the label of the task', () => {
  const referenceMaps = { taches: { 1: '__proto__', 2: 'Veille' }, tachesRole: { 1: 'Pilote', 2: 'Relais' } };
  assert.deepEqual(Object.entries(enrich({ Taches: ['L', 1] }, referenceMaps).taskRoles), [['__proto__', ['Pilote']]]);
  assert.deepEqual(enrich({ Taches: ['L', 'Veille', 0, 99] }, referenceMaps).taskRoles, {}, 'texte déjà résolu, 0 et ligne inconnue : aucun rôle plutôt qu\'un rôle faux');
  assert.deepEqual(enrich({ Taches: ['L', 2, 2] }, referenceMaps).taskRoles, { veille: ['Relais'] }, 'le même rôle deux fois ne se répète pas');
  assert.deepEqual(enrich({ Taches: ['L', 2] }, {}).taskRoles, {}, 'sans table de rôles');
});
