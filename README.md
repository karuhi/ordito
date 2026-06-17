<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/ordito-mark-dark.png">
    <img src="assets/ordito-mark.png" alt="Ordito" width="150">
  </picture>
</p>

<h1 align="center">Ordito</h1>

<p align="center">
  <strong>String the structure (the IR <em>warp</em>) first — then let AI weave the prose on top.<br>An open spec, with a zero-dependency reference implementation, for repo-bundled docs that AI <em>creates, updates, and publishes</em>.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge"></a>
  <a href="spec/ordito-spec.md"><img alt="Spec: v1.1" src="https://img.shields.io/badge/spec-v1.1-blue?style=for-the-badge"></a>
  <a href="https://karuhi.github.io/ordito/"><img alt="Live demo" src="https://img.shields.io/badge/demo-live-brightgreen?style=for-the-badge"></a>
  <img alt="Node.js v22+" src="https://img.shields.io/badge/Node.js-v22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white">
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

**The use case it's built for:** **developer docs that live in the repo** — an AI (Claude) *creates and updates* the pages conversationally, and they ship to **GitHub Pages**. Visibility is yours to set: serve them publicly, or — if you're on **GitHub Enterprise Cloud** — you *can* restrict the Pages site to org members (and if your org uses SAML, that's SSO-gated for free). No CMS, no separate service — the docs are JSON in the repo, and a `git push` rebuilds and republishes them.

---

## 🧶 How it works

Three principles carry the whole design:

- **Constrained variation.** The frame (layout, tokens) is fixed; inside it, the AI's output is allowed to vary. But **variation is not data loss** — losing a field from the IR is a bug, not a style choice. How much variation you allow is a dial: the precision of the contract's `render_hint`.
- **Update / generate split.** Editing the IR (cheap, frequent) and generating HTML (heavy, explicit) are **separate steps**. A write never triggers a build. This is exactly what powers the *"record it? → reflect it?"* two-stage confirmation UX.
- **All JSON, all skills.** IR, template contract, and collection are exchanged as JSON. Every extension is a **skill** that either *writes to* or *reads from* the store.

<details>
<summary>The line between "allowed variation" and "data loss" (and why it matters)</summary>

Early in development, a `default` value present in the IR (`expires_in = 3600`) was **silently dropped** from the AI output — and the class-only validator passed it, because the classes were fine. That is *data loss*, not constrained variation. Ordito's answer is `field_map`: the contract must map **every** field of a block to a destination, and the validator flags any IR field that isn't mapped. Display-nothing is allowed — but it must be declared (`"OMIT"`), never implicit.
</details>

---

## 🚀 Quickstart

**Requirements: Node.js v22+ only.** No dependencies, no build step.

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

Atomic skills (under [`.claude/skills/`](.claude/skills/)) are the **management layer** — the way an AI agent *creates, edits, organizes, and publishes* docs without a CMS. Every skill is one verb, picked by intent:

| Skill | Kind | Does | Generates? |
|-------|------|------|------------|
| `ordito-create-page` | write | Create a **new** page (IR doc); optionally place it in the nav | **no** |
| `ordito-update-block` | write | Diff-update one existing block, bump `updated_at` | **no** |
| `ordito-add-block` | write | Insert a new block (append/after/before/in-tab), auto-id | **no** |
| `ordito-remove-block` | write | Delete a block (incl. nested in tabs) | **no** |
| `ordito-move-block` | write | Reorder / re-parent a block | **no** |
| `ordito-edit-collection` | write | Edit the nav: add/move/remove/relabel/reorder | **no** |
| `ordito-delete-page` | write | Delete a page and prune its nav entry | **no** |
| `ordito-detect-stale` | read | List pages where `updated_at > generated_at` | no |
| `ordito-generate` | read | Explicitly (re)generate — all pages, by id, or only stale | yes (explicit only) |
| `ordito-validate` | check | JSON Schema + `field_map` coverage + output checks | no |
| `ordito-init` | scaffold | Set Ordito up in a repo (config, docs, nav, Pages workflow) | no |

The write skills never trigger a build — **generation is always the separate, explicit `ordito-generate` step** (§5.4). The skills also never prompt for confirmation — **the agent does**. Each skill has a `SKILL.md` describing its trigger and I/O. *(`create-page`, `add-block`, `remove-block`, `move-block`, `edit-collection`, `delete-page`, and `init` were added in **spec v1.1** — that's what makes "AI **creates** the docs", not just edits them, possible.)*

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

## 📦 Adopt in your repo (turnkey)

Drop Ordito into any repo and scaffold a docs site — bundle, scaffold, then build:

```bash
# 1) Bundle the skills + engine into your repo (run from the Ordito repo)
bash scripts/install-into.sh /path/to/your-repo

# 2) Scaffold config + docs/ + collection + the Pages deploy workflow (run in your repo)
echo '{"title":"Internal API docs"}' | node .claude/skills/ordito-init/init.js

# 3) First build (deterministic — no AI, no API calls)
echo '{}' | node .claude/skills/ordito-generate/generate.js
```

`install-into.sh` copies `.claude/skills/` and bundles the engine at `.claude/skills/lib/engine/` (with its `templates/` and `schemas/`), so **no `reference/` tree is needed** at the destination — the skills resolve the engine from a single point. `ordito-init` writes a config like this and the matching `docs/` + nav + workflow:

```json
{
  "irDir": "docs/ir",
  "out": "docs/site",
  "collection": "docs/collection.json",
  "template": { "id": "dev-docs-standard" },
  "mode": "deterministic"
}
```

- **Config-driven, relocatable**: root detection walks up to the nearest `ordito.config.json` (or `.git`); resolution order is **call args > `ordito.config.json` > built-in defaults**, so day-to-day calls take near-empty input (`echo '{}' | …`). Drops cleanly into a monorepo.
- **Templates**: pick via `template` (`{ "id": "<bundled>" }` or `{ "dir": "<repo-relative>" }`).

### 🚀 Publish to GitHub Pages

`ordito-init` also writes **`.github/workflows/docs.yml`**, which on every push to `main` (touching `docs/`) regenerates the site, **gates the deploy on `ordito-validate`** (schema + `field_map` + output checks — a red check blocks publish), and deploys via `actions/deploy-pages`. To set it up:

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Push to `main` → the workflow builds, validates, and publishes.

**Optional — restrict who can see it.** If you're on **GitHub Enterprise Cloud**, set Settings → Pages → **access control to "members of the organization"** so the site is served only to org members; if your org enforces **SAML SSO**, that becomes SSO-gated automatically. This is entirely optional — leave it off for a public docs site.

> Not on Enterprise Cloud and still want it private? GitHub Pages alone can't restrict a private site to org members — front the Pages site (or a private host) with **Cloudflare Access / IAP** for the SSO gate, or serve the output from your own gateway.

---

## 📁 Repo layout

```
ordito/
├── spec/                      # NORMATIVE — the spec. Reads standalone, independent of any impl.
│   ├── ordito-spec.md         #   the normative spec (v1.1)
│   └── history/               #   older versions
├── reference/                 # INFORMATIVE — one reference implementation (replaceable)
│   ├── engine/                #   generation engine (Node.js, zero deps)
│   └── templates/             #   default template (frame + contract JSON)
├── conformance/               # CONFORMANCE — test your own implementation
│   ├── schemas/               #   JSON Schema for IR, collection, config & skill I/O
│   ├── cases/                 #   sample IR -> expected output (golden)
│   ├── run.js                 #   conformance runner (schema + golden + mechanical)
│   └── skills-check.js        #   skill I/O contracts (incl. v1.1 authoring round-trip)
├── samples/                   # sample IR + collection (input) + site/ (pre-built output, committed)
├── scripts/                   # install-into.sh (bundle Ordito into another repo)
├── .github/workflows/         # ci.yml (conformance) · pages.yml (deploy this repo's demo); docs.yml is scaffolded into adopter repos
├── ordito.config.json         # project config (irDir/out/collection/template), read from repo root
├── .claude/skills/            # 11 skills: create/update/add/remove/move/delete pages & blocks, nav, generate, validate, init
└── LICENSE · CONTRIBUTING.md · README.md
```

Build output (`site/`, `dist/`) is **not** tracked — it's regenerated by the commands above (`.gitignore`d).

---

## 🧩 Spec ↔ Reference

Ordito separates the **standard** from **one way to implement it**:

| Layer | Where | What it is |
|-------|-------|------------|
| **Spec core** | `spec/` | The contract conforming implementations must honor. Stability first. |
| **Reference impl** | `reference/` | A real implementation built for production use — not a toy or pseudocode. Replaceable by any conforming implementation (any language/structure). |
| **Conformance** | `conformance/` | Mechanically checks whether another implementation conforms. |

Read the spec, run the reference impl to feel the behavior, then build your own engine / template / skills while `conformance/run.js` keeps you honest. (Keywords **MUST / SHOULD / MAY** carry the usual normative weight.)

---

## 📌 Status

**Stable — spec v1.1.** Built and validated across iterations (single page → multi-page with collections and mixed generation → full authoring skill set), all implemented and validated by the conformance suite. v1.1 adds the **create / structure-edit / nav-edit / delete** write skills (a backward-compatible MINOR), completing "AI creates the docs" — the vocabulary, template contract, and collection schema stay **frozen and unchanged** from v1.0, so existing IR remains valid.

The spec follows **semantic versioning**: breaking changes to the IR / contract / collection / skill schemas bump the major version; backward-compatible additions (a new skill, an optional field) are minor. Remaining post-v1.1 work (migration from existing docs, multi-collection relations, `field_map` structuring, multi-agent concurrency, semantic-fidelity checking) lives in the [issue tracker](https://github.com/karuhi/ordito/issues).

**Maturity (honest scope).** Dependency-free, **CI-backed** (`.github/workflows/ci.yml` runs the conformance suite — deterministic golden + skill I/O contracts — on every push/PR), and used to build this repo's own examples. **Not yet covered:** migration from existing Markdown/Docusaurus (the migration skill is specified but unimplemented — §8), multi-writer concurrency, and semantic fidelity beyond a substring presence check (catches deletion, not reordering/fabrication — §6.2). Stable, honest contract — not a battle-tested-at-scale guarantee.

> 📚 **Why is the spec shaped this way?** Each rule was earned by hitting a wall while building it. The evolution (what changed each version and why) is summarized in the spec's changelog. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 License

[Apache License 2.0](LICENSE).
