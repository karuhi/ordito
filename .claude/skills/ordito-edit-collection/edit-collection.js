#!/usr/bin/env node
// =========================================================================
// ordito-edit-collection — コレクション（ナビ／サイトマップ）を編集（§3.5 / §7.1）
//   入力(JSON): { "op": "add"|"move"|"remove"|"relabel"|"set_order", ..., "collection"?, "dry_run"? }
//     add:       { op, item: {doc,label?}|{group,items?}, under?:["グループ名"...], order? }
//     move:      { op, doc?|group?, under?:[...], order? }
//     remove:    { op, doc?|group? }
//     relabel:   { op, doc, label }
//     set_order: { op, doc?|group?, order }
//   出力(JSON): { ok, op, collection_id, changed, note }
//   - ナビの「項目・順序・グループ」はコレクションが所有（§3.5）。本スキルはそこだけを編集する。
//   - 編集後にコレクション・スキーマ検証。不適合なら書き込まず fail。
//   - **生成は一切行わない（§5.4）**。ページ本体（IR）は触らない。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.engineDir(), "schema-check.js"));

function keyOf(input) {
  if (input.doc != null) return { doc: input.doc };
  if (input.group != null) return { group: input.group };
  return null;
}
function keyLabel(key) { return key.doc != null ? `doc=${key.doc}` : `group=${key.group}`; }

function applyOp(nav, input) {
  const op = input.op;
  if (op === "add") {
    const item = input.item;
    if (!item || typeof item !== "object" || (item.doc == null && item.group == null)) {
      store.fail('add には "item"（{doc,...} か {group,items?}）が必要');
    }
    const it = JSON.parse(JSON.stringify(item));
    if (it.group != null && !Array.isArray(it.items)) it.items = [];
    store.navInsert(nav, it, input.under, input.order);
    return `ナビに ${it.doc != null ? `doc=${it.doc}` : `group=${it.group}`} を追加`;
  }
  if (op === "move") {
    const key = keyOf(input);
    if (!key) store.fail('move には "doc" か "group" が必要');
    const removed = store.navRemove(nav, key);
    if (!removed) store.fail(`移動対象がナビに無い: ${keyLabel(key)}`);
    store.navInsert(nav, removed, input.under, input.order);
    return `${keyLabel(key)} を移動`;
  }
  if (op === "remove") {
    const key = keyOf(input);
    if (!key) store.fail('remove には "doc" か "group" が必要');
    const removed = store.navRemove(nav, key);
    if (!removed) store.fail(`削除対象がナビに無い: ${keyLabel(key)}`);
    return `${keyLabel(key)} をナビから除去`;
  }
  if (op === "relabel") {
    if (input.doc == null || input.label == null) store.fail('relabel には "doc" と "label" が必要');
    const hit = store.navFind(nav, { doc: input.doc });
    if (!hit) store.fail(`relabel 対象がナビに無い: doc=${input.doc}`);
    hit.item.label = input.label;
    return `doc=${input.doc} の label を更新`;
  }
  if (op === "set_order") {
    const key = keyOf(input);
    if (!key || input.order == null) store.fail('set_order には "doc"|"group" と "order" が必要');
    const hit = store.navFind(nav, key);
    if (!hit) store.fail(`set_order 対象がナビに無い: ${keyLabel(key)}`);
    hit.item.order = input.order;
    return `${keyLabel(key)} の order を ${input.order} に`;
  }
  store.fail(`未知の op: ${op}（add|move|remove|relabel|set_order）`);
}

function main() {
  const input = store.readInput();
  if (!input.op) store.fail('必須: "op"（add|move|remove|relabel|set_order）');

  const collPath = store.resolveCollectionPath(input);
  if (!collPath) store.fail('コレクションが未指定（入力 "collection" か ordito.config.json の collection）');
  if (!fs.existsSync(collPath)) store.fail(`コレクションが見つかりません: ${collPath}`);
  const coll = store.readJson(collPath);
  if (!Array.isArray(coll.nav)) store.fail("コレクションに nav 配列がありません");

  const beforeJson = JSON.stringify(coll);
  const note = applyOp(coll.nav, input);

  const cErr = validateAgainst(coll, "collection");
  if (cErr.length) store.fail("編集後のコレクションがスキーマ不適合（書き込み中止）", { schema_errors: cErr });
  const changed = JSON.stringify(coll) !== beforeJson;

  if (input.dry_run === true) {
    return store.emit({
      ok: true, op: input.op, collection_id: coll.collection_id, changed, dry_run: true,
      generated: false, preview_nav: coll.nav,
      note: `dry-run: ${note}（まだ書き込んでいない）。確定するには dry_run なしで再実行。`,
    });
  }

  if (changed) store.writeJson(collPath, coll);

  store.emit({
    ok: true,
    op: input.op,
    collection_id: coll.collection_id,
    changed,
    file: path.relative(store.repoRoot(), collPath),
    generated: false, // §5.4
    note: changed ? `${note}。反映（HTML 生成）は ordito-generate で。` : "変化なし（冪等）。",
  });
}

try { main(); } catch (e) { store.fail("edit-collection 失敗: " + e.message); }
