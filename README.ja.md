<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/ordito-mark-dark.png">
    <img src="assets/ordito-mark.png" alt="Ordito" width="150">
  </picture>
</p>

<h1 align="center">Ordito</h1>

<p align="center">
  <strong>構造は JSON で固定。言葉は AI が書く。<br>
  リポジトリに置く開発者ドキュメントを、AI が作成・更新・公開するためのオープンな規格と、依存ゼロのリファレンス実装。</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge"></a>
  <a href="spec/ordito-spec.md"><img alt="Spec: v1.1" src="https://img.shields.io/badge/spec-v1.1-blue?style=for-the-badge"></a>
  <a href="https://karuhi.github.io/ordito/"><img alt="Live demo" src="https://img.shields.io/badge/demo-live-brightgreen?style=for-the-badge"></a>
  <img alt="Node.js v22+" src="https://img.shields.io/badge/Node.js-v22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="Dependencies: zero" src="https://img.shields.io/badge/dependencies-zero-success?style=for-the-badge">
  <img alt="Conformance: passing" src="https://img.shields.io/badge/conformance-passing-success?style=for-the-badge">
</p>

<p align="center">
  🇯🇵 日本語 · 🇬🇧 <a href="README.md">English</a>
</p>

<p align="center">
  <a href="#-なぜ">なぜ</a> ·
  <a href="#-向いている場面">向いている場面</a> ·
  <a href="#-仕組み">仕組み</a> ·
  <a href="#-クイックスタート">クイックスタート</a> ·
  <a href="#-自分のリポジトリへ">導入</a> ·
  <a href="#-スキル">スキル</a> ·
  <a href="#-リポジトリ構成">構成</a> ·
  <a href="#-規格とリファレンス実装">規格</a> ·
  <a href="#-ステータス">ステータス</a>
</p>

> *Ordito*（イタリア語で織物の経糸）は「構造を先に決め、本文は後から足す」設計の名前。中身は経糸ではなく **IR**（構造化 JSON）。

---

## 🤔 なぜ

Docusaurus などは **コンテンツ・表示・ビルド** をひとまとめにしている。テーマを変えようとすると Markdown に手が入る。AI に手伝わせるとファイルを丸ごと書き換える——そのついでに `default` 値がこっそり消える。

Ordito は分ける:

- 📦 **コンテンツ**は **IR** — HTML を含まない構造化 JSON
- 🎨 **枠**は固定の **テンプレート** — レイアウト・トークン・CSS。AI は触らない
- 🧵 **エンジン**が合成する。AI は**テンプレート契約の内側**だけ本文 HTML を書く

ページの見た目は揃う。元データが静かにズレない。

Ordito が狙っているのは **リポジトリに同梱する開発者ドキュメント**。AI エージェント（Claude + スキル）が対話でページを作り直し、`git push` で **GitHub Pages** に出る。CMS も別サービスもいらない。ドキュメントは git 上の JSON。

**GitHub Enterprise Cloud** なら Pages を Org メンバー限定にできる（SAML SSO ならそのままゲートになる）。一般公開のままでもよい。

---

## 👍 向いている場面

Docusaurus の置き換え、というより特定の運用向け。

**向いている**

- 日々の追記・更新は AI エージェントに任せたい（CMS ではなく）
- AI が本文を書き換えても、ページ間の見た目を揃えたい
- API の `default` や `required` が出力からこっそり消えるのを防ぎたい
- 公開先は GitHub Pages で十分（一般公開でも Org 限定でも）

**いまは厳しめ**

- 既存の Markdown / Docusaurus をそのまま移したい — 仕様 §8 に書いてあるが**未実装**。手作業か、実装を待つ前提で
- チーム全員が JSON ブロックを手でメンテする（エージェントなし）
- WYSIWYG やビジュアル CMS が必須

Ordito がきれいにハマるのは、**エージェントが構造化 JSON をメンテして人がレビューする**運用。Markdown 資産の丸ごと乗り換えは、まだ準備が要る。

---

## 🧶 仕組み

設計の芯は3つ:

- **制約された多様性。** 枠は固定、中の本文は揺れてよい。でも IR のフィールドが消えるのはバグ。`render_hint` で縛りの強さを調整する
- **更新 ≠ 生成。** IR の更新は軽く頻繁に。HTML 生成は重く明示的に。書き込みがビルドを黙って引き起こさない——「記載しますか → 反映しますか」の根っこ
- **すべて JSON、すべてスキル。** IR・契約・ナビは JSON。拡張はストアへの読み書き**スキル**として足す

