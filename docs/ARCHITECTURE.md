# Architecture

## Processing a meeting

`POST /api/meetings` receives the audio as multipart form data and responds with a stream
of newline-delimited JSON progress events. Everything happens inside that request, which is
what makes the app deployable as a single Vercel project with no queue or worker.

| Stage | What happens | Stored |
| --- | --- | --- |
| Transcribe | Whisper with `verbose_json` for segment timestamps; empty and repeated "silence hallucination" segments are cleaned | `segments` |
| Index | Segments grouped into conversational chunks (≤ ~900 chars, ≤ 90 s, one-segment overlap), embedded in batches | `chunks` with `vector(768)` and a generated `tsvector` |
| Summarise | Numbered transcript → JSON notes with evidence line numbers; schema-validated with one repair round-trip; map-reduce above ~48k characters | `meetings.summary` |
| Ground | Drop items whose evidence is missing or out of range; clear owners not named in the transcript; normalise topics | `meetings.dropped_items` |

Token usage, audio seconds, per-stage timings and model names are stored on each meeting and
shown in the UI.

If processing fails, the meeting is marked `failed` with a message meant for people
("No speech was detected in that recording."), and the technical error goes to the server log.

## Asking questions

1. Embed the question.
2. Run two searches scoped to the device (and optionally one meeting):
   cosine distance on the HNSW index, and full-text search with the question's terms OR-ed.
3. Merge with reciprocal rank fusion (k = 60): robust without calibrating cosine and
   `ts_rank` scores against each other.
4. Number the excerpts `[S1]…[S8]` and stream an answer instructed to cite them and to say
   when the excerpts don't contain the answer.
5. After the stream, report which labels were actually cited; unknown labels are ignored.

## Embedding width

The vector column is fixed at 768 dimensions. OpenAI's `text-embedding-3-*` accepts a
`dimensions` parameter; Gemini's `gemini-embedding-001` returns 3072 by default. Both are
Matryoshka-trained, so the app truncates to 768 and re-normalises. One schema then serves
either vendor, and the HNSW index stays well under pgvector's 2,000-dimension limit.

## Identity and privacy

- No accounts. A random 192-bit id in an httpOnly, SameSite=Lax cookie identifies the
  browser; every query filters by it, and a meeting id from another device returns 404.
- Audio is never written to the server's disk or database. The recording is kept in the
  browser's IndexedDB so the meeting page can play it back and seek to cited moments.
- `Permissions-Policy` limits microphone access to the app's own origin.

## Limits for the public demo

- Uploads up to 25 MB (the free Whisper limit on Groq; ~25 minutes of compressed speech).
- Per-device sliding windows: 8 meetings per day, 40 questions per hour.
- SDK retries with exponential backoff on 429 and 5xx responses.

## What I'd add next

- Speaker diarisation (who said what) to improve owner attribution, the weakest metric.
- Chunked transcription with ffmpeg for recordings over 25 MB.
- An LLM-as-judge faithfulness check in the evaluation harness, alongside the term-based scorer.
- Accounts and shared team libraries, with the same owner scoping moved into row-level security.
