import { describe, expect, it } from 'vitest';
import { chunkSegments } from '@/lib/ai/chunk';
import { ground, sections, clock, formatTranscript } from '@/lib/ai/summarize';
import { fuse, citedRefs, type Source } from '@/lib/ai/answer';
import { cleanSegments } from '@/lib/ai/transcribe';
import { fit, hashEmbedding, EMBEDDING_DIMS } from '@/lib/ai/embed';
import type { Summary } from '@/lib/ai/schema';
import { SAMPLE_MEETINGS } from '@/lib/samples';
import { env } from '@/lib/env';

const segs = SAMPLE_MEETINGS[0]!.segments;

describe('chunking', () => {
  it('covers every segment, in order, without splitting any', () => {
    const chunks = chunkSegments(segs, 300);
    const covered = new Set(chunks.flatMap((c) => Array.from({ length: c.segmentTo - c.segmentFrom + 1 }, (_, i) => c.segmentFrom + i)));
    expect(covered.size).toBe(segs.length);
    expect(chunks[0]!.start).toBe(segs[0]!.start);
    expect(chunks.at(-1)!.end).toBe(segs.at(-1)!.end);
  });

  it('overlaps neighbouring chunks by one segment so boundary answers stay retrievable', () => {
    const chunks = chunkSegments(segs, 300);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.segmentFrom).toBe(chunks[i - 1]!.segmentTo);
  });

  it('respects the time window even when text is short', () => {
    for (const c of chunkSegments(segs, 10_000, 30)) expect(c.end - c.start).toBeLessThanOrEqual(30 + 8);
  });
});

describe('grounding', () => {
  const base: Summary = {
    title: 'x',
    tldr: 'y',
    keyPoints: [],
    decisions: [
      { text: 'real', evidence: [5] },
      { text: 'made up', evidence: [999] },
    ],
    actionItems: [
      { task: 'pair on caching', owner: 'Marcus', due: 'Thursday', evidence: [7, 7, 6] },
      { task: 'invented owner', owner: 'Bartholomew', due: null, evidence: [3] },
      { task: 'no evidence', owner: null, due: null, evidence: [-1] },
    ],
    openQuestions: [],
    topics: ['Checkout', 'checkout ', 'caching'],
  };

  it('drops items whose evidence points nowhere, and dedupes/sorts evidence', () => {
    const { summary, dropped } = ground(base, segs);
    expect(summary.decisions.map((d) => d.text)).toEqual(['real']);
    expect(summary.actionItems[0]!.evidence).toEqual([6, 7]);
    expect(summary.actionItems.map((a) => a.task)).not.toContain('no evidence');
    expect(dropped).toBe(3); // made-up decision, missing evidence, invented owner
  });

  it('never keeps an owner whose name is not in the transcript', () => {
    const { summary } = ground(base, segs);
    expect(summary.actionItems.find((a) => a.task === 'invented owner')!.owner).toBeNull();
    expect(summary.actionItems[0]!.owner).toBe('Marcus');
  });

  it('normalises topics', () => {
    expect(ground(base, segs).summary.topics).toEqual(['checkout', 'caching']);
  });
});

describe('long meetings', () => {
  it('splits into sections on segment boundaries that cover everything once', () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: `Line ${i} ${'words '.repeat(10)}` }));
    const parts = sections(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]![0]).toBe(0);
    expect(parts.at(-1)![1]).toBe(long.length);
    for (let i = 1; i < parts.length; i++) expect(parts[i]![0]).toBe(parts[i - 1]![1]);
  });

  it('numbers transcript lines globally so evidence survives sectioning', () => {
    expect(formatTranscript(segs, 3, 5).split('\n')[0]).toMatch(/^\[3\] \(0:16\)/);
    expect(clock(3725)).toBe('1:02:05');
  });
});

describe('transcript cleanup', () => {
  it('collapses Whisper’s repeated filler on silence and drops empty segments', () => {
    const out = cleanSegments([
      { start: 0, end: 2, text: ' Hello  there ' },
      { start: 2, end: 3, text: '' },
      { start: 30, end: 32, text: 'Thank you.' },
      { start: 32.5, end: 34, text: 'Thank you.' },
      { start: 34.2, end: 36, text: 'Thank you.' },
    ]);
    expect(out).toEqual([
      { start: 0, end: 2, text: 'Hello there' },
      { start: 30, end: 36, text: 'Thank you.' },
    ]);
  });
});

describe('retrieval fusion and citations', () => {
  const row = (id: number) => ({ id, meetingId: 'm', meetingTitle: 't', start: 0, end: 1, text: String(id) });

  it('reciprocal rank fusion rewards agreement between keyword and vector rankings', () => {
    const fused = fuse([[row(1), row(2), row(3)], [row(3), row(4)]], 3);
    expect(fused[0]!.id).toBe(3); // ranked by both lists
    expect(fused.map((r) => r.id)).toHaveLength(3);
  });

  it('only counts citations that refer to sources actually provided', () => {
    const sources = [{ ref: 'S1' }, { ref: 'S2' }] as Source[];
    expect(citedRefs('Yes [S2], also [S1][S2] and [S9].', sources)).toEqual(['S2', 'S1']);
    // Grouped style some models use.
    expect(citedRefs('Daniel ships it by Wednesday [S1, S2].', sources)).toEqual(['S1', 'S2']);
    expect(citedRefs('See [S2;S1] and [S9, S1].', sources)).toEqual(['S2', 'S1']);
  });
});

describe('embeddings', () => {
  it('truncates and re-normalises larger vectors to the column width', () => {
    const v = fit(Array.from({ length: 3072 }, (_, i) => (i % 7) - 3));
    expect(v).toHaveLength(EMBEDDING_DIMS);
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
  });

  it('offline embeddings are deterministic and lexically similar for shared words', () => {
    const a = hashEmbedding('payment retry idempotency key');
    const b = hashEmbedding('the idempotency key for payments');
    const c = hashEmbedding('holiday release freeze');
    const dot = (x: number[], y: number[]) => x.reduce((s, xi, i) => s + xi * y[i]!, 0);
    expect(hashEmbedding('payment retry idempotency key')).toEqual(a);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});

describe('provider selection', () => {
  it('uses free vendors when their keys are present and offline fakes otherwise', () => {
    expect(env({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm' } as unknown as NodeJS.ProcessEnv)).toMatchObject({ transcribe: 'groq', llm: 'groq', embed: 'gemini' });
    expect(env({ OPENAI_API_KEY: 'o' } as unknown as NodeJS.ProcessEnv)).toMatchObject({ transcribe: 'openai', llm: 'openai', embed: 'openai' });
    expect(env({} as unknown as NodeJS.ProcessEnv)).toMatchObject({ transcribe: 'fake', llm: 'fake', embed: 'fake' });
    expect(() => env({ EMBED_PROVIDER: 'groq' } as unknown as NodeJS.ProcessEnv)).toThrow(/no embeddings/);
  });
});
