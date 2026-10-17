// `heartbeat` — #14 形而下のネクローシス, 数十億もの 鼓動の数さえ (docs/DESIGN.md).
// A heart's trace drawn in light: a point of nixie writes it, a spike on every kick. Then we rise and draw back, and
// behind it there is another heart's trace, and two more, four, eight: a field of traces going back to the horizon,
// each a life at its own pace, all written at the same edge, now. A counter races through a lifetime of heartbeats.
// The spikes of the near traces stand in front of the far ones. Necrosis: at the end the traces go flat one after
// another, from the horizon toward us.
// `flatline` (Act II, #22 存在了解のメルト, 命の主張と 無意味な証明): the same field, cold, failing: its traces go flat
// one by one until only hers, crimson, still beats, weaker on every kick; above the field a proof in chalk
// (life := Σ heartbeats …); on 無意味 the proof is struck through and her trace runs out flat; Q.E.D. is crossed out.
// One smooth move each; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, makeRT, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { clamp, hash, lerp } from '../engine/util';
import { Plate, charsOf, lyricRail, monoText } from './_kit';
import { Dark, Lights } from './_sky';

/** The field: how many traces, how far apart in depth; where they are written (x), how fast the paper runs (units/s). */
const N = 72, GAP = 0.8, XN = 4.6, XL = -17, SWEEP = 5;
const LIFE = 2_838_412_907; // heartbeats in about 80 years
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** One heartbeat's PQRST shape at u seconds after its QRS (amplitude in units of the R peak). */
function pqrst(u: number) {
  const g = (m: number, s: number, a: number) => a * Math.exp(-((u - m) * (u - m)) / (2 * s * s));
  return g(-0.16, 0.025, 0.12) + g(-0.025, 0.008, -0.14) + g(0, 0.009, 1) + g(0.025, 0.01, -0.28) + g(0.22, 0.05, 0.25);
}
/** Where a beat is sampled (seconds from its QRS): on every peak and trough, so the spikes keep their height as they run. */
const U = [-0.26, -0.21, -0.185, -0.16, -0.135, -0.11, -0.06, -0.04, -0.032, -0.025, -0.018, -0.012, -0.006, 0, 0.006, 0.012, 0.018, 0.025, 0.032, 0.04, 0.055, 0.1, 0.14, 0.17, 0.195, 0.22, 0.245, 0.27, 0.31, 0.37];
/** The proof (Act II), as chalked up: text, x, y (screen px). */
const PROOF: [string, number, number][] = [
  ['life := Σ heartbeats(t)', 150, 130],
  ['for t < T :  ECG(t) ≠ 0', 150, 192],
  ['T ≈ 2.8 × 10⁹ beats', 150, 254],
  ['assert(alive)', 760, 130],
  ['so  命 > 0', 760, 192],
  ['dE/dt = −λ E', 760, 254],
  ['lim  ECG(t) = 0', 1150, 130],
  ['t → T', 1186, 164],
];

export default class Heartbeat extends Plate {
  dark = new Dark();
  rt = makeRT(W, H, { samples: 4 });
  lines = new LineBatch(46000, { screen2D: false, blend: 'add', depthTest: true });
  over = new LineBatch(64, { blend: 'add' }); // (Act II: the strokes through the proof, in screen px)
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(36, PW / PH, 0.1, 400);
  L = new Layer2D();
  /** What stands in front: the area between each trace and its baseline, drawn into the depth buffer only. */
  fillPos = new Float32Array(30000 * 18);
  fillGeo = new THREE.BufferGeometry();
  fillScene = new THREE.Scene();
  pts: number[] = [];
  kicks: number[] = [];
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 14;
  tNec = 0; tMu = 1e9;

