# The pipeline: from the inputs to the data

The renderer runs on three inputs: the song (`audio/song.wav`), its analysis (`data/audio.json`) and the aligned lyrics (`data/lyrics.json`). The song is not in the repository; `build_full.py` makes `song.wav` from the album tracks. The two data files are included (they are what the scripts below produced), as is the lyric text, so the analysis only has to be rerun to change them. The fonts and the stills of the video are the renderer's other inputs, made by two more scripts.

All the analysis runs from `analysis/` in its uv environment (`pyproject.toml`, `uv.lock`: Python 3.11–3.12, PyTorch with CUDA 12.8, Demucs, librosa, torchaudio, WhisperX, fontTools). `common.py` is imported first by every script: it sets every model cache under `analysis/.cache/` and defines the paths (`AUDIO`, `STEMS`, `WORK`, `DATA`).

## 1. The song: `build_full.py`

Input: the album single's full track and its instrumental, in `audio/`: `01. Hacking to the Gate.flac` and `03. Hacking to the Gate [Instrumental].flac`.

- `audio/song.wav`: the full track decoded with ffmpeg to 44.1 kHz stereo 16-bit PCM on its own timeline (t = 0 is the FLAC's first sample; 256.467 s). This is the video's timeline: every time in the data, the timeline and the scenes is a time in this file.
- `analysis/stems/vocals_sub.wav`: the vocal for the lyric alignment, as the full track minus the instrumental (the same master, the instrumental offset by 29,456 samples), which is far cleaner than a separated stem.

## 2. The stems: `stems.py`

Demucs `htdemucs_ft` on the GPU, through its Python API, writes `analysis/stems/htdemucs_ft/song/{drums, bass, other, vocals}.wav`. These feed the analysis (the beat grid is fitted on the drums, and the four stem envelopes come from them); the alignment uses `vocals_sub.wav` instead.

## 3. The analysis: `analyze.py` → `data/audio.json`

`uv run python analyze.py [--plots]` (the plots go to `analysis/qa/`). What it computes, all on the `song.wav` timeline:

- **The beat grid.** The tempo is constant: 160.997 BPM (period 0.37268 s), fitted over the whole song on the drum and mix onset envelopes, with the phase refined on the kick attacks; the first beat in the song is at 0.095 s. The grid starts **nine beats before the song**, at −3.259 s: that is the TV cut's bar 0, so bar and beat numbers match the TV cut (which the project's numbering was built on) and bar k starts at −3.259 + 1.4908 k s. `beats` has 697 entries, `downbeats` 175 (bar phase from the snares on 2 and 4 and the lyric phrases starting on bars); `time_signature` is 4.
- **Sections**, on downbeats: intro 0.00, verse 14.63, pre 38.48, hook 60.84, chorus 62.33, interlude 87.67, verse2 104.07, pre2 127.92, hook2 150.28, chorus2 151.78, solo 177.12, break 214.38, chorus3 217.37, outro 242.71.
- **Envelopes** at 100 fps (`fps`; frame i is centred at i/100 s), each an array of 25,647 values: `rms`, `low` (< 150 Hz), `mid` (150–2000 Hz) and `high` (> 4 kHz) of the full mix, and `vocal`, `drums`, `bass`, `other` from the stems; a 46 ms RMS window, one-pole smoothing (10 ms attack, 90 ms release), each divided by its own 99th percentile and clipped to 0..1 (linear amplitude).
- **Onsets** as `[time, strength 0..1]` from the drums stem: `kick` (attacks below 120 Hz; 376), `snare` (1.5–5 kHz attacks with a loud noise tail; 384), `hat` (above 7 kHz, away from snares and kicks; 330); and `vocal` (onset-strength peaks of the vocal stem; 293).
- A `notes` field repeats the method.

The engine (`src/engine/audio.ts`) reads `duration, bpm, fps, beats, downbeats, sections, onsets` and the eight envelopes.

## 4. The lyrics: `readings.py`, `align.py` → `data/lyrics.json`

Inputs: the lyric text in `lyrics/full.txt` and the readings in `readings.py`.

