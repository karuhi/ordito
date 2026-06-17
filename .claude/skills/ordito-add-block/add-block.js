#!/usr/bin/env node
// =========================================================================
// ordito-add-block — 既存 IR にブロックを1つ挿入（§3.3 / §7.1）
//   入力(JSON): {
//     "doc": "<id>",                 // 必須
//     "block": { "type": "...", ... },  // 必須: 追加するブロック。id 無しは自動採番
//     "position"?: { append?(既定) | at?:<i> | after?:<bid> | before?:<bid>, in_tab?:{ block_id, tab_index } },
//     "ir_dir"?, "dry_run"?
//   }
//   出力(JSON): { ok, doc, block_id, added, position, updated_at, generated:false, note }
//   - 既存 doc のみ対象（新規ページは ordito-create-page）。
//   - 挿入後に語彙スキーマ検証。不適合なら書き込まず fail（不正 IR を残さない）。
//   - **生成は一切行わない（§5.4）**。
// =========================================================================

"use strict";

const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.engineDir(), "schema-check.js"));

function main() {
  const input = store.readInput();
  const { doc: docId, block, position } = input;
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();

  if (!docId) store.fail('必須: "doc"');
  if (!block || typeof block !== "object" || Array.isArray(block)) store.fail('必須: "block"（追加するブロックのオブジェクト）');
  if (!block.type) store.fail('"block" に "type" が必要（語彙10種, §3.3）');

  const entry = store.findById(irDir, docId);
  if (!entry) store.fail(`doc が見つかりません: ${docId}（新規作成は ordito-create-page）`, { ir_dir: irDir });
  entry.doc.meta = entry.doc.meta || {};

  if (block.id != null && store.allBlockIds(entry.doc).has(block.id)) {
    store.fail(`block.id が既存と重複: ${block.id}（id を省けば自動採番されます）`);
  }

  // クローンに挿入 → 採番 → 検証（実体は最後に触る）
  const docClone = JSON.parse(JSON.stringify(entry.doc));
  const blockClone = JSON.parse(JSON.stringify(block));
  let insertedAt;
  try {
    ({ index: insertedAt } = store.insertBlock(docClone, blockClone, position || {}));
  } catch (e) { store.fail("挿入位置を解決できません: " + e.message); }
  store.assignMissingIds(docClone);
  const blockId = blockClone.id;

  const errors = validateAgainst(docClone, "document");
  if (errors.length) store.fail("挿入後の IR が語彙スキーマに不適合（書き込み中止）", { schema_errors: errors });

  const posSummary = { ...(position || { append: true }) };
  if (input.dry_run === true) {
    return store.emit({
      ok: true, doc: docId, block_id: blockId, added: false, dry_run: true,
      position: posSummary, generated: false,
      file: path.relative(store.repoRoot(), entry.file),
      preview_block: blockClone,
      note: "dry-run: このブロックを追加します（まだ書き込んでいない）。確定するには dry_run なしで再実行。",
    });
  }

  // 検証OK → 実体へ反映
  store.insertBlock(entry.doc, blockClone, position || {});
  const now = store.nowIso();
  entry.doc.meta.updated_at = now;
  store.writeJson(entry.file, entry.doc);

  store.emit({
    ok: true,
    doc: docId,
    block_id: blockId,
    added: true,
    position: posSummary,
    updated_at: now,
    file: path.relative(store.repoRoot(), entry.file),
    generated: false, // §5.4
    note: "ブロックを追加し updated_at を進めた。反映（HTML 生成）は ordito-generate で。",
  });
}

try { main(); } catch (e) { store.fail("add-block 失敗: " + e.message); }
