---
'@pyreon/native-cli': patch
'@pyreon/hooks': patch
---

`pyreon-native wire` never followed a re-export chain

`resolveNativeSources` has a `transitiveScope: 'first-party'` option, documented
as the thing that makes a re-export chain aggregate. **No caller ever passed
it**, so the transitive walk never ran — a declared, dead option.

The consequence is a consumer-facing build failure. `useSecureStorage` is
exported by `@pyreon/hooks`, but its Kotlin runtime `PyreonSecureStorage` lives
in `@pyreon/storage`. An app that declares hooks (and not storage) wired only
hooks and failed a real `gradle assembleDebug` with
`Unresolved reference 'PyreonSecureStorage'`.

`wireApp` now passes it, which fixes the class rather than that one pair. It
immediately resolved two more genuinely-missing wirings in the repo's own
examples.

`@pyreon/hooks` also now declares `@pyreon/storage`, which is the honest
dependency: it re-exports a hook whose native runtime lives there.
