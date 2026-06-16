#!/usr/bin/env node
// =========================================================================
// ordito-create-page — 新規 IR ドキュメント（ページ）を作成（§3.2 / §7.1）
//   入力(JSON): {
//     "doc": "<id>",                 // 必須: 論理パス。"index" は予約で不可（§3.6）
//     "title": "<title>",            // 必須: meta.title
//     "blocks"?: [ ...block ],        // 任意: 初期ブロック。id 無しは自動採番
//     "meta"?: { order?, tags?, sources? },  // 任意: 追加メタ（title/updated_at/generated_at は上書きされる）
//     "nav"?: { under?: ["グループ名"...], order?, label? },  // 任意: 同時にナビへ掲載
//     "ir_dir"?, "collection"?, "dry_run"?
//   }
//   出力(JSON): { ok, doc, created, file, in_nav, updated_at, generated:false, note }
//   - 既存 id と重複、または "index" は拒否。書き込み前に語彙スキーマ検証（不正 IR を残さない）。
//   - nav 省略時は「下書き（孤立ページ）」として作成（§3.7: 既定で生成対象外）。in_nav:false を返す。
//   - **生成は一切行わない（§5.4）**。これは書き込みスキル。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const store = require("../lib/store");
const { validateAgainst } = require(path.join(store.engineDir(), "schema-check.js"));

function main() {
  const input = store.readInput();
  const { doc: docId, title } = input;
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();

  if (!docId || !title) store.fail('必須: "doc"（論理パス）と "title"');
  if (docId === "index") store.fail('"index" は予約 id（ホームと衝突, §3.6）。別の id を使ってください');
  if (/^\/+|\/+$|\/{2,}/.test(docId)) store.fail(`不正な doc id（先頭/末尾スラッシュ・空セグメント不可）: ${docId}`);
  if (store.findById(irDir, docId)) store.fail(`doc が既に存在します: ${docId}（更新は ordito-update-block / ordito-add-block）`, { ir_dir: irDir });

  const now = store.nowIso();
  const meta = Object.assign({}, input.meta || {}, {
    title,
    updated_at: now,
    generated_at: null, // 新規は未生成（§3.4）。反映は ordito-generate で。
  });
  const doc = { id: docId, meta, blocks: Array.isArray(input.blocks) ? input.blocks : [] };
  store.assignMissingIds(doc);

  const errors = validateAgainst(doc, "document");
  if (errors.length) store.fail("作成しようとした IR が語彙スキーマに不適合（書き込み中止）", { schema_errors: errors });

  const file = path.join(irDir, ...docId.split("/")) + ".json";
  const relFile = path.relative(store.repoRoot(), file);

  // nav 掲載の事前検証（dry-run でも整合を見るため、コレクションを読み込んでおく）
  const wantNav = input.nav && typeof input.nav === "object";
  let collPath = null, coll = null;
  if (wantNav) {
    collPath = store.resolveCollectionPath(input);
    if (!collPath) store.fail('nav 指定にはコレクションが必要（入力 "collection" か ordito.config.json の collection）');
    if (!fs.existsSync(collPath)) store.fail(`コレクションが見つかりません: ${collPath}`);
    coll = store.readJson(collPath);
  }

  if (input.dry_run === true) {
    return store.emit({
      ok: true, doc: docId, created: false, dry_run: true,
      file: relFile, in_nav: !!wantNav, generated: false,
      preview: doc,
      note: "dry-run: この内容でページを作成します（まだ書き込んでいない）。確定するには dry_run なしで再実行。",
    });
  }

  // IR を書き込む
  fs.mkdirSync(path.dirname(file), { recursive: true });
  store.writeJson(file, doc);

  // ナビ掲載（指定時）
  let inNav = false;
  if (wantNav) {
    const item = { doc: docId };
    if (input.nav.label) item.label = input.nav.label;
    store.navInsert(coll.nav, item, input.nav.under, input.nav.order);
    const cErr = validateAgainst(coll, "collection");
    if (cErr.length) { fs.unlinkSync(file); store.fail("ナビ更新後のコレクションがスキーマ不適合（作成を取り消した）", { schema_errors: cErr }); }
    store.writeJson(collPath, coll);
    inNav = true;
  }

  store.emit({
    ok: true,
    doc: docId,
    created: true,
    file: relFile,
    in_nav: inNav,
    updated_at: now,
    generated: false, // §5.4
    note: inNav
      ? "新規ページを作成しナビに掲載した。反映（HTML 生成）は ordito-generate で。"
      : "新規ページを下書き（孤立）として作成した。公開するには ordito-edit-collection でナビに追加してから ordito-generate。",
  });
}

try { main(); } catch (e) { store.fail("create-page 失敗: " + e.message); }
