import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, ready } from '@/lib/db';
import { processMeeting, type Progress } from '@/lib/pipeline';
import { getMeeting, listMeetings, takeQuota, deleteMeeting } from '@/lib/meetings';
import { answer, retrieve } from '@/lib/ai/answer';
import { SAMPLE_MEETINGS } from '@/lib/samples';

/** End-to-end against Postgres + pgvector, with the offline providers. */
const alice = 'alice_device_00000000000000000000'.slice(0, 32);
const bob = 'bob_device_0000000000000000000000'.slice(0, 32);

async function addSample(owner: string, i: number) {
  const s = SAMPLE_MEETINGS[i]!;
  const events: Progress[] = [];
  const id = await processMeeting(
    { ownerId: owner, title: s.title, source: 'sample', transcript: { segments: s.segments, language: 'en', duration: s.segments.at(-1)!.end } },
    (p) => events.push(p),
  );
  return { id: id!, events };
}

beforeAll(async () => {
  await ready();
  await pool().query('TRUNCATE meetings, usage_events CASCADE');
});
afterAll(() => pool().end());

describe('meeting pipeline', () => {
  it('reports each stage and stores a grounded summary with transcript and index', async () => {
    const { id, events } = await addSample(alice, 0);
    expect(events.map((e) => e.stage)).toEqual(['transcribing', 'indexing', 'summarizing', 'done']);

    const m = await getMeeting(alice, id);
    expect(m).toMatchObject({ status: 'ready', title: 'Checkout team stand-up', method: 'heuristic' });
    expect(m!.segments).toHaveLength(SAMPLE_MEETINGS[0]!.segments.length);
    // Every surviving item cites real transcript lines.
    for (const item of [...m!.summary!.decisions, ...m!.summary!.actionItems]) {
      for (const n of item.evidence) expect(n).toBeLessThan(m!.segments.length);
    }
    expect(m!.usage).toHaveProperty('timingsMs');
    const { rows } = await pool().query('SELECT count(*)::int AS n FROM chunks WHERE meeting_id = $1', [id]);
    expect(rows[0].n).toBeGreaterThan(1);
  });

  it('marks a meeting as failed with a readable message when there is no speech', async () => {
    const events: Progress[] = [];
    const id = await processMeeting({ ownerId: alice, source: 'upload', transcript: { segments: [], language: null, duration: 0 } }, (p) => events.push(p));
    expect(id).toBeNull();
    expect(events.at(-1)).toMatchObject({ stage: 'error', message: 'No speech was detected in that recording.' });
  });
});

describe('asking across meetings', () => {
  it('retrieves the right moment with hybrid search', async () => {
    await addSample(alice, 2);
    const hits = await retrieve(alice, 'who will add the rebuild job to the dashboard?');
    expect(hits[0]!.meetingTitle).toBe('Search outage incident review');
    expect(hits[0]!.text).toMatch(/dashboard/i);
  });

  it('streams sources, text and only valid citations', async () => {
    const events = [];
    for await (const e of answer(alice, 'What did we decide about Google Places quota?')) events.push(e);
    expect(events[0]!.type).toBe('sources');
    const done = events.at(-1)!;
    expect(done.type).toBe('done');
    if (done.type === 'done') expect(done.cited.length).toBeGreaterThan(0);
  });

  it('never returns another device’s meetings', async () => {
    const { id } = await addSample(bob, 1);
    expect(await getMeeting(alice, id)).toBeNull();
    expect(await deleteMeeting(alice, id)).toBe(false);
    const hits = await retrieve(alice, 'Harbour Coffee Square subscriptions GoDaddy');
    expect(hits.every((h) => h.meetingId !== id)).toBe(true);
    expect((await listMeetings(bob)).map((m) => m.id)).toEqual([id]);
  });

  it('can be limited to a single meeting', async () => {
    const meetings = await listMeetings(alice);
    const standup = meetings.find((m) => m.title === 'Checkout team stand-up')!;
    const hits = await retrieve(alice, 'dashboard', { meetingId: standup.id });
    expect(hits.every((h) => h.meetingId === standup.id)).toBe(true);
  });
});

describe('quotas', () => {
  it('enforces a sliding window per device', async () => {
    const device = 'quota_device_0000000000000000000'.slice(0, 32);
    const results = [];
    for (let i = 0; i < 10; i++) results.push(await takeQuota(device, 'meeting'));
    expect(results.filter((r) => r.ok)).toHaveLength(8);
    const last = results.at(-1)!;
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.retryAfterSec).toBeGreaterThan(3600);
  });
});
