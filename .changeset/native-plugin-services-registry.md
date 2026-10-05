---
"@pyreon/native-compiler": minor
---

Plugin protocol gains additive `services`, `modules`, `requires` and `builtIn` fields (API version stays 1; `SUPPORTED_PLUGIN_API_VERSIONS` is exported). `createCompiler` builds a service registry from the built-in table plus every plugin's `services`, exposed as `compiler.services` and `context.services`; two owners for one hook, a missing `requires`, or a cycle are load-time errors, and `createCompiler({ discovered })` lets a discovered plugin replace a `builtIn` one by name. New `verifyServiceTypes` checks that the types a plugin's services reference are really declared in the sources it ships, and `@pyreon/native-compiler/testing` exports `testNativePlugin`. The parser and emitters still read the module-level `SERVICES` table; threading the registry through them is a follow-up.
