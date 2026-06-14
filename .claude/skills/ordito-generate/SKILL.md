---
name: ordito-generate
description: Explicitly (re)generate Ordito HTML pages from IR + template contract + collection, and stamp meta.generated_at. This is the heavy, explicit "反映（再生成）" step — run it ONLY after the user has agreed to reflect changes (e.g. "反映しますか？" → yes). It can regenerate everything, only specific page ids, or only stale pages (only:"stale"). It MUST NOT be run as a side effect of updating IR — updating (ordito-update-block) never triggers generation (spec §5.4). The calling agent owns the confirmation; this skill just generates and returns a report.
---

# ordito-generate

Ordito の **読み出し（生成）スキル**（§7.2）。明示トリガーで成果物を生成し、`meta.generated_at` を進める（§5.4）。

## いつ使うか / 使わないか

- 使う: ユーザーが「反映（再生成）する」ことに同意した後。`ordito-detect-stale` の結果を見せて確認を取ってから。
- 使わない: 単に IR を書き換えたいだけのとき（それは `ordito-update-block`）。
- **重要（§5.4）**: このスキルは更新の副作用として走ってはならない。更新と生成は別工程。確認を経て明示的に呼ぶ。

## 入力（JSON）

```json
{ "collection": "samples/collection.json", "out": "site",
  "only": "stale", "mode": "deterministic", "ir_dir": "samples/ir", "ai_cache": "site/ai-fragments" }
```

- `collection`(必須), `out`(必須・出力先)。
- `only`(任意): `["guides/quickstart", …]`（id 指定）か `"stale"`（未反映のみ, §3.4）。省略時は全ページ。
- `mode`(任意, 既定 `deterministic`): `deterministic` / `mixed`(構造化=決定論・散文=AI) / `ai`。
- `ai_cache`(任意): mixed/ai 用の L2 断片ディレクトリ。

## 出力（JSON）

`{ ok, trigger:"explicit", mode, out, generated:[id…], generated_at, results:[{id,via,valid,warnings}], note }`
生成された各ページの IR の `generated_at` が更新され、`ordito-detect-stale` から外れる。

## 実行

```bash
echo '{"collection":"samples/collection.json","out":"site","only":"stale"}' \
  | node .claude/skills/ordito-generate/generate.js
```
