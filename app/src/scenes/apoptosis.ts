// `apoptosis` — #19 無限連鎖のアポトーシス, そしてまた 悲しみの無い 時間のループへと (docs/DESIGN.md). The endless chain. A light runs round a loop of thread; where the loop touches the next one it
// crosses over and runs round that, and the loop it has left dies behind it: its threads go to blood red, break
// into pieces and dim to embers. Loop after loop. The loops ahead of it are embers already: it has been round them
// before, and each one lights again as it comes through. On ループ we rise and see the whole of it: the loops stand
// in a ring, each touching the next, the last touching the first; a pulse of light runs the whole way round, through
// every loop, and comes back to where it started. The chain has no end.
// `loopbreak` (Act III, #20 怨嗟断絶のアポトーシス) is the same chain against the dusk; on ループ the light does not cross
// into the next loop: it leaves where it is, straight, and its thread runs on to the gate.
// One smooth move; no text but the lyric; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, lerp } from '../engine/util';
import { Plate, charsOf, lyricRail } from './_kit';
import { Dark, Lights, Sky, gauss, motes } from './_sky';

const TAU = Math.PI * 2;
/** The loops: how many stand in the ring, their radius, the ring's radius (each touches the next); threads a loop, pieces a thread. */
const N = 8, R = 1.6, RB = R / Math.sin(Math.PI / N), FIB = 10, SEG = 84;
/** The light's turning (radians a beat): two loops, three whole turns, in eight beats. */
const OMEGA = (6 * Math.PI) / 8;
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const mod = (x: number, m: number) => ((x % m) + m) % m;
const centre = (k: number) => new THREE.Vector3(RB * Math.cos((k * TAU) / N), 0, RB * Math.sin((k * TAU) / N));
/** Where loop k touches loop k + 1. */
const touch = (k: number) => centre(k).add(centre(k + 1)).multiplyScalar(0.5);
/** Loop k: the light comes in where it touches the one before (angle a0) and turns one way or the other (sense), a whole turn and on to where it touches the next. */
const LOOPS = Array.from({ length: N }, (_, k) => {
  const c = centre(k), pin = touch(k - 1), pout = touch(k), sense = k % 2 ? -1 : 1;
  const a0 = Math.atan2(pin.z - c.z, pin.x - c.x), a1 = Math.atan2(pout.z - c.z, pout.x - c.x);
  return { c, sense, a0, sweep: mod(sense * (a1 - a0), TAU) + TAU };
});
/** Where each loop starts along the way (radians travelled), and the whole way round the chain. */
const S0: number[] = [];
let WAY = 0;
for (const l of LOOPS) { S0.push(WAY); WAY += l.sweep; }
/** The place on loop j at angle a, on thread f (the threads of a loop lie close, each a little its own way). */
function onLoop(j: number, a: number, f: number, out: THREE.Vector3) {
  const l = LOOPS[j]!, u = f - (FIB - 1) / 2;
  const r = R * (1 + 0.022 * Math.sin(3 * a + f * 2.1 + j) + 0.02 * Math.sin(5 * a + f * 4.4) + u * 0.009);
  return out.set(l.c.x + r * Math.cos(a), 0.05 * Math.sin(2 * a + f * 1.3 + j * 0.7) + 0.035 * Math.sin(7 * a + f * 3.1) + (f % 3 - 1) * 0.025, l.c.z + r * Math.sin(a));
}

