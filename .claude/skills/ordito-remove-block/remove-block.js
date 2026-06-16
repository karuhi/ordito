#!/usr/bin/env node
// =========================================================================
// ordito-remove-block — 既存 IR からブロックを1つ削除（§3.3 / §7.1）
//   入力(JSON): { "doc": "<id>", "block_id": "<bid>", "ir_dir"?, "dry_run"? }
//   出力(JSON): { ok, doc, block_id, removed, before, updated_at, generated:false, note }
//   - 入れ子（tabs 内）も block_id で指せる（§3.3.3）。
//   - 削除後に語彙スキーマ検証。不適合なら書き込まず fail（不正 IR を残さない）。
//   - **生成は一切行わない（§5.4）**。
// =========================================================================

"use strict";

const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.engineDir(), "schema-check.js"));

function main() {
  const input = store.readInput();
  const { doc: docId, block_id: blockId } = input;
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();

  if (!docId || !blockId) store.fail('必須: "doc" と "block_id"');

  const entry = store.findById(irDir, docId);
  if (!entry) store.fail(`doc が見つかりません: ${docId}`, { ir_dir: irDir });
  entry.doc.meta = entry.doc.meta || {};

  const loc = store.locateBlock(entry.doc, blockId);
  if (!loc) store.fail(`block が見つかりません: ${blockId}（doc: ${docId}）`);
  const before = JSON.parse(JSON.stringify(loc.block));

  // クローンで削除 → 検証（実体は最後に触る）
  const docClone = JSON.parse(JSON.stringify(entry.doc));
  store.removeBlockById(docClone, blockId);
  const errors = validateAgainst(docClone, "document");
  if (errors.length) store.fail("削除後の IR が語彙スキーマに不適合（書き込み中止）", { schema_errors: errors });

  if (input.dry_run === true) {
    return store.emit({
      ok: true, doc: docId, block_id: blockId, removed: false, dry_run: true,
      before, generated: false,
      file: path.relative(store.repoRoot(), entry.file),
      note: "dry-run: このブロックを削除します（まだ書き込んでいない）。確定するには dry_run なしで再実行。",
    });
  }

  store.removeBlockById(entry.doc, blockId);
  const now = store.nowIso();
  entry.doc.meta.updated_at = now;
  store.writeJson(entry.file, entry.doc);

  store.emit({
    ok: true,
    doc: docId,
    block_id: blockId,
    removed: true,
    before,
    updated_at: now,
    file: path.relative(store.repoRoot(), entry.file),
    generated: false, // §5.4
    note: "ブロックを削除し updated_at を進めた。反映（HTML 生成）は ordito-generate で。",
  });
}

try { main(); } catch (e) { store.fail("remove-block 失敗: " + e.message); }
