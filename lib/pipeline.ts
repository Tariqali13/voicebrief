import { chunkSegments } from './ai/chunk';
import { embed } from './ai/embed';
import { emptyUsage, model, type Usage } from './ai/providers';
import { summarize } from './ai/summarize';
import { transcribe, type Transcript } from './ai/transcribe';
import { env } from './env';
import { createMeeting, failMeeting, finishMeeting, saveChunks, saveTranscript } from './meetings';

export type Progress =
  | { stage: 'transcribing' }
  | { stage: 'indexing'; segments: number; durationSec: number }
  | { stage: 'summarizing' }
  | { stage: 'done'; meetingId: string; title: string }
  | { stage: 'error'; message: string; meetingId?: string };

interface Input {
  ownerId: string;
  title?: string;
  source: 'recording' | 'upload' | 'sample';
  audio?: { blob: Blob; fileName: string };
  /** Skip speech-to-text (sample meetings, tests). */
  transcript?: Transcript;
}

/**
 * Audio → transcript → retrieval index → grounded notes, reporting each stage so the
 * UI can show honest progress instead of a spinner. Every stage's timing and token
 * usage is recorded on the meeting.
 */
export async function processMeeting(input: Input, onProgress: (p: Progress) => void = () => undefined): Promise<string | null> {
  const usage: Usage = emptyUsage();
  const timings: Record<string, number> = {};
  const time = async <T>(label: string, fn: () => Promise<T>) => {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      timings[label] = Math.round(performance.now() - t0);
    }
  };
  const meetingId = await createMeeting(input.ownerId, input.title?.trim() || 'Untitled meeting', input.source);
  const report = () => ({ ...usage, timingsMs: timings, models: describeModels() });

  try {
    onProgress({ stage: 'transcribing' });
    const transcript =
      input.transcript ?? (await time('transcribe', () => transcribe(input.audio!.blob, input.audio!.fileName, usage)));
    if (transcript.segments.length === 0) throw new UserFacingError('No speech was detected in that recording.');
    await saveTranscript(meetingId, transcript.segments, transcript.duration, transcript.language);

    onProgress({ stage: 'indexing', segments: transcript.segments.length, durationSec: transcript.duration });
    const chunks = chunkSegments(transcript.segments);
    const vectors = await time('embed', () => embed(chunks.map((c) => c.text), usage));
    await saveChunks(meetingId, input.ownerId, chunks, vectors);

    onProgress({ stage: 'summarizing' });
    const result = await time('summarize', () => summarize(transcript.segments, usage));
    const summary = input.title?.trim() ? { ...result.summary, title: input.title.trim() } : result.summary;
    await finishMeeting(meetingId, summary, result.method, result.dropped, report());

    onProgress({ stage: 'done', meetingId, title: summary.title });
    return meetingId;
  } catch (err) {
    const message = err instanceof UserFacingError ? err.message : 'Something went wrong while processing this meeting. Please try again.';
    console.error('meeting processing failed', { meetingId, err });
    await failMeeting(meetingId, message, report()).catch(() => undefined);
    onProgress({ stage: 'error', message, meetingId });
    return null;
  }
}

export class UserFacingError extends Error {}

function describeModels() {
  const e = env();
  const name = (p: string, kind: 'transcribe' | 'chat' | 'embed', override?: string) =>
    p === 'fake' ? 'offline fallback' : `${p}/${model(p as 'openai', kind, override)}`;
  return {
    transcribe: name(e.transcribe, 'transcribe', e.TRANSCRIBE_MODEL),
    chat: name(e.llm, 'chat', e.LLM_MODEL),
    embed: name(e.embed, 'embed', e.EMBED_MODEL),
  };
}
