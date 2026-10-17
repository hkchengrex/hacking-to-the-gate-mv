// Shared pieces of the plates (docs/DESIGN.md): the episode slate flashed on every plate's cut
// (with its act's world line), the three acts and their looks, per-character karaoke slams in
// horizontal (yokogaki) and vertical (tategaki) setting, the lyric rail, beat helpers and flash frames.
// A plate extends `Plate` and implements draw(); the slate is laid over its first frames by the base class.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, fitSize, font, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { romajiParts } from '../engine/romaji';
import { clamp, ease, frameIdx, hash, noise1 } from '../engine/util';

export interface Episode { no: string; ja: string; en: string }

/** The episode titles (Wikipedia's "List of Steins;Gate episodes"), by number. */
const TITLES: Record<string, [ja: string, en: string]> = {
  '01': ['始まりと終わりのプロローグ', 'TURNING POINT'],
  '02': ['時間跳躍のパラノイア', 'TIME TRAVEL PARANOIA'],
  '03': ['並列過程のパラノイア', 'PARALLEL WORLD PARANOIA'],
  '04': ['空理彷徨のランデヴー', 'INTERPRETER RENDEZVOUS'],
  '05': ['電荷衝突のランデヴー', 'STARMINE RENDEZVOUS'],
  '06': ['蝶翼のダイバージェンス', 'BUTTERFLY EFFECT’S DIVERGENCE'],
  '07': ['断層のダイバージェンス', 'DIVERGENCE SINGULARITY'],
  '08': ['夢幻のホメオスタシス', 'CHAOS THEORY HOMEOSTASIS I'],
  '09': ['幻相のホメオスタシス', 'CHAOS THEORY HOMEOSTASIS II'],
  '10': ['相生のホメオスタシス', 'CHAOS THEORY HOMEOSTASIS III'],
  '11': ['時空境界のドグマ', 'DOGMA IN EVENT HORIZON'],
  '12': ['静止限界のドグマ', 'DOGMA IN ERGOSPHERE'],
  '13': ['形而上のネクローシス', 'METAPHYSICS NECROSIS'],
  '14': ['形而下のネクローシス', 'PHYSICALLY NECROSIS'],
  '15': ['亡環上のネクローシス', 'MISSING LINK NECROSIS'],
  '16': ['不可逆のネクローシス', 'SACRIFICIAL NECROSIS'],
  '17': ['虚像歪曲のコンプレックス', 'MADE IN COMPLEX'],
  '18': ['自己相似のアンドロギュノス', 'FRACTAL ANDROGYNOUS'],
  '19': ['無限連鎖のアポトーシス', 'ENDLESS APOPTOSIS'],
  '20': ['怨嗟断絶のアポトーシス', 'FINALIZE APOPTOSIS'],
  '21': ['因果律のメルト', 'PARADOX MELTDOWN'],
  '22': ['存在了解のメルト', 'BEING MELTDOWN'],
  '23': ['境界面上のシュタインズゲート', 'OPEN THE STEINS GATE'],
  '23β': ['ゼロ除算', 'DIVIDE BY ZERO'],
  '24': ['終わりと始まりのプロローグ', 'ACHIEVEMENT POINT'],
  '25': ['横行跋扈のポリオマニア', 'EGOISTIC PORIOMANIA'],
};

/** Each plate's episode, by timeline id. An idea that returns in a later act repeats its number. */
const PLATE_EP: Record<string, string> = {
  // Act I (α)
  prologue: '01', timeleap: '02', heartbeat: '14', magnitude: '13', irreversible: '16', butterfly: '06',
  homeostasis: '08', complex: '17', ergosphere: '12', fault: '07', gate: '23', zero: '23β', parallel: '03',
  starmine: '05', apoptosis: '19', horizon: '11',
  // Act II (β)
  pond: '21', chain: '15', flatline: '22', farce: '04', sern: '25', theorems: '18', finite: '09', virtual: '17',
  merciless: '12', choice: '07', hook2: '23',
  // Act III (Steins;Gate)
  members: '10', reading: '16', trick: '21', coat: '11', launch: '02', fields: '06', arrival: '01', wound: '14',
  deceive: '13', approach: '07', silence: '23β', converge: '03', reunion: '05', loopbreak: '20', landing: '23',
  achievement: '24',
};

