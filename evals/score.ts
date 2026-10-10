import type { Summary } from '@/lib/ai/schema';
import type { ExpectedItem } from './cases';

export interface PRF {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  predicted: number;
  expected: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

export function matches(text: string, exp: ExpectedItem): boolean {
  const t = norm(text);
  const hits = exp.terms.filter((term) => t.includes(norm(term))).length;
  return hits >= (exp.need ?? 1);
}

/**
 * Greedy one-to-one matching of predicted to expected items, then precision/recall.
 * One-to-one matters: five near-duplicate predictions of the same task count once.
 */
export function score(predicted: string[], expected: ExpectedItem[]): PRF & { pairs: [number, number][] } {
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  predicted.forEach((p, pi) => {
    const ei = expected.findIndex((e, i) => !used.has(i) && matches(p, e));
    if (ei >= 0) {
      used.add(ei);
      pairs.push([pi, ei]);
    }
  });
  const tp = pairs.length;
  const precision = predicted.length ? tp / predicted.length : expected.length ? 0 : 1;
  const recall = expected.length ? tp / expected.length : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, predicted: predicted.length, expected: expected.length, pairs };
}

/** Of the action items that matched, how many have the right owner (null counts as right only if expected null)? */
export function ownerAccuracy(summary: Summary, expected: ExpectedItem[], pairs: [number, number][]): number {
  if (!pairs.length) return 0;
  const right = pairs.filter(([pi, ei]) => {
    const want = expected[ei]!.owner;
    const got = summary.actionItems[pi]!.owner;
    if (want === undefined) return true;
    if (want === null) return got === null;
    return !!got && got.toLowerCase().includes(want.toLowerCase());
  }).length;
  return right / pairs.length;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
