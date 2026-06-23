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

**Also: an epoch-cached `values()` / `getValues()` snapshot.** Rebuilding the
values object on every read was O(N) (~109ns/12 fields vs a plain store's
~7ns). It's now cached and rebuilt only when a value-mutation method
(`setValue` / `reset` / `setInitialValues`) advances an internal epoch — a
clean read is an integer compare + cached-object return (**read-all-values:
109ns → ~6ns, now FASTER than TanStack's ~7ns**), and the write path pays only
one integer increment (no signal/subscriber → the 43ns keystroke path is
untouched). Contract: the snapshot reflects mutations through the form's
methods; a direct `form.fields.x.value.set(...)` bypasses the epoch (same as it
already bypasses dirty-tracking + auto-validation — use `setFieldValue`). 6 new
bisect-verified specs lock the invalidation contract.

Net result vs TanStack Form (headless `form-bench.ts`): Pyreon now wins
**update ~83×**, **read ~1.3×**, **reset ~6×**, and **0 vs 10 re-renders** —
losing only once-per-form `setup` (~1.3×), the deliberate price of per-field
fine-grained signals (which buy the 83× write win). (A dirty-count-inline
attempt to close `setup` was measured + reverted — it regressed the keystroke
path ~2× via V8 deopt of a larger `setValue`; the dirty subscriber was already
free on the hot path since it fires only on dirty transitions, not per
keystroke.)
