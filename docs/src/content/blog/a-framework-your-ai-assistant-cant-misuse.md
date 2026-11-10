---
title: "A framework your AI assistant can't misuse (mostly)"
description: "Ask an assistant for a Pyreon component and it writes React with a Pyreon import. Here is what the MCP server, the Reactivity Lens and pyreon check say about it, verbatim, and the one bug none of them catch."
date: 2026-12-14
slug: a-framework-your-ai-assistant-cant-misuse
tags: [ai, javascript, typescript, webdev]
cover: /blog/covers/a-framework-your-ai-assistant-cant-misuse.png
---

Ask a coding assistant for "a Pyreon component that lists users and filters them as you type" and you will often get this. It imports the right packages. It looks plausible. It is wrong in six places, and one of them is a signal write that does nothing at all, on every keystroke, without a single error.

```tsx
import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

export function UserList({ users, title }) {
  const query = signal('')
  const visible = users.filter((u) => u.name.includes(query()))

  return (
    <section className="users">
      <h2>{title}</h2>
      <input value={query()} onChange={(e) => query(e.target.value)} />
      <For each={visible}>{(u) => <li>{u.name}</li>}</For>
    </section>
  )
}
```

This is React with the hooks renamed, which is exactly what a model trained mostly on React writes when it has seen little Pyreon. Destructured props. `className`. `onChange` on an input. A list with no key. And `query(value)` used as a setter, because in several signal libraries calling a signal with an argument writes it. In Pyreon it does not: `query()` is the read, and it ignores its arguments. Writes are `query.set(value)` or `query.update(fn)`.

A new framework cannot wait for the next round of model training. So Pyreon ships its knowledge in a form an assistant can call while it works, plus checks that run before the code lands. Below, that snippet goes through each one, and you see what came back.

## Layer 1: hand the model the right reference

