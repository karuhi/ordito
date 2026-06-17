#!/usr/bin/env node
// =========================================================================
// ordito-init — 導入先リポジトリに Ordito の最小構成を生成（scaffold, §7.4）
//   前提: 先に .claude/skills/（と同梱エンジン）を配置済み（scripts/install-into.sh）。
//   本スキルは「データ側」を用意する: ordito.config.json / docs/ir / 起点ページ /
//   docs/collection.json / .github/workflows/docs.yml（GitHub Pages デプロイ）。
//   入力(JSON): {
//     "root"?, "ir_dir"?(=docs/ir), "out"?(=docs/site), "collection"?(=docs/collection.json),
//     "template_id"?(=dev-docs-standard), "mode"?(=deterministic),
//     "title"?(=開発者ドキュメント), "starter_page"?(=true), "workflow"?(=true), "force"?(=false)
//   }
//   出力(JSON): { ok, root, created:[...], skipped:[...], next_steps:[...], generated:false }
//   - 冪等: 既存ファイルは上書きしない（force:true で上書き）。
//   - **生成（HTML）は行わない（§5.4）**。scaffold 後に ordito-generate を案内する。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");

// 採用先 repo へ書き出す GitHub Pages デプロイ用ワークフロー（公開範囲は任意。
// Enterprise Cloud の Pages アクセス制御を使えば、Org メンバー限定/SSO ゲートにもできる）。
function deployWorkflowYaml() {
  return `# Ordito — build IR -> HTML and deploy to GitHub Pages.
# Optional: on GitHub Enterprise Cloud, Pages access control can restrict this to org members (SSO-gated).
name: Deploy docs (Ordito)

on:
  push:
    branches: [main]
    paths:
      - 'docs/ir/**'
      - 'docs/collection.json'
      - 'ordito.config.json'
      - '.claude/skills/lib/engine/templates/**'
      # If you use a custom template via config.template.dir, add its path here too.
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      # Generate the whole site from IR + collection (paths resolved from ordito.config.json).
      - name: Generate
        run: echo '{}' | node .claude/skills/ordito-generate/generate.js
      # Machine gate: IR schema + field_map + output mechanical/fidelity checks. Non-zero fails the deploy.
      - name: Validate
        run: echo '{}' | node .claude/skills/ordito-validate/validate.js
      - name: Resolve output dir
        id: out
        run: echo "dir=$(node -e "process.stdout.write(require('./ordito.config.json').out || 'docs/site')")" >> "$GITHUB_OUTPUT"
      # Keep the internal build report out of the published (even if internal) site.
      - name: Strip internal report.json
        run: rm -f "\${{ steps.out.outputs.dir }}/report.json"
      - uses: actions/upload-pages-artifact@v3
        with:
          path: \${{ steps.out.outputs.dir }}
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

function starterPage(title) {
  return {
    id: "guides/getting-started",
    meta: { title, order: 1, tags: ["guide"], updated_at: new Date().toISOString(), generated_at: null },
    blocks: [
      { id: "b1", type: "heading", level: 1, text: title },
      { id: "b2", type: "paragraph", text: "このページは Ordito の `ordito-init` が生成した雛形です。`ordito-update-block` で編集し、`ordito-create-page` / `ordito-add-block` で増やしていきます。" },
      { id: "b3", type: "note", variant: "info", text: "反映（HTML 生成）は `ordito-generate` を明示的に呼んだときだけ走ります（書き込みは生成を起こしません）。" },
    ],
  };
}

function main() {
  const fsx = require("fs");
  const input = JSON.parse((() => { try { return fsx.readFileSync(0, "utf8").trim() || "{}"; } catch { return "{}"; } })());
  const config = require("../lib/store").config;

  const root = input.root ? path.resolve(input.root) : config.findRepoRoot(process.cwd());
  const irDir = input.ir_dir || "docs/ir";
  const out = input.out || "docs/site";
  const collection = input.collection || "docs/collection.json";
  const templateId = input.template_id || "dev-docs-standard";
  const mode = input.mode || "deterministic";
  const title = input.title || "開発者ドキュメント";
  const force = input.force === true;
  const withStarter = input.starter_page !== false;
  const withWorkflow = input.workflow !== false;

  const created = [], skipped = [];
  const writeFile = (relPath, content, asJson) => {
    const abs = path.join(root, relPath);
    if (fs.existsSync(abs) && !force) { skipped.push(relPath); return false; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, asJson ? JSON.stringify(content, null, 2) + "\n" : content);
    created.push(relPath);
    return true;
  };

  // 1) ordito.config.json
  writeFile("ordito.config.json", {
    $schema: "https://ordito.dev/conformance/schemas/config.schema.json",
    irDir, out, collection, template: { id: templateId }, mode,
  }, true);

  // 2) IR ディレクトリ（空でも作る）
  const irAbs = path.join(root, irDir);
  if (!fs.existsSync(irAbs)) { fs.mkdirSync(irAbs, { recursive: true }); created.push(irDir + "/"); }

  // 3) 起点ページ
  if (withStarter) writeFile(path.join(irDir, "guides", "getting-started.json"), starterPage(title), true);

  // 4) コレクション
  const nav = withStarter ? [{ doc: "guides/getting-started", order: 1 }] : [];
  writeFile(collection, { collection_id: "docs", title, nav }, true);

  // 5) デプロイ用ワークフロー
  if (withWorkflow) writeFile(path.join(".github", "workflows", "docs.yml"), deployWorkflowYaml(), false);

  const nextSteps = [
    "反映（初回生成）: echo '{}' | node .claude/skills/ordito-generate/generate.js",
    `ローカル確認: open ${out}/index.html`,
    "GitHub: リポジトリ Settings → Pages で Source を \"GitHub Actions\" に設定",
    "（任意・Enterprise Cloud のみ）公開範囲を絞るなら Settings → Pages の access control を \"members of the organization\" に（SAML SSO 必須 Org では SSO ゲートになる）",
    "main に push すると docs.yml が動き、生成→検証→Pages デプロイを実行する",
  ];

  process.stdout.write(JSON.stringify({
    ok: true, root, created, skipped, next_steps: nextSteps, generated: false,
    note: created.length ? "Ordito の最小構成を生成した。反映は ordito-generate で（§5.4: init は生成しない）。" : "すべて既存のため変更なし（force:true で上書き可能）。",
  }, null, 2) + "\n");
}

try { main(); } catch (e) { process.stdout.write(JSON.stringify({ ok: false, error: "init 失敗: " + e.message }) + "\n"); process.exit(1); }
