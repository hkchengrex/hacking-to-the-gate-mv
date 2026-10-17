// `melt` — #21 因果律のメルト (Act II opens, the instrumental break). The divergence meter reads
// 1.130426, the world line where she dies, and it melts. The glowing digits soften and sag inside their glass; a few
// strands run down like hot wax, cooling from nixie orange to crimson as they stretch. And her blood spills on it,
// from above, out of the frame: it lands on the tops of the tubes and runs down the glass in rivulets over the
// melting digits (their glow shows through it, red), gathers on the meter's base, spills over its front edge and
// out over the floor, a dark mirror that gives the meter back. One slow move: close on the digits, back along the
// row, down to the floor, low across the blood. In the last bar the digits die out. No text. Steins;Gate
// (`deceive`): it all runs backward: the blood draws back up and away, the digits re-form and light, as 1.130205.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { Meter3D } from '../engine/meter3d';
import { TUBES, type MeterState } from '../engine/meter';
import { clamp, hash } from '../engine/util';
import { Plate } from './_kit';

/**
 * The reading: β 1.130426 (the original world line, where she dies at 12:39 and Okabe finds her); in Steins;Gate,
 * 1.130205, the β world line he is on after erasing the first D-mail, the one he leaves from for Operation Skuld
 * (overwritten by 1.048596 when it works; that landing is `horizon`'s).
 */
const READING = { b: '1.130426', sg: '1.130205' };
const FLOOR = -0.064; // the meter's underside
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

/** How far the spill has got (in beats, run backward in Steins;Gate), shared by the blood's shaders. */
const spillU = { uSpill: { value: 0 }, uGlow: { value: 0.2 } };

/**
 * The blood over the meter: a glossy dark red film, kept only where the blood has got to (the rest discarded):
 * rivulets down each tube's glass ('glass', tube-local coordinates), spreading pools on the base ('top'), drips
 * over its front edge ('front'). The digits' glow shows through it, red.
 */
