import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { config } from './config.js';
import { RaceRoom } from './RaceRoom.js';
import { handleCareerRequest } from './career.js';
import { handleCustomTracksRequest } from './custom-tracks-api.js';
import { customTrackStore } from './custom-track-store.js';

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function matchmakingMessage(code: number | undefined, message: string | undefined): string {
  // The 0.16 SDK uses 4212 for both a missing room and a full/locked room.
  if (/locked|already full|maxClients/i.test(message || '')) {
    return 'Ce salon est complet. Les places des pilotes en reconnexion restent réservées temporairement.';
  }
  if (code === 4212 && /not found|disposed/i.test(message || '')) {
    return 'Ce salon est introuvable ou a expiré. Vérifiez le code ou créez un nouveau salon.';
  }
  if (code === 4214) return 'La réservation ou le délai de reconnexion a expiré. Rejoignez à nouveau le salon.';
  if (code === 4210 && /not defined/i.test(message || '')) return 'Ce type de salon est inconnu.';
  if (code === 4211 && /no rooms found/i.test(message || '')) return 'Aucun salon disponible ne correspond à cette demande.';
  return message || 'Connexion au salon impossible. Réessayez dans un instant.';
}

function readOptions(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4096) {
        exceeded = true;
        chunks.length = 0;
        reject(new Error('La requête dépasse 4 Kio.'));
      } else if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return;
      try {
        const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (result === null || typeof result !== 'object' || Array.isArray(result)) throw new Error();
        resolveBody(result as Record<string, unknown>);
      } catch { reject(new Error('Options de connexion invalides.')); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Requête interrompue.')));
  });
}

/** Uses Colyseus 0.16's public matchmaking controller with a bounded HTTP body. */
class BoundedServer extends Server {
  readiness: Promise<unknown> = Promise.resolve();
  private readonly requests = new Map<string, { at: number; count: number }>();

  protected override async handleMatchMakeRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'POST') { json(res, 405, { error: 'Méthode non autorisée.' }); return; }
    const route = (req.url || '').split('?')[0]!.match(/^\/matchmake\/(create|join|joinOrCreate|joinById|reconnect)\/([A-Za-z0-9_-]+)\/?$/);
    if (!route) { json(res, 404, { error: 'Salon ou route introuvable.' }); return; }
    if (Number(req.headers['content-length']) > 4096) {
      req.resume(); json(res, 413, { error: 'La requête dépasse 4 Kio.' }); return;
    }
    // The socket address is used deliberately; arbitrary X-Forwarded-For is untrusted.
    // Quick Tunnel shares one upstream address, so the budget covers all its guests.
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let rate = this.requests.get(ip);
    if (!rate || now - rate.at >= 60_000) {
      rate = { at: now, count: 0 };
      if (this.requests.size > 2048) this.requests.clear();
      this.requests.set(ip, rate);
    }
    if (++rate.count > 300) { req.resume(); json(res, 429, { error: 'Trop de connexions. Réessayez dans une minute.' }); return; }
    try {
      await this.readiness;
      const options = await readOptions(req);
      const authorization = req.headers.authorization;
      const result = await matchMaker.controller.invokeMethod(route[1]!, route[2]!, options, {
        token: authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined,
        headers: req.headers,
        ip,
        req,
      });
      // publicAddress is never configured: SDK reuses the browser's public origin.
      json(res, 200, result);
    } catch (error) {
      const problem = error as { code?: number; message?: string };
      // Colyseus clients expect application failures as {code,error} with HTTP 200.
      if (!res.writableEnded) json(res, 200, {
        code: problem.code || 4212,
        error: matchmakingMessage(problem.code, problem.message),
      });
    }
  }
}

export function createGameServer(clientDirectory = resolve(process.cwd(), 'dist/client')) {
  const clientRoot = resolve(clientDirectory);
  const ready = customTrackStore();
  // Callers may await ready before listen; HTTP and matchmaking also await it themselves.
  void ready.catch(() => {});
  const httpServer = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const serve = async () => {
      const pathname = new URL(req.url || '/', 'http://internal.invalid').pathname;
      if (pathname === '/api/tracks' || pathname.startsWith('/api/tracks/')) {
        await handleCustomTracksRequest(req, res); return;
      }
      if (pathname.startsWith('/api/')) { await handleCareerRequest(req, res, () => readOptions(req)); return; }
      if (pathname === '/healthz') {
        try { await ready; } catch { json(res, 503, { status: 'unavailable', error: 'Bibliothèque de circuits indisponible.' }); return; }
        json(res, 200, { status: 'ok', rooms: RaceRoom.roomCount,
          maxRooms: config.maxRooms, maxPlayers: config.maxPlayers,
          simHz: config.simHz, snapshotHz: config.snapshotHz });
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        json(res, 405, { error: 'Méthode non autorisée.' }); return;
      }
      let decoded: string;
      try { decoded = decodeURIComponent(pathname); }
      catch { json(res, 400, { error: 'Chemin invalide.' }); return; }
      const spa = decoded === '/' || /^\/room\/[A-Za-z0-9_-]+\/?$/.test(decoded);
      const filename = spa ? resolve(clientRoot, 'index.html') : resolve(clientRoot, `.${decoded}`);
      if (!filename.startsWith(clientRoot + sep) || decoded.includes('\0')) {
        json(res, 403, { error: 'Chemin interdit.' }); return;
      }
      try {
        const info = await stat(filename);
        if (!info.isFile()) throw new Error('not a file');
        res.writeHead(200, {
          'Content-Type': mime[extname(filename)] || 'application/octet-stream',
          'Content-Length': info.size,
          'Cache-Control': decoded.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
        if (req.method === 'HEAD') res.end();
        else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
      } catch {
        json(res, 404, { error: spa ? 'Client absent : exécutez npm run build.' : 'Fichier introuvable.' });
      }
    };
    void serve().catch(() => { if (!res.headersSent) json(res, 500, { error: 'Erreur serveur.' }); else res.destroy(); });
  });
  httpServer.requestTimeout = 10_000;
  httpServer.headersTimeout = 10_000;
  const gameServer = new BoundedServer({
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 2048,
      pingInterval: 3000, pingMaxRetries: 2, perMessageDeflate: false }),
    greet: false,
    gracefullyShutdown: true,
  });
  gameServer.readiness = ready;
  gameServer.define('race', RaceRoom);
  if (config.simulatedLatencyMs > 0) gameServer.simulateLatency(config.simulatedLatencyMs);
  return { gameServer, httpServer, ready };
}
