---
'@pyreon/vite-plugin': patch
'@pyreon/atlas': patch
---

Fix four bugs that made Atlas unusable on a real monorepo, and one that broke ordinary app builds.

Found by running `atlas scan` against a 78-package workspace rather than a fixture.

**`@pyreon/vite-plugin` — JSX auto-import collided with destructured bindings.**
The shadow check required the name immediately after the keyword, so
`const { Form, Text } = createForm(schema)` was invisible to it and the pass
injected `import { Text } from '@pyreon/primitives'` on top of it. The build
died with `Identifier 'Text' has already been declared`, pointing at a line the
author never wrote. A form factory returning named components is an entirely
ordinary shape; this broke any app using one, independently of Atlas.

**`@pyreon/atlas` — a root `atlas.config.ts` could not import anything.**
A package manager links a dependency only into packages that declare it, and the
repo root declares almost none — so the file that supplies `theme` (which makes
rocketstyle chains discoverable) and `wrapper` (which lets theme-reading
components mount) could import neither the project's own packages nor
`@pyreon/core`. Config imports now resolve against the workspace: by name for a
workspace package, and otherwise as a package that declares the dependency
would. Components are deliberately excluded from the second tier — one that
cannot resolve an import has a real dependency bug worth surfacing.

**`@pyreon/atlas` — `entryFromExports` answered a loading question with a types
answer.** Reading `types` first is right for prop-type resolution and wrong for
loading, where it lands on `index.d.ts` and fails as if the file were missing.
Callers now say which they want.

**`@pyreon/atlas` — a flag's value was taken as the directory to scan.**
`atlas build --out dist/atlas` scanned `dist/atlas`, then reported
`no components found under dist/atlas/src`. All five commands shared the line.

**`@pyreon/atlas` — "no atlas.config.ts" was printed when there was one.**
Both a config that failed to load and one that simply sets no `projects` got the
message, the first contradicting the error printed directly above it.

Measured on that workspace, with a `theme` and `wrapper` configured: 1378 → 1419
components, 1451 → 3356 scenarios, 1055 → 3127 verified.
