---
"@pyreon/zero-content": patch
---

fix(zero-content): `<CodeBlock>` no longer crashes on a fresh client mount (broken docs code samples)

Navigating into the docs (e.g. clicking "Docs" from the landing page) threw
`[Pyreon] <CodeBlock> threw during setup: HierarchyRequestError: Failed to
execute 'insertBefore' …` — once per code block — leaving the code samples
rendered broken on first navigation.

Root cause: `<CodeBlock>` conditionally rendered its filename header and
line-number gutter (`{filename && <div…>}`). The compiler lowers a conditional
wrapper child to a `_mountSlot` placeholder, and the static-element refs for the
later siblings (`code-block__body` / `code-block__pre`) are computed by
`.firstElementChild.nextElementSibling` walks emitted AFTER those slots. On a
fresh client mount (the SPA-navigation path) an empty slot removes its `<!>`
placeholder, the walk lands on the wrong node, and the copy-button slot's parent
ends up a Comment node → `insertBefore` throws.

Fix (backend-agnostic, single-`_tpl` preserving): the header + gutter wrappers
are now ALWAYS rendered (a static, prop-derived `--empty` modifier class hides
them when they have no content), so no `_mountSlot` precedes a ref'd element and
the refs stay valid. The line-number gutter is rendered via
`dangerouslySetInnerHTML` (mirroring how the Shiki output reaches
`code-block__pre`) so it stays a static template element AND renders the numbers
as real spans — a bare `{gutter}` array child was being baked to `textContent`
(stringifying the span VNodes to `[object Object]`), and a `<For>` would have
de-optimised every code block off the single-cloneNode fast path.

The empty-state is a static class rather than a dynamic `hidden` attribute: the
compiled template path emits a raw `el.setAttribute("hidden", value)` with no
boolean-attr guard, so `hidden={false}` would set `hidden="false"` (attribute
present → still hidden). `filename` / `showLineNumbers` are fixed per instance,
so a className is both correct and sufficient.

Bisect-verified end-to-end: reverting to the conditional header reproduces the
`<CodeBlock> threw during setup` crash on a real-Chromium landing→docs
navigation; the fix renders zero setup errors. New regression coverage: a docs
e2e spec (`e2e/docs.spec.ts`) asserting no setup crash + code blocks render on
the landing→docs path, plus zero-content unit specs for the always-rendered
`--empty` header/gutter contract.
