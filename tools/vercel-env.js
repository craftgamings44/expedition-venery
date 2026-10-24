/**
 * Put DATABASE_URL into the Vercel environment.
 *
 *   node tools/vercel-env.js [production|preview|development]
 *
 * The value is read from .env and piped into the Vercel CLI through stdin, so
 * the database password never appears on a command line, in the process list,
 * or in the terminal output.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = process.argv[2] || 'production';

let env = '';
try {
  env = await readFile(resolve(ROOT, '.env'), 'utf8');
} catch {
  console.error('No .env file. Put DATABASE_URL in it first.');
  process.exit(1);
}

let value = '';
for (const line of env.split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  if (line.slice(0, eq).trim() !== 'DATABASE_URL') continue;
  value = line.slice(eq + 1).trim();
}
if (!value) {
  console.error('DATABASE_URL is empty in .env.');
  process.exit(1);
}

const parsed = new URL(value);
console.log('setting DATABASE_URL for ' + target);
console.log('  host: ' + parsed.hostname);
console.log('  port: ' + (parsed.port || '5432'));
console.log('  user: ' + parsed.username);
console.log('  password: (not printed)');

const cli = spawn(
  'npx',
  ['--yes', 'vercel@latest', 'env', 'add', 'DATABASE_URL', '--environment', target, '--force'],
  { cwd: ROOT, shell: true, stdio: ['pipe', 'inherit', 'inherit'] },
);
cli.stdin.write(value);
cli.stdin.end();
cli.on('close', (code) => {
  if (code === 0) {
    console.log('done. redeploy for the new variable to take effect.');
  } else {
    console.error('the Vercel CLI exited with ' + code);
  }
  process.exit(code ?? 1);
});
