// `butterfly` — #06 蝶翼のダイバージェンス, 塵一つ 誤算を許さぬ必然 and the D-mail (docs/DESIGN.md).
// 塵: one speck of light, crosshair and coordinates, and a second speck Δ₀ = 10⁻⁶ away. Zoom-out punches
// on the beats (10⁻⁶ → 10⁻³ → 1) as both start tracing the Lorenz flow, coincident. 誤 (miscalculation):
// they diverge, one nixie and one bone, the camera whipping round the attractor on every beat, log Δ
// climbing in a straight line in the corner. 必然 (inevitability): pull out to the front view: however
// different, both fill the same butterfly. The last beats are the D-mail: a discharge branching across
// the frame, then the meter rolling to 0.571024.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { Divergence } from '../engine/meter';
import { Meter3D } from '../engine/meter3d';
import { clamp, ease, frameIdx, lerp, mulberry32, prog, pulse } from '../engine/util';
import { Plate, charsOf, lyricRail, shakeAt, frames, monoText, sci, type Ch } from './_kit';

const SIGMA = 10, RHO = 28, BETA = 8 / 3;
const HSTEP = 0.002, KEEP = 2, TMAX = 48; // RK4 step, stored every KEEP steps, up to τ = TMAX
const DT = HSTEP * KEEP;
const D0 = 1e-6;
const FOV = 34;

function lorenz(p: number[]) { return [SIGMA * (p[1]! - p[0]!), p[0]! * (RHO - p[2]!) - p[1]!, p[0]! * p[1]! - BETA * p[2]!]; }
function rk4(p: number[], h: number) {
  const add = (a: number[], b: number[], k: number) => a.map((v, i) => v + b[i]! * k);
  const k1 = lorenz(p), k2 = lorenz(add(p, k1, h / 2)), k3 = lorenz(add(p, k2, h / 2)), k4 = lorenz(add(p, k3, h));
  return p.map((v, i) => v + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!));
}

export default class Butterfly extends Plate {
  L = new Layer2D();
  bg = new FSPass(/* glsl */ `uniform vec3 col; void main() { fragColor = vec4(col, 1.0); }`, { col: { value: [0, 0, 0] } });
  lines = new LineBatch(60000, { screen2D: false, blend: 'add' });
  cam = new THREE.PerspectiveCamera(FOV, PW / PH, 1e-9, 1e4);
  meter = new Meter3D({ brightness: 10 });
  div!: Divergence;
  /** The two trajectories (x, y, z interleaved, double precision) and their separation. */
  A = new Float64Array(0); Bt = new Float64Array(0); delta = new Float64Array(0);
  n = 0;
  dust: Ch[] = []; err: Ch[] = []; hitsu: Ch[] = [];
  // beats / times
  tMove = 0; tGo = 0; tHitsu = 0; tBolt = 0; tMeter = 0; tauSplit = 0;
  bWhip0 = 0;

