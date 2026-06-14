---
name: ordito-update-block
description: Apply a block-level diff update to an Ordito IR document (write to the IR store). Use this AFTER the user has agreed that a specific piece of knowledge/content should be recorded into the docs — e.g. "記載しておきますか？" → yes. Updates exactly one block (by block id, including blocks nested inside tabs) and bumps meta.updated_at. It does NOT regenerate any HTML (generation is a separate, explicit step — see ordito-generate) and it does NOT ask for confirmation itself; the calling agent owns that decision. Idempotent: re-applying an identical patch is a no-op.
---

# ordito-update-block

Ordito の **書き込みスキル**（更新スキル, 仕様 §7.1）。IR ストアの1ブロックを差分更新する（§3.4）。

## いつ使うか / 使わないか

- 使う: ユーザーが「この知見を記載する」ことに同意した後、該当ブロックの内容を IR に反映するとき。
- 使わない: HTML を作り直したいとき（それは `ordito-generate`）。未反映の検出（`ordito-detect-stale`）。
- このスキルは **確認しない**。「記載しますか？」の y/n は呼び出すAIエージェントがユーザーに尋ね、yes のときだけ本スキルを呼ぶ。
- このスキルは **生成しない**（§5.4: 書き込みは生成を引き起こさない）。

## 入力（JSON; stdin か `--input <file>`）

```json
{ "doc": "guides/quickstart", "block_id": "b2", "patch": { "text": "新しい本文…" }, "ir_dir": "samples/ir" }
```

- `doc`(必須): ドキュメント id。 `block_id`(必須): 更新するブロック id（tabs 内も可）。
- `patch`(必須): ブロックにマージする**内容フィールド**（トップレベルを上書き。配列は丸ごと置換）。
  **`id`・`type` は変更不可**（ブロックの同一性・種別は不変条件。指定するとエラー）。patch 適用後に語彙スキーマ検証を行い、
  不適合なら書き込まずエラーにする（不正な IR をストアに残さない）。
- `ir_dir`(任意): IR ストアの場所（既定 `samples/ir`）。

## 出力（JSON）

`{ ok, doc, block_id, changed, updated_at, before, after, generated:false, note }`
`changed:false` のときは内容に変化が無く、書き込みも `updated_at` 更新もしていない（冪等）。

## 実行

```bash
echo '{"doc":"guides/quickstart","block_id":"b2","patch":{"text":"…"}}' \
  | node .claude/skills/ordito-update-block/update-block.js
```

更新後は `meta.updated_at` が進むので、`ordito-detect-stale` が当該ページを「未反映」として拾えるようになる。
