---
'@pyreon/zero': minor
---

`zero({ image, font })` — auto-wire imagePlugin and fontPlugin out of the box.

`@pyreon/zero` now auto-wires `imagePlugin()` and `fontPlugin()` into the Vite plugin chain. The original "out of the box optimization" goal — a user adds `pyreon()` + `zero()` to vite.config and `<Image src={import('./hero.png?optimize')} />` Just Works without knowing the imagePlugin API.

```ts
// vite.config.ts — before: 4 plugins, must know each one
import { pyreon } from '@pyreon/vite-plugin'
import { zero } from '@pyreon/zero'
import { imagePlugin } from '@pyreon/zero/image-plugin'
import { fontPlugin } from '@pyreon/zero/font'

export default {
  plugins: [pyreon(), zero(), imagePlugin({ formats: ['avif', 'webp'] }), fontPlugin({ google: ['Inter:wght@400;700'] })]
}

// After: 2 plugins, config flows through zero()
export default {
  plugins: [
    pyreon(),
    zero({
      image: { formats: ['avif', 'webp'] },
      font: { google: ['Inter:wght@400;700'] },
    }),
  ],
}
```

Opt-out:

- `zero({ image: false })` — skip the imagePlugin entirely (no `?optimize` import handling, no AVIF/WebP, no sharp pulled in)
- `zero({ font: false })` — skip the fontPlugin

`{}` (or omitted) auto-wires with the plugin's own default config. Pass a config object to override. Same shape every Vite-plugin auto-wire follows — no special API.

Verified across all 23 verify-modes cells (SSG / SSR / ISR / SPA / per-adapter / islands / native) — no mode is affected by the auto-wire. Bisect-verified at the unit layer: the 9-spec `zero-auto-wire-plugins.test.ts` gate fails with `expected names to include 'pyreon-zero-images'` when the auto-wire branch is removed.

The previous `mode → companion plugin wiring` tests in `vite-plugin-config.test.ts` were updated to pass `image: false, font: false` so they keep asserting the mode-companion contract (orthogonal to auto-wire).
