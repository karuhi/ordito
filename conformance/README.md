# Ordito 準拠テスト

Ordito 規格（[../spec/ordito-spec.md](../spec/ordito-spec.md)）への準拠を機械的に確かめるためのテストセット。
仕様 §9 の「準拠テスト」に対応する。

## 構成

```
conformance/
├── schemas/ordito.schema.json   # ブロック語彙・ドキュメント・コレクションの JSON Schema（draft 2020-12）
├── cases/<name>/
│   ├── ir.json                  # 入力 IR（実装非依存）
│   └── expected.fragment.html   # 期待する本文フラグメント（決定論レベル1の出力・ゴールデン）
└── run.js                       # ランナー（リファレンス実装で検証）
```

`expected.fragment.html` は **決定論（レベル1・構造流し込み）** の出力。AI を使わないため固定で、ゴールデン比較に使える
（AI 生成＝レベル2 は揺らぐためゴールデン比較の対象にしない。検証は §6 の二層で行う）。

## リファレンス実装で走らせる

```bash
node conformance/run.js            # 検証（不適合があれば exit 1）
node conformance/run.js --update   # 期待フラグメントを再生成（仕様/レンダラを変えたとき）
```

ランナーが行うこと:

1. **JSON Schema 検証** — `samples/` と `cases/` の IR が `$defs/document`、コレクションが `$defs/collection` に適合するか。
2. **ゴールデン比較** — 各ケースを決定論レンダリングし `expected.fragment.html` と一致するか。
3. **機械チェック（§6.1）** — 生成フラグメントが契約の許可クラス／タグ／属性に適合するか。

## 自分の実装を試す（準拠したい人向け）

リファレンス実装に依存せず、次の3点を自分の実装で確認すればよい:

1. **IR スキーマ**: 自分の IR が `schemas/ordito.schema.json` の `$defs/document` に適合する
   （任意の JSON Schema バリデータ、または `node reference/engine/schema-check.js <ir> document`）。
2. **決定論出力**: `cases/<name>/ir.json` を**レベル1（決定論・構造流し込み）**でレンダリングした本文フラグメントが、
   `expected.fragment.html` と一致する（テンプレート契約のクラス命名に準拠している前提）。
   - 別テンプレートを使う場合はクラス名が変わるため、ゴールデンは自テンプレート用に `--update` 相当で作り直す。
3. **機械チェック（§6.1）**: 出力が契約の許可リスト（`allowed_classes` / `allowed_html_tags` / `allowed_attributes`）に
   収まり、`content_slot` の外へ出ていない。`field_map` 未マップ（§4.4）が無い。

> 規格コア（§3 IR・コレクション / §4 契約 / §7 スキル契約）に準拠していれば、エンジンやテンプレートの実装は自由。
> 準拠の最小条件は「IR がスキーマに適合」「決定論出力が固定」「機械チェックを通過」。
