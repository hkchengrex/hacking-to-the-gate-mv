// `horizon` — #11 時空境界のドグマ, 飲み込まれてゆく 孤独の観測者 (docs/DESIGN.md).
// A black hole, abstract: nothing of it is drawn but threads of light. World lines wind in
// round a point, tighter and faster, then let go and plunge; they redden and go out before they reach it, and
// what they leave in the middle is the hole. The threads lie in one plane and are seen through the hole's own
// gravity (every pixel's ray is carried along a Schwarzschild geodesic). 飲み込まれてゆく: we look down into the
// whirl, drifting closer; beads of light run in along the threads, and on every syllable a wave of light goes in
// through them and is gone. 孤独の観測者: we let go and fall in ourselves (no cut): the whirl opens
// round us, the last red threads go by, the dark takes the whole frame; and in there is the lone observer, the
// divergence meter, coming up out of the dark as we fall toward it. On 観 it settles on 0.571046 (α holds; Act I
// ends), or in Act III lands on 1.048596; after 者 we draw back from it: alone in the dark.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, SS_TAP, makeRT, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F } from '../engine/type';
import { Divergence } from '../engine/meter';
import { Meter3D } from '../engine/meter3d';
import { ease, lerp, prog, pulse } from '../engine/util';
import type { Word } from '../engine/lyrics';
import { Plate, charsOf, drawRun, lyricRail, romajiLine, shakeAt, frames, type Ch } from './_kit';
import { Glow } from './_glow';

// The threads' winding (see HOLE): outside RX a spiral of constant pitch, dφ/dln r = C0; inside, the plunge from the
// innermost stable orbit, whose dφ/dln r = 3√3·√r / (3 - r)^1.5 falls from C0 at RX to 1.8 at the horizon.
const C0 = 6.5;
const plungeC = (r: number) => 5.19615 * Math.sqrt(r) / Math.pow(3 - r, 1.5);
let RX = 2;
for (let lo = 1, hi = 2.99, k = 0; k < 40; k++) { RX = (lo + hi) / 2; if (plungeC(RX) < C0) lo = RX; else hi = RX; }
const WX = 3.4641 * Math.sqrt(RX / (3 - RX));
const DEEP = 1.6; // how far in the fall takes us (r_s)

/**
 * The whirl of threads, seen through the hole. For every pixel a ray from a camera `dcam` r_s out is carried along
 * a null geodesic of the Schwarzschild metric (x'' = -3/2 h² x / r⁵, r_s = 1) until it falls in or leaves; where
 * it first crosses the threads' plane the threads there are drawn (not the fainter images made by light that
 * went round the hole: too fine to draw as lines).
 * The threads are the paths of things falling in: outside, a tight spiral (dφ/dln r = C0); inside RX, exactly the
 * plunge from the innermost stable orbit, φ = 2√3·√(r / (3 - r)), which opens out and goes straight in. Each is a
 * hairline of constant width on screen (its distance in px from the screen-space gradient of the thread
 * coordinate); where they crowd closer than a pixel they run together into a glow. Beads of light run in along
 * them, faster nearer in, each with a tail behind it. Toward the horizon the light is redshifted: dimmer, redder,
 * gone at r = 1. `rs` sets the lens: the shadow's radius on screen (px) from 30 r_s out. One tap a sub-frame (the lines are antialiased).
 */
