// Stills of the whole video (public/plates/v2/, made by `bun scripts/render.ts thumbs`): the glimpses of
// the future in `prologue` and the rewind of `achievement`. They are not in the repository (16 MB, regenerated
// by that command); without them those two plates draw blank frames in their place.
export interface Thumbs { times: number[]; imgs: HTMLImageElement[] }

let cache: Promise<Thumbs> | null = null;

export function loadThumbs(): Promise<Thumbs> {
  if (!cache) cache = (async () => {
    try {
      const r = await fetch('plates/v2/index.json');
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return { times: [], imgs: [] };
      const { times } = (await r.json()) as { times: number[] };
      const imgs = await Promise.all(times.map(async (_, i) => {
        const im = new Image();
        im.src = `plates/v2/s_${String(i).padStart(3, '0')}.jpg`;
        try { await im.decode(); } catch { /* missing still: drawn blank */ }
        return im;
      }));
      return { times, imgs };
    } catch {
      return { times: [], imgs: [] };
    }
  })();
  return cache;
}

/** The still nearest song time t (null if there are none). */
export function thumbAt(th: Thumbs, t: number): HTMLImageElement | null {
  if (!th.times.length) return null;
  let best = 0;
  for (let i = 1; i < th.times.length; i++) if (Math.abs(th.times[i]! - t) < Math.abs(th.times[best]! - t)) best = i;
  const im = th.imgs[best]!;
  return im.complete && im.naturalWidth ? im : null;
}

/** Draw a still into a rect (or a placeholder frame when it is missing). */
export function drawThumb(c: CanvasRenderingContext2D, im: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  if (im) c.drawImage(im, x, y, w, h);
  else { c.fillStyle = '#16181B'; c.fillRect(x, y, w, h); c.strokeStyle = '#3A3F45'; c.lineWidth = 2; c.strokeRect(x, y, w, h); }
}
