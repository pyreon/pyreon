---
'@pyreon/runtime-dom': minor
'@pyreon/compiler': minor
'@pyreon/vite-plugin': patch
---

Hydration now ADOPTS a compiled template's mount holes, closing the blocker that kept `templatizeComponentChildren` opt-in for its main shape

A compiled template whose children are all absorbed COMPONENT children is emitted EMPTY and filled at mount by trailing `_mountChild` calls. Its server counterpart holds those components' real output, which the adoption verifier read as "extra elements" — so the whole subtree was cloned and swapped instead of hydrated, and everything below it with it. On a 3-level layout that measured **0 of 4 nodes retained**; the same page with the option off retained 4 of 4.

It now retains **4 of 4**, with three adoptions.

Three things had to be right, and doing only the first is a correctness bug rather than a partial win:

1. **The verifier skips a hole's DOM range.** The compiler DECLARES the element it leaves empty (`data-pyreon-hole`, baked into the template string and stripped by `_tpl` at parse time, so it never reaches user DOM). Declared rather than inferred: `_setChild` and a spread `innerHTML` also fill an empty template element and do not hydrate, so a blanket "an empty element may have extra children" rule would duplicate or discard their content.
2. **The compiled bind hydrates that range instead of mounting into it.** `_mountChild` threads a per-hole cursor when it runs inside an adopting bind, so a component absorbed into a hole hydrates the server's copy — which recursively arms its own template, and so on down. Relaxing (1) alone leaves the bind appending a second copy beside the server's.
3. **The range is delimited without any SSR change.** A hole is always trailing — the compiler routes a component child with static content after it through a `<!>` placeholder instead, and no template containing one is adoptable — so the parent element's own tag boundary supplies the extent. SSR emits exactly the same bytes it did before; a per-component range marker would have taxed every hydrated page.

Whatever the bind does not claim is swept, which is precisely the empty element a clone would have produced. A mis-declared hole therefore costs an adoption, never correctness.

Both compiler backends emit the declaration byte-identically (locked by the cross-backend equivalence suite and a 5,000-seed fuzz). Plan replay is refused for a hole-bearing template, because a plan records marker spots but not hole cursors.

**Still opt-in.** The residual is the MIXED shape — a component with a static sibling — which compiles to `<!>` + `_mountSlot` and measures 3/4 retained with the option off against 0/4 with it on. That is the pre-existing dynamic-slot limit reached through a component; its server range markers already exist, and closing it needs a verifier that can adopt a comment-placeholder-bearing template.
