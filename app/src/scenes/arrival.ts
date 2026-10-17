// `arrival` — #01 始まりと終わりのプロローグ (Steins;Gate), the solo's third plate (docs/DESIGN.md). 2010.07.28, the first day again: up the Radio Kaikan's stairwell. A stair, graphic rather than
// photographic: flights of treads on sloping slabs round a square open well, corner landings, a handrail and the
// treads' edges drawn in line, a cold tube on every floor, and warm light at the top, where the door on the 8th
// floor stands open (a doorway of light, like the gate). The camera rises up the middle of the well, looking up
// and turning slowly, and levels off before the door; his light corkscrews up the flights ahead of it, its
// thread left winding round the well. The floor number and the clock count up and lock.
import * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { Layer2D, makeRT, W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, frameIdx, hash, lerp } from '../engine/util';
import { Plate, monoText } from './_kit';
import { Lights } from './_sky';

/** The stair: floor height, steps per flight (four flights a floor), a step's going, a flight's width; and so the well, the corner landings' centres, the walls. */
const FLOOR = 3.6, NS = 9, GO = 0.3, WF = 1.2, RISE = FLOOR / 4 / NS, WELL = NS * GO, MID = WELL / 2 + WF / 2, HS = WELL / 2 + WF;
const FLIGHTS = 28, TOP = (FLIGHTS / 4) * FLOOR; // up to the 8th floor's landing
/** Flight n runs along side n % 4 of the well, anticlockwise from above: a point `along` it (from -WELL/2 to WELL/2), `out` from the well's edge. */
function onSide(s: number, along: number, out: number): [number, number] {
  const r = WELL / 2 + out;
  return s === 0 ? [along, r] : s === 1 ? [r, -along] : s === 2 ? [-along, -r] : [-r, along];
}
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Arrival extends Plate {
  rt = makeRT(W, H, { samples: 4 });
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(72, W / H, 0.05, 200);
  lines = new LineBatch(9000, { screen2D: false, blend: 'add', depthTest: true });
  thread = new LineBatch(2500, { screen2D: false, blend: 'add', depthTest: true });
  lights = new Lights(4);
  L = new Layer2D();
  door = new THREE.Vector3(-MID, TOP + 1.05, HS - 0.02);

  constructor(ctx: SceneCtx) {
    super(ctx);
    const concrete = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.215, 0.25), roughness: 0.9, metalness: 0, flatShading: true });
    const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.075, 0.082, 0.105), roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    // treads; the sloping slab under each flight; the corner landings
    const treads = new THREE.InstancedMesh(new THREE.BoxGeometry(GO + 0.03, 0.05, WF), concrete, FLIGHTS * NS);
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(Math.hypot(WELL, FLOOR / 4), 0.07, WF), concrete, FLIGHTS);
    const landings = new THREE.InstancedMesh(new THREE.BoxGeometry(WF, 0.09, WF), concrete, FLIGHTS + 1);
    const pitch = Math.atan2(FLOOR / 4, WELL);
    for (let n = 0; n < FLIGHTS; n++) {
      const s = n % 4, y0 = (n * FLOOR) / 4, turn = new THREE.Quaternion().setFromAxisAngle(Y, (-s * Math.PI) / 2);
      for (let j = 0; j < NS; j++) {
        const [x, z] = onSide(s, -WELL / 2 + (j + 0.5) * GO, WF / 2);
        treads.setMatrixAt(n * NS + j, m.compose(new THREE.Vector3(x, y0 + (j + 1) * RISE - 0.025, z), turn, one));
      }
      const [sx, sz] = onSide(s, 0, WF / 2);
      q.copy(turn).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
      slabs.setMatrixAt(n, m.compose(new THREE.Vector3(sx, y0 + FLOOR / 8 - 0.02, sz), q, one));
      const [lx, lz] = onSide(s, WELL / 2 + WF / 2, WF / 2); // the landing this flight arrives on
      landings.setMatrixAt(n + 1, m.compose(new THREE.Vector3(lx, y0 + FLOOR / 4 - 0.045, lz), new THREE.Quaternion(), one));
    }
    landings.setMatrixAt(0, m.compose(new THREE.Vector3(-MID, -0.045, MID), new THREE.Quaternion(), one));
    // the walls, the floor of the well, the ceiling
    const H0 = -3, H1 = TOP + 3.3;
    for (let s = 0; s < 4; s++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * HS, H1 - H0), wall);
      const [x, z] = onSide(s, 0, WF);
      p.position.set(x, (H0 + H1) / 2, z);
      p.lookAt(0, (H0 + H1) / 2, 0);
      this.scene.add(p);
    }
    const cap = (y: number) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * HS, 2 * HS), wall); p.rotation.x = Math.PI / 2; p.position.y = y; this.scene.add(p); };
    cap(H0); cap(H1);
    // a cold tube on every floor; the lamp over the well and the open door on the 8th, warm
    const tubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(...LIN.cold).multiplyScalar(5) }), 8);
    for (let k = 0; k < 8; k++) {
      const y = k * FLOOR + 2.7;
      tubes.setMatrixAt(k, m.compose(new THREE.Vector3(HS - 0.06, y, 0), new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2), one));
      const l = new THREE.PointLight(new THREE.Color(...LIN.cold), 12, 10, 2);
      l.position.set(HS - 0.5, y - 0.2, 0);
      this.scene.add(l);
    }
    const warm = new THREE.Color(1, 0.8, 0.56);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), new THREE.MeshBasicMaterial({ color: warm.clone().multiplyScalar(2.4), side: THREE.DoubleSide }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, H1 - 0.03, 0);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshBasicMaterial({ color: warm.clone().multiplyScalar(3.2), side: THREE.DoubleSide }));
    doorway.position.copy(this.door);
    const top = new THREE.PointLight(warm, 70, 60, 2);
    top.position.set(0, H1 - 0.8, 0);
    const atDoor = new THREE.PointLight(warm, 10, 12, 2);
    atDoor.position.set(this.door.x, this.door.y, this.door.z - 0.7);
    this.scene.add(treads, slabs, landings, tubes, lamp, doorway, top, atDoor, new THREE.HemisphereLight(0x6a7ea6, 0x39425a, 1.5));
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0.02, 0.024, 0.036), 0.03);
  }

  /** His light after n flights (it climbs just inside the handrail, round and round), and at the end before the door. */
  private himAt(n: number) {
    const a = (135 - 90 * n) * (Math.PI / 180), RH = WELL / 2 + 0.3, k = smoother(clamp(n - (FLIGHTS - 0.6), 0, 1) / 1);
    return new THREE.Vector3(lerp(RH * Math.cos(a), this.door.x, k), lerp((n * FLOOR) / 4 + 1.05, TOP + 1.15, k), lerp(RH * Math.sin(a), this.door.z - 1.0, k));
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, start, end } = this.ctx;
    const u = clamp((t - start) / (end - start - 0.45)), e = smoother(u);
    // the camera: up the middle of the well, looking up and turning slowly; near the top it levels off, facing the door
    const eye = lerp(1.3, TOP + 1.55, e), lvl = smoother(clamp((u - 0.74) / 0.26));
    const yawEnd = Math.atan2(this.door.z - 0.4, this.door.x + 0.2), yaw = yawEnd - 2 * Math.PI * 1.15 * (1 - e), pit = lerp(1.2, -0.05, lvl);
    const wob = 0.32 * (1 - lvl);
    this.cam.position.set(wob * Math.cos(yaw * 0.6 + 1) - 0.2 * lvl, eye, wob * Math.sin(yaw * 0.6 + 1) + 0.4 * lvl);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(this.cam.position.x + Math.cos(pit) * Math.cos(yaw), eye + Math.sin(pit), this.cam.position.z + Math.cos(pit) * Math.sin(yaw));
    this.cam.updateMatrixWorld();

    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(new THREE.Color(0.02, 0.024, 0.036), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);

    // in line: every tread's edge, the handrail and its balusters, a band round the walls at every floor
    const L = this.lines;
    L.clear();
    const bone = LIN.bone;
    for (let n = 0; n < FLIGHTS; n++) {
      const s = n % 4, y0 = (n * FLOOR) / 4;
      if (Math.abs(y0 - eye) > 13) continue;
      const dim = Math.exp(-Math.abs(y0 + 0.45 - eye) * 0.16);
      for (let j = 0; j < NS; j++) {
        const al = -WELL / 2 + j * GO, y = y0 + (j + 1) * RISE + 0.004;
        const [x0, z0] = onSide(s, al, 0), [x1, z1] = onSide(s, al, WF);
        L.seg(x0, y, z0, x1, y, z1, 1.6, bone[0] * 0.75 * dim, bone[1] * 0.75 * dim, bone[2] * 0.75 * dim, 1);
        const [bx, bz] = onSide(s, al + GO / 2, 0.03);
        L.seg(bx, y, bz, bx, y0 + ((j + 0.5) / NS) * (FLOOR / 4) + 0.95, bz, 1, bone[0] * 0.3 * dim, bone[1] * 0.3 * dim, bone[2] * 0.3 * dim, 1);
      }
      const [hx0, hz0] = onSide(s, -WELL / 2, 0.03), [hx1, hz1] = onSide(s, WELL / 2, 0.03);
      L.seg(hx0, y0 + 0.95, hz0, hx1, y0 + FLOOR / 4 + 0.95, hz1, 2.4, bone[0] * 1.5 * dim, bone[1] * 1.5 * dim, bone[2] * 1.5 * dim, 1);
      L.seg(hx1, y0 + FLOOR / 4 + 0.95, hz1, hx1, y0 + FLOOR / 4 + 0.02, hz1, 1.6, bone[0] * 0.8 * dim, bone[1] * 0.8 * dim, bone[2] * 0.8 * dim, 1);
      L.seg(hx0, y0 - 0.06, hz0, hx1, y0 + FLOOR / 4 - 0.06, hz1, 1.8, bone[0] * 0.9 * dim, bone[1] * 0.9 * dim, bone[2] * 0.9 * dim, 1); // (the slab's edge)
    }
    for (let k = 0; k <= 8; k++) for (let s = 0; s < 4; s++) {
      const y = k * FLOOR, [x0, z0] = onSide(s, -HS, WF - 0.01), [x1, z1] = onSide(s, HS, WF - 0.01), g = 0.5 * Math.exp(-Math.abs(y - eye) * 0.14);
      L.seg(x0, y, z0, x1, y, z1, 1.4, LIN.cold[0] * g, LIN.cold[1] * g, LIN.cold[2] * g, 1);
    }
    L.render(renderer, this.rt, this.cam);

    // his light, a flight and a half ahead of us, and its thread, winding back down the well
    const nCam = Math.min(FLIGHTS, ((eye - 1.3) / (TOP + 0.25)) * FLIGHTS), nHim = Math.min(FLIGHTS + 0.4, nCam + 1.7);
    const T = this.thread;
    T.clear();
    let prev = this.himAt(nHim);
    for (let i = 1; i <= 420; i++) {
      const n = nHim - i * 0.045;
      if (n < -1) break;
      const p = this.himAt(n), g = 2.4 * Math.exp(-i * 0.008);
      T.seg(prev.x, prev.y, prev.z, p.x, p.y, p.z, 2.2, bone[0] * g, bone[1] * g, bone[2] * g, 1);
      prev = p;
    }
    T.render(renderer, this.rt, this.cam);
    this.lights.clear();
    this.lights.add(this.himAt(nHim), bone, 0.3, 1, 1);
    this.lights.render(renderer, this.rt, this.cam);
    comp.draw(renderer, this.rt.texture, out, { mode: 'replace' });

    // the floor number, and the clock locking
    const c = this.L.ctx;
    this.L.clear();
    const floor = clamp(Math.floor((eye - 1.3 + 0.4) / FLOOR) + 1, 1, 8);
    c.fillStyle = rgba(floor === 8 ? 'ember' : 'bone');
    c.textBaseline = 'alphabetic';
    monoText(c, `${floor}F`, 1800, 170, 90, 600, 'right');
    const ss = u >= 0.98 ? '50' : String(Math.floor(hash(frameIdx(t), 2) * 60)).padStart(2, '0');
    c.fillStyle = rgba('bone');
    monoText(c, `2010.07.28 11:${ss}`, 120, 150, 40, 600);
    comp.draw(renderer, this.L.upload(), out);
    return { bloom: 0.65, vignette: 0.4 };
  }
}
