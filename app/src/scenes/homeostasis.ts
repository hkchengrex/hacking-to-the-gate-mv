// `homeostasis` — #08 夢幻のホメオスタシス, 『無限』に広がる夢も 描く未来も (docs/DESIGN.md). A set point, and what it does to whatever is thrown at it. Each step toward it a thing comes a
// fixed part nearer and goes a quarter of the way round, and a little more: so its path is a frame inside a frame
// inside a frame, each smaller and turned a little, winding inward without end. We dive into the point, steadily,
// and never arrive: the frames open out past the edges and there are always more inside (the lyric's own brackets, as thread). On every sung character something new is thrown in from the edge, and winds down into the
// same point as everything else.
// `finite` (Act II, #09 幻相のホメオスタシス, 『無限』と信じた愛も 空の彼方も) is the same in crimson and cold, failing:
// the infinity was believed, not real. The frames have an innermost one; before 空 it comes into sight with nothing
// inside it, the dive stops, the threads go out past the edges, and behind them there is only the night sky, a
// satellite's light crossing it.
// One smooth move; no text but the lyric; nothing jolts.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { LineBatch } from '../engine/lines';
import { clamp, hash } from '../engine/util';
import { Plate, charsOf, lyricRail, type Ch } from './_kit';
import { Dark } from './_sky';

