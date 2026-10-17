"""The album version is the video's audio -> audio/song.wav, and its vocal -> stems/vocals_sub.wav

The video runs on the full song (4:16). song.wav is the FLAC as 16-bit PCM on its own timeline (t = 0 is
the FLAC's first sample). The vocal for lyric alignment is the full song minus the instrumental FLAC
(same master, offset 29456 samples).

Run:  uv run python build_full.py
"""
import subprocess

import numpy as np
import soundfile as sf

import common

SR = 44100
AUD = common.PROJECT / "audio"
FULL = AUD / "01. Hacking to the Gate.flac"
INST = AUD / "03. Hacking to the Gate [Instrumental].flac"
INST_OFF = 29456  # full = inst + INST_OFF (samples)


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def main():
    full, inst = decode(FULL), decode(INST)
    sf.write(AUD / "song.wav", full, SR, subtype="PCM_16")
    shifted = np.zeros_like(full)
    n = min(len(full) - INST_OFF, len(inst))
    shifted[INST_OFF:INST_OFF + n] = inst[:n]
    voc = full - shifted
    out = common.ROOT / "stems" / "vocals_sub.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, voc, SR, subtype="FLOAT")
    rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    print(f"song.wav {len(full) / SR:.3f} s ({rms(full):.1f} dBFS); vocals_sub.wav ({rms(voc):.1f} dBFS)")


if __name__ == "__main__":
    main()
