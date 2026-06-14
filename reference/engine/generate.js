#!/usr/bin/env node
// =========================================================================
// generate.js — Ordito 生成エンジン（v0.3: コレクション込み複数ページ生成）
//   入力(§5.1): ① IR(JSON) ② テンプレート契約(JSON) ③ コレクション(JSON, ナビ生成用)
//   出力: content_slot の innerHTML を枠に合成した HTML 群（階層パスで相互リンク）
//
//   使い方:
//     # コレクション駆動の複数ページ生成
//     node reference/engine/generate.js --collection samples/collection.json --out site
//     node reference/engine/generate.js --collection samples/collection.json --out site \
//          --mode mixed --ai-cache site/ai-fragments       # 構造化=決定論 / 散文=AI
//
//     # 後方互換: 単一ディレクトリの全サンプルをフラット生成
//     node reference/engine/generate.js                              # mode=deterministic
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const { renderBlocks, renderBlock } = require("./render");
const { validateFragment, validateFieldMap, validateFidelity } = require("./validate");
const { loadCachedFragment, generateViaAnthropic } = require("./provider");
const { buildPrompt } = require("./prompt");
const { outPath, resolveHref, relHref } = require("./paths");
const { collectDocIds, buildNavHtml } = require("./collection");
const { validateAgainst } = require("./schema-check");

const ROOT = path.join(__dirname, "..", ".."); // リポジトリルート（reference/engine/ から2つ上）
const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "dev-docs-standard"); // reference/templates
const VALID_MODES = ["deterministic", "ai", "mixed"];
const VALID_STRATEGIES = ["rules", "schema", "example", "minimal"];
// 混在生成(mixed)で AI(レベル2)に回すブロック型。残りは決定論(レベル1)。
const L2_TYPES = new Set(["paragraph", "note"]);

function die(msg) { console.error(`エラー: ${msg}`); process.exit(1); }
function takeValue(argv, i, flag) {
  const v = argv[i + 1];
  if (v == null || v.startsWith("--")) die(`${flag} に値が必要です`);
  return v;
}
function escapeAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function slugOf(id) { return String(id).split("/").pop(); }
function flatId(id) { return String(id).replace(/\//g, "__"); }

function parseArgs(argv) {
  const opts = { mode: "deterministic", out: path.join(ROOT, "dist"), strategy: "schema",
    collection: null, irDir: null, aiCache: null, model: null, only: null, docs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") opts.mode = takeValue(argv, i++, a);
    else if (a === "--out") opts.out = path.resolve(takeValue(argv, i++, a));
    else if (a === "--strategy") opts.strategy = takeValue(argv, i++, a);
    else if (a === "--collection") opts.collection = path.resolve(takeValue(argv, i++, a));
    else if (a === "--ir-dir") opts.irDir = path.resolve(takeValue(argv, i++, a));
    else if (a === "--ai-cache") opts.aiCache = path.resolve(takeValue(argv, i++, a));
    else if (a === "--model") opts.model = takeValue(argv, i++, a);
    else if (a === "--only") opts.only = takeValue(argv, i++, a).split(",").map((s) => s.trim()).filter(Boolean); // 選択的再生成（§3.4）
    else if (a.startsWith("--")) die(`不明なフラグ: ${a}`);
    else opts.docs.push(a);
  }
  if (!VALID_MODES.includes(opts.mode)) die(`--mode は ${VALID_MODES.join(" | ")} のいずれか`);
  if (!VALID_STRATEGIES.includes(opts.strategy)) die(`--strategy は ${VALID_STRATEGIES.join(" | ")} のいずれか`);
  return opts;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { die(`${file} の読み込み/JSON解析に失敗: ${e.message}`); }
}
function normalizeDoc(doc, file) {
  if (!doc.id) die(`${file}: 必須フィールド "id" がありません`);
  doc.meta = doc.meta || {};
  doc.blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  return doc;
}
// ディレクトリ配下の *.json を再帰的に IR として読む（ファイル位置は id と独立）。
function loadIrDir(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push({ file: p, doc: normalizeDoc(readJson(p), p) });
    }
  };
  walk(dir);
  return out;
}

function metaLine(doc) {
  const m = doc.meta || {};
  const tags = (m.tags || []).join(" · ");
  const stamp = new Date().toISOString(); // ビルド時刻（ミリ秒精度・§3.2）。IRの meta.generated_at はスキルが押印する。
  return `更新: ${escapeAttr(m.updated_at || "-")}<br>生成: ${stamp}` + (tags ? `<br>tags: ${escapeAttr(tags)}` : "");
}

