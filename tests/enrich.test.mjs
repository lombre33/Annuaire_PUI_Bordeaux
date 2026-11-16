import { test } from 'node:test';
import assert from './support/assert.mjs';
import { automaticRoles, enrich, filterableRoles, labelsOf, MEMBER_ROLE, RESPONSIBLE_ROLE, responsibleActions, responsibleText, roleEntries, tagText, taskCode } from '../grist-data.js';

test('enrich: etablissement_label resolves BDD.Etablissement, a direct Reference, in any of the shapes Grist can send', () => {
  const referenceMaps = { etablissement: { 2: 'UBM' } };
  assert.equal(enrich({ Etablissement: 2 }, referenceMaps).etablissement_label, 'UBM', 'identifiant de ligne (fetchTable)');
  assert.equal(enrich({ Etablissement: ['R', 'Etablissements', 2] }, referenceMaps).etablissement_label, 'UBM');
  assert.equal(enrich({ Etablissement: 'UBM' }, referenceMaps).etablissement_label, 'UBM', 'texte déjà résolu');
  assert.equal(enrich({ Etablissement: 0 }, referenceMaps).etablissement_label, '', 'référence vide');
  assert.equal(enrich({ Etablissement: 999 }, referenceMaps).etablissement_label, '', 'ligne introuvable : pas de valeur fantôme');
  assert.equal(enrich({}, {}).etablissement_label, '');
});

test('enrich: labels.etablissement mirrors etablissement_label as a single-element array (or empty)', () => {
  assert.deepEqual(enrich({ Etablissement: 1 }, { etablissement: { 1: 'CHU' } }).labels.etablissement, ['CHU']);
  assert.deepEqual(enrich({}, {}).labels.etablissement, []);
});

test('enrich: labels.role resolves Role_dans_le_PUI as an array, like every other tag group', () => {
  // Régression : enrich() ne posait qu'une valeur singulière, que rien ne
  // lisait — le tag "Rôle PUI" n'apparaissait donc sur aucune carte, quelles
  // que soient les données (cf. CHANGELOG).
  const referenceMaps = { role: { 3: 'Référent qualité' } };
  assert.deepEqual(enrich({ Role_dans_le_PUI: 3 }, referenceMaps).labels.role, ['Référent qualité']);
  assert.deepEqual(enrich({}, referenceMaps).labels.role, [], 'pas de référence: liste vide');
  assert.deepEqual(enrich({ Role_dans_le_PUI: 999 }, referenceMaps).labels.role, [], 'référence introuvable: liste vide, pas de valeur fantôme');
});

test('enrich: list-reference categories (Instances/GT/Communautés/Actions/Compétences) drop ids that fail to resolve, instead of leaking the raw numeric id as a fake label', () => {
  const referenceMaps = { instances: { 7: 'CME' } };
  assert.deepEqual(enrich({ Instances: ['L', 7, 999] }, referenceMaps).labels.instances, ['CME'],
    'id 999 introuvable dans la table de référence: ignoré, pas affiché comme "999"');
  assert.deepEqual(enrich({ Instances: ['L'] }, referenceMaps).labels.instances, []);
});

test('enrich: list-reference categories resolve correctly when Grist sends pre-resolved text instead of numeric ids (production regression, 2026-09-14)', () => {
  const referenceMaps = { instances: { 7: 'CME' } };
  // ['L', 'CME'] : la table Instances a une visible column configurée en
  // prod, donc Grist envoie directement le texte, pas ['L', 7].
  assert.deepEqual(enrich({ Instances: ['L', 'CME'] }, referenceMaps).labels.instances, ['CME']);
});

