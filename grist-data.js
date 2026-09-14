// Fonctions pures de conversion/enrichissement des données Grist.
// Aucune de ces fonctions ne touche le DOM : elles sont testables telles quelles
// (voir tests/data.test.mjs).

export function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

// Compare/recherche insensible à la casse ET aux accents (contrairement à
// .toLocaleLowerCase('fr-FR') seul) — utilisé pour matcher un tag libre
// (ex: colonnes competences_1..15, texte tapé à la main) contre une valeur de
// filtre issue d'une table de référence, qui peut différer par la casse ou les
// accents sans que ce soit une vraie différence pour l'utilisateur.
export function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR');
}

// Tri alphabétique français (ex: "chu" doit se classer avant "UBM", ce que
// .sort() par défaut ne fait pas — il compare par code UTF-16, majuscules
// d'abord).
export function compareLabels(a, b) {
  return text(a).localeCompare(text(b), 'fr-FR');
}

// Remonte les valeurs cochées en tête de liste (chaque groupe restant trié
// alphabétiquement) — utilisé pour la construction initiale d'un menu de
// filtre. `sortedValues` doit déjà être trié (ex: via compareLabels) : un
// filtre stable sur un tableau trié préserve l'ordre à l'intérieur de
// chaque groupe, pas besoin de retrier.
export function sortWithCheckedFirst(sortedValues, selected) {
  const checked = sortedValues.filter(value => selected.has(value));
  const unchecked = sortedValues.filter(value => !selected.has(value));
  return [...checked, ...unchecked];
}

// La colonne numero_de_telephone est typée Numeric côté Grist : un numéro
// français saisi avec son 0 initial (ex: 0556789012) perd ce 0 en passant par
// un type numérique (556789012). On le rétablit pour l'affichage. Formats
// inattendus (longueur différente, texte libre) : renvoyés tels quels plutôt
// que déformés.
export function formatPhone(value) {
  if (value === null || value === undefined || value === '' || value === 0) return '';
  const raw = text(value);
  const digits = raw.replace(/\D/g, '');
  if (/^\d{9}$/.test(digits)) return `0${digits}`.match(/.{1,2}/g).join(' ');
  if (/^0\d{9}$/.test(digits)) return digits.match(/.{1,2}/g).join(' ');
  return raw;
}

// Grist encode les colonnes Liste/RéférenceListe sous la forme ['L', item1, item2, ...].
// Une liste réellement vide est donc ['L'] (longueur 1, pas 0) : il faut retirer ce
// marqueur avant de savoir si la liste contient de vraies valeurs.
export function safeValues(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item !== 'L' && item !== null && item !== undefined && item !== 0 && item !== '');
  }
  return value === null || value === undefined || value === '' || value === 0 ? [] : [value];
}

// ===== CONVERSION GRIST: Column-oriented → Row-oriented =====
export function tableToRows(table) {
  if (!table || typeof table !== 'object') return [];
  if (Array.isArray(table)) return table;

  const ids = Array.isArray(table.id) ? table.id : [];
  return ids.map((id, index) => {
    const row = { id };
    Object.keys(table).forEach(key => {
      if (key !== 'id' && Array.isArray(table[key])) {
        row[key] = table[key][index] ?? null;
      }
    });
    return row;
  });
}

// Première valeur non vide parmi plusieurs colonnes candidates, dans l'ordre.
export function pickLabel(row, fields) {
  return fields.map(field => text(row[field])).find(Boolean) || '';
}

// Une colonne Référence UNIQUE (pas ReferenceList) peut arriver sous 3 formes
// différentes depuis l'API Grist, selon que la table liée a une "visible
// column" configurée ou non :
//   - déjà résolue en texte d'affichage (ex: "UBM") si une visible column
//     est configurée sur la table liée — cas réel constaté sur Etablissements ;
//   - encodée ['R', tableId, rowId] ;
//   - un id numérique déjà nu.
// refId() n'extrait un id que dans les 2 derniers cas (une chaîne n'est PAS
// un id, c'est du texte déjà résolu — refLabel() la traite séparément).
export function refId(value) {
  if (Array.isArray(value)) {
    return value[0] === 'R' && value.length >= 3 ? value[2] : null;
  }
  if (typeof value === 'string') return null;
  return value || null;
}

// Résout une colonne Référence unique vers son libellé affichable, quelle
// que soit la forme sous laquelle Grist l'a envoyée (voir refId() ci-dessus).
export function refLabel(value, referenceMap) {
  if (typeof value === 'string') return text(value);
  const id = refId(value);
  return (id && referenceMap?.[String(id)]) || '';
}

