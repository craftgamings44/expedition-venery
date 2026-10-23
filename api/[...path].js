/**
 * Catch-all for the cloud accounts API.
 *
 * Vercel maps a file to a path: api/index.js answers /api, and nothing
 * answers /api/session or /api/saves. This file makes every /api/* request
 * land on the same handler, so the deployment keeps to a single function.
 *
 * The local dev server routes to api/index.js directly and does not need
 * this file.
 */

export { default } from './index.js';
