import { Client, type Room } from 'colyseus.js';
import { COLORS, TOTAL_LAPS, neutralInput, stepKart, type Input, type Kart, type World } from '../shared/game';
import { TRACKS, getTrack, trackPoint } from '../shared/track';
import { configurationMarkup, TournamentControls, trackCards, trackFeatures, standingsTable, teamsTable } from './tournament-ui';
import { GameRenderer } from './renderer';
import { GameAudio } from './audio';
import { GarageUI } from './garage-ui';
import { CareerUI } from './career-ui';
import { showReplay } from './replay-view';
import { getTrackEvent } from '../shared/track-events';
import { CHARACTERS } from '../shared/characters';
import type { GhostData } from '../shared/progression';
import { KART_MODELS } from '../shared/kart-catalog';
import { MobileControls, mobileControlsMarkup } from './mobile-controls';
import './style.css';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const itemNames = { turbo: 'Turbo', tripleTurbo: 'Triple turbo', trap: 'Balise piège', projectile: 'Disque vert',
  seeker: 'Fusée rouge', leaderBolt: 'Comète bleue', star: 'Étoile d’énergie', shield: 'Bouclier', '': 'Objet mystère' };
const itemIcons = { turbo: '↗', tripleTurbo: '↗³', trap: '△', projectile: '➤', seeker: '⌖', leaderBolt: '☄', star: '★', shield: '◈', '': '?' };
const itemColors = { turbo: '#ffbe5c', tripleTurbo: '#ffc66d', trap: '#f3ac48', projectile: '#68dd91',
  seeker: '#ff737d', leaderBolt: '#74b8ff', star: '#ffe67c', shield: '#84e6ff', '': '#a2c8cd' };
const itemHints = { turbo: 'Une accélération franche', tripleTurbo: 'Une pression par accélération', trap: 'Pose une balise derrière vous',
  projectile: 'Lance un disque droit devant', seeker: 'Vise le pilote juste devant', leaderBolt: 'Poursuit le premier pilote',
  star: 'Invincible + turbo pendant 5,5 s', shield: 'Absorbe un impact pendant 8 s', '': 'Attrapez un cube sur la piste' };
const audio = new GameAudio();
let chosenColor = localStorage.getItem('lagon-color') ?? COLORS[0];
if (!COLORS.includes(chosenColor)) chosenColor = COLORS[0];
let chosenName = localStorage.getItem('lagon-name') ?? '';
let chosenTrack = getTrack(localStorage.getItem('lagon-track') ?? 'lagon').id;
const invitedCode = /^\/room\/([a-zA-Z0-9_-]+)\/?$/.exec(location.pathname)?.[1] ?? '';

