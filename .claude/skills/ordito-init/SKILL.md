---
name: ordito-init
description: Scaffold Ordito into a repository — create ordito.config.json, the docs IR directory, a starter page, a collection (nav), and a GitHub Pages deploy workflow (.github/workflows/docs.yml). Use this once when setting Ordito up in a new repo for internal developer docs (after the .claude/skills + bundled engine have been copied in, e.g. via scripts/install-into.sh). Idempotent: existing files are left untouched unless force:true. Does NOT generate HTML (run ordito-generate after) and does NOT ask for confirmation; the calling agent owns that.
allowed-tools: Bash
---

# ordito-init

導入先リポジトリに Ordito の最小構成を生成する **scaffold スキル**（リファレンス実装の付加スキル, §7.4）。

## いつ使うか / 使わないか

- 使う: 新しいリポジトリで Ordito を立ち上げるとき（社内開発者ドキュメントを repo 同梱 → GitHub Pages で配る初期化）。
- 前提: 先に `.claude/skills/`（と同梱エンジン）を配置済み（`scripts/install-into.sh <target>`）。
- 使わない: 既存の Ordito プロジェクトでページを足す（`ordito-create-page`）／HTML を作る（`ordito-generate`）。
- このスキルは **生成しない**（§5.4）。scaffold 後に `ordito-generate` を案内する。

## 生成物（既存はスキップ、`force:true` で上書き）

- `ordito.config.json`（`docs/ir` / `docs/site` / `docs/collection.json` / `template:{id:"dev-docs-standard"}` / `mode:"deterministic"`）
- `docs/ir/`（IR ストア）と起点ページ `docs/ir/guides/getting-started.json`
- `docs/collection.json`（起点ページを掲載したナビ）
- `.github/workflows/docs.yml`（IR→HTML 生成 → 検証ゲート → GitHub Pages へデプロイ）

## 入力（JSON, すべて任意）

```json
{ "title": "社内 API ドキュメント", "ir_dir": "docs/ir", "out": "docs/site", "mode": "deterministic" }
```

`root`(既定: repo ルート) / `ir_dir` / `out` / `collection` / `template_id` / `mode` / `title` / `starter_page`(既定 true) / `workflow`(既定 true) / `force`(既定 false)。

## 出力（JSON）

`{ ok, root, created:[...], skipped:[...], next_steps:[...], generated:false }`

## 実行

```bash
echo '{"title":"社内 API ドキュメント"}' | node "${CLAUDE_SKILL_DIR}/init.js"
```

`next_steps` に、初回生成・GitHub Pages の Source 設定・Enterprise Cloud の Pages アクセス制御（Org/SSO 限定）の手順が入る。
