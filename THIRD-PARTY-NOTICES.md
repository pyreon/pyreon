# Third-Party Notices

Pyreon is MIT-licensed (see [LICENSE](./LICENSE)). It depends on third-party
packages that carry their own terms. Most are MIT, Apache-2.0 or ISC and need
no separate notice.

One dependency is under a **weak-copyleft** licence. It is consumed as an
unmodified npm package — Pyreon does not fork, patch or vendor its source — so
its copyleft applies to *its* files, not to Pyreon's. This file exists because
that licence asks that recipients be told, and because a reader deciding
whether they can ship Pyreon should not have to discover it themselves.

| Package | Licence | Used by | How it is consumed |
| --- | --- | --- | --- |
| [`axe-core`](https://github.com/dequelabs/axe-core) | MPL-2.0 | `@pyreon/atlas` | Powers the workbench's a11y panel. `atlas dev` is a development tool, not part of an application bundle. |

## What this means for you

- **Using Pyreon in a closed-source product is fine.** MPL-2.0 and EPL-2.0 are
  *file-level* copyleft: they reach modifications to the covered files, not
  code that merely depends on them.
- **If you modify `axe-core` itself**, those modified files stay under MPL-2.0
  and must be published under it. Depending on it, bundling it unmodified, and
  shipping it alongside your own code do not trigger that.

If you need a build with **no** copyleft dependencies at all, you already have
one: `@pyreon/atlas` is a devDependency-shaped workbench that no application
ships, so nothing copyleft reaches a production bundle. `@pyreon/flow` used to
depend on `elkjs` (EPL-2.0) for graph layout and now ships its own engine, so
that entry is gone rather than merely lazy.

## Keeping this accurate

`bun scripts/check-license-coverage.ts` scans every runtime dependency of every
published package and fails when a copyleft licence appears that is not listed
above. A new GPL/AGPL/SSPL dependency fails outright rather than being added to
this table — those are not weak copyleft, and adopting one would change what
Pyreon can be used for.
