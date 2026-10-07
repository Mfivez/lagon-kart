import { invitationUrl } from './invitation-link';
import './room-invitation.css';

export const invitationMarkup = '<div id="room-invitation" class="room-invitation hidden"><button class="secondary" id="invite-share" type="button">Partager le salon ↗</button><button class="secondary" id="invite-qr" type="button">QR code</button></div>';
export class RoomInvitation {
  private roomId = '';
  private dialog?: HTMLDialogElement;
  constructor(private readonly root: HTMLElement, private readonly options: { message(message: string): void }) {
    root.querySelector('#invite-share')!.addEventListener('click', () => { void this.share(); });
    root.querySelector('#invite-qr')!.addEventListener('click', () => { void this.openQr(); });
  }
  update(roomId: string | null) {
    if ((roomId ?? '') !== this.roomId) this.dialog?.close();
    this.roomId = roomId ?? ''; this.root.classList.toggle('hidden', !this.roomId);
  }
  private async copy(url: string): Promise<void> {
    try { await navigator.clipboard.writeText(url); this.options.message('Lien du salon copié !'); }
    catch { await this.openQr(); const input = this.dialog?.querySelector('input'); input?.focus(); input?.select(); this.options.message('Sélectionnez et copiez le lien du salon.'); }
  }
  async share(): Promise<void> {
    if (!this.roomId) return; const url = invitationUrl(location.origin, this.roomId);
    if (navigator.share) {
      try { await navigator.share({ title: 'Rejoins mon salon Lagon Kart', text: `Salon ${this.roomId}`, url }); return; }
      catch (error) { if ((error as { name?: string }).name === 'AbortError') return; }
    }
    await this.copy(url);
  }
  async openQr(): Promise<void> {
    if (!this.roomId || this.dialog?.open) return;
    const id = this.roomId, url = invitationUrl(location.origin, id);
    try {
      const { renderInvitationQr } = await import('./invitation-qr');
      if (id !== this.roomId || this.dialog?.open) return;
      const dialog = document.createElement('dialog'); dialog.className = 'garage-dialog invitation-dialog'; this.dialog = dialog;
      dialog.innerHTML = '<div class="garage-heading"><h2>Inviter un pilote</h2><button class="secondary" data-close type="button">Fermer ✕</button></div><p>Scannez ce QR code pour rejoindre le même salon.</p><canvas aria-label="QR code du lien du salon"></canvas><strong data-code></strong><label>Lien du salon<input type="url" readonly aria-label="Lien du salon"></label><button class="secondary wide" data-copy type="button">Copier le lien</button>';
      dialog.querySelector('[data-code]')!.textContent = id; dialog.querySelector('input')!.value = url; renderInvitationQr(dialog.querySelector('canvas')!, url);
      dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close()); dialog.querySelector('[data-copy]')!.addEventListener('click', () => { void this.copy(url); });
      dialog.addEventListener('close', () => { dialog.remove(); if (this.dialog === dialog) this.dialog = undefined; }); document.body.append(dialog); dialog.showModal();
    } catch { this.options.message('QR indisponible. Utilisez le lien du salon pour inviter un pilote.'); }
  }
}