test('enrich: each list-reference category reads its own BDD column and its own reference table, not another\'s', () => {
  const referenceMaps = {
    instances: { 1: 'Instance A' },
    gt: { 3: 'GT C' },
    communautes: { 4: 'Communauté D' },
    taches: { 5: 'Tâche E' },
    competences: { 6: 'Compétence F' }
  };
  const contact = {
    Instances: ['L', 1],
    GT: ['L', 3],
    Communautes: ['L', 4],
    Taches: ['L', 5],
    Competences: ['L', 6]
  };
  const result = enrich(contact, referenceMaps);
  assert.deepEqual(result.labels.instances, ['Instance A']);
  assert.deepEqual(result.labels.gt, ['GT C']);
  assert.deepEqual(result.labels.communautes, ['Communauté D']);
  assert.deepEqual(result.labels.taches, ['Tâche E']);
  assert.deepEqual(result.labels.competences, ['Compétence F']);
});

test('enrich: the actions of a person are her tasks: the old BDD.Actions column is no longer read (1.39.0)', () => {
  const referenceMaps = { actions: { 2: 'Action B' }, taches: { 5: '1.2 Tâche E' } };
  const result = enrich({ Actions: ['L', 2], Taches: ['L', 5] }, referenceMaps);
  assert.equal(result.labels.actions, undefined, 'plus de catégorie « actions » dans les libellés d\'une personne');
  assert.deepEqual(result.labels.taches, ['1.2 Tâche E']);
  assert.deepEqual(enrich({ Actions: ['L', 2] }, referenceMaps).labels.taches, [], 'une action de l\'ancienne colonne n\'est pas une action de la personne');
});

// Les domaines (compétences macro) se lisent depuis BDD.Competences : même
// colonne que les compétences, libellés d'une autre colonne de la table liée.
const SKILL_MAPS = {
  competences: { 1: 'Oncologie', 2: 'Hématologie', 3: 'Pharmacovigilance' },
  macro: { 1: 'Cancérologie', 2: 'Cancérologie', 3: 'Pharmacie' }
};

test('enrich: labels.macro gives the domain of each skill from the same BDD.Competences column, without losing the detailed skills', () => {
  const result = enrich({ Competences: ['L', 1, 3] }, SKILL_MAPS);
  assert.deepEqual(result.labels.competences, ['Oncologie', 'Pharmacovigilance']);
  assert.deepEqual(result.labels.macro, ['Cancérologie', 'Pharmacie']);
});

test('enrich: two skills of the same domain give that domain once, so a contact is counted once per domain', () => {
  assert.deepEqual(enrich({ Competences: ['L', 1, 2] }, SKILL_MAPS).labels.macro, ['Cancérologie']);
  const spelledTwice = { competences: { 1: 'A', 2: 'B' }, macro: { 1: 'Cancérologie', 2: 'cancerologie' } };
  assert.deepEqual(enrich({ Competences: ['L', 1, 2] }, spelledTwice).labels.macro, ['Cancérologie'],
    'casse et accents ne créent pas un deuxième domaine');
});

test('enrich: labels.macro ignores skills without a label and contacts without skills', () => {
  assert.deepEqual(enrich({ Competences: ['L', 999] }, SKILL_MAPS).labels.macro, []);
  assert.deepEqual(enrich({ Competences: ['L'] }, SKILL_MAPS).labels.macro, []);
  assert.deepEqual(enrich({}, SKILL_MAPS).labels.macro, []);
});

test('enrich: a skill already resolved to text is found by its label, never taken for a domain', () => {
  const result = enrich({ Competences: ['L', 'oncologie', 'Inconnue'] }, SKILL_MAPS);
  assert.deepEqual(result.labels.macro, ['Cancérologie'], 'le texte « oncologie » retrouve sa ligne ; « Inconnue » est ignorée');
  assert.deepEqual(result.labels.competences, ['oncologie', 'Inconnue'], 'le détail garde le texte reçu');
  assert.deepEqual(enrich({ Competences: ['L', 'HÉMATOLOGIE'] }, SKILL_MAPS).labels.macro, ['Cancérologie'], 'casse et accents sans importance');
});