el('app').innerHTML = `
  <div class="screen-wash" id="screen-wash"></div>
  <header class="topbar">
    <a class="brand" href="/" aria-label="Lagon Kart, accueil"><span class="brand-mark">L<span>↗</span></span><span>LAGON<span class="brand-light">KART</span></span></a>
    <span class="tournament-badge hidden" id="tournament-badge"></span>
    <div class="top-actions"><span class="connection" id="connection"><i></i> Prêt à rouler</span><button class="quiet compact hidden" id="leave-button">Quitter le salon</button></div>
  </header>
  <main class="menu" id="menu">
    <section class="home-panel" id="home-panel">
      <div class="eyebrow"><span></span> DU SOLEIL. DES VIRAGES. DES AMIS.</div>
      <h1>À VOUS<br>LA <span>PISTE.</span><svg viewBox="0 0 190 20" aria-hidden="true"><path d="M3 16Q95-7 184 10"/></svg></h1>
      <p class="intro">Les vacances passent à la vitesse supérieure.<br>Invitez vos amis, attachez vos casques.</p>
      <div class="profile-card">
        <div class="profile-heading"><span class="step-dot">01</span><span>VOTRE PILOTE</span><span class="tiny-tag">À VOTRE IMAGE</span></div>
        <label class="field-label" for="name-input">Pseudo</label>
        <div class="name-field"><span>◉</span><input id="name-input" maxlength="18" autocomplete="nickname" placeholder="Votre nom de pilote" value="${escape(chosenName)}" aria-label="Pseudo" /></div>
        <div class="color-row"><span>Couleur du kart</span><div class="swatches" id="swatches">${COLORS.map((color, i) => `<button class="swatch ${color === chosenColor ? 'selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="Couleur ${i + 1}" aria-pressed="${color === chosenColor}"></button>`).join('')}</div></div>
      </div>
      <button id="career-button" class="secondary wide">Championnats, classement et replays <span>♜</span></button>
      <button id="garage-button" class="secondary wide">Choisir mon kart et ses pièces <span>⚙</span></button>
      <button class="primary create-button" id="create-button"><span>Créer un salon</span><span class="button-arrow">↗</span></button>
      <div class="join-row"><input id="code-input" aria-label="Code du salon" maxlength="24" placeholder="CODE DU SALON" value="${escape(invitedCode)}" autocomplete="off" /><button id="join-button" class="secondary">Rejoindre <span>→</span></button></div>
      <button class="practice-button" id="practice-button"><span>⚑</span> Un tour pour s’échauffer <span class="practice-label">ENTRAÎNEMENT SOLO</span></button>
      <label class="ghost-option"><input id="ghost-toggle" type="checkbox"> Fantôme du meilleur temps en entraînement</label>
      <p class="home-note"><span>●</span> 2 à 8 pilotes · 3 tours · Dans votre navigateur</p>
    </section>
    <aside class="island-card" id="island-card"><span class="island-number" id="track-number">01</span><div><span class="eyebrow">VOTRE PROCHAINE ESCALE</span><h2 id="track-name">Île des Alizés</h2><p id="track-description"></p><div class="track-tags" id="track-tags"></div></div></aside>
    <aside class="home-circuit-picker" id="home-circuit-picker"><div class="eyebrow">${TRACKS.length} CIRCUITS. VOTRE TERRAIN DE JEU.</div><div class="track-card-grid" id="track-cards">${trackCards(chosenTrack)}</div><p>Une course ou un tournoi de 2 à 8 manches.<br>Composez votre programme dans le salon.</p></aside>
    <section class="lobby-panel hidden" id="lobby-panel"><div class="eyebrow">LE DÉPART APPROCHE</div><h2>Tout le monde<br>sur la grille.</h2><p class="muted" id="lobby-description">Partagez le lien, rassemblez votre équipe.</p><div class="room-share"><div><span>CODE DU SALON</span><strong id="room-code">—</strong></div><button class="secondary" id="copy-button">Copier le lien ↗</button></div><input class="share-url" id="share-url" aria-label="Lien d’invitation du salon" readonly />${configurationMarkup}<button id="lobby-garage-button" class="secondary wide">Mon kart et ses pièces ⚙</button><div class="players-heading"><span>PILOTES</span><span id="player-count">0 / 8</span></div><div id="player-list" class="player-list"></div><button class="secondary wide" id="ready-button">Je suis prêt</button><button class="primary wide" id="start-button">Lancer la course <span>→</span></button><p class="lobby-hint muted" id="lobby-hint"></p></section>
    <section class="results-panel hidden" id="results-panel"><div class="eyebrow">LE DRAPEAU EST TOMBÉ</div><div class="result-icon">⚑</div><h2 id="results-title">Bien joué,<br>les pilotes.</h2><p class="muted" id="results-subtitle">Même soleil, une nouvelle chance ?</p><div id="results-list" class="results-list"></div><div id="cup-standings" class="cup-standings hidden"></div><button class="primary wide hidden" id="next-race-button">Prochaine course <span>→</span></button><button class="primary wide" id="rematch-button">On remet ça <span>↻</span></button><p class="muted" id="results-hint"></p></section>
  </main>
  <section class="race-hud hidden" id="race-hud" aria-label="Informations de course"><div class="race-top"><div class="position-card"><strong id="position">1<span>er</span></strong><span id="field-size">SUR 1 PILOTE</span></div><div class="lap-card"><span>TOUR</span><strong id="lap">1 <em>/ 3</em></strong><span id="race-time">00:00.0</span></div></div><div class="leaderboard" id="leaderboard"></div><div class="item-card" id="item-card"><span class="item-icon" id="item-icon">?</span><div><small>VOTRE OBJET</small><strong id="item-name">Objet mystère</strong><span id="item-hint">Attrapez un cube sur la piste</span><small id="item-effect" class="hidden" aria-live="off"></small></div><kbd>E</kbd></div><div class="speed-card"><div><strong id="speed">0</strong><span>KM/H</span></div><div class="boost-meter"><i id="boost-fill"></i></div><span id="boost-label">GARDEZ LE CAP</span><div class="draft-meter"><i id="draft-fill"></i></div><small id="draft-label">ASPIRATION</small></div><div class="minimap-card"><canvas id="minimap" width="240" height="180" aria-label="Mini-carte du circuit"></canvas><span id="minimap-name">ÎLE DES ALIZÉS</span></div></section>
  <div id="event-banner" class="event-banner hidden" role="status"></div>
  <div class="countdown hidden" id="countdown"></div><div class="race-banner hidden" id="race-banner"></div>
  <footer class="bottom-bar"><div class="controls"><span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> <b>/ ZQSD / WASD</b></span><span><kbd>ESPACE</kbd> Drift</span><span><kbd>E</kbd> Objet</span><span><kbd>R</kbd> Replacer</span><span class="brake-help"><kbd>↓</kbd> Frein / recul</span></div><a class="credits-link" href="/credits.html" target="_blank" rel="noopener">Crédits</a><label class="volume" for="volume-input"><span aria-hidden="true">♫</span><input id="volume-input" type="range" min="0" max="100" value="${audio.level}" aria-label="Volume du jeu" /></label></footer>
  <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
  <div class="reconnect hidden" id="reconnect"><i></i><strong>On vous garde votre place.</strong><span>Connexion interrompue · tentative de reprise…</span></div>
  ${mobileControlsMarkup}
