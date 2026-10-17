// `ergosphere` — #12 静止限界のドグマ, 『有限』それは二つの 針が示す (docs/DESIGN.md).
// 'Finite' is what the two hands show. A clock dial drawn in thread, hanging in the dark: its rim and ticks, its two
// hands, the second hand in nixie (the world line) going round once in two beats. Near a spinning black hole nothing
// can stand still: inside the static limit (the dashed circle) space itself is carried round, faster nearer the
// middle, and the dial sinks there into a well. So the fine lines of the face are wound into a whirl, more with
// every beat, and the hands with them: straight where they reach beyond the limit, bent into the whirl inside it.
// On 針 the two hands meet at twelve. We come up from low across the face to look down into it.
// `merciless` (Act II, 『有限』それは無慈悲に 時を刻み): the same dial, cold, and a crimson second hand that never
// slows. On every beat, where the hand is, the dial is cut along it; the wedges between the cuts drift apart, in
// depth too, their cut edges crimson: after twelve beats every hour stands apart from the next. Time, carved.
// One smooth move each; no text but the lyric, the numerals and STATIC LIMIT; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { clamp, hash, lerp } from '../engine/util';
import { Plate, charsOf, lyricRail, monoText } from './_kit';
import { Dark, Lights, motes } from './_sky';

const TAU = Math.PI * 2, FOV = 34;
/** The dial's radius, the static limit's, and the core inside which everything turns together. */
const R = 4, RS = 0.62 * R, RC = 0.1 * R;
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const mod = (x: number, m: number) => ((x % m) + m) % m;

