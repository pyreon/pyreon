---
"@pyreon/runtime-dom": minor
"@pyreon/document-primitives": minor
"@pyreon/meta": minor
"@pyreon/state-tree": patch
---

Breaking: remove two second names for existing APIs. Neither was deprecated before this release; each was documented as a convenience alias.

- `@pyreon/runtime-dom`'s `render`, documented as an alias of `mount` "for API familiarity". It was `export const render = mount`, so `mount` behaves identically.
- `@pyreon/document-primitives`'s `createDocumentExport` and its `DocumentExport` type, documented as "kept for backward compat": a wrapper object whose only method, `getDocNode()`, called `extractDocNode`.

`@pyreon/meta` drops its re-exports of `createDocumentExport` and `DocumentExport`. In state-tree, an unreachable `ModelConfig` type alias is deleted; no public entry exported it.

```ts
// before
import { render } from '@pyreon/runtime-dom'
render(<App />, el)
const tree = createDocumentExport(() => <Resume />).getDocNode()

// after
import { mount } from '@pyreon/runtime-dom'
mount(<App />, el)
const tree = extractDocNode(() => <Resume />) // same options argument
```

An old import fails at build time: TypeScript reports the missing export and the bundler reports `MISSING_EXPORT`.

Upgrade: codemod runtime-dom-render-to-mount (`pyreon upgrade` switches every `render` imported from `@pyreon/runtime-dom` to `mount`, including namespace and re-export forms). `createDocumentExport` is migrated by hand: replace `createDocumentExport(fn).getDocNode()` with `extractDocNode(fn)`, and pass the tree instead of the wrapper object where one was stored.
