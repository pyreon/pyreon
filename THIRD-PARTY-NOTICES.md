# Third-Party Notices

Pyreon is MIT-licensed (see [LICENSE](./LICENSE)). It depends on third-party
packages that carry their own terms. Most are MIT, Apache-2.0 or ISC and need
no separate notice.

Two dependencies are under **weak-copyleft** licences. Both are consumed as
unmodified npm packages — Pyreon does not fork, patch or vendor their source —
so their copyleft applies to *their* files, not to Pyreon's. This file exists
because those licences ask that recipients be told, and because a reader
deciding whether they can ship Pyreon should not have to discover it themselves.

| Package | Licence | Used by | How it is consumed |
| --- | --- | --- | --- |
| [`axe-core`](https://github.com/dequelabs/axe-core) | MPL-2.0 | `@pyreon/atlas` | Powers the workbench's a11y panel. `atlas dev` is a development tool, not part of an application bundle. |
| [`elkjs`](https://github.com/kieler/elkjs) | EPL-2.0 OR GPL-3.0-or-later | `@pyreon/flow` | Graph layout, **lazy-loaded** via a dynamic `import()` — an app that never calls `computeLayout` never loads it. Pyreon relies on the **EPL-2.0** half of the dual licence. |

## What this means for you

- **Using Pyreon in a closed-source product is fine.** MPL-2.0 and EPL-2.0 are
  *file-level* copyleft: they reach modifications to the covered files, not
  code that merely depends on them.
- **If you modify `axe-core` or `elkjs` themselves**, those modified files stay
  under their original licence and must be published under it. Depending on
  them, bundling them unmodified, and shipping them alongside your own code do
  not trigger that.
- **`elkjs` is dual-licensed.** Pyreon takes EPL-2.0. Nothing here obliges you
  to take the GPL-3.0 option, and taking it would be a choice with very
  different consequences.

If you need a build with **no** copyleft dependencies at all: `@pyreon/flow`
loads `elkjs` lazily, so not calling its layout API keeps it out of your bundle
entirely, and `@pyreon/atlas` is a devDependency-shaped tool that no
application ships.

## Keeping this accurate

`bun scripts/check-license-coverage.ts` scans every runtime dependency of every
published package and fails when a copyleft licence appears that is not listed
above. A new GPL/AGPL/SSPL dependency fails outright rather than being added to
this table — those are not weak copyleft, and adopting one would change what
Pyreon can be used for.