export default class Ergosphere extends Plate {
  dark = new Dark();
  lines = new LineBatch(9000, { screen2D: false, blend: 'add' });
  lights = new Lights(6);
  cam = new THREE.PerspectiveCamera(FOV, PW / PH, 0.1, 400);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 16; nbHari = 10;

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    this.nbEnd = (end - this.tb0) / this.per;
    if (this.act !== 'b') this.nbHari = (charsOf([this.myLine().words[1]!])[0]!.t - this.tb0) / this.per; // 針
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    return this.act === 'b' ? this.carved(f.t, out) : this.dragged(f.t, out);
  }

  /** The camera: D from a point tgt of the dial's plane, th off its normal (0 = face on), ph round it; twelve o'clock up. */
  private look(tgt: THREE.Vector3, D: number, th: number, ph: number) {
    this.cam.position.set(tgt.x + D * Math.sin(th) * Math.sin(ph), tgt.y - D * Math.sin(th) * Math.cos(ph), D * Math.cos(th));
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
  }
  /** A numeral of the dial at a place in the world, its size following the distance. */
  private numeral(c: CanvasRenderingContext2D, s: string, p: THREE.Vector3, alpha: number) {
    const d = p.distanceTo(this.cam.position), v = p.clone().project(this.cam);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return;
    c.font = font(F.archivo(100, 500), clamp((0.52 * (H / 2)) / (d * Math.tan((FOV * Math.PI) / 360)), 16, 80));
    c.fillStyle = rgba('bone', alpha);
    c.fillText(s, (v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H);
  }

  // ------------------------------------------------------------------ Act I: inside the static limit, dragged round
  private dragged(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const lt = t - this.tb0, nb = lt / this.per, u = clamp(nb / this.nbEnd);
    // the drag: how far round the middle has been carried (radians; it runs away at the end), and how deep the well is
    const last = clamp((nb - (this.nbEnd - 1.6)) / 1.6);
    const A = 0.5 + 9 * Math.pow(u, 1.5) + 6 * last * last * last, DW = 0.3 + 1.3 * smoother(u);
    const G0 = Math.pow(1 - RC / RS, 1.6) * Math.pow(RS / RC, 1.3);
    const g = (r: number) => (r >= RS ? 0 : (Math.pow(1 - Math.max(r, RC) / RS, 1.6) * Math.pow(RS / Math.max(r, RC), 1.3)) / G0); // (none at the limit, and it comes on gently there)
    /** The place on the dial at angle a (clockwise from twelve) and radius r, dragged. */
    const P = (a: number, r: number, o: THREE.Vector3) => {
      const b = a + A * g(r);
      return o.set(r * Math.sin(b), r * Math.cos(b), -DW * Math.pow(Math.max(0, 1 - r / RS), 1.7));
    };

    // the camera: low across the face at first, coming up to look down into it; in at the end
    this.look(new THREE.Vector3(-1.7, -0.45, 0), lerp(9.2, 12.2, smoother(clamp(nb / 8))) - 2.6 * last * last, lerp(1.15, 0.5, smoother(clamp(nb / 9))), lerp(-0.3, 0.22, u));
    this.dark.render(renderer, out, [0.004, 0.0016, 0.0005]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 400, new THREE.Vector3(0, 0, 1), [12, 9, 6], lt, 9, 0.7);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const bone = LIN.bone, hot = LIN.nixie;
    // the rim, the ticks
    for (const [r, gain] of [[R, 0.55], [R + 0.3, 0.16]] as const) for (let i = 0; i < 200; i++) {
      P((i / 200) * TAU, r, p); P(((i + 1) / 200) * TAU, r, q);
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.4, bone[0] * gain, bone[1] * gain, bone[2] * gain, 1);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU, major = i % 5 === 0, gain = major ? 0.9 : 0.38;
      P(a, R - (major ? 0.5 : 0.2), p); P(a, R, q);
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, major ? 2 : 1.1, bone[0] * gain, bone[1] * gain, bone[2] * gain, 1);
    }
    // the face inside the limit: fine lines out from the middle (wound up by the drag) and rings (which show the well)
    const r0 = 1.5 * RC;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU, base = i % 5 ? 0.15 : 0.34;
      P(a, r0, p);
      for (let j = 1; j <= 64; j++) {
        const r = r0 * Math.pow(RS / r0, j / 64);
        P(a, r, q);
        const gain = base * clamp(r / (0.45 * RS), 0.1, 1) * (1 - 0.5 * smoother(clamp((r - 0.85 * RS) / (0.15 * RS))));
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1, bone[0] * gain, bone[1] * gain * 0.92, bone[2] * gain * 0.8, 1);
        p.copy(q);
      }
    }
    for (const k of [0.2, 0.34, 0.5, 0.66, 0.82]) for (let i = 0; i < 120; i++) {
      P((i / 120) * TAU, k * RS, p); P(((i + 1) / 120) * TAU, k * RS, q);
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1, bone[0] * 0.1, bone[1] * 0.09, bone[2] * 0.08, 1);
    }
    // the static limit: dashed, nixie
    for (let i = 0; i < 144; i += 2) {
      P((i / 144) * TAU, RS, p); P(((i + 1) / 144) * TAU, RS, q);
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.6, hot[0] * 1.3, hot[1] * 1.3, hot[2] * 1.3, 1);
    }
    // the hands: the minute hand reaches beyond the limit, the hour hand does not; they meet at twelve on 針.
    // The second hand, the world line, goes round once in two beats
    const mn = 0.65 * (nb - this.nbHari), hr = mn / 12, sec = (nb / 2) * TAU;
    const hand = (a: number, from: number, len: number, col: readonly number[], gain: number, width: number) => {
      P(a + (from < 0 ? Math.PI : 0), Math.abs(from), p);
      for (let j = 1; j <= 90; j++) {
        const s = from + (len - from) * Math.pow(j / 90, 1.3);
        P(a + (s < 0 ? Math.PI : 0), Math.abs(s), q);
        const k = gain * clamp(Math.abs(s) / (0.3 * RS), 0.3, 1); // (dimmer where it is wound tight: no white knot in the middle)
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, width, col[0]! * k, col[1]! * k, col[2]! * k, 1);
        p.copy(q);
      }
    };
    hand(hr, RC, 0.5 * R, bone, 1.7, 3);
    hand(mn, RC, 0.86 * R, bone, 1.9, 2.3);
    hand(sec, RC, 0.95 * R, hot, 2.2, 1.6);
    for (let j = 0; j < 40; j++) {
      // (the second hand's tip leaves a little light along the rim)
      P(sec - (j / 40) * 1.3, 0.95 * R, p); P(sec - ((j + 1) / 40) * 1.3, 0.95 * R, q);
      const gain = 1.5 * Math.pow(1 - j / 40, 2);
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.6, hot[0] * gain, hot[1] * gain, hot[2] * gain, 1);
    }
    L.render(renderer, out, this.cam);

    this.lights.clear();
    this.lights.add(P(0, 0, new THREE.Vector3()), hot, 0.34, 1.1, 0.8);
    this.lights.add(P(sec, 0.95 * R, new THREE.Vector3()), hot, 0.3, 1, 1);
    this.lights.add(P(mn, 0.86 * R, new THREE.Vector3()), bone, 0.2, 0.8, 1);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const h of [12, 3, 6, 9]) this.numeral(c, String(h), P((h / 12) * TAU, R - 0.9, new THREE.Vector3()), 0.75);
    const v = new THREE.Vector3(0, RS + 0.2, 0).project(this.cam);
    c.fillStyle = rgba('ash', 0.8);
    c.textBaseline = 'alphabetic';
    monoText(c, 'STATIC LIMIT', (v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H, 16, 500, 'center');
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.65 };
  }

  // ------------------------------------------------------------------ Act II: carved
  private carved(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const lt = t - this.tb0, nb = lt / this.per, u = clamp(nb / this.nbEnd);
    // the hand: five twelfths of a turn a beat; where it is on each beat, a cut, half way between two hours: after
    // twelve beats every hour is cut from the next
    const STEP = (TAU * 5) / 12, HALF = TAU / 24, ha = STEP * nb + HALF;
    const n = clamp(Math.floor(nb), 0, 12), s = smoother(clamp((nb - n) / 0.9));
    type Cut = { a: number; k: number };
    const cutsOf = (m: number): Cut[] => Array.from({ length: m }, (_, i) => ({ a: mod(STEP * (i + 1) + HALF, TAU), k: i + 1 })).sort((x, y) => x.a - y.a);
    const before = cutsOf(Math.max(0, n - 1)), now = cutsOf(n);
    const spread = 0.1 + 0.08 * nb, deep = 0.05 * nb; // (little depth: seen at a slant, wedges far apart in depth would cross)
    /** How far the wedge that holds angle a has drifted, under a set of cuts: out along its middle, and in depth. */
    const off = (a: number, cuts: Cut[], o: THREE.Vector3) => {
      if (cuts.length < 2) return o.set(0, 0, 0);
      let i = cuts.length - 1;
      for (let j = 0; j < cuts.length && cuts[j]!.a <= a; j++) i = j;
      const mid = (cuts[i]!.a + (i + 1 < cuts.length ? cuts[i + 1]!.a : cuts[0]!.a + TAU)) / 2;
      return o.set(Math.sin(mid) * spread, Math.cos(mid) * spread, (hash(cuts[i]!.k, 7) - 0.5) * 2 * deep);
    };
    // (a new cut parts a wedge in two: its halves start where it was and ease apart)
    const oa = new THREE.Vector3(), ob = new THREE.Vector3();
    const drift = (a: number) => { off(mod(a, TAU), before, oa); off(mod(a, TAU), now, ob); return oa.lerp(ob, s); };

    this.look(new THREE.Vector3(2.1, -0.2, 0), lerp(12.5, 17.5, smoother(u)), lerp(0.25, 0.62, smoother(u)), lerp(0.5, -0.35, u));
    this.dark.render(renderer, out, [0.0012, 0.0016, 0.0026]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 400, new THREE.Vector3(0, 0, 1), [14, 10, 6], lt, 4, 0.6);
    const bone = LIN.bone, red = LIN.crimson;
    /** A piece of the dial from (a0, r0) to (a1, r1), carried with the wedge that holds angle am. */
    const piece = (am: number, a0: number, r0: number, a1: number, r1: number, col: readonly number[], gain: number, width: number) => {
      const o = drift(am);
      L.seg(r0 * Math.sin(a0) + o.x, r0 * Math.cos(a0) + o.y, o.z, r1 * Math.sin(a1) + o.x, r1 * Math.cos(a1) + o.y, o.z, width, col[0]! * gain, col[1]! * gain, col[2]! * gain, 1);
    };
    for (const [r, gain] of [[R, 0.6], [R + 0.3, 0.2], [0.72 * R, 0.12], [0.12 * R, 0.3]] as const) for (let i = 0; i < 240; i++) {
      const a0 = (i / 240) * TAU, a1 = ((i + 1) / 240) * TAU;
      piece((a0 + a1) / 2, a0, r, a1, r, bone, gain, 1.4);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU + 1e-4, major = i % 5 === 0;
      piece(a, a, R - (major ? 0.5 : 0.2), a, R, bone, major ? 0.9 : 0.4, major ? 2 : 1.1);
    }
    // the cuts: each wedge's two edges, crimson; the newest flares
    for (const cut of now) {
      const gain = 0.8 + 3.4 * Math.exp(-(nb - cut.k) / 0.6);
      for (const e of [-0.002, 0.002]) piece(cut.a + e, cut.a, 0.05 * R, cut.a, R + 0.32, red, gain, 1.5);
    }
    // the hand, over the dial; its tip leaves a little light behind it
    const hx = Math.sin(ha), hy = Math.cos(ha);
    L.seg(-0.18 * R * hx, -0.18 * R * hy, 0.06, 1.22 * R * hx, 1.22 * R * hy, 0.06, 2.6, red[0] * 3.4, red[1] * 3.4, red[2] * 3.4, 1);
    for (let j = 0; j < 40; j++) {
      const a0 = ha - (j / 40) * 1.5, a1 = ha - ((j + 1) / 40) * 1.5, gain = 1.6 * Math.pow(1 - j / 40, 2);
      L.seg(1.22 * R * Math.sin(a0), 1.22 * R * Math.cos(a0), 0.06, 1.22 * R * Math.sin(a1), 1.22 * R * Math.cos(a1), 0.06, 1.6, red[0] * gain, red[1] * gain, red[2] * gain, 1);
    }
    L.render(renderer, out, this.cam);

    this.lights.clear();
    this.lights.add(new THREE.Vector3(0, 0, 0.06), red, 0.4, 2.2, 0.5);
    this.lights.add(new THREE.Vector3(1.22 * R * hx, 1.22 * R * hy, 0.06), red, 0.34, 2.4, 0.6);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) {
      const a = (h / 12) * TAU, o = drift(a + 1e-4);
      this.numeral(c, String(h), new THREE.Vector3((R - 0.9) * Math.sin(a) + o.x, (R - 0.9) * Math.cos(a) + o.y, o.z), 0.8);
    }
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.5, bloom: 0.55 };
  }
}