const HOLE = /* glsl */ `
  uniform vec2 centre; uniform float rs, dcam, t, green, inc, roll;
  uniform vec2 waves[8]; // light going in through the threads: radius, strength
  uniform int ssTap;
  const float ROUT = 14.0, ARMS = 30.0, C0 = ${C0.toFixed(2)}, RX = ${RX.toFixed(5)}, WX = ${WX.toFixed(5)};
  vec3 starsky(vec3 d, float px) { // px: radians per pixel
    vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
    vec3 col = vec3(0.0);
    for (int l = 0; l < 2; l++) {
      float cs = l == 0 ? 0.011 : 0.03;
      vec2 g = sph / cs + float(l) * 17.3, cell = floor(g);
      float on = step(0.72, hash12(cell + 7.0));
      float dd = length(fract(g) - (0.15 + 0.7 * hash22(cell + 1.0))) * cs;
      float mag = pow(hash12(cell + 3.0), 3.0);
      col += C_BONE * on * (l == 0 ? 0.04 + 0.16 * mag : 0.1 + 0.5 * mag) * smoothstep(1.5 * px, 0.0, dd);
    }
    return col;
  }
  // The threads where a ray crosses their plane at h; hx, hy: how h changes per px across and down the screen;
  // fill: how bright they are where they run together.
  vec3 threads(vec2 h, vec2 hx, vec2 hy, float fill) {
    float r = length(h);
    if (r < 1.0 || r > ROUT) return vec3(0.0);
    float c = r < RX ? 5.19615 * sqrt(r) / pow(3.0 - r, 1.5) : C0;
    float wind = r < RX ? 3.4641 * sqrt(r / (3.0 - r)) : WX + C0 * log(r / RX);
    float s = ARMS / TAU * (atan(h.y, h.x) + wind + 0.2 * t);
    vec2 gh = ARMS / (TAU * r * r) * vec2(-h.y + c * h.x, h.x + c * h.y);
    float g = length(vec2(dot(gh, hx), dot(gh, hy))); // threads per px
    float id = mod(floor(s), ARMS);
    float h1 = hash12(vec2(id, 1.7)), h2 = hash12(vec2(id, 5.3)), h3 = hash12(vec2(id, 9.1)), h4 = hash12(vec2(id, 13.9));
    float r0 = ROUT * (0.5 + 0.5 * h3); // (each thread comes out of the dark at its own distance)
    float span = smoothstep(r0, r0 * 0.75, r) * step(0.25, h4);
    // beads: light running in along the thread, a tail behind each
    float p = fract((3.0 + floor(3.0 * h2)) * pow(r / ROUT, 1.5) + (0.2 + 0.1 * h3) * t + h1);
    float bead = exp(-p / 0.2) + exp(-(1.0 - p) / 0.012);
    float base = (0.1 + 0.24 * h2 * h2) * (0.65 + 0.35 * sin(log(r) * 7.0 + h1 * 40.0));
    float wv = 0.0;
    for (int j = 0; j < 8; j++) wv += waves[j].y * exp(-pow((r - waves[j].x) / (0.3 + 0.1 * r), 2.0));
    float fall = 1.3 * pow(1.0 - 1.0 / r, 1.5); // (redshift)
    float lum = (base + 2.2 * bead * (0.4 + 0.6 * h1)) * span;
    float wpx = 0.75 + 0.45 * min(bead, 1.0);
    float line = 1.0 - smoothstep(wpx - 0.55, wpx + 0.55, abs(fract(s) - 0.5) / max(g, 1e-4));
    float I = mix(lum * line, fill * min(1.0, 1.4 * g) * smoothstep(ROUT, ROUT * 0.5, r), smoothstep(0.3, 0.7, g)) * (1.0 + wv) * fall;
    vec3 tint = mix(mix(C_BONE, C_EMBER, 0.35 + 0.65 * h2), vec3(1.0, 0.96, 0.88), 0.6 * min(bead, 1.0));
    return mix(C_BLOOD * 2.2, tint, smoothstep(1.0, 2.9, r)) * I;
  }
  void main() {
    vec2 fp = (gl_FragCoord.xy + (ssTap < 0 ? vec2(0.0) : rgss(ssTap))) / PX_SCALE;
    vec2 p = vec2(fp.x, ${H}.0 - fp.y) - centre;
    p.y = -p.y; // y up
    float rpx = length(p);
    float cr = cos(roll), sr = sin(roll);
    p = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);
    float F = rs / 0.0854; // (from 30 r_s out the shadow's edge is 4.88° from the axis)
    float ci = cos(inc), si = sin(inc);
    vec3 fw = -vec3(0.0, si, ci), x = -dcam * fw;
    vec3 v = normalize(fw + (p.x * vec3(1.0, 0.0, 0.0) + p.y * vec3(0.0, ci, -si)) / F);
    v = normalize(v - fw * dot(v, fw) * (1.0 - sqrt((1.0 - 1.0 / dcam) / (1.0 - 1.0 / 30.0)))); // (deeper in, lengths along the fall are stretched: we see wider)
    vec3 hv = cross(x, v);
    float h2 = dot(hv, hv);
    vec2 c1 = vec2(0.0); // where the ray first crosses the plane
    float n = 0.0;
    bool caught = false;
    for (int i = 0; i < 420; i++) {
      float r2 = dot(x, x);
      if (r2 < 1.0) { caught = true; break; }
      if (r2 > 1600.0 && dot(x, v) > 0.0) break;
      float r = sqrt(r2);
      float dt = clamp((r < 4.0 ? 0.035 : 0.06) * r, 0.02, 1.5); // (finer where light goes round the hole)
      v += -1.5 * h2 * x / (r2 * r2 * r) * dt;
      vec3 xn = x + v * dt;
      if (x.y * xn.y < 0.0) {
        if (n == 0.0) c1 = mix(x, xn, x.y / (x.y - xn.y)).xz;
        n = 1.0;
      }
      x = xn;
    }
    vec2 c1x = dFdx(c1) * PX_SCALE, c1y = dFdy(c1) * PX_SCALE;
    float whole = 1.0 - step(0.5, abs(dFdx(n)) + abs(dFdy(n))); // (no gradient where the next pixel's ray never crossed)
    vec3 col = vec3(0.0);
    if (n > 0.0) col += whole * threads(c1, c1x, c1y, 0.12);
    if (!caught) col += starsky(normalize(v), 1.0 / F);
    // when the meter lands the shadow's edge flares green
    col += C_PHOSPHOR * 3.5 * green * exp(-pow((rpx - rs) / (1.2 + rs * 0.004), 2.0));
    fragColor = vec4(col, 1.0);
  }`;

