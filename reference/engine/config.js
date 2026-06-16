// =========================================================================
// config.js — Ordito の配置解決（root 検出 / ordito.config.json / 同梱アセット）
//   engine と skills（lib/store.js 経由）の両方が使う、配置非依存化の単一ソース。
//   依存ゼロ（fs/path のみ）。
//
//   2種類の「基準」を厳密に分ける:
//     - ユーザーデータ（IR・出力・コレクション・独自テンプレ）の基準 = 導入先リポジトリの
//       root。process.cwd() から上方向に探す（ordito.config.json → なければ .git）。
//     - engine 同梱物（既定テンプレ・JSON Schema）の基準 = __dirname。engine が
//       どこに置かれても自分の同梱物を見つける（候補パス探索）。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");

const CONFIG_FILENAME = "ordito.config.json";
const DEFAULT_TEMPLATE_ID = "dev-docs-standard";

// ---- ユーザーデータの root（導入先リポジトリのルート） ----
function findUp(startDir, test) {
  let dir = path.resolve(startDir || ".");
  for (;;) {
    if (test(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
// 起点から上昇探索: ordito.config.json → 無ければ .git（file/dir 両対応=worktree 可）。
// env ORDITO_ROOT が最優先。見つからなければ起点を返す。
function findRepoRoot(startDir = process.cwd()) {
  if (process.env.ORDITO_ROOT) return path.resolve(process.env.ORDITO_ROOT);
  return (
    findUp(startDir, (d) => fs.existsSync(path.join(d, CONFIG_FILENAME))) ||
    findUp(startDir, (d) => fs.existsSync(path.join(d, ".git"))) ||
    path.resolve(startDir || ".")
  );
}

function loadConfig(root = findRepoRoot()) {
  const f = path.join(root, CONFIG_FILENAME);
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, "utf8")); }
  catch (e) { throw new Error(`${CONFIG_FILENAME} の解析に失敗 (${f}): ${e.message}`); }
}

// ---- engine 同梱アセット（config 非依存・__dirname 基準の候補探索） ----
function firstExisting(cands) {
  for (const c of cands) if (fs.existsSync(c)) return c;
  return cands[cands.length - 1]; // 既定（最後の候補）
}
// JSON Schema。Ordito リポジトリでは conformance/schemas、配布同梱では engine 隣接（lib/engine/schemas）。
function schemaFile() {
  return firstExisting([
    path.join(__dirname, "..", "..", "conformance", "schemas", "ordito.schema.json"),
    path.join(__dirname, "schemas", "ordito.schema.json"),
  ]);
}
// 同梱テンプレート群のディレクトリ。Ordito では reference/templates、配布同梱では engine 隣接（lib/engine/templates）。
function templatesDir() {
  return firstExisting([
    path.join(__dirname, "..", "templates"),
    path.join(__dirname, "templates"),
  ]);
}

// ---- テンプレート解決: { id } | { dir }（dir 優先）。dir は root 相対。 ----
function resolveTemplateDir(template, root) {
  if (template && template.dir) {
    return path.isAbsolute(template.dir) ? template.dir : path.join(root, template.dir);
  }
  const id = (template && template.id) || DEFAULT_TEMPLATE_ID;
  return path.join(templatesDir(), id);
}
function defaultContractPath() {
  return path.join(templatesDir(), DEFAULT_TEMPLATE_ID, "contract.json");
}

module.exports = {
  CONFIG_FILENAME, DEFAULT_TEMPLATE_ID,
  findRepoRoot, loadConfig,
  schemaFile, templatesDir, resolveTemplateDir, defaultContractPath,
};
