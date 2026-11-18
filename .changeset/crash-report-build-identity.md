---
'@pyreon/hooks': minor
---

Crash reports now say which build crashed, so a release stack can be made readable.

`useCrashReporter()` writes one report shape on every platform, exported as the `CrashReport` type: `platform`, `message`, `stack`, `breadcrumbs`, `timestamp`. Native reports add the build identity: `build` (app id, version, build number), and on Android `build.mappingId`, the R8 map id that the minified frames name. On iOS they add `image` (the executable's LC_UUID, load address and arch) and the raw return `addresses`. `pyreon-native symbolicate` uses these fields to pick the matching R8 mapping or dSYM.

Breaking: web and Android used to persist `[message, stack, breadcrumbs]` as a JSON array. `lastCrash` and the transport payload are now the JSON object above, as iOS already wrote. Code that parsed the array must read `report.message` / `report.stack` / `report.breadcrumbs` (now an array) instead.
