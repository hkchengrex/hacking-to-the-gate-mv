// `prologue` — #01 始まりと終わりのプロローグ (0 → 2.7 s, docs/DESIGN.md).
// The point: one nixie point at the centre, breathing (it is also the outro's last frame: the video
// loops). The album opens on a second of silence: only the point. The bass swell: the point draws
// itself out into the world line across the frame and the episode title types along it (this plate's
// slate). The synth riff: the line trembles on the 16ths. The full band: it snaps taut, a flash, and the
// camera dives along it into `timeleap`.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp, prog, pulse } from '../engine/util';
import { Plate, frames, monoText } from './_kit';
import { drawThumb, loadThumbs, thumbAt, type Thumbs } from './_thumbs';

export default class Prologue extends Plate {
  override slateOff = true;
  L = new Layer2D();
  glow = new Layer2D(); // the point and the line (drawn hot)
  bg = new FSPass(/* glsl */ `void main() { fragColor = vec4(C_INK * 0.6, 1.0); }`);
  th: Thumbs = { times: [], imgs: [] };
  ticks: number[] = [];
  tSwell = 1.16; tRiff = 2.14; tBand = 2.69; // (the album's swell, synth riff and first full-band hit)

  override async init() {
    const { audio } = this.ctx;
    this.th = await loadThumbs();
    // (the TV cut's pre-roll ticks, which strobed glimpses of later plates, are not in the album: no ticks)
    this.ticks = [];
    const band = audio.events('snare', 2.4, 3.0)[0]?.[0];
    this.tBand = band ?? this.ctx.end - 0.02;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    this.bg.render(renderer, out);
    const c = this.L.ctx, g = this.glow.ctx;
    this.L.clear(); this.glow.clear();

    // a glimpse on each tick: a later plate for two frames (the order is the future's, shuffled)
    const tick = this.ticks.filter((x) => x <= t).pop();
    let glimpse = false;
    if (tick !== undefined && frames(t, tick, 2)) {
      const k = this.ticks.indexOf(tick);
      const future = 18 + hash(k, 7) * 70;
      drawThumb(c, thumbAt(this.th, future), 0, 0, W, H);
      glimpse = true;
    }

    // the point / the world line
    const cx = W / 2, cy = H / 2;
    const breathe = 0.75 + 0.25 * Math.sin(t * 3.1);
    const draw = ease.outExpo(prog(t, this.tSwell, this.tSwell + 0.9));
    const half = lerp(0, W * 0.62, draw);
    const tremble = t >= this.tRiff && t < this.tBand ? 1 : 0;
    const snap = pulse(t, this.tBand, 0.05);
    g.fillStyle = rgba('nixie');
    if (half < 2) {
      g.beginPath(); g.arc(cx, cy, 5 + 2 * breathe, 0, Math.PI * 2); g.fill();
    } else {
      // the line: trembling on the 16ths during the riff
      g.strokeStyle = rgba('nixie');
      g.lineWidth = 4 + 6 * snap;
      g.beginPath();
      const ph = Math.floor(f.beat * 4);
      const amp = tremble * 10 * (0.5 + 0.5 * hash(ph, 3));
      for (let x = cx - half; x <= cx + half; x += 6) {
        const u = (x - (cx - half)) / (2 * half);
        const y = cy + amp * Math.sin(u * Math.PI * 14 + ph) * Math.sin(u * Math.PI);
        if (x === cx - half) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = rgba('ember');
      g.beginPath(); g.arc(cx, cy, 7, 0, Math.PI * 2); g.fill();
    }
    // the title types along the line, character by character, through the swell
    if (t >= this.tSwell + 0.2) {
      const ja = '始まりと終わりのプロローグ';
      const n = Math.floor(clamp((t - this.tSwell - 0.2) / 0.7) * ja.length);
      c.font = font(F.mincho(800), 92);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = rgba('bone');
      c.fillText(ja.slice(0, n), 220, cy - 40);
      c.font = font(F.archivo(125, 900), 64);
      c.fillStyle = rgba('nixie');
      c.fillText('#01', 220, cy - 160);
      if (n >= ja.length) {
        c.font = font(F.archivo(125, 700), 30);
        (c as any).letterSpacing = '6px';
        c.fillStyle = rgba('ash');
        c.fillText('TURNING POINT', 224, cy + 70);
        (c as any).letterSpacing = '0px';
      }
    }
    if (t < this.tSwell && !glimpse) {
      c.fillStyle = rgba('gunmetal');
      c.textBaseline = 'alphabetic';
      monoText(c, `T ${t.toFixed(2)}`, 120, H - 84, 16);
    }
    comp.draw(renderer, this.L.upload(), out);
    if (!glimpse) comp.draw(renderer, this.glow.upload(), out, { tint: [1.6, 1.6, 1.6] });
    return {
      flash: 0.9 * snap,
      bloom: 0.8,
      vignette: 0.4,
      zoom: 1 + 0.06 * ease.inExpo(prog(t, this.tBand - 0.35, this.tBand)),
    };
  }
}
