# Deploying the demo on free tiers

Everything here is free and needs no credit card.

| Piece | Service |
| --- | --- |
| App (pages + API) | [Vercel](https://vercel.com) Hobby |
| Postgres + pgvector | [Neon](https://neon.tech) |
| Speech-to-text and notes | [Groq](https://console.groq.com) (Whisper large v3 turbo, gpt-oss-120b) |
| Embeddings | [Google AI Studio](https://aistudio.google.com/apikey) (Gemini embeddings) |

## 1. Database

Create a Neon project and copy its connection string (it ends with `?sslmode=require`).
Neon includes pgvector; the app runs `CREATE EXTENSION vector` in its first migration.

## 2. API keys

- Groq: **API Keys → Create**.
- Google AI Studio: **Get API key**.

## 3. Vercel

1. Import the repository (framework preset: Next.js).
2. Add environment variables: `DATABASE_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`.
3. Deploy. Migrations run on the first request.

Processing a meeting happens inside one streaming request. The route handlers declare
`maxDuration = 300`; on plans with a shorter limit, keep recordings short or upgrade the
function duration.

## Optional

- `OPENAI_API_KEY` alone switches everything to OpenAI.
- `LLM_MODEL` picks a different chat model. Groq retires models regularly (see
  [its deprecations page](https://console.groq.com/docs/deprecations)); if notes start
  failing with `model_not_found`, set this to a current model and redeploy.
- Lower `MEETINGS_PER_DAY` / `QUESTIONS_PER_HOUR` if the shared free quota runs low.

After deploying with keys, run the evaluation against the same configuration and commit the
result file:

```bash
DATABASE_URL=... GROQ_API_KEY=... GEMINI_API_KEY=... npm run eval
```
