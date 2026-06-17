// =========================================================================
// store.js — Ordito スキル共通ライブラリ（IRストアへの読み書き）
//   IR ファイルの位置は doc id と独立（id は論理パス）。ストアは ir_dir を
//   走査して id で引く。ブロックは入れ子（tabs）も含めて id で探索する（§3.3.3）。
//   ※ スキルは「実行して結果を返す」だけ。確認(y/n)は呼び出すAIエージェントが行う。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");

// engine 本体の場所を解決する単一の分岐点（配布形態をここだけで切替える）。
//   1) Ordito リポジトリ: reference/engine
//   2) 同梱配布: skills 配下に同梱した engine（lib/engine, install-into.sh が配置）
// config.js もここから require する（engine 同梱の配置解決ロジックを共有）。
function engineDir() {
  const cands = [
    path.join(__dirname, "..", "..", "..", "reference", "engine"), // .claude/skills/lib → repo/reference/engine
    path.join(__dirname, "engine"),       // 同梱: .claude/skills/lib/engine
  ];
  for (const c of cands) if (fs.existsSync(path.join(c, "generate.js"))) return c;
  return cands[0];
}
const config = require(path.join(engineDir(), "config.js"));

// 導入先リポジトリの root（process.cwd() から上昇探索）。1プロセス内でメモ化。
let _root = null;
function repoRoot() { return (_root = _root || config.findRepoRoot(process.cwd())); }
// 既定 IR ストア: ordito.config.json の irDir（root 相対）→ 無ければ root/samples/ir。
function defaultIrDir() {
  const root = repoRoot();
  const cfg = config.loadConfig(root);
  if (cfg.irDir) return path.isAbsolute(cfg.irDir) ? cfg.irDir : path.join(root, cfg.irDir);
  return path.join(root, "samples", "ir");
}

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

// =====================================================================
// 作成・構造編集の共有ヘルパ（v1.1 の作成系スキルが単一ソースで使う）
//   doc.blocks の木（tabs 入れ子を含む, §3.3.3）に対する純粋な操作。
//   いずれも doc を直接書き換え、スキーマ検証は呼び出し側スキルが行う。
// =====================================================================

// 木全体（入れ子含む）の block.id を集合で返す。
function allBlockIds(doc) {
  const ids = new Set();
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b && b.id != null) ids.add(b.id);
      for (const arr of childBlockArrays(b)) walk(arr);
    }
  };
  walk(doc.blocks);
  return ids;
}

// 衝突しない次のブロック id（既存 b<N> の最大+1。無ければ b1）。
function nextBlockId(doc) {
  const ids = allBlockIds(doc);
  let max = 0;
  for (const id of ids) { const m = /^b(\d+)$/.exec(id); if (m) max = Math.max(max, Number(m[1])); }
  let n = max + 1;
  while (ids.has(`b${n}`)) n++;
  return `b${n}`;
}

// block を id で探し、それを含む配列・添字・親ブロックを返す（入れ子対応）。
//   { array, index, block, parentBlock } / 見つからなければ null。
function locateBlock(doc, blockId) {
  const search = (arr, parentBlock) => {
    for (let i = 0; i < (arr || []).length; i++) {
      const b = arr[i];
      if (b.id === blockId) return { array: arr, index: i, block: b, parentBlock };
      for (const childArr of childBlockArrays(b)) {
        const hit = search(childArr, b);
        if (hit) return hit;
      }
    }
    return null;
  };
  return search(doc.blocks || [], null);
}

// position から「挿入先の配列」と「挿入位置(index)」を決める。
//   position = { append?(既定) | at?:index | after?:block_id | before?:block_id, in_tab?:{ block_id, tab_index } }
//   in_tab 指定時は tabs ブロックの tabs[tab_index].blocks を対象にする。
function resolveInsertTarget(doc, position = {}) {
  let arr;
  if (position.in_tab) {
    const { block_id: tabsId, tab_index: ti = 0 } = position.in_tab;
    const loc = locateBlock(doc, tabsId);
    if (!loc) throw new Error(`in_tab.block_id のブロックが無い: ${tabsId}`);
    if (loc.block.type !== "tabs" || !Array.isArray(loc.block.tabs)) throw new Error(`in_tab.block_id は tabs ブロックでない: ${tabsId}`);
    const tab = loc.block.tabs[ti];
    if (!tab) throw new Error(`tab_index ${ti} が範囲外（${tabsId} のタブ数 ${loc.block.tabs.length}）`);
    if (!Array.isArray(tab.blocks)) tab.blocks = [];
    arr = tab.blocks;
  } else {
    arr = doc.blocks;
  }
  let index;
  if (position.after != null) {
    const i = arr.findIndex((b) => b.id === position.after);
    if (i < 0) throw new Error(`after の基準ブロックが対象配列に無い: ${position.after}`);
    index = i + 1;
  } else if (position.before != null) {
    const i = arr.findIndex((b) => b.id === position.before);
    if (i < 0) throw new Error(`before の基準ブロックが対象配列に無い: ${position.before}`);
    index = i;
  } else if (Number.isInteger(position.at)) {
    index = Math.max(0, Math.min(arr.length, position.at));
  } else {
    index = arr.length; // append 既定
  }
  return { array: arr, index };
}

