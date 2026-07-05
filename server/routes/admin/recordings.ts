import express from 'express';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq, inArray, sql } from 'drizzle-orm';
import { jwtAuth, requireAdmin, requireModerator } from '../../jwt-middleware.js';
import { db } from '../../db.js';
import { logger } from '../../lib/logger.js';
import { getStudioRecordingsDir } from '../../lib/studio-recording-storage.js';
import { books, clubBooks, clubs, readingSessions, sessionRecordings, users } from '../../../shared/schema.js';

const STUDIO_RECORDINGS_DIR = getStudioRecordingsDir();
const STUDIO_RECORDING_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-(.+))?\.mp3$/i;
const execFileAsync = promisify(execFile);

function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return fallback;
  return max ? Math.min(normalized, max) : normalized;
}

function parseAdminPagination(pageRaw: unknown, limitRaw: unknown) {
  const page = parsePositiveInt(pageRaw, 1);
  const limit = parsePositiveInt(limitRaw, 20, 100);
  return { page, limit, offset: (page - 1) * limit };
}

interface StudioRecordingFileEntry {
  id: string;
  fileName: string;
  filePath: string;
  sessionId: string;
  fileSize: number;
  recordedAt: string;
}

interface StudioRecordingSessionMeta {
  sessionId: string;
  clubId: string;
  clubName: string | null;
  bookId: string;
  bookTitle: string | null;
  currentChapter: number;
  readerId: string | null;
  readerName: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  isActive: boolean;
  isLive: boolean;
}

async function probeStudioRecordingDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);

    const value = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return Math.round(value);
  } catch (error) {
    logger.warn({ error, filePath }, 'Failed to probe studio recording duration');
    return null;
  }
}

function parseStudioRecordingFileName(fileName: string): { sessionId: string; recordedAt: string | null } | null {
  const match = STUDIO_RECORDING_FILE_RE.exec(fileName);
  if (match === null) {
    return null;
  }

  const sessionId = match[1];
  const rawTimestamp = match[2]?.replace(/\.mp3$/i, '') ?? '';
  if (!rawTimestamp) {
    return {
      sessionId,
      recordedAt: null,
    };
  }

  const isoTimestamp = rawTimestamp.replace(/-(\d{3})Z$/, '.$1Z');
  const parsedTime = new Date(isoTimestamp);

  return {
    sessionId,
    recordedAt: Number.isNaN(parsedTime.getTime()) ? null : parsedTime.toISOString(),
  };
}

function resolveStudioRecordingPath(recordingId: string): string | null {
  if (!recordingId || path.basename(recordingId) !== recordingId) {
    return null;
  }

  const baseDir = path.resolve(STUDIO_RECORDINGS_DIR);
  const resolvedPath = path.resolve(baseDir, recordingId);
  if (resolvedPath !== path.join(baseDir, recordingId)) {
    return null;
  }

  return resolvedPath;
}

async function listStudioRecordingFiles(): Promise<StudioRecordingFileEntry[]> {
  try {
    const entries = await fs.readdir(STUDIO_RECORDINGS_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
        .map(async (entry) => {
          const parsed = parseStudioRecordingFileName(entry.name);
          if (!parsed) {
            return null;
          }

          const filePath = path.join(STUDIO_RECORDINGS_DIR, entry.name);
          const stats = await fs.stat(filePath);
          return {
            id: entry.name,
            fileName: entry.name,
            filePath,
            sessionId: parsed.sessionId,
            fileSize: stats.size,
            recordedAt: parsed.recordedAt ?? stats.mtime.toISOString(),
          } satisfies StudioRecordingFileEntry;
        })
    );

    return files
      .filter((file): file is StudioRecordingFileEntry => file !== null)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function getStudioRecordingSessionMeta(sessionIds: string[]): Promise<Map<string, StudioRecordingSessionMeta>> {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      sessionId: readingSessions.id,
      clubId: readingSessions.clubId,
      clubName: clubs.title,
      bookId: readingSessions.bookId,
      bookTitle: sql<string | null>`coalesce(${clubBooks.title}, ${books.title})`,
      currentChapter: readingSessions.currentChapter,
      readerId: users.id,
      readerName: users.username,
      startedAt: readingSessions.startedAt,
      endedAt: readingSessions.endedAt,
      isActive: readingSessions.isActive,
      isLive: readingSessions.isLive,
    })
    .from(readingSessions)
    .leftJoin(clubs, eq(readingSessions.clubId, clubs.id))
    .leftJoin(users, eq(readingSessions.readerId, users.id))
    .leftJoin(clubBooks, eq(readingSessions.bookId, clubBooks.id))
    .leftJoin(books, eq(readingSessions.bookId, books.id))
    .where(inArray(readingSessions.id, sessionIds));

  return new Map(rows.map((row) => [row.sessionId, row]));
}

