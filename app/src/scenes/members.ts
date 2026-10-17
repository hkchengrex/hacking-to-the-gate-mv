// `members` — #10 相生のホメオスタシス (Act III, the chorus's shining days and the promise with friends; docs/DESIGN.md). Act II's chains were fate, binding her; this is the answer. Eight lights fly toward the
// gate, one per lab member (in badge order; the fourth is crimson, hers), each drawing its thread of light behind
// it. The first flies alone; the others come in from afar, one a beat, sweeping in on a spiral, and fall in beside
// it; flying together they circle one another, so their threads wind into one rope of light behind them, loose at
// the lights and pulling tight further back. Beads of light run along every thread toward the lights. The camera
// flies with them: ahead of them at first, looking back at the ones still coming; then alongside, close on the
// winding; then behind, as they climb away toward the gate, a doorway of light far off. No people, no objects, no
// text but the lyric. Smooth throughout; nothing jolts on the beat (the lights circle once in two beats).
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H, PW, PH } from '../engine/gl';
import { LIN } from '../engine/palette';
import { clamp, hash, hexToLinear } from '../engine/util';
import { Plate, lyricRail } from './_kit';

const NTH = 8;
/** A thread's radius as drawn; the room each takes in the rope; the lights' speed at first (units/s); how the axis climbs (y = AX_A x², from x = 0). */
const RD = 0.009, RS = 0.045, V = 2.0, AX_A = 0.016;
const FOV = 35;
/** The threads, in badge order: colour (a pale, warm bundle from the palette; the fourth is hers) and how brightly it burns. */
const THREADS: [hex: string, gain: number][] = [
  ['#E9E5DA', 1.0], // 001: bone
  ['#B9D6E8', 1.0], // 002: a cool white
  ['#FFB061', 1.1], // 003: ember
  ['#C8101E', 5.0], // 004: crimson
  ['#7FA6BE', 1.3], // 005: cold
  ['#C9D6B8', 1.0], // 006: the LCD's grey-green, pale
  ['#FF7A33', 1.5], // 007: nixie
  ['#F3D9A0', 1.0], // 008: pale gold
];
/** Each thread before it joins: how steeply it comes in to the rope, from what side, and how far behind it starts. */
const SLOPE = [0.1, 0.34, 0.46, 0.3, 0.52, 0.38, 0.44, 0.28];
const AZ = [0, 2.2, -1.9, 0.9, -2.8, 3.4, -0.8, 1.7];
const GAP = [0, 15, 17, 14, 18, 16, 15, 17];
/** Beats a light takes to catch up with the others. */
const CATCH = 3.2;

