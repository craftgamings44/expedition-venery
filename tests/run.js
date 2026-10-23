/**
 * Zero-dependency test harness.
 *
 * Node is the only requirement. Run with: node tests/run.js
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
/** @type {string[]} */
const failures = [];
let currentSuite = '';

/**
 * Assert a condition.
 * @param {boolean} cond
 * @param {string} msg
 */
export function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`${currentSuite} :: ${msg}`);
  }
}

/**
 * Assert deep equality.
 * @param {*} actual
 * @param {*} expected
 * @param {string} msg
 */
export function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg} (got ${a}, expected ${e})`);
}

/**
 * Assert a number is within a tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} tol
 * @param {string} msg
 */
export function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, `${msg} (got ${actual}, expected ${expected} +/- ${tol})`);
}

/**
 * Define a suite.
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
export function suite(name, fn) {
  currentSuite = name;
  return Promise.resolve()
    .then(fn)
    .catch((err) => {
      failed++;
      failures.push(`${name} :: threw ${err && err.stack ? err.stack.split('\n')[0] : err}`);
    });
}

/**
 * Run every test file and report.
 */
async function main() {
  console.log('Expedition Venery — test suite\n');
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith('.test.js'))
    .sort();
  for (const f of files) {
    // Windows absolute paths are not valid ESM URLs — convert to file://
    await import(pathToFileURL(join(__dirname, f)).href);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  x ' + f);
    process.exit(1);
  }
  process.exit(0);
}

main();
