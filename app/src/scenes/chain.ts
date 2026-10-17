// `chain` — #15 亡環上のネクローシス, Missing Link Necrosis (Act II, the interlude after the pond; docs/DESIGN.md). The attractor field: chains, each a world line, all taut, running top left to bottom right
// and on beyond the frame, hundreds of them as far as the eye can see, fading into the haze. They are drawn in light: every link a thin glowing loop of thread, the main chain bright, the rest cold and dim. Along a world line, left to right is time, and every chain is moving: each slides
// along its length at its own speed, time flowing at a different rate on every world line. From her death (the
// missing link on the main chain, 07.28 12:39) a burning crimson front creeps back through time across every world
// line, and the links flow into it: behind it the light is dead, a broken dull red with embers cooling in it. The attempts:
// the camera rides one world line (carried along with it, a little faster), then leaps to another (a time leap:
// across, and back), and the attempt counter ticks; one attempt a bar, each one carried closer to the front, each
// shot from a different side (in front, macro; below; along the chain; above). The fifth attempt is the main chain:
// the leap goes through the fire onto it and we come onto the missing link, a crimson dashed ghost; then wide.
// In the last bar the embers cool, and on the downbeat into verse 2 the ghost link flickers out. Everything moves
// smoothly; nothing jolts on the beat.
import * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { clamp, ease, hash, lerp, prog } from '../engine/util';
import { Plate, monoText } from './_kit';

type V3 = [number, number, number];
/** The main chain's line: through these, top left to bottom right; every chain runs from X0 to X1, beyond the haze. */
const A: V3 = [-40, 2.6, 0], B: V3 = [40, -2.4, 0];
const X0 = -80, X1 = 140;
/**
 * A link: half its straight part, the radius of its ends, how far one reaches into the next (centreline units), and
 * the pitch. The wire is a thread of light, thinnest where the camera comes close: WIRE by level of detail.
 */
const LS = 0.15, LR = 0.14, LT = 0.012, PITCH = 2 * (LS + LR) - 2 * LT;
const WIRE = [0.0045, 0.009, 0.02], WIRE_MAIN = 0.006;
const FOV = 35;
const DIR = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).normalize(); // along every chain, nearly
const UP = new THREE.Vector3(-DIR.y, DIR.x, 0); // across it, upward
const FRONT = new THREE.Vector3(0, 0, 1); // across it, toward the front
const lineAt = (x: number) => new THREE.Vector3(...A).addScaledVector(DIR, (x - A[0]) / DIR.x);
/** Links within these distances of the camera's path are drawn in full, coarser, coarsest; beyond, not at all. */
const LOD = [9, 32, 105];
/** The necrosis front: where it is (x) on the plate's first beat (just short of the missing link), and how far back it creeps per beat. */
const FRONT_X0 = 1.7, FRONT_V = 0.08;
/** The main chain's speed (units/s along it): the slowest. */
const V_MAIN = 0.3;
/** How much faster than its chain the camera rides (units/s). */
const U = 0.45;
/**
 * The attempts: the world line each one rides (where it is across the main chain: up, front), its speed, where the
 * camera is on it (x) at the start of its bar, and its divergence. The fifth is the main chain itself. (Placed so
 * that no leap passes within 2.7 of another attempt's chain; searched offline.)
 */
const RIDES = [
  { y: -2.4, z: -9.9, v: 1.4, x: -12, value: '0.571024' },
  { y: 2.0, z: -8.7, v: 2.2, x: -11, value: '0.523299' },
  { y: -2.1, z: -5.8, v: 0.8, x: -9, value: '0.456903' },
  { y: -5.5, z: -3.8, v: 2.8, x: -8, value: '0.337187' },
  { y: 0, z: 0, v: V_MAIN, x: 0, value: '1.130426' },
];
/** The setup each bar is shot from (attempt by attempt; the last bar stays on the main chain, wide). */
type Shot = 'side' | 'low' | 'axis' | 'top';
const SHOTS: Shot[] = ['side', 'low', 'axis', 'top', 'side', 'side'];
/** Smootherstep: speed and acceleration both ease in and out (landings settle instead of stopping short). */
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** Where a point is across the main chain: [up, front] from its line. */
function across(p: THREE.Vector3): [number, number] {
  const v = p.clone().sub(lineAt(0));
  v.addScaledVector(DIR, -v.dot(DIR));
  return [v.dot(UP), v.dot(FRONT)];
}
/** What the camera sees through on its way, across the chains: from where it is to where it looks, in a wedge. */
type Sight = [cy: number, cz: number, ty: number, tz: number];
function blocks(y: number, z: number, sights: Sight[]) {
  for (const [cy, cz, ty, tz] of sights) {
    const dy = ty - cy, dz = tz - cz, l = Math.hypot(dy, dz);
    const qy = y - cy, qz = z - cz;
    if (Math.hypot(qy, qz) < 1.1) return true; // (where the camera passes)
    if (l < 0.3) continue;
    const L = (qy * dy + qz * dz) / l, perp = Math.abs(qy * dz - qz * dy) / l;
    if (L > 0 && L < l + 0.5 && perp < 0.6 + L * Math.tan((21 * Math.PI) / 180)) return true;
  }
  return false;
}

