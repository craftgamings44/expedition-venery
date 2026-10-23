/**
 * Load a .env file into process.env.
 *
 * Vercel injects DATABASE_URL as an environment variable; locally there is
 * no such thing, so the same value is read from a .env file next to the
 * repo. Existing environment variables win — a real env var always beats the
 * file.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Read .env (if it exists) and set any variables that are not already set.
 * @param {string} [file] path to the env file
 * @returns {Promise<string[]>} the names of the variables that were set
 */
export async function loadEnv(file = resolve(ROOT, '.env')) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const set = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
    set.push(key);
  }
  return set;
}
