import { getTrack, TRACK_LAYOUT_REVISION } from '../shared/track';
import type { ReplayData, ReplayFrame } from '../shared/progression';

export function replayPosition(frames: ReplayFrame[], timeMs: number) {
  if (!frames.length) return null;
  let low = 0, high = frames.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (frames[mid][0] <= timeMs) low = mid; else high = mid - 1; }
  const a = frames[low], b = frames[Math.min(frames.length - 1, low + 1)];
  const t = Math.max(0, Math.min(1, (timeMs - a[0]) / Math.max(1, b[0] - a[0])));
  const angle = a[3] / 1000, turn = Math.atan2(Math.sin((b[3] - a[3]) / 1000), Math.cos((b[3] - a[3]) / 1000));
  return { x: (a[1] + (b[1] - a[1]) * t) / 100, z: (a[2] + (b[2] - a[2]) * t) / 100, angle: angle + turn * t };
}
export function showReplay(replay: ReplayData) {
  const dialog = document.createElement('dialog'); dialog.className = 'garage-dialog replay-dialog';
  dialog.innerHTML = '<div class="garage-heading"><h2>Revoir la course</h2><button class="secondary" data-close>Fermer ✕</button></div><p data-title class="garage-hint"></p><canvas width="720" height="450" aria-label="Trajectoires enregistrées de la course"></canvas><div class="replay-controls"><button class="secondary" data-play>Pause</button><input type="range" min="0" step="100" value="0" aria-label="Position dans le replay"><output></output></div><p class="garage-hint">Vue de dessus des trajectoires enregistrées par le serveur. Faites glisser le curseur pour revoir un passage.</p>';
  document.body.append(dialog);
  const track = getTrack(replay.trackId), canvas = dialog.querySelector('canvas')!, context = canvas.getContext('2d')!;
  const currentLayout = (replay.trackRevision ?? 1) === TRACK_LAYOUT_REVISION;
  dialog.querySelector('[data-title]')!.textContent = `${track.name} · ${replay.drivers.map(driver => driver.name).join(' / ')}${currentLayout ? '' : ' · Ancien tracé : trajectoires archivées, sans fond de circuit'}`;
  const slider = dialog.querySelector('input')!; slider.max = String(replay.durationMs);
  let time = 0, last = performance.now(), playing = true, frame = 0;
  const bounds = currentLayout ? track.points : replay.drivers.flatMap(driver => driver.frames.map(frame => ({ x: frame[1] / 100, z: frame[2] / 100 })));
  const minX = Math.min(...bounds.map(p => p.x)) - 45, maxX = Math.max(...bounds.map(p => p.x)) + 45;
  const minZ = Math.min(...bounds.map(p => p.z)) - 45, maxZ = Math.max(...bounds.map(p => p.z)) + 45;
  const scale = Math.min(660 / (maxX - minX), 390 / (maxZ - minZ));
  const map = (x: number, z: number) => [360 + (x - (minX + maxX) / 2) * scale, 225 + (z - (minZ + maxZ) / 2) * scale];
  const draw = (now: number) => {
    if (playing) time = Math.min(replay.durationMs, time + Math.min(now - last, 250)); last = now;
    context.fillStyle = '#e3ecd7'; context.fillRect(0, 0, 720, 450);
    if (currentLayout) {
      context.beginPath(); track.points.forEach((p, index) => { const [x, y] = map(p.x, p.z); if (index) context.lineTo(x, y); else context.moveTo(x, y); }); context.closePath();
      context.strokeStyle = '#73887b'; context.lineWidth = track.width * scale; context.stroke();
    }
    for (const driver of replay.drivers) {
      context.beginPath(); driver.frames.filter((_, i) => i % 3 === 0).forEach((p, index) => { const [x, y] = map(p[1] / 100, p[2] / 100); if (index) context.lineTo(x, y); else context.moveTo(x, y); });
      context.globalAlpha = .25; context.strokeStyle = driver.color; context.lineWidth = 2; context.stroke(); context.globalAlpha = 1;
      const position = replayPosition(driver.frames, time); if (!position) continue;
      const [x, y] = map(position.x, position.z); context.fillStyle = driver.color; context.strokeStyle = '#183c43'; context.lineWidth = 2;
      context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill(); context.stroke(); context.fillStyle = '#183c43'; context.font = '12px sans-serif'; context.fillText(driver.name, x + 9, y - 8);
    }
    slider.value = String(time); dialog.querySelector('output')!.textContent = `${(time / 1000).toFixed(1)} / ${(replay.durationMs / 1000).toFixed(1)} s`;
    frame = requestAnimationFrame(draw);
  };
  slider.addEventListener('input', () => { time = Number(slider.value); });
  dialog.querySelector('[data-play]')!.addEventListener('click', event => { playing = !playing; if (playing && time === replay.durationMs) time = 0; (event.target as HTMLElement).textContent = playing ? 'Pause' : 'Lire ▶'; });
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { cancelAnimationFrame(frame); dialog.remove(); }); dialog.showModal(); frame = requestAnimationFrame(draw);
}
