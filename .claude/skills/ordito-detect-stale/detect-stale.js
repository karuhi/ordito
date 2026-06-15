#!/usr/bin/env node
// =========================================================================
// ordito-detect-stale — 未反映ページ（updated_at > generated_at）を一覧（§3.4）
//   入力(JSON): { "ir_dir"?: "<dir>" }
//   出力(JSON): { ok, total, stale_count, stale: [{ id, file, updated_at, generated_at }] }
//   - generated_at が null（未生成）も未反映として含む。
//   - 読み出しのみ。AIエージェントが「反映（再生成）しますか？」の確認材料に使う。
// =========================================================================

"use strict";

const path = require("path");
const store = require("../lib/store");

function main() {
  const input = store.readInput();
  const irDir = input.ir_dir ? path.resolve(input.ir_dir) : store.defaultIrDir();

  const all = store.listIr(irDir);
  const stale = all
    .filter((e) => store.isStale(e.doc))
    .map((e) => {
      const m = e.doc.meta || {}; // meta 欠落でも落ちない
      return {
        id: e.doc.id,
        file: path.relative(store.repoRoot(), e.file),
        updated_at: m.updated_at || null,
        generated_at: m.generated_at || null,
      };
    });

  store.emit({
    ok: true,
    ir_dir: path.relative(store.repoRoot(), irDir),
    total: all.length,
    stale_count: stale.length,
    stale,
  });
}

try { main(); } catch (e) { store.fail("detect-stale 失敗: " + e.message); }
