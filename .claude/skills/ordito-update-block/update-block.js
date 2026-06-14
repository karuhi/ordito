#!/usr/bin/env node
// =========================================================================
// ordito-update-block — 指定 IR の指定ブロックを差分更新（§3.4）
//   入力(JSON): { "doc": "<id>", "block_id": "<bid>", "patch": { ...fields }, "ir_dir"?: "<dir>" }
//   - patch のトップレベルフィールドをブロックにマージ（配列は丸ごと置換）。
//   - patch で id / type は変更不可（ブロックの同一性・種別は §3.4 の不変条件）。
//   - patch 適用後の IR が語彙スキーマに不適合なら、書き込まず fail（不正IRを残さない）。
//   - 内容が実際に変わったときだけ meta.updated_at を更新（冪等: 同じ patch の再適用は no-op）。
//   - 入れ子ブロック（tabs 内）も block_id で指せる（§3.3.3）。
//   - **生成は一切行わない（§5.4）**。これは書き込みスキル。
//   出力(JSON): { ok, doc, block_id, changed, updated_at?, before, after, generated:false }
// =========================================================================

"use strict";

const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.REPO_ROOT, "reference", "engine", "schema-check.js"));

function main() {
  const input = store.readInput();
  const { doc: docId, block_id: blockId, patch } = input;
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.DEFAULT_IR_DIR;

  if (!docId || !blockId) store.fail('必須: "doc" と "block_id"');
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) store.fail('必須: "patch"（更新するフィールドのオブジェクト）');
  for (const k of ["id", "type"]) {
    if (k in patch) store.fail(`patch で "${k}" は変更できません（ブロックの同一性・種別は §3.4 の不変条件）`);
  }

  const entry = store.findById(irDir, docId);
  if (!entry) store.fail(`doc が見つかりません: ${docId}`, { ir_dir: irDir });
  entry.doc.meta = entry.doc.meta || {}; // meta 欠落でも落ちないよう正規化

  const hit = store.findBlock(entry.doc, blockId);
  if (!hit) store.fail(`block が見つかりません: ${blockId}（doc: ${docId}）`);

  const before = JSON.parse(JSON.stringify(hit.block));

  // 書き込み前にスキーマ検証（クローンに適用して確認 → 不正なら実体を触らず fail）
  const docClone = JSON.parse(JSON.stringify(entry.doc));
  Object.assign(store.findBlock(docClone, blockId).block, patch);
  const errors = validateAgainst(docClone, "document");
  if (errors.length) store.fail("patch 適用後の IR が語彙スキーマに不適合（書き込み中止）", { schema_errors: errors });

  Object.assign(hit.block, patch); // 検証OK → 実体に適用
  const after = JSON.parse(JSON.stringify(hit.block));
  const changed = JSON.stringify(before) !== JSON.stringify(after);

  let updatedAt = entry.doc.meta.updated_at || null;
  if (changed) {
    updatedAt = store.nowIso();
    entry.doc.meta.updated_at = updatedAt; // §3.4: 変わったブロックの更新で updated_at を進める
    store.writeJson(entry.file, entry.doc);
  }

  store.emit({
    ok: true,
    doc: docId,
    block_id: blockId,
    changed,
    updated_at: updatedAt,
    file: path.relative(store.REPO_ROOT, entry.file),
    before,
    after,
    generated: false, // §5.4: 書き込みは生成を引き起こさない
    note: changed ? "ブロックを更新し updated_at を進めた。生成は別途 ordito-generate で。"
                  : "内容に変化なし（冪等）。書き込みも updated_at 更新もしていない。",
  });
}

try { main(); } catch (e) { store.fail("update-block 失敗: " + e.message); }
