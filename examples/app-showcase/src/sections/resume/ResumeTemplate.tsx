import {
  DocDivider,
  DocDocument,
  DocHeading,
  DocList,
  DocListItem,
  DocPage,
  DocRow,
  DocSection,
  DocSpacer,
  DocText,
} from '@pyreon/document-primitives'
import type { EducationEntry, ExperienceEntry, Resume } from './data/types'

interface ResumeTemplateProps {
  /**
   * Either a plain `Resume` (used by `ExportButtons` when capturing a
   * snapshot for download) OR a function returning a `Resume` (used by
   * the live preview to give the template fine-grained reactivity).
   *
   * Components run once in Pyreon — to get per-keystroke updates that
   * patch only the changed text nodes (instead of re-mounting the
   * whole tree on every signal change), the template must read the
   * signal *inside* its body. The accessor form makes that explicit
   * while still allowing snapshot exports.
   */
  resume: Resume | (() => Resume)
}

/**
 * Resume document template.
 *
 * This is the **single** template that drives both:
 *   • The live in-browser preview — Pyreon renders these document
 *     primitives as styled DOM elements, so what you see is exactly
 *     what gets exported.
 *   • The PDF / DOCX / HTML / Markdown export — `extractDocumentTree`
 *     walks the same VNode tree and converts each `_documentType`-
 *     marked component into a `DocNode` for `@pyreon/document`'s
 *     `render()` to consume.
 *
 * Compare this to the invoice section, which has TWO different shapes
 * (a form-bound editor and a separate HTML preview). The resume
 * builder uses ONE shape because the on-screen view IS the document.
 * That's the entire point of `@pyreon/document-primitives` — same
 * tree, different rendering targets.
 *
 * Reactivity: every signal-derived expression is wrapped in a thunk
 * (`() => …`) so the compiler emits per-text-node `_bind()` calls.
 * Editing the name updates ONLY the heading's text node. The DOC tree
 * structure (DocPage, DocSection, etc.) is constructed once on mount
 * and reused — no top-down re-render on every keystroke.
 */
export function ResumeTemplate(props: ResumeTemplateProps) {
  // Normalise to an accessor so the body can read reactively. When
  // `props.resume` is a plain object, the accessor still works — it
  // just returns the same value on every call (export path).
  const get = typeof props.resume === 'function' ? props.resume : () => props.resume as Resume

  // DocDocument's title/author go into export metadata only — they
  // don't render in the DOM preview, so a one-time read at mount is
  // fine. The export path builds a fresh tree on each click, so the
  // captured snapshot is always current at download time.
  const initial = get()

  return (
    <DocDocument title={`${initial.name} — Resume`} author={initial.name}>
      <DocPage>
        {/* ── Header ──────────────────────────────────────────────── */}
        <DocHeading level="h1">{() => get().name}</DocHeading>
        <DocText variant="caption">{() => get().headline}</DocText>
        <DocSpacer />
        <ContactRow get={get} />

        <DocDivider />

        {/* ── Summary ─────────────────────────────────────────────── */}
        <DocSection>
          <DocHeading level="h3">Summary</DocHeading>
          <DocText>{() => get().summary}</DocText>
        </DocSection>

        <DocSpacer />

        {/* ── Experience ──────────────────────────────────────────── */}
        <DocSection>
          <DocHeading level="h3">Experience</DocHeading>
          <ExperienceEntries get={get} />
        </DocSection>

        {/* ── Education ───────────────────────────────────────────── */}
        <DocSection>
          <DocHeading level="h3">Education</DocHeading>
          <EducationEntries get={get} />
        </DocSection>

        {/* ── Skills ──────────────────────────────────────────────── */}
        <DocSection>
          <DocHeading level="h3">Skills</DocHeading>
          <DocText>{() => get().skills.join(' · ')}</DocText>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}

/**
 * Contact row — uses DocRow for inline horizontal layout. Each text
 * node is reactive so editing a single field updates only that node.
 */
function ContactRow(props: { get: () => Resume }) {
  return (
    <DocRow>
      <DocText variant="caption">{() => props.get().contact.email}</DocText>
      <DocText variant="caption">·</DocText>
      <DocText variant="caption">{() => props.get().contact.phone}</DocText>
      <DocText variant="caption">·</DocText>
      <DocText variant="caption">{() => props.get().contact.location}</DocText>
      <DocText variant="caption">·</DocText>
      <DocText variant="caption">{() => props.get().contact.website}</DocText>
    </DocRow>
  )
}

/**
 * Experience list. The component returns a function — Pyreon's runtime
 * treats that as a reactive children accessor and re-runs it whenever
 * a tracked signal changes. The outer iteration re-runs only when the
 * array length or order changes; individual text nodes inside each
 * entry are bound via the parent template's per-field thunks.
 *
 * The sibling-component pattern is used elsewhere in the showcase for
 * the same reason it's used here — wrapping `arr.map()` in a sibling
 * sidesteps the rocketstyle child slot's `VNodeChildAtom` narrowing.
 * See invoice/InvoiceForm.tsx and todos/TodoList.tsx.
 */
function ExperienceEntries(props: { get: () => Resume }) {
  return () =>
    props.get().experience.map((entry: ExperienceEntry) => (
      <DocSection>
        <DocText weight="bold">
          {entry.role} — {entry.company}
        </DocText>
        <DocText variant="caption">{entry.period}</DocText>
        <DocList>
          {entry.highlights.map((line) => (
            <DocListItem>{line}</DocListItem>
          ))}
        </DocList>
        <DocSpacer />
      </DocSection>
    ))
}

function EducationEntries(props: { get: () => Resume }) {
  return () =>
    props.get().education.map((entry: EducationEntry) => (
      <DocSection>
        <DocText weight="bold">{entry.degree}</DocText>
        <DocText variant="caption">
          {entry.school} · {entry.period}
        </DocText>
        <DocSpacer />
      </DocSection>
    ))
}
