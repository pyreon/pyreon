# Kanban audit — walls hit

Following hn-clone (PR #960), this is the second user-shape audit (T4.2).
Goal: pick a domain (kanban board) that exercises a different DND shape
(cross-column drag-and-drop) plus a fresh combination of fundamentals
(`@pyreon/state-tree` schema-mode, `@pyreon/url-state`, `@pyreon/hooks`,
`@pyreon/dnd`, `@pyreon/toast`) and document every wall that surfaces.

Walls **W1-W17** are from the hn-clone audit (`examples/hn-clone/WALLS.md`).
This file covers **W18-W23**.

## Status

| Wall | Severity | Status in this PR |
| --- | --- | --- |
| W18 | medium | **Fixed** — `useSortable({ groupId, onCrossListDrop, onCrossListReceive })` opt-in |
| W19 | low | **Fixed** — Zero plugin auto-injects entry script (`config.entryClient`) |
| W20 | low | **Covered by existing rule** `pyreon/no-map-in-jsx` (test extended for the reactive-accessor shape) |
| W21 | medium | **Fixed by W23 patch** — bisect-verified in `w21-for-computed-indirection.browser.test.ts` |
| W22 | medium | **Documented** — For JSDoc + ForProps.children JSDoc carry the canonical fix pattern |
| W23 | P0 | **Fixed** — `runUntracked` suspends `_innerEffectCollector` (root-cause fix in `tracking.ts`) |

---

## W18 — `useSortable` is single-list-only — FIXED

**Symptom.** Card dragged out of one column couldn't drop into another column.
The drop indicator never appeared on the target column's cards.

**Cause.** `useSortable` (from `@pyreon/dnd`) assigns each instance a
per-mount `SORT_ID` and its built-in `canDrop` rejects drops whose source's
`SORT_ID` doesn't match the destination's.

**Fix in this PR.** `useSortable` now accepts an optional `groupId` —
two instances with the same `groupId` share a drop universe. The source
calls back `onCrossListDrop(item)` to remove; the destination calls back
`onCrossListReceive(item, index)` to insert. No `groupId` keeps the
per-instance isolation (backward compat).

```tsx
const a = useSortable({
  items: colA, by: c => c.id, onReorder: setColA,
  groupId: 'kanban',
  onCrossListDrop: item => setColA(colA().filter(c => c.id !== item.id)),
})
const b = useSortable({
  items: colB, by: c => c.id, onReorder: setColB,
  groupId: 'kanban',
  onCrossListReceive: (item, index) => {
    const next = [...colB.peek()]
    next.splice(index, 0, item)
    setColB(next)
  },
})
```

Reference: `packages/fundamentals/dnd/src/use-sortable.ts`. Tests:
`integration.test.ts` — 2 new specs (cross-list drop accepts + cross-list
isolation when groupId omitted).

---

## W19 — Zero SPA `<!--pyreon-scripts-->` doesn't auto-inject `entry-client.ts` — FIXED

**Symptom.** Fresh `examples/kanban` page rendered blank. SSR shell loaded
fine; no client JS executed.

**Cause.** Zero's SPA-mode HTML template's `<!--pyreon-scripts-->`
placeholder was only used for loader-data inline script — Zero did NOT
auto-inject `<script type="module" src="/src/entry-client.ts">`.

**Fix in this PR.** `@pyreon/zero`'s vite plugin now has a
`transformIndexHtml: { order: 'pre', handler }` hook that auto-injects
the entry-client script BEFORE the `<!--pyreon-scripts-->` placeholder.

Configurable via `zero({ entryClient: '/src/main.ts' })` or disable with
`zero({ entryClient: false })`. Default is `/src/entry-client.ts`.

The injection is idempotent — skipped when the html already references
the entry script (so existing apps with the manual tag continue to work).

Reference: `packages/zero/zero/src/vite-plugin.ts` `transformIndexHtml`.
Tests: `packages/zero/zero/src/tests/auto-inject-entry-client.test.ts`
(5 specs: injection, custom path, opt-out, idempotent, no-op without placeholder).

---

## W20 — `.map()` inside a reactive accessor remounts on every change — COVERED

**Symptom.** Initial wiring used `<div class="kanban-board">{() => filteredColumns().map(c => <BoardColumn column={c} />)}</div>`. Every keystroke
in the search field re-mounted ALL columns + cards.

**Cause.** Same root cause as `<For>`'s entire reason for existence —
`.map()` returns a fresh array on every accessor invocation, so the
runtime tears down and re-mounts every child.

**Status.** The `pyreon/no-map-in-jsx` lint rule already catches this
shape. This PR extends the rule's test suite with the W20-specific
reactive-accessor shape (`{() => items().map(...)}` — the kanban
anti-pattern). Use `<For each={fn} by={fn}>` for proper keyed
reconciliation.

**Framework gap.** Lint rule for `.map(...VNode)` inside JSX accessor
expressions in components (with the `<For>` `each`/`by` suggestion). The
existing `pyreon-lint` rule set is the right home.

**Fix scope.** New `@pyreon/lint` rule: `pyreon/no-map-in-reactive-children`.

---

## W21 — `<For each>` reading through a column-level `computed()` loses tracking

**Symptom.** Inner `<For each={() => column()?.cards ?? []}>` (where
`column = computed<Column>(() => board.columns().find(c => c.id === id))`)
DID NOT update the rendered cards when `board.columns()` changed.

Reading `board.columns().find(...)?.cards` INLINE inside the `each`
accessor (no intermediate computed) works correctly.

**Workaround in this example.** Inline the lookup at the For's `each`:

```tsx
<For
  each={() =>
    (board.columns() as Column[]).find((c) => c.id === props.columnId)?.cards ?? []
  }
  by={(c) => c.id}
>
```

**Status: FIXED by the W23 patch.** When the W21 shape occurs INSIDE a
`<For>`-mounted component (the actual kanban scenario — `<BoardColumn>`
inside an outer `<For>` over column IDs, with a column-level
`computed()` for its own data), the bug was actually W23 — the outer
For's re-run was disposing the inner `computed`'s subscribers via the
inner-effect collector mishap.

Bisect-verified at unit + integration layers. The standalone "For with
sibling computed" shape (without an outer For mutating its source)
always worked — the bug only manifested under the kanban shape (For
inside For, outer source mutates).

Reference: `packages/core/runtime-dom/src/tests/w21-for-computed-indirection.browser.test.ts`
covers BOTH shapes (top-level + nested-in-For).

---

## W22 — `<For>` keyed reuse doesn't propagate prop updates to existing children — DOCUMENTED

**Symptom.** Initial wiring was `<For>{(col) => <BoardColumn column={col} />}</For>`
— passing the full `Column` object as a prop. After `addCard()`, the new
card never appeared in the rendered column. The `<For>`'s `each` accessor
DID see the new array, but `<BoardColumn>` received the SAME `column` prop
identity it had at first mount.

**Cause.** `mountFor` reuses cached entries when the `by` key matches
(`if (cache.has(key)) continue`). The component receives its prop at first
mount and never sees the parent's updated prop afterwards. This is the
canonical Pyreon pattern for keyed-list children — "components run once"
means the child callback's `item` parameter is captured at first mount,
not a live accessor.

**Status: DOCUMENTED in this PR.** Both `For`'s docstring and
`ForProps.children` JSDoc now carry a prominent warning + the canonical
fix pattern (pass ID, child reads its own data from store inside reactive
JSX accessors). Reference: `packages/core/core/src/for.ts`.

**Why doc-only.** Runtime prop-update on key match WOULD fix the
symptom but breaks Pyreon's "components run once" mental model AND
the perf advantage of For (skip render when key matches). The Solid-
canonical solution (pass `() => T` accessor to the child) is a breaking
API change that's deferred to a future major. The current canonical
pattern (ID-passing) is performant, idiomatic, and now documented at
the source.

---

## W23 — Effects in `<For>` child components lose ALL subscriptions after the first re-run from the For's source signal

**Status: FIXED in this PR.** Root-cause patch: `runUntracked` now
suspends `_innerEffectCollector` in lock-step with `activeEffect`. See
"Fix" section below.

**This was the highest-severity wall hit in this audit.** Reproduced
with a 30-line test (`packages/core/runtime-dom/src/tests/w23-child-effect-loss.browser.test.tsx`).

**Symptom.** In `BoardColumn`:

1. Initial mount: every effect (the For's `each`, JSX accessors,
   `useDroppable`'s reactive bindings) subscribes correctly to the signals
   it reads.
2. User clicks **Add card**. `board.addCard()` writes to `columns`.
3. The inner `<For>`'s effect re-runs from the `board.columns()` notify,
   re-tracks, mounts the new card. Looks correct.
4. User clicks **Delete card**. `board.removeCard()` writes to `columns`.
5. The inner `<For>`'s effect DOES NOT re-run. The deleted card's `<div>`
   stays in the DOM, but its title becomes empty (because the CardItem's
   `card = computed(() => board.columns().find(...))` IS still subscribed
   to columns, the title's render effect IS still subscribed to that
   computed — but the For's effect is NOT subscribed to `board.columns()`
   anymore).
6. The same is true for OTHER signals: `addOpen.set(true)` (a local signal
   in BoardColumn) no longer triggers the conditional re-render between
   "+ Add a card" button and the add-card form. The render effect for the
   `{() => addOpen() ? <form/> : <button/>}` accessor has lost its
   subscription to `addOpen`.

**Reproducible.** Confirmed via the parallel-effect probe in BoardColumn:

```tsx
effect(() => {
  const t = filterTerm() // module-level shared signal
  const c = board.columns().find(x => x.id === props.columnId)?.cards.length ?? 0
  console.log(`[parallel] term=${t} cards=${c}`)
})
```

This plain effect (NOT a For's effect) fires correctly on initial mount,
on filterTerm.set BEFORE addCard, and on board.columns notify (the
addCard itself). After that one re-run, it never fires again — neither on
filterTerm.set NOR on subsequent board.columns notifies.

Equivalent control: an `effect()` defined OUTSIDE any `<For>` (at the top
level of `BoardPage`) reading the SAME signals DOES retain its
subscription across all writes. The bug is scoped to effects defined
within components mounted as `<For>` children.

**Hypothesis.** When the outer For's effect re-runs from its source
signal (`columnIds()` → reads `board.columns()`), some piece of the
child-component effects' tracking state is being torn down. The
`runUntracked` wrap around child mounts (in `mountFor`) prevents NEW
subscriptions from leaking up; it may not preserve EXISTING subscriptions
in the child effects across the outer re-run.

Possibly related to PR #490's `runUntracked` fix in `mountFor` — that fix
prevents OVER-tracking. This bug looks like the inverse — UNDER-tracking
on re-run.

**Workaround in this example.** None that preserves the full UX. The
example renders correctly on initial mount, supports a single add OR a
single delete on a fresh load (whichever happens first), but breaks on the
SECOND state-tree mutation. Subsequent mutations work data-wise (the
state-tree IS updated, the URL IS synced) but the DOM stops re-rendering.

**With the fix landed, the kanban example is a working app** —
multi-mutation sequences work, filter propagates through child columns
correctly.

**Root cause.** `effect.ts` maintains a thread-local
`_innerEffectCollector` array. When an `effect()` runs, it sets the
collector to its own `myInners` and any nested `effect()` calls during
its body get auto-registered there. On the outer effect's NEXT re-run,
`runCleanup()` disposes EVERY entry in `innerEffects` — which is
correct for legitimately-nested effects but WRONG for effects created
during work that explicitly opted out of the outer tracking context
via `runUntracked`.

`mountFor` wraps its child mount work in `runUntracked` to prevent
NEW signal-subscription leaks upward (PR #490). But `runUntracked` in
`tracking.ts` only suspended `activeEffect`, not `_innerEffectCollector`
— so child component effects mounted under the `runUntracked` wrap
were still auto-registered as inner effects of the For's outer effect.
On the next mutation of the For's source signal, those child effects
got disposed.

**Fix.** `_innerEffectCollector` was moved from `effect.ts` to
`tracking.ts` (the "tracking context" namespace) and `runUntracked` now
suspends BOTH `activeEffect` AND the collector. effect.ts accesses the
collector through `getInnerEffectCollector` / `setInnerEffectCollector`
getter/setter functions. Reference:
`packages/core/reactivity/src/{tracking,effect}.ts`.

**Bisect-verified** at the unit + integration layers:
- Unit test `runtime-dom/src/tests/w23-child-effect-loss.browser.test.tsx`
  fails with `runUntracked` reverted to only-suspend-`activeEffect`.
- Real-Chromium kanban smoke (`bun /tmp/kanban-full-e2e.mjs`) — multi-
  mutation sequence (3 adds + 3 deletes + filter + reload) — all green
  with the fix, broken without it.

**Test coverage.** The unit test asserts the contract directly: a row
effect inside a `<For>` mounted component must retain its subscription
to an external signal across the For's source-signal re-fires. Locks
in the regression at the lowest layer.

---

## What this audit confirms

- Hn-clone-style read-only feeds with `<For>` didn't surface W23 because
  their source signal (`stories()`) is set once and never re-fires.
- W23 surfaced under **per-row mutations of the For's source signal** —
  the kanban shape (add/delete/move cards rewriting `board.columns()`).
- W23 was a SHOWSTOPPER for any Pyreon app that wants a Trello/Notion/
  Linear/spreadsheet/task-list UX. **Fixed in this PR.**

## What this PR ships

1. ✅ W18 — `useSortable({ groupId })` for cross-list drops
2. ✅ W19 — Zero plugin auto-injects entry-client script
3. ✅ W20 — verified `pyreon/no-map-in-jsx` covers it (test extended)
4. ✅ W21 — fixed by W23 patch (bisect-verified)
5. ✅ W22 — documented in For JSDoc at the source
6. ✅ W23 — root-cause fix in `runUntracked` (the P0 reactivity bug)

Audit time: ~9h. Walls surfaced: 6 (W18-W23). Framework bugs fixed: 1
P0 (W23) + 2 ergonomics (W18, W19). Doc-only closures: 1 (W22).
Confirmed coverage: 1 (W20).