`;

let renderer: GameRenderer;
try { renderer = new GameRenderer(el<HTMLCanvasElement>('game')); }
catch (error) { el('menu').innerHTML = '<section class="lobby-panel"><h2>La piste attend<br>votre navigateur.</h2><p>Le rendu 3D n’a pas démarré. Activez l’accélération graphique, puis actualisez cette page avec un navigateur récent.</p></section>'; throw error; }

const client = new Client(window.location.origin.replace(/^http/, 'ws'));
let room: Room | null = null;
let world: World | null = null;
let predicted: Kart | null = null;
let pending: Input[] = [];
let sequence = 0;
let epoch = -1;
let connected = false;
let busy = false;
let leaving = false;
let reconnecting = false;
let connectionGeneration = 0;
let toastTimer = 0;
let autoPractice = false;
let uiTime = 0;
let lastLobbySignature = '';
let lastResultSignature = '';
let previousPhase = '';
let correction = { x: 0, z: 0 };
let fixedStep = 1 / 30;
let accumulator = 0;
const keys = new Set<string>();
let usePressed = false;
let resetPressed = false;
const mobileControls = new MobileControls(() => audio.activate());
type Snapshot = { world: World; serverTime: number; tick: number; simHz: number };
const snapshots: { at: number; world: World }[] = [];
let serverClockOffset = 0;
const garage = new GarageUI(choice => {
  renderer.setPreviewKart(chosenColor, choice.modelId, choice.characterId);
  if (room && world?.phase === 'lobby') room.send('profile', choice);
});
renderer.setPreviewKart(chosenColor, garage.value.modelId, garage.value.characterId);
const career = new CareerUI({
  profile: saved => garage.setLevel(saved.careerLevel), error: toast, replay: showReplay,
  championship: async id => {
    if (busy || room) return;
    audio.activate(); setBusy(true);
    try { await career.ensure(profile().name); const next = await client.create('race', { ...profile(), token: career.authToken, practice: true, trackId: chosenTrack }); attachRoom(next); next.send('configure', { championshipId: id }); }
    finally { setBusy(false); }
  },
  ranked: async id => { if (busy || room) return; audio.activate(); setBusy(true); try { attachRoom(await client.joinById(id, { ...profile(), token: career.authToken })); } finally { setBusy(false); } },
});
const tournamentControls = new TournamentControls((type, payload) => room?.send(type, payload));

function previewTrack(id: string) {
  const track = getTrack(id);
  chosenTrack = track.id;
  localStorage.setItem('lagon-track', chosenTrack);
  renderer.setPreviewTrack(chosenTrack);
  el('track-cards').innerHTML = trackCards(chosenTrack);
  el('track-name').textContent = track.name;
  el('track-number').textContent = String(TRACKS.findIndex(option => option.id === track.id) + 1).padStart(2, '0');
  el('track-description').textContent = track.description;
  el('track-tags').innerHTML = `<span>${escape(track.difficulty.toUpperCase())}</span><span>⚑ 3 TOURS</span>`;
  el('home-circuit-picker').dataset.theme = track.theme;
  document.body.dataset.theme = track.theme;
}
previewTrack(chosenTrack);

function toast(message: string) {
  el('toast').textContent = message; el('toast').classList.remove('hidden');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el('toast').classList.add('hidden'), 5000);
}
function connection(text: string, state: 'online' | 'offline' | 'pending') {
  el('connection').innerHTML = `<i></i>${escape(text)}`; el('connection').dataset.state = state;
}
function setBusy(value: boolean) {
  busy = value;
  for (const id of ['create-button', 'join-button', 'practice-button']) el<HTMLButtonElement>(id).disabled = value;
}
function profile() {
  chosenName = el<HTMLInputElement>('name-input').value.trim().slice(0, 18) || 'Pilote';
  localStorage.setItem('lagon-name', chosenName); localStorage.setItem('lagon-color', chosenColor);
  return { name: chosenName, color: chosenColor, ...garage.value };
}
function clearControls() { keys.clear(); usePressed = false; resetPressed = false; mobileControls.clear(); }
function resetPrediction() { pending = []; predicted = null; snapshots.length = 0; accumulator = 0; correction = { x: 0, z: 0 }; epoch = -1; sequence = 0; clearControls(); }
function saveSession() {
  if (room) sessionStorage.setItem('lagon-session', JSON.stringify({ token: room.reconnectionToken, roomId: room.roomId }));
}
function errorMessage(error: unknown) {
  const value = error as { message?: string; code?: number };
  const message = value?.message ?? String(error);
  if (/full|maxClients|locked/i.test(message)) return 'Ce salon est complet. Demandez un autre code à vos amis.';
  if (/not found|not exist|invalid room|expired|seat|4212|4214/i.test(message)) return 'Ce salon n’existe plus ou a expiré. Vérifiez le code ou créez-en un nouveau.';
  if (/fetch|network|connect|timeout|ECONN/i.test(message)) return 'Connexion au serveur impossible. Vérifiez votre connexion et que le jeu est démarré.';
  return message.length < 180 ? message : 'La connexion au salon a échoué. Réessayez dans un instant.';
}

function attachRoom(next: Room) {
  room = next; connected = true; reconnecting = false; leaving = false; resetPrediction();
  saveSession(); history.replaceState(null, '', `/room/${encodeURIComponent(next.roomId)}`);
  connection('En ligne', 'online'); el('reconnect').classList.add('hidden');
  el('leave-button').classList.remove('hidden');
  next.onMessage('snapshot', (snapshot: Snapshot) => {
    if (room !== next) return;
    const now = performance.now();
    const trackChanged = world?.trackId !== snapshot.world.trackId;
    if (trackChanged) resetPrediction();
    world = snapshot.world;
    fixedStep = 1 / Math.max(10, Math.min(60, snapshot.simHz || 30));
    const offset = now - snapshot.serverTime;
    serverClockOffset = snapshots.length ? Math.min(serverClockOffset, offset) : offset;
    snapshots.push({ at: snapshot.serverTime + serverClockOffset, world });
    while (snapshots.length > 40) snapshots.shift();
    const me = world.players.find(player => player.id === next.sessionId);
    if (me) {
      if (epoch !== me.epoch) { epoch = me.epoch; pending = []; sequence = Math.max(0, me.lastSeq + 1); correction = { x: 0, z: 0 }; accumulator = 0; }
      pending = pending.filter(input => input.epoch === epoch && input.seq > me.lastSeq).slice(-90);
      const previous = predicted;
      predicted = { ...me };
      if (world.phase === 'racing') for (const input of pending) stepKart(predicted, input, fixedStep);
      if (previous && world.phase === 'racing' && previous.epoch === epoch) {
        const dx = previous.x - predicted.x, dz = previous.z - predicted.z;
        if (Math.hypot(dx, dz) < 7) { correction.x += dx; correction.z += dz; } else correction = { x: 0, z: 0 };
      }
      if (autoPractice && world.phase === 'lobby') { autoPractice = false; next.send('ready', { ready: true }); next.send('start', {}); }
    }
    updateUI(now, true);
  });
  next.onMessage('notice', (notice: { message: string }) => toast(notice.message));
  next.onError((_code, message) => toast(message || 'Le serveur a signalé une erreur.'));
  next.onLeave((code) => {
    if (room !== next || leaving) return;
    connected = false; clearControls(); pending = []; accumulator = 0;
    if (code === 4000) { sessionStorage.removeItem('lagon-session'); returnHome(); toast('Le salon est fermé. Vous pouvez en créer un nouveau.'); return; }
    void reconnect(next.reconnectionToken);
  });
  setBusy(false);
}

async function connect(mode: 'create' | 'join' | 'practice') {
  if (busy) return;
  audio.activate(); setBusy(true); connection('Connexion…', 'pending');
  try {
    await career.ensure(profile().name);
    const options = { ...profile(), token: career.authToken }; autoPractice = mode === 'practice';
    const code = el<HTMLInputElement>('code-input').value.trim().replace(/^.*\/room\//, '').replace(/[/?#].*$/, '').toUpperCase();
    if (mode === 'join' && !code) throw new Error('Saisissez le code du salon partagé par vos amis.');
    renderer.setGhost(null);
    if (mode === 'practice' && el<HTMLInputElement>('ghost-toggle').checked) {
      const result = await fetch(`/api/ghost?track=${encodeURIComponent(chosenTrack)}&level=3`).then(response => response.json()) as { ghost?: GhostData | null };
      if (result.ghost) renderer.setGhost(result.ghost); else toast('Aucun fantôme enregistré pour ce circuit et ces événements.');
    }
    const next = mode === 'join' ? await client.joinById(code, options) : await client.create('race', { ...options, practice: mode === 'practice', trackId: chosenTrack });
    attachRoom(next);
  } catch (error) { autoPractice = false; toast(errorMessage(error)); connection('Hors ligne', 'offline'); setBusy(false); }
}

async function reconnect(token: string) {
  if (reconnecting) return;
  reconnecting = true; connected = false; clearControls(); pending = [];
  const generation = ++connectionGeneration;
  const deadline = performance.now() + 29_000;
  el('reconnect').classList.remove('hidden'); connection('Reconnexion…', 'pending');
  setBusy(true);
  let lastError: unknown;
  while (performance.now() < deadline && generation === connectionGeneration) {
    try { const resumed = await client.reconnect(token); if (generation !== connectionGeneration) { await resumed.leave(); return; } attachRoom(resumed); toast('Vous avez retrouvé votre place. Bonne course !'); return; }
    catch (error) {
      lastError = error;
      const detail = error as { message?: string; code?: number };
      // A reload can race the old socket close. Code 4214 also means the
      // still-valid token has not reached allowReconnection yet: keep trying.
      if (detail.code === 4212 || /disposed|introuvable|not found|not exist|invalid reconnection token format/i.test(String(detail.message))) break;
      await new Promise(resolve => window.setTimeout(resolve, 900));
    }
  }
  if (generation !== connectionGeneration) return;
  sessionStorage.removeItem('lagon-session'); returnHome(); toast(lastError ? errorMessage(lastError) : 'Le délai de reconnexion est dépassé. Rejoignez à nouveau votre salon.');
}

function returnHome() {
  world = null; room = null; connected = false; reconnecting = false; resetPrediction(); setBusy(false);
  connection('Prêt à rouler', 'offline'); el('reconnect').classList.add('hidden'); el('leave-button').classList.add('hidden');
  history.replaceState(null, '', '/'); updateUI(performance.now(), true);
}

el('garage-button').addEventListener('click', () => { if (!busy) void career.ensure(profile().name).then(() => garage.open()).catch(error => toast(error.message)); });
el('career-button').addEventListener('click', () => { if (!busy) void career.open(profile().name); });
el('lobby-garage-button').addEventListener('click', () => { if (connected && world?.phase === 'lobby') garage.open(); });
el('create-button').addEventListener('click', () => void connect('create'));
el('join-button').addEventListener('click', () => void connect('join'));
el('practice-button').addEventListener('click', () => void connect('practice'));
el('track-cards').addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-track]') : null;
  if (button && !busy) previewTrack(button.dataset.track!);
});
el('code-input').addEventListener('keydown', event => { if (event.key === 'Enter') void connect('join'); });
el('swatches').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]');
  if (!button) return; chosenColor = button.dataset.color!;
  renderer.setPreviewKart(chosenColor, garage.value.modelId, garage.value.characterId);
  document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(swatch => { const selected = swatch.dataset.color === chosenColor; swatch.classList.toggle('selected', selected); swatch.setAttribute('aria-pressed', String(selected)); });
});
el('ready-button').addEventListener('click', () => { audio.activate(); room?.send('ready', { ready: !world?.players.find(p => p.id === room?.sessionId)?.ready }); });
el('start-button').addEventListener('click', () => { audio.activate(); room?.send('start', {}); });
el('rematch-button').addEventListener('click', () => room?.send('rematch', {}));
el('next-race-button').addEventListener('click', () => room?.send('nextRace', {}));
el('leave-button').addEventListener('click', async () => {
  leaving = true; connectionGeneration++; sessionStorage.removeItem('lagon-session');
  const previousRoom = room; returnHome(); await previousRoom?.leave(true);
});
el('copy-button').addEventListener('click', async () => {
  const input = el<HTMLInputElement>('share-url');
  try { await navigator.clipboard.writeText(input.value); toast('Lien copié. À vos amis de jouer !'); }
  catch { input.focus(); input.select(); toast('Le lien est sélectionné. Copiez-le avec Ctrl+C.'); }
});
el('volume-input').addEventListener('input', event => { audio.activate(); audio.setVolume(Number((event.target as HTMLInputElement).value)); });

const driveKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'Space', 'KeyE', 'KeyR']);
function press(code: string) { if (!keys.has(code)) { if (code === 'KeyE') usePressed = true; if (code === 'KeyR') resetPressed = true; } keys.add(code); }
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select')) return;
  if (driveKeys.has(event.code) && world && world.phase !== 'lobby') { event.preventDefault(); press(event.code); audio.activate(); }
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { clearControls(); mobileControls.clear(true); if (connected && room && predicted) room.send('input', neutralInput(sequence++, epoch)); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearControls(); mobileControls.clear(true); } });

function makeInput(): Input {
  const input = neutralInput(sequence++, epoch);
  if (!world || !['racing', 'countdown'].includes(world.phase) || !predicted || predicted.finished || predicted.spectator || document.hidden) return input;
  const touch = mobileControls.sample(world.phase === 'racing');
  const backward = ['ArrowDown', 'KeyS'].some(key => keys.has(key)) || touch.backward;
  const forward = !backward && (['ArrowUp', 'KeyW', 'KeyZ'].some(key => keys.has(key)) || touch.forward);
  if (world.phase === 'countdown') { input.throttle = forward ? 1 : 0; input.brake = backward; return input; }
  input.throttle = forward ? 1 : backward && predicted.speed < 0.8 ? -1 : 0;
  input.brake = backward && predicted.speed >= 0.8;
  // A kart faces +Z: positive Y rotation turns left in the chase-camera frame.
  input.steer = Math.max(-1, Math.min(1, touch.steer + Number(keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ')) - Number(keys.has('ArrowRight') || keys.has('KeyD'))));
  input.drift = keys.has('Space') || touch.drift; input.use = usePressed || touch.use; input.reset = resetPressed || touch.reset;
  usePressed = false; resetPressed = false;
  return input;
}

function renderPlayers(now: number): Kart[] {
  if (!world) return [];
  const target = now - 110;
  let a = snapshots[0], b = snapshots[snapshots.length - 1];
  for (let i = 0; i < snapshots.length - 1; i++) if (snapshots[i].at <= target && snapshots[i + 1].at >= target) { a = snapshots[i]; b = snapshots[i + 1]; break; }
  if (a && target >= b.at) a = b;
  const t = a && b && b.at > a.at ? Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at))) : 1;
  return world.players.map(kart => {
    if (kart.id === room?.sessionId && predicted && connected) return { ...predicted, x: predicted.x + correction.x, z: predicted.z + correction.z };
    const before = a?.world.players.find(p => p.id === kart.id), after = b?.world.players.find(p => p.id === kart.id);
    if (!before || !after) return kart;
    return { ...after, elevation: before.elevation + (after.elevation - before.elevation) * t, x: before.x + (after.x - before.x) * t, z: before.z + (after.z - before.z) * t, angle: before.angle + Math.atan2(Math.sin(after.angle - before.angle), Math.cos(after.angle - before.angle)) * t };
  });
}

function formatTime(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`; }
function show(id: string, visible: boolean) { el(id).classList.toggle('hidden', !visible); }
function updateUI(now: number, force = false) {
  if (!force && now - uiTime < 100) return;
  uiTime = now;
  const phase = world?.phase ?? 'home';
  const racing = phase === 'racing' || phase === 'countdown';
  show('menu', !racing); show('home-panel', phase === 'home'); show('island-card', phase === 'home');
  show('home-circuit-picker', phase === 'home');
  show('lobby-panel', phase === 'lobby'); show('results-panel', phase === 'finished'); show('race-hud', racing);
  show('screen-wash', !racing);
  document.body.classList.toggle('in-race', racing);
  const me = world?.players.find(p => p.id === room?.sessionId);
  mobileControls.setDriving(racing && connected && !!me && !me.spectator && !me.finished);
  const players = [...(world?.players ?? [])].sort((a, b) => a.rank - b.rank);
  const competitors = players.filter(p => !p.spectator);
  const tracked = me?.spectator ? world?.players.find(p => !p.spectator && !p.abandoned) : me;
  const displayedTrack = getTrack(world?.trackId ?? chosenTrack);
  document.body.dataset.theme = displayedTrack.theme;
  show('tournament-badge', !!world);
  if (world && room) {
    const host = world.hostId === room.sessionId;
    const cup = world.tournament;
    el('tournament-badge').textContent = `${cup.mode === 'tournament' ? `COURSE ${cup.raceIndex + 1}/${cup.raceCount} · ` : ''}${displayedTrack.name}`;
    el('minimap-name').textContent = displayedTrack.name.toUpperCase();
    el('room-code').textContent = room.roomId;
    el<HTMLInputElement>('share-url').value = `${location.origin}/room/${encodeURIComponent(room.roomId)}`;
    el('player-count').textContent = `${players.length} PILOTE${players.length > 1 ? 'S' : ''}`;
    if (phase === 'lobby') {
      tournamentControls.update(world, room.sessionId);
      const signature = players.map(p => `${p.id}:${p.name}:${p.color}:${p.team}:${p.cpu}:${p.modelId}:${p.characterId}:${JSON.stringify(p.build)}:${p.ready}:${p.connected}:${p.spectator}`).join('|') + world.hostId;
      if (signature !== lastLobbySignature) {
        el('player-list').innerHTML = players.map((p, index) => `<div class="player-row"><span class="player-avatar" style="--kart:${escape(p.color)}">${String(index + 1).padStart(2, '0')}</span><div><strong>${escape(p.name)}${p.id === room?.sessionId ? '<small> VOUS</small>' : ''}</strong><span>${p.id === world?.hostId ? 'Créateur du salon · ' : ''}${escape(KART_MODELS.find(model => model.id === p.modelId)?.name ?? 'Zsky')} · ${escape(CHARACTERS.find(character => character.id === p.characterId)?.name ?? 'Pilote')}${world?.teamMode ? ` · ${p.team === 0 ? 'Corail' : 'Lagon'}` : ''}${p.cpu ? ' · CPU' : ''}</span></div><span class="ready-tag ${p.ready ? 'is-ready' : ''}">${!p.connected ? 'Reconnexion' : p.ready ? '✓ Prêt' : 'En préparation'}</span></div>`).join('');
        lastLobbySignature = signature;
      }
      el('ready-button').textContent = me?.ready ? '✓ Prêt · Annuler' : 'Je suis prêt';
      el('ready-button').classList.toggle('is-ready', !!me?.ready);
      show('start-button', host);
      const connectedCompetitors = competitors.filter(p => p.connected);
      el<HTMLButtonElement>('start-button').disabled = !connected || connectedCompetitors.length < (world.practice ? 1 : 2) || connectedCompetitors.some(p => !p.ready);
      el('lobby-description').textContent = `${displayedTrack.name} · ${trackFeatures[displayedTrack.id]}`;
      el('lobby-hint').textContent = host ? 'Chaque pilote doit être prêt pour lancer la course.' : 'Le créateur lancera la course quand tout le monde sera prêt.';
    }
    if (phase === 'finished') {
      const signature = JSON.stringify([players.map(p => [p.id, p.rank, p.finishTime, p.finished, p.spectator, p.name]), cup]);
      if (signature !== lastResultSignature) {
        el('results-list').innerHTML = competitors.map(p => `<div class="result-row ${p.id === room?.sessionId ? 'is-you' : ''}"><strong>${p.rank}<small>${p.rank === 1 ? 'er' : 'e'}</small></strong><span class="result-swatch" style="background:${escape(p.color)}"></span><span>${escape(p.name)}</span><b>${p.finished ? formatTime(p.finishTime) : p.abandoned ? 'Abandon' : 'Non classé'}</b></div>`).join('');
        lastResultSignature = signature;
        if (cup.mode === 'tournament') el('cup-standings').innerHTML = (world.teamMode ? teamsTable(cup.standings) : '') + standingsTable(cup.standings, room.sessionId, cup.completed);
      }
      const intermediate = cup.mode === 'tournament' && !cup.completed;
      show('cup-standings', cup.mode === 'tournament');
      show('next-race-button', host && intermediate);
      show('rematch-button', host && !intermediate);
      el('results-title').innerHTML = cup.mode === 'tournament' ? cup.completed ? 'Le podium<br>du tournoi.' : 'Une escale<br>de plus.' : 'Bien joué,<br>les pilotes.';
      el('results-subtitle').textContent = cup.mode === 'tournament' ? cup.completed ? `${cup.standings[0]?.name ?? 'Le premier'} remporte le tournoi · ${cup.raceCount} courses` : `Course ${cup.raceIndex + 1}/${cup.raceCount} · ${displayedTrack.name}` : displayedTrack.name;
      if (intermediate) el('next-race-button').textContent = `Prochaine course · ${getTrack(cup.schedule[cup.raceIndex + 1]).name} →`;
      el('rematch-button').innerHTML = cup.mode === 'tournament' ? 'Rejouer le tournoi <span>↻</span>' : 'On remet ça <span>↻</span>';
      el('results-hint').textContent = intermediate ? host ? 'Les points sont conservés. Tout le monde se prépare dans le prochain salon.' : 'Le créateur passera à la prochaine course.' : host ? 'Une revanche ramène tous les pilotes au salon.' : 'Le créateur du salon peut proposer une revanche.';
    }
    if (racing) {
      const speed = tracked?.id === room.sessionId ? predicted?.speed ?? tracked?.speed ?? 0 : tracked?.speed ?? 0;
      const rank = tracked?.rank ?? 1;
      el('position').innerHTML = `${rank}<span>${rank === 1 ? 'er' : 'e'}</span>`;
      el('field-size').textContent = `SUR ${competitors.length} PILOTE${competitors.length > 1 ? 'S' : ''}`;
      el('lap').innerHTML = `${Math.min(TOTAL_LAPS, (tracked?.lap ?? 0) + 1)} <em>/ ${TOTAL_LAPS}</em>`;
      el('race-time').textContent = formatTime(world.raceTime);
      el('speed').textContent = String(Math.round(Math.abs(speed) * 3.6));
      const item = me?.item ?? '';
      mobileControls.setItem(itemIcons[item], itemNames[item], itemColors[item], !!item);
      el('item-icon').textContent = itemIcons[item]; el('item-icon').style.color = itemColors[item];
      el('item-name').textContent = itemNames[item] + (item === 'tripleTurbo' ? ` · ${me?.itemCharges ?? 3}/3` : '');
      el('item-hint').textContent = item ? `E · ${itemHints[item]}` : itemHints[''];
      el('item-card').classList.toggle('has-item', !!item);
      const effects = [me && me.invincible > 0 ? `★ Invincible ${me.invincible.toFixed(1)} s` : '',
        me && me.shield > 0 ? `◈ Bouclier ${me.shield.toFixed(1)} s` : ''].filter(Boolean);
      el('item-effect').textContent = effects.join(' · '); show('item-effect', effects.length > 0);
      el('boost-fill').style.width = `${Math.min(100, (predicted?.driftCharge ?? 0) / 2 * 100)}%`;
      const surfaceLabels = { road: 'GARDEZ LE CAP', offroad: 'HORS PISTE', boost: 'BANDE TURBO', ice: 'GLACE · ANTICIPEZ', mud: 'BOUE · RALENTISSEMENT' };
      el('boost-label').textContent = (predicted?.boost ?? 0) > 0 ? 'TURBO !' : (predicted?.driftCharge ?? 0) >= 0.65 ? 'RELÂCHEZ : MINI-TURBO' : (predicted?.driftCharge ?? 0) > 0 ? 'DRIFT EN CHARGE' : surfaceLabels[predicted?.surface ?? 'road'];
      el('draft-fill').style.width = `${Math.min(100, (me?.draftCharge ?? 0) * 100)}%`;
      el('draft-label').textContent = (me?.draftCharge ?? 0) > 0 ? 'ASPIRATION EN CHARGE' : (me?.draftCooldown ?? 0) > 0 ? 'ASPIRATION · TURBO' : 'SUIVEZ UN KART : ASPIRATION';
      el('leaderboard').innerHTML = competitors.map(p => `<div class="${p.id === room?.sessionId ? 'is-you' : ''}"><b>${p.rank}</b><i style="background:${escape(p.color)}"></i><span>${escape(p.name)}</span>${p.finished ? '<small>⚑</small>' : !p.connected ? '<small>…</small>' : cup.mode === 'tournament' ? `<small>${cup.standings.find(entry => entry.id === p.id)?.points ?? 0} pts</small>` : ''}</div>`).join('');
    }
  }
  const count = world?.phase === 'countdown' ? Math.max(1, Math.ceil(world.countdown)) : world?.phase === 'racing' && world.raceTime < 0.8 ? 0 : -1;
  show('countdown', count >= 0); if (count >= 0) el('countdown').textContent = count === 0 ? 'GO !' : String(count);
  const launchHint = world?.phase === 'countdown' ? me?.launchFault ? 'Trop tôt ! Vous prendrez un départ normal.' : world.countdown <= 1 ? 'MAINTENANT ! Maintenez l’accélérateur pour le départ turbo.' : mobileControls.available ? 'AUTO démarre au GO · Pour un turbo, touchez ↑ à 1.' : 'Départ turbo : attendez la dernière seconde pour accélérer.' : '';
  const banner = me?.spectator && racing ? 'Vous arrivez en cours de route · À vous la prochaine course !' : me?.finished && racing ? `Arrivée ! ${me.rank}${me.rank === 1 ? 'er' : 'e'} · Les autres pilotes terminent…` : launchHint;
  show('race-banner', !!banner); el('race-banner').textContent = banner;
  audio.update(predicted?.speed ?? 0, connected && phase === 'racing' && !me?.finished && !me?.spectator, me?.item ?? '', (predicted?.boost ?? 0) > 0, count, world?.trackId, connected && phase === 'racing', tracked?.lap ?? 0);
  show('event-banner', phase === 'racing' && (world?.eventLevel ?? 0) > 0);
  if (world) { const event = getTrackEvent(world.trackId, world.eventStage, world.eventLevel); el('event-banner').textContent = event.title; el('event-banner').title = event.description; }
  if (phase !== previousPhase && phase === 'finished') void career.refresh().catch(() => {});
  if (phase !== previousPhase) { if (!(previousPhase === 'countdown' && phase === 'racing')) clearControls(); previousPhase = phase; }
}

