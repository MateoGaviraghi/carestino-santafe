/**
 * Loads .env.local into process.env before any test runs.
 *
 * If a key appears more than once in the file, the LAST occurrence wins —
 * matches Node's --env-file behavior. Without this, a stale earlier value
 * (e.g. an old DATABASE_URL kept around after a provider migration) would
 * shadow the newer one.
 *
 * Existing system env vars are NOT overwritten (so CI can still inject
 * different values).
 */
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const fileVars: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    fileVars[key] = value; // last occurrence wins
  }
  for (const [key, value] of Object.entries(fileVars)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
