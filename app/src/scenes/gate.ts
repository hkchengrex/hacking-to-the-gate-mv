// `gate` — #23 境界面上のシュタインズゲート, "Hacking to the Gate" (docs/DESIGN.md).
// HACKING decodes: every letter cycles through digits, Latin and katakana at frame rate and locks in
// sequence across the sung word, the field strobing bone / ink / nixie on the beats. TO THE: nested
// gate frames (boundary surfaces) rush at the camera on the 8ths. GATE fills the last frame; its
// interior is the white of the next plate (`zero`), which we enter on the downbeat of bar 44.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LIN, rgba, type PaletteKey } from '../engine/palette';
import { F, fitSize, font, layout } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, prog, pulse } from '../engine/util';
import { Plate, slam, shakeAt, frames } from './_kit';

const POOL_LATIN = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&?';
const POOL_KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';

export default class Gate extends Plate {
  L = new Layer2D();
  bg = new FSPass(/* glsl */ `uniform vec3 col; void main() { fragColor = vec4(col, 1.0); }`, { col: { value: [0, 0, 0] } });
  w!: { hack: Word; to: Word; the: Word; gate: Word };
  end44 = 0;
  /** The hot colour: nixie in Act I, crimson in Act II's hook. */
  hot: PaletteKey = this.act === 'b' ? 'crimson' : 'nixie';

  override init() {
    const ws = this.lineWords.filter((w) => /[A-Za-z]/.test(w.w)); // (Act I's hook, or Act II's: hook2)
    this.w = { hack: ws[0]!, to: ws[1]!, the: ws[2]!, gate: ws[3]! };
    this.end44 = this.ctx.end;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const c = this.L.ctx;
    this.L.clear();
    let field: PaletteKey = 'ink';
    const o: PostOverrides = { bloom: 0.6, ca: 1.0 };

    if (t < this.w.to.start - 0.02) field = this.hacking(c, t, o);
    else if (t < this.w.gate.start) field = this.tunnel(c, t, o);
    else field = this.gateWord(c, t, o);

    (this.bg.u.col!.value as number[]).splice(0, 3, ...LIN[field]);
    this.bg.render(renderer, out);
    comp.draw(renderer, this.L.upload(), out);
    return o;
  }

  /** HACKING: the decode, one strobe per beat. */
  private hacking(c: CanvasRenderingContext2D, t: number, o: PostOverrides): PaletteKey {
    const w = this.w.hack;
    const b = this.B.at(t);
    // the white-out from `fault` holds until the first syllable; then ink / bone / nixie per beat
    const scheme: [PaletteKey, PaletteKey, PaletteKey][] = this.act === 'b'
      ? [['ink', 'bone', 'ash'], ['bone', 'ink', 'ash'], ['crimson', 'bone', 'gore']]
      : [['ink', 'bone', 'ash'], ['bone', 'ink', 'ash'], ['nixie', 'ink', 'blood']];
    const [field, ink, dim] = t < w.start ? (['bone', 'ink', 'ash'] as [PaletteKey, PaletteKey, PaletteKey]) : scheme[((b % 3) + 3) % 3]!;
    const fam = F.archivo(125, 900);
    const text = 'HACKING';
    const size = Math.min(330, fitSize(text, fam, W - 240));
    const lay = layout(text, fam, size);
    const n = text.length;
    const lock = (i: number) => w.start + (i * (w.end - w.start - 0.08)) / (n - 1);
    const locked = Array.from({ length: n }, (_, i) => t >= lock(i)).filter(Boolean).length;
    // a punch-in and a tilt on every beat
    const bt = this.B.t(b);
    const k = 1 + 0.07 * (1 - ease.outExpo(prog(t, bt, bt + 0.2)));
    const tilt = ((b % 2) * 2 - 1) * 0.02 * (1 - ease.outExpo(prog(t, bt, bt + 0.25)));
    const fi = frameIdx(t);
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(tilt);
    c.scale(k, k);
    c.translate(-lay.width / 2, 0);
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    lay.glyphs.forEach((g, i) => {
      const cx = g.x + g.w / 2;
      if (t >= lock(i)) {
        const s = slam(t, lock(i), 0.28, 0.1);
        c.save();
        c.translate(cx, 0);
        c.scale(s, s);
        c.font = font(fam, size);
        c.fillStyle = rgba(ink);
        c.fillText(g.ch, 0, size * 0.04);
        c.restore();
      } else if (t >= w.start - 0.25) {
        // scrambling: a new glyph every frame (katakana from the gothic, which Archivo lacks)
        const h = hash(fi, i, 3);
        const kana = h > 0.62;
        const pool = kana ? POOL_KANA : POOL_LATIN;
        const ch = pool[Math.floor(hash(fi, i, 7) * pool.length)]!;
        c.font = font(kana ? F.gothic(900) : fam, kana ? size * 0.8 : size);
        c.fillStyle = rgba(dim, 0.55);
        c.fillText(ch, cx, size * 0.04);
      }
    });
    c.restore();
    // the decode's progress: a hairline bar and two mono labels under the word
    const y = H / 2 + size * 0.62 + 30, x0 = (W - lay.width) / 2, bw = lay.width;
    c.fillStyle = rgba(dim, 0.6);
    c.fillRect(x0, y, bw, 2);
    c.fillStyle = rgba(ink);
    c.fillRect(x0, y - 1, bw * (locked / n), 4);
    c.font = font(F.mono(500), 18);
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText('DECRYPT · 境界面', x0, y + 16);
    c.textAlign = 'right';
    c.fillText(`${locked}/${n}`, x0 + bw, y + 16);
    const hit = pulse(t, bt, 0.05);
    o.shake = shakeAt(t, 10 * hit);
    o.ca = 1 + 4 * hit;
    if (t >= w.start && frames(t, w.start, 2)) o.invert = 1;
    return field;
  }

