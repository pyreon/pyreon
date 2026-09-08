import type { Rule, VisitorCallbacks } from '../../types'

import { isTestFile } from '../../utils/file-roles'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * oxc's visitor hands untyped nodes (`VisitorCallback = (node: any) => void`),
 * and this rule walks a TYPE tree whose shape varies per node kind. One loose
 * alias beats a partial interface that silently stops matching when a new node
 * kind is added — which is the failure this rule already shipped once.
 */
type AnyNode = any

/**
 * `pyreon/no-query-selector-cast-in-test` — flags
 * `X.querySelector(S) as HTMLY...Element` shapes in test files.
 *
 * Locks in PR #963 (the test-any reduction effort's biggest single
 * win — 122 sites eliminated). Without this rule, the next PR that
 * adds a `querySelector(X) as HTMLAnchorElement` pattern silently
 * re-introduces the regression class:
 *
 *   1. Authors writing `as HTMLY` as a "TS shut up" cast when the
 *      element may legitimately be null (the kind that surfaced 12
 *      latent bugs in PR #963 — tests crashed the moment the element
 *      went missing in happy-dom quirks / animation timing).
 *   2. Two-line `(... as ...).property` patterns where a typed
 *      `query(root, selector)` helper from `@pyreon/test-utils`
 *      would narrow automatically via `HTMLElementTagNameMap`.
 *
 * **What it checks**: a `querySelector` / `querySelectorAll` call, HOWEVER
 * REACHED, cast to a type that MENTIONS an HTML element type. That is the
 * class; an earlier cut enumerated two shapes of it (a bare
 * `MemberExpression` callee, and a `TSTypeReference` / `TSUnionType`
 * annotation) and measurably fired ZERO times on three ordinary ones:
 *
 *   c?.querySelector('a')       as HTMLAnchorElement      // ChainExpression
 *   el.querySelector('x')       as HTMLElement & { _x }   // TSIntersectionType
 *   el.querySelectorAll('x')    as NodeListOf<HTMLDivElement>
 *
 * The third is the sharpest: this docblock's own "or `queryAll` for
 * `querySelectorAll`" advice named a case the matcher could not see, because
 * `querySelectorAll` was never in the callee test and `NodeListOf<…>` hides
 * the element type one level down in `typeArguments`. Enumerating shapes is
 * the smell — the rule now unwraps `ChainExpression` on the callee side and
 * WALKS the annotation (union, intersection, parenthesised, array, and type
 * arguments) on the type side, so a shape nobody has written yet is covered
 * by construction.
 *
 * The rule fires on `*.test.{ts,tsx}` files only — production code's
 * `as HTML...Element` casts are out of scope.
 *
 * **Fix**: import `query` (or `queryOptional` for `... | null` shapes,
 * or `queryAll` for `querySelectorAll`) from `@pyreon/test-utils`:
 *
 *   // Before:
 *   const anchor = el.querySelector('a') as HTMLAnchorElement
 *   const card   = el.querySelector('[data-card]') as HTMLDivElement
 *   const modal  = el.querySelector('.modal') as HTMLElement | null
 *
 *   // After:
 *   const anchor = query(el, 'a')                          // narrows automatically
 *   const card   = query<HTMLDivElement>(el, '[data-card]') // explicit generic
 *   const modal  = queryOptional(el, '.modal')              // T | null
 *
 * Not auto-fixable: the choice between `query` (strict, throws) and
 * `queryOptional` (lenient, returns null) requires reading the test's
 * downstream code to know the intent. PR #963 found that ~10% of the
 * sites in the original sweep needed `queryOptional` because the
 * downstream test body had `if (X) ...` null guards — that intent
 * isn't recoverable from the cast alone.
 *
 * **Reference**: PR #956 (helper), #963 (sweep), #965 (globals.d.ts);
 * audit at `.claude/plans/test-any-reduction-audit.md`.
 */
