// `theorems` — #18 自己相似のアンドロギュノス, うぬぼれた 稚拙な定理を並べた (Act II; docs/DESIGN.md).
// butterfly's attractor, failing: the Lorenz butterfly drawn in crimson and bone, and as the line goes on
// it collapses, the wings caving in toward a single point (the system losing its chaos, ρ falling below
// one). Around it the conceited theorems stand in a row, lab notebook entries in mono, and topple one after
// another on the beats like dominoes.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, ease, lerp, prog, pulse } from '../engine/util';
import { Plate, lyricRail, monoText, shakeAt } from './_kit';

function lorenz(n: number, d0: number) {
  let x = 1 + d0, y = 1, z = 20;
  const h = 0.005, pts: number[][] = [];
  for (let i = 0; i < 2000 + n; i++) {
    const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z;
    x += dx * h; y += dy * h; z += dz * h;
    if (i >= 2000) pts.push([x, y, z]);
  }
  return pts;
}

export default class Theorems extends Plate {
  bg = new FSPass(/* glsl */ `void main() { fragColor = vec4(C_INK * 0.6, 1.0); }`);
  lines = new LineBatch(30000, { screen2D: false, blend: 'add' });
  cam = new THREE.PerspectiveCamera(34, PW / PH, 0.1, 1000);
  L = new Layer2D();
  A = lorenz(9000, 0);
  Bp = lorenz(9000, 0.002);
  b0 = 0;

  override init() { this.b0 = this.B.at(this.ctx.start + 0.01); }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, start, end } = this.ctx;
    this.bg.render(renderer, out);
    const fail = ease.inOutCubic(prog(t, start + 0.8, end - 0.3));
    // camera turning slowly round the front of the butterfly
    const az = -Math.PI / 2 + 0.25 * Math.sin((t - start) * 0.4), d = 100;
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(Math.cos(az) * d, Math.sin(az) * d, 25 + 8);
    this.cam.lookAt(0, 0, 25);
    this.cam.updateMatrixWorld();
    // the collapse: points pulled toward the centre fixed point, the wings folding in, shaking apart
    const C0 = [0, 0, 25];
    const L = this.lines;
    L.clear();
    const draw = (pts: number[][], col: [number, number, number], g: number, w: number) => {
      let prev: number[] | null = null;
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i]!;
        const k = clamp(fail * 1.3 - (i / pts.length) * 0.3);
        const q = [lerp(p[0]!, C0[0]!, k), lerp(p[1]!, C0[1]!, k), lerp(p[2]!, C0[2]!, k * 0.9)];
        if (prev) L.seg(prev[0]!, prev[1]!, prev[2]!, q[0]!, q[1]!, q[2]!, w, col[0] * g, col[1] * g, col[2] * g, 1);
        prev = q;
      }
    };
    draw(this.Bp, LIN.bone, 0.5 * (1 - 0.5 * fail), 1.2);
    draw(this.A, LIN.crimson, 2.2, 1.6);
    L.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    const b = this.B.at(t) - this.b0;
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    const bt = this.B.t(this.b0 + b);
    return { shake: shakeAt(t, 6 * pulse(t, bt, 0.06) * (b % 2 === 0 ? 1 : 0)), bloom: 0.6, bloomThreshold: 0.7 };
  }
}
