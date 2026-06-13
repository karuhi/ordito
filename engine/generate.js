#!/usr/bin/env node
// =========================================================================
// generate.js — Ordito POC 生成エンジン（5.1 入力→出力 のオーケストレータ）
//   入力: IR ドキュメント(JSON) + テンプレート契約(JSON) + テンプレート枠
//   出力: 枠に合成された単一HTMLページ（CSSはインライン化して自己完結）
//
//   使い方:
//     node engine/generate.js                       # 全サンプルを決定論モードで生成
//     node engine/generate.js --mode ai             # レベル2(AI)モード
//     node engine/generate.js --mode ai --ai-cache dist/ai-fragments
//     node engine/generate.js --strategy schema     # AIモード時のプロンプト戦略
//     node engine/generate.js samples/quickstart.json
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const { renderBlocks } = require("./render");
const { validateFragment } = require("./validate");
const { buildPrompt } = require("./prompt");
const { generateViaAnthropic, loadCachedFragment } = require("./provider");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT, "templates", "dev-docs-standard");

const VALID_MODES = ["deterministic", "ai"];
const VALID_STRATEGIES = ["rules", "schema", "example", "minimal"];

function die(msg) {
  console.error(`エラー: ${msg}`);
  process.exit(1);
}

function takeValue(argv, i, flag) {
  const v = argv[i + 1];
  if (v == null || v.startsWith("--")) die(`${flag} に値が必要です`);
  return v;
}

function parseArgs(argv) {
  const opts = { mode: "deterministic", out: path.join(ROOT, "dist"), strategy: "rules", aiCache: null, model: null, docs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") opts.mode = takeValue(argv, i++, a);
    else if (a === "--out") opts.out = path.resolve(takeValue(argv, i++, a));
    else if (a === "--strategy") opts.strategy = takeValue(argv, i++, a);
    else if (a === "--ai-cache") opts.aiCache = path.resolve(takeValue(argv, i++, a));
    else if (a === "--model") opts.model = takeValue(argv, i++, a);
    else if (a.startsWith("--")) die(`不明なフラグ: ${a}`);
    else opts.docs.push(a);
  }
  if (!VALID_MODES.includes(opts.mode)) die(`--mode は ${VALID_MODES.join(" | ")} のいずれか（受領: ${opts.mode}）`);
  if (!VALID_STRATEGIES.includes(opts.strategy)) die(`--strategy は ${VALID_STRATEGIES.join(" | ")} のいずれか（受領: ${opts.strategy}）`);
  return opts;
}

function slugOf(docId) {
  return String(docId).split("/").pop();
}

