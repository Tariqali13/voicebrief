# 3. Hybrid retrieval merged with reciprocal rank fusion

**Status:** accepted

## Context

Questions about meetings mix paraphrase ("who's fixing the double charges?") with exact
details (names, numbers, product terms). Vector search handles the first and blurs the
second; keyword search is the opposite.

## Decision

Run both searches in Postgres (pgvector HNSW cosine, and full-text search with OR-ed terms),
then merge the two rankings with reciprocal rank fusion.

## Consequences

- Both kinds of question work without tuning weights between incomparable scores.
- Two queries per question instead of one; both are index-backed and fast.
- Everything stays in Postgres: no separate vector database to run or pay for.
