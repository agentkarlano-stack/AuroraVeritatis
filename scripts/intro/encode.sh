#!/usr/bin/env bash
# Encodes the intro masters (scripts/intro/build-intro.py) into the delivered files in public/media/intro.
#   scripts/intro/encode.sh <landscape_master.mp4> <portrait_master.mp4> [out_dir] [version, default v1]
# VP9 WebM (preferred by modern browsers) and H.264 MP4 with faststart (Safari and older browsers), no audio, plus a
# poster frame per variant. Each film has its own suffix (-v1, -v2, …; FILMS in IntroSplash.tsx); bump it when a film changes.
set -euo pipefail
L=$1 P=$2 OUT=${3:-public/media/intro} V=${4:-v1}
mkdir -p "$OUT"
enc() { # master, scale, name, webm crf, mp4 crf
  local src=$1 vf=$2 name=$3
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" -vf "$vf" -an -c:v libvpx-vp9 -crf "$4" -b:v 0 -deadline good -cpu-used 1 -row-mt 1 -pix_fmt yuv420p -pass 1 -f null /dev/null
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" -vf "$vf" -an -c:v libvpx-vp9 -crf "$4" -b:v 0 -deadline good -cpu-used 1 -row-mt 1 -pix_fmt yuv420p -pass 2 "$OUT/$name-$V.webm"
  ffmpeg -nostdin -hide_banner -loglevel error -y -i "$src" -vf "$vf" -an -c:v libx264 -preset veryslow -crf "$5" -profile:v high -pix_fmt yuv420p -movflags +faststart "$OUT/$name-$V.mp4"
  # Poster: an early frame (the film opens from black, so 1.0 s shows the first city).
  ffmpeg -nostdin -hide_banner -loglevel error -y -ss 1.0 -i "$src" -frames:v 1 -vf "$vf" -q:v 5 "$OUT/$name-$V.jpg"
  rm -f ffmpeg2pass-0.log
}
enc "$L" "scale=1920:1080:flags=lanczos" aurora-intro-1920 38 27
enc "$L" "scale=1280:720:flags=lanczos" aurora-intro-1280 36 26
enc "$P" "scale=720:1280:flags=lanczos" aurora-intro-720x1280 36 26
ls -l "$OUT"
