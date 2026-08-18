---
'@pyreon/compiler': minor
'@pyreon/vite-plugin': patch
'@pyreon/zero': patch
---

perf(compiler): mirror `templatizeComponentChildren` into the native (Rust) backend

`templatizeComponentChildren` shipped opt-in and, while it was on, FORCED the
compiler's JS backend — deliberately, so the two backends could not disagree and
a bisect of the feature could not pass against a "reverted" build. That made
enabling the option cost a ~10x slower transform for the whole build.

The native backend now emits the same bytes, so the force is gone.

**Parity.** 1,183 real `.tsx` files across the repo compile byte-identically at
the default (3,549 comparisons, 0 differences — and the same harness reports 209
differences with the option on, so it discriminates). The seeded differential
fuzz gains a fourth mode, `client-tpl-components`, proven at **20,000 seeds x 4
modes** with the grammar extended to the shapes this feature's gate
discriminates: self-closing component children, member/namespaced tags
(`<Ns.Comp/>`, which `jsxTagName` reports as `''`), bare and nested fragment
children, and runs of 1-3 component siblings with and without interleaved static
content. `native-equivalence.test.ts` gains a 29-case hand corpus for the shapes
a reader needs to see named.

The fuzz mode also asserts it is ALIVE — that the option changes the emit for a
real fraction of seeds, in BOTH shapes (append `_mountChild` and placeholder
`_mountSlot`). A differential mode that never changes the output would pass
byte-identically against a backend where the option was never implemented.

**Transform cost.** 173 real `.tsx` files (333 KiB), 9 interleaved passes,
median: native 3.2ms off / 3.8ms on; JS 34.5ms off / 37.4ms on. So the forced-JS
path cost **9.7x** with the option on, and that is what is removed. The option
itself costs native ~1.22x, because elements that used to bail early now take
the real template path — small in absolute terms and honest about doing more
work.

**The runtime win survives, by construction rather than by re-measurement.**
Building `examples/benchmark` with the option on produces a byte-identical
bundle from both backends (`sha256 9400e813…` from each; the JS arm verified to
really be JS by its ~10x slower transform). Re-measured anyway on the native
build: the 2,047-component deep-tree mount goes **4.57ms → 3.90ms (−14.7%)**,
CIs strictly disjoint, controls within 2.3%. `ui-showcase-regression` is **26/26
with the option ON** — verified live by the dev server's own output showing real
`<Title>`/`<Paragraph>` component children absorbed into the parent `_tpl` and
mounted through phase-1 refs.

**Still default OFF.** This removes one of the two blockers `#2914` named. The
other is unchanged and independent: a `_tpl` result is SWAPPED at hydration, so
every element this newly templatizes stops adopting its SSR DOM. The plugin's
one-time warning keeps that half and drops the now-false JS-backend half.
