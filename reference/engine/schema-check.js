// =========================================================================
// schema-check.js — IR / コレクションを JSON Schema で検証する最小バリデータ
//   conformance/schemas/ordito.schema.json の $defs（document / collection / block …）を
//   エントリポイントに使う。依存ゼロのため、規格で用いる構文の部分集合のみ実装:
//     type（配列可）/ required / properties / additionalProperties:false /
//     items / enum / const / minimum / maximum / oneOf / $ref(ローカル #/...)
//   ※ 依存ゼロの最小実装。完全な JSON Schema 準拠ではない（限界は本コメント参照）。
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const SCHEMA_FILE = path.join(__dirname, "..", "..", "conformance", "schemas", "ordito.schema.json");

function resolveRef(ref, root) {
  // "#/$defs/blocks/heading" → root.$defs.blocks.heading
  const parts = ref.replace(/^#\//, "").split("/");
  let cur = root;
  for (const p of parts) cur = cur && cur[p.replace(/~1/g, "/").replace(/~0/g, "~")];
  if (!cur) throw new Error(`$ref を解決できません: ${ref}`);
  return cur;
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // "string" | "number" | "boolean" | "object"
}

function matchType(v, t) {
  if (t === "integer") return typeof v === "number" && Number.isInteger(v);
  if (t === "number") return typeof v === "number";
  return typeOf(v) === t;
}

function validate(data, schema, root, p, errors) {
  if (schema.$ref) return validate(data, resolveRef(schema.$ref, root), root, p, errors);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchType(data, t))) {
      errors.push(`${p}: 型が ${types.join("|")} でない（実際: ${typeOf(data)}）`);
      return; // 型不一致ならこれ以上見ない
    }
  }
  if ("const" in schema && data !== schema.const) errors.push(`${p}: const ${JSON.stringify(schema.const)} と不一致（${JSON.stringify(data)}）`);
  if (schema.enum && !schema.enum.includes(data)) errors.push(`${p}: enum ${JSON.stringify(schema.enum)} に無い（${JSON.stringify(data)}）`);
  if (typeof data === "number") {
    if (schema.minimum != null && data < schema.minimum) errors.push(`${p}: ${data} < minimum ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) errors.push(`${p}: ${data} > maximum ${schema.maximum}`);
  }

  if (typeOf(data) === "object" && (schema.properties || schema.required || schema.additionalProperties === false)) {
    for (const req of schema.required || []) if (!(req in data)) errors.push(`${p}: 必須プロパティ "${req}" がない`);
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(data)) if (!(k in props)) errors.push(`${p}: 許可外のプロパティ "${k}"`);
    }
    for (const [k, sub] of Object.entries(props)) if (k in data) validate(data[k], sub, root, `${p}.${k}`, errors);
  }

  if (typeOf(data) === "array" && schema.items) {
    data.forEach((el, i) => validate(el, schema.items, root, `${p}[${i}]`, errors));
  }

  if (schema.oneOf) {
    const branchErrs = schema.oneOf.map((s) => { const e = []; validate(data, s, root, p, e); return e; });
    const passed = branchErrs.filter((e) => e.length === 0).length;
    if (passed === 0) {
      // 最も近い分岐（エラー最少＝多くは type が一致した分岐）の詳細を示す
      const best = branchErrs.reduce((a, b) => (b.length < a.length ? b : a));
      errors.push(`${p}: どの分岐にも適合しない。最も近い候補: ${best.join(" / ")}`);
    } else if (passed > 1) {
      errors.push(`${p}: oneOf が ${passed} 件に一致（曖昧。1件であるべき）`);
    }
  }
}

function loadSchema() { return JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8")); }

// data を $defs/<defName> で検証。errors 配列を返す（空なら合格）。
function validateAgainst(data, defName, root = loadSchema()) {
  const schema = root.$defs[defName];
  if (!schema) throw new Error(`$defs/${defName} が見つかりません`);
  const errors = [];
  validate(data, schema, root, defName, errors);
  return errors;
}

module.exports = { validateAgainst, loadSchema };

// ---- CLI: node reference/engine/schema-check.js <file.json> <document|collection|block> ----
if (require.main === module) {
  const [file, defName = "document"] = process.argv.slice(2);
  if (!file) { console.error("usage: node reference/engine/schema-check.js <file.json> [document|collection|block]"); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = validateAgainst(data, defName);
  if (errors.length === 0) { console.log(`OK: ${file} は $defs/${defName} に適合`); process.exit(0); }
  console.log(`NG: ${file} に ${errors.length} 件の不適合:`);
  for (const e of errors) console.log("  - " + e);
  process.exit(2);
}
