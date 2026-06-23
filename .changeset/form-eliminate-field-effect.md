---
'@pyreon/form': patch
---

Eliminate the per-field auto-revalidation `effect()` — the keystroke hot path
is now ~5.3× faster, with no behavior change.

`useForm` previously created one `effect()` per field that tracked `valueSig`
+ `submitCount` to drive auto-validation. That cost a per-field `EffectScope`
at setup (the dominant per-field allocation) AND re-ran on EVERY keystroke
(tracking `valueSig`) — even in the default `blur` mode where the body is a
no-op. The auto-validation logic is now driven INLINE from `setValue` (the
canonical value-mutation path), reading `submitCount.peek()` instead of
tracking it:

- **`update-field` (keystroke hot path): 242ns → 46ns (~5.3× faster)** — vs
  TanStack Form the lead widens from ~15× to **~79×** (46ns vs 3.60µs).
- **`reset`: ~35% faster** (no per-keystroke/per-reset effect flush).
- **`setup`: ~17% faster** (no per-field `EffectScope` allocation).

Behavior is identical and bisect-verified: the two preserved triggers —
change-mode validation and post-failed-submit live error-correction — are
exactly covered by existing specs (dropping the `submitCount.peek()` trigger
fails 3 post-submit-revalidation tests; dropping the change-mode setup
validation fails the change-mode test). change-mode forms still validate their
initial values once at setup (a one-time `validateField` call in the field
loop, replacing the effect's setup-run). All 206 tests pass.

The `form.fieldEffectCreate` dev perf-counter is removed (the effect it
measured no longer exists).
