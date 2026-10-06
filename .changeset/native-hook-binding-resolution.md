---
"@pyreon/native-compiler": minor
---

Hooks are now resolved by their import binding, not by their bare name. Three defects in how a `useX` call was matched are fixed: a function the author declared with a framework hook's name (`function useOnline() {…}`) was lowered as the framework hook; `import { useOnline } from './my-hooks'` was treated as `@pyreon/hooks`' hook, with no warning; and an aliased import (`import { useOnline as useNet } from '@pyreon/hooks'`) matched nothing, so the declaration was dropped from the emit with no warning. An aliased framework hook now lowers, and a same-named user function or a foreign import is compiled as the author's own code (a foreign import also reports why). A name that is neither imported nor declared still lowers as before, so snippets that omit imports are unchanged.
Upgrade: if a shared source imports a framework hook through a local re-export (`import { useOnline } from './platform'`), import it from `@pyreon/hooks` instead; PMTC has no module graph, so it cannot see through the re-export.
