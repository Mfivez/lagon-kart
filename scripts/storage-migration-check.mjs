import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile), suffix = randomUUID().slice(0, 8);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'lagon-migration-'));
const source = `lagon-migration-${suffix}`, container = `${source}-active`, target = join(temporary, 'data');
const image = process.env.PERSISTENCE_IMAGE ?? 'lagon-kart-app:latest', checks = [];
let success = false, failure = '', containerCreated = false;
let backupPath, aliasDirectory;
async function docker(...args) { return (await exec('docker', args, { cwd: root })).stdout.trim(); }
const migration = () => exec(process.execPath, ['scripts/player-data.mjs', 'migrate', '--path', target, '--volume', source, '--image', image], { cwd: root });
try {
  await docker('volume', 'create', source);
  await docker('run', '--rm', '--network', 'none', '--user', '0:0', '--entrypoint', 'node',
    '--mount', `type=volume,source=${source},target=/source`, image, '-e', `
      const fs=require('node:fs'); fs.mkdirSync('/source/players/replays', {recursive:true});
      fs.writeFileSync('/source/players/players.json', '{"fixture":"private-registry"}');
      fs.writeFileSync('/source/players/replays/example.json', '{"fixture":"private-replay"}');
    `);
  await docker('run', '-d', '--name', container, '--network', 'none', '--entrypoint', 'node',
    '--mount', `type=volume,source=${source},target=/source`, image, '-e', 'setInterval(() => {}, 1000)'); containerCreated = true;
  await assert.rejects(migration, /conteneur en cours/);
  checks.push('Migration refusée pendant l’utilisation du volume source');
  await docker('rm', '-f', container); containerCreated = false;
  const result = await migration(); assert.match(result.stdout, /"verified":true/); assert.match(result.stdout, /"files":2/);
  assert.ok(!result.stdout.includes('private-registry')); assert.ok(!result.stdout.includes('private-replay'));
  assert.equal(await readFile(join(target, 'players/players.json'), 'utf8'), '{"fixture":"private-registry"}');
  assert.equal(await readFile(join(target, 'players/replays/example.json'), 'utf8'), '{"fixture":"private-replay"}');
  checks.push('Copie vérifiée de deux fichiers imbriqués, sans contenu privé dans les journaux');
  assert.match((await migration()).stdout, /"alreadyCopied":true/);
  checks.push('Seconde migration identique acceptée sans réécriture');
  const backup = await exec(process.execPath, ['scripts/player-data.mjs', 'backup', '--path', target, '--image', image], { cwd: root });
  backupPath = backup.stdout.match(/Sauvegarde complète : (.+)\.\n/)?.[1]; assert.ok(backupPath);
  const restored = await exec('tar', ['-xOf', backupPath, './players/players.json'], { cwd: root });
  assert.equal(restored.stdout, '{"fixture":"private-registry"}');
  const replay = await exec('tar', ['-xOf', backupPath, './players/replays/example.json'], { cwd: root });
  assert.equal(replay.stdout, '{"fixture":"private-replay"}');
  checks.push('Archive complète lisible : registre et replay restaurables à l’identique');
  await writeFile(join(target, 'players/players.json'), '{"fixture":"new-local-data"}');
  await assert.rejects(migration, /Destination non vide et différente/);
  assert.equal(await readFile(join(target, 'players/players.json'), 'utf8'), '{"fixture":"new-local-data"}');
  assert.equal(await docker('volume', 'inspect', source, '--format', '{{.Name}}'), source);
  checks.push('Destination divergente préservée ; volume source original toujours présent');
  const link = join(temporary, 'linked-data'); await symlink(target, link);
  await assert.rejects(() => exec(process.execPath, ['scripts/player-data.mjs', 'migrate', '--path', link,
    '--volume', source, '--image', image], { cwd: root }), /sans lien symbolique/);
  checks.push('Vrai lien symbolique refusé sans toucher à sa destination');
  if (/^\/mnt\/[a-z]\//.test(root) && /\/users\//i.test(root) && /\/desktop\//i.test(root)) {
    const lowerRoot = root.replace(/\/users\//i, '/users/').replace(/\/desktop\//i, '/desktop/');
    const upperRoot = root.replace(/\/users\//i, '/Users/').replace(/\/desktop\//i, '/Desktop/');
    aliasDirectory = join(root, 'backups', `storage-alias-${suffix}`);
    for (const alias of [lowerRoot, upperRoot]) await exec(process.execPath,
      ['scripts/player-data.mjs', 'init', '--path', join(alias, 'backups', `storage-alias-${suffix}`), '--image', image], { cwd: root });
    await docker('run', '-d', '--name', container, '--network', 'none', '--entrypoint', 'node',
      '--mount', `type=bind,source=${join(lowerRoot, 'backups', `storage-alias-${suffix}`)},target=/active`, image,
      '-e', 'setInterval(() => {}, 1000)'); containerCreated = true;
    await assert.rejects(() => exec(process.execPath, ['scripts/player-data.mjs', 'backup', '--path',
      join(upperRoot, 'backups', `storage-alias-${suffix}`), '--image', image], { cwd: root }), /conteneur en cours/);
    await docker('rm', '-f', container); containerCreated = false;
    await assert.rejects(() => exec(process.execPath, ['scripts/player-data.mjs', 'init', '--path', upperRoot, '--image', image],
      { cwd: root }), /dossier dédié/);
    checks.push('Alias de casse WSL Users/users et Desktop/desktop acceptés pour le même dossier');
    checks.push('Source bind active et racine du projet refusées même sous un autre alias WSL');
  }
  success = true; checks.forEach(check => console.log(`✓ ${check}`));
} catch (error) { failure = error instanceof Error ? error.message : String(error); throw error;
} finally {
  if (containerCreated) await docker('rm', '-f', container).catch(() => {});
  await docker('volume', 'rm', source).catch(() => {});
  if (backupPath) await rm(backupPath, { force: true });
  if (aliasDirectory) await rm(aliasDirectory, { recursive: true, force: true });
  await rm(temporary, { recursive: true, force: true });
  await writeFile(join(root, 'docs/storage-migration-check.json'), JSON.stringify({ success, failure, checks,
    userVolumeTouched: false, publicAppTouched: false, temporaryDataRemoved: true }, null, 2));
}
