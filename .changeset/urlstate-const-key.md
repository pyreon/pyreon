---
'@pyreon/native-compiler': minor
---

`useUrlState` accepts a module-scope `const` key, and warns when a key cannot be
resolved instead of dropping the declaration.

The key is baked into the native emit, so it must be known at build time — but
the check required an INLINE literal and anything else took a bare `return null`.
That dropped the whole `const v = useUrlState(KEY, '')` declaration with no
warning, leaving every later reference pointing at a binding that no longer
existed, so both targets failed to compile (`unresolved reference 'v'`) with
nothing naming the cause.

Sharing the key between the reader and whatever writes the param is the ordinary
way to write this, so a module-scope `const` (including an exported one, and a
template with no interpolation) now resolves. `let` deliberately does not — it
can be reassigned, and baking its initial value would emit a stale key. What
still cannot be known warns by name and says where to move the key.

`useStorage`, `useHotkey` and `createI18n`'s `locale` / `fallbackLocale` accept
one too. All three already warned by name rather than dropping — the right tier —
but "must be a string LITERAL" was never the actual requirement. Statically
KNOWABLE is, and a module-scope const is. What still cannot be known keeps
warning, now saying so in those terms.
