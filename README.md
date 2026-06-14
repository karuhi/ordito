# Ordito

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec: v0.4 (draft)](https://img.shields.io/badge/spec-v0.4%20draft-orange.svg)](spec/ordito-spec.md)

**Ordito** — AI がドキュメントを生成・更新する、オープンな文書生成システムの**規格**と参照実装。

> 名は織物の経糸（伊: *ordito* / *orditura*）に由来する。**構造（IR）という経糸を先に張り、その上に AI が
> 本文を織り上げる**——この設計思想を体現する。

---

## Ordito とは

従来の静的サイトジェネレータ（Docusaurus 等）は、コンテンツ・表示・ビルドが密に結合している。
Ordito はこれらを分離する:

- **中身**は、表示から独立した構造化データ **IR（中間表現, JSON）** として持つ。HTML を含まない。
- **見た目（枠）**は、**テンプレート**が固定で持つ（レイアウト・デザイントークン・コンポーネント CSS）。
- 両者を **生成エンジン**が合成し、テンプレート契約の範囲内で AI が本文 HTML を織り上げる。

### 設計思想（要約）

- **制約された多様性**: 枠（レイアウト・トークン）は固定し、その内側で AI の出力に揺らぎを許す。
  ただし**IR の情報の欠落は許容しない**（揺らぎ ≠ データ欠落）。揺らぎの量は契約の `render_hint` の詳細度で制御できる。
- **データ更新と生成の分離**: IR の更新（軽い・頻繁）と成果物の生成（重い・明示トリガー）は別工程。
  書き込みは生成を自動的に引き起こさない。これが「記載しますか → 反映しますか」の二段確認 UX に対応する。
- **すべて JSON / すべてスキル経由**: IR・契約・コレクションの受け渡しは JSON で統一。拡張はストアへの
  「書き込み」か「読み出し」のスキルとして足す。

詳細は **[規格本体: spec/ordito-spec.md](spec/ordito-spec.md)** を参照。

---

## クイックスタート（参照実装を動かす）

前提: **Node.js v18+ のみ**（依存パッケージ・ビルド工程なし）。

```bash
# 1) 複数ページのドキュメントサイトを生成（決定論モード: AI不要・常に動く）
node reference/engine/generate.js --collection samples/collection.json --out site
open site/index.html          # ブラウザで開く（macOS。Linux は xdg-open）

# 2) IR / コレクションを JSON Schema で検証
node reference/engine/schema-check.js samples/ir/guides/quickstart.json document
node reference/engine/schema-check.js samples/collection.json collection

# 3) 混在生成（構造化ブロック=決定論 / 散文=AI レベル2）
#    散文の AI 生成は ANTHROPIC_API_KEY があれば API を叩き、無ければ --ai-cache の L2 断片を使う。
#    どちらも無ければ散文も決定論にフォールバック（＝常に動く）。
node reference/engine/generate.js --collection samples/collection.json --out site \
     --mode mixed --ai-cache site/ai-fragments
```

`site/` に、ナビ付きで相互リンクした HTML ページ群が出力される（doc id の階層を保持）。

### スキル（差分更新と二段確認）

AI エージェントが使う原子スキルを `.claude/skills/` に同梱。「IR の1ブロック更新 → 未反映検出 →
該当ページのみ再生成 → 検証」を、エージェントが二段確認の対話として組み立てられる。
→ [.claude/skills/](.claude/skills/) と [docs/skills-two-stage-demo.md](docs/skills-two-stage-demo.md)。

---

## リポジトリ構成

```
ordito/
├── spec/                      # 【規格本体 / normative】これだけで読める。実装から独立。
│   ├── ordito-spec.md         #   現行版（v0.4 ドラフト）
│   └── history/               #   旧版（v0.2 …）
├── reference/                 # 【参照実装 / informative】差し替え可能な一例
│   ├── engine/                #   生成エンジン（Node.js 依存ゼロ）
│   └── templates/             #   デフォルトテンプレート（枠＋契約 JSON）
├── conformance/               # 【準拠テスト】自分の実装を試せる
│   ├── schemas/               #   IR・コレクションの JSON Schema（語彙の機械可読定義）
│   ├── cases/                 #   サンプルIR → 期待成果物の検証セット
│   └── run.js                 #   準拠チェックランナー
├── samples/                   # サンプル（v0.4 準拠の IR ＋ コレクション）
│   ├── collection.json
│   └── ir/<group>/<name>.json
├── .claude/skills/            # スキル群（差分更新・未反映検出・生成・検証）
├── docs/                      # 設計判断の記録（POC 所見メモ＝「なぜこの仕様か」）
└── LICENSE / CONTRIBUTING.md / README.md
```

生成物（`site/` `dist/`）は再生成可能なため**追跡せず**、構成図にも含めない（clone 直後には存在せず、上記
クイックスタートの実行で生成される）。`.gitignore` 済み。

---

## 規格と参照実装の関係（コアと差し替え可能部分）

| 層 | 場所 | 位置づけ |
|----|------|----------|
| **規格コア** | `spec/`（特に §3 IR・コレクション / §4 契約 / §7 スキル契約） | 準拠実装が必ず守る契約。安定が最優先。 |
| **参照実装** | `reference/` | 規格を満たす作り方の**一例**。言語・構造ごと**差し替え可能**。 |
| **準拠テスト** | `conformance/` | 別実装が「規格に準拠しているか」を機械的に確かめる。 |

第三者は、規格（`spec/`）を読み、参照実装（`reference/`）を動かして挙動を掴み、`conformance/` で
自分の実装を検証しながら、独自の生成エンジン・テンプレート・スキルを作れる。

キーワード「MUST / SHOULD / MAY」は要件の強さ（規格に準拠）。

---

## ステータス / バージョニング

ドラフト。POC を二周（単一ページ / 複数ページ＋コレクション＋混在生成）し、差分更新・二段確認をスキルとして実装済み。

規格は**セマンティックバージョニング**に従う。IR / 契約 / コレクションのスキーマの**破壊的変更はメジャー**を上げる。
詳細と貢献方法は [CONTRIBUTING.md](CONTRIBUTING.md)。

設計の経緯（なぜこの仕様になったか）は POC 所見メモに残してある:
[docs/findings.md](docs/findings.md)（第1弾）/ [docs/findings-poc2.md](docs/findings-poc2.md)（第2弾）/
[docs/findings-skills.md](docs/findings-skills.md)（スキル）。

## ライセンス

[Apache License 2.0](LICENSE)。
