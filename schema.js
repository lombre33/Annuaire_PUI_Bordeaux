// Type des colonnes d'une table, tel que Grist le déclare. Le widget en a besoin
// pour une seule chose : écrire un numéro de téléphone dans la forme de sa colonne
// (nombre ou texte).

import { CATEGORIES, MAIN_TABLE, RESPONSIBLE_COLUMN } from './constants.js';
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
    log.warn('[SCHEMA] Types de colonnes illisibles :', error?.message || error);
    return {};
  }
}

// Crée la colonne `Taches_responsable` de BDD quand elle manque (1.40.0, demande d'Antoine du 16 novembre 2026 : « le widget fait les rajouts de
// colonne »). Une colonne de DONNÉES (`isFormula: false`) de type liste de références vers `Taches`, comme `BDD.Taches` : la personne y coche les
// actions dont elle est responsable (profile-form.js, « Responsable de »). C'est la seule colonne que le widget ajoute au document, et seulement à la
// demande d'un administrateur qui ouvre l'annuaire (main.js, ensureResponsibleColumn) : Grist la refuse à qui n'a pas le droit de changer la structure
// (règles d'accès, GRIST_SETUP.md étape 1), et la case « Responsable de » n'est alors pas proposée.
// Renvoie '' si la colonne existe désormais, sinon la raison de l'échec, à dire dans la console. Si une autre personne l'a créée au même instant,
// Grist numérote la nôtre (« Taches_responsable2 ») : on la retire, la colonne d'origine sert à tous.
export async function createResponsibleColumn(docApi, { log = console } = {}) {
  const target = CATEGORIES.taches.table;
  try {
    const created = await docApi.applyUserActions([['AddColumn', MAIN_TABLE, RESPONSIBLE_COLUMN, { type: `RefList:${target}`, isFormula: false }]]);
    const made = created?.retValues?.[0]?.colId;
    if (typeof made === 'string' && made !== RESPONSIBLE_COLUMN) {
      await Promise.resolve(docApi.applyUserActions([['RemoveColumn', MAIN_TABLE, made]])).catch(() => {});
      log.info(`[SCHEMA] colonne « ${RESPONSIBLE_COLUMN} » déjà créée par une autre personne.`);
    } else {
      log.info(`[SCHEMA] colonne « ${RESPONSIBLE_COLUMN} » absente de ${MAIN_TABLE} : créée, une liste de références vers ${target} (GRIST_SETUP.md, étape 1).`);
    }
    return '';
  } catch (error) {
    return `la colonne « ${RESPONSIBLE_COLUMN} » manque dans ${MAIN_TABLE} et Grist n'a pas permis de la créer (${error?.message || error}) : `
      + `la case « Responsable de » du profil n'est pas proposée. Créez-la à la main, en liste de références vers ${target} (GRIST_SETUP.md, étape 1).`;
  }
}
