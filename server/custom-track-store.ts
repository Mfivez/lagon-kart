import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readdir, readFile, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { compileCustomTrack, customTrackRuntimeId, registerCustomTrack, validateCustomTrackDraft,
  type StoredCustomTrack } from '../shared/custom-tracks.js';
import { retireCustomTrackDefinition } from '../shared/track.js';

export class CustomTrackError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export interface TrackAuthor { id: string; name: string; canModerateTracks?: boolean }
export interface CustomTrackStoreOptions {
  now?: () => number; maxTracks?: number; maxTracksPerAuthor?: number; maxRevisions?: number;
}
export const CUSTOM_TRACK_FILE_LIMIT = 64 * 1024;
const logicalId = /^custom-[a-z0-9-]{1,64}$/;
const runtimeFile = /^(custom-[a-z0-9-]{1,64})-v([1-9][0-9]{0,4})\.json$/;
const deletedFile = /^(custom-[a-z0-9-]{1,64})\.deleted\.json$/;
const directoryWrites = new Map<string, Promise<unknown>>();
type OwnedTrack = StoredCustomTrack & { authorId: string; authorName: string; runtimeId: string };
const clone = <T>(value: T): T => structuredClone(value);
const isTimestamp = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

/** One immutable file per revision: existing rooms and replays retain their geometry. */
export class CustomTrackStore {
  private readonly records = new Map<string, OwnedTrack>();
  private readonly latest = new Map<string, OwnedTrack>();
  private readonly damaged = new Set<string>();
  private readonly deleted = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly maxTracks: number;
  private readonly maxTracksPerAuthor: number;
  private readonly maxRevisions: number;

  private constructor(readonly directory: string, options: CustomTrackStoreOptions) {
    this.now = options.now ?? Date.now;
    this.maxTracks = Math.max(1, Math.min(256, options.maxTracks ?? 256));
    this.maxTracksPerAuthor = Math.max(1, Math.min(64, options.maxTracksPerAuthor ?? 24));
    this.maxRevisions = Math.max(1, Math.min(200, options.maxRevisions ?? 50));
  }

  static async open(directory: string, options: CustomTrackStoreOptions = {}): Promise<CustomTrackStore> {
    const store = new CustomTrackStore(resolve(directory), options);
    await mkdir(store.directory, { recursive: true, mode: 0o700 });
    const entries = await readdir(store.directory);
    // Even a damaged tombstone stays effective: an interrupted/manual edit must
    // never silently republish a moderated circuit. Revision files stay intact.
    for (const file of entries) {
      const match = deletedFile.exec(file);
      if (match) store.retire(match[1]!);
    }
    const files = entries.filter(file => runtimeFile.test(file)).sort();
    if (files.length > 51_200) throw new CustomTrackError('Trop de versions de circuits dans le dossier de sauvegarde.', 503);
    for (const file of files) {
      const match = runtimeFile.exec(file)!;
      try {
        const path = join(store.directory, file);
        if ((await stat(path)).size > CUSTOM_TRACK_FILE_LIMIT) throw new Error('Fichier trop volumineux.');
        const record = store.readRecord(JSON.parse(await readFile(path, 'utf8')));
        if (file !== record.runtimeId + '.json') throw new Error('Identifiant de fichier différent du circuit.');
        registerCustomTrack(record);
        store.install(record);
      } catch {
        // Never rewrite damaged files. Other tracks (and valid older revisions) remain playable.
        store.damaged.add(match[1]!);
        console.warn(`Circuit personnalisé ignoré : ${file} est illisible ; sauvegarde conservée.`);
      }
    }
    return store;
  }

  list(): OwnedTrack[] {
    return [...this.latest.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).map(clone);
  }

  get(runtimeId: string): OwnedTrack | undefined {
    const record = this.records.get(runtimeId);
    return record ? clone(record) : undefined;
  }

  isAvailable(runtimeId: string): boolean {
    const record = this.records.get(runtimeId);
    return !!record && !this.deleted.has(record.id);
  }