/**
 * The world lines (all but the main chain): the ones the attempts ride, and rings round the main chain, sparser
 * further out, none where the camera passes or looks through, nor crowding the ridden ones. Each has its speed.
 */
interface WorldLine { o: THREE.Vector3; d: THREE.Vector3; roll: number; off: number; v: number }
function worldLines(sights: Sight[]): WorldLine[] {
  const R = lineAt(-6);
  const out: WorldLine[] = RIDES.slice(0, 4).map((r, i) => ({ o: R.clone().addScaledVector(UP, r.y).addScaledVector(FRONT, r.z), d: DIR.clone(), roll: hash(i, 41) * Math.PI, off: 0, v: r.v }));
  let i = 0;
  for (let r = 2.8, ring = 0; r < 100; r *= 1.2, ring++) {
    const m = Math.max(5, Math.floor((2 * Math.PI * r) / Math.max(1.9, 0.3 * r)));
    for (let j = 0; j < m; j++, i++) {
      const th = ((j + 0.8 * (hash(i, 1) - 0.5)) / m) * Math.PI * 2 + ring * 0.7;
      const rho = r * (1 + 0.24 * (hash(i, 2) - 0.5));
      const y = rho * Math.sin(th), z = rho * Math.cos(th);
      if (blocks(y, z, sights) || RIDES.slice(0, 4).some((q) => Math.hypot(q.y - y, q.z - z) < 1.6)) continue;
      const d = DIR.clone().addScaledVector(UP, (hash(i, 3) - 0.5) * 0.016).addScaledVector(FRONT, (hash(i, 4) - 0.5) * 0.016).normalize();
      out.push({ o: R.clone().addScaledVector(UP, y).addScaledVector(FRONT, z), d, roll: hash(i, 5) * Math.PI, off: hash(i, 7), v: 0.25 + 2.75 * hash(i, 8) ** 2 });
    }
  }
  return out;
}

/** The stadium-shaped centreline of a link, in its own XY plane (long axis X). */
class LinkCurve extends THREE.Curve<THREE.Vector3> {
  constructor() { super(); }
  override getPoint(u: number, out = new THREE.Vector3()) {
    const per = 4 * LS + 2 * Math.PI * LR;
    let s = u * per;
    if (s < 2 * LS) return out.set(-LS + s, -LR, 0);
    s -= 2 * LS;
    if (s < Math.PI * LR) { const a = -Math.PI / 2 + s / LR; return out.set(LS + Math.cos(a) * LR, Math.sin(a) * LR, 0); }
    s -= Math.PI * LR;
    if (s < 2 * LS) return out.set(LS - s, LR, 0);
    s -= 2 * LS;
    const a = Math.PI / 2 + s / LR;
    return out.set(-LS + Math.cos(a) * LR, Math.sin(a) * LR, 0);
  }
}

/** A link turned to lie along d, rolled about it by roll. */
function orient(d: THREE.Vector3, roll: number, q: THREE.Quaternion) {
  const zf = new THREE.Vector3(0, 0, 1).addScaledVector(d, -d.z).normalize();
  const yf = new THREE.Vector3().crossVectors(zf, d).normalize();
  q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, yf, new THREE.Vector3().crossVectors(d, yf)));
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
}

/** The necrosis: where its front is (x), how bright it burns; and the plate's time (the chains' slide, the embers). */
const necro = { nX: { value: 0 }, nGlow: { value: 1 }, nT: { value: 0 }, nCol: { value: new THREE.Color(...LIN.crimson) }, nHer: { value: new THREE.Vector3() }, nHerI: { value: 0 } };
/**
 * Light. Every link is a loop of thread that glows (no steel, no lamps): white at the wire's middle,
 * its colour at the edge, dimmer into the haze. Each link slides along its chain by its speed (aV) times the time, in
 * the vertex shader; the world lines' links come back every two links (wrap), so they slide for ever; the main
 * chain's do not (its missing link must stay put). Where the front has passed (x beyond it) the light is dead: a dull
 * blood red, broken into pieces, embers in it; the front itself burns. The breaks and the embers ride with the links
 * (chain coordinates), the front stays where it is. Her light, ahead and off the frame, reddens the links near it.
 */
