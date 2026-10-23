/**
 * Procedural audio.
 *
 * Every sound is synthesised with WebAudio — no audio files ship with the
 * game. Carried over from V8, with the module-level state kept private.
 */

import { state } from '../state/store.js';

/** @type {AudioContext|null} */
let AC = null;
/** @type {GainNode|null} */
let master = null;
/** @type {GainNode|null} */
let windGain = null;
/** @type {GainNode|null} */
let droneGain = null;
/** @type {AudioBuffer|null} */
let noiseBuffer = null;

/**
 * Create the audio context. Must be called from a user gesture.
 */
export function initAudio() {
  if (AC) {
    AC.resume();
    return;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain();
  master.connect(AC.destination);
  master.gain.value = state.meta.settings?.vol ?? 0.7;

  // white noise buffer, reused for every noise-based sound
  const len = AC.sampleRate * 2;
  noiseBuffer = AC.createBuffer(1, len, AC.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  // cave wind
  const wind = AC.createBufferSource();
  wind.buffer = noiseBuffer;
  wind.loop = true;
  const wf = AC.createBiquadFilter();
  wf.type = 'lowpass';
  wf.frequency.value = 450;
  windGain = AC.createGain();
  windGain.gain.value = 0;
  wind.connect(wf);
  wf.connect(windGain);
  windGain.connect(master);
  wind.start();

  // low drone
  const osc = AC.createOscillator();
  osc.frequency.value = 46;
  droneGain = AC.createGain();
  droneGain.gain.value = 0;
  osc.connect(droneGain);
  droneGain.connect(master);
  osc.start();

  AC.resume();
}

/**
 * Set the master volume.
 * @param {number} v
 */
export function setVolume(v) {
  if (master) master.gain.value = v;
}

/**
 * Update the ambience mix for the current scene.
 * @param {boolean} underground
 * @param {boolean} menu
 */
export function updateAmbience(underground, menu) {
  if (!AC) return;
  windGain.gain.value = underground ? 0.01 : menu || underground ? 0.16 : 0;
  droneGain.gain.value = underground ? 0.07 : 0;
}

/**
 * Play a tone.
 * @param {number} f frequency
 * @param {number} d duration
 * @param {string} [ty] oscillator type
 * @param {number} [v] volume
 * @param {number} [f2] target frequency for a glide
 */
export function tone(f, d, ty, v, f2) {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = ty || 'square';
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v || 0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + d);
}

/**
 * Play filtered noise.
 * @param {number} d duration
 * @param {number} v volume
 * @param {number} fq bandpass frequency
 */
export function noise(d, v, fq) {
  if (!AC || !noiseBuffer) return;
  const t = AC.currentTime;
  const s = AC.createBufferSource();
  const f = AC.createBiquadFilter();
  const g = AC.createGain();
  s.buffer = noiseBuffer;
  f.type = 'bandpass';
  f.frequency.value = fq;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t, Math.random());
  s.stop(t + d);
}

/**
 * Play a chord.
 * @param {number[]} freqs
 * @param {number} [v] volume
 */
export function chord(freqs, v) {
  freqs.forEach((f, i) => setTimeout(() => tone(f, 2.2, 'sine', v || 0.1), i * 260));
}

/** The sound effect vocabulary. */
export const sfx = {
  mine: (t) => {
    noise(0.12, 0.5, 900 + Math.random() * 500 + (t || 0) * 120);
    tone(180 + (t || 0) * 35, 0.08, 'triangle', 0.1);
  },
  brk: () => {
    noise(0.35, 0.7, 300);
    tone(90, 0.2, 'sine', 0.2);
  },
  ore: () => {
    tone(880, 0.12, 'sine', 0.15);
    setTimeout(() => tone(1320, 0.2, 'sine', 0.12), 90);
  },
  ui: () => tone(520, 0.06, 'square', 0.07),
  elev: () => {
    noise(1.4, 0.25, 200);
    tone(70, 1.4, 'sawtooth', 0.08, 50);
  },
  growl: (p) => tone(70 * (p || 1), 1.1, 'sawtooth', 0.2, 45 * (p || 1)),
  chomp: () => {
    noise(0.25, 0.8, 500);
    tone(140, 0.25, 'square', 0.2, 50);
  },
  heartbeat: (v) => tone(55, 0.16, 'sine', v),
  biome: () => {
    tone(180, 0.9, 'sine', 0.12, 90);
    noise(0.7, 0.16, 320);
  },
};
