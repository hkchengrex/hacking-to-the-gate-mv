// `choice` — #07 断層のダイバージェンス (β), 明日さえも否定する 選択へ (Act II; docs/DESIGN.md).
// The choice as a fork in a world line, travelled. We fly along a glowing world line, low over it, through a field of
// faint parallel ones, following her (her crimson point, the charge of `starmine`) a little way ahead. The line forks:
// she takes the warm branch (α, where she lives), we take the cold one (β); the branches peel apart and she pulls
// away to the left. On 選択 her branch goes dark ahead of her, from the far end back toward her, no tomorrow; she
// and the camera slow, she runs to where it ends and stops there, the camera turned to her; on へ her glow flares
// once and dies. One smooth move; no text but the lyric.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { clamp, ease, hash, prog } from '../engine/util';
import { Plate, herPoint, lyricRail } from './_kit';

type V3 = [number, number, number];
/** Where the line forks (z), how far the branches peel apart (their angle, how soon), our speed and hers (units/s), how far ahead she starts. */
const ZF = 9, SPLAY = 0.3, EASE = 5, V = 6, VHER = 7, AHEAD = 5;
const FOV = 52, FOCAL = H / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
/** The branches, easing out of the fork to a steady angle: β (ours) to the right; α (hers) to the left, rising a little. */
const splay = (z: number) => { const u = Math.max(0, z - ZF); return SPLAY * (Math.sqrt(EASE * EASE + u * u) - EASE); };
const beta = (z: number): V3 => [-splay(z), 0, z];
const alpha = (z: number): V3 => [splay(z), 0.12 * splay(z), z];

export default class Choice extends Plate {
  bg = new FSPass(/* glsl */ `
    void main() {
      vec2 p = FRAG_PX / vec2(${W}.0, ${H}.0) - 0.5;
      fragColor = vec4(C_INK * (0.45 - 0.25 * dot(p, p)) + C_COLD * 0.025 * (1.0 - abs(p.y) * 1.6), 1.0);
    }`);
  L = new Layer2D();
  tHe = 0; tSen = 0; tStop = 0;
  /** How far we and she have come (z), every 1/240 s from the plate's start: both slow to a halt at the end of her line. */
  zc: Float32Array = new Float32Array(0);
  zh: Float32Array = new Float32Array(0);
  /** The other world lines: straight, parallel, faint, all round. */
  field: V3[] = Array.from({ length: 70 }, (_, i) => {
    const a = hash(i, 1) * Math.PI * 2, r = 2.2 + 28 * hash(i, 2) ** 1.4;
    return [Math.cos(a) * r, Math.sin(a) * r * 0.6, 0];
  });

  override init() {
    const w = this.lineWords[this.lineWords.length - 1]!;
    this.tHe = w.syl?.[w.syl.length - 1]?.[0] ?? w.end - 0.3; // へ
    this.tSen = Math.min(w.start, this.tHe - 0.6); // 選
    this.tStop = this.tHe - 0.12;
    const { start, end } = this.ctx, n = Math.ceil((end - start) * 240) + 2;
    const sm = (x: number) => { const k = clamp(x); return k * k * k * (k * (k * 6 - 15) + 10); };
    this.zc = new Float32Array(n); this.zh = new Float32Array(n);
    this.zh[0] = AHEAD;
    for (let i = 1; i < n; i++) {
      const tt = start + (i - 0.5) / 240;
      const vc = V * (1 - 0.8 * sm((tt - this.tSen) / (end - this.tSen)));
      const vh = (tt - start < 0.4 ? V : VHER) * (1 - sm((tt - this.tSen) / (this.tStop - this.tSen)));
      this.zc[i] = this.zc[i - 1]! + vc / 240;
      this.zh[i] = this.zh[i - 1]! + vh / 240;
    }
  }

