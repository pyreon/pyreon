import { el, type T, type InputEl } from '../../kit'

export const SearchField = el
  .attrs({ tag: 'input' })
  .theme((t: T) => ({
    flex: '1', border: 'none', background: 'transparent', color: t.text,
    fontSize: '15px', padding: '12px 0',
    // The HEAD shows focus (`:focus-within`) — a square outline on the bare
    // field crossed the rounded card and the esc badge.
    extendCss: `outline:none;font-family:inherit;&:focus-visible{outline:none;}&::placeholder{color:${t.faint};}`,
  })) as unknown as InputEl