export const noQuerySelectorCastInTest: Rule = {
  meta: {
    id: 'pyreon/no-query-selector-cast-in-test',
    category: 'architecture',
    description:
      'In test files, a `querySelector` / `querySelectorAll` call cast to a type mentioning an HTML element should use the typed `query()` / `queryOptional()` / `queryAll()` helper from `@pyreon/test-utils` (locks in PRs #956 + #963).',
    severity: 'error',
    requiresDependency: '@pyreon/test-utils',
    scope: 'monorepo',
    scanTarget: 'test',
    fixable: false,
    schema: {
      exemptPaths: 'string[]',
    },
  },
  create(context): VisitorCallbacks {
    const filePath = context.getFilePath()

    // Test files only. The `as HTML...Element` pattern is legitimate in
    // production code (event-handler `e.target as HTMLInputElement`, etc.).
    //
    // Uses the SHARED `isTestFile`, which was the last of three rules still
    // re-implementing it inline. The local copy matched `*.test.ts(x)` alone,
    // so it missed `.spec.` files and anything under `tests/` or
    // `__tests__/` — 52 files in this repo, none of which happened to contain
    // the pattern, so the narrowing cost nothing and hid nothing. It was
    // still a second definition of "is this a test", which is how the two
    // answers drift apart later.
    if (!isTestFile(filePath)) return {}

    // `@pyreon/test-utils` (which exports `query()`) is a PRIVATE monorepo
    // package — a consumer can't install it, so this rule's `error` would be
    // unsatisfiable in a consumer test. It's a monorepo-internal ratchet (cites
    // internal PR numbers), so it fires ONLY where `@pyreon/test-utils` is a
    // declared dependency — i.e. this monorepo. Silent in consumer projects.
    if (!isProjectDependency(filePath, '@pyreon/test-utils')) return {}


    /**
     * Peel every wrapper that can sit between a cast and the call it is about.
     *
     * `a?.b()` and `a.b?.()` both wrap the call in a `ChainExpression` — the
     * cast expression is then not a `CallExpression` at all, which is why the
     * optional-chain form fired zero times. `x as unknown as T` nests a second
     * `TSAsExpression`, and `x!` a `TSNonNullExpression`. All of them are
     * spellings, not different defects, so they are peeled rather than
     * enumerated at the match site. Depth-bounded: a peel loop over untyped
     * nodes must not be able to spin.
     */
    const unwrap = (n: AnyNode): AnyNode => {
      let cur = n
      for (let i = 0; i < 8; i += 1) {
        const t = cur?.type
        if (
          t === 'ChainExpression' ||
          t === 'TSAsExpression' ||
          t === 'TSSatisfiesExpression' ||
          t === 'TSTypeAssertion' ||
          t === 'TSNonNullExpression' ||
          t === 'ParenthesizedExpression'
        ) {
          cur = cur.expression as AnyNode
          continue
        }
        break
      }
      return cur
    }

    /** `querySelector` → 'one', `querySelectorAll` → 'all', anything else null. */
    const queryCallKind = (raw: AnyNode): 'one' | 'all' | null => {
      const call = unwrap(raw)
      if (call?.type !== 'CallExpression') return null
      const callee = unwrap(call.callee as AnyNode)
      if (callee?.type !== 'MemberExpression') return null
      const name = (callee.property as { name?: string } | undefined)?.name
      if (name === 'querySelector') return 'one'
      if (name === 'querySelectorAll') return 'all'
      return null
    }

    const isHtmlElementName = (n?: string): boolean =>
      typeof n === 'string' && /^HTML[A-Z]?\w*Element$/.test(n)

    /**
     * Does this annotation MENTION an HTML element type anywhere?
     *
     * A cast target is a tree, not a name: `HTMLElement & {…}`,
     * `NodeListOf<HTMLDivElement>`, `HTMLDivElement[]`, `(HTMLElement | null)`
     * all carry one, and testing only the root node misses every one of them.
     * Depth-bounded so a pathological annotation cannot spin.
     */
    const mentionsHtmlElement = (t: AnyNode, depth = 0): boolean => {
      if (!t || typeof t !== 'object' || depth > 8) return false
      switch (t.type) {
        case 'TSTypeReference': {
          if (isHtmlElementName((t.typeName as { name?: string } | undefined)?.name)) return true
          // `NodeListOf<HTMLDivElement>`, `Array<HTMLElement>`, … — the element
          // type the author actually means lives in the type arguments.
          const params =
            (t.typeArguments as { params?: AnyNode[] } | undefined)?.params ?? []
          return params.some((p) => mentionsHtmlElement(p, depth + 1))
        }
        case 'TSUnionType':
        case 'TSIntersectionType':
          return ((t.types as AnyNode[] | undefined) ?? []).some((m) =>
            mentionsHtmlElement(m, depth + 1),
          )
        case 'TSParenthesizedType':
          return mentionsHtmlElement(t.typeAnnotation as AnyNode, depth + 1)
        case 'TSArrayType':
          return mentionsHtmlElement(t.elementType as AnyNode, depth + 1)
        default:
          return false
      }
    }

    /** `T | null` / `T | undefined` at the TOP level of the annotation. */
    const hasNullMember = (t: AnyNode): boolean =>
      t?.type === 'TSUnionType' &&
      ((t.types as AnyNode[] | undefined) ?? []).some(
        (m) => m?.type === 'TSNullKeyword' || m?.type === 'TSUndefinedKeyword',
      )

    const check = (node: AnyNode): void => {
      const kind = queryCallKind(node.expression as AnyNode)
      if (kind === null) return

      const ann = node.typeAnnotation as AnyNode
      if (!ann || !mentionsHtmlElement(ann)) return

      // Which helper to name. `querySelectorAll` has exactly one answer;
      // for the single form, a `| null` / `| undefined` target says the author
      // already knew it could miss, so `queryOptional` is the honest swap.
      // Never auto-fixed: `as HTMLElement` on a NON-optional target may still
      // have been masking optional-ness, and that intent is not recoverable
      // from the cast (PR #963 found 12 latent bugs of exactly that shape).
      const helper =
        kind === 'all' ? 'queryAll' : hasNullMember(ann) ? 'queryOptional' : 'query'
      const called = kind === 'all' ? 'querySelectorAll' : 'querySelector'
      const extra =
        kind === 'all'
          ? ` \`queryAll\` returns a real \`Array\`, not a \`NodeList\`, so ` +
            `\`.map\` / \`.filter\` work without \`[].slice.call\`.`
          : ` If the element may be null, use \`queryOptional\` and guard the ` +
            `downstream code — PR #963 found 12 latent bugs where ` +
            `\`as HTMLElement\` masked actual nullability.`

      context.report({
        message:
          `[Pyreon] In test files, replace \`X.${called}(S) as …\` ` +
          `with \`${helper}(X, S)\` from \`@pyreon/test-utils\`. ` +
          `The helper narrows via \`HTMLElementTagNameMap\` for tag selectors ` +
          `(no explicit generic needed) and accepts an explicit ` +
          `\`<HTMLY>\` for attribute / class / ID selectors.` +
          extra,
        span: { start: node.start ?? 0, end: node.end ?? 0 },
      })
    }

    return {
      TSAsExpression: check,
      // `<HTMLY>expr` — the angle-bracket cast. Legal in `.ts` (not `.tsx`),
      // and the same defect with a different spelling.
      TSTypeAssertion: check,
    }
  },
}
