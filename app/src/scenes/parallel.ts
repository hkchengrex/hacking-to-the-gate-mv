// `parallel` — #03 並列過程のパラノイア, 1秒ごとに 世界線を超えて (docs/DESIGN.md).
// 1秒ごとに: one world line, a light running along it; on every beat it divides: where there was one line there are
// two, then four, eight, sixteen, each drawn by its own light, all abreast (the same present in every world), a tree
// of worlds growing out of one. 世界線を超えて: we come round behind the lights and look along the lines, which run
// on ahead of them without end, and more on every side; ours crosses from one to the next on every beat, its thread
// stitched across the others; the meter spins past (no reading); on 超 it crosses several at once.
// `converge` (Act III) is the same in reverse against the dusk: sixteen lights abreast, their lines running together
// two by two until there is one, brighter with each, and that one runs on to the gate; the other worlds bend in to it.
// One smooth move; nothing jolts. The small numbers are the worlds' divergences.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { Divergence } from '../engine/meter';
import { Meter3D } from '../engine/meter3d';
import { clamp, hash, lerp } from '../engine/util';
import { Plate, charsOf, lyricRail } from './_kit';
import { Dark, Lights, Sky, motes } from './_sky';

const SP = 1.7; // between neighbouring lines
const TL = 3.2; // how long a division takes (along the line)
const OWN: [number, number] = [2, 1]; // our line among the sixteen
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Parallel extends Plate {
  dark = new Dark();
  sky = new Sky();
  lines = new LineBatch(40000, { screen2D: false, blend: 'add' });
  lights = new Lights(24);
  cam = new THREE.PerspectiveCamera(58, PW / PH, 0.05, 600);
  meter = new Meter3D({ brightness: 10 });
  div!: Divergence;
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4;
  nbSekai = 6; nbKoe = 10; tM0 = 0; tM1 = 0;
  /** Where the lights are along the lines (z, going down) at every 240th of a second from the plate's first beat; and where the lines divide. */
  zTab = new Float32Array(1);
  zk = [0, 0, 0, 0];
  gate = new THREE.Vector3(0, 9, -900);

  override init() {
    const { lyrics, audio, start, end } = this.ctx;
    this.div = new Divergence(lyrics, audio);
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    const cs = charsOf([this.myLine().words.find((w) => w.w.startsWith('世界線'))!]);
    this.nbSekai = (cs[0]!.t - this.tb0) / this.per;
    this.nbKoe = (cs[4]!.t - this.tb0) / this.per; // 超
    this.tM0 = this.B.t(this.B.at(cs[2]!.t)); // the meter: the beat 線 falls in, and the next
    this.tM1 = this.B.t(this.B.at(cs[2]!.t) + 2);
    // slowly while the lines divide, then fast; faster still from 超
    const m = Math.ceil((end - this.tb0 + 1) * 240);
    this.zTab = new Float32Array(m + 1);
    for (let k = 1; k <= m; k++) {
      const nb = (k - 0.5) / 240 / this.per;
      this.zTab[k] = this.zTab[k - 1]! - (10 + 30 * smoother(clamp((nb - 4.2) / 3)) + 24 * smoother(clamp((nb - this.nbKoe) / 3))) / 240;
    }
    this.zk = [1, 2, 3, 4].map((k) => this.zAt(k * this.per));
  }

  /** Where the lights are (z) at lt seconds from the first beat. */
  private zAt(lt: number) {
    const x = clamp(lt * 240, 0, this.zTab.length - 1.001), i = Math.floor(x);
    return lerp(this.zTab[i]!, this.zTab[i + 1]!, x - i);
  }
  /** How far a division at zk has gone at z (0: not yet; 1: apart). */
  private gone(z: number, k: number) { return smoother(clamp((this.zk[k]! - z) / TL)); }
  /**
   * Line (i, j) of the sixteen at z, across (in spacings from the middle): α divides in two across, then up and down,
   * then each half again (1 → 16); Steins;Gate runs it backward (16 → 1).
   */
  private leaf(i: number, j: number, z: number): [number, number] {
    const GX = i < 2 ? -1 : 1, FX = i % 2 ? 0.5 : -0.5, GY = j < 2 ? -1 : 1, FY = j % 2 ? 0.5 : -0.5;
    if (this.act === 'sg') return [GX * (1 - this.gone(z, 3)) + FX * (1 - this.gone(z, 1)), GY * (1 - this.gone(z, 2)) + FY * (1 - this.gone(z, 0))];
    return [GX * this.gone(z, 0) + FX * this.gone(z, 2), GY * this.gone(z, 1) + FY * this.gone(z, 3)];
  }
  /** How many of the sixteen run together at z. */
  private shared(z: number) {
    let lv = 0;
    for (let k = 0; k < 4; k++) lv += this.gone(z, k);
    return Math.pow(2, this.act === 'sg' ? lv : 4 - lv);
  }
  /** Our light's crossings: how many lines over it is (across, up) at beat nb; one more on every beat from 世, three at once on 超. */
  private hops(nb: number): [number, number] {
    if (this.act === 'sg') return [0, 0];
    let x = 0, y = 0;
    const n0 = Math.ceil(this.nbSekai) + 1;
    for (let k = n0; k <= nb + 1; k++) {
      const u = smoother(clamp((nb - k) / 0.6 + 1)), h = hash(k, 31);
      const big = Math.abs(k - this.nbKoe) < 0.5 ? 3 : 1;
      if (h < 0.4) x += u * big; else if (h < 0.7) x -= u * big; else if (h < 0.85) y += u; else y -= u;
    }
    return [x, y];
  }
  /** Our light at lt seconds from the first beat. */
  private own(lt: number, out: THREE.Vector3) {
    const z = this.zAt(lt), [lx, ly] = this.leaf(OWN[0], OWN[1], z), [hx, hy] = this.hops(lt / this.per);
    return out.set((lx + hx) * SP, (ly + hy) * SP, z);
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const sg = this.act === 'sg';
    const lt = t - this.tb0, nb = lt / this.per, z = this.zAt(lt);
    const me = this.own(lt, new THREE.Vector3());

    // the camera: over the tree's shoulder while the lines divide, then down behind our light, looking along them
    const w = smoother(clamp((nb - 4.4) / 2.6)), open = lerp(0.5, 1, smoother(clamp(nb / 3)));
    const pos = new THREE.Vector3(6.2 * open, 5.2 * open, z + 8.2 * open).lerp(new THREE.Vector3(me.x * 0.85, me.y + 0.5, z + 4.4), w);
    const tgt = new THREE.Vector3(0.6, 0.2, z - 1.5).lerp(new THREE.Vector3(me.x, me.y + 0.1, z - 30), w);
    const ahead = this.own(lt + 0.12, new THREE.Vector3());
    this.cam.position.copy(pos);
    this.cam.up.set((me.x - ahead.x) * 0.25 * w, 1, 0).normalize(); // (leaning into a crossing)
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    if (sg) this.sky.render(renderer, out, this.cam, this.gate, 0.45 + 0.4 * w);
    else this.dark.render(renderer, out, [0.003, 0.0012, 0.0004]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 600, pos.clone().add(new THREE.Vector3(0, 0, -14)), [18, 11, 26], lt, 7, 0.7);
    const hot = sg ? LIN.bone : LIN.nixie, pale = sg ? LIN.ember : LIN.bone;

    // the worlds on every side: lines without end, fading in as we come round; some carry light streaming past.
    // (Steins;Gate: they bend in to ours ahead.)
    const lat = w * (sg ? 0.22 : 1);
    if (lat > 0.01) {
      const near = z + 8, far = z - 170, conv = sg ? smoother(clamp((nb - 5) / 9)) : 0;
      const across = (i: number, j: number, zz: number): [number, number] => {
        const k = clamp(conv * (0.2 + (z - zz) / 80));
        return [lerp((i - 1.5) * SP, me.x, k), lerp((j - 1.5) * SP, me.y, k)];
      };
      for (let i = -7; i <= 10; i++) for (let j = -4; j <= 7; j++) {
        const inTree = i >= 0 && i < 4 && j >= 0 && j < 4;
        const lit = hash(i, j, 41) < 0.22, col = lit ? hot : pale, g0 = lat * (lit ? 0.5 : 0.16) * (inTree && !sg ? 0.5 : 1);
        for (let s = 0; s < 14; s++) {
          const za = near - (s / 14) * (near - far), zb = near - ((s + 1) / 14) * (near - far);
          const a = g0 * Math.exp(-Math.abs((za + zb) / 2 - z) / 48);
          const [xa, ya] = across(i, j, za), [xb, yb] = across(i, j, zb);
          L.seg(xa, ya, za, xb, yb, zb, 1, col[0] * a, col[1] * a, col[2] * a, 1);
        }
        if (!lit) continue;
        const P = 2.4;
        for (let kk = Math.floor(far / P); kk <= Math.ceil(near / P); kk++) {
          const zz = kk * P + hash(i, j, 43) * P, a = lat * 1.1 * Math.exp(-Math.abs(zz - z) / 50);
          if (a < 0.03) continue;
          const [xa, ya] = across(i, j, zz), [xb, yb] = across(i, j, zz - 1.1);
          L.seg(xa, ya, zz, xb, yb, zz - 1.1, 1.8, col[0] * a, col[1] * a, col[2] * a, 1);
        }
      }
    }

    // the sixteen: each drawn by its light, from the one they came out of (where they run together they are brighter)
    const back = z + 70;
    this.lights.clear();
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const mine = i === OWN[0] && j === OWN[1];
      if (mine && !sg) continue; // (ours is drawn below, with its crossings)
      let [x0, y0] = this.leaf(i, j, z);
      p.set(x0 * SP, y0 * SP, z);
      for (let s = 1; s <= 150; s++) {
        const zz = z + (s <= 110 ? s * 0.22 : 24.2 + (back - z - 24.2) * ((s - 110) / 40));
        [x0, y0] = this.leaf(i, j, zz);
        q.set(x0 * SP, y0 * SP, zz);
        const sh = this.shared((p.z + q.z) / 2);
        const g = (sg ? 0.5 : 0.42) * Math.pow(sh, -0.55) * Math.exp(-(zz - z) / 34) * (sg ? 1 + 0.25 * (16 / this.shared(z) - 1) : 1);
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.4, pale[0] * g, pale[1] * g, pale[2] * g, 1);
        p.copy(q);
      }
      [x0, y0] = this.leaf(i, j, z);
      this.lights.add(p.set(x0 * SP, y0 * SP, z), mine ? hot : pale, mine ? 0.42 : 0.24, mine ? 1.1 : (sg ? 0.5 : 0.7) * (1 - 0.55 * w), mine ? 1 : 0.5);
    }
    // ours: its thread behind it, across the others
    if (!sg) {
      this.own(lt, p);
      for (let s = 1; s <= 220; s++) {
        const lt1 = lt - 4.2 * Math.pow(s / 220, 1.5);
        if (lt1 < -3) break;
        if (lt1 >= 0) this.own(lt1, q); else q.set(0, 0, -lt1 * 10); // (before the plate: the one line it came down)
        const g = 2.4 * Math.exp(-(lt - lt1) / 1.5) + 0.25;
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.9, hot[0] * g, hot[1] * g, hot[2] * g, 1);
        p.copy(q);
      }
      this.lights.add(me, hot, 0.5, 1.3, 1);
    } else {
      // (the one line ahead of the light, to the gate, once they are one)
      const one = smoother(clamp((nb - 4.6) / 2));
      for (let s = 0; s < 90 && one > 0.01; s++) {
        const za = z - s * 2.5, run = Math.exp(-Math.pow((((za + 46 * lt) % 30) + 30) % 30 - 15, 2) / 3); // (light running along it, to the gate)
        const g = one * (0.7 + 2.2 * run) * Math.exp(-s / 40);
        L.seg(me.x, me.y, za, me.x, me.y, za - 2.5, 1.5, hot[0] * g, hot[1] * g, hot[2] * g, 1);
      }
    }
    L.render(renderer, out, this.cam);
    this.lights.render(renderer, out, this.cam);

    // the meter spins past (no reading) for two beats around 線
    if (!sg && t > this.tM0 && t < this.tM1) {
      const u = (t - this.tM0) / (this.tM1 - this.tM0);
      this.meter.update(this.div.state(t));
      const mc = this.meter.view([lerp(-2.6, 2.6, u), lerp(-11.5, -9.8, u), 2.6 - 0.5 * u], [lerp(-0.35, 0.35, u), 0, 1.15], 32);
      this.meter.render(renderer, comp, out, mc, { opacity: Math.min(1, u / 0.12, (1 - u) / 0.12) });
    }

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    // the worlds' divergences: by each light of the tree, then on the lines near ours
    c.font = font(F.mono(400), 15);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    const v = new THREE.Vector3();
    const label = (x: number, y: number, zz: number, a: number, id: number) => {
      v.set(x, y, zz).project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.82 || a < 0.02) return;
      c.fillStyle = rgba('ash', 0.75 * a);
      c.fillText(`${hash(id, 51) < 0.6 ? '0' : '1'}.${String(Math.floor(hash(id, 53) * 1e6)).padStart(6, '0')}`, (v.x * 0.5 + 0.5) * W + 9, (0.5 - v.y * 0.5) * H - 7);
    };
    const tree = (1 - w) * smoother(clamp((nb - 1.6) / 1.2));
    const seen = new Set<string>();
    if (tree > 0.02) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const [x0, y0] = this.leaf(i, j, z), key = `${x0.toFixed(1)},${y0.toFixed(1)}`;
      if (seen.has(key)) continue; // (lines still running together share a number)
      seen.add(key);
      label(x0 * SP, y0 * SP, z, tree, i * 4 + j);
    }
    const inMeter = !sg && t > this.tM0 && t < this.tM1;
    const li = Math.round(me.x / SP + 1.5), lj = Math.round(me.y / SP + 1.5);
    if (w > 0.3 && !inMeter && !sg) for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      label((li + i - 1.5) * SP, (lj + j - 1.5) * SP, z - 7 - 3 * hash(li + i, lj + j, 7), (w - 0.3) / 0.7, (li + i) * 16 + lj + j + 99);
    }
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.7, bloomThreshold: 0.8 };
  }
}