// Les actions des tâches se lisent depuis BDD.Taches, comme les domaines depuis BDD.Competences :
// la même colonne, rangée selon l'action que loadDirectory déduit du numéro de la tâche.
const TASK_MAPS = {
  taches: { 1: '1.1 Relecture', 2: '1.2 Rappel vaccinal', 3: '2.1 Inspection' },
  macroTaches: { 1: 'Action 1: Vaccination', 2: 'Action 1: Vaccination', 3: 'Action 2: Audit' }
};

test('enrich: labels.macroTaches gives the action of each task from the same BDD.Taches column, without losing the tasks', () => {
  const result = enrich({ Taches: ['L', 1, 3] }, TASK_MAPS);
  assert.deepEqual(result.labels.taches, ['1.1 Relecture', '2.1 Inspection']);
  assert.deepEqual(result.labels.macroTaches, ['Action 1: Vaccination', 'Action 2: Audit']);
});

test('enrich: two tasks of the same action give that action once, and tasks and skills are grouped independently', () => {
  assert.deepEqual(enrich({ Taches: ['L', 1, 2] }, TASK_MAPS).labels.macroTaches, ['Action 1: Vaccination']);
  const both = enrich({ Taches: ['L', 3], Competences: ['L', 1] }, { ...TASK_MAPS, ...SKILL_MAPS });
  assert.deepEqual([both.labels.macroTaches, both.labels.macro], [['Action 2: Audit'], ['Cancérologie']]);
});

test('enrich: labels.macroTaches ignores tasks without a label, tasks without action, and contacts without tasks', () => {
  assert.deepEqual(enrich({ Taches: ['L', 999] }, TASK_MAPS).labels.macroTaches, []);
  assert.deepEqual(enrich({ Taches: ['L'] }, TASK_MAPS).labels.macroTaches, []);
  assert.deepEqual(enrich({}, TASK_MAPS).labels.macroTaches, []);
  assert.deepEqual(enrich({ Taches: ['L', 1] }, { taches: TASK_MAPS.taches }).labels.macroTaches, [], 'aucune lecture des actions : aucun groupe');
  assert.deepEqual(enrich({ Taches: ['L', 1] }, { taches: TASK_MAPS.taches, macroTaches: {} }).labels.macroTaches, [], 'aucun numéro en commun');
});

test('enrich: a task already resolved to text is found by its label, never taken for an action', () => {
  const result = enrich({ Taches: ['L', '1.1 relecture', 'Inconnue'] }, TASK_MAPS);
  assert.deepEqual(result.labels.macroTaches, ['Action 1: Vaccination'], 'le texte « 1.1 relecture » retrouve sa ligne ; « Inconnue » est ignorée');
  assert.deepEqual(result.labels.taches, ['1.1 relecture', 'Inconnue'], 'le détail garde le texte reçu');
});

test('enrich: the same label twice in one category appears once (a contact is counted once per option)', () => {
  const referenceMaps = { taches: { 1: '1.1 Vaccination', 2: '1.1 vaccination' } };
  assert.deepEqual(enrich({ Taches: ['L', 1, 2] }, referenceMaps).labels.taches, ['1.1 Vaccination']);
});

// Les rôles dans le PUI (1.39.0) : celui que la personne a choisi, plus « Membre d'une action » calculé à chaque lecture d'après ses actions.
const ROLE_MAPS = {
  role: { 1: 'Coordinateur de communauté', 2: 'Responsable d\'une action', 3: 'Membre d\'une action' },
  taches: { 1: '1.1 Relecture', 2: '2.1 Inspection' }
};

