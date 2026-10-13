// Type des colonnes d'une table, tel que Grist le déclare. Le widget en a besoin
// pour une seule chose : écrire un numéro de téléphone dans la forme de sa colonne
// (nombre ou texte).

import { MAIN_TABLE } from './constants.js';
import { tableToRows } from './grist-data.js';

// { colonne → type } d'une table (« Text », « Numeric », « Ref:Etablissements »…).
// Vide si les métadonnées sont illisibles : l'appelant se rabat alors sur ce que
// contiennent les données.
export async function readColumnTypes(docApi, tableId = MAIN_TABLE, { log = console } = {}) {
  try {
    const [tables, columns] = await Promise.all([
      docApi.fetchTable('_grist_Tables'),
      docApi.fetchTable('_grist_Tables_column')
    ]);
    const table = tableToRows(tables).find(row => row.tableId === tableId);
    if (!table) return {};
    return Object.fromEntries(tableToRows(columns)
      .filter(column => column.parentId === table.id)
      .map(column => [column.colId, column.type]));
  } catch (error) {
    log.warn('[SCHEMA] Types de colonnes illisibles :', error?.message || error);
    return {};
  }
}
