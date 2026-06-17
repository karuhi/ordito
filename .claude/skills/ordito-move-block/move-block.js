#!/usr/bin/env node
// =========================================================================
// ordito-move-block — 既存ブロックを同一ドキュメント内で並べ替え/再配置（§3.3 / §7.1）
//   入力(JSON): {
//     "doc": "<id>", "block_id": "<bid>",
//     "position": { at?:<i> | after?:<bid> | before?:<bid>, in_tab?:{ block_id, tab_index } },  // 必須
//     "ir_dir"?, "dry_run"?
//   }
//   出力(JSON): { ok, doc, block_id, moved, position, updated_at, generated:false, note }
//   - 同じ doc 内の移動のみ（タブ出入りも可）。基準 block に自分自身は指定不可。
//   - 移動後に語彙スキーマ検証。不適合なら書き込まず fail。
//   - **生成は一切行わない（§5.4）**。
// =========================================================================

"use strict";

const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.engineDir(), "schema-check.js"));

function main() {
  const input = store.readInput();
  const { doc: docId, block_id: blockId, position } = input;
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();

  if (!docId || !blockId) store.fail('必須: "doc" と "block_id"');
  if (!position || typeof position !== "object") store.fail('必須: "position"（移動先）');

  const entry = store.findById(irDir, docId);
  if (!entry) store.fail(`doc が見つかりません: ${docId}`, { ir_dir: irDir });
  entry.doc.meta = entry.doc.meta || {};
  if (!store.locateBlock(entry.doc, blockId)) store.fail(`block が見つかりません: ${blockId}（doc: ${docId}）`);

  // クローンで移動 → 検証（実体は最後に触る）
  const docClone = JSON.parse(JSON.stringify(entry.doc));
  try { store.moveBlock(docClone, blockId, position); }
  catch (e) { store.fail("移動できません: " + e.message); }
  const errors = validateAgainst(docClone, "document");
  if (errors.length) store.fail("移動後の IR が語彙スキーマに不適合（書き込み中止）", { schema_errors: errors });

  if (input.dry_run === true) {
    return store.emit({
      ok: true, doc: docId, block_id: blockId, moved: false, dry_run: true,
      position, generated: false,
      file: path.relative(store.repoRoot(), entry.file),
      note: "dry-run: このブロックを移動します（まだ書き込んでいない）。確定するには dry_run なしで再実行。",
    });
  }

  store.moveBlock(entry.doc, blockId, position);
  const now = store.nowIso();
  entry.doc.meta.updated_at = now;
  store.writeJson(entry.file, entry.doc);

  store.emit({
    ok: true,
    doc: docId,
    block_id: blockId,
    moved: true,
    position,
    updated_at: now,
    file: path.relative(store.repoRoot(), entry.file),
    generated: false, // §5.4
    note: "ブロックを移動し updated_at を進めた。反映（HTML 生成）は ordito-generate で。",
  });
}

try { main(); } catch (e) { store.fail("move-block 失敗: " + e.message); }