  override init() {
    const { audio, start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    this.nbEnd = (end - this.tb0) / this.per;
    this.kicks = audio.events('kick', start - 6, end + 1).map(([t]) => t);
    const ws = this.lineWords;
    if (this.act === 'b') this.tMu = (ws[1] ?? ws[0]!).start; // 無意味な証明
    else { const cs = charsOf([ws[ws.length - 1]!]); this.tNec = cs[cs.length - 1]!.t + 0.15; }
    this.fillGeo.setAttribute('position', new THREE.BufferAttribute(this.fillPos, 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(this.fillGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4 }));
    mesh.frustumCulled = false;
    this.fillScene.add(mesh);
  }

  /** Our trace at time tau: a beat on every kick (Act II: each weaker, and none once the proof has failed). */
  private ecg(tau: number) {
    let v = 0;
    const fail = this.act === 'b' ? 1 - clamp((tau - this.tMu) / 1.6) : 1;
    for (const k of this.kicks) {
      const u = tau - k;
      if (u > -0.3 && u < 0.5) v += pqrst(u) * (this.act === 'b' ? fail * (0.6 + 0.4 * hash(k, 2)) : 1);
    }
    return v;
  }

  /** Trace r at t, newest first, into this.pts: pairs of (seconds ago, value), back to smax seconds ago. */
  private trace(r: number, t: number, smax: number) {
    const pts = this.pts;
    pts.length = 0;
    if (r === 0) {
      const taus: number[] = [];
      for (const k of this.kicks) {
        if (k < t - smax - 0.5 || k > t + 0.4) continue;
        for (const u of U) { const s = t - (k + u); if (s > 0 && s < smax) taus.push(k + u); }
      }
      taus.sort((a, b) => b - a);
      pts.push(0, this.ecg(t));
      for (const tau of taus) pts.push(t - tau, this.ecg(tau));
    } else {
      // another heart: its own pace (46 to 80 a minute) and phase
      const rate = 0.75 + 0.55 * hash(r, 1), ph = hash(r, 2), stride = r > 24 ? 2 : 1;
      const x = t / rate + ph;
      pts.push(0, pqrst((x - Math.round(x)) * rate));
      for (let k = Math.floor(x + 0.5); k >= Math.ceil((t - smax) / rate + ph - 0.5); k--) {
        const tk = (k - ph) * rate;
        for (let j = U.length - 1; j >= 0; j -= stride) {
          const u = U[j]!, s = t - (tk + u);
          if (Math.abs(u) <= rate / 2 && s > 0 && s < smax) pts.push(s, pqrst(u));
        }
      }
    }
    pts.push(smax, 0);
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const b = this.act === 'b';
    const lt = t - this.tb0, nb = lt / this.per, u = clamp(nb / this.nbEnd);

    // the camera. α: close on our trace and the point that writes it; then up and back over the field.
    // β: over the field from the start, low, sliding to the right
    const w = smoother(clamp((nb - 3.2) / 8));
    const pos = b ? new THREE.Vector3(lerp(-3, 0.4, u), lerp(5.2, 4.6, u), lerp(12, 10.6, u))
      : new THREE.Vector3(3.3, 0.55, 3.4).lerp(new THREE.Vector3(-1 + 0.25 * (nb - 11), 7.5, 13), w);
    const tgt = b ? new THREE.Vector3(lerp(-2.4, 1, u), 1.0, -9)
      : new THREE.Vector3(3.2, 0.42, 0).lerp(new THREE.Vector3(-0.5, 0, -13), w);
    this.cam.position.copy(pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    this.dark.render(renderer, this.rt, b ? [0.0012, 0.0016, 0.0026] : [0.004, 0.0016, 0.0005]);

    // the traces. α: one, then twice as many on every beat from the second bar, back to the horizon
    const nvis = b ? N : nb < 4 ? 1 : Math.pow(2, nb - 4);
    const L = this.lines, P = this.fillPos, pts = this.pts;
    L.clear();
    let nq = 0, y00 = 0;
    for (let r = 0; r < N; r++) {
      const a = b ? 1 : r === 0 ? 1 : smoother(clamp(nvis - r));
      if (a <= 0.003) continue;
      const z = -r * GAP, xl = XL - r * 0.9, smax = (XN - xl) / SWEEP;
      this.trace(r, t, smax);
      // how much life is left in it. α: all go flat at the end, the furthest first. β: one by one, long before hers
      const alive = b ? (r ? 1 - smoother(clamp((nb - 0.4 - 6.2 * hash(r, 5)) / 0.8)) : 1)
        : 1 - smoother(clamp((t - this.tNec - (1 - r / N) * 0.26) / 0.09));
      const amp = (r ? 0.9 : 1.25) * alive;
      const col = r ? (b ? LIN.cold : LIN.bone) : b ? LIN.crimson : LIN.nixie;
      const g0 = r ? (0.5 * Math.exp(-r / 40) + 0.07) * a * (b ? 1.5 : 1) * (0.45 + 0.55 * alive) : b ? 3.2 : 2.1;
      let x0 = XN - pts[0]! * SWEEP, y0 = amp * pts[1]!;
      if (r === 0) y00 = y0;
      // (where it is written: a dot at the edge of now)
      const gh = r ? 1.7 * a * Math.exp(-r / 60) * (0.25 + 0.75 * alive) * (b ? 1.4 : 1) : 0;
      if (r) L.seg(XN, y0, z, XN + 0.002, y0, z, 3.2, col[0] * gh, col[1] * gh, col[2] * gh, 1);
      for (let i = 2; i < pts.length; i += 2) {
        const x1 = XN - pts[i]! * SWEEP, y1 = amp * pts[i + 1]!;
        const g = g0 * clamp((x1 - xl) / 6) * (r ? 1 : 0.4 + 0.6 * Math.exp(-pts[i]! / 1.3));
        L.seg(x0, y0, z, x1, y1, z, r ? 1.15 : 2.2, col[0] * g, col[1] * g, col[2] * g, 1);
        if ((Math.abs(y0) > 0.006 || Math.abs(y1) > 0.006) && nq < 30000) {
          P.set([x0, 0, z, x0, y0, z, x1, y1, z, x0, 0, z, x1, y1, z, x1, 0, z], nq * 18);
          nq++;
        }
        x0 = x1; y0 = y1;
      }
    }
    (this.fillGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.fillGeo.setDrawRange(0, nq * 6);
    renderer.setRenderTarget(this.rt);
    renderer.render(this.fillScene, this.cam);
    L.render(renderer, this.rt, this.cam);
    this.lights.clear();
    const dying = b ? 1 - 0.6 * smoother(clamp((t - this.tMu) / 1.6)) : 1 - 0.7 * smoother(clamp((t - this.tNec - 0.2) / 0.1));
    this.lights.add(new THREE.Vector3(XN, y00, 0), b ? LIN.crimson : LIN.ember, lerp(0.16, 0.3, b ? 1 : w), (b ? 2.2 : 1.2) * dying, 1);
    this.lights.render(renderer, this.rt, this.cam);
    comp.draw(renderer, this.rt.texture, out, { mode: 'replace' });

    const c = this.L.ctx;
    this.L.clear();
    this.over.clear();
    if (b) this.proof(c, t, u);
    else this.counter(c, t);
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    if (b) this.over.render(renderer, out);
    return b ? { vignette: 0.5, bloom: 0.5 } : { vignette: 0.3, bloom: 0.65 };
  }

  /** Heartbeats counted at t: races up (stepping on the 8ths), frozen once necrosis sets in. */
  private count(t: number) {
    const e8 = this.B.t(this.B.at8(Math.min(t, this.tNec)) / 2);
    const u = clamp((e8 - this.ctx.start) / (this.tNec - this.ctx.start));
    return Math.floor(LIFE * Math.pow(u, 3.2) + (u > 0 ? hash(e8, 2) * 9999 : 0));
  }

  /** The counter: tabular (one fixed cell per digit), top right. (No caption: the count says it.) */
  private counter(c: CanvasRenderingContext2D, t: number) {
    const s = this.count(t).toLocaleString('en-US');
    const size = 128, cell = size * 0.66, comma = size * 0.28;
    let wd = 0;
    for (const ch of s) wd += ch === ',' ? comma : cell;
    let x = W - 120 - wd;
    c.font = font(F.archivo(100, 700), size);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = t > this.tNec ? rgba('blood') : rgba('bone', 0.92);
    for (const ch of s) {
      const cw = ch === ',' ? comma : cell;
      c.fillText(ch, x + cw / 2, 210);
      x += cw;
    }
  }

  /** Act II: the proof, in chalk above the field; on 無意味 struck through, and Q.E.D. crossed out. */
  private proof(c: CanvasRenderingContext2D, t: number, u: number) {
    const dx = -50 * u, strike = 1 - Math.pow(1 - clamp((t - this.tMu) / 0.5), 3);
    const red = LIN.crimson, O = this.over;
    c.textBaseline = 'alphabetic';
    PROOF.forEach(([s, x, y], i) => {
      c.save();
      c.translate(x + dx, y);
      c.rotate((hash(i, 3) - 0.5) * 0.03);
      c.fillStyle = rgba('ash', 0.85);
      const wd = monoText(c, s, 0, 0, i === 7 ? 24 : 30, 400);
      c.restore();
      const k = clamp(strike * 1.4 - i * 0.05);
      if (k > 0) O.seg2(x + dx - 10, y - 11, x + dx + (wd + 14) * k, y - 8 + (hash(i, 5) - 0.5) * 8, 3, [red[0] * 3, red[1] * 3, red[2] * 3]);
    });
    if (strike > 0) {
      const qx = 1130 + dx, qy = 300;
      c.font = font(F.archivo(125, 900), 84);
      c.textAlign = 'left';
      c.fillStyle = rgba('ash', 0.85 * clamp(strike * 3));
      c.fillText('Q.E.D.', qx, qy);
      const k = 1 - Math.pow(1 - clamp((t - this.tMu - 0.35) / 0.3), 3);
      if (k > 0) {
        O.seg2(qx - 14, qy - 70, qx - 14 + 370 * k, qy - 70 + 84 * k, 5, [red[0] * 3.4, red[1] * 3.4, red[2] * 3.4]);
        O.seg2(qx - 14, qy + 14, qx - 14 + 370 * k, qy + 14 - 84 * k, 5, [red[0] * 3.4, red[1] * 3.4, red[2] * 3.4]);
      }
    }
  }
}
