// `trick` — #21 因果律のメルト (Steins;Gate), そのために 時を欺く 残された仕掛けに (Act III; docs/DESIGN.md). The trick, as a picture: the flat line that still beats. Her heart's trace, crimson, runs
// across the dusk; from straight ahead, where the past self stands (his light, bone, right in front of it), it is
// a dead flat line, as in Act II's `flatline`. Then the camera lifts, and it was a strip of chart paper seen
// edge-on all along: on it the trace is a full, steady heartbeat, its spikes pointing away along the line of
// sight. She only looks dead from the one place he will be standing. A point of light sweeps along the trace as
// on a monitor, a beat of the heart every two of the song's. No text but the lyric; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, lerp } from '../engine/util';
import { Plate, lyricRail } from './_kit';
import { Lights, Sky, motes } from './_sky';

/** The trace: a heartbeat every PX along it, its R spike AMP tall (into the depth); the paper from Z0 (far) to Z1 (near). */
const PX = 5, AMP = 2.4, Z0 = -4.4, Z1 = 0.9, XE = 44;
const bump = (u: number, c: number, w: number) => Math.exp(-(((u - c) / w) ** 2));
/** One heartbeat (phase u in 0..1): P, the QRS spike, T. */
const ecg = (u: number) => 0.11 * bump(u, 0.2, 0.035) - 0.13 * bump(u, 0.365, 0.012) + bump(u, 0.4, 0.013) - 0.24 * bump(u, 0.437, 0.014) + 0.27 * bump(u, 0.63, 0.06);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Trick extends Plate {
  sky = new Sky();
  lines = new LineBatch(4000, { screen2D: false, blend: 'add' });
  trace = new LineBatch(8000, { screen2D: false, blend: 'max' }); // (max: no beads where its short segments overlap)
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(30, PW / PH, 0.1, 600);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 18;
  gate = new THREE.Vector3(70, 30, -260);
  him = new THREE.Vector3(-2.4, 0, 1.45);

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
    const nb = (t - this.tb0) / this.per; // beats into the plate, continuous

    // the camera: level with the paper, straight in front (the past self's view), until 欺く; then it lifts and comes round a little
    const up = smoother(clamp((nb - 3.4) / 8)), on = clamp((nb - 3.4) / (this.nbEnd - 3.4));
    const el = ((1 + 33 * up + 5 * on) * Math.PI) / 180, az = (14 * smoother(on) * Math.PI) / 180, D = lerp(15, 8.6, smoother(clamp((nb - 3.4) / 10)));
    const tgt = new THREE.Vector3(0.4, lerp(-1.0, 0.25, up), -0.15);
    this.cam.position.set(tgt.x + D * Math.cos(el) * Math.sin(az), D * Math.sin(el), tgt.z + D * Math.cos(el) * Math.cos(az));
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
    this.sky.render(renderer, out, this.cam, this.gate, 0.8);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 900, tgt, [26, 12, 26], t - this.tb0, 3);
    // the chart paper: its grid (every fifth line heavier) and its two edges, fading along its length
    const cold = LIN.cold, fadeX = (x: number) => Math.exp(-((x / 26) ** 2));
    for (let i = Math.round(-XE / 0.5); i <= XE / 0.5; i++) {
      const x = i * 0.5, g = (i % 5 === 0 ? 0.7 : 0.28) * fadeX(x);
      L.seg(x, 0, Z0, x, 0, Z1, i % 5 === 0 ? 1.4 : 1, cold[0] * g, cold[1] * g, cold[2] * g, 1);
    }
    for (let j = 0; j <= Math.round((Z1 - Z0) / 0.5); j++) {
      const z = Z1 - j * 0.5, edge = j === 0 || z <= Z0 + 0.01, heavy = j % 5 === 0;
      for (let x = -XE; x < XE; x += 4) {
        const g = (edge ? 1.3 : heavy ? 0.7 : 0.28) * fadeX(x + 2);
        L.seg(x, 0, edge && j > 0 ? Z0 : z, x + 4, 0, edge && j > 0 ? Z0 : z, edge ? 1.8 : heavy ? 1.4 : 1, cold[0] * g, cold[1] * g, cold[2] * g, 1);
      }
    }
    // the trace: the spot sweeps along it (one heartbeat's length in two beats, crossing every R spike on the even beats),
    // the line brightest just behind the spot and fading back to the last one, like a monitor's phosphor
    const sweep = nb / 2 + 0.4, crim = LIN.crimson;
    const zAt = (x: number) => -AMP * ecg(x / PX - Math.floor(x / PX));
    const thump = bump((nb / 2 - Math.round(nb / 2)) * 2 * this.per, 0, 0.12); // (on the R spike)
    const DX = 0.025, T = this.trace;
    T.clear();
    let px = -XE, pz = zAt(px);
    for (let x = -XE + DX; x <= XE; x += DX) {
      const z = zAt(x);
      const behind = (((sweep - x / PX) % 1) + 1) % 1; // heartbeats behind the spot (0 at the spot)
      const g = (1.6 + 5 * Math.exp(-behind / 0.22) + 5 * Math.exp(-((behind * PX / 0.09) ** 2))) * (1 + 0.5 * thump) * fadeX(x * 0.8);
      const hot = Math.exp(-((behind * PX / 0.2) ** 2));
      T.seg(px, 0, pz, x, 0, z, 3.6, (crim[0] * (1 - hot) + hot) * g, (crim[1] * (1 - hot) + 0.3 * hot) * g, (crim[2] * (1 - hot) + 0.28 * hot) * g, 1);
      px = x; pz = z;
    }
    L.render(renderer, out, this.cam);
    T.render(renderer, out, this.cam);

    // his light, in front of the paper's near edge: where the line is flat
    this.lights.clear();
    this.lights.add(this.him, LIN.bone, 0.34, 1, 1);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.7 };
  }
}
