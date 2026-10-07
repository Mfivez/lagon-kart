import { PRESENCE_INTERVAL_MS, type PresenceSnapshot, type PresenceStatus } from '../shared/presence';
import './online-players.css';

const labels: Record<PresenceStatus, string> = {
  home: 'À l’accueil', 'ranked-search': 'Recherche classée', 'ranked-ready': 'Classée trouvée',
  lobby: 'Dans un salon', racing: 'En course', 'ranked-race': 'En course classée', practice: 'En entraînement',
  spectating: 'Spectateur', results: 'Entre deux courses',
};
type Identity = { token: string; playerId: string };
export const onlinePlayersMarkup = `<section class="online-players" id="online-players" aria-labelledby="online-players-title">
  <div class="online-players-heading"><h2 id="online-players-title"><i aria-hidden="true"></i> Joueurs en ligne</h2><span id="online-player-count" role="status">…</span></div>
  <p class="online-ranked" id="online-ranked-count">Connexion à la liste…</p>
  <ul class="online-player-list" id="online-player-list" aria-label="Pilotes et activité"></ul>
  <p class="online-player-message" id="online-player-message"></p>
</section>`;

function clientId() {
  // getRandomValues also works when classmates open an HTTP LAN address.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** One light same-origin request updates our lease and retrieves the public list. */
export class OnlinePlayersPanel {
  private readonly clientId = clientId();
  private identity?: Identity;
  private timer?: ReturnType<typeof setTimeout>;
  private pending = false;
  private refreshPending = false;
  private stopped = false;
  private request?: AbortController;
  private readonly count = document.getElementById('online-player-count')!;
  private readonly ranked = document.getElementById('online-ranked-count')!;
  private readonly list = document.getElementById('online-player-list')!;
  private readonly message = document.getElementById('online-player-message')!;
  private readonly host = document.getElementById('online-players')!;

  constructor(private readonly getIdentity: () => Promise<Identity>) {
    window.addEventListener('pagehide', () => this.leave());
    window.addEventListener('pageshow', () => { this.stopped = false; this.refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
    window.addEventListener('online', () => this.refresh());
    this.timer = setTimeout(() => this.refresh(), 0);
  }

  refresh() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    if (this.pending) { this.refreshPending = true; return; }
    void this.update();
  }

  private async update() {
    this.pending = true;
    const controller = new AbortController(); this.request = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const identity = await this.getIdentity();
      if (this.stopped) return;
      this.identity = identity;
      const response = await fetch('/api/presence', { method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${identity.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.clientId }) });
      if (!response.ok) throw new Error('Liste indisponible');
      const snapshot = await response.json() as PresenceSnapshot;
      if (!this.stopped) this.render(snapshot);
    } catch {
      if (!this.stopped) {
        this.host.classList.add('is-unavailable'); this.count.textContent = '—';
        this.ranked.textContent = 'Connexion à la liste interrompue'; this.list.replaceChildren();
        this.message.textContent = 'Nouvel essai automatique dans quelques secondes.';
      }
    } finally {
      clearTimeout(timeout); this.pending = false; this.request = undefined;
      const delay = this.refreshPending ? 0 : PRESENCE_INTERVAL_MS; this.refreshPending = false;
      if (!this.stopped) this.timer = setTimeout(() => this.refresh(), delay);
    }
  }

  private render(snapshot: PresenceSnapshot) {
    this.host.classList.remove('is-unavailable');
    this.count.textContent = `${snapshot.connected} connecté${snapshot.connected === 1 ? '' : 's'}`;
    this.ranked.textContent = `${snapshot.searchingRanked} en recherche classée`;
    this.ranked.classList.toggle('has-searches', snapshot.searchingRanked > 0);
    const fragment = document.createDocumentFragment();
    for (const player of snapshot.players) {
      const row = document.createElement('li'); row.dataset.playerId = player.id; row.dataset.status = player.status;
      const name = document.createElement('strong'); name.textContent = player.name;
      const own = player.id === this.identity?.playerId;
      if (own) { const you = document.createElement('small'); you.textContent = 'Vous'; name.append(you); }
      const status = document.createElement('span'); status.textContent = labels[player.status] ?? 'En ligne';
      row.append(name, status); fragment.append(row);
    }
    this.list.replaceChildren(fragment);
    this.message.textContent = snapshot.connected === 0 ? 'La piste attend ses premiers pilotes.' : '';
  }

  private leave() {
    this.stopped = true; clearTimeout(this.timer); this.request?.abort();
    if (!this.identity) return;
    void fetch('/api/presence', { method: 'DELETE', keepalive: true,
      headers: { Authorization: `Bearer ${this.identity.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId }) }).catch(() => { /* An interrupted lease expires on the server. */ });
  }
}
