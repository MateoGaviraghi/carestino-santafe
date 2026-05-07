import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Schema = typeof schema;
type Sql = NeonQueryFunction<false, false>;
type DB = NeonHttpDatabase<Schema>;

let _sql: Sql | undefined;
let _db: DB | undefined;

/**
 * Lazy DB client. Avoids throwing at module-load time so that `next build`
 * can statically analyze routes that import `@/db` without env vars present.
 * Throws on first call if DATABASE_URL is missing.
 */
export function getSql(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  _sql = neon(url);
  return _sql;
}

export function getDb(): DB {
  if (_db) return _db;
  _db = drizzle(getSql(), { schema });
  return _db;
}

export type { DB };
