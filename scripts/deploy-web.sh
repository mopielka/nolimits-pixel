#!/usr/bin/env bash
# Builds the web player and publishes it to the public GitHub Pages repo.
# This repo stays private; only the built site (which bundles the packages in
# animations/ and examples/, but no music) goes public.
set -euo pipefail

PAGES_REPO="git@github.com:mopielka/nolimits-pixel-player.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/dist-web"

cd "$ROOT"
npm run web:build

if find "$SITE" \( -iname '*.mp3' -o -iname '*.wav' -o -iname '*.ogg' -o -iname '*.m4a' \) | grep -q .; then
  echo "Refusing to publish: the build contains music files." >&2
  exit 1
fi

touch "$SITE/.nojekyll"
cd "$SITE"
rm -rf .git
git init -q -b main
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Deploy $(git -C "$ROOT" rev-parse --short HEAD)"
git push -q --force "$PAGES_REPO" main
rm -rf .git
echo "Published to https://mopielka.github.io/nolimits-pixel-player/"