export function episodeOf(id: string): Episode {
  const no = PLATE_EP[id];
  const t = no ? TITLES[no] : undefined;
  return t ? { no: no!, ja: t[0], en: t[1] } : { no: '??', ja: id, en: id.toUpperCase() };
}

/** The three acts (docs/DESIGN.md): α sets up, β fails, Steins;Gate breaks through. */
export type Act = 'a' | 'b' | 'sg';
export const ACTS: Record<Act, { name: string; tag: string; accent: string }> = {
  a: { name: 'α', tag: 'WORLD LINE α', accent: 'nixie' },
  b: { name: 'β', tag: 'WORLD LINE β', accent: 'crimson' },
  sg: { name: 'STEINS;GATE', tag: 'STEINS;GATE', accent: 'phosphor' },
};

/** Frames the slate covers at the start of a plate (60 fps). */
export const SLATE_FRAMES = 4;

/**
 * The episode title card: ink on bone, number in the act's accent, Japanese in Mincho, English in
 * Archivo extended, the act's world line in mono.
 */
export class Slate {
  L = new Layer2D();
  constructor(ep: Episode, act: Act = 'a') {
    const c = this.L.ctx;
    this.L.clear(rgba('bone'));
    const x0 = 120, maxW = W - 240;
    const ja = F.mincho(800), en = F.archivo(125, 700), no = F.archivo(125, 900);
    const sJa = Math.min(210, fitSize(ep.ja, ja, maxW));
    const sEn = Math.min(46, fitSize(ep.en, en, maxW, 46, 6));
    const accent = act === 'sg' ? '#2E8F28' : ACTS[act].accent; // (phosphor is too light on bone: its dark green)
    c.textBaseline = 'alphabetic';
    c.fillStyle = rgba(accent);
    c.font = font(no, 120);
    c.fillText(`#${ep.no}`, x0, 290);
    const nw = c.measureText(`#${ep.no}`).width;
    c.font = font(F.mono(500), 30);
    c.fillText(ACTS[act].tag, x0 + nw + 40, 290);
    c.fillStyle = rgba('ink');
    c.fillRect(x0, 340, maxW, 3);
    c.font = font(ja, sJa);
    c.fillText(ep.ja, x0, 360 + sJa * 0.98);
    c.font = font(en, sEn);
    (c as any).letterSpacing = '6px';
    c.fillText(ep.en, x0, 360 + sJa * 0.98 + 40 + sEn);
    (c as any).letterSpacing = '0px';
    c.font = font(F.mono(400), 18);
    c.fillStyle = rgba('ash');
    c.fillText('STEINS;GATE · HACKING TO THE GATE', x0, H - 120);
    this.L.upload();
  }
}

/** One sung character and its start time. */
export interface Ch { ch: string; t: number; word: Word }

/** The characters of some words with their sung starts (`syl`; evenly spread over the word without it). */
export function charsOf(words: Word[]): Ch[] {
  const out: Ch[] = [];
  for (const w of words) {
    const cs = Array.from(w.w);
    cs.forEach((ch, i) => out.push({ ch, t: w.syl?.[i]?.[0] ?? w.start + ((w.end - w.start) * i) / cs.length, word: w }));
  }
  return out;
}
export const lineChars = (l: Line) => charsOf(l.words);

/** Scale of a slam that hit at t0: 1 + amt falling to 1 over dur (outExpo); 0 before t0. */
export function slam(t: number, t0: number, amt = 0.35, dur = 0.12) {
  if (t < t0) return 0;
  return 1 + amt * (1 - ease.outExpo(clamp((t - t0) / dur)));
}

