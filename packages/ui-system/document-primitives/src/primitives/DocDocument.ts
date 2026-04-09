import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

/**
 * Root document container with metadata for the export pipeline.
 *
 * The `title`, `author`, and `subject` props each accept either a
 * plain `string` or a `() => string` accessor. Accessors are
 * resolved by `extractDocumentTree` at export time, so consumers
 * can pass live signal accessors without capturing values at
 * component mount.
 *
 * **Why accessors are needed**: rocketstyle's `.attrs()` callback
 * runs ONCE at component mount (see
 * `packages/ui-system/rocketstyle/src/hoc/rocketstyleAttrsHoc.ts`
 * line 38: ".attrs() callbacks run once at mount"). If `title` were
 * `string`-only and a consumer wanted to bind it to a live signal,
 * they'd have to capture the initial value at template setup time
 * — meaning the export metadata would be permanently stale relative
 * to the live UI state.
 *
 * Storing the accessor in `_documentProps` and resolving it at
 * extraction time means every `extractDocumentTree` call (one per
 * export click) reads the live value. Plain string values still
 * work as before — `extractDocumentTree` only calls the value if
 * it's a function.
 *
 * @example Plain string
 * ```tsx
 * <DocDocument title="My Report" author="Alice">
 *   ...
 * </DocDocument>
 * ```
 *
 * @example Reactive accessor (recommended for templates that drive
 * a live preview AND export the same tree)
 * ```tsx
 * function MyTemplate({ resume }: { resume: () => Resume }) {
 *   return (
 *     <DocDocument
 *       title={() => `${resume().name} — Resume`}
 *       author={() => resume().name}
 *     >
 *       ...
 *     </DocDocument>
 *   )
 * }
 * ```
 */
const DocDocument = rocketstyle()({ name: 'DocDocument', component: Element })
  .statics({ _documentType: 'document' as const })
  .attrs<{
    title?: string | (() => string)
    author?: string | (() => string)
    subject?: string | (() => string)
  }>((props) => ({
    tag: 'div',
    _documentProps: {
      // Pass accessor functions through unmodified — extractDocumentTree
      // resolves them at export time. Plain strings pass through too.
      // Empty / nullish values are omitted entirely so they don't
      // appear as `title: undefined` in the export metadata.
      ...(props.title != null ? { title: props.title } : {}),
      ...(props.author != null ? { author: props.author } : {}),
      ...(props.subject != null ? { subject: props.subject } : {}),
    },
  }))

export default DocDocument
