# 4. Recordings stay in the browser

**Status:** accepted

## Context

Meeting audio is sensitive and large. Storing it would need object storage (more
infrastructure on a free-tier budget) and would make VoiceBrief a custodian of recordings.

## Decision

Audio goes to the transcription provider once and is never stored server-side. The browser
keeps its own recordings in IndexedDB for playback. The server stores transcripts, notes
and embeddings only.

## Consequences

- Less sensitive data held, and no object storage needed.
- Playback works only on the device that recorded; other devices see the transcript and
  notes (the UI says so).
- Re-processing a meeting with a better model needs the transcript, which is kept, not the audio.
