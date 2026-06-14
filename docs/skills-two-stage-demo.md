# Ordito スキル群と二段確認デモ

Ordito の中心思想 **「データ更新と生成の分離」**（仕様 §5.4）と **二段確認ワークフロー**（§7.3）を、
`.claude/skills/` 配下の**原子スキル**として実装したもの。確認（y/n）の主体は **AIエージェント**であり、
スキルは「実行して JSON を返す」だけで確認の判断を持たない。

## スキル一覧（原子操作）

| スキル | 種別 | 役割 | 生成する？ |
|--------|------|------|-----------|
| `ordito-update-block` | 書き込み(§7.1) | IR の1ブロックを差分更新し `updated_at` を進める（§3.4） | **しない**（§5.4） |
| `ordito-detect-stale` | 読み出し | `updated_at > generated_at` の未反映ページを一覧（§3.4） | しない |
| `ordito-generate` | 読み出し(§7.2) | 明示トリガーで該当ページを再生成し `generated_at` を更新（§5.4） | する（明示時のみ） |
| `ordito-validate` | 検証(§6) | IR スキーマ・field_map 網羅・出力の機械チェック＋忠実度 | しない |

各スキルは `.claude/skills/<name>/SKILL.md`（発火条件を明示した description）＋スクリプト。入出力は JSON。
共通処理は `.claude/skills/lib/store.js`、生成は参照実装 `reference/engine/` を呼ぶ。

> **設計の要**: `update`（書き込み）と `generate`（生成）を**別スキルに分けたこと自体**が §5.4
> 「書き込みは生成を引き起こさない」の実装である。`ordito-update-block` は `generated:false` を必ず返す。

## 再現手順

サンプルIRを汚さないよう一時ストアで実行する例（コミット済みサンプルは不変）:

```bash
# 一時ストアを用意（updated_at を過去・generated_at を null に正規化）
rm -rf /tmp/ordito-demo && cp -r samples/ir /tmp/ordito-demo-ir
# 以降、各スキルに ir_dir / out を渡して JSON を stdin で投入する
```

実運用では `ir_dir` 既定（`samples/ir`）・`out`（例 `site`）で呼ぶ。

---

## エージェント対話トランスクリプト（注釈付き）

> 凡例: **🧑 user** / **🤖 agent**（地の文は agent の判断）/ `▶ skill` 呼び出し / `◀ JSON` 戻り値（要約）

---

**🧑 user**: 「クイックスタートの冒頭、レート制限への注意も入れたいです。」

**🤖 agent**: 知見を受け取りました。これは `guides/quickstart` の本文ブロック `b2` の更新に当たります。
*まず一段目の確認をします（スキルは確認しないので、私が尋ねます）。*

**🤖 agent**: 「クイックスタート冒頭の段落に、認証導線＋**レート制限**への注意（[詳細]リンク付き）を追記して
**IR に記載**しますか？」

**🧑 user**: 「はい、記載して。」

*記載に同意 → 書き込みスキルを呼ぶ。生成はまだしない（§5.4）。*

```
▶ ordito-update-block
  { "doc":"guides/quickstart", "block_id":"b2",
    "patch": { "text":"Ordito API を…まず [認証](guides/authentication) で…**レート制限**…([詳細](reference/rate-limits))。" } }
◀ { "ok":true, "changed":true, "updated_at":"2026-06-13T17:37:53.325Z", "generated":false,
    "note":"ブロックを更新し updated_at を進めた。生成は別途 ordito-generate で。" }
```

**🤖 agent**: IR を更新しました（生成はしていません）。*未反映が出ているはずなので、二段目の確認材料を集める。*

```
▶ ordito-detect-stale  { }
◀ { "ok":true, "stale_count":1,
    "stale":[ { "id":"guides/quickstart",
                "updated_at":"2026-06-13T17:37:53.325Z", "generated_at":"2026-06-13T17:37:33.802Z" } ] }
```

**🤖 agent**: 「**未反映が1件**あります（`guides/quickstart`）。更新内容を**反映（再生成）**しますか？
このページだけを作り直します。」

**🧑 user**: 「お願いします。」

*反映に同意 → 明示トリガーで該当ページのみ生成。*

```
▶ ordito-generate
  { "collection":"samples/collection.json", "out":"site", "only":"stale" }
◀ { "ok":true, "trigger":"explicit", "generated":["guides/quickstart"],
    "generated_at":"2026-06-13T17:37:53.421Z" }
```

**🤖 agent**: *反映できたか確認（detect-stale が 0 になるはず）＋品質チェック。*

```
▶ ordito-detect-stale  { }
◀ { "stale_count":0 }

▶ ordito-validate  { "doc":"guides/quickstart", "out":"site" }
◀ { "ok":true, "results":[ { "id":"guides/quickstart",
      "ir_schema":{"ok":true}, "fieldmap":{"ok":true}, "mechanical":{"ok":true}, "fidelity":{"ok":true} } ] }
```

**🤖 agent**: 「反映しました。`guides/quickstart` を再生成し、検証（語彙スキーマ・field_map 網羅・許可リスト・
IR忠実度）すべて green です。未反映は 0 件になりました。」

---

## このデモが示していること

- **二段確認は AI が組み立てた**: 「記載しますか？」「反映しますか？」はどちらも agent がユーザーに尋ねた。
  スキルはどれも y/n を持たず、`ok`/`changed`/`stale`/`generated` 等の JSON を返すだけ。agent がそれを読んで次を判断。
- **更新と生成の分離（§5.4）**: STEP 2 の `update-block` は `generated:false`。生成は STEP 4 の明示トリガーのみ。
  更新の副作用として生成は一切走っていない。
- **差分更新（§3.4）**: 1ブロック（`b2`）だけ書き換え、`updated_at` を進めた。`detect-stale` が
  `updated_at > generated_at` で未反映を検出。
- **選択的再生成（§3.4）**: `only:"stale"` で**該当1ページのみ**再生成（他4ページは触らない）。
- **状態の永続**: `updated_at`/`generated_at` は IR ファイルに保持され、スキル呼び出しをまたいで未反映判定が機能する（DB不要）。
- **JSON 契約**: すべての入出力が JSON（§データ交換原則）で、agent が結果を読んで分岐できる。
