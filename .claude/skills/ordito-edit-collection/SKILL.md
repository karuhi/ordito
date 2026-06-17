---
name: ordito-edit-collection
description: Edit the Ordito collection (the site nav / sitemap) — add, move, remove, relabel, or reorder nav entries and groups. Use this when the user wants to change how pages are organized in the navigation: put a page under a group, reorder items, rename a nav label, create a group, or drop a page from the nav. Operates ONLY on the collection (nav items/order/groups, §3.5); it does not touch page content (IR). Validates the collection after editing and does NOT regenerate HTML (ordito-generate is separate). Does NOT ask for confirmation; the calling agent owns that.
allowed-tools: Bash
---

# ordito-edit-collection

Ordito の **書き込みスキル**（仕様 §7.1）。コレクション（ナビ＝サイトマップ, §3.5）を編集する。ページ本体（IR）は触らない。

## いつ使うか / 使わないか

- 使う: ページをナビのグループ配下に置く／並び順を変える／ナビ表示名を変える／グループを作る／ナビから外すとき。
- 使わない: ページの内容や構造（`ordito-update-block` / `add-block` / `move-block`）／ページ自体の作成・削除（`ordito-create-page` / `ordito-delete-page`）。
- 確認しない／生成しない（§5.4）。

## 入力（JSON）— `op` で操作を選ぶ

```json
{ "op": "add", "item": { "doc": "guides/getting-started" }, "under": ["ガイド"], "order": 1 }
```

| op | 必須 | 説明 |
|----|------|------|
| `add` | `item`（`{doc,label?}` か `{group,items?}`）, `under?`, `order?` | ナビ項目／グループを追加 |
| `move` | `doc`\|`group`, `under?`, `order?` | 既存項目を別グループ配下／別順序へ移動 |
| `remove` | `doc`\|`group` | ナビから除去（IR は残る＝下書き化） |
| `relabel` | `doc`, `label` | ナビ表示名の上書き |
| `set_order` | `doc`\|`group`, `order` | 並び順を変更 |

- `under` はグループ名の配列（多階層パス）。省略時はナビ直下。
- `collection`(任意): 省略時は `ordito.config.json` から解決。`dry_run`(任意): 書き込まず結果ナビをプレビュー。

## 出力（JSON）

`{ ok, op, collection_id, changed, note }`。編集後にコレクション・スキーマ検証が通らなければ書き込まずエラー。

## 実行

```bash
echo '{"op":"add","item":{"doc":"guides/getting-started"},"under":["ガイド"]}' \
  | node "${CLAUDE_SKILL_DIR}/edit-collection.js"
```
