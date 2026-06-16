---
name: ordito-remove-block
description: Delete one block from an existing Ordito IR document (write to the IR store). Use this when the user has agreed to remove a specific piece of content from a page — a now-obsolete note, paragraph, code sample, etc. Removes exactly one block by id (including blocks nested inside tabs), validates the remaining document, and bumps meta.updated_at. Does NOT regenerate HTML (ordito-generate is the separate step) and does NOT ask for confirmation itself; the calling agent owns that decision.
allowed-tools: Bash
---

# ordito-remove-block

Ordito の **書き込みスキル**（仕様 §7.1）。既存 IR ドキュメントからブロックを1つ削除する（§3.3）。

## いつ使うか / 使わないか

- 使う: 不要になったブロックをページから取り除くとき。
- 使わない: 内容を直す（`ordito-update-block`）／位置を変える（`ordito-move-block`）／ページごと消す（`ordito-delete-page`）。
- 確認しない／生成しない（§5.4）。

## 入力（JSON）

```json
{ "doc": "guides/quickstart", "block_id": "b3" }
```

- `doc`(必須) / `block_id`(必須): 削除するブロック id（tabs 内も可, §3.3.3）。
- `ir_dir`(任意) / `dry_run`(任意, bool: 書き込まず削除対象を before として返すだけ)。

## 出力（JSON）

`{ ok, doc, block_id, removed, before, updated_at, generated:false, note }`
`before` は削除されたブロックの内容（取り消し材料）。削除後に語彙スキーマ検証が通らなければ書き込まずエラー。

## 実行

```bash
echo '{"doc":"guides/quickstart","block_id":"b3"}' | node "${CLAUDE_SKILL_DIR}/remove-block.js"
```
