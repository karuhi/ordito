<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/ordito-mark-dark.png">
    <img src="assets/ordito-mark.png" alt="Ordito" width="150">
  </picture>
</p>

<h1 align="center">Ordito</h1>

<p align="center">
  <strong>構造（IR という<em>経糸</em>）を先に張り、その上に AI が本文を織る。<br>AI がドキュメントを<em>生成・更新</em>するための、オープンな「規格」と依存ゼロのリファレンス実装。</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge"></a>
  <a href="spec/ordito-spec.md"><img alt="Spec: v1.0" src="https://img.shields.io/badge/spec-v1.0-blue?style=for-the-badge"></a>
  <img alt="Node.js v18+" src="https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="Dependencies: zero" src="https://img.shields.io/badge/dependencies-zero-success?style=for-the-badge">
  <img alt="Conformance: passing" src="https://img.shields.io/badge/conformance-passing-success?style=for-the-badge">
</p>

<p align="center">
  🇯🇵 日本語 · 🇬🇧 <a href="README.md">English</a>
</p>

<p align="center">
  <a href="#-なぜ">なぜ</a> ·
  <a href="#-仕組み">仕組み</a> ·
  <a href="#-クイックスタート">クイックスタート</a> ·
  <a href="#-スキル">スキル</a> ·
  <a href="#-リポジトリ構成">構成</a> ·
  <a href="#-規格とリファレンス実装">規格とリファレンス実装</a> ·
  <a href="#-ステータス">ステータス</a>
</p>

> 名はイタリア語の *ordito* / *orditura* ＝ 織物の**経糸**（織る前に機に張る縦糸）に由来する。
> Ordito は構造（IR）という経糸を先に張り、その上に AI が本文を織り上げる。

---

## 🤔 なぜ

従来の静的サイトジェネレータ（Docusaurus など）は、**コンテンツ・表示・ビルド**の三つを一体にしている。
見た目を変えればコンテンツに手が入り、AI に手伝わせれば Markdown を丸ごと書き換え——そのついでに、情報を静かに落とす。

Ordito はこれらを分離する:

- 📦 **コンテンツ**は **IR（中間表現）** ＝ 表示から独立した構造化 JSON。**HTML を含まない**。
- 🎨 **枠**は**テンプレート**が固定で持つ（レイアウト・デザイントークン・コンポーネント CSS）。AI は触らない。
- 🧵 **生成エンジン**が両者を合成し、AI は**テンプレート契約の範囲内で**本文 HTML を織る。

**結果:** AI の自由は「内容と構造の選択」に閉じ込められ、ページ間のデザインは一貫し、**元データが静かに失われることもない**。

---

## 🧶 仕組み

設計を貫く3原則:

- **制約された多様性**: 枠（レイアウト・トークン）は固定し、その内側で AI の出力に揺らぎを許す。ただし
  **揺らぎ ≠ データ欠落**——IR のフィールド欠落はスタイルの選択ではなくバグ。揺らぎの量は契約の `render_hint` の詳細度で調整する。
- **データ更新と生成の分離**: IR の更新（軽い・頻繁）と HTML 生成（重い・明示）は**別工程**。書き込みは生成を引き起こさない。
  これが「記載しますか → 反映しますか」の二段確認 UX を成立させる。
- **すべて JSON / すべてスキル経由**: IR・テンプレート契約・コレクションは JSON で受け渡す。拡張はストアへの
  「書き込み」か「読み出し」の**スキル**として足す。

<details>
<summary>「許す揺らぎ」と「データ欠落」の境界（なぜ重要か）</summary>

POC で、IR にあった `default`（`expires_in = 3600`）が AI 出力から**静かに脱落**した。しかもクラスだけ見る検証は
通ってしまった——クラスは守られていたから。これは制約された多様性ではなく**データ欠落**。Ordito の答えが `field_map`:
契約はブロックの**全フィールド**の行き先を定義する MUST で、未マップのフィールドは検証が警告する。「表示しない」も
許されるが、`"OMIT"` として**明示**する MUST（暗黙の脱落は禁止）。

参照: [`spec/ordito-spec.md` §4.4](spec/ordito-spec.md)
</details>

---

## 🚀 クイックスタート

**前提: Node.js v18+ のみ。** 依存パッケージ・ビルド工程なし。

```bash
# 1) 複数ページのドキュメントサイトを生成（決定論モード: AI不要・常に動く）
node reference/engine/generate.js --collection samples/collection.json --out site
open site/index.html            # macOS（Linux は xdg-open）

# 2) IR / コレクションを JSON Schema で検証
node reference/engine/schema-check.js samples/ir/guides/quickstart.json document
node reference/engine/schema-check.js samples/collection.json collection

# 3) 準拠テスト
node conformance/run.js          # JSON Schema ＋ ゴールデン出力 ＋ 機械チェック
```

`site/` に、ナビ付きで相互リンクした HTML ページ群が出力される（doc id の階層を保持）。

<details>
<summary>混在生成: 構造化ブロックは決定論 / 散文は AI（レベル2）</summary>

```bash
node reference/engine/generate.js --collection samples/collection.json --out site \
     --mode mixed --ai-cache site/ai-fragments
```

