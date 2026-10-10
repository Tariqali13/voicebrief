import { createHash } from 'node:crypto';
import { env } from '../env';
import { addUsage, client, model, type Usage } from './providers';

/** Fixed width for the vector column. Larger embeddings are truncated (see below). */
export const EMBEDDING_DIMS = 768;
const BATCH = 64;

/**
 * Both default embedding models (OpenAI text-embedding-3, Gemini embedding-001) are
 * trained with Matryoshka representation learning: their leading dimensions carry
 * the most information, so a vector can be truncated and re-normalised with little
 * loss. That lets one 768-dim column serve either vendor.
 */
export function fit(vector: number[], dims = EMBEDDING_DIMS): number[] {
  const v = vector.slice(0, dims);
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export async function embed(texts: string[], usage: Usage): Promise<number[][]> {
  const e = env();
  if (e.embed === 'fake') return texts.map(hashEmbedding);
  const provider = e.embed as 'openai' | 'gemini';
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await client(provider).embeddings.create({
      model: model(provider, 'embed', e.EMBED_MODEL),
      input: batch,
      ...(provider === 'openai' ? { dimensions: EMBEDDING_DIMS } : {}),
    });
    addUsage(usage, { prompt_tokens: res.usage?.prompt_tokens ?? 0 });
    out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => fit(d.embedding)));
  }
  return out;
}

/**
 * Offline stand-in: hashed bag of word stems. Not semantic, but deterministic and
 * lexical enough for tests and for running the app with no API keys.
 */
export function hashEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    const stem = word.replace(/(ing|ed|es|s)$/, '');
    const h = createHash('md5').update(stem).digest();
    v[h.readUInt16BE(0) % EMBEDDING_DIMS]! += h[2]! & 1 ? 1 : -1;
  }
  return fit(v);
}