export default class Apoptosis extends Plate {
  dark = new Dark();
  sky = new Sky();
  lines = new LineBatch(N * FIB * SEG + 4000, { screen2D: false, blend: 'add' });
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(38, PW / PH, 0.1, 800);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4; nbLoop = 12;
  /** Act III: where the light leaves the chain, which way, and the gate it makes for. */
  out0 = new THREE.Vector3(); outDir = new THREE.Vector3(1, 0, 0); gate = new THREE.Vector3();

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    const l = this.myLine();
    this.nbLoop = (charsOf([l.words[2]!])[3]!.t - this.tb0) / this.per; // ル
    const h = this.head(this.nbLoop);
    this.out0.copy(h.p);
    this.outDir.copy(h.dir);
    this.gate.copy(h.p).addScaledVector(h.dir, 300).add(new THREE.Vector3(0, 26, 0));
  }

  /** The light at beat nb: the loop it is on, how far round it has come since it came in, where it is and which way it goes. */
  private head(nb: number) {
    let s = mod(OMEGA * Math.max(nb, 0) + 0.6, WAY), j = 0;
    while (s >= LOOPS[j]!.sweep) { s -= LOOPS[j]!.sweep; j++; }
    const l = LOOPS[j]!, a = l.a0 + l.sense * s;
    const p = onLoop(j, a, (FIB - 1) / 2, new THREE.Vector3());
    return { j, s, a, p, dir: new THREE.Vector3(-Math.sin(a) * l.sense, 0, Math.cos(a) * l.sense), way: S0[j]! + s };
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const sg = this.act === 'sg';
    const nb = (t - this.tb0) / this.per, lt = t - this.tb0;
    const gone = sg ? Math.max(0, nb - this.nbLoop) : 0; // (Act III: beats since it left the chain)
    const h = this.head(sg ? Math.min(nb, this.nbLoop) : nb);
    const hp = gone > 0 ? this.out0.clone().addScaledVector(this.outDir, OMEGA * R * gone * (1 + 0.25 * gone)) : h.p;

    // the camera: close on the loop the light is running round, gliding along the chain with it; on ループ up and back
    // to see the ring of loops whole (Act III: round behind the light as it leaves, the gate ahead)
    const along = (OMEGA * Math.min(nb, sg ? this.nbLoop : 1e9) + 0.6) / (WAY / N) - 0.5; // (loops along the chain, steady)
    const ang = (along * TAU) / N, D = lerp(2.6, 6.2, smoother(clamp(nb / 5)));
    const on = new THREE.Vector3(RB * Math.cos(ang), 0, RB * Math.sin(ang)), outw = on.clone().normalize();
    const pos = on.clone().addScaledVector(outw, D).add(new THREE.Vector3(0, 0.42 * D, 0)), tgt = on.clone();
    if (!sg) {
      const w = smoother(clamp((nb - (this.nbLoop - 1.5)) / 3.5)), turn = 0.5 + 0.035 * (nb - this.nbLoop);
      pos.lerp(new THREE.Vector3(10.5 * Math.cos(ang + turn), 16.5, 10.5 * Math.sin(ang + turn)), w);
      tgt.lerp(new THREE.Vector3(0, 0, 0), w);
    } else {
      const w = smoother(clamp(gone / 3));
      // (back and up from where it left, so the chain it leaves stays in the picture under the thread)
      pos.lerp(this.out0.clone().addScaledVector(this.outDir, -17).add(new THREE.Vector3(0, 8, 0)).addScaledVector(new THREE.Vector3(-this.outDir.z, 0, this.outDir.x), 5), w);
      tgt.lerp(this.out0.clone().addScaledVector(this.outDir, 5 + 1.6 * gone).add(new THREE.Vector3(0, 1, 0)), w);
    }
    this.cam.position.copy(pos);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    if (sg) this.sky.render(renderer, out, this.cam, this.gate, 0.5 + 0.3 * smoother(clamp(gone / 3)));
    else this.dark.render(renderer, out, [0.004, 0.0015, 0.0005]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 700, pos.clone().lerp(tgt, 0.5), [16, 9, 16], lt, 11, 0.8);
    // the loops. On each: the light's own stretch is lit (from where it came in to where it is; all of it after a
    // whole turn); a loop it has left dies over three beats; the rest are embers, in pieces
    const live = sg ? LIN.ember : LIN.nixie, dead = LIN.blood;
    const pulse = sg ? -1 : (nb - this.nbLoop) * (WAY / 3.2); // (the pulse round the whole chain on ループ: how far ahead of the light)
    const fadeAll = sg ? 1 - 0.6 * smoother(clamp(gone / 5)) : 1;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let j = 0; j < N; j++) {
      const l = LOOPS[j]!;
      // how long since the light left this loop (beats; < 0: it has not been on it this time round)
      const ahead = mod(S0[j]! - h.way, WAY), since = j === h.j ? -1 : (WAY - ahead - l.sweep) / OMEGA;
      const dying = j !== h.j && since >= 0 && since < 30 ? 1 - smoother(clamp(since / 3)) : 0;
      for (let fi = 0; fi < FIB; fi++) {
        onLoop(j, 0, fi, p);
        for (let i = 1; i <= SEG; i++) {
          const a = (i / SEG) * TAU;
          onLoop(j, a, fi, q);
          const d = mod(l.sense * (a - l.a0), TAU); // (how far round from where the light comes in)
          let lit = dying;
          if (j === h.j) lit = Math.max(clamp((h.s - d) / 0.5), h.s > TAU + 0.5 ? 1 : 0);
          // the pieces of a dead thread
          const piece = Math.sin(a * 19 + fi * 2.3 + j * 1.1) > 0.25 ? 1 : 0.12;
          let g = 0.3 * piece * (1 - lit), hot = 0;
          if (pulse > 0) {
            // the pulse passes each place on the way once or twice (a loop is a turn and a part)
            for (const w of d + TAU <= l.sweep ? [d, d + TAU] : [d]) {
              const rel = mod(S0[j]! + w - h.way, WAY);
              hot += gauss(rel - pulse, 2.4) + 0.4 * clamp((pulse - rel) / 6); // (and stays lit behind it)
            }
          }
          const tw = 0.75 + 0.25 * Math.sin(a * 5 + fi * 1.9 + lt * 2.2);
          const cr = (dead[0] * g + live[0] * (1.15 * lit * tw + 1.5 * hot)) * fadeAll, cg = (dead[1] * g + live[1] * (1.15 * lit * tw + 1.5 * hot)) * fadeAll, cb = (dead[2] * g + live[2] * (1.15 * lit * tw + 1.5 * hot)) * fadeAll;
          L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.25, cr * 0.75, cg * 0.75, cb * 0.75, 1);
          p.copy(q);
        }
      }
    }
    // the light's tail, on the loop behind it (and, in Act III, its thread out of the chain)
    if (gone <= 0) {
      const l = LOOPS[h.j]!;
      for (let i = 0; i < 26; i++) {
        const s0 = h.s - (i / 26) * 1.5, s1 = h.s - ((i + 1) / 26) * 1.5;
        if (s1 < 0) break;
        onLoop(h.j, l.a0 + l.sense * s0, (FIB - 1) / 2, p);
        onLoop(h.j, l.a0 + l.sense * s1, (FIB - 1) / 2, q);
        const g = 2.6 * (1 - i / 26) ** 2;
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 2.4, LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g, 1);
      }
    } else {
      const len = hp.distanceTo(this.out0);
      for (let i = 0; i < 60; i++) {
        p.copy(this.out0).addScaledVector(this.outDir, (i / 60) * len);
        q.copy(this.out0).addScaledVector(this.outDir, ((i + 1) / 60) * len);
        const g = 0.5 + 2.2 * Math.pow((i + 1) / 60, 3);
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.8, LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g, 1);
      }
    }
    L.render(renderer, out, this.cam);

    this.lights.clear();
    this.lights.add(hp, sg ? LIN.bone : LIN.ember, 0.5, 1.2, 1);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.7 };
  }
}
