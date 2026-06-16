---
name: ordito-move-block
description: Reorder or re-parent an existing block within an Ordito IR document (write to the IR store). Use this when the user wants to change the ORDER of content on a page, or move a block into/out of a tab — without changing the block's content. Moves exactly one existing block by id to a new position (at/after/before a sibling, or inside a tab), validates the result, and bumps meta.updated_at. Does NOT regenerate HTML (ordito-generate is separate) and does NOT ask for confirmation; the calling agent owns that.
allowed-tools: Bash
---

# ordito-move-block

Ordito の **書き込みスキル**（仕様 §7.1）。既存ブロックを同一ドキュメント内で並べ替え／再配置する（§3.3）。

## いつ使うか / 使わないか

- 使う: ページ内のブロックの**順序**を変える、タブの内外へ移すとき（内容は変えない）。
- 使わない: 内容を直す（`ordito-update-block`）／追加・削除（`ordito-add-block` / `ordito-remove-block`）／ナビの並びを変える（`ordito-edit-collection`）。
- 確認しない／生成しない（§5.4）。

## 入力（JSON）

```json
{ "doc": "guides/quickstart", "block_id": "b8", "position": { "before": "b4" } }
```

- `doc`(必須) / `block_id`(必須): 動かす既存ブロック id。
- `position`(必須): 移動先。`at:<index>` / `after:"<bid>"` / `before:"<bid>"`、タブ内へは `in_tab:{ "block_id","tab_index" }`。基準ブロックに自分自身は指定不可。
- `ir_dir`(任意) / `dry_run`(任意)。

## 出力（JSON）

`{ ok, doc, block_id, moved, position, updated_at, generated:false, note }`
移動後に語彙スキーマ検証が通らなければ書き込まずエラー。

## 実行

```bash
echo '{"doc":"guides/quickstart","block_id":"b8","position":{"before":"b4"}}' \
  | node "${CLAUDE_SKILL_DIR}/move-block.js"
```
