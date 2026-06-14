#!/usr/bin/env node
// =========================================================================
// conformance/skills-check.js — スキル I/O 契約の準拠チェック（§7.4）
//   4つの原子スキルを一時 IR ストアに対して実行し、各出力を
//   conformance/schemas/skills.schema.json で検証する。副作用はすべて一時ディレクトリ内。
//   （run.js は決定論ゴールデン専用に保ち、副作用を伴うスキル実行は本スクリプトに分離。）
//
//   使い方: node conformance/skills-check.js
// =========================================================================

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SKILLS = path.join(ROOT, ".claude", "skills");
const { validateAgainst } = require(path.join(ROOT, "reference", "engine", "schema-check.js"));
const skillsRoot = JSON.parse(fs.readFileSync(path.join(__dirname, "schemas", "skills.schema.json"), "utf8"));

let pass = 0, fail = 0;
function check(name, output, defName) {
  const errs = validateAgainst(output, defName, skillsRoot);
  if (errs.length === 0) { pass++; console.log(`  ✓ ${name} → ${defName}`); }
  else { fail++; console.log(`  ✗ ${name} → ${defName}\n      ${errs.join("\n      ")}`); }
}

// スキルを stdin に JSON を流して実行し、stdout の JSON を返す。
function run(skillDir, script, input) {
  const res = spawnSync("node", [path.join(SKILLS, skillDir, script)], { input: JSON.stringify(input), encoding: "utf8" });
  try { return JSON.parse(res.stdout); }
  catch (e) { console.log(`  ! ${skillDir} の出力が JSON でない: ${(res.stdout || res.stderr || "").slice(0, 200)}`); return { ok: false, error: "non-json" }; }
}

function main() {
  // 一時 IR ストア（コミット済みサンプルは触らない）。updated_at を過去・generated_at を null に正規化。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ordito-skills-"));
  const irDir = path.join(tmp, "ir");
  fs.cpSync(path.join(ROOT, "samples", "ir"), irDir, { recursive: true });
  (function norm(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) norm(p);
      else if (e.name.endsWith(".json")) {
        const o = JSON.parse(fs.readFileSync(p, "utf8"));
        o.meta.updated_at = "2026-01-01T00:00:00.000Z"; o.meta.generated_at = null;
        fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");
      }
    }
  })(irDir);
  const out = path.join(tmp, "site");
  const collection = path.join(ROOT, "samples", "collection.json");

  console.log("== スキル I/O 契約チェック（一時ストア: " + path.relative(os.tmpdir(), tmp) + "）==");

  // baseline 生成（全ページ generated_at セット）
  check("generate (baseline all)", run("ordito-generate", "generate.js", { collection, out, ir_dir: irDir }), "generate_output");

  // detect-stale（baseline 後 = 0 件）
  check("detect-stale (after baseline)", run("ordito-detect-stale", "detect-stale.js", { ir_dir: irDir }), "detect_stale_output");

  // update-block dry-run（書き込まないプレビュー）
  check("update-block (dry_run)", run("ordito-update-block", "update-block.js",
    { doc: "guides/quickstart", block_id: "b2", ir_dir: irDir, dry_run: true, patch: { text: "dry-run プレビュー本文。" } }), "update_block_output");

  // update-block 本適用
  check("update-block (real)", run("ordito-update-block", "update-block.js",
    { doc: "guides/quickstart", block_id: "b2", ir_dir: irDir, patch: { text: "更新後の本文。" } }), "update_block_output");

  // detect-stale（更新後 = 1 件）
  const stale = run("ordito-detect-stale", "detect-stale.js", { ir_dir: irDir });
  check("detect-stale (after update)", stale, "detect_stale_output");

  // generate only:stale（該当ページのみ）
  check("generate (only stale)", run("ordito-generate", "generate.js", { collection, out, ir_dir: irDir, only: "stale" }), "generate_output");

  // validate
  check("validate (doc + out)", run("ordito-validate", "validate.js", { doc: "guides/quickstart", ir_dir: irDir, out }), "validate_output");

  // error 出力の形（不正入力）
  check("update-block (error output)", run("ordito-update-block", "update-block.js", { doc: "guides/quickstart" }), "error_output");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n== 結果: ${pass} pass / ${fail} fail ==`);
  process.exit(fail ? 1 : 0);
}

main();
