---
'@pyreon/cli': patch
---

`pyreon doctor`'s distribution gate now distinguishes "this checkout was never
built" from "the `files` array excludes source maps".

Both produce a tarball with no `.map` files, and the gate blamed the second for
both. In a fresh worktree — where `lib/` does not exist yet — that sent people
to read a `files` array that was never wrong. The tarball's own file list
answers it: no `.js`/`.d.ts` at all means there was no built output to carry
maps, and the fix is `bun scripts/bootstrap.ts`.

Still an error either way; only the message and the finding code change
(`distribution/unbuilt-checkout` for the new case).
