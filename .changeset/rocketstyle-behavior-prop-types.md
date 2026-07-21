---
'@pyreon/rocketstyle': patch
---

Preserve wrapped-component prop types through the rocketstyle wrapper when the component's props interface carries a string index signature.

Every `@pyreon/ui-primitives` props interface ends with `[key: string]: unknown` (rest-prop pass-through). Under `keyof`, TS subsumes literal keys into `string`, so `keyof O` is just `string | number` — and DFP's `Omit<O, keyof EA & keyof O>` (a non-homomorphic `Pick` over that computed union) erased EVERY named key, collapsing the whole prop surface to `{ [x: string]: unknown }`. On every primitive-backed ui-component (Select / Checkbox / NumberInput / Tabs / Tree / …) `value` degraded to `unknown` (`<Select value={123}>` compiled when it should reject) and `onChange` callbacks lost contextual typing (implicit-any errors forcing manual annotations).

Fixed with a homomorphic key-remapped `OmitSafe<T, K>` (`{ [P in keyof T as P extends K ? never : P]: T[P] }`) in DFP — homomorphic mapped types iterate the declared properties individually, so named keys keep their types AND the index signature survives for pass-through. Byte-identical to `Omit` for types without an index signature; render-fn children typing (the #2377 fix) is preserved — and render-fn `children` callbacks now get contextual typing too.

Regression-locked by `@pyreon/ui-components` `src/tests/behavior-prop-types.types.test.ts` (bisect-verified: reverting to plain `Omit` produces 16 typecheck errors — unused `@ts-expect-error` + implicit-any on every probe).
