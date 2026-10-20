// Faux document Grist, partagé par les tests Node et par le test navigateur
// (tests/e2e.test.mjs en injecte le texte dans la page, `export` retiré : ce
// fichier ne doit donc rien importer).
//
// Il reproduit ce dont le widget dépend, pas Grist en entier :
//   - fetchTable / listTables, avec des tables en colonnes ({ id: [...], nom: [...] }) ;
//   - applyUserActions pour AddRecord, UpdateRecord, RemoveRecord, BulkRemoveRecord, AddTable (l'identifiant
//     est numéroté s'il est pris, comme Grist) et RemoveTable, atomique (un lot refusé ne
//     change rien) et qui renvoie retValues comme Grist ;
//   - les formules déclenchées de la table-sonde (GRIST_SETUP.md) : Email prend
//     l'adresse de la personne connectée, Admin et Responsable_de se déduisent de la
//     table ACL ;
//   - des pannes de lecture (failTables) et des écritures refusées (denyWrites),
//     comme le ferait une règle d'accès ;
//   - getAccessToken, le jeton qui donne accès aux pièces jointes (logos).
//
// Chaque option peut être une valeur ou une fonction qui la renvoie : le test
// navigateur lit ainsi window.__tables, window.__user… à chaque appel, et un test
// peut les modifier en cours de route.
//
//   tables      les tables du document { nom: { id: [...], colonne: [...] } }
//   failTables  noms des tables dont la lecture échoue
//   user        la personne connectée : { email } (null : compte anonyme)
//   denyWrites  noms des tables où toute écriture est refusée
//   denyRows    lignes protégées { table: [identifiants] } : toute modification ou
//               suppression d'une de ces lignes est refusée (une règle d'accès par ligne)
//   triggers    formules déclenchées en plus de celles de la sonde :
//               { table: { colonne: ({ user, tables }) => valeur } }
//   delay       millisecondes d'attente avant chaque écriture (une écriture lente)
//   readGate    une promesse (ou null) que chaque lecture attend avant de répondre : une lecture lente, que le test
//               libère quand il veut (en la résolvant)
//   accessToken la réponse de getAccessToken { token, baseUrl, ttlMsecs } ; null
//               simule un refus de Grist (par défaut : un jeton valable dix minutes)
//
// `calls` garde chaque action tentée : { action, table, rowId, values, ok, error } ;
// `tokenRequests` garde les demandes de jeton, avec leurs options.

// Adresse des pièces jointes du faux document : les tests navigateur la servent.
export const FAKE_ATTACHMENTS_URL = 'https://docs.getgrist.com/api/docs/fake-doc';

