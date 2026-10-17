// `zero` — #23β ゼロ除算, the break bar, だからいま (docs/DESIGN.md).
// Division by zero, as a place: the plane as a net of threads (rings and lines out from the middle), and at zero the
// net stands up into a horn, 1 / r, thinner and steeper without end, a needle going up out of sight. A light comes
// in round the bowl, the way things fall in, and up: faster and faster, up the needle and gone; we come down low
// and look up after it. On the bar's crash the whole net flares and the error shows. On the last 8th the
// horn draws in onto its axis: one line of light, which is where the chorus (`parallel`) begins.
// `silence` (Act III, at the breakdown): the same against the dusk, slower: the light goes round the bowl through
// the quiet, and climbs on だからいま.
// One smooth move; the lyric in the rail; nothing jolts. Both come out of the white the plate before ends in.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { clamp, frameIdx, lerp, pulse } from '../engine/util';
import { Plate, lyricRail } from './_kit';
import { Dark, Lights, Sky, motes } from './_sky';

const TAU = Math.PI * 2;
/** The horn: height A / r (less its height at the rim, ROUT), drawn up to HTOP; M lines up it, a ring every third step of Q. */
const A = 2.2, ROUT = 9, HTOP = 120, M = 40, Q = 0.9;
const J = Math.ceil(Math.log(ROUT / (A / (HTOP + A / ROUT))) / -Math.log(Q));
const height = (r: number) => (r >= ROUT ? 0 : A / r - A / ROUT);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Zero extends Plate {
  dark = new Dark();
  sky = new Sky();
  lines = new LineBatch(9000, { screen2D: false, blend: 'add' });
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(50, PW / PH, 0.1, 600);
  L = new Layer2D();
  crash = 0; collapse0 = 0; tWord = 0;

  override init() {
    const { audio, start, end } = this.ctx;
    this.tWord = this.lineWords[0]?.start ?? start + 0.3; // だ
    // the crash: the strongest drum hit in the bar
    const hits = [...audio.events('snare', start + 0.2, end - 0.1), ...audio.events('kick', start + 0.2, end - 0.1)];
    this.crash = hits.sort((a, b) => b[1] - a[1])[0]?.[0] ?? this.tWord + 0.4;
    this.collapse0 = end - 0.21;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, start, end } = this.ctx;
    const sg = this.act === 'sg';
    const lt = t - start;
    // how far in the light has come (its radius is ROUT·e^-lam): α: all the way in the one bar, faster and faster;
    // Steins;Gate: round the bowl through the quiet, then up on だ
    const t1 = this.tWord - 0.3;
    const lam = sg ? 0.3 + 1.3 * smoother(clamp(lt / (t1 - start))) + 5.4 * Math.pow(clamp((t - t1) / (this.collapse0 - t1)), 1.8)
      : 0.4 + 6.4 * Math.pow(clamp(lt / (this.collapse0 - start)), 1.8);
    // the collapse, over the last 8th and a bit: the horn drawn in onto its axis
    const col = Math.pow(clamp((t - this.collapse0) / (end - 0.01 - this.collapse0)), 3), kc = 1 - col;
    const horn = (r: number, a: number, o: THREE.Vector3) => o.set(r * kc * Math.cos(a), height(r), r * kc * Math.sin(a));

    // the camera: above the bowl, going round it; then down low beside the horn, looking up it
    const w = smoother(sg ? clamp((t - (this.tWord - 0.7)) / (this.collapse0 - (this.tWord - 0.7))) : clamp(lt / (this.collapse0 - start)));
    const az = 0.9 + (sg ? 0.2 : 0.45) * lt, Rc = lerp(sg ? 17 : 15.5, 6, w), hc = lerp(sg ? 9.5 : 8.5, 1.5, w);
    this.cam.position.set(Rc * Math.cos(az), hc, Rc * Math.sin(az));
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(0, lerp(1.2, 11, w), 0);
    this.cam.updateMatrixWorld();
    if (sg) this.sky.render(renderer, out, this.cam, null);
    else this.dark.render(renderer, out, [0.004, 0.0016, 0.0005]);

    const L = this.lines;
    L.clear();
    motes(L, this.cam, 400, new THREE.Vector3(0, 6, 0), [16, 10, 16], lt, 21, 0.7);
    const net = sg ? LIN.ember : LIN.bone, hot = sg ? LIN.bone : LIN.nixie;
    const flare = (1 + 2.2 * pulse(t, this.crash, 0.12)) * (1 + 2 * col);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    // the lines up the horn (and out over the plane), fainter with height; where they run together, up the needle, dimmer each
    for (let m = 0; m < M; m++) {
      const a = (m / M) * TAU, gm = (m % 5 ? 0.3 : 0.55) * flare;
      horn(26, a, p);
      for (let k = 1; k <= 8; k++) {
        const r = 26 - (k / 8) * (26 - ROUT);
        horn(r, a, q);
        const g = gm * 0.6 * (1 - (r - ROUT) / 17.5);
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1, net[0] * g, net[1] * g, net[2] * g, 1);
        p.copy(q);
      }
      for (let j = 1; j <= J; j++) {
        const r = ROUT * Math.pow(Q, j);
        horn(r, a, q);
        const g = gm * Math.exp(-q.y / 45) * clamp(r / 0.5, 0.12, 1);
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1, net[0] * g, net[1] * g, net[2] * g, 1);
        p.copy(q);
      }
    }
    // the rings: on the plane, and up the horn, each a third of the way nearer the axis than the last
    const ring = (r: number, g: number) => {
      const n = Math.round(clamp(20 + 44 * (r / ROUT), 12, 96));
      horn(r, 0, p);
      for (let i = 1; i <= n; i++) {
        horn(r, (i / n) * TAU, q);
        L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1, net[0] * g, net[1] * g, net[2] * g, 1);
        p.copy(q);
      }
    };
    for (let k = 1; k <= 5; k++) ring(ROUT * Math.pow(1.25, k), 0.13 * (1 - k / 6) * flare);
    for (let j = 0; j <= J; j += 3) {
      const r = ROUT * Math.pow(Q, j);
      ring(r, 0.24 * flare * Math.exp(-height(r) / 45) * clamp(r / 0.4, 0.2, 1));
    }
    // the light, and its thread behind it: in round the bowl, and up
    const at = (l: number, o: THREE.Vector3) => horn(ROUT * Math.exp(-l), 0.8 + 2.2 * l, o);
    at(lam, p);
    for (let i = 1; i <= 90; i++) {
      const l = lam - 2.4 * Math.pow(i / 90, 1.4);
      if (l < -0.2) break;
      at(l, q);
      const g = 2.6 * Math.exp(-(lam - l) / 0.7) * kc;
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 2, hot[0] * g, hot[1] * g, hot[2] * g, 1);
      p.copy(q);
    }
    // (as it all draws in: the axis itself, one line of light)
    if (col > 0) for (let i = 0; i < 40; i++) {
      const g = 5 * col * Math.exp(-i / 22);
      L.seg(0, i * 3, 0, 0, (i + 1) * 3, 0, 2.4, hot[0] * g, hot[1] * g, hot[2] * g, 1);
    }
    L.render(renderer, out, this.cam);

    this.lights.clear();
    const head = at(lam, new THREE.Vector3());
    if (head.y < HTOP * 1.5) this.lights.add(head, hot, 0.36, 1.3 * kc, 1);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    // the error, after the crash
    if (t >= this.crash) {
      c.font = font(F.mono(500), 18);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = rgba(sg ? 'ember' : 'nixie');
      c.fillText('ERR  DIVISION BY ZERO', 120, 150);
      c.fillStyle = rgba('ash', 0.8);
      c.fillText(`x / 0 → ${frameIdx(t) % 2 ? '∞' : 'NaN'}`, 120, 176);
    }
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    // (the plate before ends in white: we come out of it)
    return { vignette: 0.3, bloom: 0.65 + 0.6 * col, flash: 0.9 * Math.exp(-Math.max(0, lt - 4 / 60) / 0.11) };
  }
}
