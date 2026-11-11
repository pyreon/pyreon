import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { breakpoints, font, radius, text, weight } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs } from './bases'
import { CodeBlock } from './code'
import { GlowCard } from './cards'
import { AutoGrid } from './layout'
import { useLinkClick } from './link'
import { Eyebrow, Heading, Lede, renderInline, StatusBadge } from './type'

/**
 * Blocks for the story, migrate and project pages (visual-alignment.md,
 * "story" and "plain" templates): prose, a diagram slot, a numbered step
 * list, a before → after strip and link cards.
 */

// ─── Prose ────────────────────────────────────────────────────────────────

const ProseBox = el
  .config({ name: 'Prose' })
  .attrs({ block: true, gap: 18 })
  .theme(() => ({ maxWidth: 720 }))

const Para = txt
  .config({ name: 'ProsePara' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.sans,
    fontSize: text.ledeSection.size,
    lineHeight: text.ledeSection.lineHeight,
    color: tone(m, 'mist'),
  }))

/** Paragraphs in the reading measure (720px), inline grammar rendered. */
export function Prose(props: { paragraphs: readonly string[] }) {
  return (
    <ProseBox>
      <For each={props.paragraphs.map((p, i) => ({ p, i }))} by={(x) => x.i}>
        {(x) => <Para>{renderInline(x.p)}</Para>}
      </For>
    </ProseBox>
  )
}

// ─── Diagram slot ─────────────────────────────────────────────────────────

const Figure = el
  .config({ name: 'Diagram' })
  .attrs({ tag: 'figure', block: true, gap: 12 })
  .theme((_t, m) => ({
    margin: 0,
    minWidth: 0,
    extendCss: `
      & > [data-svg] { border-radius: ${radius.card}px; border: 1px solid ${tone(m, 'line')}; background: ${tone(m, 'well')}; overflow: hidden; }
      & > [data-svg] svg { display: block; width: 100%; height: auto; }
    `,
  }))

const FigCaption = txt
  .config({ name: 'DiagramCaption' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: text.caveat.size,
    letterSpacing: text.caveat.tracking,
    lineHeight: 1.6,
    color: tone(m, 'fog'),
  }))

/**
 * An asset-set SVG (diagram, animated loop or measured chart), inlined so it
 * follows the site theme. The SVG carries its own `<title>` / `<desc>` and
 * `role="img"` (its text alternative) and stops animating under reduced
 * motion. `svg` is repo-owned build-time content (09-site/assets), never
 * user input.
 */
export function Diagram(props: { svg: string; caption?: string | undefined; id?: string | undefined }) {
  return (
    <Figure id={props.id}>
      <div data-svg="" dangerouslySetInnerHTML={{ __html: props.svg }} />
      <Show when={() => !!props.caption}>
        <FigCaption>{props.caption}</FigCaption>
      </Show>
    </Figure>
  )
}

const SplitBox = el
  .config({ name: 'StorySplit' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gap: 40,
    alignItems: 'start',
    gridTemplateColumns: 'minmax(0, 1fr)',
    extendCss: `@media (min-width: ${breakpoints.lg}px) { grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); }`,
  }))

/** Prose (or anything) beside a diagram from 992px; stacked, diagram second, below. */
export function StorySplit(props: { diagram?: VNodeChild; children?: VNodeChild }) {
  return (
    <SplitBox>
      <div>{props.children}</div>
      {props.diagram ?? null}
    </SplitBox>
  )
}

// ─── Step list ────────────────────────────────────────────────────────────

const Steps = el
  .config({ name: 'StepList' })
  .attrs({ tag: 'ol', block: true })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    maxWidth: 860,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const Step = el
  .config({ name: 'StepListItem' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: '44px minmax(0, 1fr)',
    gap: 14,
    paddingTop: 22,
    paddingBottom: 22,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const StepNum = txt
  .config({ name: 'StepListNum' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'currentBorder'),
    color: tone(m, 'accent'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }))

const StepBody = el.config({ name: 'StepListBody' }).attrs({ block: true, gap: 8 }).theme(() => ({ minWidth: 0 }))

const StepCode = el
  .config({ name: 'StepListCode' })
  .attrs({ block: true })
  .theme((_t, m) => ({ marginTop: 8, borderRadius: radius.pane, border: '1px solid', borderColor: tone(m, 'line'), overflow: 'hidden', minWidth: 0 }))

export interface StepItem {
  title: string
  text: string
  code?: string | null | undefined
  codeHtml?: string | undefined
  /** A file name shown above the code. */
  file?: string | null | undefined
}

/** `<ol>` of numbered steps: title, text (inline grammar), optional code. */
export function StepList(props: { items: readonly StepItem[] }) {
  return (
    <Steps>
      <For each={props.items.map((s, i) => ({ s, i }))} by={(x) => x.i}>
        {(x) => (
          <Step>
            <StepNum>{String(x.i + 1)}</StepNum>
            <StepBody>
              <Heading tag="h3" size="step">
                {renderInline(x.s.title)}
              </Heading>
              <Lede size="card">{renderInline(x.s.text)}</Lede>
              {x.s.code ? (
                <StepCode>
                  {x.s.file ? <StepFile>{x.s.file}</StepFile> : null}
                  <CodeBlock code={x.s.code} html={x.s.codeHtml} label={x.s.file ?? `Step ${x.i + 1} code`} />
                </StepCode>
              ) : null}
            </StepBody>
          </Step>
        )}
      </For>
    </Steps>
  )
}

const StepFile = txt
  .config({ name: 'StepListFile' })
  .attrs({ tag: 'div' })
  .theme((_t, m) => ({
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 20,
    paddingRight: 20,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'fog'),
  }))

