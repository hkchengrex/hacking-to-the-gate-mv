// `sern` — #25 横行跋扈のポリオマニア, 支配者きどりの 愚かな種族は (Act II; docs/DESIGN.md).
// SERN, the would-be rulers of time: a vast accelerator ring laid over a night city like a crown or a
// cage, seen from a slow orbiting camera, which cuts to a new angle on the bars. As in the machine itself, two
// beams go round it in opposite directions (one bunch each here), and where they cross, inside
// a detector, they collide: a burst of curving tracks, like an event display. They cross on every beat, at the
// two detectors in turn (opposite each other on the ring). The city is points of light in a grid; the ring
// burns crimson. Only the text SERN, never a logo.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { ease, hash, lerp, prog, pulse } from '../engine/util';
import { Plate, lyricRail, monoText, shakeAt } from './_kit';

const RING = 30; // ring radius (world units)

export default class Sern extends Plate {
  bg = new FSPass(/* glsl */ `void main() { vec2 p = FRAG_PX / vec2(${W}.0, ${H}.0); fragColor = vec4(mix(C_INK * 0.5, C_COLD * 0.05, p.y), 1.0); }`);
  lines = new LineBatch(40000, { screen2D: false, blend: 'add' });
  cam = new THREE.PerspectiveCamera(40, PW / PH, 0.1, 2000);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4;

  override init() {
    this.b0 = this.B.at(this.ctx.start + 0.01);
    this.tb0 = this.B.t(this.b0);
    this.per = (this.B.t(this.b0 + 14) - this.tb0) / 14;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, start, end } = this.ctx;
    this.bg.render(renderer, out);
    const beats = this.B.at(t) - this.b0, bar = Math.floor(beats / 4);
    // camera: a slow orbit, cutting to a new height and side every bar
    const poses = [[0.4, 22, 52], [2.1, 8, 40], [3.6, 34, 60], [5.0, 14, 46]];
    const [az0, h, d] = poses[bar % poses.length]!;
    const az = az0! + 0.08 * (t - start);
    this.cam.position.set(Math.cos(az) * d!, h!, Math.sin(az) * d!);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateMatrixWorld();

