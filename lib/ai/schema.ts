import { z } from 'zod';

/** Indices of transcript segments that support an item. Required: no evidence, no item. */
const Evidence = z.array(z.number().int().nonnegative()).min(1).max(12);

export const SummarySchema = z.object({
  title: z.string().min(1).max(120),
  tldr: z.string().min(1).max(600),
  keyPoints: z.array(z.object({ text: z.string().min(1).max(400), evidence: Evidence })).max(10),
  decisions: z.array(z.object({ text: z.string().min(1).max(400), evidence: Evidence })).max(15),
  actionItems: z
    .array(
      z.object({
        task: z.string().min(1).max(300),
        owner: z.string().max(80).nullable(),
        due: z.string().max(80).nullable(),
        evidence: Evidence,
      }),
    )
    .max(25),
  openQuestions: z.array(z.object({ text: z.string().min(1).max(300), evidence: Evidence })).max(10),
  topics: z.array(z.string().min(1).max(40)).max(8),
});

export type Summary = z.infer<typeof SummarySchema>;

/** Shown to the model verbatim so it knows exactly what shape to return. */
export const SUMMARY_SHAPE = `{
  "title": string,                 // short, specific: "Harbour Coffee website kickoff", not "Meeting"
  "tldr": string,                  // 2-3 sentences: what this meeting was for and what came out of it
  "keyPoints":     [{ "text": string, "evidence": number[] }],
  "decisions":     [{ "text": string, "evidence": number[] }],   // things actually agreed, not proposals
  "actionItems":   [{ "task": string, "owner": string | null, "due": string | null, "evidence": number[] }],
  "openQuestions": [{ "text": string, "evidence": number[] }],   // raised but not resolved
  "topics": string[]               // 2-6 short lowercase tags
}`;