/**
 * Kurisu, as a point: the crimson charge of `starmine`, a glowing disc with a thin
 * ring round it. `a` fades her; `hit` (0..1) swells the ring, on a beat.
 */
export function herPoint(c: CanvasRenderingContext2D, x: number, y: number, r = 24, a = 1, hit = 0) {
  c.save();
  c.globalAlpha = a;
  c.shadowColor = rgba('crimson');
  c.shadowBlur = r * 1.6;
  c.fillStyle = rgba('crimson');
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = rgba('crimson', 0.85);
  c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, r * (1.8 + 0.6 * hit), 0, Math.PI * 2); c.stroke();
  c.restore();
}

/** True during the first n output frames from t0 (constant over a frame's motion-blur shutter). */
export function frames(t: number, t0: number, n = 2) {
  const d = frameIdx(t) - frameIdx(t0);
  return t >= t0 - 0.5 / 60 && d >= 0 && d < n;
}

/** Deterministic shake offset (px) for amplitude amp at t. */
export function shakeAt(t: number, amp: number, seed = 1): [number, number] {
  const fi = frameIdx(t);
  return [noise1(fi * 0.71, seed) * amp, noise1(fi * 0.67, seed + 9) * amp * 0.8];
}

// characters set rotated (90°) in vertical text, and small kana nudged toward the upper right
const V_ROT = new Set(['『', '』', '「', '」', '（', '）', '(', ')', 'ー', '〜', '…', '－']);
const SMALL = new Set(['っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ッ', 'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ']);

export interface RunOpts {
  /** Anchor: for 'h' the run's left edge (scaled by `align`) and its vertical centre; for 'v' the column's centre x and top (scaled by `align`). */
  x: number; y: number;
  size: number;
  family: string;
  dir?: 'h' | 'v';
  /** Extra advance between characters, as a fraction of size. */
  gap?: number;
  /** 0 = anchor at the start of the run, 0.5 centred, 1 at its end. */
  align?: number;
  fill?: string;
  /** Unsung characters drawn at this alpha in `dimFill` (0 = not drawn). */
  dim?: number;
  dimFill?: string;
  /** Slam size and duration. */
  amt?: number; dur?: number;
  /** Per-character fill override (e.g. the sung one in nixie). */
  fillOf?: (i: number, age: number) => string | null;
  /** Per-character extra transform: [dx, dy, rotation, scale]. */
  xf?: (i: number, age: number) => [number, number, number, number];
}

/** Advance of each character of a run (px) and the total length. */
export function runMetrics(chars: string[], o: { size: number; family: string; dir?: 'h' | 'v'; gap?: number }) {
  const gap = (o.gap ?? 0) * o.size;
  const adv = chars.map((ch) => (o.dir === 'v' ? o.size : measure(ch, o.family, o.size)) + gap);
  const len = adv.reduce((a, b) => a + b, 0) - gap;
  return { adv, len };
}

/**
 * Draw a run of sung characters, each appearing with a slam at its own start. Returns the run's length.
 * Characters before their start are drawn only if `dim` > 0.
 */
