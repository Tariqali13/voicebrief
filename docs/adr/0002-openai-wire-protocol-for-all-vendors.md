# 2. Use the OpenAI wire protocol for every vendor

**Status:** accepted

## Context

The demo must run on free tiers (Groq, Gemini) and the code should not be tied to one
vendor. Each vendor has a native SDK with different shapes for chat, embeddings and
structured output.

## Decision

Use the OpenAI SDK against each vendor's OpenAI-compatible endpoint (base URL + key).
Request JSON mode and validate with Zod plus a single repair round-trip, rather than relying
on any vendor's schema-constrained decoding.

## Consequences

- Switching or mixing vendors (e.g. Groq for speech, Gemini for embeddings) is configuration.
- Features outside the common subset (vendor-specific structured outputs, Gemini audio input)
  aren't used.
- The repair step costs an extra call when a model returns malformed JSON; usage is recorded.
