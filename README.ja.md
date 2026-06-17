<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/ordito-mark-dark.png">
    <img src="assets/ordito-mark.png" alt="Ordito" width="150">
  </picture>
</p>

<h1 align="center">Ordito</h1>

<p align="center">
  <strong>構造（IR という<em>経糸</em>）を先に張り、その上に AI が本文を織る。<br>AI がドキュメントを<em>作成・更新・公開</em>する、リポジトリ同梱のための、オープンな「規格」と依存ゼロのリファレンス実装。</strong>
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

**狙うユースケース:** **リポジトリに同梱する開発者ドキュメント**——AI（Claude）が対話でページを*作成・更新*し、**GitHub Pages** へ公開する。公開範囲は自由に設定でき、一般公開してもよいし、**GitHub Enterprise Cloud** なら Pages を **Org メンバー限定にすることもできる**（Org が SAML SSO 必須なら、そのまま SSO ゲートにもなる）。CMS も別サービスも要らない——ドキュメントはリポジトリ内の JSON で、`git push` が再生成して再公開する。

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

実装初期、IR にあった `default`（`expires_in = 3600`）が AI 出力から**静かに脱落**した。しかもクラスだけ見る検証は
通ってしまった——クラスは守られていたから。これは制約された多様性ではなく**データ欠落**。Ordito の答えが `field_map`:
契約はブロックの**全フィールド**の行き先を定義する MUST で、未マップのフィールドは検証が警告する。「表示しない」も
許されるが、`"OMIT"` として**明示**する MUST（暗黙の脱落は禁止）。
</details>

---

## 🚀 クイックスタート

**前提: Node.js v22+ のみ。** 依存パッケージ・ビルド工程なし。

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

> 💡 公開デモ: **<https://karuhi.github.io/ordito/>**（GitHub Pages・`samples/site/` を配信）。同じ生成結果は [`samples/site/`](samples/site/) にもコミット済みで、何も実行せずリポジトリ上で確認できる。

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

[`.claude/skills/`](.claude/skills/) の原子スキルが**管理レイヤー**——CMS なしで AI が*作成・編集・整理・公開*する手段。各スキルは1つの動詞で、エージェントが意図で選ぶ:

| スキル | 種別 | 役割 | 生成する？ |
|--------|------|------|-----------|
| `ordito-create-page` | 書き込み | **新規**ページ（IR ドキュメント）を作成。任意でナビにも掲載 | **しない** |
| `ordito-update-block` | 書き込み | 既存の1ブロックを差分更新し `updated_at` を進める | **しない** |
| `ordito-add-block` | 書き込み | ブロックを挿入（末尾/after/before/タブ内）、id 自動採番 | **しない** |
| `ordito-remove-block` | 書き込み | ブロックを削除（タブ内の入れ子も可） | **しない** |
| `ordito-move-block` | 書き込み | ブロックを並べ替え／再配置 | **しない** |
| `ordito-edit-collection` | 書き込み | ナビ編集（add/move/remove/relabel/並べ替え） | **しない** |
| `ordito-delete-page` | 書き込み | ページ削除＋ナビ項目の整理 | **しない** |
| `ordito-detect-stale` | 読み出し | `updated_at > generated_at` の未反映ページを一覧 | しない |
| `ordito-generate` | 読み出し | 明示トリガーで再生成（全ページ / id 指定 / 未反映のみ） | する（明示時のみ） |
| `ordito-validate` | 検証 | JSON Schema ＋ `field_map` 網羅 ＋ 出力チェック | しない |
| `ordito-init` | scaffold | リポジトリに Ordito を立ち上げ（config・docs・ナビ・Pages ワークフロー） | しない |

書き込みスキルは生成を引き起こさない——**反映（HTML 生成）は常に別工程の `ordito-generate`**（§5.4）。スキルは確認もしない——**確認の主体は AI エージェント**。各スキルの発火条件と I/O は各 SKILL.md を参照。*（`create-page`・`add-block`・`remove-block`・`move-block`・`edit-collection`・`delete-page`・`init` は **仕様 v1.1** で追加——これが「AI が**作成**する」を可能にした。）*