  /** The gate frames' depth travelled at t (they pass the camera one per 8th, accelerating into GATE). */
  private travel(t: number) {
    const a = this.w.to.start - 0.02, b = this.w.gate.start;
    const u = clamp((t - a) / (b - a));
    return u * 4 + u * u * 2; // frames passed
  }

  /** The tunnel of gate frames (16:9 rectangles in depth), with speed streaks from the vanishing point. */
  private drawFrames(c: CanvasRenderingContext2D, t: number, travel: number, count = 8) {
    const fl = Math.floor(travel), fr = travel - fl;
    // speed streaks: radial hairlines rushing out of the centre, longer as the tunnel speeds up
    const speed = clamp(travel / 6);
    for (let i = 0; i < 90; i++) {
      const a = hash(i, 5) * Math.PI * 2;
      const ph = (hash(i, 6) + t * (1.5 + 3 * speed)) % 1;
      const r0 = 120 + ph * ph * 1300, r1 = r0 + 40 + 260 * speed * ph;
      c.strokeStyle = rgba(i % 7 === 0 ? this.hot : 'bone', 0.25 + 0.5 * ph);
      c.lineWidth = 1 + 2 * ph;
      c.beginPath();
      c.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0 * 0.6);
      c.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1 * 0.6);
      c.stroke();
    }
    for (let k = count; k >= 0; k--) {
      const z = k + 1 - fr; // depth in frame spacings
      if (z <= 0.15) continue;
      const s = 0.9 / z; // screen scale (1 = full frame)
      const a = clamp(1.4 - z * 0.2) * clamp((z - 0.15) / 0.25);
      const n = fl + k;
      const hot = n % 3 === 0;
      const x0 = W / 2 - (W / 2) * s, y0 = H / 2 - (H / 2) * s;
      // every other gate is a solid band (a doorway), the others hairlines
      if (n % 2 === 0) {
        c.fillStyle = rgba(hot ? this.hot : 'bone', a * (hot ? 1 : 0.85));
        const bw = Math.max(2, 34 * s);
        c.fillRect(x0, y0, W * s, bw); c.fillRect(x0, y0 + H * s - bw, W * s, bw);
        c.fillRect(x0, y0, bw, H * s); c.fillRect(x0 + W * s - bw, y0, bw, H * s);
      } else {
        c.strokeStyle = rgba(hot ? this.hot : 'bone', a * 0.7);
        c.lineWidth = Math.max(1, 5 * s);
        c.strokeRect(x0, y0, W * s, H * s);
      }
      // the near ones are numbered: the boundary surfaces, counted
      if (s > 0.3) {
        c.fillStyle = rgba('ash', a);
        c.textBaseline = 'bottom';
        c.textAlign = 'left';
        c.font = font(F.mono(500), Math.min(28, 15 * s + 8));
        c.fillText(`SURFACE ${String(n + 1).padStart(2, '0')}`, x0 + 8, y0 - 8);
      }
    }
  }

  /** TO THE: the tunnel, words slammed in its axis. */
  private tunnel(c: CanvasRenderingContext2D, t: number, o: PostOverrides): PaletteKey {
    const tr = this.travel(t);
    this.drawFrames(c, t, tr);
    const fam = F.archivo(125, 900);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const sTo = slam(t, this.w.to.start, 0.4, 0.12);
    if (sTo) {
      c.save();
      // TO moves up and shrinks when THE arrives
      const up = ease.outExpo(prog(t, this.w.the.start, this.w.the.start + 0.15));
      c.translate(W / 2, H / 2 - 150 * up);
      c.scale(sTo * lerp(1, 0.62, up), sTo * lerp(1, 0.62, up));
      c.font = font(fam, 440);
      c.fillStyle = rgba('bone');
      c.fillText('TO', 0, 15);
      c.restore();
    }
    const sThe = slam(t, this.w.the.start, 0.5, 0.1);
    if (sThe) {
      c.save();
      c.translate(W / 2, H / 2 + 120);
      c.scale(sThe, sThe);
      c.font = font(fam, 340);
      c.fillStyle = rgba(this.hot);
      c.fillText('THE', 0, 12);
      c.restore();
    }
    // every 8th a frame passes the camera: a jolt
    const e8 = this.B.t(this.B.at8(t) / 2);
    const j = pulse(t, e8, 0.05);
    o.zoom = 1 + 0.025 * j;
    o.shake = shakeAt(t, 6 * j + 14 * pulse(t, this.w.to.start, 0.05) + 14 * pulse(t, this.w.the.start, 0.05));
    o.ca = 1 + 3 * j;
    return 'ink';
  }

  /** GATE: the last frame arrives, lettered; its white interior grows past the edges by bar 44. */
  private gateWord(c: CanvasRenderingContext2D, t: number, o: PostOverrides): PaletteKey {
    const t0 = this.w.gate.start, t1 = this.end44;
    const tr = this.travel(t0);
    // the tunnel keeps moving behind the gate for a moment
    this.drawFrames(c, t, tr + 2 * ease.outCubic(prog(t, t0, t1)), 5);
    // the gate: snaps to 72% of the frame on GATE, then the camera pushes through (exponential)
    const arrive = ease.outExpo(prog(t, t0, t0 + 0.14));
    const push = Math.pow(prog(t, t0 + 0.12, t1), 2.2);
    const s = lerp(0.2, 0.72, arrive) * Math.pow(9, push);
    const gw = W * s, gh = H * s;
    c.fillStyle = rgba('bone');
    c.fillRect(W / 2 - gw / 2, H / 2 - gh / 2, gw, gh);
    c.strokeStyle = rgba(this.hot);
    c.lineWidth = Math.max(2, 18 * s);
    c.strokeRect(W / 2 - gw / 2, H / 2 - gh / 2, gw, gh);
    const fam = F.archivo(125, 900);
    const size = fitSize('GATE', fam, gw * 0.84, 2000);
    const k = slam(t, t0, 0.3, 0.12);
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(k, k);
    c.font = font(fam, size);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = rgba('ink');
    c.fillText('GATE', 0, size * 0.04);
    c.restore();
    o.shake = shakeAt(t, 22 * pulse(t, t0, 0.06));
    o.flash = 0.35 * pulse(t, t0, 0.05);
    o.ca = 1 + 6 * pulse(t, t0, 0.08) + 4 * push;
    o.bloom = 0.6 + 0.6 * push;
    return 'ink';
  }
}
