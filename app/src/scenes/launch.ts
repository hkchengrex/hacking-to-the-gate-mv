// `launch` — #02 時間跳躍のパラノイア (Steins;Gate), the guitar solo's first plate (docs/DESIGN.md). Operation Skuld begins: back through the days. His light flies down a tunnel of twenty-four rings, one
// for each day from 2010.08.21 back to 07.28, each a dial of hour ticks turning backwards; slowly through the
// first, then faster and faster, the rings flashing past, then slowing to stop before the last, which is crimson:
// her day, her light beyond it. The date readout (its one caption) rolls back a day as he passes each ring
// and locks on 2010.07.28 11:50. Smooth throughout.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, frameIdx, hash, lerp } from '../engine/util';
import { Plate, monoText } from './_kit';
import { Lights, Sky, motes } from './_sky';

const DAYS = 24, GAP = 9, R = 3.2; // the rings: how many, how far apart, their radius
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Launch extends Plate {
  sky = new Sky();
  rings = new LineBatch(12000, { screen2D: false, blend: 'add', worldWidth: true });
  lines = new LineBatch(6000, { screen2D: false, blend: 'add' });
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(50, PW / PH, 0.05, 600);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 16;

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    this.nbEnd = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + this.nbEnd) - this.tb0) / this.nbEnd;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const nb = (t - this.tb0) / this.per, lt = t - this.tb0;

    // the flight: from before the first ring to just short of the last, easing away and easing in
    const u = smoother(clamp((nb - 0.3) / (this.nbEnd - 2.3)));
    const zc = lerp(7, -DAYS * GAP + 7.6, u);
    const him = new THREE.Vector3(0.25 * Math.sin(lt * 0.9), -0.5 + 0.15 * Math.sin(lt * 1.3 + 1), zc - 3.4);
    this.cam.position.set(0.3 * Math.sin(lt * 0.7 + 2), 0.18 * Math.sin(lt * 1.1), zc);
    this.cam.up.set(Math.sin(0.16 * Math.sin(lt * 0.8)), 1, 0);
    this.cam.lookAt(0, -0.1, zc - 20);
    this.cam.updateMatrixWorld();
    this.sky.render(renderer, out, this.cam, null);

    // the rings: a day each, a dial of twenty-four hour ticks turning backwards; the last is crimson
    const G = this.rings;
    G.clear();
    for (let k = 1; k <= DAYS; k++) {
      const z = -k * GAP, d = zc - z;
      if (d < 0.15) continue; // (behind us)
      const last = k === DAYS, col = last ? LIN.crimson : k % 7 === 0 ? LIN.bone : LIN.ember;
      const g = (last ? 7 : 1.5) * Math.exp(-d * 0.011) * (0.75 + 0.25 * Math.sin(lt * 2 + k)), w = last ? 0.085 : 0.05;
      const rot = (0.5 + 0.04 * k) * lt + k * 0.7; // (anticlockwise, seen from the front)
      const n = 72;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        G.seg(Math.cos(a0) * R, Math.sin(a0) * R, z, Math.cos(a1) * R, Math.sin(a1) * R, z, w, col[0] * g, col[1] * g, col[2] * g, 1);
        if (last || d < 60) G.seg(Math.cos(a0) * (R + 0.3), Math.sin(a0) * (R + 0.3), z, Math.cos(a1) * (R + 0.3), Math.sin(a1) * (R + 0.3), z, w * 0.4, col[0] * g * 0.5, col[1] * g * 0.5, col[2] * g * 0.5, 1);
      }
      if (d < 90) for (let h = 0; h < 24; h++) {
        const a = rot + (h / 24) * Math.PI * 2, r1 = R - (h % 6 === 0 ? 0.62 : 0.3);
        G.seg(Math.cos(a) * R, Math.sin(a) * R, z, Math.cos(a) * r1, Math.sin(a) * r1, z, w * 0.7, col[0] * g, col[1] * g, col[2] * g, 1);
      }
    }
    // his thread, behind him
    for (let j = 0; j < 4; j++) {
      const z0 = him.z + j * 0.75, z1 = Math.min(him.z + (j + 1) * 0.75, zc - 0.25), g = 1.5 * (1 - j / 4.5);
      if (z1 > z0) G.seg(him.x, him.y, z0, him.x, him.y, z1, 0.012, LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g, 1);
    }
    G.render(renderer, out, this.cam);

    // the air: motes, and dashes of light along the way (they give the flight its speed)
    const L = this.lines;
    L.clear();
    motes(L, this.cam, 900, this.cam.position, [16, 12, 40], lt, 7);
    for (let i = 0; i < 520; i++) {
      const z = 20 - hash(i, 1) * (DAYS * GAP + 60), len = 1.5 + 9 * hash(i, 2) ** 2;
      if (z - len > zc - 0.3 || zc - z > 150) continue;
      const a = hash(i, 3) * Math.PI * 2, r = 4.4 + 12 * hash(i, 4), d = Math.max(1, zc - z);
      const col = hash(i, 5) < 0.2 ? LIN.ember : LIN.cold, g = 0.9 * Math.exp(-d * 0.02);
      L.seg(Math.cos(a) * r, Math.sin(a) * r, Math.min(z, zc - 0.3), Math.cos(a) * r, Math.sin(a) * r, z - len, 1.4, col[0] * g, col[1] * g, col[2] * g, 1);
    }
    L.render(renderer, out, this.cam);

    // his light, leading; and hers, beyond the last ring
    this.lights.clear();
    this.lights.add(him, LIN.bone, 0.36, 1, 1);
    this.lights.add(new THREE.Vector3(0, 0, -DAYS * GAP - 26), LIN.crimson, 3.4, 4 * Math.exp(-(zc + DAYS * GAP + 26) * 0.012), 0.8);
    this.lights.render(renderer, out, this.cam);

    // the date readout, a day back with every ring he passes
    const c = this.L.ctx;
    this.L.clear();
    const passed = Math.min(DAYS, clamp(Math.floor(-him.z / GAP), 0, DAYS) + (u > 0.985 ? 1 : 0)), day = 21 + 31 - passed, month = day > 31 ? 8 : 7, dd = day > 31 ? day - 31 : day;
    const fi = frameIdx(t);
    const clock = passed <= 0 ? '17:56' : u >= 0.999 ? '11:50' : `${String(Math.floor(hash(fi, 6) * 24)).padStart(2, '0')}:${String(Math.floor(hash(fi, 7) * 60)).padStart(2, '0')}`;
    c.fillStyle = rgba('bone');
    c.textBaseline = 'alphabetic';
    monoText(c, `2010.${String(month).padStart(2, '0')}.${String(dd).padStart(2, '0')} ${clock}`, 120, 150, 40, 600);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.35, bloom: 0.75 };
  }
}
