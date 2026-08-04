---
'@pyreon/atlas': minor
---

Same-named components in different files no longer vanish.

Found by pointing Atlas at a real 78-package monorepo instead of a fixture.
Discovery deduped by NAME alone within a scan root, so every same-named
component after the first was silently dropped. Measured there: **343 of 1378
components were reaching the catalog.** A per-page `MainFilter` existed in 15
directories and the catalog showed one; `ChartsRow` in 6; a generated icon
package had 995 files each exporting `Glyph`, of which one survived.

This is the exact silent-drop class `project` fixed ACROSS packages — left in
place WITHIN one, on the reasoning that a directory cannot hold two exports with
the same identifier. True, and irrelevant: a scan root holds many directories.

A component's identity now falls back through directory, then filename, and only
when a name genuinely collides:

- `MainFilter` → `MainFilter@…/RiskFindings` vs `MainFilter@…/ThreatFindings`
- `Glyph` → `Glyph@write` vs `Glyph@azure-virtual-networks` (995 icons share one
  `generated/` directory, so the directory cannot tell them apart and the
  filename is their real identity)

Filename is tried SECOND because `Button/index.tsx` and `Button.tsx` are the same
component to a reader, and leading with it would split a component from itself.
A project with one file per name keeps byte-identical keys.

On that repo: **343 → 1378 components, 405 → 1451 scenarios, and the unmatched
report fell from 1112 files to 69.**

**Prop types imported from a SIBLING workspace package now resolve.**
`import type { Props } from '@acme/ui-core'` is the dominant shape in a
monorepo, and those components landed in the catalog found-but-contract-less.

`node_modules` is still not followed — that needs the real module-resolution
algorithm and guessing produces confident wrong answers. A workspace package is
a different question with an exact answer: the workspace declares where its
packages are, each declares its `name`, and matching the two is a lookup. Root
imports and subpaths both resolve, longest-package-name-first so `@a/ui-grid` is
never matched by a lookup for `@a/ui`.

Also fixed, both surfaced by the same run:

- The unmatched report printed all 1112 entries. A report that long is scrolled
  past, which makes it as useless as the silence it replaced. Now grouped by
  reason with counts, largest first, each group capped — "1034× no recognised
  component declaration" is the sentence a reader needs.
- `DATASET_FINDINGS` counted as a candidate component, because `/^[A-Z]/` matches
  a screaming constant. Keyed on the underscore now, so `UI` and `API` — legal
  component names — are still reported.

The test asserting the old behaviour ("dedupes components by name, first sorted
file wins") encoded the bug. Rewritten to the corrected truth, keeping the
invariant it genuinely protected: no component emitted twice from one file.
