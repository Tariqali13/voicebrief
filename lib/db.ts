import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

declare global {
  // Survives hot reloads in development so we don't open a new pool per edit.
  var __vbPool: pg.Pool | undefined;
  var __vbMigrated: Promise<void> | undefined;
}

export function pool(): pg.Pool {
  if (!globalThis.__vbPool) {
    const url = env().DATABASE_URL;
    globalThis.__vbPool = new pg.Pool({
      connectionString: url,
      // Serverless functions: keep few connections per instance; Neon's pooler does the rest.
      max: 5,
      ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
    });
  }
  return globalThis.__vbPool;
}

/** Applies pending migrations once per process (guarded by an advisory lock). */
export function ready(): Promise<void> {
  globalThis.__vbMigrated ??= migrate().catch((err) => {
    globalThis.__vbMigrated = undefined;
    throw err;
  });
  return globalThis.__vbMigrated;
}

async function migrate(): Promise<void> {
  const client = await pool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(727003)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const dir = path.join(process.cwd(), 'migrations');
    for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727003)').catch(() => undefined);
    client.release();
  }
}

export const toVector = (v: number[]) => `[${v.join(',')}]`;