function recordingMatchesSearch(
  search: string,
  file: StudioRecordingFileEntry,
  meta: StudioRecordingSessionMeta | undefined,
): boolean {
  if (!search) {
    return true;
  }

  const haystack = [
    file.fileName,
    meta?.clubName,
    meta?.bookTitle,
    meta?.readerName,
    meta?.currentChapter ? `глава ${meta.currentChapter}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function getAudioMimeType(filePath: string): string {
  return path.extname(filePath).toLowerCase() === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';
}

async function sendFileRangeResponse(req: express.Request, res: express.Response, filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  const range = req.headers.range;
  const contentType = getAudioMimeType(filePath);

  if (!range) {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(filePath);
    return;
  }

  const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-');
  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;

  if (!Number.isFinite(start) || start < 0 || start >= fileSize || end < start) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(end - start + 1));
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);

  const stream = createReadStream(filePath, { start, end });
  stream.pipe(res);
}


export function createAdminRecordingsRouter() {
  const router = express.Router();

// ==== STUDIO RECORDINGS MANAGEMENT ====

router.get('/recordings', jwtAuth, requireModerator, async (req, res) => {
  try {
    const { page, limit, offset } = parseAdminPagination(req.query.page, req.query.limit);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const clubId = typeof req.query.clubId === 'string' && req.query.clubId.trim() ? req.query.clubId.trim() : null;
    const readerId = typeof req.query.readerId === 'string' && req.query.readerId.trim() ? req.query.readerId.trim() : null;
    const bookId = typeof req.query.bookId === 'string' && req.query.bookId.trim() ? req.query.bookId.trim() : null;
    const sort = req.query.sort === 'asc' ? 'asc' : 'desc';

    const files = await listStudioRecordingFiles();
    const sessionMetaMap = await getStudioRecordingSessionMeta([...new Set(files.map((file) => file.sessionId))]);
    const existingRecordingRows = files.length === 0
      ? []
      : await db
        .select()
        .from(sessionRecordings)
        .where(inArray(sessionRecordings.sessionId, [...new Set(files.map((file) => file.sessionId))]));
    const existingRecordingSessionIds = new Set(existingRecordingRows.map((recording) => recording.sessionId));
    const recordingRowBySessionId = new Map(
      existingRecordingRows.map((recording) => [recording.sessionId, recording]),
    );
    const recordingRowByStorageKey = new Map(
      existingRecordingRows
        .filter((recording) => recording.storageKey)
        .map((recording) => [recording.storageKey as string, recording]),
    );
    const durationEntries = await Promise.all(
      files.map(async (file) => [file.id, await probeStudioRecordingDurationSeconds(file.filePath)] as const),
    );
    const durationMap = new Map(durationEntries);

    for (const file of files) {
      if (recordingRowByStorageKey.has(`local:${file.fileName}`)) {
        continue;
      }

      if (existingRecordingSessionIds.has(file.sessionId)) {
        continue;
      }

      const meta = sessionMetaMap.get(file.sessionId);
      if (!meta?.clubId) {
        continue;
      }

      if (meta.isActive || meta.isLive || !meta.endedAt) {
        continue;
      }

      const [createdRecording] = await db
        .insert(sessionRecordings)
        .values({
          sessionId: file.sessionId,
          clubId: meta.clubId,
          recordingUrl: `/api/v1/admin/recordings/${encodeURIComponent(file.id)}/stream`,
          storageKey: `local:${file.fileName}`,
          duration: durationMap.get(file.id) ?? null,
          fileSize: file.fileSize,
          format: 'mp3',
          status: 'ready',
          isLocal: true,
          isBackup: false,
          bitrate: 64,
          sampleRate: 48000,
          channels: 1,
          isAvailable: false,
          publicationRequested: false,
          moderationStatus: 'pending',
          isPublished: false,
          allowStreaming: false,
          allowDownload: false,
          metadata: JSON.stringify({
            fileName: file.fileName,
            title: meta.bookTitle ?? `Studio session ${file.sessionId}`,
            arbitrationOnly: true,
            syncedFromLocalFileAt: new Date().toISOString(),
          }),
        })
        .returning();

      if (createdRecording) {
        recordingRowBySessionId.set(file.sessionId, createdRecording);
        recordingRowByStorageKey.set(`local:${file.fileName}`, createdRecording);
        existingRecordingSessionIds.add(file.sessionId);
      }
    }

    const recordings = files.map((file) => {
      const meta = sessionMetaMap.get(file.sessionId);
      const recordingRow = recordingRowByStorageKey.get(`local:${file.fileName}`) ?? recordingRowBySessionId.get(file.sessionId);
      return {
        id: file.id,
        databaseId: recordingRow?.id ?? null,
        fileName: file.fileName,
        sessionId: file.sessionId,
        clubId: meta?.clubId ?? null,
        clubName: meta?.clubName ?? 'Неизвестный клуб',
        bookId: meta?.bookId ?? null,
        bookTitle: meta?.bookTitle ?? 'Неизвестная книга',
        chapter: meta?.currentChapter ?? null,
        readerId: meta?.readerId ?? null,
        readerName: meta?.readerName ?? 'Неизвестный чтец',
        recordedAt: file.recordedAt,
        sessionStartedAt: meta?.startedAt?.toISOString() ?? null,
        durationSeconds: durationMap.get(file.id) ?? null,
        fileSize: file.fileSize,
        moderationStatus: recordingRow?.moderationStatus ?? null,
        publicationRequested: recordingRow?.publicationRequested ?? true,
        moderationNotes: recordingRow?.moderationNotes ?? null,
        moderatedAt: recordingRow?.moderatedAt?.toISOString() ?? null,
        isPublished: recordingRow?.isPublished ?? false,
        publishedAt: recordingRow?.publishedAt?.toISOString() ?? null,
        allowStreaming: recordingRow?.allowStreaming ?? false,
        allowDownload: recordingRow?.allowDownload ?? false,
        streamUrl: `/api/v1/admin/recordings/${encodeURIComponent(file.id)}/stream`,
        downloadUrl: `/api/v1/admin/recordings/${encodeURIComponent(file.id)}/download`,
      };
    });

    const clubs = Array.from(
      new Map(
        recordings
          .filter((recording) => recording.clubId !== null)
          .map((recording) => [recording.clubId as string, { id: recording.clubId as string, name: recording.clubName }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const readers = Array.from(
      new Map(
        recordings
          .filter((recording) => recording.readerId !== null)
          .map((recording) => [recording.readerId as string, { id: recording.readerId as string, name: recording.readerName }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const books = Array.from(
      new Map(
        recordings
          .filter((recording) => recording.bookId !== null)
          .map((recording) => [recording.bookId as string, { id: recording.bookId as string, name: recording.bookTitle }]),
      ).values(),
    ).sort((left, right) => left.name.localeCompare(right.name, 'ru'));

    const filtered = recordings.filter((recording) => {
      const meta = sessionMetaMap.get(recording.sessionId);
      if (!recordingMatchesSearch(search, {
        id: recording.id,
        fileName: recording.fileName,
        filePath: '',
        sessionId: recording.sessionId,
        fileSize: recording.fileSize,
        recordedAt: recording.recordedAt,
      }, meta)) {
        return false;
      }

      if (clubId && recording.clubId !== clubId) {
        return false;
      }

      if (readerId && recording.readerId !== readerId) {
        return false;
      }

      if (bookId && recording.bookId !== bookId) {
        return false;
      }

      return true;
    });

    filtered.sort((left, right) => {
      const diff = left.recordedAt.localeCompare(right.recordedAt);
      return sort === 'asc' ? diff : -diff;
    });

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    res.json({
      recordings: paginated,
      filters: {
        clubs,
        readers,
        books,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list admin studio recordings');
    res.status(500).json({ message: 'Не удалось получить список записей эфиров' });
  }
});

router.get('/recordings/:id/download', jwtAuth, requireModerator, async (req, res) => {
  try {
    const filePath = resolveStudioRecordingPath(req.params.id);
    if (!filePath) {
      return res.status(400).json({ message: 'Некорректный идентификатор записи' });
    }

    await fs.access(filePath);
    res.download(filePath, path.basename(filePath));
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({ message: 'Файл записи не найден' });
    }

    logger.error({ error }, 'Failed to download admin studio recording');
    res.status(500).json({ message: 'Не удалось скачать запись эфира' });
  }
});

router.get('/recordings/:id/stream', jwtAuth, requireModerator, async (req, res) => {
  try {
    const filePath = resolveStudioRecordingPath(req.params.id);
    if (!filePath) {
      return res.status(400).json({ message: 'Некорректный идентификатор записи' });
    }

    await fs.access(filePath);
    res.setHeader('Cache-Control', 'no-store');
    await sendFileRangeResponse(req, res, filePath);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({ message: 'Файл записи не найден' });
    }

    logger.error({ error }, 'Failed to stream admin studio recording');
    res.status(500).json({ message: 'Не удалось открыть запись эфира' });
  }
});

router.put('/recordings/:id/moderation', jwtAuth, requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { moderationStatus, moderationNotes } = req.body as { moderationStatus?: unknown; moderationNotes?: unknown };

    if (moderationStatus !== 'approved' && moderationStatus !== 'rejected' && moderationStatus !== 'pending') {
      return res.status(400).json({ message: 'Некорректный статус модерации' });
    }

    const [existingRecording] = await db
      .select({ publicationRequested: sessionRecordings.publicationRequested })
      .from(sessionRecordings)
      .where(eq(sessionRecordings.id, id))
      .limit(1);

    if (!existingRecording) {
      return res.status(404).json({ message: 'Запись не найдена в базе данных' });
    }

    if (!existingRecording.publicationRequested) {
      return res.status(409).json({ message: 'Эта запись сохранена только для арбитража и не может быть отправлена в публикацию' });
    }

    const [recording] = await db
      .update(sessionRecordings)
      .set({
        moderationStatus,
        moderationNotes: typeof moderationNotes === 'string' ? moderationNotes.slice(0, 2000) : null,
        moderatedBy: req.user?.id ?? req.user?.userId ?? null,
        moderatedAt: new Date(),
        ...(moderationStatus === 'approved'
          ? {}
          : {
              isPublished: false,
              isAvailable: false,
              publishedBy: null,
              publishedAt: null,
              allowStreaming: false,
              allowDownload: false,
            }),
        updatedAt: new Date(),
      })
      .where(eq(sessionRecordings.id, id))
      .returning();

    if (!recording) {
      return res.status(404).json({ message: 'Запись не найдена в базе данных' });
    }

    res.json({
      success: true,
      recording: {
        id: recording.id,
        moderationStatus: recording.moderationStatus,
        moderationNotes: recording.moderationNotes,
        moderatedAt: recording.moderatedAt?.toISOString() ?? null,
        isPublished: recording.isPublished,
        allowStreaming: recording.allowStreaming,
        allowDownload: recording.allowDownload,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to moderate admin studio recording');
    res.status(500).json({ message: 'Не удалось обновить статус модерации записи' });
  }
});

router.delete('/recordings/:id', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const filePath = resolveStudioRecordingPath(req.params.id);
    if (!filePath) {
      return res.status(400).json({ message: 'Некорректный идентификатор записи' });
    }

    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Запись эфира удалена',
    });
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException | undefined)?.code;
    if (errorCode === 'ENOENT') {
      return res.status(404).json({ message: 'Файл записи не найден' });
    }

    logger.error({ error }, 'Failed to delete admin studio recording');
    res.status(500).json({ message: 'Не удалось удалить запись эфира' });
  }
});

// Массовое удаление записей
router.delete('/recordings', jwtAuth, requireAdmin, async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Необходимо передать массив идентификаторов ids' });
    }

    const MAX_BATCH = 200;
    if (ids.length > MAX_BATCH) {
      return res.status(400).json({ message: `За один запрос можно удалить не более ${MAX_BATCH} записей` });
    }

    let deleted = 0;
    let notFound = 0;

    await Promise.all(
      ids.map(async (id: unknown) => {
        if (typeof id !== 'string') return;
        const filePath = resolveStudioRecordingPath(id);
        if (!filePath) return;
        try {
          await fs.unlink(filePath);
          deleted++;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'ENOENT') {
            notFound++;
          } else {
            logger.warn({ error: err, id }, 'Failed to delete admin studio recording in batch');
          }
        }
      }),
    );

    res.json({ success: true, deleted, notFound });
  } catch (error) {
    logger.error({ error }, 'Failed to batch delete admin studio recordings');
    res.status(500).json({ message: 'Не удалось удалить записи эфиров' });
  }
});


  return router;
}