export function drawRun(c: CanvasRenderingContext2D, chs: Ch[], t: number, o: RunOpts) {
  const dir = o.dir ?? 'h';
  const { adv, len } = runMetrics(chs.map((x) => x.ch), o);
  let pos = -len * (o.align ?? 0);
  c.save();
  c.font = font(o.family, o.size);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  chs.forEach((x, i) => {
    const a = adv[i]!;
    const centre = pos + (a - (o.gap ?? 0) * o.size) / 2;
    pos += a;
    const age = t - x.t;
    const sung = age >= 0;
    if (!sung && !(o.dim && o.dim > 0)) return;
    const k = sung ? slam(t, x.t, o.amt ?? 0.35, o.dur ?? 0.12) : 1;
    const [dx, dy, rot, sc] = o.xf ? o.xf(i, age) : [0, 0, 0, 1];
    let cx = o.x, cy = o.y;
    if (dir === 'h') cx += centre; else cy += centre + o.size / 2;
    c.save();
    c.translate(cx + dx, cy + dy);
    if (dir === 'v' && SMALL.has(x.ch)) c.translate(o.size * 0.12, -o.size * 0.12);
    c.rotate(rot + (dir === 'v' && V_ROT.has(x.ch) ? Math.PI / 2 : 0));
    c.scale(k * sc, k * sc);
    c.globalAlpha = sung ? 1 : o.dim!;
    c.fillStyle = sung ? (o.fillOf?.(i, age) ?? o.fill ?? rgba('bone')) : (o.dimFill ?? o.fill ?? rgba('bone'));
    c.fillText(x.ch, 0, dir === 'h' ? 0 : o.size * 0.04);
    c.restore();
  });
  c.restore();
  return len;
}

/**
 * Mono annotation text. IBM Plex Mono has no Greek and no Japanese: Δ and − are set in Archivo, other
 * Greek letters in Dela Gothic One (the only faces that have them), Japanese in M PLUS 1. Returns the width.
 */
export function monoText(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight = 500, align: 'left' | 'right' | 'center' = 'left') {
  const fam = (ch: string) => (/[Δ−]/.test(ch) ? F.archivo(100, weight >= 600 ? 700 : 500)
    : /[Ͱ-Ͽ]/.test(ch) ? F.dela()
    : /[　-鿿＀-￯]/.test(ch) ? F.gothic(weight >= 600 ? 700 : 500)
    : F.mono(weight));
  const runs: { s: string; f: string }[] = [];
  for (const ch of Array.from(s)) {
    const f = fam(ch);
    const last = runs[runs.length - 1];
    if (last && last.f === f) last.s += ch; else runs.push({ s: ch, f });
  }
  const widths = runs.map((r) => measure(r.s, r.f, size));
  const total = widths.reduce((a, b) => a + b, 0);
  let px = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
  c.save();
  c.textAlign = 'left';
  runs.forEach((r, i) => { c.font = font(r.f, size); c.fillText(r.s, px, y); px += widths[i]!; });
  c.restore();
  return total;
}

/** Scientific notation for readouts: 3.21e-2 (mono-safe: no superscripts). */
export const sci = (v: number, d = 2) => {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  return `${(v / Math.pow(10, e)).toFixed(d)}e${e < 0 ? '−' : '+'}${Math.abs(e)}`;
};

/** Beat helpers bound to the song's grid. */
export function beats(au: { beatAt(t: number): number; timeOfBeat(i: number): number }) {
  return {
    /** Index of the beat at or before t. */
    at: (t: number) => Math.floor(au.beatAt(t) + 1e-4),
    /** Time of beat i (fractional allowed). */
    t: (i: number) => au.timeOfBeat(i),
    /** Index of the 8th at or before t (in 8ths: 2 per beat). */
    at8: (t: number) => Math.floor(au.beatAt(t) * 2 + 1e-4),
  };
}

/** Per-index stable random in [0,1). */
export const rnd = (i: number, s = 0) => hash(i, s, 77);

/**
 * The lyric rail (docs/DESIGN.md, The lyric): the line set small, in one place per act, slammed
 * per character on the sung timing. Act I: a line along the bottom left. Act II: vertical columns on the
 * right in Mincho, one phrase per column. Act III: a centred lower third. `words` are the line's words
 * (phrases); sizes fit the rail. `hot(i, age)` may colour a character (default: the accent while it lands).
 */
