#!/usr/bin/env node
// =========================================================================
// ordito-delete-page — IR ドキュメント（ページ）を削除（§7.1）
//   入力(JSON): { "doc": "<id>", "prune_nav"?(=true), "collection"?, "ir_dir"?, "dry_run"? }
//   出力(JSON): { ok, doc, deleted, removed_from_nav, generated:false, note }
//   - IR ファイルを削除。prune_nav=true（既定）ならコレクションからも当該ナビ項目を除去し、
//     空になったグループを掃除する。
//   - 既に生成済みの out/<id>.html は消さない（再生成では対象外になるだけ）。note で明示。
//   - **生成は一切行わない（§5.4）**。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.engineDir(), "schema-check.js"));

function main() {
  const input = store.readInput();
  const { doc: docId } = input;
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();
  const pruneNav = input.prune_nav !== false; // 既定 true

  if (!docId) store.fail('必須: "doc"');

  const entry = store.findById(irDir, docId);
  if (!entry) store.fail(`doc が見つかりません: ${docId}`, { ir_dir: irDir });
  const relFile = path.relative(store.repoRoot(), entry.file);

  // ナビからの除去（指定時）— 事前にコレクションを読み、存在を判定
  let collPath = null, coll = null, inNav = false;
  if (pruneNav) {
    collPath = store.resolveCollectionPath(input);
    if (collPath && fs.existsSync(collPath)) {
      coll = store.readJson(collPath);
      if (Array.isArray(coll.nav)) inNav = !!store.navFind(coll.nav, { doc: docId });
    }
  }

  if (input.dry_run === true) {
    return store.emit({
      ok: true, doc: docId, deleted: false, dry_run: true,
      removed_from_nav: inNav, file: relFile, generated: false,
      note: `dry-run: ページ ${docId} を削除します${inNav ? "（ナビ項目も除去）" : ""}（まだ削除していない）。確定するには dry_run なしで再実行。`,
    });
  }

  // IR を削除
  fs.unlinkSync(entry.file);

  // ナビ項目を除去（あれば）
  let removedFromNav = false;
  if (pruneNav && coll && inNav) {
    store.navRemove(coll.nav, { doc: docId });
    store.navPruneEmptyGroups(coll.nav);
    const cErr = validateAgainst(coll, "collection");
    if (cErr.length) store.fail("ナビ除去後のコレクションがスキーマ不適合（IR は削除済み・コレクションは未変更）", { schema_errors: cErr });
    store.writeJson(collPath, coll);
    removedFromNav = true;
  }

  store.emit({
    ok: true,
    doc: docId,
    deleted: true,
    removed_from_nav: removedFromNav,
    file: relFile,
    generated: false, // §5.4
    note: "ページ（IR）を削除した。生成済み HTML は再生成で対象外になるが自動削除はしない（必要なら手動削除）。",
  });
}

try { main(); } catch (e) { store.fail("delete-page 失敗: " + e.message); }