  private at(tab: Float32Array, t: number) {
    const x = clamp((t - this.ctx.start) * 240, 0, tab.length - 1), i = Math.floor(x);
    return tab[i]! + (tab[Math.min(i + 1, tab.length - 1)]! - tab[i]!) * (x - i);
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, end } = this.ctx;
    this.bg.render(renderer, out);
    // the camera: low over β, looking a way ahead along it, and, once we have parted, back toward her, more and
    // more as her line ends
    const zc = this.at(this.zc, t), zh = this.at(this.zh, t);
    const at = beta(zc);
    const pos: V3 = [at[0], at[1] + 0.55, at[2]];
    const ahead = beta(zc + 6), her = alpha(zh);
    const look = ease.inOutCubic(clamp((zc - ZF + 2) / 12)) * 0.45 + 0.4 * ease.inOutCubic(prog(t, this.tSen, this.tHe));
    const tgt: V3 = [ahead[0] + (her[0] - ahead[0]) * look, ahead[1] + (her[1] - ahead[1]) * look, ahead[2] + (her[2] - ahead[2]) * look];
    const fw = norm(sub(tgt, pos)), rt = norm(cross(fw, [0, 1, 0])), up = cross(rt, fw);
    const proj = (p: V3): [number, number, number] | null => {
      const v = sub(p, pos), z = dot(v, fw);
      if (z < 0.15) return null;
      return [W / 2 + (dot(v, rt) / z) * FOCAL, H / 2 - (dot(v, up) / z) * FOCAL, z];
    };
    const c = this.L.ctx;
    this.L.clear();
    c.lineCap = 'round';
    /** A line through 3D points, thinner and fainter with distance (a wide soft stroke under a thin bright one). */
    const line = (pts: V3[], col: string, wNear: number, aNear: number, fade = 60) => {
      for (let i = 1; i < pts.length; i++) {
        const a = proj(pts[i - 1]!), b = proj(pts[i]!);
        if (!a || !b) continue;
        const z = (a[2] + b[2]) / 2, k = Math.exp(-z / fade);
        if (k < 0.02) continue;
        for (const [wm, am] of [[4, 0.18], [1, 1]] as const) {
          c.strokeStyle = col.replace('ALPHA', String(aNear * k * am));
          c.lineWidth = Math.max(0.6, (wNear * wm * 4) / z);
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        }
      }
    };
    const zs = (z0: number, z1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n);
    // the field of other world lines
    c.globalCompositeOperation = 'lighter';
    for (const [x, y] of this.field) line(zs(zc + 0.5, zc + 90, 24).map((z) => [x, y, z]), rgba('ash', 0).replace(/[\d.]+\)$/, 'ALPHA)'), 0.5, 0.35, 45);
    // ours (β, cold), and the trunk behind the fork
    const ours = zs(zc - 2, zc + 80, 120).map(beta);
    line(ours, rgba('cold', 0).replace(/[\d.]+\)$/, 'ALPHA)'), 2.2, 1.0, 50);
    // ticks along ours, streaming past
    for (let z = Math.ceil(zc); z < zc + 30; z += 1) {
      const p = proj(beta(z));
      if (!p) continue;
      c.fillStyle = rgba('bone', 0.5 * Math.exp(-p[2] / 12));
      c.beginPath(); c.arc(p[0], p[1], Math.max(0.8, 9 / p[2]), 0, Math.PI * 2); c.fill();
    }
    // hers (α, warm): from the fork on; from 選 it goes dark from the far end back to where she will stop; after
    // her flare it dims behind her
    const zStop = this.zh[this.zh.length - 1]!;
    const dark = ease.inOutCubic(prog(t, this.tSen, this.tStop));
    const zEnd = Math.max(zh, zStop + 70 * (1 - dark)) + 0.01;
    const out_ = ease.inQuad(prog(t, this.tHe + 0.06, end - 0.02));
    line(zs(ZF, Math.max(ZF + 0.1, zEnd), 100).map(alpha), rgba('nixie', 0).replace(/[\d.]+\)$/, 'ALPHA)'), 2.2, 1 - 0.75 * out_, 50);
    // her: running ahead along α to the end of it; on へ a flare, once, and out
    const hp = proj(alpha(zh));
    const fl = t >= this.tHe ? (1 - Math.exp(-(t - this.tHe) / 0.02)) * Math.exp(-(t - this.tHe) / 0.12) : 0;
    if (hp && out_ < 1) {
      const r = clamp(150 / hp[2], 6, 34);
      if (fl > 0.01) {
        const g = c.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], r * (3 + 6 * fl));
        g.addColorStop(0, rgba('crimson', 0.9 * fl)); g.addColorStop(1, rgba('crimson', 0));
        c.fillStyle = g;
        c.beginPath(); c.arc(hp[0], hp[1], r * (3 + 6 * fl), 0, Math.PI * 2); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      herPoint(c, hp[0], hp[1], r * (1 + 0.8 * fl), 1 - out_, fl);
    }
    c.globalCompositeOperation = 'source-over';
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.45, cold: 0.2, bloom: 0.55 };
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
