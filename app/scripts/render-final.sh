#!/usr/bin/env bash
# The final render of the full song, in 32-second segments (a crash costs one segment; rerunning skips the
# segments already done), then a lossless concat with the album audio muxed once, and a lighter preview copy.
#   bash scripts/render-final.sh [max-samples=36] [segments dir=../out/final] [name=hacking-to-the-gate]
# (e.g. a review-quality pass: bash scripts/render-final.sh 12 ../out/review review)
set -u
cd "$(dirname "$0")/.."
export PATH="${LOCALAPPDATA:-}/Microsoft/WinGet/Packages/Oven-sh.Bun_Microsoft.Winget.Source_8wekyb3d8bbwe/bun-windows-x64:$PATH"
MAX=${1:-36}
OUT=${2:-../out/final}
NAME=${3:-hacking-to-the-gate}
DEST=$(dirname "$OUT")
mkdir -p "$OUT"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ../audio/song.wav)
SEG=32
N=$(python -c "import math; print(math.ceil($DUR / $SEG))")
: > "$OUT/list.txt"
for ((k = 0; k < N; k++)); do
  FROM=$((k * SEG))
  TO=$(python -c "print(min(($k + 1) * $SEG, $DUR))")
  F="$OUT/seg_$k.mp4"
  WANT=$(python -c "print(round(($TO - $FROM) * 60))")
  HAVE=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$F" 2>/dev/null || echo 0)
  if [ "$HAVE" != "$WANT" ]; then
    echo "segment $k: $FROM → $TO s ($WANT frames)"
    for attempt in 1 2 3; do
      bun scripts/render.ts video --from "$FROM" --to "$TO" --samples auto --max-samples "$MAX" --shutter 0.4 --noaudio --out "$F" 2>&1 | tr '\r' '\n' | grep -E "wrote|error|Error" | tail -3
      HAVE=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$F" 2>/dev/null || echo 0)
      [ "$HAVE" = "$WANT" ] && break
      echo "segment $k: got $HAVE of $WANT frames, retrying ($attempt)"
    done
  else
    echo "segment $k: done already"
  fi
  echo "file '$(cygpath -m "$(realpath "$F")")'" >> "$OUT/list.txt"
done
ffmpeg -v error -y -f concat -safe 0 -i "$OUT/list.txt" -i ../audio/song.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart "$DEST/$NAME.mp4"
ffmpeg -v error -y -i "$DEST/$NAME.mp4" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -c:a copy -movflags +faststart "$DEST/$NAME-preview.mp4"
ls -la "$DEST/$NAME"*.mp4
echo FINAL-DONE
