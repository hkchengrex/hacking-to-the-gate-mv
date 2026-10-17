// `starmine` — #05 電荷衝突のランデヴー, 君のその笑顔 守りたいのさ (docs/DESIGN.md).
// The title's Japanese half, 電荷衝突 (charge collision): two charges, ours (+, nixie) and hers (−, crimson), and the
// field between them drawn as threads of light, in space: out of ours on every side, bending round, into hers. They
// draw closer all the time; light runs along every line from ours to hers, a brighter bead on every beat.
// 守りたい (protect): a cage closes round her, a sphere of wire (a grounded conducting shell); our lines end on it
// and never reach her: protection, as physics, and the rendezvous held off.
// `reunion` (Act III), against the dusk: there is no cage; they keep closing and meet at the end of the line.
// One smooth move; the charges keep their + and −; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { clamp, lerp } from '../engine/util';
import { Plate, charsOf, lyricRail } from './_kit';
import { Dark, Lights, Sky, gauss, motes } from './_sky';

const TAU = Math.PI * 2;
/** The cage's radius; field lines out of our charge in one half-plane, and the half-planes round the axis. */
const SHELL = 1.7, NL = 13, NP = 10, STEP = 0.07;
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

type V = [number, number];
interface Q { p: V; q: number }
/** The field at p (x along the axis, y out from it) from point charges on the axis. */
function field(p: V, qs: Q[]): V {
  let ex = 0, ey = 0;
  for (const { p: c, q } of qs) {
    const dx = p[0] - c[0], dy = p[1] - c[1], r2 = dx * dx + dy * dy + 1e-4;
    const k = q / (r2 * Math.sqrt(r2));
    ex += k * dx; ey += k * dy;
  }
  return [ex, ey];
}

export default class Starmine extends Plate {
  dark = new Dark();
  sky = new Sky();
  lines = new LineBatch(70000, { screen2D: false, blend: 'add' });
  lights = new Lights(6);
  cam = new THREE.PerspectiveCamera(40, PW / PH, 0.1, 800);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 13; nbShield = 7;
  gate = new THREE.Vector3(40, 22, -300);

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    this.nbEnd = (end - this.tb0) / this.per;
    this.nbShield = (charsOf([this.myLine().words[1]!])[0]!.t - this.tb0) / this.per; // 守
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const sg = this.act === 'sg';
    const lt = t - this.tb0, nb = lt / this.per, u = clamp(nb / this.nbEnd);
    // how far apart: an eighth nearer on every beat; held once the cage is up (α), or closed to nothing (Steins;Gate)
    const nbe = sg ? nb : this.nbShield - Math.log(1 + Math.exp((this.nbShield - nb) * 3)) / 3;
    const close = sg ? smoother(clamp((nb - (this.nbEnd - 2.2)) / 1.9)) : 0;
    const d = 10 * Math.pow(0.87, Math.max(0, nbe - 1)) * (1 - close);
    const met = sg && d < 0.12;
    const c1: V = [-d / 2, 0], c2: V = [d / 2, 0];
    // the cage (α only): grows round her on 守; outside it our field is ours and our image's in the sphere (Kelvin)
    const s = sg ? 0 : 1 - Math.pow(1 - clamp((nb - this.nbShield) / 1.1), 3);
    const R = SHELL * s, ci: V = [c2[0] - (SHELL * SHELL) / d, 0];
    const qs: Q[] = [{ p: c1, q: 1 }, { p: c2, q: -(1 - s) }, { p: ci, q: (-SHELL / d) * s }];

