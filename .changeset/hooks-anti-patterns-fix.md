---
"@pyreon/hooks": patch
"@pyreon/lint": patch
---

Hooks anti-pattern cleanup + lint rule precision improvements

`@pyreon/hooks`:

- `useClipboard`: batch `text.set()` + `copied.set()` in the success branch so
  subscribers reading both see one update, not two. Added
  `typeof navigator === 'undefined'` early-return in `copy()` for SSR safety.
- `useBreakpoint`, `useFocusTrap`, `useWindowResize`: listeners moved INSIDE
  `onMount` (co-located with their `window`/`document` registration) and
  cleanup returned from `onMount` instead of using a separate `onUnmount`
  call. Matches the Pyreon convention that `onMount` accepts a cleanup
  return value.
- `useInfiniteScroll.setup()` and `useScrollLock.lock()/unlock()`: added
  `typeof document === 'undefined'` early-returns to make the SSR-safety
  contract explicit at the callsite (previously relied on ref-callbacks never
  firing on the server — brittle).

`@pyreon/lint` — `no-window-in-ssr` rule precision (fewer false positives,
fewer silent false negatives):

- Track `typeof X` expressions via `UnaryExpression` enter/exit depth instead
  of the inert `parent.operator === 'typeof'` check (oxc's visitor does NOT
  pass `parent`).
- Skip member-expression property names (`x.addEventListener`),
  object-property keys (`{ document: 1 }`), and import-specifier names via
  WeakSet pre-marking, for the same reason.
- Skip TypeScript type-position nodes (`let x: Window`, `type T = Document`,
  etc.) via `TSTypeAnnotation`/`TSTypeReference`/`TSTypeAliasDeclaration`/
  `TSInterfaceDeclaration`/`TSTypeParameter` depth counter — type refs are
  erased at compile time, not runtime accesses.
- Recognise `const isBrowser = typeof window !== 'undefined'` idiom: `if
  (isBrowser) { … }` is now treated the same as `if (typeof window !==
  'undefined') { … }`.
- Recognise early-return-on-typeof guards: `if (typeof X === 'undefined')
  return …` makes the rest of the function body implicitly typeof-guarded.
  Supports OR-chained form (`typeof X === 'undefined' || typeof Y ===
  'undefined'`) for features needing multiple browser APIs.
- Treat `onUnmount`, `onCleanup`, `effect`, `renderEffect` as safe contexts
  (same as `onMount`) — these only run after mount in the browser.
- Ternary `typeof X !== 'undefined' ? safe : fallback` now tracked via
  `ConditionalExpression` enter/exit.

`@pyreon/lint` — other rules fixed for the same oxc-no-parent root cause:

- `no-props-destructure`: pre-mark `CallExpression` arguments via WeakSet so
  HOC factory args (`createLink(({ href }) => <a />)`) are correctly skipped
  — previously the `parent?.type === 'CallExpression'` check was inert.
- `no-unbatched-updates`: added `schema: { exemptPaths: 'string[]' }` option
  so test files can be exempted from the rule (tests often need deliberate
  sequential `.set()` calls to observe intermediate debounce/throttle state).

`@pyreon/lint` — type hygiene:

- `VisitorCallback` signature narrowed to `(node: any) => void`. The earlier
  `parent?: any` second parameter was a false promise — oxc's walker never
  passes `parent`, and rules silently depended on an `undefined` value.
