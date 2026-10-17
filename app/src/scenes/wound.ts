// `wound` — #14 形而下のネクローシス (Steins;Gate), the solo's fourth plate (docs/DESIGN.md).
// The interception, and the veil; abstract, in light and thread only. Her light, crimson with a white heart, hangs
// in the dusk; a cold streak (the knife) flies at it; his light, bone, crosses its path and takes it, on the
// downbeat. Then his light bleeds: the thread it draws turns crimson and spreads into a band of strands, and,
// driven in toward her by the blow, he circles her, round and round, each turn tilted from the last, winding his
// red about her light like yarn about a ball. Under it her light dims, veiled; through the gaps it still glows.
// She only looks put out, and what covers her is his. Spent, reddened, he drifts off. No floor, no drops, no
// figures, no text; one shake, at the blow.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, hash, lerp, pulse } from '../engine/util';
import { Plate, shakeAt } from './_kit';
import { Lights, Sky, motes } from './_sky';

const HER = new THREE.Vector3(1.5, 1.5, 0), HIT = new THREE.Vector3(-0.55, 1.5, 0.6), FROM = new THREE.Vector3(-30, 2.7, 3.2);
/** The beat of the blow; the beats between which he winds; the ball's radius, its turns, its strands; how the turns' plane tumbles. */
const BLOW = 4, WIND0 = 5.2, WIND1 = 14.2, R = 1.02, TURNS = 5.6, STRANDS = 22, K1 = 0.113, K2 = 0.167;
const A_END = TURNS * Math.PI * 2;
/** Turns the winding so that it starts on the side he comes in from. */
const Q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), HIT.clone().sub(HER).normalize());
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** A point of the winding: `a` radians along it, on strand m (the middle one, his own, is m = -1); k: how far the strands have spread there (0 at his light). */
function wind(a: number, m: number, o = new THREE.Vector3(), k = 1) {
  const e = m < 0 ? 0 : (hash(m, 1) - 0.5) * k, d = m < 0 ? 0 : (hash(m, 2) - 0.5) * k, r = R * (m < 0 ? 1 : 1 + (0.14 * hash(m, 3) - 0.07) * k);
  const x = r * Math.cos(a), y = r * Math.sin(a), ax = K1 * a + e, ay = K2 * a + d;
  const y1 = y * Math.cos(ax), z1 = y * Math.sin(ax);
  return o.set(x * Math.cos(ay) + z1 * Math.sin(ay), y1, -x * Math.sin(ay) + z1 * Math.cos(ay)).applyQuaternion(Q0).add(HER);
}

