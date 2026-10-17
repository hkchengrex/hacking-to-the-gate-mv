// Shared pieces of the flights of light (Act III's members and `trick` to `wound`, and the plates
// drawn in that manner in acts α and β): the dusk sky with the gate in it (a doorway of light, far off), the lights themselves (soft glows,
// white at the core), and motes in the air. Threads of light are drawn with engine/lines' LineBatch.
import * as THREE from 'three';
import { FSPass, W, H } from '../engine/gl';
import { LIN } from '../engine/palette';
import { hash } from '../engine/util';
import type { LineBatch } from '../engine/lines';

/** A bell: 1 at x = 0, falling off over w. */
export const gauss = (x: number, w: number) => Math.exp(-(x * x) / (w * w));

const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(5)).join(', ')})`;

/** The sky: night behind, through violet and rose to the gate's warmth; the gate itself a tall doorway of light. */
export const SKY_GLSL = /* glsl */ `
  uniform vec3 uGate;
  uniform vec3 uGateR;
  uniform vec3 uGateU;
  uniform float uGlow;
  vec3 haze(vec3 d) {
    float c = 1.0 - dot(d, uGate);
    vec3 col = mix(vec3(0.016, 0.026, 0.058), vec3(0.04, 0.06, 0.115), smoothstep(-0.7, 0.8, d.y));
    col = mix(col, vec3(0.1, 0.066, 0.125), min(uGlow * 1.4, 1.0) * exp(-7.0 * c));
    col = mix(col, vec3(0.46, 0.2, 0.11), uGlow * exp(-45.0 * c));
    return col + vec3(1.0, 0.62, 0.32) * 0.3 * uGlow * exp(-500.0 * c);
  }
  vec3 sky(vec3 d) {
    float c = dot(d, uGate);
    vec3 col = haze(d) + ${v3(LIN.bone)} * 0.35 * uGlow * pow(max(c, 0.0), 500.0);
    vec2 q = vec2(dot(d, uGateR), dot(d, uGateU)) / max(c, 1e-3);
    float door = c > 0.0 ? (1.0 - smoothstep(0.015, 0.017, abs(q.x))) * (1.0 - smoothstep(0.029, 0.031, abs(q.y))) : 0.0;
    return col + vec3(1.0, 0.96, 0.9) * 2.2 * uGlow * door;
  }`;

/** The sky's uniforms: where the gate is (a direction from the camera, and its right and up), and how brightly it glows. */
export function skyUniforms() {
  return { uGate: { value: new THREE.Vector3(1, 0, 0) }, uGateR: { value: new THREE.Vector3(0, 0, 1) }, uGateU: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 1 } };
}
/** Point the sky's gate at a world position as seen by this camera (upright on the screen); glow 0 = no gate in this sky. */
export function aimGate(u: ReturnType<typeof skyUniforms>, cam: THREE.Camera, gate: THREE.Vector3 | null, glow = 1) {
  const e = cam.matrixWorld.elements;
  const gd = gate ? u.uGate.value.copy(gate).sub(cam.position).normalize() : u.uGate.value.set(e[8]!, e[9]!, e[10]!); // (none: behind the camera)
  u.uGateR.value.crossVectors(gd, new THREE.Vector3(e[4]!, e[5]!, e[6]!)).normalize();
  u.uGateU.value.crossVectors(u.uGateR.value, gd);
  u.uGlow.value = gate ? glow : 0;
}

/** The sky as a background pass. */
export class Sky {
  u = skyUniforms();
  pass = new FSPass(/* glsl */ `
    uniform vec3 camR; uniform vec3 camU; uniform vec3 camF; uniform float tanH;
    ${SKY_GLSL}
    void main() {
      vec2 n = vUv * 2.0 - 1.0;
      vec3 d = normalize(camF + n.x * tanH * ${(W / H).toFixed(5)} * camR + n.y * tanH * camU);
      fragColor = vec4(sky(d) * (0.985 + 0.03 * hash12(floor(FRAG_PX / 2.0))), 1.0);
    }`, { camR: { value: new THREE.Vector3() }, camU: { value: new THREE.Vector3() }, camF: { value: new THREE.Vector3() }, tanH: { value: 0.3 }, ...this.u });
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: THREE.PerspectiveCamera, gate: THREE.Vector3 | null, glow = 1) {
    aimGate(this.u, cam, gate, glow);
    const e = cam.matrixWorld.elements;
    (this.pass.u.camR!.value as THREE.Vector3).set(e[0]!, e[1]!, e[2]!);
    (this.pass.u.camU!.value as THREE.Vector3).set(e[4]!, e[5]!, e[6]!);
    (this.pass.u.camF!.value as THREE.Vector3).set(-e[8]!, -e[9]!, -e[10]!);
    this.pass.u.tanH!.value = Math.tan((cam.fov * Math.PI) / 360);
    this.pass.render(renderer, out);
  }
}

/** The dark of acts α and β: ink, a shade lighter toward the middle of the frame so that it never sits flat. */
export class Dark {
  pass = new FSPass(/* glsl */ `
    uniform vec3 tint;
    void main() {
      vec2 q = (vUv - 0.5) * vec2(${(W / H).toFixed(5)}, 1.0);
      float v = exp(-dot(q, q) * 2.2);
      fragColor = vec4(C_INK * (0.4 + 0.5 * v) + tint * v, 1.0);
    }`, { tint: { value: new THREE.Vector3() } });
  /** `tint`: a little colour in the middle (linear rgb, small). */
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, tint: readonly number[] = [0, 0, 0]) {
    (this.pass.u.tint!.value as THREE.Vector3).set(tint[0]!, tint[1]!, tint[2]!);
    this.pass.render(renderer, out);
  }
}

/** Lights: soft glows in a colour, white at the core, added over whatever is there (set them each frame). */
export class Lights {
  private geo = new THREE.InstancedBufferGeometry();
  private pos: Float32Array; private col: Float32Array; private par: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];
  private scene = new THREE.Scene();
  count = 0;
  constructor(public capacity = 32) {
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(capacity * 3); this.col = new Float32Array(capacity * 3); this.par = new Float32Array(capacity * 2);
    this.attrs = [new THREE.InstancedBufferAttribute(this.pos, 3), new THREE.InstancedBufferAttribute(this.col, 3), new THREE.InstancedBufferAttribute(this.par, 2)];
    this.attrs.forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iPos', this.attrs[0]!); this.geo.setAttribute('iCol', this.attrs[1]!); this.geo.setAttribute('iPar', this.attrs[2]!);
    const m = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec3 iCol; attribute vec2 iPar;
        varying vec2 vQ; varying vec3 vCol; varying float vCore;
        void main() {
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          mv.xy += position.xy * iPar.x;
          vQ = position.xy; vCol = iCol; vCore = iPar.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQ; varying vec3 vCol; varying float vCore;
        void main() {
          float r2 = dot(vQ, vQ);
          vec3 col = vCol * (0.8 * exp(-r2 * 14.0) + 0.1 * exp(-r2 * 3.0)) + vec3(1.0, 0.96, 0.9) * 1.6 * vCore * exp(-r2 * 120.0);
          gl_FragColor = vec4(col * (1.0 - smoothstep(0.7, 1.0, r2)), 0.0);
        }`,
      blending: THREE.AdditiveBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, depthTest: false,
    });
    const mesh = new THREE.Mesh(this.geo, m);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
  clear() { this.count = 0; }
  /** A light at p: its colour (linear, may exceed 1), its size (world units, the glow's radius), and how white its core is. */
  add(p: THREE.Vector3, rgb: readonly number[], size = 0.24, gain = 1, core = 1) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.col.set([rgb[0]! * gain, rgb[1]! * gain, rgb[2]! * gain], i * 3);
    this.par.set([size, core], i * 2);
  }
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, cam: THREE.Camera) {
    this.attrs.forEach((a) => { a.needsUpdate = true; });
    this.geo.instanceCount = this.count;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, cam);
  }
}

