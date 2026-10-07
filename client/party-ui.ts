import type { World } from '../shared/game';
import { getAvailableTracks, getTrack } from '../shared/track';
import type { RaceHighlight } from '../shared/party';
import './party-ui.css';

export const partyMarkup = `<section id="party-lobby" class="party-panel hidden"></section><section id="party-results" class="party-panel hidden"></section><aside id="crown-status" class="crown-status hidden" aria-live="off"></aside>`;
export interface FunConfiguration { crown: boolean; party: boolean; choices: string[] }
interface Options { configure: (payload: FunConfiguration) => void; vote: (trackId: string) => void; replay: (id: string, atMs: number) => void; share: (id: string, atMs: number) => void }
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export class PartyUi {
  private signature = '';
  private resultsSignature = '';
  private world: World | null = null;
  private sessionId: string | null = null;
  private appliedSignature = '';
  get hasPendingChanges(): boolean {
    const world = this.world;
    if (!world || world.phase !== 'lobby' || world.hostId !== this.sessionId || world.ranked || world.championshipId || world.practice || world.workshop) return false;
    const draft = this.readDraft(); if (!draft) return false;
    return draft.crown !== !!world.crown || draft.party !== !!world.party || draft.party && JSON.stringify(draft.choices) !== JSON.stringify(world.party?.choices);
  }
  get pendingMessage(): string { return this.hasPendingChanges ? 'Appliquez vos choix Soirée / Couronne avant de vous déclarer prêt.' : ''; }
  private readDraft(): FunConfiguration | undefined {
    const crown = document.getElementById('party-crown') as HTMLInputElement | null, party = document.getElementById('party-enabled') as HTMLInputElement | null;
    return crown && party ? { crown: crown.checked, party: party.checked, choices: [...document.querySelectorAll<HTMLSelectElement>('[data-party-choice]')].map(select => select.value) } : undefined;
  }
  constructor(private readonly options: Options) {
    document.getElementById('lobby-party-options')?.append(document.getElementById('party-lobby')!);
    document.getElementById('results-panel')?.insertBefore(document.getElementById('party-results')!, document.getElementById('results-list'));
    document.getElementById('race-hud')?.append(document.getElementById('crown-status')!);
    document.getElementById('party-lobby')!.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (!button) return;
      if (button.id === 'party-apply') this.options.configure({ crown: (document.getElementById('party-crown') as HTMLInputElement).checked,
        party: (document.getElementById('party-enabled') as HTMLInputElement).checked,
        choices: [...document.querySelectorAll<HTMLSelectElement>('[data-party-choice]')].map(select => select.value) });
      this.action(button);
    });
    document.getElementById('party-results')!.addEventListener('click', event => { const button = (event.target as Element).closest<HTMLButtonElement>('button'); if (button) this.action(button); });
  }
  private action(button: HTMLButtonElement) {
    if (button.dataset.vote) this.options.vote(button.dataset.vote);
    if (button.dataset.replay) this.options.replay(button.dataset.replay, Number(button.dataset.at ?? 0));
    if (button.dataset.share) this.options.share(button.dataset.share, Number(button.dataset.at ?? 0));
  }
  update(world: World | null, sessionId: string | null, serverNow = Date.now()): void {
    this.world = world; this.sessionId = sessionId;
    const lobby = document.getElementById('party-lobby')!, results = document.getElementById('party-results')!, crown = document.getElementById('crown-status')!;
    const normal = !!world && !world.ranked && !world.championshipId && !world.workshop && !world.practice;
    lobby.classList.toggle('hidden', !normal || world?.phase !== 'lobby');
    results.classList.toggle('hidden', !world || world.phase !== 'finished');
    crown.classList.toggle('hidden', !world?.crown || !['countdown', 'racing'].includes(world.phase));
    if (!world) { this.signature = ''; this.resultsSignature = ''; this.appliedSignature = ''; return; }
    const owner = world.hostId === sessionId;
    const signature = JSON.stringify([world.phase, owner, !!world.crown, world.party?.choices, world.party?.lastReplayId, world.tournament.raceIndex, world.tournament.rounds.length, getAvailableTracks().map(track => track.id)]);
    if (normal && world.phase === 'lobby' && signature !== this.signature) {
      const applied = JSON.stringify([!!world.crown, world.party?.choices]);
      const pending = owner && this.hasPendingChanges && applied === this.appliedSignature ? this.readDraft() : undefined;
      this.appliedSignature = applied;
      this.signature = signature; const tracks = getAvailableTracks(); const locked = !owner || world.tournament.rounds.length > 0;
      const choices = world.party?.choices ?? tracks.slice(0, 3).map(track => track.id);
      lobby.innerHTML = `<details class="party-options"><summary>Soirée et mode Couronne</summary><p>Gardez le même salon. Le vote dure 8 secondes entre les manches ; chacun confirme ensuite qu’il est prêt.</p><label><input type="checkbox" id="party-enabled" ${world.party ? 'checked' : ''} ${locked ? 'disabled' : ''}> Soirée : voter entre 3 circuits</label><div class="party-choices">${[0, 1, 2].map(index => `<label>Choix ${index + 1}<select data-party-choice="${index}" ${locked ? 'disabled' : ''}>${tracks.map(track => `<option value="${escape(track.id)}" ${track.id === choices[index] ? 'selected' : ''}>${escape(track.name)}</option>`).join('')}</select></label>`).join('')}</div><label><input type="checkbox" id="party-crown" ${world.crown ? 'checked' : ''} ${locked ? 'disabled' : ''}> Couronne : 90 secondes sans élimination</label><p>Le porteur gagne 1 point tous les 4 m de progression valide. Une attaque efficace ou un contact avec une étoile vole la couronne. Un simple choc ne la vole pas. Protection 3 s après le vol ; à l’arrêt, aucun point. Aucun XP ni record en Couronne.</p><button id="party-apply" class="secondary wide" ${locked ? 'disabled' : ''}>Appliquer ces modes</button><p>Le tournoi garde ses manches et ses points. Depuis une course simple, activer Soirée crée 4 manches. ${locked ? 'Le créateur choisit ces options avant la première manche.' : ''}</p></details>${world.party?.lastReplayId ? this.highlights(world.party.lastHighlights ?? [], world.party.lastReplayId) : ''}`;
      if (pending) {
        (document.getElementById('party-crown') as HTMLInputElement).checked = pending.crown;
        (document.getElementById('party-enabled') as HTMLInputElement).checked = pending.party;
        [...document.querySelectorAll<HTMLSelectElement>('[data-party-choice]')].forEach((select, index) => { select.value = pending.choices[index] ?? select.value; });
        lobby.querySelector('details')!.open = true;
      }
    }
    if (world.phase === 'finished') {
      const signature = JSON.stringify([world.highlights, world.replayId, world.party?.phase, world.party?.votes, world.party?.choices, sessionId]);
      if (signature !== this.resultsSignature) {
        this.resultsSignature = signature;
        results.innerHTML = `${world.party?.phase === 'voting' ? `<h3>Quelle piste ensuite ? <span id="party-vote-time"></span></h3><div class="party-votes">${world.party.choices.map(id => `<button class="secondary" data-vote="${escape(id)}" aria-pressed="${world.party?.votes[sessionId ?? ''] === id}">${escape(getTrack(id).name)} · ${Object.values(world.party!.votes).filter(vote => vote === id).length} vote(s)</button>`).join('')}</div><p>En cas d’égalité ou d’abstention, les choix tournent dans l’ordre. Le prochain départ attend votre bouton Prêt.</p>` : ''}${this.highlights(world.highlights ?? [], world.replayId)}`;
      }
      const timer = document.getElementById('party-vote-time'); if (timer && world.party) timer.textContent = `${Math.max(0, Math.ceil((world.party.endsAt - serverNow) / 1000))} s`;
    }
    if (world.crown) {
      const holder = world.players.find(kart => kart.id === world.crown!.holderId), me = world.players.find(kart => kart.id === sessionId);
      crown.textContent = `♛ ${Math.ceil(world.crown.remaining)} s · ${holder?.name ?? 'Couronne libre'}${world.raceTime < world.crown.protectedUntil ? ' · protégé' : ''} · Vous : ${world.crown.scores[me?.id ?? ''] ?? 0} pts`;
    }
  }
  private highlights(entries: RaceHighlight[], replayId?: string): string {
    return `<h3>Faits marquants</h3>${entries.length ? entries.map(entry => `<div class="party-highlight"><span>${escape(entry.label)} · ${(entry.atMs / 1000).toFixed(1)} s</span><button class="secondary" ${replayId ? `data-replay="${escape(replayId)}" data-at="${Math.max(0, entry.atMs - 2500)}"` : 'disabled'}>Revoir</button>${replayId ? `<button class="secondary" data-share="${escape(replayId)}" data-at="${Math.max(0, entry.atMs - 2500)}">Copier le passage</button>` : ''}</div>`).join('') : '<p>Aucun fait marquant mesuré pour cette manche.</p>'}${!replayId ? '<p>Le replay sera disponible après sa sauvegarde.</p>' : `<button class="secondary" data-replay="${escape(replayId)}" data-at="0">Revoir toute la manche</button>`}`;
  }
}
