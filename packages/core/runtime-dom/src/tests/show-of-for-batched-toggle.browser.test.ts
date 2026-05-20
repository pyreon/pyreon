import { For, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

// CONTRACT — proven-but-unfixed bug surfaced by `scripts/leak-sweep.ts`
// against the `domConditionalToggle-1000` journey. Using the project's
// `it.fails()` pattern: the spec stays GREEN while the bug persists
// (the assertion deliberately captures the broken behavior), and
// auto-flags FAILURE when the real fix lands — the signal to flip
// `it.fails(...)` → `it(...)` and verify the spec passes the correct
// assertion.
//
// **Bug shape:**
//
//   [pyreon] Unhandled effect error: NotFoundError: Failed to execute
//   'insertBefore' on 'Node': The node before which the new node is
//   to be inserted is not a child of this node.
//   at mountReactive (...)
//   at mountChild (...)
//
// Trigger: N `<Show when={signal[i]}>` components inside a `<For>`,
// then batched signal writes flip every `signal[i]` false → true → false.
// Under toggle pressure the inner mountReactive (created when Show's
// `when` accessor returns the function child) receives an `anchor`
// whose `parentNode` is a DIFFERENT HTMLDivElement than `parent` — the
// anchor has been moved to another parent by a sibling effect's
// cleanup in the same flush. The thrown NotFoundError lands in
// Pyreon's "unhandled effect error" path → console.error + complete
// loss of the For's children from the DOM (final count is 0, not N).
//
// **Investigation status (incomplete):**
//   - Single `<Show>` (no For) handles toggles correctly — see the
//     sanity test below. The bug requires the For wrapper.
//   - A defensive guard `anchor.parentNode === parent` before
//     insertBefore was tried; it prevents the THROW but children
//     still vanish because the underlying state (anchor relationships
//     across For + mountReactive layers) is corrupted by the
//     stale-anchor sequence — guard is a band-aid, not a fix.
//   - Root cause is somewhere in For-of-Show + batched-flush
//     interaction. The For doesn't reconcile during a Show toggle
//     (its `indices` array is stable), so something else is moving
//     the anchor between parents mid-flush.
//
// **For future investigators:**
//   1. Run `bun run perf:leak-sweep --app perf-dashboard --journeys domConditionalToggle-1000`
//      → reproduces in ~700ms with full stack trace
//   2. Trace how For's reconciler passes per-child anchors AND how
//      Show's mountReactive interacts with the anchor across flushes
//   3. When the fix lands, change `it.fails(...)` to `it(...)` and
//      verify with `bun run test:browser`

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

  it.fails(
    'CONTRACT: <For> + <Show> mass-toggle should not throw NotFoundError or lose children',
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

        // **Bug fires here**: pre-fix the framework throws NotFoundError
        // inside mountReactive's setup, the entire reactive subtree is
        // lost, and the count drops to 0. The CONTRACT assertion is
        // "should be 100"; today the framework returns 0, so `it.fails`
        // is the correct marker. When the real fix lands, this
        // assertion will pass and the test will fail — signal to flip
        // the marker.
        expect(container.querySelectorAll('div[data-id]')).toHaveLength(100)
      } finally {
        unmount()
      }
    },
  )
})
