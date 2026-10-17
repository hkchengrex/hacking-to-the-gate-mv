# The design

This is the design language of the video: what it is about, how it is organised, what it looks like and how it moves. `SCENES.md` applies it scene by scene; `RULES.md` lists the rules behind it.

## The idea

**The whole show in one song.** Every *Steins;Gate* episode title has the same shape: a Japanese compound, の, and a clinical or scientific loanword (蝶翼のダイバージェンス, 夢幻のホメオスタシス, 無限連鎖のアポトーシス …). The video takes that formula literally.

- **Scenes are episodes.** Each scene is named after one episode and opens on its title. The loanword gives the scene its visual system (Divergence branches, Homeostasis winds back to its set point, Dogma is a black hole's law, Necrosis kills, Apoptosis repeats); the compound gives it its subject.
- **The episodes play out of order,** which is itself a time leap. An idea that returns in a later act keeps its episode number and most of its picture, changed by the act it is in.
- **Three world lines.** The song is told as the show's three world lines: α sets the experiment up, β is where it fails, Steins;Gate is the fight back through the gate. The divergence meter tells the story in numbers.
- **The pictures lead.** Each scene is a picture of its idea, not an illustration of its line. The lyric is shown exactly, character by character as it is sung, small and in a fixed place; type fills the frame only in the hook.
- **It is a loop.** The first and the last frame are the same point of light.

## The three acts

| | Act I · α | Act II · β | Act III · Steins;Gate |
|---|---|---|---|
| time | 0:00–1:28 | 1:28–2:32 | 2:32–4:16 |
| song | intro, verse 1, pre-chorus 1, hook, chorus 1 | interlude, verse 2, pre-chorus 2, hook 2 | chorus 2, guitar solo, breakdown, final chorus, outro |
| theme | **Observation.** Neutral and scientific: instruments, specimens, the mathematics behind the titles. | **Failure.** The same experiments, failing. Verse 2 mirrors verse 1 line for line, so most scenes replay their Act I partner, broken. Her death; the chains. | **Breakthrough.** Forward and up, toward the gate: a doorway of light at the far end of a dusk sky. The solo is Operation Skuld; the final chorus answers chorus 1 scene for scene. |
| meter | 1.130426 → 0.571024 → 0.571046 | 1.130426 (melting); 1.130205 | → 1.048596 |
| light | threads and points of light on black; nixie | the same, cold; crimson | the same, against the dusk; bone and ember; one phosphor flare |
| lyric rail | one line along the bottom left | vertical columns on the right | a centred lower third |
| slate tag | `WORLD LINE α` | `WORLD LINE β` | `STEINS;GATE` |

The act is a parameter of every scene (`this.act`); `ACTS` and `ACT_POST` in `src/scenes/_kit.ts` hold each act's tag, accent and post-processing.

## The manner

One manner holds all 43 scenes together: nothing reads as an object, a card or a toy. It comes down to a few things:

- **Threads and points of light in a deep space.** Everything is drawn as hair-thin lines of light (GPU line segments of constant width on screen, additive) and soft glows with a white core, on black (acts I and II) or against the dusk sky (act III). Nothing is shaded as a solid; nothing has a surface. Where an idea needs a thing (a clock, a chain, a chart, a staircase, the complex plane) the thing is drawn as a diagram of light, in line only. The bone field (ink on paper) is kept for the slate, the white-outs, the bars of `timeleap` that flip to it, and the hook's strobe.
- **Abstract over literal.** Blood, wounds, bodies, bonds and people are never depicted. Blood is a crimson front, a thread turning red, a veil of strands. A person is a light.
- **One continuous move per scene.** The camera makes one move that develops over the scene, and never cuts inside it. Scene changes are hard cuts on the beat, marked by the slate.
- **Smooth.** Nothing jolts on the beat: no object tugged on the kick, no camera that surges per beat, nothing added mid-shot. The music is felt through what happens in the picture: a division, a crossing, a cut, a light arriving, a trace going flat, timed to the beats and the sung characters, each a smooth event. (The exceptions are six scenes that cut or shake on their hits: `timeleap`, `magnitude`, `butterfly`, `fault`, `gate` and `approach`.)
- **Development.** Something is happening at every moment; a scene of six seconds has a beginning, a turn and an end. Long scenes build (a field growing, a tangle thickening, a whirl winding tighter).
- **Things end visibly.** A light that is lost dies on screen; a chain that dies goes dark link by link; nothing leaves the frame unexplained.
- **A scene's own glow.** Where a bright thing must leave the dark beside it dark (the black hole), the scene makes its own glow (`_glow.ts`, a pyramid weighted toward the near levels) and stays under the post chain's bloom threshold.
- **Not photographic.** Nothing is ray-traced or lit to look real. The one exception of kind, the black hole, is still only threads: what is physical is the geometry (the threads are seen through traced Schwarzschild geodesics, and the plunge is the real plunge from the innermost stable orbit).
- **Modern, not retro:** clean full-bleed 16:9, 60 fps with real motion blur; no scanlines, tape noise or 4:3 framing. **No clichés:** no pink-and-cyan, no code rain, no glowing brains, no lens flares, no particle nebulae. Glitches appear only where the idea is a failure (division by zero). **Nothing is copied from the show:** no traced logos (SERN is set as text), no restaged shots.

## Palette

`app/src/engine/palette.ts`. Linear values for GL, `rgba()` for Canvas2D; the same names in GLSL (`C_INK`, `C_NIXIE` …).

| name | hex | role |
|---|---|---|
| ink | `#0B0C0E` | the black |
| ink2 | `#16181B` | raised black |
| gunmetal | `#3A3F45` | dim lines, secondary text |
| ash | `#8E9389` | mid grey; the slate's footer |
| bone | `#E9E5DA` | the white: type, the observer's light, lines of light |
| nixie | `#FF6A1F` | **the signal colour:** the world line, the sung character as it lands, the meter's tubes, our charge |
| ember | `#FFB061` | hot cores; Act III's light |
| blood | `#A8320C` | the deep shadow of nixie; a dying thread |
| crimson | `#B0101C` | **Act II's own, and Kurisu's:** her light, her heart's trace, the necrosis front, the cut edges, the missing link |
| gore | `#4A050B` | the deep shadow of crimson |
| cold | `#5F7887` | the blue-grey of Act II's grade (`cold` in post) |
| phosphor | `#8CFF7A` | Act III's accent in the slate numbers and the sung character; full-frame once, when the meter lands on 1.048596 |

Only the signal colours glow; bone type stays crisp. Act III's sky (`_sky.ts`) runs from night at the top through violet and rose to the gate's warmth, with the gate itself a tall doorway of light.

## Typography

`app/src/engine/type.ts`; the fonts are fetched by `app/public/fonts/fetch.py`.

- **Dela Gothic One:** the lyric rail of acts I and III.
- **Shippori Mincho** (400, 700, 800): the episode titles on the slate, Act II's vertical rail, the quiet register (the line that runs along the bottom of the black hole).
- **M PLUS 1** (300, 500, 700, 900): Japanese inside annotations.
- **Archivo** (widths 62–125, weights 300–900; extended 125 for display): English and numerals: the slate's number and English title, the dates of `timeleap`, `HACKING TO THE GATE`, powers of ten.
- **IBM Plex Mono:** the scientific annotations (coordinates, readings, axis labels, clocks), 16–24 px, weight 400–600. It has no Greek and no Japanese: `monoText` sets Δ and − in Archivo, other Greek in Dela, Japanese in M PLUS 1. Exponents are written in e-notation (`sci()`), never as superscripts.
- **Cormorant Garamond** and **DotGothic16** are loaded by the engine but not used by the final scenes.
- **Single-stroke SVG fonts** (`stroke.ts`: Hershey and EMS faces): text written progressively by a moving point, where a label draws itself.
- Layout: Swiss-grid discipline for annotations (hairline rules, small mono labels beside a big picture). Japanese punctuation as in the lyrics (『』). Everything stays inside the title-safe area, 96 px from every edge.

## The lyric

Every lyric line is shown, readable, in sync per character: a character appears at its own sung start (`data/lyrics.json`, `syl`), never before the voice, with a slam (scale 1.3 falling to 1 over 0.12 s) and the act's accent for its first 0.12 s, then bone. Unsung characters are not drawn. The romaji is shown with it, word by word as each is sung (Hepburn, from the kana the data keeps per character, with word breaks found by MeCab), in Plex Mono 500.

The rail (`lyricRail` in `_kit.ts`) puts the line in one place per act, out of the picture's way:

- **Act I:** one horizontal line, Dela Gothic One, ≤ 96 px, from x = 120 at y = 940, fitted into 1180 px; the romaji under it, 29 px, left-aligned.
- **Act II:** Shippori Mincho 800, vertical, one phrase per column, right to left from x = 1770, ≤ 104 px, fitted to the height; each column's romaji running down beside it, rotated.
- **Act III:** one centred line, Dela, ≤ 104 px, at y = 910, within 1500 px; the romaji centred under it.

Full-frame type is kept for the hook alone: `gate` and `hook2` set HACKING TO THE GATE across the whole frame. `horizon` and `landing` set their line by hand, centred along the bottom in Mincho, with its romaji; every other scene with a line uses the rail.

## The slate

Every scene opens on its episode's title card, laid over its first 4 frames (1/15 s): ink on bone, the number in the act's accent (Archivo 125 extended, 900, 120 px; Act III's accent darkened to `#2E8F28` so it reads on bone), the act's world-line tag beside it in mono, a rule, the Japanese title in Mincho 800 (≤ 210 px), the English title in Archivo 125 letter-spaced (≤ 46 px), and a mono footer `STEINS;GATE · HACKING TO THE GATE`. It registers as a chapter mark, not a caption. The prologue and the outro, which type the title along the world line, have no slate.

## The edit

`app/src/timeline.ts`. Times are computed from `data/audio.json` and `data/lyrics.json`; no scene hard-codes a time.

- **A scene per lyric line,** five to seven seconds: the cut lands on the 8th note at or before the line's first sung character. In the instrumental parts (intro, interlude, solo, breakdown, outro) scenes start on downbeats and run four to five bars. 43 scenes in 4:16.
- **Bar numbers** follow the TV cut's grid (the beat grid starts nine beats before the album's first beat), so the album's verse 2 and chorus 2 sit exactly 60 bars after verse 1 and chorus 1, and the Act II scenes land on the same beats of the bar as their Act I partners.
- **Hard cuts** everywhere (scene windows touch); the slate marks each one. Three handovers are white-outs: `fault` into `gate`, `gate` into `zero`, `approach` into `silence`; `zero` and `silence` come out of the white with a short fade.
- **Variants.** A scene that returns in a later act runs the same module with its act as a parameter: `flatline` is `heartbeat`, `finite` is `homeostasis`, `merciless` is `ergosphere`, `hook2` is `gate`, `reading` is `irreversible`, `silence` is `zero`, `converge` is `parallel`, `reunion` is `starmine`, `loopbreak` is `apoptosis`, `landing` is `horizon`, and `pond` and `deceive` are `melt`.
- **Post-processing per act** (`ACT_POST`, on top of the engine defaults of bloom 0.55 at threshold 0.85, halation 0.25, chromatic aberration 1.2 px): α is clean (grain 0.045, vignette 0.22, halation 0.1, CA 0.5); β is cold and grainy with less glow (grain 0.075, vignette 0.38, halation 0.06, CA 0.6, cold 0.55, bloom 0.45); Steins;Gate is bright (grain 0.035, vignette 0.15, halation 0.14, CA 0.45, bloom 0.7). Scenes override per frame (a flash on a crash, a fade at the end, one shake at the blow in `wound`).

## Text on screen

No text explains the picture. What may appear is of four kinds, and `SCENES.md` lists every instance:

1. **Titles:** the slate; `HACKING TO THE GATE`; the prologue's and outro's title along the line.
2. **Clocks and dates that count:** `timeleap`'s dates, the clocks of `launch` and `arrival`.
3. **Axis labels and scales:** `Re`, `Im`, `1`, `i`; the numerals of the dial; `10ⁿ m`; the scale of `farce`.
4. **Numbers and annotations that belong to an object in the picture:** the meter's reading, a world line's value, the charges' + and −, the coordinates of a speck, the counter of heartbeats, the chalked proof, the error of a division by zero, the SERN wordmark.

There are no labels that name things, status lines, stamps, checklists or plan names (`RULES.md`).

## Motifs

### The world line

One hairline with a hot head, in most scenes; the signal colour. In Act I it is the time axis, the heart's trace, the strata's pen, the unit circle and the second hand, the slit of the gate, the dividing tracks, the field lines, the loops, the threads winding into the hole. In Act II it is the same things, cold or crimson, and the chains. In Act III it is the thread each light draws behind it, the one line all paths pull into, the sixteen lines running together into one, the light leaving the chain of loops straight, and the whirl we fall through to the meter.

### The divergence meter

Eight nixie tubes as a 3D object (`src/engine/meter3d.ts`, after hkchengrex/divergent-meter-renderer). It is never an overlay: it is staged inside scenes, and only at its moments. The schedule lives in one place (`src/engine/meter.ts`, derived from the song), so every scene that stages it agrees:

| moment | scene | reading |
|---|---|---|
| the warm-up | `timeleap`: tubes lighting one by one in macro shots, bars 8–12 | settles on **1.130426** (β, where the story starts) two beats before the verse |
| the send | `butterfly`: the D-mail, on the verse's last downbeat | rolls to **0.571024** |
| the spin | `parallel`, passing | spinning, no reading |
| α holds | `horizon`, in the dark, on the sung 観 | **0.571046** |
| the melt | `pond` (`melt`): it reads β's value again and melts under her blood | **1.130426** |
| the re-forming | `deceive` (`melt` backward) | **1.130205** |
| the spin | `approach`: through every value the video has passed | spinning |
| the landing | `landing`, on the final 観 | **1.048596**, the tubes flaring phosphor for about two seconds, the only phosphor in the video |

### Kurisu's light

The only person in the video is Kurisu, and she is never drawn: she is a crimson point of light (`herPoint` in `_kit.ts`, or a crimson glow in the 3D scenes). She is the − charge of `starmine` and `reunion`; her death is the missing link and the crimson front of `chain`; the light inside the cage in `virtual`; the light on the warm branch in `choice`; the light he wanders round in `farce` and winds his thread round in `wound`; the fourth of the eight lights in `members`; and her heart's trace is the crimson one in `flatline`, `reading` and `trick`. Her blood is what melts the meter in `pond`.

### The observer

The observer is shown through the meter (the lone observer in the dark of `horizon` and `landing`) and, in Act II and III, as a light of his own, bone-white: wandering in `farce`, standing before the trace in `trick`, with every path open to him in `coat`, flying back through the days in `launch`, between the two fields in `fields`, up the stairwell in `arrival`, taking the blow in `wound`. Everyone else (the lab members in `members`, the other worlds) is a light or a line, never a figure.

### The gate

Act III's scenes play against the dusk sky with the gate in it: a tall doorway of light, far off, which the lights fly toward (`members`, `coat`, `fields`, `converge`, `loopbreak`), stands open at the top of the stairwell (`arrival`), and shines behind the pane in `reading`. `landing` falls into the dark and finds the meter there.

### The video's own stills

The past is the video itself. `bun scripts/render.ts thumbs` exports a still every half second; `prologue` glimpses them (the future, in the first seconds) and `achievement` runs them backwards (the whole video, one frame per 16th). No other scene shows stills.

## Canon

The readings and dates are the show's, from the Steins;Gate wiki's chronology (after the official guides), and the picture checks them.

| reading | world line | where |
|---|---|---|
| 1.130426 | β, the original world line: Kurisu dies on 2010.07.28 at 12:39 | the warm-up; the melt |
| 0.571024 | α, after the first D-mail | the send |
| 0.571046 | α | where Act I settles |
| 1.130205 | β, the world line Okabe leaves from for Operation Skuld, after the first D-mail is undone | `deceive` |
| 1.048596 | Steins;Gate | the landing |

`timeleap`'s dates, shown without their events: 2010.07.28 12:39 (β · Kurisu dies), 12:26 (the "noise" movie mail) and 11:50 (a time machine on the roof); 2010.07.23 (the first D-mail, caught by ECHELON); 2010.08.03 (the lotto D-mail, 0.571015), 08.04 (Moeka's, 0.523299), 08.06 (Luka's, 0.456903), 08.07 (Faris's, 0.409420), 08.09 (Suzuha leaves for 1975), 08.10 (0.337187), 08.13 (the time leap machine works), 08.15 (Comima, day 1), 08.17 (the first D-mail undone: back to β), 08.21 17:56 (C204 leaves: Operation Skuld); 2000.11.02 (John Titor appears online); 1975.06 (the IBN 5100 on sale). `launch` rolls its date from 2010.08.21 17:56 back to 2010.07.28 11:50; `arrival` locks on 11:50; `chain`'s missing link is 07.28 12:39. Where a scene shows real science it is accurate: SERN's accelerator carries two beams in opposite directions; the Lorenz attractor has its parameters (10, 28, 8/3); the plunge into the black hole is the one from the innermost stable orbit; a lifetime on the cosmic calendar is 0.18 s.