function loadDocs(docArgs) {
  const files = docArgs.length
    ? docArgs
    : fs.readdirSync(path.join(ROOT, "samples"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(ROOT, "samples", f));
  return files.map((f) => {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (e) {
      die(`${f} の読み込み/JSON解析に失敗: ${e.message}`);
    }
    if (!doc.id) die(`${f}: 必須フィールド "id" がありません`);
    doc.meta = doc.meta || {}; // meta 欠落でも落ちないよう正規化
    doc.blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    return { file: f, doc };
  });
}

function buildNav(docs, activeId) {
  return [...docs]
    .sort((a, b) => (a.doc.meta.order || 0) - (b.doc.meta.order || 0))
    .map(({ doc }) => {
      const slug = slugOf(doc.id);
      const cur = doc.id === activeId ? ' aria-current="page"' : "";
      return `<li><a href="${slug}.html"${cur}>${escapeAttr(doc.meta.title || doc.id)}</a></li>`;
    })
    .join("\n        ");
}

function escapeAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function metaLine(doc) {
  const m = doc.meta || {};
  const tags = (m.tags || []).join(" · ");
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return `更新: ${escapeAttr(m.updated_at || "-")}<br>生成: ${stamp}<br>tags: ${escapeAttr(tags)}`;
}

// AI出力中の内部参照 href（IRの論理参照 = doc id）を出力ファイル名へ解決する。
// リンク解決は生成エンジンの責務であり、AI（レベル2）は IR の href をそのまま保持する。
function resolveFragmentHrefs(html, docIndex) {
  let out = html;
  for (const [id, file] of docIndex) {
    out = out.split(`href="${id}"`).join(`href="${file}"`);
  }
  return out;
}

// IR の本文領域HTMLを得る。mode によりレベル1（決定論）かレベル2（AI）。
async function renderContent(doc, contract, opts, ctx) {
  if (opts.mode === "deterministic") {
    return { html: renderBlocks(doc.blocks, ctx), via: "deterministic" };
  }
  // --- AIモード（レベル2） ---
  const slug = slugOf(doc.id);
  // (a) キャッシュ断片があれば最優先（Workflowが生成したAI出力）
  if (opts.aiCache) {
    for (const ext of [".json", ".html"]) {
      const p = path.join(opts.aiCache, slug + ext);
      if (fs.existsSync(p)) {
        const html = resolveFragmentHrefs(loadCachedFragment(p), opts.docIndex);
        return { html, via: `ai-cache:${path.basename(p)}` };
      }
    }
  }
  // (b) APIキーがあれば実呼び出し
  if (process.env.ANTHROPIC_API_KEY) {
    const prompt = buildPrompt({ contract, doc, strategy: opts.strategy });
    const html = resolveFragmentHrefs(await generateViaAnthropic(prompt, { model: opts.model }), opts.docIndex);
    return { html, via: `ai-api:${opts.strategy}` };
  }
  // (c) フォールバック: 決定論（一周は必ず通す）
  return {
    html: renderBlocks(doc.blocks, ctx),
    via: "deterministic(fallback: AI断片もAPIキーも無し)",
  };
}

function assemble(frame, styles, doc, navHtml, contentHtml) {
  // 本文は再インデントしない: <pre> 内の空白は有意なので、行頭スペースを足すと
  // コードブロックの整形が崩れる。可読性より正しさを優先し、そのまま差し込む。
  return frame
    .replace("{{STYLES}}", () => styles)
    .replace("{{TITLE}}", () => escapeAttr(doc.meta.title))
    .replace("{{NAV}}", () => navHtml)
    .replace("{{META}}", () => metaLine(doc))
    .replace("{{CONTENT}}", () => contentHtml);
}

function writeIndex(outDir, docs, styles, frame) {
  const list = [...docs]
    .sort((a, b) => (a.doc.meta.order || 0) - (b.doc.meta.order || 0))
    .map(({ doc }) => `<li><a class="doc-link is-standalone" href="${slugOf(doc.id)}.html">${escapeAttr(doc.meta.title || doc.id)}</a></li>`)
    .join("\n");
  const content = `<h1 class="doc-h">Ordito Docs</h1>\n<p class="doc-p">POC で生成したドキュメント一覧です。</p>\n<ul class="doc-list">\n${list}\n</ul>`;
  const navHtml = buildNav(docs, null);
  const fakeDoc = { meta: { title: "ホーム", tags: ["index"], updated_at: "-" }, id: "index" };
  fs.writeFileSync(path.join(outDir, "index.html"), assemble(frame, styles, fakeDoc, navHtml, content));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });

  const contract = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, "contract.json"), "utf8"));
  const frame = fs.readFileSync(path.join(TEMPLATE_DIR, "frame.html"), "utf8");
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");

  const docs = loadDocs(opts.docs);
  // slug 衝突検出: 異なる id が同じ出力ファイル名になると上書き・リンク破綻を起こす。
  const slugSeen = new Map();
  for (const { doc } of docs) {
    const slug = slugOf(doc.id);
    if (slugSeen.has(slug) && slugSeen.get(slug) !== doc.id) {
      die(`slug 衝突: "${slugSeen.get(slug)}" と "${doc.id}" がどちらも ${slug}.html になります。id を一意にしてください。`);
    }
    slugSeen.set(slug, doc.id);
  }
  const docIndex = new Map(docs.map(({ doc }) => [doc.id, slugOf(doc.id) + ".html"]));
  const ctx = { resolveHref: (href) => docIndex.get(href) || href };
  opts.docIndex = docIndex; // AIモードのhref解決で使う

  console.log(`Ordito POC engine — mode=${opts.mode}${opts.mode === "ai" ? ` strategy=${opts.strategy}` : ""}`);
  const report = [];

  for (const entry of docs) {
    const { doc } = entry;
    const { html, via } = await renderContent(doc, contract, opts, ctx);
    const check = validateFragment(html, contract);
    const navHtml = buildNav(docs, doc.id);
    const page = assemble(frame, styles, doc, navHtml, html);
    const outFile = path.join(opts.out, slugOf(doc.id) + ".html");
    fs.writeFileSync(outFile, page);

    report.push({ id: doc.id, out: path.relative(ROOT, outFile), via, valid: check.ok, violations: check.violations });
    const mark = check.ok ? "OK " : "NG ";
    console.log(`  [${mark}] ${doc.id}  (${via})  -> ${path.relative(ROOT, outFile)}`);
    if (!check.ok) for (const v of check.violations) console.log(`         · ${v.rule}: ${v.detail}`);
  }

  writeIndex(opts.out, docs, styles, frame);
  console.log(`  index.html を生成。出力先: ${path.relative(ROOT, opts.out)}/`);

  // 機械可読レポート（JSON統一の原則）。strategy は AIモード時のみ意味を持つ。
  const reportObj = { mode: opts.mode, strategy: opts.mode === "ai" ? opts.strategy : null, results: report };
  const reportPath = path.join(opts.out, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(reportObj, null, 2));
  const failed = report.filter((r) => !r.valid).length;
  if (failed) console.log(`\n${failed} 件が契約チェックに不適合。${path.relative(ROOT, reportPath)} を参照。`);
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code || 0)).catch((e) => { console.error(e); process.exit(1); });
