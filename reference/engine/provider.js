// =========================================================================
// provider.js — レベル2生成のためのLLMプロバイダ
//   (a) ANTHROPIC_API_KEY があれば Messages API を fetch で叩く（依存ゼロ）。
//   (b) 無ければ、事前生成したAI出力の断片（JSON: {html}）を読み込む。
//       この (b) を主経路にし、断片は Workflow のサブエージェント
//       （＝実際の Claude モデル）が契約に従って生成したものを使う。
// =========================================================================

"use strict";

const fs = require("fs");

// 余計なマークダウンフェンスを取り除く。ただし「全体が単一のフェンスブロック」の場合のみ。
// 本文中に出現するフェンス（コード例など）を誤って剥がして本文を切り落とさないようにする。
function stripFences(text) {
  const t = String(text).trim();
  // 全体が ```...``` で始まり終わる単一ブロックのときだけ中身を取り出す。
  const whole = t.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  if (whole) return whole[1].trim();
  return t;
}

async function generateViaAnthropic(prompt, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 未設定");
  const model = opts.model || process.env.ORDITO_MODEL || "claude-sonnet-4-6";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return stripFences(text);
}

// Workflow等で生成したAI断片を読む。JSON {html} か、生のHTMLファイルを許容。
function loadCachedFragment(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    const obj = JSON.parse(raw);
    if (obj.html == null) throw new Error(`${filePath}: JSON に "html" フィールドがありません`);
    return stripFences(obj.html);
  }
  return stripFences(raw);
}

module.exports = { generateViaAnthropic, loadCachedFragment, stripFences };