function lightMaterial(color: THREE.Color, gain: number, wrap: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...necro, nWrap: { value: wrap }, uBase: { value: color }, uGain: { value: gain } },
    vertexShader: /* glsl */ `
      attribute float aV;
      uniform float nT; uniform float nWrap;
      varying vec3 vWp; varying vec3 vCp; varying vec3 vN;
      void main() {
        vec3 p = position;
        float slide = aV * nT;
        p.x += nWrap > 0.0 ? mod(slide, nWrap) : slide;
        mat4 nM = modelMatrix * instanceMatrix;
        vec4 wp = nM * vec4(p, 1.0);
        vWp = wp.xyz;
        vCp = vWp - normalize(mat3(nM) * vec3(1.0, 0.0, 0.0)) * slide;
        vN = mat3(nM) * normal;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float nX; uniform float nGlow; uniform float nT; uniform vec3 nCol; uniform vec3 nHer; uniform float nHerI;
      uniform vec3 uBase; uniform float uGain;
      varying vec3 vWp; varying vec3 vCp; varying vec3 vN;
      float nHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float nNoise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(nHash(i), nHash(i + vec3(1, 0, 0)), f.x), mix(nHash(i + vec3(0, 1, 0)), nHash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(nHash(i + vec3(0, 0, 1)), nHash(i + vec3(1, 0, 1)), f.x), mix(nHash(i + vec3(0, 1, 1)), nHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      float nFbm(vec3 p) { return 0.5 * nNoise(p) + 0.3 * nNoise(p * 2.7) + 0.2 * nNoise(p * 7.3); }
      void main() {
        vec3 toCam = cameraPosition - vWp;
        float d = length(toCam);
        // the wire: white-hot down its middle, its colour toward the edge
        float face = abs(dot(normalize(vN), toCam / d));
        vec3 live = uBase * uGain * (0.55 + 0.45 * face) + vec3(1.0, 0.96, 0.9) * uGain * 0.9 * pow(face, 6.0);
        // how far past the front (each chain a little ahead or behind, the edge ragged)
        float nd = vWp.x - nX + (nFbm(vec3(vWp.yz * 0.35, 0.0)) - 0.5) * 3.0 + (nFbm(vWp * 2.2) - 0.5) * 0.6;
        float dead = smoothstep(-0.05, 0.5, nd);
        vec3 gone = vec3(0.2, 0.022, 0.014) * (0.3 + 1.1 * nFbm(vCp * 9.0)) * smoothstep(0.38, 0.5, nFbm(vCp * 11.0 + 3.0));
        float crack = nFbm(vCp * 7.0 + vec3(0.0, nT * 0.5, 0.0));
        float edge = exp(-pow(nd / 0.3, 2.0)) * (0.25 + 2.2 * crack * crack);
        float embers = dead * smoothstep(0.62, 0.8, nFbm(vCp * 5.0 + vec3(0.0, nT * 0.4, 0.0))) * exp(-max(nd, 0.0) / 1.8);
        vec3 col = mix(live, gone, dead) + nCol * nGlow * (3.2 * edge + 1.6 * embers);
        vec3 th = nHer - vWp;
        col += nCol * nHerI * 0.9 / (1.0 + dot(th, th) * 0.45);
        gl_FragColor = vec4(col * exp(-d * 0.03), 1.0);
      }`,
  });
}

