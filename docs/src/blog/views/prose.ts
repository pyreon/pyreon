import { el, tone, type ModeFn } from '../../site/kit/bases'
import { font, radius, syntax, text, weight } from '../../site/theme'

/**
 * Reading styles for a post body: the markdown pipeline's plain elements (p,
 * h2, lists, blockquote, tables, Shiki code blocks) in the site's type scale
 * and colours, both themes. The measure is capped at 68ch of 18px text.
 *
 * Code blocks: Shiki printed both themes into every token (inline `color` for light,
 * `--shiki-dark` for dark), so the dark page switches to the dark value. The
 * copy button is wired by the post's tools island (`PostTools.tsx`).
 */
const css = (m: ModeFn): string => `
  max-width: 68ch;
  font-family: ${font.sans};
  font-size: 18px;
  line-height: 1.75;
  color: ${tone(m, 'mist')};
  overflow-wrap: break-word;

  & > :first-child { margin-top: 0; }
  & p { margin: 0 0 22px; }
  & strong { color: ${tone(m, 'text')}; font-weight: ${weight.medium}; }
  & em { font-style: italic; }
  & a { color: ${tone(m, 'text')}; text-decoration: underline; text-decoration-color: ${tone(m, 'accent')}; text-decoration-thickness: 1px; text-underline-offset: 4px; border-radius: 2px; }
  & a:hover { text-decoration-thickness: 2px; color: ${tone(m, 'strong')}; }
  & a:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 2px; }

  & h2, & h3 { color: ${tone(m, 'text')}; font-weight: ${weight.medium}; scroll-margin-top: 104px; text-wrap: balance; }
  & h2 { margin: 60px 0 18px; font-size: clamp(28px, 3.2vw, 38px); line-height: 1.12; letter-spacing: -.035em; }
  & h3 { margin: 40px 0 12px; font-size: 22px; line-height: 1.3; letter-spacing: -.02em; }
  & h2 a, & h3 a { color: inherit; text-decoration: none; }

  & ul, & ol { margin: 0 0 22px; padding-left: 24px; }
  & li { margin-bottom: 10px; padding-left: 4px; }
  & li > p { margin-bottom: 10px; }
  & li::marker { color: ${tone(m, 'accent')}; }

  & blockquote { margin: 34px 0; padding: 4px 0 4px 22px; border-left: 3px solid ${tone(m, 'accent')}; color: ${tone(m, 'strong')}; font-size: clamp(21px, 2.4vw, 26px); line-height: 1.35; letter-spacing: -.015em; }
  & blockquote p { margin: 0; }
  & blockquote strong { font-weight: ${weight.medium}; color: inherit; }

  & :not(pre) > code { font-family: ${font.mono}; font-size: .84em; padding: 2px 6px; border-radius: ${radius.small}px; background: ${tone(m, 'raised')}; color: ${tone(m, 'text')}; overflow-wrap: anywhere; }

  & hr { height: 1px; border: 0; margin: 48px 0; background: ${tone(m, 'line')}; }
  & img { max-width: 100%; height: auto; border-radius: ${radius.pane}px; }

  & table { display: block; max-width: 100%; overflow-x: auto; margin: 0 0 26px; border-collapse: collapse; font-size: 15px; line-height: 1.55; }
  & th, & td { padding: 10px 14px; border-bottom: 1px solid ${tone(m, 'line')}; text-align: left; vertical-align: top; }
  & th { color: ${tone(m, 'text')}; font-weight: ${weight.medium}; border-bottom-color: ${tone(m, 'line2')}; white-space: nowrap; }

  & .code-block { position: relative; margin: 24px 0 30px; border: 1px solid ${tone(m, 'line')}; border-radius: ${radius.pane}px; background: ${m(syntax.light.bg, syntax.dark.bg)}; overflow: hidden; }
  & .code-block__header { height: 40px; padding: 0 16px; border-bottom: 1px solid ${tone(m, 'line')}; font-family: ${font.mono}; font-size: ${text.mono.size}px; line-height: 40px; color: ${tone(m, 'fog')}; }
  & .code-block::before { content: attr(data-lang); position: absolute; top: 0; left: 16px; height: 40px; font-family: ${font.mono}; font-size: ${text.mono.size}px; line-height: 40px; color: ${tone(m, 'fog')}; }
  & .code-block__gutter--empty { display: none; }
  & .code-block pre { margin: 0; padding: 18px 20px; overflow-x: auto; background: transparent !important; font-family: ${font.mono}; font-size: 14px; line-height: 1.7; tab-size: 2; }
  & .code-block pre:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: -2px; }
  & .code-block pre code { font: inherit; background: none; padding: 0; }
  [data-theme='dark'] & .shiki span, [data-theme='dark'] & .shiki { color: var(--shiki-dark, inherit) !important; }
  & .code-block__copy { position: absolute; top: 6px; right: 8px; height: 28px; padding: 0 12px; border: 1px solid ${tone(m, 'line2')}; border-radius: ${radius.pill}px; background: transparent; color: ${tone(m, 'mist')}; font-family: ${font.mono}; font-size: 11.5px; cursor: pointer; }
  & .code-block__copy:hover { color: ${tone(m, 'text')}; border-color: ${tone(m, 'lineHover')}; }
  & .code-block__copy:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 2px; }
`

/** The post body wrapper. Block layout (not the kit's flex column), so margins between blocks collapse as in prose. */
export const PostProse = el
  .config({ name: 'BlogProse' })
  .attrs({ block: true })
  .theme((_t, m) => ({ display: 'block', minWidth: 0, extendCss: css(m) }))
