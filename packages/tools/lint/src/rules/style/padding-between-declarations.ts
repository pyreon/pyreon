import type { Rule, VisitorCallbacks } from '../../types'
import { createPadding } from '../../utils/padding'

/**
 * `pyreon/padding-between-declarations` — a blank line between two adjacent
 * top-level statements, or two adjacent class members, when either spans more
 * than one line.
 *
 * Runs of one-line declarations (a block of constants, a list of fields) stay
 * tight; the rule is ESLint's `lines-between-class-members` with
 * `exceptAfterSingleLine`, applied to the top level too. 89.5% of this repo's
 * top-level pairs already comply.
 *
 * Not checked: the import block (oxlint's `import/newline-after-import` owns
 * the import/code boundary), a run of re-exports (`export … from`, the barrel
 * equivalent of imports), and overload signatures, which must stay glued to
 * the implementation they describe.
 */

const IMPORT_LIKE = new Set(['ImportDeclaration', 'TSImportEqualsDeclaration'])

function isImportLike(node: any): boolean {
  if (IMPORT_LIKE.has(node.type)) return true
  if (node.type === 'ExportAllDeclaration') return true
  return node.type === 'ExportNamedDeclaration' && node.source != null
}

/** The declaration inside an `export` wrapper, or the node itself. */
function unwrapExport(node: any): any {
  if (
    (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') &&
    node.declaration
  ) {
    return node.declaration
  }

  return node
}

function functionName(node: any): string | null {
  const n = unwrapExport(node)
  if (n.type !== 'TSDeclareFunction' && n.type !== 'FunctionDeclaration') return null
  return n.id?.name ?? null
}

/** `function f(a: string): X` followed by another `f` — an overload group. */
function isTopLevelOverloadPair(prev: any, next: any): boolean {
  if (unwrapExport(prev).type !== 'TSDeclareFunction') return false
  const name = functionName(prev)
  return name !== null && name === functionName(next)
}

function memberName(node: any): string | null {
  const key = node.key
  if (!key || node.computed) return null
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') return key.name
  if (key.type === 'Literal') return String(key.value)

  return null
}

/** `m(a: string): X` (no body) followed by another `m` — a method overload group. */
function isMemberOverloadPair(prev: any, next: any): boolean {
  if (prev.value?.type !== 'TSEmptyBodyFunctionExpression') return false
  if (prev.kind === 'get' || prev.kind === 'set') return false
  const name = memberName(prev)

  return name !== null && name === memberName(next) && prev.static === next.static
}

export const paddingBetweenDeclarations: Rule = {
  meta: {
    id: 'pyreon/padding-between-declarations',
    category: 'style',
    description:
      'Require a blank line between adjacent top-level statements and class members when either spans more than one line.',
    severity: 'info',
    fixable: true,
    optIn: true,
    skipGenerated: true,
    scanTarget: ['source', 'test'],
  },
  create(context) {
    const padding = createPadding(context)

    const callbacks: VisitorCallbacks = {
      Program(node: any) {
        const body: any[] = node.body
        for (let i = 1; i < body.length; i++) {
          const prev = body[i - 1]
          const next = body[i]
          if (isImportLike(prev) || isImportLike(next)) continue
          if (!padding.isMultiline(prev) && !padding.isMultiline(next)) continue
          if (isTopLevelOverloadPair(prev, next)) continue
          padding.requireBlankBefore(
            prev,
            next,
            'Add a blank line before this declaration. Multi-line declarations read as separate paragraphs.',
          )
        }
      },
      ClassBody(node: any) {
        const body: any[] = node.body
        for (let i = 1; i < body.length; i++) {
          const prev = body[i - 1]
          const next = body[i]
          if (!padding.isMultiline(prev) && !padding.isMultiline(next)) continue
          if (isMemberOverloadPair(prev, next)) continue
          padding.requireBlankBefore(
            prev,
            next,
            'Add a blank line before this class member. Multi-line members read as separate paragraphs.',
          )
        }
      },
    }

    return callbacks
  },
}
