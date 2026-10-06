import { randomInt } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { createKart, createWorld, neutralInput, startRace, stepWorld, validateInput,
  type Input, type Kart, type World } from '../shared/game.js';
import { isTrackId } from '../shared/track.js';
import { applyConfiguration, recordRound, registerTournamentDriver, restartTournament,
  type TournamentState } from '../shared/tournament.js';
import { config } from './config.js';

const activeRoomIds = new Set<string>();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const colors = ['#ff6b6b', '#45d9b0', '#60a5fa', '#ffcf5c', '#bb8cff', '#ff9bc9', '#ff9a52', '#eef4ff'];
type Incoming = { input: Input; receivedAt: number; acceptedSeq: number };
type Rate = { startedAt: number; messages: number; violations: number };

function profile(options: unknown, index: number) {
  const value = options && typeof options === 'object' ? options as Record<string, unknown> : {};
  const name = typeof value.name === 'string'
    ? value.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18) : '';
  return {
    name: name || `Pilote ${index + 1}`,
    color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color)
      ? value.color.toLowerCase() : colors[index % colors.length]!,
  };
}

/** Only this room owns authority over world state. Clients submit controls. */
export class RaceRoom extends Room {
  world!: World;
  private readonly inputs = new Map<string, Incoming>();
  private readonly rates = new Map<string, Rate>();
  private tick = 0;
  private accumulator = 0;
  private snapshotInterval?: NodeJS.Timeout;
  private counted = false;

  static get roomCount() { return activeRoomIds.size; }

  onCreate(options: { practice?: boolean; trackId?: string } = {}) {
    const trackId = options.trackId ?? 'lagon';
    if (!isTrackId(trackId)) throw new ServerError(4216, 'Ce circuit est inconnu.');
    if (activeRoomIds.size >= config.maxRooms) {
      throw new ServerError(4210, 'Le serveur a atteint sa limite de salons. Réessayez plus tard.');
    }
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
    } while (activeRoomIds.has(code));
    this.roomId = code;
    activeRoomIds.add(code);
    this.counted = true;
    this.world = createWorld(options.practice === true, trackId);
    this.maxClients = this.world.practice ? 1 : config.maxPlayers;
    this.autoDispose = true;
    this.setSeatReservationTime(10);
    this.setPatchRate(0); // snapshots are explicit; no duplicate Schema payloads.

