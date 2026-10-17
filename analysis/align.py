"""Character-level lyric alignment -> data/lyrics.json

  1. build_full.py : the album version and its vocal stem (full song minus the instrumental FLAC).
  2. whisper_run.py: Whisper transcription (a cross-check, made on the TV cut).
  3. this script   : one global CTC Viterbi pass over the vocal stem with torchaudio's MMS_FA
                     (multilingual, romanised text), then timings per displayed character.

Japanese has no spaces, so the "words" of data/lyrics.json are the phrases separated by
spaces in lyrics/full.txt, and each word carries one `syl` span per displayed character (the
engine's Lyrics.wordProgress sweeps through them). Every character is aligned by its sung
reading (readings.py), romanised; the English line as spelled. (The Japanese wav2vec2 model
WhisperX uses was tried first: trained on read speech, it hears almost nothing in the singing.)

Run:  uv run python align.py
"""
import common
import json

import numpy as np
import soundfile as sf
import soxr
import torch
import torchaudio

from readings import READINGS, romaji

LYRICS = common.PROJECT / "lyrics" / "full.txt"
VOCALS = common.ROOT / "stems" / "vocals_sub.wav"
REGION = (10.0, 250.0)   # song seconds searched by the alignment (the album version: all 30 lines)
SR = 16000
HOP = 320                # wav2vec2 frame = 20 ms
TAIL_DB = -24.0          # a phrase's last character is held while the vocal stays within this of the line's peak
TAIL_MAX = 1.5


def is_typed_as_is(ch):
    """Kana, ASCII and punctuation are typed as they are written; kanji are typed by their reading."""
    return ch.isascii() or "　" <= ch <= "ヿ"


def emissions(model, wav):
    """Log-probs (T x V), computed in 20 s windows with 2 s of context either side."""
    win, ctx = 20 * SR, 2 * SR
    out = []
    for s in range(0, len(wav), win):
        a, b = max(0, s - ctx), min(len(wav), s + win + ctx)
        x = wav[a:b]
        with torch.inference_mode():
            lp = torch.log_softmax(model(torch.from_numpy(x)[None].cuda())[0][0].float(), -1).cpu().numpy()
        f0 = (s - a) // HOP
        n = (min(s + win, len(wav)) - s) // HOP
        out.append(lp[f0:f0 + n])
    return np.concatenate(out)


