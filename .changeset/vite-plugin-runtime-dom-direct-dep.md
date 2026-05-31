---
'@pyreon/vite-plugin': patch
---

fix(vite-plugin): move `@pyreon/runtime-dom` from `peerDependencies` → `dependencies`

The peer relationship was triggering a `major`-bump cascade across the entire 62-package `fixed` group on every release-PR run. Root cause:

1. `@pyreon/runtime-dom` minor-bumps (e.g. `0.25.1 → 0.26.0` from `bind-text-member-expr-widen`).
2. In 0.x semver, that bump **leaves** the `^0.25.0` range.
3. `@changesets/assemble-release-plan`'s peer-dependency-cascade logic (`getDependencyVersionRanges` + `incrementBumpType`) interprets "peer range left" as a breaking change for `@pyreon/vite-plugin` → cascades **MAJOR**.
4. `@pyreon/vite-plugin` is in the `fixed` group → `matchFixedConstraint` picks the highest bump (major) and applies it to all 62 group members.
5. Major on a 0.x package → **`1.0.0`**.

Pyreon is explicitly 0.x pre-production-ready; the unintended `1.0.0` cascade contradicted that policy. The `scripts/cap-changeset-bumps.ts` guard catches **explicit** `: major` lines in changeset frontmatter, but the cascade above happens at the release-plan level after changesets are read — outside the script's reach.

Why moving from `peerDependencies` to `dependencies` is the correct structural fix (not a workaround):

- `@pyreon/vite-plugin`'s compiled output emits imports targeting `@pyreon/runtime-dom` primitives (`_tpl`, `_bind`, `_rsCollapse`, etc.). Without runtime-dom installed, those imports unresolve and the consumer's build fails. That's the contract of a regular runtime `dependencies` entry, not a peer.
- Every Pyreon app already installs `@pyreon/runtime-dom` directly (or transitively via `@pyreon/zero`); the peer requirement added zero practical value over a direct dep.
- The peerDep was likely an early design carryover from when vite-plugin was scoped narrower.

Side effect: vite-plugin's `node_modules` now installs runtime-dom transitively rather than expecting the consumer to provide it. For typical Pyreon apps (which already have runtime-dom in their own dependencies), this is a no-op — npm/pnpm/bun all dedupe to a single hoisted copy.

Verified end-to-end via `bunx changeset version` against the current 48 pending changesets:
- Before: all 62 fixed-group packages bumped `0.25.1 → 1.0.0`.
- After: bump levels respect the actual changeset declarations — `@pyreon/compiler` → `0.26.0` (minor), `@pyreon/runtime-dom` → `0.26.0` (minor), `@pyreon/vite-plugin` → `0.26.0` (cascaded minor via fixed-group, not major).

Unblocks PR #909 (`chore: version packages`) from publishing an unintended 1.0.0.
