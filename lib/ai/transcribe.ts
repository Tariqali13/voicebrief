import { toFile } from 'openai';
import { env } from '../env';
import { addUsage, client, model, type Usage } from './providers';
import { SAMPLE_MEETINGS } from '../samples';

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  segments: Segment[];
  language: string | null;
  duration: number;
}

export const ACCEPTED_AUDIO = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/flac', 'video/webm', 'video/mp4'];

/**
 * Speech to text with segment timestamps (Whisper `verbose_json`). Timestamps are
 * what let every summary item and every answer link back to the exact moment it
 * came from.
 */
export async function transcribe(audio: Blob, fileName: string, usage: Usage): Promise<Transcript> {
  const e = env();
  if (e.transcribe === 'fake') {
    // No API key configured: return a sample so the rest of the pipeline can be exercised offline.
    const sample = SAMPLE_MEETINGS[0]!;
    addUsage(usage, null, sample.segments.at(-1)?.end ?? 0);
    return { segments: sample.segments, language: 'en', duration: sample.segments.at(-1)?.end ?? 0 };
  }
  const provider = e.transcribe;
  const res = (await client(provider).audio.transcriptions.create({
    file: await toFile(audio, fileName),
    model: model(provider, 'transcribe', e.TRANSCRIBE_MODEL),
    response_format: 'verbose_json',
    temperature: 0,
  })) as unknown as { text: string; language?: string; duration?: number; segments?: { start: number; end: number; text: string }[] };

  const segments = cleanSegments(res.segments?.length ? res.segments : [{ start: 0, end: res.duration ?? 0, text: res.text }]);
  const duration = res.duration ?? segments.at(-1)?.end ?? 0;
  addUsage(usage, null, duration);
  return { segments, language: res.language ?? null, duration };
}

/** Whisper sometimes emits empty or repeated filler segments ("Thank you." x 20 on silence). */
export function cleanSegments(raw: { start: number; end: number; text: string }[]): Segment[] {
  const out: Segment[] = [];
  for (const s of raw) {
    const text = s.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const prev = out.at(-1);
    if (prev && prev.text === text && s.start - prev.end < 2) {
      prev.end = s.end; // collapse hallucinated repeats
      continue;
    }
    out.push({ start: round(s.start), end: round(s.end), text });
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
