// =========================================================================
// validate.js — 契約遵守の最小チェッカ（仕様6章の最小実装）
//   生成された本文フラグメントが契約に従っているかを機械的に測る。
//   - 使用クラスが allowed_classes の範囲内か（枠侵食・新トークン検出）
//   - 使用タグが allowed_html_tags の範囲内か
//   - 属性が allowed_attributes の範囲内か（style / id を含む禁止属性の検出）
//   - 枠領域タグ（html/body/nav/header/footer等）が混入していないか
//   - タグの開閉が概ね整合しているか（最小の整形式チェック）
//
//   重要: 属性・class の検査は「実際の開始タグの内側」に限定する。これにより、
//   HTML を説明するコードブロック（エスケープ済みで &lt;div style=...&gt; 等を含む）を
//   違反と誤検出しない。正規表現ベースの近似であり完全なHTMLパーサではない。
// =========================================================================

"use strict";

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);
const FRAME_TAGS = ["html", "head", "body", "nav", "header", "footer", "main", "script", "style", "aside"];

// 開始タグを属性込みで切り出す。属性値は引用符付き（内部の > を許容）／無引用の双方に対応。
const START_TAG = /<([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const END_TAG = /<\/([a-zA-Z][\w-]*)\s*>/g;
// 開始タグ内の属性名（と値）を1つずつ取り出す。
const ATTR = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function validateFragment(html, contract) {
  const violations = [];
  const allowedClasses = new Set(contract.allowed_classes || []);
  const allowedTags = new Set(contract.allowed_html_tags || []);
  const allowedAttrs = new Set(contract.allowed_attributes || []);
  const usedClasses = new Set();
  const usedTags = new Set();

  // --- 開始タグを走査: タグ名・属性名・class値を「実タグ内」に限定して検査 ---
  for (const m of html.matchAll(START_TAG)) {
    const tag = m[1].toLowerCase();
    usedTags.add(tag);
    const attrStr = m[2] || "";
    for (const am of attrStr.matchAll(ATTR)) {
      const name = am[1].toLowerCase();
      const val = am[2] != null ? am[2] : am[3] != null ? am[3] : am[4];
      if (name === "style") violations.push({ rule: "style_attr", detail: `<${tag}> に style 属性` });
      else if (name === "id") violations.push({ rule: "id_attr", detail: `<${tag}> に id 属性` });
      else if (!allowedAttrs.has(name)) violations.push({ rule: "attr_not_allowed", detail: `許可外の属性: ${name}（<${tag}>）` });
      if (name === "class" && val != null) {
        for (const cls of val.split(/\s+/).filter(Boolean)) {
          usedClasses.add(cls);
          if (!allowedClasses.has(cls)) violations.push({ rule: "class_not_allowed", detail: `許可外のclass: "${cls}"` });
        }
      }
    }
  }
  for (const m of html.matchAll(END_TAG)) usedTags.add(m[1].toLowerCase());

  // --- タグ種別（許可外 / 枠侵食） ---
  for (const tag of usedTags) {
    if (FRAME_TAGS.includes(tag)) violations.push({ rule: "frame_leak", detail: `枠領域タグの混入: <${tag}>` });
    else if (!allowedTags.has(tag)) violations.push({ rule: "tag_not_allowed", detail: `許可外のタグ: <${tag}>` });
  }

  // --- タグ開閉の整合（最小の整形式チェック） ---
  const events = [];
  for (const m of html.matchAll(START_TAG)) events.push({ pos: m.index, closing: false, tag: m[1].toLowerCase(), self: m[3] === "/" });
  for (const m of html.matchAll(END_TAG)) events.push({ pos: m.index, closing: true, tag: m[1].toLowerCase() });
  events.sort((a, b) => a.pos - b.pos);
  const stack = [];
  for (const e of events) {
    if (!e.closing) {
      if (!VOID_TAGS.has(e.tag) && !e.self) stack.push(e.tag);
    } else if (stack.length === 0 || stack[stack.length - 1] !== e.tag) {
      violations.push({ rule: "tag_balance", detail: `閉じタグ </${e.tag}> が開きと整合しない` });
      const idx = stack.lastIndexOf(e.tag);
      if (idx >= 0) stack.length = idx;
    } else {
      stack.pop();
    }
  }
  if (stack.length > 0) violations.push({ rule: "tag_balance", detail: `閉じ忘れ: ${stack.join(", ")}` });

  // 同一違反の重複を畳む
  const seen = new Set();
  const uniq = violations.filter((v) => {
    const k = v.rule + "|" + v.detail;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { ok: uniq.length === 0, violations: uniq, stats: { used_classes: [...usedClasses], used_tags: [...usedTags] } };
}

module.exports = { validateFragment };

// ---- CLI ----
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const [fragPath, contractPath = path.join(__dirname, "..", "templates", "dev-docs-standard", "contract.json")] =
    process.argv.slice(2);
  if (!fragPath) {
    console.error("usage: node engine/validate.js <fragment.html> [contract.json]");
    process.exit(1);
  }
  const html = fs.readFileSync(fragPath, "utf8");
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const r = validateFragment(html, contract);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 2);
}
