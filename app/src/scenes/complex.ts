// `complex` — #17 虚像歪曲のコンプレックス, 僕達に許された 虚栄の権利 (docs/DESIGN.md). 虚 is vanity, and in maths the imaginary (虚数). The complex plane as a net of threads: a square grid, the two
// axes, the unit circle (the world line, in nixie, a light going round it). The net is carried through one complex
// function after another (z², a Möbius map, 1/z, exp, Joukowski's), flowing from each into the next: the squares stay
// square at every crossing while the whole is bent out of all recognition, a distorted virtual image (虚像). For 虚栄
// the plane lies flat and true; then it goes again. The labels (Re, Im, 1, i) ride with
// their points. No picture mounted on the plane any more; nothing jolts.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp } from '../engine/util';
import { Plate, charsOf, lyricRail, monoText } from './_kit';
import { Dark } from './_sky';

type C = [number, number];
const U = 250; // px per unit of the plane
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => { const d = Math.max(b[0] * b[0] + b[1] * b[1], 1e-9); return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
/** The maps, by number: where each sends z (s: seconds, for the ones that move). */
function map(m: number, z: C, s: number): C {
  if (m === 1) { const w = mul(z, z); return [w[0] / 1.7, w[1] / 1.7]; } // z²
  if (m === 2) { // a Möbius map of the disc of radius 2.4, its centre sent round
    const a: C = [0.5 * Math.cos(s * 0.9), 0.5 * Math.sin(s * 0.9)], u: C = [z[0] / 2.4, z[1] / 2.4];
    const w = div([u[0] - a[0], u[1] - a[1]], [1 - (a[0] * u[0] + a[1] * u[1]), -(a[0] * u[1] - a[1] * u[0])]);
    return [w[0] * 2.4, w[1] * 2.4];
  }
  if (m === 3) return div([1.5, 0], z); // 1 / z
  if (m === 4) { const e = Math.exp(z[0] / 1.5) / 1.15; return [e * Math.cos(z[1] * 1.4), e * Math.sin(z[1] * 1.4)]; } // exp
  if (m === 5) { const w = div([1, 0], z); return [(z[0] + w[0]) / 1.35, (z[1] + w[1]) / 1.35]; } // z + 1 / z
  return z;
}

export default class Complex extends Plate {
  dark = new Dark();
  lines = new LineBatch(40000, { blend: 'add' });
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4;
  /** The plan: from this beat on, this map (the net flows into it over the beat before). */
  plan: [number, number][] = [];

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    const b = charsOf([this.myLine().words[1]!]); // 虚栄の権利
    const kyo = (b[0]!.t - this.tb0) / this.per, no = (b[2]!.t - this.tb0) / this.per;
    // (flat and true for 虚栄)
    this.plan = [[-9, 0], [1.6, 1], [3.6, 2], [5.7, 3], [kyo - 0.1, 0], [no + 0.9, 4], [no + 3.2, 5]];
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const lt = t - this.tb0, nb = lt / this.per;
    this.dark.render(renderer, out, [0.003, 0.0012, 0.0004]);

    // which map, and how far the net has flowed into it from the one before
    let i = 0;
    while (i + 1 < this.plan.length && nb >= this.plan[i + 1]![0] - 1.1) i++;
    const m1 = this.plan[i]![1], m0 = this.plan[Math.max(0, i - 1)]![1], k = i ? smoother(clamp((nb - (this.plan[i]![0] - 1.1)) / 1.1)) : 1;
    const zoomK = 1 + 0.05 * Math.sin(lt * 0.5), cx = W / 2, cy = H / 2 - 10;
    const to = (z: C): C => {
      const a = map(m0, z, lt), b = map(m1, z, lt);
      return [cx + (a[0] + (b[0] - a[0]) * k) * U * zoomK, cy - (a[1] + (b[1] - a[1]) * k) * U * zoomK];
    };

    const L = this.lines;
    L.clear();
    /** A line of the net from a to b, in n pieces: drawn where it lies in the frame; its crowded parts fainter. */
    const line = (a: C, b: C, n: number, col: readonly number[], g: number, width: number) => {
      let p = to(a);
      for (let j = 1; j <= n; j++) {
        const u = j / n, q = to([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len < 320 && Math.abs(q[0] - cx) < 1500 && Math.abs(q[1] - cy) < 1000 && Math.abs(p[0] - cx) < 1500 && Math.abs(p[1] - cy) < 1000) {
          const gg = g * clamp(len / 7);
          L.seg(p[0], p[1], 0, q[0], q[1], 0, width, col[0]! * gg, col[1]! * gg, col[2]! * gg, 1);
        }
        p = q;
      }
    };
    for (let j = -36; j <= 36; j++) {
      const x = j / 4, axis = j === 0, major = j % 4 === 0;
      line([x, -5], [x, 5], 150, axis ? LIN.bone : LIN.ash, axis ? 0.75 : major ? 0.42 : 0.17, axis ? 1.6 : 1);
    }
    for (let j = -20; j <= 20; j++) {
      const y = j / 4, axis = j === 0, major = j % 4 === 0;
      line([-9, y], [9, y], 240, axis ? LIN.bone : LIN.ash, axis ? 0.75 : major ? 0.42 : 0.17, axis ? 1.6 : 1);
    }
    // the unit circle: the world line; a light going round it, once in four beats
    const turn = (nb / 4) * Math.PI * 2;
    let p = to([1, 0]);
    for (let j = 1; j <= 260; j++) {
      const a = (j / 260) * Math.PI * 2, q = to([Math.cos(a), Math.sin(a)]);
      const behind = (((turn - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const g = 1.5 + 2.2 * Math.exp(-behind / 0.5);
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 320) L.seg(p[0], p[1], 0, q[0], q[1], 0, 2.2, LIN.nixie[0] * g, LIN.nixie[1] * g, LIN.nixie[2] * g, 1);
      p = q;
    }
    const hd = to([Math.cos(turn), Math.sin(turn)]);
    L.seg(hd[0] - 0.01, hd[1], 0, hd[0] + 0.01, hd[1], 0, 8, LIN.bone[0] * 2.4, LIN.bone[1] * 2.4, LIN.bone[2] * 2.4, 1);
    L.render(renderer, out);

    const c = this.L.ctx;
    this.L.clear();
    // the labels, riding with their points
    c.textBaseline = 'alphabetic';
    const tag = (s: string, z: C, dx: number, dy: number, size: number) => {
      const q = to(z);
      if (q[0] < 60 || q[0] > W - 60 || q[1] < 60 || q[1] > H - 60) return;
      c.fillStyle = rgba('bone', 0.85);
      monoText(c, s, q[0] + dx, q[1] + dy, size, 600);
    };
    tag('Re', [3.2, 0], -20, -16, 26);
    tag('Im', [0, 1.75], 16, 8, 26);
    tag('1', [1, 0], 10, 34, 24);
    tag('i', [0, 1], 12, -10, 24);
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.6 };
  }
}
