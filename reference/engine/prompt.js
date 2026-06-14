// =========================================================================
// prompt.js — 生成レベル2（コンテンツエリア生成）のプロンプトビルダー
//   仕様の「契約は JSON で AIに渡す MUST」を文字通り実践する。
//   同一の contract.json + IR(JSON) に対し、指示の枠組み（戦略）だけを変えて
//   契約遵守度を比較できるようにする。これが最も重要な検証点。
//
//   CLI:  node reference/engine/prompt.js <ir.json> [strategy] [contract.json]
//         strategy ∈ rules | schema | example | minimal （既定: rules）
// =========================================================================

"use strict";

const fs = require("fs");
const path = require("path");
const { renderBlock } = require("./render");

const DEFAULT_CONTRACT = path.join(__dirname, "..", "templates", "dev-docs-standard", "contract.json");

// 全戦略で共通の「契約の要約ルール」。constraints から機械的に導出する。
function hardRules(contract) {
  const c = contract.constraints || {};
  const classes = (contract.allowed_classes || []).join(", ");
  const tags = (contract.allowed_html_tags || []).join(", ");
  const attrs = (contract.allowed_attributes || []).join(", ");
  return [
    `出力は content_slot（${contract.content_slot}）の内側に入る本文フラグメントのHTMLのみ。<html>/<head>/<body> やナビ・ヘッダー・フッターは出力しない（MUST NOT）。`,
    `class 属性には次の allowed_classes 以外を使わない（新クラスの発明は禁止）: ${classes}`,
    `次の allowed_html_tags 以外のタグを使わない: ${tags}`,
    `属性は ${attrs} のみ使用可。style 属性・id 属性は禁止（MUST NOT）。`,
    `新しいデザイントークン（独自の色・フォント・余白）の発明は禁止（MUST NOT）。見た目はテンプレートのCSSに委ねる。`,
    c.must_render_all_blocks ? `IR の blocks をすべて、出現順（preserve_block_order）に描画する。欠落・並べ替え禁止。` : null,
    `各ブロックは components 定義の "for" → "class" / "render_hint" に従ってマップする。`,
  ].filter(Boolean);
}

const TASK = "あなたは Ordito の生成エンジンのレベル2（コンテンツエリア生成）です。与えられた IR ドキュメントを、テンプレート契約に厳密に従って、本文領域のHTMLフラグメントに変換してください。";

function fence(label, obj) {
  return `### ${label}\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``;
}

const OUTPUT_NOTE =
  "出力は #doc-body の内側に入れるHTMLフラグメントだけ。前後に説明文やコードフェンス（```）を付けない。";

function buildPrompt({ contract, doc, strategy = "rules" }) {
  const rules = hardRules(contract);

  switch (strategy) {
    // (1) ルール先行型: MUST/MUST NOT を明示列挙してから契約とIRを渡す。
    case "rules":
      return [
        TASK,
        "## 守るべきルール（MUST / MUST NOT）",
        rules.map((r, i) => `${i + 1}. ${r}`).join("\n"),
        "## テンプレート契約",
        fence("contract.json", contract),
        "## 入力 IR ドキュメント",
        fence("ir.json", doc),
        "## 出力",
        OUTPUT_NOTE,
      ].join("\n\n");

    // (2) 許可リスト=スキーマ型: 「使ってよいものの表」を主役にし、それ以外は禁止と強調。
    case "schema": {
      const table = (contract.components || []).map((c) => {
        const v = c.variants ? `（variant: ${c.variants.join("/")}）` : "";
        const sub = c.sub_classes ? ` + ${c.sub_classes.join(", ")}` : "";
        return `| ${c.for} | \`${c.class}\`${sub}${v} | ${c.render_hint || c.element_hint || ""} |`;
      }).join("\n");
      return [
        TASK,
        "あなたが使えるのは次の許可リストに載っているものだけです。リスト外の class・タグ・属性・色・余白は一切使えません。",
        "## 使用可能なコンポーネント（これ以外のclassは禁止）",
        "| ブロック型 | 使用クラス | 期待するHTML構造 |\n|---|---|---|\n" + table,
        `## 許可タグ\n${(contract.allowed_html_tags || []).join(", ")}`,
        `## 許可属性\n${(contract.allowed_attributes || []).join(", ")}（style/id は禁止）`,
        "## 入力 IR ドキュメント",
        fence("ir.json", doc),
        "## 出力",
        `${contract.content_slot} の内側に入る本文フラグメントのHTMLのみ。${OUTPUT_NOTE}`,
      ].join("\n\n");
    }

    // (3) 例示駆動型: 1ブロックの正解HTMLを見せてから残りを依頼する。
    case "example": {
      const sample = (doc.blocks || [])[0] || { id: "x", type: "heading", level: 2, text: "例" };
      // 例示は実際の決定論レンダラで生成する → 契約準拠・エスケープ済み・型整合が保証される。
      const exampleHtml = renderBlock(sample, { resolveHref: (h) => h });
      return [
        TASK,
        "次の対応例にならって、IR の全ブロックを同じ要領で変換してください。例と同じく、契約の class / タグだけを使います。",
        "## 対応例（1ブロック）",
        "入力:\n```json\n" + JSON.stringify(sample, null, 2) + "\n```",
        "出力:\n```html\n" + exampleHtml + "\n```",
        "## テンプレート契約（使える class / タグの定義）",
        fence("contract.json", contract),
        "## 変換対象の IR ドキュメント全体",
        fence("ir.json", doc),
        "## 出力",
        OUTPUT_NOTE,
      ].join("\n\n");
    }

    // (4) 最小型: 足場を与えず契約とIRだけ渡す（ベースライン。足場の効果を測るため）。
    case "minimal":
      return [
        "次のテンプレート契約に従って、IRドキュメントを本文HTMLフラグメントに変換してください。",
        fence("contract.json", contract),
        fence("ir.json", doc),
        OUTPUT_NOTE,
      ].join("\n\n");

    default:
      throw new Error(`unknown strategy: ${strategy}`);
  }
}

module.exports = { buildPrompt, hardRules, STRATEGIES: ["rules", "schema", "example", "minimal"] };

// ---- CLI: プロンプトを標準出力に表示（コピーして検証できるように） ----
if (require.main === module) {
  const [irPath, strategy = "rules", contractPath = DEFAULT_CONTRACT] = process.argv.slice(2);
  if (!irPath) {
    console.error("usage: node reference/engine/prompt.js <ir.json> [strategy] [contract.json]");
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  process.stdout.write(buildPrompt({ contract, doc, strategy }) + "\n");
}