export default class Chain extends Plate {
  bg = new FSPass(/* glsl */ `
    uniform float t;
    void main() {
      vec2 p = vec2(FRAG_PX.x, ${H}.0 - FRAG_PX.y);
      // the haze the world lines fade into, a little light falling through it
      float shaft = exp(-pow((p.x - 960.0 - (p.y - 540.0) * 0.18) / 520.0, 2.0)) * (0.6 + 0.4 * (1.0 - p.y / ${H}.0));
      vec3 col = C_INK * 0.6 + C_COLD * (0.03 + 0.022 * shaft);
      fragColor = vec4(col, 1.0);
    }`, { t: { value: 0 } });
  L = new Layer2D(); // the callouts
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(FOV, PW / PH, 0.05, 160);
  rt = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
  steel = lightMaterial(new THREE.Color(...LIN.bone), 2.0, 0); // the main chain: bright
  grey = lightMaterial(new THREE.Color(0.5, 0.62, 0.8), 1.0, 2 * PITCH); // the world lines: cold
  links!: THREE.InstancedMesh;
  far: THREE.InstancedMesh[] = [];
  ghost: THREE.Mesh;
  start = lineAt(X0); // the main chain's first joint
  n = Math.floor((X1 - X0) / DIR.x / PITCH);
  b0 = 0; tb0 = 0; per = 0.4; gap = 0;

