<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/ordito-mark-dark.png">
    <img src="assets/ordito-mark.png" alt="Ordito" width="150">
  </picture>
</p>

<h1 align="center">Ordito</h1>

<p align="center">
  <strong>Structure stays in JSON. AI writes the words.<br>
  An open spec — plus a zero-dependency reference engine — for repo-native docs that AI creates, updates, and ships.</strong>
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
  <a href="#-a-good-fit">A good fit</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-quickstart">Quickstart</a> ·
  <a href="#-adopt-in-your-repo">Adopt</a> ·
  <a href="#-skills">Skills</a> ·
  <a href="#-repo-layout">Layout</a> ·
  <a href="#-spec--reference">Spec</a> ·
  <a href="#-status">Status</a>
</p>

> *Ordito* (Italian for the loom's warp) names the idea: fix structure first, add prose later. In practice that's **IR** — structured JSON.

---

## 🤔 Why

Docusaurus and friends fuse **content, presentation, and build** into one lump. Change the theme and you end up editing Markdown. Ask AI for help and it rewrites the whole file — quietly dropping a `default` value or two along the way.

Ordito splits the stack:

- 📦 **Content** lives as **IR** — structured JSON with no HTML baked in.
- 🎨 **The frame** is a fixed **template** — layout, tokens, component CSS. AI doesn't touch it.
- 🧵 An **engine** stitches them together. AI writes body HTML only inside a **template contract**.

Pages stay visually consistent. The source data doesn't silently drift.

The sweet spot: **developer docs in the repo**. An AI agent (Claude + skills) creates and updates pages in conversation; `git push` rebuilds and publishes to **GitHub Pages**. No CMS, no sidecar service. Docs are JSON in git.

On **GitHub Enterprise Cloud**, you can restrict Pages to org members (SAML SSO gates it for free). Or leave it public — your call.

---

## 👍 A good fit

Not a drop-in Docusaurus replacement. A specific workflow.

**You'll probably like it if…**

- Day-to-day edits go through an AI agent, not a CMS
- Pages should look the same even when AI rewrites the prose
- API fields (`default`, `required`, …) must not quietly vanish from the output
- GitHub Pages is enough — public or org-only

**Think twice (for now) if…**

- You need to migrate existing Markdown or Docusaurus docs — specced (§8), **not built yet**. Budget manual work or wait.
- The team will hand-edit JSON blocks without an agent
- You need WYSIWYG or a visual CMS

Ordito shines when an **agent maintains structured JSON** and humans review. Markdown-first teams should treat this as a fresh start, not lift-and-shift.

---

## 🧶 How it works

Three ideas, end to end:

- **Constrained variation.** The frame is fixed; prose inside it can vary. But losing an IR field is a bug, not a style choice. The contract's `render_hint` sets how tight the leash is.
- **Update ≠ generate.** IR edits are cheap and frequent. HTML generation is heavy and explicit. A write never triggers a build — that's what powers *"record it? → reflect it?"*
- **All JSON, all skills.** IR, template contract, and nav collection are JSON. Extensions are **skills** that read from or write to the store.

<details>
<summary>Why `field_map` exists (the `default` that vanished)</summary>

Early on, a `default` value in the IR (`expires_in = 3600`) **silently disappeared** from AI output. Class-only validation passed — the CSS classes looked fine. That's data loss, not variation.

Ordito's fix: `field_map`. The contract must map **every** block field to a destination. Unmapped fields fail validation. Want to hide something? Say so explicitly (`"OMIT"`) — never by accident.
</details>

---

## 🚀 Quickstart

**Node.js v22+.** That's it. No `npm install`, no build step.

Try it in *this* repo:

```bash
# Generate a multi-page site (deterministic — no AI, always works)
node reference/engine/generate.js --collection samples/collection.json --out site
open site/index.html            # macOS (Linux: xdg-open)

# Validate IR / collection
node reference/engine/schema-check.js samples/ir/guides/quickstart.json document
node reference/engine/schema-check.js samples/collection.json collection

# Run conformance
node conformance/run.js
```

Output lands in `site/` — interlinked HTML with nav and doc-id hierarchy intact.

> **Live site:** <https://karuhi.github.io/ordito/> — Ordito's own docs, generated from `samples/ir/` (dogfooding). Local copy: [`samples/site/`](samples/site/)

Peek at the pipeline: [`samples/ir/guides/getting-started.json`](samples/ir/guides/getting-started.json) → [`samples/site/guides/getting-started.html`](samples/site/guides/getting-started.html).

<details>
<summary>Mixed mode: structured blocks deterministic, prose from AI cache</summary>

```bash
node reference/engine/generate.js --collection samples/collection.json --out site \
     --mode mixed --ai-cache site/ai-fragments
```

`params`, `table`, `steps`, … render deterministically. Prose blocks read pre-generated `.l2.json` fragments from `--ai-cache`; missing cache falls back to deterministic — **output always lands**.

Live Anthropic API calls happen only in `--mode ai` (whole content area). Mixed mode just reads the cache.
</details>

---

## 📦 Adopt in your repo

To use Ordito in *your* project — bundle, scaffold, build:

```bash
# 1) Copy skills + engine (run from this repo)
bash scripts/install-into.sh /path/to/your-repo

# 2) Scaffold config, docs/, nav, Pages workflow (run in your repo)
echo '{"title":"Internal API docs"}' | node .claude/skills/ordito-init/init.js

# 3) First build (deterministic — no AI, no API calls)
echo '{}' | node .claude/skills/ordito-generate/generate.js
```

`install-into.sh` drops everything under `.claude/skills/`, engine included at `.claude/skills/lib/engine/`. Your repo doesn't need a `reference/` tree.

`ordito-init` writes something like:

```json
{
  "irDir": "docs/ir",
  "out": "docs/site",
  "collection": "docs/collection.json",
  "template": { "id": "dev-docs-standard" },
  "mode": "deterministic"
}
```

- **Config-driven:** walks up to the nearest `ordito.config.json` (or `.git`). Resolution: call args → config → defaults. Day-to-day: `echo '{}' | …`. Monorepo-friendly.

### Templates are yours to pick

**The frame** (layout, CSS, contract) is owned by the template. AI doesn't touch it. Swap it to match your taste or brand — the same IR renders as a different-looking site.

Pick one in `ordito.config.json`:

```json
"template": { "id": "dev-docs-serif" }
```

Bundled templates (`reference/templates/`):

| id | Vibe |
|----|------|
| `dev-docs-standard` | Default. Always dark, indigo accent |
| `dev-docs-serif` | Serif, paper-toned (readability-first layout) |
| `dev-docs-terminal` | Terminal vibe (green accent, practical layout) |

Or bring your own:

```json
"template": { "dir": "docs/my-template" }
```

A template is three files: `frame.html`, `styles.css`, `contract.json`. The contract's `allowed_classes` must stay aligned with the body component classes (`doc-h`, etc.) — copying a bundled template and restyling the CSS is the easiest path. You can even ask an agent to build a dark-theme template (frame only; IR stays the same).

### Publish to GitHub Pages

`ordito-init` also scaffolds **`.github/workflows/docs.yml`**. On push to `main` (when `docs/` changes): regenerate → **`ordito-validate` gates deploy** (schema + `field_map` + output checks) → `actions/deploy-pages`.

1. Repo **Settings → Pages → Source: GitHub Actions**
2. Push to `main`

**Optional — org-only access** on Enterprise Cloud: Settings → Pages → restrict to org members. SAML SSO applies automatically.

> Not on Enterprise Cloud but need private docs? Front Pages with **Cloudflare Access / IAP**, or serve from your own gateway.

---

## 🔁 Skills

[`.claude/skills/`](.claude/skills/) are the management layer — how an AI agent creates, edits, organizes, and publishes docs without a CMS. One skill, one verb:

| Skill | Kind | Does | Generates? |
|-------|------|------|------------|
| `ordito-create-page` | write | New page (IR doc); optionally add to nav | **no** |
| `ordito-update-block` | write | Diff-update one block, bump `updated_at` | **no** |
| `ordito-add-block` | write | Insert a block (append/after/before/in-tab) | **no** |
| `ordito-remove-block` | write | Delete a block (incl. nested in tabs) | **no** |
| `ordito-move-block` | write | Reorder / re-parent a block | **no** |
| `ordito-edit-collection` | write | Edit nav: add/move/remove/relabel/reorder | **no** |
| `ordito-delete-page` | write | Delete a page, prune nav entry | **no** |
| `ordito-detect-stale` | read | Pages where `updated_at > generated_at` | no |
| `ordito-generate` | read | (Re)generate — all, by id, or stale only | yes (explicit) |
| `ordito-validate` | check | Schema + `field_map` + output checks | no |
| `ordito-init` | scaffold | Config, docs, nav, Pages workflow | no |

Write skills never build. **Generation is always explicit** via `ordito-generate` (§5.4). Skills never ask for confirmation — **the agent does**. Each has a `SKILL.md` with triggers and I/O.

v1.1 added create / structure-edit / nav / delete skills — that's what makes "AI **creates** the docs", not just edits them.

**The two-stage flow** the agent composes:

```text
🧑 "Add a note about rate limits to the quickstart."
🤖 Record this into the docs IR?                      ← agent asks (stage 1)
🧑 Yes
   ▸ ordito-update-block      → { changed: true, generated: false }
   ▸ ordito-detect-stale      → { stale: ["guides/quickstart"] }
🤖 1 page unreflected. Regenerate?                    ← agent asks (stage 2)
🧑 Yes
   ▸ ordito-generate {only:"stale"}
   ▸ ordito-validate          → all checks pass
```

The agent owns both questions. Skills just execute and return JSON.

---

## 📁 Repo layout

```
ordito/
├── spec/                      # The spec (normative, standalone)
│   ├── ordito-spec.md         #   v1.1
│   └── history/
├── reference/                 # Reference implementation (replaceable)
│   ├── engine/                #   Node.js, zero deps
│   └── templates/             #   frame + contract JSON
├── conformance/               # Prove your own impl conforms
│   ├── schemas/
│   ├── cases/                 #   golden IR → expected output
│   ├── run.js
│   └── skills-check.js
├── samples/                   # Sample IR + collection + pre-built site/
├── scripts/                   # install-into.sh
├── .github/workflows/         # ci.yml · pages.yml (docs.yml → adopter repos)
├── ordito.config.json
├── .claude/skills/            # 11 skills
└── LICENSE · CONTRIBUTING.md · README.md
```

Build output (`site/`, `dist/`) is gitignored — regenerate with the commands above.

---

## 🧩 Spec ↔ Reference

| Layer | Where | What |
|-------|-------|------|
| **Spec** | `spec/` | The contract. Stability first. |
| **Reference** | `reference/` | Production-grade impl — not a toy. Swap it for any conforming engine. |
| **Conformance** | `conformance/` | Mechanical proof another impl honors the spec. |

Read the spec, run the reference, build your own thing, let `conformance/run.js` keep you honest.

---

## 📌 Status

**Stable — spec v1.1.**

Single page → multi-page + collections + mixed generation → full authoring skills. All covered by conformance. v1.1 added create / structure-edit / nav / delete (backward-compatible MINOR). IR vocabulary, template contract, and collection schema are **unchanged from v1.0**.

**What's solid:** zero deps, CI-backed conformance on every push/PR, powers this repo's own demo.

**What's not (yet):** Markdown/Docusaurus migration (§8), multi-writer concurrency, semantic fidelity beyond substring checks (catches deletion, not reordering/fabrication — §6.2). Honest contract — not battle-tested-at-scale.

Post-v1.1 roadmap: [issues](https://github.com/karuhi/ordito/issues).

> **Why is the spec shaped this way?** Each rule came from hitting a wall while building. Changelog in the spec. Want to contribute? [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 📄 License

[Apache License 2.0](LICENSE).