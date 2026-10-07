#!/usr/bin/env node
// Maintenance hors jeu : aucun mot de passe, jeton ou contenu de sauvegarde n'est affiché.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, mkdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), action = args.shift() ?? 'help';
const options = new Map();
while (args.length) {
  const name = args.shift(), value = args.shift();
  if (!['--path', '--volume', '--image'].includes(name) || !value) throw new Error('Options : --path DOSSIER, --volume NOM, --image IMAGE');
  options.set(name, value);
}
async function docker(...args) { return (await exec('docker', args, { cwd: root, maxBuffer: 4 * 1024 * 1024 })).stdout.trim(); }
async function canonical(path) { return await realpath(path).catch(() => resolve(path)); }
async function samePath(left, right) {
  if (await canonical(left) === await canonical(right)) return true;
  try {
    // DrvFS preserves the spelling passed to realpath, but both aliases share the same inode.
    const [a, b] = await Promise.all([stat(left), stat(right)]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch { return false; }
}
async function rejectSymlinks(path) {
  let parent = parse(path).root;
  for (const part of path.slice(parent.length).split(sep)) {
    parent = resolve(parent, part);
    let info;
    try { info = await lstat(parent); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    if (info.isSymbolicLink()) throw new Error('Utilisez un dossier de données sans lien symbolique dans son chemin.');
  }
}
async function dataPath() {
  const config = JSON.parse(await docker('compose', 'config', '--format', 'json'));
  const path = resolve(root, options.get('--path') ?? config.services.app.volumes.find(volume => volume.target === '/app/data').source);
  await rejectSymlinks(path);
  const forbidden = ['/', root, dirname(root), resolve(process.env.HOME ?? '/'), resolve(root, 'node_modules')];
  if ((await Promise.all(forbidden.map(entry => samePath(path, entry)))).some(Boolean))
    throw new Error('Choisissez un dossier dédié aux données du jeu.');
  await mkdir(path, { recursive: true, mode: 0o700 });
  // WSL may canonicalise only the letter casing of C:\Users / Desktop; that is not a symlink.
  return await canonical(path);
}
async function assertStopped(source) {
  const active = await docker('ps', '-q', '--filter', `volume=${source}`);
  if (active) throw new Error('Sauvegarde utilisée par un conteneur en cours : arrêter app avant cette opération.');
  if (isAbsolute(source)) {
    const ids = (await docker('ps', '-q')).split(/\s+/).filter(Boolean);
    if (ids.length) {
      const mounts = (await docker('inspect', ...ids, '--format', '{{json .Mounts}}')).split('\n').flatMap(line => JSON.parse(line));
      for (const mount of mounts) if (mount.Type === 'bind' && await samePath(mount.Source, source))
        throw new Error('Sauvegarde utilisée par un conteneur en cours : arrêter app avant cette opération.');
    }
  }
}
const image = options.get('--image') ?? process.env.PLAYER_DATA_IMAGE ?? 'lagon-kart-app:latest';
const volume = options.get('--volume') ?? 'lagon-kart_player-data';
const ownership = `
  function own(path) {
    const info = fs.lstatSync(path);
    if (info.isSymbolicLink()) throw new Error('Lien symbolique inattendu dans les sauvegardes');
    fs.chownSync(path, 1000, 1000);
    fs.chmodSync(path, info.isDirectory() ? 0o700 : 0o600);
    if (info.isDirectory()) for (const name of fs.readdirSync(path)) own(path + '/' + name);
  }
`;
const manifest = `
  function manifest(root, rel = '') {
    const records = [];
    for (const name of fs.readdirSync(root + '/' + rel).sort()) {
      const path = rel ? rel + '/' + name : name, full = root + '/' + path;
      const info = fs.lstatSync(full);
      if (info.isSymbolicLink()) throw new Error('Lien symbolique refusé dans les sauvegardes');
      if (info.isDirectory()) records.push([path, 'directory'], ...manifest(root, path));
      else if (info.isFile()) records.push([path, info.size, crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')]);
      else throw new Error('Type de fichier non pris en charge');
    }
    return records;
  }
`;
async function worker(path, script, extraMounts = []) {
  return await docker('run', '--rm', '--network', 'none', '--user', '0:0', '--entrypoint', 'node',
    '--mount', `type=bind,source=${path},target=/target`, ...extraMounts, image, '-e', script);
}
try {
  if (action === 'help') {
    console.log('node scripts/player-data.mjs init|migrate|backup|reset [--path DOSSIER] [--volume ANCIEN_VOLUME] [--image IMAGE]');
  } else if (action === 'init') {
    const path = await dataPath();
    await assertStopped(path);
    await worker(path, `const fs = require('node:fs'); ${ownership}
      fs.mkdirSync('/target/players/replays', { recursive: true, mode: 0o700 }); own('/target');`);
    console.log(`Dossier prêt : ${path} (UID/GID du jeu : 1000:1000).`);
  } else if (action === 'migrate') {
    const path = await dataPath();
    // inspect prevents Docker from silently creating an empty, misspelled source volume.
    await docker('volume', 'inspect', volume, '--format', '{{.Name}}');
    await assertStopped(volume); await assertStopped(path);
    const report = await worker(path, `
      const fs = require('node:fs'), crypto = require('node:crypto'); ${manifest} ${ownership}
      const before = manifest('/source'), current = manifest('/target');
      if (current.length && JSON.stringify(current) !== JSON.stringify(before))
        throw new Error('Destination non vide et différente : aucun fichier écrasé.');
      const alreadyCopied = JSON.stringify(current) === JSON.stringify(before);
      if (!alreadyCopied) {
        for (const name of fs.readdirSync('/source')) fs.cpSync('/source/' + name, '/target/' + name,
          { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true });
      }
      const after = manifest('/target'), stableSource = manifest('/source');
      if (JSON.stringify(before) !== JSON.stringify(stableSource) || JSON.stringify(before) !== JSON.stringify(after))
        throw new Error('Vérification différente : conserver le volume original et ne pas démarrer le jeu.');
      own('/target');
      const files = before.filter(entry => entry.length === 3);
      console.log(JSON.stringify({ verified: true, alreadyCopied, files: files.length,
        bytes: files.reduce((sum, entry) => sum + entry[1], 0), sourceUntouched: true }));
    `, ['--mount', `type=volume,source=${volume},target=/source,readonly`]);
    console.log(`Migration vérifiée vers ${path} : ${report}`);
    console.log(`Volume original conservé : ${volume}.`);
  } else if (action === 'backup') {
    const path = await dataPath(); await assertStopped(path);
    const destination = resolve(root, 'backups'); await mkdir(destination, { recursive: true, mode: 0o700 });
    const filename = `players-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
    await docker('run', '--rm', '--network', 'none', '--user', '0:0', '--entrypoint', 'node',
      '--mount', `type=bind,source=${path},target=/source,readonly`,
      '--mount', `type=bind,source=${destination},target=/backup`, image, '-e', `
        const fs = require('node:fs'), cp = require('node:child_process');
        process.umask(0o077); const path = '/backup/' + process.argv[1];
        cp.execFileSync('tar', ['-czf', path, '-C', '/source', '.']);
        fs.chmodSync(path, 0o600); fs.chownSync(path, 1000, 1000);
      `, filename);
    console.log(`Sauvegarde complète : ${resolve(destination, filename)}.`);
  } else if (action === 'reset') {
    if (options.has('--path')) throw new Error('Pour reset, configurer PLAYER_DATA_PATH dans .env : pas de --path ponctuel.');
    const path = await dataPath();
    const id = await docker('compose', 'ps', '-aq', 'app');
    if (id) {
      const mount = JSON.parse(await docker('inspect', id, '--format', '{{json .Mounts}}')).find(mount => mount.Destination === '/app/data');
      if (mount?.Type !== 'bind' || !await samePath(mount.Source, path))
        throw new Error('Le jeu actuel utilise un autre stockage : migrer ses données avant de le recréer (docs/ACCOUNTS_STORAGE.md).');
    }
    // Keep tunnel process/URL and all files; rebuild only the game and initialise its bind mount.
    await docker('compose', 'build', 'app', 'data-init');
    await docker('compose', 'stop', 'app');
    await docker('compose', 'up', '-d', '--force-recreate', 'data-init', 'app');
    console.log('Jeu reconstruit et recréé. Données conservées ; tunnel inchangé.');
  } else throw new Error('Action inconnue. Utiliser init, migrate, backup ou reset.');
} catch (error) {
  console.error(`Échec : ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
