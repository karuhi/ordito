// =========================================================================
// paths.js — doc id（論理パス）⇔ 出力物理パス、内部リンク解決（§3.3.2 / §10(d)）
//
//   決め打ち(d): doc id の階層を保ったまま物理パスにする。
//     "guides/quickstart"      -> "guides/quickstart.html"
//     "reference/rate-limits"  -> "reference/rate-limits.html"
//   利点: 論理構造がそのまま出力構成に反映され、id とパスの対応が自明。
//   代償: ページ間リンクは深さが異なるため相対パス計算が要る（本モジュールが担う）。
//   ※ 末尾セグメントのみ（フラット）方式は slug 衝突を起こすため v0.3 では階層保持を採る。
// =========================================================================

"use strict";

const path = require("path");

// 外部参照か（スキーム付き URL / プロトコル相対 / アンカー / mailto 等）。
function isExternal(href) {
  return /^([a-z][a-z0-9+.\-]*:|\/\/|#)/i.test(String(href || ""));
}

// doc id -> サイトルートからの相対出力パス（posix）。
function outPath(id) {
  return String(id).replace(/^\/+/, "") + ".html";
}

// fromId のページから toId のページへの相対リンク（file:// で機能する）。
function relHref(fromId, toId) {
  const fromDir = path.posix.dirname(outPath(fromId));
  const target = outPath(toId);
  const rel = path.posix.relative(fromDir, target);
  return rel === "" ? path.posix.basename(target) : rel;
}

// 内部参照(doc id)は物理相対パスへ、外部はそのまま。未知の内部参照は null フラグで返す。
//   knownIds: Set<docId>
function resolveHref(fromId, href, knownIds) {
  const h = String(href || "");
  if (isExternal(h)) return { href: h, kind: "external" };
  const id = h.replace(/^\/+/, "");
  if (knownIds.has(id)) return { href: relHref(fromId, id), kind: "internal" };
  // スキーム無し かつ 既知 id でない → 未解決の内部参照（検証で警告対象）。
  return { href: h, kind: "unresolved" };
}

module.exports = { isExternal, outPath, relHref, resolveHref };
