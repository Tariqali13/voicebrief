import OpenAI from 'openai';
import type { ProviderName } from '../env';

/**
 * Every vendor here speaks the OpenAI wire protocol, so one SDK covers all of them;
 * only the base URL, key and default models differ. Swapping vendors is configuration,
 * not code.
 */
interface Vendor {
  baseURL?: string;
  keyVar: 'OPENAI_API_KEY' | 'GROQ_API_KEY' | 'GEMINI_API_KEY';
  transcribe?: string;
  chat: string;
  embed?: string;
}

export const VENDORS: Record<Exclude<ProviderName, 'fake'>, Vendor> = {
  openai: { keyVar: 'OPENAI_API_KEY', transcribe: 'whisper-1', chat: 'gpt-4.1-mini', embed: 'text-embedding-3-small' },
  groq: { baseURL: 'https://api.groq.com/openai/v1', keyVar: 'GROQ_API_KEY', transcribe: 'whisper-large-v3-turbo', chat: 'openai/gpt-oss-120b' },
  gemini: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', keyVar: 'GEMINI_API_KEY', chat: 'gemini-2.5-flash', embed: 'gemini-embedding-001' },
};

const clients = new Map<string, OpenAI>();

export function client(provider: Exclude<ProviderName, 'fake'>): OpenAI {
  const v = VENDORS[provider];
  const apiKey = process.env[v.keyVar];
  if (!apiKey) throw new Error(`${v.keyVar} is not set`);
  const key = `${provider}:${apiKey.slice(-6)}`;
  let c = clients.get(key);
  if (!c) {
    // Retries with backoff on 429/5xx are built into the SDK; free tiers rate-limit often.
    c = new OpenAI({ apiKey, baseURL: v.baseURL, maxRetries: 3, timeout: 60_000 });
    clients.set(key, c);
  }
  return c;
}

export function model(provider: Exclude<ProviderName, 'fake'>, kind: 'transcribe' | 'chat' | 'embed', override?: string): string {
  const m = override ?? VENDORS[provider][kind];
  if (!m) throw new Error(`${provider} does not support ${kind}`);
  return m;
}

/** Token usage reported by providers, accumulated per meeting / per answer. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  audioSeconds: number;
  calls: number;
}

export const emptyUsage = (): Usage => ({ promptTokens: 0, completionTokens: 0, audioSeconds: 0, calls: 0 });

export function addUsage(into: Usage, u?: { prompt_tokens?: number; completion_tokens?: number } | null, audioSeconds = 0): Usage {
  into.promptTokens += u?.prompt_tokens ?? 0;
  into.completionTokens += u?.completion_tokens ?? 0;
  into.audioSeconds += audioSeconds;
  into.calls += 1;
  return into;
}
