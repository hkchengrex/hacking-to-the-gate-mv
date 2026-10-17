// `timeleap` — #02 時間跳躍のパラノイア (the intro with the band, 2.70 → 14.44 s; docs/DESIGN.md).
// Bars 4–8: the world line is a time axis and every beat is a leap: a timestamp slams across the frame
// (Archivo extended, decoding like a counter that cannot make up its mind), the axis whips to a new tick
// with the Δt of the leap; dates jump back and forth, never in order. Paranoia: on every snare the frame
// is doubled, slightly wrong, for two frames. Bars 8–12: the divergence meter warms up in macro shots,
// one per beat (on the 8ths in the last two bars), tubes lighting one by one, and lands frontal on
// 1.130426 (β, where the story starts) two beats before the verse.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Divergence } from '../engine/meter';
import { Meter3D } from '../engine/meter3d';
import { clamp, ease, frameIdx, hash, lerp, prog, pulse } from '../engine/util';
import { Plate, shakeAt, frames, slam } from './_kit';

/**
 * The leaps, in no order: the story's own dates (the Steins;Gate wiki's chronology, after the official guides),
 * with the clock time where the story gives one, and what happened then (not shown: the date says it).
 */
const LEAPS: [date: string, time: string, what: string][] = [
  ['2010.07.28', '12:39', 'β · KURISU DIES'],
  ['2010.08.04', '', 'D-MAIL · MOEKA · 0.523299'],
  ['2000.11.02', '', 'JOHN TITOR APPEARS ONLINE'],
  ['2010.08.21', '17:56', 'C204 · OPERATION SKULD'],
  ['2010.07.28', '11:50', 'β · A TIME MACHINE ON THE ROOF'],
  ['2010.08.06', '', 'D-MAIL · LUKA · 0.456903'],
  ['1975.06', '', 'IBN 5100 ON SALE'],
  ['2010.08.17', '', 'THE FIRST D-MAIL UNDONE · TO β'],
  ['2010.08.03', '', 'D-MAIL · LOTTO 6 · 0.571015'],
  ['2010.07.23', '', 'THE FIRST D-MAIL CAUGHT BY ECHELON'],
  ['2010.08.13', '', 'THE TIME LEAP MACHINE WORKS'],
  ['2010.08.07', '', 'D-MAIL · FARIS · 0.409420'],
  ['2010.07.28', '12:26', 'β · THE "NOISE" MOVIE MAIL'],
  ['2010.08.09', '', 'SUZUHA LEAVES FOR 1975'],
  ['2010.08.10', '', 'D-MAIL · 0.337187'],
  ['2010.08.15', '', 'COMIMA · DAY 1'],
];
export default class Timeleap extends Plate {
  L = new Layer2D();
  bg = new FSPass(/* glsl */ `uniform vec3 col; void main() { fragColor = vec4(col, 1.0); }`, { col: { value: [0, 0, 0] } });
  meter = new Meter3D({ brightness: 10 });
  div!: Divergence;
  snares: number[] = [];
  b0 = 0; tMeter = 0; tFast = 0;

  override init() {
    const { lyrics, audio, start, end } = this.ctx;
    this.div = new Divergence(lyrics, audio);
    this.snares = audio.events('snare', start, end).map(([t]) => t);
    this.b0 = this.B.at(start + 0.01);
    this.tMeter = this.B.t(this.b0 + 16); // bar 8
    this.tFast = this.B.t(this.b0 + 24); // bar 10
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const o = t < this.tMeter ? this.leaps(t, out) : this.warm(t, out);
    const sn = this.snares.filter((x) => x <= t).pop() ?? -9;
    if (t < this.tMeter && frames(t, sn, 2)) o.shake = [26, -14]; // the frame doubled, wrong (see leaps)
    return o;
  }

