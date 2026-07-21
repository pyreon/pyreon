/** @jsxImportSource @pyreon/core */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { mergeProps, splitProps, useControllableState } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/** Localizable AT strings — English defaults, override any subset. */
export interface TagsInputLabels {
  /** `aria-label` for the text input. Default `'Add tag'`. */
  input?: string
  /** Per-tag remove-button label. Default ``(tag) => `Remove ${tag}` ``. */
  remove?: (tag: string) => string
}

export interface TagsInputBaseProps {
  /** Current tags. */
  value?: string[]
  /** Uncontrolled initial tags. */
  defaultValue?: string[]
  /** Called when the tag list changes. */
  onChange?: (tags: string[]) => void
  /** Max number of tags (further commits are ignored). */
  maxTags?: number
  /** Allow duplicate tags (default false — case-insensitive dedup). */
  allowDuplicates?: boolean
  /**
   * Validate a candidate tag BEFORE it is added. Return `false` (or a reason
   * string) to reject — the query is kept so the user can fix it.
   */
  validateTag?: (raw: string) => boolean | string
  /** Localized AT strings. */
  labels?: TagsInputLabels
  /** Render function. */
  children?: (state: TagsInputState) => VNodeChild
  [key: string]: unknown
}

export interface TagsInputState {
  /** Current tags. */
  tags: () => string[]
  /** Current draft text. */
  query: () => string
  /** Set the draft text (wire to the input's onInput). */
  setQuery: (q: string) => void
  /** Commit a tag (trims; applies dedup/validate/maxTags). Returns success. */
  addTag: (raw: string) => boolean
  /** Remove a tag by value. */
  removeTag: (tag: string) => void
  /** Remove every tag. */
  clearAll: () => void
  /**
   * Props for the text input: aria-label + onKeyDown (Enter/comma commit,
   * Backspace-on-empty removes the last tag) + onInput (query sync) + a
   * paste handler that splits on commas/newlines. Spread on an `<input>`.
   */
  inputProps: () => Record<string, unknown>
  /**
   * Props for tag N's REMOVE button: type=button + the localizable label +
   * onClick. Spread on the chip's remove `<button>`.
   */
  getRemoveProps: (tag: string) => Record<string, unknown>
  /** Container props — forwards component rest (rocketstyle class etc.). */
  rootProps: () => Record<string, unknown>
}

const DEFAULT_LABELS: Required<TagsInputLabels> = {
  input: 'Add tag',
  remove: (tag) => `Remove ${tag}`,
}

/**
 * Free-form tag entry (chips) — unlike MultiSelect (which picks from
 * predefined options via ComboboxBase), TagsInput accepts ARBITRARY strings:
 * Enter or comma commits the trimmed draft, Backspace in an EMPTY input
 * removes the last tag, paste splits on commas/newlines, and rejected
 * candidates (duplicates by default, `validateTag` failures, `maxTags`
 * overflow) keep the draft so the user can fix it.
 */
export const TagsInputBase: ComponentFn<TagsInputBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'maxTags',
    'allowDuplicates',
    'validateTag',
    'labels',
    'children',
  ])

  const [tags, setTags] = useControllableState<string[]>({
    value: () => own.value,
    defaultValue: own.defaultValue ?? [],
    onChange: own.onChange,
  })

  const query = signal('')

  const label = <K extends keyof TagsInputLabels>(key: K): NonNullable<TagsInputLabels[K]> =>
    (own.labels?.[key] ?? DEFAULT_LABELS[key]) as NonNullable<TagsInputLabels[K]>

  const addTag = (raw: string): boolean => {
    const tag = raw.trim()
    if (!tag) return false
    const current = tags()
    if (own.maxTags !== undefined && current.length >= own.maxTags) return false
    if (!own.allowDuplicates) {
      const lower = tag.toLowerCase()
      if (current.some((t) => t.toLowerCase() === lower)) return false
    }
    if (own.validateTag) {
      const verdict = own.validateTag(tag)
      if (verdict !== true) return false
    }
    setTags([...current, tag])
    query.set('')
    return true
  }

  const removeTag = (tag: string) => {
    setTags(tags().filter((t) => t !== tag))
  }

  const state: TagsInputState = {
    tags,
    query: () => query(),
    setQuery: (q) => query.set(q),
    addTag,
    removeTag,
    clearAll: () => setTags([]),
    inputProps: () => ({
      'aria-label': label('input'),
      // Live value accessor — clears visibly after a commit.
      value: () => query(),
      onInput: (e: Event) => {
        query.set((e.target as HTMLInputElement).value)
      },
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault()
          addTag(query())
        } else if (e.key === 'Backspace' && query() === '') {
          const current = tags()
          const last = current[current.length - 1]
          if (last !== undefined) {
            e.preventDefault()
            removeTag(last)
          }
        }
      },
      onPaste: (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData('text') ?? ''
        if (/[,\n]/.test(text)) {
          e.preventDefault()
          for (const part of text.split(/[,\n]/)) addTag(part)
        }
      },
    }),
    getRemoveProps: (tag: string) => ({
      type: 'button',
      'aria-label': label('remove')(tag),
      onClick: () => removeTag(tag),
    }),
    rootProps: () =>
      mergeProps(rest as Record<string, unknown>, {} as Record<string, unknown>),
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: TagsInputState) => VNodeChild)(state)
  }
  return null
}