const mapCanvas = el<HTMLCanvasElement>('minimap');
const mapContext = mapCanvas.getContext('2d')!;
let mapTrackId = '', mapScale = 1, mapCenterX = 0, mapCenterZ = 0;
const mapX = (x: number) => 120 + (x - mapCenterX) * mapScale;
const mapZ = (z: number) => 90 + (z - mapCenterZ) * mapScale;
function drawMap(players: Kart[]) {
  const track = getTrack(world?.trackId ?? chosenTrack);
  const event = getTrackEvent(track.id, world?.eventStage ?? 0, world?.eventLevel ?? 0);
  const mapKey = track.id + ':' + event.level;
  if (mapKey !== mapTrackId) {
    mapTrackId = mapKey;
    // Include even the future shortcut, so the map never jumps or crops a route
    // when a shared event opens it during the race.
    const points = [...track.points, ...event.branches.flatMap(route => route.points)];
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
    mapCenterX = (minX + maxX) / 2; mapCenterZ = (minZ + maxZ) / 2;
    mapScale = Math.min(204 / (maxX - minX), 136 / (maxZ - minZ));
  }
  mapContext.clearRect(0, 0, 240, 180);
  mapContext.beginPath(); track.points.forEach((point, i) => i ? mapContext.lineTo(mapX(point.x), mapZ(point.z)) : mapContext.moveTo(mapX(point.x), mapZ(point.z))); mapContext.closePath();
  mapContext.lineJoin = 'round'; mapContext.lineCap = 'round'; mapContext.strokeStyle = 'rgba(240,247,233,.3)'; mapContext.lineWidth = Math.max(4, track.width * mapScale); mapContext.stroke();
  mapContext.strokeStyle = '#eff4dc'; mapContext.lineWidth = 1.7; mapContext.stroke();
  for (const zone of track.zones) {
    mapContext.beginPath();
    for (let i = 0; i <= 8; i++) { const p = trackPoint(zone.start + (zone.end - zone.start) * i / 8, track.id); if (i) mapContext.lineTo(mapX(p.x), mapZ(p.z)); else mapContext.moveTo(mapX(p.x), mapZ(p.z)); }
    mapContext.lineWidth = 4; mapContext.strokeStyle = zone.kind === 'boost' ? '#ffd477' : zone.kind === 'ice' ? '#80ecf4' : '#b07d62'; mapContext.stroke();
  }
  for (const route of event.branches) {
    const color = route.kind === 'detour' ? '#ffe28c' : route.kind === 'shortcut' ? '#83f6b7' : '#a4e6ff';
    mapContext.beginPath();
    route.points.forEach((point, index) => index ? mapContext.lineTo(mapX(point.x), mapZ(point.z)) : mapContext.moveTo(mapX(point.x), mapZ(point.z)));
    mapContext.strokeStyle = route.open ? color : 'rgba(164,181,181,.65)';
    mapContext.lineWidth = route.open ? Math.max(2.8, route.width * mapScale) : 1.5;
    mapContext.setLineDash(route.open ? [] : [3, 4]); mapContext.stroke(); mapContext.setLineDash([]);
    if (!route.open) {
      const midpoint = route.points[Math.floor(route.points.length / 2)]!;
      mapContext.font = 'bold 9px system-ui'; mapContext.fillStyle = '#d3ded7'; mapContext.fillText('T3', mapX(midpoint.x) + 4, mapZ(midpoint.z) - 4);
    }
  }
  for (const blocker of event.blockers) {
    const acrossX = Math.cos(blocker.angle) * blocker.halfWidth, acrossZ = -Math.sin(blocker.angle) * blocker.halfWidth;
    mapContext.beginPath(); mapContext.moveTo(mapX(blocker.x - acrossX), mapZ(blocker.z - acrossZ));
    mapContext.lineTo(mapX(blocker.x + acrossX), mapZ(blocker.z + acrossZ));
    mapContext.strokeStyle = '#ff7773'; mapContext.lineWidth = 4; mapContext.stroke();
    mapContext.font = 'bold 12px system-ui'; mapContext.fillStyle = '#ffb4a2'; mapContext.fillText('×', mapX(blocker.x) - 4, mapZ(blocker.z) + 4);
  }
  if (event.branches.length) {
    mapContext.font = '8px system-ui'; mapContext.fillStyle = '#ffe28c'; mapContext.fillText('Déviation', 15, 174);
    mapContext.fillStyle = '#83f6b7'; mapContext.fillText('Raccourci', 81, 174);
    mapContext.fillStyle = '#a4e6ff'; mapContext.fillText('Turbo', 149, 174);
  }
  mapCanvas.setAttribute('aria-label', 'Carte du circuit ' + track.name + '. ' + event.title);
  for (const p of players) {
    if (p.spectator || p.abandoned) continue;
    mapContext.beginPath(); mapContext.arc(mapX(p.x), mapZ(p.z), p.id === room?.sessionId ? 5 : 3.5, 0, Math.PI * 2); mapContext.fillStyle = p.color; mapContext.fill();
    mapContext.lineWidth = p.id === room?.sessionId ? 2 : 1; mapContext.strokeStyle = '#fffbed'; mapContext.stroke();
  }
}