// ─── Compare strip (before → after) ───────────────────────────────────────

const StripList = el
  .config({ name: 'CompareStrip' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid', borderColor: tone(m, 'line') }))

const StripRow = el
  .config({ name: 'CompareStripRow' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gap: '6px 18px',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 14,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontSize: text.small.size,
    color: tone(m, 'mist'),
    gridTemplateColumns: 'minmax(0, 1fr)',
    extendCss: `@media (min-width: ${breakpoints.md}px) { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.3fr) 24px minmax(0, 1.3fr); }`,
  }))

const StripArrow = txt
  .config({ name: 'CompareStripArrow' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ color: tone(m, 'accent'), fontFamily: font.mono }))

const StripAfter = txt
  .config({ name: 'CompareStripAfter' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ color: tone(m, 'text'), minWidth: 0 }))

/** What replaces what: label · before → after, one row each. */
export function CompareStrip(props: { items: readonly { label: string; before: string; after: string }[]; beforeName?: string | undefined }) {
  return (
    <StripList>
      <For each={props.items} by={(i) => i.label}>
        {(i) => (
          <StripRow>
            <Eyebrow>{i.label}</Eyebrow>
            <span>
              <VisuallyBefore name={props.beforeName} />
              {renderInline(i.before)}
            </span>
            <StripArrow>→</StripArrow>
            <StripAfter>
              <VisuallyAfter />
              {renderInline(i.after)}
            </StripAfter>
          </StripRow>
        )}
      </For>
    </StripList>
  )
}

const SrOnly = txt
  .config({ name: 'CompareStripSr' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    extendCss: 'clip: rect(0 0 0 0); clip-path: inset(50%); margin: -1px;',
  }))
const VisuallyBefore = (props: { name?: string | undefined }) => <SrOnly>{`${props.name ?? 'Before'}: `}</SrOnly>
const VisuallyAfter = () => <SrOnly>Pyreon: </SrOnly>

// ─── Link cards ───────────────────────────────────────────────────────────

/** "Go deeper": cards that are one link each, the label with an arrow. */
export function LinkCards(props: { items: readonly { label: string; href: string; text: string }[]; min?: number | undefined }) {
  return (
    <AutoGrid min={props.min ?? 240} gap={12}>
      <For each={props.items} by={(i) => i.href + i.label}>
        {(i) => (
          <GlowCard href={i.href} padding="compact">
            <Heading tag="h3" size="step">
              {`${i.label} →`}
            </Heading>
            <Lede size="small">{renderInline(i.text)}</Lede>
          </GlowCard>
        )}
      </For>
    </AutoGrid>
  )
}

// ─── Item cards (list sections) ───────────────────────────────────────────

const CardCode = el
  .config({ name: 'ItemCardCode' })
  .attrs({ block: true })
  .theme((_t, m) => ({ marginTop: 6, borderRadius: radius.note, border: '1px solid', borderColor: tone(m, 'line'), overflow: 'hidden', minWidth: 0 }))

/** Titled cards for a `list` section; an item may carry code and a "next release" badge. */
export function ItemCards(props: {
  items: readonly { title: string; text: string; code?: string | undefined; codeHtml?: string | undefined; status?: string | undefined }[]
}) {
  return (
    <AutoGrid min={300} gap={12}>
      <For each={props.items} by={(i) => i.title}>
        {(i) => (
          <GlowCard padding="compact">
            <Heading tag="h3" size="step">
              {renderInline(i.title)}
              {i.status ? <StatusBadge>{i.status}</StatusBadge> : null}
            </Heading>
            <Lede size="small">{renderInline(i.text)}</Lede>
            {i.code ? (
              <CardCode>
                <CodeBlock code={i.code} html={i.codeHtml} label={`${i.title}: code`} />
              </CardCode>
            ) : null}
          </GlowCard>
        )}
      </For>
    </AutoGrid>
  )
}

// ─── Small things ─────────────────────────────────────────────────────────

const InlineLink = el
  .config({ name: 'InlineLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    color: tone(m, 'link'),
    textDecoration: 'underline',
    fontWeight: weight.regular,
    borderRadius: 2,
    extendCss: 'text-underline-offset: 3px; text-decoration-thickness: 1px;',
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

/** A link inside running text (internal paths through the router). */
export function InlineTextLink(props: { href: string; children?: VNodeChild }) {
  const click = useLinkClick()
  return (
    <InlineLink href={props.href} onClick={click(props.href)} rel={props.href.startsWith('http') ? 'noopener' : undefined}>
      {props.children}
    </InlineLink>
  )
}
