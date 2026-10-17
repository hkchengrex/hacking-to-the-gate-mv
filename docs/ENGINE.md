# The renderer

`app/` is a web app (TypeScript, three.js, run with bun and Vite) that renders any song time `t` deterministically at 1920×1080, or at 2× that. The same code drives the live preview in a browser and the offline 60 fps export through headless Chrome and ffmpeg. It is forked from mexicat/pdoom-video and rebuilt for this video.

## Running things

All commands run from `app/`. Needs bun, Google Chrome, ffmpeg and ffprobe.

- **Install:** `bun install`.
- **Preview:** `bun x vite --port 5173`, then http://localhost:5173/?t=23.0. Space plays and pauses; ←/→ step 1 s (shift: 5 s); `,` and `.` step one frame; `[` and `]` go to the previous and next scene; `l` loops the current scene; `h` hides the UI. The status line shows the time, beat, bar, scene and the line being sung. Saving a scene file hot-reloads that scene.
- **Stills:** `bun scripts/render.ts stills --t 12.5,13.0,14.2 --only heartbeat --out ../out/wip/heartbeat` (PNGs).
- **Contact sheet** of a time range: `bun scripts/render.ts sheet --from 14.5 --to 19.8 --n 12 --cols 4 --only heartbeat --out ../out/sheets/heartbeat.png` (or `--times a,b,c`; `--cuts` gives four frames round every cut in the range).
- **Clip:** `bun scripts/render.ts video --from 14.44 --to 19.85 --samples auto --max-samples 12 --shutter 0.4 --out ../out/wip/heartbeat.mp4` (H.264, CRF 16, preset slow, with the song unless `--noaudio`).
- **Scene times:** `bun scripts/render.ts timeline` prints every scene's id, start and end.
- **Stills of the video:** `bun scripts/render.ts thumbs [--every 0.5]` exports a 640×360 JPEG every half second and `index.json` into `public/plates/v2/` (the HUD off), for `prologue` and `achievement`.
- **Speed:** `bun scripts/render.ts perf --from 20 --to 25 --only ids` prints the average ms per frame including the export's pixel readback. `bun scripts/render.ts gpu` prints the GPU Chrome is using.
- **Full video:** `bash scripts/render-parallel.sh [workers=4] [max-samples=36] [segments dir=../out/final] [name=hacking-to-the-gate]`: 32-second segments, four at once, at final quality, each worker loading only the scenes of its segment (`--only`), then a lossless concat with the song muxed once (AAC 320k) and a lighter preview copy (CRF 22). `SCALE=2` renders 4K and `CRF=18` sets the encoder's quality (`SCALE=2 CRF=18 bash scripts/render-parallel.sh 4 36 ../out/final-4k hacking-to-the-gate-4k`; the preview is then 1080p). Rerunning skips the segments already done; after changing a scene, delete the segments that hold it. `render-final.sh` is the same, one segment at a time. Both print `FINAL-DONE`.
- **`--only a,b`** loads only those scenes: faster, and isolated from a scene that is broken.
- **`--scale 2`** on any mode renders a true 3840×2160 frame.
- **Typecheck:** `bun x tsc --noEmit -p .`
- The render script prints browser console errors and scene errors: read them. A scene that throws renders as a dark red frame.
- A render uses the preview server on port 5173 if one is running, and otherwise starts its own on a random port without live reload. A live-reloading server reloads the page when a file changes, which breaks a render in progress: stop the preview before a long render, or do not edit files while it runs (`MV_NO_HMR=1 bun x vite --port 5190` starts a server without it; pass `--url http://localhost:5190`).
- Headless Chrome is started with ANGLE on Direct3D 11 (Metal on macOS), the high-performance GPU forced and GPU rasterization on. One render is bound by a single CPU thread of Chrome's GPU process, not by the GPU; that is why the full render runs four segments at once (about four times the frames per second). Do not run stills or sheets while a video render is using the GPU.
- Windows: if bun is not on the PATH, prepend `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Oven-sh.Bun_Microsoft.Winget.Source_8wekyb3d8bbwe\bun-windows-x64` (the shell scripts do this themselves), and write `bun x …` for `bunx …`.

## Structure

