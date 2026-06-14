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

// --- field_map 網羅チェック（§4.4）: IR ブロックの各意味フィールドが契約に行き先を持つか ---
// 構造キー（items/rows/tabs 等のコンテナ）ではなく、表示される意味フィールドを対象にする。

// 構造キー（id/type、および item コンテナの行き先になる items/tabs）は field_map の対象外。
const STRUCT_KEYS = new Set(["id", "type"]);
function ownFields(obj) {
  return Object.keys(obj).filter((k) => !STRUCT_KEYS.has(k));
}
function unionItemKeys(items) {
  const s = new Set();
  for (const it of items || []) {
    if (it && typeof it === "object" && !Array.isArray(it)) for (const k of Object.keys(it)) s.add(k);
    else if (typeof it === "string") s.add("text"); // steps の文字列略記
  }
  return [...s];
}

// ブロック型ごとに「マップされるべき意味フィールド」を、IR の**実キー**から動的に導出する。
// 固定リストではなく実体駆動なので、契約 field_map に無い**未知フィールド**の脱落も検出できる（§4.4）。
function mappableFields(block) {
  switch (block.type) {
    case "params": return unionItemKeys(block.items); // items 各要素のキー（name/type/required/desc/default/…）
    case "steps": return unionItemKeys(block.items);  // {title?,text} または文字列
    case "tabs": return unionItemKeys(block.tabs);    // {label, blocks}
    default: return ownFields(block);                  // heading/paragraph/code/table/note/list/link 等は自身のキー
  }
}

function eachBlock(blocks, fn) {
  for (const b of blocks || []) {
    fn(b);
    if (b.type === "tabs") for (const t of b.tabs || []) eachBlock(t.blocks, fn);
  }
}

// 未マップフィールドを警告として返す。field_map にキーが在れば（値が何であれ）マップ済み扱い。
// "OMIT" は「意図的に非表示」を人間に示す慣習値で、機械的な特別扱いはしない（値は検査しない）。
function validateFieldMap(doc, contract) {
  const compByType = new Map((contract.components || []).map((c) => [c.for, c]));
  const warnings = [];
  eachBlock(doc.blocks, (b) => {
    const comp = compByType.get(b.type);
    if (!comp) {
      warnings.push({ rule: "unknown_type", detail: `未知のブロック型: ${b.type}（id: ${b.id}）` });
      return;
    }
    const fm = comp.field_map || {};
    for (const f of mappableFields(b)) {
      if (!(f in fm)) {
        warnings.push({ rule: "unmapped_field", detail: `${b.type}.${f} が field_map に未定義（id: ${b.id}）` });
      }
    }
  });
  return { ok: warnings.length === 0, warnings };
}

// --- 意味チェック（§6.2）の最小・決定論版: IR の素テキストが出力に現れるか ---
// LLM を使わず、各ブロックの素テキスト断片が出力フラグメント（タグ除去・実体復元後）に
// 出現するかを照合する。AI/混在経路での「沈黙脱落」を安価に検出する（捏造・並べ替えは対象外）。

function deTag(html) {
  return String(html)
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
const norm = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();
// インライン記法を剥がす（paragraph 等。記法変換後の素テキストと突き合わせるため）。
const stripInline = (t) => norm(String(t == null ? "" : t)
  .replace(/`([^`]+)`/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/\*\*([^*]+)\*\*/g, "$1"));

function fidelityProbes(block) {
  const out = [];
  const pushText = (t) => { const s = stripInline(t); if (s.length >= 4) out.push(s); }; // インライン記法を含むテキスト
  const pushRaw = (t) => { const s = norm(t); if (s.length >= 4) out.push(s); };          // verbatim（code/識別子）
  switch (block.type) {
    case "heading": case "paragraph": case "note": pushText(block.text); break;
    case "code": pushRaw(block.text); if (block.filename) pushRaw(block.filename); break; // コードは逐語
    case "link": pushText(block.text); break;
    case "list": (block.items || []).forEach(pushText); break;
    case "steps": (block.items || []).forEach((it) => {
      if (typeof it === "string") pushText(it);
      else { if (it.title) pushText(it.title); pushText(it.text); } // title/text は別々に（結合で余計な空白を入れない）
    }); break;
    case "params": (block.items || []).forEach((p) => { pushRaw(p.name); pushText(p.desc); }); break;
    case "table": (block.headers || []).forEach(pushText); (block.rows || []).forEach((r) => r.forEach(pushText)); break;
    case "tabs": (block.tabs || []).forEach((t) => pushText(t.label)); break;
  }
  return out;
}
function validateFidelity(doc, html) {
  const hay = deTag(html);
  const warnings = [];
  eachBlock(doc.blocks, (b) => {
    for (const probe of fidelityProbes(b)) {
      if (!hay.includes(probe)) {
        const snippet = probe.length > 30 ? probe.slice(0, 30) + "…" : probe;
        warnings.push({ rule: "fidelity_missing", detail: `出力に未反映の可能性: ${b.type}#${b.id} 「${snippet}」` });
        break; // 1ブロック1件に留める
      }
    }
  });
  return { ok: warnings.length === 0, warnings };
}

module.exports = { validateFragment, validateFieldMap, validateFidelity };

// ---- CLI ----
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const [fragPath, contractPath = path.join(__dirname, "..", "templates", "dev-docs-standard", "contract.json")] =
    process.argv.slice(2);
  if (!fragPath) {
    console.error("usage: node reference/engine/validate.js <fragment.html> [contract.json]");
    process.exit(1);
  }
  const html = fs.readFileSync(fragPath, "utf8");
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const r = validateFragment(html, contract);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 2);
}