test('enrich: a person who has at least one action is « Membre d\'une action », whatever role she chose, and loses it with her last action', () => {
  assert.deepEqual(enrich({ Taches: ['L', 1] }, ROLE_MAPS).labels.role, ['Membre d\'une action'], 'aucun rôle choisi : le rôle calculé seul');
  assert.deepEqual(enrich({ Role_dans_le_PUI: 1, Taches: ['L', 1, 2] }, ROLE_MAPS).labels.role, ['Coordinateur de communauté', 'Membre d\'une action'],
    'le rôle choisi d\'abord, le rôle calculé ensuite, une seule fois même avec plusieurs actions');
  assert.deepEqual(enrich({ Role_dans_le_PUI: 1, Taches: ['L'] }, ROLE_MAPS).labels.role, ['Coordinateur de communauté'], 'plus d\'action : le rôle calculé disparaît');
  assert.deepEqual(enrich({ Taches: ['L', 999] }, ROLE_MAPS).labels.role, [], 'une action introuvable n\'est pas une action');
  assert.deepEqual(enrich({}, ROLE_MAPS).labels.role, []);
});

test('enrich: « Membre d\'une action » written in BDD is ignored, only the computed one counts: the person has it once, or not at all', () => {
  assert.deepEqual(enrich({ Role_dans_le_PUI: 3, Taches: ['L', 1] }, ROLE_MAPS).labels.role, ['Membre d\'une action']);
  assert.deepEqual(enrich({ Role_dans_le_PUI: 3 }, ROLE_MAPS).labels.role, [], 'écrit à la main mais aucune action : retiré');
  assert.deepEqual(enrich({ Role_dans_le_PUI: 'MEMBRE D’UNE ACTION', Taches: ['L', 1] }, ROLE_MAPS).labels.role, ['Membre d\'une action'],
    'texte déjà résolu : casse et apostrophe ignorées, le rôle n\'est pas écrit deux fois');
});

test('enrich: the member role takes the name the table of the roles gives it, or « Membre d\'une action » when it has none', () => {
  const named = { role: { 1: 'Coordinateur de communauté', 2: 'Membre de l\'action' }, taches: { 1: '1.1 Relecture' } };
  assert.equal(automaticRoles(named.role).member, 'Membre de l\'action');
  assert.equal(automaticRoles(named.role).known, true);
  assert.deepEqual(enrich({ Taches: ['L', 1] }, named).labels.role, ['Membre de l\'action']);
  const without = { role: { 1: 'Coordinateur de communauté' } };
  assert.deepEqual([automaticRoles(without.role).member, automaticRoles(without.role).known], [MEMBER_ROLE, false]);
  assert.deepEqual(automaticRoles(undefined), { member: MEMBER_ROLE, known: false, responsible: RESPONSIBLE_ROLE, responsibleKnown: false },
    'table des rôles illisible : les noms par défaut');
  assert.equal(MEMBER_ROLE, 'Membre d’une action');
});

test('roleEntries: the stored role first, then the member role if the person has an action; a stored role that is the member role is not repeated', () => {
  const roleMap = { 1: 'Membre d\'une action' };
  assert.deepEqual(roleEntries('Référent qualité', true, roleMap), ['Référent qualité', 'Membre d\'une action']);
  assert.deepEqual(roleEntries('Référent qualité', false, roleMap), ['Référent qualité']);
  assert.deepEqual(roleEntries('Membre d\'une action', true, roleMap), ['Membre d\'une action']);
  assert.deepEqual(roleEntries('Membre d\'une action', false, roleMap), []);
  assert.deepEqual(roleEntries('', true, roleMap), ['Membre d\'une action']);
  assert.deepEqual(roleEntries('', false, roleMap), []);
});

