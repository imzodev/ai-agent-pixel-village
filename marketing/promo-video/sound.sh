#!/usr/bin/env bash
# The promo's sound, made with ffmpeg only (nothing to license): a soft
# two-chord pad, a gentle pluck on each cue, a chime on the end card, and
# (optionally) a soft kick on every beat from BEAT_FROM on.
#   bash sound.sh                                     # the 30 s cut
#   DUR=60 CUTS="…" CHIME=53 BEAT_FROM=14 OUT=audio/promo60.wav bash sound.sh
# Cue times must match the composition (build.mjs / build60.mjs print them).
set -euo pipefail
mkdir -p audio
DUR=${DUR:-30}
read -r -a CUTS <<< "${CUTS:-3 8 12 15 18 21 24}"
CHIME=${CHIME:-27}
BEAT=${BEAT:-0.6}          # seconds per beat (100 BPM)
BEAT_FROM=${BEAT_FROM:-}   # empty: no beat
DARK_UNTIL=${DARK_UNTIL:-0} # before this, the pad sits an octave down (the "problem" act)
OUT=${OUT:-audio/promo.wav}
# max(t-c,0) keeps exp() finite before each note (inf × 0 would be NaN).
chord="if(lt(mod(t,7.5),3.75), sin(2*PI*130.81*t*F)+sin(2*PI*164.81*t*F)+sin(2*PI*196.00*t*F)+0.5*sin(2*PI*261.63*t*F), sin(2*PI*174.61*t*F)+sin(2*PI*220.00*t*F)+sin(2*PI*261.63*t*F)+0.5*sin(2*PI*349.23*t*F))"
pad="0.07*(${chord//F/if(lt(t,$DARK_UNTIL),0.5,1)})*(0.75+0.25*sin(2*PI*0.2*t))"
plucks=""
for c in "${CUTS[@]}"; do
  plucks+="+0.22*sin(2*PI*880*t)*exp(-max(t-$c,0)*22)*gte(t,$c)+0.12*sin(2*PI*1320*t)*exp(-max(t-$c,0)*30)*gte(t,$c)"
done
chime="+0.18*(sin(2*PI*1046.5*t)+0.8*sin(2*PI*1318.5*t)*gte(t,$CHIME+0.12)+0.7*sin(2*PI*1568*t)*gte(t,$CHIME+0.24))*exp(-max(t-$CHIME,0)*2.2)*gte(t,$CHIME)"
# A soft kick (a falling low sine) on every beat, and a quiet tick on the off-beat, until the end card.
beat=""
if [ -n "$BEAT_FROM" ]; then
  beat="+0.35*sin(2*PI*(48+60*exp(-mod(t-$BEAT_FROM,$BEAT)*30))*mod(t-$BEAT_FROM,$BEAT))*exp(-mod(t-$BEAT_FROM,$BEAT)*9)*gte(t,$BEAT_FROM)*lt(t,$CHIME)"
  beat+="+0.04*sin(2*PI*3200*t)*exp(-mod(t-$BEAT_FROM-$BEAT/2,$BEAT)*60)*gte(t,$BEAT_FROM+$BEAT/2)*lt(t,$CHIME)"
fi
expr="${pad}${plucks}${chime}${beat}"
expr="${expr//,/\\,}" # commas would split the filtergraph
ffmpeg -y -loglevel error -f lavfi -i "aevalsrc=${expr}:s=48000:d=${DUR}" \
  -af "lowpass=f=2400,aecho=0.8:0.6:120|240:0.25|0.15,afade=t=in:d=1.2,afade=t=out:st=$((DUR-2)):d=2,loudnorm=I=-16:TP=-1.5:LRA=7,aformat=channel_layouts=stereo" \
  -ar 48000 -t ${DUR} "$OUT"
echo "$OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")s)"
