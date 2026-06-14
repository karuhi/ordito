#!/usr/bin/env node
// =========================================================================
// ordito-validate — 生成物／IR を検証（§6 二層の機械チェック層・未マップ検出含む）
//   入力(JSON): { "doc"?: "<id>", "ir_dir"?: "<dir>", "out"?: "<dir>", "contract"?: "<path>" }
//     - doc 省略時は ir_dir 内の全 IR を検証。
//     - out を与えると、生成済み <out>/<id>.html の本文フラグメントも機械チェック＋忠実度照合。
//   出力(JSON): { ok, results: [{ id, ir_schema, fieldmap, mechanical?, fidelity? }] }
//   AIエージェントが反映前（IRの妥当性）／反映後（出力の遵守度）の品質確認に使う。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const store = require("../lib/store");

const { validateFragment, validateFieldMap, validateFidelity } = require(path.join(store.REPO_ROOT, "reference", "engine", "validate.js"));
const { validateAgainst } = require(path.join(store.REPO_ROOT, "reference", "engine", "schema-check.js"));
const DEFAULT_CONTRACT = path.join(store.REPO_ROOT, "reference", "templates", "dev-docs-standard", "contract.json");

function extractFragment(html) {
  const m = html.match(/<main[^>]*id="doc-body"[^>]*>([\s\S]*?)<\/main>/);
  return m ? m[1].trim() : null;
}

function main() {
  const input = store.readInput();
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.DEFAULT_IR_DIR;
  const contract = store.readJson(input.contract ? path.resolve(input.contract) : DEFAULT_CONTRACT);
  const out = input.out ? path.resolve(input.out) : null;

  const targets = input.doc
    ? [store.findById(irDir, input.doc)].filter(Boolean)
    : store.listIr(irDir);
  if (input.doc && targets.length === 0) store.fail(`doc が見つかりません: ${input.doc}`);

  const results = [];
  let allOk = true;
  for (const { doc, file } of targets) {
    const schemaErrors = validateAgainst(doc, "document");
    const fm = validateFieldMap(doc, contract);
    const r = {
      id: doc.id,
      file: path.relative(store.REPO_ROOT, file),
      ir_schema: { ok: schemaErrors.length === 0, errors: schemaErrors },
      fieldmap: { ok: fm.ok, warnings: fm.warnings },
    };
    if (out) {
      const htmlPath = path.join(out, doc.id + ".html");
      if (fs.existsSync(htmlPath)) {
        const frag = extractFragment(fs.readFileSync(htmlPath, "utf8"));
        if (frag != null) {
          const mech = validateFragment(frag, contract);
          const fid = validateFidelity(doc, frag);
          r.mechanical = { ok: mech.ok, violations: mech.violations };
          r.fidelity = { ok: fid.ok, warnings: fid.warnings };
          if (!mech.ok || !fid.ok) allOk = false;
        }
      }
    }
    if (!r.ir_schema.ok) allOk = false;
    results.push(r);
  }

  store.emit({ ok: allOk, contract: path.basename(input.contract || DEFAULT_CONTRACT), checked: results.length, results });
  if (!allOk) process.exit(2);
}

try { main(); } catch (e) { store.fail("validate 失敗: " + e.message); }
