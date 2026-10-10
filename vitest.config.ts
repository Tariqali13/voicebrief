import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { include: ['tests/**/*.test.ts', 'evals/**/*.test.ts'], fileParallelism: false,
    testTimeout: 30_000,
    // Tests always use the offline providers and their own database.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/voicebrief_test',
      OPENAI_API_KEY: '',
      GROQ_API_KEY: '',
      GEMINI_API_KEY: '',
    },
  },
});