  async delete(author: TrackAuthor, id: unknown, expectedRevision: unknown): Promise<{ deletedId: string }> {
    this.validateAuthor(author);
    if (typeof id !== 'string' || !logicalId.test(id)) throw new CustomTrackError('Identifiant de circuit invalide.');
    return this.transaction(async () => {
      await this.checkNotDeleted(id);
      const previous = this.latest.get(id);
      if (!previous) throw new CustomTrackError('Circuit introuvable.', 404);
      if (previous.authorId !== author.id && author.canModerateTracks !== true)
        throw new CustomTrackError('Seul le créateur ou le compte administrateur peut supprimer ce circuit.', 403);
      if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) throw new CustomTrackError('Version de circuit invalide.');
      if (expectedRevision !== previous.revision) throw new CustomTrackError('Ce circuit a été modifié. Rechargez la bibliothèque avant de le supprimer.', 409);
      await this.checkLatestRevision(previous);
      const marker = { id, revision: previous.revision, deletedAt: new Date(this.now()).toISOString(), deletedBy: author.id };
      await this.persistFile(id + '.deleted', marker, 'Le circuit ne peut pas être supprimé pour le moment. Réessayez.');
      this.retire(id);
      return { deletedId: id };
    });
  }

  async save(author: TrackAuthor, draftInput: unknown, id?: unknown, expectedRevision?: unknown): Promise<OwnedTrack> {
    const validation = validateCustomTrackDraft(draftInput);
    if (!validation.ok || !validation.draft) throw new CustomTrackError(validation.errors.join(' ') || 'Circuit invalide.');
    this.validateAuthor(author);
    // Canonical JSON values match both the on-disk record and the HTTP representation (including -0).
    const draft = JSON.parse(JSON.stringify(validation.draft)) as typeof validation.draft;
    return this.transaction(async () => {
      let previous: OwnedTrack | undefined;
      if (id !== undefined) {
        if (typeof id !== 'string' || !logicalId.test(id)) throw new CustomTrackError('Identifiant de circuit invalide.');
        await this.checkNotDeleted(id);
        previous = this.latest.get(id);
        if (!previous) throw new CustomTrackError('Circuit introuvable.', 404);
        if (previous.authorId !== author.id) throw new CustomTrackError('Seul le créateur peut modifier ce circuit. Dupliquez-le pour créer votre version.', 403);
        if (this.damaged.has(id)) throw new CustomTrackError('Une sauvegarde de ce circuit est illisible. Les fichiers sont conservés ; dupliquez la version disponible.', 503);
        if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) throw new CustomTrackError('Version de circuit invalide.');
        if (expectedRevision !== previous.revision) throw new CustomTrackError('Ce circuit a été modifié depuis son ouverture. Rechargez-le avant de sauvegarder.', 409);
        await this.checkLatestRevision(previous);
        if (previous.revision >= this.maxRevisions) throw new CustomTrackError('Ce circuit a atteint sa limite de versions. Dupliquez-le pour continuer.', 409);
      } else {
        if (this.latest.size >= this.maxTracks) throw new CustomTrackError('La bibliothèque de circuits est pleine.', 409);
        if ([...this.latest.values()].filter(track => track.authorId === author.id).length >= this.maxTracksPerAuthor)
          throw new CustomTrackError('Vous avez atteint la limite de circuits par pilote. Modifiez un de vos circuits existants.', 409);
      }
      const now = new Date(this.now()).toISOString();
      const record: OwnedTrack = { id: previous?.id ?? `custom-${randomUUID()}`, revision: (previous?.revision ?? 0) + 1,
        draft, authorId: author.id, authorName: author.name, createdAt: previous?.createdAt ?? now,
        updatedAt: previous && previous.updatedAt > now ? previous.updatedAt : now, runtimeId: '' };
      record.runtimeId = customTrackRuntimeId(record);
      compileCustomTrack(record);
      await this.persist(record);
      registerCustomTrack(record);
      this.install(record);
      return clone(record);
    });
  }

  async flush(): Promise<void> { await this.tail; }

  private install(record: OwnedTrack) {
    this.records.set(record.runtimeId, record);
    if (!this.deleted.has(record.id) && (this.latest.get(record.id)?.revision ?? 0) < record.revision) this.latest.set(record.id, record);
  }

  private validateAuthor(author: TrackAuthor) {
    if (!author || typeof author.id !== 'string' || !author.id.length || author.id.length > 80 ||
      typeof author.name !== 'string' || !author.name.trim() || author.name.length > 80) throw new CustomTrackError('Profil invalide.', 401);
  }

  private retire(id: string) {
    this.deleted.add(id); this.latest.delete(id); retireCustomTrackDefinition(id);
  }

  private async exists(file: string): Promise<boolean> {
    try { await stat(join(this.directory, file)); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw new CustomTrackError('La bibliothèque de circuits est temporairement indisponible.', 503);
    }
  }

  private async checkNotDeleted(id: string) {
    if (this.deleted.has(id) || await this.exists(id + '.deleted.json')) {
      this.retire(id); throw new CustomTrackError('Ce circuit a été supprimé.', 404);
    }
  }

  private async checkLatestRevision(record: OwnedTrack) {
    if (await this.exists(`${record.id}-v${record.revision + 1}.json`))
      throw new CustomTrackError('Ce circuit a été modifié. Rechargez la bibliothèque avant de réessayer.', 409);
  }

  private readRecord(input: unknown): OwnedTrack {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Circuit absent.');
    const value = input as Record<string, unknown>;
    if (typeof value.id !== 'string' || !logicalId.test(value.id) || !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 1 || Number(value.revision) > 10_000 || typeof value.authorId !== 'string' ||
      !value.authorId.length || value.authorId.length > 80 || typeof value.authorName !== 'string' ||
      !value.authorName.trim() || value.authorName.length > 80 || !isTimestamp(value.createdAt) ||
      !isTimestamp(value.updatedAt) || value.updatedAt < value.createdAt)
      throw new Error('Métadonnées de circuit invalides.');
    const validation = validateCustomTrackDraft(value.draft);
    if (!validation.ok || !validation.draft) throw new Error('Géométrie invalide.');
    const record: OwnedTrack = { id: value.id, revision: Number(value.revision), draft: validation.draft,
      authorId: value.authorId, authorName: value.authorName, createdAt: value.createdAt,
      updatedAt: value.updatedAt, runtimeId: '' };
    record.runtimeId = customTrackRuntimeId(record);
    if (value.runtimeId !== record.runtimeId) throw new Error('Version de circuit incohérente.');
    compileCustomTrack(record);
    return record;
  }

  private async persist(record: OwnedTrack) {
    return this.persistFile(record.runtimeId, record, 'Le circuit ne peut pas être sauvegardé pour le moment. Votre dessin reste ouvert.');
  }

  private async persistFile(name: string, record: unknown, failureMessage: string) {
    const destination = join(this.directory, name + '.json');
    const temporary = join(this.directory, `.${name}.${randomUUID()}.tmp`);
    const data = JSON.stringify(record) + '\n';
    if (Buffer.byteLength(data) > CUSTOM_TRACK_FILE_LIMIT) throw new CustomTrackError('Circuit trop volumineux.', 413);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(data, 'utf8'); await file.sync(); } finally { await file.close(); }
      // A hard link publishes the complete file atomically and refuses to replace any existing revision.
      await link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new CustomTrackError('Cette version existe déjà sur disque. Rechargez le serveur avant de réessayer.', 409);
      throw new CustomTrackError(failureMessage, 503);
    } finally { await unlink(temporary).catch(() => {}); }
  }

  private transaction<T>(operation: () => Promise<T>): Promise<T> {
    // All instances for a directory serialize writes, including reload/test
    // instances whose in-memory catalogue may lag behind a newer revision.
    const pending = (directoryWrites.get(this.directory) ?? this.tail).then(operation);
    this.tail = pending.catch(() => {});
    directoryWrites.set(this.directory, this.tail);
    return pending;
  }
}

const stores = new Map<string, Promise<CustomTrackStore>>();
export function customTrackStore(): Promise<CustomTrackStore> {
  const players = resolve(process.env.PLAYER_DATA_DIR ?? 'data/players');
  const directory = resolve(process.env.CUSTOM_TRACK_DATA_DIR ?? join(basename(players) === 'players' ? dirname(players) : players, 'tracks'));
  let pending = stores.get(directory);
  if (!pending) { pending = CustomTrackStore.open(directory); stores.set(directory, pending); }
  return pending;
}
