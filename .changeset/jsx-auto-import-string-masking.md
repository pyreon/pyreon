---
'@pyreon/vite-plugin': patch
---

Stop the JSX auto-import injecting for a primitive name written inside a string.

`_maskCommentsAndStrings` masked only COMMENTS, despite its name and its call-site comment both claiming strings too. So a canonical primitive name appearing in any string — a diagnostic message, a doc example, a template literal — was read as real JSX usage, and the pass injected `import { … } from '@pyreon/primitives'` into a file whose package may not depend on it. That is a build break, not a warning: Rolldown fails to resolve the import.

Found for real in `@pyreon/feature`, whose `Field` error message read `` `[Pyreon] <Field name="${…}">` `` — seven CI checks failed with `Rolldown failed to resolve import "@pyreon/primitives"`.

Strings, template literals (including interpolations and nested templates) and comments are now all masked for usage scanning. Template interpolations are masked wholesale, so a JSX tag written inside `${…}` no longer triggers the auto-import — a false negative where the author adds an explicit import, chosen deliberately over the false positive that breaks the build.

Import DETECTION keeps a comments-only mask, since module specifiers are strings: masking them blinded the already-imported check and the extend-existing-import splice, which emitted a duplicate import line.
