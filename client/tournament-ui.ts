import { TRACKS, getTrack, type TrackDefinition } from '../shared/track';
import type { World } from '../shared/game';
import type { TournamentEntry } from '../shared/tournament';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const trackFeatures: Record<string, string> = {
  lagon: 'Courbes douces · Premiers turbos', canyon: 'Virages serrés · Boue',
  glacier: 'Glissades · Trajectoires larges', neon: 'Chicanes · Pistes turbo',
};
export function trackOutline(track: TrackDefinition) {
  const minX = Math.min(...track.points.map(point => point.x)), maxX = Math.max(...track.points.map(point => point.x));
  const minZ = Math.min(...track.points.map(point => point.z)), maxZ = Math.max(...track.points.map(point => point.z));
  const scale = Math.min(104 / (maxX - minX), 51 / (maxZ - minZ));
  const path = track.points.filter((_, index) => index % 3 === 0).map((point, index) => `${index ? 'L' : 'M'}${(60 + (point.x - (minX + maxX) / 2) * scale).toFixed(1)},${(32 + (point.z - (minZ + maxZ) / 2) * scale).toFixed(1)}`).join(' ') + 'Z';
  return `<svg viewBox="0 0 120 64" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>`;
}
export function trackCards(selected: string) {
  return TRACKS.map((track, index) => `<button class="track-card ${track.id === selected ? 'selected' : ''}" data-track="${track.id}" aria-pressed="${track.id === selected}" style="--track-accent:${track.palette.accent}"><span class="track-card-number">0${index + 1}</span>${trackOutline(track)}<strong>${escape(track.name)}</strong><small>${escape(track.difficulty)}</small></button>`).join('');
}
export function standingsTable(entries: TournamentEntry[], me: string, final = false) {
  return `<div class="standings-heading"><span>${final ? 'CLASSEMENT FINAL DU TOURNOI' : 'CLASSEMENT DU TOURNOI'}</span><span>POINTS</span></div>${entries.map(entry => `<div class="standing-row ${entry.id === me ? 'is-you' : ''}"><b>${entry.rank}</b><i style="background:${escape(entry.color)}"></i><span>${escape(entry.name)}${entry.id === me ? '<small> VOUS</small>' : ''}</span><strong>${entry.points}<small> pts</small></strong></div>`).join('')}<p class="score-note" title="À égalité : victoires, courses terminées, puis temps cumulé.">15 · 12 · 10 · 8 · 6 · 4 · 2 · 1 points à l’arrivée. Abandon : 0.</p>`;
}

export const configurationMarkup = `<details id="race-configuration" class="race-configuration" open><summary>Choisir l’aventure <span id="configuration-summary">Une course</span></summary><div id="configuration-controls"></div><p id="configuration-note" class="configuration-note"></p></details><div id="schedule-list" class="schedule-list" aria-label="Programme des courses"></div><div id="lobby-cup-score" class="lobby-cup-score hidden"></div>`;

