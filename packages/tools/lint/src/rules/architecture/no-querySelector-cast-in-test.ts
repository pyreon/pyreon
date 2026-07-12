import type { Rule, VisitorCallbacks } from '../../types'
import { isPathExempt } from '../../utils/exempt-paths'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * `pyreon/no-querySelector-cast-in-test` — flags
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
 * **What it checks**: any `as HTMLXxxElement` cast (or
 * `as HTMLXxxElement | null` union) where the cast EXPRESSION is a
 * `.querySelector(...)` call. The rule fires on `*.test.{ts,tsx}` files
 * only — production code's `as HTML...Element` casts are out of scope.
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
    id: 'pyreon/no-querySelector-cast-in-test',
    category: 'architecture',
    description:
      'In test files, `el.querySelector(X) as HTMLY` should use the typed `query()` / `queryOptional()` helper from `@pyreon/test-utils` (locks in PRs #956 + #963).',
    severity: 'error',
    fixable: false,
    schema: {
      exemptPaths: 'string[]',
    },
  },
  create(context): VisitorCallbacks {
    const filePath = context.getFilePath()

    // Test files only. The `as HTML...Element` pattern is legitimate in
    // production code (event-handler `e.target as HTMLInputElement`, etc.).
    const isTestFile = /\.test\.(?:ts|tsx)$/.test(filePath)
    if (!isTestFile) return {}

    // `@pyreon/test-utils` (which exports `query()`) is a PRIVATE monorepo
    // package — a consumer can't install it, so this rule's `error` would be
    // unsatisfiable in a consumer test. It's a monorepo-internal ratchet (cites
    // internal PR numbers), so it fires ONLY where `@pyreon/test-utils` is a
    // declared dependency — i.e. this monorepo. Silent in consumer projects.
    if (!isProjectDependency(filePath, '@pyreon/test-utils')) return {}

    if (isPathExempt(context)) return {}

    return {
      TSAsExpression(node: {
        expression?: {
          type?: string
          callee?: { type?: string; property?: { name?: string } }
        }
        typeAnnotation?: {
          type?: string
          typeName?: { name?: string }
          types?: { type?: string; typeName?: { name?: string } }[]
        }
        start?: number
        end?: number
      }) {
        // Bail unless cast EXPRESSION is `.querySelector(...)`.
        const expr = node.expression
        if (
          expr?.type !== 'CallExpression' ||
          expr.callee?.type !== 'MemberExpression' ||
          expr.callee.property?.name !== 'querySelector'
        ) {
          return
        }

        // Bail unless TARGET type is HTMLXxxElement (handle both plain
        // `as HTMLY` and `as HTMLY | null` union forms).
        const ann = node.typeAnnotation
        if (!ann) return

        const isHtmlElementName = (n?: string): boolean =>
          typeof n === 'string' && /^HTML[A-Z]?\w*Element$/.test(n)

        let isHtmlCast = false
        if (ann.type === 'TSTypeReference') {
          isHtmlCast = isHtmlElementName(ann.typeName?.name)
        } else if (ann.type === 'TSUnionType' && Array.isArray(ann.types)) {
          // `HTMLY | null` — accept if ANY member is HTMLXxxElement.
          isHtmlCast = ann.types.some(
            (t) =>
              t.type === 'TSTypeReference' && isHtmlElementName(t.typeName?.name),
          )
        }
        if (!isHtmlCast) return

        // Decide which helper to suggest in the message — peek at the
        // type annotation. If `... | null`, suggest `queryOptional`,
        // else `query`. Either way the migration is not auto-fixable
        // because intent ambiguity (`as HTMLElement` may have masked
        // optional-ness — see PR #963's latent-bug fixes).
        const hasNullUnion =
          ann.type === 'TSUnionType' &&
          ann.types?.some(
            (t) => t.type === 'TSNullKeyword' || t.type === 'TSUndefinedKeyword',
          )
        const helper = hasNullUnion ? 'queryOptional' : 'query'

        context.report({
          message:
            `[Pyreon] In test files, replace \`X.querySelector(S) as HTMLY\` ` +
            `with \`${helper}(X, S)\` from \`@pyreon/test-utils\`. ` +
            `The helper narrows via \`HTMLElementTagNameMap\` for tag selectors ` +
            `(no explicit generic needed) and accepts an explicit ` +
            `\`<HTMLY>\` for attribute / class / ID selectors. ` +
            `If the element may be null, use \`queryOptional\` and guard the ` +
            `downstream code — PR #963 found 12 latent bugs where ` +
            `\`as HTMLElement\` masked actual nullability.`,
          span: { start: node.start ?? 0, end: node.end ?? 0 },
        })
      },
    }
  },
}
