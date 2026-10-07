import { createGameServer } from './app.js';
import { config } from './config.js';

const { gameServer, ready } = createGameServer();
await ready;
await gameServer.listen(config.port, config.host);
console.log(`Lagon Kart écoute sur ${config.host}:${config.port} (${config.simHz} Hz / ${config.snapshotHz} snapshots/s).`);
