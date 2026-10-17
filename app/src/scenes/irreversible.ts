// `irreversible` — #16 不可逆のネクローシス, 過去に囚われて 未来を嘆くも (docs/DESIGN.md). The past is a record: a pane of chart paper drawn in light (a fine grid, a heart's trace across
// it; the chart of `heartbeat`), hanging whole in the dark. On 囚 it shatters: the pane is in shards, each a piece of
// the grid with its piece of the trace, turning slowly, drifting apart in depth. Every two beats time tries to run
// back (◀◀): the shards draw together again, part of the way, and drift apart again, less each time. 未来を嘆くも: we
// go forward, through them.
// `reading` (Act III): the same in reverse against the dusk. The shards come home from where they hung, the pane is
// whole, the trace crimson (hers), the gate's light behind it. Nothing is lost.
// One smooth move; nothing jolts. The one caption is the pane's own (PAST).
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, lerp, mulberry32 } from '../engine/util';
import { Plate, charsOf, lyricRail, monoText } from './_kit';
import { Dark, Sky, gauss, motes } from './_sky';

type Pt = [number, number];
/** The pane (world units), its grid's pitch, and the trace: a heartbeat every BEAT along it, AMP tall. */
const PX = 16, PY = 9, MINOR = 0.25, BEAT = 3.2, AMP = 2.3;
const bump = (u: number, c: number, w: number) => Math.exp(-(((u - c) / w) ** 2));
/** One heartbeat (phase u in 0..1): P, the QRS spike, T. */
const ecg = (u: number) => 0.11 * bump(u, 0.2, 0.035) - 0.13 * bump(u, 0.365, 0.012) + bump(u, 0.4, 0.013) - 0.24 * bump(u, 0.437, 0.014) + 0.27 * bump(u, 0.63, 0.06);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** Voronoi cells of the pane (half-plane clipping; fine for a few dozen sites). */
function voronoi(sites: Pt[], w: number, h: number): Pt[][] {
  const clip = (poly: Pt[], a: Pt, b: Pt) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = b[0] - a[0], ny = b[1] - a[1];
    const side = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny;
    const out: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
      const sp = side(p), sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp <= 0) !== (sq <= 0)) { const u = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); }
    }
    return out;
  };
  return sites.map((s, i) => {
    let poly: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
    sites.forEach((o, j) => { if (i !== j) poly = clip(poly, s, o); });
    return poly;
  });
}
/** The part of segment a-b inside a convex polygon (round c), or null. */
function inside(poly: Pt[], c: Pt, a: Pt, b: Pt): [Pt, Pt] | null {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    let nx = q[1] - p[1], ny = p[0] - q[0];
    if ((c[0] - p[0]) * nx + (c[1] - p[1]) * ny < 0) { nx = -nx; ny = -ny; } // (the normal toward the inside)
    const da = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny, db = (b[0] - p[0]) * nx + (b[1] - p[1]) * ny;
    if (da < 0 && db < 0) return null;
    if (da < 0) t0 = Math.max(t0, da / (da - db)); else if (db < 0) t1 = Math.min(t1, da / (da - db));
  }
  if (t1 - t0 < 1e-4) return null;
  return [[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]];
}

/** A shard: its pieces of line (x0, y0, x1, y1, kind: 0 fine grid, 1 grid, 2 trace, 3 its edge), where it hangs once the pane has burst, how it turns. */
interface Shard { c: Pt; lines: number[]; off: THREE.Vector3; axis: THREE.Vector3; turn: number; ph: number }