**二段確認の流れ**——「記載しますか？ → 反映しますか？」——は、エージェントがこれらの原子スキルを組み立てて作る:

```text
🧑 「クイックスタートにレート制限の注意も入れて」
🤖 これを IR に記載しますか？                          ← エージェントが訊く（一段目）
🧑 はい
   ▸ ordito-update-block      → { changed: true, generated: false }   （1ブロック更新・生成はしない）
   ▸ ordito-detect-stale      → { stale: ["guides/quickstart"] }
🤖 未反映が1件あります。反映（再生成）しますか？        ← エージェントが訊く（二段目）
🧑 はい
   ▸ ordito-generate {only:"stale"} → 該当ページだけ再生成し generated_at を押印
   ▸ ordito-validate          → スキーマ・field_map・出力チェック すべてパス
```

二つの問いはどちらも **エージェント**のもの。スキルは実行して JSON を返すだけ。これが「更新／生成の分離」を
そのまま UX にした形であり、書き込みが重い再生成を黙って引き起こさない理由。

---

## 📦 自分のリポジトリへ導入（ターンキー）

任意のリポジトリに Ordito を入れ、ドキュメントサイトを scaffold する——同梱・立ち上げ・初回ビルドの順:

```bash
# 1) スキル＋エンジンを対象リポジトリへ同梱（Ordito リポジトリ内で実行）
bash scripts/install-into.sh /path/to/your-repo

# 2) config・docs/・コレクション・Pages デプロイ用ワークフローを生成（対象リポジトリで実行）
echo '{"title":"社内 API ドキュメント"}' | node .claude/skills/ordito-init/init.js

# 3) 初回ビルド（決定論モード: AI 不要・API 呼び出しなし）
echo '{}' | node .claude/skills/ordito-generate/generate.js
```

`install-into.sh` は `.claude/skills/` をコピーし、engine を `.claude/skills/lib/engine/`（`templates/` と `schemas/` ごと）に同梱するので、**導入先に `reference/` ツリーは不要**——スキルは engine を単一の解決点で見つける。`ordito-init` は次のような config と、対応する `docs/`・ナビ・ワークフローを生成する:

```json
{
  "irDir": "docs/ir",
  "out": "docs/site",
  "collection": "docs/collection.json",
  "template": { "id": "dev-docs-standard" },
  "mode": "deterministic"
}
```

- **config 駆動・再配置可能**: root はカレントから最も近い `ordito.config.json`（無ければ `.git`）まで上昇探索。優先順位は **呼び出し引数 > `ordito.config.json` > 内蔵既定** で、日常の呼び出しは入力をほぼ空にできる（`echo '{}' | …`）。モノレポにそのまま入る。
- **テンプレート選択**: `template`（`{ "id": "<同梱名>" }` か `{ "dir": "<リポジトリ相対>" }`）。

### 🚀 GitHub Pages へ公開

`ordito-init` は **`.github/workflows/docs.yml`** も生成する。`main` への push（`docs/` を変更）ごとにサイトを再生成し、**デプロイを `ordito-validate` でゲート**し（スキーマ＋`field_map`＋出力チェック。NG なら公開を止める）、`actions/deploy-pages` で配信する。手順:

1. リポジトリ **Settings → Pages → Source: GitHub Actions**。
2. `main` に push → ワークフローがビルド・検証・公開。

**任意——公開範囲を絞りたい場合。** **GitHub Enterprise Cloud** なら Settings → Pages で **access control を「members of the organization」** にすると Org メンバーにのみ配信され、Org が **SAML SSO** 必須なら自動的に SSO ゲートになる。これは完全に任意で、外しておけば一般公開のドキュメントサイトになる。

> Enterprise Cloud が無いが private にしたい場合: GitHub Pages 単体では private サイトを Org メンバー限定にできない。代替として Pages（または別ホスト）の前段に **Cloudflare Access / IAP** を置いて SSO ゲートにするか、出力を社内ゲートウェイから配信する。

---

## 📁 リポジトリ構成

