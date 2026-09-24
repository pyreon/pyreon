---
'@pyreon/atlas': patch
---

Fix an ambiguous component name resolving silently to one of its siblings.

When several components share a name, the graph qualifies them by directory
(then by filename, for the generated-icon case where the directory is
identical). That escalation DELETES the shared bare key and re-inserts both
sides qualified — which left the bare key vacant, so the next component with
the same name found nothing there and claimed it.

With an odd number of siblings one therefore kept an unqualified key: five
`Glyph` components in one directory produced `Glyph`, `Glyph@A`, `Glyph@B`,
`Glyph@C`, `Glyph@D`. Because `resolveComponent` matches an exact KEY before
it considers ambiguity, `graph.get('Glyph')` then resolved silently to
whichever sibling held the bare key instead of reporting the five candidates
— the same "pick one and say nothing" the identity module exists to prevent,
and which its docstring specifically calls out.

A name that has split once is now tracked, so a later arrival is qualified
against its siblings rather than taking the vacated key. An ambiguous bare
name resolves to `undefined` with the candidates reported, as documented.
