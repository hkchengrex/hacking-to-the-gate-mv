// The divergence meter as a 3D object, ported from the fast preview of hkchengrex/divergent-meter-renderer
// (web/src/renderer.js, commit 0da42c9): the same numeral wire paths, glass profile, cathode depth order,
// dot position and tube construction (nixie-geometry.json is that repo's nixie_renderer/data/geometry.json).
// Coordinates are the renderer's: Z up, tubes along X, centred on the origin, glass up to z = 2.38.
//
// Two ways to use it:
//  - meter.group is an Object3D: add it to a scene's own THREE.Scene (it is lit by its cathodes'
//    point lights, so it also lights what is around it);
//  - meter.render(renderer, out, camera) draws it alone (4x MSAA, its wires are hairlines) and adds the
//    result onto `out`: for plates where the meter floats over something else.
// Either way call meter.update(state) with Divergence.state(t) first: digits, per-tube brightness,
// the phosphor flare.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import G from './nixie-geometry.json';
import { LIN } from './palette';
import type { MeterState } from './meter';
import { TUBES } from './meter';
import { PW, PH, type Compositor } from './gl';

const CHARS = '0123456789.';

const tube = (points: number[][], radius: number) => {
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < points.length; i++) {
    const a = new THREE.Vector3(...(points[i - 1] as [number, number, number]));
    const b = new THREE.Vector3(...(points[i] as [number, number, number]));
    if (a.distanceToSquared(b) > 1e-12) path.add(new THREE.LineCurve3(a, b));
  }
  return new THREE.TubeGeometry(path, Math.max(points.length * 2, 12), radius, 6, false);
};
const merge = (gs: THREE.BufferGeometry[]) => { const r = mergeGeometries(gs)!; gs.forEach((g) => g.dispose()); return r; };
const circle = (r: number, z: number) => Array.from({ length: 97 }, (_, i) => [r * Math.cos((i * Math.PI) / 48), r * Math.sin((i * Math.PI) / 48), z]);

/** Shared geometry of one tube (as in the renderer's createGeometry). */
function tubeGeometry() {
  const wires: THREE.BufferGeometry[] = [];
  const active: Record<string, THREE.BufferGeometry> = {};
  for (const [d, paths] of Object.entries(G.glyphs as Record<string, number[][][]>)) {
    const y = G.layer_start + Number(d) * G.layer_step;
    const glow: THREE.BufferGeometry[] = [];
    for (const path of paths) {
      const pts = path.map(([x, z]) => [x!, y, z! + G.digit_center]);
      wires.push(tube(pts, G.wire_radius));
      glow.push(tube(pts, G.glow_radius));
    }
    active[d] = merge(glow);
    const [x, z] = paths[0]![0]!;
    wires.push(tube([[x!, y, G.digit_center + z!], [x!, y, 0.48]], 0.0035));
  }
  const [dx, dy, dz] = G.dot as [number, number, number];
  wires.push(tube([[dx, dy, 0.45], [dx, dy, dz]], 0.008));
  const dot = new THREE.SphereGeometry(G.dot_radius, 20, 12); dot.translate(dx, dy, dz); wires.push(dot);
  active['.'] = new THREE.SphereGeometry(G.dot_glow_radius, 20, 12); active['.'].translate(dx, dy, dz);
  for (const z of [0.64, 1.94]) wires.push(tube([[-0.29, 0.2, z], [0.29, 0.2, z]], 0.009));
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const x = 0.32 * Math.cos(Math.PI * t), y = 0.32 * Math.sin(Math.PI * t);
    wires.push(tube([[x, y, 0.62], [x, y, 1.99]], 0.0035));
  }
  const support = merge([-0.29, 0.29].map((x) => tube([[x, 0.2, 0.46], [x, 0.2, 1.98]], 0.01)));
  const glass = new THREE.LatheGeometry((G.profile as number[][]).map(([r, z]) => new THREE.Vector2(r, z)), 80); glass.rotateX(Math.PI / 2);
  const cyl = (r: number, h: number, z: number) => { const g = new THREE.CylinderGeometry(r, r, h, 64); g.rotateX(Math.PI / 2); g.translate(0, 0, z); return g; };
  return {
    active, wires: merge(wires), support, glass,
    socket: cyl(0.415, 0.24, 0.29), rim: cyl(0.392, 0.028, 0.425), band: cyl(0.419, 0.018, 0.193),
    grooves: merge([0.245, 0.27, 0.295].map((z) => tube(circle(0.416, z), 0.003))),
  };
}