function assemble(frame, styles, doc, navHtml, contentHtml, homeHref) {
  return frame
    .replace("{{STYLES}}", () => styles)
    .replace("{{TITLE}}", () => escapeAttr(doc.meta.title || doc.id))
    .replace("{{HOME}}", () => escapeAttr(homeHref || "index.html"))
    .replace("{{NAV}}", () => navHtml)
    .replace("{{META}}", () => metaLine(doc))
    .replace("{{CONTENT}}", () => contentHtml);
}

// AI出力フラグメント内の href（内部参照=doc id / 外部URL）を現在ページからの相対パスへ解決。
// 解決結果が原値と同じ（外部URL/未解決）なら原文のまま＝既エスケープ済み属性値の二重エスケープを防ぐ。
function resolveFragmentHrefs(html, ctx) {
  return html.replace(/href="([^"]*)"/g, (m, h) => {
    const resolved = ctx.resolveHref(h);
    return resolved === h ? m : `href="${escapeAttr(resolved)}"`;
  });
}

// 1ドキュメントの本文 innerHTML を生成。mode により決定論 / AI全域 / 混在。
async function renderContent(doc, contract, opts, ctx) {
  if (opts.mode === "deterministic") {
    return { html: renderBlocks(doc.blocks, ctx), via: "deterministic" };
  }

  if (opts.mode === "mixed") {
    // 構造化ブロック=決定論(L1)、散文(paragraph/note)=AI(L2) の混在（§5.2 本番想定）。
    const l2map = loadL2Cache(opts.aiCache, ctx.currentId); // { blockId: html } or null
    let aiUsed = 0, fellBack = 0;
    const parts = doc.blocks.map((b) => {
      if (!L2_TYPES.has(b.type)) return renderBlock(b, ctx); // L1
      if (l2map && l2map[b.id] != null) { aiUsed++; return resolveFragmentHrefs(l2map[b.id], ctx); }
      fellBack++;
      return renderBlock(b, ctx); // L2 断片が無ければ決定論にフォールバック
    });
    const via = `mixed(L2:${aiUsed} blocks${fellBack ? `, fallback:${fellBack}` : ""})`;
    return { html: parts.join("\n"), via };
  }

  // mode === "ai": 本文領域全体を AI が生成（全域生成）。
  if (opts.aiCache) {
    for (const base of [flatId(doc.id), slugOf(doc.id)]) {
      for (const ext of [".json", ".html"]) {
        const p = path.join(opts.aiCache, base + ext);
        if (fs.existsSync(p)) return { html: resolveFragmentHrefs(loadCachedFragment(p), ctx), via: `ai-cache:${base}${ext}` };
      }
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const prompt = buildPrompt({ contract, doc, strategy: opts.strategy });
    const html = resolveFragmentHrefs(await generateViaAnthropic(prompt, { model: opts.model }), ctx);
    return { html, via: `ai-api:${opts.strategy}` };
  }
  return { html: renderBlocks(doc.blocks, ctx), via: "deterministic(fallback)" };
}

function loadL2Cache(aiCache, id) {
  if (!aiCache) return null;
  const p = path.join(aiCache, flatId(id) + ".l2.json");
  if (!fs.existsSync(p)) return null;
  const obj = readJson(p);
  // {fragments:[{id,html}]} か {id:html} の両形を許容
  if (Array.isArray(obj.fragments)) {
    const m = {};
    for (const f of obj.fragments) m[f.id] = f.html;
    return m;
  }
  return obj;
}

function makeCtx(currentId, knownIds) {
  const unresolved = [];
  return {
    currentId,
    resolveHref: (href) => {
      const r = resolveHref(currentId, href, knownIds);
      if (r.kind === "unresolved") unresolved.push(href);
      return r.href;
    },
    unresolved,
  };
}

function writePage(outRoot, id, html) {
  const outFile = path.join(outRoot, outPath(id));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return outFile;
}

function validatePage(doc, html, contract, ctx) {
  // 機械チェック（§6.1）
  const mech = validateFragment(html, contract);            // 出力HTMLの許可リスト照合・整形式・枠侵食
  const fm = validateFieldMap(doc, contract);               // §4.4: field_map 未マップ検出
  const schemaErr = validateAgainst(doc, "document").map((e) => ({ rule: "ir_schema", detail: e })); // IRスキーマ検証
  const refWarn = [...new Set(ctx.unresolved)].map((h) => ({ rule: "unresolved_ref", detail: `未解決の内部参照: "${h}"` }));
  // 意味チェック（§6.2）の最小・決定論版: IR素テキストの出力反映を照合
  const fidelity = validateFidelity(doc, html);
  const warnings = [...schemaErr, ...fm.warnings, ...refWarn, ...fidelity.warnings];
  return { valid: mech.ok, violations: mech.violations, warnings };
}

// ---------- コレクション駆動の複数ページ生成 ----------
async function runCollection(opts, contract, frame, styles) {
  const collection = readJson(opts.collection);
  const collErrs = validateAgainst(collection, "collection");
  if (collErrs.length) { console.log(`  [WARN] コレクションがスキーマ不適合:`); for (const e of collErrs) console.log(`         ⚠ ${e}`); }
  const irDir = opts.irDir || path.join(ROOT, "samples", "ir");
  const docs = loadIrDir(irDir);
  const byId = new Map(docs.map((d) => [d.doc.id, d.doc]));
  const knownIds = new Set(byId.keys());
  const order = [...new Set(collectDocIds(collection.nav))]; // 同一docがnavに複数回出ても1回だけ生成
  for (const id of knownIds) if (id === "index") die(`予約 id "index" は使えません（ホーム index.html と衝突）`);
  const titleOf = (id) => (byId.get(id) ? byId.get(id).meta.title : id);

  // --only: 指定 id のページのみ再生成（§3.4）。ナビは全コレクションから生成し、他ページは触らない。
  let genList = order;
  if (opts.only) {
    for (const id of opts.only) if (!order.includes(id)) console.log(`  [WARN] --only の "${id}" はコレクションに無いためスキップ`);
    genList = order.filter((id) => opts.only.includes(id));
  }

  console.log(`Ordito engine — collection=${collection.collection_id} mode=${opts.mode}${opts.only ? ` only=${genList.join(",")}` : ""} 出力=${path.relative(ROOT, opts.out)}/`);
  const report = [];

  for (const id of genList) {
    const doc = byId.get(id);
    if (!doc) { console.log(`  [WARN] コレクションの "${id}" に対応する IR が見つかりません`); report.push({ id, missing: true }); continue; }
    const ctx = makeCtx(id, knownIds);
    const { html, via } = await renderContent(doc, contract, opts, ctx);
    const navHtml = buildNavHtml(collection.nav, { currentId: id, titleOf });
    const page = assemble(frame, styles, doc, navHtml, html, relHref(id, "index"));
    const outFile = writePage(opts.out, id, page);
    const v = validatePage(doc, html, contract, ctx);
    report.push({ id, out: path.relative(ROOT, outFile), via, valid: v.valid, violations: v.violations, warnings: v.warnings });

    const mark = v.valid ? "OK " : "NG ";
    console.log(`  [${mark}] ${id}  (${via})  -> ${path.relative(ROOT, outFile)}`);
    for (const x of v.violations) console.log(`         ✗ ${x.rule}: ${x.detail}`);
    for (const w of v.warnings) console.log(`         ⚠ ${w.rule}: ${w.detail}`);
  }

  // ホーム（コレクションのランディング）。--only 時は該当ページのみ扱いに徹し再生成しない。
  if (!opts.only) {
    writeHome(opts.out, collection, byId, knownIds, frame, styles);
    console.log(`  index.html を生成。`);
  }

  const reportObj = { collection: collection.collection_id, mode: opts.mode, strategy: opts.mode === "ai" ? opts.strategy : null, results: report };
  fs.writeFileSync(path.join(opts.out, "report.json"), JSON.stringify(reportObj, null, 2));
  const failed = report.filter((r) => r.valid === false).length;
  const warned = report.reduce((n, r) => n + ((r.warnings || []).length), 0);
  if (failed) console.log(`\n${failed} 件が機械チェック不適合。`);
  if (warned) console.log(`${warned} 件の警告（未マップ/未解決参照）。${path.relative(ROOT, path.join(opts.out, "report.json"))} 参照。`);
  return failed ? 1 : 0;
}

function writeHome(outRoot, collection, byId, knownIds, frame, styles) {
  const ctx = makeCtx("index", knownIds);
  const items = collectDocIds(collection.nav)
    .filter((id) => byId.get(id))
    .map((id) => `<li><a class="doc-link" href="${escapeAttr(ctx.resolveHref(id))}">${escapeAttr(byId.get(id).meta.title || id)}</a></li>`)
    .join("\n");
  const content = `<h1 class="doc-h">${escapeAttr(collection.title || collection.collection_id)}</h1>\n` +
    `<p class="doc-p">このサイトは Ordito エンジンがコレクション（サイトマップ）から生成しました。左のナビ、または下の一覧から各ページへ移動できます。</p>\n` +
    `<ul class="doc-list">\n${items}\n</ul>`;
  const navHtml = buildNavHtml(collection.nav, { currentId: "index", titleOf: (id) => (byId.get(id) ? byId.get(id).meta.title : id) });
  const fakeDoc = { id: "index", meta: { title: collection.title || "ホーム", tags: [] } };
  fs.writeFileSync(path.join(outRoot, "index.html"), assemble(frame, styles, fakeDoc, navHtml, content, "index.html"));
}

// ---------- 後方互換: フラット生成（コレクション無し） ----------
async function runFlat(opts, contract, frame, styles) {
  let docs;
  if (opts.docs.length) {
    docs = opts.docs.map((f) => ({ file: f, doc: normalizeDoc(readJson(f), f) })); // 明示指定は厳格
  } else {
    // 自動グロブ時は IR ファイル（id を持つ JSON）だけ拾う。collection.json 等は除外。
    docs = fs.readdirSync(path.join(ROOT, "samples")).filter((f) => f.endsWith(".json"))
      .map((f) => ({ file: path.join(ROOT, "samples", f), raw: readJson(path.join(ROOT, "samples", f)) }))
      .filter((e) => e.raw && e.raw.id)
      .map((e) => ({ file: e.file, doc: normalizeDoc(e.raw, e.file) }));
  }
  const byId = new Map(docs.map((d) => [d.doc.id, d.doc]));
  const knownIds = new Set(byId.keys());

  console.log(`Ordito engine — flat mode=${opts.mode} 出力=${path.relative(ROOT, opts.out)}/`);
  const report = [];
  for (const { doc } of docs) {
    const ctx = makeCtx(doc.id, knownIds);
    const { html, via } = await renderContent(doc, contract, opts, ctx);
    const navHtml = flatNav(docs, doc.id);
    const page = assemble(frame, styles, doc, navHtml, html, "index.html");
    const outFile = writePage(opts.out, slugOf(doc.id), page); // 互換: 末尾セグメント
    const v = validatePage(doc, html, contract, ctx);
    report.push({ id: doc.id, out: path.relative(ROOT, outFile), via, valid: v.valid, violations: v.violations, warnings: v.warnings });
    console.log(`  [${v.valid ? "OK " : "NG "}] ${doc.id} (${via}) -> ${path.relative(ROOT, outFile)}`);
    for (const x of v.violations) console.log(`         ✗ ${x.rule}: ${x.detail}`);
    for (const w of v.warnings) console.log(`         ⚠ ${w.rule}: ${w.detail}`);
  }
  fs.writeFileSync(path.join(opts.out, "report.json"), JSON.stringify({ mode: opts.mode, results: report }, null, 2));
  return report.some((r) => r.valid === false) ? 1 : 0;
}

function flatNav(docs, activeId) {
  return [...docs]
    .sort((a, b) => (a.doc.meta.order || 0) - (b.doc.meta.order || 0))
    .map(({ doc }) => `<li><a href="${slugOf(doc.id)}.html"${doc.id === activeId ? ' aria-current="page"' : ""}>${escapeAttr(doc.meta.title || doc.id)}</a></li>`)
    .join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.out, { recursive: true });
  const contract = readJson(path.join(TEMPLATE_DIR, "contract.json"));
  const frame = fs.readFileSync(path.join(TEMPLATE_DIR, "frame.html"), "utf8");
  const styles = fs.readFileSync(path.join(TEMPLATE_DIR, "styles.css"), "utf8");
  return opts.collection ? runCollection(opts, contract, frame, styles) : runFlat(opts, contract, frame, styles);
}

main().then((code) => process.exit(code || 0)).catch((e) => { console.error(e); process.exit(1); });
