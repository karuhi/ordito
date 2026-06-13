// =========================================================================
// render.js — 決定論レンダラ（生成レベル1: 構造流し込み）
//   IR ブロック → 契約のコンポーネントクラスを使ったHTMLへ機械的に変換する。
//   揺らぎゼロ。AIを使わずに常にオフラインで動く。AIモードのフォールバックも兼ねる。
//
//   設計上の割り切り（POC）: 本レンダラはクラス名（doc-h 等）をハードコードした参照実装であり、
//   contract.json を実行時入力としては読まない。契約との整合は、生成時に generate.js が
//   全出力へ validateFragment(html, contract) を適用するゲートで担保する。契約駆動の動的
//   レンダリング（contract.components から class を引く）は将来課題。詳細は docs/findings.md。
// =========================================================================

"use strict";

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 段落・リスト項目などのインライン記法を変換する。
//   `code`            -> <code class="doc-ic">
//   [label](href)     -> <a class="doc-link" href="...">
//   **bold**          -> <strong>
// 手順: (1)コードスパンを退避（中で link/bold を走らせない） (2)リンクを raw のまま退避し
// href は raw 値で解決する (3)残りを一度だけエスケープ (4)退避分を復元（各々を個別にエスケープ）。
// これにより href の二重エスケープや、コードスパン内の記号誤変換を防ぐ。
// 制約: href に ')' を含む URL は非対応（POC。findings.md に記載）。
const NUL = "\u0000"; // 退避プレースホルダ（通常テキストに現れず、escapeHtmlで不変）
function inline(text, ctx) {
  // 不正IR対策: オブジェクト/配列は [object Object] ではなく JSON 文字列にして可視化する。
  const src = typeof text === "object" && text !== null ? JSON.stringify(text) : String(text == null ? "" : text);
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return `${NUL}C${codes.length - 1}${NUL}`;
  });
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    links.push({ label, href });
    return `${NUL}L${links.length - 1}${NUL}`;
  });
  s = escapeHtml(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(new RegExp(NUL + "C(\\d+)" + NUL, "g"), (_m, i) => `<code class="doc-ic">${escapeHtml(codes[i])}</code>`);
  s = s.replace(new RegExp(NUL + "L(\\d+)" + NUL, "g"), (_m, i) => {
    const { label, href } = links[i];
    const resolved = ctx.resolveHref ? ctx.resolveHref(href) : href;
    return `<a class="doc-link" href="${escapeHtml(resolved)}">${escapeHtml(label)}</a>`;
  });
  return s;
}

function headingLevel(level) {
  const n = Number(level) || 1;
  return Math.min(Math.max(n, 1), 4); // h1〜h4 にクランプ
}

const NOTE_LABEL = { info: "INFO", warning: "WARNING", danger: "DANGER" };

// 1ブロックをHTML文字列へ。未知 type は仕様3.3の指針に従いフォールバック描画する。
function renderBlock(block, ctx) {
  switch (block.type) {
    case "heading": {
      const l = headingLevel(block.level);
      return `<h${l} class="doc-h">${escapeHtml(block.text)}</h${l}>`;
    }
    case "paragraph":
      return `<p class="doc-p">${inline(block.text, ctx)}</p>`;

    case "inline_code":
      return `<p class="doc-p"><code class="doc-ic">${escapeHtml(block.text)}</code></p>`;

    case "link": {
      const href = ctx.resolveHref ? ctx.resolveHref(block.href) : block.href;
      return `<a class="doc-link is-standalone" href="${escapeHtml(href)}">${escapeHtml(block.text)}</a>`;
    }

    case "code": {
      const name = block.filename
        ? `<span class="doc-code__name">${escapeHtml(block.filename)}</span>`
        : "";
      const lang = block.lang ? ` data-lang="${escapeHtml(block.lang)}"` : "";
      return `<div class="doc-code"${lang}>${name}<pre><code>${escapeHtml(block.text)}</code></pre></div>`;
    }

    case "params": {
      const rows = (block.items || []).map((p) => {
        const req = p.required
          ? '<span class="doc-params__req">必須</span>'
          : '<span class="doc-params__opt">任意</span>';
        const def = p.default != null ? `（既定: <code class="doc-ic">${escapeHtml(p.default)}</code>）` : "";
        return `<tr><td class="doc-params__name">${escapeHtml(p.name)}</td>` +
          `<td><code class="doc-ic">${escapeHtml(p.type)}</code></td>` +
          `<td>${req}</td>` +
          `<td>${inline(p.desc || "", ctx)}${def}</td></tr>`;
      }).join("");
      return `<table class="doc-params"><thead><tr>` +
        `<th>名前</th><th>型</th><th>必須</th><th>説明</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`;
    }

    case "table": {
      const head = (block.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join("");
      const body = (block.rows || []).map((row) =>
        `<tr>${row.map((c) => `<td>${inline(c, ctx)}</td>`).join("")}</tr>`).join("");
      return `<table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }

    case "note": {
      const variant = NOTE_LABEL[block.variant] ? block.variant : "info";
      return `<div class="doc-note doc-note--${variant}">` +
        `<span class="doc-note__label">${NOTE_LABEL[variant]}</span>${inline(block.text, ctx)}</div>`;
    }

    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = (block.items || []).map((it) => `<li>${inline(it, ctx)}</li>`).join("");
      return `<${tag} class="doc-list">${items}</${tag}>`;
    }

    case "steps": {
      const items = (block.items || []).map((it) => {
        if (typeof it === "string") return `<li>${inline(it, ctx)}</li>`;
        const title = it.title ? `<span class="doc-steps__title">${escapeHtml(it.title)}</span>` : "";
        return `<li>${title}${inline(it.text || "", ctx)}</li>`;
      }).join("");
      return `<ol class="doc-steps">${items}</ol>`;
    }

    case "tabs": {
      const tabs = (block.tabs || []).map((t) => {
        const panel = renderBlocks(t.blocks || [], ctx); // 入れ子はコンポーネントを再帰描画
        return `<div class="doc-tabs__tab"><span class="doc-tabs__label">${escapeHtml(t.label)}</span>` +
          `<div class="doc-tabs__panel">${panel}</div></div>`;
      }).join("");
      return `<div class="doc-tabs">${tabs}</div>`;
    }

    default:
      // 仕様3.3: 未知 type は無視せずフォールバック描画する SHOULD。
      return `<div class="doc-note doc-note--warning">` +
        `<span class="doc-note__label">WARNING</span>` +
        `未対応のブロック型「${escapeHtml(block.type)}」（id: ${escapeHtml(block.id)}）。` +
        `テンプレート契約のコンポーネントにマップできませんでした。</div>`;
  }
}

function renderBlocks(blocks, ctx) {
  return (blocks || []).map((b) => renderBlock(b, ctx)).join("\n");
}

module.exports = { renderBlock, renderBlocks, inline, escapeHtml };
