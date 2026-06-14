#!/usr/bin/env bash
# =========================================================================
# deploy-pages.sh — samples/site/ を gh-pages ブランチへ配置（GitHub Pages）
#   コミット済みの samples/site/ を、そのまま gh-pages ブランチのルートへ force-push する。
#   CI は使わない。サンプルを更新したら次の2手で再配置:
#     1) node reference/engine/generate.js --collection samples/collection.json --out samples/site
#     2) bash scripts/deploy-pages.sh
#   公開URL: https://<user>.github.io/<repo>/
# =========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="samples/site"
if [ ! -f "$SRC/index.html" ]; then
  echo "エラー: $SRC が無い。先に生成してください:" >&2
  echo "  node reference/engine/generate.js --collection samples/collection.json --out samples/site" >&2
  exit 1
fi

REMOTE="$(git remote get-url origin)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -R "$SRC"/. "$TMP"/
touch "$TMP/.nojekyll"          # Jekyll 処理を無効化（素の静的サイトとして配信）

git -C "$TMP" init -q
git -C "$TMP" checkout -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" commit -q -m "deploy: sample site"
git -C "$TMP" push -f "$REMOTE" gh-pages

echo "✓ samples/site → gh-pages に配置しました。"
echo "  Pages が gh-pages/(root) を参照していれば数十秒で更新されます。"