function bloodMat(kind: 'glass' | 'top' | 'front', pitch: number) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.002, 0.004), roughness: 0.08, metalness: 0.0, emissive: new THREE.Color(...LIN.crimson), emissiveIntensity: 1 });
  const mask = {
    glass: `
      float a = atan(vOP.y, vOP.x), z = vOP.z, m = 0.0;
      for (int k = 0; k < 4; k++) {
        float fk = float(k);
        float h1 = fract(sin(vSeed * 12.9898 + fk * 78.233) * 43758.5453);
        float h2 = fract(sin(vSeed * 39.346 + fk * 11.135) * 24634.6345);
        float h3 = fract(sin(vSeed * 73.156 + fk * 52.235) * 13758.5453);
        float ak = -1.5708 + (h1 - 0.5) * 2.8;           // mostly down the front
        float age = uSpill - (0.5 + h2 * 7.0);           // when it lands
        if (age <= 0.0) continue;
        float head = 2.32 - age * (0.3 + 0.35 * h3);      // its head runs down
        float wig = 0.07 * sin(z * 5.0 + h1 * 6.0) + 0.03 * sin(z * 13.0 + h2 * 5.0);
        float da = abs(mod(a - ak - wig + 3.14159, 6.28318) - 3.14159);
        float w = (0.035 + 0.05 * h3) * (1.0 + 0.8 * exp(-pow((z - head) / 0.06, 2.0)));  // fatter at the head
        m = max(m, smoothstep(w, w * 0.7, da) * smoothstep(head - 0.03, head + 0.01, z));
        m = max(m, smoothstep(2.1, 2.2, z) * smoothstep(0.0, 0.8, age) * smoothstep(1.3, 1.0, da)); // the dome, where it landed
      }`,
    top: `
      vec2 q = vOP.xy;
      float m = 0.0;
      for (int i = 0; i < 8; i++) {
        float x = (float(i) - 3.5) * ${pitch.toFixed(5)};
        float hi = fract(sin(x * 12.9898 + 3.1) * 43758.5453);
        float age = uSpill - (4.5 + hi * 4.0);           // when its streams reach the base
        float r = 0.4 + max(age, 0.0) * 0.13 * (0.8 + 0.4 * hi);
        float d = length((q - vec2(x, -0.08)) * vec2(0.8, 1.0)) - r + 0.05 * sin(q.x * 13.0 + q.y * 7.0 + hi * 6.0);
        m = max(m, smoothstep(0.01, -0.01, d) * step(0.0, age));
      }`,
    front: `
      float x = vOP.x, z = vOP.y, m = 0.0;               // (the plane's own y is height)
      float age0 = uSpill - 9.5;
      float band = smoothstep(0.1, 0.12, z) * smoothstep(0.0, 1.0, age0) * (0.6 + 0.4 * sin(x * 3.0));
      m = max(m, step(0.5, band));
      for (int k = 0; k < 9; k++) {
        float fk = float(k);
        float h1 = fract(sin(fk * 12.9898 + 1.7) * 43758.5453), h2 = fract(sin(fk * 39.346 + 4.1) * 24634.6345);
        float xk = (fk / 8.0 - 0.5) * ${(pitch * 8).toFixed(4)} + (h1 - 0.5) * 0.7;
        float age = age0 - h2 * 4.0;
        if (age <= 0.0) continue;
        float head = 0.125 - age * (0.12 + 0.1 * h1);
        float w = (0.015 + 0.035 * h2 * h2) * (1.0 + 0.6 * exp(-pow((z - head) / 0.02, 2.0)));
        m = max(m, smoothstep(w, w * 0.7, abs(x - xk)) * smoothstep(head - 0.01, head + 0.005, z));
      }`,
  }[kind];
  // (three caches programs by the patch's source, which is the same for all three: tell them apart)
  m.customProgramCacheKey = () => `blood-${kind}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, spillU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;\nvSeed = modelMatrix[3].x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSpill;\nuniform float uGlow;\nvarying vec3 vOP;\nvarying float vSeed;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${mask}
        if (m < 0.5) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // lit from behind by the digits where it runs over them (on the glass), like stained glass
        totalEmissiveRadiance *= uGlow * (${kind === 'glass' ? '0.4 + 3.0 * exp(-pow((vOP.z - 1.2) / 0.42, 2.0))' : '1.0'});`);
  };
  return m;
}

/** How far the melt has gone, shared by the digits' shader. */
const meltU = { uMelt: { value: 0 }, uCrim: { value: new THREE.Color(...LIN.crimson) } };

