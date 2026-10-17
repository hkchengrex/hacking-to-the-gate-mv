// `virtual` — #17 虚像歪曲のコンプレックス (β), 僕達に示された 仮想の自由 (Act II; docs/DESIGN.md).
// complex's plane as a cage: the grid's lines are streamlines bending round a circle (the flow of a plane
// past a cylinder), drawn as heavy bars; inside the circle, Kurisu's crimson point (the charge of
// `starmine`). The freedom is virtual: on every beat the circle shrinks and the bars close in, and she is
// jolted. The formula sits in the corner.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { ease, prog, pulse } from '../engine/util';
import { Plate, herPoint, lyricRail } from './_kit';

const C = { x: 900, y: 520 };

export default class Virtual extends Plate {
  bg = new FSPass(/* glsl */ `void main() { vec2 p = FRAG_PX - vec2(900.0, 560.0); fragColor = vec4(C_INK * 0.55 + C_COLD * 0.06 * exp(-dot(p, p) / 200000.0), 1.0); }`);
  L = new Layer2D();
  b0 = 0;

  override init() { this.b0 = this.B.at(this.ctx.start + 0.01); }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, start } = this.ctx;
    this.bg.render(renderer, out);
    const nb = this.B.at(t), bt = this.B.t(Math.floor(nb)), b = Math.floor(nb - this.b0);
    const k = ease.outExpo(prog(t, bt, bt + 0.2));
    // the cage's radius: shrinking a step on every beat
    const R0 = 420 * Math.pow(0.93, Math.max(0, b - 1) + k);
    const c = this.L.ctx;
    this.L.clear();
    // her point, inside, jolted as the bars close
    const sw = Math.exp(-(t - bt) * 4) * Math.sin((t - bt) * 14) * (b % 2 ? 1 : -1);
    herPoint(c, C.x + 24 * sw, C.y, 28, 1, pulse(t, bt, 0.2));
    // streamlines of a uniform flow past a cylinder: ψ = y (1 − R²/r²) = const, traced as polylines
    const streams = 26;
    for (let i = -streams / 2; i <= streams / 2; i++) {
      if (i === 0) continue;
      const psi = i * 44;
      c.beginPath();
      let started = false;
      for (let x = -200; x <= W + 200; x += 8) {
        // solve y (1 − R²/(x² + y²)) = ψ for y by a few fixed-point steps (outside the circle)
        const dx = x - C.x;
        let y = psi;
        for (let it = 0; it < 12; it++) { const r2 = dx * dx + y * y; y = psi / Math.max(0.05, 1 - (R0 * R0) / Math.max(r2, R0 * R0 * 1.0001)); }
        const sy = C.y + y;
        if (!started) { c.moveTo(x, sy); started = true; } else c.lineTo(x, sy);
      }
      const near = Math.abs(i) <= 3;
      c.strokeStyle = near ? rgba('crimson', 0.95) : rgba('cold', 0.55);
      c.lineWidth = near ? 9 : 3;
      c.stroke();
    }
    // the circle itself: the bars' ring
    c.strokeStyle = rgba('crimson');
    c.lineWidth = 6;
    c.beginPath(); c.arc(C.x, C.y, R0, 0, Math.PI * 2); c.stroke();
    // (no formula or captions; and no shake on the beat: the cage tightening is the beat)
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    void start;
    return { vignette: 0.45, bloom: 0.5 };
  }
}
