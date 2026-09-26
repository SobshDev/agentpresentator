#!/usr/bin/env bash
# Turns your avatar source files into the web-ready assets the site serves.
# Usage: npm run avatar -- <source-folder>
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: npm run avatar -- <source-folder>

Files in the folder (PNG, JPG or WebP images; MP4, MOV or WebM videos; square works best):
  portrait.*        required  Closed-mouth portrait, head centered on a near-black background
  portrait-open.*   optional  Same pose with the mouth open (defaults to the portrait)
  idle.*            optional  Seamless listening loop that starts and ends on the portrait
  talking.*         optional  Seamless talking loop that starts and ends on the portrait

Give both videos for an animated avatar, or neither for a still one.
USAGE
}

[[ $# -eq 1 && -d "$1" ]] || { usage; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)." >&2; exit 1; }

SRC="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/avatar"
SIZE=480
SQUARE="crop='min(iw,ih)':'min(iw,ih)'"
# The favicon zooms in on the face, which sits in the upper middle of the portrait.
FACE="$SQUARE,crop=iw*0.62:ih*0.62:iw*0.19:ih*0.12"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

find_src() {
  local name="$1" ext candidate
  shift
  for ext in "$@"; do
    for candidate in "$SRC/$name.$ext" "$SRC/$name.$(tr '[:lower:]' '[:upper:]' <<<"$ext")"; do
      if [[ -f "$candidate" ]]; then echo "$candidate"; return; fi
    done
  done
}

PORTRAIT="$(find_src portrait png jpg jpeg webp)"
OPEN="$(find_src portrait-open png jpg jpeg webp)"
IDLE="$(find_src idle mp4 mov webm)"
TALK="$(find_src talking mp4 mov webm)"

[[ -n "$PORTRAIT" ]] || { echo "Missing portrait.png (or .jpg/.webp) in $SRC" >&2; exit 1; }
if [[ -n "$IDLE" && -z "$TALK" ]] || [[ -z "$IDLE" && -n "$TALK" ]]; then
  echo "Provide both idle and talking videos, or neither." >&2
  exit 1
fi
[[ -n "$OPEN" ]] || OPEN="$PORTRAIT"

png() {
  ffmpeg -loglevel error -y -i "$1" -vf "$2" -frames:v 1 "$3"
}

webp() {
  png "$1" "$2" "$TMP/frame.png"
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libwebp; then
    ffmpeg -loglevel error -y -i "$TMP/frame.png" -c:v libwebp -quality 85 "$3"
  elif command -v cwebp >/dev/null; then
    cwebp -quiet -q 85 "$TMP/frame.png" -o "$3"
  else
    echo "Your ffmpeg has no WebP encoder. Install cwebp (brew install webp) or a full ffmpeg build." >&2
    exit 1
  fi
}

video() {
  ffmpeg -loglevel error -y -i "$1" -an \
    -vf "$SQUARE,scale=$SIZE:$SIZE:flags=lanczos,fps=24,format=yuv420p" \
    -c:v libx264 -preset slow -crf 30 -profile:v high -movflags +faststart "$2"
}

mkdir -p "$OUT"
webp "$PORTRAIT" "$SQUARE,scale=$SIZE:$SIZE:flags=lanczos" "$OUT/portrait.webp"
webp "$OPEN" "$SQUARE,scale=$SIZE:$SIZE:flags=lanczos" "$OUT/portrait-open.webp"
webp "$PORTRAIT" "$SQUARE,scale=96:96:flags=lanczos" "$OUT/portrait-96.webp"
png "$PORTRAIT" "$FACE,scale=64:64:flags=lanczos" "$ROOT/app/icon.png"
png "$PORTRAIT" "$FACE,scale=180:180:flags=lanczos" "$ROOT/public/apple-touch-icon.png"

if [[ -n "$IDLE" ]]; then
  video "$IDLE" "$OUT/idle.mp4"
  video "$TALK" "$OUT/talking.mp4"
  MODE=animated
else
  rm -f "$OUT/idle.mp4" "$OUT/talking.mp4"
  MODE=still
fi

echo "Built the $MODE avatar in public/avatar:"
for file in "$OUT"/*; do
  printf '  %-20s %s KB\n' "$(basename "$file")" "$(( $(wc -c <"$file") / 1024 ))"
done
if [[ "$MODE" == still ]]; then
  echo "Next: set avatar.animated to false in content/site.ts."
else
  echo "Next: make sure avatar.animated is true in content/site.ts."
fi
