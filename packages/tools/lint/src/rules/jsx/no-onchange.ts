import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

// `onInput` (keypress-by-keypress) is only the right idiom for TEXT-like
// controls. On `<select>` and toggle/commit inputs (checkbox/radio/file/range/
// color/date/…) `onChange` is the correct, idiomatic DOM event — rewriting it
// to `onInput` (and the AUTOFIX doing so) silently breaks correct code. So the
// rule fires only on `<textarea>` and text-like `<input>`.
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
])

/** Read the literal `type=` of a JSX opening element, or null if absent/dynamic. */
function readInputType(node: any): string | null {
  for (const attr of node.attributes ?? []) {
    if (
      attr.type === 'JSXAttribute' &&
      attr.name?.type === 'JSXIdentifier' &&
      attr.name.name === 'type'
    ) {
      const v = attr.value
      // string literal → the type; anything else (`type={t()}`) is dynamic.
      if (v?.type === 'Literal' && typeof v.value === 'string') return v.value
      if (v?.type === 'JSXText' && typeof v.value === 'string') return v.value
      return null // dynamic type — cannot prove text-like
    }
  }
  return 'text' // no `type` → defaults to text
}

/** Whether an `onChange`→`onInput` swap is appropriate for this element. */
function isTextLike(tag: string, node: any): boolean {
  if (tag === 'textarea') return true
  if (tag === 'select') return false
  // <input>: only for text-like (or absent) type; dynamic type → skip.
  const t = readInputType(node)
  return t !== null && TEXT_INPUT_TYPES.has(t)
}

const INPUT_TAGS = new Set(['input', 'textarea', 'select'])

export const noOnChange: Rule = {
  meta: {
    id: 'pyreon/no-onchange',
    category: 'jsx',
    description:
      'Prefer `onInput` over `onChange` on input elements for keypress-by-keypress updates.',
    severity: 'warn',
    fixable: true,
  },
  create(context) {
    let currentTag: string | null = null
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node.name
        if (name?.type === 'JSXIdentifier' && INPUT_TAGS.has(name.name)) {
          currentTag = name.name
        } else {
          currentTag = null
        }

        if (!currentTag) return
        // Only text-like controls: never `<select>`/checkbox/radio/etc.
        if (!isTextLike(currentTag, node)) return
        const attrs = node.attributes ?? []
        for (const attr of attrs) {
          if (
            attr.type === 'JSXAttribute' &&
            attr.name?.type === 'JSXIdentifier' &&
            attr.name.name === 'onChange'
          ) {
            const nameSpan = getSpan(attr.name)
            context.report({
              message: `Use \`onInput\` instead of \`onChange\` on \`<${currentTag}>\` for keypress-by-keypress updates.`,
              span: getSpan(attr),
              fix: { span: nameSpan, replacement: 'onInput' },
            })
          }
        }
      },
    }
    return callbacks
  },
}
