// `fault` — #07 断層のダイバージェンス, 残酷な約定と 選択へ (docs/DESIGN.md).
// A seismograph drum in a geological section: twelve traces across the frame (strata hairlines between
// them, the pen along the bottom is the world line), the lyric in the rail (visual first). Each slammed character drives the strike-slip: a fault opens through the slab and
// the two sides shift along it, mis-registering the type and the strata, lit from inside in nixie.
// Shots: 残 酷 close; the whole line as the fault breaks (な 約 定); the camera tracks down the fault
// (と); 選 / 択: the frame splits on a clean diagonal into two worlds, ink and bone, one character
// each; へ glows in the widening gap, which whites out the frame into `gate`.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp, mulberry32, noise1, prog, pulse, springStep } from '../engine/util';
import { Plate, lineChars, lyricRail, slam, shakeAt, frames, monoText, type Ch } from './_kit';

const NP = 32; // fault polyline points

/** Camera: world → screen, s = R(rot)·(p − c)·zoom + centre. */
interface Cam { cx: number; cy: number; zoom: number; rot: number }

const FAULT_FRAG = /* glsl */ `
  uniform sampler2D texA, texB;
  uniform vec2 pts[${NP}];
  uniform int npts;
  uniform vec2 offA, offB;
  uniform float open, glow, reveal;
  uniform vec3 fieldA, fieldB;
  vec4 samp(sampler2D tx, vec2 q) {
    vec2 uv = vec2(q.x / ${W}.0, 1.0 - q.y / ${H}.0);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture(tx, uv);
  }
  void main() {
    vec2 p = vec2(FRAG_PX.x, ${H}.0 - FRAG_PX.y); // canvas px, y down
    // nearest point on the revealed part of the polyline, and which side we are on
    float best = 1e9, side = 1.0, along = 0.0, acc = 0.0;
    for (int i = 0; i < ${NP - 1}; i++) {
      if (i >= npts - 1) break;
      vec2 a = pts[i], b = pts[i + 1];
      vec2 ba = b - a, pa = p - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      float d = length(pa - ba * h);
      if (d < best) { best = d; side = sign(ba.x * pa.y - ba.y * pa.x); along = acc + h * length(ba); }
      acc += length(ba);
    }
    // the crack exists only down to the revealed length; beyond its tip nothing has moved
    float tip = reveal * acc;
    float cracked = smoothstep(tip + 30.0, tip - 10.0, along);
    vec2 oA = offA * cracked, oB = offB * cracked;
    vec4 cA = samp(texA, p - oA), cB = samp(texB, p - oB);
    vec3 col = side > 0.0 ? fieldA * (1.0 - cA.a) + cA.rgb : fieldB * (1.0 - cB.a) + cB.rgb;
    // the opening: white-hot in the middle, nixie at its lips, a glow spilling out
    float hw = 0.5 * open * cracked;
    float inside = smoothstep(hw + 0.8, hw - 0.8, best);
    float u = hw > 0.0 ? clamp(best / max(hw, 1e-3), 0.0, 1.0) : 1.0;
    vec3 lit = mix(vec3(6.0, 5.4, 4.6), C_NIXIE * 3.0, smoothstep(0.1, 0.95, u));
    col = mix(col, lit * glow, inside * step(0.001, glow));
    col += C_NIXIE * glow * 0.9 * exp(-max(best - hw, 0.0) / (14.0 + 0.25 * open)) * cracked;
    fragColor = vec4(col, 1.0);
  }`;

export default class Fault extends Plate {
  A = new Layer2D();
  Bl = new Layer2D();
  T = new Layer2D();
  pass = new FSPass(FAULT_FRAG, {
    texA: { value: null }, texB: { value: null }, pts: { value: Array.from({ length: NP }, () => [0, 0]).flat() }, npts: { value: NP },
    offA: { value: [0, 0] }, offB: { value: [0, 0] }, open: { value: 0 }, glow: { value: 0 }, reveal: { value: 0 },
    fieldA: { value: [0, 0, 0] }, fieldB: { value: [0, 0, 0] },
  });
  chs: Ch[] = []; // 残酷な約定と選択へ
  /** The jagged fault through the slab (world px), top to bottom. */
  crack: [number, number][] = [];
  tBar40 = 0; tBar41 = 0; tSen = 0; tHe = 0;
  /** Times of the quake steps (the characters that slip the fault) and slip per step (px). */
  steps: [number, number][] = [];
  kicks: [number, number][] = [];

