---
"@pyreon/testing": minor
---

Target vitest 5. The jest-dom matcher type augmentation now extends vitest 5's `Matchers<R, T>` (the v4-era `Assertion<T = any>` form no longer merges — TS2428), and the `vitest` peer range is narrowed from `>=2.0.0` to `^5.0.0`. Consumers still on vitest 2–4 should stay on the previous `@pyreon/testing`.
