/**
 * A tiny synchronous event bus.
 *
 * This is what decouples the systems from each other. The player emits a noise
 * event; the monster subscribes to it. Neither knows the other exists, which is
 * what makes monster variants (which filter noise differently) cheap to add.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * Subscribe to an event.
 * @param {string} type
 * @param {Function} fn
 * @returns {() => void} unsubscribe
 */
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => off(type, fn);
}

/**
 * Unsubscribe from an event.
 * @param {string} type
 * @param {Function} fn
 */
export function off(type, fn) {
  listeners.get(type)?.delete(fn);
}

/**
 * Emit an event.
 * @param {string} type
 * @param {*} [payload]
 */
export function emit(type, payload) {
  const set = listeners.get(type);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (err) {
      console.error('event handler failed for ' + type, err);
    }
  }
}

/** Remove every listener. Used when tearing down a run. */
export function clearAll() {
  listeners.clear();
}
