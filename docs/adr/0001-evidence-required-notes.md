# 1. Every note item must cite transcript lines

**Status:** accepted

## Context

LLM meeting summaries are fluent and occasionally wrong: a decision that was only
suggested, an owner the model inferred, a deadline nobody said. Users can't tell which
items to trust without re-listening to the meeting.

## Decision

The transcript is sent with numbered lines, and the output schema requires an `evidence`
array of line numbers for every decision, action item and open question. After generation,
a deterministic grounding pass removes items with invalid evidence and clears owners whose
names don't occur in the transcript. The UI links every item to its moment.

## Consequences

- Users can verify any item in one click; trust is earned per item, not assumed.
- Some correct items may be dropped if the model cites badly; the count is shown so this is
  visible, and the evaluation harness measures grounding directly.
- Slightly longer prompts and outputs (line numbers), which is cheap.