  override init() {
    const { lyrics, audio, start, end } = this.ctx;
    this.chs = lineChars(lyrics.get('残酷な'));
    this.tBar40 = this.B.t(this.B.at(start + 0.01) + 2);
    this.tBar41 = this.tBar40 + 4 * (this.B.t(1) - this.B.t(0));
    this.tSen = this.chs[6]!.t;
    this.tHe = this.chs[8]!.t;
    this.steps = [[this.chs[2]!.t, 16], [this.chs[3]!.t, 22], [this.chs[4]!.t, 30], [this.chs[5]!.t, 18]];
    this.kicks = audio.events('kick', start - 3, end);
    // the crack: from above the slab between 約 and 定 down through it, fractal jitter
    const r = mulberry32(7);
    const x0 = 1120, x1 = 900;
    const pts: [number, number][] = [];
    for (let i = 0; i < NP; i++) {
      const u = i / (NP - 1);
      const jag = (r() - 0.5) * 70 * (i % 3 === 0 ? 1.6 : 0.7) + Math.sin(u * 9) * 18;
      pts.push([lerp(x0, x1, u) + (i && i < NP - 1 ? jag : 0), lerp(-60, H + 60, u)]);
    }
    this.crack = pts;
  }

  /** Total slip (px) at t: spring-loaded steps. */
  private slip(t: number) {
    let s = 0;
    for (const [t0, a] of this.steps) if (t >= t0) s += a * springStep(t - t0, 5, 0.32);
    return s;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    if (t >= this.tSen) return this.split(t, out);
    const { renderer } = this.ctx;
    const o: PostOverrides = { bloom: 0.6 };
    // shots: A close (残 酷), B the whole slab (bar 40), C tracking down the fault (bar 41)
    let cam: Cam;
    if (t < this.tBar40) {
      const u = prog(t, this.ctx.start, this.tBar40);
      cam = { cx: lerp(640, 760, u), cy: 520, zoom: 1.5 + 0.06 * u, rot: 0.03 };
    } else if (t < this.tBar41) {
      const u = prog(t, this.tBar40, this.tBar41);
      cam = { cx: W / 2 + 20 * u, cy: H / 2 - 10, zoom: 0.94 + 0.05 * u, rot: -0.045 + 0.01 * u };
    } else {
      const u = ease.inOutCubic(prog(t, this.tBar41, this.tSen));
      const at = lerp(0.12, 0.88, u);
      const i = Math.floor(at * (NP - 1));
      const [ax, ay] = this.crack[i]!, [bx, by] = this.crack[Math.min(NP - 1, i + 1)]!;
      const fr = at * (NP - 1) - i;
      cam = { cx: lerp(ax, bx, fr), cy: lerp(ay, by, fr), zoom: 2.7, rot: Math.PI / 2 - 0.12 };
    }

    // the slab (both sides share it): strata, the line, the seismograph, annotations
    const c = this.A.ctx;
    this.A.clear();
    c.save();
    this.apply(c, cam);
    this.strata(c, t);
    this.slab(c, t);
    this.seismo(c, t);
    c.restore();
    this.notes(c, t);
    this.A.upload();

    // the fault: revealed (propagating down) on な, slipping on each step
    const reveal = ease.outCubic(prog(t, this.chs[2]!.t - 0.02, this.chs[2]!.t + 0.14));
    const s = this.slip(t);
    const open = s > 0 ? 3 + s * 0.12 + (t >= this.tBar41 ? 10 * prog(t, this.tBar41, this.tSen) : 0) : 0;
    this.setFault(cam, reveal, s, open, reveal > 0 ? 1 : 0, this.A, this.A, 'ink', 'ink');
    this.pass.render(renderer, out);
    this.rail(t, out);

    // jolts: each slam; the quake steps shake harder
    let j = 0;
    for (const x of this.chs) j = Math.max(j, pulse(t, x.t, 0.05));
    let q = 0;
    for (const [t0] of this.steps) q = Math.max(q, pulse(t, t0, 0.08));
    o.shake = shakeAt(t, 10 * j + 26 * q);
    o.ca = 0.5 + 3 * q;
    o.zoom = 1 + 0.02 * j;
    if (frames(t, this.chs[0]!.t, 2)) o.invert = 1;
    return o;
  }

