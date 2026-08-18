---
'@pyreon/native-compiler': minor
---

fix(native): a dropped inline router guard now warns by name instead of vanishing silently

A global router guard written inline — `createRouter({ beforeEach: [(to) => isAuthed()] })` — is not lowered to native (closure-emit is a tracked follow-up; only a NAMED function reference `beforeEach: [authGuard]` lowers today). Until now it was dropped **silently**, which is the worst failure mode for a guard: the navigation ships **ungated** on iOS/Android with no signal — a security foot-gun. It now emits a named warning pointing at the named-function fix, upholding the compiler's invariant that outside the lowered subset the failure mode is a named warning, never a silent drop. This closes the last enumerated silent-drop shape in the router surface.