/** The pull: each step this part of the way left (RHO), and this far round (a quarter turn and a little). */
const RHO = 0.966, TURN = Math.PI / 2, TH = TURN + 0.07, LNR = -Math.log(RHO);
/** Steps a second the newest thread is drawn at. */
const VH = 64;
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export default class Homeostasis extends Plate {
  dark = new Dark();
  lines = new LineBatch(30000, { blend: 'add' });
  L = new Layer2D();
  chars: Ch[] = [];
  b0 = 0; tb0 = 0; per = 0.4; tSora = 1e9;

  override init() {
    const { start, end } = this.ctx;
    this.b0 = Math.round(this.B.at(start + 0.01));
    this.tb0 = this.B.t(this.b0);
    const n = Math.round(this.B.at(end - 0.01)) - this.b0 + 1;
    this.per = (this.B.t(this.b0 + n) - this.tb0) / n;
    this.chars = charsOf(this.lineWords);
    if (this.act === 'b') this.tSora = (this.lineWords[1] ?? this.lineWords[0]!).start; // 空の彼方も
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp, end } = this.ctx;
    const b = this.act === 'b';
    const lt = t - this.tb0;
    // the dive: half as far again every beat; β: it comes to a stop at 空 (there was a bottom), then drifts
    const rate = Math.log(1.5) / this.per, lS = this.tSora - this.tb0;
    const dive = (s: number) => (b ? (s < lS - 1.2 ? s : lS - 1.2 + 1.2 * (1 - Math.exp(-(s - lS + 1.2) / 1.2)) + 0.5 * Math.max(0, s - lS) * 0.35) : s);
    const zoom = (s: number) => Math.exp(rate * dive(s));
    const Z = zoom(lt), rot = -(TH - TURN) * 0.86 * (rate / LNR) * dive(lt);
    const cx = b ? W / 2 - 150 : W / 2 + 120, cy = H / 2 - 30;
    this.dark.render(renderer, out, b ? [0.0018, 0.0006, 0.0005] : [0.0045, 0.0018, 0.0006]);

    const L = this.lines;
    L.clear();
    // β: the threads let go after 空, and the sky comes up behind them
    const gone = b ? smoother(clamp((t - this.tSora + 0.2) / 2.2)) : 0;
    if (b) for (let i = 0; i < 420; i++) {
      const g = (0.25 + 0.75 * hash(i, 3)) * smoother(clamp((t - this.tSora) / 1.6)) * (0.6 + 0.4 * Math.sin(lt * (1 + 2 * hash(i, 4)) + i));
      const x = hash(i, 1) * W, y = hash(i, 2) * H;
      L.seg(x, y, 0, x, y + 0.01, 0, 1.2 + 1.6 * hash(i, 5), LIN.cold[0] * g * 1.4, LIN.cold[1] * g * 1.4, LIN.cold[2] * g * 1.4, 1);
    }
    /**
     * A thread: the steps from n0 to n1 of the path that starts r0 out at angle a0 (step n is r0·RHO^n out, n·TH
     * round), joined by straight lines, of which those on screen are drawn; `lum(n)` is each one's brightness.
     */
    const thread = (r0: number, a0: number, n0: number, n1: number, col: readonly number[], width: number, lum: (n: number) => number) => {
      // on screen: from 1700 px out down to 8 px
      const lo = Math.max(n0, Math.ceil(Math.log((Z * r0) / 1700) / LNR)), hi = Math.min(n1, Math.floor(Math.log((Z * r0) / 8) / LNR));
      let px = 0, py = 0;
      for (let n = lo; n <= hi; n++) {
        const r = Z * r0 * Math.pow(RHO, n) * (1 + 3 * gone * gone), a = a0 + n * TH + rot;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (n > lo) {
          const g = lum(n) * (1 - gone) * clamp(Math.hypot(x - px, y - py) / 150); // (the small frames deep in are faint: no blaze at the point)
          if (g > 0.004) L.seg(px, py, 0, x, y, 0, width, col[0]! * g, col[1]! * g, col[2]! * g, 1);
        }
        px = x; py = y;
      }
    };
    // what was always there: two threads, without beginning (β: with an end, the innermost frame)
    const pale = b ? LIN.cold : LIN.bone, hot = b ? LIN.crimson : LIN.nixie, warm = b ? LIN.crimson : LIN.ember;
    const bottom = b ? Math.floor(Math.log((zoom(lS - 0.9) * 1) / 210) / LNR) : 1e9; // (its innermost frame is some 210 px out when the dive stops)
    for (let k = 0; k < 2; k++) thread(Math.pow(RHO, k / 2), k * (TURN / 2), -1e9, bottom, pale, 1, (n) => (k ? 0.12 : 0.24) * (0.6 + 0.4 * Math.sin(n * 0.21 + k * 2)));
    // what is thrown in: one on every sung character, from the edge, winding down to the point
    this.chars.forEach((x, i) => {
      const age = t - x.t;
      if (age < 0 || age > 7 || t > this.tSora + 2.5) return;
      const r0 = 1280 / zoom(x.t - this.tb0), a0 = hash(i, 7) * 6.283, head = age * VH;
      const fade = 1 - smoother(clamp((age - 1.3) / 2.6));
      thread(r0, a0, 0, Math.min(Math.floor(head), bottom === 1e9 ? 1e9 : bottom - Math.floor(Math.log(r0) / -LNR)), i % 2 ? warm : hot, 1.5, (n) => fade * (0.05 + 1.3 * Math.exp(-(head - n) / 18)));
      // its light, at the thread's end
      const n = Math.floor(head), fr = head - n, at = (m: number): [number, number] => {
        const r = Z * r0 * Math.pow(RHO, m), a = a0 + m * TH + rot;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      };
      const [x0, y0] = at(n), [x1, y1] = at(n + 1), hx = x0 + (x1 - x0) * fr, hy = y0 + (y1 - y0) * fr;
      const g = fade * clamp((Z * r0 * Math.pow(RHO, head)) / 14) * (1 - gone);
      if (g > 0.01 && (bottom === 1e9 || age < 2.4)) {
        L.seg(hx - 0.01, hy, 0, hx + 0.01, hy, 0, 7, LIN.bone[0] * 2.2 * g, LIN.bone[1] * 2.2 * g, LIN.bone[2] * 2.2 * g, 1);
      }
    });
    // the point itself (β: nothing there)
    if (!b) L.seg(cx - 0.01, cy, 0, cx + 0.01, cy, 0, 7, LIN.nixie[0] * 2.0, LIN.nixie[1] * 2.0, LIN.nixie[2] * 2.0, 1);
    // β: the satellite's light, crossing the empty sky
    const s = b ? clamp((t - this.tSora - 0.7) / (end - this.tSora - 0.7)) : 0;
    if (s > 0) {
      const x = 260 + 1150 * s, y = 300 - 90 * s, g = 1.8 * clamp(s * 8);
      L.seg(x - 0.01, y, 0, x + 0.01, y, 0, 4.5, LIN.bone[0] * g, LIN.bone[1] * g, LIN.bone[2] * g, 1);
    }
    L.render(renderer, out);

    const c = this.L.ctx;
    this.L.clear();
    lyricRail(c, this.lineWords, t, this.act, b ? {} : { ink: rgba('bone') });
    comp.draw(renderer, this.L.upload(), out);
    return { vignette: b ? 0.5 : 0.3, bloom: 0.7, bloomThreshold: 0.8 };
  }
}
