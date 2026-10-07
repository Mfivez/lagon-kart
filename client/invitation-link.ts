/** Invitation links never include credentials or an external redirect. */
export function invitationUrl(origin: string, roomId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)) throw new Error('Code de salon invalide.');
  const base = new URL(origin); if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Origine du salon invalide.');
  return new URL(`/room/${encodeURIComponent(roomId)}`, base.origin).href;
}