    const L = this.lines;
    L.clear();
    // the city: a grid of window lights under and around the ring
    for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) {
      const hsh = hash(i, j, 3);
      if (hsh > 0.42) continue;
      const x = i * 2.2 + (hash(i, j, 4) - 0.5), z = j * 2.2 + (hash(i, j, 5) - 0.5);
      const ht = 0.06 + Math.pow(hash(i, j, 6), 10) * 5; // mostly points of light, a few towers
      const g = 0.25 + 0.75 * hash(i, j, 7);
      const flick = hash(i, j, Math.floor(t * 2)) > 0.03 ? 1 : 0.2;
      const col = hsh < 0.04 ? LIN.ember : LIN.bone;
      L.seg(x, 0, z, x, ht, z, 2.2, col[0] * g * 0.5 * flick, col[1] * g * 0.5 * flick, col[2] * g * 0.5 * flick, 1);
    }
    // the ring: a tube of hairlines (crimson), its cross-section ticks
    const n = 240;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      for (const [r, y, g] of [[RING, 1.2, 2.6], [RING - 0.8, 1.2, 1.2], [RING + 0.8, 1.2, 1.2], [RING, 2.0, 1.2], [RING, 0.4, 1.2]] as const) {
        L.seg(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r, k % 2 ? 1.6 : 2, LIN.crimson[0] * g, LIN.crimson[1] * g, LIN.crimson[2] * g, 1);
      }
      if (k % 6 === 0) L.seg(Math.cos(a0) * (RING - 1), 1.2, Math.sin(a0) * (RING - 1), Math.cos(a0) * (RING + 1), 1.2, Math.sin(a0) * (RING + 1), 1, 0.4, 0.05, 0.05, 1);
    }
    // the two detectors, opposite each other on the ring: a barrel round the beam line each, lit by its collisions
    const nb = (t - this.tb0) / this.per; // beats into the plate, continuous
    const Y = 1.2;
    for (const side of [1, -1]) {
      const last = Math.floor(nb) - (((Math.floor(nb) % 2) + 2) % 2 === (side > 0 ? 0 : 1) ? 0 : 1); // this detector's last crossing
      const lit = 0.35 + 1.6 * Math.exp(-Math.max(0, nb - last) * this.per / 0.25);
      const col = LIN.cold, cx0 = side * RING, R = 2.3, HL = 2.6;
      for (let i = 0; i < 28; i++) {
        const b0 = (i / 28) * Math.PI * 2, b1 = ((i + 1) / 28) * Math.PI * 2;
        for (const z of [-HL, 0, HL]) L.seg(cx0 + Math.cos(b0) * R, Y + Math.sin(b0) * R, z, cx0 + Math.cos(b1) * R, Y + Math.sin(b1) * R, z, 1.6, col[0] * lit, col[1] * lit, col[2] * lit, 1);
        if (i % 4 === 0) L.seg(cx0 + Math.cos(b0) * R, Y + Math.sin(b0) * R, -HL, cx0 + Math.cos(b0) * R, Y + Math.sin(b0) * R, HL, 1.2, col[0] * lit, col[1] * lit, col[2] * lit, 1);
      }
    }
    // the beams: two bunches, one each way round, each in its own pipe; they cross every beat (half a lap each)
    const th = Math.PI * nb;
    for (const dir of [1, -1]) {
      const r = RING + dir * 0.25, col = dir > 0 ? LIN.bone : LIN.ember;
      for (let k = 0; k < 16; k++) {
        const a0 = dir * (th - k * 0.018), a1 = dir * (th - (k + 1) * 0.018);
        const g = (1 - k / 16) * 7;
        L.seg(Math.cos(a0) * r, Y, Math.sin(a0) * r, Math.cos(a1) * r, Y, Math.sin(a1) * r, 4.5 - k * 0.2, col[0] * g, col[1] * g, col[2] * g, 1);
      }
    }
    // the collisions: from each crossing a burst of tracks, curving in the detector's field, gone in a beat and a half
    const LIFE = 1.6 * this.per;
    for (let k = Math.max(0, Math.floor(nb) - 1); k <= Math.floor(nb); k++) {
      const age = (nb - k) * this.per;
      if (age < 0 || age > LIFE) continue;
      const vx = (k % 2 ? -1 : 1) * RING; // the vertex: the beam line runs along z here
      const grow = 1 - Math.exp(-age / 0.09), fade = Math.pow(1 - age / LIFE, 2);
      for (let j = 0; j < 46; j++) {
        const phi = hash(k, j, 1) * Math.PI * 2, eta = (hash(k, j, 2) - 0.5) * 2.4, curv = (hash(k, j, 3) - 0.5) * 0.55;
        const len = (3 + 10 * hash(k, j, 4) ** 2) * grow, hot = hash(k, j, 5);
        const col = hot < 0.2 ? LIN.crimson : hot < 0.6 ? LIN.ember : LIN.bone, g = fade * (hot < 0.2 ? 4.5 : 2.4);
        let px = vx, py = Y, pz = 0;
        const M = 9, ds = len / M;
        for (let i = 1; i <= M; i++) {
          const ang = phi + curv * ds * i;
          const nx = px + Math.cos(ang) * ds, ny = py + Math.sin(ang) * ds, nz = pz + eta * ds;
          L.seg(px, py, pz, nx, ny, nz, 2.4 * (1 - 0.6 * i / M), col[0] * g, col[1] * g, col[2] * g, 1);
          px = nx; py = ny; pz = nz;
        }
      }
      // the flash at the vertex
      const fl = Math.exp(-age / 0.06);
      if (fl > 0.02) for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2 + k;
        L.seg(vx, Y, 0, vx + Math.cos(a) * 1.5 * fl, Y + Math.sin(a) * 1.5 * fl, 0, 2.5, 5 * fl, 4.3 * fl, 3.6 * fl, 1);
      }
    }
    L.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    const bt = this.B.t(this.B.at(t));
    c.font = font(F.archivo(125, 900), 150);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('bone', 0.9);
    (c as any).letterSpacing = '30px';
    c.fillText('SERN', 120, 250);
    (c as any).letterSpacing = '0px';
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    void lerp; void ease; void prog; void end;
    return { shake: shakeAt(t, 5 * pulse(t, bt, 0.06)), bloom: 0.75, bloomThreshold: 0.6, vignette: 0.45 };
  }
}
