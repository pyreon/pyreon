---
title: 'Readable preset'
description: The readable lint preset — blank lines as paragraph breaks, components that read setup → behaviour → render, shallow JSX and flat ternaries. One config line, fixed on save, with matching oxlint and oxfmt presets for size limits and formatting.
---

`readable` is a preset **layer** for `@pyreon/lint`: a small set of rules about how code reads, not whether it works. Turn it on with one line, and the editor fixes the spacing as you save. New projects from `create-zero` and `create-multiplatform` have it on already.

```json
// .pyreonlintrc.json
{ "preset": ["recommended", "readable"] }
```

## Six principles

1. **One screen per idea.** A component's JSX fits on a screen. When it nests too deep, it is two components.
2. **Flat beats nested.** Return early and keep ternaries flat. A ternary never goes inside another ternary's branch.
3. **Blank lines are paragraph breaks.** A blank line separates declarations, the sections of a component, and the final `return`. There is never one inside a thought.
4. **Setup → behaviour → render.** Every component reads top to bottom in the same order.
5. **Name the logic.** A deep JSX subtree becomes a component, and a branchy ternary becomes an `if` or a named `const`.
6. **The machine does the spacing.** Every spacing rule fixes itself. People only do the splitting.

## The two tiers

| Tier | Adds | Use for |
| --- | --- | --- |
| `readable` | blank lines between declarations, before a `return` and between component sections (all auto-fixed); JSX depth 6; ternary chains of up to 4 outcomes | Any project. Every rule is either fixed for you or a limit that only flags genuine outliers (near this repository's p99). |
| `readable-strict` | `readable`, plus a blank line around every multi-line `if` / `for` / `while` / `try` / `switch` inside a function; JSX depth 5; ternary chains of up to 3 outcomes | New code, where the extra spacing costs nothing. The scaffolds use `readable` plus the block-padding rule. |

Both are **layers**: they set only their own rules, so they compose on top of any base preset. Put them last in the list:

```json
{ "preset": ["strict", "readable"] }
```

That keeps strict's errors and adds readability **warnings**. Readability findings never become build-breaking errors through `strict`. To change one threshold, override the rule after the preset:

```json
{
  "preset": ["recommended", "readable"],
  "rules": { "pyreon/max-jsx-depth": ["warn", { "max": 7 }] }
}
```

The `style` group switches the whole set in one line: `"groups": { "style": "off" }`.

## Three tools, three files

Each tool owns the part it is best at, so they never disagree about the same line:

| Tool | Owns | Config |
| --- | --- | --- |
| `@pyreon/lint` | Whether a blank line separates two statements, component structure, JSX shape, ternary shape | `.pyreonlintrc.json`: `"preset": ["recommended", "readable"]` |
| oxlint | Size limits (function length, complexity, nesting depth, parameters, file length), imports after code, braces, `else` after `return` | `.oxlintrc.json`: `"extends": ["./node_modules/@pyreon/lint/oxlint/readable.json"]` |
| oxfmt | Everything inside a line, wrapping, import order and grouping, JSX attribute layout | `oxfmt.config.ts`: `export { readable as default } from '@pyreon/lint/oxfmt'` |

`@pyreon/lint/oxlint/readable-strict.json` and `readableStrict` (one JSX attribute per line when a tag wraps) are the strict counterparts.

The oxlint limits, and why they are where they are:

| Rule | `readable` | `readable-strict` | This repo's distribution |
| --- | --- | --- | --- |
| `max-lines-per-function` (code lines) | 100 | 60 | p95 72, p99 202 |
| `complexity` | 20 | 15 | p95 14, p99 31 |
| `max-depth` | 5 | 4 | p99 4 |
| `max-params` | 5 | 4 | p99 5 |
| `max-lines` (code lines per file) | 800 | 500 | p90 359, p99 1,542 |

Test files are exempt from the length limits: `describe` blocks and table-driven tests are long by design.

The lint fixes and the formatter cannot fight. oxfmt keeps one blank line between statements and never adds or removes one there; the lint rules only **insert** blank lines between statements, never at the start or end of a block (oxfmt deletes those). So `oxfmt && oxlint --fix && pyreon-lint --fix .` is stable: running it twice changes nothing.

## Fix on save

The `pyreon-lint` language server offers a `source.fixAll.pyreon` code action. In VS Code, with the Pyreon Lint extension and the oxc extension installed:

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.pyreon": "explicit",
    "source.fixAll.oxc": "explicit"
  }
}
```

New `create-zero` (with lint) and `create-multiplatform` projects ship exactly these two files (`.vscode/settings.json` and `.vscode/extensions.json`, which recommends the oxc extension). The Pyreon Lint extension is installed from source for now (see its README); without it the `source.fixAll.pyreon` entry is simply inert.

Any LSP client can request the same action (`textDocument/codeAction` with `only: ["source.fixAll.pyreon"]`). From the command line, `pyreon-lint --fix .` applies the same edits.

## The rules

Messages follow one pattern: what to do, then why, in one line.

### `pyreon/padding-between-declarations` — auto-fixed

A blank line between two adjacent top-level statements, or two adjacent class members, when either spans more than one line. Runs of one-line declarations stay tight.

```ts
// before
const DEFAULT_GAP = 8
export function layout(nodes: Node[]) {
  return nodes.map((n) => n.size + DEFAULT_GAP)
}
export function measure(node: Node) {
  return node.size
}

// after
const DEFAULT_GAP = 8

export function layout(nodes: Node[]) {
  return nodes.map((n) => n.size + DEFAULT_GAP)
}