/**
 * Motes of light in the air, as dots in a line batch: n of them in a box round `centre` (half sizes `ext`), fixed in
 * the world (the box wraps round the camera, so there are always some), dimmer further off, twinkling.
 */
export function motes(L: LineBatch, cam: THREE.Camera, n: number, centre: THREE.Vector3, ext: [number, number, number], t: number, seed = 0, gain = 1) {
  const wrap = (v: number, c: number, e: number) => c + ((((v - c + e) % (2 * e)) + 2 * e) % (2 * e)) - e;
  for (let i = 0; i < n; i++) {
    const x = wrap((hash(i, 1, seed) - 0.5) * 2000, centre.x, ext[0]), y = wrap((hash(i, 2, seed) - 0.5) * 2000, centre.y, ext[1]), z = wrap((hash(i, 3, seed) - 0.5) * 2000, centre.z, ext[2]);
    const d = Math.hypot(x - cam.position.x, y - cam.position.y, z - cam.position.z);
    if (d < 0.4) continue;
    const tw = Math.sin(t * (0.6 + 2 * hash(i, 5, seed)) + hash(i, 6, seed) * 40);
    const g = gain * (0.3 + 0.7 * tw * tw) * Math.exp(-d * 0.03) * 0.5;
    L.seg(x, y, z, x, y + 0.004, z, Math.min(6, 1.2 + (2.5 + 5 * hash(i, 4, seed)) / d), 1.0 * g, 0.86 * g, 0.68 * g, 1);
  }
}