| Path | What it is |
|---|---|
| `src/main.ts` | The entry: the preview player, or the export API (`?export=1`: `window.__mv` with `still(t)`, `png()`, `stream({from, to, fps, ws, samples, shutter})`, the timeline). |
| `src/timeline.ts` | The edit: `PLATES`, each `[id, act, cue, paper, module]`; `makeTimeline(lyrics, audio)` turns the cues (a lyric line index, or a bar) into windows. |
| `src/engine/engine.ts` | Owns the renderer, loads the scenes lazily, renders any `t` (fast-forwarding stateful scenes after a seek), composites transitions, runs post, implements adaptive sampling. |
| `src/engine/scene.ts` | The `Scene` base class and the `Frame` it receives. |
| `src/engine/audio.ts`, `lyrics.ts`, `romaji.ts` | The data: the beat grid, envelopes and onsets; the lines, words and per-character timings; romaji from the kana. |
| `src/engine/meter.ts`, `meter3d.ts`, `nixie-geometry.json` | The divergence meter: its schedule, and the eight tubes as a 3D object. |
| `src/engine/gl.ts`, `glsl/common.ts`, `lines.ts` | Render targets, fullscreen passes, the compositor, Canvas2D layers; the GLSL prelude; GPU line batches. |
| `src/engine/type.ts`, `stroke.ts` | Fonts and text layout; single-stroke fonts. |
| `src/engine/palette.ts`, `post.ts`, `util.ts`, `scale.ts` | The palette; post-processing; maths, easing, noise, hashing; the output scale. |
| `src/engine/hud.ts` | An overlay inherited from the fork (crop marks, captions, a corner readout). Unused: every scene stages its own text. |
| `src/scenes/_kit.ts` | The shared pieces of every scene: the `Plate` base class, the episode titles, the acts, the slate, the lyric rail, per-character karaoke, annotations, beat helpers. |
| `src/scenes/_sky.ts`, `_glow.ts`, `_thumbs.ts` | Act III's dusk sky and the lights; a scene's own glow; the stills of the video. |
| `src/scenes/<id>.ts` | The scenes. In the code a scene is a *plate* (`Plate`, `PLATES`): the two words mean the same thing. `draft.ts` is the stand-in the timeline plays for a scene whose file is missing (it never is). |
| `scripts/render.ts` | The export: drives the page in headless Chrome and streams frames to ffmpeg over a WebSocket. |
| `scripts/render-parallel.sh`, `render-final.sh` | The full render in segments. |
| `public/fonts/` | The fonts (`fetch.py` gets the TrueType ones; the SVG stroke fonts are included). |
| `public/plates/v2/` | The stills of the video, exported, not in the repository. |

## Data

The engine loads `data/audio.json` and `data/lyrics.json` (served from the folder root by Vite) and hands them to every scene as `this.ctx.audio` and `this.ctx.lyrics`.

- **Lyrics** (`lyrics.ts`): `lines[]` with `text, start, end, words[]`. A **word** is a sung phrase (`Word.w`), with `start`, `end`, `conf`, `syl` (one `[start, end]` span per displayed character; brackets get zero-length spans), `kana` (each character's reading), `brk` (where a new romaji word starts) and `romaji`. Queries: `lineAt(t)`, `lastLine(t)`, `nextLine(t)`, `linesIn(t0, t1)`, `wordAt(t)`, `lastWord(t)`, `find(s)`, `get(s)` (any substring of a line), `findWords(s)`, `Lyrics.wordProgress(word, t)`, `Lyrics.lineCharProgress(line, t)`. Scenes find their line by time (`Plate.myLine()`, `lineWords`), never by a hard-coded index: the chorus repeats its text.
- **Audio** (`audio.ts`): `beats[]`, `downbeats[]`, `sections[]`, `beatAt(t)` (continuous beat index), `barAt(t)`, `timeOfBeat(i)`, `nearestBeat(t)`, `events('kick' | 'snare' | 'hat' | 'vocal', t0, t1)` as `[time, strength]`, `env(name, t)` for `rms | low | mid | high | vocal | drums | bass | other` (0..1), `hit(kind, t, halfLife)` decaying pulses. The grid is 160.997 BPM in 4/4 and starts nine beats before the song, so bar k starts on beat 4k and bar numbers are the TV cut's.
- **Every `Frame`** carries `t`, `dt`, `lt` and `p` (local time and progress in the scene), `start`, `end`, `seeked`, `preroll`, `beat, bar, beatPhase, barPhase`, `a` = `{rms, low, mid, high, vocal, drums, bass, other, kick, snare, hat, vonset}`, and for transitions `under`, `tin`, `tout`.
- **The meter** (`meter.ts`): `new Divergence(lyrics, audio)`; `.state(t)` gives the eight tubes (`text` like `0.571024`, per-tube `lit` and `rolling`, `phosphor` 0..1, `spinning`, `value`); its times `warm0, warm1, sendT, spinT, landT` and the rest are the moments in `DESIGN.md`. `READINGS` holds the five values.

## Writing a scene

One file `src/scenes/<id>.ts`, default-exporting a class that extends `Plate` (`_kit.ts`) and implements `draw(f, out)`. `Plate` extends the engine's `Scene` and adds the act (`this.act`, from the timeline entry's params), the episode (`this.ep`), the beat helpers (`this.B`), the words of the scene's line (`this.lineWords`, `this.myLine()`), the act's post defaults (`ACT_POST`) and the slate, which it lays over the first `SLATE_FRAMES` (4) frames of the scene (`slateOff` for a scene with its own opening).

