#!/usr/bin/env bash
# =========================================================================
# install-into.sh — Ordito のスキル群＋エンジンを別リポジトリへ同梱する
#   Ordito リポジトリ内で実行し、対象リポジトリに以下を配置する:
#     <target>/.claude/skills/                ← 全スキル＋共有ライブラリ(store.js)
#     <target>/.claude/skills/lib/engine/      ← 参照エンジン本体（reference/engine）
#     <target>/.claude/skills/lib/engine/templates/  ← 同梱テンプレ（dev-docs-standard ほか）
#     <target>/.claude/skills/lib/engine/schemas/ordito.schema.json  ← IR/コレクション スキーマ
#   これで対象リポジトリには reference/ ツリーが無くてもスキルが動く
#   （store.js#engineDir / config.js は __dirname 基準で同梱物を解決する）。
#
#   使い方:  bash scripts/install-into.sh /path/to/target-repo
#   次の一手: 対象リポジトリで  echo '{}' | node .claude/skills/ordito-init/init.js
# =========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
SRC_ROOT="$(pwd)"

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: bash scripts/install-into.sh <target-repo-dir>" >&2
  exit 1
fi
if [ ! -d "$TARGET" ]; then
  echo "エラー: 対象ディレクトリが無い: $TARGET" >&2
  exit 1
fi

DEST="$TARGET/.claude/skills"
ENGINE_DEST="$DEST/lib/engine"

mkdir -p "$DEST"
# 1) スキル群＋共有ライブラリ（store.js, 各 ordito-* スキル）
cp -R "$SRC_ROOT/.claude/skills/." "$DEST/"
# 既存の同梱エンジンを一旦消して作り直す（クリーン同梱）
rm -rf "$ENGINE_DEST"
mkdir -p "$ENGINE_DEST/schemas"

# 2) 参照エンジン本体
cp "$SRC_ROOT"/reference/engine/*.js "$ENGINE_DEST/"
# 3) 同梱テンプレート（__dirname/templates として解決される）
cp -R "$SRC_ROOT/reference/templates" "$ENGINE_DEST/templates"
# 4) JSON Schema（__dirname/schemas/ordito.schema.json として解決される）
cp "$SRC_ROOT/conformance/schemas/ordito.schema.json" "$ENGINE_DEST/schemas/ordito.schema.json"

echo "✓ Ordito を $TARGET に同梱しました:"
echo "    $DEST/                （スキル＋ store.js）"
echo "    $ENGINE_DEST/         （エンジン＋ templates/ ＋ schemas/）"
echo
echo "次の一手（対象リポジトリで）:"
echo "  cd \"$TARGET\""
echo "  echo '{}' | node .claude/skills/ordito-init/init.js   # config / docs / collection / Actions を生成"
echo "  echo '{}' | node .claude/skills/ordito-generate/generate.js   # 初回反映（HTML 生成）"
