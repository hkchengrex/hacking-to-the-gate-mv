// `farce` — #04 空理彷徨のランデヴー, あなたには 退屈しのぎに足らぬ滑稽 (Act II; docs/DESIGN.md). The rendezvous that never comes off, and how it looks from far enough away. His light wanders
// round hers (crimson, still): in close, out again, round the other way, never arriving, its thread piling up into a
// tangle about her. That is all there is, and from the start we are drawing back from it, ten times further every
// few beats (magnitude's zoom, in β): the tangle is a knot, a speck, one speck among thousands, each of them somebody's
// whole to-do. Along the bottom the scale slides in, decade by decade; her world line's reading stays beside her. One smooth move; nothing jolts.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { LineBatch } from '../engine/lines';
import { clamp, hash, noise1 } from '../engine/util';
import { Plate, lyricRail, monoText } from './_kit';
import { Dark, Lights } from './_sky';

const FOV = 34;
/** How long he has been at it when we come in (s). */
const PAST = 26;

/** Where his light is, s seconds into its wandering: round her (at the origin), nearer and further, this way and that. */
function wander(s: number, out: THREE.Vector3) {
  const r = 0.75 + 2.7 * Math.pow(0.5 + 0.5 * noise1(s * 0.55, 1), 1.3) + 0.5 * noise1(s * 2.1, 5);
  const th = 3.6 * s + 2.4 * noise1(s * 0.45, 2), ph = 1.25 * noise1(s * 0.5, 3) + 0.35 * Math.sin(s * 1.9);
  return out.set(r * Math.cos(th) * Math.cos(ph), r * Math.sin(ph), r * Math.sin(th) * Math.cos(ph));
}

export default class Farce extends Plate {
  dark = new Dark();
  lines = new LineBatch(14000, { screen2D: false, blend: 'add' });
  lights = new Lights(4);
  cam = new THREE.PerspectiveCamera(FOV, PW / PH, 0.1, 60000);
  L = new Layer2D();
  b0 = 0; tb0 = 0; per = 0.4;

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const lt = t - this.tb0, nb = lt / this.per;

    // the camera: on the two of them and his to-do for the first bars, drawing back a little; then back, and back,
    // ten times as far every four beats or so
    const D = 6 * Math.exp(0.07 * nb + 0.56 * 1.2 * Math.log(1 + Math.exp((nb - 7.5) / 1.2)));
    const az = 0.5 + 0.16 * lt;
    this.cam.position.set(D * Math.sin(az) * 0.92, D * 0.38, D * Math.cos(az) * 0.92);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateMatrixWorld();
    this.dark.render(renderer, out, [0.0012, 0.0016, 0.0026]);
    const pxPerUnit = H / 2 / (D * Math.tan((FOV * Math.PI) / 360)); // (at her distance)

    const L = this.lines;
    L.clear();
    // everybody else: specks, thousands of them, out to where we end up
    for (let i = 0; i < 2600; i++) {
      const r = 30 * Math.pow(5000 / 30, hash(i, 1)), a = hash(i, 2) * Math.PI * 2, y = (hash(i, 3) * 2 - 1);
      const s = Math.sqrt(1 - y * y), x = r * s * Math.cos(a), yy = r * y, z = r * s * Math.sin(a);
      const d = Math.hypot(x - this.cam.position.x, yy - this.cam.position.y, z - this.cam.position.z);
      const px = 0.5 * pxPerUnit * (D / d) * 6; // (a to-do some 6 across, like ours)
      const g = clamp(1.6 - d / (D * 3)) * (0.35 + 0.65 * hash(i, 4)) * clamp(D / 40);
      if (g < 0.02) continue;
      const col = hash(i, 5) < 0.3 ? LIN.crimson : LIN.cold, k = g * (col === LIN.crimson ? 2.2 : 1);
      L.seg(x, yy, z, x, yy + r * 1e-5, z, clamp(px, 1.1, 5), col[0] * k, col[1] * k, col[2] * k, 1);
    }
    // his thread: all of his wandering so far, the newest part brightest
    const p = wander(lt + PAST, new THREE.Vector3()), q = new THREE.Vector3();
    const far = clamp(1.6 - D / 240); // (from far off the tangle is only a speck: let it go dim, not flare)
    const N = 4200;
    for (let i = 1; i <= N; i++) {
      const age = (lt + PAST) * Math.pow(i / N, 1.6);
      wander(lt + PAST - age, q);
      const g = (0.3 + 1.6 * Math.exp(-age / 0.45)) * (0.25 + 0.75 * far);
      L.seg(p.x, p.y, p.z, q.x, q.y, q.z, 1.5, LIN.bone[0] * g * 0.86, LIN.bone[1] * g * 0.93, LIN.bone[2] * g * 1.06, 1);
      p.copy(q);
    }
    L.render(renderer, out, this.cam);

    this.lights.clear();
    const grow = Math.max(1, 0.012 * D); // (lights keep a least size on screen as we go)
    this.lights.add(new THREE.Vector3(0, 0, 0), LIN.crimson, 0.5 * grow, 2.4, 0.5);
    this.lights.add(wander(lt + PAST, new THREE.Vector3()), LIN.bone, 0.36 * Math.max(1, 0.006 * D), 1 * (0.3 + 0.7 * far), 1);
    this.lights.render(renderer, out, this.cam);

    const c = this.L.ctx;
    this.L.clear();
    // the scale: a hairline along the bottom, a tick at every decade out from her, sliding in as we draw back
    const y = 860, x0 = W / 2;
    c.fillStyle = rgba('ash', 0.55);
    c.fillRect(120, y, W - 480, 2);
    c.font = font(F.mono(500), 17);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    for (let e = -1; e <= 5; e++) for (const side of [-1, 1]) {
      const x = x0 + side * Math.pow(10, e) * pxPerUnit;
      if (x < 120 || x > W - 360) continue;
      const a = clamp((Math.abs(x - x0) - 26) / 60) * clamp((x - 120) / 80) * clamp((W - 360 - x) / 80);
      c.fillStyle = rgba('ash', 0.7 * a);
      c.fillRect(x - 1, y - 14, 2, 30);
      if (side > 0) c.fillText(`10^${e}`, x, y + 44);
    }
    c.fillStyle = rgba('crimson', 0.8);
    c.fillRect(x0 - 1, y - 20, 2, 42);
    // her world line's reading, by her
    c.fillStyle = rgba('crimson', 0.9);
    monoText(c, '1.130426', x0, H / 2 + 74, 20, 500, 'center');
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.5, bloom: 0.55 };
  }
}
