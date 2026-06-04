---
'@pyreon/zero': minor
---

`<NoOptimize>` — subtree-scoped image optimization opt-out.

Closes the third tier of the image opt-out grammar:

| Tier | API | Shipped in |
|---|---|---|
| **Per-call** | `<Image src={hero} optimize={false} />` | PR #1353 |
| **Subtree** | `<NoOptimize><Image .../></NoOptimize>` | **this PR** |
| **Global** | `zero({ image: false })` | PR #1356 |

```tsx
import { NoOptimize, Image } from '@pyreon/zero'

// Whole route renders bare <img>s (no aspect-ratio wrapper, no lazy load):
export default function IconLibraryRoute() {
  return (
    <NoOptimize>
      <Image src={icon1} alt="Heart" width={24} height={24} />
      <Image src={icon2} alt="Star"  width={24} height={24} />
    </NoOptimize>
  )
}
```

**Override grammar (any-of triggers bypass, but per-call `true` wins):**

1. **Per-call `optimize={false}`** — local opt-out.
2. **Surrounding `<NoOptimize>` boundary** — subtree opt-out.
3. **Per-call `optimize={true}`** — explicit re-enable that overrides a parent `<NoOptimize>` (caller intent wins).
4. **Inner `<NoOptimize disabled>`** — subtree-scoped opt-back-in for a region.

```tsx
<NoOptimize>
  <Image src={icon} alt="bare" />                     {/* bypassed by boundary */}
  <Image src={hero} alt="forced" optimize={true} />   {/* opt back IN per-call */}
  <NoOptimize disabled>
    <Image src={hero} alt="re-enabled" />             {/* opt back IN for subtree */}
  </NoOptimize>
</NoOptimize>
```

**Use cases:**

- Whole routes that render only icons / sub-grid images (the optimization wrapper would distort the layout).
- Subtrees server-rendered + statically cached (HTML emails, PDF documents, share cards) — wrapper overhead is wasted.
- Hand-crafted `<picture>` markup where Pyreon's auto-`<picture>` would compete.

**Type-level surface change**: `ImageDescriptorProps.optimize` and `ImageUrlProps.optimize` widen from `false` to `boolean`. `optimize={true}` was previously a TypeScript error; it now means "force optimization ON inside an outer `<NoOptimize>`." Existing `optimize={false}` callers are unaffected.

**8 specs** lock the contract:
- Drops every `<Image>` in subtree to bare `<img>` (no `aspect-ratio:` container)
- Respects descriptor `src` in the bare img
- Handles string-URL Image inside the boundary
- Does NOT affect `<Image>`s OUTSIDE the boundary (positive both, isolation negative)
- Inner `<NoOptimize disabled>` re-enables optimization for its subtree
- Per-call `optimize={true}` overrides parent boundary (caller wins)
- No boundary → behaves as before (default optimization)
- Empty `<NoOptimize>` renders cleanly (no throw)

**Bisect-verified** — replacing `useNoOptimize()` with `false` fails 3 of 8 specs (the boundary-dependent ones); 5 boundary-independent specs still pass.

`23/23` verify-modes • `1271/1272` zero tests pass (+8 new) • typecheck + lint + 11/11 validate-fast clean.

Subpath export at `@pyreon/zero/no-optimize`. Main entry re-exports `NoOptimize` + `useNoOptimize`. `NoOptimizeContext` is exported from the subpath only for advanced consumers wiring custom render paths.