test('filterableRoles: the roles table, plus « Membre d\'une action » when the table does not have it, and « Responsable d\'une action » only when the document has the column that makes it exist', () => {
  const roleMap = { 1: 'Coordinateur de communauté' };
  assert.deepEqual(Object.values(filterableRoles(roleMap)), ['Coordinateur de communauté', 'Membre d’une action'],
    'sans la colonne Taches_responsable, personne ne peut être responsable : pas d\'option qui ne filtre rien');
  assert.deepEqual(Object.values(filterableRoles(roleMap, { responsible: true })), ['Coordinateur de communauté', 'Membre d’une action', 'Responsable d’une action']);
  assert.deepEqual(roleMap, { 1: 'Coordinateur de communauté' }, 'la table lue n\'est pas modifiée');
  const memberOnly = { 1: 'Coordinateur de communauté', 2: 'Membre d\'une action' };
  assert.equal(filterableRoles(memberOnly), memberOnly, 'la table qui a le rôle de membre, sans la colonne : telle quelle');
  assert.deepEqual(Object.values(filterableRoles(memberOnly, { responsible: true })), ['Coordinateur de communauté', 'Membre d\'une action', 'Responsable d’une action']);
  const has = { 1: 'Coordinateur de communauté', 2: 'Membre d\'une action', 3: 'Responsable d\'une tâche' };
  assert.equal(filterableRoles(has), has, 'la table qui les a déjà reste telle quelle');
  assert.equal(filterableRoles(has, { responsible: true }), has, 'avec la colonne aussi : le libellé de la table sert');
  assert.deepEqual(Object.values(filterableRoles(undefined)), ['Membre d’une action']);
  assert.deepEqual(Object.values(filterableRoles(undefined, { responsible: true })), ['Membre d’une action', 'Responsable d’une action']);
});

// Responsable d'une action (1.40.0) : les actions que la personne a cochées « Responsable de » dans son profil (BDD.Taches_responsable), parmi
// celles qu'elle a. La ligne 4 est une seconde ligne brute de la même action que la ligne 2 : on compare les libellés, pas les lignes.
const RESPONSIBLE_MAPS = {
  role: ROLE_MAPS.role,
  taches: { 1: 'Tâche 1.1 : Pilotage', 2: 'Tâche 1.2 : Suivi', 3: 'Tâche 1.10 : Bilan', 4: 'Tâche 1.2 : Suivi', 5: 'Veille', 6: 'Tâche 2.1 : Audit' }
};

test('taskCode: the number of an action, « 1.3 », from « 1.3 Animer », « T1.3 », « Tâche n° 1.3 : … » or after a bracketed prefix; null without one', () => {
  assert.equal(taskCode('1.3 Animer le réseau'), '1.3');
  assert.equal(taskCode('T1.3'), '1.3');
  assert.equal(taskCode('Tâche n° 1.3 : Pilotage/Suivi'), '1.3');
  assert.equal(taskCode('[ PUI ] Tâche 2.10 : Bilan'), '2.10');
  assert.equal(taskCode('Tâche 01.02'), '1.2', 'les zéros de tête ne comptent pas');
  assert.equal(taskCode('Veille'), null);
  assert.equal(taskCode('12 réunions'), null);
  assert.equal(taskCode(''), null);
  assert.equal(taskCode(undefined), null);
});

test('responsibleText: « Responsable de l\'action 1.2 » for one action, « Responsable des actions 1.2, 1.3 » for several; an action without a number is written by its label', () => {
  assert.equal(responsibleText(['Tâche 1.2 : Suivi']), 'Responsable de l’action 1.2');
  assert.equal(responsibleText(['Tâche 1.2 : Suivi', '1.3 Réseau']), 'Responsable des actions 1.2, 1.3');
  assert.equal(responsibleText(['Veille']), 'Responsable de l’action Veille');
  assert.equal(responsibleText(['Tâche 1.2 : Suivi', 'T1.2 Suivi bis']), 'Responsable de l’action 1.2', 'deux libellés du même numéro : un seul numéro');
});