Two generated files sit at the root of the repository: [`llms.txt`](https://github.com/pyreon/pyreon/blob/main/llms.txt), a short index, and `llms-full.txt`, the long form with examples. Both are generated from each package's `src/manifest.ts`, the same source that feeds the docs site's API reference and the MCP server's API database, and a step in the required CI gates (`gen-docs --check`) fails when they drift. `llms.txt` opens with the signal API, including the three lines that would have prevented the worst bug above:

```ts
count()                        // read (subscribes)
count.set(5)                   // write
count.update(n => n + 1)       // update
```

Static context helps. It is also passive: the assistant has to read it and remember it. The next layers answer back.

## Layer 2: an MCP server the assistant can ask

`@pyreon/mcp` is a Model Context Protocol server with 24 tools. It runs over stdio, never touches your files, makes no network calls and has no model inside. Every tool returns text computed from Pyreon's manifests, its anti-pattern catalog, the compiler, or a scan of your project. Registering it for Claude Code is one file at the project root:

```json
{
  "mcpServers": {
    "pyreon": {
      "command": "bunx",
      "args": ["@pyreon/mcp"]
    }
  }
}
```

Cursor reads the same shape from `.cursor/mcp.json`, and any MCP client can spawn it. A new app from `npm create @pyreon/zero@latest` gets `.mcp.json` and a `CLAUDE.md` by default; the `--ai` flag also writes Cursor rules, a Copilot instructions file or an `AGENTS.md`.

What the tools are for:

| you want to | tool |
| --- | --- |
| look up an API with its common mistakes | `get_api` |
| check a snippet for known mistakes | `validate` |
| see what the compiler will make reactive | `explain_reactivity` |
| convert React code | `migrate_react` |
| auto-fix the mechanical Pyreon mistakes | `migrate_pyreon` |
| explain an error string or a captured crash | `diagnose`, `explain_error` |
| fetch a canonical pattern or the anti-pattern catalog | `get_pattern`, `get_anti_patterns` |
| read the project you are in | `get_routes`, `get_components`, `get_content_collection` |
| use components and API clients that exist | `get_atlas_catalog`, `get_api_client`, `get_api_operation` |
| see what changed between releases | `get_changelog` |

`mcp_overview` lists all 24 with a one-line "when to use" each.

### `validate` on the snippet

This is the tool's response, unedited:

```text
Found 5 issues:

1. **props-destructured** (line 4)
   Destructuring props at the component signature captures the values ONCE
   during setup — subsequent signal writes in the parent do not update the
   destructured locals. Access `props.x` directly, or use
   `splitProps(props, [...])` to carve out a group while preserving reactivity.
   Current: `{ users, title }`
   Fix: `(props: Props) => /* read props.x directly */`
   Auto-fixable: no

2. **class-name-prop** (line 9)
   'className' is a React JSX attribute. Use 'class' in Pyreon (standard HTML).
   Current: `className="users"`
   Fix: `class="users"`
   Auto-fixable: yes

3. **on-change-input** (line 11)
   onChange on <input> fires on blur in Pyreon (native DOM behavior). For
   keypress-by-keypress updates, use onInput.
   Current: `onChange={(e) => query(e.target.value)}`
   Fix: `onInput={(e) => query(e.target.value)}`
   Auto-fixable: yes

4. **signal-write-as-call** (line 11)
   `query(value)` does NOT write the signal — `signal()` is the read-only
   callable surface and ignores its arguments. Use `query.set(value)` to
   assign or `query.update((prev) => …)` to derive from the previous value.
   Pyreon's runtime warns about this pattern in dev, but the warning fires
   AFTER the silent no-op.
   Current: `query(e.target.value)`
   Fix: `query.set(e.target.value)`
   Auto-fixable: yes

5. **for-missing-by** (line 12)
   <For each={...}> requires a `by` prop so the keyed reconciler can
   preserve item identity across reorders. Without `by`, every update
   remounts the full list.
   Current: `<For each={visible}>`
   Fix: `<For each={items} by={(item) => item.id}>`
   Auto-fixable: no
```

(Long lines wrapped for the page.) Every finding carries a code, a line, the offending text, a concrete replacement and whether it is safe to apply mechanically. An assistant can apply three of them without thinking and has enough context for the other two.

`validate` merges two detector families from the compiler: `detectReactPatterns` (habits from React) and `detectPyreonPatterns` (Pyreon used wrong, 20 mistake codes today). When the snippet imports `@pyreon/primitives`, a third family checks for code that compiles for the web but cannot lower to iOS or Android.

### `explain_reactivity`: the map, not only the bugs

`validate` lists problems. `explain_reactivity` classifies every JSX expression exactly the way the compiler will. On the same snippet, abridged:

```text
Reactivity map for UserList.tsx — 1 live · 2 baked-static · 3 footguns

  10 |       <h2>{title}</h2>
                  ^ ○ baked once — baked once into the DOM — never re-renders (no signal read here)
  11 |       <input value={query()} onChange={(e) => query(e.target.value)} />
                           ^ ◆ live — live — re-evaluates whenever its signals change
  12 |       <For each={visible}>{(u) => <li>{u.name}</li>}</For>
                                              ^ ○ baked once — baked once into the DOM — never re-renders (no signal read here)
```

The full response also marks the three footguns inline. This is the compiler's own analysis, not a second heuristic: `analyzeReactivity` in `@pyreon/compiler` runs the same reactive-or-static decision the JSX transform uses to choose between a one-time write and a subscription, and both compiler backends (Rust and JavaScript) emit byte-identical verdicts. `{title}` is static because `title` was destructured. The heading will never change, and the tool tells you before anything runs.

## Layer 3: the same verdict in your editor

The [Reactivity Lens](/docs/reactivity-lens) shows that classification as inlay hints, the ghost text TypeScript uses for inferred types:

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

The full set is `live`, `live·prop`, `live·attr`, `static` and `hoisted`. It is served by `@pyreon/lint`'s language server, `pyreon-lint --lsp`, so any LSP-capable editor can show it, and the same server publishes the detector findings as warnings. The hint to watch for is `static` where you expected `live`. For you, that is a glance. For an agent working inside the editor, it is the same verdict the MCP tool returns.

## Layer 4: a gate that does not depend on the assistant

Everything above helps only when the assistant asks. The last layer runs either way. [`pyreon check`](/docs/cli) runs the same compiler detectors over files, prints each finding with its fix, and exits non-zero on any finding:

```bash
pyreon check                # git-changed .ts/.tsx files
pyreon check src/           # a directory
pyreon check --fix          # apply the mechanically safe fixes
pyreon check --json         # for tooling
```

On the snippet (first two findings shown):

```text
  UserList.tsx
    4:25  [props-destructured]
      Destructuring props at the component signature captures the values ONCE during setup …
      → (props: Props) => /* read props.x directly */
    9:13  [react:class-name-prop] (auto-fixable — run with --fix)
      'className' is a React JSX attribute. Use 'class' in Pyreon (standard HTML).
      → class="users"
    …

  5 findings in 1 file  ·  some are auto-fixable with --fix
```

[`@pyreon/lint`](/docs/lint) is the broader rule set: 133 rules in 25 categories, from reactivity to SSR to accessibility. On the same file it reports the same five problems under its own rule names:

```text
  4:25  error    Destructured props in component function …           pyreon/no-props-destructure
  9:13  error    Use `class` instead of `className` …                  pyreon/no-classname
  11:29 warning  Use `onInput` instead of `onChange` on `<input>` …    pyreon/no-onchange
  11:46 error    `query(value)` does NOT write the signal …            pyreon/no-signal-call-write
  12:6  error    `<For>` without `by` prop …                           pyreon/no-missing-for-by

✗ 4 errors, 1 warning
```

Put either one in a pre-commit hook or a CI step, and the React-shaped version cannot merge.

## The corrected component

```tsx
import { signal, computed } from '@pyreon/reactivity'
import { For } from '@pyreon/core'

interface User { id: string; name: string }

export function UserList(props: { users: User[]; title: string }) {
  const query = signal('')
  const visible = computed(() =>
    props.users.filter((u) => u.name.includes(query())),
  )

  return (
    <section class="users">
      <h2>{props.title}</h2>
      <input value={query()} onInput={(e) => query.set(e.currentTarget.value)} />
      <ul>
        <For each={visible} by={(u) => u.id}>{(u) => <li>{u.name}</li>}</For>
      </ul>
    </section>
  )
}
```

`validate` on this version: `✓ No issues found. The code follows Pyreon patterns correctly.` And `explain_reactivity` now marks `{props.title}` as `live`.

## The sixth bug, and why we show it

Count the findings: five. Now look at line 6 of the original again:

```tsx
const visible = users.filter((u) => u.name.includes(query()))
```

That reads `query()` once, during setup, filters once, and hands `<For>` a plain array. Fix the other five and typing into the box still never changes the list. It is the most important bug in the snippet, and `validate`, `explain_reactivity`, `pyreon check` and `@pyreon/lint` all walk past it. The fix is the `computed()` in the corrected version.

The reason is structural. The detectors and the Lens reason about JSX expressions and known API shapes. A signal read inside an ordinary method call in the component body, whose result reaches JSX later, is a data-flow question, and none of the static tools follow that flow today. The [MCP docs](/docs/mcp) say it plainly: "Zero diagnostics ≠ correct code."

We could have written this post with five clean catches and stopped. We publish the miss for the same reason we publish our benchmark losses: you should know exactly where a tool's coverage ends before you trust it.

## Where the guardrails stop today

- **No measured effect on assistants yet.** We have not run an evaluation of how often assistants write correct Pyreon with and without the MCP server. This post shows what the tools return. It does not show that a given model calls them or follows them. If you run that comparison, we want to see it.
- **Static detection has edges.** The detectors run without a type checker and without cross-file data flow (see the sixth bug). They also need context: a fragment that leaves out `const query = signal('')` cannot tell a signal write from a function call, so `query(value)` in that fragment comes back clean. Pass whole files.
- **The catalog is finite.** A mistake outside the 20 Pyreon codes and the React set passes.
- **Wording moves between releases.** The output above was re-run on `main` in November 2026 (0.53.0). Codes are stable; message text can change.
- **The Lens needs an LSP setup.** The VS Code extension lives in the repo at `packages/tools/lint/vscode` and is installed by symlink; it is not on the Marketplace yet. Other editors register `pyreon-lint --lsp` by hand.
- **Pyreon is pre-1.0.** An API the assistant learned can change in a minor release, which is why `get_changelog` exists: the assistant can read what changed between your installed version and the latest.

## Build something with it

```bash
npm create @pyreon/zero@latest
```

The new app already has `.mcp.json` in it. Point your assistant at it and ask for something.

- Docs: [MCP server setup](/docs/mcp), [Reactivity Lens](/docs/reactivity-lens), [`pyreon check`](/docs/cli)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues).