type Draft = { mode: 'single' | 'tournament'; selection: 'manual' | 'random'; trackId: string; raceCount: number; schedule: string[]; trackPool: string[] };
export class TournamentControls {
  private draft: Draft = { mode: 'single', selection: 'manual', trackId: 'lagon', raceCount: 4, schedule: TRACKS.map(track => track.id), trackPool: TRACKS.map(track => track.id) };
  private signature = '';
  private allowed = false;
  constructor(private readonly send: (type: string, payload: unknown) => void) {
    element('configuration-controls').addEventListener('change', event => {
      const input = event.target;
      if (!this.allowed || !(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
      if (input.id === 'mode-select') this.draft.mode = input.value as Draft['mode'];
      else if (input.id === 'selection-select') this.draft.selection = input.value as Draft['selection'];
      else if (input.id === 'track-select') this.draft.trackId = input.value;
      else if (input.id === 'count-select') {
        this.draft.raceCount = Number(input.value);
        while (this.draft.schedule.length < this.draft.raceCount) this.draft.schedule.push(TRACKS[this.draft.schedule.length % TRACKS.length].id);
      } else if (input.dataset.scheduleIndex !== undefined) this.draft.schedule[Number(input.dataset.scheduleIndex)] = input.value;
      else if (input instanceof HTMLInputElement && input.dataset.poolTrack) {
        this.draft.trackPool = input.checked ? [...this.draft.trackPool, input.dataset.poolTrack] : this.draft.trackPool.filter(id => id !== input.dataset.poolTrack);
      }
      this.render();
    });
    element('configuration-controls').addEventListener('click', event => {
      if (!(event.target instanceof Element) || !event.target.closest('#configure-button') || !this.allowed) return;
      const draft = this.draft;
      if (draft.mode === 'single') this.send('configure', { mode: 'single', selection: 'manual', trackId: draft.trackId, raceCount: 1 });
      else if (draft.selection === 'manual') this.send('configure', { mode: 'tournament', selection: 'manual', raceCount: draft.raceCount, schedule: draft.schedule.slice(0, draft.raceCount) });
      else this.send('configure', { mode: 'tournament', selection: 'random', raceCount: draft.raceCount, trackPool: draft.trackPool });
    });
  }

  update(world: World, sessionId: string) {
    const cup = world.tournament;
    const editable = world.phase === 'lobby' && cup.raceIndex === 0 && cup.rounds.length === 0;
    const allowed = editable && world.hostId === sessionId;
    const signature = JSON.stringify([cup.mode, cup.selection, cup.trackPool, cup.schedule, cup.raceCount, world.trackId]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.draft = { mode: cup.mode, selection: cup.selection, trackId: world.trackId,
        raceCount: cup.mode === 'tournament' ? cup.raceCount : 4,
        schedule: cup.mode === 'tournament' ? [...cup.schedule] : TRACKS.map(track => track.id),
        trackPool: cup.mode === 'tournament' ? [...cup.trackPool] : TRACKS.map(track => track.id) };
      this.allowed = allowed; this.render();
    } else if (allowed !== this.allowed) { this.allowed = allowed; this.render(); }
    element('configuration-summary').textContent = cup.mode === 'single' ? 'Une course' : `${cup.raceCount} courses · ${cup.selection === 'random' ? 'Au hasard' : 'À la carte'}`;
    element('configuration-controls').classList.toggle('hidden', !allowed);
    element('configuration-note').textContent = !editable ? 'Le programme reste le même jusqu’à la fin du tournoi.' : allowed ? 'Appliquez votre choix avant que les pilotes se déclarent prêts.' : 'Le créateur du salon choisit le circuit et la formule.';
    element('schedule-list').innerHTML = cup.schedule.map((id, index) => `<div class="schedule-stop ${index === cup.raceIndex ? 'current' : ''} ${index < cup.raceIndex ? 'done' : ''}" style="--track-accent:${getTrack(id).palette.accent}"><b>${index < cup.raceIndex ? '✓' : index + 1}</b><span>${escape(getTrack(id).name)}</span>${index === cup.raceIndex ? '<small>À SUIVRE</small>' : ''}</div>`).join('');
    const score = element('lobby-cup-score');
    score.classList.toggle('hidden', cup.mode !== 'tournament' || cup.rounds.length === 0);
    if (cup.mode === 'tournament' && cup.rounds.length > 0) score.innerHTML = standingsTable(cup.standings, sessionId);
  }

  private render() {
    const draft = this.draft;
    const options = (selected: string) => TRACKS.map(track => `<option value="${track.id}" ${selected === track.id ? 'selected' : ''}>${escape(track.name)}</option>`).join('');
    const select = (id: string, label: string, values: string) => `<label class="config-field" for="${id}"><span>${label}</span><select id="${id}">${values}</select></label>`;
    let controls = select('mode-select', 'La formule', `<option value="single" ${draft.mode === 'single' ? 'selected' : ''}>Une course</option><option value="tournament" ${draft.mode === 'tournament' ? 'selected' : ''}>Un tournoi</option>`);
    if (draft.mode === 'single') controls += select('track-select', 'Le circuit', options(draft.trackId));
    else {
      controls += `<div class="config-columns">${select('count-select', 'Nombre de courses', Array.from({ length: 7 }, (_, i) => `<option value="${i + 2}" ${draft.raceCount === i + 2 ? 'selected' : ''}>${i + 2} courses</option>`).join(''))}${select('selection-select', 'Choix des circuits', `<option value="manual" ${draft.selection === 'manual' ? 'selected' : ''}>À la carte</option><option value="random" ${draft.selection === 'random' ? 'selected' : ''}>Au hasard</option>`)}</div>`;
      if (draft.selection === 'manual') controls += `<div class="schedule-editor">${Array.from({ length: draft.raceCount }, (_, i) => `<label class="config-field"><span>Course ${i + 1}</span><select data-schedule-index="${i}" aria-label="Circuit de la course ${i + 1}">${options(draft.schedule[i])}</select></label>`).join('')}</div>`;
      else controls += `<fieldset class="pool-editor"><legend>Les circuits possibles</legend>${TRACKS.map(track => `<label><input type="checkbox" data-pool-track="${track.id}" ${draft.trackPool.includes(track.id) ? 'checked' : ''}/><span>${escape(track.name)}</span></label>`).join('')}<p>Le programme sera tiré au sort pour tout le salon.</p></fieldset>`;
    }
    controls += `<button id="configure-button" class="secondary wide" ${draft.mode === 'tournament' && draft.selection === 'random' && draft.trackPool.length === 0 ? 'disabled' : ''}>${draft.mode === 'tournament' && draft.selection === 'random' ? 'Tirer le programme au sort' : 'Appliquer ce choix'} <span>✓</span></button>`;
    element('configuration-controls').innerHTML = controls;
  }
}