/**
 * The lyric's romaji, word by word as each is sung (a word fades in on its first syllable, in the accent for a moment,
 * like the kana above it). Horizontal: one line at (x, y), left-aligned or centred on x (the whole line's width, so
 * it does not shift as words arrive). Vertical (act β's columns): pass `column` per word and it runs down beside it.
 */
export function romajiLine(c: CanvasRenderingContext2D, words: Word[], t: number, o: { x: number; y: number; size?: number; align?: 'left' | 'center'; ink: string; accent: string }) {
  const size = o.size ?? 29;
  c.save();
  c.font = font(F.mono(500), size);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  const sp = c.measureText(' ').width;
  // each romaji word, timed to the character it starts on (a lyric word is often a sung phrase of several)
  const ws = words.flatMap((w, wi) => {
    const chs = charsOf([w]);
    return romajiParts(w).map((p, pi) => ({ r: p.r, t0: chs[p.i]?.t ?? w.start, wd: c.measureText(p.r).width, gap: pi === 0 && wi > 0 ? sp * 1.6 : sp }));
  });
  const total = ws.reduce((a, x, i) => a + x.wd + (i ? x.gap : 0), 0);
  let x = o.align === 'center' ? o.x - total / 2 : o.x;
  ws.forEach(({ r, t0, wd, gap }, i) => {
    if (i) x += gap;
    const age = t - t0;
    if (age >= 0) {
      c.globalAlpha = clamp(age / 0.15) * 0.85;
      c.fillStyle = age < 0.12 ? o.accent : o.ink;
      c.fillText(r, x, o.y);
    }
    x += wd;
  });
  c.restore();
}

/** A word's romaji running down beside its column (act β), rotated to read top to bottom. */
function romajiColumn(c: CanvasRenderingContext2D, w: Word, t: number, x: number, y: number, size: number, ink: string, accent: string) {
  const age = t - w.start;
  if (age < 0) return;
  c.save();
  c.translate(x, y);
  c.rotate(Math.PI / 2);
  c.font = font(F.mono(500), size);
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  // its words, each as it is sung
  const chs = charsOf([w]);
  const sp = c.measureText(' ').width;
  let along = 0;
  for (const p of romajiParts(w)) {
    const a = t - (chs[p.i]?.t ?? w.start);
    if (a >= 0) {
      c.globalAlpha = clamp(a / 0.15) * 0.85;
      c.fillStyle = a < 0.12 ? accent : ink;
      c.fillText(p.r, along, 0);
    }
    along += c.measureText(p.r).width + sp;
  }
  c.restore();
}

