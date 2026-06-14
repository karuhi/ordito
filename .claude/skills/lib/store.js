// =========================================================================
// store.js — Ordito スキル共通ライブラリ（IRストアへの読み書き）
//   IR ファイルの位置は doc id と独立（id は論理パス）。ストアは ir_dir を
//   走査して id で引く。ブロックは入れ子（tabs）も含めて id で探索する（§3.3.3）。
//   ※ スキルは「実行して結果を返す」だけ。確認(y/n)は呼び出すAIエージェントが行う。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..", ".."); // .claude/skills/lib → リポジトリルート
const DEFAULT_IR_DIR = path.join(REPO_ROOT, "samples", "ir");

function nowIso() {
  // ミリ秒精度を保持する。連続した update→generate を確実に順序づけるため
  // （秒精度だと同秒で updated_at == generated_at になり未反映判定が崩れる）。
  return new Date().toISOString();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

// ir_dir 配下の *.json を再帰的に列挙（id を持つものだけ）。
function listIr(irDir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        let doc;
        try { doc = readJson(p); } catch { continue; }
        if (doc && doc.id) out.push({ file: p, doc });
      }
    }
  };
  if (fs.existsSync(irDir)) walk(irDir);
  return out;
}

function findById(irDir, id) {
  return listIr(irDir).find((e) => e.doc.id === id) || null;
}

// ブロックが持つ子ブロック配列を汎用に集める（§3.3.3: blocks[] を持つ任意のコンテナ）。
// 現語彙では tabs[].blocks が該当。将来 blocks[] を直接持つ型が増えても追従する。
function childBlockArrays(b) {
  const arrs = [];
  if (Array.isArray(b.blocks)) arrs.push(b.blocks);
  if (Array.isArray(b.tabs)) for (const t of b.tabs) if (Array.isArray(t.blocks)) arrs.push(t.blocks);
  return arrs;
}

// blocks（入れ子も含む）から block.id を探す。見つかれば {block, parent} を返す。
function findBlock(doc, blockId) {
  const search = (blocks, parent) => {
    for (const b of blocks || []) {
      if (b.id === blockId) return { block: b, parent };
      for (const arr of childBlockArrays(b)) {
        const hit = search(arr, b);
        if (hit) return hit;
      }
    }
    return null;
  };
  return search(doc.blocks, null);
}

// stale 判定: generated_at が無い or updated_at > generated_at。
function isStale(doc) {
  const u = doc.meta && doc.meta.updated_at;
  const g = doc.meta && doc.meta.generated_at;
  if (!g) return true;
  if (!u) return false;
  return new Date(u).getTime() > new Date(g).getTime();
}

// 入力の便宜: スキルは JSON 入力を受ける（データ交換原則）。
//   優先順: --input <file> → JSON 文字列引数（{ で始まる）→ 標準入力。
function readInput(argv = process.argv.slice(2)) {
  const fi = argv.indexOf("--input");
  if (fi >= 0 && argv[fi + 1]) return readJson(argv[fi + 1]);
  const jsonArg = argv.find((a) => a.trim().startsWith("{"));
  if (jsonArg) return JSON.parse(jsonArg);
  const stdin = fs.readFileSync(0, "utf8").trim();
  if (!stdin) return {};
  return JSON.parse(stdin);
}

// 出力の便宜: JSON を標準出力に（スキルの戻り値）。失敗時も JSON で返し非ゼロ終了。
function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}
function fail(message, extra = {}) {
  emit({ ok: false, error: message, ...extra });
  process.exit(1);
}

module.exports = {
  REPO_ROOT, DEFAULT_IR_DIR,
  nowIso, readJson, writeJson, listIr, findById, findBlock, isStale, readInput, emit, fail,
};
