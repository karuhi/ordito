#!/usr/bin/env node
// =========================================================================
// conformance/run.js — Ordito 準拠テストランナー（仕様 §9）
//   1) JSON Schema 検証: conformance ケースと samples の IR・コレクションが語彙スキーマに適合するか
//   2) ゴールデン比較: 各ケースを決定論レンダラで生成し、cases/<name>/expected.fragment.html と一致するか
//   3) 機械チェック（§6.1）: 生成フラグメントが契約の許可リストに適合するか
//
//   使い方:
//     node conformance/run.js            # 検証（不適合があれば非ゼロ終了）
//     node conformance/run.js --update   # ゴールデン期待値(expected.fragment.html)を書き出す
//
//   別実装の準拠確認: 自分の生成器で cases/<name>/ir.json をレンダリングし、expected.fragment.html
//   と比較する（決定論レベル1の出力は固定）。IR は conformance/schemas で検証できる。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENGINE = path.join(ROOT, "reference", "engine");
const { renderBlocks } = require(path.join(ENGINE, "render.js"));
const { validateFragment, validateFieldMap } = require(path.join(ENGINE, "validate.js"));
const { validateAgainst } = require(path.join(ENGINE, "schema-check.js"));

const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, "reference", "templates", "dev-docs-standard", "contract.json"), "utf8"));
const CASES_DIR = path.join(__dirname, "cases");
const UPDATE = process.argv.includes("--update");

// 文脈非依存レンダリング用 ctx（外部URLは素通し、内部参照は doc id のまま）。
const ctx = { resolveHref: (h) => h };

let pass = 0, fail = 0;
const fails = [];
const schemaInvalid = new Set(); // スキーマ不適合だった IR パス（phase2 をスキップ）
function ok(msg) { pass++; console.log(`  ✓ ${msg}`); }
function ng(msg, detail) { fail++; fails.push(msg); console.log(`  ✗ ${msg}${detail ? "\n      " + detail : ""}`); }
function skip(msg) { console.log(`  – skip: ${msg}`); }

function listJson(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) out.push(p);
    }
  })(dir);
  return out;
}

console.log("== 1) JSON Schema 検証（IR / コレクション）==");
const irFiles = [
  ...listJson(path.join(ROOT, "samples", "ir")),
  ...listJson(CASES_DIR).filter((f) => f.endsWith(`${path.sep}ir.json`)),
];
for (const f of irFiles) {
  const errs = validateAgainst(JSON.parse(fs.readFileSync(f, "utf8")), "document");
  if (errs.length) { schemaInvalid.add(f); ng(`IR schema: ${path.relative(ROOT, f)}`, errs.join("; ")); }
  else ok(`IR schema: ${path.relative(ROOT, f)}`);
}
const collPath = path.join(ROOT, "samples", "collection.json");
if (fs.existsSync(collPath)) {
  const errs = validateAgainst(JSON.parse(fs.readFileSync(collPath, "utf8")), "collection");
  errs.length ? ng(`collection schema`, errs.join("; ")) : ok(`collection schema: samples/collection.json`);
}

console.log("\n== 2) ゴールデン比較＋機械チェック（決定論レンダリング）==");
for (const caseName of fs.existsSync(CASES_DIR) ? fs.readdirSync(CASES_DIR) : []) {
  const caseDir = path.join(CASES_DIR, caseName);
  const irPath = path.join(caseDir, "ir.json");
  if (!fs.statSync(caseDir).isDirectory() || !fs.existsSync(irPath)) continue;
  if (schemaInvalid.has(irPath)) { skip(`${caseName}（IR がスキーマ不適合のため mechanical/golden を省略）`); continue; }
  const doc = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const fragment = renderBlocks(doc.blocks, ctx);
  const expectedPath = path.join(caseDir, "expected.fragment.html");

  // 機械チェック（§6.1）: 許可リスト照合 ＋ field_map 未マップ検出（§4.4）
  const mech = validateFragment(fragment, CONTRACT);
  const fm = validateFieldMap(doc, CONTRACT);
  if (mech.ok && fm.ok) ok(`mechanical: ${caseName}`);
  else ng(`mechanical: ${caseName}`, JSON.stringify([...mech.violations, ...fm.warnings]));

  // ゴールデン比較（改行を正規化: CRLF→LF・末尾空白行を無視）
  const norm = (s) => s.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  if (UPDATE) {
    fs.writeFileSync(expectedPath, fragment + "\n");
    ok(`golden updated: ${caseName}`);
  } else if (!fs.existsSync(expectedPath)) {
    ng(`golden missing: ${caseName}`, `--update で生成: ${path.relative(ROOT, expectedPath)}`);
  } else {
    const expected = norm(fs.readFileSync(expectedPath, "utf8"));
    if (norm(fragment) === expected) ok(`golden match: ${caseName}`);
    else {
      const a = norm(fragment).split("\n"), b = expected.split("\n");
      const i = a.findIndex((l, k) => l !== b[k]);
      ng(`golden mismatch: ${caseName}`, `first diff @line ${i + 1}:\n        got: ${a[i]}\n        exp: ${b[i]}`);
    }
  }
}

console.log(`\n== 結果: ${pass} pass / ${fail} fail ==`);
if (fail) { console.log("不適合:\n - " + fails.join("\n - ")); process.exit(1); }
console.log("すべて準拠。");