混在モードでは、構造化ブロック（`params`・`table`・`steps` など）は決定論で描画し、散文ブロックは `--ai-cache` の
事前生成 L2 断片（`.l2.json`）を使う。断片が無い散文ブロックは決定論にフォールバックする——**常に出力が得られる**。
（Anthropic API を直接叩くのは、本文領域を全域生成する `--mode ai` だけ。混在モードはキャッシュを読む。）
</details>

---

## 🔁 スキル

[`.claude/skills/`](.claude/skills/) の原子スキルで、AI エージェントが**更新と生成の分離**を回し、二段確認を自分で組み立てられる:

| スキル | 種別 | 役割 | 生成する？ |
|--------|------|------|-----------|
| `ordito-update-block` | 書き込み | IR の1ブロックを差分更新し `updated_at` を進める | **しない**（§5.4） |
| `ordito-detect-stale` | 読み出し | `updated_at > generated_at` の未反映ページを一覧 | しない |
| `ordito-generate` | 読み出し | 明示トリガーで再生成（全ページ / id 指定 / 未反映のみ を選択） | する（明示時のみ） |
| `ordito-validate` | 検証 | JSON Schema ＋ `field_map` 網羅 ＋ 出力チェック | しない |

スキルは確認しない——**確認の主体は AI エージェント**。`update` と `generate` を別スキルに分けたこと自体が
「書き込みは生成を引き起こさない」（§5.4）の実装。各スキルの発火条件と I/O は
[`.claude/skills/`](.claude/skills/) の各 SKILL.md を参照。

---

## 📁 リポジトリ構成

```
ordito/
├── spec/                      # 【規格本体 / normative】これだけで読める。実装から独立。
│   ├── ordito-spec.md         #   規格本体（v1.0）
│   └── history/               #   旧版
├── reference/                 # 【リファレンス実装 / informative】差し替え可能な一例
│   ├── engine/                #   生成エンジン（Node.js 依存ゼロ）
│   └── templates/             #   デフォルトテンプレート（枠＋契約 JSON）
├── conformance/               # 【準拠テスト】自分の実装を試せる
│   ├── schemas/               #   IR・コレクションの JSON Schema（語彙の機械可読定義）
│   ├── cases/                 #   サンプルIR → 期待成果物（ゴールデン）
│   └── run.js                 #   準拠チェックランナー
├── samples/                   # サンプル（規格準拠の IR ＋ コレクション）
├── .claude/skills/            # スキル群（差分更新・未反映検出・生成・検証）
└── LICENSE · CONTRIBUTING.md · README.md
```

生成物（`site/` `dist/`）は再生成可能なため**追跡しない**（上記コマンドで生成。`.gitignore` 済み）。

---

## 🧩 規格とリファレンス実装

Ordito は**規格**と**その一実装**を分けている:

| 層 | 場所 | 位置づけ |
|----|------|----------|
| **規格コア** | `spec/`（特に §3 IR・コレクション / §4 契約 / §7 スキル契約） | 準拠実装が必ず守る契約。安定が最優先。 |
| **リファレンス実装** | `reference/` | 本番運用を想定した実装の本体（試作・擬似コードではない）。準拠する限り、別言語・別構造に**差し替え可能**。 |
| **準拠テスト** | `conformance/` | 別実装が規格に準拠しているかを機械的に確かめる。 |

規格（`spec/`）を読み、リファレンス実装（`reference/`）を動かして挙動を掴み、`conformance/run.js` で検証しながら独自の
エンジン・テンプレート・スキルを作れる。キーワード **MUST / SHOULD / MAY** は要件の強さ。

---

## 📌 ステータス

**安定版 — 仕様 v1.0。** POC を二周（単一ページ → 複数ページ＋コレクション＋混在生成）し、差分更新・二段確認を
スキルとして実装・検証済み（準拠テスト パス）。語彙・テンプレート契約・コレクション・スキル I/O を v1.0 として凍結。

規格は**セマンティックバージョニング**に従い、IR / 契約 / コレクション / スキルのスキーマの破壊的変更はメジャーを上げる
（後方互換な追加は MINOR）。v1.0 以降の課題（インライン記法の拡張・複数コレクション関係・`field_map` 構造化・
マルチエージェント競合制御）は [Issue トラッカー](https://github.com/karuhi/ordito/issues)。

**成熟度（誠実な範囲）:** 依存ゼロで、準拠テスト（決定論ゴールデン＋スキル I/O 契約）を通過し、本リポジトリ自身の例の
生成に使っている。**未カバー:** 既存ドキュメントからの実データ移行（§8・雑多な入力では未検証）、マルチライタ同時更新、
CI（`node conformance/run.js` をローカル実行。バッジは CI 連動ではない）。v1.0 は「安定した誠実な契約」であり、
「大規模で実戦投入済み」を保証するものではない。

> 📚 **なぜこの仕様なのか？** 各規定は実装で実際に壁にぶつかって得たもの。版ごとの変更と理由は
> 仕様の変更履歴（付録 B–D）に要約。貢献方法は [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 ライセンス

[Apache License 2.0](LICENSE)。