    this.onMessage('input', (client, data) => this.onInput(client, data));
    this.onMessage('ready', (client, data) => {
      const kart = this.authorize(client);
      if (!kart || this.world.phase !== 'lobby' || typeof data?.ready !== 'boolean') return;
      kart.ready = data.ready;
      this.sendSnapshot();
    });
    this.onMessage('profile', (client, data) => {
      const kart = this.authorize(client);
      if (!kart || this.world.phase !== 'lobby') return;
      Object.assign(kart, profile(data, this.world.players.indexOf(kart)));
      registerTournamentDriver(this.world.tournament, kart);
      this.sendSnapshot();
    });
    this.onMessage('configure', (client, data) => this.configure(client, data));
    this.onMessage('start', client => this.beginRace(client));
    this.onMessage('nextRace', client => this.nextRace(client));
    this.onMessage('rematch', client => this.rematch(client));
    this.onMessage('*', (client) => {
      if (this.authorize(client)) this.notice(client, 'Commande inconnue : seuls les contrôles de conduite sont acceptés.');
    });
    this.setSimulationInterval(deltaMs => this.update(deltaMs), 1000 / config.simHz);
    this.snapshotInterval = setInterval(() => this.sendSnapshot(), 1000 / config.snapshotHz);
  }

  onJoin(client: Client, options: unknown) {
    if (this.world.players.filter(player => !player.abandoned).length >= this.maxClients) {
      throw new ServerError(4211, 'Ce salon est complet, y compris les places réservées aux reconnexions.');
    }
    const index = this.world.players.length;
    const identity = profile(options, index);
    const kart = createKart(client.sessionId, identity.name, identity.color, index, this.world.trackId);
    kart.connected = true;
    kart.spectator = this.world.phase !== 'lobby';
    kart.ready = false;
    kart.lastSeq = -1;
    kart.epoch = 1;
    this.world.players.push(kart);
    registerTournamentDriver(this.world.tournament, kart);
    if (!this.world.hostId) this.world.hostId = kart.id;
    this.initializeInputs(kart);
    if (kart.spectator) this.notice(client, 'Course en cours : vous participerez à la prochaine manche.');
    this.sendSnapshot();
  }

  async onLeave(client: Client, consented: boolean) {
    const kart = this.findKart(client.sessionId);
    if (!kart) return;
    kart.connected = false;
    kart.ready = false;
    kart.epoch += 1;
    kart.lastSeq = -1;
    this.inputs.delete(kart.id);
    this.rates.delete(kart.id);
    this.transferHost();
    this.sendSnapshot();
    if (!consented) {
      try {
        const reconnected = await this.allowReconnection(client, config.reconnectSeconds);
        const resumed = this.findKart(client.sessionId);
        if (!resumed) return;
        resumed.connected = true;
        if (this.world.phase === 'lobby') resumed.spectator = false;
        // Colyseus preserves sessionId and rotates its reconnectionToken.
        this.initializeInputs(resumed);
        if (!this.world.hostId) this.world.hostId = resumed.id;
        this.notice(reconnected, 'Connexion rétablie. Votre progression a été conservée.');
        this.sendSnapshot();
        return;
      } catch {
        // The reserved seat expires after the configured reconnection window.
      }
    }
    const departing = this.findKart(kart.id);
    if (departing && !departing.spectator && this.world.phase !== 'lobby') {
      // Retain the result until rematch; an unfinished departure becomes a DNF.
      // A driver who already crossed the finish keeps their finishTime and rank.
      departing.abandoned = true;
      departing.speed = 0;
      departing.item = '';
    } else {
      this.world.players = this.world.players.filter(player => player.id !== kart.id);
    }
    this.inputs.delete(kart.id);
    this.rates.delete(kart.id);
    this.transferHost();
    this.sendSnapshot();
  }

  onDispose() {
    if (this.counted) activeRoomIds.delete(this.roomId);
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.inputs.clear();
    this.rates.clear();
  }

  private findKart(id: string) { return this.world.players.find(player => player.id === id); }

  private initializeInputs(kart: Kart) {
    this.inputs.set(kart.id, {
      input: neutralInput(kart.lastSeq, kart.epoch), receivedAt: 0, acceptedSeq: kart.lastSeq,
    });
    this.rates.set(kart.id, { startedAt: Date.now(), messages: 0, violations: 0 });
  }

  private authorize(client: Client): Kart | undefined {
    const kart = this.findKart(client.sessionId);
    if (!kart?.connected) return;
    const now = Date.now();
    const rate = this.rates.get(kart.id)!;
    if (now - rate.startedAt >= 1000) {
      rate.startedAt = now;
      rate.messages = 0;
      rate.violations = Math.max(0, rate.violations - 1);
    }
    rate.messages += 1;
    if (rate.messages > 90) {
      rate.violations += 1;
      if (rate.violations > 30) client.leave(4008, 'Trop de commandes.');
      return;
    }
    return kart;
  }

  private onInput(client: Client, data: unknown) {
    const kart = this.authorize(client);
    if (!kart) return;
    const input = validateInput(data);
    const previous = this.inputs.get(kart.id)!;
    // Epoch invalidates every command from the previous transport connection.
    // Keep only the newest command: no queued burst can advance the simulation.
    if (!input || input.epoch !== kart.epoch || input.seq <= previous.acceptedSeq) return;
    // A one-frame item/reset press must survive two packets arriving in one tick.
    // The movement command still collapses to the latest sample, never a queue.
    if (previous.acceptedSeq > kart.lastSeq) {
      input.use ||= previous.input.use;
      input.reset ||= previous.input.reset;
    }
    this.inputs.set(kart.id, { input, acceptedSeq: input.seq, receivedAt: Date.now() });
  }

  private beginRace(client: Client) {
    const host = this.authorize(client);
    if (!host) return;
    if (host.id !== this.world.hostId) return this.notice(client, 'Seul le créateur du salon peut lancer la course.');
    if (this.world.phase !== 'lobby') return this.notice(client, 'Une manche est déjà en cours.');
    const participants = this.world.players.filter(player => player.connected && !player.spectator);
    if (participants.length < (this.world.practice ? 1 : 2)) {
      return this.notice(client, 'Il faut au moins deux pilotes. Le mode entraînement permet de jouer seul.');
    }
    if (participants.some(player => !player.ready)) return this.notice(client, 'Tous les pilotes doivent être prêts.');
    // A temporarily disconnected lobby member waits for the next round.
    for (const player of this.world.players) if (!player.connected) player.spectator = true;
    for (const player of participants) registerTournamentDriver(this.world.tournament, player);
    startRace(this.world);
    this.sendSnapshot();
  }

  private configure(client: Client, data: unknown) {
    const host = this.authorize(client);
    if (!host) return;
    if (host.id !== this.world.hostId) return this.notice(client, 'Seul le créateur du salon peut changer les réglages.');
    if (this.world.phase !== 'lobby' || this.world.tournament.raceIndex !== 0 || this.world.tournament.rounds.length > 0) {
      return this.notice(client, 'Les réglages sont verrouillés jusqu’à la fin du tournoi.');
    }
    try {
      const configured = applyConfiguration(this.world.tournament, data, this.world.trackId, () => randomInt(0x1000000) / 0x1000000);
      this.resetLobby(configured.trackId, configured.tournament);
      this.sendSnapshot();
    } catch (error) {
      this.notice(client, error instanceof Error ? error.message : 'Réglages du salon invalides.');
    }
  }

  private recordFinishedRound() {
    if (this.world.phase === 'finished') recordRound(this.world.tournament, this.world.trackId, this.world.players);
  }

  private nextRace(client: Client) {
    const host = this.authorize(client);
    if (!host) return;
    if (host.id !== this.world.hostId) return this.notice(client, 'Seul le créateur du salon peut préparer la course suivante.');
    if (this.world.phase !== 'finished' || this.world.tournament.mode !== 'tournament') {
      return this.notice(client, 'Terminez la course du tournoi avant de passer à la suivante.');
    }
    this.recordFinishedRound();
    const tournament = this.world.tournament;
    if (tournament.completed) return this.notice(client, 'Le tournoi est terminé. Vous pouvez proposer une revanche.');
    tournament.raceIndex += 1;
    this.resetLobby(tournament.schedule[tournament.raceIndex]!, tournament);
    this.sendSnapshot();
  }

  private rematch(client: Client) {
    const host = this.authorize(client);
    if (!host) return;
    if (host.id !== this.world.hostId) return this.notice(client, 'Seul le créateur du salon peut préparer la revanche.');
    if (this.world.phase !== 'finished') return this.notice(client, 'La revanche sera disponible après la course.');
    this.recordFinishedRound();
    if (this.world.tournament.mode === 'tournament' && !this.world.tournament.completed) {
      return this.notice(client, 'Le tournoi continue : choisissez la course suivante.');
    }
    const tournament = restartTournament(this.world.tournament, this.world.trackId, () => randomInt(0x1000000) / 0x1000000);
    this.resetLobby(tournament.schedule[0]!, tournament);
    this.sendSnapshot();
  }

  /** Reset per-race state while preserving sessions and, between rounds, points. */
  private resetLobby(trackId: string, tournament: TournamentState) {
    const old = this.world;
    const next = createWorld(old.practice, trackId);
    next.tournament = tournament;
    next.hostId = old.hostId;
    next.round = old.round;
    next.time = old.time;
    next.players = old.players.filter(player => !player.abandoned).map((player, index) => {
      const kart = createKart(player.id, player.name, player.color, index, trackId);
      kart.connected = player.connected;
      kart.spectator = !player.connected;
      kart.ready = false;
      kart.epoch = player.epoch + 1;
      kart.lastSeq = -1;
      return kart;
    });
    this.world = next;
    this.inputs.clear();
    this.rates.clear();
    for (const player of next.players) {
      this.initializeInputs(player);
      registerTournamentDriver(tournament, player);
    }
  }

  private transferHost() {
    if (!this.world.players.some(player => player.id === this.world.hostId && player.connected)) {
      this.world.hostId = this.world.players.find(player => player.connected)?.id || '';
    }
  }

  private update(deltaMs: number) {
    const dt = 1 / config.simHz;
    // Catch up normal scheduler jitter, but never simulate a long stall in a burst.
    this.accumulator += Math.min(deltaMs / 1000, dt * 5);
    const now = Date.now();
    while (this.accumulator >= dt) {
      const controls = new Map<string, Input>();
      for (const kart of this.world.players) {
        const incoming = this.inputs.get(kart.id);
        controls.set(kart.id, kart.connected && incoming && now - incoming.receivedAt <= config.inputTimeoutMs
          ? incoming.input : neutralInput(kart.lastSeq, kart.epoch));
      }
      stepWorld(this.world, controls, dt);
      this.recordFinishedRound();
      for (const kart of this.world.players) {
        const consumed = controls.get(kart.id);
        if (consumed) kart.lastSeq = consumed.seq;
      }
      this.tick += 1;
      this.accumulator -= dt;
    }
  }

  private sendSnapshot() {
    this.broadcast('snapshot', {
      world: this.world, serverTime: Date.now(), tick: this.tick, simHz: config.simHz,
    });
  }

  private notice(client: Client, message: string) { client.send('notice', { message }); }
}
