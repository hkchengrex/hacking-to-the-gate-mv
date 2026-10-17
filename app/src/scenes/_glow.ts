// A scene's own glow: a pyramid of blurs of what is brighter than a threshold, each level with its own weight.
// (The post chain's bloom weighs all its levels alike, which fogs the whole frame when a large part of it is
// bright; a light that must leave the dark beside it dark wants most of its glow close in.)
import * as THREE from 'three';
import { FSPass, makeRT, W, H, SCALE } from '../engine/gl';

export class Glow {
  private mips: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];
  private pre = new FSPass(/* glsl */ `
    uniform sampler2D src; uniform vec2 texel; uniform float threshold, knee;
    void main() {
      // box downsample (4x4 logical px) + soft threshold on the brightest channel
      const int N = ${SCALE * 2};
      vec3 c = vec3(0.0);
      for (int j = 0; j < N; j++) for (int i = 0; i < N; i++)
        c += texture(src, vUv + texel * (vec2(float(i), float(j)) * 2.0 - float(N - 1)) / PX_SCALE).rgb;
      c = min(c / float(N * N), vec3(60.0));
      float l = max(c.r, max(c.g, c.b));
      float rq = clamp(l - threshold + knee, 0.0, 2.0 * knee);
      rq = rq * rq / (4.0 * knee + 1e-5);
      fragColor = vec4(c * max(rq, l - threshold) / max(l, 1e-5), 1.0);
    }`, { src: { value: null }, texel: { value: new THREE.Vector2(1 / W, 1 / H) }, threshold: { value: 1 }, knee: { value: 0.5 } });
  private down = new FSPass(/* glsl */ `
    uniform sampler2D src; uniform vec2 texel;
    void main() {
      // 13-tap downsample (Jimenez 2014)
      vec3 a = texture(src, vUv + texel * vec2(-2, -2)).rgb, b = texture(src, vUv + texel * vec2(0, -2)).rgb, c = texture(src, vUv + texel * vec2(2, -2)).rgb;
      vec3 d = texture(src, vUv + texel * vec2(-1, -1)).rgb, e = texture(src, vUv + texel * vec2(1, -1)).rgb;
      vec3 f = texture(src, vUv + texel * vec2(-2, 0)).rgb, g = texture(src, vUv).rgb, h = texture(src, vUv + texel * vec2(2, 0)).rgb;
      vec3 i = texture(src, vUv + texel * vec2(-1, 1)).rgb, j = texture(src, vUv + texel * vec2(1, 1)).rgb;
      vec3 k = texture(src, vUv + texel * vec2(-2, 2)).rgb, l = texture(src, vUv + texel * vec2(0, 2)).rgb, m = texture(src, vUv + texel * vec2(2, 2)).rgb;
      fragColor = vec4((d + e + i + j) * 0.125 + (a + b + g + f) * 0.03125 + (b + c + h + g) * 0.03125 + (f + g + l + k) * 0.03125 + (g + h + m + l) * 0.03125, 1.0);
    }`, { src: { value: null }, texel: { value: new THREE.Vector2() } });
  private up = new FSPass(/* glsl */ `
    uniform sampler2D src; uniform sampler2D prev; uniform vec2 texel; uniform float wSrc, wPrev;
    void main() {
      // 9-tap tent upsample of the smaller level, added to this level (each with its weight)
      vec2 o = texel * 1.25;
      vec3 s = texture(src, vUv - o).rgb + 2.0 * texture(src, vUv + vec2(0, -o.y)).rgb + texture(src, vUv + vec2(o.x, -o.y)).rgb
        + 2.0 * texture(src, vUv + vec2(-o.x, 0)).rgb + 4.0 * texture(src, vUv).rgb + 2.0 * texture(src, vUv + vec2(o.x, 0)).rgb
        + texture(src, vUv + vec2(-o.x, o.y)).rgb + 2.0 * texture(src, vUv + vec2(0, o.y)).rgb + texture(src, vUv + o).rgb;
      fragColor = vec4(texture(prev, vUv).rgb * wPrev + s / 16.0 * wSrc, 1.0);
    }`, { src: { value: null }, prev: { value: null }, texel: { value: new THREE.Vector2() }, wSrc: { value: 1 }, wPrev: { value: 1 } });

  /** `levels` blurs, each twice as wide as the one before (the first about 4 px). The pyramid is in logical px at every output scale. */
  constructor(private levels = 6) {
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < levels; i++) {
      this.mips.push(makeRT(Math.max(2, w), Math.max(2, h), { depthBuffer: false, pxScale: 1 }));
      this.ups.push(makeRT(Math.max(2, w), Math.max(2, h), { depthBuffer: false, pxScale: 1 }));
      w >>= 1; h >>= 1;
    }
  }

  /** The glow of `src` (HDR linear): the sum over the levels of weights[i] × that level's blur of what exceeds `threshold`. */
  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, weights: number[], threshold = 1, knee = 0.5): THREE.Texture {
    const L = this.levels;
    this.pre.u.src!.value = src;
    this.pre.u.threshold!.value = threshold;
    this.pre.u.knee!.value = knee;
    this.pre.render(renderer, this.mips[0]!);
    for (let i = 1; i < L; i++) {
      const s = this.mips[i - 1]!;
      this.down.u.src!.value = s.texture;
      (this.down.u.texel!.value as THREE.Vector2).set(1 / s.width, 1 / s.height);
      this.down.render(renderer, this.mips[i]!);
    }
    for (let i = L - 2; i >= 0; i--) {
      const small = i === L - 2 ? this.mips[L - 1]! : this.ups[i + 1]!;
      this.up.u.src!.value = small.texture;
      this.up.u.prev!.value = this.mips[i]!.texture;
      (this.up.u.texel!.value as THREE.Vector2).set(1 / small.width, 1 / small.height);
      this.up.u.wSrc!.value = i === L - 2 ? weights[L - 1] ?? 0 : 1;
      this.up.u.wPrev!.value = weights[i] ?? 0;
      this.up.render(renderer, this.ups[i]!);
    }
    return this.ups[0]!.texture;
  }
}
