/** All capacity/timing settings are validated once, at process startup. */
function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} doit être un entier entre ${min} et ${max}.`);
  }
  return value;
}

export const config = Object.freeze({
  port: integer('PORT', 3000, 0, 65535),
  host: process.env.HOST || '0.0.0.0',
  simHz: integer('SIM_HZ', 30, 10, 60),
  snapshotHz: integer('SNAPSHOT_HZ', 20, 5, 60),
  maxRooms: integer('MAX_ROOMS', 32, 1, 1000),
  maxPlayers: integer('MAX_PLAYERS', 8, 2, 8),
  inputTimeoutMs: integer('INPUT_TIMEOUT_MS', 250, 100, 2000),
  reconnectSeconds: integer('RECONNECT_SECONDS', 30, 1, 120),
  simulatedLatencyMs: integer('SIMULATED_LATENCY_MS', 0, 0, 1000),
});