// ===== CHARGER UNE TABLE DE RÉFÉRENCE (id -> libellé) =====
// labelFields accepte un nom de colonne unique, ou un tableau de colonnes
// essayées dans l'ordre (la première non vide gagne) — utile quand la colonne
// "principale" (ex: acronyme) n'est pas systématiquement renseignée.
export async function fetchTable(tableName, labelFields) {
  const fields = Array.isArray(labelFields) ? labelFields : [labelFields];
  try {
    const table = await window.grist.docApi.fetchTable(tableName);
    const rows = tableToRows(table);
    const map = {};
    let rowsWithoutLabel = 0;
    rows.forEach(row => {
      const label = pickLabel(row, fields);
      if (row.id === null || row.id === undefined) return;
      if (label) {
        map[String(row.id)] = label;
      } else {
        rowsWithoutLabel += 1;
      }
    });
    console.info(`[REFS] ${tableName}: ${Object.keys(map).length} entrées`
      + (rowsWithoutLabel ? ` (${rowsWithoutLabel} ligne(s) sans ${fields.join('/')})` : ''));
    return map;
  } catch (error) {
    console.warn(`[REFS] Impossible de charger ${tableName}`, error);
    return {};
  }
}

// window.grist.onRecords peut se redéclencher avant qu'un appel précédent
// n'ait fini de résoudre ses fetchTable() (plusieurs éditions rapprochées dans
// Grist) ; sans garde, l'appel le plus lent peut résoudre en dernier et écraser
// un affichage plus récent avec des données périmées. Chaque appel prend un
// numéro ; seul le numéro le plus récent est autorisé à appliquer son résultat.
export function createRequestSequencer() {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: id => id === latest
  };
}

// Compare deux jeux de tables de référence (id -> libellé) par contenu, pas
// par référence — sert à ne reconstruire l'UI des filtres (destructive : elle
// ferme tout menu ouvert et vide les champs de recherche internes) que quand
// les libellés ont réellement changé, pas à chaque édition d'un contact.
export function referenceMapsEqual(a, b) {
  const tablesA = Object.keys(a);
  const tablesB = Object.keys(b);
  if (tablesA.length !== tablesB.length) return false;
  return tablesA.every(table => {
    const mapA = a[table] || {};
    const mapB = b[table] || {};
    const idsA = Object.keys(mapA);
    const idsB = Object.keys(mapB);
    if (idsA.length !== idsB.length) return false;
    return idsA.every(id => mapA[id] === mapB[id]);
  });
}

// Un élément d'une ReferenceList peut lui aussi arriver déjà résolu en texte
// d'affichage (ex: "CME") plutôt qu'en id numérique brut — même ambiguïté que
// pour une Référence unique (voir refId()/refLabel() plus haut), selon que la
// table liée a une "visible column" configurée. RÉGRESSION CONSTATÉE EN PROD
// (14/09, voir CHANGELOG 1.5.1) : la version précédente supposait toujours un
// id numérique nu et cherchait `referenceMap[String("CME")]`, qui échoue
// puisque la table est indexée par id numérique — l'item était alors
// silencieusement jeté au lieu d'être affiché. Tags Instances/Actions/GT/
// Communautés/Tâches disparus de toutes les cartes tant que ce cas ne gérait
// pas le texte déjà résolu.
export function resolveListItem(item, referenceMap) {
  if (typeof item === 'string') return text(item);
  return referenceMap?.[String(item)] || '';
}

// Colonnes ReferenceList (Grist encode ['L', id1, id2, ...]) résolues via une
// table de référence : [colonne sur Annuaire, table de référence, clé de sortie].
// Piloté par données plutôt que 5 blocs copiés-collés — un futur ajout est une
// ligne ici, pas un bloc dupliqué avec 3 tokens à changer à la main (source de
// bug si un token est oublié/mal collé).
const LIST_REFERENCE_FIELDS = [
  ['Instances', 'Instances', 'instances_labels'],
  ['Actions', 'Actions', 'actions_labels'],
  ['GT', 'GT', 'gt_labels'],
  ['Communautee_s_', 'Communautees', 'communautes_labels'],
  ['Taches', 'Taches', 'taches_labels']
];

