---
name: ordito-add-block
description: Insert a NEW block into an existing Ordito IR document. Use this when the user has agreed to add a new piece of content (a paragraph, code sample, note, table, step, etc.) to a page that already exists — as opposed to editing an existing block (ordito-update-block) or creating a whole new page (ordito-create-page). Inserts the block at append/at/after/before a sibling, or inside a tab, auto-assigns a unique block id if omitted, validates the result, and bumps meta.updated_at. Does NOT regenerate HTML (ordito-generate is separate) and does NOT ask for confirmation; the calling agent owns that.
allowed-tools: Bash
---

# ordito-add-block

Ordito の **書き込みスキル**（仕様 §7.1）。既存 IR ドキュメントにブロックを1つ挿入する（§3.3）。

## いつ使うか / 使わないか

- 使う: 既存ページに新しいブロック（段落・コード・表・注記・手順…）を足すとき。
- 使わない: 既存ブロックの内容を直す（`ordito-update-block`）／新しいページを作る（`ordito-create-page`）／ブロックを消す・動かす（`ordito-remove-block` / `ordito-move-block`）。
- 確認しない／生成しない（§5.4）。

## 入力（JSON）

```json
{
  "doc": "guides/quickstart",
  "block": { "type": "note", "variant": "info", "text": "補足: …" },
  "position": { "after": "b3" }
}
```

- `doc`(必須): 既存ページ id。
- `block`(必須): 追加するブロック（`type` 必須。語彙10種）。`id` を省くと自動採番（`b<N>`）。入れ子（tabs 内）の子ブロックの id も自動採番。
- `position`(任意): 挿入位置。`append`（既定・末尾）/ `at:<index>` / `after:"<block_id>"` / `before:"<block_id>"`。タブ内に入れるときは `in_tab: { "block_id": "<tabsブロックid>", "tab_index": 0 }` を併せて指定。
- `ir_dir`(任意) / `dry_run`(任意, bool: 書き込まずプレビュー)。

## 出力（JSON）

`{ ok, doc, block_id, added, position, updated_at, generated:false, note }`
`block_id` は採番後の実 id。挿入後に語彙スキーマ検証が通らなければ書き込まずエラー。

## 実行

```bash
echo '{"doc":"guides/quickstart","block":{"type":"paragraph","text":"…"},"position":{"after":"b8"}}' \
  | node "${CLAUDE_SKILL_DIR}/add-block.js"
```
