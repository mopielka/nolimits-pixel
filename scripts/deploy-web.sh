#!/usr/bin/env bash
# Builds the web player and force-pushes it to a GitHub Pages repo that holds
# only the built site. Set PAGES_REPO=<owner>/<repo> to publish somewhere else.
set -euo pipefail

PAGES_REPO="${PAGES_REPO:-mopielka/nolimits-pixel-player}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="$ROOT/dist-web"

cd "$ROOT"
npm run web:build

# Songs are copyrighted and the site is public.
if find "$SITE" \( -iname '*.mp3' -o -iname '*.wav' -o -iname '*.ogg' -o -iname '*.m4a' \) | grep -q .; then
  echo "Refusing to publish: the build contains music files." >&2
  exit 1
fi

touch "$SITE/.nojekyll"
cp "$ROOT/web/site-README.md" "$SITE/README.md"
cd "$SITE"
rm -rf .git
git init -q -b main
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Deploy $(git -C "$ROOT" rev-parse --short HEAD)"
git push -q --force "git@github.com:$PAGES_REPO.git" main
rm -rf .git
echo "Published to https://${PAGES_REPO%%/*}.github.io/${PAGES_REPO#*/}/"