export function measure(node: Node) {
  return node.size
}
```

The import block (oxlint's `import/newline-after-import` owns it), runs of `export … from` re-exports, and overload signatures (`function f(a: string): string` above its implementation) are left alone.

### `pyreon/padding-before-return` — auto-fixed

A blank line before a `return` that ends real work: after a multi-line statement, or after 3 or more statements (`minStatements`, `afterMultiline`).

```ts
// before
function label(item: Item) {
  const name = item.name.trim()
  const unit = item.unit ?? ''
  const suffix = unit ? ` ${unit}` : ''
  return `${name}${suffix}`
}

// after — a short guard stays tight: `if (!x) return null` needs no blank line
function label(item: Item) {
  const name = item.name.trim()
  const unit = item.unit ?? ''
  const suffix = unit ? ` ${unit}` : ''

  return `${name}${suffix}`
}
```

A `return` that a comment already sets apart is not flagged.

### `pyreon/padding-between-component-sections` — auto-fixed

A component body reads in three sections, with a blank line where one ends and the next begins:

| Section | Statements |
| --- | --- |
| setup | `splitProps`, `mergeProps`, `useContext` and other `use*` hooks, `signal`, `state`, `createStore`, `computed` |
| behaviour | handlers (`const onSave = () => …`, function declarations), `effect`, `watch`, `onMount`, `onUnmount`, `onCleanup`, `provide` |
| render | early-return guards and the final `return` |

```tsx
// before
export function Counter(props: { step: number }) {
  const count = signal(0)
  const increment = () => count.update((n) => n + props.step)
  effect(() => console.log(count()))
  return <button onClick={increment}>{count}</button>
}

// after
export function Counter(props: { step: number }) {
  const count = signal(0)

  const increment = () => count.update((n) => n + props.step)
  effect(() => console.log(count()))

  return <button onClick={increment}>{count}</button>
}
```

Handlers and effects share one section **in either order**, on purpose. React style guides put effects above handlers, but in Pyreon `effect()` runs synchronously when it is created, so `effect(() => sync())` written above `const sync = …` throws a temporal-dead-zone `ReferenceError`. A statement the rule cannot classify (`const label = props.a * 2`) joins the section before it.

### `pyreon/padding-around-multiline-blocks` — auto-fixed, `readable-strict`

A blank line before and after a multi-line `if` / `for` / `while` / `do` / `try` / `switch` inside a function, unless it is the first or last statement of its block or a comment introduces it.

```ts
// after
function total(xs: number[]) {
  let sum = 0

  for (const x of xs) {
    sum += x
  }

  return sum
}
```

### `pyreon/max-jsx-depth`

A component's JSX nests at most 6 elements deep (`max`; 5 in strict). It reports once per component, at the deepest element, and names the subtree to extract. JSX in render callbacks (`<For>{(row) => <li>…</li>}</For>`) and in props (`fallback={<Spinner />}`) counts. Fragments and control-flow components (`<For>`, `<Show>`, `<Switch>`, `<Match>`) render no element, so they add no depth: replacing a `.map()` with `<For>` never makes a component deeper. A nested component definition does not count either.

```tsx
// "JSX is nested 7 deep (max 6). Extract the `<table>` subtree into its own component."
function InvoiceLines(props: { items: InvoiceItem[] }) {
  return (
    <table>
      <tbody>
        <For each={props.items} by={(it) => it.id}>
          {(it) => (
            <tr>
              <td>{it.description}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
```

### `pyreon/no-nested-ternary-branch`

No ternary inside another ternary's **test or consequent**. A flat chain in the alternate position reads like a `switch` and is fine, up to `maxOutcomes` (4; 3 in strict).

```ts
// flagged — the inner branch is read inside-out
const label = ready ? (failed ? 'failed' : 'done') : 'waiting'

// fine — a flat chain
const label = !ready ? 'waiting' : failed ? 'failed' : 'done'
```

## Opting out

- **One line:** `// pyreon-lint-disable-next-line pyreon/max-jsx-depth -- table mirrors the spec layout`. The reason after `--` is optional but worth writing.
- **One file:** `// pyreon-lint-disable-file pyreon/padding-before-return -- hot path, kept dense on purpose`. The reason is **required**: a file-level disable without one is ignored and reported.
- **A directory:** `["warn", { "exemptPaths": ["src/generated/"] }]` on the rule.
- **Generated files** are skipped automatically: any file whose first three lines contain `@generated`, `GENERATED by` or `do not edit`.
- **oxlint:** `/* oxlint-disable max-lines-per-function -- reason */` at the top of a file, or an `overrides` entry in `.oxlintrc.json`.

## What it deliberately does not enforce

| Not enforced | Why |
| --- | --- |
| Magic numbers | Chart layout, bit flags and buffer sizes make literals legitimate; extracting them mostly creates names that restate the value. |
| `is` / `has` prefixes on booleans | Adjective names (`open`, `loading`) read naturally as `open()`. |
| `handleX` naming | There is no convention worth forcing, and most handlers are inline. |
| Exports at the end of a file | `export function` next to its implementation is easier to read. |
| `printWidth: 80` | Width 100 reads fine; 80 would rewrap most of a codebase for nothing. |
| React plugin rules | They flag correct Pyreon code; the Pyreon rules above replace the useful ones. |

## Adopting it in an existing codebase

Run `oxfmt && oxlint --fix && pyreon-lint --fix .` once: every spacing finding fixes itself. What remains is judgement work (JSX depth, nested ternaries, size limits). To adopt without one large change, freeze today's findings per file and let them only go down: this repository does exactly that with `readable-baseline.json`, checked by `scripts/check-readable-ratchet.ts`, so new and edited code meets the preset while old code is fixed as it is touched.