    // the camera: round the two of them, slowly, and in as they close
    const az = lerp(-0.55, 0.4, u), el = lerp(0.3, 0.16, u), D = lerp(15.5, 9.5, smoother(u)) - 3 * close;
    const tgt = new THREE.Vector3(sg ? 0 : 0.5, sg ? -0.9 : -0.7, 0);
    this.cam.position.set(tgt.x + D * Math.sin(az) * Math.cos(el), tgt.y + D * Math.sin(el), D * Math.cos(az) * Math.cos(el));
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    if (sg) this.sky.render(renderer, out, this.cam, this.gate, 0.6);
    else this.dark.render(renderer, out, [0.004, 0.0016, 0.0005]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 500, new THREE.Vector3(0, 0, 0), [16, 9, 12], lt, 13, 0.7);
    const thread = LIN.bone, bead = sg ? LIN.ember : LIN.nixie;
    // the field lines, traced in one half-plane from our charge until they reach her (or the cage) or leave, and
    // set round the axis
    const reveal = 1 - Math.pow(1 - clamp(lt / 0.9), 3), fb = nb - Math.floor(nb);
    const cs = Array.from({ length: NP }, (_, k) => [Math.cos((k / NP) * TAU + 0.3), Math.sin((k / NP) * TAU + 0.3)] as V);
    if (!met) for (let i = 0; i < NL; i++) {
      const a0 = ((i + 0.5) / NL) * Math.PI;
      let p: V = [c1[0] + Math.cos(a0) * 0.3, c1[1] + Math.sin(a0) * 0.3];
      const pts: V[] = [p];
      for (let k = 0; k < 420; k++) {
        const e = field(p, qs), m = Math.hypot(e[0], e[1]) || 1;
        p = [p[0] + (e[0] / m) * STEP, p[1] + (e[1] / m) * STEP];
        pts.push(p);
        if (Math.hypot(p[0] - c2[0], p[1] - c2[1]) < Math.max(0.24, R) || Math.hypot(p[0], p[1]) > 17) break;
      }
      const n = Math.max(2, Math.floor(pts.length * reveal));
      for (let k = 1; k < n; k++) {
        const a = pts[k - 1]!, b = pts[k]!, sl = k * STEP;
        // light running along it from ours to hers; on every beat a brighter bead goes down the line
        const flow = Math.pow(0.5 + 0.5 * Math.sin(TAU * (sl / 1.7 - lt * 1.25 + i * 0.37)), 8);
        const g = (0.16 + 0.55 * flow) * Math.exp(-Math.hypot(a[0], a[1]) / 14);
        const gb = 2.4 * gauss(k / pts.length - fb / 0.9, 0.03) * (fb < 0.9 ? 1 : 0);
        for (const [cz, sz] of cs) {
          L.seg(a[0], a[1] * cz, a[1] * sz, b[0], b[1] * cz, b[1] * sz, 1.15, thread[0] * g + bead[0] * gb, thread[1] * g + bead[1] * gb, thread[2] * g + bead[2] * gb, 1);
        }
      }
    }
    // the cage: a sphere of wire round her, drawing itself shut; inside it her own field, short and red
    if (R > 0.05) {
      const hot = LIN.nixie, red = LIN.crimson, sweep = s * TAU;
      const ring = (at: (a: number, o: THREE.Vector3) => THREE.Vector3) => {
        const p = at(0, new THREE.Vector3()), q = new THREE.Vector3();
        for (let j = 1; j <= 72; j++) {
          const a = (j / 72) * TAU;
          if (a > sweep) break;
          at(a, q);
          L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.7, hot[0] * 1.5, hot[1] * 1.5, hot[2] * 1.5, 1);
          p.copy(q);
        }
      };
      for (let m = 0; m < 6; m++) { const cm = Math.cos((m / 6) * Math.PI), sm = Math.sin((m / 6) * Math.PI); ring((a, o) => o.set(c2[0] + R * Math.cos(a), R * Math.sin(a) * cm, R * Math.sin(a) * sm)); }
      for (const lat of [-0.5, 0, 0.5]) { const rr = R * Math.cos(lat * 1.9), xx = R * Math.sin(lat * 1.9); ring((a, o) => o.set(c2[0] + xx, rr * Math.cos(a), rr * Math.sin(a))); }
      for (let i = 0; i < 26; i++) {
        const y = 1 - (2 * (i + 0.5)) / 26, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
        const dx = rr * Math.cos(a), dz = rr * Math.sin(a), g = 0.9 * s;
        L.seg(c2[0] + dx * 0.3, y * 0.3, dz * 0.3, c2[0] + dx * (R - 0.05), y * (R - 0.05), dz * (R - 0.05), 1.2, red[0] * g, red[1] * g, red[2] * g, 1);
      }
    }
    L.render(renderer, out, this.cam);

    // the charges
    this.lights.clear();
    const p1 = new THREE.Vector3(c1[0], 0, 0), p2 = new THREE.Vector3(c2[0], 0, 0);
    if (met) {
      // they meet: one light
      const fl = smoother(clamp((nb - (this.nbEnd - 0.5)) / 0.5));
      this.lights.add(new THREE.Vector3(0, 0, 0), LIN.bone, 0.9 + 0.8 * fl, 1.6 + 0.8 * fl, 1);
    } else {
      this.lights.add(p1, sg ? LIN.bone : LIN.nixie, 0.55, 1.5, 1);
      this.lights.add(p2, LIN.crimson, 0.55, 2.2, 0.6);
    }
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    if (!met) {
      // + and −, by the charges
      c.font = font(F.archivo(100, 900), 30);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = rgba('bone', 0.9);
      for (const [p, sign] of [[p1, '+'], [p2, '−']] as const) {
        const v = p.clone().project(this.cam);
        c.fillText(sign, (v.x * 0.5 + 0.5) * W + 26, (0.5 - v.y * 0.5) * H - 26);
      }
    }
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.65 };
  }
}
