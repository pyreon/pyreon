---
"@pyreon/native-compiler": minor
"@pyreon/native-cli": patch
---

The last chart knowledge leaves `parse.ts`: it no longer imports `chart-hosts` or `chart-engine-structs`. Two additive plugin fields replace it. `CompilerPlugin.runtimeTypes` declares the type names a plugin's runtime provides, so a helper typed against one (`(c: TooltipContent) => string`) resolves; two plugins declaring one name is a load-time error naming both. `CompilerPlugin.refineParse` is an IR edit that runs inside parse, before helper return types are inferred, which is why it is not a `transformIR` pass (a post-parse widening of a helper parameter would leave its return inferred over the old type). The charts plugin now owns the formatter-parameter widening and its engine struct names. Emitted Swift and Kotlin are byte-identical (golden corpus, plus a new fixture recorded from the previous parser for the formatter-helper shape). `forEachExpr` moves to `expr-walk.ts` so plugins can use it. `pyreon plugins` lists runtime types and parse refinements. API version stays 1.
