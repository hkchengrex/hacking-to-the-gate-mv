// `fields` — #06 蝶翼のダイバージェンス (Steins;Gate), the solo's second plate (docs/DESIGN.md). The flight between the two worlds: the attractor fields as two colossal Lorenz butterflies, α in nixie to
// the left and β in crimson to the right, their orbits strands of light with brighter light streaming round them,
// towering over a narrow gap. His light flies through the gap, drawing its thread; the way bends toward one field,
// then toward the other (each looms and brightens as it pulls), then straightens, and ahead, between them, is the
// gate. The camera rides behind him, banking with the bends. Smooth throughout; no text.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, lerp } from '../engine/util';
import { Plate } from './_kit';
import { Lights, Sky, gauss, motes } from './_sky';

/** A butterfly: orbits of the Lorenz system from a few nearby starts, scaled up and set to one side of the way (z forward is -z). */
const S = 5.5, OFF = 124;
function butterfly(side: number, seeds: number[], n: number) {
  const out: Float32Array[] = [];
  for (const seed of seeds) {
    let x = 1 + seed, y = 1 + seed * 0.7, z = 20;
    const h = 0.006, pts = new Float32Array(n * 3);
    for (let i = 0; i < 2500 + n * 2; i++) {
      const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z;
      x += dx * h; y += dy * h; z += dz * h;
      if (i >= 2500 && i % 2 === 0) pts.set([side * (OFF + x * S), (z - 25) * S, y * S], ((i - 2500) / 2) * 3); // (the two are mirror images)
    }
    out.push(pts);
  }
  return out;
}
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Fields extends Plate {
  sky = new Sky();
  strands = new LineBatch(60000, { screen2D: false, blend: 'add', worldWidth: true });
  lines = new LineBatch(4000, { screen2D: false, blend: 'add' });
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(62, PW / PH, 0.1, 1500);
  A = butterfly(-1, [0.1, 0.9, 1.7, 2.6, 3.3], 3400);
  Bf = butterfly(1, [0.3, 1.2, 2.1, 2.9, 3.6], 3400);
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 16;
  gate = new THREE.Vector3(0, 30, -900);

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    this.nbEnd = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + this.nbEnd) - this.tb0) / this.nbEnd;
  }

  /** The way through: where it is (x) at z. It bends toward α, then toward β, then runs straight. */
  private wayX(z: number) { return -12 * gauss(z - 85, 50) + 12 * gauss(z + 10, 50); }
  private way(z: number) { return new THREE.Vector3(this.wayX(z), 3 * gauss(z + 10, 80) - 2, z); }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer } = this.ctx;
    const nb = (t - this.tb0) / this.per, lt = t - this.tb0;
    const u = clamp(nb / this.nbEnd), zs = lerp(215, -75, 0.3 * u + 0.7 * smoother(u)); // where he is along the way

    const him = this.way(zs), back = this.way(zs + 5.5), ahead = this.way(zs - 30);
    const bank = (this.wayX(zs - 8) - this.wayX(zs + 8)) / 16; // the way's turn: the camera banks with it
    this.cam.position.set(back.x, back.y + 1.3, back.z);
    this.cam.up.set(-bank * 1.4, 1, 0);
    this.cam.lookAt(ahead.x, ahead.y + 0.6, ahead.z);
    this.cam.updateMatrixWorld();
    this.sky.render(renderer, out, this.cam, this.gate, 0.6 + 0.6 * u);

    // the two fields: every orbit a strand, light streaming along it; each brightens as the way bends toward it
    const G = this.strands;
    G.clear();
    const pull = [gauss(zs - 85, 55), gauss(zs + 10, 55)];
    const cz = this.cam.position.z;
    [this.A, this.Bf].forEach((orbits, s) => {
      const col = s ? LIN.crimson : LIN.nixie, gain = (s ? 2.6 : 1.5) * (0.75 + 0.9 * pull[s]!);
      orbits.forEach((p, o) => {
        const n = p.length / 3;
        for (let i = 1; i < n; i++) {
          const z1 = p[i * 3 + 2]!;
          if (z1 > cz - 0.5) continue; // (behind us)
          const d = cz - z1;
          const run = gauss((((i / 170 - lt * 0.55 + o * 0.37) % 1) + 1) % 1 - 0.5, 0.11);
          const g = gain * (0.22 + 1.5 * run) * Math.exp(-d * 0.0045);
          G.seg(p[i * 3 - 3]!, p[i * 3 - 2]!, p[i * 3 - 1]!, p[i * 3]!, p[i * 3 + 1]!, z1, 0.2 + 0.25 * run, col[0] * g, col[1] * g, col[2] * g, 1);
        }
      });
    });
    // his thread, behind him
    for (let j = 0; j < 20; j++) {
      const a = this.way(zs + j * 0.25), b = this.way(zs + (j + 1) * 0.25), g = 2.2 * (1 - j / 21);
      if (b.z > cz - 0.4) break;
      G.seg(a.x, a.y, a.z, b.x, b.y, b.z, 0.014, LIN.bone[0] * g * 0.6, LIN.bone[1] * g * 0.6, LIN.bone[2] * g * 0.6, 1);
    }
    G.render(renderer, out, this.cam);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 1400, this.cam.position, [34, 26, 60], lt, 11, 1.3);
    L.render(renderer, out, this.cam);

    this.lights.clear();
    this.lights.add(him, LIN.bone, 0.55, 1.1, 1);
    this.lights.render(renderer, out, this.cam);
    return { vignette: 0.35, bloom: 0.75, bloomThreshold: 0.8 };
  }
}