export interface Meter3DOptions {
  /** Cathode emission (HDR). The renderer's default is 18; our bloom starts lower. */
  brightness?: number;
  /**
   * Scale of the meter in its scene (the group's scale): the cathode lights' range and intensity follow
   * it, so a meter shrunk onto a shelf lights its surroundings like a small object (1 = the renderer's units).
   */
  scale?: number;
}

export class Meter3D {
  group = new THREE.Group();
  /** Width of the meter along X (in its own units; times `scale` in the scene), for framing. */
  width: number;
  private gas: THREE.MeshStandardMaterial[] = [];
  private glyphs: Record<string, THREE.Mesh>[] = [];
  private lights: THREE.PointLight[][] = [];
  private brightness: number;
  private scale: number;
  // standalone rendering
  private scene = new THREE.Scene(); // (black background: the glass's transmission pass refracts it)
  private rt: THREE.WebGLRenderTarget | null = null;

  constructor(o: Meter3DOptions = {}) {
    this.brightness = o.brightness ?? 9;
    this.scale = o.scale ?? 1;
    this.group.scale.setScalar(this.scale);
    this.scene.background = new THREE.Color(0);
    const g = tubeGeometry();
    const std = (rgb: number[], metalness: number, roughness: number) =>
      new THREE.MeshStandardMaterial({ color: new THREE.Color(...(rgb as [number, number, number])), metalness, roughness });
    const m = {
      wire: std([0.19, 0.22, 0.24], 0.85, 0.28),
      base: std([0.012, 0.015, 0.019], 0.4, 0.16),
      metal: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.018, 0.022, 0.028), metalness: 0.7, roughness: 0.17, clearcoat: 0.65, clearcoatRoughness: 0.09 }),
      brass: std([0.48, 0.32, 0.14], 0.88, 0.2),
      pins: std([0.3, 0.23, 0.13], 0.8, 0.26),
      // (the renderer's preview mapping: glass roughness x 0.35, specular x 2)
      glass: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.94, 0.98, 1), transmission: 1, thickness: 0.0012, ior: 1.46, roughness: 0.085 * 0.35, specularIntensity: 0.44, side: THREE.DoubleSide, depthWrite: false }),
    };
    const add = (geom: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => { const o = new THREE.Mesh(geom, mat); parent.add(o); return o; };
    for (let i = 0; i < TUBES; i++) {
      const t = new THREE.Group();
      t.position.x = (i - (TUBES - 1) / 2) * G.pitch;
      this.group.add(t);
      for (const [geom, mat] of [[g.wires, m.wire], [g.support, m.pins], [g.socket, m.base], [g.rim, m.brass], [g.band, m.brass], [g.grooves, m.metal]] as const) add(geom, mat, t);
      const gas = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(...LIN.nixie), emissiveIntensity: this.brightness });
      this.gas.push(gas);
      const gl: Record<string, THREE.Mesh> = {};
      for (const ch of CHARS) { gl[ch] = add(g.active[ch]!, gas, t); gl[ch].visible = false; }
      this.glyphs.push(gl);
      add(g.glass, m.glass, t).renderOrder = 1;
      // light scattered from the cathodes (the renderer's approximation): two points per tube
      const ls: THREE.PointLight[] = [];
      for (const off of [-0.25, 0.25]) {
        const l = new THREE.PointLight(new THREE.Color(...LIN.nixie), 0, 3 * this.scale, 2);
        l.position.set(0, -0.08, G.digit_center + off);
        t.add(l);
        ls.push(l);
      }
      this.lights.push(ls);
    }
    this.width = TUBES * G.pitch + 0.3;
    const box = (size: [number, number, number], z: number, mat: THREE.Material, r: number) => { const o = add(new RoundedBoxGeometry(...size, 3, r), mat, this.group); o.position.z = z; };
    box([this.width, 1.05, 0.27], 0.045, m.metal, 0.05);
    box([this.width + 0.008, 1.058, 0.018], -0.055, m.brass, 0.008);
    box([this.width - 0.16, 0.93, 0.028], 0.184, m.base, 0.013);
    for (const x of [-this.width / 2 + 0.16, this.width / 2 - 0.16]) for (const y of [-0.37, 0.37]) {
      const geom = new THREE.CylinderGeometry(0.038, 0.038, 0.018, 24); geom.rotateX(Math.PI / 2);
      add(geom, m.pins, this.group).position.set(x, y, 0.192);
    }
  }

  /** Show a meter state: one lit character per tube, its brightness, nixie → phosphor on the landing. */
  update(st: MeterState) {
    const col = new THREE.Color(...LIN.nixie).lerp(new THREE.Color(...LIN.phosphor), st.phosphor);
    for (let i = 0; i < TUBES; i++) {
      const ch = st.text[i] ?? ' ';
      const b = st.lit[i] ?? 0;
      for (const c of CHARS) this.glyphs[i]![c]!.visible = c === ch && b > 0;
      this.gas[i]!.emissive.copy(col);
      this.gas[i]!.emissiveIntensity = this.brightness * b * (1 + 0.6 * st.phosphor);
      for (const l of this.lights[i]!) {
        l.color.copy(col);
        // (light levels of the renderer's default brightness, 18, whatever the emission is set to)
        l.intensity = ch === ' ' ? 0 : 18 * b * (ch === '.' ? 0.0006 : 0.014) * (1 + 0.6 * st.phosphor) * this.scale * this.scale;
        l.position.x = ch === '.' ? G.dot[0]! : 0;
      }
    }
  }

  /**
   * This meter's own camera, moved to `pos` looking at `target` (Z up). Use it for cameras that change
   * every frame: three.js keeps a transmission render target (the glass) per camera, so a new camera
   * per frame (Meter3D.camera) leaks a texture per frame until the GPU runs out of memory.
   */
  view(pos: [number, number, number], target: [number, number, number] = [0, 0, 1.13], fov = 22) {
    const cam = this.viewCam;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(...pos);
    cam.lookAt(...target);
    cam.updateMatrixWorld();
    return cam;
  }
  private viewCam = Meter3D.camera();

  /** A new camera in the meter's frame (Z up), looking at the tubes' centre from `pos` (for a fixed shot; see view()). */
  static camera(pos: [number, number, number] = [0, -15, 4.65], target: [number, number, number] = [0, 0, 1.13], fov = 22) {
    const cam = new THREE.PerspectiveCamera(fov, PW / PH, 0.01, 1000);
    cam.up.set(0, 0, 1);
    cam.position.set(...pos);
    cam.lookAt(...target);
    return cam;
  }

  /** Render the meter alone (4x MSAA) and add it onto `out`. */
  render(renderer: THREE.WebGLRenderer, comp: Compositor, out: THREE.WebGLRenderTarget, camera: THREE.Camera, o: { opacity?: number } = {}) {
    if (!this.rt) this.rt = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    if (this.group.parent !== this.scene) this.scene.add(this.group);
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, camera);
    comp.draw(renderer, this.rt.texture, out, { mode: 'add', opacity: o.opacity ?? 1, premult: false });
  }

  dispose() { this.rt?.dispose(); }
}
