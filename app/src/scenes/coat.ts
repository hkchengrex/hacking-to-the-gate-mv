// `coat` — #11 時空境界のドグマ (Steins;Gate), もう迷いはない 孤独の観測者 (Act III; docs/DESIGN.md). The observer's resolve: all paths, then one. From his light (bone, alone in the dusk) to the gate run
// every way he might go: a hundred and fifty faint strings of light, each swaying in its own slow modes like a
// string held at both ends, together a wide spindle between him and the doorway. Over the line they pull taut,
// one after another, and every one that does lies on the same straight line, which brightens with each; at the
// end there is one line, and light runs along it to the gate. The camera comes round from the side to look down
// the line from behind him. No text but the lyric; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, hash, lerp } from '../engine/util';
import { Plate, lyricRail } from './_kit';
import { Lights, Sky, gauss, motes } from './_sky';

const N = 150, SEG = 44, LEN = 84;
/** The way to the gate from his light (at the origin): a little upward. */
const DIR = new THREE.Vector3(0, 0.16, -1).normalize();
const RIGHT = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3().crossVectors(RIGHT, DIR).normalize();
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Coat extends Plate {
  sky = new Sky();
  lines = new LineBatch(N * SEG + 3000, { screen2D: false, blend: 'add' });
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(36, PW / PH, 0.1, 800);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 17;
  gate = DIR.clone().multiplyScalar(300);

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

    // the camera: from the side, where the spindle of ways shows whole, round to behind him, looking down the one line
    const u = smoother(clamp(nb / (this.nbEnd - 1)));
    const pos = new THREE.Vector3().addScaledVector(RIGHT, lerp(20, 2.2, u)).addScaledVector(UP, lerp(4.5, 0.3, u)).addScaledVector(DIR, lerp(-20, -7, u));
    const tgt = new THREE.Vector3().addScaledVector(DIR, lerp(30, 40, u)).addScaledVector(UP, lerp(-1.5, 2.8, u)).addScaledVector(RIGHT, lerp(0, -3, u));
    this.cam.position.copy(pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    this.sky.render(renderer, out, this.cam, this.gate, 0.85 + 0.25 * u);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 1100, pos.clone().addScaledVector(DIR, 20), [30, 16, 40], lt, 5);
    // the ways: strings from him to the gate, each swaying in its first three modes; from もう on they pull taut, one by one
    let taut = 0;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const when = 2.6 + 10.2 * hash(i, 9), a = 1 - smoother(clamp((nb - when) / 1.6)); // how slack it still is
      taut += 1 - a;
      if (a <= 0.001) continue;
      const r = 11 * Math.sqrt(hash(i, 1)), th = hash(i, 2) * Math.PI * 2;
      const tint = hash(i, 3) < 0.2 ? LIN.cold : hash(i, 3) < 0.55 ? LIN.ember : LIN.bone, g = 0.42 * (0.4 + 0.6 * a) * (tint === LIN.cold ? 1.6 : 1);
      const at = (s: number, o: THREE.Vector3) => {
        let x = 0, y = 0;
        for (let k = 1; k <= 3; k++) {
          const m = Math.sin(k * Math.PI * s) / k, w = 0.9 * k * lt;
          x += m * (r * Math.cos(th + k * 1.9) * Math.cos(w + hash(i, k, 4) * 6.28) + (k > 1 ? r * 0.7 * (hash(i, k, 5) - 0.5) : 0));
          y += m * (r * Math.sin(th + k * 1.9) * Math.cos(w * 1.13 + hash(i, k, 6) * 6.28) + (k > 1 ? r * 0.7 * (hash(i, k, 7) - 0.5) : 0));
        }
        return o.set(0, 0, 0).addScaledVector(DIR, s * LEN).addScaledVector(RIGHT, x * a).addScaledVector(UP, y * a);
      };
      at(0, p);
      for (let j = 1; j <= SEG; j++) {
        at(j / SEG, q);
        const fade = Math.exp(-(j / SEG) * LEN * 0.02) * g;
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.5, tint[0] * fade, tint[1] * fade, tint[2] * fade, 1);
        p.copy(q);
      }
    }
    // the one line they pull into: brighter with each; when most are in, light runs along it to the gate
    const k = taut / N, go = clamp((nb - 11.5) / 2);
    if (k > 0.003) for (let j = 0; j < 160; j++) {
      const s0 = (j / 160) * LEN * 1.6, s1 = ((j + 1) / 160) * LEN * 1.6;
      const run = go * gauss(((s0 - 46 * (lt - 11.5 * this.per)) % 26 + 26) % 26 - 13, 1.4);
      const g = (0.5 + 5 * k * k + 9 * run) * Math.exp(-s0 * 0.014);
      L.seg(DIR.x * s0, DIR.y * s0, DIR.z * s0, DIR.x * s1, DIR.y * s1, DIR.z * s1, 1.6 + 2.2 * k, LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g, 1);
    }
    L.render(renderer, out, this.cam);

    // the observer, alone
    this.lights.clear();
    this.lights.add(new THREE.Vector3(0, 0, 0), LIN.bone, 0.75, 1 + 0.5 * k, 1);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.7 };
  }
}