  // ------------------------------------------------------------------ 選 / 択: two worlds
  private split(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer } = this.ctx;
    const tTaku = this.chs[7]!.t;
    const e8 = this.B.t(this.B.at8(t) / 2);
    // the gap: opens on 選, widens on the 8ths after 択, pours light out on へ, whites out at the end
    const n8 = t >= tTaku ? this.B.at8(t) - this.B.at8(tTaku) : -1;
    const steps = [30, 60, 110, 200, 380, 700];
    const target = t < tTaku ? 26 : steps[clamp(n8, 0, steps.length - 1)]!;
    const prev = t < tTaku ? 0 : n8 <= 0 ? 26 : steps[clamp(n8 - 1, 0, steps.length - 1)]!;
    const k = ease.outExpo(prog(t, t < tTaku ? this.tSen : e8, (t < tTaku ? this.tSen : e8) + 0.12));
    const open = lerp(prev, target, k) + Math.pow(prog(t, this.ctx.end - 0.12, this.ctx.end), 2) * 2600;
    // a straight diagonal fault through the centre, top-right to bottom-left
    const ang = Math.atan2(H + 300, -560);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const pts: [number, number][] = [];
    for (let i = 0; i < NP; i++) {
      const u = i / (NP - 1) - 0.5;
      const jag = i && i < NP - 1 ? noise1(i * 1.7, 4) * 6 : 0;
      pts.push([W / 2 + dx * u * 1500 - dy * jag, H / 2 + dy * u * 1500 + dx * jag]);
    }
    // side A (above-left): ink, 選 in bone; side B: bone, 択 in ink. Each half drifts away from the gap.
    const a = this.A.ctx, b = this.Bl.ctx;
    this.A.clear(); this.Bl.clear();
    const nx = -dy, ny = dx; // normal (toward side A is -n … sign checked below)
    const drift = 60 * prog(t, this.tSen, this.ctx.end);
    for (const [L, k] of [[a, 1], [b, -1]] as const) { L.save(); L.translate(nx * drift * k, ny * drift * k); this.strata(L, t); this.slab(L, t); L.restore(); }
    a.fillStyle = rgba('ash'); b.fillStyle = rgba('gunmetal');
    a.textBaseline = 'alphabetic'; b.textBaseline = 'alphabetic';
    monoText(a, 'WORLD LINE α', 120, 150, 18);
    monoText(b, 'WORLD LINE β', W - 120, H - 120, 18, 500, 'right');
    this.A.upload(); this.Bl.upload();
    const u = this.pass.u;
    (u.pts!.value as number[]).splice(0, NP * 2, ...pts.flat());
    u.npts!.value = NP;
    // which side is A: the side containing the top-left corner
    const sgn = Math.sign((pts[1]![0] - pts[0]![0]) * (0 - pts[0]![1]) - (pts[1]![1] - pts[0]![1]) * (0 - pts[0]![0]));
    const half = open / 2;
    // (the shader's side A is the +normal side)
    (u.offA!.value as number[]).splice(0, 2, nx * half, ny * half);
    (u.offB!.value as number[]).splice(0, 2, -nx * half, -ny * half);
    u.open!.value = open;
    u.glow!.value = 1 + 1.5 * prog(t, this.tHe, this.ctx.end);
    u.reveal!.value = 1;
    u.texA!.value = sgn > 0 ? this.A.texture : this.Bl.texture;
    u.texB!.value = sgn > 0 ? this.Bl.texture : this.A.texture;
    const ink = [0.0037, 0.0042, 0.0049], bone = [0.81, 0.78, 0.7];
    (u.fieldA!.value as number[]).splice(0, 3, ...(sgn > 0 ? ink : bone));
    (u.fieldB!.value as number[]).splice(0, 3, ...(sgn > 0 ? bone : ink));
    this.pass.render(renderer, out);
    this.rail(t, out);
    const j = Math.max(pulse(t, this.tSen, 0.06), pulse(t, tTaku, 0.06), pulse(t, this.tHe, 0.06));
    const w = pulse(t, e8, 0.05) * (n8 >= 0 ? 1 : 0);
    return {
      shake: shakeAt(t, 20 * j + 8 * w),
      ca: 0.5 + 4 * j,
      flash: 1.2 * Math.pow(prog(t, this.ctx.end - 0.1, this.ctx.end), 2),
      bloom: 0.6 + 0.8 * prog(t, this.tHe, this.ctx.end),
      invert: frames(t, this.tSen, 2) ? 1 : 0,
    };
  }

  // ------------------------------------------------------------------ helpers
  /** The line in the rail, over everything (not cut by the fault). */
  private rail(t: number, out: THREE.WebGLRenderTarget) {
    const c = this.T.ctx;
    this.T.clear();
    lyricRail(c, this.lineWords, t, this.act, { band: t >= this.tSen ? rgba('ink', 0.92) : undefined });
    this.ctx.comp.draw(this.ctx.renderer, this.T.upload(), out);
  }
  private apply(c: CanvasRenderingContext2D, cam: Cam) {
    c.translate(W / 2, H / 2);
    c.rotate(cam.rot);
    c.scale(cam.zoom, cam.zoom);
    c.translate(-cam.cx, -cam.cy);
  }
  private toScreen(cam: Cam, x: number, y: number): [number, number] {
    const px = (x - cam.cx) * cam.zoom, py = (y - cam.cy) * cam.zoom;
    const cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    return [W / 2 + px * cs - py * sn, H / 2 + px * sn + py * cs];
  }

  /** Upload the fault (world points through the camera) and the strike-slip offsets. */
  private setFault(cam: Cam, reveal: number, slip: number, open: number, glow: number, A: Layer2D, B: Layer2D, fa: 'ink' | 'bone', fb: 'ink' | 'bone') {
    const u = this.pass.u;
    const pts = this.crack.map(([x, y]) => this.toScreen(cam, x, y));
    (u.pts!.value as number[]).splice(0, NP * 2, ...pts.flat());
    u.npts!.value = NP;
    // slip along the fault's mean direction, opening across it
    const [x0, y0] = pts[0]!, [x1, y1] = pts[NP - 1]!;
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const dx = (x1 - x0) / l, dy = (y1 - y0) / l, nx = -dy, ny = dx;
    const s = slip * cam.zoom, hw = (open * cam.zoom) / 2;
    (u.offA!.value as number[]).splice(0, 2, dx * s / 2 + nx * hw, dy * s / 2 + ny * hw);
    (u.offB!.value as number[]).splice(0, 2, -dx * s / 2 - nx * hw, -dy * s / 2 - ny * hw);
    u.open!.value = open * cam.zoom;
    u.glow!.value = glow;
    u.reveal!.value = reveal;
    u.texA!.value = A.texture;
    u.texB!.value = B.texture;
    const col = (k: 'ink' | 'bone') => (k === 'ink' ? [0.0037, 0.0042, 0.0049] : [0.81, 0.78, 0.7]);
    (u.fieldA!.value as number[]).splice(0, 3, ...col(fa));
    (u.fieldB!.value as number[]).splice(0, 3, ...col(fb));
  }

  /** Geological strata: wavy hairlines every 54 px. */
  private strata(c: CanvasRenderingContext2D, t: number) {
    c.lineWidth = 1.5;
    for (let k = -2; k < 24; k++) {
      c.strokeStyle = rgba(k % 4 === 0 ? 'ash' : 'gunmetal', k % 4 === 0 ? 0.55 : 0.8);
      c.beginPath();
      for (let x = -300; x <= W + 300; x += 40) {
        const y = k * 54 + 8 * Math.sin(x / 290 + k * 1.3) + 5 * noise1(x / 160 + k * 7, 3);
        if (x === -300) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    void t;
  }

  /**
   * The drum: twelve seismograph traces across the slab, each spiking on the sung characters (the nearest
   * rows first, a little later further away) and on the kicks; the fault cuts through all of them.
   */
  private slab(c: CanvasRenderingContext2D, t: number) {
    const rows = 12, top = 150, gap = 62, head = 1820, v = 460;
    const ev: [number, number][] = [...this.kicks.map(([kt, s]) => [kt, 10 * s] as [number, number]), ...this.chs.filter((x) => x.t <= t).map((x) => [x.t, 44] as [number, number])];
    for (let r = 0; r < rows; r++) {
      const y0 = top + r * gap, lag = Math.abs(r - 6) * 0.025;
      const amp = (tau: number) => {
        let a = noise1(tau * 33 + r * 7, 11) * 1.8;
        for (const [te, A] of ev) { const d = tau - te - lag; if (d >= 0 && d < 0.5) a += A * (1 - Math.abs(r - 6) / 9) * Math.exp(-d / 0.08) * Math.sin(d * 2 * Math.PI * (17 + r)) * (hash(te, r) < 0.5 ? 1 : -1); }
        return a;
      };
      c.strokeStyle = rgba(r === 6 ? 'nixie' : 'bone', r === 6 ? 1 : 0.62);
      c.lineWidth = r === 6 ? 2.6 : 1.6;
      c.beginPath();
      for (let x = -200; x <= head; x += 4) {
        const yy = y0 - amp(t - (head - x) / v);
        if (x === -200) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
    // hairline cracks radiating from each slam, where the fault will run
    this.chs.slice(0, 6).forEach((x, i) => {
      if (t < x.t) return;
      const r = mulberry32(100 + i);
      c.strokeStyle = rgba('nixie', 0.7 * clamp(1 - (t - x.t) / 1.5));
      c.lineWidth = 1.5;
      const grow = ease.outExpo(prog(t, x.t, x.t + 0.2));
      for (let n = 0; n < 4; n++) {
        let px = 1010 + (r() - 0.5) * 160, py = 200 + i * 120, ang = r() * Math.PI * 2;
        c.beginPath();
        c.moveTo(px, py);
        for (let k = 0; k < 6; k++) { ang += (r() - 0.5) * 1.2; px += Math.cos(ang) * 34 * grow; py += Math.sin(ang) * 34 * grow; c.lineTo(px, py); }
        c.stroke();
      }
    });
  }

  /** The seismograph pen along the bottom: the world line, spiking on kicks and harder on the slams. */
  private seismo(c: CanvasRenderingContext2D, t: number) {
    const y0 = 930, head = 1780, v = 520;
    const ev: [number, number][] = [...this.kicks.map(([kt, s]) => [kt, 22 * s] as [number, number]), ...this.chs.filter((x) => x.t <= t).map((x) => [x.t, 60] as [number, number])];
    const amp = (tau: number) => {
      let a = noise1(tau * 40, 9) * 2.5;
      for (const [te, A] of ev) if (tau >= te && tau - te < 0.4) a += A * Math.exp(-(tau - te) / 0.07) * Math.sin((tau - te) * 2 * Math.PI * 22) * (hash(te, 5) < 0.5 ? 1 : -1);
      return a;
    };
    c.strokeStyle = rgba('nixie');
    c.lineWidth = 2.5;
    c.beginPath();
    for (let x = -200; x <= head; x += 3) {
      const tau = t - (head - x) / v;
      const yy = y0 - amp(tau);
      if (x === -200) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.stroke();
    c.fillStyle = rgba('ember');
    c.beginPath();
    c.arc(head, y0 - amp(t), 6, 0, Math.PI * 2);
    c.fill();
  }

  /** A single character slammed at a screen position. */
  private loose(c: CanvasRenderingContext2D, t: number, x: Ch, cx: number, cy: number, size: number, ink = 'bone') {
    const k = slam(t, x.t, 0.45, 0.12);
    if (!k) return;
    c.save();
    c.translate(cx, cy);
    c.scale(k, k);
    c.font = font(F.dela(), size);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = rgba(t - x.t < 0.08 && ink !== 'nixie' ? 'nixie' : ink);
    c.fillText(x.ch, 0, size * 0.04);
    c.restore();
  }

  /** Deadpan annotations: the fault's data, bottom-left. */
  private notes(c: CanvasRenderingContext2D, t: number) {
    const s = this.slip(t);
    c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('ash', 0.85);
    monoText(c, `STRIKE-SLIP   Δs = ${(s / 100).toFixed(2)} m`, 120, H - 136, 17);
    monoText(c, `N 35.698°  E 139.773°   M ${(5 + s / 40).toFixed(1)}`, 120, H - 110, 17);
  }
}
