// =========================================================================
// collection.js — コレクション（サイトマップ, §3.5）の読み込みとナビ生成
//
//   コレクションが所有: ナビの「項目・順序・グループ」（本モジュールが解釈）
//   テンプレートが所有: ナビの「描画構造・スタイル」（CSS のクラスに従う）
//   生成エンジンが合成: 現在ページに aria-current を付与、リンクを相対パス化
//
//   nav 項目は2種（多階層グループを許容・再帰）:
//     { "doc": "<id>", "order"?: n, "label"?: "..." }
//     { "group": "見出し", "order"?: n, "items": [ navItem, ... ] }
// =========================================================================

"use strict";

const { relHref } = require("./paths");

function escapeAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

// order があれば昇順、無ければ元の並びを保つ（安定ソート）。
function ordered(items) {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const oa = a.it.order != null ? a.it.order : a.i + 1e6;
      const ob = b.it.order != null ? b.it.order : b.i + 1e6;
      return oa - ob || a.i - b.i;
    })
    .map((x) => x.it);
}

// nav を辿って所属 doc id を出現順にフラット化する。
function collectDocIds(nav) {
  const out = [];
  for (const item of ordered(nav || [])) {
    if (item.doc) out.push(item.doc);
    else if (item.items) out.push(...collectDocIds(item.items));
  }
  return out;
}

// ナビ HTML を構築する。currentId に aria-current、リンクは currentId からの相対パス。
//   titleOf(id) -> 表示名（コレクションの label 優先、無ければ IR の meta.title）
function buildNavHtml(nav, { currentId, titleOf }) {
  const render = (items, depth) => {
    const lis = ordered(items).map((item) => {
      if (item.doc) {
        const href = relHref(currentId, item.doc);
        const cur = item.doc === currentId ? ' aria-current="page"' : "";
        const label = item.label || titleOf(item.doc) || item.doc;
        return `<li><a href="${escapeAttr(href)}"${cur}>${escapeAttr(label)}</a></li>`;
      }
      if (item.group) {
        const inner = render(item.items || [], depth + 1);
        return `<li class="site-nav__group">` +
          `<span class="site-nav__group-title">${escapeAttr(item.group)}</span>` +
          `<ul class="site-nav__list">${inner}</ul></li>`;
      }
      return ""; // doc でも group でもない不正項目はスキップ
    });
    return lis.join("");
  };
  return render(nav || [], 0);
}

module.exports = { collectDocIds, buildNavHtml, ordered };
