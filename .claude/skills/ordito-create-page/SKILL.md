---
name: ordito-create-page
description: Create a NEW Ordito IR document (a new docs page) in the IR store. Use this when the user has agreed to add a brand-new page to the docs (not edit an existing one) — e.g. "新しいページを作る" / "○○のガイドを追加". Writes one new IR document by logical id, sets meta.title and meta.updated_at, leaves generated_at null, and can optionally place the page into the collection nav in the same call. Refuses if the id already exists or is the reserved "index". Does NOT regenerate any HTML (generation is the separate ordito-generate step) and does NOT ask for confirmation itself; the calling agent owns that decision.
allowed-tools: Bash
---

# ordito-create-page

Ordito の **書き込みスキル**（作成スキル, 仕様 §7.1）。新規 IR ドキュメント（ページ）を1つ作る（§3.2）。

## いつ使うか / 使わないか

- 使う: ユーザーが「新しいページを追加する」ことに同意した後。まだ存在しない `doc`（論理パス）を作る。
- 使わない: 既存ページの本文を直す（`ordito-update-block`）／既存ページにブロックを足す（`ordito-add-block`）／ナビだけ並べ替える（`ordito-edit-collection`）／HTML を作り直す（`ordito-generate`）。
- このスキルは **確認しない**。「このページを作りますか？」の y/n は呼び出すAIエージェントが尋ね、yes のときだけ呼ぶ。
- このスキルは **生成しない**（§5.4）。

## 入力（JSON; stdin か `--input <file>`）

```json
{
  "doc": "guides/getting-started",
  "title": "はじめに",
  "blocks": [
    { "type": "heading", "level": 1, "text": "はじめに" },
    { "type": "paragraph", "text": "このページは…" }
  ],
  "meta": { "order": 1, "tags": ["guide"] },
  "nav": { "under": ["ガイド"], "order": 1 }
}
```

- `doc`(必須): 新しいページの論理パス id。`index` は予約で不可（§3.6）。既存 id と重複ならエラー。
- `title`(必須): `meta.title`。
- `blocks`(任意): 初期ブロック配列（語彙10種, §3.3）。`id` を省いたブロックは自動採番（`b1`,`b2`…）。
- `meta`(任意): `order` / `tags` / `sources` などの追加メタ。`title`/`updated_at`/`generated_at` は本スキルが設定する（上書き）。
- `nav`(任意): 指定すると **同時にナビへ掲載**する。`under`（グループ名の配列）配下に `{ doc }` を追加。`order`/`label` 任意。省略時は**下書き（孤立ページ）**として作成（§3.7: 既定で生成対象外）。
- `ir_dir` / `collection`(任意): 省略時は `ordito.config.json` から解決。`dry_run`(任意): true で書き込まずプレビューのみ。

## 出力（JSON）

`{ ok, doc, created, file, in_nav, updated_at, generated:false, note }`
`in_nav:false` のときは下書き。公開には `ordito-edit-collection` でナビ追加 → `ordito-generate`。

## 実行

```bash
echo '{"doc":"guides/getting-started","title":"はじめに","nav":{"under":["ガイド"]}}' \
  | node "${CLAUDE_SKILL_DIR}/create-page.js"
```
