#!/usr/bin/env node
// =========================================================================
// ordito-generate — 明示トリガーでページを再生成し meta.generated_at を更新（§5.4）
//   入力(JSON): {
//     "collection": "<path>",        // 必須
//     "out": "<dir>",                // 必須（出力先）
//     "ir_dir"?: "<dir>",
//     "only"?: ["<id>", ...] | "stale",   // 省略時は全ページ。"stale" は未反映のみ。
//     "mode"?: "deterministic" | "mixed" | "ai",   // 既定 deterministic
//     "ai_cache"?: "<dir>"           // mixed/ai 用
//   }
//   出力(JSON): { ok, trigger:"explicit", mode, out, generated:[id...], generated_at, results, unknown_ids, note }
//   ★ これは読み出し（生成）スキル。update 系の副作用としては絶対に走らない（§5.4）。
// =========================================================================

"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const store = require("../lib/store");

const ENGINE = path.join(store.engineDir(), "generate.js");

// 反映済みの意味を保つため、generated_at は max(now, updated_at)。
// 更新元の時計が進んでいる/未来日時でも「その内容を反映済み」になり、stale が解消する（クロックスキュー耐性）。
function stampFor(updatedAt, now) {
  if (updatedAt && new Date(updatedAt).getTime() > new Date(now).getTime()) return updatedAt;
  return now;
}

function main() {
  const input = store.readInput();
  const root = store.repoRoot();
  const cfg = store.config.loadConfig(root);
  const rel = (v) => (path.isAbsolute(v) ? v : path.join(root, v));
  // collection / out は 入力 > ordito.config.json の順で解決（どちらも無ければエラー）。
  const collection = input.collection ? path.resolve(input.collection) : (cfg.collection ? rel(cfg.collection) : null);
  const out = input.out ? path.resolve(input.out) : (cfg.out ? rel(cfg.out) : null);
  if (!collection) store.fail('"collection" が未指定（入力か ordito.config.json の collection が必要）');
  if (!out) store.fail('"out" が未指定（入力か ordito.config.json の out が必要）');
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();
  const mode = input.mode || cfg.mode || "deterministic";
  const base = { ok: true, trigger: "explicit", mode, out: path.relative(root, out) };

  // 生成対象 id の決定
  let onlyIds = null;
  let unknownIds = [];
  const knownIds = new Set(store.listIr(irDir).map((e) => e.doc.id));
  if (input.only === "stale") {
    onlyIds = store.listIr(irDir).filter((e) => store.isStale(e.doc)).map((e) => e.doc.id);
    if (onlyIds.length === 0) {
      return store.emit({ ...base, generated: [], generated_at: null, results: [], unknown_ids: [], note: "未反映ページなし。生成不要。" });
    }
  } else if (Array.isArray(input.only)) {
    onlyIds = input.only.filter((id) => knownIds.has(id));
    unknownIds = input.only.filter((id) => !knownIds.has(id));
    if (onlyIds.length === 0) store.fail("only に指定した id がいずれも存在しない", { unknown_ids: unknownIds });
  }

  // 参照エンジンを明示的に起動（書き込みスキルとは別経路）
  const args = ["--collection", collection, "--out", out, "--ir-dir", irDir, "--mode", mode];
  if (input.ai_cache) args.push("--ai-cache", path.resolve(input.ai_cache));
  if (onlyIds) args.push("--only", onlyIds.join(","));

  const res = spawnSync("node", [ENGINE, ...args], { encoding: "utf8" });
  if (res.error) store.fail("生成エンジンを起動できません: " + res.error.code, { detail: String(res.error) });
  if (res.status !== 0) store.fail(`生成エンジンが失敗 (exit ${res.status})`, { stderr: (res.stderr || "").slice(-2000) });

  // report.json から実際に生成されたページを取得し、各 IR の generated_at を更新（§5.4）
  let report;
  try { report = store.readJson(path.join(out, "report.json")); }
  catch (e) { store.fail("report.json を読めません（生成は走ったが結果未取得）: " + e.message); }
  const now = store.nowIso();
  const generated = [];
  for (const r of report.results || []) {
    if (r.missing) continue;
    const entry = store.findById(irDir, r.id);
    if (entry) {
      entry.doc.meta = entry.doc.meta || {};
      entry.doc.meta.generated_at = stampFor(entry.doc.meta.updated_at, now);
      store.writeJson(entry.file, entry.doc);
      generated.push(r.id);
    }
  }

  store.emit({
    ...base,
    generated,
    generated_at: now,
    unknown_ids: unknownIds,
    results: (report.results || []).map((r) => ({ id: r.id, via: r.via, valid: r.valid, warnings: (r.warnings || []).length })),
    note: "明示トリガーで該当ページのみ再生成し generated_at を更新した。検証は ordito-validate で。",
  });
}

try { main(); } catch (e) { store.fail("generate 失敗: " + e.message); }
