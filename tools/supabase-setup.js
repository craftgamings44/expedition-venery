/**
 * Provision the Supabase project and write DATABASE_URL into .env.
 *
 *   node --env-file=.env tools/supabase-setup.js
 *
 * The token is a Supabase personal access token: Account Preferences ->
 * Access Tokens -> Generate new token. It talks to the Management API, which
 * lets this script do the whole job:
 *
 *   1. find the organisation
 *   2. reuse the project if it exists, otherwise create one
 *   3. wait for the database to report healthy
 *   4. set a known database password
 *   5. read the pooler configuration
 *   6. build the session pooler URI and check it actually connects
 *   7. write DATABASE_URL into .env
 *
 * The password never reaches the terminal. Only the host, port and username
 * are printed, so the output is safe to paste into a chat.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const API = 'https://api.supabase.com/v1';
const PROJECT_NAME = process.env.SUPABASE_PROJECT || 'expedition-venery';
const REGIONS = (
  process.env.SUPABASE_REGION || 'eu-central-1,us-east-1,northeast-1,us-west-2'
).split(',');

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set.');
  console.error('Put it in .env as SUPABASE_ACCESS_TOKEN=sbp_... and run this again.');
  process.exit(1);
}

/**
 * Call the Management API.
 * @param {string} method
 * @param {string} path
 * @param {any} [body]
 * @returns {Promise<any>}
 */
async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json && (json.message || json.error_description || json.error);
    throw new Error(`${method} ${path} -> ${res.status}${msg ? ': ' + msg : ''}`);
  }
  return json;
}

/**
 * Wait for a project to report healthy.
 *
 * The health endpoint wants to be asked about specific services: without
 * `?services=db` it answers 400. And it answers with an array of services.
 * @param {string} ref
 * @returns {Promise<boolean>}
 */
async function waitHealthy(ref) {
  for (let i = 0; i < 60; i++) {
    try {
      const h = await api('GET', `/projects/${ref}/health?services=db`);
      if (!h) continue;
      if (h.healthy === true) return true;
      const list = Array.isArray(h) ? h : h.services || [];
      const db = list.find((s) => s.name === 'db' || s.service === 'db');
      if (db && (db.healthy === true || String(db.status || '').startsWith('ACTIVE'))) return true;
      if (db) console.log('  db is ' + (db.status || (db.healthy ? 'healthy' : 'starting')));
    } catch (err) {
      console.log('  health: ' + err.message);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

/**
 * Read the pooler configuration.
 * @param {string} ref
 * @returns {Promise<any>}
 */
async function poolerConfig(ref) {
  const raw = await api('GET', `/projects/${ref}/config/database/pooler`);
  const list = Array.isArray(raw) ? raw : [raw];
  return list.find((p) => !p.database_type || p.database_type === 'PRIMARY') || list[0];
}

console.log('Supabase setup for "' + PROJECT_NAME + '"');

const orgs = await api('GET', '/organizations');
if (!orgs.length) {
  console.error('No organisation found for this token.');
  process.exit(1);
}
const org = orgs[0];
console.log('organisation: ' + org.name + ' (' + org.id + ')');

const existing = (await api('GET', '/projects')).find((p) => p.name === PROJECT_NAME);
let project = existing;

if (project) {
  console.log('project already exists: ' + project.name + ' [' + project.status + ']');
} else {
  let lastError = null;
  for (const region of REGIONS) {
    try {
      project = await api('POST', '/projects', {
        name: PROJECT_NAME,
        organization_id: org.id,
        region,
        db_pass: crypto.randomBytes(24).toString('base64url'),
        plan: 'free',
      });
      console.log('created project in ' + region + ': ' + project.ref);
      break;
    } catch (err) {
      lastError = err;
      console.log('  region ' + region + ' refused: ' + err.message);
    }
  }
  if (!project) {
    console.error('Could not create the project.');
    console.error(lastError ? lastError.message : '');
    process.exit(1);
  }
}

console.log('waiting for the database to come up...');
if (!await waitHealthy(project.ref)) {
  console.error('the project did not report healthy in time — it may still be provisioning.');
  console.error('run this again in a minute.');
  process.exit(1);
}
console.log('database is healthy');

// The API never hands the database password back, so set one we know. It is
// URL-safe, which keeps the connection string clean.
const password = crypto.randomBytes(24).toString('base64url');
await api('PATCH', `/projects/${project.ref}/database/password`, { password });
console.log('set a known database password');

const pooler = await poolerConfig(project.ref);
if (!pooler || !pooler.db_host) {
  console.error('Could not read the pooler configuration.');
  process.exit(1);
}

// Session mode is port 5432. The transaction pooler (6543) is for clients
// that can turn off prepared statements; node-postgres cannot.
const user = pooler.db_user || 'postgres.' + project.ref;
const host = pooler.db_host;
const port = 5432;
const database = pooler.db_name || 'postgres';
const uri = `postgresql://${user}:${password}@${host}:${port}/${database}`;

console.log('checking the connection...');
try {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: uri, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const v = await client.query('SELECT version()');
  await client.end();
  console.log('connected: ' + v.rows[0].version.split(' ').slice(0, 2).join(' '));
} catch (err) {
  console.error('the connection string does not work: ' + err.message);
  process.exit(1);
}

const envPath = resolve(ROOT, '.env');
let env = '';
try {
  env = await readFile(envPath, 'utf8');
} catch {
  env = '';
}
const lines = env
  .split(/\r?\n/)
  .filter((l) => l && !/^\s*#/.test(l) && !/^\s*DATABASE_URL\s*=/.test(l));
lines.push('DATABASE_URL=' + uri);
await writeFile(envPath, lines.join('\n') + '\n', 'utf8');
console.log('wrote DATABASE_URL to .env');

console.log('host: ' + host);
console.log('port: ' + port + ' (session mode)');
console.log('user: ' + user);
console.log('database: ' + database);
console.log('password: (not printed)');
console.log('project ref: ' + project.ref);
console.log('done');
