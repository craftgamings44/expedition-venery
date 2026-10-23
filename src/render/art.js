/**
 * Art loader.
 *
 * AI-generated PNGs are loaded asynchronously and never block the game. Every
 * asset has a procedural fallback, so the game renders correctly with zero
 * image files present — that is a hard rule, not a nice-to-have.
 */

/** @type {Map<string, HTMLImageElement>} */
const images = new Map();
/** @type {Object|null} */
let manifest = null;

/**
 * Load the asset manifest.
 *
 * The biome art lives in its own file but is merged into one table, so
 * everything downstream can ask for a key without knowing where it came from.
 * @returns {Promise<Object>}
 */
export async function loadManifest() {
  if (manifest) return manifest;
  const [main, biomes] = await Promise.all([
    fetchJson('assets/manifest.json'),
    fetchJson('assets/biomes/manifest.json'),
  ]);
  manifest = { ...main, ...biomes };
  return manifest;
}

/**
 * Load the biome manifest on its own.
 * @returns {Promise<Object>}
 */
export async function loadBiomeManifest() {
  return fetchJson('assets/biomes/manifest.json');
}

/**
 * Fetch a JSON file, returning an empty object if it is missing or broken.
 * @param {string} path
 * @returns {Promise<Object>}
 */
async function fetchJson(path) {
  try {
    const res = await fetch(path, { cache: 'force-cache' });
    if (res.ok) return await res.json();
    return {};
  } catch {
    return {};
  }
}

/**
 * The file path for a manifest key, if there is one.
 * @param {string} key
 * @returns {string} empty when the asset is unknown
 */
export function manifestPath(key) {
  return manifest && manifest[key] ? manifest[key] : '';
}

/**
 * An icon element for a manifest key.
 *
 * The colour is always set as a background, so a missing image still shows
 * something in the right place instead of a broken-image icon.
 * @param {string} key manifest key
 * @param {string} alt alt text
 * @param {string} fallbackColor colour behind the icon
 * @returns {string} HTML
 */
export function iconHtml(key, alt, fallbackColor) {
  const src = manifestPath(key);
  if (!src) return '<i style="background:' + fallbackColor + '"></i>';
  return '<img class="ico" src="' + src + '" alt="' + alt + '" style="background:' + fallbackColor + '">';
}

/**
 * Preload every asset referenced by a manifest.
 * @param {Object} man
 * @returns {Promise<number>} number of images loaded
 */
export function preload(man) {
  const jobs = [];
  for (const [key, path] of Object.entries(man || {})) {
    if (images.has(key)) continue;
    const img = new Image();
    img.src = path;
    jobs.push(
      new Promise((resolve) => {
        img.onload = () => {
          images.set(key, img);
          resolve();
        };
        img.onerror = () => resolve();
      })
    );
  }
  return Promise.all(jobs).then(() => images.size);
}

/**
 * Get a loaded image by manifest key.
 * @param {string} key
 * @returns {HTMLImageElement|null}
 */
export const getImage = (key) => images.get(key) ?? null;

/**
 * Draw a manifest image centred on a point, scaled to a size.
 * Falls back to a simple shape when the asset is missing.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} key
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} [fallbackColor]
 */
export function drawIcon(ctx, key, x, y, size, fallbackColor = '#888') {
  const img = images.get(key);
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.fillStyle = fallbackColor;
  ctx.beginPath();
  ctx.arc(x, y, size / 2.4, 0, Math.PI * 2);
  ctx.fill();
}