test('responsibleActions: the actions ticked « Responsable de » that the person also has, by label, in the order of their numbers', () => {
  const held = ['Tâche 1.1 : Pilotage', 'Tâche 1.2 : Suivi', 'Tâche 1.10 : Bilan'];
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L', 3, 1] }, RESPONSIBLE_MAPS, held), ['Tâche 1.1 : Pilotage', 'Tâche 1.10 : Bilan'], 'ordre naturel : 1.1 avant 1.10');
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L', 4] }, RESPONSIBLE_MAPS, held), ['Tâche 1.2 : Suivi'], 'une autre ligne brute de la même action : même libellé');
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L', 2, 4] }, RESPONSIBLE_MAPS, held), ['Tâche 1.2 : Suivi'], 'deux lignes de la même action : une seule fois');
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L', 6] }, RESPONSIBLE_MAPS, held), [], 'une action cochée qu\'elle n\'a pas ne compte pas');
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L', 999] }, RESPONSIBLE_MAPS, held), [], 'une ligne sans libellé est ignorée');
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L', 1] }, RESPONSIBLE_MAPS, []), [], 'sans action');
  assert.deepEqual(responsibleActions({ Taches_responsable: ['L'] }, RESPONSIBLE_MAPS, held), []);
  assert.deepEqual(responsibleActions({ Taches_responsable: null }, RESPONSIBLE_MAPS, held), []);
  assert.deepEqual(responsibleActions({}, RESPONSIBLE_MAPS, held), [], 'colonne absente de BDD');
});

test('enrich: a person responsible for some of her actions has the role « Responsable d\'une action », written with the numbers of those actions', () => {
  const one = enrich({ Role_dans_le_PUI: 1, Taches: ['L', 1, 2], Taches_responsable: ['L', 2] }, RESPONSIBLE_MAPS);
  assert.deepEqual(one.labels.role, ['Coordinateur de communauté', 'Membre d\'une action', 'Responsable d\'une action'],
    'le rôle choisi, puis « Membre d\'une action », puis « Responsable d\'une action » : le filtre lit ces libellés');
  assert.equal(tagText(one, 'role', 'Responsable d\'une action'), 'Responsable de l’action 1.2');
  assert.equal(tagText(one, 'role', 'Membre d\'une action'), 'Membre d\'une action', 'les autres rôles s\'écrivent tels quels');
  assert.equal(tagText(one, 'role', 'Coordinateur de communauté'), 'Coordinateur de communauté');
  assert.equal(tagText(one, 'taches', 'Tâche 1.2 : Suivi'), 'Tâche 1.2 : Suivi', 'seul le rôle a un texte à lui');
  assert.equal(tagText({}, 'role', 'Membre d\'une action'), 'Membre d\'une action', 'un contact sans texte de rôle');

  const several = enrich({ Taches: ['L', 1, 2, 3], Taches_responsable: ['L', 3, 1] }, RESPONSIBLE_MAPS);
  assert.equal(tagText(several, 'role', 'Responsable d\'une action'), 'Responsable des actions 1.1, 1.10');
  assert.deepEqual(several.labels.role, ['Membre d\'une action', 'Responsable d\'une action']);
});

test('enrich: the actions ticked but not held, an empty or missing Taches_responsable and a person without actions make nobody responsible', () => {
  assert.deepEqual(enrich({ Taches: ['L', 1], Taches_responsable: ['L', 6] }, RESPONSIBLE_MAPS).labels.role, ['Membre d\'une action']);
  assert.deepEqual(enrich({ Taches: ['L', 1], Taches_responsable: ['L'] }, RESPONSIBLE_MAPS).labels.role, ['Membre d\'une action']);
  assert.deepEqual(enrich({ Taches: ['L', 1] }, RESPONSIBLE_MAPS).labels.role, ['Membre d\'une action'], 'la colonne n\'existe pas encore');
  assert.deepEqual(enrich({ Taches: ['L'], Taches_responsable: ['L', 1] }, RESPONSIBLE_MAPS).labels.role, [], 'plus aucune action : plus de responsabilité');
  assert.deepEqual(enrich({ Taches: ['L', 1], Taches_responsable: ['L', 6] }, RESPONSIBLE_MAPS).roleTexts, {});
});

