// The divergence meter's schedule (docs/DESIGN.md): what the eight nixie tubes read at song time
// t. It is derived from the song so every plate that stages the meter agrees; plates show the meter only
// at its moments, it is never a permanent overlay. The show's values, act by act:
//   Act I (α): warm-up → 1.130426 (β, where the story starts), the D-mail → 0.571024, a spin on 世界線を超えて, settles 0.571046 on 観.
//   Act II (β): in the pond of blood it rolls back to 1.130426.
//   Act III (Steins;Gate): a spin through the solo's last plate, then 1.048596 on the final 観 (phosphor
//   green for ~2 s, the only phosphor in the video).
// The warm-up runs from bar 8 to the beat before the verse's pickup, the tubes lighting one by one on
// cycling digits; the D-mail rolls it on the downbeat of the verse's last bar. Scrambling digits change per output frame (frameIdx) and settle left to right; all deterministic in t.
// The tubes themselves are drawn by meter3d.ts.
import type { AudioData } from './audio';
import type { Lyrics } from './lyrics';
import { clamp, frameIdx, hash, smoothstep } from './util';

export const TUBES = 8; // digit, point, six digits
export const READINGS = { start: 1.130426, sent: 0.571024, alpha: 0.571046, beta: 1.130426, landed: 1.048596 } as const;

interface Step { t: number; v: number; roll: number; spin?: boolean } // roll: settle duration (s)

export interface MeterState {
  /** 8 characters ('.' at index 1); ' ' = tube dark. */
  text: string;
  /** Per-tube brightness 0..1 (warm-up flicker). */
  lit: number[];
  /** Per-tube: 1 while the tube's digit is scrambling. */
  rolling: number[];
  /** 0..1: the landing's phosphor flare. */
  phosphor: number;
  /** The settled reading being shown or rolled to (the last one while spinning). */
  value: number;
  /** True between 世界線を超えて and the landing. */
  spinning: boolean;
}

export class Divergence {
  steps: Step[] = [];
  warm0: number; // first tube lights
  warm1: number; // settled on the start reading
  sendT: number; // the D-mail: 0.571024
  spinT: number; // 世界線を超えて (chorus 1): spinning
  landT: number; // 観 of chorus 1: settles on 0.571046 (α holds)
  backT: number; // in the pond: rolls back to 1.130426 (β)
  spin2T: number; // the solo's last plate: spinning
  land2T: number; // 観 of the final chorus: 1.048596, phosphor

  constructor(lyrics: Lyrics, audio: AudioData) {
    const bar = (k: number) => audio.timeOfBeat(k * 4);
    this.warm0 = bar(8);
    this.warm1 = audio.timeOfBeat(46); // settled two beats before the verse's first cut (beat 47.5)
    // the verse's last bar: the discharge on the beat before, the meter rolls on its downbeat
    this.sendT = bar(27);
    const word = (line: number, w: string) => lyrics.lines[line]!.words.find((x) => x.w === w)!;
    const kan = (line: number) => { const o = word(line, '孤独の観測者'); return o.syl?.[3]?.[0] ?? o.start; }; // 観
    this.spinT = word(9, '世界線を超えて').start;
    this.landT = kan(12);
    this.backT = bar(63);
    this.spin2T = bar(141);
    this.land2T = kan(29);
    this.steps = [
      { t: this.warm1, v: READINGS.start, roll: 0 },
      { t: this.sendT, v: READINGS.sent, roll: 0.25 },
      { t: this.spinT, v: READINGS.sent, roll: 0, spin: true },
      { t: this.landT, v: READINGS.alpha, roll: 0.75 },
      { t: this.backT, v: READINGS.beta, roll: 1.2 },
      { t: this.spin2T, v: READINGS.beta, roll: 0, spin: true },
      { t: this.land2T, v: READINGS.landed, roll: 0.75 },
    ];
  }

  /** The settled reading at t (the last one while spinning). */
  value(t: number): number {
    let v: number = READINGS.start;
    for (const s of this.steps) if (s.t <= t) v = s.v;
    return v;
  }

  state(t: number): MeterState {
    const fi = frameIdx(t);
    const lit = new Array(TUBES).fill(0);
    const rolling = new Array(TUBES).fill(0);
    const off = { text: ' '.repeat(TUBES), lit, rolling, phosphor: 0, value: READINGS.start, spinning: false };
    if (t < this.warm0) return off;
    const target = (v: number) => v.toFixed(6).split('');

    if (t < this.warm1) {
      // warm-up: tube i lights at its own time, flickers, cycles digits ever slower, settles in order
      const span = this.warm1 - this.warm0;
      const chars = target(READINGS.start);
      for (let i = 0; i < TUBES; i++) {
        const on = this.warm0 + span * 0.55 * (i / TUBES) + hash(i, 5) * 0.4;
        const settle = this.warm0 + span * (0.6 + 0.4 * (i / (TUBES - 1))) - 0.05;
        if (t < on) { chars[i] = ' '; continue; }
        lit[i] = (t - on < 0.35 ? (hash(fi, i, 9) > 0.45 ? 1 : 0.15) : 1) * smoothstep(on, on + 0.15, t);
        if (i === 1) continue;
        if (t < settle) {
          const rate = Math.max(1, Math.round(1 + 6 * smoothstep(on, settle, t))); // frames per digit change
          chars[i] = String(Math.floor(hash(Math.floor(fi / rate), i, 17) * 10));
          rolling[i] = 1;
        }
      }
      return { text: chars.join(''), lit, rolling, phosphor: 0, value: READINGS.start, spinning: false };
    }

    let k = 0;
    while (k + 1 < this.steps.length && this.steps[k + 1]!.t <= t) k++;
    const s = this.steps[k]!;
    const chars = target(s.v);
    lit.fill(1);
    if (s.spin) {
      // every digit tube scrambles, a little out of step with its neighbours
      for (let i = 0; i < TUBES; i++) {
        if (i === 1) continue;
        chars[i] = String(Math.floor(hash(Math.floor((fi + i) / 3), i, 31) * 10));
        rolling[i] = 1;
      }
      return { text: chars.join(''), lit, rolling, phosphor: 0, value: s.v, spinning: true };
    }
    const dt = t - s.t;
    if (s.roll > 0 && dt < s.roll) {
      // digit i keeps scrambling until roll * (0.35 + 0.65 * position): settles left to right
      for (let i = 0; i < TUBES; i++) {
        if (i === 1) continue;
        if (dt < s.roll * (0.35 + 0.65 * (i / (TUBES - 1)))) { chars[i] = String(Math.floor(hash(fi, i, k, 23) * 10)); rolling[i] = 1; }
      }
    }
    const phosphor = s.v === READINGS.landed ? clamp(1 - (t - this.land2T - 1.2) / 0.8, 0, 1) * smoothstep(this.land2T, this.land2T + 0.1, t) : 0;
    return { text: chars.join(''), lit, rolling, phosphor, value: s.v, spinning: false };
  }
}