export default class Irreversible extends Plate {
  dark = new Dark();
  sky = new Sky();
  lines = new LineBatch(16000, { screen2D: false, blend: 'add' });
  cam = new THREE.PerspectiveCamera(40, PW / PH, 0.1, 800);
  L = new Layer2D();
  shards: Shard[] = [];
  b0 = 0; tb0 = 0; per = 0.4;
  nbShatter = 2; nbFly = 8; nbEnd = 14;
  gate = new THREE.Vector3(60, 34, -260);

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    this.nbEnd = (end - this.tb0) / this.per;
    const l = this.myLine();
    if (this.act !== 'sg') {
      this.nbShatter = (charsOf([l.words[0]!])[3]!.t - this.tb0) / this.per; // 囚
      this.nbFly = (charsOf([l.words[1]!])[0]!.t - this.tb0) / this.per; // 未
    }
    // the shards: smaller round where it breaks
    const r = mulberry32(31), hit: Pt = [9.8, 4.7];
    const sites: Pt[] = [];
    for (let i = 0; i < 52; i++) {
      const ang = r() * Math.PI * 2, rad = 0.3 + r() * 3.2;
      sites.push(i < 24 ? [hit[0] + Math.cos(ang) * rad, hit[1] + Math.sin(ang) * rad * 0.8] : [r() * PX, r() * PY]);
    }
    const cells = voronoi(sites, PX, PY).filter((p) => p.length >= 3);
    const cents: Pt[] = cells.map((poly) => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]);
    this.shards = cells.map((poly, k) => {
      const c = cents[k]!, lines: number[] = [];
      const add = (a: Pt, b: Pt, kind: number) => { const s = inside(poly, c, a, b); if (s) lines.push(s[0][0], s[0][1], s[1][0], s[1][1], kind); };
      for (let i = 0; i <= Math.round(PX / MINOR); i++) add([i * MINOR, 0], [i * MINOR, PY], i % 4 ? 0 : 1);
      for (let j = 0; j <= Math.round(PY / MINOR); j++) add([0, j * MINOR], [PX, j * MINOR], j % 4 ? 0 : 1);
      poly.forEach((p, i) => lines.push(p[0], p[1], poly[(i + 1) % poly.length]![0], poly[(i + 1) % poly.length]![1], 3));
      const dx = c[0] - hit[0], dy = c[1] - hit[1], d = Math.hypot(dx, dy) || 1, far = 0.5 + 3.2 * Math.pow(r(), 1.5) + 1.6 * (1 - Math.min(1, d / 6));
      return {
        c, lines, ph: r() * 6.28, turn: (r() - 0.5) * 2.2,
        off: new THREE.Vector3((dx / d) * far, (dy / d) * far, (r() - 0.62) * 13),
        axis: new THREE.Vector3(r() - 0.5, r() - 0.5, (r() - 0.5) * 0.6).normalize(),
      };
    });
    // the trace, cut where it crosses from shard to shard
    const at = (x: number): Pt => [x, PY / 2 - 0.4 + AMP * ecg((((x + 1.1) / BEAT) % 1 + 1) % 1)];
    for (let i = 0; i < 900; i++) {
      const a = at((i / 900) * PX), b = at(((i + 1) / 900) * PX), m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = cells.findIndex((poly, j) => inCell(poly, cents[j]!, m));
      if (k >= 0) this.shards[k]!.lines.push(a[0], a[1], b[0], b[1], 2);
    }
    function inCell(poly: Pt[], c: Pt, p: Pt) {
      for (let i = 0; i < poly.length; i++) {
        const u = poly[i]!, v = poly[(i + 1) % poly.length]!;
        let nx = v[1] - u[1], ny = u[0] - v[0];
        if ((c[0] - u[0]) * nx + (c[1] - u[1]) * ny < 0) { nx = -nx; ny = -ny; }
        if ((p[0] - u[0]) * nx + (p[1] - u[1]) * ny < -1e-6) return false;
      }
      return true;
    }
  }

  /** How far apart the shards are at beat nb (0: the pane whole; 1: where they hang), and how hard time is pulling them back. */
  private burst(nb: number): [number, number] {
    if (this.act === 'sg') return [1.2 * (1 - smoother(clamp(nb / (this.nbEnd - 1.6)))), 0];
    const u = nb - this.nbShatter;
    if (u < 0) return [0, 0];
    let e = 1 - Math.exp(-u / 0.7) + 0.035 * u, back = 0;
    for (let m = 0; m < 6; m++) {
      const g = Math.pow(0.8, m) * gauss(u - (2.2 + 2 * m), 0.62) * (nb < this.nbFly + 1 ? 1 : 0.4);
      back += g;
    }
    e -= 0.42 * back;
    return [e, back];
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const sg = this.act === 'sg';
    const lt = t - this.tb0, nb = lt / this.per;
    const [e, back] = this.burst(nb);

    // the camera: before the pane; then forward through the shards (Act III: back out from among them)
    const fly = sg ? 1 - smoother(clamp(nb / (this.nbEnd - 1.2))) : smoother(clamp((nb - this.nbFly) / (this.nbEnd + 0.6 - this.nbFly)));
    const z = sg ? lerp(13.6, 3.2, fly) : 13.4 - 0.16 * nb - 8.2 * fly;
    this.cam.position.set(sg ? 1.4 * fly : 0.5 * Math.sin(lt * 0.35) + 1.1 * fly, 0.15 + 0.3 * fly, z);
    this.cam.up.set(0.07 * fly, 1, 0).normalize();
    this.cam.lookAt(0.3 * fly, 0.1 * fly, z - 13);
    this.cam.updateMatrixWorld();
    if (sg) this.sky.render(renderer, out, this.cam, this.gate, 0.55 + 0.35 * (1 - fly));
    else this.dark.render(renderer, out, [0.003, 0.0012, 0.0004]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 500, new THREE.Vector3(0, 0, z - 10), [16, 9, 16], lt, 3, 0.7);
    const grid = sg ? LIN.ember : LIN.bone, trace = sg ? LIN.crimson : LIN.nixie;
    const flare = sg ? 0 : gauss(nb - this.nbShatter - 0.25, 0.5);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion();
    const k = clamp(e, 0, 1.3);
    for (const sh of this.shards) {
      // where it is: out along its way, turned about its own middle, swaying a little where it hangs
      const ang = sh.turn * k + 0.05 * Math.sin(lt * 0.9 + sh.ph) * Math.min(1, k * 3);
      q.setFromAxisAngle(sh.axis, ang);
      const ox = sh.c[0] - PX / 2 + sh.off.x * k, oy = sh.c[1] - PY / 2 + sh.off.y * k, oz = sh.off.z * k;
      const dim = Math.exp(-Math.max(0, this.cam.position.z - oz - 13) / 30);
      const ls = sh.lines;
      for (let i = 0; i < ls.length; i += 5) {
        const kind = ls[i + 4]!;
        if (kind === 3 && k < 0.01) continue;
        a.set(ls[i]! - sh.c[0], ls[i + 1]! - sh.c[1], 0).applyQuaternion(q);
        b.set(ls[i + 2]! - sh.c[0], ls[i + 3]! - sh.c[1], 0).applyQuaternion(q);
        const col = kind === 2 ? trace : grid;
        const g = dim * (kind === 0 ? 0.075 : kind === 1 ? 0.2 : kind === 2 ? 2.4 : (0.3 + 1.6 * flare) * Math.min(1, k * 4));
        L.seg(a.x + ox, a.y + oy, a.z + oz, b.x + ox, b.y + oy, b.z + oz, kind === 2 ? 2.2 : kind === 3 ? 1.3 : 1, col[0] * g, col[1] * g, col[2] * g, 1);
      }
    }
    L.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    if (!sg) {
      // the pane's own caption, while it is whole; ◀◀ while time pulls back
      const v = new THREE.Vector3(PX / 2 - 0.3, -PY / 2 + 0.35, 0).project(this.cam);
      const ca = 1 - clamp(e * 5);
      if (ca > 0.01 && v.z < 1) {
        c.fillStyle = rgba('ash', 0.8 * ca);
        c.textBaseline = 'alphabetic';
        monoText(c, 'PAST · 2010.07.28 · 1.130426', (v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H, 20, 500, 'right');
      }
      if (back > 0.05 && nb < this.nbFly + 0.5) {
        c.fillStyle = rgba('bone', Math.min(1, back * 1.4) * 0.85);
        for (const x of [130, 158]) { c.beginPath(); c.moveTo(x + 26, 130); c.lineTo(x, 142); c.lineTo(x + 26, 154); c.fill(); }
      }
    }
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.65 };
  }
}
