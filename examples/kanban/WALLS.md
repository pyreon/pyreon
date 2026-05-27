# Kanban audit — walls hit

Following hn-clone (PR #960), this is the second user-shape audit (T4.2).
Goal: pick a domain (kanban board) that exercises a different DND shape
(cross-column drag-and-drop) plus a fresh combination of fundamentals
(`@pyreon/state-tree` schema-mode, `@pyreon/url-state`, `@pyreon/hooks`,
`@pyreon/dnd`, `@pyreon/toast`) and document every wall that surfaces.

Walls **W1-W17** are from the hn-clone audit (`examples/hn-clone/WALLS.md`).
This file covers **W18-W23**.

---

## W18 — `useSortable` is single-list-only

**Symptom.** Card dragged out of one column couldn't drop into another column.
The drop indicator never appeared on the target column's cards.

**Cause.** `useSortable` (from `@pyreon/dnd`) assigns each instance a
per-mount `SORT_ID` and its built-in `canDrop` rejects drops whose source's
`SORT_ID` doesn't match the destination's. This makes every sortable list a
private universe — fine for "reorder these stories" (hn-clone-style), wrong
for "move cards between columns" (Trello/Notion/Linear-style).

**Workaround in this example.** Drop down to `useDraggable` + `useDroppable`
directly. Each card is BOTH draggable AND droppable (for inter-card reorder
within the same column); each column is droppable (for column-edge append).
Cross-column drag is just `board.moveCard(cardId, toColumnId)` in the drop
handler.

**Framework gap.** `useSortable` should accept a `groupId` option that lets
multiple sortable instances participate in a shared drop universe (the
standard pragmatic-drag-and-drop / dnd-kit / react-beautiful-dnd shape).
With `groupId` matched, `canDrop` would gate on `data.kind` only, not
`SORT_ID`. Doc note in `@pyreon/dnd` README that the single-list constraint
exists today.

**Fix scope.** Single-PR change in `@pyreon/dnd`: extend `useSortable`'s
`canDrop` to accept a sibling group via an optional `groupId` argument.

---

## W19 — Zero SPA `<!--pyreon-scripts-->` doesn't auto-inject `entry-client.ts`

**Symptom.** Fresh `examples/kanban` page rendered blank. SSR shell loaded
fine; no client JS executed.

**Cause.** Zero's SPA-mode HTML template has a `<!--pyreon-scripts-->`
placeholder. It's documented as "Zero will inject the right scripts here."
At build/dev time Zero emits the styler stylesheet but does NOT auto-inject
`<script type="module" src="/src/entry-client.ts"></script>`.

**Workaround.** Manually add `<script type="module" src="/src/entry-client.ts"></script>`
to `index.html` right after `<!--pyreon-scripts-->`. (This matches what
`examples/hn-clone/index.html` does — once you see it there, it's obvious;
not documented anywhere.)

**Framework gap.** Either:
- Zero's vite plugin transforms `<!--pyreon-scripts-->` into the full set of
  required tags (entry-client + styler hook + HMR runtime), OR
- `index.html` is generated rather than user-authored, OR
- The placeholder is renamed and documented as "manual entry-client required."

**Fix scope.** `@pyreon/zero` vite plugin's `transformIndexHtml`: detect the
placeholder, inject `<script type="module" src="/${entryClient}"></script>`
where entryClient defaults to `src/entry-client.ts`.

---

## W20 — `.map()` inside a reactive accessor remounts on every change

**Symptom.** Initial wiring used `<div class="kanban-board">{() => filteredColumns().map(c => <BoardColumn column={c} />)}</div>`. Every keystroke
in the search field re-mounted ALL columns + cards.

**Cause.** Same root cause as `<For>`'s entire reason for existence —
`.map()` returns a fresh array on every accessor invocation, so the
runtime tears down and re-mounts every child. Not a bug, but it's an easy
mistake when prototyping.

**Workaround.** Use `<For each={fn} by={fn}>` — proper keyed reconciliation.

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

**Framework gap.** Likely related to how the compiler auto-calls signal
declarations + how `mountFor`'s effect re-tracks via `source()`. The
indirection through a `computed()` declared in the SAME function should
work — both forms should track equally.

**Fix scope.** Investigate `mountFor`'s effect tracking + the compiler's
auto-call pass for `column` references inside For's `each` accessor
arguments.

---

## W22 — `<For>` keyed reuse doesn't propagate prop updates to existing children

**Symptom.** Initial wiring was `<For>{(col) => <BoardColumn column={col} />}</For>`
— passing the full `Column` object as a prop. After `addCard()`, the new
card never appeared in the rendered column. The `<For>`'s `each` accessor
DID see the new array, but `<BoardColumn>` received the SAME `column` prop
identity it had at first mount.

**Cause.** `mountFor` reuses cached entries when the `by` key matches
(`if (cache.has(key)) continue`). The component receives its prop at first
mount and never sees the parent's updated prop afterwards. This is the
documented Pyreon pattern for keyed-list children — but it's not obvious
on first encounter, and the failure mode is silent (renders OLD data).

**Workaround in this example.** Pass only the ID; child looks up its own
data from the global store:

```tsx
<For each={() => columnIds()} by={(id) => id}>
  {(id) => <BoardColumn columnId={id} />}
</For>
```

Inside `BoardColumn`, read `board.columns()` directly using `props.columnId`.

**Framework gap.** Either:
- Document this pattern prominently in `@pyreon/core` `<For>` reference, with
  a worked example of the foot-gun and the ID-passing fix, OR
- `mountFor` updates the cached entry's prop reference on key match (the
  React/Solid behaviour), OR
- Add a lint rule for "passing object prop to `<For>` keyed child that's
  derived from the same source the For tracks."

**Fix scope.** Doc-only is the minimum; runtime prop-update on key match is
the cleanest UX fix but breaks the current "components run once" mental
model.

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

**Therefore the kanban example ships as a "walls demo," not a working
app.** The filter input is left visible to exercise `useUrlState`
end-to-end (URL updates work fine), but card filtering is unwired pending
W23.

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

## Recommended next steps (post-fix)

1. ~~Fix W23~~ ✅ (this PR — `runUntracked` now suspends inner-effect
   collector alongside activeEffect).
2. Add a doc note to `<For>` reference for W22: "Children passed by-key
   see prop updates only on first mount; structure children to read
   their own data from the store."
3. Add a lint rule for `.map(...VNode)` in reactive children (W20).
4. Extend `useSortable` with a `groupId` option (W18).
5. Auto-inject the entry script in Zero's `<!--pyreon-scripts-->` (W19).

Audit time: ~6h. Walls surfaced: 6 (W18-W23). Framework bugs fixed: 1
(W23). The audit is doing its job.
