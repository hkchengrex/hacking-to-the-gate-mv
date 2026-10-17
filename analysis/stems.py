"""Demucs (htdemucs_ft) stems of the song (the album version) -> stems/htdemucs_ft/song/{drums,bass,other,vocals}.wav

Called through the Python API and written with soundfile (the demucs CLI saves through
torchaudio, whose codec backend does not load on this machine). The vocal used for lyric
alignment is the cleaner stems/vocals_sub.wav from build_full.py; these stems feed analyze.py.

Run:  uv run python stems.py
"""
import common
import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model

y, sr = sf.read(common.AUDIO, dtype="float32", always_2d=True)
model = get_model("htdemucs_ft").cuda().eval()
assert sr == model.samplerate
x = torch.from_numpy(y.T.copy())
ref = x.mean(0)
x = (x - ref.mean()) / ref.std()
with torch.inference_mode():
    out = apply_model(model, x[None].cuda(), shifts=2, overlap=0.25, progress=True)[0].cpu()
out = out * ref.std() + ref.mean()
common.STEMS.mkdir(parents=True, exist_ok=True)
for name, s in zip(model.sources, out):
    sf.write(common.STEMS / f"{name}.wav", s.numpy().T, sr, subtype="FLOAT")
    print(name, f"{20 * np.log10(np.sqrt(np.mean(s.numpy() ** 2)) + 1e-9):.1f} dBFS")
