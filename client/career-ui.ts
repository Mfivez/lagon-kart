import { CHAMPIONSHIPS, type PlayerProfile, type ReplaySummary, type ReplayData, type LeaderboardEntry } from '../shared/progression';
import { getTrack } from '../shared/track';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
type Actions = { championship(id: string): Promise<void>; ranked(roomId: string): Promise<void>; profile(profile: PlayerProfile): void; replay(replay: ReplayData): void; error(message: string): void; canQueue?(): boolean; prepareRanked?(): Promise<unknown> };
export interface RankedViewState { profile?: PlayerProfile; loading: boolean; state: 'idle' | 'loading' | 'searching' | 'matched' | 'cancelling' | 'error'; status: string }
export class CareerUI {
  private token = localStorage.getItem('lagon-player-token') ?? '';
  private profile?: PlayerProfile;
  private pending?: Promise<PlayerProfile>;
  private restorePending?: Promise<PlayerProfile | undefined>;
  private refreshSequence = 0;
  private restored = false;
  private readonly dialog = document.createElement('dialog');
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private waiting = false;
  private status = '';
  private queueState: RankedViewState['state'] = 'idle';
  private queueStart?: Promise<unknown>;
  private cancelling?: Promise<void>;
  private possiblyQueued = false;
  private listeners = new Set<(state: RankedViewState) => void>();
  private leaderboard: LeaderboardEntry[] = [];
  private replays: ReplaySummary[] = [];
  constructor(private readonly actions: Actions) {
    this.dialog.id = 'career-dialog'; this.dialog.className = 'garage-dialog'; document.body.append(this.dialog);
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
  get currentProfile() { return this.profile; }
  get isSearching() { return this.waiting || this.queueState === 'matched' || this.queueState === 'cancelling'; }
  get rankedState(): RankedViewState { return { profile: this.profile, loading: !this.restored && this.queueState !== 'error' || !!this.restorePending || !!this.pending, state: this.queueState, status: this.status }; }
  subscribe(listener: (state: RankedViewState) => void) { this.listeners.add(listener); listener(this.rankedState); return () => this.listeners.delete(listener); }
  private notify() { for (const listener of this.listeners) listener(this.rankedState); }
  private async request<T>(path: string, method = 'GET', body?: unknown, timeoutMs = 20000): Promise<T> {
    const response = await fetch(path, { method, signal: AbortSignal.timeout(timeoutMs), headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? 'Service indisponible.'), { status: response.status });
    return result as T;
  }
  async restore(): Promise<PlayerProfile | undefined> {
    if (this.restored) return this.profile;
    if (this.restorePending) return this.restorePending;
    this.restorePending = (async () => {
      if (this.token) {
        try { this.profile = (await this.request<{ profile: PlayerProfile }>('/api/me')).profile; this.actions.profile(this.profile); }
        catch (error) {
          if ((error as { status?: number }).status !== 401) { this.queueState = 'error'; this.status = 'Profil indisponible. Réessayez la connexion.'; throw error; }
          this.token = ''; this.profile = undefined; localStorage.removeItem('lagon-player-token');
        }
      }
      this.restored = true; return this.profile;
    })();
    this.notify();
    try { return await this.restorePending; } finally { this.restorePending = undefined; this.notify(); }
  }
  async ensure(name: string, rename = false): Promise<PlayerProfile> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      await this.restore();
      if (!this.token) {
        const created = await this.request<{ token: string; profile: PlayerProfile }>('/api/profile', 'POST', { name });
        this.token = created.token; this.profile = created.profile; localStorage.setItem('lagon-player-token', this.token);
      }
      // An account restored on another device owns its saved display name.
      // Only an explicit edit may replace it with the local input value.
      if (this.profile!.name !== name && (!this.profile!.username || rename)) this.profile = (await this.request<{ profile: PlayerProfile }>('/api/me', 'PATCH', { name })).profile;
      this.actions.profile(this.profile!); return this.profile!;
    })();
    this.notify();
    try { return await this.pending; } finally { this.pending = undefined; this.notify(); }
  }
  private async prepareIdentityChange() {
    await this.restore(); if (this.pending) await this.pending;
    if (this.isSearching || this.possiblyQueued || this.cancelling) await this.cancelQueue();
    ++this.generation; clearTimeout(this.timer); this.waiting = false; this.status = ''; this.queueState = 'idle';
    this.dialog.close(); this.leaderboard = []; this.replays = [];
  }
  async account(mode: 'register' | 'login', username: string, password: string): Promise<PlayerProfile> {
    await this.prepareIdentityChange();
    const result = await this.request<{ token: string; profile: PlayerProfile }>(`/api/account/${mode}`, 'POST', { username, password });
    this.token = result.token; this.profile = result.profile; this.restored = true; this.possiblyQueued = false;
    localStorage.setItem('lagon-player-token', this.token); this.actions.profile(result.profile); this.notify(); return result.profile;
  }
  async logout(): Promise<void> {
    await this.prepareIdentityChange();
    if (this.token) await this.request('/api/account/logout', 'POST');
    this.token = ''; this.profile = undefined; this.restored = true; this.possiblyQueued = false; localStorage.removeItem('lagon-player-token'); this.notify();
  }
  async refresh(options: { minimumRaces?: number } = {}) {
    const token = this.token;
    if (!token) return;
    // A finished snapshot can precede the durable race result. Keep this small
    // retry window alive when the pilot leaves that room before its save signal.
    // Normal profile refreshes still issue one request only.
    const delays = options.minimumRaces === undefined ? [0] : [0, 250, 500, 1000, 2000, 4000];
    const deadline = Date.now() + (options.minimumRaces === undefined ? 20000 : 8000);
    for (const delay of delays) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (this.token !== token || Date.now() >= deadline) return;
      if (delay && this.profile && this.profile.stats.races >= options.minimumRaces!) return;
      const sequence = ++this.refreshSequence;
      let result: { profile: PlayerProfile };
      try { result = await this.request<{ profile: PlayerProfile }>('/api/me', 'GET', undefined, Math.max(1, deadline - Date.now())); }
      catch (error) {
        if (options.minimumRaces === undefined || delay === delays.at(-1) || Date.now() >= deadline) throw error;
        continue;
      }
      if (this.token !== token) return;
      // A slow response started before the save notification must not undo the
      // more recent server profile already displayed by another refresh.
      if (sequence === this.refreshSequence) {
        this.profile = result.profile; this.actions.profile(this.profile); this.notify();
      }
      if (options.minimumRaces === undefined || result.profile.stats.races >= options.minimumRaces) return;
    }
  }
  async open(name: string, rename = false, canShow: () => boolean = () => true) {
    try {
      await this.ensure(name, rename);
      const [board, recordings] = await Promise.all([this.request<{ entries: LeaderboardEntry[] }>('/api/leaderboard'), this.request<{ replays: ReplaySummary[] }>('/api/replays')]);
      if (!canShow()) return;
      this.leaderboard = board.entries; this.replays = recordings.replays; this.render(); this.dialog.showModal();
    } catch (error) { this.actions.error(error instanceof Error ? error.message : String(error)); }
  }
  async joinQueue() {
    if (this.cancelling) await this.cancelling;
    if (this.possiblyQueued && !this.isSearching) { await this.cancelQueue(); if (this.possiblyQueued) return; }
    if (this.isSearching || this.actions.canQueue?.() === false) return;
    this.waiting = true; const generation = ++this.generation; this.queueState = 'loading'; this.status = 'Préparation de votre profil…'; this.render();
    try {
      await (this.actions.prepareRanked?.() ?? this.ensure(this.profile?.name ?? 'Pilote'));
      if (!this.waiting || generation !== this.generation) return;
      if (this.actions.canQueue?.() === false) { await this.cancelQueue(); return; }
      this.queueState = 'searching'; this.status = 'Recherche de pilotes de votre niveau…'; this.render();
      this.possiblyQueued = true; this.queueStart = this.request('/api/ranked', 'POST'); await this.queueStart;
      if (generation === this.generation) await this.pollQueue(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.queueError(error, generation);
    } finally { if (generation === this.generation) this.queueStart = undefined; }
  }
  private async pollQueue(generation: number): Promise<void> {
    if (!this.waiting || generation !== this.generation) return;
    const result = await this.request<{ state: string; roomId?: string; waitSeconds?: number }>('/api/ranked');
    if (!this.waiting || generation !== this.generation) return;
    if (result.state === 'matched' && result.roomId) {
      if (this.actions.canQueue?.() === false) { await this.cancelQueue(); return; }
      this.waiting = false; this.queueState = 'matched'; this.status = 'Rencontre trouvée ! Connexion au salon…'; this.render(); this.dialog.close();
      try { await this.actions.ranked(result.roomId); this.possiblyQueued = false; }
      catch (error) { await this.request('/api/ranked', 'DELETE').catch(() => {}); throw error; }
      if (generation === this.generation) { this.queueState = 'idle'; this.status = ''; this.render(); } return;
    }
    if (result.state === 'idle') { this.waiting = false; this.possiblyQueued = false; this.queueState = 'idle'; this.status = 'La recherche a expiré. Vous pouvez la relancer.'; this.render(); return; }
    this.status = `Recherche en cours · ${result.waitSeconds ?? 0} s · au moins deux pilotes sont nécessaires.`; this.render();
    this.timer = setTimeout(() => void this.pollQueue(generation).catch(error => this.queueError(error, generation)), 2500);
  }
  private queueError(error: unknown, generation: number) {
    if (generation !== this.generation) return;
    this.waiting = false; clearTimeout(this.timer); this.queueState = 'error'; this.status = error instanceof Error ? error.message : String(error); this.render();
    if (this.token && this.possiblyQueued) this.cancelling = this.request('/api/ranked', 'DELETE').then(() => { this.possiblyQueued = false; }, () => {}).finally(() => { this.cancelling = undefined; });
  }
  async cancelQueue(): Promise<void> {
    if (this.cancelling) { await this.cancelling; if (!this.possiblyQueued) return; }
    if (!this.isSearching && !this.possiblyQueued) return;
    ++this.generation; this.waiting = false; clearTimeout(this.timer); this.queueState = 'cancelling'; this.status = 'Annulation de la recherche…'; this.render();
    this.cancelling = (async () => {
      try { await this.queueStart?.catch(() => {}); if (this.token) await this.request('/api/ranked', 'DELETE'); this.possiblyQueued = false; this.status = 'Recherche annulée.'; this.queueState = 'idle'; }
      catch { this.queueState = 'error'; this.status = 'Annulation non confirmée. La recherche expirera sans connexion.'; }
      finally { this.queueStart = undefined; this.cancelling = undefined; this.render(); }
    })(); return this.cancelling;
  }
  private render() {
    this.notify();
    const profile = this.profile;
    if (!profile) return;
    this.dialog.innerHTML = `<div class="garage-heading"><div><small>VOTRE PROGRESSION · NIVEAU ${profile.careerLevel}</small><h2>À vous les coupes</h2></div><button id="career-close" class="secondary">Fermer ✕</button></div>
      <p class="garage-hint">${escape(profile.name)} · ${profile.stats.races} courses · ${profile.stats.wins} victoires · ${profile.xp} XP. Terminez toutes les manches d’une coupe sur le podium final pour débloquer la suite. ${profile.username ? `Progression sauvegardée sur le compte ${escape(profile.username)} : connectez-vous pour la retrouver sur un autre appareil.` : 'Pilote invité : créez un compte à l’accueil pour retrouver votre progression sur un autre appareil.'}</p>
      <div class="career-cups">${CHAMPIONSHIPS.map(cup => { const locked = cup.unlockLevel > profile.careerLevel, done = profile.completedChampionships.includes(cup.id); return `<button class="career-cup" data-cup="${cup.id}" ${locked || this.waiting ? 'disabled' : ''}><strong>${done ? '✓ ' : locked ? '🔒 ' : ''}${cup.name}</strong><span>${cup.description}</span><small>${cup.tracks.length} courses · niveau ${cup.unlockLevel} · ${cup.introduction.join(' / ')}</small></button>`; }).join('')}</div>
      <h3>Course classée · ${profile.season}</h3><p class="garage-hint">${profile.rank} · ${profile.mmr} MMR · ${profile.ranked.races} courses classées. Bronze → Silver → Gold → Platinum → Diamond → Master. Deux courses par rencontre, avec des pilotes proches de votre classement. Les saisons changent chaque trimestre.</p>
      <button id="${this.waiting ? 'ranked-cancel' : 'ranked-join'}" class="primary wide">${this.waiting ? 'Annuler la recherche' : 'Trouver une rencontre classée'}</button><p class="garage-hint" role="status">${escape(this.status)}</p>
      <details><summary>Classement des joueurs du serveur</summary><ol class="career-board">${this.leaderboard.map(entry => `<li>${escape(entry.name)} <b>${entry.rank} · ${entry.mmr}</b></li>`).join('') || '<li>Les premières courses classées feront apparaître le classement.</li>'}</ol></details>
      <details><summary>Mes replays</summary><div class="career-replays">${this.replays.map(replay => `<button class="secondary wide" data-replay="${replay.id}">${escape(getTrack(replay.trackId).name)} · ${new Date(replay.createdAt).toLocaleDateString('fr-BE')} · Voir ▶</button>`).join('') || '<p class="garage-hint">Terminez une course pour revoir vos trajectoires.</p>'}</div></details>`;
  }
}
