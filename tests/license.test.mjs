import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ===== La licence du dépôt (GNU GPL version 3 ou ultérieure, choisie par Antoine le 19 octobre 2026) et la politique de
// sécurité : sans licence, personne n'a le droit de reprendre le code. =====

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// L'empreinte du texte officiel de la GPL v3 (gpl-3.0.txt de la Free Software Foundation).
const GPL_3_SHA256 = '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986';

test('LICENSE est le texte officiel de la GNU GPL version 3, inchangé', () => {
  const text = fs.readFileSync(path.join(ROOT, 'LICENSE'));
  assert.match(text.toString('utf8'), /^\s*GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.equal(createHash('sha256').update(text).digest('hex'), GPL_3_SHA256);
});

test('le README déclare la licence et renvoie vers LICENSE, et la documentation ne dit plus que le dépôt n\'en a pas', () => {
  const readme = read('README.md');
  assert.match(readme, /## Licence\n/);
  assert.match(readme, /licence publique générale GNU version 3, ou toute version ultérieure/);
  assert.match(readme, /`GPL-3\.0-or-later`/);
  assert.match(readme, /\]\(LICENSE\)/);
  const maintenance = read('docs/maintenance.md');
  assert.doesNotMatch(maintenance, /n'en déclare aucune|Sans licence|Ajouter une licence/);
  assert.match(maintenance, /\]\(\.\.\/LICENSE\)/);
});

test('SECURITY.md dit où signaler un problème de sécurité, sans issue publique ni adresse personnelle', () => {
  const policy = read('SECURITY.md');
  assert.match(policy, /## Signaler un problème de sécurité/);
  assert.match(policy, /N'ouvrez pas d'\*issue\* publique/);
  assert.match(policy, /\]\(docs\/securite\.md\)/);
  assert.doesNotMatch(policy, /[\w.+-]+@[\w-]+\.[\w.-]+/, 'aucune adresse e-mail');
});
