-- VoiceBrief schema. Audio is never stored on the server: only transcripts,
-- notes and embeddings. Recordings stay in the browser that made them.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      text NOT NULL,                      -- anonymous device id (httpOnly cookie)
  title         text NOT NULL,
  status        text NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  source        text NOT NULL CHECK (source IN ('recording', 'upload', 'sample')),
  duration_sec  real NOT NULL DEFAULT 0,
  language      text,
  summary       jsonb,
  method        text,                               -- single-pass | map-reduce | heuristic
  dropped_items int NOT NULL DEFAULT 0,             -- items removed by the grounding check
  usage         jsonb NOT NULL DEFAULT '{}',        -- tokens, audio seconds, timings, models
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_owner_idx ON meetings(owner_id, created_at DESC);

CREATE TABLE segments (
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  idx         int  NOT NULL,
  start_sec   real NOT NULL,
  end_sec     real NOT NULL,
  text        text NOT NULL,
  PRIMARY KEY (meeting_id, idx)
);

CREATE TABLE chunks (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  meeting_id    uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  owner_id      text NOT NULL,
  idx           int  NOT NULL,
  segment_from  int  NOT NULL,
  segment_to    int  NOT NULL,
  start_sec     real NOT NULL,
  end_sec       real NOT NULL,
  text          text NOT NULL,
  embedding     vector(768) NOT NULL,
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);
-- Approximate nearest neighbour search (cosine) and keyword search, combined at query time.
CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_idx ON chunks USING gin (tsv);
CREATE INDEX chunks_owner_idx ON chunks(owner_id, meeting_id);

-- Per-device quotas for the free public demo.
CREATE TABLE usage_events (
  owner_id   text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('meeting', 'question')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_idx ON usage_events(owner_id, kind, created_at DESC);