```ts
import type * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { Plate, lyricRail } from './_kit';

export default class MyScene extends Plate {
  bg = new FSPass(`uniform float t; void main() { fragColor = vec4(C_INK, 1.0); }`, { t: { value: 0 } });
  text = new Layer2D();
  async init() { /* build geometry, precompute, load */ }
  draw(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    this.bg.u.t!.value = f.t;
    this.bg.render(renderer, out);                       // a fullscreen shader into out (overwrites it)
    const c = this.text.ctx; this.text.clear();          // Canvas2D …
    lyricRail(c, this.lineWords, f.t, this.act);         // … the line in the act's rail …
    comp.draw(renderer, this.text.upload(), out);        // … laid over
    return { bloom: 0.6 };                               // post overrides for this frame (optional)
  }
}
```

Rules the scenes follow:

- **Deterministic.** The output is a pure function of `f.t` and of seeded randomness (`mulberry32(seed)`, `hash(...)`, `rnd(i)`). Never `Math.random()`, `Date.now()` or `performance.now()`. The export renders many sub-frames per frame, out of time order, and the full video in separate segments. Where motion has to be integrated (a speed that varies, as in `parallel`), the scene tabulates it from its start at a fixed rate in `init()` and looks the table up at `t`, so it is a function of `t` too. (`stateful = true` with `reset()` exists for scenes that cannot do that; the engine then replays up to `prerollMax` seconds after a seek, and such a scene cannot use adaptive sampling. No final scene is stateful.)
- `draw()` fully overwrites `out`, a half-float linear HDR target. Colours are **linear** and may exceed 1; above the bloom threshold (0.85) they glow.
- `ctx.start` and `ctx.end` are the scene's window; `ctx.params` the entry's params (`act`, `paper`); `ctx.id` the entry's id (the module serving two entries tells them apart by it or by the act).
- Scene windows touch, so cuts are hard. If two entries overlap, the engine crossfades them; `handlesTransition = true` lets a scene composite `f.under` itself.
- **`B.at(t)` floors to a whole beat.** It counts beats; it never drives motion (a camera driven by it moves once per beat). Motion uses plain time or `audio.beatAt(t)`, and the scenes drawn in light run on a local beat time `nb = (t − t0) / period` at the scene's own tempo.
- **Per-frame flicker** uses `frameIdx(t)` (constant over a frame's shutter), never `Math.floor(t * 60)`.
- **Cameras are reused** (`Meter3D.view()`, one `PerspectiveCamera` per scene): three.js keeps a render target per camera for transmissive materials, and a camera a frame leaks GPU memory.
- Performance: under 25 ms a frame. A Canvas2D layer costs 2 to 4 ms to upload; scenes use one or two. Everything that can be precomputed is, in `init()`.

## Toolbox

- **`gl.ts`:** `FSPass(frag, uniforms)` is a fullscreen GLSL ES 3.0 pass (it has `vUv`, writes `fragColor`, and gets `GLSL_COMMON` prepended). `comp.draw(renderer, texture, target, { mode: 'normal' | 'add' | 'screen' | 'multiply' | 'max' | 'replace', opacity, tint, scale, offset })` composites a texture. `Layer2D` is a 1920×1080 Canvas2D surface uploaded as a texture (`new Layer2D(w, h, 1)` for a low-resolution one). `makeRT(w, h, opts)` makes an HDR target (`{ samples: 4 }` for MSAA, `{ pxScale: 1 }` for a data-sized one). `clearRT`, `W`, `H`, `PW`, `PH`, `SCALE`, `SS_TAP`.
- **`glsl/common.ts`** (`GLSL_COMMON`, also for your own `ShaderMaterial`s): the palette constants, `hash11/12/13/22/33`, `snoise`, `fbm`, `curl2`, 2D and 3D SDFs, `smin`, `smax`, `aaFill`, `aaStroke`, `pxLine`, `rampLine`, `hatch`, `engrave`, `heat`, `toSRGB`, `toLinear`, `luma`, `sat`, `FRAG_PX`, `PX_SCALE`.
- **`lines.ts`:** `LineBatch(capacity, { screen2D, worldWidth, blend: 'add' | 'max' | 'normal', depthTest })` draws GPU capsule segments, in 2D pixels (y down) or in 3D with a camera: `seg(ax, ay, az, bx, by, bz, width, r, g, b, a)`, `seg2(...)`, `polyline(...)`, `clear()`, `render(renderer, out, camera?)`. Colours are linear and may exceed 1. Widths are logical px (or world units with `worldWidth`); the AA feather works in physical px so hairlines stay crisp at 4K. Tens of thousands of segments a frame are fine; the threads of light are all drawn with it.
- **`_kit.ts`:** `Slate`, `episodeOf(id)`, `ACTS`, `ACT_POST`, `SLATE_FRAMES`; `charsOf(words)` (each displayed character with its sung start), `drawRun(c, chars, t, { x, y, size, family, dir: 'h' | 'v', align, gap, fill, dim, fillOf, xf, amt, dur })` (a run of characters, horizontal or vertical, each appearing with a slam at its own start), `lyricRail(c, words, t, act, { ink, size, x, y, hot, band })`, `romajiLine`; `slam(t, t0, amt, dur)`, `frames(t, t0, n)` (true for the first n output frames after `t0`), `shakeAt(t, amp)`, `beats(audio)` (`at`, `t`, `at8`), `rnd(i, seed)`; `monoText(c, s, x, y, size, weight, align)`, `sci(v)`; `herPoint(c, x, y, r, a, hit)`.
- **`_sky.ts`:** `Sky` (Act III's dusk with the gate: `SKY_GLSL`, `skyUniforms()`, `aimGate(u, camera, gatePosition, glow)`), `Dark` (the ink background of acts I and II with a slight centre tint: `dark.render(renderer, out, tint)`), `Lights` (soft glows with a white core, instanced quads facing the camera), `motes(L, camera, n, centre, extent, t)`, `gauss(x, w)`.
- **`_glow.ts`:** `new Glow(levels)`, `glow.render(renderer, src, weights, threshold, knee)` gives a texture of the glow of `src` with each pyramid level weighted; add it onto `out`.
- **`_thumbs.ts`:** `loadThumbs()`, `thumbAt(th, t)`, `drawThumb(c, img, x, y, w, h)`; an empty set until `render.ts thumbs` has run.
- **`type.ts`:** `F.dela()`, `F.mincho(400 | 700 | 800)`, `F.gothic(300 | 500 | 700 | 900)`, `F.archivo(width 62–125, weight 300–900)`, `F.archivoItalic()`, `F.mono(weight, italic)`, `F.serif(weight, italic)`, `F.dot()`; `font(family, px)`; `measure`, `fitSize`, `fitPhrases`, `layout` (per-glyph positions with kerning), `glyphX`, `textPath2D`, `textPathCommands`, `textPoints`, `smart`, `plain`.
- **`stroke.ts`:** `strokeText(text, font, size, tracking, kern)`, `drawStrokeText(ctx, st, lengthPx)`, `writtenLength(st, charTimes, t)`: text written by a moving point, in the fonts `script, hscript, sans, readable, tech, serif, osmotron, felix`.
- **`util.ts`:** `clamp, lerp, invLerp, remap, smoothstep, smootherstep, fract, mod, TAU, window01, ease.*, prog(x, a, b, ease), springStep, pulse, mulberry32, frameIdx, holdT, hash, noise1/2/3, fbm1/2, keys, vec2, dist, polylineLengths, pointAtLength, hexToLinear`.
- **`meter3d.ts`:** `new Meter3D({ brightness })`; `update(state)` each frame; `render(renderer, comp, out, camera, { opacity })` draws the tubes alone with 4× MSAA and adds them onto `out`, or add `meter.group` to your own `THREE.Scene` (Z up, tubes along X, centred on the origin, glass up to z ≈ 2.4; it lights its surroundings with its cathodes). `meter.view(pos, target, fov)` frames a shot with one reused camera; 10–12 units out at 30° looking at `[0, 0, 1.1]` frames all eight tubes. `melt.ts` rebuilds the tubes from `nixie-geometry.json` to melt them.

## Post-processing

`src/engine/post.ts`, applied once per frame to the composited HDR frame: chromatic aberration, bloom (a pyramid) and halation, exposure, a tone shoulder (identity below 0.72, rolling off above), invert, flash, vignette, fade, conversion to sRGB, grain and dither. The defaults (`DEFAULT_POST`) are bloom 0.55 at threshold 0.85 with knee 0.5 and radius 0.75, halation 0.25, CA 1.2 px, grain 0.055, vignette 0.35; `ACT_POST` in `_kit.ts` sets each act's values, and a scene returns overrides per frame: `exposure, bloom, bloomThreshold, bloomKnee, bloomRadius, halation, ca, grain, vignette, fade, flash, shake: [x, y], zoom, invert, cold`. The fork's hardware looks (`crt`, `curve`, `vhs`, `box`, `degauss`, `power`, `paper`, `hud`, `frame`, `pdoom`) are still in the shader, all off; only `cold` (the blue-grey grade of Act II) is used. Post parameters are read at one point of the shutter, 1/8 of it after the frame's time.

## Output scale (4K)

`?scale=2` (`--scale 2`) renders a true 3840×2160 frame. Scenes lay out in logical 1920×1080 px throughout: `makeRT(w, h)` takes logical px; `Layer2D` is pre-scaled; `LineBatch` widths are logical; in GLSL `gl_FragCoord`, `fwidth` and `dFdx` are physical, so hairlines are written with `pxLine(d, a, b)` and positions use `FRAG_PX`. Post and the bloom pyramid follow automatically. Every scene was checked at 4K against its 1080p frame: the same picture, sharper.

## Motion blur and sampling

The export renders every frame as the average of many sub-frames spread over the shutter (`--shutter 0.4`: 40% of the frame time, centred on the frame's time), before post-processing. `--samples N` takes N evenly spaced sub-frames. `--samples auto` chooses the count per frame (`Engine.render`): it steps through 4, 12, 36, 108, 324, each step adding a sub-frame either side of every existing one, and after each step compares the new sub-frames' average with the old ones' (the worst 2×2 block of displayed values); it stops when the change is below `--tol` (3 levels of 255) or at `--max-samples`. A still frame stops at 12, ordinary motion at 36, whips at 108 or more. Final quality is `--samples auto --max-samples 36 --shutter 0.4`; 12 is enough to review.

What this asks of scenes: sub-frames are rendered out of time order and in any number, so nothing may count `render()` calls; flicker uses `frameIdx(t)`; noise that changes with continuous `t` is seeded with `frameIdx(t)` unless it is meant to average out; a shader that supersamples internally takes the `ssTap: SS_TAP` uniform and `${SS_TAP_GLSL}` and loops `for (int k = ssK0(); k < ssK1(); k++) … rgss(k)` weighted by `ssWeight()`, so the engine can hand each sub-frame one tap (every set is a multiple of 4) at a quarter of the cost.

## The export

`scripts/render.ts` opens the page with `?export=1` in headless Chrome (playwright-core) and calls the page's `window.__mv` API: `still(t, samples, shutter)` then `png()` for stills and sheets; `stream({ from, to, fps, ws, samples, shutter, inflight })` for video, which renders frame by frame, reads the pixels back and sends raw RGBA frames over a WebSocket to the script, which pipes them into ffmpeg (`libx264`, `-preset slow -crf 16 -tune grain -x264-params aq-mode=3`, BT.709, with the receiver acknowledging frames so a slow encode cannot pile them up). Before a range it renders one frame before `from` so the first frame is sequential. `render-parallel.sh` divides the song into 32-second segments and runs `render.ts video --noaudio` on each with a lock directory per segment (`mkdir` is atomic), `--only` the scenes that play in it (at 4K a loaded scene's render targets take real video memory), three attempts, and a frame-count check with ffprobe before joining; the join is a lossless concat with the song muxed once.
