import { z } from 'zod';
import { env } from '@/lib/env';
import { ownerId } from '@/lib/owner';
import { listMeetings, takeQuota } from '@/lib/meetings';
import { processMeeting, type Progress } from '@/lib/pipeline';
import { ACCEPTED_AUDIO } from '@/lib/ai/transcribe';
import { ndjson, problem } from '@/lib/http';

// Transcription + summarisation of a long recording can take a while on free tiers.
export const maxDuration = 300;

export async function GET() {
  const owner = await ownerId();
  return Response.json({ meetings: await listMeetings(owner) });
}

const Fields = z.object({
  title: z.string().trim().max(120).optional(),
  source: z.enum(['recording', 'upload']).default('upload'),
});

export async function POST(req: Request) {
  const owner = await ownerId();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return problem(400, 'Send the recording as multipart form data.');
  }
  const audio = form.get('audio');
  const fields = Fields.safeParse({ title: form.get('title') ?? undefined, source: form.get('source') ?? undefined });
  if (!(audio instanceof Blob) || audio.size === 0) return problem(400, 'Attach an audio file.');
  if (!fields.success) return problem(400, 'Invalid title or source.');

  const type = audio.type.split(';')[0]!.toLowerCase();
  if (!ACCEPTED_AUDIO.includes(type)) return problem(415, 'Use an audio file: webm, ogg, mp3, m4a, mp4, wav or flac.');
  const maxBytes = env().MAX_AUDIO_MB * 1024 * 1024;
  if (audio.size > maxBytes) return problem(413, `Recordings can be up to ${env().MAX_AUDIO_MB} MB (about 25 minutes of compressed audio).`);

  const quota = await takeQuota(owner, 'meeting');
  if (!quota.ok) return problem(429, 'You’ve hit today’s limit for new meetings on this demo. Try again later.', { retryAfterSec: quota.retryAfterSec });

  const fileName = (audio as File).name || `recording.${type.split('/')[1] ?? 'webm'}`;
  return ndjson<Progress>(async (send) => {
    await processMeeting({ ownerId: owner, title: fields.data.title, source: fields.data.source, audio: { blob: audio, fileName } }, send);
  });
}