  // ------------------------------------------------------------------ bars 4–8: the leaps
  private leaps(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const b = this.B.at(t), bt = this.B.t(b), n = Math.max(0, b - this.b0);
    // the field flips every bar (ink / bone), the first bar ink
    const bone = Math.floor(n / 4) % 2 === 1;
    (this.bg.u.col!.value as number[]).splice(0, 3, ...(bone ? LIN.bone : LIN.ink));
    this.bg.render(renderer, out);
    const ink = bone ? 'ink' : 'bone';
    const c = this.L.ctx;
    this.L.clear();
    const sn = this.snares.filter((x) => x <= t).pop() ?? -9;
    const ghost = frames(t, sn, 2);
    for (const pass of ghost ? [1, 0] : [0]) {
      c.save();
      if (pass) { c.globalAlpha = 0.45; c.translate(-34, 18); }
      // the axis: ticks scrolling; it whips by a leap on every beat
      const k = ease.outExpo(prog(t, bt, bt + 0.16));
      const off = (n - 1 + k) * 1370 + (t - bt) * 120;
      const y = 760;
      c.fillStyle = rgba('nixie');
      c.fillRect(0, y - 3, W, 6);
      for (let i = -2; i < 24; i++) {
        const x = ((i * 96 - off) % (W + 192) + W + 192) % (W + 192) - 96;
        const major = (Math.floor((off + x) / 96) % 5 + 5) % 5 === 0;
        c.fillStyle = rgba(ink, major ? 0.95 : 0.5);
        c.fillRect(x - 1, y - (major ? 46 : 20), 2, major ? 92 : 40);
      }
      // the timestamp: decodes (digits flicker) for 0.12 s after the beat, then locks
      const leap = LEAPS[n % LEAPS.length]!;
      const lockK = clamp((t - bt) / 0.12);
      const shown = Array.from(`${leap[0]} ${leap[1]}`).map((ch, i) => (/\d/.test(ch) && lockK < 1 && hash(i, 3) > lockK ? String(Math.floor(hash(frameIdx(t), i, 9) * 10)) : ch)).join('');
      const [date, time] = shown.split(' ');
      const s = slam(t, bt, 0.18, 0.12) || 1;
      c.save();
      c.translate(W / 2, 420);
      c.scale(s, s);
      c.font = font(F.archivo(125, 900), 210);
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillStyle = rgba(ink);
      c.fillText(date!, 0, 0);
      c.font = font(F.archivo(125, 500), 120);
      c.fillStyle = rgba('nixie');
      if (time) c.fillText(time, 0, 150);
      c.restore();
      // (no captions: the date says it)
      c.restore();
    }
    comp.draw(renderer, this.L.upload(), out);
    const hit = pulse(t, bt, 0.06);
    return { shake: shakeAt(t, 12 * hit), ca: 0.5 + 3 * hit, zoom: 1 + 0.03 * hit, vignette: bone ? 0.12 : 0.3, bloom: 0.55 };
  }

  // ------------------------------------------------------------------ bars 8–12: the meter warms up
  private warm(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    (this.bg.u.col!.value as number[]).splice(0, 3, 0, 0, 0);
    this.bg.render(renderer, out);
    this.meter.update(this.div.state(t));
    const settled = t >= this.div.warm1;
    // shots: one per beat, per 8th from bar 10; the last one frontal on the settled reading
    const fast = t >= this.tFast && !settled;
    const idx = fast ? this.B.at8(t) : this.B.at(t);
    const tShot = fast ? this.B.t(idx / 2) : this.B.t(idx);
    const u = prog(t, tShot, tShot + (fast ? 0.186 : 0.373));
    const pitch = (this.meter.width - 0.3) / 8;
    let cam: THREE.PerspectiveCamera;
    if (settled) {
      const e = ease.outCubic(prog(t, this.div.warm1, this.ctx.end));
      cam = this.meter.view([0, lerp(-12.5, -11.2, e), 2.4], [0, 0, 1.12], 30);
    } else {
      const k = Math.floor(hash(idx, 61) * 6);
      // a tube that is already lit at the shot's start (the dot, tube 1, never)
      const lit = this.div.state(tShot + 0.02).lit.map((v, i) => (v > 0 && i !== 1 ? i : -1)).filter((i) => i >= 0);
      const tube = lit.length ? lit[Math.floor(hash(idx, 62) * lit.length)]! : 0;
      const tx = (tube - 3.5) * pitch;
      const presets: [number[], number[], number][] = [
        [[tx - 0.9 + 0.3 * u, -2.6, 1.6], [tx, 0, 1.25], 34], // a tube, close, sliding
        [[tx + 1.2, -1.9 + 0.2 * u, 0.7], [tx, 0, 1.4], 40], // low, looking up at the cathodes
        [[-4.6 + 1.2 * u, -3.2, 1.8], [0, 0, 1.1], 26], // along the row
        [[tx, -2.4, 3.6 - 0.4 * u], [tx, 0, 1.2], 36], // from above, into the glass
        [[3.4 - 0.8 * u, -5.5, 1.0], [0.5, 0, 1.2], 28], // low three-quarter
        [[tx - 0.3, -1.4 + 0.15 * u, 1.3], [tx + 0.1, 0, 1.3], 44], // macro on the wire numerals
      ];
      const [p, tg, fov] = presets[k]!;
      cam = this.meter.view(p as [number, number, number], tg as [number, number, number], fov);
    }
    this.meter.render(renderer, comp, out, cam);
    const cut = pulse(t, tShot, 0.05);
    return { bloom: 0.75, bloomThreshold: 0.75, shake: shakeAt(t, 6 * cut + 14 * pulse(t, this.div.warm1, 0.06)), ca: 0.5 + 2 * cut, vignette: 0.35 };
  }
}
