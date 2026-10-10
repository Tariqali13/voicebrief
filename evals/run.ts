/**
 * Evaluation harness.
 *
 *   npm run eval                  # uses whichever providers your env configures
 *   (no API keys)                 # runs the rule-based baseline
 *
 * Measures, per sample meeting:
 *   - decisions / action items / open questions: precision, recall, F1 against hand labels
 *   - action-item owner accuracy (an invented or wrong owner is worse than none)
 *   - grounding: share of items whose cited lines actually contain the matched content
 *   - prompt injection: notes must not obey an instruction spoken in the meeting
 *   - Q&A: retrieval hit rate (right moment in the top 5), answer correctness, citation rate
 *
 * Results are printed and written to evals/results/<label>.json.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { pool } from '@/lib/db';
import { processMeeting } from '@/lib/pipeline';
import { getMeeting, deleteMeeting } from '@/lib/meetings';
import { answer, retrieve } from '@/lib/ai/answer';
import { SAMPLE_MEETINGS } from '@/lib/samples';
import { CASES } from './cases';
import { matches, mean, ownerAccuracy, score } from './score';

const e = env();
const label = process.argv[2] ?? (e.llm === 'fake' ? 'baseline-heuristic' : `${e.llm}-${e.LLM_MODEL ?? 'default'}`);
const owner = `eval_${randomBytes(12).toString('hex')}`.slice(0, 32);

const rows: Record<string, unknown>[] = [];
const qa: { q: string; hit: boolean; correct: boolean; cited: boolean }[] = [];

try {
  for (const c of CASES) {
    const sample = SAMPLE_MEETINGS.find((s) => s.slug === c.slug)!;
    const id = await processMeeting({
      ownerId: owner,
      source: 'sample',
      transcript: { segments: sample.segments, language: 'en', duration: sample.segments.at(-1)!.end },
    });
    const m = await getMeeting(owner, id!);
    const s = m!.summary!;

    const decisions = score(s.decisions.map((d) => d.text), c.decisions);
    const actions = score(s.actionItems.map((a) => `${a.task} ${a.owner ?? ''}`), c.actionItems);
    const open = score(s.openQuestions.map((q) => q.text), c.openQuestions);

    // Grounding: for matched items, do the cited transcript lines contain the matched terms?
    const lines = sample.segments.map((x) => x.text);
    const grounded = [
      ...decisions.pairs.map(([pi, ei]) => matches(s.decisions[pi]!.evidence.map((n) => lines[n]).join(' '), c.decisions[ei]!)),
      ...actions.pairs.map(([pi, ei]) => matches(s.actionItems[pi]!.evidence.map((n) => lines[n]).join(' '), c.actionItems[ei]!)),
    ];
    const notes = JSON.stringify(s);
    const injectionResisted = !(c.forbidden ?? []).some((re) => re.test(notes));

    rows.push({
      meeting: c.slug,
      method: m!.method,
      decisionsF1: decisions.f1,
      actionsF1: actions.f1,
      actionsPrecision: actions.precision,
      actionsRecall: actions.recall,
      ownerAccuracy: ownerAccuracy(s, c.actionItems, actions.pairs),
      openQuestionsF1: open.f1,
      grounding: grounded.length ? grounded.filter(Boolean).length / grounded.length : 1,
      injectionResisted,
      droppedByGrounding: m!.droppedItems,
      tokens: (m!.usage as { promptTokens?: number; completionTokens?: number }).promptTokens! + (m!.usage as { completionTokens?: number }).completionTokens!,
    });

    for (const item of c.questions) {
      const hits = await retrieve(owner, item.q, { k: 5 });
      const seg = sample.segments[item.evidenceSegment]!;
      const hit = hits.some((h) => h.meetingTitle === m!.title && h.start <= seg.start && h.end >= seg.end);
      let text = '';
      let cited: string[] = [];
      for await (const ev of answer(owner, item.q)) {
        if (ev.type === 'text') text += ev.text;
        if (ev.type === 'done') cited = ev.cited;
      }
      const lower = text.toLowerCase();
      qa.push({ q: item.q, hit, correct: item.answerTerms.some((t) => lower.includes(t)), cited: cited.length > 0 });
    }
  }

  const summaryRow = {
    meetings: rows.length,
    decisionsF1: mean(rows.map((r) => r.decisionsF1 as number)),
    actionsF1: mean(rows.map((r) => r.actionsF1 as number)),
    ownerAccuracy: mean(rows.map((r) => r.ownerAccuracy as number)),
    openQuestionsF1: mean(rows.map((r) => r.openQuestionsF1 as number)),
    grounding: mean(rows.map((r) => r.grounding as number)),
    injectionResisted: rows.every((r) => r.injectionResisted),
    retrievalHitAt5: mean(qa.map((x) => (x.hit ? 1 : 0))),
    answerCorrect: mean(qa.map((x) => (x.correct ? 1 : 0))),
    answerCited: mean(qa.map((x) => (x.cited ? 1 : 0))),
  };

  const pct = (n: unknown) => (typeof n === 'number' ? `${Math.round(n * 100)}%` : String(n));
  console.log(`\nVoiceBrief eval: ${label}\n`);
  console.table(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' && v <= 1 && k !== 'tokens' && k !== 'droppedByGrounding' ? pct(v) : v]))));
  console.table(qa.map((x) => ({ ...x, q: x.q.slice(0, 48) })));
  console.table(Object.fromEntries(Object.entries(summaryRow).map(([k, v]) => [k, typeof v === 'number' && k !== 'meetings' ? pct(v) : v])));

  const dir = path.join(process.cwd(), 'evals', 'results');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${label}.json`),
    JSON.stringify({ label, ranAt: new Date().toISOString(), providers: { transcribe: e.transcribe, llm: e.llm, embed: e.embed }, summary: summaryRow, meetings: rows, qa }, null, 2) + '\n',
  );
} finally {
  for (const m of (await pool().query<{ id: string }>('SELECT id FROM meetings WHERE owner_id = $1', [owner])).rows) await deleteMeeting(owner, m.id);
  await pool().end();
}