// doc の木を走査し、id を持たないブロックに一意な id を採番する（入れ子含む）。
// 採番済みの id を返す（採番が発生した block→id の対応）。
function assignMissingIds(doc) {
  const assigned = [];
  const walk = (blocks) => {
    for (const b of blocks || []) {
      if (b && b.id == null) { b.id = nextBlockId(doc); assigned.push(b.id); }
      for (const arr of childBlockArrays(b)) walk(arr);
    }
  };
  walk(doc.blocks);
  return assigned;
}

// block を position に挿入（doc を書き換える）。
function insertBlock(doc, block, position) {
  const { array, index } = resolveInsertTarget(doc, position);
  array.splice(index, 0, block);
  return { index };
}

// blockId のブロックを取り除き、取り除いたブロックを返す（入れ子対応）。
function removeBlockById(doc, blockId) {
  const loc = locateBlock(doc, blockId);
  if (!loc) return null;
  const [removed] = loc.array.splice(loc.index, 1);
  return removed;
}

// 既存ブロックを同一 doc 内の別位置へ移動（並べ替え/タブ出入り）。
function moveBlock(doc, blockId, position = {}) {
  if (position.after === blockId || position.before === blockId) throw new Error("同じブロックを基準に移動できません");
  const loc = locateBlock(doc, blockId);
  if (!loc) throw new Error(`移動するブロックが無い: ${blockId}`);
  const [b] = loc.array.splice(loc.index, 1); // 先に取り外す（基準 id は残った木から解決）
  try {
    insertBlock(doc, b, position);
  } catch (e) {
    loc.array.splice(loc.index, 0, b); // 失敗時は元に戻す
    throw e;
  }
  return b;
}

// =====================================================================
// コレクション（ナビ）の解決と編集ヘルパ
// =====================================================================

// collection ファイルの場所: 入力 > ordito.config.json > エラー。絶対パスを返す。
function resolveCollectionPath(input = {}) {
  if (input.collection) return path.resolve(input.collection);
  const cfg = config.loadConfig(repoRoot());
  if (cfg.collection) return path.isAbsolute(cfg.collection) ? cfg.collection : path.join(repoRoot(), cfg.collection);
  return null;
}

// under（グループ名の配列）で、ナビの対象 items 配列まで降りる。空/未指定なら nav 直下。
function navResolveContainer(nav, under) {
  let container = nav;
  for (const name of under || []) {
    const g = container.find((it) => it.group === name);
    if (!g) throw new Error(`グループが無い: "${name}"（under パスを確認）`);
    if (!Array.isArray(g.items)) g.items = [];
    container = g.items;
  }
  return container;
}

// key = { doc } または { group } を再帰探索。{ array, index, item } / null。
function navFind(nav, key) {
  const matches = (it) => (key.doc != null ? it.doc === key.doc : it.group === key.group);
  const search = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      if (matches(arr[i])) return { array: arr, index: i, item: arr[i] };
      if (Array.isArray(arr[i].items)) { const hit = search(arr[i].items); if (hit) return hit; }
    }
    return null;
  };
  return search(nav);
}

// item を under 配下へ追加（order 任意）。
function navInsert(nav, item, under, order) {
  const container = navResolveContainer(nav, under);
  if (order != null) item.order = order;
  container.push(item);
}

// key を取り除く。取り除いた item を返す（無ければ null）。
function navRemove(nav, key) {
  const hit = navFind(nav, key);
  if (!hit) return null;
  const [removed] = hit.array.splice(hit.index, 1);
  return removed;
}

// items が空のグループを再帰的に除去（delete-page の prune 用）。
function navPruneEmptyGroups(nav) {
  const prune = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (Array.isArray(arr[i].items)) {
        prune(arr[i].items);
        if (arr[i].items.length === 0) arr.splice(i, 1);
      }
    }
  };
  prune(nav);
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
  config, engineDir, repoRoot, defaultIrDir,
  nowIso, readJson, writeJson, listIr, findById, findBlock, isStale, readInput, emit, fail,
  // v1.1: 作成・構造編集の共有ヘルパ
  allBlockIds, nextBlockId, assignMissingIds, locateBlock, resolveInsertTarget, insertBlock, removeBlockById, moveBlock,
  resolveCollectionPath, navResolveContainer, navFind, navInsert, navRemove, navPruneEmptyGroups,
};
