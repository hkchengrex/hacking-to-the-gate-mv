// `achievement` — #24 終わりと始まりのプロローグ (the outro, docs/DESIGN.md). The mirror of `prologue`.
// The last bar of the band: the whole video flashes past backwards, one frame per 16th. Then the world
// line is there across the frame with this plate's title on it; the title deletes itself character by
// character, the line retracts into the point, and with the fade the point is all there is: the same
// point as the first frame. The video loops.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, prog, pulse } from '../engine/util';
import { Plate, monoText } from './_kit';
import { drawThumb, loadThumbs, type Thumbs } from './_thumbs';

export default class Achievement extends Plate {
  override slateOff = true;
  L = new Layer2D();
  glow = new Layer2D();
  bg = new FSPass(/* glsl */ `void main() { fragColor = vec4(C_INK * 0.6, 1.0); }`);
  th: Thumbs = { times: [], imgs: [] };
  tLine = 0; tGone = 0;

  override async init() {
    this.th = await loadThumbs();
    this.tLine = this.B.t(this.B.at(this.ctx.start + 0.01) + 8); // two bars of rewind, as the music starts to fade
    this.tGone = this.tLine + 1.1;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    this.bg.render(renderer, out);
    const c = this.L.ctx, g = this.glow.ctx;
    this.L.clear(); this.glow.clear();
    let o: PostOverrides = { bloom: 0.8, vignette: 0.4 };

    if (t < this.tLine) {
      // the rewind: one frame per 16th, from here back to the start
      const k = Math.floor(f.beat * 4) - Math.floor(this.B.at(this.ctx.start + 0.01) * 4);
      const n = this.th.times.length;
      const steps = Math.max(1, Math.round((this.tLine - this.ctx.start) / ((this.B.t(1) - this.B.t(0)) / 4)));
      const back = this.ctx.start * (1 - (k + 1) / (steps + 1));
      let best = 0;
      for (let i = 0; i < n; i++) if (Math.abs(this.th.times[i]! - back) < Math.abs(this.th.times[best]! - back)) best = i;
      drawThumb(c, n ? this.th.imgs[best]! : null, 0, 0, W, H);
      c.fillStyle = rgba('bone');
      c.textBaseline = 'alphabetic';
      for (const x of [120, 150]) { c.beginPath(); c.moveTo(x + 24, 130); c.lineTo(x, 142); c.lineTo(x + 24, 154); c.fill(); }
      o = { ...o, shake: [0, 0], ca: 1.2 };
    } else {
      // the line, its title deleting itself, retracting into the point
      const u = prog(t, this.tLine + 0.3, this.tGone, ease.inExpo);
      const half = lerp(W * 0.62, 0, u);
      const cx = W / 2, cy = H / 2;
      g.fillStyle = rgba('nixie');
      if (half > 2) g.fillRect(cx - half, cy - 2, half * 2, 4);
      const breathe = 0.75 + 0.25 * Math.sin(t * 3.1);
      g.beginPath(); g.arc(cx, cy, half > 2 ? 7 : 5 + 2 * breathe, 0, Math.PI * 2); g.fill();
      const ja = '終わりと始まりのプロローグ';
      const left = Math.ceil(ja.length * (1 - clamp((t - this.tLine - 0.05) / 0.45)));
      if (left > 0) {
        c.font = font(F.mincho(800), 92);
        c.textAlign = 'left';
        c.textBaseline = 'alphabetic';
        c.fillStyle = rgba('bone');
        c.fillText(ja.slice(0, left), 220, cy - 40);
        c.font = font(F.archivo(125, 900), 64);
        c.fillStyle = rgba('nixie');
        c.fillText('#24', 220, cy - 160);
        c.font = font(F.archivo(125, 700), 30);
        (c as any).letterSpacing = '6px';
        c.fillStyle = rgba('ash');
        c.fillText('ACHIEVEMENT POINT'.slice(0, Math.ceil(17 * left / ja.length)), 224, cy + 70);
        (c as any).letterSpacing = '0px';
      }
      // the sign-off, under the point, while the music fades
      const s = Math.min(prog(t, this.tGone + 0.6, this.tGone + 1.4), 1 - prog(t, this.ctx.end - 4.5, this.ctx.end - 3));
      if (s > 0) { c.fillStyle = rgba('ash', s); c.textBaseline = 'alphabetic'; monoText(c, 'El Psy Kongroo', W / 2, H / 2 + 90, 22, 500, 'center'); }
      o = { ...o, flash: 0.12 * pulse(t, this.tLine, 0.04) };
    }
    comp.draw(renderer, this.L.upload(), out);
    comp.draw(renderer, this.glow.upload(), out, { tint: [1.6, 1.6, 1.6] });
    return o;
  }
}