def ctc_viterbi(lp, tgt, blank):
    """Best CTC path of the target sequence; returns (frame, target index) for frames that emit a target."""
    T, L = len(lp), len(tgt)
    S = 2 * L + 1
    lab = np.full(S, blank)
    lab[1::2] = tgt
    skip = np.zeros(S, bool)  # s may come from s-2 (a label differing from the previous label)
    skip[3::2] = np.array(tgt[1:]) != np.array(tgt[:-1])
    NEG = -1e30
    dp = np.full(S, NEG)
    dp[0], dp[1] = lp[0, blank], lp[0, tgt[0]]
    back = np.zeros((T, S), np.int8)
    for t in range(1, T):
        c0 = dp
        c1 = np.concatenate([[NEG], dp[:-1]])
        c2 = np.where(skip, np.concatenate([[NEG, NEG], dp[:-2]]), NEG)
        stack = np.stack([c0, c1, c2])
        k = np.argmax(stack, 0)
        dp = stack[k, np.arange(S)] + lp[t, lab]
        back[t] = k
    s = S - 1 if dp[S - 1] >= dp[S - 2] else S - 2
    path = []
    for t in range(T - 1, -1, -1):
        if s % 2 == 1:
            path.append((t, s // 2))
        s -= int(back[t, s])
    return path[::-1]


def main():
    lines = [l.strip() for l in LYRICS.read_text(encoding="utf-8").splitlines() if l.strip()]
    assert len(lines) == len(READINGS), (len(lines), len(READINGS))
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False).cuda().eval()
    vocab = bundle.get_dict(star=None)
    blank = vocab["-"]

    # units: one per sung display character (one per English word), each with its reading's letters
    units = []   # dict(line, tok, ci, ids)
    for li, (line, rd) in enumerate(zip(lines, READINGS)):
        for ti, (tok, r) in enumerate(zip(line.split(" "), rd)):
            if tok.isascii():
                units.append(dict(line=li, tok=ti, ci=None, ids=[vocab[c] for c in romaji(r)]))
                continue
            prev = ""
            for ci, reading in enumerate(r.split("|")):
                if reading:
                    # context: a lone ー lengthens the previous character's vowel
                    rom = romaji(prev + reading)[len(romaji(prev)):]
                    units.append(dict(line=li, tok=ti, ci=ci, ids=[vocab[c] for c in rom]))
                    prev = reading
    tgt, owner = [], []
    for ui, u in enumerate(units):
        tgt += u["ids"]
        owner += [ui] * len(u["ids"])

    y, sr = sf.read(VOCALS, dtype="float32", always_2d=True)
    wav = soxr.resample(y.mean(1), sr, SR)
    a, b = int(REGION[0] * SR), int(REGION[1] * SR)
    lp = emissions(model, wav[a:b])
    path = ctc_viterbi(lp, tgt, blank)
    t_of = lambda f: REGION[0] + f * HOP / SR

    frames = {}  # unit -> emitted frames
    for f, k in path:
        frames.setdefault(owner[k], []).append(f)
    post = np.exp(lp)
    for ui, u in enumerate(units):
        fr = frames[ui]
        u["start"], u["last"] = t_of(min(fr)), t_of(max(fr) + 1)
        u["conf"] = float(np.mean([post[f, tgt[k]] for f, k in path if owner[k] == ui]))

    # vocal envelope (10 ms) for held phrase endings
    env_hop = SR // 100
    env = np.sqrt(np.convolve(wav ** 2, np.ones(env_hop) / env_hop, "same")[::env_hop]) + 1e-9
    db = 20 * np.log10(env)

    # ends: a character lasts until the next one starts; a phrase's last character is held while
    # the voice is (until the next phrase, at most TAIL_MAX)
    for ui, u in enumerate(units):
        nxt = units[ui + 1] if ui + 1 < len(units) else None
        if nxt and (nxt["line"], nxt["tok"]) == (u["line"], u["tok"]):
            u["end"] = nxt["start"]
            continue
        cap = min(nxt["start"] if nxt else u["last"] + TAIL_MAX, u["last"] + TAIL_MAX)
        lu = [x for x in units if x["line"] == u["line"]]
        peak = db[int(lu[0]["start"] * 100):int(lu[-1]["last"] * 100) + 1].max()
        e = int(u["last"] * 100)
        while e < int(cap * 100) and db[e] > peak + TAIL_DB:
            e += 1
        u["end"] = max(u["last"], e / 100)

    out = []
    for li, line in enumerate(lines):
        words = []
        for ti, tok in enumerate(line.split(" ")):
            us = [u for u in units if (u["line"], u["tok"]) == (li, ti)]
            if tok.isascii():
                syl = [[round(us[0]["start"], 3), round(us[0]["end"], 3)]]
            else:
                by_ci = {u["ci"]: u for u in us}
                syl, prev_end = [], us[0]["start"]
                for ci, ch in enumerate(tok):
                    if ci in by_ci:
                        u = by_ci[ci]
                        syl.append([round(u["start"], 3), round(u["end"], 3)])
                        prev_end = u["end"]
                    else:  # silent bracket: zero length, at the next sung character (or the previous end)
                        nx = next((by_ci[c] for c in range(ci + 1, len(tok)) if c in by_ci), None)
                        x = nx["start"] if nx else prev_end
                        syl.append([round(x, 3), round(x, 3)])
            wd = dict(w=tok, start=round(us[0]["start"], 3), end=round(us[-1]["end"], 3),
                      conf=round(float(np.mean([u["conf"] for u in us])), 3), syl=syl)
            if not tok.isascii():
                # typed kana per character (for the phone's input): kana, digits and brackets as written
                # (は is typed は even where it is sung わ), kanji by their reading
                rd = READINGS[li][ti].split("|")
                wd["kana"] = [ch if is_typed_as_is(ch) else r for ch, r in zip(tok, rd)]
            words.append(wd)
        out.append(dict(text=line, start=words[0]["start"], end=words[-1]["end"], words=words))

    (common.DATA / "lyrics.json").write_text(json.dumps({"lines": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    for l in out:
        print(f"{l['start']:6.2f}-{l['end']:6.2f}  " + "  ".join(f"{w['w']}@{w['start']:.2f}({w['conf']:.2f})" for w in l["words"]))
    low = [(u["line"], lines[u["line"]].split(" ")[u["tok"]], u["start"], u["conf"]) for u in units if u["conf"] < 0.3]
    if low:
        print(f"\n{len(low)} low-confidence characters (< 0.3):")
        for li, tok, t, c in low:
            print(f"  L{li} {tok} @{t:.2f} {c:.2f}")


if __name__ == "__main__":
    main()
