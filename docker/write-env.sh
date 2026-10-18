#!/bin/sh
# Write /env.js from the container's NEXT_PUBLIC_* environment variables so
# the static site picks up Cloud Run configuration without a rebuild.
set -eu

out=/usr/share/nginx/html/env.js
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'; }

{
  printf 'window.__MINERVA_ENV__ = {'
  env | grep '^NEXT_PUBLIC_' | sort | while IFS='=' read -r key value; do
    printf '"%s":"%s",' "$key" "$(json_escape "$value")"
  done
  printf '};\n'
} > "$out"

echo "write-env: wrote $(env | grep -c '^NEXT_PUBLIC_' || true) NEXT_PUBLIC_* values to $out"
