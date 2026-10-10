import { z } from 'zod';

const Provider = z.enum(['openai', 'groq', 'gemini', 'fake']);
export type ProviderName = z.infer<typeof Provider>;

const EnvSchema = z.object({
  DATABASE_URL: z.string().url().default('postgres://postgres:postgres@localhost:5432/voicebrief'),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  TRANSCRIBE_PROVIDER: Provider.optional(),
  LLM_PROVIDER: Provider.optional(),
  EMBED_PROVIDER: Provider.optional(),
  TRANSCRIBE_MODEL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  EMBED_MODEL: z.string().optional(),
  /** Free-tier guard rails for the public demo. */
  MAX_AUDIO_MB: z.coerce.number().positive().default(25),
  MEETINGS_PER_DAY: z.coerce.number().int().positive().default(8),
  QUESTIONS_PER_HOUR: z.coerce.number().int().positive().default(40),
});

export type Env = z.infer<typeof EnvSchema> & {
  transcribe: ProviderName;
  llm: ProviderName;
  embed: ProviderName;
};

let cached: Env | null = null;

/**
 * Picks providers from explicit settings, or from whichever API keys are present:
 * Groq (free) for speech and text, Gemini (free) for embeddings, OpenAI if that's
 * the only key, and deterministic offline fakes when there are no keys at all
 * (local development, tests, CI).
 */
export function env(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const e = EnvSchema.parse(source);
  const first = (...candidates: [ProviderName, string | undefined][]) => candidates.find(([, key]) => !!key)?.[0] ?? 'fake';
  const resolved: Env = {
    ...e,
    transcribe: e.TRANSCRIBE_PROVIDER ?? first(['groq', e.GROQ_API_KEY], ['openai', e.OPENAI_API_KEY]),
    llm: e.LLM_PROVIDER ?? first(['groq', e.GROQ_API_KEY], ['openai', e.OPENAI_API_KEY], ['gemini', e.GEMINI_API_KEY]),
    embed: e.EMBED_PROVIDER ?? first(['gemini', e.GEMINI_API_KEY], ['openai', e.OPENAI_API_KEY]),
  };
  if (resolved.transcribe === 'gemini') throw new Error('Gemini has no transcription endpoint; use groq or openai');
  if (resolved.embed === 'groq') throw new Error('Groq has no embeddings endpoint; use gemini or openai');
  if (source === process.env) cached = resolved;
  return resolved;
}