export function lyricRail(c: CanvasRenderingContext2D, words: Word[], t: number, act: Act, o: { ink?: string; size?: number; y?: number; x?: number; hot?: (i: number, age: number) => string | null; band?: string } = {}) {
  const ink = o.ink ?? rgba('bone');
  const accent = rgba(ACTS[act].accent);
  const hot = o.hot ?? ((_: number, age: number) => (age < 0.12 ? accent : null));
  if (act === 'b') {
    // one column per phrase, right to left, starting at the right edge
    const fam = F.mincho(800);
    const longest = Math.max(...words.map((w) => Array.from(w.w).length));
    const size = Math.min(o.size ?? 104, Math.floor((H - 200) / (longest * 1.04)));
    let x = o.x ?? W - 150;
    let n = 0;
    for (const w of words) {
      const chs = charsOf([w]);
      const base = n;
      drawRun(c, chs, t, { x, y: 100, size, family: fam, dir: 'v', gap: 0.04, fill: ink, fillOf: (i, age) => hot(base + i, age), amt: 0.25 });
      romajiColumn(c, w, t, x - size * 0.68, 104, Math.min(24, size * 0.24), ink, accent);
      n += chs.length;
      x -= size * 1.35;
    }
    return;
  }
  const fam = F.dela();
  const text = words.map((w) => w.w).join('　');
  const maxW = act === 'a' ? Math.min(1180, W - 120 - (o.x ?? 120)) : 1500;
  const size = Math.min(o.size ?? (act === 'a' ? 96 : 104), Math.floor(fitSize(text, fam, maxW, 200)));
  const all: Ch[] = [];
  words.forEach((w, wi) => { if (wi) all.push({ ch: '　', t: w.start, word: w }); all.push(...charsOf([w])); });
  const y = o.y ?? (act === 'a' ? H - 140 : H - 170);
  if (o.band) {
    // a flat band behind the sung part of the line, for bright frames
    const sung = all.filter((x) => x.t <= t);
    if (sung.length) {
      const wd = runMetrics(sung.map((x) => x.ch), { size, family: fam }).len;
      const x0 = act === 'a' ? (o.x ?? 120) : (o.x ?? W / 2) - runMetrics(all.map((x) => x.ch), { size, family: fam }).len / 2;
      c.fillStyle = o.band;
      c.fillRect(x0 - size * 0.3, y - size * 0.72, wd + size * 0.6, size * 1.44 + 34);
    }
  }
  if (act === 'a') drawRun(c, all, t, { x: o.x ?? 120, y, size, family: fam, fill: ink, fillOf: hot, amt: 0.3 });
  else drawRun(c, all, t, { x: o.x ?? W / 2, y, size, family: fam, align: 0.5, fill: ink, fillOf: hot, amt: 0.3 });
  // the romaji, under the line
  romajiLine(c, words, t, { x: act === 'a' ? (o.x ?? 120) : (o.x ?? W / 2), y: Math.min(H - 34, y + size * 0.42 + 32), align: act === 'a' ? 'left' : 'center', ink, accent });
}

/** Per-act post defaults: α clean, β cold and grainy with less glow, Steins;Gate bright. */
export const ACT_POST: Record<Act, PostOverrides> = {
  a: { grain: 0.045, vignette: 0.22, halation: 0.1, ca: 0.5 },
  b: { grain: 0.075, vignette: 0.38, halation: 0.06, ca: 0.6, cold: 0.55, bloom: 0.45 },
  sg: { grain: 0.035, vignette: 0.15, halation: 0.14, ca: 0.45, bloom: 0.7 },
};

/**
 * Base class of the plates: subclasses implement draw(); the episode slate covers the first
 * SLATE_FRAMES frames (set `slateOff` for a plate that has its own opening, e.g. the prologue).
 * `act` comes from the timeline entry (params.act).
 */
export abstract class Plate extends Scene {
  act: Act = (this.ctx.params.act as Act) ?? 'a';
  ep: Episode = episodeOf(this.ctx.id);
  slate: Slate | null = null;
  slateOff = false;
  B = beats(this.ctx.audio);
  /** The words sung in this plate's window (its line, for the rail). */
  lineWords: Word[] = this.ctx.lyrics.words.filter((w) => w.start >= this.ctx.start - 0.3 && w.start < this.ctx.end - 0.05);

  /** The lyric line sung in this plate's window (the chorus repeats its text, so plates find theirs by time). */
  myLine(): Line {
    const { start, end, lyrics } = this.ctx;
    const l = lyrics.lines.find((x) => x.words.some((w) => w.start >= start - 0.3 && w.start < end - 0.05));
    if (!l) throw new Error(`no lyric line in ${this.ctx.id}'s window`);
    return l;
  }

  abstract draw(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides | void;

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides | void {
    const o = { ...ACT_POST[this.act], ...(this.draw(f, out) ?? {}) };
    if (!this.slateOff && f.t < this.ctx.start + SLATE_FRAMES / 60) {
      if (!this.slate) this.slate = new Slate(this.ep, this.act);
      this.ctx.comp.draw(this.ctx.renderer, this.slate.L.texture, out, { mode: 'normal' });
      return { ...o, shake: [0, 0], zoom: 1, invert: 0, flash: 0, ca: 0.6, fade: 0, cold: 0 };
    }
    return o;
  }
}
