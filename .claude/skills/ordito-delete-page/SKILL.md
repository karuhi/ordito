---
name: ordito-delete-page
description: Delete a whole Ordito IR document (page) from the store. Use this when the user has agreed to remove an entire page from the docs. Deletes the IR file and, by default, also removes the page's entry from the collection nav (pruning now-empty groups). Already-generated out/<id>.html is NOT deleted (it just stops being regenerated) — the skill notes this. Does NOT regenerate HTML (ordito-generate is separate) and does NOT ask for confirmation itself; the calling agent owns that decision.
allowed-tools: Bash
---

# ordito-delete-page

Ordito の **書き込みスキル**（仕様 §7.1）。IR ドキュメント（ページ）を1つ削除する。

## いつ使うか / 使わないか

- 使う: ページごと不要になり、ドキュメントから消すとき。
- 使わない: ブロック単位の削除（`ordito-remove-block`）／ナビから外すだけ＝下書き化（`ordito-edit-collection` の `remove`）／HTML の削除（本スキルは出力 HTML を消さない）。
- 確認しない／生成しない（§5.4）。

## 入力（JSON）

```json
{ "doc": "guides/old-page", "prune_nav": true }
```

- `doc`(必須): 削除するページ id。
- `prune_nav`(任意, 既定 true): コレクションからも当該ナビ項目を除去し、空グループを掃除。
- `collection` / `ir_dir`(任意): 省略時は `ordito.config.json` から解決。`dry_run`(任意): 削除せず対象を返すだけ。

## 出力（JSON）

`{ ok, doc, deleted, removed_from_nav, generated:false, note }`

> 注: 既に生成済みの `out/<id>.html` は削除されない（再生成で対象外になるだけ）。必要なら手動削除。

## 実行

```bash
echo '{"doc":"guides/old-page"}' | node "${CLAUDE_SKILL_DIR}/delete-page.js"
```
