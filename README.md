# Ordito POC

[Ordito 仕様書 v0.2](docs/ordito-spec.md) の **最小 POC（概念実証）**。

> 手書きのサンプル IR（JSON）を入力すると、テンプレートの枠に収まった単一の HTML ページが出力される
> ——この一点を、動く形で証明する。

仕様の全機能は実装していない。POC のスコープは「IR → 生成 → 枠に収まった HTML」の**一周**に絞る。
移行・差分更新・二段確認 UX・配信・永続化層などは**対象外**（[docs/findings.md](docs/findings.md) のスコープ表参照）。

> **第2弾（v0.3）**: コレクション（サイトマップ）込みの**複数ページ生成**まで拡張済み。
> 複数 IR ＋ コレクション → ナビ付きで相互リンクした複数 HTML ページ群。構造化ブロックは決定論、散文は AI の
> **混在生成**も実装。→ [第2弾の動かし方](#第2弾-v03-コレクション込み複数ページ生成) / [docs/findings-poc2.md](docs/findings-poc2.md)

## できること

- サンプル IR（JSON）を、テンプレート契約に従って単一 HTML ページへ生成する。
- **生成レベル1（構造流し込み・決定論）**: AI を使わずオフラインで全ブロックを機械変換。常に動く。
- **生成レベル2（コンテンツエリア生成・AI）**: 本文領域の HTML を AI が契約の範囲内で組む。
- 仕様 3.3 の語彙（`heading` / `paragraph` / `code` / `inline_code` / `params` / `table` / `note` / `list` / `link` / `tabs` / `steps`）を一通りカバー。
- 生成物の最小 **契約遵守チェック**（許可クラス／タグ・style/id 禁止・枠侵食・整形式）。

## スタック

**Node.js v18+（依存ゼロ）。** 選定理由:

- JSON を `JSON.parse` / `JSON.stringify` でそのまま扱える（仕様の「JSON 統一」原則に素直）。
- テンプレートリテラルで HTML 文字列の組み立てが容易。
- `fetch` が標準搭載 → Anthropic API 呼び出しに `npm install` 不要。
- `node` さえあればどこでも動く（ビルド工程なし）。

## ディレクトリ構成

```
ordito/
├── README.md
├── docs/
│   ├── ordito-spec.md        # 仕様書 v0.2（入力）
│   └── findings.md           # 所見メモ（v0.3 への材料）★必読
├── samples/                  # 手書きサンプル IR（正本＝JSON）
│   ├── quickstart.json
│   └── api-auth.json
├── templates/
│   └── dev-docs-standard/
│       ├── frame.html        # 枠（ナビ/ヘッダー/フッター/本文差し込み口）
│       ├── styles.css        # デザイントークン＋コンポーネントCSS（テンプレート所有）
│       └── contract.json     # テンプレート契約（AIに渡す JSON 契約・§4.2）
├── engine/
│   ├── generate.js           # メイン: IR + 契約 + 枠 → 単一HTML（オーケストレータ）
│   ├── render.js             # 決定論レンダラ（レベル1）
│   ├── prompt.js             # レベル2プロンプトビルダー（4戦略）＋CLI
│   ├── provider.js           # LLMプロバイダ（Anthropic fetch / キャッシュ断片）
│   └── validate.js           # 契約遵守チェッカ（最小・§6）
└── dist/                     # 生成物（出力HTML。ブラウザで開ける）
```

## 動かし方

### 1. 決定論モード（AI不要・常に動く）

```bash
node engine/generate.js
```

`dist/` に `index.html` / `quickstart.html` / `authentication.html` が生成される。
ブラウザで開く:

```bash
open dist/index.html        # macOS
```

各ページは CSS をインライン化した**自己完結の単一 HTML**なので、`file://` でもそのまま開ける。

### 2. AI モード（生成レベル2）

本文領域を AI に組ませる。次のいずれかの経路で動く。

```bash
# (a) APIキーがある場合: 実際に Anthropic API を叩く
export ANTHROPIC_API_KEY=sk-...
node engine/generate.js --mode ai --strategy rules
#   strategy ∈ rules | schema | example | minimal

# (b) 事前生成したAI出力の断片を使う場合（キー不要・再現可能）
node engine/generate.js --mode ai --ai-cache dist/ai-fragments
#   dist/ai-fragments/<slug>.json （{ "html": "..." }）または <slug>.html を読む
```

AI 断片も API キーも無い場合は、安全のため決定論レンダリングにフォールバックする（一周は必ず通す）。

### 3. プロンプトの確認

AI に渡すプロンプトをそのまま標準出力で確認できる:

```bash
node engine/prompt.js samples/api-auth.json rules
```

### 4. 契約遵守チェック単体

```bash
node engine/validate.js <fragment.html>
```

## 生成物の見方

`dist/` 配下の構成:

- `dist/index.html` — ドキュメント一覧（ホーム）。
- `dist/quickstart.html` / `dist/authentication.html` — 決定論モード（レベル1）の各ページ。
- `dist/ai/` — AIモード（レベル2）の出力。決定論版と同じ枠・同じドキュメント集合。
- `dist/report.json` — 生成結果の機械可読レポート。`{ mode, strategy, results: [{ id, out, via, valid, violations }] }`。
  `strategy` は AIモード時のみ値を持つ（決定論時は `null`）。
- `dist/prompts/` — 各戦略（rules/schema/example/minimal）のレベル2プロンプト（`findings.md` §4 の比較実験の入力）。
- `dist/bakeoff/` — 4戦略×2docs の AI 生成フラグメント（同実験の生成物）。
- `dist/ai-fragments/` — AIモードの入力に使う採用フラグメント（schema戦略の出力。`--ai-cache` で読む）。

> `dist/` は `node engine/generate.js` で再生成できる。AIモードの再現は `dist/ai-fragments/` の
> キャッシュ断片を使う（API キー不要）。

## 第2弾 (v0.3): コレクション込み複数ページ生成

複数の IR ＋ コレクション（サイトマップ）から、ナビ付きで相互リンクした複数ページを生成する。

```bash
# 決定論モード（全ブロック機械変換・AI不要）
node engine/generate.js --collection samples/collection.json --out site
open site/index.html

# 混在モード（構造化=決定論 / 散文=AI レベル2）。AI断片は site/ai-fragments/ から読む
node engine/generate.js --collection samples/collection.json --out site \
     --mode mixed --ai-cache site/ai-fragments

# IR / コレクションを JSON Schema で検証
node engine/schema-check.js samples/ir/guides/quickstart.json document
node engine/schema-check.js samples/collection.json collection
```

第2弾で追加・変更したもの:

```
samples/
  collection.json            # コレクション（サイトマップ。多階層グループを含む）
  ir/<group>/<name>.json     # 複数サンプル IR（5本。id は論理パス）
schemas/
  ordito-v0.3.schema.json    # ブロック語彙・ドキュメント・コレクションの JSON Schema（$defs）
engine/
  collection.js              # コレクション解釈・多階層ナビ生成（項目=コレクション所有）
  paths.js                   # doc id → 物理パス（階層保持）・内部リンクの相対解決（§3.3.2）
  schema-check.js            # 依存ゼロの最小 JSON Schema バリデータ
  generate.js                # 拡張: コレクション駆動・混在(mixed)・階層パス・リンク解決
  validate.js                # 追加: field_map 未マップ検出（§4.4）
templates/dev-docs-standard/
  contract.json              # v0.3: field_map / params 5列 / code lang を正式化
site/                        # 第2弾の出力（複数ページ。階層を保持して相互リンク）
```

検証の二層（§6）: 機械チェック（許可リスト照合・枠侵食・**未マップ検出**・**IRスキーマ検証**）＋
意味チェック（IR忠実度＝LLMジャッジ）。`site/report.json` に結果（`violations` / `warnings`）。

> 第1弾（単一ページ）は `dist/`、第2弾（複数ページ）は `site/` に出力し、互いに非破壊。
> 第1弾互換のフラット生成（`--collection` 無し）も従来どおり動く。

## 所見・既知の決め打ち

- 第1弾（契約のフォーマットと AI への渡し方）: [docs/findings.md](docs/findings.md)（v0.3 への材料）。
- 第2弾（コレクション・複数ページ・リンク解決・混在生成、TBD (a)〜(d) の決め打ち）:
  [docs/findings-poc2.md](docs/findings-poc2.md)（v0.4 への材料）。