/** The traced light and its glow, rolled off to white under the post chain's bloom threshold (that bloom is left to the meter). */
const DEVELOP = /* glsl */ `
  uniform sampler2D hole, glow; uniform float gain;
  void main() {
    vec3 c = (texture(hole, vUv).rgb + texture(glow, vUv).rgb) * gain;
    const float M = 1.3;
    fragColor = vec4(M * (1.0 - exp(-c / M)), 1.0);
  }`;

export default class Horizon extends Plate {
  L = new Layer2D();
  hole = new FSPass(HOLE, { centre: { value: [W / 2, H / 2] }, rs: { value: 150 }, dcam: { value: 30 }, t: { value: 0 }, green: { value: 0 }, inc: { value: 0.3 }, roll: { value: 0 }, ssTap: SS_TAP, waves: { value: Array.from({ length: 8 }, () => new THREE.Vector2(99, 0)) } });
  traced = makeRT(W, H, { depthBuffer: false });
  glow = new Glow(6);
  develop = new FSPass(DEVELOP, { hole: { value: null }, glow: { value: null }, gain: { value: 1 } });
  bg = new FSPass(/* glsl */ `void main() { fragColor = vec4(0.0, 0.0, 0.0, 1.0); }`);
  meter = new Meter3D({ brightness: 10 });
  div!: Divergence;
  fall: Ch[] = []; // 飲み込まれてゆく
  obs: Ch[] = []; // 孤独の観測者
  fallW: Word[] = []; obsW: Word[] = []; // (their words, for the romaji)
  tWide = 0; tKan = 0; tSha = 0;

