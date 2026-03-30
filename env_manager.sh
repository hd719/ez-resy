#!/bin/zsh

set -euo pipefail

if [[ ! -f .env ]]; then
  echo ".env not found; skipping DATE update."
  exit 0
fi

if grep -Eiq '^ANY_SATURDAY=(1|true|yes|on)$' .env; then
  echo "ANY_SATURDAY is enabled; leaving DATE unchanged."
  exit 0
fi

HORIZON_DAYS="${BOOKING_HORIZON_DAYS:-14}"
DATE=$(date +%Y-%m-%d)
TARGET_DATE=$(date -v+"${HORIZON_DAYS}"d -j -f "%Y-%m-%d" "$DATE" "+%Y-%m-%d")

if grep -Eq '^DATE=' .env; then
  sed -i '' "s/^DATE=.*/DATE=$TARGET_DATE/" .env
else
  printf '\nDATE=%s\n' "$TARGET_DATE" >> .env
fi
