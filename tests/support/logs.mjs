// Les journaux que les tests passent au code (le `log` que reçoivent les modules du widget).

// Un journal qui ne dit rien.
export const quiet = { info() {}, warn() {}, error() {} };

// Un journal qui garde ce qu'on lui écrit : { lines, log }. `log` a trois niveaux (info, warn, error), `lines` rend les lignes de
// chaque niveau, leurs arguments joints en une chaîne.
export function logged() {
  const lines = { info: [], warn: [], error: [] };
  const log = Object.fromEntries(Object.keys(lines).map(level => [level, (...args) => lines[level].push(args.map(String).join(' '))]));
  return { lines, log };
}