- **`lyrics/full.txt`:** 30 non-empty lines, one per sung line of the album version, in the order sung. Each line is its sung phrases separated by single spaces (Japanese has no spaces, so the phrase is the unit the data calls a word: a run of characters sung without a break, typically two to seven). Brackets 『』 are written as in the official lyrics and belong to the phrase they enclose. The English hook line is written in Latin letters, one word per token (four tokens).
- **`readings.py`:** one entry per line, one string per phrase, the sung reading of each displayed character in order, separated by `|`: kana for kanji as sung (particles as pronounced: は as わ, へ as え, を as お), an empty reading for a bracket (not sung), and a small っ merged into the next character's reading. `romaji()` turns a reading into the lowercase letters the aligner's vocabulary uses. The readings must match the text line for line, phrase for phrase and character for character; `align.py` checks the line count and pairs the rest up in order.
- **`align.py`:** one global CTC Viterbi pass over `vocals_sub.wav` (resampled to 16 kHz, the region 10–250 s) with torchaudio's multilingual forced aligner (`MMS_FA`), the targets being every character's romanised reading in order. (The Japanese wav2vec2 model WhisperX uses was tried first: trained on read speech, it hears almost nothing in the singing.) Each character gets `[start, end]`: it lasts until the next one starts; a phrase's last character is held while the voice stays within 24 dB of the line's peak, at most 1.5 s. The output per line is `text, start, end, words[]`, and per word `w, start, end, conf` (the mean posterior of its characters), `syl` (one `[start, end]` per displayed character; a bracket gets a zero-length span at the next sung character) and `kana` (each character as typed: kana, digits and brackets as written, kanji by their reading). The script prints the alignment and lists the characters under 0.3 confidence for checking by ear.
- **`whisper_run.py`** (optional): a WhisperX large-v3 transcription of the vocal into `analysis/work/whisper.json`, used as a cross-check of where the lines are.
- **`qa_plot.py`** (optional): spectrogram, pitch and envelope plots with the word boundaries, for checking the alignment.

Then **`lyric_breaks.py`** adds `brk` to every word: the displayed-character indices where a new romaji word starts, from MeCab's segmentation (fugashi with unidic-lite; a token that is an auxiliary verb, a suffix or a conjunctive particle attaches to the one before). It needs two packages the environment does not pin: `uv pip install --python .venv/Scripts/python.exe fugashi unidic-lite`, then `.venv/Scripts/python.exe lyric_breaks.py` (`.venv/bin/python` outside Windows). The engine (`src/engine/romaji.ts`) makes the romaji from `kana` and `brk` at load time (Hepburn, lower case; the particles は, へ, を as wa, e, o; 々 by the reading before it; っ doubling the next consonant; ん before a vowel or y as n'; ー lengthening the vowel).

The final `data/lyrics.json` has 30 lines, 70 words and 400 displayed characters.

## 5. The fonts: `app/public/fonts/fetch.py`

`uv run --with fonttools python app/public/fonts/fetch.py` (or any Python with fontTools). It downloads the seven families from the google/fonts repository at one pinned commit, checks each file's SHA-256 against the file the video was rendered with, saves them with their licences in `app/public/fonts/src/`, and cuts the static instances the renderer loads into `app/public/fonts/` (Archivo at widths 62, 75, 87.5, 100, 112.5 and 125 × weights 300, 500, 700, 900; Archivo Italic at 75 and 100 × 400 and 800; Cormorant Garamond at 400 and 600, upright and italic; M PLUS 1 at 300, 500, 700, 900). The instances are compared with the video's by hash too; a different fontTools version may write a few bytes differently without changing the outlines. The single-stroke SVG fonts in `app/public/fonts/stroke/` are in the repository.

## 6. The stills of the video: `bun scripts/render.ts thumbs`

From `app/`, with the fonts and data in place: it renders a 640×360 JPEG every 0.5 s of the whole song (514 of them) and `index.json` into `app/public/plates/v2/`. `prologue` glimpses them and `achievement` runs them backwards; until they exist those two scenes draw dark frames where the stills go. One export is enough: the frames it takes inside those two scenes are the only ones affected by the stills themselves. Re-export after changing any scene, before the final render.

## 7. The video

See `ENGINE.md` (Running things). In short: `bash scripts/render-parallel.sh` from `app/`, which writes `out/final/seg_0..8.mp4` (32-second segments; the last is 0.47 s), joins them with the song into `out/hacking-to-the-gate.mp4` (15,388 frames) and encodes `out/hacking-to-the-gate-preview.mp4`. On the machine the video was made on (a laptop with a 16-core Core Ultra 7 and an RTX 5070) it took about 66 minutes with four workers at final quality; a review-quality pass (`render-parallel.sh 4 12 ../out/review review`) is quicker.
