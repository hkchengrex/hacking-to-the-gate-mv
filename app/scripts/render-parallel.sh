#!/usr/bin/env bash
# The full render, several segments at once. One render is bound by a single CPU thread (Chrome's GPU process: it
# takes about two cores in all and a third of the card), so a 16-core machine has room for four side by side.
# Same segments, files and result as render-final.sh (32-second segments, then a lossless concat with the album
# audio muxed once, and a lighter preview copy); rerunning skips the segments already done, and the two scripts
# resume each other's work.
#   bash scripts/render-parallel.sh [workers=4] [max-samples=36] [segments dir=../out/final] [name=hacking-to-the-gate]
#   SCALE=2 CRF=18 bash scripts/render-parallel.sh 3 36 ../out/final-4k hacking-to-the-gate-4k   (true 3840x2160; the preview is 1080p)
set -u
cd "$(dirname "$0")/.."
export PATH="${LOCALAPPDATA:-}/Microsoft/WinGet/Packages/Oven-sh.Bun_Microsoft.Winget.Source_8wekyb3d8bbwe/bun-windows-x64:$PATH"
WORKERS=${1:-4}
MAX=${2:-36}
OUT=${3:-../out/final}
NAME=${4:-hacking-to-the-gate}
SCALE=${SCALE:-1} # output scale (2 = 3840x2160)
CRF=${CRF:-16}
DEST=$(dirname "$OUT")
mkdir -p "$OUT"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ../audio/song.wav)
SEG=32
N=$(python -c "import math; print(math.ceil($DUR / $SEG))")
frames() { ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$1" 2>/dev/null || echo 0; }
# a segment's render loads only the scenes that play in it (with a second either side): at 4K every loaded scene
# holds its render targets in video memory, and all 43 at once is more than the card has
TL=$(bun scripts/render.ts timeline 2>/dev/null)
only() { echo "$TL" | awk -F'	' -v a="$1" -v b="$2" '$2 ~ /^[0-9.]+$/ && $3 > a - 1 && $2 < b + 1 { printf "%s%s", (n++ ? "," : ""), $1 }'; }
want() { python -c "print(round((min(($1 + 1) * $SEG, $DUR) - $1 * $SEG) * 60))"; }

# (locks left by a run that was stopped)
for ((k = 0; k < N; k++)); do rmdir "$OUT/seg_$k.lock" 2>/dev/null; done

# A worker takes the next segment nobody has (a lock directory: mkdir is atomic) until there are none left.
worker() {
  local w=$1 k F FROM TO WANT HAVE attempt
  sleep $((w * 6)) # (staggered: each render starts its own dev server and browser)
  for ((k = 0; k < N; k++)); do
    mkdir "$OUT/seg_$k.lock" 2>/dev/null || continue
    F="$OUT/seg_$k.mp4"
    FROM=$((k * SEG))
    TO=$(python -c "print(min(($k + 1) * $SEG, $DUR))")
    WANT=$(want "$k")
    HAVE=$(frames "$F")
    if [ "$HAVE" = "$WANT" ]; then echo "segment $k: done already"; continue; fi
    echo "segment $k: $FROM → $TO s ($WANT frames), worker $w"
    for attempt in 1 2 3; do
      bun scripts/render.ts video --from "$FROM" --to "$TO" --samples auto --max-samples "$MAX" --shutter 0.4 --scale "$SCALE" --crf "$CRF" --only "$(only "$FROM" "$TO")" --noaudio --out "$F" 2>&1 | tr '\r' '\n' | grep -E "wrote|error|Error" | grep -v "404 (Not Found)" | tail -3
      HAVE=$(frames "$F")
      [ "$HAVE" = "$WANT" ] && break
      echo "segment $k: got $HAVE of $WANT frames, retrying ($attempt)"
    done
  done
}
for ((w = 0; w < WORKERS; w++)); do worker "$w" & done
wait

# every segment whole? then join them
: > "$OUT/list.txt"
BAD=0
for ((k = 0; k < N; k++)); do
  F="$OUT/seg_$k.mp4"
  rmdir "$OUT/seg_$k.lock" 2>/dev/null
  if [ "$(frames "$F")" != "$(want "$k")" ]; then echo "segment $k is incomplete"; BAD=1; continue; fi
  echo "file '$(cygpath -m "$(realpath "$F")")'" >> "$OUT/list.txt"
done
if [ "$BAD" != 0 ]; then echo "FINAL-FAILED (rerun to render the missing segments)"; exit 1; fi
ffmpeg -v error -y -f concat -safe 0 -i "$OUT/list.txt" -i ../audio/song.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart "$DEST/$NAME.mp4"
PREVIEW_VF=(); [ "$SCALE" != 1 ] && PREVIEW_VF=(-vf scale=1920:1080:flags=lanczos)
ffmpeg -v error -y -i "$DEST/$NAME.mp4" "${PREVIEW_VF[@]}" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -c:a copy -movflags +faststart "$DEST/$NAME-preview.mp4"
ls -la "$DEST/$NAME"*.mp4
echo FINAL-DONE
