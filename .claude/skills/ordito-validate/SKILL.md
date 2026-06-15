---
name: ordito-validate
description: Validate Ordito IR documents and/or generated HTML against the spec's machine checks (§6.1) — JSON Schema conformance of the IR, field_map coverage (unmapped-field detection, §4.4), and, if an output dir is given, the generated fragment's allowed-class/tag/attribute compliance plus a deterministic IR-fidelity check. Read-only. Use it to confirm quality before recording a change or after regenerating (反映前後の品質確認). Returns a JSON report; does not fix or confirm anything.
allowed-tools: Bash
---

# ordito-validate

Ordito の検証スキル（§6 二層のうち機械チェック層＋未マップ検出）。読み出しのみ。

## いつ使うか

- 反映前: IR が語彙スキーマ（§3.3）と `field_map` 網羅（§4.4）を満たすか確認。
- 反映後: `out` を渡すと生成済みページの本文フラグメントを許可リスト照合（§6.1）＋ IR 忠実度（§6.2 の決定論版）で確認。
- 品質確認の材料。修正も確認もしない（AIエージェントが結果を読んで次を判断）。

## 入力（JSON）

```json
{ "doc": "guides/quickstart", "ir_dir": "samples/ir", "out": "site", "contract": "reference/templates/dev-docs-standard/contract.json" }
```

- `doc`(任意): 省略時は ir_dir 内の全 IR。
- `ir_dir` / `out` / `contract`(任意): 省略時は `ordito.config.json`（`irDir` / `out` / `template`）で解決。`out` があれば生成済み HTML の機械チェック＋忠実度も実施。`contract` 既定は config の `template` → 無ければ標準テンプレートの契約。

## 出力（JSON）

```json
{ "ok": true, "checked": 1, "results": [
  { "id": "guides/quickstart",
    "ir_schema": { "ok": true, "errors": [] },
    "fieldmap": { "ok": true, "warnings": [] },
    "mechanical": { "ok": true, "violations": [] },
    "fidelity": { "ok": true, "warnings": [] } } ] }
```

## 実行

```bash
# ir_dir / out を ordito.config.json で解決する場合は空入力でよい
echo '{}' | node "${CLAUDE_SKILL_DIR}/validate.js"
```
