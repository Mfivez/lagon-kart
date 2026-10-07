import type { IncomingMessage, ServerResponse } from 'node:http';
import { playerStore } from './career.js';
import { CustomTrackError, customTrackStore } from './custom-track-store.js';

const BODY_LIMIT = 32 * 1024;
const writes = new Map<string, { at: number; count: number }>();

async function readDraft(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (Number(req.headers['content-length']) > BODY_LIMIT) {
    req.resume(); throw new CustomTrackError('Le circuit dépasse 32 Kio.', 413);
  }
  return new Promise((resolve, reject) => {
    let size = 0, exceeded = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        exceeded = true; chunks.length = 0;
        reject(new CustomTrackError('Le circuit dépasse 32 Kio.', 413));
      } else if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return;
      try {
        const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
        resolve(data as Record<string, unknown>);
      } catch { reject(new CustomTrackError('Envoyez un circuit valide au format JSON.')); }
    });
    req.on('error', () => reject(new CustomTrackError('Envoi du circuit interrompu.')));
    req.on('aborted', () => reject(new CustomTrackError('Envoi du circuit interrompu.')));
  });
}

export async function handleCustomTracksRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const pathname = new URL(req.url ?? '/', 'http://internal.invalid').pathname;
    const route = /^\/api\/tracks(?:\/(custom-[a-z0-9-]{1,80}))?\/?$/.exec(pathname);
    if (!route) { req.resume(); send(404, { error: 'Circuit introuvable.' }); return; }
    const id = route[1];
    const store = await customTrackStore();
    if (req.method === 'GET') {
      if (!id) send(200, { tracks: store.list() });
      else {
        const track = store.get(id);
        send(track ? 200 : 404, track ? { track } : { error: 'Cette version du circuit est introuvable.' });
      }
      return;
    }
    if (req.method !== (id ? 'PUT' : 'POST')) {
      req.resume(); send(405, { error: 'Méthode non autorisée.' }); return;
    }
    if (req.headers.origin) {
      let sameHost = false;
      try { sameHost = new URL(req.headers.origin).host === req.headers.host; } catch { /* Rejected below. */ }
      if (!sameHost) { req.resume(); send(403, { error: 'Ouvrez l’éditeur depuis la page du jeu.' }); return; }
    }
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const author = (await playerStore()).authenticate(token);
    if (!author) { req.resume(); send(401, { error: 'Profil absent ou expiré. Rechargez la page avant de sauvegarder.' }); return; }
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      req.resume(); send(415, { error: 'Envoyez le circuit au format JSON.' }); return;
    }
    // Limit each pilot independently so a class sharing the tunnel does not block itself.
    const now = Date.now();
    let rate = writes.get(author.id);
    if (!rate || now - rate.at >= 60_000) {
      rate = { at: now, count: 0 }; if (writes.size >= 4096) writes.clear(); writes.set(author.id, rate);
    }
    if (++rate.count > 60) {
      req.resume(); res.setHeader('Retry-After', '60'); send(429, { error: 'Trop de sauvegardes. Réessayez dans une minute.' }); return;
    }
    const body = await readDraft(req);
    const track = await store.save(author, body.draft, id, body.revision);
    send(id ? 200 : 201, { track });
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof CustomTrackError) send(error.status, { error: error.message });
    else send(503, { error: 'La bibliothèque de circuits est temporairement indisponible. Votre dessin reste ouvert.' });
  }
}
