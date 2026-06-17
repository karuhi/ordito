#!/usr/bin/env node
// =========================================================================
// conformance/skills-check.js — スキル I/O 契約の準拠チェック（§7.4）
//   v1.0 の4スキル＋v1.1 の作成・構造編集系（create/add/remove/move/delete/edit-collection/init）を
//   一時 IR ストアに対して実行し、各出力を conformance/schemas/skills.schema.json で検証する。
//   副作用はすべて一時ディレクトリ内（コミット済みサンプル・コレクションは触らない）。
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
// 出力スキーマだけでなく「ストアが実際に変わったか」を検証する状態アサーション。
function assert(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}（状態が想定と不一致）`); }
}
// 黒箱の状態確認用（スキルの内部 lib は使わずファイルを直接読む）。
function findBlockById(doc, id) {
  const walk = (bs) => {
    for (const b of bs || []) {
      if (b.id === id) return b;
      const kids = [b.blocks, ...((b.tabs || []).map((t) => t.blocks))];
      for (const arr of kids) { const h = arr && walk(arr); if (h) return h; }
    }
    return null;
  };
  return walk(doc.blocks);
}
function navHasDoc(nav, docId) {
  return (nav || []).some((it) => it.doc === docId || (it.items && navHasDoc(it.items, docId)));
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

  // ---- v1.1: 作成・構造編集スキルの往復（コレクションは一時コピーに対して編集）----
  // 出力スキーマ(check)に加え、ストアが実際に変わったか(assert)も毎回確かめる。
  const tmpCollection = path.join(tmp, "collection.json");
  fs.copyFileSync(collection, tmpCollection);
  const npFile = path.join(irDir, "guides", "new-page.json");
  const readDoc = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const readColl = () => JSON.parse(fs.readFileSync(tmpCollection, "utf8"));

  // create-page（同時にナビ掲載）+ 状態確認
  const cp = run("ordito-create-page", "create-page.js",
    { doc: "guides/new-page", title: "新規ページ", ir_dir: irDir, collection: tmpCollection,
      blocks: [{ type: "heading", level: 1, text: "新規ページ" }, { type: "paragraph", text: "本文です。" }],
      nav: { under: ["ガイド"], order: 3 } });
  check("create-page (with nav)", cp, "create_page_output");
  assert("create-page: IR ファイルが作成され title/blocks を持つ", fs.existsSync(npFile) && readDoc(npFile).meta.title === "新規ページ" && readDoc(npFile).blocks.length === 2);
  assert("create-page: ナビに掲載された", navHasDoc(readColl().nav, "guides/new-page"));

  // create-page dry_run（書き込まない）
  check("create-page (dry_run)", run("ordito-create-page", "create-page.js",
    { doc: "guides/draft", title: "下書き", ir_dir: irDir, dry_run: true }), "create_page_output");
  assert("create-page dry_run: ファイルを作らない", !fs.existsSync(path.join(irDir, "guides", "draft.json")));

  // add-block（末尾に追加）→ 採番された id を後続で使う + 実在確認
  const added = run("ordito-add-block", "add-block.js",
    { doc: "guides/new-page", ir_dir: irDir, block: { type: "note", variant: "info", text: "補足。" }, position: { append: true } });
  check("add-block", added, "add_block_output");
  assert("add-block: 追加ブロックが doc に存在する", !!findBlockById(readDoc(npFile), added.block_id));

  // add-block INTO a tab（入れ子の挿入経路）— authentication b7 は tabs
  const authFile = path.join(irDir, "guides", "authentication.json");
  const inTab = run("ordito-add-block", "add-block.js",
    { doc: "guides/authentication", ir_dir: irDir, block: { type: "paragraph", text: "タブ内。" }, position: { in_tab: { block_id: "b7", tab_index: 0 } } });
  check("add-block (in_tab)", inTab, "add_block_output");
  assert("add-block in_tab: tabs[0].blocks に入った", (() => {
    const t = findBlockById(readDoc(authFile), "b7"); return t && t.tabs[0].blocks.some((b) => b.id === inTab.block_id);
  })());
  // move-block：タブ内 → トップへ（in_tab からの脱出経路）
  check("move-block (out of tab)", run("ordito-move-block", "move-block.js",
    { doc: "guides/authentication", block_id: inTab.block_id, ir_dir: irDir, position: { at: 0 } }), "move_block_output");
  assert("move-block: トップ階層の先頭に移動した", readDoc(authFile).blocks[0].id === inTab.block_id);

  // add-block dry-run（書き込まないプレビュー）+ 不変確認
  const beforeBlocks = readDoc(npFile).blocks.length;
  check("add-block (dry_run)", run("ordito-add-block", "add-block.js",
    { doc: "guides/new-page", ir_dir: irDir, dry_run: true, block: { type: "paragraph", text: "プレビュー。" } }), "add_block_output");
  assert("add-block dry_run: ブロック数が変わらない", readDoc(npFile).blocks.length === beforeBlocks);

  // move-block（追加ブロックを先頭へ）+ 位置確認
  check("move-block", run("ordito-move-block", "move-block.js",
    { doc: "guides/new-page", block_id: added.block_id, ir_dir: irDir, position: { before: "b1" } }), "move_block_output");
  assert("move-block: 先頭へ移動した", readDoc(npFile).blocks[0].id === added.block_id);

  // remove-block dry_run（消えない）→ 本適用（消える）
  check("remove-block (dry_run)", run("ordito-remove-block", "remove-block.js",
    { doc: "guides/new-page", block_id: added.block_id, ir_dir: irDir, dry_run: true }), "remove_block_output");
  assert("remove-block dry_run: まだ存在する", !!findBlockById(readDoc(npFile), added.block_id));
  check("remove-block", run("ordito-remove-block", "remove-block.js",
    { doc: "guides/new-page", block_id: added.block_id, ir_dir: irDir }), "remove_block_output");
  assert("remove-block: 削除された", !findBlockById(readDoc(npFile), added.block_id));

  // edit-collection の全 op（add / relabel / set_order / move / remove）
  check("edit-collection (add group)", run("ordito-edit-collection", "edit-collection.js",
    { op: "add", item: { group: "新グループ" }, collection: tmpCollection }), "edit_collection_output");
  assert("edit-collection add: グループが増えた", readColl().nav.some((it) => it.group === "新グループ"));
  check("edit-collection (relabel)", run("ordito-edit-collection", "edit-collection.js",
    { op: "relabel", doc: "guides/new-page", label: "新規（入門）", collection: tmpCollection }), "edit_collection_output");
  check("edit-collection (set_order)", run("ordito-edit-collection", "edit-collection.js",
    { op: "set_order", doc: "guides/new-page", order: 9, collection: tmpCollection }), "edit_collection_output");
  check("edit-collection (move)", run("ordito-edit-collection", "edit-collection.js",
    { op: "move", doc: "guides/new-page", under: ["新グループ"], collection: tmpCollection }), "edit_collection_output");
  check("edit-collection (remove)", run("ordito-edit-collection", "edit-collection.js",
    { op: "remove", group: "新グループ", collection: tmpCollection }), "edit_collection_output");
  assert("edit-collection remove: グループが消えた", !readColl().nav.some((it) => it.group === "新グループ"));

  // 新ページはナビから消えた（グループごと remove したため）→ 公開検証のため再掲してから生成
  run("ordito-edit-collection", "edit-collection.js", { op: "add", item: { doc: "guides/new-page" }, under: ["ガイド"], collection: tmpCollection });
  check("generate (after authoring)", run("ordito-generate", "generate.js",
    { collection: tmpCollection, out, ir_dir: irDir, only: ["guides/new-page"] }), "generate_output");
  assert("generate: 新ページの HTML が出力された", fs.existsSync(path.join(out, "guides", "new-page.html")));
  check("validate (new page)", run("ordito-validate", "validate.js",
    { doc: "guides/new-page", ir_dir: irDir, out }), "validate_output");

  // delete-page dry_run（消えない）→ 本適用（IR もナビも消える）
  check("delete-page (dry_run)", run("ordito-delete-page", "delete-page.js",
    { doc: "guides/new-page", ir_dir: irDir, collection: tmpCollection, dry_run: true }), "delete_page_output");
  assert("delete-page dry_run: ファイルが残る", fs.existsSync(npFile));
  check("delete-page", run("ordito-delete-page", "delete-page.js",
    { doc: "guides/new-page", ir_dir: irDir, collection: tmpCollection }), "delete_page_output");
  assert("delete-page: IR が消えナビからも除去された", !fs.existsSync(npFile) && !navHasDoc(readColl().nav, "guides/new-page"));

  // create-page エラー（予約 id "index"）
  check("create-page (error: reserved index)", run("ordito-create-page", "create-page.js",
    { doc: "index", title: "x", ir_dir: irDir }), "error_output");

  // init（別の一時 root へ scaffold）+ 生成物確認
  const initRoot = path.join(tmp, "initrepo");
  fs.mkdirSync(path.join(initRoot, ".git"), { recursive: true });
  check("init (scaffold)", run("ordito-init", "init.js", { root: initRoot, title: "テスト" }), "init_output");
  assert("init: config / 起点ページ / コレクション / ワークフローを生成", [
    "ordito.config.json", "docs/ir/guides/getting-started.json", "docs/collection.json", ".github/workflows/docs.yml",
  ].every((p) => fs.existsSync(path.join(initRoot, p))));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n== 結果: ${pass} pass / ${fail} fail ==`);
  process.exit(fail ? 1 : 0);
}

main();
