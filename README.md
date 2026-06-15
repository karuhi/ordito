<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/ordito-mark-dark.png">
    <img src="assets/ordito-mark.png" alt="Ordito" width="150">
  </picture>
</p>

<h1 align="center">Ordito</h1>

<p align="center">
  <strong>String the structure (the IR <em>warp</em>) first — then let AI weave the prose on top.<br>An open spec, with a zero-dependency reference implementation, for documentation that AI <em>generates and updates</em>.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge"></a>
  <a href="spec/ordito-spec.md"><img alt="Spec: v1.0" src="https://img.shields.io/badge/spec-v1.0-blue?style=for-the-badge"></a>
  <a href="https://karuhi.github.io/ordito/"><img alt="Live demo" src="https://img.shields.io/badge/demo-live-brightgreen?style=for-the-badge"></a>
  <img alt="Node.js v18+" src="https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="Dependencies: zero" src="https://img.shields.io/badge/dependencies-zero-success?style=for-the-badge">
  <img alt="Conformance: passing" src="https://img.shields.io/badge/conformance-passing-success?style=for-the-badge">
</p>

<p align="center">
  🇬🇧 English · 🇯🇵 <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#-why">Why</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-quickstart">Quickstart</a> ·
  <a href="#-skills">Skills</a> ·
  <a href="#-repo-layout">Repo layout</a> ·
  <a href="#-spec--reference">Spec ↔ Reference</a> ·
  <a href="#-status">Status</a>
</p>

> The name is the Italian *ordito* / *orditura* — the **warp**, the threads a weaver strings on the loom *before* weaving. Ordito strings the structure (the IR) first; the AI weaves the prose on top.

---

## 🤔 Why

Traditional static-site generators (Docusaurus & friends) fuse three concerns into one: **content, presentation, and build**. Change the look and you end up touching the content. Let an AI help and it rewrites your Markdown wholesale — quietly dropping details in the process.

Ordito pulls them apart:

- 📦 **Content** is an **IR** (Intermediate Representation) — structured JSON, independent of presentation. It contains **no HTML**.
- 🎨 **The frame** is owned by a **template** — layout, design tokens, component CSS. Fixed, not AI-authored.
- 🧵 An **engine** composes the two, and the AI weaves the body HTML **strictly within a template contract**.

**The result:** the AI's freedom is confined to *content and structure*, so pages stay visually consistent **and the source data never silently drifts.**

---

## 🧶 How it works

Three principles carry the whole design:

- **Constrained variation.** The frame (layout, tokens) is fixed; inside it, the AI's output is allowed to vary. But **variation is not data loss** — losing a field from the IR is a bug, not a style choice. How much variation you allow is a dial: the precision of the contract's `render_hint`.
- **Update / generate split.** Editing the IR (cheap, frequent) and generating HTML (heavy, explicit) are **separate steps**. A write never triggers a build. This is exactly what powers the *"record it? → reflect it?"* two-stage confirmation UX.
- **All JSON, all skills.** IR, template contract, and collection are exchanged as JSON. Every extension is a **skill** that either *writes to* or *reads from* the store.

<details>
<summary>The line between "allowed variation" and "data loss" (and why it matters)</summary>

Early in development, a `default` value present in the IR (`expires_in = 3600`) was **silently dropped** from the AI output — and the class-only validator passed it, because the classes were fine. That is *data loss*, not constrained variation. Ordito's answer is `field_map`: the contract must map **every** field of a block to a destination, and the validator flags any IR field that isn't mapped. Display-nothing is allowed — but it must be declared (`"OMIT"`), never implicit.

See [`spec/ordito-spec.md` §4.4](spec/ordito-spec.md).
</details>

---

## 🚀 Quickstart

**Requirements: Node.js v18+ only.** No dependencies, no build step.

```bash
# 1) Generate a multi-page doc site — deterministic mode: no AI, always works
node reference/engine/generate.js --collection samples/collection.json --out site
open site/index.html            # macOS (Linux: xdg-open)

# 2) Validate IR / collection against the JSON Schema
node reference/engine/schema-check.js samples/ir/guides/quickstart.json document
node reference/engine/schema-check.js samples/collection.json collection

# 3) Run the conformance suite
node conformance/run.js          # JSON Schema + golden output + machine checks
```

You get a set of interlinked HTML pages under `site/`, with navigation and the doc-id hierarchy preserved.

> 💡 See it live: **<https://karuhi.github.io/ordito/>** (GitHub Pages, served from `samples/site/`). A pre-built copy is also committed at [`samples/site/`](samples/site/), so the output is visible in the repo without running anything.

<details>
<summary>Mixed generation: structured blocks deterministic, prose by AI (level 2)</summary>

```bash
node reference/engine/generate.js --collection samples/collection.json --out site \
     --mode mixed --ai-cache site/ai-fragments
```

In mixed mode, structured blocks (`params`, `table`, `steps`, …) render deterministically, while prose blocks reuse pre-generated AI fragments (`.l2.json`) from `--ai-cache`. A prose block with no cached fragment falls back to deterministic — so **it always produces output.** (Live Anthropic API calls happen only in `--mode ai`, which generates the whole content area; mixed mode reads the cache.)
</details>

---

## 🔁 Skills

Atomic skills (under [`.claude/skills/`](.claude/skills/)) let an AI agent run the **update / generate split** and compose the two-stage confirmation itself:

| Skill | Kind | Does | Generates? |
|-------|------|------|------------|
| `ordito-update-block` | write | Diff-update one IR block, bump `updated_at` | **no** (spec §5.4) |
| `ordito-detect-stale` | read | List pages where `updated_at > generated_at` | no |
| `ordito-generate` | read | Explicitly (re)generate — all pages, by id, or only stale | yes (explicit only) |
| `ordito-validate` | check | JSON Schema + `field_map` coverage + output checks | no |

The skills never prompt for confirmation — **the agent does**. `update` and `generate` are deliberately *different* skills; that boundary *is* the "a write never triggers a build" rule. Each skill has a `SKILL.md` describing its trigger and I/O under [`.claude/skills/`](.claude/skills/).

**The two-stage flow** — *"record it? → reflect it?"* — is something the agent composes from these atomic skills:

```text
🧑 "Add a note about rate limits to the quickstart."
🤖 Record this into the docs IR?                      ← the agent asks (stage 1)
🧑 Yes
   ▸ ordito-update-block      → { changed: true, generated: false }   (writes one block; no build)
   ▸ ordito-detect-stale      → { stale: ["guides/quickstart"] }
🤖 1 page is now unreflected. Regenerate it?          ← the agent asks (stage 2)
🧑 Yes
   ▸ ordito-generate {only:"stale"} → rebuilds just that page, stamps generated_at
   ▸ ordito-validate          → schema + field_map + output checks all pass
```

Both questions are the **agent's**; the skills only execute and return JSON. That's the "update / generate split" surfaced as UX — and why a write never silently triggers a heavy rebuild.

---

## 📦 Adopt in your repo (config-driven)

Ordito reads a single **`ordito.config.json`** at your repo root, so engine/skill paths aren't hardcoded — drop it into a monorepo and just declare where things live:

```json
{
  "irDir": "docs/ir",
  "out": "docs/site",
  "collection": "docs/collection.json",
  "template": { "id": "dev-docs-standard" },
  "mode": "deterministic"
}
```

- **Root detection**: the working directory walks up to the nearest `ordito.config.json` (or `.git`). Resolution order is **call args > `ordito.config.json` > built-in defaults** — so day-to-day calls take near-empty input, e.g. `echo '{"only":"stale"}' | node "${CLAUDE_SKILL_DIR}/generate.js"`.
- **Templates**: pick via `template` (`{ "id": "<bundled>" }` or `{ "dir": "<repo-relative>" }`) or the engine's `--template-id` / `--template-dir`.
- **Using the skills in another repo**: copy `.claude/skills/` and bundle the engine alongside (`.claude/skills/lib/engine/` with its `templates/` and `schemas/`). The skills resolve the engine from a single point, so no `reference/` tree is required at the destination.

---

## 📁 Repo layout

```
ordito/
├── spec/                      # NORMATIVE — the spec. Reads standalone, independent of any impl.
│   ├── ordito-spec.md         #   the normative spec (v1.0)
│   └── history/               #   older versions
├── reference/                 # INFORMATIVE — one reference implementation (replaceable)
│   ├── engine/                #   generation engine (Node.js, zero deps)
│   └── templates/             #   default template (frame + contract JSON)
├── conformance/               # CONFORMANCE — test your own implementation
│   ├── schemas/               #   JSON Schema for IR & collection (machine-readable vocabulary)
│   ├── cases/                 #   sample IR -> expected output (golden)
│   └── run.js                 #   conformance runner
├── samples/                   # sample IR + collection (input) + site/ (pre-built output, committed)
├── ordito.config.json         # project config (irDir/out/collection/template), read from repo root
├── .claude/skills/            # skills: diff update, stale detection, generate, validate
└── LICENSE · CONTRIBUTING.md · README.md
```

Build output (`site/`, `dist/`) is **not** tracked — it's regenerated by the commands above (`.gitignore`d).

---

## 🧩 Spec ↔ Reference

Ordito separates the **standard** from **one way to implement it**:

| Layer | Where | What it is |
|-------|-------|------------|
| **Spec core** | `spec/` (esp. §3 IR & collection, §4 contract, §7 skill contracts) | The contract conforming implementations must honor. Stability first. |
| **Reference impl** | `reference/` | A real implementation built for production use — not a toy or pseudocode. Replaceable by any conforming implementation (any language/structure). |
| **Conformance** | `conformance/` | Mechanically checks whether another implementation conforms. |

Read the spec, run the reference impl to feel the behavior, then build your own engine / template / skills while `conformance/run.js` keeps you honest. (Keywords **MUST / SHOULD / MAY** carry the usual normative weight.)

---

## 📌 Status

**Stable — spec v1.0.** Built and validated across two iterations (single page → multi-page with collections and mixed generation), plus diff-update & two-stage skills, all implemented and validated (conformance suite passing). The vocabulary, template contract, collection, and skill I/O are frozen for v1.0.

The spec follows **semantic versioning**: breaking changes to the IR / contract / collection / skill schemas bump the major version; backward-compatible additions are minor. Post-v1.0 work (more inline markup, multi-collection relations, `field_map` structuring, multi-agent concurrency) lives in the [issue tracker](https://github.com/karuhi/ordito/issues).

**Maturity (honest scope).** Dependency-free, validated by the conformance suite (deterministic golden + skill I/O contracts), and used to build this repo's own examples. **Not yet covered:** real-world migration from existing docs (§8 — untested on messy input), multi-writer concurrency, and CI (run `node conformance/run.js` locally — the badge is not CI-backed). v1.0 means a *stable, honest contract*, not a battle-tested-at-scale guarantee.

> 📚 **Why is the spec shaped this way?** Each rule was earned by hitting a wall while building it. The evolution (what changed each version and why) is summarized in the spec's changelog appendices (B–D). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 License

[Apache License 2.0](LICENSE).