  override init() {
    const { lyrics, audio } = this.ctx;
    this.div = new Divergence(lyrics, audio);
    const l = lyrics.get('塵一つ');
    this.dust = charsOf([l.words[0]!]);
    const cs = charsOf([l.words[1]!]);
    this.err = cs.slice(0, 6);
    this.hitsu = cs.slice(6);
    this.tGo = this.err[0]!.t; // 誤
    this.tHitsu = this.hitsu[0]!.t; // 必
    this.tMeter = this.div.sendT; // the verse's last downbeat: the meter rolls
    this.tBolt = this.B.t(this.B.at(this.tMeter - 0.01)); // the beat before it: the discharge
    this.tMove = this.B.t(this.B.at(this.dust[1]!.t) + 0); // the specks start moving on 一's beat
    this.bWhip0 = this.B.at(this.tGo + 0.06);

    // integrate: settle onto the attractor, then two trajectories D0 apart
    let p = [1, 1, 20];
    for (let i = 0; i < 20 / HSTEP; i++) p = rk4(p, HSTEP);
    let q = [p[0]! + D0, p[1]!, p[2]!];
    const n = Math.floor(TMAX / DT);
    this.n = n;
    this.A = new Float64Array(n * 3); this.Bt = new Float64Array(n * 3); this.delta = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.A.set(p, i * 3); this.Bt.set(q, i * 3);
      this.delta[i] = Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
      for (let k = 0; k < KEEP; k++) { p = rk4(p, HSTEP); q = rk4(q, HSTEP); }
    }
    // the τ where they first visibly part (Δ > 0.5) is put on 誤
    let i = 0;
    while (i < n - 1 && this.delta[i]! < 0.5) i++;
    this.tauSplit = i * DT;
  }

  /** Flow time τ shown at song time t. */
  private tau(t: number) {
    if (t < this.tMove) return 0;
    if (t < this.tGo) return this.tauSplit * Math.pow(prog(t, this.tMove, this.tGo), 1.3);
    if (t < this.tHitsu) return this.tauSplit + 16 * prog(t, this.tGo, this.tHitsu, (u) => 1 - Math.pow(1 - u, 1.4));
    return this.tauSplit + 16 + 3 * prog(t, this.tHitsu, this.tBolt);
  }
  private at(arr: Float64Array, tau: number): [number, number, number] {
    const f = clamp(tau / DT, 0, this.n - 1.001), i = Math.floor(f), u = f - i;
    return [0, 1, 2].map((k) => lerp(arr[i * 3 + k]!, arr[(i + 1) * 3 + k]!, u)) as [number, number, number];
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    if (t >= this.tMeter) return this.meterShot(t, out);
    if (t >= this.tBolt) return this.bolt(t, out);
    return this.attractor(t, out);
  }

  // ------------------------------------------------------------------ the attractor
  private attractor(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    (this.bg.u.col!.value as number[]).splice(0, 3, ...LIN.ink);
    this.bg.render(renderer, out);
    const tau = this.tau(t);
    const hA = this.at(this.A, tau), hB = this.at(this.Bt, tau);
    const mid = [(hA[0] + hB[0]) / 2, (hA[1] + hB[1]) / 2, (hA[2] + hB[2]) / 2];
    const centre = [0, 0, 25];
    const b = this.B.at(t), bt = this.B.t(b);

    // camera: distance (log) and orbit angles by shot
    const zooms = [9e-6, 9e-6, 2.5e-3, 1.4, 70]; // macro, Δ₀ shown, 10⁻³, 1, wide (beat after 一 onward)
    const bMove = this.B.at(this.tMove);
    const zi = clamp(b - bMove + 1, 0, zooms.length - 1);
    const zk = ease.outExpo(prog(t, bt, bt + 0.22));
    const lgD = lerp(Math.log(zooms[Math.max(0, zi - 1)]!), Math.log(zooms[zi]!), zi > 0 && b - bMove + 1 < zooms.length ? zk : 1);
    let dist = Math.exp(lgD);
    let az = -0.5 + 0.25 * (t - this.ctx.start), el = 0.35;
    let target = mid;
    // follow the heads while close, then the attractor's centre
    const wide = clamp((Math.log(dist) - Math.log(1.4)) / (Math.log(70) - Math.log(1.4)));
    target = mid.map((v, i) => lerp(v, centre[i]!, ease.inOutCubic(wide)));
    if (t >= this.tGo) {
      // whips: a new angle on every beat from 誤, snapping in
      const pose = (k: number) => {
        const r = mulberry32(900 + k);
        return { az: (r() - 0.5) * 5.5, el: (r() - 0.35) * 1.2, d: 62 + r() * 30 };
      };
      const p0 = pose(b - 1), p1 = pose(b);
      const k = ease.outExpo(prog(t, bt, bt + 0.2));
      az = lerp(p0.az, p1.az, k) + 0.15 * (t - bt);
      el = lerp(p0.el, p1.el, k);
      dist = lerp(p0.d, p1.d, k);
      target = centre;
      // 必: pull out to the classic front view (x across, z up), slowly turning
      const pull = ease.inOutCubic(prog(t, this.tHitsu - 0.4, this.tHitsu + 0.1));
      az = lerp(az, -Math.PI / 2 + 0.12 * (t - this.tHitsu), pull);
      el = lerp(el, 0.05, pull);
      dist = lerp(dist, 105, pull);
    }
    const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(dir[0]! * dist, dir[1]! * dist, dir[2]! * dist);
    this.cam.near = dist * 0.002;
    this.cam.far = dist * 50 + 400;
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();

    // the trajectories, relative to the target (double → float only after subtracting: Δ₀ survives)
    const L = this.lines;
    L.clear();
    const full = ease.inOutCubic(prog(t, this.tHitsu - 0.4, this.tHitsu + 0.3)); // the whole history shows up at 必
    const tail = lerp(Math.min(tau, 5), tau, full);
    const tau0 = Math.max(0, tau - tail);
    const i0 = Math.floor(tau0 / DT), i1 = Math.min(this.n - 1, Math.floor(tau / DT));
    const rel = (arr: Float64Array, i: number) => [arr[i * 3]! - target[0]!, arr[i * 3 + 1]! - target[1]!, arr[i * 3 + 2]! - target[2]!];
    const draw = (arr: Float64Array, col: [number, number, number], gain: number, w: number) => {
      let prev = rel(arr, i0);
      for (let i = i0 + 1; i <= i1; i++) {
        const cur = i === i1 ? this.at(arr, tau).map((v, k) => v - target[k]!) : rel(arr, i);
        const u = (i - i0) / Math.max(1, i1 - i0);
        const a = gain * lerp(Math.pow(u, 2.2), 0.35 + 0.65 * Math.pow(u, 3), full);
        L.seg(prev[0]!, prev[1]!, prev[2]!, cur[0]!, cur[1]!, cur[2]!, w, col[0] * a, col[1] * a, col[2] * a, 1);
        prev = cur;
      }
    };
    if (i1 > i0) {
      draw(this.Bt, LIN.bone, 1.1, 1.6);
      draw(this.A, LIN.nixie, 3.2, 2.0);
    }
    // the two heads: points (zero-length capsules, wide)
    const hp = (h: number[]) => h.map((v, k) => v - target[k]!);
    const pa = hp(hA), pb = hp(hB);
    L.seg(pb[0]!, pb[1]!, pb[2]!, pb[0]!, pb[1]!, pb[2]!, 9, LIN.bone[0] * 3, LIN.bone[1] * 3, LIN.bone[2] * 3, 1);
    L.seg(pa[0]!, pa[1]!, pa[2]!, pa[0]!, pa[1]!, pa[2]!, 11, LIN.ember[0] * 6, LIN.ember[1] * 6, LIN.ember[2] * 6, 1);
    L.render(renderer, out, this.cam);

    // ---- 2D: crosshair and labels in the macro shots, scale bar, the Δ panel, the lyric
    const c = this.L.ctx;
    this.L.clear();
    const proj = (p: number[]) => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.cam); return [(v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H]; };
    const [ax, ay] = proj(pa), [bx, by] = proj(pb);
    const macro = 1 - clamp((Math.log(dist) - Math.log(2.5e-3)) / (Math.log(1.4) - Math.log(2.5e-3)));
    if (macro > 0.02) {
      c.strokeStyle = rgba('gunmetal', macro);
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, ay); c.lineTo(W, ay); c.moveTo(ax, 0); c.lineTo(ax, H); c.stroke();
      c.textBaseline = 'alphabetic';
      c.fillStyle = rgba('bone', macro);
      monoText(c, `x₀ = (${hA.map((v) => v.toFixed(6)).join(', ')})`, ax + 22, ay - 22, 18);
      if (t >= this.B.t(bMove - 1)) {
        c.fillStyle = rgba('ash', macro);
        monoText(c, `x₀ + Δ₀     Δ₀ = 1.00e−6`, bx + 22, by + 38, 18);
      }
    }
    // scale bar: 160 px in world units
    const viewH = 2 * dist * Math.tan((FOV * Math.PI) / 360);
    const len = (160 * viewH) / H;
    c.fillStyle = rgba('bone', 0.8);
    c.fillRect(W - 120 - 160, H - 112, 160, 3);
    c.textBaseline = 'alphabetic';
    monoText(c, sci(len, 1), W - 120, H - 126, 17, 500, 'right');
    monoText(c, `LORENZ (10, 28, 8/3)   t = ${tau.toFixed(2)}`, 120, H - 84, 17);
    if (t >= this.tGo) this.panel(c, tau, t);

    // the line, in the rail (the attractor is the picture)
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);

    const j = Math.max(...this.dust.map((x) => pulse(t, x.t, 0.05)), ...this.err.map((x) => pulse(t, x.t, 0.05)), pulse(t, this.tHitsu, 0.08));
    const whip = t >= this.tGo ? pulse(t, bt, 0.06) : 0;
    const zoomHit = zi > 0 ? pulse(t, bt, 0.06) : 0;
    return {
      shake: shakeAt(t, 10 * j + 14 * pulse(t, this.tHitsu, 0.07)),
      zoom: 1 + 0.03 * zoomHit,
      ca: 0.6 + 2.5 * Math.max(whip, zoomHit),
      bloom: 0.7, bloomThreshold: 0.75,
      invert: frames(t, this.tGo, 2) || frames(t, this.tHitsu, 2) ? 1 : 0,
    };
  }

  /** log₁₀ Δ against τ: the Lyapunov line, bottom-left. */
  private panel(c: CanvasRenderingContext2D, tau: number, t: number) {
    const x0 = 120, y0 = H - 300, w = 360, h = 150;
    const a = clamp((t - this.tGo) / 0.15);
    c.strokeStyle = rgba('ash', 0.6 * a);
    c.lineWidth = 1;
    c.strokeRect(x0, y0, w, h);
    const lo = -7, hi = 2, tmax = this.tauSplit + 19;
    const X = (ta: number) => x0 + (ta / tmax) * w, Y = (lg: number) => y0 + h - ((lg - lo) / (hi - lo)) * h;
    c.strokeStyle = rgba('nixie', a);
    c.lineWidth = 2;
    c.beginPath();
    const steps = Math.min(this.n - 1, Math.floor(tau / DT));
    for (let i = 0; i <= steps; i += 4) {
      const lg = Math.log10(Math.max(this.delta[i]!, 1e-9));
      if (i === 0) c.moveTo(X(i * DT), Y(lg)); else c.lineTo(X(i * DT), Y(lg));
    }
    c.stroke();
    const d = this.delta[steps]!;
    c.fillStyle = rgba('bone', a);
    c.textBaseline = 'alphabetic';
    monoText(c, 'log₁₀ |Δ|', x0, y0 - 12, 16);
    monoText(c, `|Δ| = ${sci(d)}`, x0 + w, y0 - 12, 16, 500, 'right');
  }

  // ------------------------------------------------------------------ the D-mail: the discharge
  private bolt(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    (this.bg.u.col!.value as number[]).splice(0, 3, ...LIN.ink);
    this.bg.render(renderer, out);
    const c = this.L.ctx;
    this.L.clear();
    const age = t - this.tBolt;
    const grow = ease.outExpo(clamp(age / 0.07));
    const flick = frameIdx(t) % 3 !== 1 || age > 0.15 ? 1 : 0.25;
    const fade = 1 - clamp((age - 0.18) / 0.2) * 0.75;
    // the bolt: midpoint displacement with branches, deterministic
    const r = mulberry32(4242);
    const segs: [number, number, number, number, number][] = [];
    const branch = (x0: number, y0: number, x1: number, y1: number, w: number, depth: number) => {
      const pts: [number, number][] = [[x0, y0], [x1, y1]];
      for (let it = 0; it < 6; it++) {
        const nx: [number, number][] = [pts[0]!];
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
          const l = Math.hypot(bx - ax, by - ay);
          nx.push([(ax + bx) / 2 + (r() - 0.5) * l * 0.45 * (by - ay) / l, (ay + by) / 2 - (r() - 0.5) * l * 0.45 * (bx - ax) / l], [bx, by]);
        }
        pts.splice(0, pts.length, ...nx);
      }
      for (let i = 1; i < pts.length; i++) {
        segs.push([pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], w]);
        if (depth < 2 && r() < 0.06) {
          const [px, py] = pts[i]!;
          const a = Math.atan2(y1 - y0, x1 - x0) + (r() - 0.5) * 1.8;
          const l = 200 + r() * 420;
          branch(px, py, px + Math.cos(a) * l, py + Math.sin(a) * l, w * 0.5, depth + 1);
        }
      }
    };
    branch(260, -60, 1560, H + 60, 7, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const shown = Math.floor(segs.length * grow);
    for (const [pass, col, wk] of [[0, 'nixie', 3.2], [1, 'bone', 1]] as const) {
      void pass;
      c.strokeStyle = rgba(col, flick * fade);
      for (let i = 0; i < shown; i++) {
        const [ax, ay, bx, by, w] = segs[i]!;
        c.lineWidth = w * wk;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      }
    }
    c.font = font(F.mono(500), 18);
    c.fillStyle = rgba('bone');
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('D-MAIL → PAST', 120, 150);
    c.fillStyle = rgba('ash');
    c.fillText('PHONEWAVE (NAME SUBJECT TO CHANGE)', 120, 180);
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out, { tint: [2.4, 2.4, 2.4] });
    return {
      invert: frames(t, this.tBolt, 2) ? 1 : 0,
      shake: shakeAt(t, 30 * pulse(t, this.tBolt, 0.06)),
      flash: 0.25 * pulse(t, this.tBolt, 0.02),
      ca: 0.6 + 5 * pulse(t, this.tBolt, 0.06),
      bloom: 0.9, bloomThreshold: 0.7,
    };
  }

  // ------------------------------------------------------------------ the meter rolls to 0.571024
  private meterShot(t: number, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    (this.bg.u.col!.value as number[]).splice(0, 3, 0, 0, 0);
    this.bg.render(renderer, out);
    const u = prog(t, this.tMeter, this.ctx.end);
    this.meter.update(this.div.state(t));
    const e = ease.outCubic(u);
    const mc = this.meter.view([lerp(-2.4, -1.2, e), lerp(-11.2, -9.4, e), lerp(3.4, 2.7, e)], [0, 0, 1.1], 30);
    this.meter.render(renderer, comp, out, mc);
    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    c.font = font(F.mono(500), 18);
    c.fillStyle = rgba('ash');
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('DIVERGENCE', 120, 150);
    comp.draw(renderer, this.L.upload(), out);
    return { shake: shakeAt(t, 12 * pulse(t, this.tMeter, 0.06)), bloom: 0.75, ca: 0.6 };
  }
}