export function createFakeGrist(options = {}) {
  const read = value => (typeof value === 'function' ? value() : value);
  const calls = [];
  const tokenRequests = [];
  let actionNum = 0;

  const normalize = value => String(value ?? '').trim().toLowerCase();

  // Formules déclenchées de GRIST_SETUP.md, calculées à la création d'une ligne.
  const builtInTriggers = {
    Annuaire_Sonde: {
      Email: ({ user }) => user?.email ?? '',
      Admin: ({ user, tables }) => {
        const mail = normalize(user?.email);
        const acl = tables.ACL;
        if (!mail || !acl) return false;
        return acl.id.some((_, index) => normalize(acl.email[index]) === mail && acl.admin[index] === true);
      },
      // Les établissements dont la personne est responsable : identifiants de ligne, triés, séparés
      // par des virgules (la formule de GRIST_SETUP.md, étape 2).
      Responsable_de: ({ user, tables }) => {
        const mail = normalize(user?.email);
        const acl = tables.ACL;
        if (!mail || !acl) return '';
        const ids = acl.id.map((_, index) => index)
          .filter(index => normalize(acl.email[index]) === mail && acl.Responsable_de_l_Etablissement[index] > 0)
          .map(index => acl.Responsable_de_l_Etablissement[index]);
        return [...new Set(ids)].sort((a, b) => a - b).join(',');
      }
    }
  };

  function requireTable(all, name) {
    if (!all[name]) throw new Error(`Table inconnue : ${name}`);
    return all[name];
  }

  function checkColumns(table, tableName, values) {
    Object.keys(values).forEach(column => {
      if (column === 'id' || !(column in table)) throw new Error(`Invalid column '${column}' dans ${tableName}`);
    });
  }

  function rowIndex(table, rowId) {
    const index = table.id.indexOf(rowId);
    if (index < 0) throw new Error(`Invalid row id ${rowId}`);
    return index;
  }

  const applyers = {
    AddRecord(all, tableName, rowId, values) {
      const table = requireTable(all, tableName);
      checkColumns(table, tableName, values);
      const id = rowId ?? (table.id.length ? Math.max(...table.id) + 1 : 1);
      const triggers = { ...builtInTriggers[tableName], ...(read(options.triggers) || {})[tableName] };
      const context = { user: read(options.user), tables: all };
      table.id.push(id);
      Object.keys(table).filter(column => column !== 'id').forEach(column => {
        if (column in values) table[column].push(values[column]);
        else table[column].push(triggers[column] ? triggers[column](context) : null);
      });
      return id;
    },
    UpdateRecord(all, tableName, rowId, values) {
      const table = requireTable(all, tableName);
      checkColumns(table, tableName, values);
      const index = rowIndex(table, rowId);
      Object.entries(values).forEach(([column, value]) => { table[column][index] = value; });
      return null;
    },
    RemoveRecord(all, tableName, rowId) {
      const table = requireTable(all, tableName);
      const index = rowIndex(table, rowId);
      Object.keys(table).forEach(column => table[column].splice(index, 1));
      return null;
    },
    BulkRemoveRecord(all, tableName, rowIds) {
      const table = requireTable(all, tableName);
      rowIds.forEach(rowId => {
        const index = rowIndex(table, rowId);
        Object.keys(table).forEach(column => table[column].splice(index, 1));
      });
      return null;
    },
    // Comme Grist : un identifiant déjà pris est numéroté (« Annuaire_Sonde2 »), la table existante reste
    // intacte ; la valeur renvoyée porte l'identifiant obtenu. Les formules de déclenchement de la sonde
    // sont celles de `builtInTriggers`, quel que soit ce que les colonnes déclarent.
    AddTable(all, tableName, columns) {
      let id = tableName;
      for (let number = 2; all[id]; number += 1) id = `${tableName}${number}`;
      all[id] = { id: [], ...Object.fromEntries(columns.map(column => [column.id, []])) };
      return { table_ref: Object.keys(all).length, id, columns: columns.map(column => column.id), views: [] };
    },
    RemoveTable(all, tableName) {
      requireTable(all, tableName);
      delete all[tableName];
      return null;
    }
  };

  const verbs = { AddRecord: 'add', UpdateRecord: 'update', RemoveRecord: 'remove', BulkRemoveRecord: 'remove', AddTable: 'create', RemoveTable: 'remove' };

  const docApi = {
    async fetchTable(name) {
      await read(options.readGate);
      if ((read(options.failTables) || []).includes(name)) throw new Error(`Grist indisponible : ${name}`);
      return structuredClone(requireTable(read(options.tables), name));
    },

    // Comme Grist : les tables de métadonnées (_grist_Tables…) se lisent avec
    // fetchTable mais ne sont pas des tables de l'utilisateur.
    async listTables() {
      return Object.keys(read(options.tables)).filter(name => !name.startsWith('_grist_'));
    },

    async getAccessToken(request) {
      tokenRequests.push(request);
      const answer = read(options.accessToken);
      if (answer === null) throw new Error('Access token refused');
      return structuredClone(answer ?? { token: 'fake-token', baseUrl: FAKE_ATTACHMENTS_URL, ttlMsecs: 600000 });
    },

    // Atomique : les actions s'appliquent à une copie, adoptée seulement si toutes
    // réussissent.
    async applyUserActions(actions) {
      const delay = read(options.delay) || 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const all = read(options.tables);
      const draft = structuredClone(all);
      const done = [];
      let retValues;
      try {
        retValues = actions.map(([action, tableName, rowId, values = {}]) => {
          if (!applyers[action]) throw new Error(`Action non gérée par le faux Grist : ${action}`);
          if ((read(options.denyWrites) || []).includes(tableName)) {
            throw new Error(`Blocked by table ${verbs[action]} access rules`);
          }
          if (action !== 'AddRecord' && ((read(options.denyRows) || {})[tableName] || []).includes(rowId)) {
            throw new Error(`Blocked by row ${verbs[action]} access rules`);
          }
          const value = applyers[action](draft, tableName, rowId, values);
          // AddTable porte ses colonnes à la place de l'identifiant de ligne : on les garde dans `values`.
          const table = action === 'AddTable';
          done.push({ action, table: tableName, rowId: action === 'AddRecord' ? value : (table ? null : rowId), values: table ? rowId : values, ok: true });
          return value;
        });
      } catch (error) {
        const failed = actions[done.length];
        calls.push({ action: failed?.[0], table: failed?.[1], rowId: failed?.[2], values: failed?.[3], ok: false, error: error.message });
        throw error;
      }
      Object.keys(all).forEach(name => { if (!(name in draft)) delete all[name]; });
      Object.assign(all, draft);
      calls.push(...done);
      return { actionNum: ++actionNum, actionHash: null, retValues, isModification: true };
    }
  };

  return { docApi, calls, tokenRequests };
}
