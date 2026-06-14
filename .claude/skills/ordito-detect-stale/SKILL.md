---
name: ordito-detect-stale
description: List Ordito IR documents whose content has changed since their last HTML generation (updated_at is newer than generated_at, or never generated). Read-only; touches nothing. Use this to gather material for asking the user "未反映が N 件あります。反映（再生成）しますか？" before deciding whether to run ordito-generate. Returns a JSON list of stale pages with their timestamps. Does not generate, does not confirm — the calling agent presents the result and asks.
---

# ordito-detect-stale

Ordito の **読み出しスキル**。IR ストアを走査し、**未反映ページ**（成果物が IR より古い）を一覧する（§3.4）。

## いつ使うか

- 更新（`ordito-update-block`）の後、「反映（再生成）しますか？」の確認材料として未反映の件数・対象を提示するとき。
- 生成（`ordito-generate`）の `only:"stale"` の前段の確認に。
- 読み出しのみで副作用なし。確認は呼び出すAIエージェントが行う。

## 入力（JSON）

```json
{ "ir_dir": "samples/ir" }
```

`ir_dir`(任意, 既定 `samples/ir`)。

## 出力（JSON）

```json
{ "ok": true, "total": 5, "stale_count": 1,
  "stale": [ { "id": "guides/quickstart", "file": "...", "updated_at": "…", "generated_at": "…" } ] }
```

`generated_at` が null（未生成）も未反映に含む。

> 注: 未反映判定は時刻比較（`updated_at > generated_at`）。`ordito-generate` は `generated_at = max(now, updated_at)` で
> 押印するため、`updated_at` がマシン時計より未来でも生成後に未反映は解消する（クロックスキュー耐性）。
> 時刻はミリ秒精度で、連続した update→generate を正しく順序づける。

## 実行

```bash
echo '{}' | node .claude/skills/ordito-detect-stale/detect-stale.js
```
