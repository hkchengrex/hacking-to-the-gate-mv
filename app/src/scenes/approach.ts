// `approach` — #07 断層のダイバージェンス (Steins;Gate), the solo's last plate (docs/DESIGN.md).
// The meter, spinning through every value the video has passed, in macro shots cut on every beat (on the 8ths
// in the last bar); then the light of the gate: a white seam opens across the frame and floods it, into the
// silence of the breakdown.
import * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { Divergence } from '../engine/meter';
import { Meter3D } from '../engine/meter3d';
import { ease, hash, prog, pulse } from '../engine/util';
import { Plate, monoText, shakeAt } from './_kit';

export default class Approach extends Plate {
  bg = new FSPass(/* glsl */ `void main() { fragColor = vec4(0.0, 0.0, 0.0, 1.0); }`);
  light = new FSPass(/* glsl */ `
    uniform float open;
    void main() {
      vec2 p = vec2(FRAG_PX.x, ${H}.0 - FRAG_PX.y);
      float d = abs(p.y - ${H / 2}.0 - (p.x - ${W / 2}.0) * 0.12);
      float w = open * ${H}.0 * 0.7;
      float a = smoothstep(w + 40.0, w - 10.0, d) + 0.6 * exp(-max(d - w, 0.0) / 60.0) * step(0.001, open);
      fragColor = vec4(vec3(1.0, 0.94, 0.86) * 3.0 * a, a);
    }`, { open: { value: 0 } }, { transparent: true, blending: THREE.AdditiveBlending });
  meter = new Meter3D({ brightness: 11 });
  div!: Divergence;
  L = new Layer2D();
  b0 = 0; tOpen = 0;

  override init() {
    const { lyrics, audio, end } = this.ctx;
    this.div = new Divergence(lyrics, audio);
    this.b0 = this.B.at(this.ctx.start + 0.01);
    this.tOpen = end - 1.6;
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, end } = this.ctx;
    this.bg.render(renderer, out);
    this.meter.update(this.div.state(t));
    const fast = t >= this.B.t(this.b0 + 12);
    const idx = fast ? this.B.at8(t) : this.B.at(t);
    const tShot = fast ? this.B.t(idx / 2) : this.B.t(idx);
    const u = prog(t, tShot, tShot + (fast ? 0.186 : 0.373));
    const pitch = (this.meter.width - 0.3) / 8;
    const tube = Math.floor(hash(idx, 62) * 8), tx = (tube - 3.5) * pitch;
    const presets: [number[], number[], number][] = [
      [[tx - 0.9 + 0.3 * u, -2.6, 1.6], [tx, 0, 1.25], 34],
      [[tx + 1.2, -1.9 + 0.2 * u, 0.7], [tx, 0, 1.4], 40],
      [[-4.6 + 1.2 * u, -3.2, 1.8], [0, 0, 1.1], 26],
      [[3.4 - 0.8 * u, -5.5, 1.0], [0.5, 0, 1.2], 28],
      [[0, -11 + 1.2 * u, 2.4], [0, 0, 1.12], 30],
    ];
    const [p, tg, fov] = presets[Math.floor(hash(idx, 61) * presets.length)]!;
    this.meter.render(renderer, comp, out, this.meter.view(p as [number, number, number], tg as [number, number, number], fov));
    // the gate's light opening
    const open = ease.inCubic(prog(t, this.tOpen, end));
    this.light.u.open!.value = open;
    if (open > 0) this.light.render(renderer, out);
    const cut = pulse(t, tShot, 0.05);
    return { shake: shakeAt(t, 7 * cut), ca: 0.5 + 2 * cut, bloom: 0.8, bloomThreshold: 0.7, flash: 0.5 * open * open };
  }
}
