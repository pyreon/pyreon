---
'@pyreon/create-multiplatform': patch
---

A scaffolded multiplatform app cannot `npm install`.

`@pyreon/create-multiplatform` is PUBLISHED — it is what `pyreon new --native`
npx-runs — and the app it emits depends on five packages that are
`"private": true` in this workspace and therefore absent from npm:
`native-cli`, `native-runtime-swift`, `native-router-swift`,
`native-runtime-kotlin`, `native-router-kotlin`.

Verified against the registry: all five 404, while the web deps the same
scaffold emits (`core`, `primitives`, `reactivity`, `vite-plugin`) resolve at
0.50.0. The scaffolder's own closing line — "next: cd <dir> && npm install &&
npm run dev" — fails at step one for anyone outside this repo.

Nothing caught it. The scaffold-compile gate drives the WORKSPACE compiler
directly, and the unit tests assert the emitted file list; neither asks whether
the emitted package.json describes an installable app.

The scaffolder and the scaffolded README now SAY so — the terminal prints a
notice after every scaffold, and the README leads with a status block naming
what works (web), what does not (native), why (`npm install` 404s on the
unpublished toolchain, and the compiler is private too so nothing can be
vendored), and the path that does work (a workspace checkout). A scaffolder
that prints instructions it knows cannot succeed is worse than one that says
nothing.

This also adds the check. It does not fix the cause: publishing those packages is a
release decision, and they are private deliberately. So the five are listed
explicitly, the list may only SHRINK, and what is enforced today is that no
SIXTH unpublished dependency joins them silently — plus the converse, that the
web deps which DO resolve stay publishable.
