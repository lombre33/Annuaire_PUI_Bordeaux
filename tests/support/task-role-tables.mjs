// Le document de test du rôle dans une tâche (colonne Taches_role de Taches), partagé par
// tests/task-roles.test.mjs (les données) et tests/e2e-task-roles.test.mjs (ce que voit la personne).
import { withTaskActions } from '../fixtures.mjs';

// Trois lignes brutes pour « 1.1 Relecture » (la troisième l'écrit à la casse près), une sans rôle, une sans
// libellé corrigé (donc jamais affichée). Ana porte la ligne 1, Bob les lignes 2 et 3, Gina la 4, Hugo les 5 et 6.
export function withTaskRoles() {
  const tables = withTaskActions();
  tables.Taches = {
    id: [1, 2, 3, 4, 5, 6],
    Taches: ['1.1 Relecture (pilote)', '1.1 Relecture (contributeur)', '1.1 relecture (observateur)', '2.1 Inspection', 'Veille', 'Veille (brut)'],
    Taches_corrige: ['1.1 Relecture', '1.1 Relecture', '1.1 relecture', '2.1 Inspection', 'Veille', ''],
    Taches_role: ['Pilote', 'Contributeur', ' Observateur ', '', '', 'Fantôme']
  };
  const tasksOf = { 1: ['L', 1], 2: ['L', 2, 3], 9: ['L', 4], 10: ['L', 5, 6] };
  tables.BDD.Taches = tables.BDD.id.map(id => tasksOf[id] || ['L']);
  return tables;
}