// ===== ENRICHIR UN CONTACT =====
// etabFlags (voir fetchEtablissementsFlags() ci-dessus) est optionnel — les
// appels existants (tests, ancien code) qui ne le passent pas obtiennent
// simplement des indicateurs à false, ce qui exclut le contact via
// isEtablissementEligible() plutôt que de planter.
export function enrich(contact, referenceMaps, etabFlags) {
  const enriched = { ...contact };

  LIST_REFERENCE_FIELDS.forEach(([contactField, table, outputKey]) => {
    // resolveListItem() gère texte déjà résolu ET id numérique brut (voir sa
    // doc ci-dessus). Un id numérique qui ne résout à aucun libellé (ligne de
    // la table de référence sans libellé renseigné, cf. [REFS] ... sans
    // <champ> dans la console) reste ignoré plutôt que d'afficher l'id brut :
    // "47" comme tag sur une carte n'apporte rien à l'utilisateur.
    enriched[outputKey] = safeValues(contact[contactField])
      .map(id => resolveListItem(id, referenceMaps[table]))
      .filter(Boolean);
  });

  const competences = [];
  for (let i = 1; i <= 15; i++) {
    const value = text(contact[`competences_${i}`]);
    if (value) competences.push(value);
  }
  enriched.competences_labels = competences;

  enriched.etablissement_label =
    refLabel(contact.Etablissement, referenceMaps['Etablissements']) ||
    text(contact.Etablissement2) || '';
  // Miroir en tableau (convention _labels commune à tous les groupes) pour que
  // filters.js n'ait pas besoin d'un cas particulier pour l'établissement — le
  // badge dédié sur la carte (render.js) continue lui d'utiliser la forme
  // singulière ci-dessus.
  enriched.etablissement_labels = enriched.etablissement_label ? [enriched.etablissement_label] : [];

  const flags = etablissementFlags(contact, etabFlags);
  enriched.etablissement_fondateur = flags?.fondateur === true;
  enriched.etablissement_partenaire = flags?.partenaire === true;
  enriched.etablissement_ok_pour_apparaitre = flags?.ok_pour_apparaitre === true;

  const roleLabel = refLabel(contact.Role_dans_le_PUI, referenceMaps['Role_Dans_le_PUI']);
  // Tableau, pas chaîne : TAG_GROUPS (constants.js) et le rendu générique des
  // tags de carte (render.js) attendent `${key}_labels` pour tous les groupes,
  // "role" inclus — une valeur singulière role_label ici ne serait lue nulle
  // part et le tag "Rôle PUI" resterait invisible sur toutes les cartes.
  enriched.role_labels = roleLabel ? [roleLabel] : [];

  return enriched;
}

// Un contact n'est affiché que s'il a au moins une vraie valeur dans perimetre_all
// (cahier des charges, specs.md). Réutilise safeValues() pour rester cohérent avec
// le reste du code sur l'encodage des listes Grist.
//
// Correction régression: l'ancien contrôle testait `Array.isArray(p) && p.length > 0`,
// ce qui était toujours vrai (le marqueur 'L' compte dans la longueur), même pour un
// perimetre_all vide. Voir tests/data.test.mjs pour le test de non-régression.
export function isInScope(record) {
  return safeValues(record.perimetre_all).length > 0;
}

// ===== INDICATEURS DE VISIBILITÉ D'UN ÉTABLISSEMENT =====
// La table Etablissements porte 4 colonnes booléennes pilotant l'affichage des
// contacts qui y sont rattachés (cf. specs.md) : fondateur, partenaire, autres
// (jamais affiché) et ok_pour_apparaitre (validation par l'établissement,
// verrou global indépendant du statut). Chargées à part de fetchTable()
// ci-dessus, qui ne renvoie qu'un id->libellé et n'a pas vocation à porter ces
// indicateurs.
//
// Indexées à la fois par id de ligne et par libellé résolu (acronyme, repli
// nom_complet) car Etablissement (colonne Annuaire) peut arriver sous l'une ou
// l'autre forme selon la config Grist — même ambiguïté que refId()/refLabel()
// ci-dessus, la table Etablissements ayant une "visible column" configurée en
// prod (texte déjà résolu, pas un id).
export async function fetchEtablissementsFlags() {
  const empty = { byId: {}, byLabel: {} };
  try {
    const table = await window.grist.docApi.fetchTable('Etablissements');
    const rows = tableToRows(table);
    const byId = {};
    const byLabel = {};
    rows.forEach(row => {
      if (row.id === null || row.id === undefined) return;
      const flags = {
        fondateur: row.fondateur === true,
        partenaire: row.partenaire === true,
        ok_pour_apparaitre: row.ok_pour_apparaitre === true
      };
      byId[String(row.id)] = flags;
      const label = pickLabel(row, ['acronyme', 'nom_complet']);
      if (label) byLabel[label] = flags;
    });
    return { byId, byLabel };
  } catch (error) {
    console.warn('[REFS] Impossible de charger les indicateurs Etablissements', error);
    return empty;
  }
}

// Résout les indicateurs de l'établissement d'un contact à partir de la
// colonne Etablissement brute (avant tout repli sur Etablissement2, qui est du
// texte libre sans lien vers la table Etablissements et n'a donc jamais
// d'indicateurs). null si l'établissement n'est pas identifiable ou introuvable.
export function etablissementFlags(contact, etabFlags) {
  const raw = contact?.Etablissement;
  if (typeof raw === 'string') {
    const label = text(raw);
    return (label && etabFlags?.byLabel?.[label]) || null;
  }
  const id = refId(raw);
  return (id && etabFlags?.byId?.[String(id)]) || null;
}

// Un contact n'est éligible à l'affichage que si son établissement a validé
// (ok_pour_apparaitre) ET a le statut fondateur ou partenaire — jamais "autres"
// (cf. demande). Un contact dont l'établissement n'est pas identifiable dans la
// table Etablissements (repli Etablissement2, référence orpheline) n'a aucun
// indicateur à faire valoir : exclu par défaut plutôt qu'affiché sans validation.
export function isEtablissementEligible(contact) {
  return contact.etablissement_ok_pour_apparaitre === true &&
    (contact.etablissement_fondateur === true || contact.etablissement_partenaire === true);
}
