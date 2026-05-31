import { For, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

// CONTRACT — bug surfaced by `scripts/leak-sweep.ts` against the
// `domConditionalToggle-1000` journey; now fixed.
//
// **Bug shape (pre-fix):**
//
//   [pyreon] Unhandled effect error: NotFoundError: Failed to execute
//   'insertBefore' on 'Node': The node before which the new node is
//   to be inserted is not a child of this node.
//   at mountReactive (...)
//   at mountChild (...)
//
// Trigger: N `<Show when={signal[i]}>` components inside a `<For>`,
// then batched signal writes flip every `signal[i]` false → true → false.
//
// **Root cause:** `mountReactive` captured `parent` in its setup closure.
// `mountFor` creates child DOM into a DocumentFragment, then moves the
// fragment contents to the live parent via
// `liveParent.insertBefore(frag, tailMarker)`. After the move, every
// `mountReactive` (e.g. the one created when Show's `when` accessor
// returned the function child) had a stale `parent` reference pointing
// at the now-empty fragment, while its marker had been carried with the
// fragment's contents to `liveParent`. On the next signal flip, the
// effect re-ran and called `parent.insertBefore(node, marker)` against
// the stale fragment, throwing NotFoundError because `marker` was no
// longer a child of `parent`. The throw landed in Pyreon's
// "unhandled effect error" path → console.error + loss of For's
// children from the DOM (final count dropped to 0).
//
// **Fix:** `mountReactive` now reads `marker.parentNode` at each effect
// run (with the closure-captured `parent` as a detached-marker
// fallback). The marker is moved by the same `insertBefore(frag, ...)`
// as the rest of the fragment contents, so its live `parentNode` is
// always the correct live parent.
//
// Reproducer: `bun run perf:leak-sweep --app perf-dashboard --journeys domConditionalToggle-1000`

describe('mountReactive: <Show> inside <For> under batched signal toggles', () => {
  it('single <Show> with function-child handles toggle cycles correctly (sanity, works today)', async () => {
    // 1 Show, 1 signal. Should always work — no For wrapper, no batched
    // multi-signal flush. Proves the bug is specifically the For-of-Show
    // interaction, not Show itself.
    const flag = signal<boolean>(true)
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { id: 'root' },
        h(Show, {
          when: () => flag(),
          children: () => h('div', { 'data-id': '0' }, 'Visible'),
        }),
      ),
    )
    await flush()
    expect(container.querySelectorAll('div[data-id]')).toHaveLength(1)
    flag.set(false)
    await flush()
    expect(container.querySelectorAll('div[data-id]')).toHaveLength(0)
    flag.set(true)
    await flush()
    expect(container.querySelectorAll('div[data-id]')).toHaveLength(1)
    unmount()
  })

  it(
    'CONTRACT: <For> + <Show> mass-toggle does not throw NotFoundError or lose children',
    async () => {
      // 100 Show items inside a For. Each Show's `when` is its own signal.
      // The function child `{() => <div/>}` exercises the function-child
      // mountReactive path that's the actual failure site.
      const flags = Array.from({ length: 100 }, () => signal<boolean>(true))
      const indices = Array.from({ length: 100 }, (_, i) => i)

      const { container, unmount } = mountInBrowser(
        h(
          'div',
          { id: 'root' },
          For({
            each: indices,
            by: (i: number) => i,
            children: (i: number) =>
              h(
                Show,
                {
                  when: () => (flags[i] as ReturnType<typeof signal<boolean>>)(),
                  children: () => h('div', { 'data-id': String(i) }, `Visible ${i}`),
                },
              ),
          }),
        ),
      )
      await flush()
      try {
        // Sanity: all 100 visible at mount.
        expect(container.querySelectorAll('div[data-id]')).toHaveLength(100)

        // ONE mass-toggle cycle: false → true.
        for (const f of flags) f.set(false)
        await flush()
        expect(container.querySelectorAll('div[data-id]')).toHaveLength(0)

        for (const f of flags) f.set(true)
        await flush()

        // REGRESSION LOCK for the closure-captured-`parent` bug class
        // (fixed in PR #776 — `mountReactive` now reads
        // `marker.parentNode ?? parent` at each effect run, so the live
        // parent is used after `mountFor`'s frag-then-move). Pre-fix
        // shape: framework throws NotFoundError inside `mountReactive`'s
        // setup, the entire reactive subtree is lost, count drops to 0.
        // Sibling lock: `mountKeyedList` (#783, same bug class, different
        // primitive) — see `keyed-array-in-for-batched-toggle.browser.test.ts`.
        // Anti-pattern catalog entry: "Closure-captured `parent` in a
        // reactive mount loop becomes stale after a sibling reconciler
        // moves the markers" in `.claude/rules/anti-patterns.md`.
        expect(container.querySelectorAll('div[data-id]')).toHaveLength(100)
      } finally {
        unmount()
      }
    },
  )
})