const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(5)).join(', ')})`;

/**
 * Where a thread runs (shared by the threads and their lights). Along the axis (x) thread k joins the rope at
 * uJ[k]; before that it comes in on a conical spiral; after, it has its slot in the ring of the strands joined so
 * far (the ring opens a slot as each joins), twisting once in two beats' flight. Near the lights (uTip) the ring
 * is loose; behind them it pulls tighter and tighter.
 */
const THREAD_GLSL = /* glsl */ `
  #define NTH ${NTH}
  uniform float uJ[NTH];
  uniform float uSlope[NTH];
  uniform float uAz[NTH];
  uniform float uHead[NTH];
  uniform float uTip;
  uniform float uTau;
  const float TH_PI = 3.14159265;
  vec3 axisAt(float x) { float xp = max(x, 0.0); return vec3(x, ${AX_A} * xp * xp, 0.0); }
  vec3 axisTan(float x) { return normalize(vec3(1.0, ${2 * AX_A} * max(x, 0.0), 0.0)); }
  float strands(float x) { float n = 1.0; for (int j = 1; j < NTH; j++) n += smoothstep(uJ[j] - 1.5, uJ[j], x); return n; }
  float ringR(float n) { return n < 2.0 ? ${RS} * (n - 1.0) : ${RS} / sin(TH_PI / n); }
  vec3 threadPos(int k, float x, out vec3 radial) {
    float n = strands(x), fk = float(k);
    float d = max(uJ[k] - x, 0.0); // how far before its join
    float slot = k == 0 ? 0.0 : 2.0 * TH_PI * fk / (0.5 * (n + fk + sqrt((n - fk) * (n - fk) + 0.1)));
    float phi = slot + uTau * (x + d - 0.5 * log(1.0 + d / 0.5)) + uAz[k] * d / (d + 2.0);
    float back = max(uTip - x, 0.0);
    float loose = 0.45 + 0.55 * exp(-back / 4.0) + 1.8 * exp(-back / 1.0);
    float rho = ringR(n) * loose + uSlope[k] * d * d / (d + 0.8);
    vec3 T = axisTan(x);
    radial = cos(phi) * vec3(-T.y, T.x, 0.0) + sin(phi) * vec3(0.0, 0.0, 1.0);
    return axisAt(x) + rho * radial;
  }`;

/** The sky: dusk behind, warming toward the gate; the gate itself a tall doorway of light, far off. */
const SKY_GLSL = /* glsl */ `
  uniform vec3 uGate;
  uniform vec3 uGateR;
  uniform vec3 uGateU;
  uniform float uGlow;
  vec3 haze(vec3 d) {
    float c = 1.0 - dot(d, uGate);
    vec3 col = mix(vec3(0.016, 0.026, 0.058), vec3(0.04, 0.06, 0.115), smoothstep(-0.7, 0.8, d.y));
    col = mix(col, vec3(0.1, 0.066, 0.125), exp(-7.0 * c));
    col = mix(col, vec3(0.46, 0.2, 0.11), uGlow * exp(-45.0 * c));
    return col + vec3(1.0, 0.62, 0.32) * 0.3 * uGlow * exp(-500.0 * c);
  }
  vec3 sky(vec3 d) {
    float c = dot(d, uGate);
    vec3 col = haze(d) + ${v3(LIN.bone)} * 0.35 * pow(max(c, 0.0), 500.0);
    vec2 q = vec2(dot(d, uGateR), dot(d, uGateU)) / max(c, 1e-3);
    float door = c > 0.0 ? (1.0 - smoothstep(0.015, 0.017, abs(q.x))) * (1.0 - smoothstep(0.029, 0.031, abs(q.y))) : 0.0;
    return col + vec3(1.0, 0.96, 0.9) * 2.2 * uGlow * door;
  }`;

export default class Members extends Plate {
  sky = { uGate: { value: new THREE.Vector3(1, 0, 0) }, uGateR: { value: new THREE.Vector3(0, 0, 1) }, uGateU: { value: new THREE.Vector3(0, 1, 0) }, uGlow: { value: 1 } };
  bg = new FSPass(/* glsl */ `
    uniform vec3 camR; uniform vec3 camU; uniform vec3 camF; uniform float tanH;
    ${SKY_GLSL}
    void main() {
      vec2 n = vUv * 2.0 - 1.0;
      vec3 d = normalize(camF + n.x * tanH * ${(W / H).toFixed(5)} * camR + n.y * tanH * camU);
      fragColor = vec4(sky(d) * (0.985 + 0.03 * hash12(floor(FRAG_PX / 2.0))), 1.0);
    }`, { camR: { value: new THREE.Vector3() }, camU: { value: new THREE.Vector3() }, camF: { value: new THREE.Vector3() }, tanH: { value: Math.tan((FOV * Math.PI) / 360) }, ...this.sky });
  L = new Layer2D();
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(FOV, PW / PH, 0.05, 300);
  rt = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
  /** The threads' uniforms (shared by the threads and their lights). */
  u = {
    uJ: { value: new Array<number>(NTH).fill(0) }, uSlope: { value: SLOPE }, uAz: { value: AZ }, uHead: { value: new Array<number>(NTH).fill(0) },
    uTip: { value: 0 }, uTau: { value: 1 }, uT: { value: 0 },
    uCol: { value: THREADS.map(([hex, gain]) => new THREE.Vector3(...hexToLinear(hex)).multiplyScalar(gain)) },
    ...this.sky,
  };
  b0 = 0; tb0 = 0; per = 0.4; nbEnd = 18;

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    this.nbEnd = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + this.nbEnd) - this.tb0) / this.nbEnd;
    this.u.uTau.value = (2 * Math.PI) / (V * 2 * this.per); // one turn in two beats' flight
    this.u.uJ.value = this.u.uJ.value.map((_, k) => this.tipAt(k)); // thread k joins on beat k
    this.scene.add(this.threads(), this.lights(), this.dust());
  }

  /** Beats into the plate at t, continuous (plain time at the plate's mean tempo). */
  private nbAt(t: number) { return (t - this.tb0) / this.per; }
  /** Where the lights are along the axis at beat nb: steady, then faster in the last bars (climbing away). */
  private tipAt(nb: number) { const a = Math.max(nb - 11, 0); return V * this.per * (nb + 0.035 * a * a); }
  /** Where thread k's light is along the axis at beat nb: catching up from far behind until its beat, then with the others (each drifting a little). */
  private headAt(k: number, nb: number) {
    const e = clamp((nb - (k - CATCH)) / CATCH);
    const gap = nb < k ? GAP[k]! * Math.pow(1 - e * e * (3 - 2 * e), 1.2) : 0; // (setting off and falling in smoothly)
    const bob = nb > k ? 0.06 * (1 - Math.cos((nb - k) * (0.9 + 0.13 * k))) : 0;
    return this.tipAt(nb) - gap - bob;
  }
  private axis(x: number) { const xp = Math.max(x, 0); return new THREE.Vector3(x, AX_A * xp * xp, 0); }
  private axisTan(x: number) { return new THREE.Vector3(1, 2 * AX_A * Math.max(x, 0), 0).normalize(); }

  /** The threads: one mesh; each vertex carries (where along the axis, the angle round the thread, which thread). */
  private threads() {
    const xMax = this.tipAt(this.nbEnd + 0.5) + 0.3, NA = 6, DX = 0.022;
    const pos: number[] = [], idx: number[] = [];
    for (let k = 0; k < NTH; k++) {
      // fine along the rope and where the thread comes in to it; coarser and coarser further back
      const xs: number[] = [];
      const x0 = this.u.uJ.value[k]! - 12;
      for (let x = x0, step = DX; x > x0 - 70; step *= 1.05, x -= step) xs.unshift(x);
      for (let x = x0 + DX; x < xMax; x += DX) xs.push(x);
      const base = pos.length / 3;
      xs.forEach((x, i) => {
        for (let j = 0; j <= NA; j++) pos.push(x, (j / NA) * Math.PI * 2, k);
        if (i === 0) return;
        for (let j = 0; j < NA; j++) {
          const a = base + (i - 1) * (NA + 1) + j, b = a + NA + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        ${THREAD_GLSL}
        varying vec3 vWp; varying vec3 vN; varying float vX; varying float vBack; varying float vK;
        void main() {
          int k = int(position.z + 0.5);
          float head = uHead[k], x = min(position.x, head), a = position.y;
          vec3 rad, r2;
          vec3 c = threadPos(k, x, rad);
          vec3 T = normalize(threadPos(k, x + 0.01, r2) - threadPos(k, x - 0.01, r2));
          vec3 B1 = normalize(cross(T, rad)), B2 = cross(B1, T);
          // the thread ends at its light: a rounded tip; far off it keeps a pixel or two of width
          float cap = clamp((head - position.x) / ${RD}, 0.0, 1.0);
          float r = max(${RD}, 0.0006 * length(cameraPosition - c)) * sqrt(1.0 - (1.0 - cap) * (1.0 - cap));
          vN = cos(a) * B2 + sin(a) * B1;
          vWp = c + r * vN;
          vX = x; vBack = head - x; vK = position.z;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol[${NTH}];
        uniform float uT;
        ${SKY_GLSL}
        varying vec3 vWp; varying vec3 vN; varying float vX; varying float vBack; varying float vK;
        void main() {
          vec3 base = uCol[int(vK + 0.5)];
          vec3 toCam = cameraPosition - vWp;
          float dist = length(toCam);
          float core = max(dot(normalize(vN), toCam / dist), 0.0);
          core *= core;
          // a line of light: its colour, white-hot along the middle
          vec3 col = base * (0.9 + 1.5 * core) + vec3(1.0, 0.96, 0.9) * 0.8 * core * core;
          // beads of light running along it toward its head; and the head itself
          float g = fract((vX - 4.0 * uT) / 3.4 + 0.37 * vK) - 0.5;
          col += (base * 1.6 + vec3(0.8)) * exp(-pow(g * 3.4 / 0.14, 2.0));
          col += (base * 1.2 + vec3(0.9)) * exp(-vBack / 0.1);
          // into the haze
          col = mix(col, haze(-toCam / dist), 1.0 - exp(-dist * 0.025));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** The lights at the threads' heads: a glow each, in its thread's colour, white at the core. */
  private lights() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aK', new THREE.InstancedBufferAttribute(new Float32Array(NTH).map((_, k) => k), 1));
    g.instanceCount = NTH;
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: /* glsl */ `
        ${THREAD_GLSL}
        attribute float aK;
        varying vec2 vQ; varying float vK; varying float vFade;
        void main() {
          int k = int(aK + 0.5);
          vec3 rad;
          vec4 mv = viewMatrix * vec4(threadPos(k, uHead[k], rad), 1.0);
          vFade = exp(mv.z * 0.025);
          mv.xy += position.xy * 0.24;
          mv.z += 0.05; // (in front of its own thread's tip)
          vQ = position.xy; vK = aK;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol[${NTH}];
        varying vec2 vQ; varying float vK; varying float vFade;
        void main() {
          float r2 = dot(vQ, vQ);
          vec3 col = uCol[int(vK + 0.5)] * (0.8 * exp(-r2 * 14.0) + 0.1 * exp(-r2 * 3.0)) + vec3(1.0, 0.96, 0.9) * 1.6 * exp(-r2 * 120.0);
          gl_FragColor = vec4(col * vFade * (1.0 - smoothstep(0.7, 1.0, r2)), 0.0);
        }`,
      blending: THREE.AdditiveBlending, premultipliedAlpha: true, transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Motes of light in the air all along the way, out of focus: they give the flight its speed. */
  private dust() {
    const n = 5000, pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = -30 + 85 * hash(i, 1), r = 0.5 + 9 * Math.pow(hash(i, 2), 0.7), a = hash(i, 3) * Math.PI * 2;
      const c = this.axis(x);
      pos.set([c.x, c.y + r * Math.cos(a), r * Math.sin(a)], i * 3);
      seed.set([0.012 + 0.03 * hash(i, 4) ** 2, hash(i, 5), hash(i, 6)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: this.u.uT, uPx: { value: PH / (2 * Math.tan((FOV * Math.PI) / 360)) } },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; uniform float uT; uniform float uPx;
        varying float vB;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPx * aSeed.x / dist, 1.5, 40.0);
          float tw = sin(uT * (0.6 + 2.0 * aSeed.y) + aSeed.z * 40.0);
          vB = (0.3 + 0.7 * tw * tw) * smoothstep(0.3, 1.4, dist) * exp(-dist * 0.035);
        }`,
      fragmentShader: /* glsl */ `
        varying float vB;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.68) * 0.3 * vB * (1.0 - smoothstep(0.7, 1.0, r)), 0.0);
        }`,
      blending: THREE.AdditiveBlending, premultipliedAlpha: true, transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return pts;
  }

  /**
   * The camera at beat nb: [position, target], given from the lights (forward, up, toward the front): ahead of
   * them looking back; alongside, close; behind, further and further, looking on toward the gate.
   */
  private camPose(nb: number): [THREE.Vector3, THREE.Vector3] {
    //            beat   position (forward, up, front)   target (forward, up, front)
    const keys = [
      [-4, 3.6, 0.3, 1.1, -1.6, -0.25, 0],
      [0, 3.0, 0.3, 1.2, -1.5, -0.25, 0],
      [4, 1.7, 0.25, 2.2, -0.8, -0.25, 0],
      [8, -0.2, 0.15, 2.4, -0.5, -0.28, 0],
      [12, -2.8, -0.6, 2.9, 0.6, -0.2, -0.2],
      [this.nbEnd, -8, -2.6, 3.6, 2.2, 0.6, -0.2],
      [this.nbEnd + 5, -11, -3.8, 4.2, 2.8, 0.9, -0.2],
    ];
    let i = keys.findIndex((k) => k[0]! > nb) - 1;
    i = clamp(i, 1, keys.length - 3);
    const k0 = keys[i - 1]!, k1 = keys[i]!, k2 = keys[i + 1]!, k3 = keys[i + 2]!;
    const f = (nb - k1[0]!) / (k2[0]! - k1[0]!);
    // (Catmull-Rom, non-uniform keys: tangents from the neighbours' slopes)
    const cr = (j: number) => {
      const m1 = (k2[j]! - k0[j]!) / (k2[0]! - k0[0]!) * (k2[0]! - k1[0]!), m2 = (k3[j]! - k1[j]!) / (k3[0]! - k1[0]!) * (k2[0]! - k1[0]!);
      const f2 = f * f, f3 = f2 * f;
      return (2 * f3 - 3 * f2 + 1) * k1[j]! + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * k2[j]! + (f3 - f2) * m2;
    };
    const o = this.axis(this.tipAt(nb));
    const at = (a: number, b: number, c: number) => new THREE.Vector3(o.x + a, o.y + b, o.z + c);
    return [at(cr(1), cr(2), cr(3)), at(cr(4), cr(5), cr(6))];
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const nb = this.nbAt(t);
    this.u.uT.value = t - this.tb0;
    this.u.uTip.value = this.tipAt(nb);
    for (let k = 0; k < NTH; k++) this.u.uHead.value[k] = this.headAt(k, nb);

    // the camera; the gate, far along the way the lights are heading at the end
    const [cp, ct] = this.camPose(nb);
    this.cam.position.copy(cp);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(ct);
    this.cam.updateMatrixWorld();
    const xe = this.tipAt(this.nbEnd), gate = this.axis(xe).addScaledVector(this.axisTan(xe), 90);
    const gd = this.sky.uGate.value.copy(gate).sub(cp).normalize();
    this.sky.uGlow.value = 0.75 + 0.35 * clamp((nb - 10) / (this.nbEnd - 10)); // (its light grows as they climb toward it)
    const e = this.cam.matrixWorld.elements;
    this.sky.uGateR.value.crossVectors(gd, new THREE.Vector3(e[4]!, e[5]!, e[6]!)).normalize(); // (upright on the screen)
    this.sky.uGateU.value.crossVectors(this.sky.uGateR.value, gd);
    (this.bg.u.camR!.value as THREE.Vector3).set(e[0]!, e[1]!, e[2]!);
    (this.bg.u.camU!.value as THREE.Vector3).set(e[4]!, e[5]!, e[6]!);
    (this.bg.u.camF!.value as THREE.Vector3).set(-e[8]!, -e[9]!, -e[10]!);
    this.bg.render(renderer, out);

    // the threads, their lights and the motes: rendered alone (4x MSAA) and laid over
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, this.cam);
    comp.draw(renderer, this.rt.texture, out, { mode: 'normal', premult: false }); // (already premultiplied)

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: 0.3, bloom: 0.7 };
  }
}
