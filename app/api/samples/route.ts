import { ownerId } from '@/lib/owner';
import { listMeetings, takeQuota } from '@/lib/meetings';
import { processMeeting } from '@/lib/pipeline';
import { SAMPLE_MEETINGS } from '@/lib/samples';
import { problem } from '@/lib/http';

export const maxDuration = 300;

/** Adds the three sample meetings to this browser's library (transcripts included, so no audio is needed). */
export async function POST() {
  const owner = await ownerId();
  const existing = new Set((await listMeetings(owner)).filter((m) => m.source === 'sample').map((m) => m.title));
  const todo = SAMPLE_MEETINGS.filter((s) => !existing.has(s.title));
  if (todo.length === 0) return Response.json({ added: 0 });
  const quota = await takeQuota(owner, 'meeting');
  if (!quota.ok) return problem(429, 'Try again later.', { retryAfterSec: quota.retryAfterSec });

  const ids = await Promise.all(
    todo.map((s) =>
      processMeeting({
        ownerId: owner,
        title: s.title,
        source: 'sample',
        transcript: { segments: s.segments, language: 'en', duration: s.segments.at(-1)!.end },
      }),
    ),
  );
  return Response.json({ added: ids.filter(Boolean).length });
}