  constructor(ctx: SceneCtx) {
    super(ctx);
    const dash = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    dash.wrapS = THREE.RepeatWrapping; dash.magFilter = dash.minFilter = THREE.NearestFilter; dash.repeat.set(11, 1); dash.needsUpdate = true;
    this.ghost = new THREE.Mesh(new THREE.TubeGeometry(new LinkCurve(), 110, 0.0075, 6, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(...LIN.crimson).multiplyScalar(5), alphaMap: dash, alphaTest: 0.04, transparent: true, depthWrite: false }));
    this.scene.add(this.ghost);
  }

  /** A point on the main chain s links along (joint i at s = i), before it has slid. */
  private pointAt(s: number) { return this.start.clone().addScaledVector(DIR, PITCH * s); }
  /** The missing link's centre at t (it slides with the main chain). */
  private gapAt(t: number) { return this.pointAt(this.gap + 0.5).addScaledVector(DIR, V_MAIN * (t - this.ctx.start)); }
  /** Time of beat nb of the plate (steady: the plate's mean tempo). */
  private tAt(nb: number) { return this.tb0 + nb * this.per; }
  /**
   * Beats into the plate at t, continuous and steady: plain time at the plate's mean tempo (B.at floors to whole
   * beats, and the detected grid wobbles; either would make the camera jump or lurch on the beat).
   */
  private nbAt(t: number) { return (t - this.tb0) / this.per; }

  override async init() {
    const { start } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    this.per = (this.B.t(this.b0 + 24) - this.tb0) / 24;
    this.gap = Math.round((2 - X0) / DIR.x / PITCH - 0.5); // the link at x ≈ 2

    const q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
    const qa = orient(DIR, 0, new THREE.Quaternion()), qb = orient(DIR, Math.PI / 2, new THREE.Quaternion());
    // the main chain: taut, straight; its links turn 90° one to the next
    this.links = this.mesh(new THREE.TubeGeometry(new LinkCurve(), 72, WIRE_MAIN, 10, true), this.steel, this.n, () => V_MAIN);
    for (let k = 0; k < this.n; k++) {
      const p = this.pointAt(k + 0.5);
      q.copy(k % 2 ? qb : qa).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (hash(k, 3) - 0.5) * 0.08));
      m.compose(p, q, k === this.gap ? new THREE.Vector3(0, 0, 0) : one).toArray(this.links.instanceMatrix.array, k * 16);
    }
    this.ghost.quaternion.copy(this.gap % 2 ? qb : qa);

    // where the camera goes, and what it looks through
    const cams: THREE.Vector3[] = [], sights: Sight[] = [];
    for (let k = 0; k <= 400; k++) {
      const [p, tg] = this.camPose(lerp(start, this.ctx.end, k / 400));
      sights.push([...across(p), ...across(tg)]);
      if (k % 3 === 0) cams.push(p);
    }
    const near = (v: THREE.Vector3) => { let d = 1e9; for (const p of cams) d = Math.min(d, p.distanceToSquared(v)); return Math.sqrt(d); };

    // the world lines: their links (perfectly regular, so they can wrap), by how near the camera's path they are
    const mats: number[][] = [[], [], []], vs: number[][] = [[], [], []];
    const c = new THREE.Vector3();
    for (const w of worldLines(sights)) {
      const s1 = (X1 - w.o.x) / w.d.x;
      const q0 = orient(w.d, w.roll, new THREE.Quaternion()), q1 = orient(w.d, w.roll + Math.PI / 2, new THREE.Quaternion());
      let k = 0;
      for (let s = (X0 - w.o.x) / w.d.x + w.off * PITCH; s < s1; s += PITCH, k++) {
        c.copy(w.o).addScaledVector(w.d, s);
        const dist = near(c), lod = dist < LOD[0]! ? 0 : dist < LOD[1]! ? 1 : dist < LOD[2]! ? 2 : -1;
        if (lod < 0) continue;
        mats[lod]!.push(...m.compose(c, k % 2 ? q1 : q0, one).elements);
        vs[lod]!.push(w.v);
      }
    }
    const geos = [new THREE.TubeGeometry(new LinkCurve(), 48, WIRE[0]!, 8, true), new THREE.TubeGeometry(new LinkCurve(), 24, WIRE[1]!, 5, true), new THREE.TubeGeometry(new LinkCurve(), 12, WIRE[2]!, 3, true)];
    this.far = geos.map((g, l) => {
      const mesh = this.mesh(g, this.grey, vs[l]!.length, (i) => vs[l]![i]!);
      (mesh.instanceMatrix.array as Float32Array).set(mats[l]!);
      return mesh;
    });
  }

  /** An instanced mesh of links (static; they slide in the shader), with each link's speed. */
  private mesh(g: THREE.BufferGeometry, mat: THREE.Material, count: number, v: (i: number) => number) {
    const a = new Float32Array(count);
    for (let i = 0; i < count; i++) a[i] = v(i);
    g.setAttribute('aV', new THREE.InstancedBufferAttribute(a, 1));
    const mesh = new THREE.InstancedMesh(g, mat, count);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  /**
   * Where the camera rides on attempt i at t: carried along its world line a little faster than the line slides.
   * On the main chain (the last), it comes up to the missing link and settles just short of it.
   */
  private rider(i: number, t: number) {
    const r = RIDES[i]!;
    if (i === 4) return this.gapAt(t).addScaledVector(DIR, -0.3 - 3.6 * Math.exp(-(t - this.tAt(16)) / 1.0));
    return lineAt(r.x + (r.v * DIR.x + U) * (t - this.tAt(4 * i))).addScaledVector(UP, r.y).addScaledVector(FRONT, r.z);
  }

  /**
   * The camera at t: [position, target, up]. One attempt a bar, each shot from its own side (in front, macro;
   * below; along the chain; above; in front again, onto the missing link; wide). In the last two beats of a bar it
   * leaps to the next attempt's world line, the setup changing on the way. Close at first, pulling back, closing in.
   */
  private camPose(t: number): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
    const nb = this.nbAt(t);
    const D = nb < 8 ? lerp(1.25, 1.6, smoother(clamp(nb / 8)))
      : nb < 16 ? lerp(1.6, 7.5, smoother((nb - 8) / 8))
        : nb < 20 ? lerp(7.5, 2.6, smoother((nb - 16) / 4))
          : lerp(2.6, 4.6, smoother(clamp((nb - 20) / 4)));
    const lead = 0.25 * D;
    type Pose = [THREE.Vector3, THREE.Vector3, THREE.Vector3]; // position, target, up
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const pose = (m: Shot, F: THREE.Vector3): Pose => {
      if (m === 'top') return [V(F.x - 0.1 * D, F.y + 1.1 * D + 0.1, F.z + 0.12 * D), V(F.x + lead, F.y, F.z), V(0, 0, -1)];
      if (m === 'axis') return [V(F.x - 0.9 * D - 0.7, F.y + 0.14 * D + 0.18, F.z + 0.3 * D + 0.25), V(F.x + 2.5 + D, F.y - 0.05, F.z), V(0, 1, 0)];
      if (m === 'low') return [V(F.x - 0.15 * D, F.y - 0.6 * D - 0.05, F.z + 0.75 * D), V(F.x + lead, F.y + 0.1, F.z), V(0, 1, 0)];
      return [V(F.x - 0.15 * D, F.y + 0.18 * D + 0.05, F.z + D), V(F.x + lead, F.y, F.z), V(0, 1, 0)];
    };
    const bar = clamp(Math.floor(nb / 4), 0, SHOTS.length - 1), next = Math.min(bar + 1, SHOTS.length - 1);
    const sw = smoother(clamp((nb - (bar * 4 + 2)) / 2)); // the leap: the last two beats of a bar
    const [p0, t0, u0] = pose(SHOTS[bar]!, this.rider(Math.min(bar, 4), t));
    const [p1, t1, u1] = pose(SHOTS[next]!, this.rider(Math.min(next, 4), t));
    return [p0.lerp(p1, sw), t0.lerp(t1, sw), u0.lerp(u1, sw).normalize()];
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, end, start } = this.ctx;
    this.bg.u.t!.value = t;
    this.bg.render(renderer, out);

    // the chains slide; the necrosis front creeps back (left) through every world line; in the last bar the embers cool
    const nb = this.nbAt(t);
    const cool = ease.inOutQuad(prog(t, this.tAt(20), end));
    necro.nT.value = t - start;
    necro.nX.value = FRONT_X0 - FRONT_V * nb;
    necro.nGlow.value = 1 - 0.85 * cool;
    // the ghost of the missing link, sliding with its chain, flickering; on the downbeat into verse 2 it goes out
    const gapPos = this.gapAt(t);
    this.ghost.position.copy(gapPos);
    const out_ = prog(t, end - 0.3, end);
    (this.ghost.material as THREE.MeshBasicMaterial).opacity = (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 9)) * (hash(Math.floor(t * 20), 5) > 0.15 ? 1 : 0.2)) * (out_ > 0 && (out_ > 0.7 || hash(Math.floor(t * 30), 8) < out_ * 1.4) ? 0 : 1);

    // her: a crimson light ahead, off the frame, catching the chain more as we come, and going as the embers cool
    necro.nHer.value.set(gapPos.x + 4, gapPos.y + 1.2, 1.6);
    necro.nHerI.value = ease.inOutCubic(clamp((nb - 6) / 14)) * (1 - 0.8 * cool);

    // the camera
    const [cp, ct, cu] = this.camPose(t);
    this.cam.position.copy(cp);
    this.cam.up.copy(cu);
    this.cam.lookAt(ct);
    this.cam.updateMatrixWorld();
    const screen = (v: THREE.Vector3) => { const p = v.clone().project(this.cam); return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H, p.z] as const; };

    // the chains: rendered alone (4x MSAA) and laid over
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, this.cam);
    comp.draw(renderer, this.rt.texture, out, { mode: 'add', premult: false }); // (light: added to the haze)

    // the callouts: the world line we are riding (on a link of it just ahead as we land, sliding with it); the
    // missing link; the readout, the attempt ticking over halfway through each leap
    const c = this.L.ctx;
    this.L.clear();
    c.textBaseline = 'middle';
    RIDES.forEach((r, i) => {
      const t0 = this.tAt(4 * i - 1);
      const lp = this.rider(i, t0).addScaledVector(DIR, 0.5 + r.v * (t - t0));
      const [lx, ly, lz] = screen(lp);
      const a = (i === 0 ? 1 : clamp((nb - (4 * i - 1)) / 0.8)) * (1 - clamp((nb - (i === 4 ? 18 : 4 * i + 2)) / 1))
        * clamp((lx - 60) / 120) * clamp((W - 320 - lx) / 120) * clamp((ly - 120) / 80) * clamp((H - 140 - ly) / 80) * (lz < 1 ? 1 : 0);
      if (a <= 0.01) return;
      const ink = lp.x > necro.nX.value ? 'crimson' : 'cold';
      c.strokeStyle = rgba(ink, 0.6 * a);
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(lx + 10, ly - 10); c.lineTo(lx + 60, ly - 70); c.lineTo(lx + 90, ly - 70); c.stroke();
      c.fillStyle = rgba(ink, 0.9 * a);
      monoText(c, `WORLD LINE ${r.value}`, lx + 98, ly - 70, 18, 600);
    });
    const [gx, gy, gz] = screen(gapPos);
    const ga = clamp(nb - 16) * clamp((gx - 80) / 80) * clamp((W - 300 - gx) / 80) * clamp((gy - 120) / 60) * clamp((H - 80 - gy) / 60);
    if (ga > 0.01 && gz < 1) {
      c.globalAlpha = ga;
      c.strokeStyle = rgba('crimson', 0.8);
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(gx + 10, gy + 10); c.lineTo(gx + 40, gy + 40); c.lineTo(gx + 60, gy + 40); c.stroke();
      c.fillStyle = rgba('crimson');
      monoText(c, 'MISSING LINK', gx + 66, gy + 40, 17, 600);
      c.globalAlpha = 1;
    }
    const attempt = 1 + [3, 7, 11, 15].filter((b) => nb >= b).length;
    c.fillStyle = rgba('cold');
    c.textBaseline = 'alphabetic';
    monoText(c, `ATTRACTOR FIELD β · WORLD LINE ${RIDES[attempt - 1]!.value} · ATTEMPT ${String(attempt).padStart(2, '0')} · HOLDS 0`, 120, H - 90, 20, 500);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.55, bloom: 0.6 };
  }
}
