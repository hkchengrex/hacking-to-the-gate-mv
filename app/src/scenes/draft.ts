// `draft` — the stand-in for a plate that is not built yet (docs/DESIGN.md, Technical conventions):
// the plate's slate, its act's field, a reframe on every beat, the world line across the frame, the
// plate's id where its picture will be, and its lyric in the act's rail, so the whole cut can be checked
// for pace before every plate exists.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, FSPass, W, H } from '../engine/gl';
import { LIN, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { ease, prog, pulse } from '../engine/util';
import { Plate, ACTS, lyricRail, monoText, rnd, shakeAt } from './_kit';

export default class Draft extends Plate {
  L = new Layer2D();
  bg = new FSPass(/* glsl */ `
    uniform vec3 col; void main() { fragColor = vec4(col, 1.0); }`, { col: { value: [0, 0, 0] } });
  words: Word[] = [];

  override init() {
    const { lyrics, start, end } = this.ctx;
    this.words = lyrics.words.filter((w) => w.start >= start - 0.3 && w.start < end - 0.05);
  }

  draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const { renderer, comp } = this.ctx;
    const field = this.act === 'b' ? LIN.ink.map((v) => v * 0.6) : this.act === 'sg' ? LIN.ink2 : LIN.ink;
    (this.bg.u.col!.value as number[]).splice(0, 3, ...field);
    this.bg.render(renderer, out);

    const b = this.B.at(t), bt = this.B.t(b);
    const k = ease.outExpo(prog(t, bt, bt + 0.18));
    const s = 1 + 0.06 * (rnd(b, 1) * (1 - k) + rnd(b + 1, 1) * k);
    const c = this.L.ctx;
    this.L.clear();
    c.save();
    c.translate(W / 2, H / 2 - 60);
    c.scale(s, s);
    c.font = font(F.archivo(125, 900), 120);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = rgba(ACTS[this.act].accent, 0.85);
    c.fillText(this.ctx.id.toUpperCase(), 0, 0);
    c.restore();
    c.fillStyle = rgba('ash');
    c.textBaseline = 'alphabetic';
    monoText(c, `DRAFT · #${this.ep.no} ${this.ep.ja} · ${ACTS[this.act].tag}`, W / 2, H / 2 + 40, 20, 500, 'center');
    // the world line, its head running across on each bar
    const bar = f.bar - Math.floor(f.bar);
    c.fillStyle = rgba(ACTS[this.act].accent, 0.9);
    c.fillRect(0, H / 2 + 90, W * ease.outCubic(bar), 3);
    if (this.words.length) lyricRail(c, this.words, t, this.act);
    comp.draw(renderer, this.L.upload(), out);
    const first = this.words.map((w) => w.start).filter((x) => x <= t).pop() ?? -9;
    return { shake: shakeAt(t, 8 * pulse(t, first, 0.06)) };
  }
}