let previousFrame = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - previousFrame) / 1000); previousFrame = now;
  if (connected && room && world && predicted) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= fixedStep && steps < 3) {
      const input = makeInput();
      room.send('input', input);
      if (world.phase === 'racing') { stepKart(predicted, input, fixedStep); pending.push(input); if (pending.length > 90) pending.shift(); }
      accumulator -= fixedStep; steps++;
    }
    if (steps >= 3) accumulator = 0;
  } else accumulator = 0;
  const decay = Math.exp(-dt * 11); correction.x *= decay; correction.z *= decay;
  const players = renderPlayers(now);
  renderer.render(world, players, room?.sessionId ?? '', dt, now);
  if (world?.phase === 'racing' || world?.phase === 'countdown') drawMap(players);
  updateUI(now); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Refresh keeps the session per tab; the server rotates tokens on successful resume.
try {
  const saved = JSON.parse(sessionStorage.getItem('lagon-session') ?? 'null') as { token: string; roomId: string } | null;
  if (saved?.token && saved.roomId === invitedCode) void reconnect(saved.token);
  else if (invitedCode) toast('Vous êtes invité ! Choisissez votre pseudo, puis rejoignez le salon.');
} catch { sessionStorage.removeItem('lagon-session'); }

// Read-only copies support browser diagnostics without exposing gameplay mutations.
Object.defineProperty(window, '__lagonDebug', { value: Object.freeze({
  get world() { return world ? structuredClone(world) : null; },
  get sessionId() { return room?.sessionId ?? null; },
  get predicted() { return predicted ? structuredClone(predicted) : null; },
  get fps() { return renderer.fps; },
  get quality() { return renderer.quality; },
  get view() { return structuredClone(renderer.viewDiagnostics); },
  get sceneryAssets() { return structuredClone(renderer.sceneryAssets); },
  get kartAssets() { return structuredClone(renderer.kartAssets); },
  get music() { return structuredClone(audio.musicStatus); },
  get connected() { return connected; },
  get pendingInputs() { return pending.length; }
}) });
