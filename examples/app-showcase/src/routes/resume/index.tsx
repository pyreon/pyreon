import { Toaster } from '@pyreon/toast'
import { ExportButtons } from '../../sections/resume/ExportButtons'
import { ResumeForm } from '../../sections/resume/ResumeForm'
import { ResumeTemplate } from '../../sections/resume/ResumeTemplate'
import { useResume } from '../../sections/resume/store'
import {
  FormColumn,
  Header,
  HeaderText,
  PreviewColumn,
  PreviewFrame,
  PreviewLabel,
  ResetButton,
  ResumeLead,
  ResumePage,
  ResumeTitle,
  ToolbarRow,
  Workspace,
} from '../../sections/resume/styled'

/**
 * Resume Builder section — the showcase's only section that uses
 * `@pyreon/document-primitives` for the round-trip.
 *
 * The form on the left edits a single resume signal. The pane on
 * the right renders the SAME `<ResumeTemplate>` component that the
 * export buttons walk via `extractDocumentTree` — no separate
 * preview HTML, no template duplication. What you see is what you
 * download.
 *
 * Demonstrates:
 *   • @pyreon/document-primitives — DocDocument, DocPage, DocHeading,
 *                                    DocText, DocList, DocSection, etc.
 *                                    Same components render in browser
 *                                    AND export.
 *   • @pyreon/connector-document   — `extractDocumentTree(vnode)` walks
 *                                    the rocketstyle component tree and
 *                                    produces a DocNode tree by reading
 *                                    each component's `_documentType`
 *                                    static.
 *   • @pyreon/document             — `download(docNode, filename)`
 *                                    handles the chosen format. PDF +
 *                                    DOCX renderers are lazy-loaded by
 *                                    @pyreon/document itself, not
 *                                    bundled in the section's chunk.
 *   • @pyreon/store                — single signal-backed resume store
 *   • @pyreon/toast                — loading → success/error feedback
 *
 * Compare to the invoice builder (#190): that section had TWO
 * different shapes — a form-bound editor and a separately-rendered
 * HTML preview. The plain `@pyreon/document` factory functions were
 * the right tool there because the editor and the document were
 * different layouts. Here, the resume IS the document — one tree,
 * two rendering targets.
 */
export default function ResumeRoute() {
  const r = useResume()

  return (
    <ResumePage>
      <Header>
        <HeaderText>
          <ResumeTitle>Resume Builder</ResumeTitle>
          <ResumeLead>
            Edit on the left — the preview on the right uses the SAME document-primitives tree
            that gets exported. No duplicated layout, no separate template for the print version.
          </ResumeLead>
        </HeaderText>
        <ResetButton type="button" onClick={() => r.store.reset()}>
          Reset to seed
        </ResetButton>
      </Header>

      <ToolbarRow>
        <ExportButtons />
      </ToolbarRow>

      <Workspace>
        <FormColumn>
          <ResumeForm />
        </FormColumn>
        <PreviewColumn>
          <PreviewLabel>
            <span>Live preview · same tree as export</span>
            <span>{() => `${r.store.resume().experience.length} jobs`}</span>
          </PreviewLabel>
          <PreviewFrame>
            {() => <ResumeTemplate resume={r.store.resume()} />}
          </PreviewFrame>
        </PreviewColumn>
      </Workspace>

      <Toaster position="bottom-right" />
    </ResumePage>
  )
}

export const meta = {
  title: 'Resume Builder — Pyreon App Showcase',
}
