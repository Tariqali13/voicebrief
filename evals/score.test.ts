import { describe, expect, it } from 'vitest';
import { score, matches, ownerAccuracy } from './score';
import type { Summary } from '@/lib/ai/schema';

describe('eval scoring', () => {
  const expected = [{ terms: ['cache', 'quota'], need: 2, owner: 'Marcus' }, { terms: ['idempotency'], owner: 'Daniel' }];

  it('matches paraphrases by key terms', () => {
    expect(matches('We will cache Places results to stay under quota', expected[0]!)).toBe(true);
    expect(matches('We will cache results', expected[0]!)).toBe(false);
  });

  it('counts duplicates once (one-to-one matching)', () => {
    const r = score(['cache the quota', 'cache within quota', 'add idempotency key'], expected);
    expect(r.tp).toBe(2);
    expect(r.precision).toBeCloseTo(2 / 3);
    expect(r.recall).toBe(1);
  });

  it('scores owners on matched items only', () => {
    const s = { actionItems: [{ owner: 'Marcus Lee' }, { owner: null }] } as unknown as Summary;
    expect(ownerAccuracy(s, expected, [[0, 0], [1, 1]])).toBe(0.5);
  });
});
