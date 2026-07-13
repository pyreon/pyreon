---
"@pyreon/compiler": patch
"@pyreon/runtime-dom": patch
---

Fix a compiler template fast-path bug where a **dynamic generic attribute** was
emitted as a raw `setAttribute(name, value)` with no null / boolean
normalization — so it diverged from the runtime `h()` path (`applyStaticProp`)
and from the SSR serializer.

In real (vite-plugin-compiled) apps this rendered the recommended ARIA shape
`aria-disabled={x ? 'true' : undefined}` as the literal `aria-disabled="undefined"`
on the nullish branch — an **invalid ARIA value** assistive tech reads as the
opposite/default state — and a dynamic boolean `hidden={cond}` as `hidden="false"`
(attribute present → element still hidden). It was also a latent SSR↔client
hydration mismatch (SSR omitted the attribute; the client set `="undefined"`).
It was masked in the `@pyreon/ui-primitives` browser tests because their config
uses the oxc automatic JSX runtime (which routes through `h()`→`applyProps`),
not the real compiler.

The compiler's `attrSetter` (both the JS and Rust backends) and the
`_bindDirect` bare-signal updater now emit a call to a new runtime helper
`_setAttr` (`applyAttrProp`), exported from `@pyreon/runtime-dom`, that mirrors
`applyStaticProp`'s generic-attribute normalization: `null`/`undefined` →
`removeAttribute`, boolean `aria-*` → `"true"`/`"false"`, boolean → presence /
absence, else `setAttribute(String(value))`. This is the aria/boolean/null
sibling of the earlier class/style (`_setClass`/`_setStyle`) template-path
fixes. Static string/number/boolean literals still bake into the template HTML
(the guard fires only for dynamic values); class, style, and DOM-property
(`value`/`checked`/…) attributes keep their existing routing.

Byte-identical across both compiler backends (native-equivalence + differential
fuzz), SSR-parity confirmed, and bisect-verified with a regression that compiles
through the real `transformJSX` and mounts (revert → `aria-disabled="undefined"` /
`hidden="false"` present; restore → absent).
