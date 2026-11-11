---
title: "Your AI assistant has read more React than anything else. Pyreon corrects it while it works"
description: "An MCP server with 24 tools, the compiler’s live/static verdict in your editor, a component catalog that mounts every scenario, a CLI gate and llms.txt. A worked session with real output, and where each tool stops."
date: 2027-02-16
slug: built-for-ai-assistants
tags: [ai, mcp, typescript, devtools]
cover: /blog/covers/built-for-ai-assistants.png
---

Your AI assistant has read more React than anything else on earth. Ask it for a Pyreon component and the first draft comes back React-shaped: a `key` prop on a list, a destructured `props`, a signal called like a setter. In a signals framework those habits are not syntax errors. The code compiles, renders, and then never updates.

We cannot change what a model was trained on. We can change what it checks its work against. Pyreon ships five tools built for exactly that: an MCP server with 24 tools, the compiler's own live/static verdict in your editor, a component catalog that records what renders, a CLI gate, and generated `llms.txt` files. Here is each one, a worked session with real tool output, and the exact point where each one stops.

## 1. An MCP server built from the same source as the docs

`@pyreon/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io/) server. It speaks JSON-RPC over stdio, never modifies your files, makes no network calls and has no LLM inside: every tool returns deterministic text. Register it once:

```json
{
  "mcpServers": {
    "pyreon": { "command": "bunx", "args": ["@pyreon/mcp"] }
  }
}
```

That goes in `.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, or the equivalent file for any MCP client. Projects from `npm create @pyreon/zero@latest` get `.mcp.json` and a `CLAUDE.md` by default; `npm create @pyreon/multiplatform@latest` writes `.mcp.json`, `CLAUDE.md` and `AGENTS.md`, and that `AGENTS.md` tells the assistant to call `get_api`, `validate` and `diagnose` instead of guessing.

The 24 tools, by what you are doing at the time:

| when you are | tools |
| --- | --- |
| about to write code | `get_api`, `get_pattern`, `get_anti_patterns`, `get_changelog`, `mcp_overview` |
| checking what you wrote | `validate`, `explain_reactivity`, `migrate_react`, `migrate_pyreon` |
| explaining a failure | `diagnose`, `explain_error` |
| reading the actual project | `get_routes`, `get_components`, `get_content_collection`, `get_content_entry`, `audit_islands`, `audit_test_environment`, `get_browser_smoke_status` |
| using verified catalogs | `get_atlas_catalog`, `get_atlas_component`, `get_dependency_fabric`, `get_api_client`, `get_api_operation`, `explain_api_diff` |

The API answers come from the same per-package manifests that generate the docs site and `llms.txt`. A step in the required `Fast Gates` CI check (`check-mcp-docs`) verifies that the tools the server registers, the tools its manifest lists and the tools its [docs page](/docs/mcp) describes are the same set, so the assistant never gets told about a tool that does not exist.

> **We can’t change what a model was trained on. We can change what it checks its work against.**

## 2. A worked session

The task: *"Add a counter and a list of items to App.tsx."* Here is a first draft that is plausible and wrong:

```tsx
import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

export function App() {
  const count = signal(0)
  const items = signal([{ id: 1, t: 'a' }])
  return (
    <div>
      <button onClick={() => count(count() + 1)}>{count()}</button>
      <For each={items} key={(i) => i.id}>{(i) => <li>{i.t}</li>}</For>
    </div>
  )
}
```

### Step 1: `validate` before you ever see it

The assistant passes the draft to the tool first. The real output, trimmed where marked:

```text
Found 2 issues:

1. **signal-write-as-call** (line 9)
   `count(value)` does NOT write the signal — `signal()` is the read-only callable
   surface and ignores its arguments. Use `count.set(value)` to assign or
   `count.update((prev) => …)` to derive from the previous value. …
   Current: `count(count() + 1)`
   Fix: `count.set(count() + 1)`
   Auto-fixable: yes

2. **for-with-key** (line 10)
   `key` on <For> is reserved by JSX for VNode reconciliation and is extracted
   before the prop reaches the runtime. In Pyreon, use `by` for list identity.
   Current: `key={(i) => i.id}`
   Fix: `by={(i) => i.id}`
   Auto-fixable: yes
```