<details>
<summary>`field_map` がある理由（消えた `default`）</summary>

実装初期、IR にあった `default`（`expires_in = 3600`）が AI 出力から**静かに脱落**した。クラスだけ見る検証は通った——CSS クラスは守られていたから。これは多様性じゃなく**データ欠落**。

Ordito の答えが `field_map`。契約はブロックの**全フィールド**の行き先を定義する。未マップは検証で落ちる。表示しないなら `"OMIT"` と**明示**——暗黙の脱落は禁止。
</details>

---

## 🚀 クイックスタート

**Node.js v22+ だけ。** `npm install` もビルド工程もない。

*このリポジトリ*で試す:

```bash
# 複数ページのサイトを生成（決定論モード: AI 不要・常に動く）
node reference/engine/generate.js --collection samples/collection.json --out site
open site/index.html            # macOS（Linux は xdg-open）

# IR / コレクションを検証
node reference/engine/schema-check.js samples/ir/guides/quickstart.json document
node reference/engine/schema-check.js samples/collection.json collection

# 準拠テスト
node conformance/run.js
```

`site/` にナビ付きの相互リンク HTML ができる。doc id の階層も保持される。

> **公開サイト:** <https://karuhi.github.io/ordito/> — `samples/ir/` から生成した Ordito 自身のドキュメント（dogfooding）。ローカル確認は [`samples/site/`](samples/site/)

パイプラインの例: [`samples/ir/guides/getting-started.json`](samples/ir/guides/getting-started.json) → [`samples/site/guides/getting-started.html`](samples/site/guides/getting-started.html)

<details>
<summary>混在モード: 構造化ブロックは決定論、散文は AI キャッシュ</summary>

```bash
node reference/engine/generate.js --collection samples/collection.json --out site \
     --mode mixed --ai-cache site/ai-fragments
```

`params`・`table`・`steps` などは決定論で描画。散文は `--ai-cache` の `.l2.json` を読む。キャッシュがなければ決定論にフォールバック——**必ず出力が出る**。

Anthropic API を直接叩くのは `--mode ai`（本文全域）だけ。混在モードはキャッシュを読むだけ。
</details>

---

## 📦 自分のリポジトリへ

*自分のプロジェクト*に入れる——同梱・立ち上げ・初回ビルドの順:

```bash
# 1) スキル＋エンジンをコピー（Ordito リポジトリ内で実行）
bash scripts/install-into.sh /path/to/your-repo

# 2) config・docs/・ナビ・Pages ワークフローを生成（対象リポジトリで実行）
echo '{"title":"社内 API ドキュメント"}' | node .claude/skills/ordito-init/init.js

# 3) 初回ビルド（決定論: AI 不要）
echo '{}' | node .claude/skills/ordito-generate/generate.js
```

`install-into.sh` は `.claude/skills/` 以下に全部入れる。エンジンは `.claude/skills/lib/engine/`。導入先に `reference/` は不要。

`ordito-init` が書く config の例:

```json
{
  "irDir": "docs/ir",
  "out": "docs/site",
  "collection": "docs/collection.json",
  "template": { "id": "dev-docs-standard" },
  "mode": "deterministic"
}
```

- **config 駆動:** 最寄りの `ordito.config.json`（なければ `.git`）まで上に辿る。優先順位は 引数 → config → 既定。普段は `echo '{}' | …` で足りる。モノレポにもそのまま入る
- **テンプレート:** `{ "id": "<同梱名>" }` か `{ "dir": "<リポジトリ相対>" }`

### GitHub Pages へ公開

`ordito-init` は **`.github/workflows/docs.yml`** も作る。`main` へ push（`docs/` 変更時）→ 再生成 → **`ordito-validate` がデプロイをゲート**（スキーマ + `field_map` + 出力チェック）→ `actions/deploy-pages`。

1. **Settings → Pages → Source: GitHub Actions**
2. `main` に push

**任意 — Org 限定公開**（Enterprise Cloud）: Settings → Pages で org メンバーに制限。SAML SSO は自動で効く。

> Enterprise Cloud がなく private にしたい場合: Pages の前段に **Cloudflare Access / IAP** を置くか、自前ゲートウェイから配信。

---

## 🔁 スキル

[`.claude/skills/`](.claude/skills/) が管理レイヤー——CMS なしで AI が作成・編集・整理・公開する手段。1スキル1動詞:

