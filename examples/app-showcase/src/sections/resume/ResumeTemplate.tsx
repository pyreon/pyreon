import {
  DocDivider,
  DocDocument,
  DocHeading,
  DocList,
  DocListItem,
  DocPage,
  DocSection,
  DocSpacer,
  DocText,
} from '@pyreon/document-primitives'
import type { EducationEntry, ExperienceEntry, Resume } from './data/types'

interface ResumeTemplateProps {
  resume: Resume
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
 */
export function ResumeTemplate(props: ResumeTemplateProps) {
  const r = props.resume
  return (
    <DocDocument title={`${r.name} — Resume`} author={r.name}>
      <DocPage>
        {/* ── Header ──────────────────────────────────────────────── */}
        <DocHeading level="h1">{r.name}</DocHeading>
        <DocText variant="caption">{r.headline}</DocText>
        <DocSpacer />
        <DocText variant="caption">
          {[r.contact.email, r.contact.phone, r.contact.location, r.contact.website]
            .filter(Boolean)
            .join(' · ')}
        </DocText>

        <DocDivider />

        {/* ── Summary ─────────────────────────────────────────────── */}
        {r.summary ? (
          <DocSection>
            <DocHeading level="h3">Summary</DocHeading>
            <DocText>{r.summary}</DocText>
          </DocSection>
        ) : null}

        <DocSpacer />

        {/* ── Experience ──────────────────────────────────────────── */}
        {r.experience.length > 0 ? (
          <DocSection>
            <DocHeading level="h3">Experience</DocHeading>
            <ExperienceEntries entries={r.experience} />
          </DocSection>
        ) : null}

        {/* ── Education ───────────────────────────────────────────── */}
        {r.education.length > 0 ? (
          <DocSection>
            <DocHeading level="h3">Education</DocHeading>
            <EducationEntries entries={r.education} />
          </DocSection>
        ) : null}

        {/* ── Skills ──────────────────────────────────────────────── */}
        {r.skills.length > 0 ? (
          <DocSection>
            <DocHeading level="h3">Skills</DocHeading>
            <DocText>{r.skills.join(' · ')}</DocText>
          </DocSection>
        ) : null}
      </DocPage>
    </DocDocument>
  )
}

/**
 * Experience list — pulled into its own component because mapping
 * an array inside a rocketstyle component's child slot collapses
 * `VNodeChild` to `VNodeChildAtom` (TS narrowing on the rocketstyle
 * children type). The sibling-component pattern is used elsewhere
 * in the showcase for the same reason — see invoice/InvoiceForm.tsx
 * and todos/TodoList.tsx.
 */
function ExperienceEntries(props: { entries: ExperienceEntry[] }) {
  return (
    <>
      {props.entries.map((entry) => (
        <DocSection>
          <DocText weight="bold">
            {entry.role} — {entry.company}
          </DocText>
          <DocText variant="caption">{entry.period}</DocText>
          <ExperienceHighlights highlights={entry.highlights} />
          <DocSpacer />
        </DocSection>
      ))}
    </>
  )
}

function ExperienceHighlights(props: { highlights: string[] }) {
  return (
    <DocList>
      <HighlightList items={props.highlights} />
    </DocList>
  )
}

function HighlightList(props: { items: string[] }) {
  return (
    <>
      {props.items.map((line) => (
        <DocListItem>{line}</DocListItem>
      ))}
    </>
  )
}

function EducationEntries(props: { entries: EducationEntry[] }) {
  return (
    <>
      {props.entries.map((entry) => (
        <DocSection>
          <DocText weight="bold">{entry.degree}</DocText>
          <DocText variant="caption">
            {entry.school} · {entry.period}
          </DocText>
          <DocSpacer />
        </DocSection>
      ))}
    </>
  )
}