test('enrich: the responsible role takes the name of the table when it has one, and « Responsable d\'une action » when it has none', () => {
  const named = { role: { 1: 'Responsable de tâche' }, taches: RESPONSIBLE_MAPS.taches };
  const contact = enrich({ Taches: ['L', 1], Taches_responsable: ['L', 1] }, named);
  assert.deepEqual(contact.labels.role, ['Membre d’une action', 'Responsable de tâche']);
  assert.equal(tagText(contact, 'role', 'Responsable de tâche'), 'Responsable de l’action 1.1');
  const without = enrich({ Taches: ['L', 1], Taches_responsable: ['L', 1] }, { role: { 1: 'Coordinateur de communauté' }, taches: RESPONSIBLE_MAPS.taches });
  assert.deepEqual(without.labels.role, ['Membre d’une action', 'Responsable d’une action']);
  assert.equal(tagText(without, 'role', 'Responsable d’une action'), 'Responsable de l’action 1.1');
});

test('roleEntries: a « Responsable d\'une action » chosen by hand stays when no action is ticked, and gives way to the computed role when one is', () => {
  const roleMap = { 1: 'Membre d\'une action', 2: 'Responsable d\'une action' };
  assert.deepEqual(roleEntries('Responsable d\'une action', true, roleMap, false), ['Responsable d\'une action', 'Membre d\'une action'],
    'aucune action cochée : le rôle choisi reste, tel quel');
  assert.deepEqual(roleEntries('Responsable d\'une action', true, roleMap, true), ['Membre d\'une action', 'Responsable d\'une action'], 'une seule fois');
  assert.deepEqual(roleEntries('RESPONSABLE D’UNE ACTION', true, roleMap, true), ['Membre d\'une action', 'Responsable d\'une action'], 'casse et apostrophe ignorées');
  assert.deepEqual(roleEntries('Référent qualité', true, roleMap, true), ['Référent qualité', 'Membre d\'une action', 'Responsable d\'une action']);
  assert.deepEqual(roleEntries('', false, roleMap, false), []);
});

test('enrich: the old columns of the Annuaire table (competences_1..15, Communautee_s_, Etablissement2) are no longer read', () => {
  const contact = { competences_1: 'Ancienne compétence', Communautee_s_: ['L', 4], Etablissement2: 'CHU' };
  const result = enrich(contact, { communautes: { 4: 'Ancienne communauté' } });
  assert.deepEqual(result.labels.competences, []);
  assert.deepEqual(result.labels.communautes, []);
  assert.equal(result.etablissement_label, '');
});

test('labelsOf returns the labels of one category, or an empty list for a contact that has none', () => {
  const contact = enrich({ Etablissement: 1 }, { etablissement: { 1: 'CHU' } });
  assert.deepEqual(labelsOf(contact, 'etablissement'), ['CHU']);
  assert.deepEqual(labelsOf(contact, 'instances'), []);
  assert.deepEqual(labelsOf(contact, 'inconnue'), []);
  assert.deepEqual(labelsOf({ nom: 'Sans enrichissement' }, 'instances'), []);
});

const UBM_FLAGS = { fondateur: false, partenaire: true, ok_pour_apparaitre: true };

test('enrich: attaches etablissement_fondateur/partenaire/ok_pour_apparaitre from etabFlags, via BDD.Etablissement', () => {
  const etabFlags = { byId: { 2: UBM_FLAGS }, byLabel: {} };
  const enriched = enrich({ Etablissement: 2 }, {}, etabFlags);
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, true);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, true);
});

test('enrich: etablissement_fondateur/partenaire/ok_pour_apparaitre default to false when etabFlags is omitted or unresolved', () => {
  const enriched = enrich({ Etablissement: 2 }, {});
  assert.equal(enriched.etablissement_fondateur, false);
  assert.equal(enriched.etablissement_partenaire, false);
  assert.equal(enriched.etablissement_ok_pour_apparaitre, false);
});
