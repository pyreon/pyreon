---
'@pyreon/lathe': minor
'@pyreon/atlas': minor
---

Make the Atlas story actually automated: previews, scenarios and a wrapper, all
from the spec.

The `atlas` plugin already emitted scenarios, but they were keyed by a native
data component Atlas has no reason to scan, and varied RESPONSE fields rather
than props. It produced a plausible-looking file that did nothing — the
"generated but never wired" shape, and only running `atlas scan` against a real
project surfaced it.

Now:

- **`components.tsx`** — one browsable preview per read operation. The variant
  axis is the DATA STATE (`loading` / `error` / `empty`), which is a real prop,
  so Atlas infers a control for it, and they are the three states a live
  request will not show you on demand.
- **`atlas.wrapper.tsx`** — the `QueryClientProvider` the previews need, with
  the generated mocks installed, so every card renders with **no server**. Atlas
  names the missing provider precisely when there is none, so this is a step
  the generator can simply take.
- **A transport seam on the generated client.** Endpoints bind at declaration
  time, so middleware cannot be added to `createHttp` afterwards — which a mock
  installed by a wrapper or a test never can be. One passthrough entry reserves
  the slot; `installMocks()` uses it.

Measured on the bookshelf example: `atlas scan` discovers 2 components and 8
scenarios, **8 verified, 0 failing** — and `atlas.config.ts` names no component,
no scenario and no provider.

**`@pyreon/atlas` gains `ignore`**, a list of path fragments added to the
discovery defaults. A file can export a PascalCase component and still not
belong in a catalog: generated code shaped for another compiler, an internal
helper, an app entry point. Without it the only options were to browse it or
rename it, and a card that throws on every scenario trains people to ignore the
report.
