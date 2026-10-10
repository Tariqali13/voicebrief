import type { Summary } from './schema';
import type { Segment } from './transcribe';

/**
 * A rule-based note-taker. It powers the app when no API key is configured and,
 * more importantly, is the baseline in the evaluation suite: an LLM pipeline has
 * to beat this to justify its cost.
 */
const COMMIT = /\b(i['’]ll|i will|i can do|we['’]ll (?:send|draft|put)|i['’]m going to)\b/i;
const DECIDE = /\b(the decision is|let['’]s (?:go with|cache|agree|make that the decision)|agreed[,.]|that makes sense to me\. let['’]s|no exceptions)\b/i;
const OPEN = /\b(open (?:thing|question)|question i don['’]t have an answer|not sure|nobody seems to know|let['’]s not decide|let['’]s park it|before deciding)\b/i;
const NAME = /\b([A-Z][a-z]+)\b/g;
const NOT_NAMES = new Set(['Okay', 'Yes', 'Yeah', 'Yesterday', 'Then', 'Probably', 'Customers', 'Sure', 'Great', 'Thanks', 'Next', 'And', 'So', 'The', 'Yep', 'Ha', 'Let', 'Last', 'One', 'Good', 'Perfect', 'Sorry', 'Also', 'Maybe', 'Do', 'Is', 'Twelve', 'That', 'Mostly', 'Probably', 'Actually', 'Root', 'Customer', 'Pager', 'Mitigation', 'Failover', 'Which', 'What', 'Seven', 'First', 'Second', 'Third', 'Agreed', 'Timeline', 'Budget', 'Google', 'Places', 'Redis', 'Internet', 'Explorer', 'Square', 'Stripe', 'GoDaddy', 'Christmas', 'January', 'Thursday', 'Wednesday', 'Friday', 'Tuesday', 'December', 'Harbour', 'Coffee', 'Monthly', 'Before', 'Works', 'Oh', 'Where', 'Not', 'Ignore', 'Okay', 'Right', 'Understood', 'Give', 'Blameless', 'UTC', 'CODEOWNERS', 'I', 'A', 'It', 'We', 'You', 'My', 'Can', 'Do']);

function namesIn(text: string): string[] {
  return [...text.matchAll(NAME)].map((m) => m[1]!).filter((n) => !NOT_NAMES.has(n));
}

/** "Marcus, can you…" in the line before, or "Thanks Omar" in the line after, names the speaker. */
function guessOwner(segments: Segment[], i: number): string | null {
  const before = segments[i - 1]?.text ?? '';
  const addressed = before.match(/\b([A-Z][a-z]+),\s+(?:can|could|would|do) you\b/);
  if (addressed && !NOT_NAMES.has(addressed[1]!)) return addressed[1]!;
  const after = segments[i + 1]?.text ?? '';
  const thanked = after.match(/\bThanks,?\s+([A-Z][a-z]+)\b/);
  if (thanked && !NOT_NAMES.has(thanked[1]!)) return thanked[1]!;
  const self = segments[i]!.text.match(/\b(?:I['’]m|I am)\s+([A-Z][a-z]+)\b/);
  return self ? self[1]! : null;
}

function due(text: string): string | null {
  const m = text.match(/\b(by (?:end of )?(?:next )?(?:monday|tuesday|wednesday|thursday|friday|week|the \w+)|this (?:week|afternoon)|today|tomorrow|until friday)\b/i);
  return m ? m[1]! : null;
}

export function heuristicSummary(segments: Segment[]): Summary {
  const actionItems: Summary['actionItems'] = [];
  const decisions: Summary['decisions'] = [];
  const openQuestions: Summary['openQuestions'] = [];

  segments.forEach((s, i) => {
    if (COMMIT.test(s.text)) actionItems.push({ task: s.text, owner: guessOwner(segments, i), due: due(s.text), evidence: [i] });
    if (DECIDE.test(s.text)) decisions.push({ text: s.text, evidence: [i] });
    if (OPEN.test(s.text)) openQuestions.push({ text: s.text, evidence: [i] });
  });

  const words = segments.flatMap((s) => s.text.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const topics = [...freq.entries()]
    .filter(([w]) => !STOP.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w);

  const people = [...new Set(segments.flatMap((s) => namesIn(s.text)))].slice(0, 4);
  return {
    title: topics.length ? `Meeting about ${topics.slice(0, 2).join(' and ')}` : 'Meeting notes',
    tldr: `${segments.length} remarks${people.length ? ` with ${people.join(', ')}` : ''}. ${decisions.length} decision(s) and ${actionItems.length} action item(s) were detected automatically.`,
    keyPoints: segments.slice(0, 3).map((s, i) => ({ text: s.text, evidence: [i] })),
    decisions: decisions.slice(0, 15),
    actionItems: actionItems.slice(0, 25),
    openQuestions: openQuestions.slice(0, 10),
    topics,
  };
}

const STOP = new Set(['about', 'there', 'their', 'would', 'could', 'should', 'think', 'really', 'yesterday', 'thanks', 'right', 'something', 'which', 'because', 'other', 'where', 'doesn', 'going', 'everyone', 'actually', 'honestly', 'people', 'maybe', 'later', 'first', 'second', 'third']);
