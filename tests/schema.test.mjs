import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readColumnTypes } from '../schema.js';
import { createFakeGrist } from './support/fake-grist.js';
import { withSchema } from './fixtures.mjs';

// ===== schema : le type des colonnes, tel que Grist le déclare =====

const warnings = () => {
  const lines = [];
  return { lines, log: { warn: (...args) => lines.push(args.join(' ')) } };
};

test('readColumnTypes returns the declared type of each column of the table', async () => {
  const { docApi } = createFakeGrist({ tables: withSchema() });
  const types = await readColumnTypes(docApi, 'BDD');
  assert.equal(types.numero_de_telephone, 'Numeric');
  assert.equal(types.Fonction, 'Text');
  assert.equal(types.Etablissement, 'Ref:Etablissements');
  assert.equal(types.Accepte_apparaitre, 'Bool');
});

test('readColumnTypes follows the type the document declares (a text phone)', async () => {
  const { docApi } = createFakeGrist({ tables: withSchema(undefined, { phoneType: 'Text' }) });
  assert.equal((await readColumnTypes(docApi, 'BDD')).numero_de_telephone, 'Text');
});

test('readColumnTypes reads BDD by default and ignores the columns of other tables', async () => {
  const tables = withSchema();
  tables._grist_Tables_column.id.push(99);
  tables._grist_Tables_column.parentId.push(2);
  tables._grist_Tables_column.colId.push('acronyme');
  tables._grist_Tables_column.type.push('Text');
  const { docApi } = createFakeGrist({ tables });
  const types = await readColumnTypes(docApi);
  assert.ok('numero_de_telephone' in types);
  assert.ok(!('acronyme' in types));
});

test('readColumnTypes answers nothing for a table the document does not list, without a warning', async () => {
  const { docApi } = createFakeGrist({ tables: withSchema() });
  const { lines, log } = warnings();
  assert.deepEqual(await readColumnTypes(docApi, 'Inconnue', { log }), {});
  assert.deepEqual(lines, []);
});

test('readColumnTypes falls back to nothing, with a warning, when the metadata cannot be read', async () => {
  const { docApi } = createFakeGrist({ tables: withSchema(), failTables: ['_grist_Tables_column'] });
  const { lines, log } = warnings();
  assert.deepEqual(await readColumnTypes(docApi, 'BDD', { log }), {});
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[SCHEMA\] Types de colonnes illisibles/);
});

test('readColumnTypes answers nothing when the document has no metadata tables at all', async () => {
  const tables = withSchema();
  delete tables._grist_Tables;
  delete tables._grist_Tables_column;
  const { docApi } = createFakeGrist({ tables });
  const { log } = warnings();
  assert.deepEqual(await readColumnTypes(docApi, 'BDD', { log }), {});
});