Both bugs would have shipped silently: a button that does nothing, a list with no identity. Each finding names its fix, so the assistant applies it instead of guessing.

### Step 2: `explain_reactivity` for code that is valid and still stale

Some code breaks no rule and still never updates. `explain_reactivity` runs the compiler's analysis and annotates every expression. Here it is on a file with a `Badge` child that destructures `label` and derives `const doubled` and `let tripled` from `props.count`, and an `App` parent that keeps `const snapshot = count()` (abridged):

```text
Reactivity map for badge.tsx — 3 live · 2 baked-static · 1 footgun

   4 |   const { label } = props
               ^ ⚠ footgun [props-destructured-body] — Destructuring `props` in the component body captures the values ONCE during setup …
   9 |       {props.count} / {doubled} / {tripled}
              ^ ◆ live — live — this text re-renders whenever its signals change
                              ^ ◆ live — live — this text re-renders whenever its signals change
                                          ^ ○ baked once — baked once into the DOM — never re-renders (no signal read here)
  19 |       <Badge label="clicks" count={count()} />
                                          ^ ◆ live prop — live prop — signal reads here are tracked into the component
  20 |       <p>{snapshot}</p>
                 ^ ○ baked once — baked once into the DOM — never re-renders (no signal read here)
```

Read that line 9 closely. `const doubled` stays live because the compiler inlines a `const` derived from props at its use site. `let tripled` does not, and the tool says so. This is not a guess: it is the same reactive-or-static decision the JSX compiler makes when it emits the bindings. "Baked once" here means baked once in your bundle.

### Step 3: ground the UI in components that exist

When the task says "use our Button", the assistant should not invent props. `get_atlas_component({ name: 'Button' })` returns the props `atlas` found in your source with their exact allowed values, which props take a signal accessor, a known-good example from a scenario that passed verification, and `avoid:` lines for scenarios that failed. From the terminal, `atlas check` validates a proposed usage. This is a real run against the repo's `examples/atlas-workshop`:

```bash
$ atlas check Button '{"label":"Save","variant":"sold"}'
Button: 1 problem(s):
  · `variant` must be one of `solid`, `soft`, `outline`, `ghost` — got `sold` — did you mean `solid`?
```

That is the value that typechecks in plain JavaScript and renders silently wrong, caught before it renders.

### Step 4: when something still breaks at runtime

`diagnose` takes an error string and returns the likely cause and the fix. `explain_error` takes the whole dev-mode error report, including its reactive trace (the sequence of signal writes that led up to the crash), and assembles a failure dossier the assistant can reason over.

## 3. The Reactivity Lens: the same verdict while you type

The `explain_reactivity` verdict also lives in your editor. Run `@pyreon/lint`'s language server (`pyreon-lint --lsp`) and each expression gets a ghost-text hint:

```text
function Counter(props) {
  const count = signal(0)
  return (
    <div>
      {count()}          live
      {props.label}      live·prop
      {"hello"}          static
    </div>
  )
}
```

(The words on the right are the hints your editor draws as ghost text; they are not in the file.)

Watch for `static` where you expected `live`. That catches the "my UI does not update" bug while you are typing, and it reviews whatever your assistant just pasted in. The Rust and JavaScript compiler backends emit byte-identical lens data, so the editor shows exactly what the build will do. The same server publishes the detector findings as ordinary warnings. More in the [Reactivity Lens docs](/docs/reactivity-lens).

## 4. atlas: a component catalog that has been checked

[`@pyreon/atlas`](/docs/atlas) turns the Storybook model around. You write no stories. Atlas derives controls from your prop types, generates scenarios from the variant axes, **mounts every scenario**, and runs checks on each one: accessibility, interaction, SSR/hydration parity and leaks in the scan, reactivity coverage and visual snapshots in a browser pass. A real run on `examples/atlas-workshop` (abridged):