export default class Wound extends Plate {
  sky = new Sky();
  veil = new LineBatch(9000, { screen2D: false, blend: 'normal' });
  lines = new LineBatch(4000, { screen2D: false, blend: 'add' });
  hers = new Lights(2);
  his = new Lights(4);
  cam = new THREE.PerspectiveCamera(38, PW / PH, 0.1, 400);
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 16;
  door = new THREE.Vector3(150, 22, -220); // (the open door's light, off to one side)

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    this.nbEnd = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + this.nbEnd) - this.tb0) / this.nbEnd;
  }

  /** How far round the winding he is at beat nb (radians). */
  private wound(nb: number) { return A_END * smoother(clamp((nb - WIND0) / (WIND1 - WIND0))); }
  /** His light at beat nb: gliding in; taking the blow, driven in toward her; circling her; then, spent, drifting off. */
  private himAt(nb: number, o = new THREE.Vector3()) {
    if (nb < BLOW) {
      const a = smoother(clamp(nb / BLOW));
      return o.set(lerp(-7.5, HIT.x, a), lerp(2.3, HIT.y, a) + 0.45 * Math.sin(a * Math.PI), lerp(4.6, HIT.z, a));
    }
    if (nb < WIND0) { const k = (nb - BLOW) / (WIND0 - BLOW); return o.copy(HIT).lerp(wind(0, -1), 1 - Math.pow(1 - k, 2.2)); }
    if (nb < WIND1) return wind(this.wound(nb), -1, o);
    const d = nb - WIND1, e = wind(A_END, -1), tan = wind(A_END, -1).sub(wind(A_END - 0.05, -1)).normalize();
    return o.copy(e).addScaledVector(tan, (0.9 * d * d) / (d + 1.2)).add(new THREE.Vector3(-0.5, 0.25, -0.4).multiplyScalar((d * d) / (d + 2)));
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer } = this.ctx;
    const nb = (t - this.tb0) / this.per, lt = t - this.tb0, tBlow = this.tb0 + BLOW * this.per;

    // the camera: wide for his coming, then in on her as the veil winds, coming round a little
    const u = smoother(clamp(nb / this.nbEnd)), az = lerp(-0.12, 0.42, u), D = lerp(8.6, 4.3, u);
    this.cam.position.set(lerp(0.2, HER.x, u) + D * Math.sin(az), lerp(2.5, 1.9, u), D * Math.cos(az));
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(lerp(0.3, HER.x - 0.1, u), lerp(1.5, 1.45, u), 0);
    this.cam.updateMatrixWorld();
    this.sky.render(renderer, out, this.cam, this.door, 0.55);

    // her light: bright; dimming as the veil covers it (it is still there, inside)
    const aNow = this.wound(nb), cover = Math.pow(aNow / A_END, 0.8);
    this.hers.clear();
    this.hers.add(HER, LIN.crimson, lerp(1.7, 1.3, cover) * (1 + 0.05 * Math.sin(lt * 2.4)), lerp(2.8, 0.95, cover), lerp(1.0, 0.3, cover));
    this.hers.render(renderer, out, this.cam);

    // the veil: his strands, laid round her as far as he has come; the far side first, darker; the newest stretch still hot
    const V = this.veil;
    V.clear();
    const view = this.cam.position.clone().sub(HER).normalize(), p = new THREE.Vector3(), q = new THREE.Vector3(), him = this.himAt(nb);
    const reachIn = nb < WIND0 ? 1 - Math.pow(1 - clamp((nb - BLOW) / (WIND0 - BLOW)), 2.2) : 1; // (one thread at the blow, a band by the time he reaches her)
    const cooled = nb < WIND1 + 1 ? 1 : Math.exp(-(nb - WIND1 - 1));
    const spreadAt = (a: number) => (nb >= WIND1 ? 1 : 1 - Math.exp(-(aNow - a) / 0.45)); // (the strands fan out from his light)
    if (nb > BLOW) for (const front of [false, true]) for (let m = 0; m < STRANDS; m++) {
      if (!front) {
        // from where he was struck, in to her
        const o0 = wind(0, m, q, spreadAt(0)), g = Math.exp(-Math.max(0, nb - WIND0) / 1.2);
        if (g > 0.02 && (m === 0 || aNow > 0)) for (let j = 0; j < 10; j++) {
          const a = HIT.clone().lerp(o0, (j / 10) * reachIn), b = HIT.clone().lerp(o0, ((j + 1) / 10) * reachIn);
          V.seg(a.x, a.y, a.z, b.x, b.y, b.z, 1.6, 0.75, 0.045, 0.075, g);
        }
      }
      const DA = 0.07, tone = 0.7 + 0.6 * hash(m, 7);
      wind(0, m, p, spreadAt(0));
      for (let a = DA; a <= aNow + DA; a += DA) {
        const aa = Math.min(a, aNow);
        wind(aa, m, q, spreadAt(aa));
        const d = (q.x - HER.x) * view.x + (q.y - HER.y) * view.y + (q.z - HER.z) * view.z; // (> 0: the near side)
        if (d >= 0 === front) {
          const lit = (front ? 0.3 + 0.7 * Math.pow(d / R, 0.7) : 0.16) * tone, hot = Math.exp(-(aNow - aa) / 1.3) * cooled;
          V.seg(p.x, p.y, p.z, q.x, q.y, q.z, front ? 2.4 : 1.3, 0.36 * lit + 1.1 * hot, 0.02 * lit + 0.2 * hot, 0.036 * lit + 0.18 * hot, 1);
        }
        p.copy(q);
      }
    }
    V.render(renderer, out, this.cam);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 800, new THREE.Vector3(1, 2, 0), [14, 8, 12], lt, 13);
    // the knife: a cold streak along its line to her, stopped where he is; then a shard where it struck, fading
    const dir = HER.clone().sub(FROM).normalize(), reach = HIT.clone().sub(FROM).dot(dir);
    if (nb > 2.4 && nb < BLOW + 5) {
      const fly = clamp((nb - 2.4) / (BLOW - 2.4)), stuck = nb >= BLOW;
      const tip = stuck ? HIT.clone().addScaledVector(dir, 0.12) : FROM.clone().addScaledVector(dir, lerp(-6, reach, fly));
      const len = stuck ? 1.1 : 6, g = stuck ? 3 * Math.exp(-(nb - BLOW) / 1.6) : 5;
      for (let j = 0; j < 12; j++) {
        const a = tip.clone().addScaledVector(dir, (-len * j) / 12), b = tip.clone().addScaledVector(dir, (-len * (j + 1)) / 12), k = g * Math.pow(1 - j / 12, 1.5);
        L.seg(a.x, a.y, a.z, b.x, b.y, b.z, 4 - j * 0.2, (LIN.cold[0] + 0.5) * k, (LIN.cold[1] + 0.5) * k, (LIN.cold[2] + 0.55) * k, 1);
      }
    }
    // his thread: bone as he comes (fading once he is struck); after the winding, the one red strand he trails away
    const prev = this.himAt(Math.min(nb, BLOW));
    if (nb < BLOW + 6) for (let j = 1; j <= 60; j++) {
      const n = Math.min(nb, BLOW) - j * 0.1;
      if (n < -4) break;
      const c = this.himAt(n, q), g = 1.6 * Math.exp(-j * 0.05) * Math.exp(-Math.max(0, nb - BLOW) / 2);
      L.seg(prev.x, prev.y, prev.z, c.x, c.y, c.z, 1.8, LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g, 1);
      prev.copy(c);
    }
    if (nb > WIND1) {
      prev.copy(him);
      for (let j = 1; j <= 40; j++) {
        const c = this.himAt(nb - (j * (nb - WIND1)) / 40, q), g = 1.4 * (1 - j / 44);
        L.seg(prev.x, prev.y, prev.z, c.x, c.y, c.z, 1.6, 0.7 * g, 0.05 * g, 0.07 * g, 1);
        prev.copy(c);
      }
    }
    L.render(renderer, out, this.cam);

    // his light: reddened by the blow, and smaller with every turn he gives her; the blow itself, a flash
    this.his.clear();
    const hurt = clamp((nb - BLOW) * 3), spent = aNow / A_END;
    this.his.add(him, [lerp(LIN.bone[0], 0.95, hurt * 0.7), lerp(LIN.bone[1], 0.25, hurt * 0.7), lerp(LIN.bone[2], 0.22, hurt * 0.7)], lerp(0.62, 0.3, spent), lerp(1.1, 0.75, spent), lerp(1, 0.45, spent));
    const flash = nb >= BLOW ? Math.exp(-(nb - BLOW) / 0.35) : 0;
    if (flash > 0.01) this.his.add(HIT, [1, 0.95, 0.9], 2.6 * (1.2 - 0.4 * flash), 2.2 * flash, 1.5 * flash);
    this.his.render(renderer, out, this.cam);

    void hash;
    const blow = pulse(t, tBlow, 0.08);
    return { shake: shakeAt(t, 12 * blow), flash: 0.08 * blow, vignette: 0.35, bloom: 0.75 };
  }
}
