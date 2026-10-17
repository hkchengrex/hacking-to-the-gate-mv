"""Whisper (large-v3) transcription of the vocal stem -> work/whisper.json

Used to locate the lyric lines (rough windows) before forced alignment, and as a cross-check.
Run:  uv run python whisper_run.py
"""
import common  # noqa: F401  (model caches in analysis/.cache)
import json

import whisperx

audio = whisperx.load_audio(str(common.ROOT / "stems" / "vocals_sub.wav"))
model = whisperx.load_model("large-v3", "cuda", compute_type="float16", language="ja",
                            vad_options={"vad_onset": 0.3, "vad_offset": 0.2})
res = model.transcribe(audio, batch_size=8, language="ja")
(common.WORK / "whisper.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
for s in res["segments"]:
    print(f"{s['start']:7.2f}-{s['end']:7.2f}  {s['text']}")
