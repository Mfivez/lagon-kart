import { CHAMPIONSHIPS, type PlayerProfile, type ReplaySummary, type ReplayData, type LeaderboardEntry } from '../shared/progression';
import { getTrack } from '../shared/track';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
type Actions = { championship(id: string): Promise<void>; ranked(roomId: string): Promise<void>; profile(profile: PlayerProfile): void; replay(replay: ReplayData): void; error(message: string): void };
export class CareerUI {
  private token = localStorage.getItem('lagon-player-token') ?? '';
  private profile?: PlayerProfile;
  private pending?: Promise<PlayerProfile>;
  private readonly dialog = document.createElement('dialog');
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private waiting = false;
  private status = '';
  private leaderboard: LeaderboardEntry[] = [];
  private replays: ReplaySummary[] = [];
  constructor(private readonly actions: Actions) {
    this.dialog.id = 'career-dialog'; this.dialog.className = 'garage-dialog'; document.body.append(this.dialog);
    this.dialog.addEventListener('close', () => { if (this.waiting) void this.cancelQueue(); });
    this.dialog.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
      if (!button) return;
      if (button.id === 'career-close') this.dialog.close();
      else if (button.dataset.cup) { const id = button.dataset.cup; this.dialog.close(); void this.actions.championship(id).catch(error => this.actions.error(String(error.message ?? error))); }
      else if (button.id === 'ranked-join') void this.joinQueue();
      else if (button.id === 'ranked-cancel') void this.cancelQueue();
      else if (button.dataset.replay) {
        void this.request<{ replay: ReplayData }>(`/api/replays/${button.dataset.replay}`).then(result => { this.dialog.close(); this.actions.replay(result.replay); }).catch(error => this.actions.error(error.message));
      }
    });
  }
  get authToken() { return this.token; }
  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(path, { method, headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? 'Service indisponible.'), { status: response.status });
    return result as T;
  }
  async ensure(name: string): Promise<PlayerProfile> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      if (this.token) {
        try { this.profile = (await this.request<{ profile: PlayerProfile }>('/api/me')).profile; }
        catch (error) { if ((error as { status?: number }).status !== 401) throw error; this.token = ''; localStorage.removeItem('lagon-player-token'); }
      }
      if (!this.token) {
        const created = await this.request<{ token: string; profile: PlayerProfile }>('/api/profile', 'POST', { name });
        this.token = created.token; this.profile = created.profile; localStorage.setItem('lagon-player-token', this.token);
      }
      if (this.profile!.name !== name) this.profile = (await this.request<{ profile: PlayerProfile }>('/api/me', 'PATCH', { name })).profile;
      this.actions.profile(this.profile!); return this.profile!;
    })();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  async refresh() { if (this.token) { this.profile = (await this.request<{ profile: PlayerProfile }>('/api/me')).profile; this.actions.profile(this.profile); } }
  async open(name: string) {
    try {
      await this.ensure(name);
      const [board, recordings] = await Promise.all([this.request<{ entries: LeaderboardEntry[] }>('/api/leaderboard'), this.request<{ replays: ReplaySummary[] }>('/api/replays')]);
      this.leaderboard = board.entries; this.replays = recordings.replays; this.render(); this.dialog.showModal();
    } catch (error) { this.actions.error(error instanceof Error ? error.message : String(error)); }
  }
  private async joinQueue() {
    if (this.waiting) return;
    this.waiting = true; const generation = ++this.generation; this.status = 'Recherche de pilotes de votre niveau…'; this.render();
    try { await this.request('/api/ranked', 'POST'); await this.pollQueue(generation); }
    catch (error) { this.waiting = false; this.status = error instanceof Error ? error.message : String(error); this.render(); }
  }
  private async pollQueue(generation: number): Promise<void> {
    if (!this.waiting || generation !== this.generation) return;
    const result = await this.request<{ state: string; roomId?: string; waitSeconds?: number }>('/api/ranked');
    if (!this.waiting || generation !== this.generation) return;
    if (result.state === 'matched' && result.roomId) {
      this.waiting = false; this.dialog.close(); await this.actions.ranked(result.roomId); return;
    }
    if (result.state === 'idle') { this.waiting = false; this.status = 'La recherche a expiré. Vous pouvez la relancer.'; this.render(); return; }
    this.status = `Recherche en cours · ${result.waitSeconds ?? 0} s · au moins deux pilotes sont nécessaires.`; this.render();
    this.timer = setTimeout(() => void this.pollQueue(generation).catch(error => { this.waiting = false; this.status = error.message; this.render(); }), 2500);
  }
  private async cancelQueue() { ++this.generation; this.waiting = false; clearTimeout(this.timer); this.status = ''; this.render(); try { await this.request('/api/ranked', 'DELETE'); } catch { /* Queue expires without its heartbeat. */ } }
  private render() {
    const profile = this.profile;
    if (!profile) return;
    this.dialog.innerHTML = `<div class="garage-heading"><div><small>VOTRE PROGRESSION · NIVEAU ${profile.careerLevel}</small><h2>À vous les coupes</h2></div><button id="career-close" class="secondary">Fermer ✕</button></div>
      <p class="garage-hint">${escape(profile.name)} · ${profile.stats.races} courses · ${profile.stats.wins} victoires · ${profile.xp} XP. Terminez toutes les manches d’une coupe sur le podium final pour débloquer la suite. Votre progression est sauvegardée sur ce serveur et retrouvée avec ce navigateur.</p>
      <div class="career-cups">${CHAMPIONSHIPS.map(cup => { const locked = cup.unlockLevel > profile.careerLevel, done = profile.completedChampionships.includes(cup.id); return `<button class="career-cup" data-cup="${cup.id}" ${locked || this.waiting ? 'disabled' : ''}><strong>${done ? '✓ ' : locked ? '🔒 ' : ''}${cup.name}</strong><span>${cup.description}</span><small>${cup.tracks.length} courses · niveau ${cup.unlockLevel} · ${cup.introduction.join(' / ')}</small></button>`; }).join('')}</div>
      <h3>Course classée · ${profile.season}</h3><p class="garage-hint">${profile.rank} · ${profile.mmr} MMR · ${profile.ranked.races} courses classées. Bronze → Silver → Gold → Platinum → Diamond → Master. Deux courses par rencontre, avec des pilotes proches de votre classement. Les saisons changent chaque trimestre.</p>
      <button id="${this.waiting ? 'ranked-cancel' : 'ranked-join'}" class="primary wide">${this.waiting ? 'Annuler la recherche' : 'Trouver une rencontre classée'}</button><p class="garage-hint" role="status">${escape(this.status)}</p>
      <details><summary>Classement des joueurs du serveur</summary><ol class="career-board">${this.leaderboard.map(entry => `<li>${escape(entry.name)} <b>${entry.rank} · ${entry.mmr}</b></li>`).join('') || '<li>Les premières courses classées feront apparaître le classement.</li>'}</ol></details>
      <details><summary>Mes replays</summary><div class="career-replays">${this.replays.map(replay => `<button class="secondary wide" data-replay="${replay.id}">${escape(getTrack(replay.trackId).name)} · ${new Date(replay.createdAt).toLocaleDateString('fr-BE')} · Voir ▶</button>`).join('') || '<p class="garage-hint">Terminez une course pour revoir vos trajectoires.</p>'}</div></details>`;
  }
}
