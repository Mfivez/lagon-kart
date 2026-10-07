import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Fixed, versioned work factors prevent a malformed save from choosing an expensive KDF. */
export interface PasswordHash { scheme: 'scrypt-v1'; salt: string; hash: string }
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const DUMMY_HASH: PasswordHash = { scheme: 'scrypt-v1', salt: '0'.repeat(32), hash: '0'.repeat(128) };

export function validPasswordHash(value: unknown): value is PasswordHash {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as PasswordHash;
  return candidate.scheme === 'scrypt-v1' && typeof candidate.salt === 'string' && /^[a-f0-9]{32}$/.test(candidate.salt) &&
    typeof candidate.hash === 'string' && /^[a-f0-9]{128}$/.test(candidate.hash) &&
    Object.keys(candidate).every(key => ['scheme', 'salt', 'hash'].includes(key));
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128)
    throw new Error('Le mot de passe doit contenir entre 6 et 128 caractères.');
  return value;
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, Buffer.from(salt, 'hex'), 64, SCRYPT_OPTIONS, (error, result) => error ? reject(error) : resolve(result));
  });
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  return { scheme: 'scrypt-v1', salt, hash: (await derive(password, salt)).toString('hex') };
}

export async function verifyPassword(password: string, stored?: PasswordHash): Promise<boolean> {
  // Unknown usernames still perform the same derivation as existing accounts.
  const candidate = stored ?? DUMMY_HASH;
  const actual = await derive(password, candidate.salt);
  return timingSafeEqual(actual, Buffer.from(candidate.hash, 'hex')) && stored !== undefined;
}
