import { z } from 'zod';
import { ownerId } from '@/lib/owner';
import { takeQuota } from '@/lib/meetings';
import { answer } from '@/lib/ai/answer';
import { ndjson, problem } from '@/lib/http';

export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(3).max(500),
  meetingId: z.uuid().optional(),
});

export async function POST(req: Request) {
  const owner = await ownerId();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return problem(400, 'Ask a question between 3 and 500 characters.');
  const quota = await takeQuota(owner, 'question');
  if (!quota.ok) return problem(429, 'That’s a lot of questions! Try again in a little while.', { retryAfterSec: quota.retryAfterSec });

  return ndjson(async (send) => {
    for await (const event of answer(owner, body.data.question, body.data.meetingId)) send(event);
  });
}