/** The puddle (a planar mirror): blood where it has spread, a dark floor elsewhere. */
const PUDDLE = {
  name: 'Puddle',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uR: { value: 0 }, uT: { value: 0 } },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vW;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uR, uT;
    varying vec4 vUv;
    varying vec3 vW;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      // how far from the meter's footprint, against how far the blood has got (an uneven edge)
      vec2 q = vW.xy;
      float d = length(max(abs(q) - vec2(3.5, 0.45), 0.0));
      float R = uR * (0.75 + 0.5 * vn(q * 0.9 + 3.0)) + 0.06 * vn(q * 6.0);
      float pool = smoothstep(R + 0.015, R - 0.015, d);
      // slow ripples in the blood; the reflection wavers with them
      float w = sin(length(q - vec2(0.4, -0.2)) * 14.0 - uT * 1.6) * 0.5 + sin(q.x * 9.0 + q.y * 5.0 + uT * 0.9) * 0.5;
      vec4 uv = vUv;
      uv.xy += vec2(w, w * 0.6) * 0.004 * uv.w * pool;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 blood = refl * vec3(1.0, 0.32, 0.28) + vec3(0.05, 0.0, 0.003);
      blood *= 1.0 - 0.5 * exp(-pow((R - d) / 0.03, 2.0)) * pool; // the edge, darker where it curls
      vec3 floorC = vec3(0.01, 0.011, 0.012) * (0.85 + 0.3 * vn(q * 3.0)) + refl * 0.05;
      gl_FragColor = vec4(mix(floorC, blood, pool), 1.0);
    }`,
};

export default class Melt extends Plate {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(24, PW / PH, 0.01, 100);
  rt = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
  meter = new Meter3D({ brightness: 11 });
  puddle: Reflector;
  lights: THREE.PointLight[] = [];
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 20;

  constructor(ctx: SceneCtx) {
    super(ctx);
    this.cam.up.set(0, 0, 1);
    this.scene.background = new THREE.Color(0);
    this.scene.add(this.meter.group);
    // the lit digits melt (each tube's glow material, patched once)
    const done = new Set<THREE.Material>();
    this.meter.group.traverse((o) => {
      if (o instanceof THREE.PointLight) this.lights.push(o);
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.MeshStandardMaterial;
      if (!m.emissive || m.emissive.r < 0.1 || done.has(m)) return;
      done.add(m);
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, meltU);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uMelt;\nvarying float vMelt;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            // everything softens and slides down a little; a few strands run (where the noise peaks)
            float seed = modelMatrix[3].x * 3.7;
            float nn = 0.5 + 0.5 * sin(position.x * 13.0 + seed) * sin(position.x * 5.3 + seed * 1.7 + 1.3);
            float drip = smoothstep(0.52, 0.95, nn);
            float h = max(position.z - 0.5, 0.0);
            float dz = uMelt * (0.22 * h + drip * 1.6 * (1.0 - exp(-h * 1.6)) * (0.6 + 0.4 * nn));
            dz = min(dz, h);
            transformed.z -= dz;
            vMelt = dz;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uCrim;\nvarying float vMelt;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            // cooling as it runs: nixie orange to crimson, dimmer
            float kc = smoothstep(0.02, 0.3, vMelt);
            float Lm = max(max(totalEmissiveRadiance.r, totalEmissiveRadiance.g), totalEmissiveRadiance.b);
            totalEmissiveRadiance = mix(totalEmissiveRadiance, uCrim * Lm * (1.0 - 0.55 * smoothstep(0.25, 0.9, vMelt)), kc);`);
      };
      m.needsUpdate = true;
    });
    // the blood on the meter: down each tube's glass (a film just outside it), on the base, over its front edge
    const pitch = (this.meter.width - 0.3) / TUBES;
    let glassGeo: THREE.BufferGeometry | null = null;
    const tubes: THREE.Object3D[] = [];
    this.meter.group.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.material as THREE.MeshPhysicalMaterial).transmission > 0) { glassGeo = o.geometry; tubes.push(o.parent!); }
    });
    const gm = bloodMat('glass', pitch);
    for (const t of tubes) {
      const film = new THREE.Mesh(glassGeo!, gm);
      film.scale.set(1.015, 1.015, 1.004);
      film.renderOrder = 2;
      t.add(film);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(this.meter.width, 1.05), bloodMat('top', pitch));
    top.position.z = 0.2;
    const fg = new THREE.PlaneGeometry(this.meter.width, 0.25);
    const front = new THREE.Mesh(fg, bloodMat('front', pitch));
    front.rotation.x = Math.PI / 2;
    front.position.set(0, -0.534, 0.058);
    // (its own y runs up the face, from the floor (-0.125) to the top edge (0.125))
    this.meter.group.add(top, front);
    // the floor, a mirror where the blood is
    this.puddle = new Reflector(new THREE.PlaneGeometry(60, 60), { textureWidth: PW, textureHeight: PH, clipBias: 0.002, shader: PUDDLE, multisample: 4 });
    this.puddle.position.z = FLOOR;
    this.scene.add(this.puddle);
    // a little cold light from behind, so the glass and the brass read
    const rim = new THREE.DirectionalLight(new THREE.Color(...LIN.cold), 0.6);
    rim.position.set(-1, 3, 2);
    // and a soft light from in front, high: the blood's wet highlights
    const fill = new THREE.DirectionalLight(new THREE.Color(...LIN.bone), 1.1);
    fill.position.set(0.6, -2, 2.2);
    this.scene.add(rim, fill, new THREE.HemisphereLight(0x1a2028, 0x000000, 0.25));
  }

  private nbAt(t: number) { return (t - this.tb0) / this.per; }

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    this.nbEnd = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + this.nbEnd) - this.tb0) / this.nbEnd;
  }

  /** How far it has melted at nb (β: on and on; Steins;Gate: backward, back to whole). */
  private progress(nb: number) {
    const x = clamp(nb / this.nbEnd);
    return this.act === 'sg' ? 1 - smoother(clamp(x * 1.15)) : smoother(clamp((nb - 0.5) / (this.nbEnd - 1)));
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const nb = this.nbAt(t), p = this.progress(nb);
    const sg = this.act === 'sg';
    meltU.uMelt.value = 1.25 * p;
    // the digits: the reading, dying out in the last bar (β), lit again at the end (Steins;Gate)
    const life = sg ? 0.35 + 0.65 * smoother(clamp((nb - this.nbEnd * 0.6) / (this.nbEnd * 0.35))) : 1 - 0.85 * smoother(clamp((nb - (this.nbEnd - 4)) / 4));
    const lit = Array.from({ length: TUBES }, (_, i) => clamp(life * (1 - 0.25 * p * hash(i, Math.floor(t * 12), 3))));
    const text = sg ? READING.sg : READING.b;
    const st: MeterState = { text, lit, rolling: new Array(TUBES).fill(0), phosphor: 0, value: Number(text), spinning: false };
    this.meter.update(st);
    const crim = new THREE.Color(...LIN.crimson);
    for (const l of this.lights) l.color.lerp(crim, clamp(p * 1.2));
    // the molten glow below, filling; the blood out over the floor
    // the spill: from above, down the glass, over the base and its edge, out over the floor
    const spill = sg ? this.nbEnd + 2 - nb * 1.25 : nb;
    spillU.uSpill.value = spill;
    spillU.uGlow.value = 0.09 * (0.3 + 0.7 * life);
    const U = (this.puddle.material as THREE.ShaderMaterial).uniforms;
    U.uR!.value = 3.2 * smoother(clamp((spill - 10.5) / 8));
    U.uT!.value = t;

    // the camera: close on the digits, back along the row, down to the floor, low across the blood
    const keys: [number, number, number, number, number, number, number][] = [
      [-0.9, -3.0, 1.25, 0.4, 0, 1.1, 24], [0.4, -3.6, 1.0, 0.6, 0, 0.95, 24], [1.8, -4.6, 0.75, 0.6, 0, 0.8, 25],
      [2.2, -5.2, 0.4, 0.3, 0, 0.6, 26], [1.7, -5.4, 0.13, 0.1, 0, 0.62, 28], [1.2, -6.0, 0.05, -0.1, 0, 0.66, 30],
    ];
    // (a Catmull-Rom spline through the keys: the move never stops between them)
    const x = clamp(nb / this.nbEnd), u = (0.4 * x + 0.6 * smoother(x)) * (keys.length - 1);
    const n = keys.length - 1, i = Math.min(Math.floor(u), n - 1), fr = clamp(u - i);
    const P0 = keys[Math.max(i - 1, 0)]!, P1 = keys[i]!, P2 = keys[i + 1]!, P3 = keys[Math.min(i + 2, n)]!;
    const L = (j: number) => {
      const a = P0[j]!, b = P1[j]!, c = P2[j]!, d = P3[j]!;
      return 0.5 * (2 * b + (-a + c) * fr + (2 * a - 5 * b + 4 * c - d) * fr * fr + (-a + 3 * b - 3 * c + d) * fr * fr * fr);
    };
    this.cam.position.set(L(0), L(1), L(2));
    if (this.cam.fov !== L(6)) { this.cam.fov = L(6); this.cam.updateProjectionMatrix(); }
    this.cam.lookAt(L(3), L(4), L(5));
    this.cam.updateMatrixWorld();

    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
    comp.draw(renderer, this.rt.texture, out, { mode: 'normal', premult: false });
    return { vignette: 0.45, bloom: 0.8, bloomThreshold: 0.7 };
  }
}
