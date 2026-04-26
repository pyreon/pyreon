---
"@pyreon/elements": patch
---

Fix `<Element tag="hr" />` (and other void HTML elements: `input`, `img`, `br`, `link`, `area`, `base`, `col`, `embed`, `source`, `track`, `wbr`) tripping runtime-dom's "void element cannot have children" warning. Wrapper used to always render `<Styled>{own.children}</Styled>` regardless of tag — even when `own.children` was `undefined`, the JSX slot serialized as `vnode.children = [undefined]` which is non-empty. Wrapper now branches on `getShouldBeEmpty(own.tag)` and drops the slot entirely for void tags.