  override init() {
    const { lyrics, audio } = this.ctx;
    this.div = new Divergence(lyrics, audio);
    const l = this.myLine();
    this.fall = charsOf([l.words[0]!]);
    this.obs = charsOf([l.words[1]!]);
    this.fallW = [l.words[0]!]; this.obsW = [l.words[1]!];
    this.tWide = this.B.t(this.B.at(this.obs[0]!.t) - 2); // two beats before 孤
    this.tKan = this.act === 'sg' ? this.div.land2T : this.div.landT; // 観 (Act I: settles 0.571046; Act III: lands 1.048596)
    this.tSha = this.obs[5]!.t; // 者
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const ph = this.div.state(t).phosphor;
    const green = t >= this.tKan ? ph : 0;
    if (t >= this.tKan) return this.meterShot(t, out, green);

    // First we look down into the whirl, drifting closer; then (two beats before 孤) we let go and fall in, with no
    // cut: faster and faster, turning with the whirl, until the dark is the whole frame. The fall takes up the
    // drift's speed where it left off.
    const lt = t - this.ctx.start, TA = this.tWide - this.ctx.start, push = prog(t, this.ctx.start, this.tWide);
    const tau = Math.max(0, t - this.tWide), TB = this.tKan - this.tWide, u = tau / TB;
    const v0 = 30 * (2 * 40 / 190 + 0.12 / 1.06) / TA, tIn = 0.8 * TB, acc = (30 - DEEP - v0 * tIn) / (tIn * tIn);
    const dcam = Math.max(DEEP, 30 - v0 * tau - acc * tau * tau); // (how far out we are, r_s: the dark fills the frame from about 6)
    const k = ease.inOutQuad(prog(u, 0, 0.6));
    (this.hole.u.centre!.value as number[]).splice(0, 2, lerp(W / 2 + 30, W / 2, k), lerp(H / 2 - 50, 500, k));
    this.hole.u.rs!.value = lerp(150, 190, ease.inQuad(push));
    this.hole.u.dcam!.value = dcam;
    this.hole.u.t!.value = lt;
    this.hole.u.inc!.value = lerp(0.8, 0.62, push) - 0.045 * (1 - Math.exp(-tau / 0.5));
    this.hole.u.roll!.value = lerp(-0.16, -0.06, push) + (0.1 / TA) * tau + 0.14 * tau * tau;
    this.hole.u.green!.value = 0;
    // 飲み込まれてゆく: on every syllable a wave of light starts out in the threads and goes in, faster and faster; at the horizon it is gone
    const waves = this.hole.u.waves!.value as THREE.Vector2[];
    waves.forEach((w) => w.set(99, 0));
    this.fall.slice(0, 8).forEach((x, i) => {
      const age = t - x.t, a = age / 1.15;
      if (a > 0 && a < 1) waves[i]!.set(1 + 8.5 * (1 - Math.pow(a, 1.7)), 1.2 * Math.min(1, age / 0.1) * (1 - prog(a, 0.8, 1)));
    });
    this.hole.render(renderer, this.traced);
    this.develop.u.hole!.value = this.traced.texture;
    this.develop.u.glow!.value = this.glow.render(renderer, this.traced.texture, [0.5, 0.42, 0.3, 0.18, 0.09, 0.04], 0.55, 0.4);
    this.develop.u.gain!.value = 1;
    this.develop.render(renderer, out);

    // in there, in the dark: the observer. The meter comes up out of the middle of the hole as we fall toward it
    const near = prog(u, 0.5, 1);
    if (near > 0) {
      const far = 1 + 8 * Math.pow(1 - near, 2);
      this.meter.update(this.div.state(t));
      this.meter.render(renderer, comp, out, this.meter.view([1.8 * far, -10.8 * far, 2.2 * far], [0, 0, 1.1], 30), { opacity: prog(u, 0.5, 0.72) });
    }
    const c = this.L.ctx;
    this.L.clear();
    if (tau < 0.3) {
      c.filter = `opacity(${1 - tau / 0.3})`; // (the first words leave as we let go)
      lyricRail(c, this.fallW, t, this.act);
      c.filter = 'none';
    }
    if (tau > 0) this.drawObserver(c, t, green);
    comp.draw(renderer, this.L.upload(), out);

    const j = Math.max(...[...this.fall, ...this.obs].map((x) => pulse(t, x.t, 0.05)));
    const dark = prog(u, 0.72, 1); // (by now only the meter is lit: hand over to its own bloom)
    return {
      shake: shakeAt(t, 7 * j),
      bloom: lerp(0.5, 0.85, dark), bloomThreshold: lerp(1.6, 0.7, dark), bloomKnee: 0.3, halation: 0.1, // (the hole has its own glow and stays under this threshold: the dark must stay black)
      ca: 0.5 + 0.5 * push + 0.8 * u,
      zoom: 1 + 0.06 * ease.inQuad(push),
      invert: frames(t, this.fall[0]!.t, 2) ? 1 : 0,
    };
  }

  /** 孤独の観測者: Mincho, along the bottom, from the fall on. */
  private drawObserver(c: CanvasRenderingContext2D, t: number, green: number) {
    romajiLine(c, this.obsW, t, { x: W / 2, y: H - 82, align: 'center', ink: rgba('bone'), accent: rgba('nixie') });
    drawRun(c, this.obs, t, { x: W / 2, y: H - 150, size: 84, family: F.mincho(800), align: 0.5, gap: 0.06, fill: rgba('bone'), fillOf: (i) => (i === 3 ? rgba(green > 0.05 ? 'phosphor' : 'nixie') : null) });
  }

  /** In the dark. On 観 the meter lands (Act III: on 1.048596, and flares phosphor); after 者 we draw back from it: the observer, alone. */
  private meterShot(t: number, out: THREE.WebGLRenderTarget, green: number): PostOverrides {
    const { renderer, comp } = this.ctx;
    this.bg.render(renderer, out);
    const u = prog(t, this.tKan, this.tSha);
    this.meter.update(this.div.state(t));
    const e = ease.outCubic(u), back = 1 + 1.2 * ease.inOutQuad(prog(t, this.tSha, this.ctx.end));
    const mc = this.meter.view([lerp(1.8, 0.9, e) * back, lerp(-10.8, -9.6, e) * back, lerp(2.2, 2.7, e) * back], [0, 0, 1.1], 30);
    this.meter.render(renderer, comp, out, mc);
    const c = this.L.ctx;
    this.L.clear();
    this.drawObserver(c, t, green);
    comp.draw(renderer, this.L.upload(), out);
    return { bloom: 0.85, bloomThreshold: 0.7, shake: shakeAt(t, 18 * pulse(t, this.tKan, 0.07)), flash: 0.15 * pulse(t, this.tKan, 0.05) * green, ca: 0.5, fade: 0.35 * prog(t, this.ctx.end - 0.4, this.ctx.end) };
  }
}
