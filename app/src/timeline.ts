// The edit: which plate plays when (docs/DESIGN.md: the full song in three acts by world line).
// Each plate is an episode and owns one lyric line; it opens on the 8th note at or before the line's
// first syllable, or on a downbeat in the instrumental parts. Bar numbers are the TV cut's (the beat
// grid starts at its bar 0, 3.36 s before the album: see analysis/analyze.py). Plates not built yet
// play the draft (scenes/draft.ts).
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`] ?? modules['./scenes/draft.ts'];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

type Act = 'a' | 'b' | 'sg';
/** [id, act, start]: start is a lyric line index (cut on the 8th before it) or { bar } (a downbeat). */
type Cue = number | { bar: number };
const PLATES: [id: string, act: Act, start: Cue, paper?: boolean, module?: string][] = [
  // Act I · α · observation (intro, verse 1, pre 1, hook, chorus 1)
  ['prologue', 'a', { bar: 2 }], ['timeleap', 'a', { bar: 4 }],
  ['heartbeat', 'a', 0], ['magnitude', 'a', 1], ['irreversible', 'a', 2], ['butterfly', 'a', 3],
  ['homeostasis', 'a', 4], ['complex', 'a', 5], ['ergosphere', 'a', 6], ['fault', 'a', 7],
  ['gate', 'a', 8], ['zero', 'a', { bar: 44 }], ['parallel', 'a', { bar: 45 }],
  ['starmine', 'a', 10], ['apoptosis', 'a', 11], ['horizon', 'a', 12],
  // Act II · β · failure (interlude, verse 2, pre 2, hook 2)
  ['pond', 'b', { bar: 61 }, false, 'melt'], ['chain', 'b', { bar: 66 }],
  ['flatline', 'b', 13, false, 'heartbeat'], ['farce', 'b', 14], ['sern', 'b', 15], ['theorems', 'b', 16],
  ['finite', 'b', 17, false, 'homeostasis'], ['virtual', 'b', 18], ['merciless', 'b', 19, false, 'ergosphere'], ['choice', 'b', 20], ['hook2', 'b', 21, false, 'gate'],
  // Act III · Steins;Gate · breakthrough (chorus 2, solo, final chorus, outro)
  ['members', 'sg', 22], ['reading', 'sg', 23, false, 'irreversible'], ['trick', 'sg', 24], ['coat', 'sg', 25],
  ['launch', 'sg', { bar: 121 }], ['fields', 'sg', { bar: 125 }], ['arrival', 'sg', { bar: 129 }],
  ['wound', 'sg', { bar: 133 }], ['deceive', 'sg', { bar: 137 }, false, 'melt'], ['approach', 'sg', { bar: 141 }],
  ['silence', 'sg', { bar: 146 }, false, 'zero'], ['converge', 'sg', { bar: 149 }, false, 'parallel'],
  ['reunion', 'sg', 27, false, 'starmine'], ['loopbreak', 'sg', 28, false, 'apoptosis'], ['landing', 'sg', 29, false, 'horizon'], ['achievement', 'sg', { bar: 165 }],
];

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const bar = (k: number) => au.timeOfBeat(k * 4);
  /** The 8th note at or before the first syllable of lyric line i. */
  const cut = (i: number) => au.timeOfBeat(Math.floor(au.beatAt(ly.lines[i]!.words[0]!.start + 0.005) * 2) / 2);
  const startOf = (c: Cue) => (typeof c === 'number' ? cut(c) : c.bar === 2 ? 0 : bar(c.bar));
  return PLATES.map(([id, act, cue, paper, module], i) => {
    const next = PLATES[i + 1];
    return {
      id,
      load: scene(module ?? id),
      start: startOf(cue),
      end: next ? startOf(next[2]) : au.duration,
      params: { act, paper: !!paper },
    };
  });
}