```
ordito/
├── spec/                      # 【規格本体 / normative】これだけで読める。実装から独立。
│   ├── ordito-spec.md         #   規格本体（v1.1）
│   └── history/               #   旧版
├── reference/                 # 【リファレンス実装 / informative】差し替え可能な一例
│   ├── engine/                #   生成エンジン（Node.js 依存ゼロ）
│   └── templates/             #   デフォルトテンプレート（枠＋契約 JSON）
├── conformance/               # 【準拠テスト】自分の実装を試せる
│   ├── schemas/               #   IR・コレクション・config・スキル I/O の JSON Schema
│   ├── cases/                 #   サンプルIR → 期待成果物（ゴールデン）
│   ├── run.js                 #   準拠チェックランナー（スキーマ＋ゴールデン＋機械チェック）
│   └── skills-check.js        #   スキル I/O 契約（v1.1 の作成往復を含む）
├── samples/                   # サンプル: IR ＋ コレクション（入力）＋ site/（生成済み・コミット）
├── scripts/                   # install-into.sh（Ordito を別リポジトリへ同梱）
├── .github/workflows/         # ci.yml（準拠テスト）・pages.yml（本リポジトリのデモ配信）。docs.yml は導入先に scaffold
├── ordito.config.json         # プロジェクト設定（irDir/out/collection/template）。ルートから読む
├── .claude/skills/            # 11スキル: ページ/ブロックの作成・更新・追加・削除・移動、ナビ、生成、検証、init
└── LICENSE · CONTRIBUTING.md · README.md
```

生成物（`site/` `dist/`）は再生成可能なため**追跡しない**（上記コマンドで生成。`.gitignore` 済み）。

---

## 🧩 規格とリファレンス実装

Ordito は**規格**と**その一実装**を分けている:

| 層 | 場所 | 位置づけ |
|----|------|----------|
| **規格コア** | `spec/` | 準拠実装が必ず守る契約。安定が最優先。 |
| **リファレンス実装** | `reference/` | 本番運用を想定した実装の本体（参考用の見本や擬似コードではない）。準拠する限り、別言語・別構造に**差し替え可能**。 |
| **準拠テスト** | `conformance/` | 別実装が規格に準拠しているかを機械的に確かめる。 |

規格（`spec/`）を読み、リファレンス実装（`reference/`）を動かして挙動を掴み、`conformance/run.js` で検証しながら独自の
エンジン・テンプレート・スキルを作れる。キーワード **MUST / SHOULD / MAY** は要件の強さ。

---

## 📌 ステータス

**安定版 — 仕様 v1.1。** 反復して構築・検証（単一ページ → 複数ページ＋コレクション＋混在生成 → 作成系スキルの完備）し、
すべて準拠テストで検証済み。v1.1 で **作成・構造編集・ナビ編集・削除** の書き込みスキルを後方互換に追加し（MINOR）、
「AI が作成する」を完成させた。語彙・テンプレート契約・コレクションのスキーマは v1.0 のまま**凍結・不変**で、既存 IR はそのまま有効。

規格は**セマンティックバージョニング**に従い、IR / 契約 / コレクション / スキルのスキーマの破壊的変更はメジャーを上げる
（後方互換な追加——新スキルや任意フィールド——は MINOR）。v1.1 以降の課題（既存ドキュメント移行・複数コレクション関係・
`field_map` 構造化・マルチエージェント競合制御・意味忠実度チェック）は [Issue トラッカー](https://github.com/karuhi/ordito/issues)。

**成熟度（誠実な範囲）:** 依存ゼロ、**CI 連動**（`.github/workflows/ci.yml` が push/PR ごとに準拠テスト——決定論ゴールデン＋
スキル I/O 契約——を実行）、本リポジトリ自身の例の生成に使用。**未カバー:** 既存 Markdown/Docusaurus からの移行（移行スキルは
規定済みだが未実装・§8）、マルチライタ同時更新、部分文字列の存在確認を超える意味忠実度（削除は検出するが並べ替え/捏造は未検出・§6.2）。
「安定した誠実な契約」であり、「大規模で実戦投入済み」を保証するものではない。

> 📚 **なぜこの仕様なのか？** 各規定は実装で実際に壁にぶつかって得たもの。版ごとの変更と理由は
> 仕様の変更履歴に要約。貢献方法は [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 📄 ライセンス

[Apache License 2.0](LICENSE)。
