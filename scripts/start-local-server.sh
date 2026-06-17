#!/bin/zsh -f
set -euo pipefail

export PATH="/Users/hamad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/hamad/Documents/player/node_modules/.bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "/Users/hamad/Documents/player"
exec concurrently -k "tsx watch server/index.ts" "vite --host 0.0.0.0 --port 5173"