| スキル | 種別 | 役割 | 生成する？ |
|--------|------|------|-----------|
| `ordito-create-page` | 書き込み | 新規ページ。任意でナビにも | **しない** |
| `ordito-update-block` | 書き込み | 1ブロックを差分更新 | **しない** |
| `ordito-add-block` | 書き込み | ブロック挿入（末尾/after/before/タブ内） | **しない** |
| `ordito-remove-block` | 書き込み | ブロック削除（タブ内も） | **しない** |
| `ordito-move-block` | 書き込み | 並べ替え・再配置 | **しない** |
| `ordito-edit-collection` | 書き込み | ナビ編集 | **しない** |
| `ordito-delete-page` | 書き込み | ページ削除＋ナビ整理 | **しない** |
| `ordito-detect-stale` | 読み出し | 未反映ページの一覧 | しない |
| `ordito-generate` | 読み出し | 明示トリガーで再生成 | する（明示時のみ） |
| `ordito-validate` | 検証 | スキーマ + `field_map` + 出力 | しない |
| `ordito-init` | scaffold | 立ち上げ一式 | しない |

書き込みスキルはビルドしない。**反映は常に `ordito-generate` を明示的に**（§5.4）。確認もスキルはしない——**エージェントが訊く**。各 SKILL.md にトリガーと I/O がある。

v1.1 で作成・構造編集・ナビ・削除が揃った。これで「AI が**作る**」が成立する。

**エージェントが組み立てる二段確認:**

```text
🧑 「クイックスタートにレート制限の注意も入れて」
🤖 これを IR に記載しますか？                          ← 一段目
🧑 はい
   ▸ ordito-update-block      → { changed: true, generated: false }
   ▸ ordito-detect-stale      → { stale: ["guides/quickstart"] }
🤖 未反映が1件。反映（再生成）しますか？              ← 二段目
🧑 はい
   ▸ ordito-generate {only:"stale"}
   ▸ ordito-validate          → すべてパス
```

問いかけはエージェントの仕事。スキルは実行して JSON を返すだけ。

---

## 📁 リポジトリ構成

```
ordito/
├── spec/                      # 規格本体（これだけで読める）
│   ├── ordito-spec.md         #   v1.1
│   └── history/
├── reference/                 # リファレンス実装（差し替え可能）
│   ├── engine/                #   Node.js、依存ゼロ
│   └── templates/             #   枠 + 契約 JSON
├── conformance/               # 別実装の準拠を機械的に確認
│   ├── schemas/
│   ├── cases/                 #   ゴールデン IR → 期待出力
│   ├── run.js
│   └── skills-check.js
├── samples/                   # サンプル IR + コレクション + 生成済み site/
├── scripts/                   # install-into.sh
├── .github/workflows/         # ci.yml · pages.yml（docs.yml は導入先へ）
├── ordito.config.json
├── .claude/skills/            # 11 スキル
└── LICENSE · CONTRIBUTING.md · README.md
```

`site/` `dist/` は gitignore——上のコマンドで再生成する。

---

## 🧩 規格とリファレンス実装

| 層 | 場所 | 何か |
|----|------|------|
| **規格** | `spec/` | 契約。安定が最優先 |
| **リファレンス** | `reference/` | 本番想定の実装。おもちゃじゃない。準拠すれば別言語に差し替え可 |
| **準拠テスト** | `conformance/` | 別実装が規格を守っているかの機械的な証明 |

規格を読み、リファレンスを動かし、`conformance/run.js` で自分の実装を試す。

---

## 📌 ステータス

**安定版 — 仕様 v1.1。**

単一ページ → 複数ページ + コレクション + 混在生成 → 作成系スキル完備。準拠テストでカバー済み。v1.1 で作成・構造編集・ナビ・削除を後方互換に追加（MINOR）。語彙・契約・コレクションのスキーマは **v1.0 から不変**。

**できていること:** 依存ゼロ、push/PR ごとの CI 準拠テスト、このリポジトリ自身のデモ生成。

**まだないこと:** Markdown/Docusaurus 移行（§8）、マルチライター同時更新、部分文字列を超える意味忠実度（削除は検出、並べ替え/捏造は未検出・§6.2）。誠実な契約——大規模実戦投入済みの保証ではない。

v1.1 以降: [issues](https://github.com/karuhi/ordito/issues)。

> **なぜこの仕様？** 各規定は実装で壁にぶつかって得たもの。変更履歴は仕様に。貢献は [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 ライセンス

[Apache License 2.0](LICENSE)。