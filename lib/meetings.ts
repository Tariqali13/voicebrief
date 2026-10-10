import { pool, ready, toVector } from './db';
import type { Summary } from './ai/schema';
import type { Segment } from './ai/transcribe';
import type { Chunk } from './ai/chunk';
import { env } from './env';

export interface MeetingRow {
  id: string;
  title: string;
  status: 'processing' | 'ready' | 'failed';
  source: 'recording' | 'upload' | 'sample';
  durationSec: number;
  language: string | null;
  summary: Summary | null;
  method: string | null;
  droppedItems: number;
  usage: Record<string, unknown>;
  error: string | null;
  createdAt: string;
}

const COLUMNS = `id, title, status, source, duration_sec AS "durationSec", language, summary, method,
  dropped_items AS "droppedItems", usage, error, created_at AS "createdAt"`;

export async function createMeeting(ownerId: string, title: string, source: MeetingRow['source']): Promise<string> {
  await ready();
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO meetings (owner_id, title, status, source) VALUES ($1, $2, 'processing', $3) RETURNING id`,
    [ownerId, title, source],
  );
  return rows[0]!.id;
}

export async function saveTranscript(meetingId: string, segments: Segment[], duration: number, language: string | null) {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE meetings SET duration_sec = $2, language = $3 WHERE id = $1', [meetingId, duration, language]);
    await client.query(
      `INSERT INTO segments (meeting_id, idx, start_sec, end_sec, text)
       SELECT $1, * FROM unnest($2::int[], $3::real[], $4::real[], $5::text[])`,
      [meetingId, segments.map((_, i) => i), segments.map((s) => s.start), segments.map((s) => s.end), segments.map((s) => s.text)],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function saveChunks(meetingId: string, ownerId: string, chunks: Chunk[], vectors: number[][]) {
  await pool().query(
    `INSERT INTO chunks (meeting_id, owner_id, idx, segment_from, segment_to, start_sec, end_sec, text, embedding)
     SELECT $1, $2, * FROM unnest($3::int[], $4::int[], $5::int[], $6::real[], $7::real[], $8::text[], $9::vector[])`,
    [
      meetingId,
      ownerId,
      chunks.map((c) => c.index),
      chunks.map((c) => c.segmentFrom),
      chunks.map((c) => c.segmentTo),
      chunks.map((c) => c.start),
      chunks.map((c) => c.end),
      chunks.map((c) => c.text),
      vectors.map(toVector),
    ],
  );
}

export async function finishMeeting(meetingId: string, summary: Summary, method: string, dropped: number, usage: object) {
  await pool().query(
    `UPDATE meetings SET status = 'ready', title = $2, summary = $3, method = $4, dropped_items = $5, usage = $6 WHERE id = $1`,
    [meetingId, summary.title, JSON.stringify(summary), method, dropped, JSON.stringify(usage)],
  );
}

export async function failMeeting(meetingId: string, error: string, usage: object) {
  await pool().query(`UPDATE meetings SET status = 'failed', error = $2, usage = $3 WHERE id = $1`, [meetingId, error, JSON.stringify(usage)]);
}

export async function listMeetings(ownerId: string): Promise<MeetingRow[]> {
  await ready();
  const { rows } = await pool().query<MeetingRow>(`SELECT ${COLUMNS} FROM meetings WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 200`, [ownerId]);
  return rows;
}

/** Always scoped by owner: another device's meeting id simply isn't found. */
export async function getMeeting(ownerId: string, id: string): Promise<(MeetingRow & { segments: Segment[] }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ready();
  const { rows } = await pool().query<MeetingRow>(`SELECT ${COLUMNS} FROM meetings WHERE owner_id = $1 AND id = $2`, [ownerId, id]);
  if (!rows[0]) return null;
  const segs = await pool().query<Segment>(
    `SELECT start_sec AS start, end_sec AS "end", text FROM segments WHERE meeting_id = $1 ORDER BY idx`,
    [id],
  );
  return { ...rows[0], segments: segs.rows };
}

export async function deleteMeeting(ownerId: string, id: string): Promise<boolean> {
  await ready();
  const res = await pool().query('DELETE FROM meetings WHERE owner_id = $1 AND id = $2', [ownerId, id]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Sliding-window quota per device. Free API tiers are shared by every visitor of
 * the public demo, so one person can't exhaust them for everyone.
 */
export async function takeQuota(ownerId: string, kind: 'meeting' | 'question'): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  await ready();
  const e = env();
  const [limit, window] = kind === 'meeting' ? [e.MEETINGS_PER_DAY, '1 day'] : [e.QUESTIONS_PER_HOUR, '1 hour'];
  const { rows } = await pool().query<{ n: number; oldest: Date | null }>(
    `SELECT count(*)::int AS n, min(created_at) AS oldest FROM usage_events
      WHERE owner_id = $1 AND kind = $2 AND created_at > now() - $3::interval`,
    [ownerId, kind, window],
  );
  const { n, oldest } = rows[0]!;
  if (n >= limit) {
    const windowMs = kind === 'meeting' ? 86_400_000 : 3_600_000;
    return { ok: false, retryAfterSec: Math.max(60, Math.ceil(((oldest?.getTime() ?? Date.now()) + windowMs - Date.now()) / 1000)) };
  }
  await pool().query('INSERT INTO usage_events (owner_id, kind) VALUES ($1, $2)', [ownerId, kind]);
  return { ok: true };
}
