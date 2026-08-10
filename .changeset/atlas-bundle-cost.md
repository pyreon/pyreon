---
'@pyreon/atlas': minor
---

Add `bundleCostPlugin` — what importing each component costs a consumer, minified + gzipped.

**Opt-in, not in the recommended bundle.** Each measurement is a real bundler run: on a 108-component library that is 108 builds against a scan that is otherwise ~2s. A metric that multiplies scan time by an order of magnitude has to be asked for, not inflicted — and it reports a number rather than a bug, so paying for it on runs nobody reads buys nothing.

**What the number means.** Workspace packages and bare dependencies are external, exactly as the repo-wide budget gate measures them, so this is "the bytes this component's own source contributes" — not the page weight of rendering it. A component rendering through half of `@pyreon/elements` measures small, because that cost belongs to elements and is counted there. Charging every component for the same shared runtime would make the numbers useless for the only thing they are good for: comparing components against each other.

**A `decorate` hook, not a `verify` check.** There is no threshold at which a component's size is WRONG, so making it a check would force a pass/fail on a measurement and the only honest verdict would be a permanent `pass` — the false-green shape the verdict model exists to avoid.

**Needs Bun.** `Bun.build` is the only bundler it uses, so `bun atlas scan` measures and `npx atlas scan` (node) does not. Rather than fail quietly it SAYS so, once per run, through `onUnavailable` — an opt-in capability that silently produces nothing is the same false-quiet as a gate that scans zero files and reports a clean pass. Adding esbuild as a dependency would fix it at the cost of real install weight on every Atlas user for a metric most never read; reusing the project's own Vite (already an optional peer, already loaded by the module loader) is the better door and belongs in its own change.

Unmeasurable is ABSENT, never `0` — a zero would read as "free", the most misleading number available.