```text
$ atlas scan .
atlas: discovered 11 component(s), 44 scenario(s) — 42 verified, 2 failing, 0 unverified.
  checks: a11y 12/14 ✗ · interaction 44/44 · ssrParity 44/44 · leak 44/44
  not run: reactivityCoverage, snapshot — browser-only — run `atlas verify-browser` to measure this (a Node scan cannot)
  → atlas-catalog.json
  → atlas-agent-guide.md
…
atlas: 2 failing scenario(s):
  ✗ button--empty
      a11y [missing-accessible-name]: missing accessible name: "label" is empty
```

Nobody wrote that failing scenario. Atlas generated an "empty" case for the required `label` prop, mounted it, and found a button with no accessible name: a real accessibility bug, reported with its fix.

Two files come out. `atlas-catalog.json` holds every component, control, scenario and verdict as data, and the MCP tools serve it. `atlas-agent-guide.md` is the compact version for an assistant: what exists, what passed, what is broken. A failing scenario exits non-zero, so the catalog gates itself in CI. And `--check` compares against the committed catalog and fails when a check **stops running**, not only when one starts failing, because a failure that vanishes since its check no longer runs is lost coverage, not a fix.

> **24 tools, no model inside, no network calls: every answer comes from the compiler and the manifests.**

## 5. `pyreon check` and `llms.txt`

[`pyreon check`](/docs/cli) is the terminal twin of `validate`. It runs the same detectors over the files you changed in git, prints each finding with its fix, and exits non-zero, so it slots into a pre-commit hook or a CI step:

```bash
pyreon check            # git-changed .ts/.tsx files
pyreon check src/       # a directory
pyreon check --fix      # apply the mechanically safe fixes only
pyreon check --json     # for tooling
```

[`llms.txt`](https://github.com/pyreon/pyreon/blob/main/llms.txt) and `llms-full.txt` sit at the root of the repository, generated from the same manifests as the docs and the MCP API reference, and CI fails when they drift. An assistant that cannot speak MCP can read them directly. Building your own site with Zero? Its `ai` option generates `llms.txt` and `llms-full.txt` for your routes too.

## Where these tools stop

We publish the edges of our tools the same way we publish our benchmark losses: so you know exactly what you can lean on.

- **The detectors read syntax, not types.** They have no type checker. Use a signal without calling it (`todos.filter(...)` on a signal) and the detectors stay quiet; TypeScript catches it. Keep `tsc` in the loop. A false positive can be silenced per line with `// pyreon-lint-ignore <code>`.
- **Some detectors are deliberately narrow.** The early-return detector fires on signal and hook conditions, not on `props.loading`, because a broader match flagged legitimate setup guards.
- **Copying props by value has no detector.** `Object.assign({}, props)` breaks reactivity and nothing static catches it.
- **`migrate_react` writes a first draft.** It rewrites declarations (`useState` becomes `signal`) and leaves the reads and setter calls for you to finish.
- **Manifest prose can be wrong.** CI checks that the generated surfaces agree with each other, not that every sentence is correct.
- **None of this makes the model smarter.** These tools give an assistant something to check its work against. Whether it calls them depends on the client and the prompt, which is why the scaffolds write the instructions for you.
- **The Lens editor integration is basic.** VS Code uses an extension you symlink in from the repo (not on the Marketplace yet); other editors register `pyreon-lint --lsp` by hand.

For the deep dive on one snippet, including the bug none of these tools catch, read [Your AI assistant wrote six bugs](/blog/a-framework-your-ai-assistant-cant-misuse).

## Build something with it

```bash
npm create @pyreon/zero@latest
```

Open the new app in Claude Code or Cursor, approve the Pyreon MCP server, and ask your assistant for a feature. Watch what it checks.

- Docs: [the MCP server, every tool with an example](/docs/mcp)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
